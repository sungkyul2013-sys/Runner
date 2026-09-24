// sbc-cli — headless SoftBodyCore runner (§3 "헤드리스 CLI").
//   sbc-cli scenes
//   sbc-cli run <scene> [--seconds S] [--threads T] [--energy]
//   sbc-cli bench [--bodies N] [--seconds S] [--threads T] [--out file.json]
//   sbc-cli stability <scene>
//   sbc-cli golden <scene> [--seconds S] [--every-steps N] [--threads T]
//   sbc-cli vehicle <vehicle.json> [--seconds S]   (load, stability check, settle on asphalt, report)
//   sbc-cli crash-bench <vehicle.json> [--cars N] [--seconds S] [--threads T] [--out file.json]
//                                       (§23.3: N cars in head-on pairs, 64 km/h each, crashing at once)
#include <algorithm>
#include <chrono>
#include <cinttypes>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>

#include "sbc/scenes.h"
#include "sbc/stability.h"
#include "sbc/vehicle_json.h"
#include "sbc/world.h"

namespace {

using Clock = std::chrono::steady_clock;

struct Args {
  std::string command, scene;
  double seconds = 2.0;
  int threads = 1;
  int bodies = 16;
  int cars = 10;
  int everySteps = 1000;
  bool energy = false;
  std::string out;
};

bool parse(int argc, char** argv, Args& a) {
  if (argc < 2) return false;
  a.command = argv[1];
  int i = 2;
  if ((a.command == "run" || a.command == "stability" || a.command == "golden" || a.command == "vehicle" ||
       a.command == "crash-bench") && i < argc &&
      argv[i][0] != '-') {
    a.scene = argv[i++];
  }
  for (; i < argc; ++i) {
    const std::string k = argv[i];
    auto next = [&](const char* name) -> const char* {
      if (i + 1 >= argc) { std::fprintf(stderr, "missing value for %s\n", name); std::exit(2); }
      return argv[++i];
    };
    if (k == "--seconds") a.seconds = std::atof(next("--seconds"));
    else if (k == "--threads") a.threads = std::atoi(next("--threads"));
    else if (k == "--bodies") a.bodies = std::atoi(next("--bodies"));
    else if (k == "--cars") a.cars = std::atoi(next("--cars"));
    else if (k == "--every-steps") a.everySteps = std::atoi(next("--every-steps"));
    else if (k == "--out") a.out = next("--out");
    else if (k == "--energy") a.energy = true;
    else { std::fprintf(stderr, "unknown option %s\n", k.c_str()); return false; }
  }
  return true;
}

void printEnergy(FILE* f, const sbc::EnergyReport& e) {
  std::fprintf(f,
               "{\"kinetic\":%.6f,\"gravity\":%.6f,\"beam\":%.6f,\"contact\":%.6f,\"beamDamping\":%.6f,"
               "\"contactDamping\":%.6f,\"friction\":%.6f,\"plastic\":%.6f,\"fracture\":%.6f,\"ccd\":%.6f,"
               "\"external\":%.6f,\"balance\":%.6f}",
               e.kinetic, e.gravityPotential, e.beamPotential, e.contactPotential, e.losses.beamDamping,
               e.losses.contactDamping, e.losses.friction, e.losses.plastic, e.losses.fracture, e.losses.ccd,
               e.losses.external, e.balance());
}

int counts(const sbc::World& w, int& nodes, int& beams) {
  nodes = beams = 0;
  for (int b = 0; b < w.bodyCount(); ++b) { nodes += w.body(b).nodeCount(); beams += w.body(b).beamCount(); }
  return w.bodyCount();
}

int cmdRun(const Args& a) {
  sbc::SceneOptions o;
  o.threads = a.threads;
  o.trackEnergy = a.energy;
  o.bodies = a.bodies;
  auto w = sbc::makeScene(a.scene, o);
  if (!w) { std::fprintf(stderr, "unknown scene '%s'\n", a.scene.c_str()); return 2; }
  const int steps = static_cast<int>(a.seconds / w->params().dt + 0.5);
  const auto t0 = Clock::now();
  w->step(steps);
  const double wall = std::chrono::duration<double>(Clock::now() - t0).count();
  int nodes, beams;
  const int bodies = counts(*w, nodes, beams);
  std::printf("{\"scene\":\"%s\",\"steps\":%d,\"simSeconds\":%.4f,\"wallSeconds\":%.4f,\"rtf\":%.3f,\"threads\":%d,"
              "\"bodies\":%d,\"nodes\":%d,\"beams\":%d,\"hash\":\"%016" PRIx64 "\",\"energy\":",
              a.scene.c_str(), steps, w->time(), wall, w->time() / wall, a.threads, bodies, nodes, beams,
              w->stateHash());
  printEnergy(stdout, w->measureEnergy());
  std::printf("}\n");
  return 0;
}

int cmdBench(const Args& a) {
  sbc::SceneOptions o;
  o.threads = a.threads;
  o.bodies = a.bodies;
  auto w = sbc::makeScene("pile", o);
  const int steps = static_cast<int>(a.seconds / w->params().dt + 0.5);
  double worstStepMs = 0.0, totalMs = 0.0;
  for (int s = 0; s < steps; ++s) {
    const auto t0 = Clock::now();
    w->step(1);
    const double ms = std::chrono::duration<double, std::milli>(Clock::now() - t0).count();
    totalMs += ms;
    if (ms > worstStepMs) worstStepMs = ms;
  }
  int nodes, beams;
  const int bodies = counts(*w, nodes, beams);
  char buf[1024];
  std::snprintf(buf, sizeof buf,
                "{\"bench\":\"pile\",\"platform\":\"%s\",\"threads\":%d,\"bodies\":%d,\"nodes\":%d,\"beams\":%d,"
                "\"steps\":%d,\"meanStepMs\":%.5f,\"worstStepMs\":%.5f,\"rtf\":%.3f,\"hash\":\"%016" PRIx64 "\"}",
#ifdef __EMSCRIPTEN__
                "wasm",
#else
                "native",
#endif
                a.threads, bodies, nodes, beams, steps, totalMs / steps, worstStepMs,
                (steps * static_cast<double>(w->params().dt)) / (totalMs / 1000.0), w->stateHash());
  std::printf("%s\n", buf);
  if (!a.out.empty()) {
    FILE* f = std::fopen(a.out.c_str(), "w");
    if (!f) { std::fprintf(stderr, "cannot write %s\n", a.out.c_str()); return 1; }
    std::fprintf(f, "%s\n", buf);
    std::fclose(f);
  }
  return 0;
}

// §23.3 "10대 동시 충돌 씬": cars in head-on pairs 4 m apart sideways, each at 64 km/h, 5 m between bumpers at the
// start, so every pair crashes in the same ~0.1 s. Measures the physics step (mean, worst, real-time factor) through
// the whole crash and the wrecks settling, plus the energy ledger and the penetration count at the end.
int cmdCrashBench(const Args& a) {
  std::ifstream f(a.scene, std::ios::binary);
  if (!f) { std::fprintf(stderr, "cannot read %s\n", a.scene.c_str()); return 2; }
  std::stringstream text;
  text << f.rdbuf();
  sbc::WorldParams wp;
  wp.threadCount = a.threads;
  wp.trackEnergy = a.energy;
  sbc::World w(wp);
  sbc::applyDefaultContactPairs(w);
  w.addGroundPlane(0.0, sbc::material::kAsphalt);
  const float speed = 64.0f / 3.6f;
  const int pairs = std::max(1, a.cars / 2);
  for (int p = 0; p < pairs; ++p) {
    const double x = 4.0 * (p - 0.5 * (pairs - 1));
    for (int side = 0; side < 2; ++side) {
      const sbc::LoadedVehicle car = sbc::loadVehicleJson(
          text.str(), {{x, 0.0, side ? 9.4 : 0.0}, side ? 3.14159265358979323846 : 0.0, speed});
      const int body = w.addBody(car.build.body);
      const int v = w.addVehicle(body, car.build.vehicle);
      sbc::VehicleInput in;
      in.mode = sbc::GearMode::kNeutral;
      w.setVehicleInput(v, in);
    }
  }
  const int steps = static_cast<int>(a.seconds / w.params().dt + 0.5);
  double worstStepMs = 0.0, totalMs = 0.0;
  int maxContacts = 0;
  for (int s = 0; s < steps; ++s) {
    const auto t0 = Clock::now();
    w.step(1);
    const double ms = std::chrono::duration<double, std::milli>(Clock::now() - t0).count();
    totalMs += ms;
    worstStepMs = std::max(worstStepMs, ms);
    maxContacts = std::max(maxContacts, w.lastStepStats().bodyContacts);
  }
  int nodes, beams;
  const int bodies = counts(w, nodes, beams);
  const sbc::PenetrationReport pen = w.measurePenetration();
  const sbc::EnergyReport e = w.measureEnergy();
  char buf[1024];
  std::snprintf(buf, sizeof buf,
                "{\"bench\":\"crash%d\",\"platform\":\"%s\",\"threads\":%d,\"cars\":%d,\"bodies\":%d,\"nodes\":%d,"
                "\"beams\":%d,\"steps\":%d,\"meanStepMs\":%.5f,\"worstStepMs\":%.5f,\"rtf\":%.3f,\"maxBodyContacts\":%d,"
                "\"penetration\":%d,\"plasticKJ\":%.1f,\"hash\":\"%016" PRIx64 "\"}",
                2 * pairs,
#ifdef __EMSCRIPTEN__
                "wasm",
#else
                "native",
#endif
                a.threads, 2 * pairs, bodies, nodes, beams, steps, totalMs / steps, worstStepMs,
                (steps * static_cast<double>(w.params().dt)) / (totalMs / 1000.0), maxContacts, pen.total(),
                e.losses.plastic / 1e3, w.stateHash());
  std::printf("%s\n", buf);
  if (!a.out.empty()) {
    FILE* out = std::fopen(a.out.c_str(), "w");
    if (!out) { std::fprintf(stderr, "cannot write %s\n", a.out.c_str()); return 1; }
    std::fprintf(out, "%s\n", buf);
    std::fclose(out);
  }
  return 0;
}

int cmdStability(const Args& a) {
  auto w = sbc::makeScene(a.scene);
  if (!w) { std::fprintf(stderr, "unknown scene '%s'\n", a.scene.c_str()); return 2; }
  int failures = 0;
  for (int b = 0; b < w->bodyCount(); ++b) {
    const auto r = sbc::checkStability(w->body(b), w->params().dt);
    std::printf("body %d (%s): min critical dt %.4f ms, beam violations %d, node violations %d\n", b,
                w->body(b).name.c_str(), r.minCriticalDt * 1e3, r.beamViolations, r.nodeViolations);
    if (!r.ok()) ++failures;
  }
  return failures == 0 ? 0 : 1;
}

int cmdGolden(const Args& a) {
  sbc::SceneOptions o;
  o.threads = a.threads;
  auto w = sbc::makeScene(a.scene, o);
  if (!w) { std::fprintf(stderr, "unknown scene '%s'\n", a.scene.c_str()); return 2; }
  const int steps = static_cast<int>(a.seconds / w->params().dt + 0.5);
  // Plain "step hash" lines: the format of tests/golden/*.txt.
  std::printf("# golden state hashes for scene '%s' (sbc-cli golden %s --seconds %g --every-steps %d)\n",
              a.scene.c_str(), a.scene.c_str(), a.seconds, a.everySteps);
  for (int s = a.everySteps; s <= steps; s += a.everySteps) {
    w->step(a.everySteps);
    std::printf("%d %016" PRIx64 "\n", s, w->stateHash());
  }
  return 0;
}

}  // namespace

int cmdVehicle(const Args& a) {
  std::ifstream file(a.scene, std::ios::binary);
  if (!file) {
    std::fprintf(stderr, "cannot read %s\n", a.scene.c_str());
    return 1;
  }
  std::stringstream text;
  text << file.rdbuf();
  sbc::LoadedVehicle car;
  try {
    car = sbc::loadVehicleJson(text.str());
  } catch (const std::exception& e) {
    std::fprintf(stderr, "%s\n", e.what());
    return 1;
  }
  sbc::WorldParams wp;
  wp.threadCount = a.threads;
  sbc::World w(wp);
  sbc::applyDefaultContactPairs(w);
  w.addGroundPlane(0.0, sbc::material::kAsphalt);
  const int body = w.addBody(car.build.body);
  const int v = w.addVehicle(body, car.build.vehicle);
  const sbc::Body& b = w.body(body);
  double mass = 0.0;
  for (int i = 0; i < b.nodeCount(); ++i) mass += b.mass[i];
  const auto st = sbc::checkStability(b, wp.dt);
  std::printf("%s: %d nodes, %d beams, %d sliders, %d torsion bars, %d pressure groups, mass %.1f kg\n", car.id.c_str(),
              b.nodeCount(), b.beamCount(), b.sliderCount(), b.torsionBarCount(), b.pressureGroupCount(), mass);
  std::printf("stability: %s, min critical dt %.3f ms, %d beam / %d node violations\n", st.ok() ? "ok" : "VIOLATED",
              st.minCriticalDt * 1000.0, st.beamViolations, st.nodeViolations);
  int shown = 0;
  for (const auto& is : st.worst) {
    if (shown++ >= 6 || is.criticalDt * sbc::kDefaultStabilitySafety >= wp.dt) break;
    const int n = is.isNode ? is.index : b.beamA[is.index];
    const int m = is.isNode ? -1 : b.beamB[is.index];
    auto name = [&](int i) { return i >= 0 && i < static_cast<int>(car.nodeIds.size()) && !car.nodeIds[i].empty() ? car.nodeIds[i] : "#" + std::to_string(i); };
    std::printf("  %s %s%s%s: critical %.3f ms\n", is.isNode ? "node" : "beam", name(n).c_str(), is.isNode ? "" : "–",
                is.isNode ? "" : name(m).c_str(), is.criticalDt * 1000.0);
  }
  const auto t0 = Clock::now();
  w.step(static_cast<int>(a.seconds / wp.dt));
  const double wall = std::chrono::duration<double>(Clock::now() - t0).count();
  const auto& t = w.vehicleTelemetry(v);
  double front = 0.0, total = 0.0;
  for (size_t i = 0; i < t.wheels.size(); ++i) {
    total += t.wheels[i].load;
    if (i < 2) front += t.wheels[i].load;
  }
  std::printf("after %.1f s (%.1f× real time): ref height %.4f m (model %.4f), speed %.4f m/s, front load %.1f %%\n",
              a.seconds, a.seconds / wall, t.position.y + b.origin.y, car.build.vehicle.refCenterModel.y, t.speed,
              100.0 * front / total);
  for (size_t i = 0; i < t.wheels.size(); ++i) {
    const auto& wt = t.wheels[i];
    const sbc::WheelDesc& wd = car.build.vehicle.wheels[i];
    // Suspension sag: axle point height relative to the chassis reference, versus the model design pose.
    const sbc::Vec3 design = (car.build.body.nodes[static_cast<size_t>(wd.axleLeft)].position +
                              car.build.body.nodes[static_cast<size_t>(wd.axleRight)].position) * 0.5f;
    const float designRel = design.y - car.build.vehicle.refCenterModel.y;
    const float nowRel = wt.center.y - t.position.y;
    const float side = wt.center.x > t.position.x ? 1.0f : -1.0f;  // + left
    std::printf("  %s: load %6.0f N, loaded radius %.4f m, suspension compressed %+.1f mm, camber %+.2f°, toe %+.2f°\n",
                wd.name.c_str(), wt.load, wt.loadedRadius, 1000.0f * (nowRel - designRel), -side * wt.axis.y * 57.2958f,
                side * wt.axis.z * 57.2958f);
  }
  return 0;
}

int main(int argc, char** argv) {
  Args a;
  if (!parse(argc, argv, a)) {
    std::fprintf(stderr, "usage: sbc-cli scenes | run <scene> | bench | stability <scene> | golden <scene> [options]\n");
    return 2;
  }
  if (a.command == "scenes") {
    for (const auto& n : sbc::sceneNames()) std::printf("%s\n", n.c_str());
    return 0;
  }
  if (a.command == "run") return cmdRun(a);
  if (a.command == "bench") return cmdBench(a);
  if (a.command == "crash-bench") return cmdCrashBench(a);
  if (a.command == "stability") return cmdStability(a);
  if (a.command == "golden") return cmdGolden(a);
  if (a.command == "vehicle") return cmdVehicle(a);
  std::fprintf(stderr, "unknown command %s\n", a.command.c_str());
  return 2;
}

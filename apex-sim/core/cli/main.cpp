// sbc-cli — headless SoftBodyCore runner (§3 "헤드리스 CLI").
//   sbc-cli scenes
//   sbc-cli run <scene> [--seconds S] [--threads T] [--energy]
//   sbc-cli bench [--bodies N] [--seconds S] [--threads T] [--out file.json]
//   sbc-cli stability <scene>
//   sbc-cli golden <scene> [--seconds S] [--every-steps N] [--threads T]
#include <chrono>
#include <cinttypes>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

#include "sbc/scenes.h"
#include "sbc/stability.h"
#include "sbc/world.h"

namespace {

using Clock = std::chrono::steady_clock;

struct Args {
  std::string command, scene;
  double seconds = 2.0;
  int threads = 1;
  int bodies = 16;
  int everySteps = 1000;
  bool energy = false;
  std::string out;
};

bool parse(int argc, char** argv, Args& a) {
  if (argc < 2) return false;
  a.command = argv[1];
  int i = 2;
  if ((a.command == "run" || a.command == "stability" || a.command == "golden") && i < argc && argv[i][0] != '-') {
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
  if (a.command == "stability") return cmdStability(a);
  if (a.command == "golden") return cmdGolden(a);
  std::fprintf(stderr, "unknown command %s\n", a.command.c_str());
  return 2;
}

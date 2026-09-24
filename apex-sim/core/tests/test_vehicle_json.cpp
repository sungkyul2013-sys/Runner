// Vehicle JSON loader (A§4.11, docs/VEHICLE_FORMAT.md) and the generated Porsche 911 Turbo (991).
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <cmath>
#include <memory>
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <string>

#include "sbc/scenes.h"
#include "sbc/stability.h"
#include "sbc/vehicle_json.h"
#include "sbc/world.h"

using namespace sbc;

namespace {

constexpr double kPi = 3.14159265358979323846;

std::string readFile(const std::string& path) {
  std::ifstream f(path, std::ios::binary);
  REQUIRE(f.good());
  std::stringstream s;
  s << f.rdbuf();
  return s.str();
}

const std::string& porscheJson() {
  static const std::string text = readFile(std::string(SBC_VEHICLE_DIR) + "/porsche_911_turbo_991/vehicle.json");
  return text;
}

double target(const LoadedVehicle& v, const std::string& key) {
  for (const auto& [k, value] : v.targets)
    if (k == key) return value;
  FAIL("missing target " << key);
  return 0.0;
}

// The generated Porsche on flat asphalt (native: one thread, like the headless runs).
struct Porsche {
  std::unique_ptr<World> world;
  LoadedVehicle car;
  int body = -1, vehicle = -1;
  explicit Porsche(float speed, Vec3 gravity = {0.0f, -static_cast<float>(kStandardGravity), 0.0f}) {
    WorldParams wp;
    wp.gravity = gravity;
    world = std::make_unique<World>(wp);
    applyDefaultContactPairs(*world);
    world->addGroundPlane(0.0, material::kAsphalt);
    car = loadVehicleJson(porscheJson(), {{0.0, 0.0, 0.0}, 0.0, speed});
    body = world->addBody(car.build.body);
    vehicle = world->addVehicle(body, car.build.vehicle);
  }
  const VehicleTelemetry& tel() const { return world->vehicleTelemetry(vehicle); }
  void input(const VehicleInput& in) { world->setVehicleInput(vehicle, in); }
  DVec3 center() const { return world->body(body).nodeWorldPosition(car.build.vehicle.refCenter); }
  double seconds(double s) { const int n = static_cast<int>(s / world->params().dt + 0.5); world->step(n); return n * world->params().dt; }
  // Work absorbed by plastic yielding so far [J]: driving loads must stay below every yield force (§4.3 crash
  // structure only yields in a crash).
  double plastic() const { return world->body(body).losses.plastic; }
};

}  // namespace

TEST_CASE("vehicle json: a minimal prop without a vehicle section", "[vehicle_json]") {
  const char* text = R"({
    // comments and trailing commas are allowed
    "format": "apex-vehicle", "version": 1, "id": "rod",
    "nodes": [["a", 0, 1, 0, 2.0], ["b", 1, 1, 0, 2.0, 0.05, "steel",],],
    "beamGroups": { "rod": { "k": 1e5, "zeta": 0.1 } },
    "beams": [["a", "b", "rod", { "restOffset": -0.1 }]],
  })";
  const LoadedVehicle v = loadVehicleJson(text, {{0.0, 0.0, 5.0}, 0.0, 0.0f});
  CHECK(v.id == "rod");
  CHECK(v.build.vehicle.wheels.empty());
  REQUIRE(v.build.body.nodes.size() == 2);
  CHECK(v.build.body.origin.z == 5.0);
  REQUIRE(v.build.body.beams.size() == 1);
  CHECK(std::fabs(v.build.body.beams[0].restLength - 0.9f) < 1e-6f);
  CHECK(std::fabs(v.build.body.beams[0].damping - 2.0f * 0.1f * std::sqrt(1e5f * 1.0f)) < 1e-3f);
}

TEST_CASE("vehicle json: errors name the offending path", "[vehicle_json]") {
  auto message = [](const char* text) {
    try {
      loadVehicleJson(text);
    } catch (const std::invalid_argument& e) {
      return std::string(e.what());
    }
    return std::string("no error");
  };
  CHECK(message("{").find("parse error") != std::string::npos);
  CHECK(message(R"({"format": "other", "version": 1})").find("format") != std::string::npos);
  const std::string unknown = message(R"({"format": "apex-vehicle", "version": 1,
      "nodes": [["a", 0, 0, 0, 1]], "beamGroups": {"g": {"k": 1}}, "beams": [["a", "nope", "g"]]})");
  CHECK(unknown.find("beams[0][1]") != std::string::npos);
  CHECK(unknown.find("nope") != std::string::npos);
}

TEST_CASE("generated Porsche 911 Turbo loads, is stable and matches its mass targets", "[vehicle_json][porsche]") {
  const LoadedVehicle car = loadVehicleJson(porscheJson());
  CHECK(car.id == "porsche_911_turbo_991");
  CHECK(car.build.vehicle.wheels.size() == 4);
  WorldParams wp;
  World w(wp);
  applyDefaultContactPairs(w);
  w.addGroundPlane(0.0, material::kAsphalt);
  const int body = w.addBody(car.build.body);
  const int v = w.addVehicle(body, car.build.vehicle);
  const Body& b = w.body(body);
  double mass = 0.0;
  for (int i = 0; i < b.nodeCount(); ++i) mass += b.mass[i];
  CHECK(std::fabs(mass - target(car, "mass")) < 1.0);
  const StabilityReport st = checkStability(b, wp.dt);
  INFO("critical dt " << st.minCriticalDt);
  CHECK(st.ok());

  VehicleInput in;
  in.handbrake = 1.0f;
  w.setVehicleInput(v, in);
  w.step(6000);  // 3 s settle
  const VehicleTelemetry& t = w.vehicleTelemetry(v);
  double front = 0.0, total = 0.0;
  for (size_t i = 0; i < 4; ++i) {
    CHECK(t.wheels[i].contact);
    total += t.wheels[i].load;
    if (i < 2) front += t.wheels[i].load;
  }
  CHECK(std::fabs(front / total - target(car, "frontWeightFraction")) < 0.01);
  CHECK(std::fabs(total - mass * kStandardGravity) < 0.03 * mass * kStandardGravity);
  // Rides at the model's design height less the tyre deflection (≈ 2 cm).
  const double sag = car.build.vehicle.refCenterModel.y - (t.position.y + b.origin.y);
  CHECK(sag > 0.005);
  CHECK(sag < 0.035);
}

TEST_CASE("vehicle json builds bit-identical bodies at the same spawn", "[vehicle_json][determinism]") {
  const VehicleSpawn spawn{{10.0, 0.0, -3.0}, 0.7, 12.0f};
  const LoadedVehicle a = loadVehicleJson(porscheJson(), spawn);
  const LoadedVehicle b = loadVehicleJson(porscheJson(), spawn);
  REQUIRE(a.build.body.nodes.size() == b.build.body.nodes.size());
  for (size_t i = 0; i < a.build.body.nodes.size(); ++i) {
    CHECK(a.build.body.nodes[i].position.x == b.build.body.nodes[i].position.x);
    CHECK(a.build.body.nodes[i].velocity.z == b.build.body.nodes[i].velocity.z);
  }
}

// ---- §23.2 vehicle tests on the generated Porsche 911 Turbo (targets in its vehicle.json, sources in "sources") ----

TEST_CASE("Porsche 911 Turbo: ABS stop from 100 km/h within the §23.2 band", "[vehicle_json][porsche][23.2]") {
  Porsche p(100.0f / 3.6f);
  VehicleInput in;
  in.mode = GearMode::kNeutral;
  p.input(in);
  p.seconds(0.5);
  const double v0 = p.tel().speed, o0 = p.tel().odometer;
  in.brake = 1.0f;
  p.input(in);
  double t = 0.0;
  while (p.tel().speed > 0.05f && t < 8.0) t += p.seconds(0.0005);
  const double distance = (p.tel().odometer - o0) * std::pow(27.7778 / v0, 2);  // scaled to exactly 100 km/h
  INFO("100-0 " << distance << " m (target " << target(p.car, "braking100") << " m)");
  CHECK(distance >= 35.0);
  CHECK(distance <= 42.0);
  CHECK(std::fabs(p.tel().forward.x) < 0.02);  // straight
  CHECK(p.plastic() == 0.0);
}

TEST_CASE("Porsche 911 Turbo: 0-100 km/h within 5 % of the target", "[vehicle_json][porsche][23.2]") {
  Porsche p(0.0f);
  p.seconds(0.5);
  VehicleInput in;
  in.throttle = 1.0f;
  p.input(in);
  double t = 0.0;
  while (p.tel().speed * 3.6 < 100.0 && t < 8.0) t += p.seconds(0.0005);
  const double goal = target(p.car, "zeroTo100");
  INFO("0-100 " << t << " s (target " << goal << " s)");
  CHECK(std::fabs(t - goal) <= 0.05 * goal);
  CHECK(p.plastic() == 0.0);
}

TEST_CASE("Porsche 911 Turbo: coastdown 99 to 80 km/h within 5 % of the road-load model", "[vehicle_json][porsche][23.2]") {
  Porsche p(100.0f / 3.6f);
  VehicleInput in;
  in.mode = GearMode::kNeutral;
  p.input(in);
  p.seconds(0.1);
  double t = 0.0, t99 = -1.0;
  while (p.tel().speed * 3.6 > 80.0 && t < 40.0) {
    t += p.seconds(0.0005);
    if (t99 < 0.0 && p.tel().speed * 3.6 <= 99.0) t99 = t;
  }
  // m·dv/dt = −(Crr·m·g + ½ρ·CdA·v²) with a §11.1 summer tyre (Crr 0.012) and the car's drag area.
  const double m = target(p.car, "mass"), cda = p.car.build.vehicle.aero.dragArea;
  const double a = 0.012 * kStandardGravity, b = 0.5 * 1.225 * cda / m, k = std::sqrt(b / a);
  const double model = (std::atan(99.0 / 3.6 * k) - std::atan(80.0 / 3.6 * k)) / std::sqrt(a * b);
  INFO("coastdown " << t - t99 << " s, road-load model " << model << " s");
  CHECK(std::fabs((t - t99) - model) <= 0.05 * model);
}

TEST_CASE("Porsche 911 Turbo: steady skidpad (R 30.5 m) grip of a sports car", "[vehicle_json][porsche][23.2]") {
  // Constant radius, speed raised slowly: pure pursuit gives the curvature command, a curvature integrator (measured
  // κ = yaw rate / v) turns it into steering, slow enough not to excite the yaw/roll lag.
  const double R = 30.5;
  Porsche p(15.0f);
  const DVec3 centre{R, 0.0, 0.0};  // left of the start (the car faces +Z, +X is left)
  VehicleInput in;
  double steer = 0.3, vTarget = 15.0, kappa = 1.0 / R, prevYaw = 0.0, best = 0.0;
  const double dt = p.world->params().dt;
  for (int s = 0; s < 70000; ++s) {
    const VehicleTelemetry& t = p.tel();
    const DVec3 pos = p.center(), rel = pos - centre;
    const double r = std::sqrt(rel.x * rel.x + rel.z * rel.z);
    const double yaw = std::atan2(t.forward.x, t.forward.z);
    double dyaw = s == 0 ? 0.0 : yaw - prevYaw;
    if (dyaw > kPi) dyaw -= 2.0 * kPi;
    if (dyaw < -kPi) dyaw += 2.0 * kPi;
    prevYaw = yaw;
    const double v = std::max(1.0, static_cast<double>(t.speed));
    kappa += (dyaw / dt / v - kappa) * dt / 0.1;
    const double lookahead = std::max(10.0, 1.2 * v);
    const double th = std::atan2(rel.z, rel.x) - lookahead / R;  // travelling counter-clockwise seen from above
    const double dx = centre.x + R * std::cos(th) - pos.x, dz = centre.z + R * std::sin(th) - pos.z;
    const double alpha = std::atan2(t.forward.z * dx - t.forward.x * dz, t.forward.x * dx + t.forward.z * dz);
    const double command = 2.0 * std::sin(alpha) / std::sqrt(dx * dx + dz * dz);
    steer = std::clamp(steer + dt * 11.0 * (command - kappa), -1.0, 1.0);
    in.steer = static_cast<float>(steer);
    if (s % 3000 == 0 && s > 8000 && std::fabs(r - R) < 0.5) vTarget += 0.25;
    const double ve = vTarget - t.speed;
    in.throttle = static_cast<float>(std::clamp(0.3 * ve + 0.25, 0.0, 1.0));
    in.brake = ve < -1.0 ? 0.2f : 0.0f;
    p.input(in);
    p.world->step();
    if (s > 8000 && std::fabs(r - R) < 0.5) best = std::max(best, t.speed * t.speed / r / kStandardGravity);
    if (s > 8000 && std::fabs(r - R) > 3.0) break;  // past the limit
  }
  INFO("max steady lateral acceleration " << best << " g (target " << target(p.car, "skidpadG") << " g)");
  CHECK(best >= 0.95);
  CHECK(best <= 1.1);
  CHECK(p.plastic() == 0.0);
}

TEST_CASE("Porsche 911 Turbo: handbrake holds on a 30 % slope", "[vehicle_json][porsche][23.1]") {
  const double angle = std::atan(0.3);
  Porsche p(0.0f, {0.0f, static_cast<float>(-kStandardGravity * std::cos(angle)),
                   static_cast<float>(-kStandardGravity * std::sin(angle))});
  VehicleInput in;
  in.handbrake = 1.0f;
  in.mode = GearMode::kNeutral;
  p.input(in);
  p.seconds(3.0);
  const DVec3 p0 = p.center();
  p.seconds(5.0);
  const DVec3 d = p.center() - p0;
  INFO("creep " << std::sqrt(dot(d, d)) << " m");
  CHECK(std::sqrt(dot(d, d)) < 5e-3);
}

TEST_CASE("Porsche 911 Turbo: no wheel hop at 200+ km/h under full throttle", "[vehicle_json][porsche]") {
  // Guards the radial tyre spring on the hub and the rim stiffness (A§4.7): either fault shows up as a 10 Hz wheel
  // hop above ≈ 200 km/h with the wheel loads swinging between zero and several times the static load.
  Porsche p(55.0f);
  VehicleInput in;
  in.throttle = 1.0f;
  p.input(in);
  p.seconds(3.0);  // the rings take their centrifugal stretch after a spawn at speed
  double lo[4] = {1e9, 1e9, 1e9, 1e9}, hi[4] = {0.0, 0.0, 0.0, 0.0};
  for (int s = 0; s < 4000; ++s) {
    p.world->step();
    for (int i = 0; i < 4; ++i) {
      lo[i] = std::min(lo[i], static_cast<double>(p.tel().wheels[i].load));
      hi[i] = std::max(hi[i], static_cast<double>(p.tel().wheels[i].load));
    }
  }
  INFO("speed " << p.tel().speed * 3.6 << " km/h");
  CHECK(p.tel().speed * 3.6 > 200.0);
  for (int i = 0; i < 4; ++i) {
    INFO("wheel " << i << " load " << lo[i] << " … " << hi[i] << " N");
    CHECK(lo[i] > 0.6 * 0.5 * (lo[i] + hi[i]));
    CHECK(hi[i] < 1.4 * 0.5 * (lo[i] + hi[i]));
  }
  CHECK(p.plastic() == 0.0);
}

TEST_CASE("Porsche 911 Turbo: a wall crash in the drive scene keeps the energy books", "[vehicle_json][porsche][crash]") {
  // The web drive scene: 90 km/h at full throttle into the end wall (≈ 110 km/h at impact), crush, bounce and landing.
  // No energy may appear from nowhere. (A tread node pressed onto the ground once froze under the CCD clamp and pumped
  // 23 MJ into the car within 0.1 s; an anti-roll-bar lever folded onto its pivot axis flung the pivot node at
  // 180 m/s before torsion bars could fail.)
  SceneOptions so;
  so.threads = 1;
  so.trackEnergy = true;
  auto w = makeScene("drive", so);
  const LoadedVehicle car = loadVehicleJson(porscheJson(), {{0.0, 0.0, 250.0}, 0.0, 25.0f});
  const int body = w->addBody(car.build.body);
  const int v = w->addVehicle(body, car.build.vehicle);
  VehicleInput in;
  in.throttle = 1.0f;
  w->setVehicleInput(v, in);
  double worst = 0.0, peakKinetic = 0.0;
  for (int k = 0; k < 24; ++k) {
    w->step(500);
    const EnergyReport e = w->measureEnergy();
    worst = std::max(worst, std::abs(e.balance()));
    peakKinetic = std::max(peakKinetic, e.kinetic);
  }
  INFO("worst |balance| " << worst / 1e3 << " kJ, peak kinetic " << peakKinetic / 1e3 << " kJ");
  CHECK(w->vehicleTelemetry(v).speed < 5.0f);  // it did hit the wall
  CHECK(worst < 0.03 * peakKinetic);
}

TEST_CASE("Porsche 911 Turbo: 64 km/h rigid-wall crash crumples the nose and closes the energy balance",
          "[vehicle_json][porsche][crash][23.1]") {
  // §23.1 energy balance with a real vehicle (KICKOFF C3: engine and brakes off): the 1,595 kg car at 64 km/h
  // (17.78 m/s, 252 kJ + wheel spin) into the drive scene's concrete wall. Balance = ΔKE + ΔPE + plastic + damping +
  // friction + fracture + CCD − external work must close within 5 %. The crash structure (generator: section yield
  // forces) must crush the nose by a realistic amount at a realistic pulse while the passenger cell stays intact.
  SceneOptions so;
  so.threads = 1;
  so.trackEnergy = true;
  auto w = makeScene("drive", so);
  const float v0 = 64.0f / 3.6f;
  const LoadedVehicle car = loadVehicleJson(porscheJson(), {{0.0, 0.0, 296.6}, 0.0, v0});
  const int body = w->addBody(car.build.body);
  const int v = w->addVehicle(body, car.build.vehicle);
  VehicleInput in;
  in.mode = GearMode::kNeutral;
  w->setVehicleInput(v, in);
  const Body& b = w->body(body);
  auto node = [&](const char* id) {
    for (int i = 0; i < b.nodeCount(); ++i)
      if (car.nodeIds[i] == id) return i;
    FAIL("no node " << id);
    return -1;
  };
  // Nose: front-most lattice layer relative to the centre reference; cell: floor nodes 0.9 m ahead of / behind centre.
  const int centre = car.build.vehicle.refCenter, cellFront = node("c4_1_10"), cellRear = node("c4_1_4");
  auto noseLength = [&] {
    double zMax = -1e9;
    for (int i = 0; i < b.nodeCount(); ++i)
      if (!car.nodeIds[i].empty() && car.nodeIds[i][0] == 'c') zMax = std::max(zMax, b.nodeWorldPosition(i).z);
    return zMax - b.nodeWorldPosition(centre).z;
  };
  auto cellLength = [&] { return length(b.nodePosition(cellFront) - b.nodePosition(cellRear)); };
  double mass = 0.0;
  for (int i = 0; i < b.nodeCount(); ++i) mass += b.mass[i];
  auto meanVz = [&] {
    double p = 0.0;
    for (int i = 0; i < b.nodeCount(); ++i) p += b.mass[i] * b.vz[i];
    return p / mass;
  };
  const double kinetic0 = w->measureEnergy().kinetic, nose0 = noseLength(), cell0 = cellLength();
  double worst = 0.0, minNose = nose0, peakDecel = 0.0, rebound = 0.0, prevV = meanVz();
  const int window = 10;  // 5 ms mean deceleration (a CFC-60-like filter of the pulse)
  for (int k = 0; k < 300; ++k) {
    w->step(window);
    const double vz = meanVz();
    peakDecel = std::max(peakDecel, (prevV - vz) / (window * w->params().dt) / kStandardGravity);
    prevV = vz;
    rebound = std::max(rebound, -vz);
    minNose = std::min(minNose, noseLength());
    worst = std::max(worst, std::abs(w->measureEnergy().balance()));
  }
  const EnergyReport e = w->measureEnergy();
  INFO("KE0 " << kinetic0 / 1e3 << " kJ, worst |balance| " << worst / 1e3 << " kJ, plastic " << e.losses.plastic / 1e3
              << " kJ, dynamic crush " << nose0 - minNose << " m, residual " << nose0 - noseLength() << " m, cell "
              << cell0 - cellLength() << " m shorter, peak " << peakDecel << " g, rebound " << rebound * 3.6
              << " km/h");
  CHECK(worst < 0.05 * kinetic0);                        // §23.1
  CHECK(e.losses.plastic > 0.4 * kinetic0);              // most of the energy goes into crushing metal
  CHECK(nose0 - minNose > 0.4);                          // crumple zone [m]
  CHECK(nose0 - minNose < 0.9);
  CHECK(cell0 - cellLength() < 0.03);                    // passenger cell intact
  CHECK(peakDecel > 20.0);
  CHECK(peakDecel < 60.0);
  CHECK(rebound < 0.25 * v0);                            // mostly plastic, not an elastic bounce
}

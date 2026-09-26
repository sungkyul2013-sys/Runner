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

TEST_CASE("Porsche 911 Turbo: the drive scene's speed bumps at 30 to 120 km/h", "[vehicle_json][porsche][contact]") {
  // Three 5 cm × 0.5 m bumps (static boxes with sharp edges). A tread node that rode exactly on a bump's top edge was
  // once rewound to its start position by the static sweep test every step while its velocity grew (500 m/s within
  // 20 ms at 80 km/h, the car thrown 7 m up): the sweep must keep a node's tangential motion over an edge.
  for (const float kmh : {30.0f, 50.0f, 80.0f, 120.0f}) {
    SceneOptions so;
    so.threads = 1;
    so.trackEnergy = true;
    auto w = makeScene("drive", so);
    const LoadedVehicle car = loadVehicleJson(porscheJson(), {{9.0, 0.0, 10.0}, 0.0, kmh / 3.6f});
    const int body = w->addBody(car.build.body);
    const int v = w->addVehicle(body, car.build.vehicle);
    VehicleInput in;
    in.throttle = 0.2f;
    w->setVehicleInput(v, in);
    const double seconds = 50.0 / (kmh / 3.6);  // past the last bump (z = 49)
    double worst = 0.0, peakKinetic = 0.0, maxNodeSpeed = 0.0, maxSpeed = 0.0;
    const Body& b = w->body(body);
    for (int k = 0; k < static_cast<int>(seconds / 0.01); ++k) {
      w->step(20);
      const EnergyReport e = w->measureEnergy();
      worst = std::max(worst, std::abs(e.balance()));
      peakKinetic = std::max(peakKinetic, e.kinetic);
      maxSpeed = std::max(maxSpeed, static_cast<double>(w->vehicleTelemetry(v).speed));
      for (int i = 0; i < b.nodeCount(); ++i)
        maxNodeSpeed = std::max(maxNodeSpeed, static_cast<double>(length(b.nodeVelocity(i))));
    }
    INFO(kmh << " km/h: worst |balance| " << worst << " J, fastest node " << maxNodeSpeed << " m/s, now "
              << w->vehicleTelemetry(v).speed * 3.6 << " km/h, " << b.losses.plastic << " J plastic");
    CHECK(b.nodeWorldPosition(car.build.vehicle.refCenter).z > 49.0);  // drove over all three
    CHECK(maxNodeSpeed < 2.5 * maxSpeed + 5.0);  // no node flung (tread tops run at 2v)
    CHECK(worst < 0.01 * peakKinetic);
    // Below 60 km/h nothing yields; at 80 the sharp steps bend the body a little near the suspension mounts. At
    // 120 km/h the car is thrown and lands on its nose between the boxes, crushing the overhangs (≈ 29 kJ, depending
    // on how it lands): no bound there — speed bumps with real profiles come with M3 (§11.3).
    if (kmh < 60.0f) CHECK(b.losses.plastic == 0.0);
    if (kmh < 100.0f) CHECK(b.losses.plastic < 0.005 * peakKinetic);
  }
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
  // §23.1's 5 %. (Measured ≈ 0.9 %: at this speed the front wheels are driven into the crumpling arches, and the
  // self-collision springs there — no sweep tests inside one body — switch on and off as the arch folds.)
  CHECK(worst < 0.05 * peakKinetic);
}

TEST_CASE("Porsche 911 Turbo: the wreck comes to rest after a wall crash and its books stay closed",
          "[vehicle_json][porsche][crash][5.3]") {
  // 100 km/h into the drive scene's wall in Drive (the web's default), then 5 s at rest. A front wheel jammed in its
  // crushed arch once turned by itself and kept the wreck vibrating at ≈ 190 W from nowhere: contact springs scaled
  // with the barycentric effective mass Σw²/m change stiffness as their contact point slides, which is not
  // conservative. The weight-linear mass Σw/m keeps a spring's stiffness constant across a triangle.
  SceneOptions so;
  so.threads = 1;
  so.trackEnergy = true;
  auto w = makeScene("drive", so);
  const LoadedVehicle car = loadVehicleJson(porscheJson(), {{0.0, 0.0, 250.0}, 0.0, 100.0f / 3.6f});
  const int body = w->addBody(car.build.body);
  const int v = w->addVehicle(body, car.build.vehicle);
  w->setVehicleInput(v, VehicleInput{});
  w->step(12000);  // 6 s: the crash is over at ≈ 2.4 s
  const double settled = w->measureEnergy().balance();
  double maxKinetic = 0.0, maxSpin = 0.0;
  for (int k = 0; k < 10; ++k) {
    w->step(1000);
    maxKinetic = std::max(maxKinetic, w->measureEnergy().kinetic);
    for (const WheelTelemetry& t : w->vehicleTelemetry(v).wheels) maxSpin = std::max(maxSpin, static_cast<double>(std::fabs(t.spin)));
  }
  const double drift = w->measureEnergy().balance() - settled;
  INFO("balance drift at rest " << drift << " J over 5 s, max kinetic " << maxKinetic << " J, max wheel spin " << maxSpin);
  CHECK(w->vehicleTelemetry(v).speed < 0.1f);
  // Was ≈ 950 J (190 W), then up to 8 kJ once the hinged lids and doors came in: a light lid node squeezed by more
  // contacts than symplectic Euler can carry (contact budget), a node over a crease whose second contact switched
  // on and off at depth (hit selection by normal direction), and depth lent by unrelated contacts of the same nodes
  // (continuity per node pair within a body). Then ≈ 580 J, and ≈ 1 kJ once the tyres could burst (M2k): a flat
  // tyre crushed into its arch whose sealed isothermal gas became a spring too stiff for its light tread and rim nodes
  // — a flat tyre now vents its cavity. Measured ≈ 0 J.
  CHECK(std::fabs(drift) < 100.0);
  CHECK(maxKinetic < 5.0);
  CHECK(maxSpin < 0.1);            // no wheel turning by itself (was 0.19 rad/s)
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
  // Nose: front-most lattice layer relative to the centre reference; cell: floor nodes 0.9 m ahead of / behind centre,
  // beside the tunnel (the gearbox sits on the centreline behind the cell).
  const int centre = car.build.vehicle.refCenter, cellFront = node("c2_1_10"), cellRear = node("c2_1_4");
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

namespace {

// Two Porsches head-on: car A at `speed` [m/s] towards car B parked 4.9 m ahead (front to front), B offset sideways
// by `offset` [m]. Both in neutral, energy tracked.
struct CarToCar {
  std::unique_ptr<World> world;
  LoadedVehicle a, b;
  int bodyA = -1, bodyB = -1;
  CarToCar(float speed, double offset, bool space) {
    WorldParams wp;
    wp.trackEnergy = true;
    if (space) {
      wp.gravity = {0.0f, 0.0f, 0.0f};
      wp.airDensity = 0.0f;  // no air on the doors and lids either
    }
    world = std::make_unique<World>(wp);
    applyDefaultContactPairs(*world);
    if (!space) world->addGroundPlane(0.0, material::kAsphalt);
    const double y = space ? 1.0 : 0.0;
    a = loadVehicleJson(porscheJson(), {{0.0, y, 0.0}, 0.0, speed});
    b = loadVehicleJson(porscheJson(), {{offset, y, 4.9}, kPi, 0.0f});
    if (space) {  // no air either: only the two cars act on each other
      a.build.vehicle.aero.dragArea = b.build.vehicle.aero.dragArea = 0.0f;
      a.build.vehicle.aero.liftAreaFront = a.build.vehicle.aero.liftAreaRear = 0.0f;
      b.build.vehicle.aero.liftAreaFront = b.build.vehicle.aero.liftAreaRear = 0.0f;
    }
    bodyA = world->addBody(a.build.body);
    bodyB = world->addBody(b.build.body);
    const int va = world->addVehicle(bodyA, a.build.vehicle), vb = world->addVehicle(bodyB, b.build.vehicle);
    VehicleInput in;
    in.mode = GearMode::kNeutral;
    world->setVehicleInput(va, in);
    world->setVehicleInput(vb, in);
  }
};

}  // namespace

TEST_CASE("Porsche 911 Turbo: 64 km/h head-on into a parked car keeps energy, momentum and surfaces intact",
          "[vehicle_json][porsche][crash][23.1]") {
  // M2 acceptance (ROADMAP): car-to-car at 64 km/h. Free of gravity and air, only the two cars act on each other, so
  // linear momentum must be conserved (§23.1: < 1 %; node↔triangle and edge↔edge reactions go to the triangle's
  // nodes by weight, so it holds to rounding), the energy books must close within 5 %, and no node or edge may be
  // inside the other car (KICKOFF C2) at any step end.
  CarToCar c(64.0f / 3.6f, 0.0, true);
  World& w = *c.world;
  const double kinetic0 = w.measureEnergy().kinetic;
  const DVec3 p0 = w.measureMomentum().linear;
  double worst = 0.0;
  int maxPenetration = 0, contacts = 0;
  for (int k = 0; k < 90; ++k) {
    w.step(10);
    contacts += w.lastStepStats().bodyContacts;
    worst = std::max(worst, std::abs(w.measureEnergy().balance()));
    maxPenetration = std::max(maxPenetration, w.measurePenetration().total());
  }
  const EnergyReport e = w.measureEnergy();
  const DVec3 dp = w.measureMomentum().linear - p0;
  INFO("KE0 " << kinetic0 / 1e3 << " kJ, worst |balance| " << worst / 1e3 << " kJ, plastic " << e.losses.plastic / 1e3
              << " kJ, |Δp| " << std::sqrt(dot(dp, dp)) << " of " << std::sqrt(dot(p0, p0)) << " kg·m/s");
  CHECK(contacts > 0);
  CHECK(maxPenetration == 0);
  CHECK(std::sqrt(dot(dp, dp)) < 1e-3 * std::sqrt(dot(p0, p0)));
  CHECK(worst < 0.05 * kinetic0);
  CHECK(e.losses.plastic > 0.2 * kinetic0);  // both noses crushed
}

TEST_CASE("Porsche 911 Turbo: 64 km/h offset car-to-car on the road closes the energy balance",
          "[vehicle_json][porsche][crash][23.1]") {
  // 50 % overlap (0.9 m sideways) on asphalt with gravity: the cars spin away from each other, tyres scrub.
  CarToCar c(64.0f / 3.6f, 0.9, false);
  World& w = *c.world;
  const double kinetic0 = w.measureEnergy().kinetic;
  double worst = 0.0;
  int maxPenetration = 0;
  for (int k = 0; k < 120; ++k) {
    w.step(10);
    worst = std::max(worst, std::abs(w.measureEnergy().balance()));
    if (k % 4 == 0) maxPenetration = std::max(maxPenetration, w.measurePenetration().total());
  }
  INFO("KE0 " << kinetic0 / 1e3 << " kJ, worst |balance| " << worst / 1e3 << " kJ, plastic "
              << w.measureEnergy().losses.plastic / 1e3 << " kJ");
  CHECK(maxPenetration == 0);
  CHECK(worst < 0.05 * kinetic0);
}

// §4.3 glass and lamps, §4.4 damage → function: damage groups watch beams for permanent strain and nodes for impacts.
// The Porsche's glass and lamp groups (tools/vehicle-gen/porsche_911_turbo_991.mjs) must stay intact in hard driving
// and break the way real cars do in wall crashes.
#include <catch2/catch_test_macros.hpp>
#include <cmath>
#include <fstream>
#include <map>
#include <sstream>
#include <string>

#include "sbc/builder.h"
#include "sbc/scenes.h"
#include "sbc/vehicle_json.h"
#include "sbc/world.h"
#include "test_util.h"

using namespace sbc;

namespace {

std::string readFile(const std::string& path) {
  std::ifstream f(path);
  REQUIRE(f.good());
  std::stringstream ss;
  ss << f.rdbuf();
  return ss.str();
}

const std::string& porscheJson() {
  static const std::string text = readFile(std::string(SBC_VEHICLE_DIR) + "/porsche_911_turbo_991/vehicle.json");
  return text;
}

std::map<std::string, DamageGroupState> groups(const Body& b) {
  std::map<std::string, DamageGroupState> out;
  for (const DamageGroupState& g : b.damageGroups) out[g.id] = g;
  return out;
}

bool hit(const DamageGroupState& g) { return g.damaged > 0 || g.impacts > 0; }

// The Porsche in the drive scene at `at`, `kmh` forward, with a fixed input, run for `seconds`.
std::map<std::string, DamageGroupState> run(DVec3 at, float kmh, VehicleInput in, double seconds, double* plastic = nullptr) {
  SceneOptions so;
  so.threads = 1;
  auto w = makeScene("drive", so);
  const LoadedVehicle car = loadVehicleJson(porscheJson(), {at, 0.0, kmh / 3.6f});
  const int body = w->addBody(car.build.body);
  const int v = w->addVehicle(body, car.build.vehicle);
  w->setVehicleInput(v, in);
  w->step(static_cast<int>(seconds / w->params().dt));
  if (plastic) *plastic = w->body(body).losses.plastic;
  return groups(w->body(body));
}

}  // namespace

TEST_CASE("a damage group records permanent strain and impacts where they happen", "[damage][4.3]") {
  // A 1 m cube (2 × 2 × 2 nodes) dropped onto the ground at 12 m/s: its bottom beams are watched with a 1 % trigger
  // strain, its bottom nodes for impacts over 5 kN; a second group watches only the top.
  LatticeParams p;
  p.center = {0.0, 1.0, 0.0};
  p.size = {1.0f, 1.0f, 1.0f};
  p.nx = p.ny = p.nz = 2;
  p.totalMass = 80.0f;
  p.nodeRadius = 0.05f;
  p.axialStiffness = 4.0e5f;
  p.dampingRatio = 0.1f;
  p.velocity = {0.0f, -12.0f, 0.0f};
  BodyDesc d = makeLattice(p);
  for (BeamDesc& beam : d.beams) {
    beam.plasticForce = 1.5e4f;
    const bool bottom = d.nodes[static_cast<size_t>(beam.a)].position.y < 0.0f && d.nodes[static_cast<size_t>(beam.b)].position.y < 0.0f;
    const bool top = d.nodes[static_cast<size_t>(beam.a)].position.y > 0.0f && d.nodes[static_cast<size_t>(beam.b)].position.y > 0.0f;
    if (bottom) beam.damageGroup = 0;
    if (top) beam.damageGroup = 1;
  }
  DamageGroupDesc low{"bottom", 0.01f, 5.0e3f, {}};
  DamageGroupDesc high{"top", 0.01f, 5.0e3f, {}};
  for (int i = 0; i < static_cast<int>(d.nodes.size()); ++i) (d.nodes[static_cast<size_t>(i)].position.y < 0.0f ? low : high).nodes.push_back(i);
  d.damageGroups = {low, high};
  World w(WorldParams{});
  applyDefaultContactPairs(w);
  w.addGroundPlane(0.0, material::kConcrete);
  w.addBody(d);
  REQUIRE(w.body(0).damageGroups.size() == 2);
  CHECK(w.body(0).damageGroups[0].beams > 0);
  const uint64_t before = w.stateHash();
  w.step(1000);
  const DamageGroupState& bottom = w.body(0).damageGroups[0];
  const DamageGroupState& top = w.body(0).damageGroups[1];
  INFO("bottom: " << bottom.damaged << " beams, " << bottom.impacts << " impacts, peak " << bottom.peakImpact << " N, strain "
                  << bottom.peakStrain);
  CHECK(bottom.impacts == 4);  // all four bottom nodes landed hard
  CHECK(bottom.firstStep >= 0);
  CHECK(bottom.peakImpact > 5.0e3f);
  CHECK(top.impacts == 0);     // the top never touched anything
  CHECK(top.peakImpact == 0.0f);
  CHECK(d.nodes[static_cast<size_t>(bottom.firstNodeA)].position.y < 0.0f);  // the first damage is on the bottom
  CHECK(w.stateHash() != before);
}

TEST_CASE("Porsche 911 Turbo: hard driving breaks no glass and no lamp", "[damage][porsche][4.3]") {
  // Full-throttle launch, ABS stop from 100 km/h, 1 g cornering at 60 km/h and the 5 cm speed bumps at 50 km/h. The
  // lattice strains elastically by up to 2 % in these (the rear under the engine), which must not count.
  VehicleInput launch;
  launch.throttle = 1.0f;
  VehicleInput brake;
  brake.brake = 1.0f;
  VehicleInput corner;
  corner.throttle = 0.35f;
  corner.steer = 0.5f;
  VehicleInput cruise;
  cruise.throttle = 0.3f;
  struct Case { const char* name; DVec3 at; float kmh; VehicleInput in; double seconds; };
  for (const Case& c : {Case{"launch", {0.0, 0.0, 0.0}, 0.0f, launch, 6.0}, Case{"brake", {0.0, 0.0, 0.0}, 100.0f, brake, 4.0},
                        Case{"corner", {0.0, 0.0, 200.0}, 60.0f, corner, 6.0}, Case{"bumps", {9.0, 0.0, 10.0}, 50.0f, cruise, 3.0}}) {
    double plastic = 0.0;
    for (const auto& [id, g] : run(c.at, c.kmh, c.in, c.seconds, &plastic)) {
      INFO(c.name << ": " << id << " peak strain " << g.peakStrain << ", peak impact " << g.peakImpact << " N");
      CHECK(!hit(g));
    }
    CHECK(plastic == 0.0);
  }
}

TEST_CASE("Porsche 911 Turbo: wall crashes break lamps and glass the way real cars do", "[damage][porsche][crash][4.3]") {
  // 15 km/h: the headlamps hit the wall and break; nothing else. 64 km/h: headlamps gone, the windscreen cracks as its
  // frame bends, side and rear windows and the tail lamps survive (the rear overhang yields a little under its own
  // inertia, which does not break a lens). 100 km/h: the doors' window frames fold and the side windows shatter.
  auto crash = [](float kmh) { return run({0.0, 0.0, 296.6}, kmh, VehicleInput{}, 2.0); };
  auto visual = [](const std::string& id) { return id.rfind("glass_", 0) == 0 || id.rfind("lamp_", 0) == 0; };
  const auto slow = crash(15.0f);
  for (const auto& [id, g] : slow) {
    if (!visual(id)) continue;
    INFO("15 km/h: " << id << " impacts " << g.impacts << " (peak " << g.peakImpact << " N), damaged beams " << g.damaged);
    CHECK(hit(g) == (id == "lamp_front_left" || id == "lamp_front_right"));
  }
  const auto mid = crash(64.0f);
  for (const auto& [id, g] : mid) {
    if (!visual(id)) continue;
    INFO("64 km/h: " << id << " peak strain " << g.peakStrain << ", impacts " << g.impacts);
    const bool expected = id == "lamp_front_left" || id == "lamp_front_right" || id == "glass_windscreen";
    CHECK(hit(g) == expected);
  }
  const auto fast = crash(100.0f);
  CHECK(hit(fast.at("glass_side_left")));
  CHECK(hit(fast.at("glass_side_right")));
  CHECK(hit(fast.at("glass_windscreen")));
  CHECK(!hit(fast.at("lamp_rear_left")));
  CHECK(!hit(fast.at("lamp_rear_right")));
}

// ---- §4.4 damage → function --------------------------------------------------------------------------------------

namespace {

// The Porsche on flat asphalt with one extra damage link on a test group that the tyres damage at the first step
// (every tread node watched for impacts over 1 N: four or more hits, severity 1). `tune` edits the fluids.
struct Linked {
  std::unique_ptr<World> world;
  int body = -1, vehicle = -1;
  Linked(DamageEffect effect, int wheel, float rate, float kmh, void (*tune)(FluidsDesc&) = nullptr) {
    world = std::make_unique<World>(WorldParams{});
    applyDefaultContactPairs(*world);
    world->addGroundPlane(0.0, material::kAsphalt);
    LoadedVehicle car = loadVehicleJson(porscheJson(), {{0.0, 0.0, 0.0}, 0.0, kmh / 3.6f});
    DamageGroupDesc g{"test", 1e9f, 1.0f, {}};
    for (const WheelDesc& w : car.build.vehicle.wheels) g.nodes.insert(g.nodes.end(), w.treadNodes.begin(), w.treadNodes.end());
    car.build.body.damageGroups.push_back(g);
    DamageLinkDesc l;
    l.group = static_cast<int32_t>(car.build.body.damageGroups.size() - 1);
    l.effect = effect;
    l.wheel = wheel;
    l.rate = rate;
    car.build.vehicle.damageLinks.push_back(l);
    if (tune) tune(car.build.vehicle.fluids);
    body = world->addBody(car.build.body);
    vehicle = world->addVehicle(body, car.build.vehicle);
  }
  const VehicleTelemetry& tel() const { return world->vehicleTelemetry(vehicle); }
  void input(float throttle, float brake = 0.0f, float steer = 0.0f, GearMode mode = GearMode::kDrive, int8_t shift = 0) {
    VehicleInput in;
    in.throttle = throttle;
    in.brake = brake;
    in.steer = steer;
    in.mode = mode;
    in.shiftRequest = shift;
    world->setVehicleInput(vehicle, in);
  }
  void seconds(double s) { world->step(static_cast<int>(s / world->params().dt)); }
};

}  // namespace

TEST_CASE("Porsche 911 Turbo: hard driving sets no fault, wall crashes break what they reach", "[damage][porsche][4.4]") {
  VehicleInput launch;
  launch.throttle = 1.0f;
  VehicleInput brake;
  brake.brake = 1.0f;
  auto faultsAfter = [](DVec3 at, float kmh, VehicleInput in, double s) {
    SceneOptions so;
    so.threads = 1;
    auto w = makeScene("drive", so);
    const LoadedVehicle car = loadVehicleJson(porscheJson(), {at, 0.0, kmh / 3.6f});
    const int v = w->addVehicle(w->addBody(car.build.body), car.build.vehicle);
    w->setVehicleInput(v, in);
    w->step(static_cast<int>(s / w->params().dt));
    return w->vehicleTelemetry(v);
  };
  CHECK(faultsAfter({0.0, 0.0, 0.0}, 0.0f, launch, 6.0).faults == 0u);
  CHECK(faultsAfter({0.0, 0.0, 0.0}, 100.0f, brake, 4.0).faults == 0u);
  // 15 km/h: the front radiators crack — a slow coolant leak, nothing else.
  const VehicleTelemetry slow = faultsAfter({0.0, 0.0, 296.6}, 15.0f, VehicleInput{}, 2.0);
  CHECK(slow.faults == fault::kCoolantLeak);
  // 64 km/h: radiators, battery, front brake lines and half shafts; the engine still runs.
  const VehicleTelemetry hard = faultsAfter({0.0, 0.0, 296.6}, 64.0f, VehicleInput{}, 4.0);
  INFO("64 km/h faults " << hard.faults << ", coolant " << hard.coolantL << " L");
  CHECK((hard.faults & fault::kCoolantLeak) != 0u);
  CHECK((hard.faults & fault::kElectrical) != 0u);
  CHECK((hard.faults & fault::kBrakes) != 0u);
  CHECK((hard.faults & fault::kDrive) != 0u);
  CHECK((hard.faults & fault::kEngineFailed) == 0u);
  CHECK(hard.coolantL < 19.0f);
}

TEST_CASE("coolant loss overheats, derates and finally ruins the engine", "[damage][porsche][4.4]") {
  // The circuit empties at once; the engine's heat capacity is cut 10× so the minutes of real overheating take seconds.
  Linked car(DamageEffect::kCoolantLeak, -1, 50.0f, 60.0f, [](FluidsDesc& f) { f.heatCapacity = 1.6e4f; });
  car.input(1.0f);
  double peakTemp = 0.0, minDerate = 1.0;
  bool failed = false;
  for (int k = 0; k < 40 && !failed; ++k) {
    car.seconds(0.5);
    peakTemp = std::max(peakTemp, static_cast<double>(car.tel().coolantC));
    minDerate = std::min(minDerate, static_cast<double>(car.tel().derate));
    failed = (car.tel().faults & fault::kEngineFailed) != 0u;
  }
  INFO("peak " << peakTemp << " °C, derate " << minDerate << ", faults " << car.tel().faults);
  CHECK(car.tel().coolantL == 0.0f);
  CHECK((car.tel().faults & fault::kOverheat) != 0u);
  CHECK(minDerate < 0.5);
  CHECK(failed);
  car.seconds(1.0);
  CHECK(!car.tel().engineRunning);  // and the starter cannot bring it back
}

TEST_CASE("oil loss starves the bearings and seizes the engine", "[damage][porsche][4.4]") {
  Linked car(DamageEffect::kOilLeak, -1, 50.0f, 80.0f);
  car.input(0.6f);
  car.seconds(1.0);
  CHECK(car.tel().oilL == 0.0f);
  CHECK(car.tel().oilBar < 0.1f);
  car.seconds(5.0);
  INFO("wear " << car.tel().engineWear << ", faults " << car.tel().faults);
  CHECK((car.tel().faults & fault::kSeized) != 0u);
  CHECK(!car.tel().engineRunning);
}

TEST_CASE("a fuel leak runs the tank dry and the engine stops", "[damage][porsche][4.4]") {
  Linked car(DamageEffect::kFuelLeak, -1, 100.0f, 50.0f);
  car.input(0.5f);
  car.seconds(1.5);
  CHECK(car.tel().fuelL == 0.0f);
  CHECK((car.tel().faults & fault::kOutOfFuel) != 0u);
  CHECK(!car.tel().engineRunning);
}

TEST_CASE("a missed downshift over-revs and damages the engine", "[damage][porsche][4.4]") {
  // Manual mode at 150 km/h, dropped from the gear it runs in to first: the driveline spins the engine far past the
  // limiter. (No link needed: over-revving wears the engine by itself.)
  Linked car(DamageEffect::kGearbox, -1, 0.0f, 150.0f);
  car.input(0.3f);
  car.seconds(1.0);  // the automatic picks the gear for 150 km/h
  const int start = car.tel().gear;
  REQUIRE(start > 2);
  for (int g = start; g > 1; --g) {
    car.input(0.0f, 0.0f, 0.0f, GearMode::kManual, -1);
    car.seconds(0.3);
  }
  INFO("gear " << car.tel().gear << ", rpm " << car.tel().engineRpm << ", wear " << car.tel().engineWear);
  CHECK((car.tel().faults & fault::kOverrev) != 0u);
  CHECK(car.tel().engineWear > 0.0f);
}

TEST_CASE("broken half shafts, brake lines, steering, gearbox and electrics", "[damage][porsche][4.4]") {
  SECTION("a broken rear half shaft: the rear axle is not driven") {
    Linked car(DamageEffect::kDriveLoss, 2, 0.0f, 0.0f);
    car.input(1.0f);
    car.seconds(2.0);
    CHECK((car.tel().faults & fault::kDrive) != 0u);
    CHECK(car.tel().wheels[2].driveTorque == 0.0f);
    CHECK(car.tel().wheels[3].driveTorque == 0.0f);
    CHECK(car.tel().speed > 1.0f);  // the front axle still pulls (the centre coupling)
  }
  SECTION("a torn front-left brake line: that wheel does not brake") {
    Linked car(DamageEffect::kBrakeLoss, 0, 0.0f, 80.0f);
    car.input(0.0f, 1.0f);
    car.seconds(0.5);
    CHECK((car.tel().faults & fault::kBrakes) != 0u);
    CHECK(car.tel().wheels[0].brakeTorque == 0.0f);
    CHECK(std::fabs(car.tel().wheels[1].brakeTorque) > 100.0f);
  }
  SECTION("a jammed steering rack holds its position") {
    Linked car(DamageEffect::kSteering, -1, 0.0f, 30.0f);
    car.input(0.1f, 0.0f, 1.0f);
    car.seconds(1.0);
    CHECK((car.tel().faults & fault::kSteering) != 0u);
    CHECK(std::fabs(car.tel().steer) < 0.05f);  // full lock asked, the rack did not move
  }
  SECTION("a damaged gearbox has lost its top gears") {
    Linked car(DamageEffect::kGearbox, -1, 0.0f, 150.0f);
    car.input(1.0f);
    car.seconds(4.0);
    CHECK((car.tel().faults & fault::kGearbox) != 0u);
    CHECK(car.tel().gear <= 4);  // 7 gears, the top 3 lost
  }
  SECTION("failed electrics switch ABS and traction control off") {
    Linked car(DamageEffect::kElectrical, -1, 0.0f, 100.0f);
    car.input(0.0f, 1.0f);
    bool abs = false;
    for (int s = 0; s < 3000; ++s) {
      car.world->step();
      for (const WheelTelemetry& w : car.tel().wheels) abs = abs || w.absActive;
    }
    CHECK((car.tel().faults & fault::kElectrical) != 0u);
    CHECK(!abs);
  }
}

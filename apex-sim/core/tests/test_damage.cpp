// §4.3 glass and lamps, §4.4 damage → function: damage groups watch beams for permanent strain and nodes for impacts.
// The Porsche's glass and lamp groups (tools/vehicle-gen/porsche_911_turbo_991.mjs) must stay intact in hard driving
// and break the way real cars do in wall crashes.
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
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
  // 20 km/h: the front radiators crack — a slow coolant leak, nothing else.
  const VehicleTelemetry slow = faultsAfter({0.0, 0.0, 296.6}, 20.0f, VehicleInput{}, 2.0);
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

TEST_CASE("the crash sensor fires the airbags in crashes, not in hard driving", "[damage][porsche][4.4]") {
  auto after = [](DVec3 at, float yaw, float kmh, VehicleInput in, double s) {
    SceneOptions so;
    so.threads = 1;
    auto w = makeScene("drive", so);
    const LoadedVehicle car = loadVehicleJson(porscheJson(), {at, yaw, kmh / 3.6f});
    const int v = w->addVehicle(w->addBody(car.build.body), car.build.vehicle);
    w->setVehicleInput(v, in);
    w->step(static_cast<int>(s / w->params().dt));
    return w->vehicleTelemetry(v);
  };
  VehicleInput brake;
  brake.brake = 1.0f;
  const VehicleTelemetry braking = after({0.0, 0.0, 0.0}, 0.0f, 100.0f, brake, 4.0);
  CHECK(braking.airbags == 0u);
  CHECK(braking.crashTime < 0.0f);
  const VehicleTelemetry slow = after({0.0, 0.0, 296.6}, 0.0f, 15.0f, VehicleInput{}, 2.0);
  INFO("15 km/h: Δv " << slow.crashDeltaV * 3.6 << " km/h in 50 ms, peak " << slow.crashPeakG << " g");
  CHECK(slow.airbags == 0u);  // below the no-fire threshold
  const VehicleTelemetry hard = after({0.0, 0.0, 296.6}, 0.0f, 64.0f, VehicleInput{}, 2.0);
  INFO("64 km/h: Δv " << hard.crashDeltaV * 3.6 << " km/h in 50 ms, peak " << hard.crashPeakG << " g");
  CHECK(hard.airbags == (airbag::kDriver | airbag::kPassenger));
  CHECK(hard.crashTime > 0.0f);
  CHECK(hard.crashPeakG > 15.0f);
  CHECK(hard.crashDeltaV * 3.6f > 30.0f);
}

TEST_CASE("a side impact fires the side airbag on the struck side", "[damage][porsche][4.4]") {
  // A parked Porsche (facing +X, its left side toward −Z) is struck on the left by a second one at 50 km/h.
  WorldParams wp;
  wp.threadCount = 1;
  World w(wp);
  applyDefaultContactPairs(w);
  w.addGroundPlane(0.0, material::kAsphalt);
  const LoadedVehicle target = loadVehicleJson(porscheJson(), {{0.0, 0.0, 0.0}, 1.5707963f, 0.0f});
  const int t = w.addVehicle(w.addBody(target.build.body), target.build.vehicle);
  const LoadedVehicle bullet = loadVehicleJson(porscheJson(), {{0.0, 0.0, -4.0}, 0.0f, 50.0f / 3.6f});
  w.addVehicle(w.addBody(bullet.build.body), bullet.build.vehicle);
  w.step(3000);
  const VehicleTelemetry& tel = w.vehicleTelemetry(t);
  INFO("Δv " << tel.crashDeltaV * 3.6 << " km/h, airbags " << tel.airbags);
  CHECK((tel.airbags & airbag::kSideLeft) != 0u);
  CHECK((tel.airbags & airbag::kSideRight) == 0u);
}

namespace {

// Break groups ("breakGroup" of the beams) of the Porsche that have broken, by name.
std::vector<std::string> brokenGroups(const Body& b, const LoadedVehicle& car) {
  std::vector<std::string> out;
  for (size_t g = 0; g < car.breakGroupIds.size(); ++g) {
    for (int i = 0; i < b.beamCount(); ++i) {
      if (b.breakGroup[static_cast<size_t>(i)] == static_cast<int32_t>(g) && b.broken[static_cast<size_t>(i)]) {
        out.push_back(car.breakGroupIds[g]);
        break;
      }
    }
  }
  return out;
}

bool contains(const std::vector<std::string>& list, const std::string& s) {
  return std::find(list.begin(), list.end(), s) != list.end();
}

// The Porsche's JSON with one latch already broken (its beams' break force 1 N): the panel is shut but free.
std::string unlatched(const std::string& panel) {
  std::string text = porscheJson();
  const std::string key = "\"breakGroup\":\"" + panel + "_latch\"";
  size_t at = 0;
  int beams = 0;
  while ((at = text.find(key, at)) != std::string::npos) {
    const size_t open = text.rfind('{', at);
    const size_t force = text.find("\"breakForce\":", open);
    REQUIRE(force < at);
    const size_t end = text.find_first_of(",}", force);
    text.replace(force, end - force, "\"breakForce\":1");
    at = open + 1;
    at = text.find(key, at) + key.size();
    ++beams;
  }
  REQUIRE(beams > 0);
  return text;
}

int nodeIndex(const LoadedVehicle& car, const std::string& id) {
  for (size_t i = 0; i < car.nodeIds.size(); ++i)
    if (car.nodeIds[i] == id) return static_cast<int>(i);
  FAIL("node " << id << " not found");
  return -1;
}

}  // namespace

TEST_CASE("Porsche 911 Turbo: hard driving keeps every latch and hinge", "[damage][porsche][4.4]") {
  // The launch, the ABS stop, 1 g cornering and the speed bumps of the glass test: the doors and lids stay shut.
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
                        Case{"corner", {0.0, 0.0, 200.0}, 60.0f, corner, 6.0}, Case{"bumps", {9.0, 0.0, 10.0}, 50.0f, cruise, 3.0},
                        Case{"top speed", {9.0, 0.0, -150.0}, 250.0f, launch, 3.0}}) {
    SceneOptions so;
    so.threads = 1;
    auto w = makeScene("drive", so);
    const LoadedVehicle car = loadVehicleJson(porscheJson(), {c.at, 0.0, c.kmh / 3.6f});
    const int body = w->addBody(car.build.body);
    w->setVehicleInput(w->addVehicle(body, car.build.vehicle), c.in);
    w->step(static_cast<int>(c.seconds / w->params().dt));
    const std::vector<std::string> broken = brokenGroups(w->body(body), car);
    INFO(c.name << ": " << broken.size() << " break groups broken" << (broken.empty() ? "" : ", first " + broken[0]));
    CHECK(broken.empty());
    CHECK(w->bodyCount() == 7);  // the drive scene's 6 static bodies + the car: nothing came off
  }
}

TEST_CASE("Porsche 911 Turbo: a 64 km/h wall crash pops the front lid's latch, not its hinges", "[damage][porsche][crash][4.4]") {
  // The nose crushes under the front lid: its latch (6 kN) tears, the hinges at the windscreen hold the bent lid.
  SceneOptions so;
  so.threads = 1;
  auto w = makeScene("drive", so);
  const LoadedVehicle car = loadVehicleJson(porscheJson(), {{0.0, 0.0, 250.0}, 0.0, 64.0f / 3.6f});
  const int body = w->addBody(car.build.body);
  w->setVehicleInput(w->addVehicle(body, car.build.vehicle), VehicleInput{});
  w->step(8000);
  const std::vector<std::string> broken = brokenGroups(w->body(body), car);
  std::string list;
  for (const std::string& g : broken) list += g + " ";
  INFO("broken: " << list);
  CHECK(contains(broken, "frontLid_latch"));
  CHECK_FALSE(contains(broken, "frontLid_hinge0"));
  CHECK_FALSE(contains(broken, "frontLid_hinge1"));
  CHECK_FALSE(contains(broken, "doorLeft_latch"));   // the doors stay shut (FMVSS 206)
  CHECK_FALSE(contains(broken, "doorRight_latch"));
  CHECK_FALSE(contains(broken, "engineLid_latch"));
}

TEST_CASE("an unlatched front lid flies open at speed, flaps on its hinges, and tears them when fast enough", "[damage][porsche][4.4]") {
  // §4.4 "문·후드·트렁크 래치 손상 → 주행 중 열려 펄럭이다 탈락". The flow over the closed lid lifts it (suction), the
  // stream gets under its leading edge and throws it up against the windscreen. At 110 km/h it stays on its hinges
  // and flaps (its seals cushion it); at 280 km/h the slam stretches the yielding hinges past their tear strain — the
  // first one tears, and with the nose pressed down by the car's front downforce the lid then hangs and flaps on the
  // other (both tore while the aero calibration still lifted the nose; the lid flew off).
  const std::string text = unlatched("frontLid");
  struct Case { float kmh; bool tornOff; };
  for (const Case& c : {Case{110.0f, false}, Case{280.0f, true}}) {
    SceneOptions so;
    so.threads = 1;
    auto w = makeScene("drive", so);
    const LoadedVehicle car = loadVehicleJson(text, {{9.0, 0.0, -60.0}, 0.0, c.kmh / 3.6f});
    const int body = w->addBody(car.build.body);
    VehicleInput hold;
    hold.throttle = 0.5f;
    w->setVehicleInput(w->addVehicle(body, car.build.vehicle), hold);
    const int lid = nodeIndex(car, "p_frontLid_2_0_0"), ref = nodeIndex(car, "c4_2_12");  // leading edge, 0.22 m off centre
    auto lift = [&] { const Body& b = w->body(body); return b.nodePosition(lid).y - b.nodePosition(ref).y; };
    const float closed = lift();
    float highest = closed;
    for (int k = 0; k < 40; ++k) {
      w->step(100);
      if (!(w->body(body).flags[static_cast<size_t>(lid)] & node_flag::kDetached)) highest = std::max(highest, lift());
    }
    const std::vector<std::string> broken = brokenGroups(w->body(body), car);
    const bool detached = (w->body(body).flags[static_cast<size_t>(lid)] & node_flag::kDetached) != 0;
    INFO(c.kmh << " km/h: lid edge rose " << highest - closed << " m, hinges broken " << contains(broken, "frontLid_hinge0")
                << contains(broken, "frontLid_hinge1") << ", bodies " << w->bodyCount());
    CHECK(highest - closed > 0.4);  // thrown open
    if (c.tornOff) {
      CHECK((contains(broken, "frontLid_hinge0") || contains(broken, "frontLid_hinge1")));  // the slam tore a hinge
    } else {
      CHECK_FALSE(detached);
      CHECK(w->bodyCount() == 7);
      CHECK_FALSE(contains(broken, "frontLid_hinge0"));
      CHECK_FALSE(contains(broken, "frontLid_hinge1"));
    }
  }
}

TEST_CASE("the crash sensor logs a wall impact as one event with its speed, peak force and absorbed energy", "[damage][porsche][crash][5.3]") {
  // §5.3 event log: the crash scene's barrier at 50 km/h, full width. One event; it starts at the impact speed near
  // the barrier face (z = 0), takes the car's plastic and fracture work, and its peak force is the car's mass times
  // its peak deceleration.
  SceneOptions so;
  so.threads = 1;
  so.trackEnergy = true;
  auto w = makeScene("crash", so);
  REQUIRE(w);
  const LoadedVehicle car = loadVehicleJson(porscheJson(), {{-3.0, 0.0, -6.0}, 0.0, 50.0f / 3.6f});
  const int body = w->addBody(car.build.body);
  const int v = w->addVehicle(body, car.build.vehicle);
  VehicleInput neutral;
  neutral.mode = GearMode::kNeutral;
  w->setVehicleInput(v, neutral);
  w->step(6000);  // 3 s: hit, rebound, rest
  const VehicleTelemetry& t = w->vehicleTelemetry(v);
  const Body& b = w->body(body);
  double mass = 0.0;
  for (int i = 0; i < b.nodeCount(); ++i) mass += b.mass[i];
  INFO("events " << t.crashEvents << ", start " << t.eventStart << " s at z " << t.eventPosition.z << ", speed "
                 << t.eventSpeed * 3.6 << " km/h, peak " << t.eventPeakG << " g / " << t.eventPeakForce / 1e3
                 << " kN, Δv " << t.eventDeltaV * 3.6 << " km/h, absorbed " << t.eventAbsorbed / 1e3 << " kJ of "
                 << (b.losses.plastic + b.losses.fracture) / 1e3);
  CHECK(t.crashEvents == 1);
  CHECK_FALSE(t.eventActive);
  CHECK(std::fabs(t.eventSpeed * 3.6 - 50.0) < 6.0);
  CHECK(t.eventPosition.z > -3.5);
  CHECK(t.eventPosition.z < 0.0);
  CHECK(t.eventDeltaV * 3.6 > 40.0);
  CHECK(t.eventPeakG > 15.0);
  CHECK(std::fabs(t.eventPeakForce - mass * t.eventPeakG * kStandardGravity) < 0.01 * t.eventPeakForce);
  CHECK(t.eventAbsorbed > 0.5 * (b.losses.plastic + b.losses.fracture));
  CHECK(t.eventAbsorbed <= b.losses.plastic + b.losses.fracture + 1.0);
}

TEST_CASE("a small-overlap impact is logged at its approach speed", "[damage][porsche][crash][5.3]") {
  // 40 % of the width strikes the barrier's end (x ∈ [−6, 0]) at 56 km/h: the first contact is soft, so the event
  // takes its start state from the onset rather than from the 3 g trigger.
  SceneOptions so;
  so.threads = 1;
  auto w = makeScene("crash", so);
  REQUIRE(w);
  const double width = 1.88;
  const LoadedVehicle car = loadVehicleJson(porscheJson(), {{width * (0.5 - 0.4), 0.0, -6.0}, 0.0, 56.0f / 3.6f});
  const int v = w->addVehicle(w->addBody(car.build.body), car.build.vehicle);
  VehicleInput neutral;
  neutral.mode = GearMode::kNeutral;
  w->setVehicleInput(v, neutral);
  w->step(4000);
  const VehicleTelemetry& t = w->vehicleTelemetry(v);
  INFO("events " << t.crashEvents << ", start " << t.eventStart << " s at z " << t.eventPosition.z << ", speed "
                 << t.eventSpeed * 3.6 << " km/h, peak " << t.eventPeakG << " g, Δv " << t.eventDeltaV * 3.6 << " km/h");
  CHECK(t.crashEvents >= 1);
  CHECK(std::fabs(t.eventSpeed * 3.6 - 56.0) < 4.0);
  CHECK(t.eventPosition.z < 0.0);
}

namespace {

// Plastic deformation [m] summed over the suspension beams (arms, links, tie rods, uprights, subframes and the
// pivots' body mounts: every beam with an end on a corner node FL_… / FR_… / RL_… / RR_…) of one side, or both.
double suspensionPlastic(const Body& b, const LoadedVehicle& car, char side = 0) {
  auto corner = [&](int32_t n) {
    const std::string& id = car.nodeIds[static_cast<size_t>(n)];
    return id.size() > 3 && (id[0] == 'F' || id[0] == 'R') && (id[1] == 'L' || id[1] == 'R') && id[2] == '_' &&
           (side == 0 || id[1] == side);
  };
  double sum = 0.0;
  for (int i = 0; i < b.beamCount(); ++i) {
    const size_t k = static_cast<size_t>(i);
    if (corner(b.beamA[k]) || corner(b.beamB[k])) sum += b.plasticDeformation[k];
  }
  return sum;
}

constexpr double kDeg = 180.0 / 3.14159265358979323846;

}  // namespace

TEST_CASE("Porsche 911 Turbo: kerb strikes bend the struck side's suspension, hard driving bends nothing",
          "[damage][porsche][4.4]") {
  // §4.4 bent suspension: the arms, toe links, tie rods, subframes and pivot mounts yield about twice above the loads of
  // hard driving. The launch, the ABS stop, cornering and the speed bumps (the glass test) leave no plastic strain at
  // all; the 1.2 m jump landing and the 12 cm square step at 60 km/h none in the suspension.
  VehicleInput cruise;
  cruise.throttle = 0.3f;
  VehicleInput easy;
  easy.throttle = 0.2f;
  struct Case { const char* name; DVec3 at; float kmh; VehicleInput in; double seconds; };
  for (const Case& c : {Case{"jump", {22.0, 0.0, 5.0}, 60.0f, cruise, 5.0}, Case{"step", {-24.0, 0.0, 150.0}, 60.0f, easy, 3.0}}) {
    SceneOptions so;
    so.threads = 1;
    auto w = makeScene("drive", so);
    const LoadedVehicle car = loadVehicleJson(porscheJson(), {c.at, 0.0, c.kmh / 3.6f});
    const int body = w->addBody(car.build.body);
    w->setVehicleInput(w->addVehicle(body, car.build.vehicle), c.in);
    w->step(static_cast<int>(c.seconds / w->params().dt));
    INFO(c.name);
    CHECK(suspensionPlastic(w->body(body), car) == 0.0);
  }

  // Sliding sideways (to the right, −X) into a 15 cm square kerb: at 15 km/h the wheels take it; at 25 km/h the right
  // side's arms, toe link and tie rod bend — camber and toe change there. The left side does not yield (its alignment
  // moves a little, elastically, only because the body now leans onto the right side's punctured tyres: ≈ 0.5° of toe
  // at the unloaded left wheels).
  struct Slide { std::vector<WheelTelemetry> before, after; double plasticLeft = 0.0, plasticRight = 0.0; int broken = 0; };
  auto slide = [](float kmh) {
    WorldParams wp;
    wp.threadCount = 1;
    World w(wp);
    applyDefaultContactPairs(w);
    w.addGroundPlane(0.0, material::kAsphalt);
    w.addStaticBox({-2.0, 0.075, 0.0}, {0.3f, 0.075f, 6.0f}, 0.0, material::kConcrete);
    const LoadedVehicle car = loadVehicleJson(porscheJson(), {{0.0, 0.0, 0.0}, 0.0, 0.0f});
    const int body = w.addBody(car.build.body);
    const int v = w.addVehicle(body, car.build.vehicle);
    VehicleInput hold;
    hold.brake = 1.0f;
    hold.mode = GearMode::kNeutral;
    w.setVehicleInput(v, hold);
    w.step(static_cast<int>(1.0 / w.params().dt));
    Slide s;
    s.before = w.vehicleTelemetry(v).wheels;
    w.addBodyVelocity(body, {-kmh / 3.6f, 0.0f, 0.0f});
    w.step(static_cast<int>(4.0 / w.params().dt));
    s.after = w.vehicleTelemetry(v).wheels;
    s.plasticLeft = suspensionPlastic(w.body(body), car, 'L');
    s.plasticRight = suspensionPlastic(w.body(body), car, 'R');
    s.broken = w.body(body).brokenBeamCount;
    return s;
  };
  const Slide gentle = slide(15.0f);
  CHECK(gentle.plasticLeft + gentle.plasticRight == 0.0);
  const Slide hard = slide(25.0f);
  const char* names[] = {"FL", "FR", "RL", "RR"};
  for (int k = 0; k < 4; ++k) {
    const double camber = (hard.after[k].camber - hard.before[k].camber) * kDeg;
    const double toe = (hard.after[k].toe - hard.before[k].toe) * kDeg;
    INFO(names[k] << ": camber " << hard.before[k].camber * kDeg << "° → Δ " << camber << "°, toe Δ " << toe << "°");
    if (k == 1 || k == 3) {
      CHECK(std::fabs(camber) > 1.5);  // struck (right) side
    } else {
      CHECK(std::fabs(camber) < 0.6);
      CHECK(std::fabs(toe) < 0.7);
    }
  }
  INFO("suspension plastic left " << hard.plasticLeft * 1e3 << " mm, right " << hard.plasticRight * 1e3 << " mm");
  CHECK(hard.plasticRight > 0.05);
  CHECK(hard.plasticLeft == 0.0);
  CHECK(hard.broken == 0);  // bent, not torn off
}

TEST_CASE("a bent tie rod makes the car pull and moves the steering centre", "[damage][porsche][4.4]") {
  // §4.4: the front left tie rod shortened 6 mm by yielding (its hydro offset, as a kerb strike leaves it). Hands off
  // at 80 km/h the car drifts off its line; a driver holding the heading needs a steady steering input off centre.
  struct Run { double drift = 0.0, meanSteer = 0.0, toe = 0.0; };
  auto run = [](double bend, bool driver) {
    WorldParams wp;
    wp.threadCount = 1;
    World w(wp);
    applyDefaultContactPairs(w);
    w.addGroundPlane(0.0, material::kAsphalt);
    const LoadedVehicle car = loadVehicleJson(porscheJson(), {{0.0, 0.0, 0.0}, 0.0, 80.0f / 3.6f});
    const int body = w.addBody(car.build.body);
    const int v = w.addVehicle(body, car.build.vehicle);
    if (bend != 0.0) {
      Body& b = w.mutableBody(body);
      const int rack = nodeIndex(car, "FL_rack"), arm = nodeIndex(car, "FL_ks");
      for (int i = 0; i < b.beamCount(); ++i) {
        const size_t k = static_cast<size_t>(i);
        if ((b.beamA[k] == rack && b.beamB[k] == arm) || (b.beamA[k] == arm && b.beamB[k] == rack)) {
          b.hydroOffset[k] += static_cast<float>(bend);
          b.restLength[k] += static_cast<float>(bend);
        }
      }
    }
    Run r;
    double sum = 0.0;
    int samples = 0;
    const DVec3 start = w.body(body).nodeWorldPosition(car.build.vehicle.refCenter);
    const int every = static_cast<int>(0.01 / w.params().dt);
    for (int s = 0; s < 600; ++s) {  // 6 s
      const VehicleTelemetry& t = w.vehicleTelemetry(v);
      VehicleInput in;
      in.throttle = static_cast<float>(std::clamp(0.3 + 0.1 * (80.0 / 3.6 - t.speed), 0.0, 1.0));
      if (driver) {  // hold heading 0 (+Z): positive steer turns left (+X)
        const double heading = std::atan2(t.forward.x, t.forward.z);
        in.steer = static_cast<float>(std::clamp(-4.0 * heading, -1.0, 1.0));
        if (s >= 300) { sum += t.steer; ++samples; }
      }
      w.setVehicleInput(v, in);
      w.step(every);
    }
    const DVec3 end = w.body(body).nodeWorldPosition(car.build.vehicle.refCenter);
    r.drift = end.x - start.x;
    r.meanSteer = samples > 0 ? sum / samples : 0.0;
    r.toe = w.vehicleTelemetry(v).wheels[0].toe;
    return r;
  };
  const Run straight = run(0.0, false), pulled = run(-0.006, false);
  const Run held = run(0.0, true), offset = run(-0.006, true);
  INFO("hands off: drift " << straight.drift << " m straight, " << pulled.drift << " m bent (FL toe "
                           << straight.toe * kDeg << "° → " << pulled.toe * kDeg << "°); held: mean steer "
                           << held.meanSteer << " straight, " << offset.meanSteer << " bent");
  CHECK(std::fabs(straight.drift) < 0.5);
  CHECK(std::fabs(pulled.drift) > 3.0);
  CHECK(std::fabs(held.meanSteer) < 0.005);
  CHECK(std::fabs(offset.meanSteer) > 0.02);
  CHECK(offset.meanSteer * pulled.drift < 0.0);  // the driver steers against the pull
}

TEST_CASE("Porsche 911 Turbo: the powertrain rides on its mounts, stays on at 64 km/h and tears loose at 100 km/h",
          "[damage][porsche][4.4]") {
  // §4.4 internal parts: engine and PDK are node blocks of their own on four rubber mounts (generator). Under full
  // throttle the drive-torque reaction rocks the unit on them; a 64 km/h wall crash throws it against its snubbers but
  // leaves the mounts on; at 100 km/h mounts tear (their damage group counts it).
  struct Mounts { double peakStretch = 0.0; int broken = 0; int total = 0; float mountDamage = 0.0f; };
  auto run = [](float kmh, VehicleInput in, double seconds, DVec3 at) {
    SceneOptions so;
    so.threads = 1;
    auto w = makeScene("drive", so);
    const LoadedVehicle car = loadVehicleJson(porscheJson(), {at, 0.0, kmh / 3.6f});
    const int body = w->addBody(car.build.body);
    w->setVehicleInput(w->addVehicle(body, car.build.vehicle), in);
    const Body& b = w->body(body);
    auto isBlock = [&](int i) { return car.nodeIds[i].rfind("engine_", 0) == 0 || car.nodeIds[i].rfind("gearbox_", 0) == 0; };
    std::vector<int> ties;  // rubber ties: block node to lattice node, spring beams (the snubbers are bounded)
    for (int i = 0; i < b.beamCount(); ++i)
      if (isBlock(b.beamA[i]) != isBlock(b.beamB[i]) && b.beamType[i] == static_cast<uint8_t>(BeamType::kNormal)) ties.push_back(i);
    Mounts m;
    m.total = static_cast<int>(ties.size());
    for (int k = 0; k < static_cast<int>(seconds / 0.005); ++k) {
      w->step(10);
      for (const int i : ties) {
        if (b.broken[i]) continue;
        m.peakStretch = std::max(m.peakStretch, std::fabs(static_cast<double>(length(b.nodePosition(b.beamB[i]) - b.nodePosition(b.beamA[i]))) - b.restLength[i]));
      }
    }
    for (const int i : ties) m.broken += b.broken[i] ? 1 : 0;
    for (const DamageGroupState& g : b.damageGroups)
      if (g.id == "engine_mounts") m.mountDamage = g.damage();
    return m;
  };
  VehicleInput launch;
  launch.throttle = 1.0f;
  const Mounts rock = run(0.0f, launch, 3.0, {0.0, 0.0, 0.0});
  INFO("launch: peak tie stretch " << rock.peakStretch * 1e3 << " mm of " << rock.total << " ties");
  CHECK(rock.total >= 24);
  CHECK(rock.peakStretch > 0.001);   // the unit moves on its mounts under drive torque …
  CHECK(rock.peakStretch < 0.015);   // … within the snubbers' free travel
  CHECK(rock.broken == 0);
  const Mounts wall64 = run(64.0f, VehicleInput{}, 1.5, {0.0, 0.0, 296.6});
  INFO("64 km/h: peak tie stretch " << wall64.peakStretch * 1e3 << " mm, broken " << wall64.broken);
  CHECK(wall64.peakStretch > 0.015);  // thrown against the snubbers
  CHECK(wall64.broken == 0);
  const Mounts wall100 = run(100.0f, VehicleInput{}, 1.5, {0.0, 0.0, 296.6});
  INFO("100 km/h: broken " << wall100.broken << ", mount damage " << wall100.mountDamage);
  CHECK(wall100.broken > 0);
  CHECK(wall100.mountDamage > 0.0f);
}

TEST_CASE("a head-on car-to-car crash as the crash lab launches it closes the energy balance", "[damage][porsche][crash][23.1]") {
  // The web crash lab's head-on run (web/src/crash/scenario.ts: fronts 0.3 s apart at 64 km/h each, the 911's origin
  // 2.25 m behind its front). Crushed nodes sandwiched between the two hulls stay behind a surface after the sweeps;
  // the step-end force law releases their springs, which the ledger books as CCD loss (it drifted to −11 % before).
  SceneOptions so;
  so.threads = 1;
  so.trackEnergy = true;
  auto w = makeScene("crash", so);
  VehicleInput neutral;
  neutral.mode = GearMode::kNeutral;
  const float speed = 64.0f / 3.6f;
  const double gap = 2.25 + speed * 0.3;
  for (const auto& [at, yaw] : {std::pair<DVec3, double>{{40.0, 0.0, -gap}, 0.0}, {{40.0, 0.0, gap}, 3.14159265358979323846}}) {
    const LoadedVehicle car = loadVehicleJson(porscheJson(), {at, yaw, speed});
    w->setVehicleInput(w->addVehicle(w->addBody(car.build.body), car.build.vehicle), neutral);
  }
  const double kinetic0 = w->measureEnergy().kinetic;
  double worst = 0.0;
  for (int k = 0; k < 30; ++k) {
    w->step(100);
    worst = std::max(worst, std::fabs(w->measureEnergy().balance()));
  }
  const EnergyReport e = w->measureEnergy();
  INFO("KE0 " << kinetic0 / 1e3 << " kJ, worst |balance| " << worst / 1e3 << " kJ, plastic " << e.losses.plastic / 1e3
              << " kJ, CCD " << e.losses.ccd / 1e3 << " kJ, bodies " << w->bodyCount());
  CHECK(worst < 0.05 * kinetic0);
  CHECK(e.losses.plastic > 0.4 * kinetic0);
}

TEST_CASE("a wrecked car relaunched into the barrier keeps its damage and crashes again", "[damage][porsche][crash][relaunch][20]") {
  // §20 crash tools: after a 50 km/h barrier impact the same car is sent back to its start mark (turned upright,
  // parts that broke off left behind) and into the barrier again. The move itself logs no event and sets off no
  // airbag; the second impact is a new event of its own, on a front already crushed, and the energy stays balanced.
  SceneOptions so;
  so.threads = 1;
  so.trackEnergy = true;
  auto w = makeScene("crash", so);
  REQUIRE(w);
  const LoadedVehicle car = loadVehicleJson(porscheJson(), {{-3.0, 0.0, -6.0}, 0.0, 50.0f / 3.6f});
  const int body = w->addBody(car.build.body);
  const int v = w->addVehicle(body, car.build.vehicle);
  VehicleInput neutral;
  neutral.mode = GearMode::kNeutral;
  w->setVehicleInput(v, neutral);
  w->step(6000);
  const VehicleTelemetry& t = w->vehicleTelemetry(v);
  const Body& b = w->body(body);
  REQUIRE(t.crashEvents == 1);
  const double plastic1 = b.losses.plastic + b.losses.fracture;
  const uint32_t airbags1 = t.airbags;

  w->relaunchVehicle(v, {-3.0, 0.0, -6.0}, 0.0, 0.0f, 0.0);  // back on the mark, at rest
  w->step(1000);
  INFO("at rest on the mark: speed " << t.speed << " m/s, z " << b.origin.z + b.pz[0]);
  CHECK(t.crashEvents == 1);
  CHECK(std::fabs(t.speed) < 0.3f);
  CHECK(t.airbags == airbags1);
  CHECK(std::fabs(t.forward.x) < 0.02f);
  CHECK(t.forward.z > 0.999f);
  CHECK(t.up.y > 0.99f);

  w->relaunchVehicle(v, {-3.0, 0.0, -6.0}, 0.0, 50.0f / 3.6f, 0.0);
  w->step(40);
  CHECK(std::fabs(t.speed * 3.6 - 50.0) < 2.0);  // rolls off at the launch speed, no false crash from the jump
  CHECK(t.crashEvents == 1);
  w->step(6000);
  INFO("second event: speed " << t.eventSpeed * 3.6 << " km/h, Δv " << t.eventDeltaV * 3.6 << " km/h, absorbed "
                              << t.eventAbsorbed / 1e3 << " kJ");
  CHECK(t.crashEvents == 2);
  CHECK(std::fabs(t.eventSpeed * 3.6 - 50.0) < 6.0);
  CHECK(t.eventDeltaV * 3.6 > 40.0);
  CHECK(b.losses.plastic + b.losses.fracture > plastic1 + 5e3);  // the crushed front crushes further
  const EnergyReport e = w->measureEnergy();
  INFO("balance " << e.balance() << " J of " << e.losses.external << " J external");
  CHECK(std::fabs(e.balance()) < 0.03 * (plastic1 + 1e5));
}

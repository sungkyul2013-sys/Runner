// §6 tyre and wheel damage: punctures (spike strip, pinch against the rim), deflation and its handling effects,
// running flat until the tyre shreds and the wheel runs on its rim.
#include <catch2/catch_test_macros.hpp>

#include <algorithm>
#include <cmath>
#include <fstream>
#include <memory>
#include <sstream>
#include <string>

#include "sbc/scenes.h"
#include "sbc/vehicle_json.h"
#include "sbc/world.h"
#include "test_util.h"

using namespace sbc;

namespace {

const std::string& porscheJson() {
  static const std::string text = [] {
    std::ifstream f(std::string(SBC_VEHICLE_DIR) + "/porsche_911_turbo_991/vehicle.json");
    std::stringstream ss;
    ss << f.rdbuf();
    return ss.str();
  }();
  return text;
}

struct Track {
  std::unique_ptr<World> world;
  int body = -1, vehicle = -1;
};

// Flat asphalt with `obstacles` (centre, half size, material); the Porsche at the origin heading +Z at `kmh`.
Track track(float kmh, const std::vector<std::tuple<DVec3, Vec3, uint16_t>>& obstacles, float shredDistance = 0.0f) {
  WorldParams wp;
  wp.threadCount = 1;
  wp.trackEnergy = true;
  Track t;
  t.world = std::make_unique<World>(wp);
  applyDefaultContactPairs(*t.world);
  t.world->addGroundPlane(0.0, material::kAsphalt);
  for (const auto& [c, h, m] : obstacles) t.world->addStaticBox(c, h, 0.0, m);
  LoadedVehicle car = loadVehicleJson(porscheJson(), {{0.0, 0.0, 0.0}, 0.0, kmh / 3.6f});
  if (shredDistance > 0.0f) for (WheelDesc& w : car.build.vehicle.wheels) w.tyre.shredDistance = shredDistance;
  t.body = t.world->addBody(car.build.body);
  t.vehicle = t.world->addVehicle(t.body, car.build.vehicle);
  return t;
}

// Wheels 0 FL, 1 FR, 2 RL, 3 RR (generator order): left = +X when heading +Z.
bool leftWheel(int i) { return i % 2 == 0; }

// World position of the chassis reference point (telemetry is body-local; the body origin re-bases as it travels).
DVec3 worldPosition(const World& w, const Track& t) {
  return w.body(t.body).origin + toDouble(w.vehicleTelemetry(t.vehicle).position);
}

double balanceShare(const World& w) {
  const EnergyReport e = w.measureEnergy();
  return std::fabs(e.balance()) / std::max(1.0, std::fabs(e.losses.external) + e.kinetic);
}

}  // namespace

TEST_CASE("a spike strip punctures the tyres that cross it and the car pulls to the flat side", "[tyre][porsche][6]") {
  // Spikes under the left wheels only (x > 0), 2 cm high, 40 cm deep, 6 m ahead.
  Track t = track(50.0f, {{{0.8, 0.01, 6.0}, {0.5f, 0.01f, 0.2f}, material::kSpikes}});
  World& w = *t.world;
  VehicleInput coast;
  coast.mode = GearMode::kNeutral;
  w.setVehicleInput(t.vehicle, coast);
  w.step(2000);  // 1 s: over the strip
  const VehicleTelemetry& tel = w.vehicleTelemetry(t.vehicle);
  for (int i = 0; i < 4; ++i) {
    const WheelTelemetry& wt = tel.wheels[static_cast<size_t>(i)];
    INFO("wheel " << i << " x " << wt.center.x << " flags " << wt.tyreFlags << " " << wt.pressure << " bar");
    CHECK(((wt.tyreFlags & tyre_flag::kPuncture) != 0) == leftWheel(i));
  }
  const double x0 = worldPosition(w, t).x;
  w.step(28000);  // 14 s coasting on two deflating tyres
  float leftBar = 0.0f, rightBar = 0.0f;
  for (int i = 0; i < 4; ++i) (leftWheel(i) ? leftBar : rightBar) += 0.5f * tel.wheels[static_cast<size_t>(i)].pressure;
  const double drift = worldPosition(w, t).x - x0;
  INFO("left " << leftBar << " bar, right " << rightBar << " bar, drift " << drift << " m, speed " << tel.speed * 3.6
               << " km/h, balance " << balanceShare(w));
  CHECK(leftBar < 0.15f * 2.5f);             // flat
  CHECK(rightBar > 0.95f * 2.5f);            // untouched
  for (int i = 0; i < 4; ++i) {
    if (leftWheel(i)) CHECK((tel.wheels[static_cast<size_t>(i)].tyreFlags & tyre_flag::kFlat) != 0);
  }
  CHECK(drift > 0.2);                        // pulled left, toward the flat tyres
  CHECK(balanceShare(w) < 0.02);
}

TEST_CASE("a kerb strike pinches the tyre against its rim, a speed bump does not", "[tyre][porsche][6]") {
  // A 15 cm square-edged block under the right wheels (x < 0), 8 m ahead, at 60 km/h; and a 5 cm bump (the drive
  // scene's) under all four.
  Track kerb = track(60.0f, {{{-0.8, 0.075, 8.0}, {0.4f, 0.075f, 0.15f}, material::kConcrete}});
  Track bump = track(60.0f, {{{0.0, 0.0, 8.0}, {3.0f, 0.05f, 0.25f}, material::kAsphalt}});
  VehicleInput coast;
  coast.mode = GearMode::kNeutral;
  for (Track* t : {&kerb, &bump}) {
    t->world->setVehicleInput(t->vehicle, coast);
    t->world->step(3000);
  }
  const VehicleTelemetry& k = kerb.world->vehicleTelemetry(kerb.vehicle);
  const VehicleTelemetry& b = bump.world->vehicleTelemetry(bump.vehicle);
  for (int i = 0; i < 4; ++i) {
    const WheelTelemetry& wk = k.wheels[static_cast<size_t>(i)];
    const WheelTelemetry& wb = b.wheels[static_cast<size_t>(i)];
    INFO("wheel " << i << ": kerb flags " << wk.tyreFlags << " " << wk.pressure << " bar, bend " << wk.rimBend
                  << "; bump flags " << wb.tyreFlags << " " << wb.pressure << " bar");
    CHECK(wb.tyreFlags == 0u);
    if (i == 1) CHECK((wk.tyreFlags & (tyre_flag::kPuncture | tyre_flag::kBlowout)) != 0);  // front right struck first
    if (leftWheel(i)) CHECK(wk.tyreFlags == 0u);                                           // left side untouched
  }
  CHECK(balanceShare(*kerb.world) < 0.02);
}

TEST_CASE("a hard kerb strike bends the rim and the tyre leaks slowly through it", "[tyre][porsche][6]") {
  // A 20 cm square edge under the right wheels at 80 km/h: the front rim yields (2.2 kN rim rings).
  Track t = track(80.0f, {{{-0.8, 0.1, 8.0}, {0.4f, 0.1f, 0.15f}, material::kConcrete}});
  VehicleInput coast;
  coast.mode = GearMode::kNeutral;
  t.world->setVehicleInput(t.vehicle, coast);
  t.world->step(3000);
  const WheelTelemetry& fr = t.world->vehicleTelemetry(t.vehicle).wheels[1];
  INFO("front right: flags " << fr.tyreFlags << ", " << fr.pressure << " bar, rim bend " << fr.rimBend);
  CHECK((fr.tyreFlags & tyre_flag::kRimBent) != 0);
  CHECK(fr.rimBend > 0.005f);
  CHECK(fr.pressure < 2.5f);
  CHECK(balanceShare(*t.world) < 0.03);
}

TEST_CASE("a flat tyre driven on shreds and the wheel runs on its rim", "[tyre][porsche][6]") {
  // Spikes under the left front only; a short shred distance so the test runs in seconds.
  Track t = track(60.0f, {{{0.8, 0.01, 6.0}, {0.5f, 0.01f, 0.2f}, material::kSpikes}}, 60.0f);
  World& w = *t.world;
  VehicleInput drive;
  drive.throttle = 0.25f;
  w.setVehicleInput(t.vehicle, drive);
  const int bodies0 = w.bodyCount();
  double sparks = 0.0;
  bool shredded = false;
  for (int s = 0; s < 40000; ++s) {  // 20 s
    w.step();
    for (const WheelTelemetry& wt : w.vehicleTelemetry(t.vehicle).wheels) {
      sparks = std::max(sparks, static_cast<double>(wt.sparks));
      shredded = shredded || (wt.tyreFlags & tyre_flag::kShredded);
    }
  }
  const VehicleTelemetry& tel = w.vehicleTelemetry(t.vehicle);
  INFO("bodies " << w.bodyCount() << ", sparks " << sparks << ", speed " << tel.speed * 3.6 << " km/h, balance "
                 << balanceShare(w));
  CHECK(shredded);
  CHECK(w.bodyCount() > bodies0);  // the carcass came off as a part of its own
  CHECK(sparks > 0.05);            // the rim on the road
  CHECK(tel.speed * 3.6 > 20.0);   // still driving, on three tyres and a rim
  CHECK(balanceShare(w) < 0.03);
}

TEST_CASE("a soft tyre cornered hard rolls off its bead", "[tyre][porsche][6]") {
  // Spikes under every wheel; once the tyres are down to about half their pressure, full lock at 60 km/h.
  Track t = track(60.0f, {{{0.0, 0.01, 6.0}, {1.5f, 0.01f, 0.2f}, material::kSpikes}});
  World& w = *t.world;
  VehicleInput in;
  in.throttle = 0.2f;
  w.setVehicleInput(t.vehicle, in);
  const VehicleTelemetry& tel = w.vehicleTelemetry(t.vehicle);
  w.step();  // telemetry exists from the first step on
  for (int s = 0; s < 40000 && tel.wheels[0].pressure > 1.3f; ++s) w.step();
  REQUIRE(tel.wheels[0].pressure <= 1.3f);
  in.steer = 1.0f;
  in.throttle = 0.35f;
  w.setVehicleInput(t.vehicle, in);
  uint32_t bead = 0;
  for (int s = 0; s < 8000; ++s) {  // 4 s of hard cornering
    w.step();
    for (const WheelTelemetry& wt : tel.wheels) bead |= wt.tyreFlags & tyre_flag::kBeadUnseated;
  }
  INFO("pressures " << tel.wheels[0].pressure << " " << tel.wheels[1].pressure << " " << tel.wheels[2].pressure << " "
                    << tel.wheels[3].pressure << ", speed " << tel.speed * 3.6 << " km/h");
  CHECK(bead != 0u);
  CHECK(balanceShare(w) < 0.03);
}

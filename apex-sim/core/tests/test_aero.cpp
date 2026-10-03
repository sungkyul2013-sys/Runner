// §10 aerodynamics: surface forces calibrated to the car's Cd·A and lift, slipstream behind another car, the change
// damage brings, and an adjustable rear wing with stall.
#include <catch2/catch_test_macros.hpp>

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

std::unique_ptr<World> flat() {
  WorldParams wp;
  wp.threadCount = 1;
  auto w = std::make_unique<World>(wp);
  applyDefaultContactPairs(*w);
  w->addGroundPlane(0.0, material::kAsphalt);
  return w;
}

int addPorsche(World& w, DVec3 at, float kmh) {
  const LoadedVehicle car = loadVehicleJson(porscheJson(), {at, 0.0, kmh / 3.6f});
  const int v = w.addVehicle(w.addBody(car.build.body), car.build.vehicle);
  VehicleInput coast;
  coast.mode = GearMode::kNeutral;
  w.setVehicleInput(v, coast);
  return v;
}

double q(double airspeed) { return 0.5 * 1.225 * airspeed * airspeed; }

}  // namespace

TEST_CASE("the surface aerodynamics keep the car's drag area and axle lift straight ahead", "[aero][porsche][10]") {
  auto w = flat();
  const int v = addPorsche(*w, {0.0, 0.0, 0.0}, 150.0f);
  w->step(1000);  // 0.5 s: settled on its springs
  const VehicleTelemetry& t = w->vehicleTelemetry(v);
  const double qq = q(t.airspeed);
  INFO("airspeed " << t.airspeed * 3.6 << " km/h: drag " << t.aeroDrag << " N (Cd·A " << t.aeroDrag / qq << "), downforce "
                   << t.aeroDownforceFront << " / " << t.aeroDownforceRear << " N (" << t.aeroDownforceFront / qq << " / "
                   << t.aeroDownforceRear / qq << " m²)");
  const VehicleDesc& d = w->vehicleDesc(v);
  CHECK(std::fabs(t.aeroDrag / qq - d.aero.dragArea) < 0.03 * d.aero.dragArea);
  CHECK(std::fabs((t.aeroDownforceFront + t.aeroDownforceRear) / qq - (d.aero.liftAreaFront + d.aero.liftAreaRear)) < 0.05);
  CHECK(std::fabs(t.airspeed - t.speed) < 0.01);  // still air
}

TEST_CASE("a car in another's wake meets slower air and less drag (slipstream)", "[aero][porsche][10]") {
  auto w = flat();
  const int lead = addPorsche(*w, {0.0, 0.0, 10.0}, 150.0f);
  const int close = addPorsche(*w, {0.0, 0.0, 0.0}, 150.0f);  // 10 m centre to centre: ≈ 5.5 m nose to tail
  const int beside = addPorsche(*w, {4.0, 0.0, 0.0}, 150.0f); // one lane over: out of the wake
  w->step(1000);
  const VehicleTelemetry &a = w->vehicleTelemetry(lead), &b = w->vehicleTelemetry(close), &c = w->vehicleTelemetry(beside);
  INFO("drag lead " << a.aeroDrag << " N, behind " << b.aeroDrag << " N (airspeed " << b.airspeed * 3.6 << " km/h), beside "
                    << c.aeroDrag << " N");
  CHECK(b.aeroDrag < 0.8 * a.aeroDrag);
  CHECK(b.aeroDrag > 0.3 * a.aeroDrag);
  CHECK(b.airspeed < 0.92f * b.speed);
  CHECK(std::fabs(c.aeroDrag - a.aeroDrag) < 0.03 * a.aeroDrag);
}

TEST_CASE("a crushed nose changes the air the car meets", "[aero][porsche][10]") {
  // Two Porsches parked side by side in a 30 m/s head wind, one of them after a 64 km/h barrier crash.
  SceneOptions so;
  so.threads = 1;
  auto w = makeScene("crash", so);
  const int wreck = addPorsche(*w, {-3.0, 0.0, -6.0}, 64.0f);
  const int intact = addPorsche(*w, {12.0, 0.0, -6.0}, 0.0f);
  w->step(6000);  // 3 s: crash and rest
  w->setWind({0.0f, 0.0f, -30.0f});
  w->step(400);
  const VehicleTelemetry &a = w->vehicleTelemetry(intact), &b = w->vehicleTelemetry(wreck);
  INFO("intact: drag " << a.aeroDrag << " N, lift " << a.aeroDownforceFront << " / " << a.aeroDownforceRear << "; wreck: drag "
                       << b.aeroDrag << " N, lift " << b.aeroDownforceFront << " / " << b.aeroDownforceRear);
  CHECK(std::fabs(a.airspeed - 30.0f) < 0.5f);
  CHECK(std::fabs(b.aeroDrag - a.aeroDrag) > 0.03 * a.aeroDrag);
}

TEST_CASE("the rear wing's downforce follows its angle and stalls", "[aero][porsche][10]") {
  double rear[3], drag[3];
  const double extra[3] = {0.0, 0.12, 0.55};
  for (int k = 0; k < 3; ++k) {
    auto w = flat();
    const int v = addPorsche(*w, {0.0, 0.0, 0.0}, 200.0f);
    w->setVehicleWingAngle(v, 0, static_cast<float>(extra[k]));
    w->step(1000);
    const VehicleTelemetry& t = w->vehicleTelemetry(v);
    rear[k] = t.aeroDownforceRear / q(t.airspeed);
    drag[k] = t.aeroDrag / q(t.airspeed);
  }
  INFO("rear downforce area " << rear[0] << " → " << rear[1] << " (+" << extra[1] << " rad) → " << rear[2] << " (stalled); drag "
                              << drag[0] << " → " << drag[1] << " → " << drag[2]);
  CHECK(rear[1] > rear[0] + 0.05);  // more angle, more downforce
  CHECK(drag[1] > drag[0]);         // and more (induced) drag
  CHECK(rear[2] < rear[1]);         // past the stall it falls
}

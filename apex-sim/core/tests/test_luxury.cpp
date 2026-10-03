// The generated Rolls-Royce Ghost and Mercedes-Maybach GLS 600 (tools/vehicle-gen/luxury.mjs): they load, pass the
// explicit-integration stability check, stand quietly on their wheels with the axle loads of their weight split,
// launch and brake within the §23.2 bands of their maker figures, and take no damage doing so.
#include <catch2/catch_test_macros.hpp>
#include <cmath>
#include <fstream>
#include <memory>
#include <sstream>
#include <string>

#include "sbc/scenes.h"
#include "sbc/stability.h"
#include "sbc/vehicle_json.h"
#include "sbc/world.h"

using namespace sbc;

namespace {

std::string readVehicle(const std::string& id) {
  std::ifstream f(std::string(SBC_VEHICLE_DIR) + "/" + id + "/vehicle.json", std::ios::binary);
  REQUIRE(f.good());
  std::stringstream s;
  s << f.rdbuf();
  return s.str();
}

double target(const LoadedVehicle& v, const std::string& key) {
  for (const auto& [k, value] : v.targets)
    if (k == key) return value;
  FAIL("missing target " << key);
  return 0.0;
}

}  // namespace

TEST_CASE("Rolls-Royce Ghost and Maybach GLS 600: stand, launch and brake like their maker figures", "[vehicle_json][luxury][23.2]") {
  for (const char* id : {"rolls_royce_ghost", "maybach_gls"}) {
    INFO(id);
    WorldParams wp;
    World w(wp);
    applyDefaultContactPairs(w);
    w.addGroundPlane(0.0, material::kAsphalt);
    const LoadedVehicle car = loadVehicleJson(readVehicle(id), {{0.0, 0.05, 0.0}, 0.0, 0.0f});
    const int body = w.addBody(car.build.body);
    const int v = w.addVehicle(body, car.build.vehicle);
    const Body& b = w.body(body);
    double mass = 0.0;
    for (int i = 0; i < b.nodeCount(); ++i) mass += b.mass[i];
    CHECK(std::fabs(mass - target(car, "mass")) < 1.0);
    const StabilityReport st = checkStability(b, wp.dt);
    INFO("critical dt " << st.minCriticalDt);
    CHECK(st.ok());

    // At rest on the brakes: settled, the axle loads split as designed.
    VehicleInput in;
    in.brake = 1.0f;
    w.setVehicleInput(v, in);
    w.step(4000);
    const VehicleTelemetry& t = w.vehicleTelemetry(v);
    const double front = t.wheels[0].load + t.wheels[1].load, rear = t.wheels[2].load + t.wheels[3].load;
    INFO("axle loads " << front << " / " << rear << " N");
    CHECK(std::fabs(t.speed) < 0.05f);
    CHECK(std::fabs(front / (front + rear) - target(car, "frontWeightFraction")) < 0.03);
    CHECK(std::fabs((front + rear) / 9.81 - mass) < 0.06 * mass);

    // Full throttle: 0-100 km/h within 15 % of the maker's time.
    in.brake = 0.0f;
    in.throttle = 1.0f;
    w.setVehicleInput(v, in);
    double time = 0.0;
    while (t.speed * 3.6 < 100.0 && time < 12.0) {
      w.step(20);
      time += 20 * wp.dt;
    }
    INFO("0-100 km/h " << time << " s");
    CHECK(std::fabs(time - target(car, "zeroTo100")) < 0.15 * target(car, "zeroTo100"));

    // Full braking from 100 km/h: within the §23.2 band (≤ 42 m for these heavy cars' tyres and brakes).
    in.throttle = 0.0f;
    in.brake = 1.0f;
    w.setVehicleInput(v, in);
    const DVec3 p0 = b.origin;
    for (int k = 0; k < 2000 && t.speed > 0.2f; ++k) w.step(20);
    const double distance = std::hypot(b.origin.x - p0.x, b.origin.z - p0.z);
    INFO("100-0 km/h in " << distance << " m");
    CHECK(distance > 30.0);
    CHECK(distance < 42.0);
    for (const auto& wheel : t.wheels) CHECK(wheel.tyreFlags == 0);
    CHECK(t.faults == 0);
  }
}

// Vehicle JSON loader (A§4.11, docs/VEHICLE_FORMAT.md) and the generated Porsche 911 Turbo (991).
#include <catch2/catch_test_macros.hpp>
#include <cmath>
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

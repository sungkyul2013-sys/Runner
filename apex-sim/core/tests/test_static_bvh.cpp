// Static broadphase (KNOWN_ISSUES P4, A§4.6): the BVH over the static triangles gives the solver exactly what the
// linear scan gave (same candidates, same order: the same state hash), and scales with the map.
#include <catch2/catch_test_macros.hpp>

#include <chrono>
#include <fstream>
#include <memory>
#include <sstream>
#include <string>

#include "sbc/builder.h"
#include "sbc/scenes.h"
#include "sbc/vehicle_json.h"
#include "sbc/world.h"

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

// A yard of `n` × `n` low concrete blocks (kerbs, bollards) around the origin, lattices falling onto it and the
// Porsche driving through at 60 km/h.
std::unique_ptr<World> yard(bool bvh, int n) {
  WorldParams wp;
  wp.threadCount = 1;
  wp.staticBvh = bvh;
  auto w = std::make_unique<World>(wp);
  applyDefaultContactPairs(*w);
  w->addGroundPlane(0.0, material::kAsphalt);
  for (int i = 0; i < n; ++i) {
    for (int j = 0; j < n; ++j) {
      const double x = -60.0 + 120.0 * i / (n - 1), z = -60.0 + 120.0 * j / (n - 1);
      if (std::abs(x) < 3.0) continue;  // the car's lane
      w->addStaticBox({x, 0.1, z}, {0.3f, 0.1f, 0.3f}, 0.1 * (i + j), material::kConcrete);
    }
  }
  for (int k = 0; k < 4; ++k) {
    LatticeParams p;
    p.center = {6.0 + 2.1 * k, 2.0 + 0.5 * k, 3.0 * k - 4.0};
    p.size = {0.8f, 0.8f, 0.8f};
    p.totalMass = 60.0f;
    p.nodeRadius = 0.08f;
    p.axialStiffness = 2.0e5f;
    p.dampingRatio = 0.2f;
    p.velocity = {-1.0f, 0.0f, 0.5f};
    w->addBody(makeLattice(p));
  }
  const LoadedVehicle car = loadVehicleJson(porscheJson(), {{0.0, 0.0, -40.0}, 0.0, 60.0f / 3.6f});
  const int v = w->addVehicle(w->addBody(car.build.body), car.build.vehicle);
  VehicleInput in;
  in.throttle = 0.2f;
  in.steer = 0.15f;  // drifts out of its lane into the blocks
  w->setVehicleInput(v, in);
  return w;
}

}  // namespace

TEST_CASE("the static BVH gives the same simulation as the linear scan", "[bvh][A4.6]") {
  auto a = yard(true, 30), b = yard(false, 30);
  REQUIRE(a->staticTriangleCount() > 10000);
  long contacts = 0;
  for (int k = 0; k < 4; ++k) {
    for (int s = 0; s < 1000; ++s) {
      a->step();
      b->step();
      contacts += a->lastStepStats().staticContacts;
    }
    INFO("step " << a->stepIndex());
    CHECK(a->stateHash() == b->stateHash());
  }
  CHECK(contacts > 0);
}

TEST_CASE("the static BVH scales with the map", "[bvh][A4.6][!benchmark]") {
  auto time = [](bool bvh, int n) {
    auto w = yard(bvh, n);
    w->step(20);  // warm up
    const auto t0 = std::chrono::steady_clock::now();
    w->step(200);
    return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count() / 200.0;
  };
  const double small = time(true, 30), bigBvh = time(true, 120), bigScan = time(false, 120);
  INFO("ms/step: 10.8 k triangles " << small << " (BVH); 172 k triangles " << bigBvh << " (BVH) vs " << bigScan << " (scan)");
  CHECK(bigBvh < 0.5 * bigScan);
  CHECK(bigBvh < 2.0 * small);  // a map 16× larger barely costs more
}

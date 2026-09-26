// §13 terrain heightfield and weather material remap: a heightfield collides like the same triangles given as a
// mesh, a hole cell has no surface, cars drive on it, and a remapped material changes the grip.
#include <catch2/catch_test_macros.hpp>

#include <cmath>
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

double terrainHeight(double x, double z) { return 1.0 + 0.12 * x + 0.3 * std::sin(0.05 * z); }

// 60 × 60 cells of 2 m around the origin, heights from terrainHeight.
Heightfield field(uint16_t material) {
  Heightfield f;
  f.originX = -60.0;
  f.originZ = -60.0;
  f.cell = 2.0;
  f.nx = f.nz = 60;
  for (int iz = 0; iz <= f.nz; ++iz) {
    for (int ix = 0; ix <= f.nx; ++ix) {
      f.heights.push_back(static_cast<float>(terrainHeight(f.originX + ix * f.cell, f.originZ + iz * f.cell)));
    }
  }
  f.materials.assign(static_cast<size_t>(f.nx * f.nz), static_cast<uint8_t>(material));
  return f;
}

// The same surface as a static mesh (same diagonal split and winding).
void addAsMesh(World& w, const Heightfield& f, uint16_t material) {
  std::vector<float> v;
  std::vector<int32_t> idx;
  for (int iz = 0; iz <= f.nz; ++iz) {
    for (int ix = 0; ix <= f.nx; ++ix) {
      v.push_back(static_cast<float>(f.originX + ix * f.cell));
      v.push_back(f.heights[static_cast<size_t>(iz * (f.nx + 1) + ix)]);
      v.push_back(static_cast<float>(f.originZ + iz * f.cell));
    }
  }
  for (int iz = 0; iz < f.nz; ++iz) {
    for (int ix = 0; ix < f.nx; ++ix) {
      const int a = iz * (f.nx + 1) + ix, b = a + 1, c = a + f.nx + 1, d = c + 1;
      idx.insert(idx.end(), {a, c, d, a, d, b});
    }
  }
  w.addStaticMesh({}, v, idx, material);
}

std::unique_ptr<World> world(double planeHeight) {
  WorldParams wp;
  wp.threadCount = 1;
  auto w = std::make_unique<World>(wp);
  applyDefaultContactPairs(*w);
  w->addGroundPlane(planeHeight, material::kConcrete);
  return w;
}

LatticeParams block(DVec3 center, Vec3 velocity = {}) {
  LatticeParams p;
  p.center = center;
  p.size = {0.8f, 0.4f, 0.8f};
  p.nx = p.ny = p.nz = 3;
  p.totalMass = 80.0f;
  p.nodeRadius = 0.05f;
  p.axialStiffness = 2.0e5f;
  p.dampingRatio = 0.3f;
  p.material = material::kSteel;
  p.velocity = velocity;
  return p;
}

DVec3 centroid(const World& w, int body) {
  const Body& b = w.body(body);
  DVec3 c{};
  for (int i = 0; i < b.nodeCount(); ++i) c = c + b.nodeWorldPosition(i);
  return c * (1.0 / b.nodeCount());
}

}  // namespace

TEST_CASE("a heightfield collides like the same triangles as a mesh", "[heightfield][map]") {
  auto a = world(-50.0), b = world(-50.0);
  a->setHeightfield(field(material::kConcrete));
  addAsMesh(*b, field(material::kConcrete), material::kConcrete);
  // A block dropped onto the 7° slope: it lands, bounces and settles (static friction holds it).
  const DVec3 start{5.0, terrainHeight(5.0, 3.0) + 0.6, 3.0};
  const int ba = a->addBody(makeLattice(block(start))), bb = b->addBody(makeLattice(block(start)));
  for (int s = 0; s < 4000; ++s) {
    a->step();
    b->step();
  }
  const DVec3 ca = centroid(*a, ba), cb = centroid(*b, bb);
  INFO("heightfield " << ca.x << ", " << ca.y << ", " << ca.z << " mesh " << cb.x << ", " << cb.y << ", " << cb.z);
  CHECK(std::abs(ca.x - cb.x) < 2e-3);
  CHECK(std::abs(ca.y - cb.y) < 2e-3);
  CHECK(std::abs(ca.z - cb.z) < 2e-3);
  // Resting on the surface: the lowest nodes one radius above it.
  CHECK(std::abs(ca.y - (terrainHeight(ca.x, ca.z) + 0.2 + 0.05)) < 0.05);
  CHECK(a->lastStepStats().staticContacts > 0);
}

TEST_CASE("a hole cell of the heightfield has no surface", "[heightfield][map]") {
  auto w = world(-4.0);
  Heightfield f = field(material::kConcrete);
  // Hole 3 × 3 cells around (10, 10).
  for (int iz = 34; iz <= 36; ++iz) {
    for (int ix = 34; ix <= 36; ++ix) f.materials[static_cast<size_t>(iz * f.nx + ix)] = kHeightfieldHole;
  }
  w->setHeightfield(f);
  const int inHole = w->addBody(makeLattice(block({11.0, terrainHeight(11.0, 11.0) + 1.0, 11.0})));
  const int beside = w->addBody(makeLattice(block({-11.0, terrainHeight(-11.0, 11.0) + 1.0, 11.0})));
  for (int s = 0; s < 8000; ++s) w->step();
  CHECK(std::abs(centroid(*w, inHole).y - (-4.0 + 0.25)) < 0.05);  // fell through, onto the plane below
  CHECK(std::abs(centroid(*w, beside).y - (terrainHeight(centroid(*w, beside).x, centroid(*w, beside).z) + 0.25)) < 0.1);
}

TEST_CASE("the Porsche drives over a heightfield", "[heightfield][vehicle][map]") {
  auto w = world(-50.0);
  Heightfield f;
  f.originX = -40.0;
  f.originZ = -80.0;
  f.cell = 4.0;
  f.nx = 20;
  f.nz = 60;
  for (int iz = 0; iz <= f.nz; ++iz) {
    for (int ix = 0; ix <= f.nx; ++ix) {
      const double z = f.originZ + iz * f.cell;
      f.heights.push_back(static_cast<float>(0.8 * std::sin(0.03 * z) + 0.03 * z));  // rolling, climbing 3 %
    }
  }
  f.materials.assign(static_cast<size_t>(f.nx * f.nz), static_cast<uint8_t>(material::kAsphalt));
  w->setHeightfield(f);
  const double y0 = 0.8 * std::sin(0.03 * -60.0) + 0.03 * -60.0;
  const LoadedVehicle car = loadVehicleJson(porscheJson(), {{0.0, y0 + 0.05, -60.0}, 0.0, 30.0f / 3.6f});
  const int v = w->addVehicle(w->addBody(car.build.body), car.build.vehicle);
  VehicleInput in;
  in.throttle = 0.3f;
  w->setVehicleInput(v, in);
  for (int s = 0; s < 6000; ++s) w->step();  // 3 s
  const int body = w->vehicleBody(v);
  const DVec3 p = w->body(body).nodeWorldPosition(car.build.vehicle.refCenter);
  const double ground = 0.8 * std::sin(0.03 * p.z) + 0.03 * p.z;
  INFO("chassis " << p.x << ", " << p.y << ", " << p.z << " ground " << ground);
  CHECK(p.z > -60.0 + 20.0);         // it went forward (+z)
  CHECK(std::abs(p.x) < 2.0);
  CHECK(p.y - ground > 0.1);          // on its wheels, not in the ground
  CHECK(p.y - ground < 1.0);
}

TEST_CASE("the weather remap changes the grip of a surface", "[heightfield][weather][map]") {
  auto slide = [](bool icy) {
    auto w = world(0.0);
    w->addStaticBox({0.0, -0.5, 0.0}, {30.0f, 0.5f, 30.0f}, 0.0, material::kAsphalt);
    if (icy) w->setMaterialRemap(material::kAsphalt, material::kIce);
    const int b = w->addBody(makeLattice(block({-20.0, 0.26, 0.0}, {8.0f, 0.0f, 0.0f})));
    for (int s = 0; s < 8000; ++s) w->step();
    return centroid(*w, b).x + 20.0;
  };
  const double dry = slide(false), icy = slide(true);
  INFO("dry " << dry << " m, icy " << icy << " m");
  CHECK(dry < 8.0);
  CHECK(icy > 2.5 * dry);
}

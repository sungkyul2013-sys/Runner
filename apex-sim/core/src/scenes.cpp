#include "sbc/scenes.h"

#include "sbc/builder.h"
#include "sbc/proto_car.h"
#include "sbc/surfaces.h"
#include "sbc/vehicle_json.h"

namespace sbc {
namespace {

// Reference lattice "material": EA = 5e4 N over 0.25 m pitch → k = 2e5 N/m. With 0.8 kg nodes the
// Gershgorin node limit √(2m/Σk) ≈ 0.65 ms clears the 0.5 ms step with the 0.8 safety factor.
LatticeParams cube(DVec3 center) {
  LatticeParams p;
  p.center = center;
  p.size = {1.0f, 1.0f, 1.0f};
  p.nx = p.ny = p.nz = 5;
  p.totalMass = 100.0f;
  p.nodeRadius = 0.1f;  // ≈ half the 0.25 m pitch: until node↔triangle body contact (M2), node spheres
                        // must nearly touch or lattices slip into each other
  p.axialStiffness = 5.0e4f;
  p.dampingRatio = 0.25f;
  p.yieldStrain = 0.015f;
  p.hardening = 0.05f;
  p.deformLimit = 0.35f;
  p.material = material::kSteel;
  return p;
}

// Crash block standing in for a 1,500 kg car until M1/M2 (4.2 × 1.4 × 1.8 m, 9 × 4 × 5 nodes).
LatticeParams crashBlock(DVec3 center, Vec3 velocity) {
  LatticeParams p;
  p.center = center;
  p.size = {4.2f, 1.4f, 1.8f};
  p.nx = 9; p.ny = 4; p.nz = 5;
  p.totalMass = 1500.0f;
  p.nodeRadius = 0.06f;
  p.axialStiffness = 8.0e5f;
  p.dampingRatio = 0.25f;
  p.yieldStrain = 0.006f;  // low yield keeps stored elastic energy small → car-like crumple, little rebound
  p.hardening = 0.1f;
  p.deformLimit = 0.5f;
  p.material = material::kSteel;
  p.velocity = velocity;
  return p;
}

std::unique_ptr<World> baseWorld(const SceneOptions& o) {
  WorldParams wp;
  wp.threadCount = o.threads;
  wp.trackEnergy = o.trackEnergy;
  auto w = std::make_unique<World>(wp);
  applyDefaultContactPairs(*w);
  w->addGroundPlane(0.0, material::kConcrete);
  return w;
}

}  // namespace

void applyDefaultContactPairs(World& w) { applySurfaces(w, defaultSurfaces()); }

std::vector<std::string> sceneNames() {
  return {"sandbox", "cube_drop", "tower", "wall_crash", "pile", "golden_m0", "proto_drive", "drive", "crash"};
}

std::unique_ptr<World> makeScene(const std::string& name, const SceneOptions& o) {
  if (name == "proto_drive") {
    // Driving ground (M1): asphalt plane, the APEX Proto car at the origin facing +Z, a few obstacles to hit.
    WorldParams wp;
    wp.threadCount = o.threads;
    wp.trackEnergy = o.trackEnergy;
    auto w = std::make_unique<World>(wp);
    applyDefaultContactPairs(*w);
    w->addGroundPlane(0.0, material::kAsphalt);
    w->addStaticBox({-12.0, 1.0, 60.0}, {6.0f, 1.0f, 0.5f}, 0.0, material::kConcrete);  // wall across a side lane
    w->addStaticBox({15.0, 0.5, 30.0}, {0.4f, 0.5f, 0.4f}, 0.0, material::kConcrete);   // bollard
    const VehicleBuild car = makeProtoCar();
    w->addVehicle(w->addBody(car.body), car.vehicle);
    return w;
  }
  if (name == "drive") {
    // Driving ground (M1e, web): asphalt, no car (the client spawns one from its vehicle JSON at the origin facing
    // +Z). The straight lane (x ≈ 0) is free for 300 m up to a concrete wall. To the right (−X): a slalom of light
    // knock-over cones (3 kg rubber lattices) at x = −12, and a tyre test lane at x = −24 (§6): a spike strip across
    // it at z = 40 and a 12 cm square-edged step under its right wheels at z = 160. To the left (+X): three 5 cm speed
    // bumps and a 1.2 m jump ramp.
    WorldParams wp;
    wp.threadCount = o.threads;
    wp.trackEnergy = o.trackEnergy;
    auto w = std::make_unique<World>(wp);
    applyDefaultContactPairs(*w);
    w->addGroundPlane(0.0, material::kAsphalt);
    for (int i = 0; i < 6; ++i) {
      LatticeParams cone;
      cone.center = {-12.0, 0.41, 30.0 + 18.0 * i};  // bottom nodes (r 0.1) rest on the ground
      cone.size = {0.34f, 0.6f, 0.34f};
      cone.nx = 2; cone.ny = 3; cone.nz = 2;
      cone.totalMass = 3.0f;
      cone.nodeRadius = 0.1f;
      cone.axialStiffness = 1.5e4f;
      cone.dampingRatio = 0.2f;
      cone.material = material::kRubber;
      w->addBody(makeLattice(cone));
    }
    for (int i = 0; i < 3; ++i) {
      w->addStaticBox({9.0, 0.0, 25.0 + 12.0 * i}, {3.0f, 0.05f, 0.25f}, 0.0, material::kAsphalt);
    }
    // Wedge: rises along +Z from z = 20 (ground) to z = 32 (1.2 m), x ∈ [19, 25]; outward-facing, open below.
    const std::vector<float> v = {25, 0, 20, 19, 0, 20, 25, 0, 32, 19, 0, 32, 25, 1.2f, 32, 19, 1.2f, 32};
    // No bottom face: it would lie in the ground plane, and a one-sided triangle grabs nodes within one radius
    // behind it too (tread nodes rolling past would be pushed down into the road).
    const std::vector<int32_t> idx = {0, 1, 5, 0, 5, 4, 2, 4, 5, 2, 5, 3, 0, 4, 2, 1, 3, 5};
    w->addStaticMesh({}, v, idx, material::kConcrete);
    w->addStaticBox({-24.0, 0.01, 40.0}, {3.0f, 0.01f, 0.2f}, 0.0, material::kSpikes);    // spike strip
    w->addStaticBox({-24.8, 0.06, 160.0}, {0.5f, 0.06f, 0.15f}, 0.0, material::kConcrete);  // square-edged step
    w->addStaticBox({0.0, 1.5, 300.0}, {15.0f, 1.5f, 0.5f}, 0.0, material::kConcrete);
    return w;
  }
  if (name == "crash") {
    // Crash test ground (M2 launch tool, §12.7 in part): asphalt, no car (the client launches them). A rigid concrete
    // barrier 6 m wide, 2 m high, faces −Z at z = 0 and ends at x = 0, so a car at x = −3 hits it full width and one
    // shifted toward +x overlaps it partly (offset tests). The open ground around x = 40 is for car-to-car runs.
    WorldParams wp;
    wp.threadCount = o.threads;
    wp.trackEnergy = o.trackEnergy;
    auto w = std::make_unique<World>(wp);
    applyDefaultContactPairs(*w);
    w->addGroundPlane(0.0, material::kAsphalt);
    w->addStaticBox({-3.0, 1.0, 1.0}, {3.0f, 1.0f, 1.0f}, 0.0, material::kConcrete);
    return w;
  }
  if (name == "sandbox") {
    // Empty test ground for the web sandbox: a concrete wall 20 m down +x, a 6 m ramp to −x and a pillar.
    auto w = baseWorld(o);
    w->addStaticBox({20.0, 1.5, 0.0}, {0.5f, 1.5f, 5.0f}, 0.0, material::kConcrete);
    w->addStaticBox({8.0, 1.0, 8.0}, {0.3f, 1.0f, 0.3f}, 0.0, material::kConcrete);
    // Wedge: slope rises from x = −14 (ground) to x = −8 (1.2 m), 4 m wide; outward-facing, open below.
    const std::vector<float> v = {-14, 0, -2, -14, 0, 2, -8, 0, -2, -8, 0, 2, -8, 1.2f, -2, -8, 1.2f, 2};
    // No bottom face: it would lie in the ground plane, and a one-sided triangle grabs nodes within one radius
    // behind it too (tread nodes rolling past would be pushed down into the road).
    const std::vector<int32_t> idx = {0, 1, 5, 0, 5, 4, 2, 4, 5, 2, 5, 3, 0, 4, 2, 1, 3, 5};
    w->addStaticMesh({}, v, idx, material::kConcrete);
    return w;
  }
  if (name == "cube_drop") {
    auto w = baseWorld(o);
    w->addBody(makeLattice(cube({0.0, 3.0, 0.0})));
    return w;
  }
  if (name == "tower") {
    auto w = baseWorld(o);
    // Lowest corner of the tilted 1 × 4 m column sits 2·cos(0.3) + 0.5·sin(0.3) = 2.06 m below the centre.
    LatticeParams p = cube({0.0, 2.17, 0.0});
    p.size = {1.0f, 4.0f, 1.0f};
    p.nx = 4; p.ny = 13; p.nz = 4;
    p.totalMass = 250.0f;
    p.yawPitchRoll = {0.0f, 0.0f, 0.3f};  // leans ~17°, past the 14° tip-over angle of a 1 × 4 m column
    w->addBody(makeLattice(p));
    return w;
  }
  if (name == "wall_crash") {
    // 64 km/h (17.78 m/s) into a fixed concrete wall — preliminary §23.1 energy-balance scene.
    auto w = baseWorld(o);
    w->addStaticBox({4.0, 1.5, 0.0}, {0.5f, 1.5f, 3.0f}, 0.0, material::kConcrete);
    w->addBody(makeLattice(crashBlock({-0.5, 0.76, 0.0}, {64.0f / 3.6f, 0.0f, 0.0f})));
    return w;
  }
  if (name == "pile") {
    auto w = baseWorld(o);
    const int n = o.bodies > 0 ? o.bodies : 1;
    const int side = 4;  // cubes per row
    for (int i = 0; i < n; ++i) {
      const int col = i % side, row = (i / side) % side, layer = i / (side * side);
      LatticeParams p = cube({(col - 1.5) * 1.6, 1.5 + layer * 1.6 + (row % 2) * 0.3, (row - 1.5) * 1.6});
      p.yawPitchRoll = {0.3f * static_cast<float>(i), 0.1f, 0.05f * static_cast<float>(i % 3)};
      w->addBody(makeLattice(p));
    }
    return w;
  }
  if (name == "golden_m0") {
    // Mix of ground contact, body–body impact, plastic yield and a static wall: the M0 determinism contract.
    auto w = baseWorld(o);
    w->addStaticBox({3.0, 0.5, 0.0}, {0.3f, 0.5f, 2.0f}, 0.4, material::kConcrete);
    w->addBody(makeLattice(cube({0.0, 1.0, 0.0})));
    LatticeParams thrown = cube({-3.0, 2.0, 0.2});
    thrown.velocity = {9.0f, 1.0f, 0.0f};
    thrown.yawPitchRoll = {0.5f, 0.2f, 0.1f};
    w->addBody(makeLattice(thrown));
    LatticeParams slider = cube({1.0, 0.61, 3.0});
    slider.velocity = {6.0f, 0.0f, -4.0f};
    w->addBody(makeLattice(slider));
    return w;
  }
  return nullptr;
}

std::unique_ptr<World> makeCrashGolden(std::string_view vehicleJson, const SceneOptions& options) {
  auto w = makeScene("crash", options);
  VehicleInput neutral;
  neutral.mode = GearMode::kNeutral;
  const float speed = 64.0f / 3.6f;
  for (const auto& [at, yaw] : {std::pair<DVec3, double>{{40.0, 0.0, -8.0}, 0.0}, {{40.4, 0.0, 8.0}, 3.14159265358979323846}}) {
    const LoadedVehicle car = loadVehicleJson(vehicleJson, {at, yaw, speed});
    w->setVehicleInput(w->addVehicle(w->addBody(car.build.body), car.build.vehicle), neutral);
  }
  return w;
}

}  // namespace sbc

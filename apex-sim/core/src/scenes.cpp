#include "sbc/scenes.h"

#include "sbc/builder.h"

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

void applyDefaultContactPairs(World& w) {
  ContactPairParams steelConcrete;  // dry steel on concrete: µs ≈ 0.6, µk ≈ 0.45
  steelConcrete.staticFriction = 0.6f;
  steelConcrete.kineticFriction = 0.45f;
  w.setContactPair(material::kSteel, material::kConcrete, steelConcrete);
  ContactPairParams steelSteel;  // dry mild steel on steel: µs ≈ 0.7, µk ≈ 0.5
  steelSteel.staticFriction = 0.7f;
  steelSteel.kineticFriction = 0.5f;
  w.setContactPair(material::kSteel, material::kSteel, steelSteel);
}

std::vector<std::string> sceneNames() { return {"cube_drop", "tower", "wall_crash", "pile", "golden_m0"}; }

std::unique_ptr<World> makeScene(const std::string& name, const SceneOptions& o) {
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

}  // namespace sbc

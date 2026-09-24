// SoftBodyCore — named reference scenes shared by tests, the CLI, benchmarks and golden hashes.
// Scene contents are part of the golden-hash contract: changing one requires regenerating
// tests/golden/*.json (§2.8) and noting why in CHANGELOG.md.
#pragma once

#include <memory>
#include <string>
#include <string_view>
#include <vector>

#include "sbc/world.h"

namespace sbc {

namespace material {
inline constexpr uint16_t kSteel = 0;     // lattice nodes
inline constexpr uint16_t kConcrete = 1;  // ground, walls
inline constexpr uint16_t kRubber = 2;    // tyre tread
inline constexpr uint16_t kAsphalt = 3;   // road surface (§11.1: new dry asphalt µ ≈ 1.0, Crr ≈ 0.012)
inline constexpr uint16_t kSpikes = 4;    // spike strip / sharp debris: punctures the tyres that roll over it (§6)
}  // namespace material

// Contact laws used by every reference scene (M0 placeholders until §11 surfaces land in M3).
void applyDefaultContactPairs(World& world);

struct SceneOptions {
  int threads = 1;
  bool trackEnergy = false;
  int bodies = 16;  // "pile" only
};

// Returns nullptr for unknown names.
std::unique_ptr<World> makeScene(const std::string& name, const SceneOptions& options = {});
// Golden vehicle crash (§23.1 native == WASM with everything a car brings: tyres, drivetrain, aero and wake,
// contacts, damage): two copies of the vehicle head-on at 64 km/h each, 0.4 m offset, in neutral, on the "crash"
// ground. tests/golden/golden_crash_pair.txt holds its hashes (sbc-cli golden crash_pair --vehicle <json>).
std::unique_ptr<World> makeCrashGolden(std::string_view vehicleJson, const SceneOptions& options = {});
std::vector<std::string> sceneNames();

}  // namespace sbc

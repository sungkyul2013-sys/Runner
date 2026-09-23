// SoftBodyCore — named reference scenes shared by tests, the CLI, benchmarks and golden hashes.
// Scene contents are part of the golden-hash contract: changing one requires regenerating
// tests/golden/*.json (§2.8) and noting why in CHANGELOG.md.
#pragma once

#include <memory>
#include <string>
#include <vector>

#include "sbc/world.h"

namespace sbc {

namespace material {
inline constexpr uint16_t kSteel = 0;     // lattice nodes
inline constexpr uint16_t kConcrete = 1;  // ground, walls
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
std::vector<std::string> sceneNames();

}  // namespace sbc

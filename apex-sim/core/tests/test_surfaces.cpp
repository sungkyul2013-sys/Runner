// §11.1 surface library (surfaces.json embedded in the core), tyre types, decals.
#include <catch2/catch_test_macros.hpp>
#include <cmath>

#include "sbc/scenes.h"
#include "sbc/surfaces.h"
#include "sbc/world.h"

using namespace sbc;

TEST_CASE("the embedded surface library holds the §11.1 table in material order", "[surfaces][11.1]") {
  const SurfaceLibrary& lib = defaultSurfaces();
  REQUIRE(static_cast<int>(lib.surfaces.size()) >= builtinSurfaceCount());
  for (int m = 0; m < builtinSurfaceCount(); ++m) {
    INFO("material " << m);
    CHECK(lib.surfaces[static_cast<size_t>(m)].id == builtinSurfaceName(static_cast<uint16_t>(m)));
    CHECK(lib.surfaces[static_cast<size_t>(m)].material == m);
  }
  CHECK(lib.material("gravel") == material::kGravel);
  CHECK(lib.material("oil") == material::kOil);
  // Ranges of the §11.1 table (reference summer tyre).
  const auto& s = lib.surfaces;
  CHECK((s[material::kAsphalt].mu >= 0.9f && s[material::kAsphalt].mu <= 1.1f));
  CHECK((s[material::kGravel].mu >= 0.5f && s[material::kGravel].mu <= 0.65f));
  CHECK((s[material::kIce].mu >= 0.05f && s[material::kIce].mu <= 0.15f));
  CHECK((s[material::kSand].crr >= 0.1f && s[material::kSand].crr <= 0.3f));
  CHECK(s[material::kSand].layer.depth > 0.0f);
}

TEST_CASE("tyre types scale the grip by surface category", "[surfaces][6]") {
  World w;
  applyDefaultContactPairs(w);
  CHECK(w.tyreGrip(material::kAsphalt, TyreType::kSummer) == 1.0f);
  CHECK(w.tyreGrip(material::kSnowPacked, TyreType::kWinter) > 1.4f * w.tyreGrip(material::kSnowPacked, TyreType::kSummer));
  CHECK(w.tyreGrip(material::kIce, TyreType::kStudded) > w.tyreGrip(material::kIce, TyreType::kWinter));
  CHECK(w.tyreGrip(material::kAsphaltWet, TyreType::kSlick) < 0.6f);
  CHECK(w.tyreGrip(material::kMud, TyreType::kOffroadMT) > 1.4f);
  CHECK(w.tyreCrr(material::kAsphalt, TyreType::kOffroadMT) > 1.0f);
  CHECK(tyreTypeFromName("winter") == TyreType::kWinter);
  CHECK(tyreTypeName(TyreType::kSlickWet) == "slick_wet");
}

TEST_CASE("a surface decal changes the material under it", "[surfaces][11.1]") {
  World w;
  SurfaceDecal lane;
  lane.center = {10.0, 0.0, 0.0};
  lane.halfX = 1.0;
  lane.halfZ = 20.0;
  lane.material = material::kIce;
  const int id = w.addSurfaceDecal(lane);
  CHECK(w.surfaceMaterialAt({10.5, 0.0, 5.0}, material::kAsphalt) == material::kIce);
  CHECK(w.surfaceMaterialAt({12.5, 0.0, 5.0}, material::kAsphalt) == material::kAsphalt);
  CHECK(w.surfaceMaterialAt({10.5, 3.0, 5.0}, material::kAsphalt) == material::kAsphalt);  // a deck above it
  SurfaceDecal spill;
  spill.center = {10.0, 0.0, 5.0};
  spill.radius = 0.5;
  spill.material = material::kOil;
  w.addSurfaceDecal(spill);
  CHECK(w.surfaceMaterialAt({10.2, 0.0, 5.2}, material::kAsphalt) == material::kOil);  // the latest wins
  w.removeSurfaceDecal(id);
  CHECK(w.surfaceMaterialAt({10.5, 0.0, 15.0}, material::kAsphalt) == material::kAsphalt);
}

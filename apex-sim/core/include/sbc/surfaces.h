// Surface library (§11.1, docs/SURFACE_FORMAT.md): the road materials with their friction, rolling resistance,
// micro-roughness and loose layer, and the tyre types' grip on each kind of surface. The data lives in
// web/public/data/surfaces/surfaces.json; the core embeds that file at build time (defaultSurfaces()), so native,
// WASM and the browser run on the same numbers.
#pragma once

#include <array>
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

#include "sbc/vehicle.h"

namespace sbc {

class World;

// Micro-roughness (§11.4, KICKOFF C6): a deterministic height function of the world position, shared by physics
// and rendering. kIso8608: random road of an ISO 8608 class (A best … H worst); kCobble: rounded stones on a grid
// with gaps; kJoints: transverse slab joints; kWashboard: corrugation across the direction of travel.
enum class RoughnessKind : uint8_t { kNone, kIso8608, kCobble, kJoints, kWashboard };

struct RoughnessParams {
  RoughnessKind kind = RoughnessKind::kNone;
  int isoClass = 0;          // kIso8608: 0 = A … 7 = H
  float size = 0.12f;        // kCobble: stone pitch [m]
  float gap = 0.015f;        // kCobble: joint width [m]
  float depth = 0.01f;       // kCobble / kJoints: joint depth [m]
  float spacing = 5.0f;      // kJoints: slab length [m]
  float width = 0.012f;      // kJoints: joint width [m]
  float wavelength = 0.75f;  // kWashboard [m]
  float amplitude = 0.02f;   // kWashboard: peak height [m]
};

// Loose layer on the hard ground (§11.2 gravel, mud, sand, snow): the tyre sinks into it (Bekker pressure–sinkage
// p = (kc/b + kφ)·zⁿ) and bulldozes it.
struct LayerParams {
  float depth = 0.0f;       // [m] 0: no loose layer
  float kc = 0.0f;          // cohesive modulus [N/m^(n+1)]
  float kphi = 0.0f;        // frictional modulus [N/m^(n+2)]
  float n = 1.0f;           // sinkage exponent [-]
  float bulldozing = 0.0f;  // bulldozing resistance scale [-]
};

enum class SurfaceCategory : uint8_t { kDry, kWet, kLoose, kMud, kSand, kSnow, kIce, kOil };
inline constexpr int kSurfaceCategoryCount = 8;

struct SurfaceParams {
  std::string id;
  uint16_t material = 0;
  SurfaceCategory category = SurfaceCategory::kDry;
  float mu = 1.0f;          // peak friction of the reference (summer) tyre [-]
  float muSlide = 0.8f;     // locked-wheel / plain-node sliding friction [-]
  float crr = 0.012f;       // rolling resistance of the reference tyre [-]
  float steelStatic = 0.6f, steelKinetic = 0.45f;  // bare metal on it [-]
  RoughnessParams roughness;
  LayerParams layer;
  float water = 0.0f;       // [m] standing water film (hydroplaning, §6)
  float sticky = 0.0f;      // [-] adhesion of mud to the tyre
};

struct TyreTypeParams {
  std::string id;
  std::array<float, kSurfaceCategoryCount> grip{};  // factor on the surface's µ by category
  float crr = 1.0f;                                 // factor on the rolling resistance
};

struct SurfaceLibrary {
  std::vector<SurfaceParams> surfaces;     // indexed by material id
  std::vector<TyreTypeParams> tyreTypes;   // indexed by TyreType
  // Material id of a surface name (throws for an unknown name).
  uint16_t material(std::string_view id) const;
};

// Material ids of the built-in surfaces, in the order of surfaces.json (scenes.h material:: is the same list).
std::string_view builtinSurfaceName(uint16_t material);
int builtinSurfaceCount();

SurfaceLibrary loadSurfacesJson(std::string_view text);
// The embedded web/public/data/surfaces/surfaces.json, parsed once.
const SurfaceLibrary& defaultSurfaces();
// Contact laws of rubber (tyres) and steel (bodies, rims) on every surface, and the tyre types' grip factors.
void applySurfaces(World& world, const SurfaceLibrary& library);

// Tyre type by name ("summer", "winter", …); throws for an unknown name.
TyreType tyreTypeFromName(std::string_view name);
std::string_view tyreTypeName(TyreType type);

// Micro-roughness height [m] (above the nominal surface) and its gradient ∂h/∂x, ∂h/∂z at world (x, z).
struct RoughnessSample {
  double height = 0.0, dx = 0.0, dz = 0.0;
};
RoughnessSample sampleRoughness(const RoughnessParams& r, uint16_t material, double x, double z);

}  // namespace sbc

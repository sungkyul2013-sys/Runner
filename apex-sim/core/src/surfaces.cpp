#include "sbc/surfaces.h"

#include <yyjson.h>

#include <algorithm>
#include <cmath>
#include <memory>
#include <stdexcept>

#include "sbc/det_math.h"
#include "sbc/scenes.h"
#include "sbc/world.h"

namespace sbc {

extern const char* const kEmbeddedSurfacesJson;  // surfaces_data.cpp (generated from surfaces.json)

namespace {

using Val = yyjson_val*;

[[noreturn]] void fail(const std::string& path, const std::string& what) {
  throw std::runtime_error("surfaces json " + path + ": " + what);
}
Val member(Val obj, const char* key) { return obj && yyjson_is_obj(obj) ? yyjson_obj_get(obj, key) : nullptr; }
double number(Val v, const std::string& path) {
  if (!v || !yyjson_is_num(v)) fail(path, "expected a number");
  return yyjson_get_num(v);
}
float floatOr(Val obj, const char* key, float fallback, const std::string& path) {
  const Val v = member(obj, key);
  return v ? static_cast<float>(number(v, path + "." + key)) : fallback;
}
std::string string(Val v, const std::string& path) {
  if (!v || !yyjson_is_str(v)) fail(path, "expected a string");
  return yyjson_get_str(v);
}

constexpr std::string_view kBuiltin[] = {
    "steel",       "concrete", "rubber",     "asphalt",         "spikes",  "asphalt_old", "asphalt_wet",
    "cobblestone", "cobblestone_wet",        "gravel",          "gravel_trap", "gravel_washboard", "dirt",
    "mud",         "sand",     "grass",      "grass_wet",       "snow_packed", "snow_fresh", "ice",
    "steel_plate", "steel_plate_wet",        "wood",            "paint",   "paint_wet",   "oil"};
constexpr int kBuiltinCount = static_cast<int>(std::size(kBuiltin));

constexpr std::string_view kCategories[kSurfaceCategoryCount] = {"dry", "wet", "loose", "mud", "sand", "snow", "ice", "oil"};
constexpr std::string_view kTyreTypes[kTyreTypeCount] = {"summer",    "all_season", "winter",     "studded",   "semi_slick",
                                                         "slick",     "slick_wet",  "offroad_at", "offroad_mt", "drag"};

// The discrete tread and carcass add their own rolling loss (≈ 0.0023 of the load at 25 m/s, KNOWN_ISSUES P10), so a
// tyre–surface pair's explicit Crr is the §11.1 figure less that.
constexpr double kTreadRollingLoss = 0.0023;

RoughnessParams roughness(Val v, const std::string& path) {
  RoughnessParams r;
  if (!v) return r;
  const std::string kind = string(member(v, "kind"), path + ".kind");
  if (kind == "iso8608") {
    r.kind = RoughnessKind::kIso8608;
    const std::string c = string(member(v, "class"), path + ".class");
    if (c.size() != 1 || c[0] < 'A' || c[0] > 'H') fail(path + ".class", "expected A … H");
    r.isoClass = c[0] - 'A';
  } else if (kind == "cobble") {
    r.kind = RoughnessKind::kCobble;
    r.size = floatOr(v, "size", r.size, path);
    r.gap = floatOr(v, "gap", r.gap, path);
    r.depth = floatOr(v, "depth", r.depth, path);
  } else if (kind == "joints") {
    r.kind = RoughnessKind::kJoints;
    r.spacing = floatOr(v, "spacing", r.spacing, path);
    r.depth = floatOr(v, "depth", r.depth, path);
    r.width = floatOr(v, "width", r.width, path);
  } else if (kind == "washboard") {
    r.kind = RoughnessKind::kWashboard;
    r.wavelength = floatOr(v, "wavelength", r.wavelength, path);
    r.amplitude = floatOr(v, "amplitude", r.amplitude, path);
  } else {
    fail(path + ".kind", "unknown roughness '" + kind + "'");
  }
  return r;
}

}  // namespace

std::string_view builtinSurfaceName(uint16_t material) {
  return material < kBuiltinCount ? kBuiltin[material] : std::string_view{};
}
int builtinSurfaceCount() { return kBuiltinCount; }

uint16_t SurfaceLibrary::material(std::string_view id) const {
  for (const SurfaceParams& s : surfaces)
    if (s.id == id) return s.material;
  throw std::runtime_error("unknown surface '" + std::string(id) + "'");
}

TyreType tyreTypeFromName(std::string_view name) {
  for (int t = 0; t < kTyreTypeCount; ++t)
    if (kTyreTypes[t] == name) return static_cast<TyreType>(t);
  throw std::runtime_error("unknown tyre type '" + std::string(name) + "'");
}
std::string_view tyreTypeName(TyreType type) { return kTyreTypes[static_cast<int>(type)]; }

SurfaceLibrary loadSurfacesJson(std::string_view text) {
  const yyjson_read_flag flags = YYJSON_READ_ALLOW_COMMENTS | YYJSON_READ_ALLOW_TRAILING_COMMAS;
  yyjson_read_err err;
  std::unique_ptr<yyjson_doc, decltype(&yyjson_doc_free)> doc(
      yyjson_read_opts(const_cast<char*>(text.data()), text.size(), flags, nullptr, &err), yyjson_doc_free);
  if (!doc) fail("$", std::string("parse error: ") + err.msg + " at byte " + std::to_string(err.pos));
  const Val root = yyjson_doc_get_root(doc.get());
  if (string(member(root, "format"), "format") != "apex-surfaces") fail("format", "expected \"apex-surfaces\"");
  SurfaceLibrary lib;
  const Val list = member(root, "surfaces");
  if (!list || !yyjson_is_arr(list)) fail("surfaces", "expected an array");
  size_t i, n;
  Val item;
  int next = kBuiltinCount;
  yyjson_arr_foreach(list, i, n, item) {
    const std::string path = "surfaces[" + std::to_string(i) + "]";
    SurfaceParams s;
    s.id = string(member(item, "id"), path + ".id");
    const auto builtin = std::find(std::begin(kBuiltin), std::end(kBuiltin), s.id);
    const int material = builtin != std::end(kBuiltin) ? static_cast<int>(builtin - std::begin(kBuiltin)) : next++;
    if (material >= kMaxMaterials) fail(path, "too many surfaces");
    s.material = static_cast<uint16_t>(material);
    const std::string category = string(member(item, "category"), path + ".category");
    const auto c = std::find(std::begin(kCategories), std::end(kCategories), category);
    if (c == std::end(kCategories)) fail(path + ".category", "unknown category '" + category + "'");
    s.category = static_cast<SurfaceCategory>(c - std::begin(kCategories));
    s.mu = floatOr(item, "mu", s.mu, path);
    s.muSlide = floatOr(item, "muSlide", s.muSlide, path);
    s.crr = floatOr(item, "crr", s.crr, path);
    if (const Val st = member(item, "steel")) {
      if (!yyjson_is_arr(st) || yyjson_arr_size(st) != 2) fail(path + ".steel", "expected [µs, µk]");
      s.steelStatic = static_cast<float>(number(yyjson_arr_get(st, 0), path + ".steel[0]"));
      s.steelKinetic = static_cast<float>(number(yyjson_arr_get(st, 1), path + ".steel[1]"));
    }
    s.roughness = roughness(member(item, "roughness"), path + ".roughness");
    if (const Val l = member(item, "layer")) {
      s.layer.depth = floatOr(l, "depth", 0.0f, path + ".layer");
      s.layer.kc = floatOr(l, "kc", 0.0f, path + ".layer");
      s.layer.kphi = floatOr(l, "kphi", 0.0f, path + ".layer");
      s.layer.n = floatOr(l, "n", 1.0f, path + ".layer");
      s.layer.bulldozing = floatOr(l, "bulldozing", 0.0f, path + ".layer");
    }
    s.water = floatOr(item, "water", 0.0f, path);
    s.sticky = floatOr(item, "sticky", 0.0f, path);
    if (!(s.mu > 0.0f && s.muSlide > 0.0f && s.muSlide <= s.mu && s.crr >= 0.0f)) fail(path, "need 0 < muSlide ≤ mu, crr ≥ 0");
    if (lib.surfaces.size() <= s.material) lib.surfaces.resize(s.material + size_t{1});
    if (!lib.surfaces[s.material].id.empty()) fail(path, "duplicate surface '" + s.id + "'");
    lib.surfaces[s.material] = s;
  }
  for (int m = 0; m < kBuiltinCount; ++m)
    if (m >= static_cast<int>(lib.surfaces.size()) || lib.surfaces[static_cast<size_t>(m)].id.empty())
      fail("surfaces", "missing built-in surface '" + std::string(kBuiltin[m]) + "'");
  const Val types = member(root, "tyreTypes");
  lib.tyreTypes.resize(kTyreTypeCount);
  for (int t = 0; t < kTyreTypeCount; ++t) {
    const std::string path = "tyreTypes." + std::string(kTyreTypes[t]);
    const Val v = member(types, std::string(kTyreTypes[t]).c_str());
    if (!v) fail(path, "missing");
    TyreTypeParams& p = lib.tyreTypes[static_cast<size_t>(t)];
    p.id = std::string(kTyreTypes[t]);
    for (int c = 0; c < kSurfaceCategoryCount; ++c) p.grip[static_cast<size_t>(c)] = floatOr(v, std::string(kCategories[c]).c_str(), 1.0f, path);
    p.crr = floatOr(v, "crr", 1.0f, path);
  }
  return lib;
}

const SurfaceLibrary& defaultSurfaces() {
  static const SurfaceLibrary lib = loadSurfacesJson(kEmbeddedSurfacesJson);
  return lib;
}

void applySurfaces(World& w, const SurfaceLibrary& lib) {
  // Metal first, tyres last: rubber is itself a surface, and a tread node on steel (another car's body) must keep the
  // tyre law, not steel-on-rubber.
  for (const SurfaceParams& s : lib.surfaces) {
    if (s.id.empty()) continue;
    ContactPairParams metal;  // steel bodies, rims
    metal.staticFriction = s.steelStatic;
    metal.kineticFriction = s.steelKinetic;
    w.setContactPair(material::kSteel, s.material, metal);
  }
  for (const SurfaceParams& s : lib.surfaces) {
    if (s.id.empty()) continue;
    // Tyre tread on the surface (§6 hybrid tyre). For kTread nodes only the normal law, staticFriction (the surface
    // µ scale of the tyre model), rollingResistance and treadShare are used; kineticFriction is the plain-node slide.
    // The contact spring is the tyre's local contact rate; a tenth of it acts on the tread node (carcass
    // deformation), the rest of the load is carried by the tyre's radial spring on the hub (A§4.7).
    ContactPairParams tyre;
    tyre.staticFriction = s.mu;
    tyre.kineticFriction = s.muSlide;
    tyre.normalFrequencyHz = 110.0f;
    tyre.normalDampingRatio = 0.05f;
    tyre.rollingResistance = static_cast<float>(std::max(0.0, static_cast<double>(s.crr) - kTreadRollingLoss));
    tyre.treadShare = 0.1f;
    w.setContactPair(material::kRubber, s.material, tyre);
    for (int t = 0; t < kTyreTypeCount; ++t) {
      const TyreTypeParams& p = lib.tyreTypes[static_cast<size_t>(t)];
      w.setTyreFactors(s.material, static_cast<TyreType>(t), p.grip[static_cast<size_t>(s.category)], p.crr);
    }
  }
  w.setSurfaces(lib);
}

// ---- micro-roughness ---------------------------------------------------------------------------------------------

namespace {

// SplitMix64 → [0, 1): deterministic pseudo-random numbers from integers.
double hash01(uint64_t x) {
  x += 0x9E3779B97F4A7C15ull;
  x = (x ^ (x >> 30)) * 0xBF58476D1CE4E5B9ull;
  x = (x ^ (x >> 27)) * 0x94D049BB133111EBull;
  return static_cast<double>((x ^ (x >> 31)) >> 11) * (1.0 / 9007199254740992.0);
}

constexpr double kPi = 3.14159265358979323846;

// Smooth step 3t² − 2t³ on [0, 1] and its derivative.
void smooth(double t, double& s, double& ds) {
  if (t <= 0.0) { s = 0.0; ds = 0.0; return; }
  if (t >= 1.0) { s = 1.0; ds = 0.0; return; }
  s = t * t * (3.0 - 2.0 * t);
  ds = 6.0 * t * (1.0 - t);
}

// A groove of `depth` and `width` centred on every multiple of `period` along coordinate u: height and dh/du.
void grooves(double u, double period, double width, double depth, double& h, double& dh) {
  const double k = std::floor(u / period + 0.5);
  const double d = u - k * period;  // signed distance to the nearest groove centre
  const double half = 0.5 * width;
  double s, ds;
  smooth(std::fabs(d) / half, s, ds);
  h = -depth * (1.0 - s);
  dh = depth * ds / half * (d < 0.0 ? -1.0 : 1.0);
}

}  // namespace

RoughnessSample sampleRoughness(const RoughnessParams& r, uint16_t material, double x, double z) {
  RoughnessSample out;
  switch (r.kind) {
    case RoughnessKind::kNone: break;
    case RoughnessKind::kIso8608: {
      // ISO 8608: displacement PSD G(n) = G(n0)·(n/n0)^-2, n0 = 0.1 cycle/m, G(n0) = 16e-6 m³ for class A and ×4 per
      // class. 20 components log-spaced over 0.1 … 10 cycle/m (10 m … 0.1 m waves; longer waves are the road's
      // geometry), each with amplitude √(2·G(n)·Δn), a pseudo-random heading and phase: an isotropic random surface.
      constexpr int kComponents = 20;
      constexpr double n0 = 0.1, nLo = 0.1, nHi = 10.0;
      const double g0 = 16e-6 * std::ldexp(1.0, 2 * r.isoClass);
      const double logStep = det::log(nHi / nLo) / kComponents;
      for (int k = 0; k < kComponents; ++k) {
        const double a = nLo * det::exp(logStep * k), b = nLo * det::exp(logStep * (k + 1)), nk = std::sqrt(a * b);
        const double amp = std::sqrt(2.0 * g0 * (n0 / nk) * (n0 / nk) * (b - a));
        const uint64_t seed = (static_cast<uint64_t>(material) << 32) ^ static_cast<uint64_t>(k) * 0x51ED27u;
        const double heading = 2.0 * kPi * hash01(seed), phase = 2.0 * kPi * hash01(seed ^ 0xABCDEFu);
        const double cx = det::cos(heading), cz = det::sin(heading);
        const double w = 2.0 * kPi * nk;
        const double arg = w * (x * cx + z * cz) + phase;
        const double c = det::cos(arg);
        out.height += amp * det::sin(arg);
        out.dx += amp * w * cx * c;
        out.dz += amp * w * cz * c;
      }
      break;
    }
    case RoughnessKind::kCobble: {
      // Stones of pitch `size`, every other row shifted half a stone; each stone's top is 0 … +2 mm (per stone),
      // the joints between them `depth` deep, rounded over `gap`.
      const double s = r.size;
      const double row = std::floor(z / s);
      const double shift = (static_cast<int64_t>(row) & 1) ? 0.5 * s : 0.0;
      const double col = std::floor((x + shift) / s);
      const double stone = 0.002 * hash01((static_cast<uint64_t>(static_cast<int64_t>(row)) << 32) ^
                                          static_cast<uint64_t>(static_cast<int64_t>(col)) ^ (uint64_t{material} << 48));
      double hx, dhx, hz, dhz;
      grooves(x + shift, s, r.gap, r.depth, hx, dhx);  // joints on the stones' edges
      grooves(z, s, r.gap, r.depth, hz, dhz);
      // The deeper of the two joints (min of heights, smoothly: both grooves are 0 away from a joint).
      const double joint = hx + hz - (hx * hz) / (-r.depth);  // union of two grooves, ≥ −depth
      const double djx = dhx * (1.0 + hz / r.depth), djz = dhz * (1.0 + hx / r.depth);
      const double inside = 1.0 + joint / r.depth;  // 1 on a stone's face, 0 in a joint
      out.height = joint + stone * inside;
      out.dx = djx * (1.0 + stone / r.depth);
      out.dz = djz * (1.0 + stone / r.depth);
      break;
    }
    case RoughnessKind::kJoints: {
      double hx, dhx, hz, dhz;
      grooves(x, r.spacing, r.width, r.depth, hx, dhx);
      grooves(z, r.spacing, r.width, r.depth, hz, dhz);
      out.height = hx + hz - (hx * hz) / (-r.depth);
      out.dx = dhx * (1.0 + hz / r.depth);
      out.dz = dhz * (1.0 + hx / r.depth);
      break;
    }
    case RoughnessKind::kWashboard: {
      // Corrugation across +Z (the lane's direction of travel), from 0 to 2·amplitude.
      const double w = 2.0 * kPi / r.wavelength;
      out.height = r.amplitude * (1.0 + det::sin(w * z));
      out.dz = r.amplitude * w * det::cos(w * z);
      break;
    }
  }
  return out;
}

}  // namespace sbc

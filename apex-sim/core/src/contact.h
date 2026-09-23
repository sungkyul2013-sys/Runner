// SoftBodyCore — contact solver internals (§5.2). Not part of the public API.
#pragma once

#include <cstdint>
#include <vector>

#include "sbc/body.h"
#include "sbc/math.h"

namespace sbc {

class World;
inline constexpr int32_t kPlaneIdBase = 0x40000000;  // surface ids ≥ this are ground planes

// Static triangle transformed into one body's local frame for the current step.
struct LocalTri {
  Vec3 v0, v1, v2, normal, boundsMin, boundsMax;
  int32_t id;
  uint16_t material;
};

struct LocalPlane {
  float height;  // y of the surface in the body's local frame
  int32_t id;
  uint16_t material;
};

// Per-body candidate lists, rebuilt every step (the body is processed by one thread at a time).
struct ContactScratch {
  std::vector<LocalTri> tris;
  std::vector<LocalPlane> planes;
};

struct ContactSolver {
  // Static triangles/planes within reach of the body this step, in its local coordinates.
  static void gatherStaticCandidates(const World& world, const Body& body, ContactScratch& scratch);
  // Gathers static geometry near the body and applies penalty + friction forces.
  template <bool kTrack>
  static int staticContacts(World& world, int bodyIndex);
  // After integration: clamps nodes whose centre crossed a static surface during the step.
  static int ccdStatic(World& world, int bodyIndex);
  // Node–node contacts between different bodies (serial phase, deterministic pair order).
  template <bool kTrack>
  static int bodyContacts(World& world);
  // Σ ½k_n·p² over all active penalty springs of the current state [J].
  static double contactPotential(const World& world);
};

}  // namespace sbc

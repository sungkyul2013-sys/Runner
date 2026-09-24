// SoftBodyCore — contact solver internals (§5.2). Not part of the public API.
#pragma once

#include <algorithm>
#include <cstdint>
#include <vector>

#include "sbc/body.h"
#include "sbc/world.h"
#include "sbc/math.h"

namespace sbc {

class World;
inline constexpr int32_t kPlaneIdBase = 0x40000000;  // surface ids ≥ this are ground planes

// Closest point on triangle abc to p (Ericson, Real-Time Collision Detection, §5.1.5).
inline Vec3 closestPointOnTriangle(Vec3 p, Vec3 a, Vec3 b, Vec3 c, bool& interior) {
  interior = false;
  const Vec3 ab = b - a, ac = c - a, ap = p - a;
  const float d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0.0f && d2 <= 0.0f) return a;
  const Vec3 bp = p - b;
  const float d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0.0f && d4 <= d3) return b;
  const float vc = d1 * d4 - d3 * d2;
  if (vc <= 0.0f && d1 >= 0.0f && d3 <= 0.0f) return a + ab * (d1 / (d1 - d3));
  const Vec3 cp = p - c;
  const float d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0.0f && d5 <= d6) return c;
  const float vb = d5 * d2 - d1 * d6;
  if (vb <= 0.0f && d2 >= 0.0f && d6 <= 0.0f) return a + ac * (d2 / (d2 - d6));
  const float va = d3 * d6 - d5 * d4;
  if (va <= 0.0f && (d4 - d3) >= 0.0f && (d5 - d6) >= 0.0f) {
    return b + (c - b) * ((d4 - d3) / ((d4 - d3) + (d5 - d6)));
  }
  interior = true;
  const float denom = 1.0f / (va + vb + vc);
  return a + ab * (vb * denom) + ac * (vc * denom);
}

// Closest points of segments p0–p1 and q0–q1 (Ericson, Real-Time Collision Detection, §5.1.9): parameters s, t in
// [0, 1]. Returns false for (near-)parallel segments, whose closest pair is not unique.
inline bool closestSegmentSegment(Vec3 p0, Vec3 p1, Vec3 q0, Vec3 q1, float& s, float& t) {
  const Vec3 d1 = p1 - p0, d2 = q1 - q0, r = p0 - q0;
  const float a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  if (!(a > 1e-12f) || !(e > 1e-12f)) return false;
  const float c = dot(d1, r), b = dot(d1, d2);
  const float denom = a * e - b * b;
  if (!(denom > 1e-6f * a * e)) return false;
  s = std::clamp((b * f - c * e) / denom, 0.0f, 1.0f);
  t = (b * s + f) / e;
  if (t < 0.0f) { t = 0.0f; s = std::clamp(-c / a, 0.0f, 1.0f); }
  else if (t > 1.0f) { t = 1.0f; s = std::clamp((b - c) / a, 0.0f, 1.0f); }
  return true;
}

// Barycentric weights (u, v, w) of p's projection onto the plane of triangle abc (p ≈ u·a + v·b + w·c).
inline Vec3 barycentric(Vec3 p, Vec3 a, Vec3 b, Vec3 c) {
  const Vec3 v0 = b - a, v1 = c - a, v2 = p - a;
  const float d00 = dot(v0, v0), d01 = dot(v0, v1), d11 = dot(v1, v1), d20 = dot(v2, v0), d21 = dot(v2, v1);
  const float denom = d00 * d11 - d01 * d01;
  if (!(denom > 0.0f)) return {1.0f, 0.0f, 0.0f};
  const float v = (d11 * d20 - d01 * d21) / denom, w = (d00 * d21 - d01 * d20) / denom;
  return {1.0f - v - w, v, w};
}

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

// A contact point on one side: up to three nodes with weights (node: 1 × 1, edge: 2, triangle face: 3).
struct Side {
  int32_t node[3];
  float w[3];
  int count;
  Vec3 velocity(const Body& b) const {
    Vec3 v{};
    for (int k = 0; k < count; ++k) v += b.nodeVelocity(node[k]) * w[k];
    return v;
  }
  float inverseMass(const Body& b) const {
    float s = 0.0f;
    for (int k = 0; k < count; ++k) s += w[k] * w[k] * b.invMass[node[k]];
    return s;
  }
  // Weight-linear inverse mass Σ w·(1/m) ≥ Σ w²·(1/m): the same for every point of a triangle (or edge) whose nodes
  // weigh the same, so a spring scaled with it keeps its stiffness while its contact point slides.
  float stiffnessInverseMass(const Body& b) const {
    float s = 0.0f;
    for (int k = 0; k < count; ++k) s += w[k] * b.invMass[node[k]];
    return s;
  }
  uint16_t material(const Body& b) const {
    int best = 0;
    for (int k = 1; k < count; ++k) if (w[k] > w[best]) best = k;
    return b.material[node[best]];
  }
};

// One contact of the current step: point P (side a of body `bodyA`) against point Q (side b of body `bodyB`), normal
// n from B's surface toward A, penetration p, and the mass m its spring and damper are scaled with.
struct ContactRecord {
  int32_t bodyA, bodyB;
  Side a, b;
  Vec3 n;
  float p;
  float m;
};

// Collision triangles of one body in its own frame for the current step: unit normals and vertex boxes, computed
// on first use (most triangles are far from any contact in most steps).
struct SurfaceCache {
  std::vector<Vec3> normal, lo, hi;
  std::vector<uint32_t> stamp;
  uint32_t current = 1;
  // Starts a new step: every entry becomes stale.
  void reset(size_t triangles) {
    if (stamp.size() != triangles) {
      normal.assign(triangles, {});
      lo.assign(triangles, {});
      hi.assign(triangles, {});
      stamp.assign(triangles, 0);
    }
    if (++current == 0) {
      std::fill(stamp.begin(), stamp.end(), 0u);
      current = 1;
    }
  }
  void ensure(const Body& b, int t) {
    if (stamp[static_cast<size_t>(t)] == current) return;
    stamp[static_cast<size_t>(t)] = current;
    const int32_t* v = &b.triNode[static_cast<size_t>(t) * 3];
    const Vec3 p0 = b.nodePosition(v[0]), p1 = b.nodePosition(v[1]), p2 = b.nodePosition(v[2]);
    const Vec3 cr = cross(p1 - p0, p2 - p0);
    const float len = std::sqrt(dot(cr, cr));
    normal[static_cast<size_t>(t)] = len > 1e-12f ? cr * (1.0f / len) : Vec3{0.0f, 1.0f, 0.0f};
    lo[static_cast<size_t>(t)] = {std::min({p0.x, p1.x, p2.x}), std::min({p0.y, p1.y, p2.y}), std::min({p0.z, p1.z, p2.z})};
    hi[static_cast<size_t>(t)] = {std::max({p0.x, p1.x, p2.x}), std::max({p0.y, p1.y, p2.y}), std::max({p0.z, p1.z, p2.z})};
  }
};

// Self-collision candidate triangles of group h for the nodes of group g, kept over steps while the geometry allows
// (a Verlet list): valid as long as g's node box (relative to its centroid) and every node of h (relative to g's
// centroid) have moved less than a quarter of the margin since the refresh. Triangles farther than the margin at
// the refresh can then not have come within reach, so the contacts found are exactly those of a full search.
struct SelfPairCache {
  int16_t g = -1, h = -1;
  std::vector<int32_t> tris;
  Vec3 lo, hi;             // g's node box relative to g's centroid at the refresh
  std::vector<Vec3> rel;   // nodes of h relative to g's centroid at the refresh
  std::vector<Vec3> relG;  // nodes of g relative to g's centroid at the refresh
  std::vector<std::pair<int32_t, int32_t>> pairs;  // (node of g, triangle of h) candidates, built with kSelfMargin
  bool pairsValid = false;
};

// Per-body candidate lists, rebuilt every step (the body is processed by one thread at a time).
struct ContactScratch {
  std::vector<LocalTri> tris;
  std::vector<LocalPlane> planes;
  SurfaceCache surface;                              // the body's collision triangles this step
  std::vector<std::pair<uint64_t, int32_t>> cells;   // spatial hash (cell key, item), sorted
  std::vector<int32_t> items;                        // candidate buffer
  std::vector<int32_t> staticHits;                   // static BVH query result
  std::vector<int32_t> tri;                          // candidate triangles of one pass
  std::vector<std::pair<Vec3, Vec3>> boxes;          // their inflated boxes
  std::vector<std::pair<int32_t, int32_t>> pairs;    // (node, triangle) candidates
  std::vector<std::pair<int32_t, bool>> edgeFeature; // edge sweep candidates of one body: (edge, feature edge)
  std::vector<SelfPairCache> selfCache;              // persists across steps
  std::vector<ContactRecord> records, selfRecords;  // this step's contacts (inter-body: scratch of body 0)
  std::vector<std::vector<float>> bodyLoad, selfLoad;       // per-node contact load (Σ w·m), kept zeroed
  std::vector<float> capacity;  // per node: contact load [kg] still available to self and body contacts this step
  struct StaticCorrection {
    int32_t node;
    Vec3 position, velocity;
    float kineticLoss;  // [J]
  };
  std::vector<StaticCorrection> corrections;  // this step's static CCD clamps (ccdStatic, applied by applyCcdStatic)
};

// Explicit stability of all contacts on one node (§4.2, see body_contact.cpp budgetContacts): Σ w·m_contact over its
// static, self and body contacts stays within kContactLoadBudget·m. A node's static contacts take one unit.
inline constexpr float kContactLoadBudget = 2.0f;

// Budget left for self and body contacts once a node has `staticContacts` contacts with static geometry.
inline float contactCapacity(float mass, int staticContacts) {
  return (kContactLoadBudget - (staticContacts > 0 ? 1.0f : 0.0f)) * mass;
}

struct ContactSolver {
  // Static triangles/planes within reach of the body this step, in its local coordinates.
  static void gatherStaticCandidates(const World& world, const Body& body, ContactScratch& scratch);
  // Gathers static geometry near the body and applies penalty + friction forces.
  template <bool kTrack>
  static int staticContacts(World& world, int bodyIndex);
  // After integration: clamps nodes whose centre crossed a static surface during the step.
  static int ccdStatic(World& world, int bodyIndex);
  // Applies the clamps ccdStatic found (their kinetic energy goes to losses.ccd).
  static void applyCcdStatic(World& world, int bodyIndex);
  // Potential energy of one body's springs against static geometry (as contactPotential counts it).
  static double staticContactPotential(const World& world, int bodyIndex);
  // The same for one node of the body at `position` (body-local), against this step's static candidates.
  static double staticNodePotential(const World& world, int bodyIndex, int node, Vec3 position);
  // Contacts between different bodies (serial phase, deterministic pair order): node↔triangle and edge↔edge when
  // both bodies have a collision surface, node spheres otherwise.
  template <bool kTrack>
  static int bodyContacts(World& world);
  // Self-collision of one body: nodes of each surface group against the triangles of the other groups (§5.1).
  template <bool kTrack>
  static int selfContacts(World& world, int bodyIndex);
  // Per-step surface update of one body: tears over-stretched triangles and computes the triangle normals.
  static void updateSurface(World& world, int bodyIndex);
  // After integration: nodes whose centre crossed a moving triangle of another body during the step are put back on
  // it and lose their approaching normal velocity, with momentum-conserving corrections on both sides.
  static int ccdBodies(World& world);
  // One sweep over the body pairs; `active` (optional): only pairs with a body flagged there. Flags the bodies a
  // correction moved in `moved`.
  static int ccdPass(World& world, const std::vector<uint8_t>* active, std::vector<uint8_t>& moved);
  // Σ ½k_n·p² over all active penalty springs of the current state [J].
  // extendedBand: body springs continue behind the triangle mid-plane (only for the potential right before the
  // sweep corrections; forces and the ledger at step ends use the front-only band).
  static double contactPotential(const World& world, bool extendedBand = false);
  // `capacity`: per body and node, the contact budget left by static contacts (contactCapacity).
  static double bodyContactPotential(const World& world, bool extendedBand, std::vector<std::vector<float>>& capacity);
  static PenetrationReport measurePenetration(const World& world);
};

}  // namespace sbc

// Body ↔ body contact (§5.1, §5.2): vehicle against vehicle, detached parts, and self-collision between the surface
// groups of one body (a wheel pushed into its arch, an engine into the cabin).
//
//  • surface:     every body may carry collision triangles (a closed hull around its node lattice, tyre carcasses …).
//                 A triangle's half thickness is the mean radius of its nodes, so two surfaces touch where their node
//                 spheres would.
//  • node↔tri:    a node sphere against another body's triangle, face / edge / vertex regions (closest point, Ericson
//                 §5.1.5). The reaction goes to the triangle's nodes by barycentric weights, so linear momentum is
//                 conserved exactly and the normal force makes no spurious torque (it acts along x − q).
//  • edge↔edge:   triangle edges of two bodies passing each other between nodes (closest points of two segments,
//                 Ericson §5.1.9), reaction by segment parameters. Crossed edges are recognised from the surfaces'
//                 outward directions and pushed back the way they came.
//  • law:         the static contact law on the effective mass of the two contact points,
//                 m = 1 / (Σ w_i²/m_i + Σ w_j²/m_j): F_n = max(0, k·p − c·v_n), k = m(2πf)², c = 2ζ·m·2πf, plus
//                 regularised Coulomb friction. Mass scaling keeps every contact at the same explicit-stable frequency.
//  • CCD:         after integration, a node whose centre crossed a moving triangle's mid-plane inside the triangle
//                 (sign change of the coplanarity function f(t) = (x − a)·((b − a) × (c − a)), a cubic in t with
//                 linear motion; root by bisection) is put back on it, and the approaching normal velocity is removed
//                 by an equal and opposite impulse. Both corrections are split by inverse mass (momentum conserved);
//                 the kinetic energy removed is booked as CCD loss (§5.3).
//  • order:       body pairs in index order, nodes and triangles in index order, spatial-hash candidates sorted →
//                 deterministic for any thread count (A§4.5).
#include <algorithm>
#include <cmath>
#include <utility>

#include "contact.h"
#include "sbc/world.h"

namespace sbc {
namespace {

constexpr float kTwoPi = 6.283185307179586f;
constexpr int kMaxCandidates = 24;         // triangle contacts examined per node per body pair
constexpr int kMaxContactsPerNode = 3;     // distinct surface directions kept per node per body pair
constexpr float kSameSurfaceCos = 0.9f;    // normals within ~26° count as one surface (neighbouring triangles)
constexpr float kSlipEpsilon = 1e-6f;      // [m/s]
constexpr float kEdgeEnd = 0.05f;          // [-] edge↔edge only between the inner 90 % of both edges (the ends are
                                           // nodes, handled by node↔triangle)
constexpr float kMinCell = 0.25f;          // [m] spatial hash cell size floor
constexpr float kRegionMargin = 0.05f;     // [m] extra inflation of the pair overlap region
constexpr float kCcdSlop = 1e-4f;          // [m] a step may start this far behind a mid-plane and still be clamped
constexpr int kCcdBisections = 12;         // f(t) root to 2⁻¹² of the step
constexpr float kCcdStandoff = 1e-3f;      // [m] a swept-back node or edge ends this far in front of the surface, not
                                           // exactly on it: an edge lying exactly in another body's face plane would
                                           // leave the side of every later crossing to rounding
constexpr float kInsideTolerance = 1e-3f;  // [-] barycentric slack of the CCD inside test
constexpr float kPenetrationDepth = 0.3f;  // [m] PenetrationReport: deepest "behind the surface" still attributed to
                                           // a triangle (deeper nodes are inside the other body's volume and were
                                           // counted when they crossed)

struct Box {
  Vec3 lo{1e30f, 1e30f, 1e30f}, hi{-1e30f, -1e30f, -1e30f};
  void add(Vec3 p) {
    lo = {std::min(lo.x, p.x), std::min(lo.y, p.y), std::min(lo.z, p.z)};
    hi = {std::max(hi.x, p.x), std::max(hi.y, p.y), std::max(hi.z, p.z)};
  }
  Box inflated(float r) const { return {lo - Vec3{r, r, r}, hi + Vec3{r, r, r}}; }
  bool contains(Vec3 p) const {
    return p.x >= lo.x && p.x <= hi.x && p.y >= lo.y && p.y <= hi.y && p.z >= lo.z && p.z <= hi.z;
  }
  bool overlaps(const Box& o) const {
    return !(hi.x < o.lo.x || lo.x > o.hi.x || hi.y < o.lo.y || lo.y > o.hi.y || hi.z < o.lo.z || lo.z > o.hi.z);
  }
  bool valid() const { return lo.x <= hi.x; }
};

Box intersect(const Box& a, const Box& b) {
  return {{std::max(a.lo.x, b.lo.x), std::max(a.lo.y, b.lo.y), std::max(a.lo.z, b.lo.z)},
          {std::min(a.hi.x, b.hi.x), std::min(a.hi.y, b.hi.y), std::min(a.hi.z, b.hi.z)}};
}

// ---- spatial hash ----------------------------------------------------------------------------------------------

constexpr int64_t kCellBias = int64_t{1} << 20;  // cell coordinates packed as 3 × 21 bits
inline int32_t cellCoord(float x, float inv) { return static_cast<int32_t>(std::floor(x * inv)); }
inline uint64_t packCell(int64_t cx, int64_t cy, int64_t cz) {
  return (static_cast<uint64_t>(cx + kCellBias) << 42) | (static_cast<uint64_t>(cy + kCellBias) << 21) |
         static_cast<uint64_t>(cz + kCellBias);
}

struct Hash {
  std::vector<std::pair<uint64_t, int32_t>>& cells;
  float inv;
  void insert(const Box& box, int32_t id) {
    const int32_t x0 = cellCoord(box.lo.x, inv), x1 = cellCoord(box.hi.x, inv);
    const int32_t y0 = cellCoord(box.lo.y, inv), y1 = cellCoord(box.hi.y, inv);
    const int32_t z0 = cellCoord(box.lo.z, inv), z1 = cellCoord(box.hi.z, inv);
    for (int32_t x = x0; x <= x1; ++x)
      for (int32_t y = y0; y <= y1; ++y)
        for (int32_t z = z0; z <= z1; ++z) cells.push_back({packCell(x, y, z), id});
  }
  void finish() { std::sort(cells.begin(), cells.end()); }
  // Appends the ids stored in every cell overlapped by `box` to `out` (sorted, unique).
  void query(const Box& box, std::vector<int32_t>& out) const {
    out.clear();
    const int32_t x0 = cellCoord(box.lo.x, inv), x1 = cellCoord(box.hi.x, inv);
    const int32_t y0 = cellCoord(box.lo.y, inv), y1 = cellCoord(box.hi.y, inv);
    const int32_t z0 = cellCoord(box.lo.z, inv), z1 = cellCoord(box.hi.z, inv);
    for (int32_t x = x0; x <= x1; ++x)
      for (int32_t y = y0; y <= y1; ++y)
        for (int32_t z = z0; z <= z1; ++z) {
          const uint64_t key = packCell(x, y, z);
          auto it = std::lower_bound(cells.begin(), cells.end(), std::pair<uint64_t, int32_t>{key, INT32_MIN});
          for (; it != cells.end() && it->first == key; ++it) out.push_back(it->second);
        }
    if (x0 != x1 || y0 != y1 || z0 != z1) {
      std::sort(out.begin(), out.end());
      out.erase(std::unique(out.begin(), out.end()), out.end());
    }
  }
};

// ---- surface geometry ------------------------------------------------------------------------------------------

inline Vec3 pos(const Body& b, int i, Vec3 offset) { return b.nodePosition(i) + offset; }
inline Vec3 startPosition(const Body& b, int i, Vec3 offset) { return Vec3{b.sx[i], b.sy[i], b.sz[i]} + offset; }
inline const int32_t* triNodes(const Body& b, int t) { return &b.triNode[static_cast<size_t>(t) * 3]; }
inline float triRadius(const Body& b, int t) {
  const int32_t* n = triNodes(b, t);
  return (b.radius[n[0]] + b.radius[n[1]] + b.radius[n[2]]) * (1.0f / 3.0f);
}
inline bool edgeActive(const Body& b, int e) {
  const int t0 = b.edgeTri[static_cast<size_t>(e) * 2], t1 = b.edgeTri[static_cast<size_t>(e) * 2 + 1];
  return (t0 >= 0 && !b.triTorn[t0]) || (t1 >= 0 && !b.triTorn[t1]);
}

constexpr float kFlatCos = 0.985f;  // [-] adjacent triangles within ~10° of each other: a flat (non-feature) edge

// Feature edge: an active edge whose surface actually bends there (or ends there). A straight segment cannot cross a
// flat face's interior edge without one of its end nodes crossing the face, which the node sweeps already catch;
// treating the flat edges too made coplanar edges — a node resting on a face, its edge lying in the face — fight the
// node sweep (the side of two coplanar edges is decided by rounding).
bool featureEdge(const Body& b, int e) {
  if (!edgeActive(b, e)) return false;
  const int t0 = b.edgeTri[static_cast<size_t>(e) * 2], t1 = b.edgeTri[static_cast<size_t>(e) * 2 + 1];
  if (t0 < 0 || t1 < 0 || b.triTorn[t0] || b.triTorn[t1]) return true;
  auto normal = [&](int t) {
    const int32_t* v = &b.triNode[static_cast<size_t>(t) * 3];
    const Vec3 c = cross(b.nodePosition(v[1]) - b.nodePosition(v[0]), b.nodePosition(v[2]) - b.nodePosition(v[0]));
    return c * (1.0f / std::max(length(c), 1e-20f));
  };
  return dot(normal(t0), normal(t1)) < kFlatCos;
}
// Outward direction of an edge: Σ of its intact adjacent triangles' normals.
inline Vec3 edgeOutward(const Body& b, SurfaceCache& c, int e) {
  Vec3 o{};
  for (int k = 0; k < 2; ++k) {
    const int t = b.edgeTri[static_cast<size_t>(e) * 2 + k];
    if (t >= 0 && !b.triTorn[t]) {
      c.ensure(b, t);
      o += c.normal[t];
    }
  }
  return o;
}

float maxCollisionRadius(const Body& b) {
  float r = 0.0f;
  for (int i = 0; i < b.nodeCount(); ++i)
    if (b.flags[i] & node_flag::kCollide) r = std::max(r, b.radius[i]);
  return r;
}

Box triBox(const Body& b, int t, Vec3 offset) {
  Box box;
  const int32_t* n = triNodes(b, t);
  for (int k = 0; k < 3; ++k) box.add(pos(b, n[k], offset));
  return box;
}

// Collision-node box and largest node radius of a body in its own frame.
struct Extent {
  Box box;
  float maxRadius = 0.0f;
  float maxSpeed = 0.0f;
};
Extent bodyExtent(const Body& b) {
  Extent e;
  float v2 = 0.0f;
  for (int i = 0; i < b.nodeCount(); ++i) {
    if (!(b.flags[i] & node_flag::kCollide)) continue;
    e.box.add(b.nodePosition(i));
    e.maxRadius = std::max(e.maxRadius, b.radius[i]);
    v2 = std::max(v2, b.vx[i] * b.vx[i] + b.vy[i] * b.vy[i] + b.vz[i] * b.vz[i]);
  }
  e.maxSpeed = std::sqrt(v2);
  return e;
}

// ---- contact law -----------------------------------------------------------------------------------------------

Side nodeSide(int i) { return {{i, -1, -1}, {1.0f, 0.0f, 0.0f}, 1}; }
Side triSide(const Body& b, int t, Vec3 bary) {
  const int32_t* n = triNodes(b, t);
  return {{n[0], n[1], n[2]}, {bary.x, bary.y, bary.z}, 3};
}
Side edgeSide(const Body& b, int e, float s) {
  return {{b.edgeNode[static_cast<size_t>(e) * 2], b.edgeNode[static_cast<size_t>(e) * 2 + 1], -1},
          {1.0f - s, s, 0.0f}, 2};
}

inline void addNodeForce(Body& b, int i, Vec3 f) { b.fx[i] += f.x; b.fy[i] += f.y; b.fz[i] += f.z; }

// Effective mass of the two contact points, m = 1 / (Σ w_i²/m_i + Σ w_j²/m_j); 0 when both are anchored.
float contactMass(const Body& A, const Side& a, const Body& B, const Side& b) {
  const float inv = a.inverseMass(A) + b.inverseMass(B);
  return inv > 0.0f ? 1.0f / inv : 0.0f;
}

// Explicit stability of many contacts on one node (§4.2): each contact is stable on its own (mass-scaled penalty,
// ω·dt = 0.47 on the pair's effective mass, damping ratio 0.7), and a node may press on up to three surfaces at full
// strength, as against static geometry. But a light node that is the vertex of a triangle pressed by many heavy nodes
// (a tyre node inside a crushed nose) gathers all of their dampers: its row of the damping matrix grows past the
// explicit limit c·dt/m < 2. The contacts touching such a node are softened together so that
// Σ_contacts w·m_contact ≤ kContactLoadBudget·m for every node (w: the node's weight in the contact point).
constexpr float kContactLoadBudget = 3.0f;

template <typename BodyOf>
void budgetContacts(std::vector<ContactRecord>& recs, BodyOf&& bodyOf, std::vector<std::vector<float>>& load) {
  for (const ContactRecord& r : recs) {
    for (int k = 0; k < r.a.count; ++k) load[static_cast<size_t>(r.bodyA)][static_cast<size_t>(r.a.node[k])] += r.a.w[k] * r.m;
    for (int k = 0; k < r.b.count; ++k) load[static_cast<size_t>(r.bodyB)][static_cast<size_t>(r.b.node[k])] += r.b.w[k] * r.m;
  }
  for (ContactRecord& r : recs) {
    float scale = 1.0f;
    auto limit = [&](int body, const Side& side) {
      const Body& b = bodyOf(body);
      for (int k = 0; k < side.count; ++k) {
        const int i = side.node[k];
        const float l = load[static_cast<size_t>(body)][static_cast<size_t>(i)];
        if (b.invMass[i] > 0.0f && l > kContactLoadBudget * b.mass[i]) scale = std::min(scale, kContactLoadBudget * b.mass[i] / l);
      }
    };
    limit(r.bodyA, r.a);
    limit(r.bodyB, r.b);
    r.m *= scale;
  }
  for (const ContactRecord& r : recs) {  // reset only what was touched
    for (int k = 0; k < r.a.count; ++k) load[static_cast<size_t>(r.bodyA)][static_cast<size_t>(r.a.node[k])] = 0.0f;
    for (int k = 0; k < r.b.count; ++k) load[static_cast<size_t>(r.bodyB)][static_cast<size_t>(r.b.node[k])] = 0.0f;
  }
}

// Contact law between point P (side a of body A) and point Q (side b of body B) on mass m; `n` points from B's
// surface toward A.
template <bool kTrack>
bool applyContact(const World& w, Body& A, const Side& a, Body& B, const Side& b, Vec3 n, float penetration, float m) {
  if (!(m > 0.0f)) return false;
  const ContactPairParams& pp = w.contactPair(a.material(A), b.material(B));
  const float omega = kTwoPi * pp.normalFrequencyHz;
  const float kn = m * omega * omega;
  const float cn = 2.0f * pp.normalDampingRatio * m * omega;
  const Vec3 vrel = a.velocity(A) - b.velocity(B);
  const float vn = dot(vrel, n);
  const float spring = kn * penetration;
  const float fn = std::max(spring - cn * vn, 0.0f);
  const Vec3 vt = vrel - n * vn;
  const float speed = length(vt);
  const float ct = 2.0f * pp.tangentDampingRatio * m * kTwoPi * pp.tangentFrequencyHz;
  const Vec3 ft = speed > kSlipEpsilon ? vt * (-std::min(ct, pp.kineticFriction * fn / speed)) : Vec3{};
  const Vec3 f = n * fn + ft;
  for (int k = 0; k < a.count; ++k) addNodeForce(A, a.node[k], f * a.w[k]);
  for (int k = 0; k < b.count; ++k) addNodeForce(B, b.node[k], f * -b.w[k]);
  if constexpr (kTrack) {
    const Vec3 dn = n * (fn - spring);
    for (int k = 0; k < a.count; ++k) {
      const int i = a.node[k];
      const float s = a.w[k];
      A.fdContactX[i] += dn.x * s; A.fdContactY[i] += dn.y * s; A.fdContactZ[i] += dn.z * s;
      A.fdFrictionX[i] += ft.x * s; A.fdFrictionY[i] += ft.y * s; A.fdFrictionZ[i] += ft.z * s;
    }
    for (int k = 0; k < b.count; ++k) {
      const int i = b.node[k];
      const float s = -b.w[k];
      B.fdContactX[i] += dn.x * s; B.fdContactY[i] += dn.y * s; B.fdContactZ[i] += dn.z * s;
      B.fdFrictionX[i] += ft.x * s; B.fdFrictionY[i] += ft.y * s; B.fdFrictionZ[i] += ft.z * s;
    }
  }
  return true;
}

double contactEnergy(const World& w, const Body& A, const Side& a, const Body& B, const Side& b, float penetration,
                     float m) {
  const float omega = kTwoPi * w.contactPair(a.material(A), b.material(B)).normalFrequencyHz;
  return 0.5 * static_cast<double>(m) * omega * omega * penetration * penetration;
}

// ---- narrow phase ----------------------------------------------------------------------------------------------

struct TriHit {
  int32_t tri;
  Vec3 bary;
  Vec3 normal;
  float penetration;
};

// Node sphere (x, r) against triangle abc of half thickness rt and unit normal n. Contact exists only in front of the
// mid-plane (0 ≤ d < r + rt), so the penetration never exceeds r + rt: between bodies a node that reaches the
// mid-plane is held there by the sweep tests, and within one body (no sweep) a node arriving from behind — sliding
// sideways into a triangle's prism in a crumpled wheel arch — is not grabbed by a deep, energy-creating spring.
// `frontOnly = false` continues the spring behind the mid-plane; it is used only to measure the potential energy
// right before the sweep corrections, while a step's integration has carried nodes through (see World::stepOnce).
bool nodeTriangle(Vec3 x, float r, Vec3 a, Vec3 b, Vec3 c, Vec3 n, float rt, bool frontOnly, TriHit& hit) {
  const float reach = r + rt;
  const float d = dot(x - a, n);
  if (d >= reach || d <= -reach || (frontOnly && d < 0.0f)) return false;
  bool interior;
  const Vec3 q = closestPointOnTriangle(x, a, b, c, interior);
  Vec3 bary = barycentric(q, a, b, c);
  bary = {std::max(bary.x, 0.0f), std::max(bary.y, 0.0f), std::max(bary.z, 0.0f)};
  const float sum = bary.x + bary.y + bary.z;
  bary = bary * (1.0f / sum);
  hit.bary = bary;
  if (interior) {
    hit.normal = n;
    hit.penetration = reach - d;
    return true;
  }
  if (d <= 0.0f) return false;  // behind the plane and outside the face: a neighbour owns it
  const Vec3 diff = x - q;
  const float dist2 = dot(diff, diff);
  if (dist2 >= reach * reach) return false;
  const float dist = std::sqrt(dist2);
  hit.normal = dist > 1e-6f ? diff * (1.0f / dist) : n;
  hit.penetration = reach - dist;
  return true;
}

// Sorts hits deepest first (ties by triangle id) and keeps up to kMaxContactsPerNode distinct directions.
int selectHits(TriHit* cand, int n) {
  auto before = [](const TriHit& a, const TriHit& b) {
    return a.penetration != b.penetration ? a.penetration > b.penetration : a.tri < b.tri;
  };
  for (int i = 1; i < n; ++i) {
    const TriHit key = cand[i];
    int j = i - 1;
    while (j >= 0 && before(key, cand[j])) { cand[j + 1] = cand[j]; --j; }
    cand[j + 1] = key;
  }
  int kept = 0;
  for (int i = 0; i < n && kept < kMaxContactsPerNode; ++i) {
    bool duplicate = false;
    for (int k = 0; k < kept; ++k)
      if (dot(cand[i].normal, cand[k].normal) > kSameSurfaceCos) { duplicate = true; break; }
    if (!duplicate) cand[kept++] = cand[i];
  }
  return kept;
}

struct EdgeHit {
  float s, t;
  Vec3 normal;  // from B's edge toward A's
  float penetration;
};

// Edge p0–p1 (radius ra, outward oa) of A against edge q0–q1 (radius rb, outward ob) of B.
bool edgeEdge(Vec3 p0, Vec3 p1, float ra, Vec3 oa, Vec3 q0, Vec3 q1, float rb, Vec3 ob, EdgeHit& hit) {
  float s, t;
  if (!closestSegmentSegment(p0, p1, q0, q1, s, t)) return false;
  if (s < kEdgeEnd || s > 1.0f - kEdgeEnd || t < kEdgeEnd || t > 1.0f - kEdgeEnd) return false;
  const Vec3 d = (p0 + (p1 - p0) * s) - (q0 + (q1 - q0) * t);
  const float reach = ra + rb;
  const float dist2 = dot(d, d);
  if (dist2 >= reach * reach) return false;
  const float dist = std::sqrt(dist2);
  hit.s = s;
  hit.t = t;
  if (dist > 1e-6f) {
    const Vec3 n = d * (1.0f / dist);
    // A on B's outside and B on A's outside: plain contact. Both reversed: the edges have passed each other and are
    // pushed back through.
    if (dot(n, ob) < 0.0f && dot(n, oa) > 0.0f) {
      hit.normal = -n;
      hit.penetration = reach + dist;
    } else {
      hit.normal = n;
      hit.penetration = reach - dist;
    }
    return true;
  }
  Vec3 n = cross(p1 - p0, q1 - q0);
  const float len = length(n);
  if (!(len > 1e-9f)) return false;
  n = n * (1.0f / len);
  if (dot(n, ob - oa) < 0.0f) n = -n;
  hit.normal = n;
  hit.penetration = reach;
  return true;
}

// ---- enumeration -----------------------------------------------------------------------------------------------

// Pair geometry in A's frame.
struct Pair {
  Vec3 offset;  // B-local → A-local
  Box region;   // A-local region where contacts are possible
  float cell;
};

// Calls visit(i, hit) for the kept node↔triangle contacts of A's collision nodes (in `region`) against B's
// triangles. `self`: A == B, nodes collide only with triangles of another group ≥ 0 that they are not part of.
// `nodes` / `tris`: optional candidate index lists (self-collision passes one group's nodes and another's triangles);
// `maxRadiusA`: largest collision radius among the candidate nodes.
template <typename BodyT, typename Visit>
int forEachNodeTriangle(BodyT& A, BodyT& B, const Pair& pr, SurfaceCache& surfB, ContactScratch& s,
                        bool self, Visit&& visit, float maxRadiusA, const std::vector<int32_t>* nodes = nullptr,
                        const std::vector<int32_t>* tris = nullptr, bool extendedBand = false) {
  // Candidate triangles near the region, then the nodes they can reach: node points go into a spatial hash (one cell
  // each), every candidate triangle queries the cells under its inflated box. (Hashing the points, not the triangles,
  // keeps the hash small and unsorted-duplicate free.) The (node, triangle) pairs are then sorted, so the result
  // does not depend on the hash layout.
  s.tri.clear();
  s.boxes.clear();
  const int nt = tris ? static_cast<int>(tris->size()) : B.triangleCount();
  for (int k = 0; k < nt; ++k) {
    const int t = tris ? (*tris)[static_cast<size_t>(k)] : k;
    if (B.triTorn[t]) continue;
    surfB.ensure(B, t);
    const Box box = Box{surfB.lo[t] + pr.offset, surfB.hi[t] + pr.offset}.inflated(triRadius(B, t) + maxRadiusA);
    if (!box.overlaps(pr.region)) continue;
    s.tri.push_back(t);
    s.boxes.push_back({box.lo, box.hi});
  }
  if (s.tri.empty()) return 0;
  s.cells.clear();
  Hash hash{s.cells, 1.0f / pr.cell};
  const int nn = nodes ? static_cast<int>(nodes->size()) : A.nodeCount();
  for (int k = 0; k < nn; ++k) {
    const int i = nodes ? (*nodes)[static_cast<size_t>(k)] : k;
    if (!(A.flags[i] & node_flag::kCollide)) continue;
    const Vec3 x = A.nodePosition(i);
    if (pr.region.contains(x)) hash.insert({x, x}, i);
  }
  if (s.cells.empty()) return 0;
  hash.finish();
  s.pairs.clear();
  for (size_t q = 0; q < s.tri.size(); ++q) {
    const Box box{s.boxes[q].first, s.boxes[q].second};
    hash.query(box, s.items);
    for (const int32_t i : s.items)
      if (box.contains(A.nodePosition(i))) s.pairs.push_back({i, s.tri[q]});
  }
  std::sort(s.pairs.begin(), s.pairs.end());
  int count = 0;
  TriHit cand[kMaxCandidates];
  for (size_t p = 0; p < s.pairs.size();) {
    const int i = s.pairs[p].first;
    const Vec3 x = A.nodePosition(i);
    int n = 0;
    for (; p < s.pairs.size() && s.pairs[p].first == i; ++p) {
      const int t = s.pairs[p].second;
      if (n >= kMaxCandidates) continue;
      const int32_t* tn = triNodes(B, t);
      if (self && (B.triGroup[t] == A.nodeGroup[i] || tn[0] == i || tn[1] == i || tn[2] == i)) continue;
      TriHit h;
      if (!nodeTriangle(x, A.radius[i], pos(B, tn[0], pr.offset), pos(B, tn[1], pr.offset), pos(B, tn[2], pr.offset),
                        surfB.normal[t], triRadius(B, t), self || !extendedBand, h)) {
        continue;
      }
      h.tri = t;
      cand[n++] = h;
    }
    if (n == 0) continue;
    const int kept = selectHits(cand, n);
    for (int h = 0; h < kept; ++h) visit(i, cand[h]);
    count += kept;
  }
  return count;
}

// Calls visit(eA, eB, hit) for every edge↔edge contact between A's and B's active edges in `region`.
template <typename BodyT, typename Visit>
int forEachEdgeEdge(BodyT& A, SurfaceCache& surfA, BodyT& B, SurfaceCache& surfB,
                    const Pair& pr, ContactScratch& s, Visit&& visit) {
  s.cells.clear();
  Hash hash{s.cells, 1.0f / pr.cell};
  for (int e = 0; e < B.edgeCount(); ++e) {
    if (!edgeActive(B, e)) continue;
    const int q0 = B.edgeNode[static_cast<size_t>(e) * 2], q1 = B.edgeNode[static_cast<size_t>(e) * 2 + 1];
    {
      Box near;
      near.add(pos(B, q0, pr.offset));
      near.add(pos(B, q1, pr.offset));
      if (!near.inflated(0.5f * (B.radius[q0] + B.radius[q1])).overlaps(pr.region) || !featureEdge(B, e)) continue;
    }
    Box box;
    box.add(pos(B, q0, pr.offset));
    box.add(pos(B, q1, pr.offset));
    box = box.inflated(0.5f * (B.radius[q0] + B.radius[q1]));
    if (box.overlaps(pr.region)) hash.insert(box, e);
  }
  if (s.cells.empty()) return 0;
  hash.finish();
  int count = 0;
  for (int e = 0; e < A.edgeCount(); ++e) {
    if (!edgeActive(A, e)) continue;
    const int p0 = A.edgeNode[static_cast<size_t>(e) * 2], p1 = A.edgeNode[static_cast<size_t>(e) * 2 + 1];
    const Vec3 a0 = A.nodePosition(p0), a1 = A.nodePosition(p1);
    const float ra = 0.5f * (A.radius[p0] + A.radius[p1]);
    Box box;
    box.add(a0);
    box.add(a1);
    box = box.inflated(ra);
    if (!box.overlaps(pr.region) || !featureEdge(A, e)) continue;
    hash.query(box, s.items);
    if (s.items.empty()) continue;
    const Vec3 oa = edgeOutward(A, surfA, e);
    for (const int32_t f : s.items) {
      const int q0 = B.edgeNode[static_cast<size_t>(f) * 2], q1 = B.edgeNode[static_cast<size_t>(f) * 2 + 1];
      EdgeHit h;
      if (!edgeEdge(a0, a1, ra, oa, pos(B, q0, pr.offset), pos(B, q1, pr.offset), 0.5f * (B.radius[q0] + B.radius[q1]),
                    edgeOutward(B, surfB, f), h)) {
        continue;
      }
      visit(e, f, h);
      ++count;
    }
  }
  return count;
}

// Node spheres of two bodies (bodies without a collision surface; M0 behaviour). visit(i, j, normal B→A, p).
// `offSurface`: only nodes that are not a vertex of any collision triangle (the node spheres a surface does not
// cover, e.g. an unmeshed fringe), which then meet each other as spheres.
template <typename BodyT, typename Visit>
int forEachNodeNode(BodyT& A, BodyT& B, const Pair& pr, ContactScratch& s, Visit&& visit, bool offSurface = false) {
  s.cells.clear();
  Hash hash{s.cells, 1.0f / pr.cell};
  for (int j = 0; j < B.nodeCount(); ++j) {
    if (!(B.flags[j] & node_flag::kCollide) || (offSurface && B.nodeSurface[j] > 0.0f)) continue;
    const Vec3 p = pos(B, j, pr.offset);
    if (pr.region.contains(p)) hash.insert({p, p}, j);
  }
  if (s.cells.empty()) return 0;
  hash.finish();
  int count = 0;
  for (int i = 0; i < A.nodeCount(); ++i) {
    if (!(A.flags[i] & node_flag::kCollide) || (offSurface && A.nodeSurface[i] > 0.0f)) continue;
    const Vec3 pa = A.nodePosition(i);
    if (!pr.region.contains(pa)) continue;
    const float r = A.radius[i];
    hash.query({pa - Vec3{r, r, r} - Vec3{pr.cell, pr.cell, pr.cell} * 0.5f,
                pa + Vec3{r, r, r} + Vec3{pr.cell, pr.cell, pr.cell} * 0.5f}, s.items);
    for (const int32_t j : s.items) {
      const Vec3 d = pa - pos(B, j, pr.offset);
      const float rsum = r + B.radius[j];
      const float dist2 = dot(d, d);
      if (dist2 >= rsum * rsum) continue;
      const float dist = std::sqrt(dist2);
      visit(i, j, dist > 1e-6f ? d * (1.0f / dist) : Vec3{0.0f, 1.0f, 0.0f}, rsum - dist);
      ++count;
    }
  }
  return count;
}

// Overlapping body pairs in index order: fn(ia, ib, pair).
template <typename Bodies, typename Fn>
void forEachPair(Bodies& bodies, float motionMargin, Fn&& fn) {
  const int nb = static_cast<int>(bodies.size());
  if (nb < 2) return;
  struct WorldBox { DVec3 lo, hi; float maxRadius; bool any; };
  std::vector<WorldBox> boxes(static_cast<size_t>(nb));
  for (int i = 0; i < nb; ++i) {
    const Extent e = bodyExtent(bodies[i]);
    WorldBox& wb = boxes[static_cast<size_t>(i)];
    wb.any = e.box.valid();
    wb.maxRadius = e.maxRadius;
    if (!wb.any) continue;
    const float r = 2.0f * e.maxRadius + motionMargin * e.maxSpeed + kRegionMargin;
    wb.lo = bodies[i].origin + toDouble(e.box.lo) - DVec3{r, r, r};
    wb.hi = bodies[i].origin + toDouble(e.box.hi) + DVec3{r, r, r};
  }
  for (int ia = 0; ia < nb; ++ia) {
    const WorldBox& A = boxes[static_cast<size_t>(ia)];
    if (!A.any) continue;
    for (int ib = ia + 1; ib < nb; ++ib) {
      const WorldBox& B = boxes[static_cast<size_t>(ib)];
      if (!B.any || A.hi.x < B.lo.x || A.lo.x > B.hi.x || A.hi.y < B.lo.y || A.lo.y > B.hi.y || A.hi.z < B.lo.z ||
          A.lo.z > B.hi.z) {
        continue;
      }
      Pair pr;
      pr.offset = toFloat(bodies[ib].origin - bodies[ia].origin);
      const DVec3 lo{std::max(A.lo.x, B.lo.x), std::max(A.lo.y, B.lo.y), std::max(A.lo.z, B.lo.z)};
      const DVec3 hi{std::min(A.hi.x, B.hi.x), std::min(A.hi.y, B.hi.y), std::min(A.hi.z, B.hi.z)};
      pr.region = {toFloat(lo - bodies[ia].origin), toFloat(hi - bodies[ia].origin)};
      pr.cell = std::max(kMinCell, 2.0f * std::max(A.maxRadius, B.maxRadius));
      fn(ia, ib, pr);
    }
  }
}

Pair reversed(const Pair& pr) { return {-pr.offset, {pr.region.lo - pr.offset, pr.region.hi - pr.offset}, pr.cell}; }

}  // namespace

// ---- per-body surface update -----------------------------------------------------------------------------------

void ContactSolver::updateSurface(World& w, int bodyIndex) {
  Body& b = w.bodies_[bodyIndex];
  const int nt = b.triangleCount();
  // With every beam intact and nothing yielded the surface can neither rip nor be crushed flat; only a damaged body is
  // checked. A retired triangle takes its share of the surface from its nodes (they collide as spheres once bare).
  const bool damaged = b.brokenBeamCount > 0 || b.losses.plastic > 0.0;
  for (int t = 0; damaged && t < nt; ++t) {
    if (b.triTorn[t]) continue;
    const int32_t* v = triNodes(b, t);
    const Vec3 a = b.nodePosition(v[0]), e1 = b.nodePosition(v[1]) - a, e2 = b.nodePosition(v[2]) - a, e3 = e2 - e1;
    const Vec3 area2 = cross(e1, e2);
    if (std::max({dot(e1, e1), dot(e2, e2), dot(e3, e3)}) > b.triTearEdge2[t] || dot(area2, area2) < b.triCrushArea2[t]) {
      b.triTorn[t] = 1;
      b.topologyVersion++;
      for (int k = 0; k < 3; ++k) b.nodeSurface[v[k]] -= 1.0f;
    }
  }
  w.scratch_[bodyIndex].surface.reset(static_cast<size_t>(nt));
}

// ---- forces ----------------------------------------------------------------------------------------------------

namespace {

// Every inter-body contact of the current state, pairs in index order: node↔triangle both ways, feature edge↔edge,
// and node spheres wherever no surface covers them (bodies without triangles, unmeshed fringes, retired triangles).
template <typename Bodies, typename Scratch, typename Surfaces>
void gatherBodyContacts(Bodies& bodies, Scratch&& scratchOf, Surfaces&& surfaceOf, std::vector<ContactRecord>& out,
                        bool extendedBand = false) {
  out.clear();
  forEachPair(bodies, 0.0f, [&](int ia, int ib, const Pair& pr) {
    const Body& A = bodies[ia];
    const Body& B = bodies[ib];
    ContactScratch& s = scratchOf(ia);
    SurfaceCache& nA = surfaceOf(ia);
    SurfaceCache& nB = surfaceOf(ib);
    auto add = [&](int bodyA, const Side& a, int bodyB, const Side& b, Vec3 n, float p) {
      const float m = contactMass(bodies[bodyA], a, bodies[bodyB], b);
      if (m > 0.0f) out.push_back({bodyA, bodyB, a, b, n, p, m});
    };
    if (B.triangleCount() > 0) {
      forEachNodeTriangle(A, B, pr, nB, s, false, [&](int i, const TriHit& h) {
        add(ia, nodeSide(i), ib, triSide(B, h.tri, h.bary), h.normal, h.penetration);
      }, maxCollisionRadius(A), nullptr, nullptr, extendedBand);
    }
    if (A.triangleCount() > 0) {
      forEachNodeTriangle(B, A, reversed(pr), nA, s, false, [&](int j, const TriHit& h) {
        add(ib, nodeSide(j), ia, triSide(A, h.tri, h.bary), h.normal, h.penetration);
      }, maxCollisionRadius(B), nullptr, nullptr, extendedBand);
    }
    if (A.triangleCount() > 0 && B.triangleCount() > 0) {
      forEachEdgeEdge(A, nA, B, nB, pr, s, [&](int ea, int eb, const EdgeHit& h) {
        add(ia, edgeSide(A, ea, h.s), ib, edgeSide(B, eb, h.t), h.normal, h.penetration);
      });
    }
    forEachNodeNode(A, B, pr, s, [&](int i, int j, Vec3 n, float p) { add(ia, nodeSide(i), ib, nodeSide(j), n, p); },
                    true);
  });
}

std::vector<std::vector<float>> makeLoads(const std::vector<Body>& bodies) {
  std::vector<std::vector<float>> load(bodies.size());
  for (size_t i = 0; i < bodies.size(); ++i) load[i].assign(static_cast<size_t>(bodies[i].nodeCount()), 0.0f);
  return load;
}

}  // namespace

template <bool kTrack>
int ContactSolver::bodyContacts(World& w) {
  std::vector<ContactRecord>& recs = w.scratch_[0].records;
  gatherBodyContacts(w.bodies_, [&](int i) -> ContactScratch& { return w.scratch_[static_cast<size_t>(i)]; },
                     [&](int i) -> SurfaceCache& { return w.scratch_[static_cast<size_t>(i)].surface; }, recs);
  if (recs.empty()) return 0;
  std::vector<std::vector<float>>& load = w.scratch_[0].bodyLoad;
  if (load.size() != w.bodies_.size()) load = makeLoads(w.bodies_);
  for (size_t i = 0; i < w.bodies_.size(); ++i) load[i].resize(static_cast<size_t>(w.bodies_[i].nodeCount()), 0.0f);
  budgetContacts(recs, [&](int i) -> const Body& { return w.bodies_[static_cast<size_t>(i)]; }, load);
  for (const ContactRecord& r : recs)
    applyContact<kTrack>(w, w.bodies_[static_cast<size_t>(r.bodyA)], r.a, w.bodies_[static_cast<size_t>(r.bodyB)], r.b, r.n, r.p, r.m);
  return static_cast<int>(recs.size());
}

template int ContactSolver::bodyContacts<true>(World&);
template int ContactSolver::bodyContacts<false>(World&);

namespace {

// Self-collision enumeration: for every pair of surface groups whose boxes overlap (a wheel and the arch around it),
// nodes of one group against the triangles of the other, each pair in its own small region. visit(i, hit).
constexpr float kSelfMargin = 0.04f;  // [m] Verlet-list margin of the self-collision candidate triangles

template <typename BodyT, typename Visit>
int forEachSelfContact(BodyT& b, SurfaceCache& surf, ContactScratch& s, Visit&& visit) {
  const int groups = static_cast<int>(b.groupNodeBegin.size()) - 1;
  if (groups < 2) return 0;
  constexpr int kMaxGroups = 64;
  const int used = std::min(groups, kMaxGroups);
  Box groupBox[kMaxGroups];
  Vec3 centre[kMaxGroups];
  float groupRadius[kMaxGroups] = {};
  for (int g = 0; g < used; ++g) {
    Vec3 sum{};
    for (int k = b.groupNodeBegin[g]; k < b.groupNodeBegin[g + 1]; ++k) {
      const int i = b.groupNodes[static_cast<size_t>(k)];
      groupBox[g].add(b.nodePosition(i));
      sum += b.nodePosition(i);
      groupRadius[g] = std::max(groupRadius[g], b.radius[i]);
    }
    const int count = b.groupNodeBegin[g + 1] - b.groupNodeBegin[g];
    if (count > 0) centre[g] = sum * (1.0f / static_cast<float>(count));
  }
  int count = 0;
  std::vector<int32_t> nodes, tris;
  // Nodes of g against triangles of h, candidates from the (refreshed when stale) Verlet list.
  auto pass = [&](int g, int h, const Pair& pr) {
    const float reach = groupRadius[g] + groupRadius[h];
    SelfPairCache* cache = nullptr;
    for (SelfPairCache& c : s.selfCache)
      if (c.g == g && c.h == h) cache = &c;
    if (!cache) {
      s.selfCache.push_back({});
      cache = &s.selfCache.back();
      cache->g = static_cast<int16_t>(g);
      cache->h = static_cast<int16_t>(h);
    }
    const Vec3 lo = groupBox[g].lo - centre[g], hi = groupBox[g].hi - centre[g];
    const float drift = 0.25f * kSelfMargin;
    auto moved = [drift](Vec3 a, Vec3 c) {
      return std::fabs(a.x - c.x) > drift || std::fabs(a.y - c.y) > drift || std::fabs(a.z - c.z) > drift;
    };
    const int hBegin = b.groupNodeBegin[h], hEnd = b.groupNodeBegin[h + 1];
    bool stale = cache->rel.size() != static_cast<size_t>(hEnd - hBegin) || moved(lo, cache->lo) || moved(hi, cache->hi);
    for (int k = hBegin; !stale && k < hEnd; ++k)
      stale = moved(b.nodePosition(b.groupNodes[static_cast<size_t>(k)]) - centre[g], cache->rel[static_cast<size_t>(k - hBegin)]);
    if (stale) {
      cache->lo = lo;
      cache->hi = hi;
      cache->rel.resize(static_cast<size_t>(hEnd - hBegin));
      for (int k = hBegin; k < hEnd; ++k)
        cache->rel[static_cast<size_t>(k - hBegin)] = b.nodePosition(b.groupNodes[static_cast<size_t>(k)]) - centre[g];
      cache->tris.clear();
      const Box near = groupBox[g].inflated(reach + kSelfMargin);
      for (int k = b.groupTriBegin2[h]; k < b.groupTriBegin2[h + 1]; ++k) {
        const int t = b.groupTris[static_cast<size_t>(k)];
        if (b.triTorn[t]) continue;
        surf.ensure(b, t);
        if (Box{surf.lo[t], surf.hi[t]}.overlaps(near)) cache->tris.push_back(t);
      }
    }
    if (cache->tris.empty()) return;
    nodes.clear();
    for (int k = b.groupNodeBegin[g]; k < b.groupNodeBegin[g + 1]; ++k) {
      const int i = b.groupNodes[static_cast<size_t>(k)];
      if ((b.flags[i] & node_flag::kCollide) && pr.region.contains(b.nodePosition(i))) nodes.push_back(i);
    }
    if (nodes.empty()) return;
    count += forEachNodeTriangle(b, b, pr, surf, s, true, visit, groupRadius[g], &nodes, &cache->tris);
  };
  for (int g = 0; g < used; ++g) {
    if (!groupBox[g].valid()) continue;
    for (int h = g + 1; h < used; ++h) {
      if (!groupBox[h].valid()) continue;
      const float reach = groupRadius[g] + groupRadius[h];
      const Box a = groupBox[g].inflated(reach), c = groupBox[h].inflated(reach);
      if (!a.overlaps(c)) continue;
      const Pair pr{{}, intersect(a, c), std::max(kMinCell, 2.0f * std::max(groupRadius[g], groupRadius[h]))};
      pass(g, h, pr);
      pass(h, g, pr);
    }
  }
  return count;
}

}  // namespace

template <bool kTrack>
int ContactSolver::selfContacts(World& w, int bodyIndex) {
  Body& b = w.bodies_[bodyIndex];
  if (b.triangleCount() == 0) return 0;
  ContactScratch& s = w.scratch_[bodyIndex];
  std::vector<ContactRecord>& recs = s.selfRecords;
  recs.clear();
  forEachSelfContact(b, s.surface, s, [&](int i, const TriHit& hit) {
    const Side a = nodeSide(i), t = triSide(b, hit.tri, hit.bary);
    const float m = contactMass(b, a, b, t);
    if (m > 0.0f) recs.push_back({0, 0, a, t, hit.normal, hit.penetration, m});
  });
  if (recs.empty()) return 0;
  if (s.selfLoad.size() != 1) s.selfLoad.assign(1, {});
  s.selfLoad[0].resize(static_cast<size_t>(b.nodeCount()), 0.0f);
  budgetContacts(recs, [&](int) -> const Body& { return b; }, s.selfLoad);
  for (const ContactRecord& r : recs) applyContact<kTrack>(w, b, r.a, b, r.b, r.n, r.p, r.m);
  return static_cast<int>(recs.size());
}

template int ContactSolver::selfContacts<true>(World&, int);
template int ContactSolver::selfContacts<false>(World&, int);

// ---- continuous collision --------------------------------------------------------------------------------------

namespace {

// f(t) = (x − a)·((b − a) × (c − a)) at time t ∈ [0, 1] of the step (linear motion of all four points).
inline float coplanarity(float t, Vec3 x0, Vec3 dx, Vec3 a0, Vec3 da, Vec3 b0, Vec3 db, Vec3 c0, Vec3 dc) {
  const Vec3 x = x0 + dx * t, a = a0 + da * t, b = b0 + db * t, c = c0 + dc * t;
  return dot(x - a, cross(b - a, c - a));
}

// One node of A against B's triangles over the step; returns true (and fixes both bodies) on a crossing.
bool ccdNode(Body& A, int i, Body& B, const Pair& pr, const std::vector<int32_t>& cand) {
  const Vec3 x1 = A.nodePosition(i);
  const Vec3 x0 = startPosition(A, i, {});
  float bestT = 2.0f;
  int bestTri = -1;
  Vec3 bestBary{};
  for (const int32_t t : cand) {
    const int32_t* tn = triNodes(B, t);
    Vec3 p1[3], p0[3];
    for (int k = 0; k < 3; ++k) {
      p1[k] = pos(B, tn[k], pr.offset);
      p0[k] = startPosition(B, tn[k], pr.offset);
    }
    const Vec3 n0 = cross(p0[1] - p0[0], p0[2] - p0[0]);
    const float area0 = length(n0);
    if (!(area0 > 1e-10f)) continue;
    const float f0 = dot(x0 - p0[0], n0), f1 = dot(x1 - p1[0], cross(p1[1] - p1[0], p1[2] - p1[0]));
    if (!(f0 >= -kCcdSlop * area0 && f1 < 0.0f)) continue;
    // Bisection on the cubic f(t) for its first sign change.
    const Vec3 dxv = x1 - x0, da = p1[0] - p0[0], db = p1[1] - p0[1], dc = p1[2] - p0[2];
    float lo = 0.0f, hi = 1.0f;
    for (int it = 0; it < kCcdBisections; ++it) {
      const float mid = 0.5f * (lo + hi);
      if (coplanarity(mid, x0, dxv, p0[0], da, p0[1], db, p0[2], dc) >= 0.0f) lo = mid; else hi = mid;
    }
    if (hi >= bestT) continue;
    const Vec3 xt = x0 + dxv * hi, at = p0[0] + da * hi, bt = p0[1] + db * hi, ct = p0[2] + dc * hi;
    const Vec3 bary = barycentric(xt, at, bt, ct);
    if (bary.x < -kInsideTolerance || bary.y < -kInsideTolerance || bary.z < -kInsideTolerance) continue;
    bestT = hi;
    bestTri = t;
    bestBary = bary;
  }
  if (bestTri < 0) return false;
  const int32_t* tn = triNodes(B, bestTri);
  const Vec3 a = pos(B, tn[0], pr.offset), b = pos(B, tn[1], pr.offset), c = pos(B, tn[2], pr.offset);
  Vec3 n = cross(b - a, c - a);
  const float len = length(n);
  if (!(len > 1e-10f)) return false;
  n = n * (1.0f / len);
  Vec3 bary = barycentric(x1, a, b, c);
  bary = {std::clamp(bary.x, 0.0f, 1.0f), std::clamp(bary.y, 0.0f, 1.0f), std::clamp(bary.z, 0.0f, 1.0f)};
  const float bsum = bary.x + bary.y + bary.z;
  bary = bsum > 0.0f ? bary * (1.0f / bsum) : bestBary;
  const Side na = nodeSide(i), tb = triSide(B, bestTri, bary);
  const float imA = A.invMass[i], imB = tb.inverseMass(B);
  const float S = imA + imB;
  if (!(S > 0.0f)) return false;
  auto kinetic = [](const Body& body, const Side& side) {
    double e = 0.0;
    for (int k = 0; k < side.count; ++k) {
      const Vec3 v = body.nodeVelocity(side.node[k]);
      e += 0.5 * static_cast<double>(body.mass[side.node[k]]) * dot(v, v);
    }
    return e;
  };
  const double before = kinetic(A, na) + kinetic(B, tb);
  // Position: close the depth behind the mid-plane (plus the standoff), split by inverse mass (centre of mass
  // unchanged).
  const float depth = kCcdStandoff - dot(x1 - a, n);  // > 0
  auto move = [](Body& body, int node, Vec3 d) { body.px[node] += d.x; body.py[node] += d.y; body.pz[node] += d.z; };
  auto push = [](Body& body, int node, Vec3 dv) { body.vx[node] += dv.x; body.vy[node] += dv.y; body.vz[node] += dv.z; };
  if (depth > 0.0f) {
    move(A, i, n * (depth * imA / S));
    for (int k = 0; k < 3; ++k) move(B, tb.node[k], n * (-depth * tb.w[k] * B.invMass[tb.node[k]] / S));
  }
  // Velocity: remove the approaching relative normal velocity with an equal and opposite impulse.
  const float vn = dot(A.nodeVelocity(i) - tb.velocity(B), n);
  if (vn < 0.0f) {
    const float J = -vn / S;
    push(A, i, n * (J * imA));
    for (int k = 0; k < 3; ++k) push(B, tb.node[k], n * (-J * tb.w[k] * B.invMass[tb.node[k]]));
  }
  A.losses.ccd += before - (kinetic(A, na) + kinetic(B, tb));
  return true;
}

// Edge e of A against edge f of B over the step (all four ends moving linearly): the edges passed through each other
// when the signed volume f(t) = (b0 − a0)·((a1 − a0) × (b1 − b0)) changed sign and, at the root, the segments
// actually meet (Ericson §5.1.9 closest points, both parameters inside). They are then put back apart along the
// edges' common normal on the side they came from and lose their approaching velocity (same split by inverse mass
// and same energy booking as the node case).
bool ccdEdge(Body& A, int e, Body& B, int f, const Pair& pr) {
  const int ia0 = A.edgeNode[static_cast<size_t>(e) * 2], ia1 = A.edgeNode[static_cast<size_t>(e) * 2 + 1];
  const int ib0 = B.edgeNode[static_cast<size_t>(f) * 2], ib1 = B.edgeNode[static_cast<size_t>(f) * 2 + 1];
  const Vec3 a0 = A.nodePosition(ia0), a1 = A.nodePosition(ia1);
  const Vec3 b0 = pos(B, ib0, pr.offset), b1 = pos(B, ib1, pr.offset);
  const Vec3 va0 = a0 - startPosition(A, ia0, {}), va1 = a1 - startPosition(A, ia1, {});  // step displacements
  const Vec3 vb0 = b0 - startPosition(B, ib0, pr.offset), vb1 = b1 - startPosition(B, ib1, pr.offset);
  auto at = [&](float t, Vec3& p0, Vec3& p1, Vec3& q0, Vec3& q1) {
    const float back = 1.0f - t;  // positions at fraction t of the step: x(t) = x1 − (1 − t)·v·dt
    p0 = a0 - va0 * back; p1 = a1 - va1 * back; q0 = b0 - vb0 * back; q1 = b1 - vb1 * back;
  };
  auto volume = [&](float t) {
    Vec3 p0, p1, q0, q1;
    at(t, p0, p1, q0, q1);
    return dot(q0 - p0, cross(p1 - p0, q1 - q0));
  };
  const float f0 = volume(0.0f), f1 = volume(1.0f);
  if (!((f0 > 0.0f && f1 < 0.0f) || (f0 < 0.0f && f1 > 0.0f))) return false;
  float lo = 0.0f, hi = 1.0f;
  for (int it = 0; it < kCcdBisections; ++it) {
    const float mid = 0.5f * (lo + hi);
    if ((volume(mid) > 0.0f) == (f0 > 0.0f)) lo = mid; else hi = mid;
  }
  Vec3 p0, p1, q0, q1;
  at(hi, p0, p1, q0, q1);
  float s, u;
  if (!closestSegmentSegment(p0, p1, q0, q1, s, u)) return false;
  if (s <= 0.0f || s >= 1.0f || u <= 0.0f || u >= 1.0f) return false;
  const Vec3 gap = (p0 + (p1 - p0) * s) - (q0 + (q1 - q0) * u);
  const float scale = std::max(length(p1 - p0), length(q1 - q0));
  if (dot(gap, gap) > 1e-4f * scale * scale) return false;  // the lines met outside the segments
  Vec3 n = cross(a1 - a0, b1 - b0);
  const float len = length(n);
  if (!(len > 1e-9f)) return false;
  n = n * (1.0f / len);
  if (f0 > 0.0f) n = -n;  // B started on the +n side of A: A belongs on −n … n now points from B's edge to A's
  const Side sa = edgeSide(A, e, s), sb = edgeSide(B, f, u);
  const float S = sa.inverseMass(A) + sb.inverseMass(B);
  if (!(S > 0.0f)) return false;
  auto kinetic = [](const Body& body, const Side& side) {
    double k = 0.0;
    for (int q = 0; q < side.count; ++q) {
      const Vec3 v = body.nodeVelocity(side.node[q]);
      k += 0.5 * static_cast<double>(body.mass[side.node[q]]) * dot(v, v);
    }
    return k;
  };
  const double before = kinetic(A, sa) + kinetic(B, sb);
  const Vec3 cA = a0 + (a1 - a0) * s, cB = b0 + (b1 - b0) * u;
  const float depth = kCcdStandoff - dot(cA - cB, n);
  auto shift = [](Body& body, const Side& side, Vec3 d, float sign) {
    for (int q = 0; q < side.count; ++q) {
      const int i = side.node[q];
      const Vec3 dd = d * (sign * side.w[q] * body.invMass[i]);
      body.px[i] += dd.x; body.py[i] += dd.y; body.pz[i] += dd.z;
    }
  };
  auto kick = [](Body& body, const Side& side, Vec3 j, float sign) {
    for (int q = 0; q < side.count; ++q) {
      const int i = side.node[q];
      const Vec3 dv = j * (sign * side.w[q] * body.invMass[i]);
      body.vx[i] += dv.x; body.vy[i] += dv.y; body.vz[i] += dv.z;
    }
  };
  if (depth > 0.0f) {
    shift(A, sa, n * (depth / S), 1.0f);
    shift(B, sb, n * (depth / S), -1.0f);
  }
  const float vn = dot(sa.velocity(A) - sb.velocity(B), n);
  if (vn < 0.0f) {
    kick(A, sa, n * (-vn / S), 1.0f);
    kick(B, sb, n * (-vn / S), -1.0f);
  }
  A.losses.ccd += before - (kinetic(A, sa) + kinetic(B, sb));
  return true;
}

}  // namespace

int ContactSolver::ccdBodies(World& w) {
  // A correction can push something else across a surface, so the sweep repeats (from the true step start) until
  // nothing crosses, at most kCcdIterations times.
  constexpr int kCcdIterations = 4;
  int total = 0;
  for (int iteration = 0; iteration < kCcdIterations; ++iteration) {
    const int clamps = ccdPass(w);
    total += clamps;
    if (clamps == 0) break;
  }
  return total;
}

int ContactSolver::ccdPass(World& w) {
  int clamps = 0;
  const float dt = w.params().dt;
  forEachPair(w.bodies_, 2.0f * dt, [&](int ia, int ib, const Pair& pr) {
    Body& A = w.bodies_[ia];
    Body& B = w.bodies_[ib];
    ContactScratch& s = w.scratch_[ia];
    for (int pass = 0; pass < 2; ++pass) {
      Body& N = pass == 0 ? A : B;  // node body
      Body& T = pass == 0 ? B : A;  // triangle body
      if (T.triangleCount() == 0) continue;
      const Pair p = pass == 0 ? pr : reversed(pr);
      s.cells.clear();
      Hash hash{s.cells, 1.0f / p.cell};
      for (int t = 0; t < T.triangleCount(); ++t) {
        if (T.triTorn[t]) continue;
        Box box;
        const int32_t* tn = triNodes(T, t);
        for (int k = 0; k < 3; ++k) {
          box.add(pos(T, tn[k], p.offset));
          box.add(startPosition(T, tn[k], p.offset));
        }
        if (box.overlaps(p.region)) hash.insert(box, t);
      }
      if (s.cells.empty()) continue;
      hash.finish();
      std::vector<int32_t> cand;
      for (int i = 0; i < N.nodeCount(); ++i) {
        // Anchored nodes too: a moving triangle can sweep over them (the correction then moves only the triangle).
        if (!(N.flags[i] & node_flag::kCollide)) continue;
        const Vec3 x1 = N.nodePosition(i);
        if (!p.region.contains(x1)) continue;
        Box box;
        box.add(x1);
        box.add(startPosition(N, i, {}));
        hash.query(box, cand);
        if (!cand.empty() && ccdNode(N, i, T, p, cand)) ++clamps;
      }
    }
    if (A.triangleCount() == 0 || B.triangleCount() == 0) return;
    // Edges passing through each other between nodes.
    auto sweptEdge = [](const Body& b, int e, Vec3 offset) {
      Box box;
      for (int k = 0; k < 2; ++k) {
        const int i = b.edgeNode[static_cast<size_t>(e) * 2 + k];
        box.add(pos(b, i, offset));
        box.add(startPosition(b, i, offset));
      }
      return box;
    };
    s.cells.clear();
    Hash hash{s.cells, 1.0f / pr.cell};
    for (int f = 0; f < B.edgeCount(); ++f) {
      if (!edgeActive(B, f)) continue;
      const Box box = sweptEdge(B, f, pr.offset);
      if (box.overlaps(pr.region) && featureEdge(B, f)) hash.insert(box, f);
    }
    if (s.cells.empty()) return;
    hash.finish();
    std::vector<int32_t> cand;
    for (int e = 0; e < A.edgeCount(); ++e) {
      if (!edgeActive(A, e)) continue;
      const Box box = sweptEdge(A, e, {});
      if (!box.overlaps(pr.region) || !featureEdge(A, e)) continue;
      hash.query(box, cand);
      for (const int32_t f : cand)
        if (ccdEdge(A, e, B, f, pr)) ++clamps;
    }
  });
  return clamps;
}

// ---- energy and penetration ------------------------------------------------------------------------------------

double ContactSolver::bodyContactPotential(const World& w, bool extendedBand) {
  double e = 0.0;
  std::vector<ContactScratch> scratch(w.bodies_.size());
  for (size_t i = 0; i < w.bodies_.size(); ++i) scratch[i].surface.reset(static_cast<size_t>(w.bodies_[i].triangleCount()));
  // The self-collision Verlet lists are a pure speed-up (same contacts as a full search), so a fresh one is used here.
  std::vector<ContactRecord> recs;
  std::vector<std::vector<float>> load = makeLoads(w.bodies_);
  auto bodyOf = [&](int i) -> const Body& { return w.bodies_[static_cast<size_t>(i)]; };
  gatherBodyContacts(w.bodies_, [&](int i) -> ContactScratch& { return scratch[static_cast<size_t>(i)]; },
                     [&](int i) -> SurfaceCache& { return scratch[static_cast<size_t>(i)].surface; }, recs, extendedBand);
  budgetContacts(recs, bodyOf, load);
  for (const ContactRecord& r : recs) e += contactEnergy(w, bodyOf(r.bodyA), r.a, bodyOf(r.bodyB), r.b, r.p, r.m);
  for (size_t bi = 0; bi < w.bodies_.size(); ++bi) {
    const Body& b = w.bodies_[bi];
    if (b.triangleCount() == 0) continue;
    recs.clear();
    forEachSelfContact(b, scratch[bi].surface, scratch[bi], [&](int i, const TriHit& hit) {
      const Side a = nodeSide(i), t = triSide(b, hit.tri, hit.bary);
      const float m = contactMass(b, a, b, t);
      if (m > 0.0f) recs.push_back({static_cast<int32_t>(bi), static_cast<int32_t>(bi), a, t, hit.normal, hit.penetration, m});
    });
    budgetContacts(recs, bodyOf, load);
    for (const ContactRecord& r : recs) e += contactEnergy(w, b, r.a, b, r.b, r.p, r.m);
  }
  return e;
}

PenetrationReport ContactSolver::measurePenetration(const World& w) {
  PenetrationReport r;
  ContactScratch s;
  // Static: node centre more than its radius behind a static triangle, inside the triangle's prism.
  for (const Body& b : w.bodies_) {
    gatherStaticCandidates(w, b, s);
    for (int i = 0; i < b.nodeCount(); ++i) {
      if (!(b.flags[i] & node_flag::kCollide) || b.invMass[i] == 0.0f) continue;
      const Vec3 x = b.nodePosition(i);
      bool behind = false;
      for (const LocalPlane& pl : s.planes)
        if (x.y - pl.height < -b.radius[i]) behind = true;
      for (const LocalTri& t : s.tris) {
        if (behind) break;
        const float d = dot(x - t.v0, t.normal);
        if (d >= -b.radius[i] || d < -b.radius[i] - kPenetrationDepth) continue;
        const Vec3 bary = barycentric(x, t.v0, t.v1, t.v2);
        if (bary.x >= 0.0f && bary.y >= 0.0f && bary.z >= 0.0f) behind = true;
      }
      if (behind) ++r.staticNodes;
    }
  }
  // Body pairs: nodes inside the other body's closed surface (ray parity) by more than their radius, and edges through
  // triangles (surfaces intersecting between nodes).
  forEachPair(w.bodies_, 0.0f, [&](int ia, int ib, const Pair& pr) {
    const Body& A = w.bodies_[ia];
    const Body& B = w.bodies_[ib];
    for (int pass = 0; pass < 2; ++pass) {
      const Body& N = pass == 0 ? A : B;
      const Body& T = pass == 0 ? B : A;
      if (T.triangleCount() == 0) continue;
      const Pair p = pass == 0 ? pr : reversed(pr);
      const Vec3 ray{0.5773502f, 0.6123724f, 0.5400617f};  // irregular direction: no ray runs along a lattice plane
      for (int i = 0; i < N.nodeCount(); ++i) {
        if (!(N.flags[i] & node_flag::kCollide)) continue;
        const Vec3 x = N.nodePosition(i);
        if (!p.region.contains(x)) continue;
        int crossings = 0;
        float nearest = 1e30f;
        for (int t = 0; t < T.triangleCount(); ++t) {
          const int32_t* tn = triNodes(T, t);
          const Vec3 a = pos(T, tn[0], p.offset), b = pos(T, tn[1], p.offset), c = pos(T, tn[2], p.offset);
          bool interior;
          const Vec3 q = closestPointOnTriangle(x, a, b, c, interior);
          nearest = std::min(nearest, length(x - q));
          const Vec3 e1 = b - a, e2 = c - a, h = cross(ray, e2);
          const float det = dot(e1, h);
          if (std::fabs(det) < 1e-12f) continue;
          const float f = 1.0f / det;
          const Vec3 sv = x - a;
          const float u = f * dot(sv, h);
          if (u < 0.0f || u > 1.0f) continue;
          const Vec3 qq = cross(sv, e1);
          const float v = f * dot(ray, qq);
          if (v < 0.0f || u + v > 1.0f) continue;
          if (f * dot(e2, qq) > 0.0f) ++crossings;
        }
        if ((crossings & 1) && nearest > N.radius[i]) ++r.bodyNodes;
      }
      // Edges of N through triangles of T (segment–triangle intersection, Möller–Trumbore) with both end nodes more
      // than their radius off the triangle's plane: a node resting on the surface (CCD holds it on the mid-plane) is
      // contact, not penetration.
      for (int e = 0; e < N.edgeCount(); ++e) {
        if (!edgeActive(N, e)) continue;
        const int n0 = N.edgeNode[static_cast<size_t>(e) * 2], n1 = N.edgeNode[static_cast<size_t>(e) * 2 + 1];
        const Vec3 p0 = N.nodePosition(n0);
        const Vec3 p1 = N.nodePosition(n1);
        if (!p.region.contains(p0) && !p.region.contains(p1)) continue;
        const Vec3 dir = p1 - p0;
        for (int t = 0; t < T.triangleCount(); ++t) {
          if (T.triTorn[t]) continue;
          const int32_t* tn = triNodes(T, t);
          const Vec3 a = pos(T, tn[0], p.offset), b = pos(T, tn[1], p.offset), c = pos(T, tn[2], p.offset);
          const Vec3 e1 = b - a, e2 = c - a, h = cross(dir, e2);
          const float det = dot(e1, h);
          if (std::fabs(det) < 1e-12f) continue;
          const float f = 1.0f / det;
          const Vec3 sv = p0 - a;
          const float u = f * dot(sv, h);
          if (u < 0.0f || u > 1.0f) continue;
          const Vec3 q = cross(sv, e1);
          const float v = f * dot(dir, q);
          if (v < 0.0f || u + v > 1.0f) continue;
          const float tt = f * dot(e2, q);
          if (!(tt > 0.0f && tt < 1.0f)) continue;
          Vec3 nrm = cross(e1, e2);
          const float area2 = length(nrm);
          nrm = nrm * (1.0f / area2);
          const float d0 = dot(p0 - a, nrm), d1 = dot(p1 - a, nrm);
          if (!(std::fabs(d0) > N.radius[n0] && std::fabs(d1) > N.radius[n1])) continue;
          // The piercing point must lie inside the triangle by more than the edge's radius: surfaces are that thick,
          // so an edge sliding past a triangle's rim is contact, not penetration.
          const float edgeRadius = 0.5f * (N.radius[n0] + N.radius[n1]);
          const float bary[3] = {1.0f - u - v, u, v};
          const float len[3] = {length(c - b), length(c - a), length(b - a)};  // edge opposite each vertex
          bool deep = true;
          for (int k = 0; k < 3; ++k) deep = deep && bary[k] * area2 / len[k] > edgeRadius;
          if (deep) { ++r.bodyEdges; break; }
        }
      }
    }
  });
  return r;
}

}  // namespace sbc

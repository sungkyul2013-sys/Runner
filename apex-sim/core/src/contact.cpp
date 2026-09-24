// Contact model (§5.2):
//  • normal:   F_n = max(0, k_n·p − c_n·v_n),  k_n = m ω², c_n = 2ζ m ω,  ω = 2π f   (penalty spring-damper,
//              mass-scaled so every node sees the same contact frequency → uniform explicit stability)
//  • friction: elastic–plastic Coulomb ("stick anchor"): a tangential spring k_t = m ω_t² to an anchor point
//              holds the node while |F_t| ≤ µs·F_n (no creep at rest, §23.1 standstill); beyond that it slides
//              with |F_t| = µk·F_n and the anchor is dragged along (return mapping).
//  • CCD:      a node centre that crosses a static surface during a step is put back on the surface and
//              loses its inward normal velocity (§5.2 tunnelling guard at 83 m/s ≈ 4.2 cm per step).
#include "contact.h"

#include <algorithm>
#include <cmath>
#include <utility>

#include "sbc/world.h"

namespace sbc {
namespace {

constexpr float kTwoPi = 6.283185307179586f;
constexpr int kMaxCandidates = 8;          // contacts examined per node per step
constexpr int kMaxContactsPerNode = 3;     // distinct surfaces a node can press against (e.g. floor + two walls)
constexpr float kSameSurfaceCos = 0.9f;    // normals closer than ~26° count as one surface (no double counting
                                           // across coplanar neighbouring triangles)
constexpr float kCandidateMargin = 0.05f;     // [m] extra broadphase inflation
constexpr float kSlipEpsilon = 1e-6f;         // [m/s] below this relative tangential speed no kinetic friction
constexpr float kInsideTolerance = 1e-6f;     // [-] relative barycentric slack for the CCD point-in-triangle test
constexpr float kCcdSlop = 1e-4f;             // [m] a step may start this far behind a surface and still be clamped

struct Contact {
  Vec3 normal;
  float penetration;
  int32_t surfaceId;
  uint16_t material;
};

bool pointInTriangle(Vec3 p, const LocalTri& t) {
  const float tol = -kInsideTolerance * dot(t.v1 - t.v0, t.v1 - t.v0);
  return dot(cross(t.v1 - t.v0, p - t.v0), t.normal) >= tol && dot(cross(t.v2 - t.v1, p - t.v1), t.normal) >= tol &&
         dot(cross(t.v0 - t.v2, p - t.v2), t.normal) >= tol;
}

// Collects up to kMaxContactsPerNode distinct surfaces touching a sphere (x, r), deepest first.
int collectStaticContacts(const ContactScratch& s, Vec3 x, float r, Contact* out) {
  Contact cand[kMaxCandidates];
  int n = 0;
  for (const LocalPlane& pl : s.planes) {
    const float d = x.y - pl.height;
    if (d < r && n < kMaxCandidates) cand[n++] = {{0.0f, 1.0f, 0.0f}, r - d, pl.id, pl.material};
  }
  for (const LocalTri& t : s.tris) {
    if (n >= kMaxCandidates) break;
    if (x.x + r < t.boundsMin.x || x.x - r > t.boundsMax.x || x.y + r < t.boundsMin.y || x.y - r > t.boundsMax.y ||
        x.z + r < t.boundsMin.z || x.z - r > t.boundsMax.z) {
      continue;
    }
    const float dPlane = dot(x - t.v0, t.normal);
    if (dPlane >= r || dPlane <= -r) continue;
    bool interior;
    const Vec3 q = closestPointOnTriangle(x, t.v0, t.v1, t.v2, interior);
    if (interior) {
      cand[n++] = {t.normal, r - dPlane, t.id, t.material};
      continue;
    }
    if (dPlane <= 0.0f) continue;  // behind the plane and outside the face: a neighbour owns it
    const Vec3 diff = x - q;
    const float dist2 = dot(diff, diff);
    if (dist2 >= r * r) continue;
    const float dist = std::sqrt(dist2);
    if (dist > 1e-6f) cand[n++] = {diff * (1.0f / dist), r - dist, t.id, t.material};
    else cand[n++] = {t.normal, r, t.id, t.material};
  }
  // Deepest first; ties by surface id → deterministic. (Insertion sort: n ≤ kMaxCandidates.)
  auto before = [](const Contact& a, const Contact& b) {
    return a.penetration != b.penetration ? a.penetration > b.penetration : a.surfaceId < b.surfaceId;
  };
  for (int i = 1; i < n; ++i) {
    const Contact key = cand[i];
    int j = i - 1;
    while (j >= 0 && before(key, cand[j])) { cand[j + 1] = cand[j]; --j; }
    cand[j + 1] = key;
  }
  int kept = 0;
  for (int i = 0; i < n && kept < kMaxContactsPerNode; ++i) {
    bool duplicate = false;
    for (int k = 0; k < kept; ++k) {
      if (dot(cand[i].normal, out[k].normal) > kSameSurfaceCos) { duplicate = true; break; }
    }
    if (!duplicate) out[kept++] = cand[i];
  }
  return kept;
}

void localBounds(const Body& b, Vec3& lo, Vec3& hi, float& maxRadius, float& maxSpeed) {
  lo = {1e30f, 1e30f, 1e30f};
  hi = {-1e30f, -1e30f, -1e30f};
  maxRadius = 0.0f;
  float maxSpeed2 = 0.0f;
  for (int i = 0; i < b.nodeCount(); ++i) {
    lo = {std::min(lo.x, b.px[i]), std::min(lo.y, b.py[i]), std::min(lo.z, b.pz[i])};
    hi = {std::max(hi.x, b.px[i]), std::max(hi.y, b.py[i]), std::max(hi.z, b.pz[i])};
    maxRadius = std::max(maxRadius, b.radius[i]);
    maxSpeed2 = std::max(maxSpeed2, b.vx[i] * b.vx[i] + b.vy[i] * b.vy[i] + b.vz[i] * b.vz[i]);
  }
  maxSpeed = std::sqrt(maxSpeed2);
}

}  // namespace

// ---- static geometry ---------------------------------------------------------------------------------------

void ContactSolver::gatherStaticCandidates(const World& w, const Body& b, ContactScratch& s) {
  s.tris.clear();
  s.planes.clear();
  Vec3 lo, hi;
  float maxRadius, maxSpeed;
  localBounds(b, lo, hi, maxRadius, maxSpeed);
  // Twice the current speed covers acceleration within the step; the CCD pass reuses this list.
  // (M0: linear scan over static triangles; the per-cell BVH of A§4.6 replaces it with the map streamer.)
  const float inflate = maxRadius + 2.0f * maxSpeed * w.params_.dt + kCandidateMargin;
  lo = lo - Vec3{inflate, inflate, inflate};
  hi = hi + Vec3{inflate, inflate, inflate};
  for (size_t p = 0; p < w.planes_.size(); ++p) {
    const float h = static_cast<float>(w.planes_[p].height - b.origin.y);
    if (lo.y < h) s.planes.push_back({h, kPlaneIdBase + static_cast<int32_t>(p), w.planes_[p].material});
  }
  for (size_t k = 0; k < w.staticTris_.size(); ++k) {
    const auto& t = w.staticTris_[k];
    const Vec3 offset = toFloat(t.origin - b.origin);
    const Vec3 bmin = t.boundsMin + offset, bmax = t.boundsMax + offset;
    if (bmax.x < lo.x || bmin.x > hi.x || bmax.y < lo.y || bmin.y > hi.y || bmax.z < lo.z || bmin.z > hi.z) continue;
    s.tris.push_back({t.v0 + offset, t.v1 + offset, t.v2 + offset, t.normal, bmin, bmax, static_cast<int32_t>(k),
                      t.material});
  }
}

template <bool kTrack>
int ContactSolver::staticContacts(World& w, int bodyIndex) {
  Body& b = w.bodies_[bodyIndex];
  ContactScratch& s = w.scratch_[bodyIndex];
  gatherStaticCandidates(w, b, s);
  std::fill(b.patchForce.begin(), b.patchForce.end(), 0.0f);
  if (s.tris.empty() && s.planes.empty()) {
    std::fill(b.anchorContact.begin(), b.anchorContact.end(), -1);
    return 0;
  }
  int count = 0;
  Contact contacts[kMaxContactsPerNode];
  for (int i = 0; i < b.nodeCount(); ++i) {
    if (!(b.flags[i] & node_flag::kCollide) || b.invMass[i] == 0.0f) continue;
    const Vec3 x = b.nodePosition(i), v = b.nodeVelocity(i);
    const int n = collectStaticContacts(s, x, b.radius[i], contacts);
    if (n == 0) { b.anchorContact[i] = -1; continue; }
    const float m = b.mass[i];
    if (b.flags[i] & node_flag::kTread) {
      // Tyre tread: normal force only; the vehicle's tyre model supplies the tangential force (§6 hybrid). The node
      // takes `treadShare` of the spring (with its own damping); the full spring force is reported for the vehicle,
      // which applies the remaining share to the wheel.
      Vec3 force{}, dissipativeNormal{}, weightedNormal{};
      float total = 0.0f;
      for (int k = 0; k < n; ++k) {
        const Contact& c = contacts[k];
        const ContactPairParams& pp = w.contactPair(b.material[i], c.material);
        const float omega = kTwoPi * pp.normalFrequencyHz;
        const float spring = m * omega * omega * c.penetration;
        const float share = pp.treadShare;
        const float nodeSpring = share * spring;
        const float damping = 2.0f * pp.normalDampingRatio * m * omega * std::sqrt(share);
        const float fn = std::max(nodeSpring - damping * dot(v, c.normal), 0.0f);
        force += c.normal * fn;
        weightedNormal += c.normal * spring;
        total += spring;
        if constexpr (kTrack) dissipativeNormal += c.normal * (fn - nodeSpring);
        ++count;
      }
      b.anchorContact[i] = -1;
      b.contactLoad[i] += total;
      b.patchForce[i] = total;
      b.patchNx[i] = weightedNormal.x; b.patchNy[i] = weightedNormal.y; b.patchNz[i] = weightedNormal.z;
      b.patchMaterial[i] = contacts[0].material;
      b.fx[i] += force.x; b.fy[i] += force.y; b.fz[i] += force.z;
      if constexpr (kTrack) {
        b.fdContactX[i] += dissipativeNormal.x; b.fdContactY[i] += dissipativeNormal.y;
        b.fdContactZ[i] += dissipativeNormal.z;
      }
      continue;
    }
    Vec3 force{}, dissipativeNormal{}, friction{};
    float normalLoad = 0.0f;
    for (int k = 0; k < n; ++k) {
      const Contact& c = contacts[k];
      const ContactPairParams& pp = w.contactPair(b.material[i], c.material);
      const float omega = kTwoPi * pp.normalFrequencyHz;
      const float kn = m * omega * omega;
      const float cn = 2.0f * pp.normalDampingRatio * m * omega;
      const float vn = dot(v, c.normal);
      const float spring = kn * c.penetration;
      const float fn = std::max(spring - cn * vn, 0.0f);
      const Vec3 vt = v - c.normal * vn;
      const float omegaT = kTwoPi * pp.tangentFrequencyHz;
      const float kt = m * omegaT * omegaT;
      const float ct = 2.0f * pp.tangentDampingRatio * m * omegaT;
      Vec3 ft;
      if (k == 0) {
        // Primary contact: stick anchor with return mapping.
        Vec3 delta{};
        if (b.anchorContact[i] == c.surfaceId) {
          // x_n − x_{n−1} = v_n·dt exactly under symplectic Euler.
          delta = Vec3{b.stickX[i], b.stickY[i], b.stickZ[i]} + v * w.params_.dt;
        } else {
          b.anchorContact[i] = c.surfaceId;  // new contact: anchor at the current position
        }
        delta = delta - c.normal * dot(delta, c.normal);
        const Vec3 trial = delta * (-kt) - vt * ct;
        const float trialMag = length(trial);
        if (trialMag > pp.staticFriction * fn) {
          ft = trialMag > 0.0f ? trial * (pp.kineticFriction * fn / trialMag) : Vec3{};
          // Drag the anchor so that the spring alone reproduces the sliding force: −k_t·δ = F_t.
          delta = ft * (-1.0f / kt);
        } else {
          ft = trial;
        }
        b.stickX[i] = delta.x; b.stickY[i] = delta.y; b.stickZ[i] = delta.z;
      } else {
        // Secondary contacts (corners): regularised Coulomb without memory.
        const float speed = length(vt);
        ft = speed > kSlipEpsilon ? vt * (-std::min(ct, pp.kineticFriction * fn / speed)) : Vec3{};
      }
      force += c.normal * fn + ft;
      normalLoad += fn;
      if constexpr (kTrack) {
        dissipativeNormal += c.normal * (fn - spring);
        friction += ft;
      }
      ++count;
    }
    b.fx[i] += force.x; b.fy[i] += force.y; b.fz[i] += force.z;
    b.contactLoad[i] += normalLoad;
    if constexpr (kTrack) {
      b.fdContactX[i] += dissipativeNormal.x; b.fdContactY[i] += dissipativeNormal.y; b.fdContactZ[i] += dissipativeNormal.z;
      b.fdFrictionX[i] += friction.x; b.fdFrictionY[i] += friction.y; b.fdFrictionZ[i] += friction.z;
    }
  }
  return count;
}

template int ContactSolver::staticContacts<true>(World&, int);
template int ContactSolver::staticContacts<false>(World&, int);

int ContactSolver::ccdStatic(World& w, int bodyIndex) {
  Body& b = w.bodies_[bodyIndex];
  const ContactScratch& s = w.scratch_[bodyIndex];
  if (s.tris.empty() && s.planes.empty()) return 0;
  int clamps = 0;
  for (int i = 0; i < b.nodeCount(); ++i) {
    if (!(b.flags[i] & node_flag::kCollide) || b.invMass[i] == 0.0f) continue;
    const Vec3 x1 = b.nodePosition(i);
    const Vec3 v = b.nodeVelocity(i);
    // Position at the start of the step. A node that sat exactly on a surface may have been rounded a hair behind
    // it, hence the slop on d0: such a node must still be caught.
    const Vec3 x0{b.sx[i], b.sy[i], b.sz[i]};
    float bestT = 2.0f;
    Vec3 bestNormal{};
    float bestOffset = 0.0f;  // plane offset: d(p) = dot(p, n) − offset
    for (const LocalPlane& pl : s.planes) {
      const float d0 = x0.y - pl.height, d1 = x1.y - pl.height;
      if (d0 >= -kCcdSlop && d1 < 0.0f && d1 < d0) {
        const float t = std::max(0.0f, d0) / (d0 - d1);
        if (t < bestT) { bestT = t; bestNormal = {0.0f, 1.0f, 0.0f}; bestOffset = pl.height; }
      }
    }
    for (const LocalTri& t : s.tris) {
      const float d0 = dot(x0 - t.v0, t.normal), d1 = dot(x1 - t.v0, t.normal);
      if (!(d0 >= -kCcdSlop && d1 < 0.0f && d1 < d0)) continue;
      const float tt = std::max(0.0f, d0) / (d0 - d1);
      if (tt >= bestT) continue;
      if (!pointInTriangle(x0 + (x1 - x0) * tt, t)) continue;
      bestT = tt;
      bestNormal = t.normal;
      bestOffset = dot(t.v0, t.normal);
    }
    if (bestT > 1.0f) continue;
    // Land on the surface's plane where the step ends: only the penetration is removed, the tangential part of the
    // step is kept — also when it carries the node past the triangle's edge (sliding over the edge of a kerb or a
    // speed bump), where the plane extended beyond the edge is outside the solid. Rewinding to the time of impact
    // undid the tangential step instead: a node pressed onto the surface every step — a tyre tread node under a hard
    // landing, or one riding exactly on a bump's top edge — stayed frozen in place while its tangential velocity
    // kept growing under its beams (the latter reached 500 m/s and blew the car up at 80 km/h).
    const Vec3 hit = x1 - bestNormal * (dot(x1, bestNormal) - bestOffset);
    b.px[i] = hit.x; b.py[i] = hit.y; b.pz[i] = hit.z;
    const float vn = dot(v, bestNormal);
    if (vn < 0.0f) {
      const Vec3 v2 = v - bestNormal * vn;
      b.vx[i] = v2.x; b.vy[i] = v2.y; b.vz[i] = v2.z;
      b.losses.ccd += 0.5 * static_cast<double>(b.mass[i]) * (static_cast<double>(dot(v, v)) - dot(v2, v2));
    }
    b.anchorContact[i] = -1;
    ++clamps;
  }
  return clamps;
}

double ContactSolver::contactPotential(const World& w, bool extendedBand) {
  double e = 0.0;
  ContactScratch s;
  Contact contacts[kMaxContactsPerNode];
  for (const Body& b : w.bodies_) {
    gatherStaticCandidates(w, b, s);
    for (int i = 0; i < b.nodeCount(); ++i) {
      if (!(b.flags[i] & node_flag::kCollide) || b.invMass[i] == 0.0f) continue;
      const int n = collectStaticContacts(s, b.nodePosition(i), b.radius[i], contacts);
      // A tread node's wheel share is not a node spring: its work is booked by the vehicle (A§4.7).
      const bool tread = (b.flags[i] & node_flag::kTread) != 0;
      for (int k = 0; k < n; ++k) {
        const ContactPairParams& pp = w.contactPair(b.material[i], contacts[k].material);
        const float omega = kTwoPi * pp.normalFrequencyHz;
        const double share = tread ? pp.treadShare : 1.0;
        e += 0.5 * share * static_cast<double>(b.mass[i]) * omega * omega * contacts[k].penetration *
             contacts[k].penetration;
      }
    }
  }
  e += bodyContactPotential(w, extendedBand);
  return e;
}

}  // namespace sbc

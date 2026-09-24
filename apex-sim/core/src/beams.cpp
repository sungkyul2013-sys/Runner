// Beam kernels (§4.1, §4.3). Sign convention: f > 0 is tension (pulls the two nodes together).
#include <algorithm>
#include <cmath>

#include "internal.h"

namespace sbc::detail {
namespace {

constexpr float kDegenerateLength2 = 1e-12f;   // [m²] beams shorter than 1 µm exert no force this step

struct Geometry {
  float length;         // current length L [m]
  float ux, uy, uz;     // unit vector from node a to node b
  float lengthRate;     // dL/dt [m/s]
};

inline bool beamGeometry(const Body& b, int a, int c, Geometry& g) {
  const float dx = b.px[c] - b.px[a];
  const float dy = b.py[c] - b.py[a];
  const float dz = b.pz[c] - b.pz[a];
  const float l2 = dx * dx + dy * dy + dz * dz;
  if (!(l2 > kDegenerateLength2)) return false;
  g.length = std::sqrt(l2);
  const float inv = 1.0f / g.length;
  g.ux = dx * inv;
  g.uy = dy * inv;
  g.uz = dz * inv;
  g.lengthRate = (b.vx[c] - b.vx[a]) * g.ux + (b.vy[c] - b.vy[a]) * g.uy + (b.vz[c] - b.vz[a]) * g.uz;
  return true;
}

template <bool kTrack>
inline void applyBeamForce(Body& b, int a, int c, const Geometry& g, float force, float dissipative) {
  const float fx = force * g.ux, fy = force * g.uy, fz = force * g.uz;
  b.fx[a] += fx; b.fy[a] += fy; b.fz[a] += fz;
  b.fx[c] -= fx; b.fy[c] -= fy; b.fz[c] -= fz;
  if constexpr (kTrack) {
    const float dx = dissipative * g.ux, dy = dissipative * g.uy, dz = dissipative * g.uz;
    b.fdBeamX[a] += dx; b.fdBeamY[a] += dy; b.fdBeamZ[a] += dz;
    b.fdBeamX[c] -= dx; b.fdBeamY[c] -= dy; b.fdBeamZ[c] -= dz;
  }
}

// Elastic–plastic return mapping with linear isotropic hardening (bilinear force–extension law).
//   yield force  F_y(δp) = F_y0 + H·δp,   H = k·h/(1−h)  (plastic modulus for tangent slope h·k)
//   trial force  f = k(L − L0); if |f| > F_y: Δλ = (|f| − F_y)/(k + H), L0 += sign(f)·Δλ
// Plastic work ΔW = (F_y + ½HΔλ)·Δλ is booked as absorbed energy (§4.3, §5.3).
// Crushing stops at the densification floor (crushFloor): the rest length never yields below it, and the beam is
// elastic about the floor from there on. Stretching past tearLength tears the beam (ductile rupture).
// Returns the corrected elastic force; sets `broke` when a break criterion is met.
inline float plasticReturn(Body& b, int i, float length, bool& broke, float k) {
  float fe = k * (length - b.restLength[i]);
  const float fy0 = b.plasticForce[i];
  if (fy0 < kInfiniteForce) {
    const float h = b.hardening[i];
    const float plasticModulus = h > 0.0f ? k * h / (1.0f - h) : 0.0f;
    const float fy = fy0 + plasticModulus * b.plasticDeformation[i];
    const float magnitude = std::fabs(fe);
    if (magnitude > fy) {
      float dl = (magnitude - fy) / (k + plasticModulus);
      const float s = fe > 0.0f ? 1.0f : -1.0f;
      const bool densified = s < 0.0f && b.restLength[i] - dl < b.crushFloor[i];
      if (densified) dl = std::max(0.0f, b.restLength[i] - b.crushFloor[i]);
      if (dl > 0.0f) {
        b.restLength[i] = densified ? b.crushFloor[i] : b.restLength[i] + s * dl;
        b.plasticDeformation[i] += dl;
        b.losses.plastic += static_cast<double>((fy + 0.5f * plasticModulus * dl) * dl);
      }
      fe = densified ? k * (length - b.restLength[i]) : s * (fy + plasticModulus * dl);
      if (b.plasticDeformation[i] > b.deformLimit[i] * b.initialRestLength[i] || b.restLength[i] > b.tearLength[i]) {
        broke = true;
      }
    }
  }
  if (std::fabs(fe) > b.breakForce[i]) broke = true;
  return fe;
}

}  // namespace

void breakBeam(Body& b, int i, float elasticForce) {
  if (b.broken[i]) return;
  b.broken[i] = 1;
  b.brokenBeamCount++;
  b.topologyVersion++;
  const float k = b.stiffness[i];
  if (k > 0.0f) b.losses.fracture += static_cast<double>(elasticForce) * elasticForce / (2.0 * k);
  if (b.breakGroup[i] >= 0) b.pendingBreakGroups.push_back(b.breakGroup[i]);
}

template <bool kTrack>
int accumulateBeamForces(Body& b) {
  int newlyBroken = 0;
  Geometry g{};

  // kNormal: f = k(L − L0) + c·dL/dt
  for (int i = b.typeBegin[0]; i < b.typeBegin[1]; ++i) {
    if (b.broken[i]) continue;
    const int a = b.beamA[i], c = b.beamB[i];
    if (!beamGeometry(b, a, c, g)) continue;
    bool broke = false;
    const float fe = plasticReturn(b, i, g.length, broke, b.stiffness[i]);
    if (broke) { breakBeam(b, i, fe); ++newlyBroken; continue; }
    const float fd = b.damping[i] * g.lengthRate;
    applyBeamForce<kTrack>(b, a, c, g, fe + fd, fd);
  }

  // kSupport: active only while compressed (L < L0); can push, never pull.
  for (int i = b.typeBegin[1]; i < b.typeBegin[2]; ++i) {
    if (b.broken[i]) continue;
    const int a = b.beamA[i], c = b.beamB[i];
    if (!beamGeometry(b, a, c, g)) continue;
    if (g.length >= b.restLength[i]) continue;
    bool broke = false;
    const float fe = plasticReturn(b, i, g.length, broke, b.stiffness[i]);
    if (broke) { breakBeam(b, i, fe); ++newlyBroken; continue; }
    const float f = std::min(fe + b.damping[i] * g.lengthRate, 0.0f);
    applyBeamForce<kTrack>(b, a, c, g, f, f - fe);
  }

  // kBounded: acts only outside [minLength, maxLength].
  for (int i = b.typeBegin[2]; i < b.typeBegin[3]; ++i) {
    if (b.broken[i]) continue;
    const int a = b.beamA[i], c = b.beamB[i];
    if (!beamGeometry(b, a, c, g)) continue;
    float fe, f;
    if (g.length < b.minLength[i]) {
      fe = b.stiffness[i] * (g.length - b.minLength[i]);
      f = std::min(fe + b.damping[i] * g.lengthRate, 0.0f);
    } else if (g.length > b.maxLength[i]) {
      fe = b.stiffness[i] * (g.length - b.maxLength[i]);
      f = std::max(fe + b.damping[i] * g.lengthRate, 0.0f);
    } else {
      continue;
    }
    if (std::fabs(fe) > b.breakForce[i]) { breakBeam(b, i, fe); ++newlyBroken; continue; }
    applyBeamForce<kTrack>(b, a, c, g, f, f - fe);
  }

  // kRope: active only while stretched (L > L0); can pull, never push.
  for (int i = b.typeBegin[3]; i < b.typeBegin[4]; ++i) {
    if (b.broken[i]) continue;
    const int a = b.beamA[i], c = b.beamB[i];
    if (!beamGeometry(b, a, c, g)) continue;
    if (g.length <= b.restLength[i]) continue;
    bool broke = false;
    const float fe = plasticReturn(b, i, g.length, broke, b.stiffness[i]);
    if (broke) { breakBeam(b, i, fe); ++newlyBroken; continue; }
    const float f = std::max(fe + b.damping[i] * g.lengthRate, 0.0f);
    applyBeamForce<kTrack>(b, a, c, g, f, f - fe);
  }
  // kAnisotropic: compressionStiffness while L < L0, stiffness while L ≥ L0.
  for (int i = b.typeBegin[4]; i < b.typeBegin[5]; ++i) {
    if (b.broken[i]) continue;
    const int a = b.beamA[i], c = b.beamB[i];
    if (!beamGeometry(b, a, c, g)) continue;
    const float k = g.length < b.restLength[i] ? b.compressionStiffness[i] : b.stiffness[i];
    bool broke = false;
    const float fe = plasticReturn(b, i, g.length, broke, k);
    if (broke) { breakBeam(b, i, fe); ++newlyBroken; continue; }
    const float fd = b.damping[i] * g.lengthRate;
    applyBeamForce<kTrack>(b, a, c, g, fe + fd, fd);
  }

  // kHydro: plain spring-damper around the actuated rest length (no plasticity).
  for (int i = b.typeBegin[5]; i < b.typeBegin[6]; ++i) {
    if (b.broken[i]) continue;
    const int a = b.beamA[i], c = b.beamB[i];
    if (!beamGeometry(b, a, c, g)) continue;
    const float fe = b.stiffness[i] * (g.length - b.restLength[i]);
    if (std::fabs(fe) > b.breakForce[i]) { breakBeam(b, i, fe); ++newlyBroken; continue; }
    const float fd = b.damping[i] * g.lengthRate;
    applyBeamForce<kTrack>(b, a, c, g, fe + fd, fd);
  }
  return newlyBroken;
}

void updateHydros(Body& b, float dt) {
  for (int i = b.typeBegin[5]; i < b.typeBegin[6]; ++i) {
    if (b.broken[i]) continue;
    const float initial = b.initialRestLength[i];
    const float target = initial * (1.0f + b.hydroFactor[i] * b.hydroInputs[b.hydroChannel[i]]);
    float next = target;
    if (b.hydroSpeed[i] > 0.0f) {
      const float maxStep = b.hydroSpeed[i] * initial * dt;
      next = b.restLength[i] + std::clamp(target - b.restLength[i], -maxStep, maxStep);
    }
    if (next == b.restLength[i]) continue;
    // The actuator does work on the beam: book the change of its elastic energy as external work (§5.3).
    const float len = length(b.nodePosition(b.beamB[i]) - b.nodePosition(b.beamA[i]));
    const double before = static_cast<double>(len - b.restLength[i]);
    const double after = static_cast<double>(len - next);
    b.losses.external += 0.5 * b.stiffness[i] * (after * after - before * before);
    b.restLength[i] = next;
  }
}

template int accumulateBeamForces<true>(Body&);
template int accumulateBeamForces<false>(Body&);

double beamPotentialEnergy(const Body& b) {
  double e = 0.0;
  for (int i = 0; i < b.beamCount(); ++i) {
    if (b.broken[i]) continue;
    const int a = b.beamA[i], c = b.beamB[i];
    const double dx = static_cast<double>(b.px[c]) - b.px[a];
    const double dy = static_cast<double>(b.py[c]) - b.py[a];
    const double dz = static_cast<double>(b.pz[c]) - b.pz[a];
    const double len = std::sqrt(dx * dx + dy * dy + dz * dz);
    double ext = 0.0;
    switch (static_cast<BeamType>(b.beamType[i])) {
      case BeamType::kNormal: ext = len - b.restLength[i]; break;
      case BeamType::kSupport: ext = std::min(0.0, len - b.restLength[i]); break;
      case BeamType::kRope: ext = std::max(0.0, len - b.restLength[i]); break;
      case BeamType::kBounded:
        if (len < b.minLength[i]) ext = len - b.minLength[i];
        else if (len > b.maxLength[i]) ext = len - b.maxLength[i];
        break;
      case BeamType::kAnisotropic:
      case BeamType::kHydro: ext = len - b.restLength[i]; break;
    }
    const double k = (static_cast<BeamType>(b.beamType[i]) == BeamType::kAnisotropic && ext < 0.0)
                         ? b.compressionStiffness[i]
                         : b.stiffness[i];
    e += 0.5 * k * ext * ext;
  }
  return e;
}

namespace {
// Elastic force the beam currently exerts, honouring its one-sidedness (used for fracture energy).
float activeElasticForce(const Body& b, int i) {
  const float len = length(b.nodePosition(b.beamB[i]) - b.nodePosition(b.beamA[i]));
  const float k = b.stiffness[i];
  switch (static_cast<BeamType>(b.beamType[i])) {
    case BeamType::kNormal:
    case BeamType::kHydro: return k * (len - b.restLength[i]);
    case BeamType::kAnisotropic:
      return (len < b.restLength[i] ? b.compressionStiffness[i] : k) * (len - b.restLength[i]);
    case BeamType::kSupport: return k * std::min(0.0f, len - b.restLength[i]);
    case BeamType::kRope: return k * std::max(0.0f, len - b.restLength[i]);
    case BeamType::kBounded:
      if (len < b.minLength[i]) return k * (len - b.minLength[i]);
      if (len > b.maxLength[i]) return k * (len - b.maxLength[i]);
      return 0.0f;
  }
  return 0.0f;
}
}  // namespace

int applyPendingBreakGroups(Body& b) {
  if (b.pendingBreakGroups.empty()) return 0;
  std::vector<int32_t> groups;
  groups.swap(b.pendingBreakGroups);  // breakBeam() appends to pendingBreakGroups while we iterate
  std::sort(groups.begin(), groups.end());
  int count = 0;
  for (int i = 0; i < b.beamCount(); ++i) {
    if (b.broken[i] || b.breakGroup[i] < 0) continue;
    if (!std::binary_search(groups.begin(), groups.end(), b.breakGroup[i])) continue;
    breakBeam(b, i, activeElasticForce(b, i));
    ++count;
  }
  b.pendingBreakGroups.clear();  // only re-lists groups that were already applied above
  return count;
}

int updateDamageGroups(Body& b, int64_t step) {
  int hits = 0;
  for (size_t k = 0; k < b.damageBeam.size(); ++k) {
    const int i = b.damageBeam[k];
    DamageGroupState& g = b.damageGroups[static_cast<size_t>(b.damageBeamGroup[k])];
    const float l0 = b.initialRestLength[static_cast<size_t>(i)];
    const float strain = b.broken[static_cast<size_t>(i)]
                             ? kInfiniteForce
                             : std::fabs(length(b.nodePosition(b.beamB[static_cast<size_t>(i)]) - b.nodePosition(b.beamA[static_cast<size_t>(i)])) / l0 - 1.0f);
    if (strain < kInfiniteForce) g.peakStrain = std::max(g.peakStrain, strain);
    if (b.damageBeamHit[k] || strain < b.damageBeamStrain[k]) continue;
    b.damageBeamHit[k] = 1;
    ++g.damaged;
    ++hits;
    if (g.firstStep < 0) {
      g.firstStep = step;
      g.firstNodeA = b.beamA[static_cast<size_t>(i)];
      g.firstNodeB = b.beamB[static_cast<size_t>(i)];
    }
  }
  return hits;
}

}  // namespace sbc::detail

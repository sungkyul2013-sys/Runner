// Beam kernels (§4.1, §4.3). Sign convention: f > 0 is tension (pulls the two nodes together).
#include <algorithm>
#include <cmath>

#include "internal.h"

namespace sbc::detail {
namespace {

constexpr float kDegenerateLength2 = 1e-12f;   // [m²] beams shorter than 1 µm exert no force this step
// [-] of the yield force: a load that arms a beam's steep unloading (BeamDesc::unloadRatio) — a member being bent or
// crushed, never one carrying everyday loads (and its set on unloading is then part of real damage).
constexpr float kUnloadArm = 0.8f;

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
// Steep unloading (BeamDesc::unloadRatio α): a beam armed by a load near its strength (kUnloadArm of the yield
// force) that now springs back (its length moving
// toward the rest length at `rate`) has its rest length follow by (α − 1)·rate·dt, never past the length itself
// (force zero: disarmed) — a crushed stack sets at the length it springs back to, which may be under its
// densification floor (it was squeezed further still); the elastic energy that takes away is plastic work.
// It stays armed through reloading until it has unloaded completely. Its force magnitude only falls while it
// unloads armed, so it gives back less, never more.
// Returns the corrected elastic force; sets `broke` when a break criterion is met.
inline float plasticReturn(Body& b, int i, float length, float rate, float dt, bool& broke, float k) {
  if (b.unloadArmed[i]) {
    const float ext = length - b.restLength[i];
    if (ext * rate < 0.0f) {
      float rest = b.restLength[i] - (b.unloadRatio[i] - 1.0f) * rate * dt;
      rest = ext < 0.0f ? std::max(rest, length) : std::min(rest, length);
      const float after = length - rest;
      b.losses.plastic += 0.5 * static_cast<double>(k) * (static_cast<double>(ext) * ext - static_cast<double>(after) * after);
      b.restLength[i] = rest;
      if (rest == length) b.unloadArmed[i] = 0;
    }
  }
  float fe = k * (length - b.restLength[i]);
  const float fy0 = b.plasticForce[i];
  if (fy0 < kInfiniteForce) {
    const float h = b.hardening[i];
    const float plasticModulus = h > 0.0f ? k * h / (1.0f - h) : 0.0f;
    const float fy = fy0 + plasticModulus * b.plasticDeformation[i];
    const float magnitude = std::fabs(fe);
    if (magnitude > kUnloadArm * fy && b.unloadRatio[i] > 1.0f) b.unloadArmed[i] = 1;
    if (magnitude > fy) {
      float dl = (magnitude - fy) / (k + plasticModulus);
      const float s = fe > 0.0f ? 1.0f : -1.0f;
      const bool densified = s < 0.0f && b.restLength[i] - dl < b.crushFloor[i];
      if (densified) dl = std::max(0.0f, b.restLength[i] - b.crushFloor[i]);
      if (dl > 0.0f) {
        b.restLength[i] = densified ? b.crushFloor[i] : b.restLength[i] + s * dl;
        b.plasticDeformation[i] += dl;
        // Low-cycle fatigue: an excursion of yielding against the previous one counts in full (plasticSign ±2), the
        // first one does not (±1), nor does yielding on in the same direction after an elastic pause.
        const int8_t sign = s > 0.0f ? 1 : -1;
        const int8_t last = b.plasticSign[i];
        if (last != 0 && (last > 0) != (sign > 0)) b.plasticSign[i] = static_cast<int8_t>(2 * sign);
        else if (last == 0) b.plasticSign[i] = sign;
        if (b.plasticSign[i] == 2 * sign) b.fatigue[i] += dl;
        b.losses.plastic += static_cast<double>((fy + 0.5f * plasticModulus * dl) * dl);
      }
      fe = densified ? k * (length - b.restLength[i]) : s * (fy + plasticModulus * dl);
      if (b.plasticDeformation[i] > b.deformLimit[i] * b.initialRestLength[i] || b.restLength[i] > b.tearLength[i] ||
          b.fatigue[i] > b.fatigueLimit[i] * b.initialRestLength[i]) {
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
int accumulateBeamForces(Body& b, float dt) {
  int newlyBroken = 0;
  Geometry g{};

  // kNormal: f = k(L − L0) + c·dL/dt
  // Most beams, most steps, are elastic: a force under kUnloadArm of the initial yield force (the yield force only
  // grows with hardening) and under the break force, not armed for unloading. Those take the fast path below — the
  // same arithmetic as plasticReturn's elastic branch, on raw arrays; the rest go through plasticReturn.
  {
    const uint8_t* __restrict broken = b.broken.data();
    const int32_t* __restrict beamA = b.beamA.data();
    const int32_t* __restrict beamB = b.beamB.data();
    const uint8_t* __restrict armed = b.unloadArmed.data();
    const float* __restrict rest = b.restLength.data();
    const float* __restrict stiffness = b.stiffness.data();
    const float* __restrict yield = b.plasticForce.data();
    const float* __restrict breakAt = b.breakForce.data();
    const float* __restrict damping = b.damping.data();
    const float* __restrict px = b.px.data();
    const float* __restrict py = b.py.data();
    const float* __restrict pz = b.pz.data();
    const float* __restrict vx = b.vx.data();
    const float* __restrict vy = b.vy.data();
    const float* __restrict vz = b.vz.data();
    float* __restrict fx = b.fx.data();
    float* __restrict fy = b.fy.data();
    float* __restrict fz = b.fz.data();
    for (int i = b.typeBegin[0]; i < b.typeBegin[1]; ++i) {
      if (broken[i]) continue;
      const int a = beamA[i], c = beamB[i];
      const float dx = px[c] - px[a];
      const float dy = py[c] - py[a];
      const float dz = pz[c] - pz[a];
      const float l2 = dx * dx + dy * dy + dz * dz;
      if (!(l2 > kDegenerateLength2)) continue;
      g.length = std::sqrt(l2);
      const float inv = 1.0f / g.length;
      g.ux = dx * inv;
      g.uy = dy * inv;
      g.uz = dz * inv;
      g.lengthRate = (vx[c] - vx[a]) * g.ux + (vy[c] - vy[a]) * g.uy + (vz[c] - vz[a]) * g.uz;
      float fe = stiffness[i] * (g.length - rest[i]);
      const float magnitude = std::fabs(fe);
      if (armed[i] || !(magnitude <= kUnloadArm * yield[i]) || !(magnitude <= breakAt[i])) {
        bool broke = false;
        fe = plasticReturn(b, i, g.length, g.lengthRate, dt, broke, stiffness[i]);
        if (broke) { breakBeam(b, i, fe); ++newlyBroken; continue; }
      }
      const float fd = damping[i] * g.lengthRate;
      if constexpr (kTrack) {
        applyBeamForce<kTrack>(b, a, c, g, fe + fd, fd);
      } else {
        const float f = fe + fd;
        const float ffx = f * g.ux, ffy = f * g.uy, ffz = f * g.uz;
        fx[a] += ffx; fy[a] += ffy; fz[a] += ffz;
        fx[c] -= ffx; fy[c] -= ffy; fz[c] -= ffz;
      }
    }
  }

  // kSupport: active only while compressed (L < L0); can push, never pull.
  for (int i = b.typeBegin[1]; i < b.typeBegin[2]; ++i) {
    if (b.broken[i]) continue;
    const int a = b.beamA[i], c = b.beamB[i];
    if (!beamGeometry(b, a, c, g)) continue;
    if (g.length >= b.restLength[i]) continue;
    bool broke = false;
    const float fe = plasticReturn(b, i, g.length, g.lengthRate, dt, broke, b.stiffness[i]);
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
    const float fe = plasticReturn(b, i, g.length, g.lengthRate, dt, broke, b.stiffness[i]);
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
    const float fe = plasticReturn(b, i, g.length, g.lengthRate, dt, broke, k);
    if (broke) { breakBeam(b, i, fe); ++newlyBroken; continue; }
    const float fd = b.damping[i] * g.lengthRate;
    applyBeamForce<kTrack>(b, a, c, g, fe + fd, fd);
  }

  // kHydro: spring-damper around the actuated rest length. It can yield (a tie rod bent in a kerb strike): the
  // plastic change of the rest length is kept as an offset the actuator carries from then on (updateHydros).
  for (int i = b.typeBegin[5]; i < b.typeBegin[6]; ++i) {
    if (b.broken[i]) continue;
    const int a = b.beamA[i], c = b.beamB[i];
    if (!beamGeometry(b, a, c, g)) continue;
    bool broke = false;
    const float before = b.restLength[i];
    const float fe = plasticReturn(b, i, g.length, g.lengthRate, dt, broke, b.stiffness[i]);
    b.hydroOffset[i] += b.restLength[i] - before;
    if (broke) { breakBeam(b, i, fe); ++newlyBroken; continue; }
    const float fd = b.damping[i] * g.lengthRate;
    applyBeamForce<kTrack>(b, a, c, g, fe + fd, fd);
  }
  return newlyBroken;
}

void updateHydros(Body& b, float dt) {
  for (int i = b.typeBegin[5]; i < b.typeBegin[6]; ++i) {
    if (b.broken[i]) continue;
    const float initial = b.initialRestLength[i];
    const float target = initial * (1.0f + b.hydroFactor[i] * b.hydroInputs[b.hydroChannel[i]]) + b.hydroOffset[i];
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

template int accumulateBeamForces<true>(Body&, float);
template int accumulateBeamForces<false>(Body&, float);

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
  auto first = [&](DamageGroupState& g, int32_t a, int32_t c) {
    if (g.firstStep >= 0) return;
    g.firstStep = step;
    g.firstNodeA = a;
    g.firstNodeB = c;
  };
  // Beams: permanent (plastic) strain past the trigger, or broken. Elastic strain alone does not count: the lattice
  // is compliant, and hard driving strains it by up to 2 % without harm.
  for (size_t k = 0; k < b.damageBeam.size(); ++k) {
    const size_t i = static_cast<size_t>(b.damageBeam[k]);
    DamageGroupState& g = b.damageGroups[static_cast<size_t>(b.damageBeamGroup[k])];
    const float strain = b.broken[i] ? kInfiniteForce : std::fabs(b.restLength[i] / b.initialRestLength[i] - 1.0f);
    if (strain < kInfiniteForce) g.peakStrain = std::max(g.peakStrain, strain);
    if (b.damageBeamHit[k] || strain < b.damageBeamStrain[k]) continue;
    b.damageBeamHit[k] = 1;
    ++g.damaged;
    ++hits;
    first(g, b.beamA[i], b.beamB[i]);
  }
  // Nodes: an impact harder than the group's impact force.
  for (size_t k = 0; k < b.damageNode.size(); ++k) {
    const int32_t i = b.damageNode[k];
    const size_t gi = static_cast<size_t>(b.damageNodeGroup[k]);
    DamageGroupState& g = b.damageGroups[gi];
    const float load = b.contactLoad[static_cast<size_t>(i)];
    g.peakImpact = std::max(g.peakImpact, load);
    if (b.damageNodeHit[k] || load < b.damageImpact[gi]) continue;
    b.damageNodeHit[k] = 1;
    ++g.impacts;
    ++hits;
    first(g, i, i);
  }
  return hits;
}

}  // namespace sbc::detail

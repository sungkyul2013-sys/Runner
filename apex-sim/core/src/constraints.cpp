// Sliders, pressure groups and torsion bars (§4.1 압력 삼각형, §7 스트럿·스태빌라이저).
#include <cmath>

#include "internal.h"
#include "sbc/det_math.h"

namespace sbc::detail {
namespace {

constexpr double kPi = 3.14159265358979323846;

inline DVec3 dpos(const Body& b, int i) { return {b.px[i], b.py[i], b.pz[i]}; }
inline DVec3 dvel(const Body& b, int i) { return {b.vx[i], b.vy[i], b.vz[i]}; }

template <bool kTrack>
inline void addForce(Body& b, int i, DVec3 f, DVec3 dissipative) {
  b.fx[i] += static_cast<float>(f.x);
  b.fy[i] += static_cast<float>(f.y);
  b.fz[i] += static_cast<float>(f.z);
  if constexpr (kTrack) {
    b.fdBeamX[i] += static_cast<float>(dissipative.x);
    b.fdBeamY[i] += static_cast<float>(dissipative.y);
    b.fdBeamZ[i] += static_cast<float>(dissipative.z);
  }
}

struct TorsionGeometry {
  DVec3 axis, r1, r2;  // unit pivot axis, lever vectors perpendicular to it
  double angle;        // signed angle from r1 to r2 about axis
  double s1, s2;       // position of each lever's foot on the axis, as a fraction of |pivot2 − pivot1|
  bool valid;
};

TorsionGeometry torsionGeometry(const Body& b, int i) {
  TorsionGeometry t{};
  const DVec3 p1 = dpos(b, b.torsionPivot1[i]), p2 = dpos(b, b.torsionPivot2[i]);
  DVec3 axis = p2 - p1;
  const double len = std::sqrt(dot(axis, axis));
  if (!(len > 1e-9)) return t;
  axis = axis * (1.0 / len);
  const DVec3 r1 = dpos(b, b.torsionArm1[i]) - p1, r2 = dpos(b, b.torsionArm2[i]) - p2;
  t.axis = axis;
  t.r1 = r1 - axis * dot(axis, r1);
  t.r2 = r2 - axis * dot(axis, r2);
  t.s1 = dot(axis, r1) / len;
  t.s2 = 1.0 + dot(axis, r2) / len;
  if (!(dot(t.r1, t.r1) > 1e-12) || !(dot(t.r2, t.r2) > 1e-12)) return t;
  t.angle = det::atan2(dot(axis, cross(t.r1, t.r2)), dot(t.r1, t.r2));
  t.valid = true;
  return t;
}

double wrapAngle(double a) {
  while (a > kPi) a -= 2.0 * kPi;
  while (a <= -kPi) a += 2.0 * kPi;
  return a;
}

}  // namespace

double pressureGroupVolume(const Body& b, int g) {
  double v = 0.0;
  for (int t = b.groupTriBegin[g]; t < b.groupTriBegin[g + 1]; ++t) {
    const DVec3 a = dpos(b, b.pressureTri[t * 3]), c1 = dpos(b, b.pressureTri[t * 3 + 1]),
                c2 = dpos(b, b.pressureTri[t * 3 + 2]);
    v += dot(a, cross(c1, c2));
  }
  return v / 6.0;
}

double torsionBarAngle(const Body& b, int i) {
  const TorsionGeometry t = torsionGeometry(b, i);
  return t.valid ? t.angle : 0.0;
}

template <bool kTrack>
void accumulateConstraintForces(Body& b) {
  // Sliders: node pulled onto the (infinite) line through railA–railB.
  for (int s = 0; s < b.sliderCount(); ++s) {
    const int n = b.sliderNode[s], ia = b.sliderA[s], ib = b.sliderB[s];
    const DVec3 a = dpos(b, ia), ab = dpos(b, ib) - a;
    const double l2 = dot(ab, ab);
    if (!(l2 > 1e-12)) continue;
    const DVec3 x = dpos(b, n);
    const double t = dot(x - a, ab) / l2;
    const DVec3 d = x - (a + ab * t);  // perpendicular offset
    const DVec3 vRail = dvel(b, ia) + (dvel(b, ib) - dvel(b, ia)) * t;
    const DVec3 vRel = dvel(b, n) - vRail;
    const DVec3 vPerp = vRel - ab * (dot(vRel, ab) / l2);
    const DVec3 spring = d * -static_cast<double>(b.sliderStiffness[s]);
    const DVec3 damp = vPerp * -static_cast<double>(b.sliderDamping[s]);
    const DVec3 f = spring + damp;
    addForce<kTrack>(b, n, f, damp);
    addForce<kTrack>(b, ia, f * -(1.0 - t), damp * -(1.0 - t));
    addForce<kTrack>(b, ib, f * -t, damp * -t);
  }

  // Pressure groups: isothermal ideal gas, uniform gauge pressure on every triangle.
  for (int g = 0; g < b.pressureGroupCount(); ++g) {
    const double v = pressureGroupVolume(b, g);
    const double ambient = b.groupAmbientPressure[g];
    const double absolute0 = static_cast<double>(b.groupGaugePressure[g]) + ambient;
    const double gauge = v > 1e-9 ? absolute0 * b.groupInitialVolume[g] / v - ambient : 0.0;
    b.groupCurrentGauge[g] = static_cast<float>(gauge);
    for (int t = b.groupTriBegin[g]; t < b.groupTriBegin[g + 1]; ++t) {
      const int i0 = b.pressureTri[t * 3], i1 = b.pressureTri[t * 3 + 1], i2 = b.pressureTri[t * 3 + 2];
      const DVec3 p0 = dpos(b, i0);
      const DVec3 area2 = cross(dpos(b, i1) - p0, dpos(b, i2) - p0);  // 2 × outward area vector
      const DVec3 f = area2 * (gauge / 6.0);                          // p·A split over 3 nodes
      addForce<false>(b, i0, f, {});
      addForce<false>(b, i1, f, {});
      addForce<false>(b, i2, f, {});
    }
  }

  // Torsion bars: restoring torque on the relative twist of the two levers.
  for (int i = 0; i < b.torsionBarCount(); ++i) {
    if (b.torsionBroken[i]) continue;
    const TorsionGeometry t = torsionGeometry(b, i);
    const double twist = t.valid ? wrapAngle(t.angle - b.torsionRestAngle[i]) : 0.0;
    // Failure (§4.3): twisted beyond its limit, or a lever folded onto the axis. Its elastic energy is released.
    if (!t.valid || std::fabs(twist) > b.torsionBreakTwist[i] || dot(t.r1, t.r1) < b.torsionMinLever1[i] ||
        dot(t.r2, t.r2) < b.torsionMinLever2[i]) {
      b.torsionBroken[i] = 1;
      b.losses.fracture += 0.5 * b.torsionStiffness[i] * twist * twist;
      b.topologyVersion++;
      continue;
    }
    const int a1 = b.torsionArm1[i], p1 = b.torsionPivot1[i], p2 = b.torsionPivot2[i], a2 = b.torsionArm2[i];
    const double l1 = dot(t.r1, t.r1), l2 = dot(t.r2, t.r2);
    const double w1 = dot(t.axis, cross(t.r1, dvel(b, a1) - dvel(b, p1))) / l1;
    const double w2 = dot(t.axis, cross(t.r2, dvel(b, a2) - dvel(b, p2))) / l2;
    const double springTorque = -static_cast<double>(b.torsionStiffness[i]) * twist;
    const double dampTorque = -static_cast<double>(b.torsionDamping[i]) * (w2 - w1);
    const double tau = springTorque + dampTorque;
    // Each lever force acts at its arm node; the reaction acts at the lever's foot on the axis, distributed
    // linearly over the two pivots. Both pairs are then pure torques ±τ·axis → no net force or moment.
    const DVec3 dir2 = cross(t.axis, t.r2) * (1.0 / l2), dir1 = cross(t.axis, t.r1) * (1.0 / l1);
    const DVec3 f2 = dir2 * tau, d2 = dir2 * dampTorque;
    const DVec3 f1 = dir1 * -tau, d1 = dir1 * -dampTorque;
    addForce<kTrack>(b, a2, f2, d2);
    addForce<kTrack>(b, a1, f1, d1);
    addForce<kTrack>(b, p2, f2 * -t.s2 + f1 * -t.s1, d2 * -t.s2 + d1 * -t.s1);
    addForce<kTrack>(b, p1, f2 * -(1.0 - t.s2) + f1 * -(1.0 - t.s1), d2 * -(1.0 - t.s2) + d1 * -(1.0 - t.s1));
  }
}

template void accumulateConstraintForces<true>(Body&);
template void accumulateConstraintForces<false>(Body&);

double constraintPotentialEnergy(const Body& b) {
  double e = 0.0;
  for (int s = 0; s < b.sliderCount(); ++s) {
    const DVec3 a = dpos(b, b.sliderA[s]), ab = dpos(b, b.sliderB[s]) - a;
    const double l2 = dot(ab, ab);
    if (!(l2 > 1e-12)) continue;
    const DVec3 x = dpos(b, b.sliderNode[s]);
    const DVec3 d = x - (a + ab * (dot(x - a, ab) / l2));
    e += 0.5 * b.sliderStiffness[s] * dot(d, d);
  }
  for (int g = 0; g < b.pressureGroupCount(); ++g) {
    // Work the gas can still do while expanding back to V0: −∫ p_gauge dV from V0 to V.
    const double v = pressureGroupVolume(b, g), v0 = b.groupInitialVolume[g];
    const double ambient = b.groupAmbientPressure[g];
    const double absolute0 = static_cast<double>(b.groupGaugePressure[g]) + ambient;
    if (v > 1e-9) e += -(absolute0 * v0 * std::log(v / v0) - ambient * (v - v0));
  }
  for (int i = 0; i < b.torsionBarCount(); ++i) {
    if (b.torsionBroken[i]) continue;
    const double twist = wrapAngle(torsionBarAngle(b, i) - b.torsionRestAngle[i]);
    e += 0.5 * b.torsionStiffness[i] * twist * twist;
  }
  return e;
}

}  // namespace sbc::detail

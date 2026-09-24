// §10 vehicle aerodynamics: surface forces on every hull triangle (windward pressure, leeward suction, skin friction),
// wings / spoilers (thin-airfoil lift with stall, induced drag, adjustable angle), the residual axle lift, the air the
// car moves through (wind and the wakes of other cars: slipstream) and the wake it drags behind itself.
//
// The surface model is calibrated when the vehicle is created: its drag straight ahead is scaled to the vehicle's
// Cd·A, and the lift it and the wings give is taken out of the axle lift areas (the residual stands for the underbody
// and suction flow a panel model misses). What the calibration does not fix — the forces' distribution over the
// surface, their change with pitch, yaw and sideslip, with the wake of a car ahead, and with damage (crushed or lost
// panels change the normals and areas the air meets) — follows from the geometry.
#include <algorithm>
#include <cmath>
#include <stdexcept>

#include "sbc/world.h"
#include "vehicle_impl.h"

namespace sbc {

namespace {

DVec3 at(const Body& b, int i) { return {b.px[i], b.py[i], b.pz[i]}; }
DVec3 velocity(const Body& b, int i) { return {b.vx[i], b.vy[i], b.vz[i]}; }
double norm(DVec3 v) { return std::sqrt(dot(v, v)); }

void addExternal(Body& b, int i, DVec3 f, bool track) {
  const float x = static_cast<float>(f.x), y = static_cast<float>(f.y), z = static_cast<float>(f.z);
  b.fx[i] += x; b.fy[i] += y; b.fz[i] += z;
  if (track) {
    b.fdExternalX[i] += x; b.fdExternalY[i] += y; b.fdExternalZ[i] += z;
  }
}

bool detached(const Body& b, int i) { return (b.flags[static_cast<size_t>(i)] & node_flag::kDetached) != 0; }

// Air force on a surface triangle with outward area vector `area2` (twice the area) in relative wind `w` (air minus
// surface), for q = ½ρ|w|² with ρ = rho.
DVec3 surfaceForce(DVec3 area2, DVec3 w, double rho, double baseSuction, double skinFriction) {
  const double a2 = norm(area2), w2 = dot(w, w);
  if (!(a2 > 1e-12) || !(w2 > 1e-12)) return {};
  const DVec3 n = area2 * (1.0 / a2), wh = w * (1.0 / std::sqrt(w2));
  const double area = 0.5 * a2, q = 0.5 * rho * w2;
  const double c = dot(n, wh);  // < 0: the air flows onto the face
  DVec3 f = c < 0.0 ? n * (-q * area * c * c)            // windward pressure, into the face
                    : n * (q * area * baseSuction * c);  // leeward suction, out of it
  f += (wh - n * c) * (q * area * skinFriction);         // skin friction along the flow
  return f;
}

double liftCoefficient(const WingDesc& w, double alpha) {
  const double slope = 2.0 * 3.14159265358979 * w.aspectRatio / (w.aspectRatio + 2.0);
  const double a = alpha + w.zeroLiftAngle, stall = w.stallAngle;
  if (std::fabs(a) <= stall) return slope * a;
  // Past the stall the lift collapses to 60 % of its peak over another stall angle, and stays there.
  const double over = std::min(1.0, (std::fabs(a) - stall) / stall);
  return (a > 0.0 ? 1.0 : -1.0) * slope * stall * (1.0 - 0.4 * over);
}

// Wing force in relative wind `w` at its current node positions; `alphaOut` gets the angle of attack used.
DVec3 wingForce(const Body& b, const WingDesc& wd, double extraAngle, DVec3 w, double rho, double* alphaOut = nullptr) {
  const DVec3 p0 = at(b, wd.nodes[0]), p1 = at(b, wd.nodes[1]), p3 = at(b, wd.nodes[3]);
  DVec3 n = cross(p3 - p0, p1 - p0);  // leading left→right × leading→trailing: the pressure side
  const double nl = norm(n), w2 = dot(w, w);
  if (!(nl > 1e-9) || !(w2 > 1e-12)) return {};
  n = n * (1.0 / nl);
  const DVec3 wh = w * (1.0 / std::sqrt(w2));
  const double alpha = std::asin(std::clamp(-dot(wh, n), -1.0, 1.0)) + wd.angle + extraAngle;
  if (alphaOut) *alphaOut = alpha;
  const double cl = liftCoefficient(wd, alpha);
  const double cd = wd.cd0 + cl * cl / (3.14159265358979 * wd.oswald * wd.aspectRatio);
  DVec3 liftDir = n * -1.0 - wh * dot(n * -1.0, wh);  // −n, perpendicular to the flow
  const double ll = norm(liftDir);
  const double q = 0.5 * rho * w2 * wd.area;
  DVec3 f = wh * (q * cd);
  if (ll > 1e-6) f += liftDir * (q * cl / ll);
  return f;
}

}  // namespace

void Vehicle::initAero(const Body& b) {
  const AeroDesc& A = desc_.aero;
  wingExtra_.assign(A.wings.size(), 0.0);
  for (const WingDesc& w : A.wings) {
    for (const int32_t n : w.nodes) {
      if (n < 0 || n >= b.nodeCount()) throw std::invalid_argument("vehicle: wing '" + w.name + "' node out of range");
    }
  }
  surfaceTris_.clear();
  for (int t = 0; t < b.triangleCount(); ++t) {
    if (std::find(A.surfaceGroups.begin(), A.surfaceGroups.end(), b.triGroup[static_cast<size_t>(t)]) != A.surfaceGroups.end()) {
      surfaceTris_.push_back(t);
    }
  }
  // Chassis frame at creation, and the car's size (wake).
  const DVec3 pc = at(b, desc_.refCenter);
  DVec3 fwd = at(b, desc_.refFront) - pc;
  fwd = fwd * (1.0 / norm(fwd));
  DVec3 left = at(b, desc_.refLeft) - pc;
  left = left - fwd * dot(left, fwd);
  left = left * (1.0 / norm(left));
  const DVec3 up = cross(fwd, left);
  {
    double lo[3] = {1e9, 1e9, 1e9}, hi[3] = {-1e9, -1e9, -1e9};
    auto extend = [&](int i) {
      const DVec3 d = at(b, i) - pc;
      const double c[3] = {dot(d, fwd), dot(d, left), dot(d, up)};
      for (int k = 0; k < 3; ++k) { lo[k] = std::min(lo[k], c[k]); hi[k] = std::max(hi[k], c[k]); }
    };
    if (surfaceTris_.empty()) {
      for (int i = 0; i < b.nodeCount(); ++i) extend(i);
    } else {
      for (const int t : surfaceTris_) for (int k = 0; k < 3; ++k) extend(b.triNode[static_cast<size_t>(t * 3 + k)]);
    }
    wakeHalfLength_ = 0.5 * (hi[0] - lo[0]);
    wakeDiameter_ = std::sqrt(4.0 * (hi[1] - lo[1]) * (hi[2] - lo[2]) / 3.14159265358979);
  }
  aeroScale_ = 1.0;
  liftResidualFront_ = A.liftAreaFront;
  liftResidualRear_ = A.liftAreaRear;
  if (surfaceTris_.empty() && A.wings.empty()) return;

  // Calibration: straight ahead through still air at 1 m/s with ρ = 1 (forces in units of ½ρv²·m²·½ → ×2 = area).
  const DVec3 wind = fwd * -1.0;
  double surfaceDrag = 0.0, surfaceFront = 0.0, surfaceRear = 0.0, wingDrag = 0.0, wingFront = 0.0, wingRear = 0.0;
  const AxleLine axles = axleLine(b, fwd);
  for (const int t : surfaceTris_) {
    const int i0 = b.triNode[static_cast<size_t>(t * 3)], i1 = b.triNode[static_cast<size_t>(t * 3 + 1)], i2 = b.triNode[static_cast<size_t>(t * 3 + 2)];
    const DVec3 p0 = at(b, i0), p1 = at(b, i1), p2 = at(b, i2);
    const DVec3 f = surfaceForce(cross(p1 - p0, p2 - p0) * 0.5, wind, 1.0, A.baseSuction, A.skinFriction);
    surfaceDrag += -dot(f, fwd) * 2.0;
    const double front = axles.frontShare((p0 + p1 + p2) * (1.0 / 3.0));
    surfaceFront += -dot(f, up) * 2.0 * front;
    surfaceRear += -dot(f, up) * 2.0 * (1.0 - front);
  }
  for (const WingDesc& w : A.wings) {
    const DVec3 f = wingForce(b, w, 0.0, wind, 1.0);
    DVec3 c;
    for (const int32_t n : w.nodes) c += at(b, n) * 0.25;
    const double front = axles.frontShare(c);
    wingDrag += -dot(f, fwd) * 2.0;
    wingFront += -dot(f, up) * 2.0 * front;
    wingRear += -dot(f, up) * 2.0 * (1.0 - front);
  }
  if (surfaceDrag > 1e-6) aeroScale_ = std::max(0.0, (A.dragArea - wingDrag) / surfaceDrag);
  liftResidualFront_ = A.liftAreaFront - aeroScale_ * surfaceFront - wingFront;
  liftResidualRear_ = A.liftAreaRear - aeroScale_ * surfaceRear - wingRear;
}

Vehicle::AxleLine Vehicle::axleLine(const Body& b, DVec3 fwd) const {
  AxleLine l;
  DVec3 front, rear, pc = at(b, desc_.refCenter);
  int nf = 0, nr = 0;
  for (const WheelDesc& w : desc_.wheels) {
    const DVec3 c = (at(b, w.axleLeft) + at(b, w.axleRight)) * 0.5;
    if (dot(c - pc, fwd) > 0.0) { front += c; ++nf; } else { rear += c; ++nr; }
  }
  if (nf == 0 || nr == 0) return l;
  l.rear = rear * (1.0 / nr);
  l.fwd = fwd;
  l.span = dot(front * (1.0 / nf) - l.rear, fwd);
  return l;
}

void Vehicle::applyAero(const World& world, Body& b, bool track, DVec3 pc, DVec3 fwd, DVec3 up, DVec3 vcm) {
  const AeroDesc& A = desc_.aero;
  const double rho = A.airDensity;
  const AxleLine axles = axleLine(b, fwd);
  const DVec3 origin = b.origin;
  double drag = 0.0, downFront = 0.0, downRear = 0.0;
  auto account = [&](DVec3 f, DVec3 where) {
    drag += -dot(f, fwd);
    const double front = axles.frontShare(where);
    downFront += -dot(f, up) * front;
    downRear += -dot(f, up) * (1.0 - front);
  };
  // The air the car moves through: per triangle (a car close behind another has its nose deeper in the wake than
  // its tail); at its centre for the residual lift and the telemetry.
  const DVec3 air = world.airVelocity(origin + pc, body_);
  const double airspeed = dot(vcm - air, fwd);
  telemetry_.airspeed = static_cast<float>(airspeed);

  for (const int t : surfaceTris_) {
    if (b.triTorn[static_cast<size_t>(t)]) continue;
    const int i0 = b.triNode[static_cast<size_t>(t * 3)], i1 = b.triNode[static_cast<size_t>(t * 3 + 1)], i2 = b.triNode[static_cast<size_t>(t * 3 + 2)];
    if (detached(b, i0) || detached(b, i1) || detached(b, i2)) continue;  // the panel went with a part
    const DVec3 p0 = at(b, i0), p1 = at(b, i1), p2 = at(b, i2);
    const DVec3 v = (velocity(b, i0) + velocity(b, i1) + velocity(b, i2)) * (1.0 / 3.0);
    const DVec3 centre = (p0 + p1 + p2) * (1.0 / 3.0);
    const DVec3 local = world.hasWakes() ? world.airVelocity(origin + centre, body_) : air;
    const DVec3 f = surfaceForce(cross(p1 - p0, p2 - p0) * 0.5, local - v, rho, A.baseSuction, A.skinFriction) * aeroScale_;
    if (dot(f, f) == 0.0) continue;
    const DVec3 third = f * (1.0 / 3.0);
    addExternal(b, i0, third, track);
    addExternal(b, i1, third, track);
    addExternal(b, i2, third, track);
    account(f, centre);
  }
  for (size_t k = 0; k < A.wings.size(); ++k) {
    const WingDesc& w = A.wings[k];
    if (detached(b, w.nodes[0]) || detached(b, w.nodes[1]) || detached(b, w.nodes[2]) || detached(b, w.nodes[3])) continue;
    DVec3 c, v;
    for (const int32_t n : w.nodes) {
      c += at(b, n) * 0.25;
      v += velocity(b, n) * 0.25;
    }
    const DVec3 f = wingForce(b, w, wingExtra_[k], world.airVelocity(origin + c, body_) - v, rho);
    for (const int32_t n : w.nodes) addExternal(b, n, f * 0.25, track);
    account(f, c);
  }
  // Residual axle lift (underbody), on the forward airspeed.
  const double q = 0.5 * rho * airspeed * airspeed;
  auto residual = [&](const std::vector<int32_t>& nodes, double area, double& sum) {
    if (nodes.empty() || area == 0.0) return;
    double m = 0.0;
    for (const int32_t i : nodes) if (!detached(b, i)) m += b.mass[i];
    if (!(m > 0.0)) return;
    const DVec3 perKg = up * (-q * area / m);
    for (const int32_t i : nodes) if (!detached(b, i)) addExternal(b, i, perKg * static_cast<double>(b.mass[i]), track);
    sum += q * area;
  };
  residual(A.frontNodes, liftResidualFront_, downFront);
  residual(A.rearNodes, liftResidualRear_, downRear);
  telemetry_.aeroDrag = static_cast<float>(drag);
  telemetry_.aeroDownforceFront = static_cast<float>(downFront);
  telemetry_.aeroDownforceRear = static_cast<float>(downRear);
}

VehicleWake Vehicle::wake(const Body& b) const {
  VehicleWake w;
  w.body = body_;
  w.center = b.origin + at(b, desc_.refCenter);
  w.velocity = velocity(b, desc_.refCenter);
  w.diameter = wakeDiameter_;
  w.halfLength = wakeHalfLength_;
  return w;
}

void Vehicle::setWingAngle(int wing, double angle) {
  wingExtra_.at(static_cast<size_t>(wing)) = angle;
}

}  // namespace sbc

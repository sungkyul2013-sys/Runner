// Vehicle controller (§6, §8, §9, §10) — see sbc/vehicle.h for the model overview.
#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>
#include <string>

#include "sbc/det_math.h"
#include "sbc/world.h"
#include "vehicle_impl.h"

namespace sbc {
namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr double kRadToRpm = 60.0 / (2.0 * kPi);

double len(DVec3 v) { return std::sqrt(dot(v, v)); }
DVec3 normalized(DVec3 v) {
  const double l = len(v);
  return l > 1e-12 ? v * (1.0 / l) : DVec3{};
}
double clampd(double x, double lo, double hi) { return x < lo ? lo : (x > hi ? hi : x); }
double smoothstep(double x) {
  x = clampd(x, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}
double lerp(double a, double b, double t) { return a + (b - a) * t; }

DVec3 pos(const Body& b, int i) { return {b.px[i], b.py[i], b.pz[i]}; }
DVec3 vel(const Body& b, int i) { return {b.vx[i], b.vy[i], b.vz[i]}; }

DVec3 mul(const double m[9], DVec3 v) {
  return {m[0] * v.x + m[1] * v.y + m[2] * v.z, m[3] * v.x + m[4] * v.y + m[5] * v.z,
          m[6] * v.x + m[7] * v.y + m[8] * v.z};
}

RigidFit fitNodes(const Body& b, const std::vector<int32_t>& nodes) {
  RigidFit f;
  double m = 0.0;
  DVec3 c, v;
  for (const int32_t i : nodes) {
    const double mi = b.mass[i];
    m += mi;
    c += pos(b, i) * mi;
    v += vel(b, i) * mi;
  }
  if (!(m > 0.0)) return f;
  c = c * (1.0 / m);
  v = v * (1.0 / m);
  double ixx = 0.0, iyy = 0.0, izz = 0.0, ixy = 0.0, ixz = 0.0, iyz = 0.0;
  DVec3 L;
  for (const int32_t i : nodes) {
    const double mi = b.mass[i];
    const DVec3 d = pos(b, i) - c, u = vel(b, i) - v;
    L += cross(d, u) * mi;
    ixx += mi * (d.y * d.y + d.z * d.z);
    iyy += mi * (d.x * d.x + d.z * d.z);
    izz += mi * (d.x * d.x + d.y * d.y);
    ixy -= mi * d.x * d.y;
    ixz -= mi * d.x * d.z;
    iyz -= mi * d.y * d.z;
  }
  const double c00 = iyy * izz - iyz * iyz, c01 = ixz * iyz - ixy * izz, c02 = ixy * iyz - iyy * ixz;
  const double c11 = ixx * izz - ixz * ixz, c12 = ixy * ixz - ixx * iyz, c22 = ixx * iyy - ixy * ixy;
  const double det = ixx * c00 + ixy * c01 + ixz * c02;
  const double scale = (ixx + iyy + izz) / 3.0;
  f.center = c;
  f.velocity = v;
  f.mass = m;
  if (!(det > 1e-9 * scale * scale * scale) || !(scale > 0.0)) return f;  // collinear / single node
  const double inv = 1.0 / det;
  const double r[9] = {c00 * inv, c01 * inv, c02 * inv, c01 * inv, c11 * inv, c12 * inv, c02 * inv, c12 * inv, c22 * inv};
  std::copy(r, r + 9, f.invInertia);
  f.omega = mul(f.invInertia, L);
  f.valid = true;
  return f;
}

enum class Ledger { kExternal, kFriction };

void addForce(Body& b, int i, DVec3 f, bool track, Ledger ledger) {
  const float x = static_cast<float>(f.x), y = static_cast<float>(f.y), z = static_cast<float>(f.z);
  b.fx[i] += x; b.fy[i] += y; b.fz[i] += z;
  if (!track) return;
  if (ledger == Ledger::kExternal) {
    b.fdExternalX[i] += x; b.fdExternalY[i] += y; b.fdExternalZ[i] += z;
  } else {
    b.fdFrictionX[i] += x; b.fdFrictionY[i] += y; b.fdFrictionZ[i] += z;
  }
}

// Pure couple M on a node set: F_i = m_i·(α × d_i) with α = I⁻¹·M gives Σ d_i × F_i = M and Σ F_i = 0, and
// accelerates the set as a rigid body (no deformation tendency).
void applyCouple(Body& b, const std::vector<int32_t>& nodes, const RigidFit& fit, DVec3 moment, bool track,
                 Ledger ledger) {
  if (!fit.valid) return;
  const DVec3 alpha = mul(fit.invInertia, moment);
  for (const int32_t i : nodes) addForce(b, i, cross(alpha, pos(b, i) - fit.center) * b.mass[i], track, ledger);
}

// Torque T about the wheel's centre line (through `center` along unit `axis`): F_i = T·m_i·(axis × r_i)/I_axis with
// r_i the node's offset from the line. Zero net force, and its power is exactly T·ω for ω = L_axis/I_axis — the same
// spin the vehicle measures — for any deformed tyre shape (a full rigid-fit couple would pair with the rigid-fit
// angular velocity, which a flowing, deformed ring does not have).
void applySpinTorque(Body& b, const std::vector<int32_t>& nodes, DVec3 center, DVec3 axis, double axialInertia,
                     double torque, bool track, Ledger ledger) {
  if (!(axialInertia > 0.0) || torque == 0.0) return;
  const double scale = torque / axialInertia;
  for (const int32_t i : nodes) {
    const DVec3 d = pos(b, i) - center;
    const DVec3 r = d - axis * dot(d, axis);
    addForce(b, i, cross(axis, r) * (scale * b.mass[i]), track, ledger);
  }
}

// Force `force` with moment `moment` (about the wheel's mass centre) acting on a wheel: mass-weighted translation of
// the rotating nodes, the spin component as an axle-line torque on them, and the off-axis moment on the carrier,
// which it reaches through the bearing anyway. Every part pairs exactly with the quantities the vehicle measures
// (mean velocity, axial spin, carrier rotation), so its power is consistent and slip forces are always dissipative.
void applyAtWheel(Body& b, const WheelDesc& wd, const RigidFit& wheel, const RigidFit& carrier, DVec3 axis,
                  double axialInertia, DVec3 force, DVec3 moment, bool track, Ledger ledger) {
  const DVec3 perKg = force * (1.0 / wheel.mass);
  for (const int32_t i : wd.rotatingNodes) addForce(b, i, perKg * static_cast<double>(b.mass[i]), track, ledger);
  const double spinMoment = dot(moment, axis);
  applySpinTorque(b, wd.rotatingNodes, wheel.center, axis, axialInertia, spinMoment, track, ledger);
  applyCouple(b, wd.carrierNodes, carrier, moment - axis * spinMoment, track, ledger);
}

// Magic Formula shape factor sin(C·atan(B·s − E·(B·s − atan(B·s)))) ∈ [−1, 1] (deterministic trigonometry).
double magicFormula(double B, double C, double E, double s) {
  const double bs = B * s;
  const double x = bs - E * (bs - det::atan2(bs, 1.0));
  return det::sin(C * det::atan2(x, 1.0));
}

// Slip at the Magic Formula peak: C·atan(x) = π/2 with x = (1 − E)·u + E·atan(u), u = B·s (monotonic for E ≤ 1).
double magicFormulaPeak(double B, double C, double E) {
  if (C <= 1.0) return 3.0 / B;  // no interior peak: use the knee of the curve
  const double half = kPi / (2.0 * C);
  const double target = det::sin(half) / det::cos(half);
  double lo = 0.0, hi = 200.0;
  for (int it = 0; it < 80; ++it) {
    const double mid = 0.5 * (lo + hi);
    if ((1.0 - E) * mid + E * det::atan2(mid, 1.0) < target) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi) / B;
}

void require(bool ok, const std::string& what) {
  if (!ok) throw std::invalid_argument("VehicleDesc: " + what);
}

}  // namespace

Vehicle::Vehicle(const VehicleDesc& desc, int bodyIndex, const Body& body) : desc_(desc), body_(bodyIndex) {
  const int n = body.nodeCount();
  auto node = [n](int32_t i) { return i >= 0 && i < n; };
  auto nodes = [&](const std::vector<int32_t>& v, size_t minCount) {
    if (v.size() < minCount) return false;
    return std::all_of(v.begin(), v.end(), node);
  };
  require(node(desc.refCenter) && node(desc.refFront) && node(desc.refLeft), "reference nodes out of range");
  require(!desc.wheels.empty(), "no wheels");
  require(desc.engine.torqueRpm.size() >= 2 && desc.engine.torqueRpm.size() == desc.engine.torqueNm.size(),
          "engine torque curve needs ≥ 2 matching points");
  for (size_t i = 1; i < desc.engine.torqueRpm.size(); ++i) {
    require(desc.engine.torqueRpm[i] > desc.engine.torqueRpm[i - 1], "torque curve rpm must increase");
  }
  require(desc.engine.inertia > 0.0f, "engine inertia must be > 0");
  require(!desc.transmission.ratios.empty(), "no gears");
  require(desc.transmission.drivelineStiffness > 0.0f, "driveline stiffness must be > 0");
  double shares = 0.0;
  for (const WheelDesc& w : desc.wheels) {
    require(node(w.axleLeft) && node(w.axleRight) && w.axleLeft != w.axleRight, "wheel '" + w.name + "' axle nodes");
    require(nodes(w.rotatingNodes, 3) && nodes(w.treadNodes, 1) && nodes(w.carrierNodes, 3),
            "wheel '" + w.name + "' node sets");
    require(w.tyre.radius > 0.0f && w.tyre.relaxationX > 0.0f && w.tyre.relaxationY > 0.0f && w.tyre.Ex <= 1.0f &&
                w.tyre.Ey <= 1.0f,
            "wheel '" + w.name + "' tyre parameters");
    shares += w.driveShare;
  }
  require(shares <= 1.0 + 1e-4, "drive shares sum above 1");
  if (!desc.driveReactionNodes.empty() || shares > 0.0) require(nodes(desc.driveReactionNodes, 3), "driveReactionNodes");
  for (const AxleDesc& a : desc.axles) {
    const int nw = static_cast<int>(desc.wheels.size());
    require(a.leftWheel >= 0 && a.leftWheel < nw && a.rightWheel >= 0 && a.rightWheel < nw, "axle wheel index");
  }
  require(nodes(desc.aero.frontNodes, 0) && nodes(desc.aero.rearNodes, 0), "aero nodes");
  require(desc.steeringChannel < static_cast<int>(body.hydroInputs.size()), "steering channel out of range");

  if (desc.centre.active) {
    const int na = static_cast<int>(desc.axles.size());
    require(desc.centre.frontAxle >= 0 && desc.centre.frontAxle < na && desc.centre.rearAxle >= 0 &&
                desc.centre.rearAxle < na && desc.centre.frontAxle != desc.centre.rearAxle,
            "centre coupling axles");
    require(desc.centre.minFront >= 0.0f && desc.centre.maxFront <= 1.0f && desc.centre.minFront <= desc.centre.maxFront,
            "centre coupling limits");
  }
  for (const DamageLinkDesc& l : desc.damageLinks) {
    require(l.group >= 0 && static_cast<size_t>(l.group) < body.damageGroups.size(), "damage link group out of range");
    if (l.effect == DamageEffect::kDriveLoss || l.effect == DamageEffect::kBrakeLoss) {
      require(l.wheel >= 0 && static_cast<size_t>(l.wheel) < desc.wheels.size(), "damage link wheel out of range");
    }
    require(l.rate >= 0.0f, "damage link rate must be ≥ 0");
  }
  const FluidsDesc& F = desc.fluids;
  require(F.coolantL > 0.0f && F.oilL > 0.0f && F.fuelL > 0.0f && F.heatCapacity > 0.0f && F.efficiency > 0.0f,
          "fluid capacities, heat capacity and efficiency must be > 0");
  coolantL_ = F.coolantL;
  oilL_ = F.oilL;
  fuelL_ = F.fuelL;
  coolantC_ = F.thermostatC;
  driveLost_.assign(desc.wheels.size(), 0);
  sensorLong_.assign(100, 0.0);  // 50 ms at the 0.5 ms step (resized for other steps is not needed: dt is fixed)
  sensorLat_.assign(100, 0.0);
  brakeFactor_.assign(desc.wheels.size(), 1.0);
  shares_.resize(desc.wheels.size());
  for (size_t i = 0; i < shares_.size(); ++i) shares_[i] = desc.wheels[i].driveShare;
  if (desc.centre.active) {
    const AxleDesc& f = desc.axles[static_cast<size_t>(desc.centre.frontAxle)];
    frontShare_ = desc.wheels[static_cast<size_t>(f.leftWheel)].driveShare + desc.wheels[static_cast<size_t>(f.rightWheel)].driveShare;
  }
  wheels_.resize(desc.wheels.size());
  frames_.resize(desc.wheels.size());
  telemetry_.wheels.resize(desc.wheels.size());
  for (size_t i = 0; i < wheels_.size(); ++i) {
    const TyreParams& t = desc.wheels[i].tyre;
    wheels_[i].peakX = magicFormulaPeak(t.Bx, t.Cx, t.Ex);
    wheels_[i].peakY = magicFormulaPeak(t.By, t.Cy, t.Ey);
  }
  engineOmega_ = desc.engine.idleRpm / kRadToRpm;
}

double Vehicle::gearRatio(int gear) const {
  const TransmissionDesc& t = desc_.transmission;
  if (gear > 0) return static_cast<double>(t.ratios[static_cast<size_t>(gear - 1)]) * t.finalDrive;
  if (gear < 0) return -static_cast<double>(t.reverseRatio) * t.finalDrive;
  return 0.0;
}

double Vehicle::engineTorque(double rpm, double throttle) const {
  const EngineDesc& e = desc_.engine;
  const size_t n = e.torqueRpm.size();
  double wot;
  if (rpm <= e.torqueRpm[0]) {
    wot = e.torqueNm[0] * std::max(0.0, rpm) / e.torqueRpm[0];  // fades to 0 at 0 rpm
  } else if (rpm >= e.torqueRpm[n - 1]) {
    wot = e.torqueNm[n - 1];
  } else {
    size_t k = 1;
    while (e.torqueRpm[k] < rpm) ++k;
    const double t = (rpm - e.torqueRpm[k - 1]) / (e.torqueRpm[k] - e.torqueRpm[k - 1]);
    wot = lerp(e.torqueNm[k - 1], e.torqueNm[k], t);
  }
  const double drag = rpm > 0.0 ? e.frictionTorque + e.frictionPerRpm * rpm : 0.0;
  return throttle * (wot + drag) - drag;
}

void Vehicle::updateGearbox(double dt, double speed, double driveOmega) {
  const TransmissionDesc& t = desc_.transmission;
  // §4.4 a damaged gearbox has lost its top gears (engaged, it drops out of them).
  const int top = std::max(1, static_cast<int>(t.ratios.size()) - gearsLost_);
  if (gear_ > top && shiftTimer_ <= 0.0) {
    pendingGear_ = top;
    shiftTimer_ = t.shiftTime;
  }
  sinceShift_ += dt;
  if (shiftTimer_ > 0.0) {
    shiftTimer_ -= dt;
    if (shiftTimer_ <= 0.0) {
      shiftTimer_ = 0.0;
      gear_ = pendingGear_;
      windup_ = 0.0;
      sinceShift_ = 0.0;
    }
    return;
  }
  int target = gear_;
  switch (input_.mode) {
    case GearMode::kNeutral: target = 0; break;
    case GearMode::kReverse: target = (gear_ == -1 || speed < 1.0) ? -1 : 0; break;
    case GearMode::kDrive:
    case GearMode::kManual:
      if (gear_ <= 0) {
        target = speed > -1.0 ? 1 : 0;
        // Engaging while rolling: the automatic picks the lowest gear that keeps the engine below its shift point (a
        // car spawned or put into drive at speed must not be dropped into first gear and over-revved).
        if (input_.mode == GearMode::kDrive && target == 1) {
          while (target < top && std::fabs(driveOmega * gearRatio(target)) * kRadToRpm > 0.9 * t.upshiftRpm) ++target;
        }
      } else if (input_.mode == GearMode::kManual) {
        if (input_.shiftRequest > 0 && gear_ < top) target = gear_ + 1;
        if (input_.shiftRequest < 0 && gear_ > 1) target = gear_ - 1;
        input_.shiftRequest = 0;
      } else if (sinceShift_ > 0.5) {
        const double idle = desc_.engine.idleRpm, thr = input_.throttle;
        const double rpmIn = driveOmega * gearRatio(gear_) * kRadToRpm;
        const double up = idle + (t.upshiftRpm - idle) * (0.3 + 0.7 * thr);
        const double down = idle + (t.downshiftRpm - idle) * (0.15 + 0.85 * thr);
        if (gear_ < top && rpmIn > up) {
          target = gear_ + 1;
        } else if (gear_ > 1 && rpmIn < down &&
                   rpmIn * t.ratios[static_cast<size_t>(gear_ - 2)] / t.ratios[static_cast<size_t>(gear_ - 1)] <
                       0.92 * t.upshiftRpm) {
          target = gear_ - 1;
        }
      }
      break;
  }
  if (target != gear_) {
    pendingGear_ = target;
    shiftTimer_ = (gear_ == 0 || target == 0) ? 0.25 * t.shiftTime : t.shiftTime;
  }
}

void Vehicle::step(const World& world, Body& b, bool track) {
  const double dt = world.params().dt;
  const VehicleDesc& D = desc_;
  const size_t nw = D.wheels.size();
  auto detached = [&](int32_t i) { return (b.flags[static_cast<size_t>(i)] & node_flag::kDetached) != 0; };
  if (wheelLost_.size() != nw) wheelLost_.assign(nw, 0);
  if (!wrecked_ && (detached(D.refCenter) || detached(D.refFront) || detached(D.refLeft))) wrecked_ = true;
  if (wrecked_) {
    telemetry_.time = world.time() + dt;
    telemetry_.speed = 0.0f;
    telemetry_.engineRunning = false;
    for (WheelTelemetry& tel : telemetry_.wheels) tel.contact = false;
    return;
  }
  for (size_t w = 0; w < nw; ++w) {
    const WheelDesc& wd = D.wheels[w];
    // Hub torn from the knuckle (axle nodes gone) or the wheel off its hub (its rim and tyre gone).
    if (!wheelLost_[w] && (detached(wd.axleLeft) || detached(wd.axleRight) || detached(wd.rotatingNodes.front()) ||
                           detached(wd.treadNodes.front()))) {
      wheelLost_[w] = 1;
    }
  }

  // ---- chassis frame and mass centre -------------------------------------------------------------------------
  const DVec3 pc = pos(b, D.refCenter);
  const DVec3 fwd = normalized(pos(b, D.refFront) - pc);
  DVec3 left = pos(b, D.refLeft) - pc;
  left = normalized(left - fwd * dot(left, fwd));
  const DVec3 up = cross(fwd, left);
  double totalMass = 0.0;
  DVec3 vcm;
  for (int i = 0; i < b.nodeCount(); ++i) {
    if (b.invMass[i] == 0.0f) continue;
    totalMass += b.mass[i];
    vcm += vel(b, i) * static_cast<double>(b.mass[i]);
  }
  vcm = vcm * (1.0 / totalMass);
  const double speed = dot(vcm, fwd);
  if (firstStep_) {
    prevVelocity_ = vcm;
    firstStep_ = false;
  }
  const DVec3 acc = (vcm - prevVelocity_) * (1.0 / dt);
  prevVelocity_ = vcm;
  const double accFilter = dt / (0.05 + dt);
  accelLong_ += accFilter * (dot(acc, fwd) - accelLong_);
  accelLat_ += accFilter * (dot(acc, left) - accelLat_);
  odometer_ += std::fabs(speed) * dt;

  // ---- crash sensor and airbags (§4.4) ---------------------------------------------------------------------
  // The sensor sits in the cabin (the reference node): 10 ms-average deceleration and 50 ms velocity change.
  {
    const size_t n = sensorLong_.size();
    const DVec3 vs = vel(b, D.refCenter);
    sensorLong_[sensorAt_] = dot(vs, fwd);
    sensorLat_[sensorAt_] = dot(vs, left);
    const size_t oldest = (sensorAt_ + 1) % n, recent = (sensorAt_ + n - n / 5) % n;  // 50 ms and 10 ms back
    sensorFill_ = std::min(sensorFill_ + 1, n);
    if (sensorFill_ == n) {
      const double dvLong = sensorLong_[sensorAt_] - sensorLong_[oldest], dvLat = sensorLat_[sensorAt_] - sensorLat_[oldest];
      const double g10 = std::hypot(sensorLong_[sensorAt_] - sensorLong_[recent], sensorLat_[sensorAt_] - sensorLat_[recent]) /
                         (static_cast<double>(n / 5) * dt) / kStandardGravity;
      const double dv = std::hypot(dvLong, dvLat);
      if (dv > 2.2 && crashTime_ < 0.0) crashTime_ = world.time();  // 8 km/h within 50 ms: a crash
      if (crashTime_ >= 0.0) {
        crashPeakG_ = std::max(crashPeakG_, g10);
        crashDeltaV_ = std::max(crashDeltaV_, dv);
      }
      if (-dvLong > 25.0 / 3.6) airbags_ |= airbag::kDriver | airbag::kPassenger;
      if (dvLat < -15.0 / 3.6) airbags_ |= airbag::kSideLeft;   // pushed to the right: struck on the left
      if (dvLat > 15.0 / 3.6) airbags_ |= airbag::kSideRight;
    }
    sensorAt_ = oldest;
  }

  // ---- wheel kinematics and tyre contact patches -------------------------------------------------------------
  // Driveline speeds are measured against the body that carries the drive reaction (differential housing), so the
  // driveline and LSD torques are dissipative in exactly the frame their reaction couple acts in.
  RigidFit reactionFit;
  if (!D.driveReactionNodes.empty()) reactionFit = fitNodes(b, D.driveReactionNodes);
  double driveOmega = 0.0;
  for (size_t w = 0; w < nw; ++w) {
    const WheelDesc& wd = D.wheels[w];
    WheelFrame& f = frames_[w];
    WheelState& s = wheels_[w];
    if (wheelLost_[w]) {  // torn off: nothing to measure, no forces (drive torque on it goes nowhere)
      f = WheelFrame{};
      f.axis = normalized(pos(b, wd.axleLeft) - pos(b, wd.axleRight));
      continue;
    }
    f.wheel = fitNodes(b, wd.rotatingNodes);
    f.carrier = fitNodes(b, wd.carrierNodes);
    f.axis = normalized(pos(b, wd.axleLeft) - pos(b, wd.axleRight));
    f.axlePoint = (pos(b, wd.axleLeft) + pos(b, wd.axleRight)) * 0.5;
    // Absolute spin = the wheel's angular momentum about its centre line / its moment of inertia about that line.
    // Unlike the full rigid fit this is exact for any deformed tyre shape (material flowing through the flattened
    // patch), and it is measured on the same nodes the tyre and drive forces act on (collocated → no feedback
    // across the stiff bearing between wheel and knuckle).
    {
      double momentum = 0.0, inertia = 0.0;
      for (const int32_t i : wd.rotatingNodes) {
        const DVec3 d = pos(b, i) - f.wheel.center;
        const DVec3 r = d - f.axis * dot(d, f.axis);
        momentum += b.mass[i] * dot(cross(r, vel(b, i) - f.wheel.velocity), f.axis);
        inertia += b.mass[i] * dot(r, r);
      }
      f.axialInertia = inertia;
      f.spinAbs = inertia > 0.0 ? momentum / inertia : 0.0;
    }
    f.spinRel = f.spinAbs - dot(f.carrier.omega, f.axis);
    f.spinDrive = reactionFit.valid ? f.spinAbs - dot(reactionFit.omega, f.axis) : f.spinRel;
    driveOmega += shares_[w] * f.spinDrive;
    f.driveTorque = 0.0;
    f.brakeTorque = 0.0;

    // Tread contacts: Σ spring force, force-weighted normal and road point (node centre minus its sphere radius
    // plus the penetration), and the part of the spring the tread nodes carry themselves.
    double load = 0.0, mu = 0.0, crr = 0.0, nodeShare = 0.0;
    DVec3 normal, road;
    for (const int32_t i : wd.treadNodes) {
      const double fn = b.patchForce[i];
      if (!(fn > 0.0)) continue;
      const DVec3 weighted{b.patchNx[i], b.patchNy[i], b.patchNz[i]};
      // A road pushes the tread toward the hub. A contact pushing it away (the underside or back of a thin static
      // face the node rolled past) is no road for the tyre model: its node spring still acts, but it must not flip
      // the patch plane under the radial spring.
      if (dot(weighted, f.axlePoint - pos(b, i)) <= 0.0) continue;
      const ContactPairParams& pp = world.contactPair(b.material[i], b.patchMaterial[i]);
      const double omegaN = 2.0 * kPi * pp.normalFrequencyHz;
      const double penetration = fn / (b.mass[i] * omegaN * omegaN);
      load += fn;
      normal += weighted;
      road += (pos(b, i) - weighted * ((b.radius[i] - penetration) / fn)) * fn;
      mu += fn * pp.staticFriction;
      crr += fn * pp.rollingResistance;
      nodeShare += fn * pp.treadShare;
    }
    f.contact = false;
    f.load = 0.0;
    f.radialForce = 0.0;
    f.radialDamping = 0.0;
    if (load > 1.0) {
      f.normal = normalized(normal);
      f.xDir = cross(f.axis, f.normal);
      const double sinAngle = len(f.xDir);
      if (sinAngle > 0.3) {  // wheel plane crosses the surface (not lying on its sidewall)
        f.contact = true;
        f.xDir = f.xDir * (1.0 / sinAngle);
        f.yDir = cross(f.normal, f.xDir);
        f.mu = mu / load;
        f.crr = crr / load;
        const double r0 = wd.tyre.radius;
        // Radial tyre spring (A§4.7): the wheel's share of the vertical load comes from the hub's height above the
        // local road plane and acts on the hub (axle nodes), so it can do no work on the spin. (Applying the tread
        // nodes' own springs to the wheel instead couples the carcass lag into a spin torque.) Hub, not the ring's
        // centroid: the tread flattening in the patch lifts the ring's centroid as the hub drops, and a spring on
        // that height softens as it compresses — at speed the wheels hop in a 10 Hz limit cycle.
        const DVec3 roadPoint = road * (1.0 / load);
        const double height = dot(f.axlePoint - roadPoint, f.normal);
        f.patch = f.axlePoint - f.normal * height;
        const double deflection = r0 - height;
        const double wheelShare = 1.0 - nodeShare / load;
        const double k = wheelShare * wd.tyre.verticalStiffness;
        f.radialForce = deflection > 0.0 ? k * deflection : 0.0;
        f.radialDamping = 2.0 * wd.tyre.radialDamping * std::sqrt(k * f.wheel.mass);
        f.load = f.radialForce + nodeShare;
        f.loadedRadius = clampd(height, 0.3 * r0, r0);
        const DVec3 toPatch = f.patch - f.axlePoint;
        const DVec3 radial = toPatch - f.axis * dot(toPatch, f.axis);
        f.rollRadius = r0 - (r0 - f.loadedRadius) / 3.0;  // effective rolling radius of a radial tyre
        // Effective contact point: on the radial line to the patch, at the rolling radius. Forces act there so the
        // tyre's power is exactly F·v_slip (always dissipative, A§4.7).
        f.contactPoint = f.axlePoint + radial * (f.rollRadius / std::max(1e-9, std::sqrt(dot(radial, radial)))) +
                         f.axis * dot(toPatch, f.axis);
        // Contact velocity without spin: the wheel's own translation (collocated with the applied force; the small
        // camber-rate scrub of the patch is neglected).
        const DVec3 vp = f.wheel.velocity;
        f.vx = dot(vp, f.xDir);
        f.slipVx = f.vx - f.spinAbs * f.rollRadius;
        f.slipVy = dot(vp, f.yDir);
        s.kinematicSlip = -f.slipVx / std::max(std::fabs(f.vx), 1.0);
      }
    }
    if (!f.contact) {
      s.rhoX = 0.0;
      s.rhoY = 0.0;
      s.kinematicSlip = 0.0;
    }
  }

  if (D.centre.active) {  // the gearbox output shaft turns with the rear (primary) axle
    const AxleDesc& ra = D.axles[static_cast<size_t>(D.centre.rearAxle)];
    driveOmega = 0.5 * (frames_[static_cast<size_t>(ra.leftWheel)].spinDrive + frames_[static_cast<size_t>(ra.rightWheel)].spinDrive);
  }

  // ---- active centre coupling: capacity follows the axle loads (applies from the next step) ----------------------
  if (D.centre.active) {
    const AxleDesc& fa = D.axles[static_cast<size_t>(D.centre.frontAxle)];
    const AxleDesc& ra = D.axles[static_cast<size_t>(D.centre.rearAxle)];
    const double front = frames_[static_cast<size_t>(fa.leftWheel)].load + frames_[static_cast<size_t>(fa.rightWheel)].load;
    const double rear = frames_[static_cast<size_t>(ra.leftWheel)].load + frames_[static_cast<size_t>(ra.rightWheel)].load;
    if (front + rear > 1.0) {
      const double target = clampd(front / (front + rear), D.centre.minFront, D.centre.maxFront);
      const double maxStep = D.centre.rate * dt;
      frontShare_ += clampd(target - frontShare_, -maxStep, maxStep);
    }
    for (size_t w = 0; w < nw; ++w) shares_[w] = 0.0;
    shares_[static_cast<size_t>(fa.leftWheel)] = shares_[static_cast<size_t>(fa.rightWheel)] = 0.5 * frontShare_;
    shares_[static_cast<size_t>(ra.leftWheel)] = shares_[static_cast<size_t>(ra.rightWheel)] = 0.5 * (1.0 - frontShare_);
  }

  // ---- damage → function (§4.4) ------------------------------------------------------------------------------
  updateDamage(b, dt, speed);

  // ---- steering ------------------------------------------------------------------------------------------------
  if (D.steeringChannel >= 0) {
    double target = clampd(input_.steer, -1.0, 1.0);
    // A damaged rack: a dead band around the centre and a pull to one side; jammed, it stays where it is.
    if (steerPlay_ > 0.0) target = std::copysign(std::max(0.0, std::fabs(target) - steerPlay_) / (1.0 - steerPlay_), target);
    target = clampd(target + steerPull_, -1.0, 1.0);
    if (steerJammed_) target = steer_;
    const double maxStep = D.steeringRate * dt;
    steer_ += clampd(target - steer_, -maxStep, maxStep);
    b.hydroInputs[static_cast<size_t>(D.steeringChannel)] = static_cast<float>(steer_);
  }

  // ---- gearbox, clutch, engine, driveline ---------------------------------------------------------------------
  const EngineDesc& E = D.engine;
  const TransmissionDesc& T = D.transmission;
  updateGearbox(dt, speed, driveOmega);
  const double throttleIn = clampd(input_.throttle, 0.0, 1.0);
  const double rpm = engineOmega_ * kRadToRpm;
  const bool shifting = shiftTimer_ > 0.0;
  {
    double target = 0.0;
    if (gear_ != 0 && !shifting && running_) {
      const double rpmIn = std::fabs(driveOmega * gearRatio(gear_)) * kRadToRpm;
      const double launch = E.idleRpm + 250.0 + throttleIn * (T.launchRpm - E.idleRpm - 250.0);
      const double engage = smoothstep((rpm - E.idleRpm - 100.0) / std::max(50.0, launch - E.idleRpm - 100.0));
      const double lock = smoothstep((rpmIn - E.idleRpm - 50.0) / 400.0);
      target = std::max(engage, lock);
    }
    const double rate = target > clutch_ ? 12.0 : 25.0;  // [1/s] engage in ~80 ms, open in 40 ms
    clutch_ += clampd(target - clutch_, -rate * dt, rate * dt);
  }
  double throttle = throttleIn;
  if (shifting && gear_ > 0 && pendingGear_ > gear_) throttle = 0.0;  // upshift: ignition cut
  if (shifting && pendingGear_ > 0 && pendingGear_ < gear_) {          // downshift: blip to the new gear's speed
    throttle = engineOmega_ < std::fabs(driveOmega * gearRatio(pendingGear_)) ? 1.0 : 0.0;
  }
  if (rpm > E.limiterRpm) limiterCut_ = true;
  if (limiterCut_ && rpm < E.limiterRpm - 150.0) limiterCut_ = false;
  const double idleThrottle = clampd((E.idleRpm + 50.0 - rpm) * 0.002, 0.0, 0.5);
  double engineTorqueNet;
  if (running_) {
    if (rpm < E.stallRpm && clutch_ > 0.3) running_ = false;
  } else if ((clutch_ < 0.05 || gear_ == 0) && throttleIn > 0.05) {
    running_ = !engineFailed_;  // starter (a ruined engine does not start)
    engineOmega_ = std::max(engineOmega_, E.idleRpm / kRadToRpm);
  }
  // Traction control (§9): a feed-forward engine torque limit from the driven wheels' measured loads at a nominal
  // µ = 1 (what the car's sensors could estimate on dry asphalt), trimmed by integral feedback on the driven wheels'
  // slip so it also works on low-µ surfaces.
  // The feed-forward limit is the total wheel torque at which the first driven wheel reaches its grip (each wheel gets
  // its fixed share of the total through the open differentials).
  double driveSlip = 0.0, tractionTorque = std::numeric_limits<double>::infinity();
  for (size_t w = 0; w < nw; ++w) {
    const WheelFrame& f = frames_[w];
    if (shares_[w] <= 0.0) continue;
    const double capacity = f.contact ? D.wheels[w].tyre.mu * f.load * f.rollRadius : 0.0;
    tractionTorque = std::min(tractionTorque, capacity / shares_[w]);
    if (f.contact) driveSlip = std::max(driveSlip, -f.slipVx / std::max(std::fabs(f.vx), 2.0));
  }
  if (!std::isfinite(tractionTorque)) tractionTorque = 0.0;
  const double gearNow = gearRatio(gear_);
  double tcsClutchLimit = std::numeric_limits<double>::infinity();
  if (D.electronics.tcs && input_.tcs && !electricalFailed_ && gear_ != 0 && gearNow != 0.0) {
    // Integral trim on the feed-forward limit: cut ≈ 3×/s per 0.1 excess slip, raise ≤ 2/s while the slip is below the
    // target. The feed-forward (µ·Fz at the weakest wheel) ignores load sensitivity, the slip curve and the engine's own
    // inertia, so the trim may raise it up to 1.5× — but only while the limit actually binds (no wind-up otherwise).
    const double excess = driveSlip - D.electronics.tcsSlip;
    const double engineRpm = engineOmega_ * kRadToRpm;
    const double drag = engineRpm > 0.0 ? E.frictionTorque + E.frictionPerRpm * engineRpm : 0.0;
    const double full = engineTorque(engineRpm, 1.0) + drag;
    const double limitThrottle = [&] {
      const double limit = tcsFactor_ * tractionTorque / (std::fabs(gearNow) * T.efficiency);
      return full > 0.0 ? clampd((limit + drag) / full, 0.0, 1.0) : 1.0;
    }();
    const bool binding = throttle > limitThrottle;
    const double rate = clampd(30.0 * excess, -2.0, 6.0);
    if (rate > 0.0 || binding) tcsFactor_ = clampd(tcsFactor_ - dt * rate, 0.2, 1.5);
    else if (tcsFactor_ > 1.0) tcsFactor_ = std::max(1.0, tcsFactor_ - 2.0 * dt);
    else tcsFactor_ = std::min(1.0, tcsFactor_ - dt * rate);
    const double limit = tcsFactor_ * tractionTorque / (std::fabs(gearNow) * T.efficiency);  // at the engine
    if (full > 0.0) throttle = std::min(throttle, clampd((limit + drag) / full, 0.0, 1.0));
    // The clutch also slips at the limit, so re-engaging after a shift cannot dump the flywheel into the tyres.
    tcsClutchLimit = std::max(1.3 * limit, 30.0);
  } else {
    tcsFactor_ = 1.0;
  }
  // Overheating derates the engine; a worn one has lost up to half its power.
  const double health = derate_ * (1.0 - 0.5 * engineWear_);
  const double appliedThrottle = running_ ? (limiterCut_ ? 0.0 : std::max(throttle * health, idleThrottle)) : 0.0;
  engineTorqueNet = engineTorque(engineOmega_ * kRadToRpm, appliedThrottle);

  const double G = gearRatio(gear_);
  const double capacity = std::min(clutch_ * T.clutchMaxTorque, tcsClutchLimit);
  double clutchTorque = 0.0;
  if (G == 0.0 || capacity <= 0.0) {
    windup_ = 0.0;
  } else {
    const double k = T.drivelineStiffness / (G * G), c = T.drivelineDamping / (G * G);
    const double slip = engineOmega_ - G * driveOmega;
    windup_ += slip * dt;
    clutchTorque = k * windup_ + c * slip;
    if (std::fabs(clutchTorque) > capacity) {
      clutchTorque = std::copysign(capacity, clutchTorque);
      windup_ = clutchTorque / k;  // the clutch slips: drag the spring's anchor (return mapping)
    }
  }
  engineOmega_ = std::max(0.0, engineOmega_ + (engineTorqueNet - clutchTorque) / E.inertia * dt);
  lastPower_ = running_ ? std::max(0.0, engineTorqueNet * engineOmega_) : 0.0;
  if (G != 0.0) {
    const double power = clutchTorque * G * driveOmega;
    const double output = clutchTorque * G * (power >= 0.0 ? T.efficiency : 1.0 / T.efficiency);
    if (D.centre.active) {
      // Multi-plate centre coupling (PTM / Haldex type): the gearbox drives the rear axle directly and the clutch
      // passes up to frontShare·|output| to the front axle — always from the faster to the slower side, so it can
      // never drive the front wheels faster than the rear ones (an unloaded front wheel does not keep its torque and
      // spin up, which with fixed shares starts a power-hop limit cycle through the pitch mode at speed).
      const AxleDesc& fa = D.axles[static_cast<size_t>(D.centre.frontAxle)];
      const AxleDesc& ra = D.axles[static_cast<size_t>(D.centre.rearAxle)];
      WheelFrame& fl = frames_[static_cast<size_t>(fa.leftWheel)];
      WheelFrame& fr = frames_[static_cast<size_t>(fa.rightWheel)];
      WheelFrame& rl = frames_[static_cast<size_t>(ra.leftWheel)];
      WheelFrame& rr = frames_[static_cast<size_t>(ra.rightWheel)];
      const double cap = frontShare_ * std::fabs(output);
      const double c = std::min(cap / 0.3, 2000.0);  // full lock at 0.3 rad/s axle speed difference
      double coupling = clampd(c * (0.5 * (rl.spinDrive + rr.spinDrive - fl.spinDrive - fr.spinDrive)), -cap, cap);
      // §4.4 a broken rear half shaft: the open rear differential spins the broken side up, the coupling slips at its
      // capacity and the front axle alone drives.
      if (driveLost_[static_cast<size_t>(ra.leftWheel)] || driveLost_[static_cast<size_t>(ra.rightWheel)]) {
        coupling = clampd(output, -cap, cap);
      }
      fl.driveTorque = fr.driveTorque = 0.5 * coupling;
      rl.driveTorque = rr.driveTorque = 0.5 * (output - coupling);
    } else {
      for (size_t w = 0; w < nw; ++w) frames_[w].driveTorque = shares_[w] * output;
    }
    for (const AxleDesc& a : D.axles) {  // limited-slip coupling moves torque from the faster to the slower wheel
      WheelFrame& l = frames_[static_cast<size_t>(a.leftWheel)];
      WheelFrame& r = frames_[static_cast<size_t>(a.rightWheel)];
      const double axleTorque = l.driveTorque + r.driveTorque;
      const double cap = a.lsdPreload + (axleTorque >= 0.0 ? a.lsdLockDrive : a.lsdLockCoast) * std::fabs(axleTorque);
      if (cap <= 0.0) continue;
      const double c = std::min(cap / 0.5, 400.0);  // full lock at 0.5 rad/s speed difference (stable at 2 kHz)
      const double lock = clampd(c * (l.spinDrive - r.spinDrive), -cap, cap);
      l.driveTorque -= lock;
      r.driveTorque += lock;
    }
    // §4.4 a broken half shaft / CV joint: the axle's differential spins the broken side, neither wheel is driven.
    for (const AxleDesc& a : D.axles) {
      if (!driveLost_[static_cast<size_t>(a.leftWheel)] && !driveLost_[static_cast<size_t>(a.rightWheel)]) continue;
      frames_[static_cast<size_t>(a.leftWheel)].driveTorque = 0.0;
      frames_[static_cast<size_t>(a.rightWheel)].driveTorque = 0.0;
    }
  }

  // ---- brakes with ABS ---------------------------------------------------------------------------------------
  const double pedal = clampd(input_.brake, 0.0, 1.0), handbrake = clampd(input_.handbrake, 0.0, 1.0);
  for (size_t w = 0; w < nw; ++w) {
    const WheelDesc& wd = D.wheels[w];
    WheelFrame& f = frames_[w];
    WheelState& s = wheels_[w];
    if (D.electronics.abs && input_.abs && !electricalFailed_ && pedal > 0.0 && f.contact && std::fabs(f.vx) > 2.0) {
      // Slip-tracking modulator: pressure moves with the slip error around the target (integral action), and dumps
      // fast when the wheel heads for lock-up.
      const double error = s.kinematicSlip + D.electronics.absSlip;  // < 0: slipping more than the target
      const double rate = s.kinematicSlip < -2.5 * D.electronics.absSlip ? -30.0 : clampd(60.0 * error, -15.0, 6.0);
      s.absFactor = clampd(s.absFactor + rate * dt, 0.0, 1.0);
    } else {
      s.absFactor = 1.0;
    }
    const double cap = wd.brakeTorque * pedal * s.absFactor * brakeFactor_[w] + wd.handbrakeTorque * handbrake;
    s.brakeAngle += f.spinRel * dt;
    double torque = -(D.brakes.stiffness * s.brakeAngle + D.brakes.damping * f.spinRel);
    if (std::fabs(torque) > cap) {
      torque = std::copysign(cap, torque);
      s.brakeAngle = -torque / D.brakes.stiffness;
    }
    f.brakeTorque = torque;
  }

  // ---- radial tyre spring-damper (wheel share of the vertical load) --------------------------------------------
  // Spring: work booked as external (its energy is not a node potential); damper: dissipation.
  for (size_t w = 0; w < nw; ++w) {
    const WheelDesc& wd = D.wheels[w];
    const WheelFrame& f = frames_[w];
    if (!f.contact) continue;
    // Split evenly over the two axle nodes: its power is then F·v of their midpoint, the point the height is
    // measured at.
    const double vn = dot((vel(b, wd.axleLeft) + vel(b, wd.axleRight)) * 0.5, f.normal);
    const double damping = std::max(-f.radialDamping * vn, -f.radialForce);  // never pull the tyre down
    const DVec3 spring = f.normal * (0.5 * f.radialForce), damper = f.normal * (0.5 * damping);
    addForce(b, wd.axleLeft, spring, track, Ledger::kExternal);
    addForce(b, wd.axleRight, spring, track, Ledger::kExternal);
    addForce(b, wd.axleLeft, damper, track, Ledger::kFriction);
    addForce(b, wd.axleRight, damper, track, Ledger::kFriction);
  }

  // ---- tyre forces -------------------------------------------------------------------------------------------
  for (size_t w = 0; w < nw; ++w) {
    const WheelDesc& wd = D.wheels[w];
    const TyreParams& t = wd.tyre;
    WheelFrame& f = frames_[w];
    WheelState& s = wheels_[w];
    WheelTelemetry& tel = telemetry_.wheels[w];
    tel.forceX = 0.0f;
    tel.forceY = 0.0f;
    if (!f.contact) continue;
    // Transient slip (Pacejka 2012 §7.2): dρ/dt = v_s − |V_x|·ρ/σ, integrated implicitly; s = ρ/σ.
    const double vabs = std::fabs(f.vx);
    s.rhoX = (s.rhoX + f.slipVx * dt) / (1.0 + vabs * dt / t.relaxationX);
    s.rhoY = (s.rhoY + f.slipVy * dt) / (1.0 + vabs * dt / t.relaxationY);
    // Bound the deflection: past the peak at low speed (so it unwinds at once when the push reverses), at the
    // kinematic slip otherwise (so a locked or spinning wheel keeps its full slip).
    const double lowRef = std::max(vabs, static_cast<double>(t.lowSpeed));
    const double capX = std::max(1.5 * s.peakX, std::fabs(f.slipVx) / lowRef) * t.relaxationX;
    const double capY = std::max(1.5 * s.peakY, std::fabs(f.slipVy) / lowRef) * t.relaxationY;
    s.rhoX = clampd(s.rhoX, -capX, capX);
    s.rhoY = clampd(s.rhoY, -capY, capY);
    const double sx = s.rhoX / t.relaxationX, sy = s.rhoY / t.relaxationY;

    const double fz0 = t.nominalLoad;
    const double loadFactor = clampd(1.0 - t.loadSensitivity * (f.load - fz0) / fz0, 0.6, 1.3);
    const double peakForce = t.mu * f.mu * loadFactor * f.load;
    const double nx = sx / s.peakX, ny = sy / s.peakY;
    const double rho = std::sqrt(nx * nx + ny * ny);
    double fx = 0.0, fy = 0.0;
    if (rho > 1e-12) {
      fx = -(nx / rho) * magicFormula(t.Bx, t.Cx, t.Ex, rho * s.peakX) * peakForce;
      fy = -(ny / rho) * magicFormula(t.By, t.Cy, t.Ey, rho * s.peakY) * peakForce;
    }
    fy -= t.camberStiffness * dot(f.axis, f.normal) * f.load;
    // Low-speed damping of the contact deflection (no oscillation at standstill); stable: c·dt ≤ 0.25·m.
    const double lowWeight = clampd(1.0 - vabs / t.lowSpeed, 0.0, 1.0);
    if (lowWeight > 0.0) {
      const double spinMass = f.axialInertia / (f.rollRadius * f.rollRadius);
      fx -= lowWeight * 0.25 * spinMass / dt * f.slipVx;
      fy -= lowWeight * 0.25 * f.wheel.mass / dt * f.slipVy;
    }
    const double total = std::sqrt(fx * fx + fy * fy);
    if (total > peakForce && total > 0.0) {
      fx *= peakForce / total;
      fy *= peakForce / total;
    }
    // The tyre force acts on the wheel at the effective contact point (radius R_e), so its power is F·v_slip.
    // (Applying it to the sliding tread nodes instead would do work at their kinematic radius, not the rolling radius
    // the slip is defined with, and inject energy under drive.)
    const DVec3 force = f.xDir * fx + f.yDir * fy;
    applyAtWheel(b, wd, f.wheel, f.carrier, f.axis, f.axialInertia, force, cross(f.contactPoint - f.wheel.center, force),
                 track, Ledger::kFriction);
    // Rolling resistance acts as a moment against the spin (offset normal force), not as a patch force.
    const double spinDir = clampd(f.spinAbs * f.rollRadius / 0.05, -1.0, 1.0);
    const double rollingMoment = -t.rollingResistance * f.crr * f.load * f.loadedRadius * spinDir;
    // Self-aligning moment from the pneumatic trail (fades out towards the lateral peak).
    const double trail = t.pneumaticTrail * std::max(0.0, 1.0 - std::fabs(ny));
    applySpinTorque(b, wd.rotatingNodes, f.wheel.center, f.axis, f.axialInertia, rollingMoment, track, Ledger::kFriction);
    applyCouple(b, wd.carrierNodes, f.carrier, f.normal * -(trail * fy), track, Ledger::kFriction);
    tel.forceX = static_cast<float>(fx);
    tel.forceY = static_cast<float>(fy);
  }

  // ---- drive and brake couples ---------------------------------------------------------------------------------
  DVec3 driveReaction;
  for (size_t w = 0; w < nw; ++w) {
    const WheelDesc& wd = D.wheels[w];
    const WheelFrame& f = frames_[w];
    if (f.driveTorque != 0.0) {
      applySpinTorque(b, wd.rotatingNodes, f.wheel.center, f.axis, f.axialInertia, f.driveTorque, track, Ledger::kExternal);
      driveReaction += f.axis * -f.driveTorque;
    }
    if (f.brakeTorque != 0.0) {
      applySpinTorque(b, wd.rotatingNodes, f.wheel.center, f.axis, f.axialInertia, f.brakeTorque, track, Ledger::kFriction);
      applyCouple(b, wd.carrierNodes, f.carrier, f.axis * -f.brakeTorque, track, Ledger::kFriction);
    }
  }
  if (!D.driveReactionNodes.empty()) applyCouple(b, D.driveReactionNodes, reactionFit, driveReaction, track, Ledger::kExternal);

  // ---- aerodynamics (M1: body-level drag at the mass centre + axle downforce; per-triangle in M2) --------------
  const AeroDesc& A = D.aero;
  const double v2 = dot(vcm, vcm);
  if (v2 > 0.0 && A.dragArea > 0.0f) {
    const DVec3 dragAccel = vcm * (-0.5 * A.airDensity * A.dragArea * std::sqrt(v2) / totalMass);
    for (int i = 0; i < b.nodeCount(); ++i) {
      if (b.invMass[i] != 0.0f) addForce(b, i, dragAccel * static_cast<double>(b.mass[i]), track, Ledger::kExternal);
    }
  }
  const double q = 0.5 * A.airDensity * speed * speed;
  auto downforce = [&](const std::vector<int32_t>& nodes, double area) {
    if (nodes.empty() || area == 0.0) return;
    double m = 0.0;
    for (const int32_t i : nodes) m += b.mass[i];
    if (!(m > 0.0)) return;  // the whole axle end broke off
    const DVec3 perKg = up * (-q * area / m);
    for (const int32_t i : nodes) addForce(b, i, perKg * static_cast<double>(b.mass[i]), track, Ledger::kExternal);
  };
  downforce(A.frontNodes, A.liftAreaFront);
  downforce(A.rearNodes, A.liftAreaRear);

  // ---- telemetry -----------------------------------------------------------------------------------------------
  telemetry_.time = world.time() + dt;
  telemetry_.speed = static_cast<float>(speed);
  telemetry_.engineRpm = static_cast<float>(engineOmega_ * kRadToRpm);
  telemetry_.engineTorque = static_cast<float>(engineTorqueNet);
  telemetry_.clutchTorque = static_cast<float>(clutchTorque);
  telemetry_.gear = shiftTimer_ > 0.0 ? pendingGear_ : gear_;
  telemetry_.shifting = shiftTimer_ > 0.0;
  telemetry_.engineRunning = running_;
  telemetry_.tcsActive = D.electronics.tcs && input_.tcs && !electricalFailed_ && throttle < std::min(throttleIn, 0.999);
  telemetry_.coolantC = static_cast<float>(coolantC_);
  telemetry_.coolantL = static_cast<float>(coolantL_);
  telemetry_.oilL = static_cast<float>(oilL_);
  telemetry_.fuelL = static_cast<float>(fuelL_);
  telemetry_.oilBar = static_cast<float>(oilBar_);
  telemetry_.engineWear = static_cast<float>(engineWear_);
  telemetry_.derate = static_cast<float>(derate_);
  telemetry_.faults = faults_;
  telemetry_.airbags = airbags_;
  telemetry_.crashTime = static_cast<float>(crashTime_);
  telemetry_.crashPeakG = static_cast<float>(crashPeakG_);
  telemetry_.crashDeltaV = static_cast<float>(crashDeltaV_);
  telemetry_.throttle = static_cast<float>(appliedThrottle);
  telemetry_.brake = static_cast<float>(pedal);
  telemetry_.steer = static_cast<float>(steer_);
  telemetry_.clutch = static_cast<float>(clutch_);
  telemetry_.accelLong = static_cast<float>(accelLong_);
  telemetry_.accelLat = static_cast<float>(accelLat_);
  telemetry_.odometer = static_cast<float>(odometer_);
  telemetry_.position = toFloat(pc);
  telemetry_.forward = toFloat(fwd);
  telemetry_.up = toFloat(up);
  telemetry_.left = toFloat(left);
  for (size_t w = 0; w < nw; ++w) {
    const WheelDesc& wd = D.wheels[w];
    const WheelFrame& f = frames_[w];
    WheelState& s = wheels_[w];
    WheelTelemetry& tel = telemetry_.wheels[w];
    s.angle += f.spinRel * dt;
    if (s.angle > kPi) s.angle -= 2.0 * kPi;
    if (s.angle < -kPi) s.angle += 2.0 * kPi;
    tel.spin = static_cast<float>(f.spinRel);
    tel.angle = static_cast<float>(s.angle);
    tel.load = static_cast<float>(f.load);
    tel.slipRatio = static_cast<float>(f.contact ? -s.rhoX / wd.tyre.relaxationX : 0.0);
    tel.slipAngle = static_cast<float>(f.contact ? det::atan2(s.rhoY / wd.tyre.relaxationY, 1.0) : 0.0);
    tel.brakeTorque = static_cast<float>(f.brakeTorque);
    tel.driveTorque = static_cast<float>(f.driveTorque);
    tel.loadedRadius = static_cast<float>(f.contact ? f.loadedRadius : wd.tyre.radius);
    tel.contact = f.contact;
    tel.absActive = s.absFactor < 0.999;
    tel.center = toFloat((pos(b, wd.axleLeft) + pos(b, wd.axleRight)) * 0.5);
    tel.axis = toFloat(f.axis);
  }
}

}  // namespace sbc

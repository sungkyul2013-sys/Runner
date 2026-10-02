// §9 electronic chassis control: self-levelling air springs and ride-height levels (lift, normal, low), a lift
// system on steel springs, adaptive (skyhook) damping, active roll and pitch control, rear-axle steering.
//
// Every system acts through the corner springs the data names (ChassisDesc::corners): the controller moves a
// spring's rest length — the energy that puts into or takes out of the spring is booked as external work, as the
// hydro actuators book theirs (§5.3) — and scales its damping coefficient within the explicit integration's ceiling
// (the data's coefficient; KNOWN_ISSUES P31). Rear-axle steering drives the rear toe links as a hydro channel.
// Measurements are what the real systems' sensors give: ride-height sensors (spring length, as a lever on the arm
// reads it), the chassis frame's acceleration and the body's vertical speed at each corner.
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <string>

#include "internal.h"
#include "sbc/world.h"
#include "vehicle_impl.h"

namespace sbc {

namespace {

DVec3 at(const Body& b, int i) { return {b.px[i], b.py[i], b.pz[i]}; }
DVec3 velocity(const Body& b, int i) { return {b.vx[i], b.vy[i], b.vz[i]}; }
double clampd(double x, double lo, double hi) { return std::min(std::max(x, lo), hi); }
double approach(double x, double target, double maxStep) { return x + clampd(target - x, -maxStep, maxStep); }
void require(bool ok, const std::string& what) {
  if (!ok) throw std::invalid_argument("VehicleDesc: " + what);
}

constexpr double kLevelGain = 2.0;       // [1/s] self-levelling: offset rate per metre of height error
constexpr double kLevelDeadband = 0.003; // [m]
constexpr double kLevelFreeze = 1.5;     // [m/s²] no levelling while the car corners or brakes harder than this
constexpr double kActiveTrim = 1.5;      // [1/s] active roll / pitch feedback: offset rate per metre of travel error
constexpr double kDamperValve = 0.012;   // [s] damper valve: full range in this time
constexpr double kSkyhookSpeed = 0.03;   // [m/s] body speed in the ride band that firms a damper fully
constexpr double kWheelHopSpeed = 0.10;  // [m/s] wheel-hop speed envelope that firms a damper fully

}  // namespace

void Vehicle::initChassis(const Body& b) {
  const ChassisDesc& C = desc_.chassis;
  corners_.clear();
  if (C.rearSteerChannel >= 0) {
    require(C.rearSteerChannel < static_cast<int>(b.hydroInputs.size()), "rear steering channel out of range");
    require(C.rearSteerLock > 0.0f, "rear steering lock must be > 0");
  }
  if (C.corners.empty()) return;
  require(C.corners.size() == desc_.wheels.size(), "chassis corners: one per wheel");
  // The chassis frame as built (the model stands upright at creation).
  const DVec3 pc = at(b, desc_.refCenter);
  DVec3 fwd = at(b, desc_.refFront) - pc;
  fwd = fwd * (1.0 / std::sqrt(dot(fwd, fwd)));
  DVec3 left = at(b, desc_.refLeft) - pc;
  left = left - fwd * dot(left, fwd);
  left = left * (1.0 / std::sqrt(dot(left, left)));
  double xFront = 0.0, xRear = 0.0;
  int nFront = 0, nRear = 0;
  for (size_t w = 0; w < C.corners.size(); ++w) {
    const ChassisCornerDesc& cd = C.corners[w];
    const int n = b.nodeCount();
    require(cd.chassisNode >= 0 && cd.chassisNode < n && cd.wheelNode >= 0 && cd.wheelNode < n && cd.motionRatio > 0.0f,
            "chassis corner " + std::to_string(w) + ": nodes / motion ratio");
    CornerState c;
    for (int i = 0; i < b.beamCount(); ++i) {
      if (b.beamType[static_cast<size_t>(i)] != static_cast<uint8_t>(BeamType::kNormal)) continue;
      const int32_t a = b.beamA[static_cast<size_t>(i)], e = b.beamB[static_cast<size_t>(i)];
      if ((a == cd.chassisNode && e == cd.wheelNode) || (a == cd.wheelNode && e == cd.chassisNode)) {
        c.beam = i;
        break;
      }
    }
    require(c.beam >= 0, "chassis corner " + std::to_string(w) + ": no spring beam between its nodes");
    const DVec3 d = at(b, cd.wheelNode) - at(b, cd.chassisNode);
    c.design = std::sqrt(dot(d, d));
    c.rest0 = b.restLength[static_cast<size_t>(c.beam)];
    c.damping0 = b.damping[static_cast<size_t>(c.beam)];
    c.ratio = cd.motionRatio;
    c.lenBody = c.lenSlow = c.design;
    const WheelDesc& wd = desc_.wheels[w];
    const DVec3 hub = (at(b, wd.axleLeft) + at(b, wd.axleRight)) * 0.5 - pc;
    c.x = dot(hub, fwd);
    c.side = dot(hub, left) > 0.0 ? 1 : -1;
    c.halfTrack = std::max(std::fabs(dot(hub, left)), 0.3);
    if (c.x > 0.0) {
      xFront += c.x;
      ++nFront;
    } else {
      xRear += c.x;
      ++nRear;
    }
    corners_.push_back(c);
  }
  for (CornerState& c : corners_) c.axle = c.x > 0.0 ? 0 : 1;
  if (nFront > 0 && nRear > 0) wheelbase_ = std::max(xFront / nFront - xRear / nRear, 1.0);
}

void Vehicle::updateChassis(Body& b, double dt, double speed, DVec3 up) {
  const ChassisDesc& C = desc_.chassis;
  const double kmh = std::fabs(speed) * 3.6;
  const bool powered = !electricalFailed_;

  // ---- rear-axle steering -----------------------------------------------------------------------------------------
  if (C.rearSteerChannel >= 0) {
    const double span = std::max(1.0, static_cast<double>(C.rearSteerHighKmh - C.rearSteerLowKmh));
    const double t = clampd((kmh - C.rearSteerLowKmh) / span, 0.0, 1.0);
    const double blend = t * t * (3.0 - 2.0 * t);
    const double ratio = C.rearSteerLow + (C.rearSteerHigh - C.rearSteerLow) * blend;
    const double target = powered ? clampd(ratio * steer_ * desc_.steeringLock, -C.rearSteerLock, C.rearSteerLock) : 0.0;
    rearSteer_ = approach(rearSteer_, target, 0.35 * dt);  // electric actuator: ≈ 20°/s
    b.hydroInputs[static_cast<size_t>(C.rearSteerChannel)] = static_cast<float>(rearSteer_ / C.rearSteerLock);
  }
  telemetry_.rearSteer = static_cast<float>(rearSteer_);
  if (corners_.empty()) return;

  // ---- measurements: spring lengths (ride-height sensors), body roll and pitch over the wheels ---------------------
  // Two filters: body (80 ms: the body's own motion — bounce, pitch and roll lie under 3 Hz — without the 10–15 Hz
  // wheel hop) for the active roll and pitch, slow (0.5 s) for the level. On a 20 ms measure the active control chased
  // the wheel hop: its struts fed it, and the Maybach's wheels shook ±17 % of their load on new asphalt.
  const double body = dt / (0.08 + dt), slow = dt / (0.5 + dt);
  double travel[2][2] = {{0.0, 0.0}, {0.0, 0.0}};  // [axle][left?] wheel travel over the normal level (+: body higher), body filter
  double levelTravel[2] = {0.0, 0.0};
  int perAxle[2] = {0, 0}, perSide[2][2] = {{0, 0}, {0, 0}};
  double halfTrack[2] = {0.0, 0.0};
  for (CornerState& c : corners_) {
    const ChassisCornerDesc& cd = C.corners[static_cast<size_t>(&c - corners_.data())];
    const DVec3 d = at(b, cd.wheelNode) - at(b, cd.chassisNode);
    const double L = std::sqrt(dot(d, d));
    c.lenBody += body * (L - c.lenBody);
    c.lenSlow += slow * (L - c.lenSlow);
    const int s = c.side > 0 ? 1 : 0;
    const double normal = c.axle == 0 ? C.normalFront : C.normalRear;  // travel counted from the normal level
    travel[c.axle][s] += (c.lenBody - c.design) / c.ratio - normal;
    ++perSide[c.axle][s];
    levelTravel[c.axle] += (c.lenSlow - c.design) / c.ratio - normal;
    ++perAxle[c.axle];
    halfTrack[c.axle] = std::max(halfTrack[c.axle], c.halfTrack);
  }
  double roll[2] = {0.0, 0.0}, height[2] = {0.0, 0.0};
  for (int a = 0; a < 2; ++a) {
    for (int s = 0; s < 2; ++s) travel[a][s] /= std::max(1, perSide[a][s]);
    roll[a] = perSide[a][0] && perSide[a][1] ? (travel[a][1] - travel[a][0]) / (2.0 * halfTrack[a]) : 0.0;
    height[a] = 0.5 * (travel[a][0] + travel[a][1]);
    levelTravel[a] /= std::max(1, perAxle[a]);
  }
  const double pitch = (height[0] - height[1]) / wheelbase_;

  // ---- ride-height level --------------------------------------------------------------------------------------------
  if (!input_.lift || C.liftHeight <= 0.0f) liftBlocked_ = false;
  if (kmh > C.liftMaxKmh) liftBlocked_ = true;
  const bool lift = powered && input_.lift && !liftBlocked_ && C.liftHeight > 0.0f;
  if (C.lowHeight > 0.0f && powered) {
    lowTimer_ = kmh > C.lowAboveKmh ? lowTimer_ + dt : 0.0;
    if (lowTimer_ > 3.0) lowOn_ = true;
    if (kmh < 0.75 * C.lowAboveKmh) lowOn_ = false;
  } else {
    lowOn_ = false;
    lowTimer_ = 0.0;
  }
  const bool low = !lift && C.lowHeight > 0.0f && powered && (lowOn_ || input_.chassisMode == 2);
  telemetry_.rideLevel = static_cast<int8_t>(lift ? 1 : low ? -1 : 0);
  bool moving = false;
  const bool dynamic = std::fabs(accelLat_) > kLevelFreeze || std::fabs(accelLong_) > kLevelFreeze;
  for (int a = 0; a < 2; ++a) {
    if (perAxle[a] == 0) continue;
    const double target = lift ? (a == 0 || !C.liftFrontOnly ? C.liftHeight : 0.0) : low ? -C.lowHeight : 0.0;
    const double before = levelSym_[a];
    if (C.levelling) {
      // Air springs: hold the axle's mean height at the level (a leak or a dead compressor: not modelled).
      const double error = levelTravel[a] - target;
      if (powered && !dynamic && std::fabs(error) > kLevelDeadband) {
        levelSym_[a] = approach(levelSym_[a], levelSym_[a] - error, std::min(kLevelGain * std::fabs(error), static_cast<double>(C.heightRate)) * dt);
      }
      levelSym_[a] = clampd(levelSym_[a], -0.08, 0.10);
    } else {
      // A lift piston in series with the steel spring: it extends by the level's height (it holds when unpowered).
      if (powered) levelSym_[a] = approach(levelSym_[a], target, C.heightRate * dt);
    }
    moving = moving || std::fabs(levelSym_[a] - before) > 0.2 * C.heightRate * dt;
  }
  telemetry_.levelMoving = moving;

  // ---- active roll and pitch ------------------------------------------------------------------------------------------
  // Feed-forward from the accelerations, as body control systems work: the struts take the share of the passive roll
  // (pitch) to be removed — an offset u at one side (axle) and −u at the other turns the body by u over the half track
  // (2u over the wheelbase) — and a slow feedback trims what is left. A fast feedback alone (12/s) crossed the body's
  // pitch mode (≈ 1.2 Hz): the Maybach see-sawed ±1.2° at a steady 40 km/h, its front wheels' load swinging ±20 %.
  const double comfort = input_.chassisMode == 0 ? 0.7 : 1.0;
  const bool active = powered && std::fabs(speed) > 1.0;
  const double maxStep = C.activeRate * dt;
  if (C.activeRoll > 0.0f) {
    for (int a = 0; a < 2; ++a) {
      if (!active || perSide[a][0] == 0 || perSide[a][1] == 0) {
        rollTrim_[a] = approach(rollTrim_[a], 0.0, maxStep);
        rollU_[a] = approach(rollU_[a], 0.0, maxStep);
        continue;
      }
      // Passive roll: the body leans out of the turn (lateral acceleration to the left lifts the left side).
      const double passive = C.rollGradient * accelLat_;
      const double wanted = (1.0 - C.activeRoll * comfort) * passive;
      const double feed = -C.activeRoll * comfort * passive * halfTrack[a];
      const double error = (roll[a] - wanted) * halfTrack[a];
      rollTrim_[a] = clampd(rollTrim_[a] - kActiveTrim * error * dt, -C.activeTravel, C.activeTravel);
      rollU_[a] = clampd(approach(rollU_[a], feed + rollTrim_[a], maxStep), -C.activeTravel, C.activeTravel);
    }
  }
  if (C.activePitch > 0.0f) {
    if (!active) {
      pitchTrim_ = approach(pitchTrim_, 0.0, maxStep);
      pitchU_ = approach(pitchU_, 0.0, maxStep);
    } else {
      const double passive = C.pitchGradient * accelLong_;
      const double wanted = (1.0 - C.activePitch * comfort) * passive;
      const double feed = -C.activePitch * comfort * passive * 0.5 * wheelbase_;
      const double error = (pitch - wanted) * 0.5 * wheelbase_;
      pitchTrim_ = clampd(pitchTrim_ - kActiveTrim * error * dt, -C.activeTravel, C.activeTravel);
      pitchU_ = clampd(approach(pitchU_, feed + pitchTrim_, maxStep), -C.activeTravel, C.activeTravel);
    }
  }
  telemetry_.activeOffset = static_cast<float>(std::max({std::fabs(rollU_[0]), std::fabs(rollU_[1]), std::fabs(pitchU_)}));

  // ---- apply: spring rest lengths and damping ---------------------------------------------------------------------
  const double floor = input_.chassisMode == 0 ? C.dampingMin : input_.chassisMode == 1 ? 0.5 * (1.0 + C.dampingMin) : 1.0;
  double dampSum = 0.0, heightSum = 0.0;
  for (CornerState& c : corners_) {
    const ChassisCornerDesc& cd = C.corners[static_cast<size_t>(&c - corners_.data())];
    const size_t i = static_cast<size_t>(c.beam);
    c.offset = levelSym_[c.axle] + c.side * rollU_[c.axle] + (c.axle == 0 ? pitchU_ : -pitchU_);
    if (!b.broken[i]) {
      const double next = c.rest0 + c.ratio * c.offset;
      const DVec3 d = at(b, cd.wheelNode) - at(b, cd.chassisNode);
      const double L = std::sqrt(dot(d, d));
      const double before = L - b.restLength[i], after = L - next;
      b.losses.external += 0.5 * b.stiffness[i] * (after * after - before * before);
      b.restLength[i] = static_cast<float>(next);
      // Skyhook on the body's own motion (CDC-style): soft by default, firmed in proportion to the body's vertical
      // speed in its ride band (0.3–4 Hz: bounce, pitch, roll) while the damper force works against it (the body
      // moving the way the spring stretches). Road texture above the band leaves the dampers soft; a grade's
      // steady climb is below it.
      double target = 1.0;
      if (C.adaptiveDamping && powered) {
        const double vBody = dot(velocity(b, cd.chassisNode), up);
        c.bodyVelFast += (dt / (0.04 + dt)) * (vBody - c.bodyVelFast);
        c.bodyVelLow += (dt / (0.5 + dt)) * (vBody - c.bodyVelLow);
        const double band = c.bodyVelFast - c.bodyVelLow;
        const DVec3 dir = d * (1.0 / std::max(L, 1e-9));
        const double stretch = dot(velocity(b, cd.wheelNode) - velocity(b, cd.chassisNode), dir);
        const double demand = band * stretch > 0.0 ? std::min(1.0, std::fabs(band) / kSkyhookSpeed) : 0.0;
        // Wheel control: the wheel's own hop (the spring's stretch speed above ≈ 5 Hz, its envelope over 50 ms)
        // firms the damper too, so a heavy wheel does not pound on a broken surface.
        c.stretchLow += (dt / (0.03 + dt)) * (stretch - c.stretchLow);
        c.hopEnvelope += (dt / (0.05 + dt)) * (std::fabs(stretch - c.stretchLow) - c.hopEnvelope);
        const double wheel = std::min(1.0, c.hopEnvelope / kWheelHopSpeed);
        target = floor + (1.0 - floor) * std::max(demand, wheel);
      }
      c.damp = approach(c.damp, target, dt / kDamperValve);
      b.damping[i] = static_cast<float>(c.damping0 * c.damp);
    }
    dampSum += c.damp;
    heightSum += (c.lenSlow - c.design) / c.ratio - (c.axle == 0 ? C.normalFront : C.normalRear);
  }
  telemetry_.damperScale = static_cast<float>(dampSum / static_cast<double>(corners_.size()));
  telemetry_.rideHeight = static_cast<float>(heightSum / static_cast<double>(corners_.size()));
  telemetry_.rollAngle = static_cast<float>(0.5 * (roll[0] + roll[1]));
  telemetry_.pitchAngle = static_cast<float>(pitch);
}

}  // namespace sbc

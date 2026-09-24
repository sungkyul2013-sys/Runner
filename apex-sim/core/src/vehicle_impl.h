// SoftBodyCore — vehicle controller internals (see sbc/vehicle.h). Not part of the public API.
#pragma once

#include <cstdint>
#include <vector>

#include "sbc/body.h"
#include "sbc/vehicle.h"

namespace sbc {

class World;

// Mass-weighted rigid-body fit of a node set: centre, mean velocity, angular velocity Ω = I⁻¹·L and the inverse
// inertia tensor (for pure couples). Double precision, fixed summation order.
struct RigidFit {
  DVec3 center, velocity, omega;
  double invInertia[9] = {};
  double mass = 0.0;
  bool valid = false;
};

class Vehicle {
 public:
  Vehicle(const VehicleDesc& desc, int bodyIndex, const Body& body);

  // One fixed step: reads the body state (positions, velocities, this step's tread contact patch) and adds the
  // vehicle's forces to the body's force accumulators.
  void step(const World& world, Body& body, bool trackEnergy);

  const VehicleDesc& desc() const { return desc_; }
  int bodyIndex() const { return body_; }
  VehicleInput& input() { return input_; }
  const VehicleInput& input() const { return input_; }
  const VehicleTelemetry& telemetry() const { return telemetry_; }

  // Feeds every state variable that influences the future into a hash (A§4.5).
  template <typename Hash>
  void hashState(Hash& h) const {
    h.value(input_.throttle); h.value(input_.brake); h.value(input_.steer); h.value(input_.handbrake);
    h.value(input_.mode); h.value(input_.shiftRequest); h.value(input_.abs); h.value(input_.tcs);
    h.value(engineOmega_); h.value(windup_); h.value(clutch_); h.value(steer_); h.value(shiftTimer_);
    h.value(sinceShift_); h.value(tcsFactor_); h.value(frontShare_); h.value(gear_); h.value(pendingGear_); h.value(running_); h.value(limiterCut_);
    h.value(prevVelocity_.x); h.value(prevVelocity_.y); h.value(prevVelocity_.z);
    h.value(accelLong_); h.value(accelLat_); h.value(odometer_);
    for (const WheelState& w : wheels_) {
      h.value(w.rhoX); h.value(w.rhoY); h.value(w.brakeAngle); h.value(w.absFactor); h.value(w.angle);
    }
    for (const uint8_t lost : wheelLost_) h.value(lost);
    h.value(wrecked_);
    h.value(coolantL_); h.value(oilL_); h.value(fuelL_); h.value(coolantC_); h.value(engineWear_); h.value(lastPower_);
    h.value(engineFailed_); h.value(faults_);
    for (size_t i = 0; i < sensorLong_.size(); ++i) { h.value(sensorLong_[i]); h.value(sensorLat_[i]); }
    h.value(sensorAt_); h.value(sensorFill_); h.value(airbags_); h.value(crashTime_); h.value(crashPeakG_); h.value(crashDeltaV_);
    h.value(crashEvents_); h.value(eventActive_); h.value(eventStart_); h.value(eventPeakG_); h.value(eventPeakForce_);
    h.value(eventDeltaV_); h.value(eventAbsorbed0_); h.value(eventAbsorbed_); h.value(eventQuiet_); h.value(eventSpeed_);
    h.value(eventPosition_.x); h.value(eventPosition_.y); h.value(eventPosition_.z);
    h.value(eventVelocity_.x); h.value(eventVelocity_.y); h.value(eventVelocity_.z);
    h.value(quietTime_); h.value(quietPosition_.x); h.value(quietPosition_.y); h.value(quietPosition_.z);
    h.value(quietVelocity_.x); h.value(quietVelocity_.y); h.value(quietVelocity_.z);
  }

 private:
  struct WheelState {
    double rhoX = 0.0, rhoY = 0.0;  // contact deflection (transient slip) state [m]
    double brakeAngle = 0.0;        // stick-phase twist of the brake [rad]
    double absFactor = 1.0;         // ABS pressure modulation [0, 1]
    double angle = 0.0;             // render spin angle [rad]
    double peakX = 0.1, peakY = 0.15;  // slip at the Magic Formula peak (from B, C, E) [-]
    double kinematicSlip = 0.0;     // κ from wheel and ground speed (ABS sensor) [-]
  };

  // §4.4: link severities from the body's damage groups, fluids, temperatures and engine wear for this step; sets the
  // modifiers below (vehicle_damage.cpp).
  void updateDamage(const Body& body, double dt, double speed);
  double gearRatio(int gear) const;  // incl. final drive; negative in reverse
  void updateGearbox(double dt, double speed, double wheelSideOmega);
  double engineTorque(double rpm, double throttle) const;  // net brake torque [N·m]

  VehicleDesc desc_;
  int body_ = -1;
  VehicleInput input_;
  VehicleTelemetry telemetry_;
  std::vector<WheelState> wheels_;

  double engineOmega_ = 0.0;  // [rad/s]
  double windup_ = 0.0;       // lumped driveline twist, engine side [rad]
  double clutch_ = 0.0;       // engagement [0, 1]
  double steer_ = 0.0;        // rack command [−1, 1]
  double shiftTimer_ = 0.0;   // remaining torque interruption [s]
  double sinceShift_ = 10.0;  // [s]
  double tcsFactor_ = 1.0;    // traction-control torque factor [0, 1]
  double frontShare_ = 0.0;   // active centre coupling: current front-axle share of the drive torque [-]
  std::vector<double> shares_;  // current drive share per wheel
  int gear_ = 0, pendingGear_ = 0;
  bool running_ = true, limiterCut_ = false;
  DVec3 prevVelocity_;        // mass-centre velocity of the previous step [m/s]
  double accelLong_ = 0.0, accelLat_ = 0.0, odometer_ = 0.0;
  bool firstStep_ = true;
  // Parts torn off the body (§4.3 island split): a lost wheel no longer takes drive, brake or tyre forces; a lost
  // chassis reference (the car broke apart) switches the controller off.
  std::vector<uint8_t> wheelLost_;
  bool wrecked_ = false;

  // §4.4 damage → function: fluids [L], coolant temperature [°C], engine wear [0, 1], last step's engine output [W],
  // and the modifiers the damage links set each step.
  double coolantL_ = 0.0, oilL_ = 0.0, fuelL_ = 0.0, coolantC_ = 0.0, engineWear_ = 0.0, lastPower_ = 0.0;
  bool engineFailed_ = false;  // overheated, seized or out of fuel: will not start again
  uint32_t faults_ = 0;
  double derate_ = 1.0, oilBar_ = 0.0;
  double steerPlay_ = 0.0, steerPull_ = 0.0;
  bool steerJammed_ = false, electricalFailed_ = false;
  int gearsLost_ = 0;
  std::vector<uint8_t> driveLost_;   // per wheel
  std::vector<double> brakeFactor_;  // per wheel

  // §4.4 crash sensor: the cabin reference node's chassis-frame velocity over the last 50 ms (ring buffer).
  std::vector<double> sensorLong_, sensorLat_;
  size_t sensorAt_ = 0, sensorFill_ = 0;
  uint32_t airbags_ = 0;
  double crashTime_ = -1.0, crashPeakG_ = 0.0, crashDeltaV_ = 0.0;
  // Crash events (VehicleTelemetry::crashEvents …).
  int32_t crashEvents_ = 0;
  bool eventActive_ = false;
  double eventStart_ = 0.0, eventPeakG_ = 0.0, eventPeakForce_ = 0.0, eventDeltaV_ = 0.0, eventAbsorbed0_ = 0.0;
  double eventAbsorbed_ = 0.0, eventQuiet_ = 0.0, eventSpeed_ = 0.0;
  DVec3 eventPosition_{}, eventVelocity_{};
  // The last quiet sample (under 1 g) before an event: its onset, before a soft first contact slows the cabin.
  double quietTime_ = -1.0;
  DVec3 quietPosition_{}, quietVelocity_{};

  // Per-step scratch (no allocation in step()).
  struct WheelFrame {
    RigidFit wheel, carrier;
    DVec3 axis, axlePoint, xDir, yDir, normal, patch, contactPoint;
    double axialInertia = 0.0;  // rotating nodes about the axle line [kg·m²]
    double radialForce = 0.0;       // wheel share of the vertical load: radial tyre spring [N]
    double radialDamping = 0.0;     // radial damper coefficient [N·s/m]
    double spinAbs = 0.0, spinRel = 0.0, spinDrive = 0.0, load = 0.0, mu = 1.0, crr = 0.0, loadedRadius = 0.0, rollRadius = 0.0;
    double vx = 0.0, slipVx = 0.0, slipVy = 0.0;
    double driveTorque = 0.0, brakeTorque = 0.0;
    bool contact = false;
  };
  std::vector<WheelFrame> frames_;
};

}  // namespace sbc

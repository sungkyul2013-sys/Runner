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
    h.value(sinceShift_); h.value(tcsFactor_); h.value(gear_); h.value(pendingGear_); h.value(running_); h.value(limiterCut_);
    h.value(prevVelocity_.x); h.value(prevVelocity_.y); h.value(prevVelocity_.z);
    h.value(accelLong_); h.value(accelLat_); h.value(odometer_);
    for (const WheelState& w : wheels_) {
      h.value(w.rhoX); h.value(w.rhoY); h.value(w.brakeAngle); h.value(w.absFactor); h.value(w.angle);
    }
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
  int gear_ = 0, pendingGear_ = 0;
  bool running_ = true, limiterCut_ = false;
  DVec3 prevVelocity_;        // mass-centre velocity of the previous step [m/s]
  double accelLong_ = 0.0, accelLat_ = 0.0, odometer_ = 0.0;
  bool firstStep_ = true;

  // Per-step scratch (no allocation in step()).
  struct WheelFrame {
    RigidFit wheel, carrier;
    DVec3 axis, axlePoint, xDir, yDir, normal, patch, contactPoint;
    double axialInertia = 0.0;  // rotating nodes about the axle line [kg·m²]
    DVec3 shareForce, shareMoment;  // wheel share of the tread contact springs (moment about the wheel centre)
    double radialStiffness = 0.0;   // Σ wheel-share contact stiffness of the tread nodes in contact [N/m]
    double spinAbs = 0.0, spinRel = 0.0, spinDrive = 0.0, load = 0.0, mu = 1.0, crr = 0.0, loadedRadius = 0.0, rollRadius = 0.0;
    double vx = 0.0, slipVx = 0.0, slipVy = 0.0;
    double driveTorque = 0.0, brakeTorque = 0.0;
    bool contact = false;
  };
  std::vector<WheelFrame> frames_;
};

}  // namespace sbc

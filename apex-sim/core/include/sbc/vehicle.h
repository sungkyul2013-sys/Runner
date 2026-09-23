// SoftBodyCore — vehicle subsystem (§6 tyres, §8 powertrain, §9 brakes·steering·electronics, §10 aero).
//
// A vehicle is a controller attached to one node-beam body. Every step, after the body's internal and static contact
// forces are known, it
//   1. measures the chassis frame, each wheel's spin (rigid fit of the rotating nodes) and its tyre contact patch
//      (normal forces the contact solver reported for kTread nodes),
//   2. runs the drivers' aids and the powertrain (engine → clutch → gearbox → differentials, one lumped driveline
//      torsion spring) and the brakes (stick–slip friction couple between wheel and carrier),
//   3. computes the tyre forces with a transient Magic Formula model (relaxation lengths, combined slip, load
//      sensitivity, rolling resistance) and distributes them over the contacting tread nodes by load,
//   4. applies every torque as a mass-weighted pure couple (zero net force) on the node sets that carry it.
// The soft body therefore still owns all geometry: suspension kinematics, tyre deflection and envelopment, and the
// chassis load transfer come from the nodes and beams (ARCHITECTURE A§4.7–A§4.8).
#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "sbc/math.h"

namespace sbc {

// ---- tyre (§6) -------------------------------------------------------------------------------------------------
// Magic Formula (H. B. Pacejka, Tire and Vehicle Dynamics, 3rd ed., 2012, §4.3): F(s) = D·sin(C·atan(B·s − E·(B·s −
// atan(B·s)))) with D = µ·Fz. Longitudinal slip s = κ, lateral slip s = tan α.
struct TyreParams {
  float radius = 0.33f;             // unloaded outer radius R0 [m]
  float mu = 1.0f;                  // peak friction of this tyre on a µ = 1 reference surface [-]
  float Bx = 14.0f, Cx = 1.5f, Ex = 0.1f;    // longitudinal shape (peak near κ ≈ 0.13; locked wheel ≈ 0.8 of peak)
  float By = 11.0f, Cy = 1.35f, Ey = -0.6f;  // lateral shape (peak near α ≈ 8.5°)
  float loadSensitivity = 0.10f;    // µ(Fz) = µ·(1 − ls·(Fz − Fz0)/Fz0), clamped to [0.6, 1.3]·µ [-]
  float nominalLoad = 4000.0f;      // Fz0 [N]
  float relaxationX = 0.10f;        // σκ [m] longitudinal relaxation length
  float relaxationY = 0.30f;        // σα [m] lateral relaxation length
  float rollingResistance = 1.0f;   // multiplier on the surface pair's Crr [-]
  float pneumaticTrail = 0.035f;    // t0 [m]: self-aligning moment Mz = −t·Fy, t fades to 0 at the peak slip
  float camberStiffness = 0.8f;     // camber thrust Fyγ = −cγ·sin γ·Fz [-]
  float lowSpeed = 2.5f;            // [m/s] below this the contact deflection is extra damped (standstill stability)
  float radialDamping = 0.15f;      // ζ of the tyre's vertical (radial) damper on the wheel's share of the contact
};

// ---- wheel ------------------------------------------------------------------------------------------------------
struct WheelDesc {
  std::string name;
  int32_t axleRight = -1, axleLeft = -1;  // carrier nodes on the spin axis; axis = left − right (points left)
  std::vector<int32_t> rotatingNodes;     // rim + tyre nodes (spin together; drive/brake couples act on them)
  std::vector<int32_t> treadNodes;        // kTread subset that meets the road
  std::vector<int32_t> carrierNodes;      // knuckle / upright nodes (≥ 3, not collinear): brake reaction, spin ref
  TyreParams tyre;
  float brakeTorque = 0.0f;       // service brake at full pedal [N·m]
  float handbrakeTorque = 0.0f;   // [N·m]
  float driveShare = 0.0f;        // share of gearbox output torque (Σ over wheels = 1; open differentials) [-]
};

// Differential between two driven wheels of one axle (§8): open plus a clutch-type limited slip, locking torque
// ≤ preload + lock·|axle torque| (separate lock ratios under drive and coast).
struct AxleDesc {
  int32_t leftWheel = -1, rightWheel = -1;  // indices into VehicleDesc::wheels
  float lsdPreload = 0.0f;                  // [N·m]
  float lsdLockDrive = 0.0f, lsdLockCoast = 0.0f;  // [-]
};

// ---- powertrain (§8) ---------------------------------------------------------------------------------------------
struct EngineDesc {
  std::vector<float> torqueRpm;   // full-load torque curve: engine speed [rpm] …
  std::vector<float> torqueNm;    // … and brake torque [N·m] (piecewise linear)
  float idleRpm = 850.0f;
  float redlineRpm = 7000.0f;
  float limiterRpm = 7200.0f;     // hard fuel cut above this, resumes 150 rpm lower
  float stallRpm = 350.0f;        // the engine dies below this with the clutch engaged
  float inertia = 0.2f;           // crank + flywheel [kg·m²]
  float frictionTorque = 15.0f;   // internal friction + pumping at 0 rpm [N·m] (engine braking)
  float frictionPerRpm = 0.01f;   // [N·m/rpm]
};

struct TransmissionDesc {
  std::vector<float> ratios;      // forward gears 1..n [-]
  float reverseRatio = 3.5f;      // magnitude [-]
  float finalDrive = 3.5f;        // [-]
  float efficiency = 0.92f;       // gearbox + differentials [-]
  float shiftTime = 0.12f;        // torque interruption per shift [s]
  float clutchMaxTorque = 800.0f; // [N·m] at the engine
  float drivelineStiffness = 25000.0f;  // lumped torsional stiffness at the wheels (Σ half shafts) [N·m/rad]
  float drivelineDamping = 500.0f;      // at the wheels [N·m·s/rad] (ζ ≈ 0.3 on the 1st-gear shuffle mode)
  float upshiftRpm = 6800.0f;     // automatic mode at full throttle
  float downshiftRpm = 3200.0f;   // automatic mode at full throttle (both scale down with throttle)
  float launchRpm = 3200.0f;      // automatic clutch: engine speed at full engagement from standstill, full throttle
};

struct BrakeDesc {
  float stiffness = 1.0e5f;       // stick-phase torsional stiffness between wheel and carrier [N·m/rad]
  float damping = 40.0f;          // [N·m·s/rad]
};

// Driver aids fitted to the car (§9); the driver switches them with VehicleInput.
struct ElectronicsDesc {
  bool abs = true;
  float absSlip = 0.13f;          // target |κ| the ABS holds a braked wheel at (just past the MF peak) [-]
  bool tcs = true;
  float tcsSlip = 0.10f;          // driven-wheel κ above which TCS cuts engine torque [-]
};

struct AeroDesc {
  float airDensity = 1.225f;      // ρ [kg/m³] (ISA sea level)
  float dragArea = 0.7f;          // Cd·A [m²], acts at the mass centre
  float liftAreaFront = 0.0f;     // Cl·A [m²] (positive = downforce) on frontNodes
  float liftAreaRear = 0.0f;      // on rearNodes
  std::vector<int32_t> frontNodes, rearNodes;
};

struct VehicleDesc {
  std::string name;
  int32_t refCenter = -1, refFront = -1, refLeft = -1;  // chassis frame: forward = front − center, left ⟂ forward
  Vec3 refCenterModel;            // refCenter's position in the model frame (render binding) [m]
  std::vector<WheelDesc> wheels;
  std::vector<AxleDesc> axles;
  std::vector<int32_t> driveReactionNodes;  // chassis nodes carrying the drive-torque reaction (≥ 3, not collinear)
  EngineDesc engine;
  TransmissionDesc transmission;
  BrakeDesc brakes;
  ElectronicsDesc electronics;
  AeroDesc aero;
  int32_t steeringChannel = -1;   // hydro channel driven by the steering input (−1 = none)
  float steeringRate = 3.0f;      // max steering input change [1/s] (rack speed)
};

// ---- input / state / telemetry -----------------------------------------------------------------------------------
enum class GearMode : int8_t { kDrive = 0, kReverse = 1, kNeutral = 2, kManual = 3 };

struct VehicleInput {
  float throttle = 0.0f;   // [0, 1]
  float brake = 0.0f;      // [0, 1]
  float steer = 0.0f;      // [−1, 1], positive = left
  float handbrake = 0.0f;  // [0, 1]
  GearMode mode = GearMode::kDrive;
  int8_t shiftRequest = 0; // manual mode: +1 up / −1 down (edge; consumed when the shift starts)
  bool abs = true;         // driver switches for fitted aids
  bool tcs = true;
};

struct WheelTelemetry {
  float spin = 0.0f;        // wheel speed relative to its carrier [rad/s]
  float angle = 0.0f;       // accumulated spin angle (render) [rad]
  float load = 0.0f;        // Fz [N]
  float slipRatio = 0.0f;   // κ [-] (positive = driving)
  float slipAngle = 0.0f;   // α [rad] (positive = contact slides left)
  float forceX = 0.0f, forceY = 0.0f;  // tyre force in the patch frame [N]
  float brakeTorque = 0.0f; // applied [N·m]
  float driveTorque = 0.0f; // applied [N·m]
  float loadedRadius = 0.0f;// [m]
  bool contact = false;
  bool absActive = false;
  Vec3 center;              // body-local wheel centre [m]
  Vec3 axis;                // body-local unit spin axis (points left)
};

struct VehicleTelemetry {
  double time = 0.0;
  float speed = 0.0f;        // forward speed of the chassis frame [m/s]
  float engineRpm = 0.0f;
  float engineTorque = 0.0f; // net engine torque [N·m]
  float clutchTorque = 0.0f; // transmitted [N·m]
  int gear = 0;              // −1 R, 0 N, 1..n
  bool shifting = false;
  bool engineRunning = true;
  bool tcsActive = false;
  float throttle = 0.0f, brake = 0.0f, steer = 0.0f, clutch = 0.0f;  // applied values (after aids)
  float accelLong = 0.0f, accelLat = 0.0f;  // chassis-frame acceleration [m/s²] (filtered)
  float odometer = 0.0f;     // [m]
  Vec3 position, forward, up, left;  // chassis frame (body-local position, unit axes)
  std::vector<WheelTelemetry> wheels;
};

}  // namespace sbc

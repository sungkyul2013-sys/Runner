#include "sbc/proto_car.h"

#include <algorithm>
#include <cmath>
#include <utility>

#include "sbc/builder.h"
#include "sbc/det_math.h"
#include "sbc/scenes.h"

namespace sbc {
namespace {

constexpr double kWheelbaseHalf = 1.25;  // [m] axles at z = ±1.25 (wheelbase 2.50 m)
constexpr double kTrackHalf = 0.80;      // [m] wheel centres at x = ±0.80 (track 1.60 m)
constexpr double kTyreRadius = 0.33;     // [m] 235/40 R18-like
constexpr float kLatticeMass = 1010.0f;  // [kg]
constexpr int kNx = 5, kNy = 3, kNz = 15;
constexpr double kHalfWidth = 0.55, kBottom = 0.18, kTop = 0.62, kHalfLength = 2.0;

struct Builder {
  BodyDesc d;

  int addNode(DVec3 p, float mass, float radius = 0.03f, uint16_t material = material::kSteel) {
    NodeDesc n;
    n.position = toFloat(p);
    n.mass = mass;
    n.radius = radius;
    n.material = material;
    d.nodes.push_back(n);
    return static_cast<int>(d.nodes.size()) - 1;
  }
  DVec3 at(int i) const { return toDouble(d.nodes[static_cast<size_t>(i)].position); }
  float massOf(int i) const { return d.nodes[static_cast<size_t>(i)].mass; }
  BeamDesc& beam(int a, int b, float k, float zeta) {
    BeamDesc bd;
    bd.a = a;
    bd.b = b;
    bd.stiffness = k;
    const float ma = massOf(a), mb = massOf(b);
    bd.damping = 2.0f * zeta * std::sqrt(k * ma * mb / (ma + mb));
    d.beams.push_back(bd);
    return d.beams.back();
  }
  double distance(int a, int b) const {
    const DVec3 v = at(b) - at(a);
    return std::sqrt(dot(v, v));
  }
};

int latticeIndex(int i, int j, int k) { return (k * kNy + j) * kNx + i; }

// Hardpoint tied into the chassis lattice through the eight corners of the lattice cell around it (the cell is
// clamped to the lattice for points outside). Corners on both sides in every axis make the tie stiff in all
// directions; the nearest nodes alone often lie in one lattice plane and leave it floppy across that plane.
int hardpoint(Builder& b, DVec3 p, float mass) {
  const int h = b.addNode(p, mass);
  auto cell = [](double x, double lo, double hi, int n) {
    const int c = static_cast<int>(std::floor((x - lo) / (hi - lo) * (n - 1)));
    return std::clamp(c, 0, n - 2);
  };
  const int i0 = cell(p.x, -kHalfWidth, kHalfWidth, kNx);
  const int j0 = cell(p.y, kBottom, kTop, kNy);
  const int k0 = cell(p.z, -kHalfLength, kHalfLength, kNz);
  for (int c = 0; c < 8; ++c) {
    b.beam(h, latticeIndex(i0 + (c & 1), j0 + ((c >> 1) & 1), k0 + ((c >> 2) & 1)), 3.0e5f, 0.2f);
  }
  return h;
}

// Rodrigues rotation of p about the axis through o with unit direction k.
DVec3 rotateAbout(DVec3 p, DVec3 o, DVec3 k, double angle) {
  const DVec3 v = p - o;
  const double c = det::cos(angle), s = det::sin(angle);
  return o + v * c + cross(k, v) * s + k * (dot(k, v) * (1.0 - c));
}

struct CornerSpec {
  double side;       // +1 left, −1 right
  double axleZ;      // ±kWheelbaseHalf
  bool front;
};

struct Corner {
  int axleInner, axleOuter, kU, kL, kS, kT;
  int laFront, laRear, pivot;
  PressureWheelNodes wheel;
};

Corner buildCorner(Builder& b, const CornerSpec& c, const PressureWheelParams& tyre, float springRate, float damping,
                   float preload, float arbSide, int steeringChannel) {
  const double s = c.side, z = c.axleZ;
  Corner out{};
  // knuckle (upright): axle bearing pair, ball joints, steering arm behind the axle
  // Upright ≈ 14 kg (hub, bearing, disc, caliper). Its beams are stiff (a casting); the node masses keep the
  // Gershgorin step limit (√(2m/Σk) ≥ 0.625 ms) at the 0.8 safety factor.
  out.axleInner = b.addNode({s * 0.70, kTyreRadius, z}, 3.2f);
  out.axleOuter = b.addNode({s * 0.86, kTyreRadius, z}, 3.2f);
  out.kU = b.addNode({s * 0.66, 0.56, z}, 2.6f);
  out.kL = b.addNode({s * 0.70, 0.12, z}, 3.0f);
  // Steering arm point on the ball-joint line (at y 0.30) and 0.13 m behind it; the rack point sits on the line
  // through the inner wishbone pivots: the tie rod then moves like a third wishbone → almost no bump steer.
  out.kS = b.addNode({s * 0.6836, 0.30, z - 0.13}, 2.3f);
  // Tail node on the outboard side behind the axle: triangulates the steering arm across x (the direction the tie
  // rod pulls), which the other knuckle nodes — all near the kingpin plane — cannot.
  out.kT = b.addNode({s * 0.84, 0.20, z - 0.09}, 2.0f);
  const int knuckle[6] = {out.axleInner, out.axleOuter, out.kU, out.kL, out.kS, out.kT};
  for (int i = 0; i < 6; ++i)
    for (int j = i + 1; j < 6; ++j) b.beam(knuckle[i], knuckle[j], 2.0e6f, 0.1f);
  // chassis pickups
  const int uaF = hardpoint(b, {s * 0.30, 0.56, z + 0.16}, 1.0f);
  const int uaR = hardpoint(b, {s * 0.30, 0.56, z - 0.16}, 1.0f);
  out.laFront = hardpoint(b, {s * 0.28, 0.12, z + 0.22}, 1.0f);
  out.laRear = hardpoint(b, {s * 0.28, 0.12, z - 0.22}, 1.0f);
  const int rack = hardpoint(b, {s * 0.2882, 0.30, z - 0.13}, 1.0f);
  const int top = hardpoint(b, {s * 0.58, 0.66, z}, 4.0f);
  out.pivot = hardpoint(b, {s * 0.40, 0.12, z + arbSide * 0.30}, 1.0f);
  // wishbones
  b.beam(uaF, out.kU, 1.5e6f, 0.1f);
  b.beam(uaR, out.kU, 1.5e6f, 0.1f);
  b.beam(out.laFront, out.kL, 1.5e6f, 0.1f);
  b.beam(out.laRear, out.kL, 1.5e6f, 0.1f);
  // coilover: preloaded so the design pose carries the static corner load
  {
    BeamDesc& spring = b.beam(top, out.kL, springRate, 0.0f);
    spring.damping = damping;
    spring.restLength = static_cast<float>(b.distance(top, out.kL)) + preload / springRate;
    BeamDesc& stop = b.beam(top, out.kL, 1.5e5f, 0.05f);
    stop.type = BeamType::kBounded;
    const float length = static_cast<float>(b.distance(top, out.kL));
    stop.minLength = length - 0.07f;  // 70 mm bump travel
    stop.maxLength = length + 0.09f;  // 90 mm droop
  }
  // tie rod: steering rack (hydro) at the front, fixed toe link at the rear
  {
    BeamDesc& rod = b.beam(rack, out.kS, 1.5e6f, 0.1f);
    if (c.front && steeringChannel >= 0) {
      // Rest-length factor that turns the knuckle by the full lock (0.55 rad) about its kingpin at input 1.
      const DVec3 kp = b.at(out.kU) - b.at(out.kL);
      const DVec3 axis = kp * (1.0 / std::sqrt(dot(kp, kp)));
      const DVec3 turned = rotateAbout(b.at(out.kS), b.at(out.kL), axis, 0.55);
      const DVec3 v = turned - b.at(rack);
      rod.type = BeamType::kHydro;
      rod.hydroChannel = steeringChannel;
      rod.hydroFactor = static_cast<float>(std::sqrt(dot(v, v)) / b.distance(rack, out.kS) - 1.0);
      rod.hydroSpeed = 0.0f;  // the vehicle rate-limits the rack command
    }
  }
  // wheel
  PressureWheelParams w = tyre;
  const bool left = s > 0.0;
  w.axleRight = left ? out.axleInner : out.axleOuter;
  w.axleLeft = left ? out.axleOuter : out.axleInner;
  w.center = toFloat(DVec3{s * kTrackHalf, kTyreRadius, z});
  out.wheel = addPressureWheel(b.d, w);
  return out;
}

}  // namespace

PressureWheelParams protoTyre() {
  PressureWheelParams w;
  w.tyreRadius = static_cast<float>(kTyreRadius);
  w.treadWidth = 0.21f;
  w.rimRadius = 0.235f;
  w.rimWidth = 0.20f;
  w.treadMaterial = material::kRubber;
  w.rimMaterial = material::kSteel;
  w.rimNodeMass = 0.25f;  // 12 kg rim, 9.6 kg tread: ≈ 22 kg wheel and tyre
  return w;
}

VehicleBuild makeProtoCar(const ProtoCarOptions& o) {
  Builder b;
  b.d.name = "apex_proto";
  // chassis lattice (node indices 0 … kNx·kNy·kNz − 1)
  {
    LatticeParams lp;
    lp.size = {static_cast<float>(2 * kHalfWidth), static_cast<float>(kTop - kBottom), static_cast<float>(2 * kHalfLength)};
    lp.nx = kNx; lp.ny = kNy; lp.nz = kNz;
    lp.totalMass = kLatticeMass;
    lp.nodeRadius = 0.05f;
    lp.axialStiffness = 1.5e5f;
    lp.dampingRatio = 0.1f;
    lp.material = material::kSteel;
    BodyDesc lattice = makeLattice(lp);
    const float yMid = static_cast<float>(0.5 * (kTop + kBottom));
    for (NodeDesc& n : lattice.nodes) n.position = n.position + Vec3{0.0f, yMid, 0.0f};
    b.d.nodes = std::move(lattice.nodes);
    b.d.beams = std::move(lattice.beams);
  }
  b.d.hydroChannels = 1;
  constexpr int kSteering = 0;

  // Static corner loads for the coilover preload: sprung mass ≈ 1.13 t split evenly; spring ≈ 0.81 motion ratio.
  const float frontRate = 4.6e4f, rearRate = 5.4e4f;      // spring rates [N/m] → ≈ 30 / 35 kN/m at the wheel
  const float frontDamp = 2600.0f, rearDamp = 2900.0f;     // [N·s/m] ≈ 0.3 of critical
  const float preload = 2780.0f / 0.81f;                    // [N]
  const CornerSpec specs[4] = {{+1.0, +kWheelbaseHalf, true}, {-1.0, +kWheelbaseHalf, true},
                               {+1.0, -kWheelbaseHalf, false}, {-1.0, -kWheelbaseHalf, false}};
  Corner corners[4];
  for (int i = 0; i < 4; ++i) {
    const bool front = specs[i].front;
    corners[i] = buildCorner(b, specs[i], o.tyre, front ? frontRate : rearRate, front ? frontDamp : rearDamp, preload,
                             front ? 1.0f : -1.0f, kSteering);
  }
  // anti-roll bars: levers are the lower ball joints, pivots on the chassis 0.3 m ahead of / behind the axle
  for (int axle = 0; axle < 2; ++axle) {
    const Corner& l = corners[axle * 2];
    const Corner& r = corners[axle * 2 + 1];
    TorsionBarDesc t;
    t.arm1 = l.kL; t.pivot1 = l.pivot; t.pivot2 = r.pivot; t.arm2 = r.kL;
    t.stiffness = axle == 0 ? 1800.0f : 1000.0f;  // [N·m/rad] → ≈ 20 / 11 kN/m per wheel in roll
    t.damping = 5.0f;
    b.d.torsionBars.push_back(t);
  }

  VehicleBuild out;
  VehicleDesc& v = out.vehicle;
  v.name = "APEX Proto";
  v.refCenter = latticeIndex(2, 1, 7);
  v.refFront = latticeIndex(2, 1, 12);
  v.refLeft = latticeIndex(4, 1, 7);
  v.refCenterModel = b.d.nodes[static_cast<size_t>(v.refCenter)].position;
  const char* names[4] = {"FL", "FR", "RL", "RR"};
  for (int i = 0; i < 4; ++i) {
    const Corner& c = corners[i];
    WheelDesc w;
    w.name = names[i];
    const bool left = specs[i].side > 0.0;
    w.axleRight = left ? c.axleInner : c.axleOuter;
    w.axleLeft = left ? c.axleOuter : c.axleInner;
    w.rotatingNodes = c.wheel.all;
    w.treadNodes = c.wheel.tread;
    w.carrierNodes = {c.axleInner, c.axleOuter, c.kU, c.kL, c.kS, c.kT};
    w.tyre.radius = static_cast<float>(kTyreRadius);
    w.brakeTorque = specs[i].front ? 2400.0f : 1300.0f;
    w.handbrakeTorque = specs[i].front ? 0.0f : 1500.0f;
    w.driveShare = specs[i].front ? 0.0f : 0.5f;
    v.wheels.push_back(w);
  }
  AxleDesc rear;
  rear.leftWheel = 2;
  rear.rightWheel = 3;
  rear.lsdPreload = 60.0f;
  rear.lsdLockDrive = 0.35f;
  rear.lsdLockCoast = 0.2f;
  v.axles.push_back(rear);
  v.driveReactionNodes = {corners[2].laFront, corners[2].laRear, corners[3].laFront, corners[3].laRear};
  v.engine.torqueRpm = {1000.0f, 2000.0f, 3000.0f, 4500.0f, 6000.0f, 7000.0f, 7600.0f};
  v.engine.torqueNm = {220.0f, 300.0f, 350.0f, 390.0f, 380.0f, 350.0f, 320.0f};
  v.engine.idleRpm = 900.0f;
  v.engine.redlineRpm = 7400.0f;
  v.engine.limiterRpm = 7600.0f;
  v.engine.inertia = 0.18f;
  v.engine.frictionTorque = 12.0f;
  v.engine.frictionPerRpm = 0.008f;
  v.transmission.ratios = {3.36f, 2.24f, 1.62f, 1.26f, 1.03f, 0.84f};
  v.transmission.reverseRatio = 3.2f;
  v.transmission.finalDrive = 3.73f;
  v.transmission.efficiency = 0.92f;
  v.transmission.shiftTime = 0.12f;
  v.transmission.clutchMaxTorque = 600.0f;
  v.transmission.upshiftRpm = 7200.0f;
  v.transmission.downshiftRpm = 3500.0f;
  v.transmission.launchRpm = 3500.0f;
  v.electronics.abs = o.abs;
  v.aero.dragArea = 0.62f;
  v.steeringChannel = kSteering;
  v.steeringRate = 2.5f;

  // Spawn pose: yaw about +Y, forward speed with the wheels spinning to match.
  const double c = det::cos(o.yaw), s = det::sin(o.yaw);
  auto rotate = [c, s](Vec3 p) {
    return Vec3{static_cast<float>(c * p.x + s * p.z), p.y, static_cast<float>(-s * p.x + c * p.z)};
  };
  if (o.speed != 0.0f) {
    for (NodeDesc& n : b.d.nodes) n.velocity = {0.0f, 0.0f, o.speed};
    const double omega = o.speed / kTyreRadius;
    for (int i = 0; i < 4; ++i) {
      const DVec3 center{specs[i].side * kTrackHalf, kTyreRadius, specs[i].axleZ};
      for (const int32_t n : corners[i].wheel.all) {
        const DVec3 r = toDouble(b.d.nodes[static_cast<size_t>(n)].position) - center;
        const DVec3 spin = cross(DVec3{omega, 0.0, 0.0}, r);  // axis +X (left)
        b.d.nodes[static_cast<size_t>(n)].velocity = toFloat(DVec3{0.0, 0.0, o.speed} + spin);
      }
    }
  }
  for (NodeDesc& n : b.d.nodes) {
    n.position = rotate(n.position);
    n.velocity = rotate(n.velocity);
  }
  b.d.origin = o.position;
  out.body = std::move(b.d);
  return out;
}

}  // namespace sbc

// SoftBodyCore — simulation world: bodies, static geometry, fixed-step pipeline (ARCHITECTURE A§4.2).
#pragma once

#include <array>
#include <cstdint>
#include <memory>
#include <vector>

#include "sbc/body.h"
#include "sbc/math.h"
#include "sbc/vehicle.h"

namespace sbc {

class JobSystem;
class Vehicle;
struct ContactScratch;

inline constexpr float kDefaultDt = 0.0005f;  // [s] §4.2 fixed step, 2000 Hz
inline constexpr float kStandardGravity = 9.81f;  // [m/s²] §5.3 (spec value)

struct WorldParams {
  Vec3 gravity{0.0f, -kStandardGravity, 0.0f};  // [m/s²] world Y is up
  float dt = kDefaultDt;                         // [s]
  int threadCount = 1;                           // total threads incl. the caller
  bool trackEnergy = false;                      // per-category dissipation bookkeeping (§5.3)
};

// Contact law for one material pair (§5.2): mass-scaled penalty spring-damper along the normal and
// an elastic-plastic ("stick anchor") Coulomb friction model in the tangent plane.
struct ContactPairParams {
  float staticFriction = 0.9f;        // µs [-]
  float kineticFriction = 0.75f;      // µk [-]
  float normalFrequencyHz = 150.0f;   // penalty natural frequency f [Hz]: k = m(2πf)².
                                      // 150 Hz keeps ω·dt = 0.47 (explicit limit 2) and sags a
                                      // 1 kg node carrying 75 kg by g·75/ω² ≈ 0.8 mm.
  float normalDampingRatio = 0.7f;    // ζ [-]; restitution e = exp(−ζπ/√(1−ζ²)) ≈ 0.05
  float tangentFrequencyHz = 150.0f;  // stick-anchor spring frequency [Hz]
  float tangentDampingRatio = 1.0f;   // [-] critically damped stick spring
  float rollingResistance = 0.012f;   // Crr [-] of a tyre (kTread nodes) rolling on this pair (§11.1 table)
  // kTread nodes only: share of the contact spring force applied to the tread node itself. The rest (1 − share) is
  // reported in Body::patch* and applied by the owning vehicle to the wheel as a rigid body, so the discrete tread
  // does not hit the road node by node at speed (A§4.7). 1 = plain node contact.
  float treadShare = 1.0f;
};

struct EnergyReport {
  double kinetic = 0.0;          // Σ ½mv²
  double gravityPotential = 0.0; // Σ −m g·x (world frame)
  double beamPotential = 0.0;    // elastic energy: beams, sliders, torsion bars + gas energy of pressure groups
  double contactPotential = 0.0; // Σ ½k_n·p² of active penalty springs
  EnergyLosses losses;           // cumulative, all bodies + inter-body contacts
  double mechanical() const { return kinetic + gravityPotential + beamPotential + contactPotential; }
  // Invariant (up to integrator error): mechanical() + losses.totalDissipated() − losses.external.
  double balance() const { return mechanical() + losses.totalDissipated() - losses.external; }
};

struct MomentumReport {
  DVec3 linear;   // [kg·m/s]
  DVec3 angular;  // [kg·m²/s] about the world origin
};

struct StepStats {
  int staticContacts = 0;
  int bodyContacts = 0;
  int ccdClamps = 0;
  int beamsBroken = 0;
};

inline constexpr int kMaxMaterials = 64;  // material ids are < kMaxMaterials

class World {
 public:
  explicit World(const WorldParams& params = {});
  ~World();
  World(const World&) = delete;
  World& operator=(const World&) = delete;

  const WorldParams& params() const { return params_; }
  void setGravity(Vec3 g) { params_.gravity = g; }

  // ---- materials ----
  void setContactPair(uint16_t materialA, uint16_t materialB, const ContactPairParams& p);
  const ContactPairParams& contactPair(uint16_t materialA, uint16_t materialB) const;

  // ---- static geometry ----
  // Infinite half-space below y = height (world). Returns its surface id.
  int addGroundPlane(double height, uint16_t material);
  // One-sided triangle mesh; triangles face the side their counter-clockwise winding points to.
  // Vertices are xyz triples relative to `origin`. Returns the id of the first triangle.
  int addStaticMesh(DVec3 origin, const std::vector<float>& vertices, const std::vector<int32_t>& indices,
                    uint16_t material);
  // Axis-aligned box rotated by `yaw` [rad] about +Y, centred at `center`, half extents `half` [m].
  int addStaticBox(DVec3 center, Vec3 half, double yaw, uint16_t material);
  int staticTriangleCount() const { return static_cast<int>(staticTris_.size()); }
  // World-space vertices of static triangle t (for rendering / debug views).
  std::array<DVec3, 3> staticTriangleWorld(int t) const;

  // ---- bodies ----
  int addBody(const BodyDesc& desc);
  int bodyCount() const { return static_cast<int>(bodies_.size()); }
  const Body& body(int i) const { return bodies_[i]; }
  // Direct mutable access (tests, tools). Topology changes are not allowed through this.
  Body& mutableBody(int i) { return bodies_[i]; }
  // Adds `dv` to every non-fixed node; the kinetic-energy change is booked as external work.
  void addBodyVelocity(int body, Vec3 dv);

  // ---- vehicles (§6–§10) ----
  // Attaches a vehicle controller to body `body` (node indices in `desc` refer to that body). Returns its id.
  int addVehicle(int body, const VehicleDesc& desc);
  int vehicleCount() const { return static_cast<int>(vehicles_.size()); }
  int vehicleBody(int vehicle) const;
  const VehicleDesc& vehicleDesc(int vehicle) const;
  // Driver input, applied from the next step on (recorded per step by the caller for replays, A§4.5).
  void setVehicleInput(int vehicle, const VehicleInput& input);
  const VehicleInput& vehicleInput(int vehicle) const;
  const VehicleTelemetry& vehicleTelemetry(int vehicle) const;

  // ---- stepping ----
  void step(int count = 1);
  uint64_t stepIndex() const { return stepIndex_; }
  double time() const { return static_cast<double>(stepIndex_) * static_cast<double>(params_.dt); }
  const StepStats& lastStepStats() const { return stats_; }

  // ---- measurement (§5.3) ----
  EnergyReport measureEnergy() const;
  MomentumReport measureMomentum() const;
  // FNV-1a 64 over every state bit that influences the future (A§4.5 golden replays).
  uint64_t stateHash() const;

 private:
  struct StaticTri {
    DVec3 origin;           // mesh origin
    Vec3 v0, v1, v2;        // vertices relative to origin
    Vec3 normal;            // unit, front side
    Vec3 boundsMin, boundsMax;  // relative to origin
    uint16_t material = 0;
  };
  struct GroundPlane {
    double height = 0.0;
    uint16_t material = 0;
  };

  void stepOnce();
  void computeInternalForces(int bodyIndex);
  void integrateBody(int bodyIndex);
  void finishBody(int bodyIndex);

  WorldParams params_;
  std::unique_ptr<JobSystem> jobs_;
  std::vector<Body> bodies_;
  std::vector<StaticTri> staticTris_;
  std::vector<GroundPlane> planes_;
  std::vector<ContactPairParams> pairTable_;  // dense (kMaxMaterials²) lookup
  uint64_t stepIndex_ = 0;
  StepStats stats_;
  std::vector<StepStats> bodyStats_;
  std::vector<ContactScratch> scratch_;  // one per body
  std::vector<std::unique_ptr<Vehicle>> vehicles_;
  std::vector<std::vector<int>> bodyVehicles_;  // vehicle ids per body

  friend struct ContactSolver;
};

}  // namespace sbc

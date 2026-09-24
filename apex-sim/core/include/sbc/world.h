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
  float airDensity = 1.225f;                     // ρ [kg/m³] acting on bodies' aero panels (ISA sea level; 0: no air)
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

// Interpenetration count of the current state (KICKOFF C2 "관통"): collision nodes more than their radius behind a
// static triangle (inside its prism), nodes of one body behind a triangle of another deeper than the contact band,
// and triangle edges of one body passing through a triangle of another (surfaces intersecting between nodes).
struct PenetrationReport {
  int staticNodes = 0;
  int bodyNodes = 0;
  int bodyEdges = 0;
  int total() const { return staticNodes + bodyNodes + bodyEdges; }
};

struct StepStats {
  int staticContacts = 0;
  int bodyContacts = 0;
  int selfContacts = 0;
  int ccdClamps = 0;
  int beamsBroken = 0;
  int islandsSplit = 0;  // parts that broke loose this step and became bodies of their own (§4.3)
};

inline constexpr int kMaxMaterials = 64;  // material ids are < kMaxMaterials

// §20 sandbox tools: a spring-damper from a node to an anchor — a world point the caller moves (node grab, crane hook)
// or a node of another body (tow rope). A grab pulls its node toward the point in every direction and saturates at
// `maxForce` (its strength). A rope (`rope`) only pulls, above its length; a winch reels that length toward a target at
// `reelSpeed` while the tension stays under `maxForce` (its capacity) and pays out above it. The tether is an outside
// agent: the work of its force is booked as external (§5.3).
struct TetherDesc {
  int body = -1, node = -1;
  int anchorBody = -1, anchorNode = -1;  // −1: the anchor is the world point `anchor`
  DVec3 anchor;
  float length = 0.0f;        // [m] rope length (a grab ignores it)
  bool rope = false;
  float stiffness = 0.0f;     // [N/m] 0: the stiffest the tied node takes stably (k·dt²/m = 0.05)
  float dampingRatio = 1.0f;  // of the tied node on the spring
  float maxForce = 0.0f;      // [N] grab strength / winch capacity (0: unlimited; < 0: −maxForce × the tied body's weight)
  float reelSpeed = 0.5f;     // [m/s]
};

struct TetherState {
  bool active = false;
  int body = -1, node = -1;  // where the tied node is now (it follows the node into a part that broke off)
  float length = 0.0f, targetLength = 0.0f;
  float tension = 0.0f;      // [N]
  DVec3 nodePosition, anchorPosition;
};

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
  uint16_t staticTriangleMaterial(int t) const { return staticTris_.at(static_cast<size_t>(t)).material; }

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

  // ---- tethers (§20 node grab, crane / winch, tow rope) ----
  int addTether(const TetherDesc& desc);  // returns its id (ids are never reused)
  void setTetherAnchor(int id, DVec3 anchor);  // world-point anchors only
  void setTetherTargetLength(int id, float length);
  void removeTether(int id);
  int tetherCount() const { return static_cast<int>(tethers_.size()); }
  TetherState tether(int id) const;

  // ---- stepping ----
  void step(int count = 1);
  uint64_t stepIndex() const { return stepIndex_; }
  double time() const { return static_cast<double>(stepIndex_) * static_cast<double>(params_.dt); }
  const StepStats& lastStepStats() const { return stats_; }

  // ---- measurement (§5.3) ----
  EnergyReport measureEnergy() const;
  MomentumReport measureMomentum() const;
  PenetrationReport measurePenetration() const;
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
  struct Tether {
    TetherDesc desc;
    bool active = false;
    double stiffness = 0.0, damping = 0.0;
    double length = 0.0, targetLength = 0.0, tension = 0.0;
  };

  void stepOnce();
  double potentialEnergy(bool extendedBand) const;  // gravity + elastic + contact [J]
  void computeInternalForces(int bodyIndex);
  void integrateBody(int bodyIndex);
  void finishBody(int bodyIndex);
  void applyTethers();
  void rebindTethers(int firstPart);

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
  std::vector<Tether> tethers_;

  friend struct ContactSolver;
};

}  // namespace sbc

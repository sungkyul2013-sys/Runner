// SoftBodyCore — node-beam soft body (one simulation island), §4.1.
// Structure-of-arrays layout (§4.2 performance); positions are float32 relative to a
// double-precision per-body origin (ARCHITECTURE A§4.4).
#pragma once

#include <array>
#include <cstdint>
#include <limits>
#include <string>
#include <vector>

#include "sbc/math.h"

namespace sbc {

inline constexpr float kInfiniteForce = std::numeric_limits<float>::infinity();

// §4.1 beam kinds. Beams are stored sorted by type so every kernel runs branch-free over a contiguous range.
enum class BeamType : uint8_t {
  kNormal = 0,       // spring-damper in tension and compression
  kSupport = 1,      // resists compression only (panel anti-interpenetration)
  kBounded = 2,      // acts only outside [minLength, maxLength] (travel limits, bump stops)
  kRope = 3,         // resists tension only (tow rope, straps)
  kAnisotropic = 4,  // different stiffness in compression (compressionStiffness) and tension (stiffness)
  kHydro = 5,        // rest length follows an input channel: L0 = L0,init · (1 + hydroFactor · input) (steering rack)
};
inline constexpr int kBeamTypeCount = 6;

namespace node_flag {
inline constexpr uint8_t kCollide = 1u << 0;  // takes part in collisions
inline constexpr uint8_t kFixed = 1u << 1;    // immovable anchor (infinite mass)
// Tyre tread node (§6 hybrid tyre): static contacts give it only the normal (penalty) force and report that force
// in Body::patch*; the tangential force comes from the owning vehicle's slip-based tyre model instead of node friction.
inline constexpr uint8_t kTread = 1u << 2;
// Moved to another body when its part broke off (§4.3 island split). The slot stays so that node indices held by a
// vehicle controller remain valid; the node takes no further part here (no mass, no collision, no forces).
inline constexpr uint8_t kDetached = 1u << 3;
}  // namespace node_flag

struct NodeDesc {
  Vec3 position;        // [m] in body-local coordinates (relative to BodyDesc::origin)
  Vec3 velocity;        // [m/s]
  float mass = 1.0f;    // [kg]
  float radius = 0.02f; // [m] collision radius
  uint16_t material = 0;
  uint8_t flags = node_flag::kCollide;
};

struct BeamDesc {
  int32_t a = -1, b = -1;              // node indices
  BeamType type = BeamType::kNormal;
  float stiffness = 0.0f;              // k [N/m]
  float damping = 0.0f;                // c [N·s/m]
  float restLength = -1.0f;            // [m]; ≤ 0 → taken from the initial node distance
  float plasticForce = kInfiniteForce; // [N] elastic force magnitude at which yielding starts
  float hardening = 0.0f;              // [-] post-yield slope as a fraction of k (0 = perfectly plastic)
  float breakForce = kInfiniteForce;   // [N] elastic force magnitude at which the beam breaks
  float deformLimit = kInfiniteForce;  // [-] accumulated plastic strain at which the beam breaks
  // [-] fraction of the initial length a beam can be plastically crushed: the rest length never yields below
  // (1 − crushLimit)·L0,init. Crushed sheet metal and tube stacks densify rather than vanish, so from there the beam
  // stays elastic (and keeps the two nodes apart) instead of yielding further.
  float crushLimit = 0.95f;
  // [-] net plastic elongation (L0 − L0,init)/L0,init at which the beam tears (ductile tensile rupture).
  float tearLimit = kInfiniteForce;
  float minLength = 0.0f;              // [m] kBounded only
  float maxLength = 0.0f;              // [m] kBounded only
  int32_t breakGroup = -1;             // beams sharing a group break together (§4.3)
  float compressionStiffness = -1.0f;  // [N/m] kAnisotropic: k while compressed (≤ 0 → same as stiffness)
  int32_t hydroChannel = -1;           // kHydro: index into Body::hydroInputs
  float hydroFactor = 0.0f;            // kHydro: relative rest-length change per unit input [-]
  float hydroSpeed = 0.0f;             // kHydro: max relative rest-length change per second [1/s] (≤ 0 → instant)
};

// Node constrained to the line through two other nodes (prismatic joint: MacPherson strut telescope, §7).
// Penalty force toward the line: F = −k·d⊥ − c·ḋ⊥ on the node, reaction split over the rail nodes by the projection
// parameter so linear and angular momentum are conserved.
struct SliderDesc {
  int32_t node = -1, railA = -1, railB = -1;
  float stiffness = 0.0f;  // [N/m]
  float damping = 0.0f;    // [N·s/m]
};

// Closed triangle surface with internal gas pressure (§4.1 압력 삼각형·압력 휠). Triangles wind counter-clockwise when
// seen from outside. Isothermal ideal gas: p_abs·V = const.
struct PressureGroupDesc {
  std::vector<std::array<int32_t, 3>> triangles;
  float gaugePressure = 0.0f;         // [Pa] at the initial volume (e.g. 2.5 bar = 250 kPa)
  float ambientPressure = 101325.0f;  // [Pa]
};

// Torsion bar between two lever arms (anti-roll bar, §7): nodes arm1 → pivot1 ═ pivot2 ← arm2. Resists relative
// twist of the two levers about the pivot axis: τ = −k·Δθ − c·Δθ̇.
struct TorsionBarDesc {
  int32_t arm1 = -1, pivot1 = -1, pivot2 = -1, arm2 = -1;
  float stiffness = 0.0f;  // [N·m/rad]
  float damping = 0.0f;    // [N·m·s/rad]
  // The bar or its end links fail (crash damage, §4.3) when the relative twist exceeds this [rad], or when a lever is
  // folded onto the pivot axis (its perpendicular length below half the initial one: the lever geometry is gone).
  float breakTwist = 1.0f;
};

// Collision triangle (§4.1 삼각형 — the collision surface, §5.2 node↔triangle and edge↔edge contact). Wound
// counter-clockwise seen from outside. Its half thickness is the mean radius of its three nodes, so two surfaces touch
// where their node spheres would. Self-collision (§5.1): nodes of group g collide with this body's own triangles of
// every other group ≥ 0 (a wheel against the wheel arch); group −1 surfaces collide only with other bodies.
struct CollisionTriDesc {
  int32_t a = -1, b = -1, c = -1;
  int16_t group = -1;
};

struct BodyDesc {
  std::string name;
  DVec3 origin;  // [m] world position of the local frame
  std::vector<NodeDesc> nodes;
  std::vector<BeamDesc> beams;
  std::vector<SliderDesc> sliders;
  std::vector<PressureGroupDesc> pressureGroups;
  std::vector<TorsionBarDesc> torsionBars;
  std::vector<CollisionTriDesc> triangles;
  int hydroChannels = 0;
};

// Cumulative dissipated / injected energy of one body [J] (§5.3 energy bookkeeping).
struct EnergyLosses {
  double beamDamping = 0.0;
  double contactDamping = 0.0;
  double friction = 0.0;
  double plastic = 0.0;   // work absorbed by plastic yielding
  double fracture = 0.0;  // elastic energy released when beams break
  double ccd = 0.0;       // kinetic energy removed by continuous-collision clamping
  double external = 0.0;  // work injected through the API (velocity changes, spawns in motion)

  double totalDissipated() const {
    return beamDamping + contactDamping + friction + plastic + fracture + ccd;
  }
};

struct Body {
  std::string name;
  DVec3 origin;

  // ---- nodes ----
  std::vector<float> px, py, pz;  // [m] local position
  std::vector<float> vx, vy, vz;  // [m/s]
  std::vector<float> fx, fy, fz;  // [N] force accumulator (all forces)
  std::vector<float> sx, sy, sz;  // [m] local position at the start of the current step (CCD sweeps x_start → x)
  std::vector<float> mass;        // [kg]
  std::vector<float> invMass;     // [1/kg] 0 for fixed nodes
  std::vector<float> radius;      // [m]
  std::vector<uint16_t> material;
  std::vector<uint8_t> flags;

  // Dissipative-force accumulators, filled only when energy tracking is on. Their work is
  // integrated with the mid-step velocity so it matches the kinetic-energy change of the
  // symplectic Euler step.
  std::vector<float> fdBeamX, fdBeamY, fdBeamZ;
  std::vector<float> fdContactX, fdContactY, fdContactZ;
  std::vector<float> fdFrictionX, fdFrictionY, fdFrictionZ;
  std::vector<float> fdExternalX, fdExternalY, fdExternalZ;  // actuator forces (engine, aero): work → losses.external

  // Static friction ("stick anchor") of each node's primary static contact, stored as the tangential spring
  // displacement δ = x − anchor, integrated as δ += v·dt. Keeping δ itself (rather than an absolute anchor point)
  // preserves full precision when the node's float position can no longer resolve sub-ulp motion.
  std::vector<float> stickX, stickY, stickZ;
  std::vector<int32_t> anchorContact;  // id of the surface the anchor lives on, −1 = none

  // Static contact result of kTread nodes for the current step (other nodes: 0): Σ contact spring force magnitude
  // [N] (node share + wheel share, no damping), force-weighted normal Σ F·n [N], and the deepest surface's material.
  std::vector<float> patchForce;
  std::vector<float> patchNx, patchNy, patchNz;
  std::vector<uint16_t> patchMaterial;

  // ---- beams (sorted by type) ----
  std::vector<int32_t> beamA, beamB;
  std::vector<uint8_t> beamType;
  std::vector<float> stiffness, damping;
  std::vector<float> restLength;        // current (plastically updated) rest length [m]
  std::vector<float> initialRestLength; // [m]
  std::vector<float> plasticForce, hardening, breakForce, deformLimit;
  std::vector<float> crushFloor;        // [m] lowest plastic rest length, (1 − crushLimit)·L0,init
  std::vector<float> tearLength;        // [m] plastic rest length at which the beam tears, (1 + tearLimit)·L0,init
  std::vector<float> plasticDeformation; // accumulated |Δ rest length| [m]
  std::vector<float> minLength, maxLength;
  std::vector<int32_t> breakGroup;
  std::vector<uint8_t> broken;
  std::vector<float> compressionStiffness;  // kAnisotropic
  std::vector<int32_t> hydroChannel;        // kHydro
  std::vector<float> hydroFactor, hydroSpeed;
  std::array<int32_t, kBeamTypeCount + 1> typeBegin{};  // beams of type t: [typeBegin[t], typeBegin[t+1])
  std::vector<float> hydroInputs;           // per channel, set by the owner (vehicle) before each step

  // ---- sliders ----
  std::vector<int32_t> sliderNode, sliderA, sliderB;
  std::vector<float> sliderStiffness, sliderDamping;
  std::vector<uint8_t> sliderBroken;          // its nodes went to different bodies

  // ---- pressure groups (triangles flattened, groupTriBegin[g]..groupTriBegin[g+1]) ----
  std::vector<int32_t> pressureTri;           // 3 node indices per triangle
  std::vector<int32_t> groupTriBegin;         // size groups + 1
  std::vector<double> groupInitialVolume;     // [m³]
  std::vector<float> groupGaugePressure;      // [Pa] at the initial volume
  std::vector<float> groupAmbientPressure;    // [Pa]
  std::vector<float> groupCurrentGauge;       // [Pa] last evaluated (telemetry)
  std::vector<uint8_t> groupBroken;           // its triangles went to another body

  // ---- torsion bars ----
  std::vector<int32_t> torsionArm1, torsionPivot1, torsionPivot2, torsionArm2;
  std::vector<float> torsionStiffness, torsionDamping;
  std::vector<double> torsionRestAngle;       // [rad]
  std::vector<float> torsionBreakTwist;       // [rad]
  std::vector<float> torsionMinLever1, torsionMinLever2;  // [m²] squared perpendicular lever length at which it fails
  std::vector<uint8_t> torsionBroken;

  // ---- collision surface (§5.2) ----
  std::vector<int32_t> triNode;      // 3 node indices per triangle
  std::vector<int16_t> triGroup;     // self-collision group (−1 = other bodies only)
  std::vector<float> triTearEdge2;   // [m²] a triangle whose longest edge exceeds this is torn (inactive): the surface
                                     // ripped apart with its beams, so it no longer spans a real panel
  std::vector<float> triCrushArea2;  // [m⁴] |2·area|² below which a crushed (flattened) triangle is retired: its normal
                                     // is no longer defined, and its nodes meet other bodies as spheres instead
  std::vector<uint8_t> triTorn;
  std::vector<int32_t> edgeNode;     // 2 node indices per unique triangle edge
  std::vector<int32_t> edgeTri;      // 2 adjacent triangles per edge (−1 = none; non-manifold edges keep the first two)
  std::vector<int16_t> nodeGroup;    // group of the first grouped triangle using the node (−1 = none)
  std::vector<float> nodeSurface;    // number of intact collision triangles using the node (0 → it collides as a sphere)
  // Deepest body/self contact penetration each node took part in, accepted in this step's forces [m], and the one
  // being gathered (see ContactSolver: contacts grow continuously from the edge of the contact band).
  std::vector<float> contactDepth, contactDepthNext;
  // Members of each self-collision group g ≥ 0 (CSR): nodes groupNodes[groupNodeBegin[g] … groupNodeBegin[g+1]),
  // triangles likewise.
  std::vector<int32_t> groupNodes, groupNodeBegin, groupTris, groupTriBegin2;

  // ---- bookkeeping ----
  EnergyLosses losses;
  uint32_t topologyVersion = 0;  // bumped whenever beams break (render/debug views re-read topology)
  int32_t brokenBeamCount = 0;
  int32_t islandCheckedAt = 0;              // brokenBeamCount when connectivity was last checked (island split)
  std::vector<int32_t> pendingBreakGroups;  // groups triggered this step, applied at step end

  int nodeCount() const { return static_cast<int>(px.size()); }
  int beamCount() const { return static_cast<int>(beamA.size()); }
  int sliderCount() const { return static_cast<int>(sliderNode.size()); }
  int pressureGroupCount() const { return static_cast<int>(groupInitialVolume.size()); }
  int torsionBarCount() const { return static_cast<int>(torsionArm1.size()); }
  int triangleCount() const { return static_cast<int>(triGroup.size()); }
  int edgeCount() const { return static_cast<int>(edgeNode.size() / 2); }
  Vec3 nodePosition(int i) const { return {px[i], py[i], pz[i]}; }
  Vec3 nodeVelocity(int i) const { return {vx[i], vy[i], vz[i]}; }
  DVec3 nodeWorldPosition(int i) const { return origin + toDouble(nodePosition(i)); }
};

// Builds the runtime SoA body from a description. Throws std::invalid_argument on bad input
// (index out of range, non-positive mass on a non-fixed node, zero-length beams).
Body buildBody(const BodyDesc& desc);

}  // namespace sbc

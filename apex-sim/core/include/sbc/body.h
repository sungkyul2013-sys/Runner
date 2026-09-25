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
  // [-] accumulated *reversed* plastic strain at which the beam breaks (low-cycle fatigue): only yielding against the
  // direction of the previous yielding counts, so a hinge worked back and forth by a flapping lid tears while one
  // bent once in a crash does not.
  float fatigueLimit = kInfiniteForce;
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
  int32_t damageGroup = -1;            // index into BodyDesc::damageGroups (−1: not watched)
  float damageStrain = -1.0f;          // [-] trigger strain of this beam (≤ 0 → the group's)
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

// Aerodynamic panel (§4.4 a lid or door that comes open flaps in the wind): on triangle abc (outward normal n, area
// A, velocity v through still air, shared equally by its nodes)
//   F = −½·ρ·C_N·A·|v_n|·v_n·n          flat plate across the flow (v_n = v·n): a panel swinging into the stream
//     + ½·ρ·C_S·A·|v − v_n·n|²·n        suction of the flow along its outer face (the closed lid's outside sees the
//                                        flow's low pressure, its inside the still air under it)
// A closed lid held by its latch feels only the suction (part of the car's lift); an unlatched one is lifted by it
// until the stream gets under its edge and throws it open. Its work is booked as external (air).
struct AeroPanelDesc {
  int32_t a = -1, b = -1, c = -1;
  float normalCoefficient = 1.2f;  // C_N of a flat plate across the flow [-]
  float suctionCoefficient = 0.0f; // C_S: −C_p of the flow over the outer face [-]
};

// Damage group (§4.3 glass and lamps, §4.4 damage → function): a named set of beams watched for damage — the beams
// around a windscreen, a lamp, a radiator. A beam counts as damaged once its length has left [1 − s, 1 + s]·L0,init
// (elastically or plastically; s = its trigger strain) or it broke; the group's damage is the damaged share.
// A group can also watch nodes for impacts: a node whose normal contact force in one step exceeds `impactForce`
// damages the group (a stone on a windscreen, a lamp struck by a post).
struct DamageGroupDesc {
  std::string id;
  float strain = 0.01f;                   // [-] default trigger strain of its beams
  float impactForce = kInfiniteForce;     // [N] contact force on one of its nodes that damages it
  std::vector<int32_t> nodes;             // watched for impacts
};

struct DamageGroupState {
  std::string id;
  int32_t beams = 0;                         // beams in the group
  int32_t damaged = 0;                       // of them damaged so far
  int64_t firstStep = -1;                    // step of the first damage (−1: intact)
  int32_t firstNodeA = -1, firstNodeB = -1;  // nodes of the first damaged beam (where a crack starts)
  float peakStrain = 0.0f;                   // [-] largest |L/L0,init − 1| seen on one of its beams
  int32_t impacts = 0;                       // of its watched nodes, hit harder than its impact force so far
  float peakImpact = 0.0f;                   // [N] largest contact force seen on one of its nodes
  float damage() const { return beams > 0 ? static_cast<float>(damaged) / static_cast<float>(beams) : 0.0f; }
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
  std::vector<AeroPanelDesc> aeroPanels;
  std::vector<DamageGroupDesc> damageGroups;
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

// A node pair of an accepted body/self contact and its depth, kept by the body of `node` (Body::contactDepths).
struct ContactDepth {
  int32_t node, otherBody, otherNode;
  float depth;  // [m]
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
  // Σ normal contact force on each node in the current step [N] (static, body and self contacts; damage groups).
  std::vector<float> contactLoad;

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
  std::vector<float> fatigueLimit;       // [-]
  std::vector<float> fatigue;            // accumulated reversed |Δ rest length| [m]
  std::vector<int8_t> plasticSign;       // last yielding: ±1 first excursion, ±2 a reversed one (+ stretch), 0 none
  std::vector<float> minLength, maxLength;
  std::vector<int32_t> breakGroup;
  std::vector<uint8_t> broken;
  std::vector<float> compressionStiffness;  // kAnisotropic
  std::vector<int32_t> hydroChannel;        // kHydro
  std::vector<float> hydroFactor, hydroSpeed;
  std::vector<float> hydroOffset;           // kHydro: plastic change of the actuated rest length [m] (a bent tie rod)
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
  std::vector<uint8_t> triClosed;    // triangle belongs to a closed surface (no boundary edge in its connected set)
  std::vector<int16_t> nodeGroup;    // group of the first grouped triangle using the node (−1 = none)
  std::vector<float> nodeSurface;    // number of intact collision triangles using the node (0 → it collides as a sphere)
  // Contact continuity (see ContactSolver: contacts grow continuously from the edge of the contact band): for every
  // node pair of an accepted body/self contact, from this body's node, the deepest depth [m] — this step's reference
  // and the pairs being gathered; sorted by (node, other body, other node), unique, after each step.
  std::vector<ContactDepth> contactDepths, contactDepthsNext;
  // Members of each self-collision group g ≥ 0 (CSR): nodes groupNodes[groupNodeBegin[g] … groupNodeBegin[g+1]),
  // triangles likewise.
  std::vector<int32_t> groupNodes, groupNodeBegin, groupTris, groupTriBegin2;

  // ---- bookkeeping ----
  EnergyLosses losses;
  uint32_t topologyVersion = 0;  // bumped whenever beams break (render/debug views re-read topology)
  int32_t brokenBeamCount = 0;
  int32_t islandCheckedAt = 0;              // brokenBeamCount when connectivity was last checked (island split)
  std::vector<int32_t> pendingBreakGroups;  // groups triggered this step, applied at step end
  // Aero panels: 3 node indices each and C_N.
  std::vector<int32_t> aeroNode;
  std::vector<float> aeroCoefficient, aeroSuction;
  // Damage groups: the watched beams (body beam index, group, trigger strain, damaged flag) and each group's state.
  std::vector<int32_t> damageBeam, damageBeamGroup;
  std::vector<float> damageBeamStrain;
  std::vector<uint8_t> damageBeamHit;
  std::vector<int32_t> damageNode, damageNodeGroup;
  std::vector<uint8_t> damageNodeHit;
  std::vector<float> damageImpact;  // per group: impact force of its nodes [N]
  std::vector<DamageGroupState> damageGroups;
  // Island provenance (render binding of detached parts): the body this one was split from (−1: spawned) and, per
  // node, its index there. Not physics state (not hashed).
  int32_t sourceBody = -1;
  // The body this one first broke off from (itself when added to the world). Bodies of one family collide like the
  // parts of one body — contact forces only, no sweep tests (a part tears off wherever the crushed structure left it,
  // interlocked with its source, which a sweep would try to pull apart every step) — and are not counted as
  // interpenetrating each other (World::measurePenetration).
  int32_t family = -1;
  std::vector<int32_t> sourceNode;
  // A retired body (World::retireFamily: a car that was repaired, reset or swapped): parked far below the world,
  // frozen, and skipped by every step phase. Its index stays valid.
  bool enabled = true;

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

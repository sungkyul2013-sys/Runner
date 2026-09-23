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

// §4.1 beam kinds implemented so far. Beams are stored sorted by type so every kernel runs
// branch-free over a contiguous range. Anisotropic and hydro beams arrive in M1.
enum class BeamType : uint8_t {
  kNormal = 0,   // spring-damper in tension and compression
  kSupport = 1,  // resists compression only (panel anti-interpenetration)
  kBounded = 2,  // acts only outside [minLength, maxLength] (travel limits, bump stops)
  kRope = 3,     // resists tension only (tow rope, straps)
};
inline constexpr int kBeamTypeCount = 4;

namespace node_flag {
inline constexpr uint8_t kCollide = 1u << 0;  // takes part in collisions
inline constexpr uint8_t kFixed = 1u << 1;    // immovable anchor (infinite mass)
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
  float minLength = 0.0f;              // [m] kBounded only
  float maxLength = 0.0f;              // [m] kBounded only
  int32_t breakGroup = -1;             // beams sharing a group break together (§4.3)
};

struct BodyDesc {
  std::string name;
  DVec3 origin;  // [m] world position of the local frame
  std::vector<NodeDesc> nodes;
  std::vector<BeamDesc> beams;
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

  // Static friction ("stick anchor") of each node's primary static contact, stored as the tangential spring
  // displacement δ = x − anchor, integrated as δ += v·dt. Keeping δ itself (rather than an absolute anchor point)
  // preserves full precision when the node's float position can no longer resolve sub-ulp motion.
  std::vector<float> stickX, stickY, stickZ;
  std::vector<int32_t> anchorContact;  // id of the surface the anchor lives on, −1 = none

  // ---- beams (sorted by type) ----
  std::vector<int32_t> beamA, beamB;
  std::vector<uint8_t> beamType;
  std::vector<float> stiffness, damping;
  std::vector<float> restLength;        // current (plastically updated) rest length [m]
  std::vector<float> initialRestLength; // [m]
  std::vector<float> plasticForce, hardening, breakForce, deformLimit;
  std::vector<float> plasticDeformation; // accumulated |Δ rest length| [m]
  std::vector<float> minLength, maxLength;
  std::vector<int32_t> breakGroup;
  std::vector<uint8_t> broken;
  std::array<int32_t, kBeamTypeCount + 1> typeBegin{};  // beams of type t: [typeBegin[t], typeBegin[t+1])

  // ---- bookkeeping ----
  EnergyLosses losses;
  uint32_t topologyVersion = 0;  // bumped whenever beams break (render/debug views re-read topology)
  int32_t brokenBeamCount = 0;
  std::vector<int32_t> pendingBreakGroups;  // groups triggered this step, applied at step end

  int nodeCount() const { return static_cast<int>(px.size()); }
  int beamCount() const { return static_cast<int>(beamA.size()); }
  Vec3 nodePosition(int i) const { return {px[i], py[i], pz[i]}; }
  Vec3 nodeVelocity(int i) const { return {vx[i], vy[i], vz[i]}; }
  DVec3 nodeWorldPosition(int i) const { return origin + toDouble(nodePosition(i)); }
};

// Builds the runtime SoA body from a description. Throws std::invalid_argument on bad input
// (index out of range, non-positive mass on a non-fixed node, zero-length beams).
Body buildBody(const BodyDesc& desc);

}  // namespace sbc

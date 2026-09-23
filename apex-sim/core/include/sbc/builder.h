// SoftBodyCore — procedural node-beam structures used by M0 scenes, tests and the web sandbox.
#pragma once

#include <vector>

#include "sbc/body.h"
#include "sbc/math.h"

namespace sbc {

// A box-shaped lattice of nx × ny × nz nodes. Every node connects to its 13 "forward" neighbours of the
// 26-neighbourhood (3 edge, 6 face-diagonal, 4 body-diagonal directions), which makes the lattice
// rigid in shear and torsion.
struct LatticeParams {
  DVec3 center;                    // [m] world position of the lattice centre
  Vec3 size{1.0f, 1.0f, 1.0f};     // [m] outer dimensions along local x, y, z
  int nx = 3, ny = 3, nz = 3;      // [-] nodes per axis (≥ 2)
  float totalMass = 100.0f;        // [kg] split evenly over the nodes
  float nodeRadius = 0.05f;        // [m]
  float axialStiffness = 5.0e4f;   // EA [N]: every beam gets k = EA / L0
  float dampingRatio = 0.05f;      // ζ [-]: c = 2ζ·√(k·m_r) per beam
  float yieldStrain = 0.0f;        // [-] plastic onset at |F| = EA·ε_y (0 = elastic only)
  float hardening = 0.0f;          // [-] post-yield slope as a fraction of k
  float breakStrain = 0.0f;        // [-] break when |F| > EA·ε_b (0 = unbreakable)
  float deformLimit = 0.0f;        // [-] break when accumulated plastic strain exceeds this (0 = off)
  uint16_t material = 0;
  Vec3 velocity;                   // [m/s] initial velocity of every node
  Vec3 yawPitchRoll;               // [rad] orientation (Y, then X, then Z)
};

BodyDesc makeLattice(const LatticeParams& p);

// Pressure wheel (§6 hybrid tyre): two rim rings and two tread rings of `segments` nodes around the spin axis of two
// existing carrier nodes. Rim nodes are spoked to both axle nodes (a bearing: free spin, rigid otherwise), sidewall
// beams join tread to rim, the belt carries the tread, and the closed cavity (belt, sidewalls, rim bed) is a pressure
// group. Tread nodes get node_flag::kTread.
//
// An explicit 2 kHz node tyre cannot carry the real inflation pressure through belt hoop tension (a 2.5 bar belt needs
// EA of MN → dt of µs), and a discrete ring's hoop stiffness resists radial growth only by (L/R)² ≈ 7 %. The radial
// sidewall beams are therefore anisotropic: soft in compression (vertical tyre rate, the structural effect of the
// inflation pressure) and stiff in tension (no centrifugal ballooning). The cavity runs at a small structural gauge
// whose hoop tension is pre-compensated in the belt rest lengths.
struct PressureWheelParams {
  int32_t axleRight = -1, axleLeft = -1;  // existing nodes; spin axis = left − right
  Vec3 center;                   // [m] wheel centre on the axis (body-local)
  Vec3 upHint{0.0f, 1.0f, 0.0f}; // reference for segment 0's radial direction
  int segments = 24;
  float tyreRadius = 0.33f;      // [m] outer radius (tread node sphere surface)
  float treadWidth = 0.22f;      // [m] distance between the two tread rings
  float rimRadius = 0.235f;      // [m]
  float rimWidth = 0.20f;        // [m] distance between the two rim rings
  float treadNodeMass = 0.2f, rimNodeMass = 0.2f;  // [kg]
  // Tread contact spheres must be larger than the tyre deflection (≈ 1.2 cm static, 3–4 cm on bumps): a node whose
  // centre reaches the road is clamped by CCD instead of being pushed by its contact spring.
  float treadNodeRadius = 0.04f, rimNodeRadius = 0.02f;  // [m]
  float rimStiffness = 1.0e5f;   // rim rings [N/m]
  // Spokes (rim nodes to both axle nodes) [N/m]; ≤ 0 → rimStiffness. They hold the rim's centrifugal load: at
  // 250 km/h every rim node pulls outward with ≈ 3 kN, plus its tread node's pull through the sidewall.
  float spokeStiffness = -1.0f;
  float treadStiffness = 1.0e5f; // belt (circumferential, across, diagonal) [N/m]
  float treadBendStiffness = 1.5e4f;  // skip-one belt beams [N/m]
  float sidewallStiffness = 4.0e4f;   // radial tread–rim in compression [N/m] (inflation stiffness: vertical rate)
  float sidewallTensionStiffness = 3.0e5f;  // radial tread–rim in tension [N/m]: holds the belt against centrifugal
                                            // growth (≈ 3 % at 250 km/h), the job of the inextensible steel belt
  float sidewallShearStiffness = 1.2e4f;  // tread–neighbouring rim (torsional carcass stiffness) [N/m]
  float sidewallCrossStiffness = 6.0e3f;  // tread ring A – rim ring B (lateral carcass stiffness) [N/m]
  float rimDampingRatio = 0.1f, treadDampingRatio = 0.05f, sidewallDampingRatio = 0.15f;  // ζ per beam
  float structuralPressure = 1.0e4f;  // [Pa] cavity gauge (0 = no pressure group)
  uint16_t treadMaterial = 0, rimMaterial = 0;
};

struct PressureWheelNodes {
  std::vector<int32_t> rim, tread, all;  // body node indices
};

PressureWheelNodes addPressureWheel(BodyDesc& body, const PressureWheelParams& p);

}  // namespace sbc

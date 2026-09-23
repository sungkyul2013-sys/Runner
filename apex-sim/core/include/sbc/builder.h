// SoftBodyCore — procedural node-beam structures used by M0 scenes, tests and the web sandbox.
#pragma once

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

}  // namespace sbc

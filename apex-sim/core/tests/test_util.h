// Shared helpers for SoftBodyCore tests.
#pragma once

#include <cmath>

#include "sbc/body.h"
#include "sbc/world.h"

namespace sbc::test {

inline double relErr(double measured, double expected) { return std::fabs(measured - expected) / std::fabs(expected); }

inline double norm(DVec3 v) { return std::sqrt(dot(v, v)); }

// World without gravity or ground: only what the test adds.
inline WorldParams zeroGravity() {
  WorldParams p;
  p.gravity = {0.0f, 0.0f, 0.0f};
  return p;
}

// One free node of mass m at `pos`.
inline BodyDesc singleNode(Vec3 pos, float mass = 1.0f, Vec3 vel = {}) {
  BodyDesc d;
  d.name = "node";
  NodeDesc n;
  n.position = pos;
  n.velocity = vel;
  n.mass = mass;
  n.radius = 0.02f;
  d.nodes.push_back(n);
  return d;
}

// Fixed anchor node at the origin + free node of mass m at x = restLength + offset, joined by one beam.
inline BodyDesc springMass(float mass, float k, float c, float restLength, float offset) {
  BodyDesc d;
  d.name = "spring-mass";
  NodeDesc anchor;
  anchor.flags = node_flag::kFixed;
  anchor.mass = 0.0f;
  NodeDesc m;
  m.position = {restLength + offset, 0.0f, 0.0f};
  m.mass = mass;
  d.nodes = {anchor, m};
  BeamDesc b;
  b.a = 0;
  b.b = 1;
  b.stiffness = k;
  b.damping = c;
  b.restLength = restLength;
  d.beams.push_back(b);
  return d;
}

}  // namespace sbc::test

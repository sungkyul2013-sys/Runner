// SoftBodyCore — internal kernels shared between translation units (not part of the public API).
#pragma once

#include "sbc/body.h"

namespace sbc::detail {

// Accumulates spring-damper forces of every intact beam into body.f*, applies plastic return
// mapping and breaking (§4.3). With kTrack the damping part is also written to body.fdBeam*.
// Returns the number of beams that broke during this call.
template <bool kTrack>
int accumulateBeamForces(Body& body);

// Σ ½k·(active extension)² over intact beams [J].
double beamPotentialEnergy(const Body& body);

// Hydro beams: move rest lengths toward their input-channel targets (rate limited). Call once per step before
// accumulateBeamForces.
void updateHydros(Body& body, float dt);

// Sliders, pressure groups and torsion bars (§4.1, §7). kTrack also books damping into body.fdBeam*.
template <bool kTrack>
void accumulateConstraintForces(Body& body);

// Enclosed volume of pressure group g (divergence theorem, Σ a·(b×c)/6) [m³].
double pressureGroupVolume(const Body& body, int group);
// Current twist angle of torsion bar i about its pivot axis [rad] (deterministic atan2).
double torsionBarAngle(const Body& body, int bar);
// Σ of slider, gas and torsion-bar potential energy [J].
double constraintPotentialEnergy(const Body& body);

// Breaks every intact beam whose breakGroup was triggered this step. Returns beams broken.
int applyPendingBreakGroups(Body& body);

// Marks beam i broken and books its released elastic energy.
void breakBeam(Body& body, int i, float elasticForce);

// Collision-surface topology from triNode/triGroup/triTorn: unique edges with adjacent triangles, node groups, node
// surface counts and the per-group member lists.
void buildSurfaceTopology(Body& body);

// Island split (§4.3): the nodes of every connected component but the heaviest (connected by intact beams, sliders,
// torsion bars and pressure groups) as their own bodies, with their full state (plastic set, anchors, …). The source
// keeps the node slots, marked node_flag::kDetached, and drops everything that referred to them. Empty when the body
// is still in one piece.
std::vector<Body> splitIslands(Body& body);

}  // namespace sbc::detail

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

// Breaks every intact beam whose breakGroup was triggered this step. Returns beams broken.
int applyPendingBreakGroups(Body& body);

// Marks beam i broken and books its released elastic energy.
void breakBeam(Body& body, int i, float elasticForce);

}  // namespace sbc::detail

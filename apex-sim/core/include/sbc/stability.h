// SoftBodyCore — explicit-integration stability checker (§4.2, KICKOFF C1).
//
//  beam:  dt < s · (2/ω)(√(1+ζ²) − ζ),  ω = √(k/m_r),  m_r = m₁m₂/(m₁+m₂),  ζ = c / (2√(k·m_r))
//         (damped two-mass oscillator under symplectic Euler)
//  node:  dt < s · √(2·m_i / Σ_j k_ij)   (Gershgorin bound on λ_max(M⁻¹K) for stiff clusters)
#pragma once

#include <vector>

#include "sbc/body.h"

namespace sbc {

inline constexpr double kDefaultStabilitySafety = 0.8;  // [-] required margin below the critical dt

struct StabilityIssue {
  bool isNode = false;     // false → beam index, true → node index
  int index = -1;
  double criticalDt = 0.0; // [s]
};

struct StabilityReport {
  double minCriticalDt = 0.0;  // [s] smallest critical dt over all beams and nodes (before safety)
  int beamViolations = 0;
  int nodeViolations = 0;
  std::vector<StabilityIssue> worst;  // most critical first, at most `maxIssues`
  bool ok() const { return beamViolations == 0 && nodeViolations == 0; }
};

StabilityReport checkStability(const Body& body, double dt, double safety = kDefaultStabilitySafety,
                               int maxIssues = 16);

}  // namespace sbc

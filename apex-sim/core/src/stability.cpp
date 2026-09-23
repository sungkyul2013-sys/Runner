#include "sbc/stability.h"

#include <algorithm>
#include <cmath>
#include <limits>

namespace sbc {

StabilityReport checkStability(const Body& b, double dt, double safety, int maxIssues) {
  StabilityReport r;
  r.minCriticalDt = std::numeric_limits<double>::infinity();
  std::vector<StabilityIssue> issues;
  std::vector<double> stiffnessSum(static_cast<size_t>(b.nodeCount()), 0.0);

  for (int i = 0; i < b.beamCount(); ++i) {
    const double k = b.stiffness[i];
    if (!(k > 0.0)) continue;
    const int a = b.beamA[i], c = b.beamB[i];
    stiffnessSum[static_cast<size_t>(a)] += k;
    stiffnessSum[static_cast<size_t>(c)] += k;
    const double ia = b.invMass[a], ic = b.invMass[c];
    if (ia == 0.0 && ic == 0.0) continue;
    const double mr = 1.0 / (ia + ic);
    const double omega = std::sqrt(k / mr);
    const double zeta = b.damping[i] / (2.0 * std::sqrt(k * mr));
    const double critical = (2.0 / omega) * (std::sqrt(1.0 + zeta * zeta) - zeta);
    r.minCriticalDt = std::min(r.minCriticalDt, critical);
    if (dt > safety * critical) {
      ++r.beamViolations;
      issues.push_back({false, i, critical});
    }
  }
  for (int n = 0; n < b.nodeCount(); ++n) {
    if (b.invMass[n] == 0.0f || stiffnessSum[static_cast<size_t>(n)] <= 0.0) continue;
    const double critical = std::sqrt(2.0 * b.mass[n] / stiffnessSum[static_cast<size_t>(n)]);
    r.minCriticalDt = std::min(r.minCriticalDt, critical);
    if (dt > safety * critical) {
      ++r.nodeViolations;
      issues.push_back({true, n, critical});
    }
  }
  std::sort(issues.begin(), issues.end(), [](const StabilityIssue& x, const StabilityIssue& y) {
    return x.criticalDt != y.criticalDt ? x.criticalDt < y.criticalDt
                                        : (x.isNode != y.isNode ? !x.isNode : x.index < y.index);
  });
  if (static_cast<int>(issues.size()) > maxIssues) issues.resize(static_cast<size_t>(maxIssues));
  r.worst = std::move(issues);
  return r;
}

}  // namespace sbc

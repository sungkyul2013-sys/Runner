// §23.1 스프링-질량 진동 주기 T = 2π√(m/k) 오차 1% 미만, 감쇠 진동이 해석해와 일치.
#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>
#include <cmath>
#include <vector>

#include "sbc/world.h"
#include "test_util.h"

using namespace sbc;

namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr float kMass = 1.0f;       // [kg]
constexpr float kK = 1000.0f;       // [N/m] → ω = 31.6 rad/s, T = 0.1987 s (397 steps per period)
constexpr float kRest = 1.0f;       // [m]
constexpr float kAmplitude = 0.1f;  // [m] initial extension

struct Trace {
  std::vector<double> t, x;  // time, extension
};

Trace simulate(float c, double seconds) {
  World w(test::zeroGravity());
  w.addBody(test::springMass(kMass, kK, c, kRest, kAmplitude));
  Trace tr;
  const int steps = static_cast<int>(seconds / kDefaultDt);
  for (int s = 0; s <= steps; ++s) {
    tr.t.push_back(w.time());
    tr.x.push_back(static_cast<double>(w.body(0).px[1]) - kRest);
    w.step();
  }
  return tr;
}

// Times of upward zero crossings (linear interpolation).
std::vector<double> upCrossings(const Trace& tr) {
  std::vector<double> out;
  for (size_t i = 1; i < tr.x.size(); ++i) {
    if (tr.x[i - 1] < 0.0 && tr.x[i] >= 0.0) {
      const double f = -tr.x[i - 1] / (tr.x[i] - tr.x[i - 1]);
      out.push_back(tr.t[i - 1] + f * (tr.t[i] - tr.t[i - 1]));
    }
  }
  return out;
}

std::vector<double> peaks(const Trace& tr) {
  std::vector<double> out;
  for (size_t i = 1; i + 1 < tr.x.size(); ++i) {
    if (tr.x[i] > tr.x[i - 1] && tr.x[i] >= tr.x[i + 1] && tr.x[i] > 0.0) out.push_back(tr.x[i]);
  }
  return out;
}

}  // namespace

TEST_CASE("undamped spring-mass period matches 2*pi*sqrt(m/k) within 1%", "[physics][23.1]") {
  const Trace tr = simulate(0.0f, 10 * 0.2);
  const auto z = upCrossings(tr);
  REQUIRE(z.size() >= 8);
  const double period = (z.back() - z.front()) / static_cast<double>(z.size() - 1);
  const double expected = 2.0 * kPi * std::sqrt(kMass / kK);
  INFO("period " << period << " expected " << expected);
  CHECK(test::relErr(period, expected) < 0.01);
  // Energy-conserving integrator: amplitude must not drift.
  const auto p = peaks(tr);
  CHECK(test::relErr(p.back(), kAmplitude) < 0.01);
}

TEST_CASE("underdamped oscillation matches damped period and logarithmic decrement", "[physics][23.1]") {
  const double zeta = 0.1;
  const double omega = std::sqrt(kK / kMass);
  const float c = static_cast<float>(2.0 * zeta * std::sqrt(kK * kMass));
  const Trace tr = simulate(c, 1.2);
  const auto z = upCrossings(tr);
  REQUIRE(z.size() >= 4);
  const double period = (z.back() - z.front()) / static_cast<double>(z.size() - 1);
  const double expectedPeriod = 2.0 * kPi / (omega * std::sqrt(1.0 - zeta * zeta));
  CHECK(test::relErr(period, expectedPeriod) < 0.01);
  const auto p = peaks(tr);
  REQUIRE(p.size() >= 3);
  const double decrement = std::log(p[0] / p[1]);
  const double expectedDecrement = 2.0 * kPi * zeta / std::sqrt(1.0 - zeta * zeta);
  INFO("decrement " << decrement << " expected " << expectedDecrement);
  CHECK(test::relErr(decrement, expectedDecrement) < 0.01);
}

TEST_CASE("critically damped and overdamped responses follow the analytic solution", "[physics][23.1]") {
  const double omega = std::sqrt(kK / kMass);
  for (const double zeta : {1.0, 2.0}) {
    const float c = static_cast<float>(2.0 * zeta * std::sqrt(kK * kMass));
    const Trace tr = simulate(c, 0.5);
    double worst = 0.0;
    for (size_t i = 0; i < tr.t.size(); i += 20) {
      const double t = tr.t[i];
      double exact;
      if (zeta == 1.0) {
        exact = kAmplitude * (1.0 + omega * t) * std::exp(-omega * t);
      } else {
        const double s = std::sqrt(zeta * zeta - 1.0);
        const double r1 = -omega * (zeta - s), r2 = -omega * (zeta + s);
        exact = kAmplitude * (r1 * std::exp(r2 * t) - r2 * std::exp(r1 * t)) / (r1 - r2);
      }
      worst = std::max(worst, std::fabs(tr.x[i] - exact));
    }
    INFO("zeta " << zeta << " worst abs error " << worst);
    CHECK(worst < 0.01 * kAmplitude);
  }
}

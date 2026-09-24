#include <catch2/catch_test_macros.hpp>
#include <cmath>

#include "sbc/det_math.h"

TEST_CASE("det::sin/cos match libm to 1e-14 over ±1000 rad", "[det_math]") {
  double worst = 0.0;
  for (int i = -200000; i <= 200000; ++i) {
    const double x = i * 0.005 + 1e-3 * (i % 7);
    worst = std::max(worst, std::fabs(sbc::det::sin(x) - std::sin(x)));
    worst = std::max(worst, std::fabs(sbc::det::cos(x) - std::cos(x)));
  }
  CHECK(worst < 1e-14);
}

TEST_CASE("det::sin/cos exact quadrant identities", "[det_math]") {
  CHECK(sbc::det::sin(0.0) == 0.0);
  CHECK(sbc::det::cos(0.0) == 1.0);
  CHECK(std::fabs(sbc::det::sin(1.5707963267948966) - 1.0) < 1e-16);
  CHECK(std::fabs(sbc::det::cos(3.141592653589793) + 1.0) < 1e-16);
}

TEST_CASE("det::atan2 matches libm to 1e-14 in all quadrants", "[det_math]") {
  double worst = 0.0;
  for (int i = -400; i <= 400; ++i) {
    for (int j = -400; j <= 400; j += 7) {
      const double y = i * 0.0137, x = j * 0.0211;
      worst = std::max(worst, std::fabs(sbc::det::atan2(y, x) - std::atan2(y, x)));
    }
  }
  CHECK(worst < 1e-14);
  CHECK(sbc::det::atan2(0.0, 0.0) == 0.0);
  CHECK(std::fabs(sbc::det::atan2(1.0, 0.0) - 1.5707963267948966) < 1e-15);
}

TEST_CASE("det::exp/log/asin match libm", "[det_math]") {
  double worstExp = 0.0, worstLog = 0.0, worstAsin = 0.0;
  for (int i = -70000; i <= 70000; ++i) {
    const double x = i * 0.01 + 1e-4 * (i % 11);  // −700 … 700
    worstExp = std::max(worstExp, std::fabs(sbc::det::exp(x) / std::exp(x) - 1.0));
  }
  for (int i = -3000; i <= 3000; ++i) {
    const double x = std::ldexp(1.0 + 0.618 * ((i % 97) / 97.0), i / 10);  // 2^−300 … 2^300
    worstLog = std::max(worstLog, std::fabs(sbc::det::log(x) - std::log(x)) / std::max(1.0, std::fabs(std::log(x))));
  }
  for (int i = -10000; i <= 10000; ++i) {
    const double x = i * 1e-4;
    worstAsin = std::max(worstAsin, std::fabs(sbc::det::asin(x) - std::asin(x)));
  }
  INFO("exp " << worstExp << ", log " << worstLog << ", asin " << worstAsin);
  CHECK(worstExp < 1e-14);
  CHECK(worstLog < 1e-15);
  CHECK(worstAsin < 1e-14);
  CHECK(sbc::det::exp(0.0) == 1.0);
  CHECK(sbc::det::log(1.0) == 0.0);
  CHECK(sbc::det::exp(-800.0) == 0.0);
  CHECK(std::isinf(sbc::det::exp(800.0)));
  CHECK(std::isinf(sbc::det::log(0.0)));
  CHECK(sbc::det::asin(1.0) == 1.5707963267948966);
  CHECK(sbc::det::asin(2.0) == sbc::det::asin(1.0));  // clamped
}

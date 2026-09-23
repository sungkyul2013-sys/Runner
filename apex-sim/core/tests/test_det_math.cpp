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

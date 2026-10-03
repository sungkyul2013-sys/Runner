// §23.1 자유낙하: 10 m 낙하 직후 속도 ≈ √(2gh) = 14.007 m/s, 오차 0.5% 미만.
#include <catch2/catch_test_macros.hpp>
#include <cmath>

#include "sbc/world.h"
#include "test_util.h"

using namespace sbc;

TEST_CASE("free fall from 10 m reaches sqrt(2gh) within 0.5%", "[physics][23.1]") {
  World w;  // default gravity, no ground
  w.addBody(test::singleNode({0.0f, 0.0f, 0.0f}));
  const double h = 10.0;
  const double g = kStandardGravity;
  double prevY = 0.0, prevV = 0.0;
  for (int s = 0; s < 100000; ++s) {
    w.step();
    const double y = w.body(0).nodeWorldPosition(0).y;  // local frame re-bases every 4 m
    const double v = -static_cast<double>(w.body(0).vy[0]);
    if (y <= -h) {
      // Linear interpolation to the exact 10 m crossing.
      const double t = (-h - prevY) / (y - prevY);
      const double speed = prevV + t * (v - prevV);
      const double expected = std::sqrt(2.0 * g * h);
      INFO("speed " << speed << " expected " << expected);
      CHECK(test::relErr(speed, expected) < 0.005);
      CHECK(std::fabs(expected - 14.007) < 1e-3);
      return;
    }
    prevY = y;
    prevV = v;
  }
  FAIL("node never fell 10 m");
}

TEST_CASE("symplectic Euler velocity is exact under constant gravity", "[physics]") {
  World w;
  w.addBody(test::singleNode({0.0f, 0.0f, 0.0f}));
  const int n = 2000;  // 1 s
  w.step(n);
  const double expected = kStandardGravity * n * static_cast<double>(kDefaultDt);
  CHECK(test::relErr(-w.body(0).vy[0], expected) < 1e-4);
  // 0.0005 is not representable in binary; 2000 float steps sum to 1.0000000475 s.
  CHECK(std::fabs(w.time() - 1.0) < 1e-6);
}

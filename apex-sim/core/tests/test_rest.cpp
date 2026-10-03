// §23.1 정지 안정성: 평지에 세운 구조물이 10분 동안 미끄러지거나 떨리지 않는다 (M0: 트러스 구조물,
// 차량 + 30% 경사 브레이크 정지는 M1). 경사면 정지는 정지 마찰(µs = 0.6 > tan θ = 0.3)로 확인한다.
#include <catch2/catch_test_macros.hpp>
#include <cmath>

#include "sbc/builder.h"
#include "sbc/det_math.h"
#include "sbc/scenes.h"
#include "sbc/world.h"
#include "test_util.h"

using namespace sbc;

namespace {

constexpr double kMaxDrift = 1e-3;       // [m] "미끄러지지 않는다"
constexpr double kMaxRmsSpeed = 1e-3;    // [m/s] "떨리지 않는다"
constexpr float kRadius = 0.1f;          // [m]

LatticeParams restingBlock(DVec3 center, Vec3 ypr) {
  LatticeParams p;
  p.center = center;
  p.size = {0.6f, 0.6f, 0.6f};
  p.nx = p.ny = p.nz = 3;
  p.totalMass = 50.0f;
  p.nodeRadius = kRadius;
  p.axialStiffness = 5.0e4f;
  p.dampingRatio = 0.25f;
  p.material = material::kSteel;
  p.yawPitchRoll = ypr;
  return p;
}

DVec3 centroid(const Body& b) {
  DVec3 c;
  for (int i = 0; i < b.nodeCount(); ++i) c += b.nodeWorldPosition(i);
  return c * (1.0 / b.nodeCount());
}

double rmsSpeed(const Body& b) {
  double s = 0.0;
  for (int i = 0; i < b.nodeCount(); ++i) s += dot(toDouble(b.nodeVelocity(i)), toDouble(b.nodeVelocity(i)));
  return std::sqrt(s / b.nodeCount());
}

}  // namespace

TEST_CASE("structure resting on flat ground neither creeps nor jitters for 10 minutes", "[physics][23.1][slow]") {
  World w;
  applyDefaultContactPairs(w);
  w.addGroundPlane(0.0, material::kConcrete);
  w.addBody(makeLattice(restingBlock({0.0, 0.3 + kRadius + 0.001, 0.0}, {})));
  w.step(4000);  // settle 2 s
  const DVec3 start = centroid(w.body(0));
  w.step(600 * 2000);  // 10 min at 2000 Hz
  const DVec3 end = centroid(w.body(0));
  INFO("drift " << test::norm(end - start) << " m, rms speed " << rmsSpeed(w.body(0)) << " m/s");
  CHECK(test::norm(end - start) < kMaxDrift);
  CHECK(rmsSpeed(w.body(0)) < kMaxRmsSpeed);
}

TEST_CASE("structure holds still on a 30% grade by static friction", "[physics][23.1]") {
  const double theta = std::atan(0.3);  // 30 % grade = 16.7°
  const double c = det::cos(theta), s = det::sin(theta);
  World w;
  applyDefaultContactPairs(w);
  // 20 × 20 m slab rotated by −θ about +Z: surface y = −x·tanθ, normal (sinθ, cosθ, 0) → downhill is +x.
  const float hx = 10.0f, hz = 10.0f;
  const std::vector<float> v = {
      static_cast<float>(-hx * c), static_cast<float>(hx * s),  -hz,
      static_cast<float>(-hx * c), static_cast<float>(hx * s),  hz,
      static_cast<float>(hx * c),  static_cast<float>(-hx * s), hz,
      static_cast<float>(hx * c),  static_cast<float>(-hx * s), -hz,
  };
  w.addStaticMesh({}, v, {0, 1, 2, 0, 2, 3}, material::kConcrete);
  const double lift = 0.3 + kRadius + 0.001;
  w.addBody(makeLattice(restingBlock({s * lift, c * lift, 0.0}, {0.0f, 0.0f, static_cast<float>(-theta)})));
  w.step(6000);  // settle 3 s
  const DVec3 start = centroid(w.body(0));
  w.step(60 * 2000);  // 1 min
  const DVec3 end = centroid(w.body(0));
  INFO("drift " << test::norm(end - start) << " m");
  CHECK(test::norm(end - start) < kMaxDrift);
  CHECK(rmsSpeed(w.body(0)) < kMaxRmsSpeed);
}

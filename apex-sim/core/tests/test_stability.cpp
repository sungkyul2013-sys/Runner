// §4.2 임계 시간 간격 검사기: 해석 사례와 대조하고, 실제 발산 경계와 일치하는지 시뮬레이션으로 확인.
#include <catch2/catch_test_macros.hpp>
#include <cmath>

#include "sbc/stability.h"
#include "sbc/world.h"
#include "test_util.h"

using namespace sbc;

namespace {

// Two free 1 kg nodes joined by one beam; critical dt = 2√(m_r/k) = 2√(0.5/k).
BodyDesc dumbbell(float k, float c, float stretch) {
  BodyDesc d;
  NodeDesc a, b;
  a.position = {0.0f, 0.0f, 0.0f};
  b.position = {1.0f + stretch, 0.0f, 0.0f};
  d.nodes = {a, b};
  BeamDesc beam;
  beam.a = 0; beam.b = 1;
  beam.stiffness = k;
  beam.damping = c;
  beam.restLength = 1.0f;
  d.beams.push_back(beam);
  return d;
}

constexpr float kK = 2.0e6f;  // [N/m] → critical dt = 2√(0.5/2e6) = 1 ms

}  // namespace

TEST_CASE("beam critical dt matches 2*sqrt(m_r/k) and flags violations", "[stability][4.2]") {
  const Body b = buildBody(dumbbell(kK, 0.0f, 0.0f));
  const auto ok = checkStability(b, 0.0005, 0.8);
  CHECK(std::fabs(ok.minCriticalDt - 1e-3) < 1e-9);
  CHECK(ok.ok());
  const auto bad = checkStability(b, 0.0009, 0.8);  // 0.9 ms > 0.8 × 1 ms
  CHECK(bad.beamViolations == 1);
  REQUIRE_FALSE(bad.worst.empty());
  CHECK_FALSE(bad.worst.front().isNode);
}

TEST_CASE("damping tightens the beam limit by (sqrt(1+z^2)-z)", "[stability][4.2]") {
  const double zeta = 0.5;
  const float c = static_cast<float>(2.0 * zeta * std::sqrt(kK * 0.5));
  const auto r = checkStability(buildBody(dumbbell(kK, c, 0.0f)), 0.0005, 0.8);
  CHECK(std::fabs(r.minCriticalDt - 1e-3 * (std::sqrt(1.0 + zeta * zeta) - zeta)) < 1e-7);
}

TEST_CASE("node Gershgorin bound catches stiff clusters", "[stability][4.2]") {
  // A 1 kg hub tied to six fixed anchors: dt < √(2m/Σk).
  BodyDesc d;
  NodeDesc hub;
  d.nodes.push_back(hub);
  const Vec3 dirs[6] = {{1, 0, 0}, {-1, 0, 0}, {0, 1, 0}, {0, -1, 0}, {0, 0, 1}, {0, 0, -1}};
  for (const Vec3& dir : dirs) {
    NodeDesc anchor;
    anchor.position = dir;
    anchor.flags = node_flag::kFixed;
    d.nodes.push_back(anchor);
    BeamDesc beam;
    beam.a = 0;
    beam.b = static_cast<int32_t>(d.nodes.size() - 1);
    beam.stiffness = 1.0e6f;
    d.beams.push_back(beam);
  }
  const auto r = checkStability(buildBody(d), 0.0005, 0.8);
  CHECK(std::fabs(r.minCriticalDt - std::sqrt(2.0 / 6.0e6)) < 1e-9);
  CHECK(r.nodeViolations == 1);  // 0.5 ms > 0.8 × 0.577 ms
}

TEST_CASE("the predicted limit is where explicit integration really diverges", "[stability][4.2]") {
  auto maxExtension = [](float dt) {
    WorldParams p = test::zeroGravity();
    p.dt = dt;
    World w(p);
    w.addBody(dumbbell(kK, 0.0f, 0.01f));
    double worst = 0.0;
    for (int s = 0; s < 4000; ++s) {
      w.step();
      const double len = std::fabs(static_cast<double>(w.body(0).px[1]) - w.body(0).px[0]);
      worst = std::max(worst, std::fabs(len - 1.0));
      if (!(worst < 1e6)) break;
    }
    return worst;
  };
  CHECK(maxExtension(0.00095f) < 0.05);  // 0.95 × critical: bounded (initial stretch 0.01 m)
  CHECK(maxExtension(0.00105f) > 1.0);   // 1.05 × critical: blows up
}

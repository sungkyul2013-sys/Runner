// §23.1 운동량 보존: 외력 없는 충돌 전후 총 운동량 오차 1% 미만.
#include <catch2/catch_test_macros.hpp>

#include "sbc/builder.h"
#include "sbc/scenes.h"
#include "sbc/world.h"
#include "test_util.h"

using namespace sbc;

namespace {
LatticeParams freeCube(DVec3 center, Vec3 velocity, Vec3 ypr) {
  LatticeParams p;
  p.center = center;
  p.nx = p.ny = p.nz = 4;
  p.size = {0.9f, 0.9f, 0.9f};
  p.totalMass = 80.0f;
  p.nodeRadius = 0.15f;
  p.axialStiffness = 4.0e4f;
  p.dampingRatio = 0.25f;
  p.yieldStrain = 0.015f;
  p.hardening = 0.05f;
  p.velocity = velocity;
  p.yawPitchRoll = ypr;
  return p;
}
}  // namespace

TEST_CASE("linear momentum is conserved through a body-body collision", "[physics][23.1]") {
  WorldParams wp = test::zeroGravity();
  wp.threadCount = 2;
  World w(wp);
  applyDefaultContactPairs(w);
  w.addBody(makeLattice(freeCube({-1.5, 0.0, 0.0}, {8.0f, 0.0f, 0.0f}, {0.3f, 0.2f, 0.1f})));
  w.addBody(makeLattice(freeCube({1.5, 0.35, 0.2}, {-3.0f, 0.0f, 0.5f}, {-0.2f, 0.0f, 0.4f})));

  const MomentumReport before = w.measureMomentum();
  int contactSteps = 0;
  for (int s = 0; s < 3000; ++s) {  // 1.5 s: approach, impact, separation
    w.step();
    if (w.lastStepStats().bodyContacts > 0) ++contactSteps;
  }
  REQUIRE(contactSteps > 0);  // the bodies really collided
  const MomentumReport after = w.measureMomentum();
  const double dp = test::norm(after.linear - before.linear) / test::norm(before.linear);
  INFO("contact steps " << contactSteps << ", linear rel err " << dp);
  CHECK(dp < 0.01);
  // Something was dissipated/deformed, so the impact was not trivially elastic.
  CHECK(w.measureEnergy().kinetic < 0.95 * (0.5 * 80.0 * 64.0 + 0.5 * 80.0 * (9.0 + 0.25)));
}

TEST_CASE("angular momentum is conserved through a frictionless body-body collision", "[physics][5.3]") {
  // Point-mass nodes have no spin, so friction applied at node centres (one contact radius away from the true
  // contact point) exerts a spurious couple — see KNOWN_ISSUES. Central (normal + beam) forces conserve L exactly.
  WorldParams wp = test::zeroGravity();
  World w(wp);
  ContactPairParams frictionless;
  frictionless.staticFriction = 0.0f;
  frictionless.kineticFriction = 0.0f;
  w.setContactPair(0, 0, frictionless);
  w.addBody(makeLattice(freeCube({-1.5, 0.0, 0.0}, {8.0f, 0.0f, 0.0f}, {0.3f, 0.2f, 0.1f})));
  w.addBody(makeLattice(freeCube({1.5, 0.35, 0.2}, {-3.0f, 0.0f, 0.5f}, {-0.2f, 0.0f, 0.4f})));
  const MomentumReport before = w.measureMomentum();
  w.step(3000);
  const MomentumReport after = w.measureMomentum();
  const double dl = test::norm(after.angular - before.angular) / test::norm(before.angular);
  INFO("angular rel err " << dl);
  CHECK(dl < 0.01);
  CHECK(test::norm(after.linear - before.linear) / test::norm(before.linear) < 0.01);
}

TEST_CASE("internal beam forces alone conserve momentum exactly (to float rounding)", "[physics]") {
  World w(test::zeroGravity());
  LatticeParams p = freeCube({0.0, 0.0, 0.0}, {1.0f, -2.0f, 0.5f}, {0.1f, 0.2f, 0.3f});
  BodyDesc d = makeLattice(p);
  for (size_t i = 0; i < d.nodes.size(); ++i) {  // random-ish internal motion
    d.nodes[i].velocity.x += 0.3f * static_cast<float>((i * 7) % 5) - 0.6f;
    d.nodes[i].velocity.y += 0.2f * static_cast<float>((i * 3) % 7) - 0.6f;
  }
  w.addBody(d);
  const auto before = w.measureMomentum();
  w.step(4000);
  const auto after = w.measureMomentum();
  CHECK(test::norm(after.linear - before.linear) / test::norm(before.linear) < 1e-4);
}

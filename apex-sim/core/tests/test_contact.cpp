// §5.2 접촉·CCD. 차량 대상 "관통 0/1000"은 M2; M0는 노드·트러스가 얇은 정적 벽을 뚫지 않는지 확인한다.
#include <catch2/catch_test_macros.hpp>
#include <cmath>

#include "sbc/builder.h"
#include "sbc/det_math.h"
#include "sbc/scenes.h"
#include "sbc/world.h"
#include "test_util.h"

using namespace sbc;

namespace {

constexpr double kWallFront = 2.0;       // [m] x of the thin wall's front face
constexpr float kWallHalfThick = 0.025f; // [m] 5 cm wall

// Deterministic pseudo-random numbers (SplitMix64) for reproducible trials.
struct Rng {
  uint64_t s;
  double next() {
    uint64_t z = (s += 0x9E3779B97F4A7C15ull);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
    return static_cast<double>((z ^ (z >> 31)) >> 11) * (1.0 / 9007199254740992.0);
  }
  double uniform(double a, double b) { return a + (b - a) * next(); }
};

std::unique_ptr<World> thinWallWorld() {
  auto w = std::make_unique<World>(test::zeroGravity());
  applyDefaultContactPairs(*w);
  w->addStaticBox({kWallFront + kWallHalfThick, 0.0, 0.0}, {kWallHalfThick, 5.0f, 5.0f}, 0.0, material::kConcrete);
  return w;
}

}  // namespace

TEST_CASE("1000 random 300-540 km/h node shots never tunnel through a 5 cm wall", "[contact][ccd][5.2]") {
  Rng rng{12345};
  int tunnelled = 0, clampsSeen = 0;
  for (int trial = 0; trial < 1000; ++trial) {
    auto w = thinWallWorld();
    const double speed = rng.uniform(83.4, 150.0);  // 300–540 km/h
    const double yaw = rng.uniform(-1.0, 1.0);      // up to ±57° off the wall normal
    const double pitch = rng.uniform(-0.6, 0.6);
    const Vec3 v{static_cast<float>(speed * det::cos(pitch) * det::cos(yaw)), static_cast<float>(speed * det::sin(pitch)),
                 static_cast<float>(speed * det::cos(pitch) * det::sin(yaw))};
    const Vec3 start{static_cast<float>(rng.uniform(0.3, 1.5)), static_cast<float>(rng.uniform(-1.0, 1.0)),
                     static_cast<float>(rng.uniform(-1.0, 1.0))};
    w->addBody(test::singleNode(start, 1.0f, v));
    for (int s = 0; s < 200; ++s) {
      w->step();
      clampsSeen += w->lastStepStats().ccdClamps;
    }
    if (w->body(0).nodeWorldPosition(0).x > kWallFront) ++tunnelled;
  }
  INFO("CCD clamps seen: " << clampsSeen);
  CHECK(tunnelled == 0);
  CHECK(clampsSeen > 0);  // the guard was actually exercised
}

TEST_CASE("a lattice fired at 300 km/h stays in front of a 5 cm wall", "[contact][ccd][5.2]") {
  auto w = thinWallWorld();
  LatticeParams p;
  p.center = {0.5, 0.0, 0.0};
  p.size = {0.6f, 0.6f, 0.6f};
  p.nx = p.ny = p.nz = 3;
  p.totalMass = 60.0f;
  p.nodeRadius = 0.05f;
  p.axialStiffness = 5.0e4f;
  p.dampingRatio = 0.25f;
  p.yieldStrain = 0.01f;
  p.velocity = {83.4f, 0.0f, 0.0f};
  w->addBody(makeLattice(p));
  double maxX = -1e9;
  for (int s = 0; s < 1000; ++s) {
    w->step();
    for (int i = 0; i < w->body(0).nodeCount(); ++i) maxX = std::max(maxX, w->body(0).nodeWorldPosition(i).x);
  }
  CHECK(maxX <= kWallFront);
}

TEST_CASE("resting node sags by g/omega^2 under its own weight", "[contact][5.2]") {
  World w;
  applyDefaultContactPairs(w);
  w.addGroundPlane(0.0, material::kConcrete);
  BodyDesc d = test::singleNode({0.0f, 0.02f, 0.0f});
  d.nodes[0].radius = 0.02f;
  w.addBody(d);
  w.step(4000);
  const double omega = 2.0 * 3.14159265358979 * w.contactPair(0, material::kConcrete).normalFrequencyHz;
  const double expectedSag = kStandardGravity / (omega * omega);
  const double sag = 0.02 - w.body(0).py[0];
  CHECK(test::relErr(sag, expectedSag) < 0.01);
  CHECK(std::fabs(w.body(0).vy[0]) < 1e-5);
}

TEST_CASE("static friction holds, kinetic friction decelerates at mu_k*g", "[contact][5.2]") {
  World w;
  applyDefaultContactPairs(w);  // steel/concrete µs 0.6, µk 0.45
  w.addGroundPlane(0.0, material::kConcrete);
  BodyDesc d = test::singleNode({0.0f, 0.02f, 0.0f}, 1.0f, {5.0f, 0.0f, 0.0f});
  w.addBody(d);
  w.step(40);  // let the contact load up (20 ms)
  const double v0 = w.body(0).vx[0];
  w.step(400);  // 0.2 s of sliding
  const double decel = (v0 - w.body(0).vx[0]) / 0.2;
  CHECK(test::relErr(decel, 0.45 * kStandardGravity) < 0.02);
  w.step(4000);  // comes to rest and stays
  CHECK(std::fabs(w.body(0).vx[0]) < 1e-4);
}

TEST_CASE("a node pressed onto the ground keeps sliding when CCD clamps it", "[contact][ccd]") {
  // A soft, frictionless ground contact (2 Hz: 0.16 g at full penetration) cannot hold the node against gravity,
  // so every step ends a hair below the ground and CCD clamps it — as for a tyre tread node, which carries only a
  // share of the road contact. The clamp must remove only the penetration: rewinding to the impact point also undid
  // the tangential step, the node froze in place while its velocity kept its 5 m/s (a crashed car's tread node did
  // exactly this, and its beams pumped megajoules into the car).
  WorldParams p;
  auto w = std::make_unique<World>(p);
  ContactPairParams soft;
  soft.staticFriction = soft.kineticFriction = 0.0f;
  soft.normalFrequencyHz = 2.0f;
  w->setContactPair(0, material::kConcrete, soft);
  w->addGroundPlane(0.0, material::kConcrete);
  w->addBody(test::singleNode({0.0f, 0.0f, 0.0f}, 1.0f, {5.0f, 0.0f, 0.0f}));
  int clamps = 0;
  for (int s = 0; s < 200; ++s) {
    w->step();
    clamps += w->lastStepStats().ccdClamps;
  }
  const DVec3 x = w->body(0).nodeWorldPosition(0);
  INFO("x " << x.x << " y " << x.y << " clamps " << clamps);
  CHECK(clamps > 0);
  CHECK(x.x > 0.45);  // 5 m/s × 0.1 s
  CHECK(x.y > -1e-3);
}

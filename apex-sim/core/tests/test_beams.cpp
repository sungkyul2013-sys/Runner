// §4.1 빔 종류, §4.3 소성변형·파단·breakGroup.
#include <catch2/catch_test_macros.hpp>
#include <cmath>

#include "sbc/world.h"
#include "test_util.h"

using namespace sbc;

namespace {

// Mass hanging from a fixed anchor by one beam (gravity −y).
BodyDesc hanging(float mass, BeamDesc beam, int beamCopies = 1) {
  BodyDesc d;
  NodeDesc anchor;
  anchor.flags = node_flag::kFixed;
  anchor.mass = 0.0f;
  NodeDesc m;
  m.position = {0.0f, -1.0f, 0.0f};
  m.mass = mass;
  d.nodes = {anchor, m};
  beam.a = 0;
  beam.b = 1;
  beam.restLength = 1.0f;
  for (int i = 0; i < beamCopies; ++i) d.beams.push_back(beam);
  return d;
}

float stepAndGetVelocity(BeamType type, float separation, float minL = 0.0f, float maxL = 0.0f) {
  World w(test::zeroGravity());
  BodyDesc d;
  NodeDesc a, b;
  a.position = {0.0f, 0.0f, 0.0f};
  b.position = {separation, 0.0f, 0.0f};
  d.nodes = {a, b};
  BeamDesc beam;
  beam.a = 0; beam.b = 1;
  beam.type = type;
  beam.stiffness = 1000.0f;
  beam.restLength = 1.0f;
  beam.minLength = minL;
  beam.maxLength = maxL;
  d.beams.push_back(beam);
  w.addBody(d);
  w.step();
  return w.body(0).vx[1];  // > 0: pushed apart, < 0: pulled together
}

}  // namespace

TEST_CASE("plastic yield with hardening settles at the analytic permanent set", "[beams][4.3]") {
  // Weight W = 2 kg · 9.81 = 19.62 N > F_y0 = 10 N. Hardening h = 0.5 → H = k·h/(1−h) = 1000 N/m.
  // Equilibrium: F_y0 + H·δp = W → δp = 9.62 mm; plastic work = F_y0·δp + ½H·δp² = 0.1425 J.
  WorldParams wp;
  wp.trackEnergy = true;
  World w(wp);
  BeamDesc beam;
  beam.stiffness = 1000.0f;
  beam.damping = 2.0f * std::sqrt(1000.0f * 2.0f);  // critically damped → monotone loading
  beam.plasticForce = 10.0f;
  beam.hardening = 0.5f;
  w.addBody(hanging(2.0f, beam));
  w.step(20000);  // 10 s
  const Body& b = w.body(0);
  const double weight = 2.0 * kStandardGravity;
  const double permanent = (weight - 10.0) / 1000.0;
  CHECK(test::relErr(b.restLength[0] - 1.0, permanent) < 0.02);
  CHECK(test::relErr(b.losses.plastic, 10.0 * permanent + 0.5 * 1000.0 * permanent * permanent) < 0.02);
  CHECK(test::relErr(-(b.py[1] + 1.0), permanent + weight / 1000.0) < 0.02);  // plastic + elastic stretch
  CHECK(b.broken[0] == 0);
}

TEST_CASE("beam breaks above its break force and books the released energy", "[beams][4.3]") {
  WorldParams wp;
  wp.trackEnergy = true;
  World w(wp);
  BeamDesc beam;
  beam.stiffness = 1000.0f;
  beam.breakForce = 15.0f;  // < 19.62 N weight
  w.addBody(hanging(2.0f, beam));
  w.step(2000);
  const Body& b = w.body(0);
  CHECK(b.broken[0] == 1);
  CHECK(b.brokenBeamCount == 1);
  CHECK(b.losses.fracture > 0.0);
  CHECK(b.vy[1] < -5.0);  // falling freely after the break
}

TEST_CASE("breakGroup breaks every beam of the group together", "[beams][4.3]") {
  World w;
  BodyDesc d;
  {
    BeamDesc weak;
    weak.stiffness = 1000.0f;
    weak.breakForce = 5.0f;
    weak.breakGroup = 7;
    d = hanging(2.0f, weak);
    BeamDesc strong = weak;
    strong.a = 0;
    strong.b = 1;
    strong.restLength = 1.0f;
    strong.breakForce = kInfiniteForce;  // would hold the weight alone
    d.beams.push_back(strong);
  }
  w.addBody(d);
  w.step(2000);
  const Body& b = w.body(0);
  CHECK(b.broken[0] == 1);
  CHECK(b.broken[1] == 1);
  CHECK(b.vy[1] < -5.0);
}

TEST_CASE("one-sided beam types act only in their direction", "[beams][4.1]") {
  // support: compression only
  CHECK(stepAndGetVelocity(BeamType::kSupport, 0.8f) > 0.0f);
  CHECK(stepAndGetVelocity(BeamType::kSupport, 1.2f) == 0.0f);
  // rope: tension only
  CHECK(stepAndGetVelocity(BeamType::kRope, 1.2f) < 0.0f);
  CHECK(stepAndGetVelocity(BeamType::kRope, 0.8f) == 0.0f);
  // bounded: only outside [0.9, 1.1]
  CHECK(stepAndGetVelocity(BeamType::kBounded, 1.0f, 0.9f, 1.1f) == 0.0f);
  CHECK(stepAndGetVelocity(BeamType::kBounded, 1.2f, 0.9f, 1.1f) < 0.0f);
  CHECK(stepAndGetVelocity(BeamType::kBounded, 0.8f, 0.9f, 1.1f) > 0.0f);
  // normal: both ways
  CHECK(stepAndGetVelocity(BeamType::kNormal, 0.8f) > 0.0f);
  CHECK(stepAndGetVelocity(BeamType::kNormal, 1.2f) < 0.0f);
}

TEST_CASE("buildBody rejects malformed descriptions", "[beams]") {
  BodyDesc d;
  CHECK_THROWS(buildBody(d));  // no nodes
  d.nodes.resize(2);
  d.nodes[1].position = {1.0f, 0.0f, 0.0f};
  BeamDesc beam;
  beam.a = 0; beam.b = 5;
  d.beams.push_back(beam);
  CHECK_THROWS(buildBody(d));  // bad index
  d.beams[0].b = 1;
  d.nodes[0].mass = 0.0f;
  CHECK_THROWS(buildBody(d));  // massless free node
}

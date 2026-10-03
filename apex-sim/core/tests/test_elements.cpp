// §4.1 anisotropic / hydro beams, pressure groups, §7 sliders and torsion bars.
#include <catch2/catch_test_macros.hpp>
#include <cmath>

#include "sbc/world.h"
#include "test_util.h"

using namespace sbc;

namespace {

NodeDesc node(Vec3 p, float m = 1.0f, uint8_t flags = 0) {
  NodeDesc n;
  n.position = p;
  n.mass = m;
  n.flags = flags;
  return n;
}

BeamDesc beam(int a, int b, float k, BeamType type = BeamType::kNormal) {
  BeamDesc d;
  d.a = a;
  d.b = b;
  d.stiffness = k;
  d.type = type;
  return d;
}

// Closed cube surface: 8 nodes, 12 outward CCW triangles (same corner bits as World::addStaticBox).
BodyDesc pressurisedCube(float half, float gauge, float k) {
  BodyDesc d;
  for (int i = 0; i < 8; ++i) {
    d.nodes.push_back(node({(i & 1) ? half : -half, (i & 2) ? half : -half, (i & 4) ? half : -half}, 1.0f));
  }
  for (int i = 0; i < 8; ++i) {
    for (int j = i + 1; j < 8; ++j) {
      BeamDesc b = beam(i, j, k);
      b.damping = 2.0f * 0.1f * std::sqrt(k * 0.5f);  // ζ ≈ 0.1 per beam (node-level ζ ≈ 0.19, stable at 2 kHz)
      d.beams.push_back(b);
    }
  }
  PressureGroupDesc g;
  const int idx[36] = {0, 4, 6, 0, 6, 2, 1, 3, 7, 1, 7, 5, 0, 1, 5, 0, 5, 4, 2, 6, 7, 2, 7, 3, 0, 2, 3, 0, 3, 1, 4, 5, 7, 4, 7, 6};
  for (int t = 0; t < 12; ++t) g.triangles.push_back({idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]});
  g.gaugePressure = gauge;
  d.pressureGroups.push_back(g);
  return d;
}

}  // namespace

TEST_CASE("anisotropic beam uses its compression stiffness only when compressed", "[elements][4.1]") {
  auto push = [](float separation) {
    World w(test::zeroGravity());
    BodyDesc d;
    d.nodes = {node({0, 0, 0}, 1.0f, node_flag::kFixed), node({separation, 0, 0})};
    BeamDesc b = beam(0, 1, 1000.0f, BeamType::kAnisotropic);
    b.restLength = 1.0f;
    b.compressionStiffness = 4000.0f;
    d.beams.push_back(b);
    w.addBody(d);
    w.step();
    return w.body(0).vx[1] / w.params().dt;  // acceleration after one step [m/s²]
  };
  CHECK(std::fabs(push(0.9f) - 400.0f) < 1.0f);   // compressed 0.1 m × 4000 N/m
  CHECK(std::fabs(push(1.1f) + 100.0f) < 1.0f);   // stretched 0.1 m × 1000 N/m
}

TEST_CASE("hydro beam follows its input channel at the limited rate", "[elements][4.1]") {
  World w(test::zeroGravity());
  BodyDesc d;
  d.hydroChannels = 1;
  d.nodes = {node({0, 0, 0}, 1.0f, node_flag::kFixed), node({1, 0, 0}, 1.0f, node_flag::kFixed)};
  BeamDesc b = beam(0, 1, 1000.0f, BeamType::kHydro);
  b.hydroChannel = 0;
  b.hydroFactor = 0.2f;   // +20 % at input 1
  b.hydroSpeed = 0.4f;    // 40 % of L0 per second → 0.5 s to reach the target
  d.beams.push_back(b);
  w.addBody(d);
  w.mutableBody(0).hydroInputs[0] = 1.0f;
  w.step(500);  // 0.25 s
  CHECK(std::fabs(w.body(0).restLength[0] - 1.1f) < 1e-3f);
  w.step(1000);
  CHECK(std::fabs(w.body(0).restLength[0] - 1.2f) < 1e-5f);
}

TEST_CASE("slider pulls a node back onto its rail and conserves momentum", "[elements][7]") {
  World w(test::zeroGravity());
  BodyDesc d;
  d.nodes = {node({0, 0, 0}, 5.0f), node({0, 1, 0}, 5.0f), node({0.05f, 0.4f, 0}, 1.0f)};
  d.beams.push_back(beam(0, 1, 1e5f));
  SliderDesc s;
  s.node = 2; s.railA = 0; s.railB = 1;
  s.stiffness = 2e4f;
  s.damping = 2.0f * std::sqrt(2e4f * 1.0f);  // critical for the 1 kg node
  d.sliders.push_back(s);
  w.addBody(d);
  const auto p0 = w.measureMomentum();
  w.step(2000);
  const Body& b = w.body(0);
  CHECK(std::fabs(b.px[2] - b.px[0]) < 1e-3f);  // back on the line x = rail x
  const auto p1 = w.measureMomentum();
  CHECK(test::norm(p1.linear - p0.linear) < 1e-4);
  CHECK(test::norm(p1.angular - p0.angular) < 1e-4);
}

TEST_CASE("pressure group behaves as an isothermal ideal gas and exerts no net force", "[elements][4.1]") {
  WorldParams wp = test::zeroGravity();
  wp.trackEnergy = true;
  World w(wp);
  // 0.5 m cube at 200 kPa gauge held by beams: the gas expands the cube until the beams balance it.
  w.addBody(pressurisedCube(0.25f, 2e5f, 5e5f));
  const auto p0 = w.measureMomentum();
  w.step(4000);
  const Body& b = w.body(0);
  const double v0 = b.groupInitialVolume[0];
  double v = 0.0;
  {
    // recompute volume from the final state
    BodyDesc probe = pressurisedCube(0.25f, 0.0f, 1.0f);
    for (int i = 0; i < 8; ++i) probe.nodes[static_cast<size_t>(i)].position = b.nodePosition(i);
    const Body pb = buildBody(probe);
    v = pb.groupInitialVolume[0];
  }
  CHECK(v > v0);  // expanded
  const double pabs = b.groupCurrentGauge[0] + 101325.0;
  CHECK(test::relErr(pabs * v, (2e5 + 101325.0) * v0) < 1e-4);  // p·V = const (settled: no lag between states)
  const auto p1 = w.measureMomentum();
  CHECK(test::norm(p1.linear - p0.linear) < 1e-3);
  // Energy bookkeeping includes the gas energy: the damping loss equals the released gas + elastic energy.
  const EnergyReport e = w.measureEnergy();
  INFO("balance " << e.balance() << " damping " << e.losses.beamDamping);
  CHECK(e.losses.beamDamping > 1.0);
  CHECK(std::fabs(e.balance()) < 0.01 * e.losses.beamDamping);
}

TEST_CASE("torsion bar resists relative twist and conserves angular momentum", "[elements][7]") {
  WorldParams wp = test::zeroGravity();
  World w(wp);
  BodyDesc d;
  // pivots on the x axis, levers along +y; lever 2 twisted by 0.1 rad initial angular velocity.
  d.nodes = {node({0, 0, 0}, 2.0f), node({1, 0, 0}, 2.0f), node({0, 0.3f, 0}, 1.0f), node({1, 0.3f, 0}, 1.0f)};
  d.beams = {beam(0, 1, 2e5f), beam(0, 2, 2e5f), beam(1, 3, 2e5f)};
  TorsionBarDesc t;
  t.arm1 = 2; t.pivot1 = 0; t.pivot2 = 1; t.arm2 = 3;
  t.stiffness = 500.0f;  // [N·m/rad]
  d.torsionBars.push_back(t);
  d.nodes[3].velocity = {0.0f, 0.0f, 0.3f};  // lever 2 swings about +x
  w.addBody(d);
  const auto p0 = w.measureMomentum();
  double maxTwist = 0.0;
  for (int s = 0; s < 4000; ++s) {
    w.step();
    const Body& b = w.body(0);
    const double twist = std::atan2(b.pz[3] - b.pz[1], b.py[3] - b.py[1]) - std::atan2(b.pz[2] - b.pz[0], b.py[2] - b.py[0]);
    maxTwist = std::max(maxTwist, std::fabs(twist));
  }
  CHECK(maxTwist > 0.005);
  CHECK(maxTwist < 0.3);  // the bar bounded the twist
  const auto p1 = w.measureMomentum();
  CHECK(test::norm(p1.angular - p0.angular) < 1e-4 * (1.0 + test::norm(p0.angular)));
  CHECK(test::norm(p1.linear - p0.linear) < 1e-4);
}

// §5.1 · §5.2 body ↔ body contact (M2): node↔triangle, edge↔edge, CCD against moving triangles, self-collision
// between surface groups, and the KICKOFF C2 penetration count.
#include <catch2/catch_test_macros.hpp>
#include <catch2/generators/catch_generators.hpp>
#include <cmath>

#include "sbc/builder.h"
#include "sbc/det_math.h"
#include "sbc/scenes.h"
#include "sbc/world.h"
#include "test_util.h"

using namespace sbc;

namespace {

struct Rng {  // SplitMix64: reproducible trials
  uint64_t s;
  double next() {
    uint64_t z = (s += 0x9E3779B97F4A7C15ull);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
    return static_cast<double>((z ^ (z >> 31)) >> 11) * (1.0 / 9007199254740992.0);
  }
  double uniform(double a, double b) { return a + (b - a) * next(); }
};

// Square plate 1 m × 1 m, `thickness` thick, normal along x, centred at `centre`.
BodyDesc plate(DVec3 centre, float thickness, float mass, Vec3 velocity = {}) {
  LatticeParams p;
  p.center = centre;
  p.size = {thickness, 1.0f, 1.0f};
  p.nx = 2;
  p.ny = p.nz = 5;
  p.totalMass = mass;
  p.nodeRadius = 0.02f;
  p.axialStiffness = 2.0e4f;  // EA [N]: k = EA/L ≈ 4e5 N/m across the 5 cm thickness (explicit-stable at 2 kHz)
  p.dampingRatio = 0.1f;
  p.velocity = velocity;
  return makeLattice(p);
}

// Edge beams k = edgeStiffness [N/m] (EA = k·size).
BodyDesc cube(DVec3 centre, float size, float mass, Vec3 velocity, Vec3 yawPitchRoll = {}, float edgeStiffness = 1.0e5f) {
  LatticeParams p;
  p.center = centre;
  p.size = {size, size, size};
  p.nx = p.ny = p.nz = 2;
  p.totalMass = mass;
  p.nodeRadius = 0.02f;
  p.axialStiffness = edgeStiffness * size;
  p.dampingRatio = 0.1f;
  p.velocity = velocity;
  p.yawPitchRoll = yawPitchRoll;
  return makeLattice(p);
}

DVec3 linear(const World& w) { return w.measureMomentum().linear; }

}  // namespace

TEST_CASE("a node hitting a plate body is stopped by its triangles, not by node spheres", "[body_contact][5.2]") {
  // The node aims at the middle of a plate face cell, 12 cm from every plate node: node spheres (2 + 2 cm) would let
  // it through; the plate's surface triangles must not.
  WorldParams wp = test::zeroGravity();
  wp.trackEnergy = true;
  World w(wp);
  applyDefaultContactPairs(w);
  w.addBody(plate({0.0, 0.0, 0.0}, 0.05f, 20.0f));
  w.addBody(test::singleNode({-0.5f, 0.125f, 0.125f}, 1.0f, {5.0f, 0.0f, 0.0f}));
  const DVec3 p0 = linear(w);
  int contacts = 0;
  double minX = 1e9, maxX = -1e9;
  for (int s = 0; s < 800; ++s) {
    w.step();
    contacts += w.lastStepStats().bodyContacts;
    const double x = w.body(1).nodeWorldPosition(0).x - w.body(0).origin.x;
    minX = std::min(minX, x);
    maxX = std::max(maxX, x);
    REQUIRE(w.measurePenetration().total() == 0);
  }
  INFO("node x relative to the plate origin: " << maxX);
  CHECK(contacts > 0);
  CHECK(w.body(1).nodeVelocity(0).x < 0.0f);  // bounced back
  CHECK(maxX < -0.025);                         // never behind the plate's front face (x = −0.025)
  CHECK(test::norm(linear(w) - p0) < 1e-4 * 5.0);
  const EnergyReport e = w.measureEnergy();
  CHECK(std::fabs(e.balance()) < 0.02 * 12.5);  // ½·1·5² J
}

TEST_CASE("crossed bars collide edge on edge", "[body_contact][5.2]") {
  // Two 2 m bars (nodes only at their ends, 2 m apart) cross at right angles at their middles: no node comes near the
  // other bar's faces, only the long edges meet. Without edge↔edge contact they would pass through each other.
  auto bar = [](DVec3 centre, bool alongZ, Vec3 velocity) {
    LatticeParams p;
    p.center = centre;
    p.size = alongZ ? Vec3{0.06f, 0.06f, 2.0f} : Vec3{2.0f, 0.06f, 0.06f};
    p.nx = p.ny = p.nz = 2;
    p.totalMass = 4.0f;
    p.nodeRadius = 0.01f;
    p.axialStiffness = 2.0e4f;
    p.dampingRatio = 0.1f;
    p.velocity = velocity;
    return makeLattice(p);
  };
  WorldParams wp = test::zeroGravity();
  wp.trackEnergy = true;
  World w(wp);
  applyDefaultContactPairs(w);
  w.addBody(bar({0.0, 0.0, 0.0}, true, {}));
  w.addBody(bar({0.0, 0.3, 0.0}, false, {0.0f, -3.0f, 0.0f}));
  const DVec3 p0 = linear(w);
  int maxPenetration = 0;
  for (int s = 0; s < 1200; ++s) {
    w.step();
    maxPenetration = std::max(maxPenetration, w.measurePenetration().total());
  }
  const double gap = w.body(1).nodeWorldPosition(0).y - w.body(0).nodeWorldPosition(7).y;
  INFO("upper bar's lowest node above the lower bar's highest: " << gap << " m");
  CHECK(maxPenetration == 0);
  CHECK(gap > -0.06);                          // bar 1 did not pass bar 0 (bars are 6 cm thick)
  double separating = 0.0;  // upper bar's mean vertical velocity relative to the lower one's (equal masses)
  for (int i = 0; i < w.body(1).nodeCount(); ++i) separating += (w.body(1).vy[i] - w.body(0).vy[i]) / 8.0;
  CHECK(separating > 0.0);                     // they bounced apart
  CHECK(test::norm(linear(w) - p0) < 1e-4 * 12.0);
}

TEST_CASE("1000 random 300-540 km/h shots of a cube never pass through a thin panel body", "[body_contact][ccd][5.2][23.1]") {
  // §23.1 관통 0/1000 between bodies: a stiff 20 kg, 20 cm cube at 83–150 m/s (4–7.5 cm per step, more than the
  // 5 cm panel is thick) at a bolted-down panel body (nodes anchored, so the test isolates the sweep tests from the
  // panel folding through its own thickness), random direction, aim and tumble. Penetration per KICKOFF C2 (a node
  // inside the other surface deeper than its radius, or an edge through a triangle) must stay 0 after every step.
  // Two sets of 1000: the second (seed 11) once let 5 through — a cube face bent slightly along its diagonal folded
  // over the panel's rim edge lying almost in its plane (feature × flat edge sweeps, M2n); 8 seeds × 1000 now pass.
  const uint64_t seed = GENERATE(2718ull, 11ull);
  Rng rng{seed};
  int penetrated = 0, clamps = 0;
  for (int trial = 0; trial < 1000; ++trial) {
    World w(test::zeroGravity());
    applyDefaultContactPairs(w);
    BodyDesc panel = plate({0.0, 0.0, 0.0}, 0.05f, 50.0f);
    for (NodeDesc& n : panel.nodes) n.flags |= node_flag::kFixed;
    w.addBody(panel);
    const double speed = rng.uniform(83.4, 150.0);
    const double yaw = rng.uniform(-0.9, 0.9), pitch = rng.uniform(-0.5, 0.5);
    const Vec3 v{static_cast<float>(speed * det::cos(pitch) * det::cos(yaw)), static_cast<float>(speed * det::sin(pitch)),
                 static_cast<float>(speed * det::cos(pitch) * det::sin(yaw))};
    const DVec3 start{-0.45, rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3)};
    const Vec3 tumble{static_cast<float>(rng.uniform(-1.5, 1.5)), static_cast<float>(rng.uniform(-1.5, 1.5)),
                      static_cast<float>(rng.uniform(-1.5, 1.5))};
    w.addBody(cube(start - DVec3{v.x, v.y, v.z} * 0.002, 0.2f, 20.0f, v, tumble, 1.0e6f));
    bool bad = false;
    for (int s = 0; s < 60 && !bad; ++s) {
      w.step();
      clamps += w.lastStepStats().ccdClamps;
      bad = w.measurePenetration().total() > 0;
    }
    if (bad) ++penetrated;
  }
  INFO("seed " << seed << ": CCD clamps seen: " << clamps);
  CHECK(penetrated == 0);
  CHECK(clamps > 0);
}

TEST_CASE("node-triangle contact with friction conserves linear momentum exactly", "[body_contact][5.3]") {
  World w(test::zeroGravity());
  applyDefaultContactPairs(w);
  w.addBody(cube({0.0, 0.0, 0.0}, 0.5f, 30.0f, {0.0f, 0.0f, 0.0f}));
  w.addBody(cube({0.1, 0.62, 0.05}, 0.5f, 10.0f, {1.5f, -4.0f, 0.5f}, {0.4f, 0.1f, 0.2f}));
  const DVec3 p0 = linear(w);
  int contacts = 0;
  for (int s = 0; s < 1000; ++s) {
    w.step();
    contacts += w.lastStepStats().bodyContacts;
  }
  CHECK(contacts > 0);
  CHECK(test::norm(linear(w) - p0) < 1e-5 * test::norm(p0));
}

TEST_CASE("self-collision keeps two surface groups of one body apart", "[body_contact][5.1]") {
  // One body made of two cubes with different surface groups and no beams between them: the moving cube must stop
  // at the other one's surface (a wheel against its arch), with the energy books closed.
  WorldParams wp = test::zeroGravity();
  wp.trackEnergy = true;
  World w(wp);
  applyDefaultContactPairs(w);
  BodyDesc a = cube({0.0, 0.0, 0.0}, 0.5f, 20.0f, {}, {}, 1.0e6f);
  BodyDesc b = cube({0.1, 0.05, 0.9}, 0.5f, 20.0f, {0.0f, 0.0f, -6.0f}, {0.3f, 0.2f, 0.1f}, 1.0e6f);
  for (auto& t : a.triangles) t.group = 0;
  const int offset = static_cast<int>(a.nodes.size());
  for (auto n : b.nodes) {
    n.position = n.position + toFloat(b.origin - a.origin);
    a.nodes.push_back(n);
  }
  for (auto beam : b.beams) {
    beam.a += offset;
    beam.b += offset;
    a.beams.push_back(beam);
  }
  for (auto t : b.triangles) {
    a.triangles.push_back({t.a + offset, t.b + offset, t.c + offset, 1});
  }
  w.addBody(a);
  const double kinetic0 = w.measureEnergy().kinetic;
  const Body& body = w.body(0);
  // Centroid height and vertical velocity of cube a (nodes [0, offset)) and cube b (the rest).
  auto centroid = [&](int from, int to, const std::vector<float>& v) {
    double sum = 0.0;
    for (int i = from; i < to; ++i) sum += v[static_cast<size_t>(i)];
    return sum / (to - from);
  };
  int self = 0;
  double minDistance = 1e9;
  for (int s = 0; s < 800; ++s) {
    w.step();
    self += w.lastStepStats().selfContacts;
    minDistance = std::min(minDistance, centroid(offset, body.nodeCount(), body.pz) - centroid(0, offset, body.pz));
  }
  const double separating = centroid(offset, body.nodeCount(), body.vz) - centroid(0, offset, body.vz);
  INFO("closest approach of the two cube centres: " << minDistance << " m, separation speed " << separating << " m/s");
  CHECK(self > 0);
  CHECK(minDistance > 0.45);  // 0.5 m cubes, one tilted: they never overlap
  CHECK(separating > 0.0);    // b pushed a away and bounced off it
  CHECK(std::fabs(w.measureEnergy().balance()) < 0.02 * kinetic0);
}

// §20 sandbox tools: node grab, crane / winch, tow rope (World tethers).
#include <catch2/catch_test_macros.hpp>

#include <algorithm>
#include <cmath>

#include "sbc/builder.h"
#include "sbc/scenes.h"
#include "sbc/world.h"
#include "test_util.h"

using namespace sbc;

namespace {

LatticeParams crate(DVec3 center) {
  LatticeParams p;
  p.center = center;
  p.size = {0.6f, 0.6f, 0.6f};
  p.nx = p.ny = p.nz = 3;
  p.totalMass = 100.0f;
  p.nodeRadius = 0.05f;
  p.axialStiffness = 4.0e5f;
  p.dampingRatio = 0.3f;
  return p;
}

// The node closest to `p` (world).
int nearestNode(const Body& b, DVec3 p) {
  int best = 0;
  double bestD = 1e30;
  for (int i = 0; i < b.nodeCount(); ++i) {
    const DVec3 d = b.origin + DVec3{b.px[i], b.py[i], b.pz[i]} - p;
    if (dot(d, d) < bestD) { bestD = dot(d, d); best = i; }
  }
  return best;
}

double lowestY(const Body& b) {
  double y = 1e30;
  for (int i = 0; i < b.nodeCount(); ++i) y = std::min(y, b.origin.y + b.py[i]);
  return y;
}

std::unique_ptr<World> yard(int threads = 1) {
  WorldParams wp;
  wp.threadCount = threads;
  wp.trackEnergy = true;
  auto w = std::make_unique<World>(wp);
  applyDefaultContactPairs(*w);
  w->addGroundPlane(0.0, 0);
  return w;
}

}  // namespace

TEST_CASE("a node grab lifts a crate and books its work as external", "[tether][20]") {
  auto run = [](int threads) {
    auto w = yard(threads);
    const int body = w->addBody(makeLattice(crate({0.0, 0.36, 0.0})));
    w->step(1000);  // settle
    const int top = nearestNode(w->body(body), {0.0, 0.66, 0.0});
    TetherDesc g;
    g.body = body;
    g.node = top;
    g.anchor = {0.0, 2.2, 0.0};
    g.maxForce = 3000.0f;  // ≈ 3 × the crate's weight
    const int id = w->addTether(g);
    w->step(6000);  // 3 s: lift, swing, settle
    return std::make_tuple(std::move(w), body, id);
  };
  auto [w, body, id] = run(1);
  const TetherState s = w->tether(id);
  const EnergyReport e = w->measureEnergy();
  INFO("lowest " << lowestY(w->body(body)) << " m, hand gap " << test::norm(s.anchorPosition - s.nodePosition)
                 << " m, tension " << s.tension << " N, external " << e.losses.external << " J, balance " << e.balance());
  CHECK(s.active);
  CHECK(lowestY(w->body(body)) > 0.9);                              // off the ground
  CHECK(test::norm(s.anchorPosition - s.nodePosition) < 0.05);      // hanging at the hand
  CHECK(std::fabs(s.tension - 981.0) < 0.3 * 981.0);                // holding its weight
  CHECK(e.losses.external > 1000.0);                                // m·g·Δh ≈ 1.5 kJ lifted
  CHECK(std::fabs(e.balance()) < 0.02 * e.losses.external);
  // The tether is state: the same run on more threads ends in the same state.
  auto [w3, body3, id3] = run(3);
  CHECK(w3->stateHash() == w->stateHash());
}

TEST_CASE("a winch reels a crate up at its speed and stalls above its capacity", "[tether][20]") {
  for (const float capacity : {5000.0f, 500.0f}) {
    auto w = yard();
    const int body = w->addBody(makeLattice(crate({0.0, 0.36, 0.0})));
    w->step(1000);
    const int top = nearestNode(w->body(body), {0.0, 0.66, 0.0});
    TetherDesc r;
    r.body = body;
    r.node = top;
    r.anchor = {0.0, 4.0, 0.0};
    r.rope = true;
    r.length = 3.4f;  // slack
    r.maxForce = capacity;
    r.reelSpeed = 0.5f;
    const int id = w->addTether(r);
    w->setTetherTargetLength(id, 1.0f);
    float peak = 0.0f, prevLength = r.length, fastest = 0.0f;
    for (int s = 0; s < 16000; ++s) {  // 8 s
      w->step();
      const TetherState t = w->tether(id);
      peak = std::max(peak, t.tension);
      fastest = std::max(fastest, (prevLength - t.length) / w->params().dt);
      prevLength = t.length;
    }
    const TetherState t = w->tether(id);
    const EnergyReport e = w->measureEnergy();
    INFO("capacity " << capacity << " N: length " << t.length << " m, lowest " << lowestY(w->body(body)) << " m, tension "
                     << t.tension << " N (peak " << peak << "), reel " << fastest << " m/s, balance " << e.balance());
    CHECK(fastest <= 0.5f * 1.001f);  // never faster than the drum
    CHECK(peak <= capacity * 1.001f);
    if (capacity > 1000.0f) {
      CHECK(t.length == 1.0f);
      CHECK(lowestY(w->body(body)) > 2.0);  // 4 m − 1 m of rope − 0.6 m crate − sag
      CHECK(std::fabs(t.tension - 981.0) < 0.3 * 981.0);
    } else {
      CHECK(lowestY(w->body(body)) < 0.1);  // too heavy: still on the ground
      CHECK(std::fabs(t.tension - capacity) < 0.05 * capacity);
    }
    CHECK(std::fabs(e.balance()) < 0.02 * std::max(1.0, e.losses.external));
  }
}

TEST_CASE("a tow rope between two bodies pulls the second along and conserves momentum", "[tether][20]") {
  WorldParams wp = test::zeroGravity();
  wp.trackEnergy = true;
  World w(wp);
  LatticeParams a = crate({0.0, 0.0, 0.0});
  a.velocity = {-3.0f, 0.0f, 0.0f};
  const int ba = w.addBody(makeLattice(a));
  const int bb = w.addBody(makeLattice(crate({3.0, 0.0, 0.0})));
  TetherDesc r;
  r.body = ba;
  r.node = nearestNode(w.body(ba), {0.3, 0.0, 0.0});
  r.anchorBody = bb;
  r.anchorNode = nearestNode(w.body(bb), {2.7, 0.0, 0.0});
  r.rope = true;
  r.length = 2.9f;  // 0.5 m of slack
  const int id = w.addTether(r);
  const MomentumReport before = w.measureMomentum();
  w.step(4000);  // 2 s: the rope snaps taut after ≈ 0.17 s
  const MomentumReport after = w.measureMomentum();
  const Body& b = w.body(bb);
  double vx = 0.0, m = 0.0;
  for (int i = 0; i < b.nodeCount(); ++i) { vx += b.mass[i] * b.vx[i]; m += b.mass[i]; }
  INFO("B moves at " << vx / m << " m/s, Δp " << test::norm(after.linear - before.linear) << " of " << test::norm(before.linear));
  CHECK(w.tether(id).active);
  CHECK(vx / m < -0.5);  // towed
  CHECK(test::norm(after.linear - before.linear) < 1e-4 * test::norm(before.linear));
}

TEST_CASE("a tether follows its node when the node breaks loose", "[tether][20]") {
  WorldParams wp = test::zeroGravity();
  wp.trackEnergy = true;
  World w(wp);
  LatticeParams p = crate({0.0, 0.0, 0.0});
  p.breakStrain = 0.01f;  // 4 kN beams
  const int body = w.addBody(makeLattice(p));
  const int corner = nearestNode(w.body(body), {0.3, 0.3, 0.3});
  TetherDesc g;
  g.body = body;
  g.node = corner;
  g.anchor = {1.5, 1.5, 1.5};
  g.maxForce = 30000.0f;  // yank it off
  const int id = w.addTether(g);
  w.step(2000);
  const TetherState s = w.tether(id);
  INFO("bodies " << w.bodyCount() << ", tether on body " << s.body << " node " << s.node << ", gap "
                 << test::norm(s.anchorPosition - s.nodePosition));
  CHECK(w.bodyCount() > 1);
  CHECK(s.active);
  CHECK(s.body != body);  // it went with the corner
  CHECK(test::norm(s.anchorPosition - s.nodePosition) < 0.2);
}

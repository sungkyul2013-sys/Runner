// §4.3 분리 부품: parts that break loose become bodies of their own (island split) and keep colliding with
// everything; breakGroup chains (both hinges → the door goes); a vehicle that loses a wheel drives on.
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <cmath>
#include <fstream>
#include <sstream>
#include <string>

#include "sbc/builder.h"
#include "sbc/scenes.h"
#include "sbc/vehicle_json.h"
#include "sbc/world.h"
#include "test_util.h"

using namespace sbc;

namespace {

// Two 0.5 m cubes 0.3 m apart along x (collision groups 0 and 1) in one body, tied across the gap by four beams
// that break at `breakForce` [N] and share break group `group` (−1: none).
BodyDesc tiedCubes(float breakForce, int32_t group, Vec3 velocityB) {
  LatticeParams p;
  p.size = {0.5f, 0.5f, 0.5f};
  p.nx = p.ny = p.nz = 2;
  p.totalMass = 20.0f;
  p.nodeRadius = 0.03f;
  p.axialStiffness = 2.0e5f;
  p.dampingRatio = 0.1f;
  p.center = {0.0, 1.0, 0.0};
  BodyDesc a = makeLattice(p);
  p.center = {0.8, 1.0, 0.0};
  p.velocity = velocityB;
  p.surfaceGroup = 1;
  const BodyDesc b = makeLattice(p);
  for (auto& t : a.triangles) t.group = 0;
  const int offset = static_cast<int>(a.nodes.size());
  for (NodeDesc n : b.nodes) {
    n.position = n.position + toFloat(b.origin - a.origin);
    a.nodes.push_back(n);
  }
  for (BeamDesc beam : b.beams) {
    beam.a += offset;
    beam.b += offset;
    a.beams.push_back(beam);
  }
  for (CollisionTriDesc t : b.triangles) a.triangles.push_back({t.a + offset, t.b + offset, t.c + offset, 1});
  // Cube A's +x face nodes (x = +0.25) are 1, 3, 5, 7; cube B's −x face nodes are offset + 0, 2, 4, 6.
  const int faceA[4] = {1, 3, 5, 7}, faceB[4] = {0, 2, 4, 6};
  for (int k = 0; k < 4; ++k) {
    BeamDesc tie;
    tie.a = faceA[k];
    tie.b = offset + faceB[k];
    tie.stiffness = 5.0e4f;
    tie.damping = 20.0f;
    tie.breakForce = breakForce;
    tie.breakGroup = group;
    a.beams.push_back(tie);
  }
  return a;
}

double totalMass(const Body& b) {
  double m = 0.0;
  for (int i = 0; i < b.nodeCount(); ++i) m += b.invMass[i] > 0.0f ? b.mass[i] : 0.0;
  return m;
}

}  // namespace

TEST_CASE("a body torn in two becomes two bodies that keep colliding", "[islands][4.3]") {
  WorldParams wp = test::zeroGravity();
  wp.trackEnergy = true;
  World w(wp);
  applyDefaultContactPairs(w);
  w.addBody(tiedCubes(800.0f, -1, {6.0f, 0.0f, 0.0f}));  // B flies off at 6 m/s and tears the ties
  const DVec3 p0 = w.measureMomentum().linear;
  int splits = 0;
  for (int s = 0; s < 400; ++s) {
    w.step();
    splits += w.lastStepStats().islandsSplit;
  }
  REQUIRE(w.bodyCount() == 2);
  CHECK(splits == 1);
  CHECK(std::fabs(totalMass(w.body(0)) - 20.0) < 1e-3);  // the heavier (first) part stays: A, and B moved out
  CHECK(std::fabs(totalMass(w.body(1)) - 20.0) < 1e-3);
  CHECK(w.body(1).triangleCount() == 12);                 // B took its surface along
  CHECK(test::norm(w.measureMomentum().linear - p0) < 1e-3);
  const EnergyReport e = w.measureEnergy();
  INFO("balance " << e.balance() << " J of " << 0.5 * 20.0 * 36.0 << " J");
  CHECK(std::fabs(e.balance()) < 0.02 * 0.5 * 20.0 * 36.0);
  // The part is a body like any other: sent back, it collides with what it broke off from.
  w.addBodyVelocity(1, {-10.0f, 0.0f, 0.0f});
  int contacts = 0, maxPenetration = 0;
  for (int s = 0; s < 600; ++s) {
    w.step();
    contacts += w.lastStepStats().bodyContacts;
    maxPenetration = std::max(maxPenetration, w.measurePenetration().total());
  }
  CHECK(contacts > 0);
  CHECK(maxPenetration == 0);
  double separating = 0.0;  // B's mean x velocity relative to A's (equal masses: the collision hands momentum over)
  for (int i = 0; i < 8; ++i) separating += (w.body(1).vx[i] - w.body(0).vx[i]) / 8.0;
  CHECK(separating > 0.0);  // bounced off A
}

TEST_CASE("a break group detaches the whole part when one mount fails", "[islands][4.3]") {
  // The four ties share a break group (a bumper's mounts): the first one past its break force takes the others
  // with it, and the part becomes its own body in the same step.
  World w(test::zeroGravity());
  applyDefaultContactPairs(w);
  BodyDesc d = tiedCubes(1.0e9f, 7, {6.0f, 0.0f, 0.0f});
  d.beams[d.beams.size() - 1].breakForce = 200.0f;  // only one tie is weak; alone the other three would hold
  w.addBody(d);
  for (int s = 0; s < 400 && w.bodyCount() == 1; ++s) w.step();
  REQUIRE(w.bodyCount() == 2);
  int brokenTies = 0;
  const Body& a = w.body(0);
  for (int i = 0; i < a.beamCount(); ++i) brokenTies += a.breakGroup[i] == 7 && a.broken[i];
  CHECK(brokenTies == 4);
}

TEST_CASE("Porsche 911 Turbo: a wheel torn off rolls away as its own body, the car drives on three",
          "[islands][vehicle_json][porsche]") {
  std::ifstream f(std::string(SBC_VEHICLE_DIR) + "/porsche_911_turbo_991/vehicle.json");
  REQUIRE(f.good());
  std::stringstream text;
  text << f.rdbuf();
  World w;
  applyDefaultContactPairs(w);
  w.addGroundPlane(0.0, material::kAsphalt);
  LoadedVehicle car = loadVehicleJson(text.str(), {{0.0, 0.0, 0.0}, 0.0, 12.0f});
  // Shear the front-left wheel off its hub: every spoke (rim node ↔ axle node) gives way at 50 N (static load ≈ 100 N each).
  const WheelDesc& fl = car.build.vehicle.wheels[0];
  for (BeamDesc& b : car.build.body.beams) {
    const bool axle = b.a == fl.axleLeft || b.a == fl.axleRight || b.b == fl.axleLeft || b.b == fl.axleRight;
    const bool rim = std::find(fl.rotatingNodes.begin(), fl.rotatingNodes.end(), b.a) != fl.rotatingNodes.end() ||
                     std::find(fl.rotatingNodes.begin(), fl.rotatingNodes.end(), b.b) != fl.rotatingNodes.end();
    if (axle && rim) b.breakForce = 50.0f;
  }
  const int body = w.addBody(car.build.body);
  const int v = w.addVehicle(body, car.build.vehicle);
  VehicleInput in;
  in.throttle = 0.3f;
  w.setVehicleInput(v, in);
  for (int s = 0; s < 6000; ++s) w.step();
  REQUIRE(w.bodyCount() == 2);                      // the wheel is a body of its own
  const Body& wheel = w.body(1);
  CHECK(wheel.pressureGroupCount() == 1);           // with its air
  CHECK(wheel.triangleCount() > 0);
  CHECK(!w.vehicleTelemetry(v).wheels[0].contact);  // the car knows it is gone
  CHECK(w.vehicleTelemetry(v).wheels[3].contact);
  const double y = wheel.nodeWorldPosition(0).y;
  CHECK(y > -0.05);                                 // lying or rolling on the road, not through it
  CHECK(std::isfinite(w.vehicleTelemetry(v).speed));
}

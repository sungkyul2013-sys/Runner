// Vehicle subsystem (§6 tyres, §8 powertrain, §9 brakes/electronics) on the procedural APEX Proto car.
#include <catch2/catch_test_macros.hpp>
#include <cmath>
#include <memory>

#include "sbc/builder.h"
#include "sbc/proto_car.h"
#include "sbc/scenes.h"
#include "sbc/stability.h"
#include "sbc/world.h"
#include "test_util.h"

using namespace sbc;

namespace {

struct Car {
  std::unique_ptr<World> world;
  VehicleBuild build;
  int body = -1, vehicle = -1;

  const VehicleTelemetry& tel() const { return world->vehicleTelemetry(vehicle); }
  DVec3 center() const { return world->body(body).nodeWorldPosition(build.vehicle.refCenter); }
  void input(const VehicleInput& in) { world->setVehicleInput(vehicle, in); }
  void seconds(double s) { world->step(static_cast<int>(s / world->params().dt + 0.5)); }
};

Car makeCar(float speed = 0.0f, int threads = 1, bool trackEnergy = false, Vec3 gravity = {0.0f, -kStandardGravity, 0.0f}) {
  Car car;
  WorldParams wp;
  wp.threadCount = threads;
  wp.trackEnergy = trackEnergy;
  wp.gravity = gravity;
  car.world = std::make_unique<World>(wp);
  applyDefaultContactPairs(*car.world);
  car.world->addGroundPlane(0.0, material::kAsphalt);
  ProtoCarOptions o;
  o.speed = speed;
  car.build = makeProtoCar(o);
  car.body = car.world->addBody(car.build.body);
  car.vehicle = car.world->addVehicle(car.body, car.build.vehicle);
  return car;
}

double totalMass(const Body& b) {
  double m = 0.0;
  for (int i = 0; i < b.nodeCount(); ++i) m += b.mass[i];
  return m;
}

}  // namespace

TEST_CASE("proto car passes the explicit stability check", "[vehicle][4.2]") {
  const Car car = makeCar();
  const StabilityReport r = checkStability(car.world->body(car.body), car.world->params().dt);
  INFO("min critical dt " << r.minCriticalDt);
  CHECK(r.ok());
}

TEST_CASE("proto car settles on its tyres and holds still", "[vehicle][23.1]") {
  Car car = makeCar(0.0f, 1, true);
  VehicleInput in;
  in.handbrake = 1.0f;
  car.input(in);
  car.seconds(3.0);
  const DVec3 p0 = car.center();
  double load = 0.0;
  for (const WheelTelemetry& w : car.tel().wheels) {
    CHECK(w.contact);
    load += w.load;
  }
  // Tyre springs carry the weight; the tread nodes' own share and damping carry a little more.
  const double weight = totalMass(car.world->body(car.body)) * kStandardGravity;
  CHECK(load > 0.95 * weight);
  CHECK(load < 1.02 * weight);
  car.seconds(2.0);
  CHECK(test::norm(car.center() - p0) < 1e-3);
  CHECK(std::fabs(car.tel().speed) < 1e-3f);
  CHECK(std::fabs(car.world->measureEnergy().balance()) < 5.0);
}

TEST_CASE("handbrake holds the proto car facing up a 30 % slope", "[vehicle][23.1]") {
  // Tilt gravity instead of the ground: the car faces +Z up a slope of atan(0.3).
  const double angle = std::atan(0.3);
  const Vec3 g{0.0f, static_cast<float>(-kStandardGravity * std::cos(angle)),
               static_cast<float>(-kStandardGravity * std::sin(angle))};
  Car car = makeCar(0.0f, 1, false, g);
  VehicleInput in;
  in.handbrake = 1.0f;
  in.mode = GearMode::kNeutral;
  car.input(in);
  car.seconds(2.0);
  const DVec3 p0 = car.center();
  car.seconds(5.0);
  INFO("creep " << test::norm(car.center() - p0) << " m");
  CHECK(test::norm(car.center() - p0) < 5e-3);
}

TEST_CASE("ABS stop from 100 km/h is short and straight", "[vehicle][23.2]") {
  Car car = makeCar(100.0f / 3.6f);
  VehicleInput in;
  in.mode = GearMode::kNeutral;
  car.input(in);
  car.seconds(0.5);
  const double odo0 = car.tel().odometer, speed0 = car.tel().speed;
  const DVec3 p0 = car.center();
  in.brake = 1.0f;
  car.input(in);
  int steps = 0;
  while (car.tel().speed > 0.05f && steps < 20000) {
    car.world->step();
    ++steps;
  }
  // Scale to exactly 100 km/h (distance ∝ v²).
  const double distance = (car.tel().odometer - odo0) * std::pow(100.0 / 3.6 / speed0, 2.0);
  INFO("stopping distance " << distance << " m");
  CHECK(distance > 35.0);
  CHECK(distance < 45.0);  // µ = 1.0 proto tyres; §23.2's 35–42 m is checked on the target car
  CHECK(std::fabs((car.center() - p0).x) < 0.3);
  CHECK(std::fabs(car.tel().forward.x) < 0.05f);  // heading stays within ≈ 3°
}

TEST_CASE("traction control launches the proto car with bounded wheelspin", "[vehicle][9]") {
  Car car = makeCar();
  car.seconds(0.5);
  VehicleInput in;
  in.throttle = 1.0f;
  car.input(in);
  float maxSlip = 0.0f;
  for (int s = 0; s < 6000; ++s) {  // 3 s
    car.world->step();
    if (s > 1000) {
      for (int w = 2; w < 4; ++w) maxSlip = std::max(maxSlip, car.tel().wheels[static_cast<size_t>(w)].slipRatio);
    }
  }
  INFO("speed " << car.tel().speed << " m/s, max rear slip " << maxSlip);
  CHECK(car.tel().speed > 10.0f);
  CHECK(maxSlip < 0.5f);
  CHECK(std::fabs(car.tel().forward.x) < 0.05f);
}

TEST_CASE("coasting car keeps the energy ledger balanced", "[vehicle][5.3]") {
  Car car = makeCar(20.0f, 1, true);
  VehicleInput in;
  in.mode = GearMode::kNeutral;
  car.input(in);
  car.seconds(0.5);
  const EnergyReport e0 = car.world->measureEnergy();
  car.seconds(3.0);
  const EnergyReport e1 = car.world->measureEnergy();
  INFO("balance drift " << e1.balance() - e0.balance() << " J of " << e0.kinetic << " J");
  CHECK(std::fabs(e1.balance() - e0.balance()) < 1e-3 * e0.kinetic);
  // Rolling + aero losses of a coasting car: deceleration between 0.1 and 0.35 m/s² at ≈ 19 m/s.
  CHECK(car.tel().speed < 19.6f);
  CHECK(car.tel().speed > 18.5f);
}

TEST_CASE("positive steering turns the car left", "[vehicle][9]") {
  Car car = makeCar(10.0f);
  VehicleInput in;
  in.throttle = 0.15f;
  in.steer = 0.4f;
  car.input(in);
  car.seconds(2.0);
  CHECK(car.tel().forward.x > 0.2f);  // model +X is left
  CHECK(car.tel().accelLat > 1.0f);
}

TEST_CASE("vehicle simulation is deterministic across thread counts", "[vehicle][determinism]") {
  auto run = [](int threads) {
    Car car = makeCar(8.0f, threads);
    // a second body so the parallel phase has more than one task
    LatticeParams lp;
    lp.center = {6.0, 0.6, 0.0};
    car.world->addBody(makeLattice(lp));
    VehicleInput in;
    in.throttle = 0.6f;
    in.steer = -0.3f;
    car.input(in);
    car.seconds(1.0);
    in.throttle = 0.0f;
    in.brake = 0.8f;
    car.input(in);
    car.seconds(0.5);
    return car.world->stateHash();
  };
  const uint64_t h1 = run(1);
  CHECK(run(1) == h1);
  CHECK(run(3) == h1);
}

// §9 electronic chassis control (core ChassisDesc): self-levelling air springs and ride-height levels, the 911's
// front-axle lift, adaptive damping, active roll and pitch control, rear-axle steering.
#include <catch2/catch_test_macros.hpp>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <functional>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "sbc/scenes.h"
#include "sbc/vehicle_json.h"
#include "sbc/world.h"

using namespace sbc;

namespace {

std::string vehicleText(const std::string& id) {
  std::ifstream f(std::string(SBC_VEHICLE_DIR) + "/" + id + "/vehicle.json");
  std::stringstream ss;
  ss << f.rdbuf();
  return ss.str();
}

struct Rig {
  std::unique_ptr<World> world;
  LoadedVehicle car;
  int body = -1, vehicle = -1;
  World& w() { return *world; }
  const VehicleTelemetry& t() { return world->vehicleTelemetry(vehicle); }
  void input(const VehicleInput& in) { world->setVehicleInput(vehicle, in); }
  void run(double seconds) { world->step(static_cast<int>(seconds / world->params().dt + 0.5)); }
};

// A car on a flat asphalt pad at `kmh`; `edit` changes its data before it is built (a system switched off).
Rig rig(const std::string& id, float kmh, const std::function<void(LoadedVehicle&)>& edit = {}) {
  Rig r;
  WorldParams wp;
  wp.threadCount = 1;
  r.world = std::make_unique<World>(wp);
  applyDefaultContactPairs(*r.world);
  r.world->addGroundPlane(0.0, material::kAsphalt);
  r.car = loadVehicleJson(vehicleText(id), {{0.0, 0.0, 0.0}, 0.0, kmh / 3.6f});
  if (edit) edit(r.car);
  r.body = r.world->addBody(r.car.build.body);
  r.vehicle = r.world->addVehicle(r.body, r.car.build.vehicle);
  return r;
}

// Steady turn at about `kmh` on a fixed steer: mean body roll and lateral acceleration over the last second.
struct Turn { double roll = 0.0, accel = 0.0, gradient = 0.0; };
Turn steadyTurn(const std::string& id, float kmh, float steer, const std::function<void(LoadedVehicle&)>& edit = {}) {
  Rig r = rig(id, kmh, edit);
  VehicleInput in;
  in.throttle = 0.25f;
  r.input(in);
  r.run(1.0);
  in.steer = steer;
  r.input(in);
  r.run(3.0);
  Turn out;
  const int n = 100;
  for (int k = 0; k < n; ++k) {
    r.run(0.01);
    out.roll += r.t().rollAngle;
    out.accel += r.t().accelLat;
  }
  out.roll /= n;
  out.accel /= n;
  out.gradient = out.roll / out.accel;
  return out;
}

// Braking from `kmh` at a fixed pedal: mean body pitch and longitudinal acceleration over 0.5–1.0 s.
Turn steadyBrake(const std::string& id, float kmh, float brake, const std::function<void(LoadedVehicle&)>& edit = {}) {
  Rig r = rig(id, kmh, edit);
  VehicleInput in;
  in.throttle = 0.2f;
  r.input(in);
  r.run(1.0);
  in.throttle = 0.0f;
  in.brake = brake;
  r.input(in);
  r.run(0.5);
  Turn out;
  const int n = 50;
  for (int k = 0; k < n; ++k) {
    r.run(0.01);
    out.roll += r.t().pitchAngle;
    out.accel += r.t().accelLong;
  }
  out.roll /= n;
  out.accel /= n;
  out.gradient = out.roll / out.accel;
  return out;
}

const auto passive = [](LoadedVehicle& c) {
  c.build.vehicle.chassis.activeRoll = 0.0f;
  c.build.vehicle.chassis.activePitch = 0.0f;
};

}  // namespace

TEST_CASE("chassis gradients", "[.chassisprobe]") {
  // The passive roll and pitch gradients the generators write (CHASSIS_GRADIENTS), the passive stance (wheel travel
  // over the model pose per axle at rest: the air springs' normal level), and the active systems' effect.
  for (const char* id : {"porsche_911_turbo_991", "rolls_royce_ghost", "maybach_gls"}) {
    {
      Rig r = rig(id, 0.0f, [](LoadedVehicle& c) { c.build.vehicle.chassis.levelling = false; });
      r.input(VehicleInput{});
      r.run(8.0);
      const Body& b = r.w().body(r.body);
      double axle[2] = {0.0, 0.0};
      int k = 0;
      for (const ChassisCornerDesc& cd : r.car.build.vehicle.chassis.corners) {
        const DVec3 d = b.nodeWorldPosition(cd.wheelNode) - b.nodeWorldPosition(cd.chassisNode);
        const Vec3 pa = r.car.build.body.nodes[static_cast<size_t>(cd.wheelNode)].position, pb = r.car.build.body.nodes[static_cast<size_t>(cd.chassisNode)].position;
        const double L0 = std::sqrt((pa.x - pb.x) * (pa.x - pb.x) + (pa.y - pb.y) * (pa.y - pb.y) + (pa.z - pb.z) * (pa.z - pb.z));
        axle[k++ < 2 ? 0 : 1] += 0.5 * (std::sqrt(dot(d, d)) - L0) / cd.motionRatio;
      }
      std::printf("%-22s passive stance: front %.4f m, rear %.4f m\n", id, axle[0], axle[1]);
    }
    const Turn roll = steadyTurn(id, 60.0f, 0.12f, passive);
    const Turn rollActive = steadyTurn(id, 60.0f, 0.12f);
    const Turn pitch = steadyBrake(id, 80.0f, 0.4f, passive);
    const Turn pitchActive = steadyBrake(id, 80.0f, 0.4f);
    std::printf("%-22s roll %.5f rad/(m/s²) (%.2f °/g at %.2f m/s²), active %.5f (%.2f °/g) | pitch %.5f (%.2f °/g at %.2f), active %.5f\n",
                id, roll.gradient, roll.gradient * 9.81 * 57.2958, roll.accel, rollActive.gradient,
                rollActive.gradient * 9.81 * 57.2958, pitch.gradient, pitch.gradient * 9.81 * 57.2958, pitch.accel,
                pitchActive.gradient);
  }
}

namespace {

// Ride over a cobbled plane at `kmh` (speed held) in a chassis setting: the body's vertical acceleration above 1 Hz
// (rms over 3 s) at the reference node, and the mean damper scale.
struct Cobbles { double heaveRms = 0.0, damper = 0.0; };
Cobbles cobbleRide(const std::string& id, float kmh, int8_t mode, const std::function<void(LoadedVehicle&)>& edit = {}) {
  Rig r;
  WorldParams wp;
  wp.threadCount = 1;
  r.world = std::make_unique<World>(wp);
  applyDefaultContactPairs(*r.world);
  r.world->setRoughness(true);
  r.world->addGroundPlane(0.0, material::kCobblestone);
  r.car = loadVehicleJson(vehicleText(id), {{0.0, 0.0, 0.0}, 0.0, kmh / 3.6f});
  if (edit) edit(r.car);
  r.body = r.world->addBody(r.car.build.body);
  r.vehicle = r.world->addVehicle(r.body, r.car.build.vehicle);
  const double target = kmh / 3.6;
  std::vector<double> vy;
  double damper = 0.0;
  const int ref = r.car.build.vehicle.refCenter;
  for (int k = 0; k < 2000; ++k) {  // 4 s at 500 Hz
    VehicleInput in;
    in.throttle = std::clamp(static_cast<float>(0.2 + 0.3 * (target - r.t().speed)), 0.0f, 1.0f);
    in.chassisMode = mode;
    r.input(in);
    r.world->step(4);
    if (k >= 500) {
      vy.push_back(r.world->body(r.body).nodeVelocity(ref).y);
      damper += r.t().damperScale;
    }
  }
  // Ride band (ISO 2631: what the occupants feel most, 1–20 Hz): acceleration over 25 ms differences (above ≈ 20 Hz
  // averaged out — the lattice's own modes), minus its 1 s moving mean.
  std::vector<double> a;
  for (size_t i = 12; i < vy.size(); ++i) a.push_back((vy[i] - vy[i - 12]) * 500.0 / 12.0);
  double sum = 0.0;
  int n = 0;
  for (size_t i = 250; i + 250 < a.size(); ++i) {
    double m = 0.0;
    for (size_t j = i - 250; j <= i + 250; ++j) m += a[j];
    const double d = a[i] - m / 501.0;
    sum += d * d;
    ++n;
  }
  return {std::sqrt(sum / n), damper / static_cast<double>(vy.size())};
}

// Lowest point of the nose (collision nodes ahead of the front axle) above the ground [m].
double noseClearance(Rig& r) {
  const Body& b = r.world->body(r.body);
  double xFront = -1e9;
  for (const WheelTelemetry& wt : r.t().wheels) xFront = std::max(xFront, static_cast<double>(wt.center.z));
  double low = 1e9;
  for (int i = 0; i < b.nodeCount(); ++i) {
    const std::string& id = r.car.nodeIds[static_cast<size_t>(i)];
    if (id.size() < 2 || id[0] != 'c' || id[1] < '0' || id[1] > '9') continue;  // lattice nodes
    const DVec3 p = b.nodeWorldPosition(i);
    if (p.z < xFront + 0.3) continue;
    low = std::min(low, p.y - b.radius[static_cast<size_t>(i)]);
  }
  return low;
}

}  // namespace

TEST_CASE("chassis probe", "[.chassisprobe]") {
  std::vector<std::string> ids = {"porsche_911_turbo_991", "rolls_royce_ghost", "maybach_gls"};
  if (std::getenv("PROBE_CARS")) {
    ids.clear();
    std::stringstream list(std::getenv("PROBE_CARS"));
    for (std::string id; std::getline(list, id, ',');) ids.push_back(id);
  }
  for (const std::string& idText : ids) {
    const char* id = idText.c_str();
    for (int8_t mode : {int8_t{0}, int8_t{1}, int8_t{2}}) {
      const Cobbles c = cobbleRide(id, 40.0f, mode);
      std::printf("%-22s mode %d: cobbles heave %.3f m/s², damper %.2f\n", id, mode, c.heaveRms, c.damper);
    }
  }
}

TEST_CASE("Maybach GLS air suspension: self-levelling under a load, the lift and the low level, energy booked",
          "[chassis][maybach][9]") {
  // AIRMATIC: 300 kg over the rear axle sinks the body on passive air springs; the self-levelling pumps it back to the
  // design height. The raised level lifts the body 40 mm at a standstill; the sport setting lowers it 15 mm. Each move
  // is work done by the compressor on the springs, booked as external work: the energy books stay closed.
  const auto load = [](LoadedVehicle& c) {
    // 300 kg on the rear seats and in the boot: over the lattice within 0.6 m of the rear axle.
    double zRear = 1e9;
    for (const WheelDesc& wd : c.build.vehicle.wheels) zRear = std::min(zRear, static_cast<double>(c.build.body.nodes[static_cast<size_t>(wd.axleLeft)].position.z));
    std::vector<size_t> rear;
    for (size_t i = 0; i < c.build.body.nodes.size(); ++i) {
      const std::string& id = c.nodeIds[i];
      if (id.size() > 1 && id[0] == 'c' && id[1] >= '0' && id[1] <= '9' && std::fabs(c.build.body.nodes[i].position.z - zRear) < 0.6) rear.push_back(i);
    }
    for (size_t i : rear) c.build.body.nodes[i].mass += static_cast<float>(300.0 / static_cast<double>(rear.size()));
  };
  const auto noLevelling = [&](LoadedVehicle& c) {
    load(c);
    c.build.vehicle.chassis.levelling = false;
  };
  Rig sag = rig("maybach_gls", 0.0f, noLevelling);
  sag.input(VehicleInput{});
  sag.run(12.0);
  Rig held = rig("maybach_gls", 0.0f, load);
  held.input(VehicleInput{});
  held.run(12.0);
  INFO("ride height with 300 kg over the rear axle: passive " << sag.t().rideHeight * 1e3 << " mm, levelled " << held.t().rideHeight * 1e3 << " mm");
  CHECK(sag.t().rideHeight < -0.008);
  CHECK(std::fabs(held.t().rideHeight) < 0.004);

  Rig r = rig("maybach_gls", 0.0f);
  r.input(VehicleInput{});
  r.run(4.0);
  const double h0 = r.t().rideHeight;
  const double balance0 = r.w().measureEnergy().balance();
  VehicleInput lift;
  lift.lift = true;
  r.input(lift);
  r.run(1.0);
  CHECK(r.t().levelMoving);
  r.run(6.0);
  const double hLift = r.t().rideHeight;
  const double balanceLift = r.w().measureEnergy().balance();
  VehicleInput sport;
  sport.chassisMode = 2;
  r.input(sport);
  r.run(8.0);
  const double hLow = r.t().rideHeight;
  INFO("ride height: normal " << h0 * 1e3 << " mm, lift " << hLift * 1e3 << " mm, sport (low) " << hLow * 1e3
                              << " mm; energy balance " << balance0 << " → " << balanceLift << " J");
  CHECK(std::fabs(h0) < 0.004);
  CHECK(r.t().rideLevel == -1);
  CHECK(std::fabs(hLift - 0.040) < 0.006);
  CHECK(std::fabs(hLow + 0.015) < 0.005);
  // Lifting 2.8 t by 4 cm takes ≈ 1.1 kJ: unbooked, the balance would move by that much.
  CHECK(std::fabs(balanceLift - balance0) < 150.0);

  // The lift is for crawling: requested at 60 km/h it does not come up.
  Rig fast = rig("maybach_gls", 60.0f);
  VehicleInput cruise;
  cruise.throttle = 0.3f;
  cruise.lift = true;
  fast.input(cruise);
  fast.run(4.0);
  CHECK(fast.t().rideLevel == 0);
  CHECK(fast.t().rideHeight < 0.01);
}

TEST_CASE("air springs follow the gas law: a load sinks the Ghost less than a linear spring, the ride height unchanged",
          "[chassis][ghost][9]") {
  // Rolls-Royce Ghost: self-levelling air springs (p·Vⁿ constant, n 1.3). With the levelling off, 300 kg over the
  // rear axle compresses them into their stiffer range: the rear sinks less than on linear springs of the same rate
  // at the level. Unloaded, the level is the same either way (the gas law is anchored at the normal level).
  const auto load = [](LoadedVehicle& c) {
    double zRear = 1e9;
    for (const WheelDesc& wd : c.build.vehicle.wheels) zRear = std::min(zRear, static_cast<double>(c.build.body.nodes[static_cast<size_t>(wd.axleLeft)].position.z));
    std::vector<size_t> rear;
    for (size_t i = 0; i < c.build.body.nodes.size(); ++i) {
      const std::string& id = c.nodeIds[i];
      if (id.size() > 1 && id[0] == 'c' && id[1] >= '0' && id[1] <= '9' && std::fabs(c.build.body.nodes[i].position.z - zRear) < 0.6) rear.push_back(i);
    }
    for (size_t i : rear) c.build.body.nodes[i].mass += static_cast<float>(300.0 / static_cast<double>(rear.size()));
  };
  const auto linear = [](LoadedVehicle& c) { c.build.vehicle.chassis.airPolytropic = 0.0f; };
  const auto settle = [](const std::function<void(LoadedVehicle&)>& edit) {
    Rig r = rig("rolls_royce_ghost", 0.0f, edit);
    r.input(VehicleInput{});
    r.run(8.0);
    return static_cast<double>(r.t().rideHeight);
  };
  REQUIRE(rig("rolls_royce_ghost", 0.0f).car.build.vehicle.chassis.airPolytropic > 1.0f);
  const double levelAir = settle({}), levelLinear = settle(linear);
  const double sagAir = settle([&](LoadedVehicle& c) { load(c); c.build.vehicle.chassis.levelling = false; });
  const double sagLinear = settle([&](LoadedVehicle& c) { load(c); linear(c); c.build.vehicle.chassis.levelling = false; });
  INFO("level: air " << levelAir * 1e3 << " mm, linear " << levelLinear * 1e3 << " mm; 300 kg, levelling off: air "
                     << sagAir * 1e3 << " mm, linear " << sagLinear * 1e3 << " mm");
  CHECK(std::fabs(levelAir - levelLinear) < 0.002);
  CHECK(sagLinear < -0.01);
  CHECK(sagAir > sagLinear);              // sinks less
  CHECK(sagAir < 0.5 * sagLinear);       // but by more than half as much (soft at the level)
}

TEST_CASE("Porsche 911 Turbo front-axle lift: the nose rises 40 mm for a kerb or a ramp and drops back above 35 km/h",
          "[chassis][porsche][9]") {
  Rig r = rig("porsche_911_turbo_991", 0.0f);
  r.input(VehicleInput{});
  r.run(3.0);
  const double nose0 = noseClearance(r), pitch0 = r.t().pitchAngle;
  VehicleInput lift;
  lift.lift = true;
  r.input(lift);
  r.run(7.0);
  const double nose1 = noseClearance(r), pitch1 = r.t().pitchAngle;
  INFO("nose clearance " << nose0 * 1e3 << " → " << nose1 * 1e3 << " mm, pitch " << pitch0 << " → " << pitch1 << " rad");
  CHECK(r.t().rideLevel == 1);
  CHECK(nose1 - nose0 > 0.035);
  CHECK(pitch1 - pitch0 > 0.012);  // 40 mm over the 2.45 m wheelbase: 0.016 rad
  // Driving off with the lift up: past 35 km/h it lowers, and it stays down until the button is pressed again.
  lift.throttle = 0.6f;
  r.input(lift);
  for (int k = 0; k < 60 && r.t().speed < 45.0f / 3.6f; ++k) r.run(0.1);
  lift.throttle = 0.15f;
  r.input(lift);
  r.run(6.0);
  INFO("speed " << r.t().speed * 3.6 << " km/h, pitch " << r.t().pitchAngle);
  CHECK(r.t().rideLevel == 0);
  CHECK(std::fabs(r.t().pitchAngle - pitch0) < 0.006);
}

TEST_CASE("active roll control: the 911 (PDCC) and the Maybach (E-ACTIVE BODY CONTROL) corner nearly flat",
          "[chassis][9]") {
  // Steady 60 km/h turn: the active systems take out most of the body roll the passive car shows; the Ghost (no
  // active roll control) rolls as it would anyway. The Maybach's struts also hold the nose up under braking.
  for (const char* id : {"porsche_911_turbo_991", "maybach_gls", "rolls_royce_ghost"}) {
    const Turn off = steadyTurn(id, 60.0f, 0.12f, passive);
    const Turn on = steadyTurn(id, 60.0f, 0.12f);
    INFO(id << ": roll gradient passive " << off.gradient << ", with the system " << on.gradient << " rad per m/s² (at "
            << on.accel << " m/s²)");
    if (std::string(id) == "rolls_royce_ghost") {
      CHECK(std::fabs(on.gradient - off.gradient) < 0.1 * off.gradient);
    } else {
      CHECK(off.gradient > 0.0015);
      CHECK(on.gradient < 0.35 * off.gradient);
      CHECK(std::fabs(on.accel) > 4.0);
    }
  }
  const Turn pitchOff = steadyBrake("maybach_gls", 80.0f, 0.4f, passive);
  const Turn pitchOn = steadyBrake("maybach_gls", 80.0f, 0.4f);
  INFO("Maybach pitch gradient under braking: passive " << pitchOff.gradient << ", active " << pitchOn.gradient);
  CHECK(pitchOn.gradient < 0.65 * pitchOff.gradient);
}

TEST_CASE("adaptive dampers: comfort runs softer, firming against body motion and wheel hop; sport holds the data's damping",
          "[chassis][9]") {
  // The dampers can only go softer than the data's coefficient (the explicit integration's ceiling, KNOWN_ISSUES P31),
  // so the comfort setting's gain is small: on cobbles it must not ride harsher than sport by more than 10 %.
  for (const char* id : {"porsche_911_turbo_991", "rolls_royce_ghost", "maybach_gls"}) {
    const Cobbles comfort = cobbleRide(id, 40.0f, 0);
    const Cobbles normal = cobbleRide(id, 40.0f, 1);
    const Cobbles sport = cobbleRide(id, 40.0f, 2);
    INFO(id << ": heave comfort " << comfort.heaveRms << " m/s² (dampers " << comfort.damper << "), normal " << normal.heaveRms
            << " (" << normal.damper << "), sport " << sport.heaveRms << " m/s² (" << sport.damper << ")");
    CHECK(comfort.damper < normal.damper);
    CHECK(normal.damper < 0.99);
    CHECK(sport.damper > 0.99);
    CHECK(comfort.heaveRms < 1.1 * sport.heaveRms);
  }
}

TEST_CASE("rear-axle steering: counter-phase tightens the 911's and the Ghost's turning circle, in phase at speed",
          "[chassis][9]") {
  for (const char* id : {"porsche_911_turbo_991", "rolls_royce_ghost"}) {
    const auto fixedRear = [](LoadedVehicle& c) { c.build.vehicle.chassis.rearSteerLow = c.build.vehicle.chassis.rearSteerHigh = 0.0f; };
    auto circle = [&](const std::function<void(LoadedVehicle&)>& edit) {
      Rig r = rig(id, 12.0f, edit);
      VehicleInput in;
      in.throttle = 0.08f;
      in.steer = 1.0f;
      r.input(in);
      r.run(4.0);
      double curvature = 0.0;
      for (int k = 0; k < 50; ++k) {
        r.run(0.02);
        curvature += r.t().yawRate / std::max(0.5f, r.t().speed);
      }
      return std::make_pair(curvature / 50.0, static_cast<double>(r.t().rearSteer));
    };
    const auto with = circle({});
    const auto without = circle(fixedRear);
    INFO(id << ": turning radius " << 1.0 / with.first << " m with rear steer (" << with.second * 57.2958 << "°), "
            << 1.0 / without.first << " m without");
    CHECK(with.second < -0.03);              // counter-phase, ≈ 2.8–3° at full lock
    CHECK(with.first > 1.04 * without.first); // a tighter circle
    Rig r = rig(id, 110.0f);
    VehicleInput in;
    in.throttle = 0.35f;
    in.steer = 0.05f;
    r.input(in);
    r.run(1.5);
    INFO("at " << r.t().speed * 3.6 << " km/h, steer 0.05: rear " << r.t().rearSteer * 57.2958 << "°");
    CHECK(r.t().rearSteer > 0.0f);  // in phase with the front (steer positive: left)
  }
}

TEST_CASE("active body control holds the body still at a steady cruise (no limit cycle)", "[chassis][active]") {
  // A fast feedback alone (12/s on the body's travel) crossed the body's pitch mode: the Maybach see-sawed ±1.2° at a
  // steady 40 km/h on new asphalt, its front wheels' load swinging ±20 % (user report: the wheels bounce). With the
  // feed-forward and a slow trim the body rides still.
  for (const char* id : {"maybach_gls", "porsche_911_turbo_991"}) {
    Rig r = rig(id, 40.0f);
    std::vector<double> pitch, load;
    for (int k = 0; k < 400; ++k) {  // 4 s, the first 1.5 s left out
      const VehicleTelemetry& t = r.t();
      VehicleInput in;
      in.throttle = std::clamp(static_cast<float>(0.2 + 0.3 * (40.0 / 3.6 - t.speed)), 0.0f, 1.0f);
      r.input(in);
      r.run(0.01);
      if (k < 150) continue;
      pitch.push_back(r.t().pitchAngle);
      load.push_back(r.t().wheels[0].load);
    }
    const auto spread = [](const std::vector<double>& x) {
      const auto [lo, hi] = std::minmax_element(x.begin(), x.end());
      return *hi - *lo;
    };
    double mean = 0.0;
    for (double l : load) mean += l;
    mean /= static_cast<double>(load.size());
    INFO(id << ": pitch range " << spread(pitch) << " rad, front-left load range " << spread(load) << " N of " << mean);
    CHECK(spread(pitch) < 0.012);        // was 0.042 (±1.2°)
    CHECK(spread(load) < 0.2 * mean);    // was ≈ 0.4 of the mean
  }
}

TEST_CASE("the car's reported pose stays continuous across the body's re-basing (no jump for a step)", "[chassis][rebase]") {
  // The telemetry's points are body-local and measured before the step re-bases the body (by whole metres, every
  // ≈ 4 m of travel): read with the moved origin they were a re-basing off for that step, and a frame published on
  // it drew the car and its wheels 4 m away (user report: the wheels jump while driving).
  Rig r = rig("porsche_911_turbo_991", 100.0f);
  VehicleInput in;
  in.throttle = 0.35f;
  r.input(in);
  r.w().step(1);  // the telemetry is written by the first step
  const auto world = [&](Vec3 local) { return r.w().body(r.body).origin + toDouble(local); };
  DVec3 car = world(r.t().position), wheel = world(r.t().wheels[0].center), origin = r.w().body(r.body).origin;
  int rebases = 0;
  double worstCar = 0.0, worstWheel = 0.0;
  const double dt = r.w().params().dt;
  for (int k = 0; k < 4000; ++k) {  // 2 s at ≈ 100 km/h: 50 m, a dozen re-basings
    r.w().step(1);
    const DVec3 o = r.w().body(r.body).origin;
    if (o.x != origin.x || o.y != origin.y || o.z != origin.z) ++rebases;
    origin = o;
    const DVec3 c = world(r.t().position), w0 = world(r.t().wheels[0].center);
    const auto dist = [](DVec3 a, DVec3 b) { return std::sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) + (a.z - b.z) * (a.z - b.z)); };
    worstCar = std::max(worstCar, dist(c, car) / dt);
    worstWheel = std::max(worstWheel, dist(w0, wheel) / dt);
    car = c;
    wheel = w0;
  }
  INFO("re-basings " << rebases << ", fastest step of the car " << worstCar << " m/s, of a wheel centre " << worstWheel << " m/s");
  CHECK(rebases >= 5);
  CHECK(worstCar < 60.0);    // the car moves at ≈ 28 m/s; a re-basing step read ≈ 8,000 m/s
  CHECK(worstWheel < 60.0);
}

TEST_CASE("the tread ring stays round about the reported hub at speed (drawn tyres keep their size)", "[chassis][tyre]") {
  // The tyres are drawn from their tread and rim nodes about the telemetry's wheel centre. User report: the wheels
  // grow and shrink with speed. The ring itself does not grow (the radial sidewall is stiff in tension), but the hub
  // was measured before the step integrated: the nodes stood v·dt ahead of it, and the tyre came out of round by
  // that much (±2.8 cm at 200 km/h, ±9 % of its radius). Now the pose is the end of the step's.
  for (const char* id : {"porsche_911_turbo_991", "rolls_royce_ghost", "maybach_gls"}) {
    double stillMean = 0.0, stillSpread = 0.0;
    for (const float kmh : {0.0f, 100.0f, 200.0f}) {
      Rig r = rig(id, kmh);
      r.run(1.0);  // settled (at speed: coasting)
      const Body& b = r.w().body(r.body);
      const VehicleDesc& d = r.w().vehicleDesc(r.vehicle);
      double sum = 0.0, spread = 0.0;
      size_t count = 0;
      for (size_t i = 0; i < d.wheels.size(); ++i) {
        const Vec3 c = r.t().wheels[i].center, ax = r.t().wheels[i].axis;
        double lo = 1e9, hi = 0.0;
        for (const int32_t n : d.wheels[i].treadNodes) {
          const Vec3 p = b.nodePosition(n) - c;
          const double radius = length(p - ax * dot(p, ax));
          sum += radius;
          lo = std::min(lo, radius);
          hi = std::max(hi, radius);
          ++count;
        }
        spread = std::max(spread, hi - lo);
      }
      const double mean = sum / static_cast<double>(count);
      if (kmh == 0.0f) {
        stillMean = mean;
        stillSpread = spread;
      }
      INFO(id << " at " << kmh << " km/h: mean tread ring radius " << mean << " m (standing " << stillMean << "), spread "
              << spread << " m (standing " << stillSpread << ")");
      CHECK(std::fabs(mean / stillMean - 1.0) < 0.01);
      CHECK(spread < stillSpread + 0.006);  // was 5.5 cm at 200 km/h
    }
  }
}

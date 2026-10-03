// Wheel hop probe (user report "주행할때 막 바퀴가 튀어"): each car straight at a held speed on rough asphalt and
// cobbles; per wheel the time out of contact, the load's swing and the hub's bounce against the body.
//   ./sbc_tests "[wheelhop]"      (WHEELHOP_CARS=a,b  WHEELHOP_KMH=40,80)
#include <catch2/catch_test_macros.hpp>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "sbc/scenes.h"
#include "sbc/surfaces.h"
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

std::vector<std::string> split(const char* s, const std::string& fallback) {
  std::string text = s ? s : fallback;
  std::vector<std::string> out;
  std::stringstream ss(text);
  for (std::string item; std::getline(ss, item, ',');) out.push_back(item);
  return out;
}

struct WheelStats {
  double air = 0.0;        // fraction of samples out of contact
  double loadMean = 0.0, loadStd = 0.0, loadMin = 1e30;
  double travelStd = 0.0;  // hub position along the body's up axis (high-passed) [m]
  double hubVelRms = 0.0;  // its speed [m/s]
};

struct Run {
  double heaveRms = 0.0;
  double kmh = 0.0;
  WheelStats w[4];
};

Run drive(const std::string& id, uint16_t surface, float kmh, int mode) {
  WorldParams wp;
  wp.threadCount = 1;
  World w(wp);
  applyDefaultContactPairs(w);
  w.setRoughness(true);
  w.addGroundPlane(0.0, surface);
  const LoadedVehicle car = loadVehicleJson(vehicleText(id), {{0.0, 0.0, 0.0}, 0.0, kmh / 3.6f});
  const int body = w.addBody(car.build.body);
  VehicleDesc desc = car.build.vehicle;
  // WHEELHOP_OFF=levelling,damping,roll,pitch,all: switch parts of the electronic chassis off.
  for (const std::string& off : split(std::getenv("WHEELHOP_OFF"), "")) {
    if (off == "levelling" || off == "all") desc.chassis.levelling = false;
    if (off == "damping" || off == "all") desc.chassis.adaptiveDamping = false;
    if (off == "roll" || off == "all") desc.chassis.activeRoll = 0.0f;
    if (off == "pitch" || off == "all") desc.chassis.activePitch = 0.0f;
    if (off == "all") desc.chassis.corners.clear();
  }
  const int v = w.addVehicle(body, desc);
  const double target = kmh / 3.6;
  const int ref = car.build.vehicle.refCenter;
  std::vector<double> vy;
  std::vector<double> travel[4], load[4];
  std::vector<int> contact[4];
  for (int k = 0; k < 2500; ++k) {  // 5 s at 500 Hz, the first second skipped
    const VehicleTelemetry& t = w.vehicleTelemetry(v);
    VehicleInput in;
    in.throttle = std::clamp(static_cast<float>(0.2 + 0.3 * (target - t.speed)), 0.0f, 1.0f);
    in.chassisMode = static_cast<int8_t>(mode);
    w.setVehicleInput(v, in);
    w.step(4);
    if (k < 500) continue;
    if (std::getenv("WHEELHOP_TRACE") && k >= 1000 && k < 2000 && k % 10 == 0) {
      const VehicleTelemetry& u = w.vehicleTelemetry(v);
      std::printf("t %.3f accLong %+.3f pitch %+.5f offset %.5f damp %.2f load0 %.0f load2 %.0f thr %.2f\n", k / 500.0, u.accelLong, u.pitchAngle, u.activeOffset, u.damperScale, u.wheels[0].load, u.wheels[2].load, u.throttle);
    }
    vy.push_back(w.body(body).nodeVelocity(ref).y);
    const VehicleTelemetry& u = w.vehicleTelemetry(v);
    for (int i = 0; i < 4 && i < static_cast<int>(u.wheels.size()); ++i) {
      const WheelTelemetry& wt = u.wheels[static_cast<size_t>(i)];
      const Vec3 d = wt.center - u.position;
      travel[i].push_back(d.x * u.up.x + d.y * u.up.y + d.z * u.up.z);
      load[i].push_back(wt.load);
      contact[i].push_back(wt.contact ? 1 : 0);
    }
  }
  Run r;
  const auto highpass = [](const std::vector<double>& x, int half) {
    std::vector<double> out;
    for (size_t i = static_cast<size_t>(half); i + static_cast<size_t>(half) < x.size(); ++i) {
      double m = 0.0;
      for (size_t j = i - static_cast<size_t>(half); j <= i + static_cast<size_t>(half); ++j) m += x[j];
      out.push_back(x[i] - m / (2 * half + 1));
    }
    return out;
  };
  std::vector<double> a;
  for (size_t i = 1; i < vy.size(); ++i) a.push_back((vy[i] - vy[i - 1]) * 500.0);
  double s = 0.0;
  const std::vector<double> ah = highpass(a, 250);
  for (double x : ah) s += x * x;
  r.heaveRms = std::sqrt(s / static_cast<double>(ah.size()));
  for (int i = 0; i < 4; ++i) {
    WheelStats& ws = r.w[i];
    const size_t n = load[i].size();
    if (n == 0) continue;
    double air = 0, lm = 0;
    for (size_t k = 0; k < n; ++k) {
      air += 1 - contact[i][k];
      lm += load[i][k];
      ws.loadMin = std::min(ws.loadMin, load[i][k]);
    }
    ws.air = air / static_cast<double>(n);
    ws.loadMean = lm / static_cast<double>(n);
    double lv = 0;
    for (double l : load[i]) lv += (l - ws.loadMean) * (l - ws.loadMean);
    ws.loadStd = std::sqrt(lv / static_cast<double>(n));
    const std::vector<double> th = highpass(travel[i], 50);  // above ≈ 5 Hz
    double tv = 0;
    for (double x : th) tv += x * x;
    ws.travelStd = std::sqrt(tv / static_cast<double>(th.size()));
    double hv = 0;
    for (size_t k = 1; k < travel[i].size(); ++k) hv += std::pow((travel[i][k] - travel[i][k - 1]) * 500.0, 2);
    ws.hubVelRms = std::sqrt(hv / static_cast<double>(travel[i].size() - 1));
  }
  r.kmh = w.vehicleTelemetry(v).speed * 3.6;
  return r;
}

}  // namespace

TEST_CASE("wheel hop probe", "[.probe][wheelhop]") {
  const int mode = std::getenv("WHEELHOP_MODE") ? std::atoi(std::getenv("WHEELHOP_MODE")) : 1;
  for (const std::string& id : split(std::getenv("WHEELHOP_CARS"), "porsche_911_turbo_991,rolls_royce_ghost,maybach_gls")) {
    for (const std::string& sk : split(std::getenv("WHEELHOP_KMH"), "40,80,120")) {
      const float kmh = std::stof(sk);
      for (uint16_t surface : {material::kAsphalt, material::kAsphaltOld, material::kCobblestone}) {
        const Run r = drive(id, surface, kmh, mode);
        std::printf("%-22s %-3s %5.0f km/h (%5.1f) heave %.2f m/s² |", id.c_str(), surface == material::kAsphalt ? "A" : surface == material::kAsphaltOld ? "B" : "cob", kmh, r.kmh, r.heaveRms);
        for (const WheelStats& ws : r.w)
          std::printf(" air %4.1f%% load %5.0f±%4.0f min %5.0f hop %4.1f mm v %.2f |", 100 * ws.air, ws.loadMean, ws.loadStd, ws.loadMin, 1000 * ws.travelStd, ws.hubVelRms);
        std::printf("\n");
        std::fflush(stdout);
      }
    }
  }
}

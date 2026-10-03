// Ride and handling figures (§7 서스펜션, §9 조향, §12.6 핸들링 시험) of the three cars against published / typical
// values: body bounce frequency and damping, roll gradient, understeer gradient, the cornering limit.
#include <catch2/catch_test_macros.hpp>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "sbc/scenes.h"
#include "sbc/vehicle_json.h"
#include "sbc/world.h"

using namespace sbc;

namespace {

std::string carText(const std::string& id) {
  std::ifstream f(std::string(SBC_VEHICLE_DIR) + "/" + id + "/vehicle.json");
  std::stringstream ss;
  ss << f.rdbuf();
  return ss.str();
}

constexpr double kPi = 3.14159265358979323846;

struct Handling {
  double bounceHz = 0.0, bounceZeta = 0.0;  // heave mode after a lift
  double rollPerG = 0.0;                    // [°/g] body roll per lateral g (0.2–0.5 g)
  double understeer = 0.0;                  // [°/g] K: steer angle beyond Ackermann per lateral g
  double maxLatG = 0.0;                     // the limit on a slow steer ramp at 80 km/h
  double steer04 = 0.0;                     // rack command reaching 0.4 g on the ramp
  double yawRise = 0.0, ayRise = 0.0;       // [s] step steer (ISO 7401): 50 % steer → 90 % of the steady value
  double yawOvershoot = 0.0;                // [%]
};

double rollDeg(const VehicleTelemetry& t) {  // left side up = positive
  return std::asin(std::clamp(static_cast<double>(t.left.y), -1.0, 1.0)) * 180.0 / kPi;
}

Handling measure(const std::string& id) {
  Handling h;
  const LoadedVehicle car = loadVehicleJson(carText(id), {{0.0, 0.0, 0.0}, 0.0, 0.0f});
  const float lock = car.build.vehicle.steeringLock;
  const float wheelbase = static_cast<float>(std::fabs(car.build.body.nodes[static_cast<size_t>(car.build.vehicle.wheels[0].axleLeft)].position.z -
                                                         car.build.body.nodes[static_cast<size_t>(car.build.vehicle.wheels[2].axleLeft)].position.z));
  {
    // Bounce: settle, lift the body 4 cm/s up… measure the ride height's oscillation (zero crossings, decay).
    WorldParams wp;
    wp.threadCount = 1;
    World w(wp);
    applyDefaultContactPairs(w);
    w.addGroundPlane(0.0, material::kAsphalt);
    const int body = w.addBody(car.build.body);
    const int v = w.addVehicle(body, car.build.vehicle);
    VehicleInput hold;
    hold.brake = 1.0f;
    w.setVehicleInput(v, hold);
    w.step(static_cast<int>(2.0 / w.params().dt));
    auto y = [&] { return (w.body(body).origin + toDouble(w.vehicleTelemetry(v).position)).y; };
    const double y0 = y();
    w.addBodyVelocity(body, {0.0f, 0.35f, 0.0f});
    std::vector<double> ys;
    for (int k = 0; k < 600; ++k) {  // 3 s at 200 Hz
      w.step(10);
      ys.push_back(y() - y0);
    }
    std::vector<double> crossings, peaks;
    for (size_t k = 1; k < ys.size(); ++k) {
      if ((ys[k - 1] < 0.0) != (ys[k] < 0.0)) crossings.push_back(static_cast<double>(k) * 0.005);
    }
    for (size_t k = 1; k + 1 < ys.size(); ++k) {
      if (std::fabs(ys[k]) > std::fabs(ys[k - 1]) && std::fabs(ys[k]) >= std::fabs(ys[k + 1]) && std::fabs(ys[k]) > 2e-4) peaks.push_back(std::fabs(ys[k]));
    }
    if (crossings.size() >= 3) h.bounceHz = 1.0 / (crossings[2] - crossings[0]);
    if (peaks.size() >= 2) {
      const double delta = std::log(peaks[0] / peaks[1]) * 2.0;  // successive half-cycle peaks → per full cycle
      h.bounceZeta = delta / std::sqrt(4.0 * kPi * kPi + delta * delta);
    }
  }
  {
    // Steer ramp at 80 km/h: 0 → 0.9 of the rack over 14 s, speed held by throttle.
    WorldParams wp;
    wp.threadCount = 1;
    World w(wp);
    applyDefaultContactPairs(w);
    w.addGroundPlane(0.0, material::kAsphalt);
    const LoadedVehicle c2 = loadVehicleJson(carText(id), {{0.0, 0.0, 0.0}, 0.0, 80.0f / 3.6f});
    const int body = w.addBody(c2.build.body);
    const int v = w.addVehicle(body, c2.build.vehicle);
    VehicleInput in;
    const double vT = 80.0 / 3.6;
    std::vector<std::array<double, 3>> samples;  // ay [g], roll [°], steer excess [°]
    for (int k = 0; k < 1600; ++k) {  // 16 s at 100 Hz
      const VehicleTelemetry& t = w.vehicleTelemetry(v);
      const double sp = w.body(body).nodeCount() ? t.speed : 0.0;
      in.throttle = std::clamp(static_cast<float>(0.25 + 0.15 * (vT - sp)), 0.0f, 1.0f);
      in.steer = std::min(0.9f, static_cast<float>(std::max(0, k - 150)) / 1400.0f * 0.9f);
      w.setVehicleInput(v, in);
      w.step(20);
      if (k < 200) continue;
      const double ay = t.accelLat / 9.81;
      const double steerDeg = t.steer * lock * 180.0 / kPi;
      const double ackermann = std::atan(wheelbase * t.yawRate / std::max(static_cast<double>(t.speed), 1.0)) * 180.0 / kPi;
      samples.push_back({ay, rollDeg(t), steerDeg - ackermann});
      if (h.steer04 == 0.0 && std::fabs(ay) >= 0.4) h.steer04 = t.steer;
      h.maxLatG = std::max(h.maxLatG, std::fabs(ay));
    }
    // Linear fits over 0.2–0.5 g.
    double sxx = 0, sxr = 0, sxs = 0;
    int n = 0;
    for (const auto& s : samples) {
      if (std::fabs(s[0]) < 0.2 || std::fabs(s[0]) > 0.5) continue;
      sxx += s[0] * s[0];
      sxr += s[0] * s[1];
      sxs += s[0] * s[2];
      ++n;
    }
    if (n > 5) {
      h.rollPerG = std::fabs(sxr / sxx);
      h.understeer = sxs / sxx;
    }
  }
  if (h.steer04 > 0.0) {
    // Step steer at 80 km/h to the 0.4 g rack command over 0.1 s, speed held.
    WorldParams wp;
    wp.threadCount = 1;
    World w(wp);
    applyDefaultContactPairs(w);
    w.addGroundPlane(0.0, material::kAsphalt);
    const LoadedVehicle c2 = loadVehicleJson(carText(id), {{0.0, 0.0, 0.0}, 0.0, 80.0f / 3.6f});
    const int body = w.addBody(c2.build.body);
    const int v = w.addVehicle(body, c2.build.vehicle);
    VehicleInput in;
    const double vT = 80.0 / 3.6;
    std::vector<double> yaw, ay;
    const int start = 150;  // [ms/2]: 1.5 s at 100 Hz… sampled at 1 kHz below
    for (int k = 0; k < 4500; ++k) {  // 4.5 s at 1 kHz
      const VehicleTelemetry& t = w.vehicleTelemetry(v);
      in.throttle = std::clamp(static_cast<float>(0.25 + 0.15 * (vT - t.speed)), 0.0f, 1.0f);
      in.steer = static_cast<float>(h.steer04 * std::clamp((k - 10 * start) / 100.0, 0.0, 1.0));
      w.setVehicleInput(v, in);
      w.step(2);
      yaw.push_back(t.yawRate);
      ay.push_back(t.accelLat);
      if (std::getenv("STEP_DUMP") && k >= 10 * start - 20 && k < 10 * start + 600 && k % 20 == 0)
        std::printf("  t %+.3f steer %.4f toeFL %.4f toeFR %.4f αFL %.4f αRL %.4f r %.4f ay %.3f\n", (k - 10 * start - 50) * 0.001,
                    t.steer, t.wheels[0].toe - t.wheels[0].toe0, t.wheels[1].toe - t.wheels[1].toe0, t.wheels[0].slipAngle,
                    t.wheels[2].slipAngle, t.yawRate, t.accelLat);
    }
    auto mean = [](const std::vector<double>& x, size_t a, size_t b) {
      double m = 0;
      for (size_t i = a; i < b; ++i) m += x[i];
      return m / static_cast<double>(b - a);
    };
    const size_t half = static_cast<size_t>(10 * start + 50);  // 50 % of the steer ramp
    const double yawSteady = mean(yaw, 3500, 4500), aySteady = mean(ay, 3500, 4500);
    double peak = 0;
    for (size_t i = half; i < yaw.size(); ++i) {
      if (h.yawRise == 0.0 && std::fabs(yaw[i]) >= 0.9 * std::fabs(yawSteady)) h.yawRise = static_cast<double>(i - half) * 0.001;
      if (h.ayRise == 0.0 && std::fabs(ay[i]) >= 0.9 * std::fabs(aySteady)) h.ayRise = static_cast<double>(i - half) * 0.001;
      peak = std::max(peak, std::fabs(yaw[i]));
    }
    h.yawOvershoot = 100.0 * (peak / std::fabs(yawSteady) - 1.0);
  }
  return h;
}

}  // namespace

TEST_CASE("handling probe", "[.handlingprobe]") {
  for (const char* id : {"porsche_911_turbo_991", "rolls_royce_ghost", "maybach_gls"}) {
    if (std::getenv("HANDLING_CAR") && std::string(std::getenv("HANDLING_CAR")) != id) continue;
    const Handling h = measure(id);
    std::printf("%-22s bounce %.2f Hz ζ %.2f | roll %.2f °/g | understeer %.2f °/g | limit %.2f g | step steer %.3f: yaw "
                "rise %.3f s, overshoot %.0f %%, ay rise %.3f s\n", id, h.bounceHz, h.bounceZeta, h.rollPerG, h.understeer,
                h.maxLatG, h.steer04, h.yawRise, h.yawOvershoot, h.ayRise);
  }
}

TEST_CASE("wreck spin probe", "[.handlingprobe]") {
  SceneOptions so;
  so.threads = 1;
  so.trackEnergy = true;
  auto w = makeScene("drive", so);
  const LoadedVehicle car = loadVehicleJson(carText("porsche_911_turbo_991"), {{0.0, 0.0, 250.0}, 0.0, 100.0f / 3.6f});
  const int body = w->addBody(car.build.body);
  const int v = w->addVehicle(body, car.build.vehicle);
  w->setVehicleInput(v, VehicleInput{});
  w->step(12000);
  for (int k = 0; k < 20; ++k) {
    w->step(1000);
    const VehicleTelemetry& t = w->vehicleTelemetry(v);
    std::printf("t %.1f s: spin", 6.0 + 0.5 * (k + 1));
    for (const WheelTelemetry& wt : t.wheels) std::printf(" %+.3f(%s%.0fN f%u)", wt.spin, wt.contact ? "c" : "-", wt.load, wt.tyreFlags);
    std::printf("\n");
  }
}

TEST_CASE("vibration probe", "[.handlingprobe]") {
  // Smooth flat asphalt, speed held: RMS of the chassis frame's vertical acceleration and roll/pitch rates above 2 Hz,
  // and the visible jitter (60 Hz samples of the reference point minus its 0.25 s running mean).
  for (const char* id : {"porsche_911_turbo_991", "rolls_royce_ghost", "maybach_gls"}) {
    for (float kmh : {30.0f, 60.0f, 100.0f, 150.0f}) {
      WorldParams wp;
      wp.threadCount = 1;
      World w(wp);
      applyDefaultContactPairs(w);
      w.addGroundPlane(0.0, material::kAsphalt);
      const LoadedVehicle car = loadVehicleJson(carText(id), {{0.0, 0.0, 0.0}, 0.0, kmh / 3.6f});
      const int body = w.addBody(car.build.body);
      const int v = w.addVehicle(body, car.build.vehicle);
      VehicleInput in;
      const double vT = kmh / 3.6;
      std::vector<double> y, upx, upz;
      for (int k = 0; k < 4000; ++k) {  // 4 s at 1 kHz
        const VehicleTelemetry& t = w.vehicleTelemetry(v);
        in.throttle = std::clamp(static_cast<float>(0.2 + 0.2 * (vT - t.speed)), 0.0f, 1.0f);
        w.setVehicleInput(v, in);
        w.step(2);
        if (k < 1500) continue;
        y.push_back((w.body(body).origin + toDouble(t.position)).y);
        upx.push_back(t.up.x);
        upz.push_back(t.up.z);
      }
      // High-pass by a 0.5 s centred moving average; acceleration by second differences (1 kHz).
      auto hp = [](const std::vector<double>& s, int half) {
        std::vector<double> out;
        for (size_t i = static_cast<size_t>(half); i + static_cast<size_t>(half) < s.size(); ++i) {
          double m = 0;
          for (int j = -half; j <= half; ++j) m += s[i + static_cast<size_t>(j)];
          out.push_back(s[i] - m / (2 * half + 1));
        }
        return out;
      };
      const auto yh = hp(y, 250), xh = hp(upx, 250), zh = hp(upz, 250);
      double accRms = 0, yRms = 0, angRms = 0;
      for (size_t i = 1; i + 1 < yh.size(); ++i) {
        const double a = (yh[i + 1] - 2 * yh[i] + yh[i - 1]) * 1e6;
        accRms += a * a;
        yRms += yh[i] * yh[i];
        angRms += xh[i] * xh[i] + zh[i] * zh[i];
      }
      const double n = static_cast<double>(yh.size());
      std::printf("%-22s %3.0f km/h: vertical acc %.3f m/s² rms, heave jitter %.2f mm rms, tilt jitter %.3f° rms\n", id, kmh,
                  std::sqrt(accRms / n), std::sqrt(yRms / n) * 1e3, std::sqrt(angRms / n) * 180.0 / kPi);
    }
  }
}

TEST_CASE("launch probe", "[.handlingprobe]") {
  // Full throttle from rest, TCS on: 0–100 time, longitudinal shudder (RMS of accelLong above 2 Hz) and how often the
  // traction control switches.
  for (const char* id : {"porsche_911_turbo_991", "rolls_royce_ghost", "maybach_gls"}) {
    for (int tcs = 1; tcs >= 0; --tcs) {
      WorldParams wp;
      wp.threadCount = 1;
      World w(wp);
      applyDefaultContactPairs(w);
      w.addGroundPlane(0.0, material::kAsphalt);
      const LoadedVehicle car = loadVehicleJson(carText(id), {{0.0, 0.0, 0.0}, 0.0, 0.0f});
      const int body = w.addBody(car.build.body);
      const int v = w.addVehicle(body, car.build.vehicle);
      VehicleInput hold;
      hold.brake = 1.0f;
      w.setVehicleInput(v, hold);
      w.step(2000);
      VehicleInput in;
      in.throttle = 1.0f;
      in.tcs = tcs != 0;
      in.abs = true;
      w.setVehicleInput(v, in);
      std::vector<double> ax;
      std::vector<int> calm;  // 1: no gear change within 0.4 s
      int lastShift = -10000;
      double t100 = -1;
      int toggles = 0;
      bool was = false;
      for (int k = 0; k < 8000; ++k) {  // 8 s at 1 kHz
        w.step(2);
        const VehicleTelemetry& t = w.vehicleTelemetry(v);
        if (t100 < 0 && t.speed * 3.6 >= 100.0) t100 = (k + 1) * 0.001;
        ax.push_back(t.accelLong);
        if (t.shifting) lastShift = k;
        calm.push_back(k - lastShift > 400 ? 1 : 0);
        if (t.tcsActive != was) ++toggles;
        was = t.tcsActive;
      }
      // Shudder: accelLong above ≈ 2 Hz (minus a 0.5 s moving mean), over the whole run and away from gear changes.
      double rms = 0, rmsCalm = 0;
      int n = 0, nCalm = 0;
      for (size_t i = 250; i + 250 < ax.size(); ++i) {
        double m = 0;
        for (int j = -250; j <= 250; ++j) m += ax[i + static_cast<size_t>(j)];
        const double d = ax[i] - m / 501.0;
        rms += d * d;
        ++n;
        bool quiet = true;
        for (int j = -250; j <= 250 && quiet; j += 25) quiet = calm[i + static_cast<size_t>(j)] != 0;
        if (quiet) {
          rmsCalm += d * d;
          ++nCalm;
        }
      }
      std::printf("%-22s TCS %d: 0-100 %.2f s, shudder %.2f m/s² rms (%.2f between shifts), TCS switched %d times, %.0f km/h at 8 s\n",
                  id, tcs, t100, std::sqrt(rms / n), nCalm ? std::sqrt(rmsCalm / nCalm) : 0.0, toggles, w.vehicleTelemetry(v).speed * 3.6);
    }
  }
}

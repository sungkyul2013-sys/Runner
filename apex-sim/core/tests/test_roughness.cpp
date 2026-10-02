// §11.4 micro-roughness in the contacts (World::setRoughness): the tyres feel the texture of the surface — cobbles
// shake the car, new asphalt barely; the bound used to widen the contact queries holds; nothing breaks.
#include <catch2/catch_test_macros.hpp>

#include <algorithm>
#include <cmath>
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

struct Ride {
  double heaveRms = 0.0;  // [m/s²] vertical acceleration of the body's reference node above 1 Hz
  double kmh = 0.0;
  double drift = 0.0;     // [m] sideways off the straight line
  uint32_t tyreFlags = 0;
};

// 4 s straight at `kmh` on a plane of `material`, the speed held.
Ride ride(uint16_t surface, bool rough, float kmh) {
  WorldParams wp;
  wp.threadCount = 1;
  World w(wp);
  applyDefaultContactPairs(w);
  w.setRoughness(rough);
  w.addGroundPlane(0.0, surface);
  const LoadedVehicle car = loadVehicleJson(vehicleText("porsche_911_turbo_991"), {{0.0, 0.0, 0.0}, 0.0, kmh / 3.6f});
  const int body = w.addBody(car.build.body);
  const int v = w.addVehicle(body, car.build.vehicle);
  const double target = kmh / 3.6;
  std::vector<double> vy;
  const int ref = car.build.vehicle.refCenter;
  for (int k = 0; k < 2000; ++k) {  // 4 s at 500 Hz
    const VehicleTelemetry& t = w.vehicleTelemetry(v);
    VehicleInput in;
    in.throttle = std::clamp(static_cast<float>(0.2 + 0.3 * (target - t.speed)), 0.0f, 1.0f);
    w.setVehicleInput(v, in);
    w.step(4);
    if (k >= 500) vy.push_back(w.body(body).nodeVelocity(ref).y);
  }
  Ride r;
  // Vertical acceleration by differences, minus its 1 s moving mean.
  std::vector<double> a;
  for (size_t i = 1; i < vy.size(); ++i) a.push_back((vy[i] - vy[i - 1]) * 500.0);
  double sum = 0.0;
  int n = 0;
  for (size_t i = 250; i + 250 < a.size(); ++i) {
    double m = 0.0;
    for (size_t j = i - 250; j <= i + 250; ++j) m += a[j];
    const double d = a[i] - m / 501.0;
    sum += d * d;
    ++n;
  }
  r.heaveRms = std::sqrt(sum / n);
  const VehicleTelemetry& t = w.vehicleTelemetry(v);
  r.kmh = t.speed * 3.6;
  r.drift = std::fabs((w.body(body).origin + toDouble(t.position)).x);
  for (const WheelTelemetry& wt : t.wheels) r.tyreFlags |= wt.tyreFlags;
  return r;
}

}  // namespace

TEST_CASE("micro-roughness: the contact query reach covers the highest bump", "[roughness][11.4]") {
  const SurfaceLibrary& lib = defaultSurfaces();
  for (const SurfaceParams& s : lib.surfaces) {
    if (s.roughness.kind == RoughnessKind::kNone) continue;
    const double peak = roughnessPeak(s.roughness);
    double top = -1.0;
    for (int i = 0; i < 4000; ++i) {
      const double x = 0.37 * i - 300.0, z = 0.53 * ((i * 7919) % 4000) - 1000.0;
      top = std::max(top, sampleRoughness(s.roughness, s.material, x, z).height);
    }
    INFO(s.id << ": peak bound " << peak << ", highest sample " << top);
    CHECK(top <= peak + 1e-9);
  }
}

TEST_CASE("micro-roughness: cobbles shake the car, new asphalt hardly; the tyres and the line hold", "[roughness][11.4][porsche]") {
  const Ride smooth = ride(material::kAsphalt, false, 40.0f);
  const Ride asphalt = ride(material::kAsphalt, true, 40.0f);
  const Ride worn = ride(material::kAsphaltOld, true, 40.0f);
  const Ride cobbles = ride(material::kCobblestone, true, 40.0f);
  INFO("heave rms: flat " << smooth.heaveRms << ", asphalt A " << asphalt.heaveRms << ", worn B " << worn.heaveRms
                          << ", cobbles " << cobbles.heaveRms << " m/s²");
  CHECK(asphalt.heaveRms < 0.6);              // new asphalt: a smooth ride
  CHECK(worn.heaveRms > asphalt.heaveRms);    // class B is rougher than A
  CHECK(cobbles.heaveRms > 2.0 * smooth.heaveRms);
  CHECK(cobbles.heaveRms > 0.3);
  for (const Ride& r : {asphalt, worn, cobbles}) {
    CHECK(r.tyreFlags == 0u);
    CHECK(r.kmh > 35.0);
    CHECK(r.drift < 1.0);
  }
}

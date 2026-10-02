// Map drive probe: a car driven along a map's roads (web/src/world/mapdump.test.ts writes the map's physics and the
// routes: the right-hand lane of each road), the way the browser builds the map world. Reports where wheels leave
// the road (the user report "주행할때 막 바퀴가 튀어"), load spikes, crashes and stalls.
//   MAPDUMP=build/mapdump npx vitest run web/src/world/mapdump.test.ts
//   MAPDRIVE_FILE=build/mapdump/hanbit.bin ./sbc_tests "[mapdrive]"
//   (MAPDRIVE_CARS=a,b  MAPDRIVE_ROUTES=substring,…  MAPDRIVE_SECONDS=40  MAPDRIVE_SPEED=1.0  MAPDRIVE_THREADS=4)
#include <catch2/catch_test_macros.hpp>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
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
  for (std::string item; std::getline(ss, item, ',');) if (!item.empty()) out.push_back(item);
  return out;
}

struct Reader {
  std::vector<char> data;
  size_t at = 0;
  template <typename T> T get() {
    T v;
    std::memcpy(&v, data.data() + at, sizeof(T));
    at += sizeof(T);
    return v;
  }
  template <typename T> std::vector<T> array(size_t n) {
    std::vector<T> v(n);
    std::memcpy(v.data(), data.data() + at, n * sizeof(T));
    at += n * sizeof(T);
    return v;
  }
};

struct Route {
  std::string name;
  float kmh = 50.0f;
  DVec3 position;
  double yaw = 0.0, pitch = 0.0, roll = 0.0;
  std::vector<double> xs, zs, curvature;
};

struct MapFile {
  Heightfield field;
  struct Mesh { DVec3 origin; int material; std::vector<float> vertices; std::vector<int32_t> indices; };
  std::vector<Mesh> meshes;
  std::vector<Route> routes;
};

MapFile readMap(const std::string& path) {
  std::ifstream f(path, std::ios::binary);
  REQUIRE(f.good());
  Reader r;
  r.data.assign(std::istreambuf_iterator<char>(f), {});
  REQUIRE(std::memcmp(r.data.data(), "APXM", 4) == 0);
  r.at = 4;
  REQUIRE(r.get<int32_t>() == 1);
  MapFile m;
  m.field.originX = r.get<double>();
  m.field.originZ = r.get<double>();
  m.field.cell = r.get<double>();
  m.field.nx = r.get<int32_t>();
  m.field.nz = r.get<int32_t>();
  m.field.heights = r.array<float>(static_cast<size_t>(m.field.nx + 1) * static_cast<size_t>(m.field.nz + 1));
  m.field.materials = r.array<uint8_t>(static_cast<size_t>(m.field.nx) * static_cast<size_t>(m.field.nz));
  const int meshes = r.get<int32_t>();
  for (int i = 0; i < meshes; ++i) {
    MapFile::Mesh mesh;
    mesh.origin.x = r.get<double>();
    mesh.origin.y = r.get<double>();
    mesh.origin.z = r.get<double>();
    mesh.material = r.get<int32_t>();
    const int nv = r.get<int32_t>(), ni = r.get<int32_t>();
    mesh.vertices = r.array<float>(static_cast<size_t>(nv) * 3);
    mesh.indices = r.array<int32_t>(static_cast<size_t>(ni));
    m.meshes.push_back(std::move(mesh));
  }
  const int routes = r.get<int32_t>();
  for (int i = 0; i < routes; ++i) {
    Route rt;
    const int len = r.get<int32_t>();
    rt.name.assign(r.data.data() + r.at, static_cast<size_t>(len));
    r.at += static_cast<size_t>(len);
    rt.kmh = r.get<float>();
    rt.position.x = r.get<double>();
    rt.position.y = r.get<double>();
    rt.position.z = r.get<double>();
    rt.yaw = r.get<double>();
    rt.pitch = r.get<double>();
    rt.roll = r.get<double>();
    const int n = r.get<int32_t>();
    const std::vector<double> pts = r.array<double>(static_cast<size_t>(n) * 2);
    for (int k = 0; k < n; ++k) {
      rt.xs.push_back(pts[2 * static_cast<size_t>(k)]);
      rt.zs.push_back(pts[2 * static_cast<size_t>(k) + 1]);
    }
    // Curvature over ±3 points (≈ 6 m).
    rt.curvature.assign(static_cast<size_t>(n), 0.0);
    for (int k = 3; k + 3 < n; ++k) {
      const double a1 = std::atan2(rt.zs[k] - rt.zs[k - 3], rt.xs[k] - rt.xs[k - 3]);
      const double a2 = std::atan2(rt.zs[k + 3] - rt.zs[k], rt.xs[k + 3] - rt.xs[k]);
      double d = std::fabs(a2 - a1);
      if (d > M_PI) d = 2 * M_PI - d;
      rt.curvature[static_cast<size_t>(k)] = d / 6.0;
    }
    m.routes.push_back(std::move(rt));
  }
  return m;
}

}  // namespace

TEST_CASE("map drive probe", "[.probe][mapdrive]") {
  const char* file = std::getenv("MAPDRIVE_FILE");
  if (!file) {
    WARN("MAPDRIVE_FILE not set");
    return;
  }
  const MapFile map = readMap(file);
  const double seconds = std::getenv("MAPDRIVE_SECONDS") ? std::atof(std::getenv("MAPDRIVE_SECONDS")) : 40.0;
  const double speedScale = std::getenv("MAPDRIVE_SPEED") ? std::atof(std::getenv("MAPDRIVE_SPEED")) : 1.0;
  const std::vector<std::string> filters = split(std::getenv("MAPDRIVE_ROUTES"), "");
  // MAPDRIVE_TRACE=<t>: a line every half second, and every sample from t [s] on.
  const bool trace = std::getenv("MAPDRIVE_TRACE") != nullptr;
  const double traceAll = trace ? std::atof(std::getenv("MAPDRIVE_TRACE")) : 1e9;
  for (const std::string& id : split(std::getenv("MAPDRIVE_CARS"), "porsche_911_turbo_991,rolls_royce_ghost,maybach_gls")) {
    WorldParams wp;
    wp.threadCount = std::getenv("MAPDRIVE_THREADS") ? std::atoi(std::getenv("MAPDRIVE_THREADS")) : 4;
    World w(wp);
    applyDefaultContactPairs(w);
    w.addGroundPlane(-500.0, material::kConcrete);
    w.setHeightfield(map.field);
    for (const MapFile::Mesh& m : map.meshes) w.addStaticMesh(m.origin, m.vertices, m.indices, static_cast<uint16_t>(m.material));
    w.setRoughness(true);
    const std::string text = vehicleText(id);
    int totalEvents = 0;
    for (const Route& rt : map.routes) {
      if (!filters.empty() && std::none_of(filters.begin(), filters.end(), [&](const std::string& f) { return rt.name.find(f) != std::string::npos; })) continue;
      const LoadedVehicle car = loadVehicleJson(text, {rt.position, rt.yaw, 0.0f});
      const int body = w.addBody(car.build.body);
      const int v = w.addVehicle(body, car.build.vehicle);
      if (rt.pitch != 0.0 || rt.roll != 0.0) w.relaunchVehicle(v, rt.position, rt.yaw, 0.0f, -1e9, rt.pitch, rt.roll);
      const float lock = car.build.vehicle.steeringLock;
      size_t near = 0;
      double driven = 0.0, maxOff = 0.0;
      DVec3 last = w.body(body).origin + toDouble(w.vehicleTelemetry(v).position);
      const size_t nw = w.vehicleTelemetry(v).wheels.size();
      std::vector<int> airRun(nw, 0);
      std::vector<double> airTime(nw, 0.0), loadRef(nw, 0.0);
      struct Event { double t, x, z; int wheel; double ms; };
      std::vector<Event> events;
      int spikes = 0, steps = 0;
      double wheelbase = 2.8;
      {
        const auto& ws = w.vehicleTelemetry(v).wheels;
        double zf = -1e9, zr = 1e9;
        for (const WheelTelemetry& wt : ws) {
          const Vec3 d = wt.center - w.vehicleTelemetry(v).position;
          const Vec3 f = w.vehicleTelemetry(v).forward;
          const double along = d.x * f.x + d.y * f.y + d.z * f.z;
          zf = std::max(zf, along);
          zr = std::min(zr, along);
        }
        wheelbase = std::max(1.5, zf - zr);
      }
      std::string end = "time";
      const int crash0 = w.vehicleTelemetry(v).crashEvents;
      double stuck = 0.0;
      const double dtSample = 4 * w.params().dt;
      for (double t = 0.0; t < seconds; t += dtSample) {
        const VehicleTelemetry& tm = w.vehicleTelemetry(v);
        const DVec3 p = w.body(body).origin + toDouble(tm.position);
        driven += std::hypot(p.x - last.x, p.z - last.z);
        last = p;
        // Nearest route point (searching ahead of the last one).
        double best = 1e30;
        for (size_t k = near; k < std::min(rt.xs.size(), near + 40); ++k) {
          const double d = std::hypot(rt.xs[k] - p.x, rt.zs[k] - p.z);
          if (d < best) {
            best = d;
            near = k;
          }
        }
        maxOff = std::max(maxOff, best);
        if (best > 6.0) { end = "lost"; break; }
        if (near + 6 >= rt.xs.size()) { end = "end"; break; }
        const double vms = tm.speed;
        const double ld = std::clamp(0.8 * vms, 6.0, 25.0);
        size_t look = near;
        while (look + 1 < rt.xs.size() && std::hypot(rt.xs[look] - p.x, rt.zs[look] - p.z) < ld) ++look;
        const double dx = rt.xs[look] - p.x, dz = rt.zs[look] - p.z;
        const double leftC = dx * tm.left.x + dz * tm.left.z;
        const double l2 = std::max(dx * dx + dz * dz, 1.0);
        const double steerAngle = std::atan(wheelbase * 2.0 * leftC / l2);
        double kmax = 0.0;
        for (size_t k = near; k < std::min(rt.xs.size(), near + 30); ++k) kmax = std::max(kmax, rt.curvature[k]);
        const double vt = std::min(rt.kmh / 3.6 * speedScale, kmax > 1e-4 ? std::sqrt(4.0 / kmax) : 1e9);
        VehicleInput in;
        const double e = vt - vms;
        in.throttle = static_cast<float>(std::clamp(0.25 * e + 0.05, 0.0, 1.0));
        in.brake = e < -1.0 ? static_cast<float>(std::clamp(-0.12 * e, 0.0, 1.0)) : 0.0f;
        if (in.brake > 0.0f) in.throttle = 0.0f;
        in.steer = static_cast<float>(std::clamp(steerAngle / lock, -1.0, 1.0));
        in.esc = true;
        // Trace: where the car is and what it does.
        if (trace && (steps % static_cast<int>(0.5 / dtSample) == 0 || (traceAll > 0.0 && t >= traceAll))) {
          double ratio = 0.0;
          for (size_t i = 0; i < nw && i < tm.wheels.size(); ++i) if (loadRef[i] > 0.0) ratio = std::max(ratio, tm.wheels[i].load / loadRef[i]);
          std::printf("      t %5.1f at (%7.1f, %7.1f) route %4zu off %4.1f m  %5.1f km/h  yaw %+5.2f rad/s  steer %+5.2f  thr %.2f brk %.2f  max load %4.1fx  esc %d tcs %d\n",
                      t, p.x, p.z, near, best, vms * 3.6, tm.yawRate, in.steer, in.throttle, in.brake, ratio, tm.escActive ? 1 : 0, tm.tcsActive ? 1 : 0);
        }
        w.setVehicleInput(v, in);
        w.step(4);
        ++steps;
        stuck = vms < 1.0 && t > 5.0 ? stuck + dtSample : 0.0;
        if (stuck > 4.0) { end = "stuck"; break; }
        const VehicleTelemetry& u = w.vehicleTelemetry(v);
        for (size_t i = 0; i < nw && i < u.wheels.size(); ++i) {
          const WheelTelemetry& wt = u.wheels[i];
          if (t > 1.0 && t < 2.0) loadRef[i] += wt.load * dtSample;  // the static share, from the first second rolling
          if (t < 2.0) continue;
          if (wt.load > 3.0 * loadRef[i] && loadRef[i] > 0.0) ++spikes;
          if (!wt.contact) {
            ++airRun[i];
            airTime[i] += dtSample;
          } else {
            if (airRun[i] * dtSample >= 0.01) events.push_back({t, p.x, p.z, static_cast<int>(i), airRun[i] * dtSample * 1000.0});
            airRun[i] = 0;
          }
        }
      }
      const VehicleTelemetry& tm = w.vehicleTelemetry(v);
      uint32_t flags = 0;
      for (const WheelTelemetry& wt : tm.wheels) flags |= wt.tyreFlags;
      const double simT = steps * dtSample;
      std::printf("%-22s %-28s %5.0f m %4.0f km/h (route %3.0f) off %3.1f m end %-5s | air", id.c_str(), rt.name.c_str(), driven, simT > 0 ? driven / simT * 3.6 : 0.0, rt.kmh, maxOff, end.c_str());
      for (size_t i = 0; i < nw; ++i) std::printf(" %4.1f%%", simT > 2 ? 100.0 * airTime[i] / (simT - 2.0) : 0.0);
      std::printf(" | hops %zu spikes %d crash %d tyres %x at (%.1f, %.1f, %.1f)\n", events.size(), spikes, tm.crashEvents - crash0, flags, last.x, last.y, last.z);
      for (size_t k = 0; k < std::min<size_t>(events.size(), 6); ++k)
        std::printf("      hop t %5.1f s at (%7.1f, %7.1f) wheel %d %4.0f ms\n", events[k].t, events[k].x, events[k].z, events[k].wheel, events[k].ms);
      std::fflush(stdout);
      totalEvents += static_cast<int>(events.size());
      w.retireFamily(body);
    }
    std::printf("%s: %d hops in all\n", id.c_str(), totalEvents);
  }
}

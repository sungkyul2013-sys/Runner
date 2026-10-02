// Driving up a city kerb onto the sidewalk (§11.3 연석, §6 tyre damage, §4.3 deformation): at everyday speeds the
// tyres and the body take it; only a hard strike damages a wheel.
#include <catch2/catch_test_macros.hpp>

#include <algorithm>
#include <array>
#include <cmath>
#include <cctype>
#include <cstdlib>
#include <cstdio>
#include <fstream>
#include <map>
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

struct KerbRun {
  uint32_t tyreFlags = 0;   // OR over the wheels
  double rimBend = 0.0;     // largest
  double bodyPlastic = 0.0; // [m] summed plastic deformation of the beams off the suspension corners
  int bodyYielded = 0;      // beams off the corners yielded more than 2 mm
  double suspension = 0.0;  // [m] summed over the corners
  int broken = 0;
  double kmhAfter = 0.0;
  std::string damaged;      // damage groups that took any damage (lamps, glass, radiator…)
  double bumperSet = 0.0;   // [m] largest set of a front / rear bumper-zone node against the same car run on flat ground
  std::string bumperAt;
  std::vector<DVec3> frame;  // node positions in the chassis frame at the end
};

// The city kerb: a sidewalk 15 cm up, its edge line across the car's path (`angleDeg` between the path and the edge
// line: 90 head-on), the car at `kmh` holding its speed with a light throttle. `bevel`: the edge as the road builder
// makes it (a chamfer) rather than a square step.
KerbRun kerb(const std::string& id, float kmh, double angleDeg, double height = 0.15, double run = 0.0, bool flat = false);

// Node positions in the chassis frame (3 reference nodes), the car standing after a run.
std::vector<DVec3> bodyFrame(const Body& b, const VehicleDesc& vd) {
  const DVec3 c = b.nodeWorldPosition(vd.refCenter);
  DVec3 f = b.nodeWorldPosition(vd.refFront) - c;
  f = f * (1.0 / std::sqrt(dot(f, f)));
  DVec3 l = b.nodeWorldPosition(vd.refLeft) - c;
  l = l - f * dot(l, f);
  l = l * (1.0 / std::sqrt(dot(l, l)));
  const DVec3 u = cross(f, l);
  std::vector<DVec3> out(static_cast<size_t>(b.nodeCount()));
  for (int i = 0; i < b.nodeCount(); ++i) {
    const DVec3 d = b.nodeWorldPosition(i) - c;
    out[static_cast<size_t>(i)] = {dot(d, f), dot(d, l), dot(d, u)};
  }
  return out;
}

std::vector<DVec3> flatBaseline(const std::string& id, float kmh) {
  static std::map<std::string, std::vector<DVec3>> cache;
  const std::string key = id + "@" + std::to_string(kmh);
  auto it = cache.find(key);
  if (it == cache.end()) {
    KerbRun r = kerb(id, kmh, 90.0, 0.15, 0.35, true);
    it = cache.emplace(key, r.frame).first;
  }
  return it->second;
}

KerbRun kerb(const std::string& id, float kmh, double angleDeg, double height, double run, bool flat) {
  WorldParams wp;
  wp.threadCount = 1;
  World w(wp);
  applyDefaultContactPairs(w);
  w.addGroundPlane(0.0, material::kAsphalt);
  // Edge line through (0, 0, 6) at `angleDeg` to the +Z path; the sidewalk on the far side.
  // Box axes (World::addStaticBox): local x → (cos, 0, −sin), local z → (sin, 0, cos); local z along the edge.
  const double yaw = angleDeg * 3.14159265358979323846 / 180.0;
  const double half = 20.0;
  const DVec3 n{std::cos(yaw), 0.0, -std::sin(yaw)};     // across the edge
  const DVec3 toward = dot(n, DVec3{0.0, 0.0, 1.0}) > 0.0 ? n : n * -1.0;
  std::vector<float> verts;
  if (flat) {
    // no kerb: the baseline
  } else if (run <= 0.0) {
    const DVec3 c = DVec3{0.0, height / 2.0, 6.0} + toward * half;
    w.addStaticBox(c, {static_cast<float>(half), static_cast<float>(height / 2.0), 150.0f}, yaw, material::kConcrete);
  } else {
    // Sloped face: from the road at the edge line up `height` over `run`, then the flat sidewalk. Local u across the
    // edge (toward the sidewalk), v along it.
    const double cy = std::cos(yaw), sy = std::sin(yaw), flip = dot(n, toward) > 0.0 ? 1.0 : -1.0;
    auto P = [&](double u, double y, double v) {
      const double lx = flip * u, lz = v;
      verts.push_back(static_cast<float>(cy * lx + sy * lz));
      verts.push_back(static_cast<float>(y));
      verts.push_back(static_cast<float>(-sy * lx + cy * lz));
    };
    verts.clear();
    for (double v : {-150.0, 150.0}) {
      P(0.0, 0.0, v);
      P(run, height, v);
      P(40.0, height, v);
      P(40.0, 0.0, v);
    }
    // 0..3 at v = −40, 4..7 at v = +40: slope 0-1, top 1-2, back 2-3; winding (b − a) × (c − a) outward, mirrored with flip.
    std::vector<int32_t> idx = {0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7};
    if (flip > 0.0) for (size_t k = 0; k < idx.size(); k += 3) std::swap(idx[k + 1], idx[k + 2]);
    w.addStaticMesh({0.0, 0.0, 6.0}, verts, idx, material::kConcrete);
  }
  const LoadedVehicle car = loadVehicleJson(vehicleText(id), {{0.0, 0.0, 0.0}, 0.0, kmh / 3.6f});
  const int body = w.addBody(car.build.body);
  const int v = w.addVehicle(body, car.build.vehicle);
  VehicleInput in;
  in.throttle = 0.12f;
  w.setVehicleInput(v, in);
  w.step(static_cast<int>(3.0 / w.params().dt));
  const double kmhAfter = w.vehicleTelemetry(v).speed * 3.6;
  // Then to a stop and 1.5 s at rest: the set is measured on the car standing still.
  VehicleInput stop;
  stop.brake = 1.0f;
  w.setVehicleInput(v, stop);
  w.step(static_cast<int>(4.0 / w.params().dt));
  KerbRun r;
  const VehicleTelemetry& t = w.vehicleTelemetry(v);
  for (const WheelTelemetry& wt : t.wheels) {
    r.tyreFlags |= wt.tyreFlags;
    r.rimBend = std::max(r.rimBend, static_cast<double>(wt.rimBend));
  }
  auto corner = [&](int32_t k) {
    const std::string& s = car.nodeIds[static_cast<size_t>(k)];
    return s.empty() || (s.size() > 3 && (s[0] == 'F' || s[0] == 'R') && (s[1] == 'L' || s[1] == 'R') && s[2] == '_');
  };
  const Body& b = w.body(body);
  for (int i = 0; i < b.beamCount(); ++i) {
    const size_t k = static_cast<size_t>(i);
    const double p = std::fabs(b.plasticDeformation[k]);
    if (corner(b.beamA[k]) || corner(b.beamB[k])) {
      r.suspension += p;
    } else {
      r.bodyPlastic += p;
      if (p > 0.002) ++r.bodyYielded;
    }
  }
  if (std::getenv("KERB_LIST")) {
    std::vector<std::pair<double, int>> list;
    for (int i = 0; i < b.beamCount(); ++i) {
      const double p = std::fabs(b.plasticDeformation[static_cast<size_t>(i)]);
      if (p > std::atof(std::getenv("KERB_LIST")) * 1e-3) list.push_back({p, i});
    }
    std::sort(list.rbegin(), list.rend());
    for (size_t k = 0; k < list.size() && k < 25; ++k) {
      const int i = list[k].second;
      const auto name = [&](int32_t n) { const std::string& s = car.nodeIds[static_cast<size_t>(n)]; return s.empty() ? std::string("#") + std::to_string(n) : s; };
      std::printf("   %6.1f mm  %s – %s  (L0 %.3f)\n", list[k].first * 1e3, name(b.beamA[static_cast<size_t>(i)]).c_str(),
                  name(b.beamB[static_cast<size_t>(i)]).c_str(), b.initialRestLength[static_cast<size_t>(i)]);
    }
  }
  if (std::getenv("KERB_LIST")) {
    for (size_t k = 0; k < b.damageBeam.size(); ++k) {
      const size_t i = static_cast<size_t>(b.damageBeam[k]);
      const double strain = std::fabs(b.restLength[i] / b.initialRestLength[i] - 1.0);
      if (strain < 0.01) continue;
      const auto name = [&](int32_t n) { const std::string& s = car.nodeIds[static_cast<size_t>(n)]; return s.empty() ? std::string("#") + std::to_string(n) : s; };
      std::printf("   group %s: %s – %s strain %.3f (L0 %.3f, plastic %.1f mm)\n", b.damageGroups[static_cast<size_t>(b.damageBeamGroup[k])].id.c_str(),
                  name(b.beamA[i]).c_str(), name(b.beamB[i]).c_str(), strain, b.initialRestLength[i], b.plasticDeformation[i] * 1e3);
    }
  }
  r.broken = b.brokenBeamCount;
  r.kmhAfter = kmhAfter;
  for (const DamageGroupState& g : b.damageGroups) {
    if (g.damaged > 0 || g.impacts > 0) {
      char buf[96];
      std::snprintf(buf, sizeof buf, "%s(%s %.3f / %.0f kN)", g.id.c_str(), g.damaged > 0 ? "strain" : "impact", g.peakStrain, g.peakImpact / 1e3);
      r.damaged += (r.damaged.empty() ? "" : ",") + std::string(buf);
    }
  }
  // Set of the bumper zones (every node within 0.5 m of the car's front or rear end) against the same car after the
  // same run on flat ground, in the chassis frame: what the kerb left on the body (elastic sag and settling cancel).
  r.frame = bodyFrame(b, car.build.vehicle);
  if (std::getenv("KERB_PANELS")) {
    // Hinged panels' ties: stretch against their rest length, broken or not.
    for (int i = 0; i < b.beamCount(); ++i) {
      const size_t k = static_cast<size_t>(i);
      const std::string& na = car.nodeIds[static_cast<size_t>(b.beamA[k])];
      const std::string& nb = car.nodeIds[static_cast<size_t>(b.beamB[k])];
      if (na.rfind("p_frontLid", 0) != 0 && nb.rfind("p_frontLid", 0) != 0) continue;
      if (na.rfind("p_", 0) == 0 && nb.rfind("p_", 0) == 0) continue;  // the panel's own grid
      const DVec3 d = b.nodeWorldPosition(b.beamB[k]) - b.nodeWorldPosition(b.beamA[k]);
      const double L = std::sqrt(dot(d, d));
      std::printf("   tie %s – %s: L %.4f rest %.4f init %.4f broken %d plastic %.4f type %d\n", na.c_str(), nb.c_str(), L,
                  b.restLength[k], b.initialRestLength[k], (int)b.broken[k], b.plasticDeformation[k], (int)b.beamType[k]);
    }
  }
  if (!flat) {
    const std::vector<DVec3> base = flatBaseline(id, kmh);
    double zMin = 1e9, zMax = -1e9;
    for (int i = 0; i < b.nodeCount(); ++i) {
      if (!corner(i)) { zMin = std::min(zMin, base[static_cast<size_t>(i)].x); zMax = std::max(zMax, base[static_cast<size_t>(i)].x); }
    }
    for (int i = 0; i < b.nodeCount(); ++i) {
      if (corner(i) || (b.flags[static_cast<size_t>(i)] & node_flag::kDetached)) continue;
      const DVec3 p0 = base[static_cast<size_t>(i)];
      if (p0.x < zMax - 0.5 && p0.x > zMin + 0.5) continue;
      const DVec3 d = r.frame[static_cast<size_t>(i)] - p0;
      const double set = std::sqrt(dot(d, d));
      if (set > r.bumperSet) {
        r.bumperSet = set;
        r.bumperAt = car.nodeIds[static_cast<size_t>(i)];
      }
    }
  }
  return r;
}

}  // namespace

TEST_CASE("a mountable city kerb taken at 50 km/h leaves the tyres, the body and the suspension intact",
          "[kerb][tyre][damage][11.3]") {
  // The road builder's kerb (web/src/world/road.ts): 15 cm up over 35 cm. Head-on, at 45° and at 30° to the edge,
  // each car climbs onto the sidewalk on its tyres: no cut or burst tyre, no bent rim, the underside and the bumpers'
  // lower lips scrape elastically, and no part takes damage (radiators, lamps, sump: the damage groups).
  for (const char* id : {"porsche_911_turbo_991", "rolls_royce_ghost", "maybach_gls"}) {
    for (double angle : {90.0, 45.0, 30.0}) {
      const KerbRun r = kerb(id, 50.0f, angle, 0.15, 0.35);
      INFO(id << " at " << angle << "°: tyre flags " << r.tyreFlags << ", rim bend " << r.rimBend << ", body plastic "
              << r.bodyPlastic * 1e3 << " mm (" << r.bodyYielded << " beams), suspension " << r.suspension * 1e3
              << " mm, " << r.kmhAfter << " km/h after, damaged [" << r.damaged << "]");
      CHECK((r.tyreFlags & (tyre_flag::kPuncture | tyre_flag::kBlowout | tyre_flag::kFlat | tyre_flag::kRimBent)) == 0u);
      CHECK(r.bodyPlastic < 0.01);
      CHECK(r.suspension < 0.001);
      CHECK(r.broken == 0);
      CHECK(r.damaged.empty());
      CHECK(r.kmhAfter > 38.0);  // over it, not stopped by it
    }
  }
}

TEST_CASE("kerb probe", "[.kerbprobe]") {
  const char* only = std::getenv("KERB_CAR");
  const char* speeds = std::getenv("KERB_KMH");
  for (const char* id : {"porsche_911_turbo_991", "rolls_royce_ghost", "maybach_gls"}) {
    if (only && std::string(only) != id) continue;
    for (double angle : {90.0, 45.0, 30.0, 12.0}) {
      for (float kmh : {10.0f, 20.0f, 35.0f, 50.0f, 70.0f}) {
        if (speeds && std::atof(speeds) != kmh) continue;
        const KerbRun r = kerb(id, kmh, angle, 0.15, std::getenv("KERB_RUN") ? std::atof(std::getenv("KERB_RUN")) : 0.25);
        std::printf("%-22s %4.0f° %3.0f km/h: tyres %3u rim %.4f | body plastic %.1f mm (%d beams) | susp %.1f mm | "
                    "broken %d | %5.1f km/h after | bumper set %.1f mm (%s) | damaged [%s]\n",
                    id, angle, kmh, r.tyreFlags, r.rimBend, r.bodyPlastic * 1e3, r.bodyYielded, r.suspension * 1e3,
                    r.broken, r.kmhAfter, r.bumperSet * 1e3, r.bumperAt.c_str(), r.damaged.c_str());
      }
    }
  }
}

TEST_CASE("ride height probe", "[.kerbprobe]") {
  for (const char* id : {"porsche_911_turbo_991", "rolls_royce_ghost", "maybach_gls"}) {
    WorldParams wp;
    wp.threadCount = 1;
    World w(wp);
    applyDefaultContactPairs(w);
    w.addGroundPlane(0.0, material::kAsphalt);
    const LoadedVehicle car = loadVehicleJson(vehicleText(id), {{0.0, 0.0, 0.0}, 0.0, 0.0f});
    const int body = w.addBody(car.build.body);
    w.addVehicle(body, car.build.vehicle);
    w.step(static_cast<int>(2.5 / w.params().dt));
    const Body& b = w.body(body);
    double low = 1e9, lowFront = 1e9, lowRear = 1e9, restLow = 1e9;
    std::string at;
    for (int i = 0; i < b.nodeCount(); ++i) {
      const std::string& s = car.nodeIds[static_cast<size_t>(i)];
      if (s.empty() || s[0] != 'c' || s.find('_') == std::string::npos || !std::isdigit(static_cast<unsigned char>(s[1]))) continue;
      const DVec3 p = b.nodeWorldPosition(i);
      const double y = p.y - b.radius[static_cast<size_t>(i)];
      restLow = std::min(restLow, static_cast<double>(car.build.body.nodes[static_cast<size_t>(i)].position.y) - b.radius[static_cast<size_t>(i)]);
      if (y < low) { low = y; at = s; }
      if (p.z > 1.8) lowFront = std::min(lowFront, y);
      if (p.z < -1.8) lowRear = std::min(lowRear, y);
    }
    std::printf("%-22s clearance %.3f m at %s (model frame %.3f); front overhang %.3f, rear %.3f\n", id, low, at.c_str(),
                restLow, lowFront, lowRear);
  }
}

TEST_CASE("a car put down on a 21 % slope along it stands there unharmed (relaunch with pitch)", "[kerb][spawn][porsche]") {
  // A spawn on a steep old-town lane: laid along the slope (World::relaunchVehicle pitch), the car settles on its
  // wheels and holds on its brakes; put down level instead, one end would be buried in the road.
  for (const char* id : {"porsche_911_turbo_991", "rolls_royce_ghost", "maybach_gls"}) {
    WorldParams wp;
    wp.threadCount = 1;
    World w(wp);
    applyDefaultContactPairs(w);
    const double grade = 0.21;
    std::vector<float> verts = {-40.0f, static_cast<float>(-40.0 * grade), -40.0f, 40.0f, static_cast<float>(-40.0 * grade), -40.0f,
                                40.0f, static_cast<float>(40.0 * grade), 40.0f, -40.0f, static_cast<float>(40.0 * grade), 40.0f};
    w.addStaticMesh({0.0, 0.0, 0.0}, verts, {0, 2, 1, 0, 3, 2}, material::kAsphalt);
    const LoadedVehicle car = loadVehicleJson(vehicleText(id), {{0.0, 0.0, 0.0}, 0.0, 0.0f});
    const int body = w.addBody(car.build.body);
    const int v = w.addVehicle(body, car.build.vehicle);
    w.relaunchVehicle(v, {0.0, 0.12, 0.0}, 0.0, 0.0f, -1e9, std::atan(grade), 0.0);  // facing uphill
    VehicleInput hold;
    hold.brake = 0.5f;
    w.setVehicleInput(v, hold);
    const DVec3 start = w.body(body).origin + toDouble(w.vehicleTelemetry(v).position);
    w.step(static_cast<int>(2.0 / w.params().dt));
    const VehicleTelemetry& t = w.vehicleTelemetry(v);
    const DVec3 end = w.body(body).origin + toDouble(t.position);
    const DVec3 d = end - start;
    const double moved = std::sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
    double plastic = 0.0;
    const Body& b = w.body(body);
    for (int i = 0; i < b.beamCount(); ++i) plastic += std::fabs(b.plasticDeformation[static_cast<size_t>(i)]);
    uint32_t tyres = 0;
    for (const WheelTelemetry& wt : t.wheels) tyres |= wt.tyreFlags;
    INFO(id << ": faults " << t.faults << ", tyre flags " << tyres << ", plastic " << plastic * 1e3 << " mm, moved " << moved << " m");
    CHECK(t.faults == 0u);
    CHECK(tyres == 0u);
    CHECK(plastic < 0.005);
    CHECK(moved < 0.3);
  }
}

TEST_CASE("kerb step-down probe", "[.kerbprobe]") {
  // Off the sidewalk down a 15 cm kerb (square or sloped), head-on, at 10–50 km/h.
  for (const char* id : {"porsche_911_turbo_991", "rolls_royce_ghost", "maybach_gls"}) {
    for (double run : {0.0, 0.35}) {
      for (float kmh : {10.0f, 20.0f, 35.0f, 50.0f}) {
        WorldParams wp;
        wp.threadCount = 1;
        World w(wp);
        applyDefaultContactPairs(w);
        w.addGroundPlane(-0.15, material::kAsphalt);
        // The sidewalk: z < 8, top at y 0; its edge at z = 8 square, or sloped down to the road over `run`.
        std::vector<float> verts;
        auto P = [&](double z, double y, double x) { verts.push_back(static_cast<float>(x)); verts.push_back(static_cast<float>(y)); verts.push_back(static_cast<float>(z)); };
        for (double x : {-20.0, 20.0}) { P(-40.0, 0.0, x); P(8.0, 0.0, x); P(8.0 + run, -0.15, x); P(-40.0, -0.15, x); }
        // (b − a) × (c − a) points up on the top and out of the slope.
        const std::vector<int32_t> idx = {0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5};
        w.addStaticMesh({0.0, 0.0, 0.0}, verts, idx, material::kConcrete);
        if (run <= 0.0) w.addStaticBox({0.0, -0.075, -16.0}, {20.0f, 0.075f, 24.0f}, 0.0, material::kConcrete);
        const LoadedVehicle car = loadVehicleJson(vehicleText(id), {{0.0, 0.0, 0.0}, 0.0, kmh / 3.6f});
        const int body = w.addBody(car.build.body);
        const int v = w.addVehicle(body, car.build.vehicle);
        VehicleInput in;
        in.throttle = 0.12f;
        w.setVehicleInput(v, in);
        w.step(static_cast<int>(3.0 / w.params().dt));
        const VehicleTelemetry& t = w.vehicleTelemetry(v);
        const Body& b = w.body(body);
        double susp = 0.0, bodyP = 0.0;
        for (int i = 0; i < b.beamCount(); ++i) {
          const size_t k = static_cast<size_t>(i);
          const std::string& na = car.nodeIds[static_cast<size_t>(b.beamA[k])];
          const std::string& nb = car.nodeIds[static_cast<size_t>(b.beamB[k])];
          const auto cornerId = [](const std::string& s2) { return s2.empty() || (s2.size() > 3 && (s2[0] == 'F' || s2[0] == 'R') && (s2[1] == 'L' || s2[1] == 'R') && s2[2] == '_'); };
          (cornerId(na) || cornerId(nb) ? susp : bodyP) += std::fabs(b.plasticDeformation[k]);
        }
        uint32_t tyres = 0;
        for (const WheelTelemetry& wt : t.wheels) tyres |= wt.tyreFlags;
        std::printf("%-22s step-down %s %3.0f km/h: tyres %u | susp plastic %.1f mm | body plastic %.1f mm | %.1f km/h after\n", id,
                    run > 0 ? "sloped" : "square", kmh, tyres, susp * 1e3, bodyP * 1e3, t.speed * 3.6);
      }
    }
  }
}

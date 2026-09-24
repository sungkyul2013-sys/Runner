// Vehicle JSON loader (docs/VEHICLE_FORMAT.md).
#include "sbc/vehicle_json.h"

#include <yyjson.h>

#include <cmath>
#include <memory>
#include <stdexcept>
#include <unordered_map>

#include "sbc/builder.h"
#include "sbc/scenes.h"

namespace sbc {
namespace {

using Val = yyjson_val*;

[[noreturn]] void fail(const std::string& path, const std::string& what) {
  throw std::invalid_argument("vehicle json " + path + ": " + what);
}

Val member(Val obj, const char* key) { return obj && yyjson_is_obj(obj) ? yyjson_obj_get(obj, key) : nullptr; }

double number(Val v, const std::string& path) {
  if (!v || !yyjson_is_num(v)) fail(path, "expected a number");
  const double x = yyjson_get_num(v);
  if (!std::isfinite(x)) fail(path, "not finite");
  return x;
}

double numberOr(Val obj, const char* key, double fallback, const std::string& path) {
  const Val v = member(obj, key);
  return v ? number(v, path + "." + key) : fallback;
}

float floatOr(Val obj, const char* key, float fallback, const std::string& path) {
  return static_cast<float>(numberOr(obj, key, fallback, path));
}

bool boolOr(Val obj, const char* key, bool fallback, const std::string& path) {
  const Val v = member(obj, key);
  if (!v) return fallback;
  if (!yyjson_is_bool(v)) fail(path + "." + key, "expected true/false");
  return yyjson_get_bool(v);
}

std::string string(Val v, const std::string& path) {
  if (!v || !yyjson_is_str(v)) fail(path, "expected a string");
  return yyjson_get_str(v);
}

std::string stringOr(Val obj, const char* key, const std::string& fallback, const std::string& path) {
  const Val v = member(obj, key);
  return v ? string(v, path + "." + key) : fallback;
}

Val array(Val v, const std::string& path) {
  if (!v || !yyjson_is_arr(v)) fail(path, "expected an array");
  return v;
}

uint16_t materialId(Val v, const std::string& path) {
  if (v && yyjson_is_num(v)) {
    const double m = yyjson_get_num(v);
    if (m < 0 || m >= kMaxMaterials || m != std::floor(m)) fail(path, "material id out of range");
    return static_cast<uint16_t>(m);
  }
  const std::string name = string(v, path);
  if (name == "steel") return material::kSteel;
  if (name == "concrete") return material::kConcrete;
  if (name == "rubber") return material::kRubber;
  if (name == "asphalt") return material::kAsphalt;
  fail(path, "unknown material '" + name + "'");
}

struct Loader {
  LoadedVehicle out;
  std::unordered_map<std::string, int32_t> ids;
  std::unordered_map<std::string, int32_t> breakGroups;
  std::unordered_map<std::string, PressureWheelNodes> wheels;

  BodyDesc& body() { return out.build.body; }

  int32_t node(Val v, const std::string& path) {
    const std::string id = string(v, path);
    const auto it = ids.find(id);
    if (it == ids.end()) fail(path, "unknown node '" + id + "'");
    return it->second;
  }

  std::vector<int32_t> nodeList(Val v, const std::string& path) {
    std::vector<int32_t> list;
    array(v, path);
    size_t i, n;
    Val item;
    yyjson_arr_foreach(v, i, n, item) list.push_back(node(item, path + "[" + std::to_string(i) + "]"));
    return list;
  }

  float reducedMass(int32_t a, int32_t b) const {
    const NodeDesc& na = out.build.body.nodes[static_cast<size_t>(a)];
    const NodeDesc& nb = out.build.body.nodes[static_cast<size_t>(b)];
    const bool fa = (na.flags & node_flag::kFixed) != 0, fb = (nb.flags & node_flag::kFixed) != 0;
    if (fa && fb) return 1.0f;
    if (fa) return nb.mass;
    if (fb) return na.mass;
    return na.mass * nb.mass / (na.mass + nb.mass);
  }

  float initialLength(int32_t a, int32_t b) const {
    const Vec3 d = out.build.body.nodes[static_cast<size_t>(b)].position - out.build.body.nodes[static_cast<size_t>(a)].position;
    return length(d);
  }

  void nodes(Val arr) {
    array(arr, "nodes");
    size_t i, n;
    Val item;
    yyjson_arr_foreach(arr, i, n, item) {
      const std::string path = "nodes[" + std::to_string(i) + "]";
      array(item, path);
      const size_t count = yyjson_arr_size(item);
      if (count < 5) fail(path, "expected [id, x, y, z, mass, radius?, material?, flags?]");
      const std::string id = string(yyjson_arr_get(item, 0), path + "[0]");
      if (!ids.emplace(id, static_cast<int32_t>(body().nodes.size())).second) fail(path, "duplicate node id '" + id + "'");
      NodeDesc nd;
      nd.position = {static_cast<float>(number(yyjson_arr_get(item, 1), path + "[1]")),
                     static_cast<float>(number(yyjson_arr_get(item, 2), path + "[2]")),
                     static_cast<float>(number(yyjson_arr_get(item, 3), path + "[3]"))};
      nd.mass = static_cast<float>(number(yyjson_arr_get(item, 4), path + "[4]"));
      if (count > 5) nd.radius = static_cast<float>(number(yyjson_arr_get(item, 5), path + "[5]"));
      if (count > 6) nd.material = materialId(yyjson_arr_get(item, 6), path + "[6]");
      if (count > 7) {
        const std::string flags = string(yyjson_arr_get(item, 7), path + "[7]");
        if (flags.find("fixed") != std::string::npos) nd.flags |= node_flag::kFixed;
        if (flags.find("nocollide") != std::string::npos) nd.flags = static_cast<uint8_t>(nd.flags & ~node_flag::kCollide);
      }
      body().nodes.push_back(nd);
      out.nodeIds.push_back(id);
    }
  }

  // Beam properties from a group object and/or a per-beam override object.
  struct BeamProps {
    BeamType type = BeamType::kNormal;
    double k = 0.0, c = -1.0, zeta = -1.0;
    double plastic = kInfiniteForce, hardening = 0.0, breakForce = kInfiniteForce, deform = kInfiniteForce;
    double crush = 0.95, tear = kInfiniteForce;
    double kc = -1.0;
    std::string breakGroup;
    std::string damage;         // damage group id
    double damageStrain = -1.0;
  };

  static BeamType beamType(const std::string& name, const std::string& path) {
    if (name == "normal") return BeamType::kNormal;
    if (name == "support") return BeamType::kSupport;
    if (name == "bounded") return BeamType::kBounded;
    if (name == "rope") return BeamType::kRope;
    if (name == "anisotropic") return BeamType::kAnisotropic;
    if (name == "hydro") return BeamType::kHydro;
    fail(path, "unknown beam type '" + name + "'");
  }

  static void applyProps(BeamProps& p, Val obj, const std::string& path) {
    if (!obj) return;
    if (!yyjson_is_obj(obj)) fail(path, "expected an object");
    if (const Val t = member(obj, "type")) p.type = beamType(string(t, path + ".type"), path + ".type");
    p.k = numberOr(obj, "k", p.k, path);
    if (member(obj, "c")) { p.c = numberOr(obj, "c", 0.0, path); p.zeta = -1.0; }
    if (member(obj, "zeta")) { p.zeta = numberOr(obj, "zeta", 0.0, path); p.c = -1.0; }
    p.plastic = numberOr(obj, "plasticForce", p.plastic, path);
    p.hardening = numberOr(obj, "hardening", p.hardening, path);
    p.breakForce = numberOr(obj, "breakForce", p.breakForce, path);
    p.deform = numberOr(obj, "deformLimit", p.deform, path);
    p.crush = numberOr(obj, "crushLimit", p.crush, path);
    p.tear = numberOr(obj, "tearLimit", p.tear, path);
    p.kc = numberOr(obj, "kc", p.kc, path);
    p.breakGroup = stringOr(obj, "breakGroup", p.breakGroup, path);
    p.damage = stringOr(obj, "damage", p.damage, path);
    p.damageStrain = numberOr(obj, "damageStrain", p.damageStrain, path);
  }

  // Damage groups: [{"id", "strain"?, "visual"?}] ("visual" is render metadata the core does not read).
  std::unordered_map<std::string, int32_t> damageGroupIndex;
  void damageGroups(Val arr) {
    if (!arr) return;
    array(arr, "damageGroups");
    size_t i, n;
    Val item;
    yyjson_arr_foreach(arr, i, n, item) {
      const std::string path = "damageGroups[" + std::to_string(i) + "]";
      DamageGroupDesc g;
      g.id = string(member(item, "id"), path + ".id");
      g.strain = floatOr(item, "strain", g.strain, path);
      if (!(g.strain > 0.0f)) fail(path, "strain must be > 0");
      if (!damageGroupIndex.emplace(g.id, static_cast<int32_t>(body().damageGroups.size())).second) fail(path, "duplicate id '" + g.id + "'");
      body().damageGroups.push_back(g);
    }
  }

  void beams(Val groupsObj, Val arr) {
    std::unordered_map<std::string, BeamProps> groups;
    if (groupsObj) {
      if (!yyjson_is_obj(groupsObj)) fail("beamGroups", "expected an object");
      size_t i, n;
      Val key, val;
      yyjson_obj_foreach(groupsObj, i, n, key, val) {
        BeamProps p;
        applyProps(p, val, std::string("beamGroups.") + yyjson_get_str(key));
        groups.emplace(yyjson_get_str(key), p);
      }
    }
    array(arr, "beams");
    size_t i, n;
    Val item;
    yyjson_arr_foreach(arr, i, n, item) {
      const std::string path = "beams[" + std::to_string(i) + "]";
      array(item, path);
      const size_t count = yyjson_arr_size(item);
      if (count < 3) fail(path, "expected [a, b, group, overrides?]");
      BeamDesc bd;
      bd.a = node(yyjson_arr_get(item, 0), path + "[0]");
      bd.b = node(yyjson_arr_get(item, 1), path + "[1]");
      const std::string groupName = string(yyjson_arr_get(item, 2), path + "[2]");
      const auto g = groups.find(groupName);
      if (g == groups.end()) fail(path + "[2]", "unknown beam group '" + groupName + "'");
      BeamProps p = g->second;
      const Val over = count > 3 ? yyjson_arr_get(item, 3) : nullptr;
      applyProps(p, over, path + "[3]");
      if (!(p.k > 0.0)) fail(path, "stiffness k must be > 0");
      bd.type = p.type;
      bd.stiffness = static_cast<float>(p.k);
      const double c = p.c >= 0.0 ? p.c : (p.zeta >= 0.0 ? 2.0 * p.zeta * std::sqrt(p.k * reducedMass(bd.a, bd.b)) : 0.0);
      bd.damping = static_cast<float>(c);
      bd.plasticForce = static_cast<float>(p.plastic);
      bd.hardening = static_cast<float>(p.hardening);
      bd.breakForce = static_cast<float>(p.breakForce);
      bd.deformLimit = static_cast<float>(p.deform);
      if (!(p.crush > 0.0 && p.crush <= 1.0)) fail(path, "crushLimit must be in (0, 1]");
      if (!(p.tear > 0.0)) fail(path, "tearLimit must be > 0");
      bd.crushLimit = static_cast<float>(p.crush);
      bd.tearLimit = static_cast<float>(p.tear);
      bd.compressionStiffness = static_cast<float>(p.kc);
      if (!p.breakGroup.empty()) {
        bd.breakGroup = breakGroups.emplace(p.breakGroup, static_cast<int32_t>(breakGroups.size())).first->second;
      }
      if (!p.damage.empty()) {
        const auto dg = damageGroupIndex.find(p.damage);
        if (dg == damageGroupIndex.end()) fail(path, "unknown damage group '" + p.damage + "'");
        bd.damageGroup = dg->second;
        bd.damageStrain = static_cast<float>(p.damageStrain);
      }
      const float initial = initialLength(bd.a, bd.b);
      if (over) {
        if (member(over, "rest")) bd.restLength = floatOr(over, "rest", 0.0f, path);
        if (member(over, "restOffset")) bd.restLength = initial + floatOr(over, "restOffset", 0.0f, path);
        bd.minLength = member(over, "min") ? floatOr(over, "min", 0.0f, path) : initial + floatOr(over, "minOffset", 0.0f, path);
        bd.maxLength = member(over, "max") ? floatOr(over, "max", 0.0f, path) : initial + floatOr(over, "maxOffset", 0.0f, path);
        if (const Val h = member(over, "hydro")) {
          bd.hydroChannel = static_cast<int32_t>(numberOr(h, "channel", 0.0, path + ".hydro"));
          bd.hydroFactor = floatOr(h, "factor", 0.0f, path + ".hydro");
          bd.hydroSpeed = floatOr(h, "speed", 0.0f, path + ".hydro");
        }
      }
      body().beams.push_back(bd);
    }
  }

  void sliders(Val arr) {
    if (!arr) return;
    array(arr, "sliders");
    size_t i, n;
    Val item;
    yyjson_arr_foreach(arr, i, n, item) {
      const std::string path = "sliders[" + std::to_string(i) + "]";
      SliderDesc sd;
      sd.node = node(member(item, "node"), path + ".node");
      sd.railA = node(member(item, "railA"), path + ".railA");
      sd.railB = node(member(item, "railB"), path + ".railB");
      sd.stiffness = floatOr(item, "k", 0.0f, path);
      const double zeta = numberOr(item, "zeta", -1.0, path);
      const float m = body().nodes[static_cast<size_t>(sd.node)].mass;
      sd.damping = zeta >= 0.0 ? static_cast<float>(2.0 * zeta * std::sqrt(sd.stiffness * m)) : floatOr(item, "c", 0.0f, path);
      body().sliders.push_back(sd);
    }
  }

  void torsionBars(Val arr) {
    if (!arr) return;
    array(arr, "torsionBars");
    size_t i, n;
    Val item;
    yyjson_arr_foreach(arr, i, n, item) {
      const std::string path = "torsionBars[" + std::to_string(i) + "]";
      TorsionBarDesc t;
      t.arm1 = node(member(item, "arm1"), path + ".arm1");
      t.pivot1 = node(member(item, "pivot1"), path + ".pivot1");
      t.pivot2 = node(member(item, "pivot2"), path + ".pivot2");
      t.arm2 = node(member(item, "arm2"), path + ".arm2");
      t.stiffness = floatOr(item, "k", 0.0f, path);
      t.damping = floatOr(item, "c", 0.0f, path);
      t.breakTwist = floatOr(item, "breakTwist", t.breakTwist, path);
      if (!(t.breakTwist > 0.0f)) fail(path, "breakTwist must be > 0");
      body().torsionBars.push_back(t);
    }
  }

  static Vec3 vec3(Val v, const std::string& path) {
    array(v, path);
    if (yyjson_arr_size(v) != 3) fail(path, "expected [x, y, z]");
    return {static_cast<float>(number(yyjson_arr_get(v, 0), path + "[0]")),
            static_cast<float>(number(yyjson_arr_get(v, 1), path + "[1]")),
            static_cast<float>(number(yyjson_arr_get(v, 2), path + "[2]"))};
  }

  // Collision triangles: [a, b, c] or [a, b, c, group] (node ids; counter-clockwise seen from outside).
  void triangles(Val arr) {
    if (!arr) return;
    array(arr, "triangles");
    size_t i, n;
    Val item;
    yyjson_arr_foreach(arr, i, n, item) {
      const std::string path = "triangles[" + std::to_string(i) + "]";
      array(item, path);
      const size_t count = yyjson_arr_size(item);
      if (count != 3 && count != 4) fail(path, "expected [a, b, c, group?]");
      CollisionTriDesc t;
      t.a = node(yyjson_arr_get(item, 0), path + "[0]");
      t.b = node(yyjson_arr_get(item, 1), path + "[1]");
      t.c = node(yyjson_arr_get(item, 2), path + "[2]");
      if (count == 4) {
        const Val g = yyjson_arr_get(item, 3);
        if (!yyjson_is_num(g)) fail(path + "[3]", "expected a group number");
        const double group = yyjson_get_num(g);
        if (group < -1.0 || group > 32767.0 || group != std::floor(group)) fail(path + "[3]", "group must be an integer ≥ −1");
        t.group = static_cast<int16_t>(group);
      }
      body().triangles.push_back(t);
    }
  }

  void pressureWheels(Val arr) {
    if (!arr) return;
    array(arr, "pressureWheels");
    size_t i, n;
    Val item;
    yyjson_arr_foreach(arr, i, n, item) {
      const std::string path = "pressureWheels[" + std::to_string(i) + "]";
      const std::string id = string(member(item, "id"), path + ".id");
      PressureWheelParams p;
      p.axleRight = node(member(item, "axleRight"), path + ".axleRight");
      p.axleLeft = node(member(item, "axleLeft"), path + ".axleLeft");
      p.center = vec3(member(item, "center"), path + ".center");
      if (member(item, "upHint")) p.upHint = vec3(member(item, "upHint"), path + ".upHint");
      p.segments = static_cast<int>(numberOr(item, "segments", p.segments, path));
      p.tyreRadius = floatOr(item, "tyreRadius", p.tyreRadius, path);
      p.treadWidth = floatOr(item, "treadWidth", p.treadWidth, path);
      p.rimRadius = floatOr(item, "rimRadius", p.rimRadius, path);
      p.rimWidth = floatOr(item, "rimWidth", p.rimWidth, path);
      p.treadNodeMass = floatOr(item, "treadNodeMass", p.treadNodeMass, path);
      p.rimNodeMass = floatOr(item, "rimNodeMass", p.rimNodeMass, path);
      p.treadNodeRadius = floatOr(item, "treadNodeRadius", p.treadNodeRadius, path);
      p.rimNodeRadius = floatOr(item, "rimNodeRadius", p.rimNodeRadius, path);
      p.rimStiffness = floatOr(item, "rimStiffness", p.rimStiffness, path);
      p.spokeStiffness = floatOr(item, "spokeStiffness", p.spokeStiffness, path);
      p.treadStiffness = floatOr(item, "treadStiffness", p.treadStiffness, path);
      p.treadBendStiffness = floatOr(item, "treadBendStiffness", p.treadBendStiffness, path);
      p.sidewallStiffness = floatOr(item, "sidewallStiffness", p.sidewallStiffness, path);
      p.sidewallTensionStiffness = floatOr(item, "sidewallTensionStiffness", p.sidewallTensionStiffness, path);
      p.sidewallShearStiffness = floatOr(item, "sidewallShearStiffness", p.sidewallShearStiffness, path);
      p.sidewallCrossStiffness = floatOr(item, "sidewallCrossStiffness", p.sidewallCrossStiffness, path);
      p.rimDampingRatio = floatOr(item, "rimDampingRatio", p.rimDampingRatio, path);
      p.treadDampingRatio = floatOr(item, "treadDampingRatio", p.treadDampingRatio, path);
      p.sidewallDampingRatio = floatOr(item, "sidewallDampingRatio", p.sidewallDampingRatio, path);
      p.structuralPressure = floatOr(item, "structuralPressure", p.structuralPressure, path);
      p.collisionSurface = !member(item, "collisionSurface") || yyjson_get_bool(member(item, "collisionSurface"));
      p.collisionGroup = static_cast<int16_t>(numberOr(item, "collisionGroup", -1.0, path));
      if (p.collisionGroup < -1) fail(path, "collisionGroup must be ≥ −1");
      p.treadMaterial = member(item, "treadMaterial") ? materialId(member(item, "treadMaterial"), path + ".treadMaterial")
                                                      : material::kRubber;
      p.rimMaterial = member(item, "rimMaterial") ? materialId(member(item, "rimMaterial"), path + ".rimMaterial")
                                                  : material::kSteel;
      try {
        PressureWheelNodes nodes = addPressureWheel(body(), p);
        out.nodeIds.resize(body().nodes.size());
        if (!wheels.emplace(id, std::move(nodes)).second) fail(path, "duplicate wheel id '" + id + "'");
      } catch (const std::invalid_argument& e) {
        fail(path, e.what());
      }
    }
  }

  static void tyre(TyreParams& t, Val obj, const std::string& path) {
    if (!obj) return;
    t.radius = floatOr(obj, "radius", t.radius, path);
    t.mu = floatOr(obj, "mu", t.mu, path);
    t.Bx = floatOr(obj, "Bx", t.Bx, path);
    t.Cx = floatOr(obj, "Cx", t.Cx, path);
    t.Ex = floatOr(obj, "Ex", t.Ex, path);
    t.By = floatOr(obj, "By", t.By, path);
    t.Cy = floatOr(obj, "Cy", t.Cy, path);
    t.Ey = floatOr(obj, "Ey", t.Ey, path);
    t.loadSensitivity = floatOr(obj, "loadSensitivity", t.loadSensitivity, path);
    t.nominalLoad = floatOr(obj, "nominalLoad", t.nominalLoad, path);
    t.relaxationX = floatOr(obj, "relaxationX", t.relaxationX, path);
    t.relaxationY = floatOr(obj, "relaxationY", t.relaxationY, path);
    t.rollingResistance = floatOr(obj, "rollingResistance", t.rollingResistance, path);
    t.pneumaticTrail = floatOr(obj, "pneumaticTrail", t.pneumaticTrail, path);
    t.camberStiffness = floatOr(obj, "camberStiffness", t.camberStiffness, path);
    t.lowSpeed = floatOr(obj, "lowSpeed", t.lowSpeed, path);
    t.verticalStiffness = floatOr(obj, "verticalStiffness", t.verticalStiffness, path);
    t.radialDamping = floatOr(obj, "radialDamping", t.radialDamping, path);
  }

  std::vector<float> floats(Val v, const std::string& path) {
    std::vector<float> list;
    array(v, path);
    size_t i, n;
    Val item;
    yyjson_arr_foreach(v, i, n, item) list.push_back(static_cast<float>(number(item, path + "[" + std::to_string(i) + "]")));
    return list;
  }

  void vehicle(Val obj) {
    if (!obj || !yyjson_is_obj(obj)) fail("vehicle", "expected an object");
    VehicleDesc& v = out.build.vehicle;
    v.name = out.name;
    v.refCenter = node(member(obj, "refCenter"), "vehicle.refCenter");
    v.refFront = node(member(obj, "refFront"), "vehicle.refFront");
    v.refLeft = node(member(obj, "refLeft"), "vehicle.refLeft");
    v.refCenterModel = body().nodes[static_cast<size_t>(v.refCenter)].position;
    if (const Val s = member(obj, "steering")) {
      v.steeringChannel = static_cast<int32_t>(numberOr(s, "channel", -1.0, "vehicle.steering"));
      v.steeringRate = floatOr(s, "rate", v.steeringRate, "vehicle.steering");
    }
    const Val wheelArr = array(member(obj, "wheels"), "vehicle.wheels");
    std::unordered_map<std::string, int32_t> wheelIndex;
    size_t i, n;
    Val item;
    yyjson_arr_foreach(wheelArr, i, n, item) {
      const std::string path = "vehicle.wheels[" + std::to_string(i) + "]";
      WheelDesc w;
      w.name = string(member(item, "name"), path + ".name");
      const std::string pw = string(member(item, "pressureWheel"), path + ".pressureWheel");
      const auto it = wheels.find(pw);
      if (it == wheels.end()) fail(path + ".pressureWheel", "unknown pressure wheel '" + pw + "'");
      w.rotatingNodes = it->second.all;
      w.treadNodes = it->second.tread;
      w.carrierNodes = nodeList(member(item, "carrier"), path + ".carrier");
      // the axle nodes are those the pressure wheel was built on
      w.axleRight = -1;
      w.axleLeft = -1;
      tyre(w.tyre, member(item, "tyre"), path + ".tyre");
      w.brakeTorque = floatOr(item, "brakeTorque", 0.0f, path);
      w.handbrakeTorque = floatOr(item, "handbrakeTorque", 0.0f, path);
      w.driveShare = floatOr(item, "driveShare", 0.0f, path);
      wheelIndex.emplace(w.name, static_cast<int32_t>(v.wheels.size()));
      v.wheels.push_back(std::move(w));
      wheelAxles.push_back(pw);
    }
    if (const Val axles = member(obj, "axles")) {
      array(axles, "vehicle.axles");
      yyjson_arr_foreach(axles, i, n, item) {
        const std::string path = "vehicle.axles[" + std::to_string(i) + "]";
        AxleDesc a;
        const std::string l = string(member(item, "left"), path + ".left"), r = string(member(item, "right"), path + ".right");
        if (!wheelIndex.count(l) || !wheelIndex.count(r)) fail(path, "unknown wheel name");
        a.leftWheel = wheelIndex[l];
        a.rightWheel = wheelIndex[r];
        a.lsdPreload = floatOr(item, "lsdPreload", 0.0f, path);
        a.lsdLockDrive = floatOr(item, "lsdLockDrive", 0.0f, path);
        a.lsdLockCoast = floatOr(item, "lsdLockCoast", 0.0f, path);
        v.axles.push_back(a);
      }
    }
    if (const Val dr = member(obj, "driveReaction")) v.driveReactionNodes = nodeList(dr, "vehicle.driveReaction");
    if (const Val c = member(obj, "centreCoupling")) {
      const std::string path = "vehicle.centreCoupling";
      v.centre.active = boolOr(c, "active", true, path);
      v.centre.frontAxle = static_cast<int32_t>(numberOr(c, "frontAxle", 0.0, path));
      v.centre.rearAxle = static_cast<int32_t>(numberOr(c, "rearAxle", 1.0, path));
      v.centre.minFront = floatOr(c, "minFront", v.centre.minFront, path);
      v.centre.maxFront = floatOr(c, "maxFront", v.centre.maxFront, path);
      v.centre.rate = floatOr(c, "rate", v.centre.rate, path);
    }
    if (const Val e = member(obj, "engine")) {
      const std::string path = "vehicle.engine";
      const Val curve = array(member(e, "torqueCurve"), path + ".torqueCurve");
      yyjson_arr_foreach(curve, i, n, item) {
        const std::string p = path + ".torqueCurve[" + std::to_string(i) + "]";
        array(item, p);
        v.engine.torqueRpm.push_back(static_cast<float>(number(yyjson_arr_get(item, 0), p + "[0]")));
        v.engine.torqueNm.push_back(static_cast<float>(number(yyjson_arr_get(item, 1), p + "[1]")));
      }
      v.engine.idleRpm = floatOr(e, "idleRpm", v.engine.idleRpm, path);
      v.engine.redlineRpm = floatOr(e, "redlineRpm", v.engine.redlineRpm, path);
      v.engine.limiterRpm = floatOr(e, "limiterRpm", v.engine.limiterRpm, path);
      v.engine.stallRpm = floatOr(e, "stallRpm", v.engine.stallRpm, path);
      v.engine.inertia = floatOr(e, "inertia", v.engine.inertia, path);
      v.engine.frictionTorque = floatOr(e, "frictionTorque", v.engine.frictionTorque, path);
      v.engine.frictionPerRpm = floatOr(e, "frictionPerRpm", v.engine.frictionPerRpm, path);
    }
    if (const Val t = member(obj, "transmission")) {
      const std::string path = "vehicle.transmission";
      v.transmission.ratios = floats(member(t, "ratios"), path + ".ratios");
      TransmissionDesc& x = v.transmission;
      x.reverseRatio = floatOr(t, "reverseRatio", x.reverseRatio, path);
      x.finalDrive = floatOr(t, "finalDrive", x.finalDrive, path);
      x.efficiency = floatOr(t, "efficiency", x.efficiency, path);
      x.shiftTime = floatOr(t, "shiftTime", x.shiftTime, path);
      x.clutchMaxTorque = floatOr(t, "clutchMaxTorque", x.clutchMaxTorque, path);
      x.drivelineStiffness = floatOr(t, "drivelineStiffness", x.drivelineStiffness, path);
      x.drivelineDamping = floatOr(t, "drivelineDamping", x.drivelineDamping, path);
      x.upshiftRpm = floatOr(t, "upshiftRpm", x.upshiftRpm, path);
      x.downshiftRpm = floatOr(t, "downshiftRpm", x.downshiftRpm, path);
      x.launchRpm = floatOr(t, "launchRpm", x.launchRpm, path);
    }
    if (const Val b = member(obj, "brakes")) {
      v.brakes.stiffness = floatOr(b, "stiffness", v.brakes.stiffness, "vehicle.brakes");
      v.brakes.damping = floatOr(b, "damping", v.brakes.damping, "vehicle.brakes");
    }
    if (const Val e = member(obj, "electronics")) {
      const std::string path = "vehicle.electronics";
      v.electronics.abs = boolOr(e, "abs", v.electronics.abs, path);
      v.electronics.absSlip = floatOr(e, "absSlip", v.electronics.absSlip, path);
      v.electronics.tcs = boolOr(e, "tcs", v.electronics.tcs, path);
      v.electronics.tcsSlip = floatOr(e, "tcsSlip", v.electronics.tcsSlip, path);
    }
    if (const Val a = member(obj, "aero")) {
      const std::string path = "vehicle.aero";
      v.aero.airDensity = floatOr(a, "airDensity", v.aero.airDensity, path);
      v.aero.dragArea = floatOr(a, "dragArea", v.aero.dragArea, path);
      v.aero.liftAreaFront = floatOr(a, "liftAreaFront", v.aero.liftAreaFront, path);
      v.aero.liftAreaRear = floatOr(a, "liftAreaRear", v.aero.liftAreaRear, path);
      if (const Val f = member(a, "frontNodes")) v.aero.frontNodes = nodeList(f, path + ".frontNodes");
      if (const Val r = member(a, "rearNodes")) v.aero.rearNodes = nodeList(r, path + ".rearNodes");
    }
  }

  std::vector<std::string> wheelAxles;  // pressure wheel id per vehicle wheel (axle nodes resolved after parsing)
  std::unordered_map<std::string, std::pair<int32_t, int32_t>> wheelAxleNodes;
};

}  // namespace

LoadedVehicle loadVehicleJson(std::string_view text, const VehicleSpawn& spawn) {
  yyjson_read_err err{};
  const yyjson_read_flag flags = YYJSON_READ_ALLOW_COMMENTS | YYJSON_READ_ALLOW_TRAILING_COMMAS;
  std::unique_ptr<yyjson_doc, void (*)(yyjson_doc*)> doc(
      yyjson_read_opts(const_cast<char*>(text.data()), text.size(), flags, nullptr, &err), yyjson_doc_free);
  if (!doc) {
    throw std::invalid_argument("vehicle json: parse error at byte " + std::to_string(err.pos) + ": " + err.msg);
  }
  const Val root = yyjson_doc_get_root(doc.get());
  if (!yyjson_is_obj(root)) fail("$", "expected an object");
  if (stringOr(root, "format", "", "$") != "apex-vehicle") fail("format", "expected \"apex-vehicle\"");
  if (numberOr(root, "version", 0.0, "$") != 1.0) fail("version", "unsupported version (expected 1)");

  Loader l;
  l.out.id = stringOr(root, "id", "", "$");
  l.out.name = stringOr(root, "name", l.out.id, "$");
  if (const Val model = member(root, "model")) l.out.modelGlb = stringOr(model, "glb", "", "model");
  l.body().name = l.out.id;
  l.body().hydroChannels = static_cast<int>(numberOr(root, "hydroChannels", 0.0, "$"));
  l.nodes(member(root, "nodes"));
  l.damageGroups(member(root, "damageGroups"));
  l.beams(member(root, "beamGroups"), member(root, "beams"));
  l.sliders(member(root, "sliders"));
  l.torsionBars(member(root, "torsionBars"));
  l.triangles(member(root, "triangles"));

  // Pressure wheels remember their axle nodes for the vehicle's wheel entries.
  if (const Val pw = member(root, "pressureWheels")) {
    size_t i, n;
    Val item;
    yyjson_arr_foreach(pw, i, n, item) {
      const std::string path = "pressureWheels[" + std::to_string(i) + "]";
      l.wheelAxleNodes[string(member(item, "id"), path + ".id")] = {l.node(member(item, "axleRight"), path + ".axleRight"),
                                                                    l.node(member(item, "axleLeft"), path + ".axleLeft")};
    }
  }
  l.pressureWheels(member(root, "pressureWheels"));
  if (member(root, "vehicle")) l.vehicle(member(root, "vehicle"));  // absent: a plain node-beam prop
  for (size_t w = 0; w < l.out.build.vehicle.wheels.size(); ++w) {
    const auto& axle = l.wheelAxleNodes.at(l.wheelAxles[w]);
    l.out.build.vehicle.wheels[w].axleRight = axle.first;
    l.out.build.vehicle.wheels[w].axleLeft = axle.second;
  }
  if (const Val targets = member(root, "targets")) {
    size_t i, n;
    Val key, val;
    yyjson_obj_foreach(targets, i, n, key, val) {
      if (yyjson_is_num(val)) l.out.targets.emplace_back(yyjson_get_str(key), yyjson_get_num(val));
    }
  }
  placeVehicle(l.out.build, spawn);
  return std::move(l.out);
}

}  // namespace sbc

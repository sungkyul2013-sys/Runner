// C ABI implementation over sbc::World (see include/sbc/sbc.h).
#include <cmath>
#include <exception>
#include <limits>
#include <memory>
#include <string>

#include "sbc/builder.h"
#include "sbc/proto_car.h"
#include "sbc/sbc.h"
#include "sbc/scenes.h"
#include "sbc/stability.h"
#include "sbc/vehicle_json.h"
#include "sbc/world.h"

struct sbc_world {
  std::unique_ptr<sbc::World> owned;
  sbc::World& world;
  explicit sbc_world(std::unique_ptr<sbc::World> w) : owned(std::move(w)), world(*owned) {}
};

namespace {

bool validBody(sbc_world* w, int body) { return w && body >= 0 && body < w->world.bodyCount(); }
bool validVehicle(sbc_world* w, int v) { return w && v >= 0 && v < w->world.vehicleCount(); }

thread_local std::string lastError;

template <typename F>
int guarded(F&& f) {
  try {
    lastError.clear();
    return f();
  } catch (const std::exception& e) {
    lastError = e.what();
    return -1;
  }
}

}  // namespace

extern "C" {

sbc_world* sbc_world_create(int thread_count, int track_energy) {
  try {
    sbc::WorldParams p;
    p.threadCount = thread_count < 1 ? 1 : thread_count;
    p.trackEnergy = track_energy != 0;
    return new sbc_world(std::make_unique<sbc::World>(p));
  } catch (const std::exception&) {
    return nullptr;
  }
}

sbc_world* sbc_world_create_scene(const char* name, int thread_count, int track_energy, int bodies) {
  try {
    sbc::SceneOptions o;
    o.threads = thread_count < 1 ? 1 : thread_count;
    o.trackEnergy = track_energy != 0;
    o.bodies = bodies;
    auto w = sbc::makeScene(name ? name : "", o);
    return w ? new sbc_world(std::move(w)) : nullptr;
  } catch (const std::exception&) {
    return nullptr;
  }
}

void sbc_world_destroy(sbc_world* w) { delete w; }

void sbc_world_set_gravity(sbc_world* w, float gx, float gy, float gz) {
  if (w) w->world.setGravity({gx, gy, gz});
}

int sbc_world_set_contact_pair(sbc_world* w, int a, int b, float mus, float muk, float hz, float zeta) {
  return guarded([&] {
    sbc::ContactPairParams p;
    p.staticFriction = mus;
    p.kineticFriction = muk;
    p.normalFrequencyHz = hz;
    p.normalDampingRatio = zeta;
    p.tangentFrequencyHz = hz;
    w->world.setContactPair(static_cast<uint16_t>(a), static_cast<uint16_t>(b), p);
    return 0;
  });
}

int sbc_world_add_ground_plane(sbc_world* w, double height, int material) {
  return guarded([&] { return w->world.addGroundPlane(height, static_cast<uint16_t>(material)); });
}

int sbc_world_add_static_box(sbc_world* w, double cx, double cy, double cz, float hx, float hy, float hz, double yaw,
                             int material) {
  return guarded(
      [&] { return w->world.addStaticBox({cx, cy, cz}, {hx, hy, hz}, yaw, static_cast<uint16_t>(material)); });
}

int sbc_world_static_triangle_count(sbc_world* w) { return w ? w->world.staticTriangleCount() : 0; }

int sbc_world_static_triangles(sbc_world* w, int first, int count, float* out) {
  if (!w || first < 0) return -1;
  int written = 0;
  for (int t = first; t < first + count && t < w->world.staticTriangleCount(); ++t, ++written) {
    const auto tri = w->world.staticTriangleWorld(t);
    for (int k = 0; k < 3; ++k) {
      out[written * 9 + k * 3 + 0] = static_cast<float>(tri[k].x);
      out[written * 9 + k * 3 + 1] = static_cast<float>(tri[k].y);
      out[written * 9 + k * 3 + 2] = static_cast<float>(tri[k].z);
    }
  }
  return written;
}

int sbc_world_spawn_lattice(sbc_world* w, const double* v, int count) {
  if (!w || !v || count < SBC_LATTICE_PARAM_COUNT) return -1;
  return guarded([&] {
    auto f = [](double x) { return static_cast<float>(x); };
    sbc::LatticeParams p;
    p.center = {v[0], v[1], v[2]};
    p.size = {f(v[3]), f(v[4]), f(v[5])};
    p.nx = static_cast<int>(v[6]);
    p.ny = static_cast<int>(v[7]);
    p.nz = static_cast<int>(v[8]);
    p.totalMass = f(v[9]);
    p.nodeRadius = f(v[10]);
    p.axialStiffness = f(v[11]);
    p.dampingRatio = f(v[12]);
    p.yieldStrain = f(v[13]);
    p.hardening = f(v[14]);
    p.breakStrain = f(v[15]);
    p.deformLimit = f(v[16]);
    p.material = static_cast<uint16_t>(v[17]);
    p.velocity = {f(v[18]), f(v[19]), f(v[20])};
    p.yawPitchRoll = {f(v[21]), f(v[22]), f(v[23])};
    return w->world.addBody(sbc::makeLattice(p));
  });
}

int sbc_world_add_body_velocity(sbc_world* w, int body, float dvx, float dvy, float dvz) {
  if (!validBody(w, body)) return -1;
  w->world.addBodyVelocity(body, {dvx, dvy, dvz});
  return 0;
}

void sbc_world_step(sbc_world* w, int steps) {
  if (w && steps > 0) w->world.step(steps);
}

double sbc_world_time(sbc_world* w) { return w ? w->world.time() : 0.0; }
double sbc_world_step_index(sbc_world* w) { return w ? static_cast<double>(w->world.stepIndex()) : 0.0; }
float sbc_world_dt(sbc_world* w) { return w ? w->world.params().dt : 0.0f; }

uint32_t sbc_world_state_hash_hi(sbc_world* w) { return w ? static_cast<uint32_t>(w->world.stateHash() >> 32) : 0u; }
uint32_t sbc_world_state_hash_lo(sbc_world* w) { return w ? static_cast<uint32_t>(w->world.stateHash()) : 0u; }

void sbc_world_last_stats(sbc_world* w, int32_t* out) {
  if (!w || !out) return;
  const auto& s = w->world.lastStepStats();
  out[0] = s.staticContacts;
  out[1] = s.bodyContacts;
  out[2] = s.ccdClamps;
  out[3] = s.beamsBroken;
}

void sbc_world_measure_energy(sbc_world* w, double* out) {
  if (!w || !out) return;
  const auto e = w->world.measureEnergy();
  const double v[SBC_ENERGY_FIELD_COUNT] = {e.kinetic,           e.gravityPotential,       e.beamPotential,
                                            e.contactPotential,  e.losses.beamDamping,     e.losses.contactDamping,
                                            e.losses.friction,   e.losses.plastic,         e.losses.fracture,
                                            e.losses.ccd,        e.losses.external,        e.balance()};
  for (int i = 0; i < SBC_ENERGY_FIELD_COUNT; ++i) out[i] = v[i];
}

void sbc_world_measure_momentum(sbc_world* w, double* out) {
  if (!w || !out) return;
  const auto m = w->world.measureMomentum();
  out[0] = m.linear.x; out[1] = m.linear.y; out[2] = m.linear.z;
  out[3] = m.angular.x; out[4] = m.angular.y; out[5] = m.angular.z;
}

int sbc_world_body_count(sbc_world* w) { return w ? w->world.bodyCount() : 0; }
int sbc_body_node_count(sbc_world* w, int b) { return validBody(w, b) ? w->world.body(b).nodeCount() : 0; }
int sbc_body_beam_count(sbc_world* w, int b) { return validBody(w, b) ? w->world.body(b).beamCount() : 0; }
uint32_t sbc_body_topology_version(sbc_world* w, int b) {
  return validBody(w, b) ? w->world.body(b).topologyVersion : 0u;
}

int sbc_body_damage_group_count(sbc_world* w, int b) {
  return validBody(w, b) ? static_cast<int>(w->world.body(b).damageGroups.size()) : 0;
}

const char* sbc_body_damage_group_id(sbc_world* w, int b, int g) {
  if (!validBody(w, b) || g < 0 || static_cast<size_t>(g) >= w->world.body(b).damageGroups.size()) return "";
  return w->world.body(b).damageGroups[static_cast<size_t>(g)].id.c_str();
}

int sbc_body_damage_groups(sbc_world* w, int b, float* out, int capacity) {
  if (!validBody(w, b) || !out) return 0;
  const auto& groups = w->world.body(b).damageGroups;
  int written = 0;
  for (const sbc::DamageGroupState& g : groups) {
    if (written + 8 > capacity) break;
    out[written++] = static_cast<float>(g.beams);
    out[written++] = static_cast<float>(g.damaged);
    out[written++] = g.firstStep < 0 ? -1.0f : static_cast<float>(static_cast<double>(g.firstStep) * w->world.params().dt);
    out[written++] = static_cast<float>(g.firstNodeA);
    out[written++] = static_cast<float>(g.firstNodeB);
    out[written++] = g.peakStrain;
    out[written++] = static_cast<float>(g.impacts);
    out[written++] = g.peakImpact;
  }
  return written;
}

int sbc_body_source(sbc_world* w, int b) { return validBody(w, b) ? w->world.body(b).sourceBody : -1; }

const int32_t* sbc_body_source_nodes(sbc_world* w, int b) {
  return validBody(w, b) && !w->world.body(b).sourceNode.empty() ? w->world.body(b).sourceNode.data() : nullptr;
}

void sbc_body_origin(sbc_world* w, int b, double* out) {
  if (!validBody(w, b) || !out) return;
  const auto o = w->world.body(b).origin;
  out[0] = o.x; out[1] = o.y; out[2] = o.z;
}

const float* sbc_body_px(sbc_world* w, int b) { return validBody(w, b) ? w->world.body(b).px.data() : nullptr; }
const float* sbc_body_py(sbc_world* w, int b) { return validBody(w, b) ? w->world.body(b).py.data() : nullptr; }
const float* sbc_body_pz(sbc_world* w, int b) { return validBody(w, b) ? w->world.body(b).pz.data() : nullptr; }
const float* sbc_body_radius(sbc_world* w, int b) {
  return validBody(w, b) ? w->world.body(b).radius.data() : nullptr;
}
const int32_t* sbc_body_beam_a(sbc_world* w, int b) {
  return validBody(w, b) ? w->world.body(b).beamA.data() : nullptr;
}
const int32_t* sbc_body_beam_b(sbc_world* w, int b) {
  return validBody(w, b) ? w->world.body(b).beamB.data() : nullptr;
}

void sbc_body_beam_strain(sbc_world* w, int b, float* out) {
  if (!validBody(w, b) || !out) return;
  const sbc::Body& body = w->world.body(b);
  for (int i = 0; i < body.beamCount(); ++i) {
    if (body.broken[i]) {
      out[i] = std::numeric_limits<float>::quiet_NaN();
      continue;
    }
    const float len = sbc::length(body.nodePosition(body.beamB[i]) - body.nodePosition(body.beamA[i]));
    const float rest = body.restLength[i];
    out[i] = rest > 0.0f ? (len - rest) / rest : 0.0f;
  }
}

void sbc_body_check_stability(sbc_world* w, int b, double safety, double* out) {
  if (!validBody(w, b) || !out) return;
  const auto r = sbc::checkStability(w->world.body(b), w->world.params().dt, safety);
  out[0] = r.minCriticalDt;
  out[1] = r.beamViolations;
  out[2] = r.nodeViolations;
}

int sbc_world_spawn_proto_car(sbc_world* w, double x, double y, double z, double yaw, float speed) {
  if (!w) return -1;
  return guarded([&] {
    sbc::ProtoCarOptions o;
    o.position = {x, y, z};
    o.yaw = yaw;
    o.speed = speed;
    const sbc::VehicleBuild car = sbc::makeProtoCar(o);
    const int body = w->world.addBody(car.body);
    return w->world.addVehicle(body, car.vehicle);
  });
}

int sbc_world_spawn_vehicle_json(sbc_world* w, const char* json, int length, double x, double y, double z, double yaw,
                                 float speed) {
  if (!w || !json || length < 0) return -1;
  return guarded([&] {
    const sbc::LoadedVehicle car =
        sbc::loadVehicleJson(std::string_view(json, static_cast<size_t>(length)), {{x, y, z}, yaw, speed});
    const int body = w->world.addBody(car.build.body);
    return car.build.vehicle.wheels.empty() ? -2 : w->world.addVehicle(body, car.build.vehicle);
  });
}

const char* sbc_last_error(void) { return lastError.c_str(); }

int sbc_world_vehicle_count(sbc_world* w) { return w ? w->world.vehicleCount() : 0; }
int sbc_vehicle_body(sbc_world* w, int v) { return validVehicle(w, v) ? w->world.vehicleBody(v) : -1; }
int sbc_vehicle_wheel_count(sbc_world* w, int v) {
  return validVehicle(w, v) ? static_cast<int>(w->world.vehicleDesc(v).wheels.size()) : 0;
}

int sbc_vehicle_set_input(sbc_world* w, int v, float throttle, float brake, float steer, float handbrake, int mode,
                          int shift, int aids) {
  if (!validVehicle(w, v)) return -1;
  sbc::VehicleInput in;
  in.throttle = throttle;
  in.brake = brake;
  in.steer = steer;
  in.handbrake = handbrake;
  in.mode = mode >= 0 && mode <= 3 ? static_cast<sbc::GearMode>(mode) : sbc::GearMode::kDrive;
  in.shiftRequest = static_cast<int8_t>(shift > 0 ? 1 : (shift < 0 ? -1 : 0));
  in.abs = (aids & 1) != 0;
  in.tcs = (aids & 2) != 0;
  w->world.setVehicleInput(v, in);
  return 0;
}

int sbc_vehicle_telemetry(sbc_world* w, int v, float* out, int capacity) {
  if (!validVehicle(w, v) || !out) return -1;
  const sbc::VehicleTelemetry& t = w->world.vehicleTelemetry(v);
  const sbc::VehicleDesc& d = w->world.vehicleDesc(v);
  const int wheels = static_cast<int>(t.wheels.size());
  const int needed = SBC_VT_HEADER + SBC_VT_WHEEL * wheels;
  if (capacity < needed) return -needed;
  for (int i = 0; i < needed; ++i) out[i] = 0.0f;
  auto put3 = [out](int at, sbc::Vec3 v3) { out[at] = v3.x; out[at + 1] = v3.y; out[at + 2] = v3.z; };
  out[0] = static_cast<float>(t.time);
  out[1] = t.speed;
  out[2] = t.engineRpm;
  out[3] = t.engineTorque;
  out[4] = t.clutchTorque;
  out[5] = static_cast<float>(t.gear);
  out[6] = static_cast<float>((t.shifting ? 1 : 0) | (t.engineRunning ? 2 : 0) | (t.tcsActive ? 4 : 0));
  out[7] = t.throttle;
  out[8] = t.brake;
  out[9] = t.steer;
  out[10] = t.clutch;
  out[11] = t.accelLong;
  out[12] = t.accelLat;
  out[13] = t.odometer;
  put3(14, t.position);
  put3(17, t.forward);
  put3(20, t.up);
  put3(23, t.left);
  put3(26, d.refCenterModel);
  out[29] = static_cast<float>(wheels);
  // 30 body index (worker), 31 reserved; §4.4 fluids and engine health:
  out[32] = t.coolantC;
  out[33] = t.coolantL;
  out[34] = t.oilBar;
  out[35] = t.oilL;
  out[36] = t.fuelL;
  out[37] = t.engineWear;
  out[38] = t.derate;
  out[39] = static_cast<float>(t.faults);
  out[40] = static_cast<float>(t.airbags);
  out[41] = t.crashTime;
  out[42] = t.crashPeakG;
  out[43] = t.crashDeltaV;
  for (int i = 0; i < wheels; ++i) {
    const sbc::WheelTelemetry& wt = t.wheels[static_cast<size_t>(i)];
    float* o = out + SBC_VT_HEADER + SBC_VT_WHEEL * i;
    o[0] = wt.spin;
    o[1] = wt.angle;
    o[2] = wt.load;
    o[3] = wt.slipRatio;
    o[4] = wt.slipAngle;
    o[5] = wt.forceX;
    o[6] = wt.forceY;
    o[7] = wt.brakeTorque;
    o[8] = wt.driveTorque;
    o[9] = wt.loadedRadius;
    o[10] = static_cast<float>((wt.contact ? 1 : 0) | (wt.absActive ? 2 : 0));
    o[11] = wt.center.x; o[12] = wt.center.y; o[13] = wt.center.z;
    o[14] = wt.axis.x; o[15] = wt.axis.y; o[16] = wt.axis.z;
    o[17] = d.wheels[static_cast<size_t>(i)].tyre.radius;
  }
  return needed;
}

}  // extern "C"

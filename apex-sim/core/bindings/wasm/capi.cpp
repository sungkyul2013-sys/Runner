// C ABI implementation over sbc::World (see include/sbc/sbc.h).
#include <cmath>
#include <exception>
#include <limits>
#include <memory>

#include "sbc/builder.h"
#include "sbc/sbc.h"
#include "sbc/scenes.h"
#include "sbc/stability.h"
#include "sbc/world.h"

struct sbc_world {
  std::unique_ptr<sbc::World> owned;
  sbc::World& world;
  explicit sbc_world(std::unique_ptr<sbc::World> w) : owned(std::move(w)), world(*owned) {}
};

namespace {

bool validBody(sbc_world* w, int body) { return w && body >= 0 && body < w->world.bodyCount(); }

template <typename F>
int guarded(F&& f) {
  try {
    return f();
  } catch (const std::exception&) {
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

}  // extern "C"

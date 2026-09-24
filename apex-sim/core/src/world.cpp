#include "sbc/world.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <stdexcept>

#include "contact.h"
#include "internal.h"
#include "sbc/det_math.h"
#include "sbc/job_system.h"
#include "vehicle_impl.h"

namespace sbc {
namespace {

// Bodies whose centroid drifts farther than this from their local origin are re-based (A§4.4). A node whose
// motion per step falls below half an ulp of its coordinate freezes with a residual ("phantom") velocity of at most
// ulp(x)/(2·dt); keeping |x| ≲ 4 m + body half-size bounds that below ~0.5 mm/s for car-sized bodies, while at
// 83 m/s a re-base happens only every ~100 steps (a cheap integer shift).
constexpr float kRebaseDistance = 4.0f;  // [m]

size_t pairIndex(uint16_t a, uint16_t b) {
  if (a >= kMaxMaterials || b >= kMaxMaterials) throw std::out_of_range("material id >= kMaxMaterials");
  return static_cast<size_t>(a) * kMaxMaterials + b;
}

// FNV-1a 64-bit (Fowler–Noll–Vo).
struct Fnv1a {
  uint64_t h = 1469598103934665603ull;
  void bytes(const void* data, size_t n) {
    const auto* p = static_cast<const unsigned char*>(data);
    for (size_t i = 0; i < n; ++i) {
      h ^= p[i];
      h *= 1099511628211ull;
    }
  }
  template <typename T>
  void value(const T& v) { bytes(&v, sizeof(T)); }
  template <typename T>
  void vec(const std::vector<T>& v) { if (!v.empty()) bytes(v.data(), v.size() * sizeof(T)); }
};

double kineticEnergy(const Body& b) {
  double e = 0.0;
  for (int i = 0; i < b.nodeCount(); ++i) {
    if (b.invMass[i] == 0.0f) continue;
    const double v2 = static_cast<double>(b.vx[i]) * b.vx[i] + static_cast<double>(b.vy[i]) * b.vy[i] +
                      static_cast<double>(b.vz[i]) * b.vz[i];
    e += 0.5 * b.mass[i] * v2;
  }
  return e;
}

double gravityPotential(const Body& b, Vec3 g) {
  double e = 0.0;
  const DVec3 gd = toDouble(g);
  for (int i = 0; i < b.nodeCount(); ++i) {
    if (b.invMass[i] == 0.0f) continue;
    e -= b.mass[i] * dot(gd, b.nodeWorldPosition(i));
  }
  return e;
}

}  // namespace

World::World(const WorldParams& params)
    : params_(params),
      jobs_(std::make_unique<JobSystem>(std::max(1, params.threadCount))),
      pairTable_(static_cast<size_t>(kMaxMaterials) * kMaxMaterials) {
  if (!(params_.dt > 0.0f)) throw std::invalid_argument("WorldParams::dt must be > 0");
}

World::~World() = default;

void World::setContactPair(uint16_t a, uint16_t b, const ContactPairParams& p) {
  pairTable_[pairIndex(a, b)] = p;
  pairTable_[pairIndex(b, a)] = p;
}

const ContactPairParams& World::contactPair(uint16_t a, uint16_t b) const { return pairTable_[pairIndex(a, b)]; }

int World::addGroundPlane(double height, uint16_t material) {
  pairIndex(material, material);  // validates the id
  planes_.push_back({height, material});
  return kPlaneIdBase + static_cast<int>(planes_.size()) - 1;
}

int World::addStaticMesh(DVec3 origin, const std::vector<float>& vertices, const std::vector<int32_t>& indices,
                         uint16_t material) {
  pairIndex(material, material);
  if (vertices.size() % 3 != 0 || indices.size() % 3 != 0) throw std::invalid_argument("addStaticMesh: bad array sizes");
  const int vertexCount = static_cast<int>(vertices.size() / 3);
  const int first = static_cast<int>(staticTris_.size());
  for (size_t t = 0; t < indices.size(); t += 3) {
    Vec3 v[3];
    for (int k = 0; k < 3; ++k) {
      const int idx = indices[t + static_cast<size_t>(k)];
      if (idx < 0 || idx >= vertexCount) throw std::invalid_argument("addStaticMesh: index out of range");
      v[k] = {vertices[static_cast<size_t>(idx) * 3], vertices[static_cast<size_t>(idx) * 3 + 1],
              vertices[static_cast<size_t>(idx) * 3 + 2]};
    }
    const Vec3 n = cross(v[1] - v[0], v[2] - v[0]);
    const float len = length(n);
    if (!(len > 1e-12f)) continue;  // skip degenerate triangles
    StaticTri tri;
    tri.origin = origin;
    tri.v0 = v[0]; tri.v1 = v[1]; tri.v2 = v[2];
    tri.normal = n * (1.0f / len);
    tri.boundsMin = {std::min({v[0].x, v[1].x, v[2].x}), std::min({v[0].y, v[1].y, v[2].y}),
                     std::min({v[0].z, v[1].z, v[2].z})};
    tri.boundsMax = {std::max({v[0].x, v[1].x, v[2].x}), std::max({v[0].y, v[1].y, v[2].y}),
                     std::max({v[0].z, v[1].z, v[2].z})};
    tri.material = material;
    staticTris_.push_back(tri);
  }
  return first;
}

int World::addStaticBox(DVec3 center, Vec3 half, double yaw, uint16_t material) {
  const double c = det::cos(yaw), s = det::sin(yaw);
  std::vector<float> verts;
  verts.reserve(24);
  for (int i = 0; i < 8; ++i) {
    const double lx = (i & 1) ? half.x : -half.x;
    const double ly = (i & 2) ? half.y : -half.y;
    const double lz = (i & 4) ? half.z : -half.z;
    // rotation about +Y: x' = c·x + s·z, z' = −s·x + c·z
    verts.push_back(static_cast<float>(c * lx + s * lz));
    verts.push_back(static_cast<float>(ly));
    verts.push_back(static_cast<float>(-s * lx + c * lz));
  }
  // Outward-facing, counter-clockwise faces (corner bit 0 = +x, bit 1 = +y, bit 2 = +z).
  const std::vector<int32_t> idx = {
      0, 4, 6, 0, 6, 2,  // −x
      1, 3, 7, 1, 7, 5,  // +x
      0, 1, 5, 0, 5, 4,  // −y
      2, 6, 7, 2, 7, 3,  // +y
      0, 2, 3, 0, 3, 1,  // −z
      4, 5, 7, 4, 7, 6,  // +z
  };
  return addStaticMesh(center, verts, idx, material);
}

std::array<DVec3, 3> World::staticTriangleWorld(int t) const {
  const StaticTri& tri = staticTris_.at(static_cast<size_t>(t));
  return {tri.origin + toDouble(tri.v0), tri.origin + toDouble(tri.v1), tri.origin + toDouble(tri.v2)};
}

int World::addBody(const BodyDesc& desc) {
  Body b = buildBody(desc);
  for (int i = 0; i < b.nodeCount(); ++i) pairIndex(b.material[i], b.material[i]);
  // A body entering the world brings mechanical energy with it (motion, height, pre-stress, and penalty
  // energy if it spawns overlapping something): book it as external work so the energy balance (§5.3)
  // stays zero-based.
  const double contactBefore = ContactSolver::contactPotential(*this);
  const double own = kineticEnergy(b) + gravityPotential(b, params_.gravity) + detail::beamPotentialEnergy(b) +
                     detail::constraintPotentialEnergy(b);
  bodies_.push_back(std::move(b));
  bodyStats_.emplace_back();
  scratch_.emplace_back();
  bodyVehicles_.emplace_back();
  bodies_.back().losses.external += own + ContactSolver::contactPotential(*this) - contactBefore;
  return static_cast<int>(bodies_.size()) - 1;
}

void World::addBodyVelocity(int bodyIndex, Vec3 dv) {
  Body& b = bodies_.at(static_cast<size_t>(bodyIndex));
  const double before = kineticEnergy(b);
  for (int i = 0; i < b.nodeCount(); ++i) {
    if (b.invMass[i] == 0.0f) continue;
    b.vx[i] += dv.x; b.vy[i] += dv.y; b.vz[i] += dv.z;
  }
  b.losses.external += kineticEnergy(b) - before;
}

int World::addVehicle(int body, const VehicleDesc& desc) {
  if (body < 0 || body >= bodyCount()) throw std::out_of_range("addVehicle: body index");
  vehicles_.push_back(std::make_unique<Vehicle>(desc, body, bodies_[static_cast<size_t>(body)]));
  const int id = static_cast<int>(vehicles_.size()) - 1;
  bodyVehicles_[static_cast<size_t>(body)].push_back(id);
  return id;
}

int World::vehicleBody(int v) const { return vehicles_.at(static_cast<size_t>(v))->bodyIndex(); }
const VehicleDesc& World::vehicleDesc(int v) const { return vehicles_.at(static_cast<size_t>(v))->desc(); }
const VehicleInput& World::vehicleInput(int v) const { return vehicles_.at(static_cast<size_t>(v))->input(); }
const VehicleTelemetry& World::vehicleTelemetry(int v) const {
  return vehicles_.at(static_cast<size_t>(v))->telemetry();
}

void World::setVehicleInput(int v, const VehicleInput& in) {
  VehicleInput& dst = vehicles_.at(static_cast<size_t>(v))->input();
  auto finite = [](float x, float lo, float hi) { return std::isfinite(x) ? std::min(std::max(x, lo), hi) : 0.0f; };
  dst.throttle = finite(in.throttle, 0.0f, 1.0f);
  dst.brake = finite(in.brake, 0.0f, 1.0f);
  dst.steer = finite(in.steer, -1.0f, 1.0f);
  dst.handbrake = finite(in.handbrake, 0.0f, 1.0f);
  dst.mode = in.mode;
  dst.abs = in.abs;
  dst.tcs = in.tcs;
  if (in.shiftRequest != 0) dst.shiftRequest = in.shiftRequest > 0 ? 1 : -1;
}

void World::step(int count) {
  for (int i = 0; i < count; ++i) stepOnce();
}

void World::stepOnce() {
  const int n = bodyCount();
  jobs_->parallelFor(n, [this](int i) { computeInternalForces(i); });
  stats_ = {};
  if (n > 1) {
    stats_.bodyContacts = params_.trackEnergy ? ContactSolver::bodyContacts<true>(*this)
                                              : ContactSolver::bodyContacts<false>(*this);
  }
  jobs_->parallelFor(n, [this](int i) {
    integrateBody(i);
    finishBody(i);
  });
  for (const StepStats& s : bodyStats_) {  // serial reduction in body order
    stats_.staticContacts += s.staticContacts;
    stats_.ccdClamps += s.ccdClamps;
    stats_.beamsBroken += s.beamsBroken;
  }
  ++stepIndex_;
}

void World::computeInternalForces(int bi) {
  Body& b = bodies_[bi];
  StepStats& st = bodyStats_[bi];
  st = {};
  const Vec3 g = params_.gravity;
  const int n = b.nodeCount();
  for (int i = 0; i < n; ++i) {
    const float m = b.invMass[i] == 0.0f ? 0.0f : b.mass[i];
    b.fx[i] = m * g.x;
    b.fy[i] = m * g.y;
    b.fz[i] = m * g.z;
  }
  if (params_.trackEnergy) {
    for (auto* a : {&b.fdBeamX, &b.fdBeamY, &b.fdBeamZ, &b.fdContactX, &b.fdContactY, &b.fdContactZ, &b.fdFrictionX,
                    &b.fdFrictionY, &b.fdFrictionZ, &b.fdExternalX, &b.fdExternalY, &b.fdExternalZ}) {
      std::fill(a->begin(), a->end(), 0.0f);
    }
    detail::updateHydros(b, params_.dt);
    st.beamsBroken = detail::accumulateBeamForces<true>(b);
    detail::accumulateConstraintForces<true>(b);
    st.staticContacts = ContactSolver::staticContacts<true>(*this, bi);
    for (const int v : bodyVehicles_[static_cast<size_t>(bi)]) vehicles_[static_cast<size_t>(v)]->step(*this, b, true);
  } else {
    detail::updateHydros(b, params_.dt);
    st.beamsBroken = detail::accumulateBeamForces<false>(b);
    detail::accumulateConstraintForces<false>(b);
    st.staticContacts = ContactSolver::staticContacts<false>(*this, bi);
    for (const int v : bodyVehicles_[static_cast<size_t>(bi)]) vehicles_[static_cast<size_t>(v)]->step(*this, b, false);
  }
}

void World::integrateBody(int bi) {
  Body& b = bodies_[bi];
  const float dt = params_.dt;
  const int n = b.nodeCount();
  if (params_.trackEnergy) {
    // Work of dissipative forces over the step, W = F·v_mid·dt with v_mid = v_n + ½a·dt, which matches the
    // kinetic-energy change of symplectic Euler exactly (ΔKE = F·v_mid·dt).
    double wBeam = 0.0, wContact = 0.0, wFriction = 0.0, wExternal = 0.0;
    for (int i = 0; i < n; ++i) {
      const float im = b.invMass[i];
      if (im == 0.0f) continue;
      const double mx = b.vx[i] + 0.5f * b.fx[i] * im * dt;
      const double my = b.vy[i] + 0.5f * b.fy[i] * im * dt;
      const double mz = b.vz[i] + 0.5f * b.fz[i] * im * dt;
      wBeam += b.fdBeamX[i] * mx + b.fdBeamY[i] * my + b.fdBeamZ[i] * mz;
      wContact += b.fdContactX[i] * mx + b.fdContactY[i] * my + b.fdContactZ[i] * mz;
      wFriction += b.fdFrictionX[i] * mx + b.fdFrictionY[i] * my + b.fdFrictionZ[i] * mz;
      wExternal += b.fdExternalX[i] * mx + b.fdExternalY[i] * my + b.fdExternalZ[i] * mz;
    }
    b.losses.beamDamping -= wBeam * dt;
    b.losses.contactDamping -= wContact * dt;
    b.losses.friction -= wFriction * dt;
    b.losses.external += wExternal * dt;
  }
  // Symplectic (semi-implicit) Euler, §4.2: v ← v + (F/m)·dt, then x ← x + v·dt.
  for (int i = 0; i < n; ++i) {
    const float im = b.invMass[i];
    if (im == 0.0f) {
      b.vx[i] = 0.0f; b.vy[i] = 0.0f; b.vz[i] = 0.0f;
      continue;
    }
    b.vx[i] += b.fx[i] * im * dt;
    b.vy[i] += b.fy[i] * im * dt;
    b.vz[i] += b.fz[i] * im * dt;
    b.px[i] += b.vx[i] * dt;
    b.py[i] += b.vy[i] * dt;
    b.pz[i] += b.vz[i] * dt;
  }
  bodyStats_[bi].ccdClamps = ContactSolver::ccdStatic(*this, bi);
}

void World::finishBody(int bi) {
  Body& b = bodies_[bi];
  bodyStats_[bi].beamsBroken += detail::applyPendingBreakGroups(b);

  // Deterministic re-basing of the local frame by whole metres (A§4.4).
  double cx = 0.0, cy = 0.0, cz = 0.0;
  const int n = b.nodeCount();
  for (int i = 0; i < n; ++i) { cx += b.px[i]; cy += b.py[i]; cz += b.pz[i]; }
  cx /= n; cy /= n; cz /= n;
  if (std::fabs(cx) > kRebaseDistance || std::fabs(cy) > kRebaseDistance || std::fabs(cz) > kRebaseDistance) {
    const float sx = static_cast<float>(std::floor(cx)), sy = static_cast<float>(std::floor(cy)),
                sz = static_cast<float>(std::floor(cz));
    for (int i = 0; i < n; ++i) {
      b.px[i] -= sx; b.py[i] -= sy; b.pz[i] -= sz;
    }
    b.origin += DVec3{sx, sy, sz};
  }
}

EnergyReport World::measureEnergy() const {
  EnergyReport r;
  for (const Body& b : bodies_) {
    r.kinetic += kineticEnergy(b);
    r.gravityPotential += gravityPotential(b, params_.gravity);
    r.beamPotential += detail::beamPotentialEnergy(b) + detail::constraintPotentialEnergy(b);
    r.losses.beamDamping += b.losses.beamDamping;
    r.losses.contactDamping += b.losses.contactDamping;
    r.losses.friction += b.losses.friction;
    r.losses.plastic += b.losses.plastic;
    r.losses.fracture += b.losses.fracture;
    r.losses.ccd += b.losses.ccd;
    r.losses.external += b.losses.external;
  }
  r.contactPotential = ContactSolver::contactPotential(*this);
  return r;
}

MomentumReport World::measureMomentum() const {
  MomentumReport r;
  for (const Body& b : bodies_) {
    for (int i = 0; i < b.nodeCount(); ++i) {
      if (b.invMass[i] == 0.0f) continue;
      const DVec3 p = toDouble(b.nodeVelocity(i)) * b.mass[i];
      r.linear += p;
      r.angular += cross(b.nodeWorldPosition(i), p);
    }
  }
  return r;
}

uint64_t World::stateHash() const {
  Fnv1a h;
  h.value(stepIndex_);
  for (const Body& b : bodies_) {
    h.value(b.origin.x); h.value(b.origin.y); h.value(b.origin.z);
    h.vec(b.px); h.vec(b.py); h.vec(b.pz);
    h.vec(b.vx); h.vec(b.vy); h.vec(b.vz);
    h.vec(b.stickX); h.vec(b.stickY); h.vec(b.stickZ); h.vec(b.anchorContact);
    h.vec(b.restLength); h.vec(b.plasticDeformation); h.vec(b.broken); h.vec(b.torsionBroken);
    h.vec(b.hydroInputs);
  }
  for (const auto& v : vehicles_) v->hashState(h);
  return h.h;
}

}  // namespace sbc

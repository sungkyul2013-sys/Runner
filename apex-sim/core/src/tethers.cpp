// §20 sandbox tools: tethers (node grab, crane / winch, tow rope). A tether is an outside agent — a hand, a crane, a
// winch drum — so the work of its force is booked as external (§5.3 ledger), like the vehicle's actuators.
#include <algorithm>
#include <cmath>
#include <stdexcept>

#include "sbc/world.h"

namespace sbc {

namespace {

// Spring rate the tethered node takes on top of its beams and contacts: k·dt²/m = 0.05 (ω·dt ≈ 0.22, well inside the
// explicit limit of 2 and small beside the contact budget), critically damped.
constexpr double kStiffnessPerMass = 0.05;

DVec3 nodeWorld(const Body& b, int i) {
  const size_t k = static_cast<size_t>(i);
  return b.origin + DVec3{b.px[k], b.py[k], b.pz[k]};
}

DVec3 nodeVelocity(const Body& b, int i) {
  const size_t k = static_cast<size_t>(i);
  return {b.vx[k], b.vy[k], b.vz[k]};
}

bool validNode(const std::vector<Body>& bodies, int body, int node) {
  return body >= 0 && body < static_cast<int>(bodies.size()) && node >= 0 &&
         node < bodies[static_cast<size_t>(body)].nodeCount() &&
         bodies[static_cast<size_t>(body)].invMass[static_cast<size_t>(node)] > 0.0f &&
         !(bodies[static_cast<size_t>(body)].flags[static_cast<size_t>(node)] & node_flag::kDetached);
}

}  // namespace

int World::addTether(const TetherDesc& d) {
  if (!validNode(bodies_, d.body, d.node)) throw std::invalid_argument("addTether: not a free node of a body");
  if (d.anchorBody >= 0 && !validNode(bodies_, d.anchorBody, d.anchorNode)) {
    throw std::invalid_argument("addTether: the anchor is not a free node of a body");
  }
  if (d.anchorBody == d.body && d.anchorNode == d.node) throw std::invalid_argument("addTether: node tied to itself");
  Tether t;
  t.desc = d;
  t.desc.length = std::max(d.length, 0.0f);
  if (d.maxForce < 0.0f) {
    const Body& b = bodies_[static_cast<size_t>(d.body)];
    double mass = 0.0;
    for (int i = 0; i < b.nodeCount(); ++i) {
      if (b.invMass[static_cast<size_t>(i)] > 0.0f) mass += b.mass[static_cast<size_t>(i)];
    }
    const Vec3 g = params_.gravity;
    t.desc.maxForce = static_cast<float>(-d.maxForce * mass * std::max(static_cast<double>(length(g)), 1.0));
  }
  t.length = t.targetLength = t.desc.length;
  const double dt = params_.dt;
  double m = bodies_[static_cast<size_t>(d.body)].mass[static_cast<size_t>(d.node)];
  if (d.anchorBody >= 0) m = std::min(m, static_cast<double>(bodies_[static_cast<size_t>(d.anchorBody)].mass[static_cast<size_t>(d.anchorNode)]));
  const double kMax = kStiffnessPerMass * m / (dt * dt);
  t.stiffness = d.stiffness > 0.0f ? std::min(static_cast<double>(d.stiffness), kMax) : kMax;
  t.damping = 2.0 * std::max(d.dampingRatio, 0.0f) * std::sqrt(t.stiffness * m);
  t.active = true;
  tethers_.push_back(t);
  return static_cast<int>(tethers_.size()) - 1;
}

void World::setTetherAnchor(int id, DVec3 p) {
  Tether& t = tethers_.at(static_cast<size_t>(id));
  if (t.desc.anchorBody < 0) t.desc.anchor = p;
}

void World::setTetherTargetLength(int id, float length) {
  tethers_.at(static_cast<size_t>(id)).targetLength = std::max(length, 0.0f);
}

void World::removeTether(int id) { tethers_.at(static_cast<size_t>(id)).active = false; }

TetherState World::tether(int id) const {
  const Tether& t = tethers_.at(static_cast<size_t>(id));
  TetherState s;
  s.active = t.active;
  s.body = t.desc.body;
  s.node = t.desc.node;
  s.length = static_cast<float>(t.length);
  s.targetLength = static_cast<float>(t.targetLength);
  s.tension = static_cast<float>(t.tension);
  if (t.active) {
    s.nodePosition = nodeWorld(bodies_[static_cast<size_t>(t.desc.body)], t.desc.node);
    s.anchorPosition = t.desc.anchorBody >= 0 ? nodeWorld(bodies_[static_cast<size_t>(t.desc.anchorBody)], t.desc.anchorNode)
                                              : t.desc.anchor;
  }
  return s;
}

// Serial, tether order (deterministic): a tether may join two bodies, whose forces are otherwise summed in parallel.
void World::applyTethers() {
  const double dt = params_.dt;
  for (Tether& t : tethers_) {
    if (!t.active) continue;
    Body& b = bodies_[static_cast<size_t>(t.desc.body)];
    Body* other = t.desc.anchorBody >= 0 ? &bodies_[static_cast<size_t>(t.desc.anchorBody)] : nullptr;
    const DVec3 p = nodeWorld(b, t.desc.node);
    const DVec3 a = other ? nodeWorld(*other, t.desc.anchorNode) : t.desc.anchor;
    const DVec3 relV = nodeVelocity(b, t.desc.node) - (other ? nodeVelocity(*other, t.desc.anchorNode) : DVec3{});
    const DVec3 d = a - p;
    const double dist = std::sqrt(dot(d, d));
    // Winch: reel toward the target length; above its capacity the drum slips and pays out so that the tension stays
    // at the capacity (a grab has no drum: its length stays 0).
    if (t.desc.rope) {
      const double speed = std::max(t.desc.reelSpeed, 0.0f) * dt;
      if (t.targetLength < t.length) {
        if (t.desc.maxForce <= 0.0f || t.tension < t.desc.maxForce) t.length = std::max(t.targetLength, t.length - speed);
      } else {
        t.length = std::min(t.targetLength, t.length + speed);
      }
      if (t.desc.maxForce > 0.0f) t.length = std::max(t.length, dist - t.desc.maxForce / t.stiffness);
    }
    DVec3 f{};
    t.tension = 0.0;
    if (dist > 1e-9) {
      const DVec3 u = d * (1.0 / dist);
      const double stretch = dist - t.length;
      if (!t.desc.rope || stretch > 0.0) {
        if (t.desc.rope) {
          // Along the rope only: spring plus damper, never pushing.
          t.tension = std::max(0.0, t.stiffness * stretch - t.damping * dot(relV, u));
          if (t.desc.maxForce > 0.0f) t.tension = std::min(t.tension, static_cast<double>(t.desc.maxForce));
          f = u * t.tension;
        } else {
          // Grab: a spring to the hand in every direction whose pull saturates at the grip's strength, and a damper
          // that is not capped (a capped damper leaves a load bouncing about the hand).
          DVec3 spring = d * t.stiffness;
          const double pull = t.stiffness * dist;
          if (t.desc.maxForce > 0.0f && pull > t.desc.maxForce) spring = spring * (t.desc.maxForce / pull);
          f = spring - relV * t.damping;
          t.tension = std::sqrt(dot(f, f));
        }
      }
    } else if (!t.desc.rope) {
      f = relV * -t.damping;
      t.tension = std::sqrt(dot(f, f));
    }
    auto push = [this](Body& body, int node, DVec3 force) {
      const size_t k = static_cast<size_t>(node);
      const Vec3 v = toFloat(force);
      body.fx[k] += v.x;
      body.fy[k] += v.y;
      body.fz[k] += v.z;
      if (params_.trackEnergy) {
        body.fdExternalX[k] += v.x;
        body.fdExternalY[k] += v.y;
        body.fdExternalZ[k] += v.z;
      }
    };
    push(b, t.desc.node, f);
    if (other) push(*other, t.desc.anchorNode, f * -1.0);
  }
}

// After an island split: a tether whose node left for a new part follows it there (parts are appended in body
// order after `firstPart`; each knows its source body and, per node, the node index it had there).
void World::rebindTethers(int firstPart) {
  auto follow = [&](int& body, int& node) {
    for (int guard = 0; guard < 64; ++guard) {
      const Body& b = bodies_[static_cast<size_t>(body)];
      if (!(b.flags[static_cast<size_t>(node)] & node_flag::kDetached)) return true;
      bool moved = false;
      for (int p = firstPart; p < bodyCount() && !moved; ++p) {
        const Body& part = bodies_[static_cast<size_t>(p)];
        if (part.sourceBody != body) continue;
        const auto it = std::find(part.sourceNode.begin(), part.sourceNode.end(), node);
        if (it == part.sourceNode.end()) continue;
        body = p;
        node = static_cast<int>(it - part.sourceNode.begin());
        moved = true;
      }
      if (!moved) return false;
    }
    return false;
  };
  for (Tether& t : tethers_) {
    if (!t.active) continue;
    if (!follow(t.desc.body, t.desc.node)) t.active = false;
    if (t.active && t.desc.anchorBody >= 0 && !follow(t.desc.anchorBody, t.desc.anchorNode)) t.active = false;
    if (t.active && t.desc.anchorBody == t.desc.body && t.desc.anchorNode == t.desc.node) t.active = false;
  }
}

}  // namespace sbc

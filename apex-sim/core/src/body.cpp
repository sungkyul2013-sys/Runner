#include "sbc/body.h"

#include <algorithm>
#include <cmath>
#include <numeric>
#include <stdexcept>
#include <string>

namespace sbc {
namespace {

constexpr float kMinBeamLength = 1e-4f;  // [m] shorter rest lengths are rejected (degenerate)

void require(bool ok, const std::string& what) {
  if (!ok) throw std::invalid_argument("buildBody: " + what);
}

}  // namespace

Body buildBody(const BodyDesc& desc) {
  Body b;
  b.name = desc.name;
  b.origin = desc.origin;

  const size_t n = desc.nodes.size();
  require(n > 0, "body has no nodes");
  auto resizeNodes = [n](auto&... arrays) { (arrays.assign(n, {}), ...); };
  resizeNodes(b.px, b.py, b.pz, b.vx, b.vy, b.vz, b.fx, b.fy, b.fz, b.mass, b.invMass, b.radius, b.material,
              b.flags, b.fdBeamX, b.fdBeamY, b.fdBeamZ, b.fdContactX, b.fdContactY, b.fdContactZ, b.fdFrictionX,
              b.fdFrictionY, b.fdFrictionZ, b.stickX, b.stickY, b.stickZ);
  b.anchorContact.assign(n, -1);

  for (size_t i = 0; i < n; ++i) {
    const NodeDesc& d = desc.nodes[i];
    const bool fixed = (d.flags & node_flag::kFixed) != 0;
    require(fixed || (d.mass > 0.0f && std::isfinite(d.mass)), "node " + std::to_string(i) + " needs mass > 0");
    require(d.radius >= 0.0f, "node " + std::to_string(i) + " has negative radius");
    b.px[i] = d.position.x; b.py[i] = d.position.y; b.pz[i] = d.position.z;
    b.vx[i] = fixed ? 0.0f : d.velocity.x;
    b.vy[i] = fixed ? 0.0f : d.velocity.y;
    b.vz[i] = fixed ? 0.0f : d.velocity.z;
    b.mass[i] = d.mass;
    b.invMass[i] = fixed ? 0.0f : 1.0f / d.mass;
    b.radius[i] = d.radius;
    b.material[i] = d.material;
    b.flags[i] = d.flags;
  }

  // Sort beams by type (stable → deterministic order inside each type).
  std::vector<size_t> order(desc.beams.size());
  std::iota(order.begin(), order.end(), size_t{0});
  std::stable_sort(order.begin(), order.end(), [&](size_t l, size_t r) {
    return static_cast<int>(desc.beams[l].type) < static_cast<int>(desc.beams[r].type);
  });

  const size_t m = desc.beams.size();
  auto resizeBeams = [m](auto&... arrays) { (arrays.assign(m, {}), ...); };
  resizeBeams(b.beamA, b.beamB, b.beamType, b.stiffness, b.damping, b.restLength, b.initialRestLength,
              b.plasticForce, b.hardening, b.breakForce, b.deformLimit, b.plasticDeformation, b.minLength,
              b.maxLength, b.breakGroup, b.broken);

  b.typeBegin.fill(0);
  for (size_t k = 0; k < m; ++k) {
    const BeamDesc& d = desc.beams[order[k]];
    const std::string tag = "beam " + std::to_string(order[k]);
    require(d.a >= 0 && d.b >= 0 && static_cast<size_t>(d.a) < n && static_cast<size_t>(d.b) < n && d.a != d.b,
            tag + " has invalid node indices");
    require(d.stiffness >= 0.0f && d.damping >= 0.0f, tag + " has negative stiffness/damping");
    require(d.hardening >= 0.0f && d.hardening < 1.0f, tag + " hardening must be in [0, 1)");
    const Vec3 pa = desc.nodes[d.a].position, pb = desc.nodes[d.b].position;
    const float initialLength = length(pb - pa);
    const float rest = d.restLength > 0.0f ? d.restLength : initialLength;
    if (d.type != BeamType::kBounded) require(rest >= kMinBeamLength, tag + " has (near) zero rest length");
    if (d.type == BeamType::kBounded) require(d.maxLength >= d.minLength, tag + " maxLength < minLength");

    b.beamA[k] = d.a;
    b.beamB[k] = d.b;
    b.beamType[k] = static_cast<uint8_t>(d.type);
    b.stiffness[k] = d.stiffness;
    b.damping[k] = d.damping;
    b.restLength[k] = rest;
    b.initialRestLength[k] = rest;
    b.plasticForce[k] = d.plasticForce;
    b.hardening[k] = d.hardening;
    b.breakForce[k] = d.breakForce;
    b.deformLimit[k] = d.deformLimit;
    b.minLength[k] = d.minLength;
    b.maxLength[k] = d.maxLength;
    b.breakGroup[k] = d.breakGroup;
    b.typeBegin[static_cast<int>(d.type) + 1]++;
  }
  for (int t = 0; t < kBeamTypeCount; ++t) b.typeBegin[t + 1] += b.typeBegin[t];
  return b;
}

}  // namespace sbc

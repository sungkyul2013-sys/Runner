#include "sbc/body.h"

#include "internal.h"

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

namespace detail {

void buildSurfaceTopology(Body& b) {
  const size_t n = static_cast<size_t>(b.nodeCount());
  b.nodeGroup.assign(n, -1);
  b.nodeSurface.assign(n, 0.0f);
  b.edgeNode.clear();
  b.edgeTri.clear();
  b.groupNodes.clear();
  b.groupTris.clear();
  std::vector<std::pair<uint64_t, int32_t>> halfEdges;  // (min·2³² + max, triangle)
  for (int t = 0; t < b.triangleCount(); ++t) {
    const int32_t* v = &b.triNode[static_cast<size_t>(t) * 3];
    const int16_t group = b.triGroup[static_cast<size_t>(t)];
    for (int k = 0; k < 3; ++k) {
      if (!b.triTorn[static_cast<size_t>(t)]) b.nodeSurface[static_cast<size_t>(v[k])] += 1.0f;
      if (b.nodeGroup[static_cast<size_t>(v[k])] < 0) b.nodeGroup[static_cast<size_t>(v[k])] = group;
    }
    for (int k = 0; k < 3; ++k) {
      const int32_t u = v[k], w = v[(k + 1) % 3];
      const uint64_t key = (static_cast<uint64_t>(std::min(u, w)) << 32) | static_cast<uint32_t>(std::max(u, w));
      halfEdges.push_back({key, t});
    }
  }
  int16_t groups = 0;
  for (const int16_t g : b.triGroup) groups = std::max<int16_t>(groups, static_cast<int16_t>(g + 1));
  b.groupNodeBegin.assign(static_cast<size_t>(groups) + 1, 0);
  b.groupTriBegin2.assign(static_cast<size_t>(groups) + 1, 0);
  for (int16_t g = 0; g < groups; ++g) {
    for (size_t i = 0; i < n; ++i)
      if (b.nodeGroup[i] == g) b.groupNodes.push_back(static_cast<int32_t>(i));
    for (size_t t = 0; t < b.triGroup.size(); ++t)
      if (b.triGroup[t] == g) b.groupTris.push_back(static_cast<int32_t>(t));
    b.groupNodeBegin[static_cast<size_t>(g) + 1] = static_cast<int32_t>(b.groupNodes.size());
    b.groupTriBegin2[static_cast<size_t>(g) + 1] = static_cast<int32_t>(b.groupTris.size());
  }
  std::sort(halfEdges.begin(), halfEdges.end());
  for (size_t i = 0; i < halfEdges.size();) {
    size_t j = i;
    while (j < halfEdges.size() && halfEdges[j].first == halfEdges[i].first) ++j;
    b.edgeNode.push_back(static_cast<int32_t>(halfEdges[i].first >> 32));
    b.edgeNode.push_back(static_cast<int32_t>(halfEdges[i].first & 0xffffffffu));
    b.edgeTri.push_back(halfEdges[i].second);
    b.edgeTri.push_back(j - i > 1 ? halfEdges[i + 1].second : -1);
    i = j;
  }
}

}  // namespace detail

Body buildBody(const BodyDesc& desc) {
  Body b;
  b.name = desc.name;
  b.origin = desc.origin;

  const size_t n = desc.nodes.size();
  require(n > 0, "body has no nodes");
  auto resizeNodes = [n](auto&... arrays) { (arrays.assign(n, {}), ...); };
  resizeNodes(b.px, b.py, b.pz, b.vx, b.vy, b.vz, b.fx, b.fy, b.fz, b.sx, b.sy, b.sz, b.mass, b.invMass, b.radius, b.material,
              b.flags, b.fdBeamX, b.fdBeamY, b.fdBeamZ, b.fdContactX, b.fdContactY, b.fdContactZ, b.fdFrictionX,
              b.fdFrictionY, b.fdFrictionZ, b.fdExternalX, b.fdExternalY, b.fdExternalZ, b.stickX, b.stickY, b.stickZ,
              b.patchForce, b.patchNx, b.patchNy, b.patchNz, b.patchMaterial);
  b.anchorContact.assign(n, -1);

  for (size_t i = 0; i < n; ++i) {
    const NodeDesc& d = desc.nodes[i];
    const bool fixed = (d.flags & node_flag::kFixed) != 0;
    require(fixed || (d.mass > 0.0f && std::isfinite(d.mass)), "node " + std::to_string(i) + " needs mass > 0");
    require(d.radius >= 0.0f, "node " + std::to_string(i) + " has negative radius");
    b.px[i] = d.position.x; b.py[i] = d.position.y; b.pz[i] = d.position.z;
    b.sx[i] = d.position.x; b.sy[i] = d.position.y; b.sz[i] = d.position.z;
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
              b.plasticForce, b.hardening, b.breakForce, b.deformLimit, b.crushFloor, b.tearLength, b.plasticDeformation, b.minLength,
              b.maxLength, b.breakGroup, b.broken, b.compressionStiffness, b.hydroChannel, b.hydroFactor,
              b.hydroSpeed);
  require(desc.hydroChannels >= 0, "negative hydroChannels");
  b.hydroInputs.assign(static_cast<size_t>(desc.hydroChannels), 0.0f);

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
    require(d.crushLimit > 0.0f && d.crushLimit <= 1.0f, tag + " crushLimit must be in (0, 1]");
    require(d.tearLimit > 0.0f, tag + " tearLimit must be > 0");
    b.crushFloor[k] = (1.0f - d.crushLimit) * rest;
    b.tearLength[k] = std::isfinite(d.tearLimit) ? (1.0f + d.tearLimit) * rest : kInfiniteForce;
    b.minLength[k] = d.minLength;
    b.maxLength[k] = d.maxLength;
    b.breakGroup[k] = d.breakGroup;
    b.compressionStiffness[k] = d.compressionStiffness > 0.0f ? d.compressionStiffness : d.stiffness;
    if (d.type == BeamType::kHydro) {
      require(d.hydroChannel >= 0 && d.hydroChannel < desc.hydroChannels, tag + " hydro channel out of range");
    }
    b.hydroChannel[k] = d.hydroChannel;
    b.hydroFactor[k] = d.hydroFactor;
    b.hydroSpeed[k] = d.hydroSpeed;
    b.typeBegin[static_cast<int>(d.type) + 1]++;
  }
  for (const DamageGroupDesc& g : desc.damageGroups) {
    require(g.strain > 0.0f, "damage group \"" + g.id + "\" needs a positive trigger strain");
    DamageGroupState st;
    st.id = g.id;
    b.damageGroups.push_back(st);
  }
  for (size_t k = 0; k < m; ++k) {  // in body beam order
    const BeamDesc& d = desc.beams[order[k]];
    if (d.damageGroup < 0) continue;
    require(static_cast<size_t>(d.damageGroup) < desc.damageGroups.size(), "beam " + std::to_string(order[k]) + " has an unknown damage group");
    b.damageBeam.push_back(static_cast<int32_t>(k));
    b.damageBeamGroup.push_back(d.damageGroup);
    b.damageBeamStrain.push_back(d.damageStrain > 0.0f ? d.damageStrain : desc.damageGroups[static_cast<size_t>(d.damageGroup)].strain);
    b.damageBeamHit.push_back(0);
    b.damageGroups[static_cast<size_t>(d.damageGroup)].beams++;
  }
  for (int t = 0; t < kBeamTypeCount; ++t) b.typeBegin[t + 1] += b.typeBegin[t];

  auto validNode = [n](int32_t i) { return i >= 0 && static_cast<size_t>(i) < n; };
  for (size_t k = 0; k < desc.sliders.size(); ++k) {
    const SliderDesc& d = desc.sliders[k];
    require(validNode(d.node) && validNode(d.railA) && validNode(d.railB) && d.railA != d.railB,
            "slider " + std::to_string(k) + " has invalid nodes");
    b.sliderNode.push_back(d.node);
    b.sliderA.push_back(d.railA);
    b.sliderB.push_back(d.railB);
    b.sliderStiffness.push_back(d.stiffness);
    b.sliderDamping.push_back(d.damping);
    b.sliderBroken.push_back(0);
  }

  b.groupTriBegin.push_back(0);
  for (size_t g = 0; g < desc.pressureGroups.size(); ++g) {
    const PressureGroupDesc& d = desc.pressureGroups[g];
    require(!d.triangles.empty(), "pressure group " + std::to_string(g) + " has no triangles");
    for (const auto& t : d.triangles) {
      require(validNode(t[0]) && validNode(t[1]) && validNode(t[2]), "pressure group triangle has invalid nodes");
      b.pressureTri.insert(b.pressureTri.end(), {t[0], t[1], t[2]});
    }
    b.groupTriBegin.push_back(static_cast<int32_t>(b.pressureTri.size() / 3));
    b.groupGaugePressure.push_back(d.gaugePressure);
    b.groupAmbientPressure.push_back(d.ambientPressure);
    b.groupCurrentGauge.push_back(d.gaugePressure);
    b.groupBroken.push_back(0);
    b.groupInitialVolume.push_back(0.0);
    const double v = detail::pressureGroupVolume(b, static_cast<int>(g));
    require(v > 0.0, "pressure group " + std::to_string(g) + " has non-positive volume (check winding)");
    b.groupInitialVolume.back() = v;
  }

  // Collision surface: triangles (validated and stored here), then edges, node groups and group membership.
  for (size_t t = 0; t < desc.triangles.size(); ++t) {
    const CollisionTriDesc& d = desc.triangles[t];
    require(validNode(d.a) && validNode(d.b) && validNode(d.c) && d.a != d.b && d.b != d.c && d.a != d.c,
            "collision triangle " + std::to_string(t) + " has invalid nodes");
    require(d.group >= -1, "collision triangle " + std::to_string(t) + " has group < −1");
    const Vec3 pa = desc.nodes[d.a].position, pb = desc.nodes[d.b].position, pc = desc.nodes[d.c].position;
    require(length(cross(pb - pa, pc - pa)) > 1e-10f, "collision triangle " + std::to_string(t) + " is degenerate");
    const float longest = std::max({dot(pb - pa, pb - pa), dot(pc - pb, pc - pb), dot(pa - pc, pa - pc)});
    b.triNode.insert(b.triNode.end(), {d.a, d.b, d.c});
    b.triGroup.push_back(d.group);
    b.triTearEdge2.push_back(4.0f * longest);  // (2 × longest initial edge)²
    const Vec3 area2 = cross(pb - pa, pc - pa);
    b.triCrushArea2.push_back(0.0025f * dot(area2, area2));  // (5 % of the initial area)²
    b.triTorn.push_back(0);
  }
  detail::buildSurfaceTopology(b);
  b.contactDepth.assign(n, 0.0f);
  b.contactDepthNext.assign(n, 0.0f);

  for (size_t k = 0; k < desc.torsionBars.size(); ++k) {
    const TorsionBarDesc& d = desc.torsionBars[k];
    require(validNode(d.arm1) && validNode(d.pivot1) && validNode(d.pivot2) && validNode(d.arm2) && d.pivot1 != d.pivot2,
            "torsion bar " + std::to_string(k) + " has invalid nodes");
    b.torsionArm1.push_back(d.arm1);
    b.torsionPivot1.push_back(d.pivot1);
    b.torsionPivot2.push_back(d.pivot2);
    b.torsionArm2.push_back(d.arm2);
    b.torsionStiffness.push_back(d.stiffness);
    b.torsionDamping.push_back(d.damping);
    b.torsionRestAngle.push_back(0.0);
    b.torsionRestAngle.back() = detail::torsionBarAngle(b, static_cast<int>(k));
    require(d.breakTwist > 0.0f, "torsion bar " + std::to_string(k) + " breakTwist must be > 0");
    b.torsionBreakTwist.push_back(d.breakTwist);
    const auto lever2 = [&](int32_t arm, int32_t p, int32_t q) {
      const Vec3 axis = b.nodePosition(q) - b.nodePosition(p);
      const Vec3 r = b.nodePosition(arm) - b.nodePosition(p);
      const Vec3 perp = r - axis * (dot(r, axis) / std::max(dot(axis, axis), 1e-12f));
      return 0.25f * dot(perp, perp);  // (½·initial length)²
    };
    b.torsionMinLever1.push_back(lever2(d.arm1, d.pivot1, d.pivot2));
    b.torsionMinLever2.push_back(lever2(d.arm2, d.pivot2, d.pivot1));
    b.torsionBroken.push_back(0);
  }
  return b;
}

}  // namespace sbc

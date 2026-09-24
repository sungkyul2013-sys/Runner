// Island split (§4.3 분리 부품, A§4.2 step 11): after beams break, the parts that no longer hang together become
// bodies of their own and keep colliding with everything, their own former body included.
//
// Connectivity is a union–find over the nodes: intact beams of every type, sliders, intact torsion bars and pressure
// groups join their nodes. The heaviest component stays in the body (ties: the one holding the lowest node index),
// every other one moves out with its full state — positions, velocities, plastic rest lengths, stick anchors,
// intact triangles — so the split changes nothing physically. The source keeps the node slots (node indices held
// by a vehicle controller stay valid) but marks them node_flag::kDetached and drops every element referring to them;
// nothing of that is booked as fracture energy, the energy simply moves to the new body.
#include <algorithm>
#include <numeric>
#include <vector>

#include "internal.h"

namespace sbc::detail {
namespace {

struct UnionFind {
  std::vector<int32_t> parent;
  explicit UnionFind(int n) : parent(static_cast<size_t>(n)) { std::iota(parent.begin(), parent.end(), 0); }
  int32_t find(int32_t x) {
    while (parent[static_cast<size_t>(x)] != x) {
      parent[static_cast<size_t>(x)] = parent[static_cast<size_t>(parent[static_cast<size_t>(x)])];
      x = parent[static_cast<size_t>(x)];
    }
    return x;
  }
  void join(int32_t a, int32_t b) {
    a = find(a);
    b = find(b);
    if (a == b) return;
    if (a < b) parent[static_cast<size_t>(b)] = a; else parent[static_cast<size_t>(a)] = b;  // root = lowest index
  }
};

template <typename T>
void pick(std::vector<T>& dst, const std::vector<T>& src, const std::vector<int32_t>& idx) {
  dst.resize(idx.size());
  for (size_t k = 0; k < idx.size(); ++k) dst[k] = src[static_cast<size_t>(idx[k])];
}

Body extract(const Body& src, const std::vector<int32_t>& nodes, const std::vector<int32_t>& remap) {
  Body b;
  b.name = src.name + "/part";
  b.origin = src.origin;
  pick(b.px, src.px, nodes); pick(b.py, src.py, nodes); pick(b.pz, src.pz, nodes);
  pick(b.vx, src.vx, nodes); pick(b.vy, src.vy, nodes); pick(b.vz, src.vz, nodes);
  pick(b.sx, src.sx, nodes); pick(b.sy, src.sy, nodes); pick(b.sz, src.sz, nodes);
  pick(b.mass, src.mass, nodes); pick(b.invMass, src.invMass, nodes); pick(b.radius, src.radius, nodes);
  pick(b.material, src.material, nodes); pick(b.flags, src.flags, nodes);
  pick(b.stickX, src.stickX, nodes); pick(b.stickY, src.stickY, nodes); pick(b.stickZ, src.stickZ, nodes);
  pick(b.anchorContact, src.anchorContact, nodes);
  pick(b.patchForce, src.patchForce, nodes);
  pick(b.patchNx, src.patchNx, nodes); pick(b.patchNy, src.patchNy, nodes); pick(b.patchNz, src.patchNz, nodes);
  pick(b.patchMaterial, src.patchMaterial, nodes);
  const size_t n = nodes.size();
  for (auto* a : {&b.fx, &b.fy, &b.fz, &b.fdBeamX, &b.fdBeamY, &b.fdBeamZ, &b.fdContactX, &b.fdContactY, &b.fdContactZ,
                  &b.fdFrictionX, &b.fdFrictionY, &b.fdFrictionZ, &b.fdExternalX, &b.fdExternalY, &b.fdExternalZ}) {
    a->assign(n, 0.0f);
  }
  for (uint8_t& f : b.flags) f = static_cast<uint8_t>(f & ~node_flag::kTread);  // no vehicle drives its tread any more
  auto inside = [&](int32_t i) { return remap[static_cast<size_t>(i)] >= 0; };
  auto map = [&](int32_t i) { return remap[static_cast<size_t>(i)]; };

  // Beams: intact ones with both ends in the island, source order (already sorted by type).
  std::vector<int32_t> beams;
  b.typeBegin.fill(0);
  for (int i = 0; i < src.beamCount(); ++i) {
    if (src.broken[static_cast<size_t>(i)] || !inside(src.beamA[static_cast<size_t>(i)]) || !inside(src.beamB[static_cast<size_t>(i)])) continue;
    beams.push_back(i);
    b.typeBegin[static_cast<size_t>(src.beamType[static_cast<size_t>(i)]) + 1]++;
  }
  for (int t = 0; t < kBeamTypeCount; ++t) b.typeBegin[static_cast<size_t>(t) + 1] += b.typeBegin[static_cast<size_t>(t)];
  pick(b.beamA, src.beamA, beams); pick(b.beamB, src.beamB, beams);
  for (int32_t& a : b.beamA) a = map(a);
  for (int32_t& a : b.beamB) a = map(a);
  pick(b.beamType, src.beamType, beams); pick(b.stiffness, src.stiffness, beams); pick(b.damping, src.damping, beams);
  pick(b.restLength, src.restLength, beams); pick(b.initialRestLength, src.initialRestLength, beams);
  pick(b.plasticForce, src.plasticForce, beams); pick(b.hardening, src.hardening, beams);
  pick(b.breakForce, src.breakForce, beams); pick(b.deformLimit, src.deformLimit, beams);
  pick(b.crushFloor, src.crushFloor, beams); pick(b.tearLength, src.tearLength, beams);
  pick(b.plasticDeformation, src.plasticDeformation, beams); pick(b.minLength, src.minLength, beams);
  pick(b.maxLength, src.maxLength, beams); pick(b.breakGroup, src.breakGroup, beams); pick(b.broken, src.broken, beams);
  pick(b.compressionStiffness, src.compressionStiffness, beams); pick(b.hydroChannel, src.hydroChannel, beams);
  pick(b.hydroFactor, src.hydroFactor, beams); pick(b.hydroSpeed, src.hydroSpeed, beams);
  b.hydroInputs = src.hydroInputs;  // frozen where the controller left them

  for (int s = 0; s < src.sliderCount(); ++s) {
    if (src.sliderBroken[static_cast<size_t>(s)]) continue;
    const int32_t nd = src.sliderNode[static_cast<size_t>(s)], ra = src.sliderA[static_cast<size_t>(s)], rb = src.sliderB[static_cast<size_t>(s)];
    if (!inside(nd) || !inside(ra) || !inside(rb)) continue;
    b.sliderNode.push_back(map(nd)); b.sliderA.push_back(map(ra)); b.sliderB.push_back(map(rb));
    b.sliderStiffness.push_back(src.sliderStiffness[static_cast<size_t>(s)]);
    b.sliderDamping.push_back(src.sliderDamping[static_cast<size_t>(s)]);
    b.sliderBroken.push_back(0);
  }
  b.groupTriBegin.push_back(0);
  for (int g = 0; g < src.pressureGroupCount(); ++g) {
    if (src.groupBroken[static_cast<size_t>(g)]) continue;
    bool all = true;
    for (int t = src.groupTriBegin[static_cast<size_t>(g)] * 3; all && t < src.groupTriBegin[static_cast<size_t>(g) + 1] * 3; ++t)
      all = inside(src.pressureTri[static_cast<size_t>(t)]);
    if (!all) continue;
    for (int t = src.groupTriBegin[static_cast<size_t>(g)] * 3; t < src.groupTriBegin[static_cast<size_t>(g) + 1] * 3; ++t)
      b.pressureTri.push_back(map(src.pressureTri[static_cast<size_t>(t)]));
    b.groupTriBegin.push_back(static_cast<int32_t>(b.pressureTri.size() / 3));
    b.groupInitialVolume.push_back(src.groupInitialVolume[static_cast<size_t>(g)]);
    b.groupGaugePressure.push_back(src.groupGaugePressure[static_cast<size_t>(g)]);
    b.groupAmbientPressure.push_back(src.groupAmbientPressure[static_cast<size_t>(g)]);
    b.groupCurrentGauge.push_back(src.groupCurrentGauge[static_cast<size_t>(g)]);
    b.groupBroken.push_back(0);
  }
  for (int i = 0; i < src.torsionBarCount(); ++i) {
    if (src.torsionBroken[static_cast<size_t>(i)]) continue;
    const int32_t a1 = src.torsionArm1[static_cast<size_t>(i)], p1 = src.torsionPivot1[static_cast<size_t>(i)];
    const int32_t p2 = src.torsionPivot2[static_cast<size_t>(i)], a2 = src.torsionArm2[static_cast<size_t>(i)];
    if (!inside(a1) || !inside(p1) || !inside(p2) || !inside(a2)) continue;
    b.torsionArm1.push_back(map(a1)); b.torsionPivot1.push_back(map(p1));
    b.torsionPivot2.push_back(map(p2)); b.torsionArm2.push_back(map(a2));
    b.torsionStiffness.push_back(src.torsionStiffness[static_cast<size_t>(i)]);
    b.torsionDamping.push_back(src.torsionDamping[static_cast<size_t>(i)]);
    b.torsionRestAngle.push_back(src.torsionRestAngle[static_cast<size_t>(i)]);
    b.torsionBreakTwist.push_back(src.torsionBreakTwist[static_cast<size_t>(i)]);
    b.torsionMinLever1.push_back(src.torsionMinLever1[static_cast<size_t>(i)]);
    b.torsionMinLever2.push_back(src.torsionMinLever2[static_cast<size_t>(i)]);
    b.torsionBroken.push_back(0);
  }
  for (int t = 0; t < src.triangleCount(); ++t) {
    if (src.triTorn[static_cast<size_t>(t)]) continue;
    const int32_t* v = &src.triNode[static_cast<size_t>(t) * 3];
    if (!inside(v[0]) || !inside(v[1]) || !inside(v[2])) continue;
    b.triNode.insert(b.triNode.end(), {map(v[0]), map(v[1]), map(v[2])});
    b.triGroup.push_back(src.triGroup[static_cast<size_t>(t)]);
    b.triTearEdge2.push_back(src.triTearEdge2[static_cast<size_t>(t)]);
    b.triCrushArea2.push_back(src.triCrushArea2[static_cast<size_t>(t)]);
    b.triTorn.push_back(0);
  }
  buildSurfaceTopology(b);
  b.brokenBeamCount = 0;
  b.islandCheckedAt = 0;
  return b;
}

}  // namespace

std::vector<Body> splitIslands(Body& b) {
  std::vector<Body> parts;
  const int n = b.nodeCount();
  UnionFind uf(n);
  for (int i = 0; i < b.beamCount(); ++i)
    if (!b.broken[static_cast<size_t>(i)]) uf.join(b.beamA[static_cast<size_t>(i)], b.beamB[static_cast<size_t>(i)]);
  for (int s = 0; s < b.sliderCount(); ++s) {
    if (b.sliderBroken[static_cast<size_t>(s)]) continue;
    uf.join(b.sliderNode[static_cast<size_t>(s)], b.sliderA[static_cast<size_t>(s)]);
    uf.join(b.sliderNode[static_cast<size_t>(s)], b.sliderB[static_cast<size_t>(s)]);
  }
  for (int i = 0; i < b.torsionBarCount(); ++i) {
    if (b.torsionBroken[static_cast<size_t>(i)]) continue;
    uf.join(b.torsionArm1[static_cast<size_t>(i)], b.torsionPivot1[static_cast<size_t>(i)]);
    uf.join(b.torsionPivot1[static_cast<size_t>(i)], b.torsionPivot2[static_cast<size_t>(i)]);
    uf.join(b.torsionPivot2[static_cast<size_t>(i)], b.torsionArm2[static_cast<size_t>(i)]);
  }
  for (int g = 0; g < b.pressureGroupCount(); ++g) {
    if (b.groupBroken[static_cast<size_t>(g)]) continue;
    const int first = b.groupTriBegin[static_cast<size_t>(g)] * 3, last = b.groupTriBegin[static_cast<size_t>(g) + 1] * 3;
    for (int t = first + 1; t < last; ++t) uf.join(b.pressureTri[static_cast<size_t>(first)], b.pressureTri[static_cast<size_t>(t)]);
  }
  // Component masses; the heaviest live component stays.
  std::vector<double> mass(static_cast<size_t>(n), 0.0);
  std::vector<int> live(static_cast<size_t>(n), 0);
  for (int i = 0; i < n; ++i) {
    if (b.flags[static_cast<size_t>(i)] & node_flag::kDetached) continue;
    const int r = uf.find(i);
    mass[static_cast<size_t>(r)] += b.mass[static_cast<size_t>(i)];
    live[static_cast<size_t>(r)]++;
  }
  int keep = -1, components = 0;
  for (int r = 0; r < n; ++r) {
    if (!live[static_cast<size_t>(r)]) continue;
    ++components;
    if (keep < 0 || mass[static_cast<size_t>(r)] > mass[static_cast<size_t>(keep)]) keep = r;
  }
  if (components < 2) return parts;

  std::vector<int32_t> remap(static_cast<size_t>(n), -1);
  for (int r = 0; r < n; ++r) {  // components in order of their lowest node → deterministic body order
    if (!live[static_cast<size_t>(r)] || r == keep) continue;
    std::vector<int32_t> nodes;
    for (int i = 0; i < n; ++i)
      if (!(b.flags[static_cast<size_t>(i)] & node_flag::kDetached) && uf.find(i) == r) nodes.push_back(i);
    bool movable = false;  // a set of anchored nodes (a torn-off fixed base) stays where it is
    for (const int32_t i : nodes) movable = movable || b.invMass[static_cast<size_t>(i)] > 0.0f;
    if (!movable) continue;
    for (size_t k = 0; k < nodes.size(); ++k) remap[static_cast<size_t>(nodes[k])] = static_cast<int32_t>(k);
    parts.push_back(extract(b, nodes, remap));
    // Retire the moved nodes and everything that refers to them in the source.
    auto moved = [&](int32_t i) { return remap[static_cast<size_t>(i)] >= 0; };
    for (int i = 0; i < b.beamCount(); ++i)
      if (moved(b.beamA[static_cast<size_t>(i)]) || moved(b.beamB[static_cast<size_t>(i)])) b.broken[static_cast<size_t>(i)] = 1;
    for (int s = 0; s < b.sliderCount(); ++s)
      if (moved(b.sliderNode[static_cast<size_t>(s)]) || moved(b.sliderA[static_cast<size_t>(s)]) || moved(b.sliderB[static_cast<size_t>(s)]))
        b.sliderBroken[static_cast<size_t>(s)] = 1;
    for (int i = 0; i < b.torsionBarCount(); ++i)
      if (moved(b.torsionArm1[static_cast<size_t>(i)]) || moved(b.torsionPivot1[static_cast<size_t>(i)]) ||
          moved(b.torsionPivot2[static_cast<size_t>(i)]) || moved(b.torsionArm2[static_cast<size_t>(i)]))
        b.torsionBroken[static_cast<size_t>(i)] = 1;
    for (int g = 0; g < b.pressureGroupCount(); ++g)
      for (int t = b.groupTriBegin[static_cast<size_t>(g)] * 3; t < b.groupTriBegin[static_cast<size_t>(g) + 1] * 3; ++t)
        if (moved(b.pressureTri[static_cast<size_t>(t)])) b.groupBroken[static_cast<size_t>(g)] = 1;
    for (int t = 0; t < b.triangleCount(); ++t) {
      const int32_t* v = &b.triNode[static_cast<size_t>(t) * 3];
      if (moved(v[0]) || moved(v[1]) || moved(v[2])) b.triTorn[static_cast<size_t>(t)] = 1;
    }
    for (const int32_t i : nodes) {
      const size_t k = static_cast<size_t>(i);
      b.flags[k] = node_flag::kDetached;  // no collision, no tread, not fixed
      b.invMass[k] = 0.0f;                // skipped by the integrator, energy and momentum sums
      b.mass[k] = 0.0f;
      b.vx[k] = b.vy[k] = b.vz[k] = 0.0f;
      b.anchorContact[k] = -1;
      remap[k] = -1;
    }
  }
  if (!parts.empty()) {
    buildSurfaceTopology(b);
    b.topologyVersion++;
  }
  return parts;
}

}  // namespace sbc::detail

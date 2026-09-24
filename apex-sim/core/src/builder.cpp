#include "sbc/builder.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <utility>
#include <stdexcept>

#include "sbc/det_math.h"

namespace sbc {
namespace {

// Rotation R = R_y(yaw) · R_x(pitch) · R_z(roll), built from deterministic sin/cos so initial states are
// bit-identical on every platform.
struct Rotation {
  double m[3][3];
  explicit Rotation(Vec3 ypr) {
    const double cy = det::cos(ypr.x), sy = det::sin(ypr.x);
    const double cp = det::cos(ypr.y), sp = det::sin(ypr.y);
    const double cr = det::cos(ypr.z), sr = det::sin(ypr.z);
    const double ry[3][3] = {{cy, 0, sy}, {0, 1, 0}, {-sy, 0, cy}};
    const double rx[3][3] = {{1, 0, 0}, {0, cp, -sp}, {0, sp, cp}};
    const double rz[3][3] = {{cr, -sr, 0}, {sr, cr, 0}, {0, 0, 1}};
    double t[3][3];
    for (int i = 0; i < 3; ++i)
      for (int j = 0; j < 3; ++j) t[i][j] = rx[i][0] * rz[0][j] + rx[i][1] * rz[1][j] + rx[i][2] * rz[2][j];
    for (int i = 0; i < 3; ++i)
      for (int j = 0; j < 3; ++j) m[i][j] = ry[i][0] * t[0][j] + ry[i][1] * t[1][j] + ry[i][2] * t[2][j];
  }
  Vec3 apply(DVec3 v) const {
    return {static_cast<float>(m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z),
            static_cast<float>(m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z),
            static_cast<float>(m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z)};
  }
};

// The 13 forward directions of the 26-neighbourhood.
constexpr int kDirs[13][3] = {{1, 0, 0},  {0, 1, 0},  {0, 0, 1},  {1, 1, 0},  {1, -1, 0}, {1, 0, 1},  {1, 0, -1},
                              {0, 1, 1},  {0, 1, -1}, {1, 1, 1},  {1, 1, -1}, {1, -1, 1}, {1, -1, -1}};

}  // namespace

BodyDesc makeLattice(const LatticeParams& p) {
  if (p.nx < 2 || p.ny < 2 || p.nz < 2) throw std::invalid_argument("makeLattice: need ≥ 2 nodes per axis");
  if (!(p.totalMass > 0.0f) || !(p.axialStiffness > 0.0f)) throw std::invalid_argument("makeLattice: mass/EA ≤ 0");
  BodyDesc d;
  d.name = "lattice";
  d.origin = p.center;
  const Rotation rot(p.yawPitchRoll);
  const int count = p.nx * p.ny * p.nz;
  const float nodeMass = p.totalMass / static_cast<float>(count);
  auto index = [&](int i, int j, int k) { return (k * p.ny + j) * p.nx + i; };

  d.nodes.resize(static_cast<size_t>(count));
  for (int k = 0; k < p.nz; ++k) {
    for (int j = 0; j < p.ny; ++j) {
      for (int i = 0; i < p.nx; ++i) {
        const DVec3 local{(static_cast<double>(i) / (p.nx - 1) - 0.5) * p.size.x,
                          (static_cast<double>(j) / (p.ny - 1) - 0.5) * p.size.y,
                          (static_cast<double>(k) / (p.nz - 1) - 0.5) * p.size.z};
        NodeDesc& n = d.nodes[static_cast<size_t>(index(i, j, k))];
        n.position = rot.apply(local);
        n.velocity = p.velocity;
        n.mass = nodeMass;
        n.radius = p.nodeRadius;
        n.material = p.material;
      }
    }
  }

  const float reducedMass = 0.5f * nodeMass;
  for (int k = 0; k < p.nz; ++k) {
    for (int j = 0; j < p.ny; ++j) {
      for (int i = 0; i < p.nx; ++i) {
        for (const auto& dir : kDirs) {
          const int i2 = i + dir[0], j2 = j + dir[1], k2 = k + dir[2];
          if (i2 < 0 || i2 >= p.nx || j2 < 0 || j2 >= p.ny || k2 < 0 || k2 >= p.nz) continue;
          BeamDesc beam;
          beam.a = index(i, j, k);
          beam.b = index(i2, j2, k2);
          const float len = length(d.nodes[static_cast<size_t>(beam.b)].position - d.nodes[static_cast<size_t>(beam.a)].position);
          beam.stiffness = p.axialStiffness / len;
          beam.damping = 2.0f * p.dampingRatio * std::sqrt(beam.stiffness * reducedMass);
          if (p.yieldStrain > 0.0f) beam.plasticForce = p.axialStiffness * p.yieldStrain;
          beam.hardening = p.hardening;
          if (p.breakStrain > 0.0f) beam.breakForce = p.axialStiffness * p.breakStrain;
          if (p.deformLimit > 0.0f) beam.deformLimit = p.deformLimit;
          d.beams.push_back(beam);
        }
      }
    }
  }

  // Collision surface (§5.2): the six outer faces, two triangles per boundary quad, wound outward.
  if (p.surface) {
    auto quad = [&](int a, int b, int c, int e) {
      for (const auto& t : {std::array<int, 3>{a, b, c}, std::array<int, 3>{a, c, e}}) {
        const Vec3 pa = d.nodes[static_cast<size_t>(t[0])].position, pb = d.nodes[static_cast<size_t>(t[1])].position,
                   pc = d.nodes[static_cast<size_t>(t[2])].position;
        const Vec3 centroid = (pa + pb + pc) * (1.0f / 3.0f);  // lattice centre is the local origin
        const bool outward = dot(cross(pb - pa, pc - pa), centroid) >= 0.0f;
        d.triangles.push_back(outward ? CollisionTriDesc{t[0], t[1], t[2], p.surfaceGroup}
                                      : CollisionTriDesc{t[0], t[2], t[1], p.surfaceGroup});
      }
    };
    for (int side = 0; side < 2; ++side) {
      const int i = side ? p.nx - 1 : 0, j = side ? p.ny - 1 : 0, k = side ? p.nz - 1 : 0;
      for (int b = 0; b + 1 < p.ny; ++b)
        for (int c = 0; c + 1 < p.nz; ++c) quad(index(i, b, c), index(i, b + 1, c), index(i, b + 1, c + 1), index(i, b, c + 1));
      for (int a = 0; a + 1 < p.nx; ++a)
        for (int c = 0; c + 1 < p.nz; ++c) quad(index(a, j, c), index(a + 1, j, c), index(a + 1, j, c + 1), index(a, j, c + 1));
      for (int a = 0; a + 1 < p.nx; ++a)
        for (int b = 0; b + 1 < p.ny; ++b) quad(index(a, b, k), index(a + 1, b, k), index(a + 1, b + 1, k), index(a, b + 1, k));
    }
  }
  return d;
}

PressureWheelNodes addPressureWheel(BodyDesc& d, const PressureWheelParams& p) {
  const int nNodes = static_cast<int>(d.nodes.size());
  if (p.axleRight < 0 || p.axleRight >= nNodes || p.axleLeft < 0 || p.axleLeft >= nNodes || p.axleRight == p.axleLeft) {
    throw std::invalid_argument("addPressureWheel: axle node index");
  }
  if (p.segments < 8 || !(p.tyreRadius > p.rimRadius) || !(p.rimRadius > 0.0f)) {
    throw std::invalid_argument("addPressureWheel: geometry");
  }
  const DVec3 axleR = toDouble(d.nodes[static_cast<size_t>(p.axleRight)].position);
  const DVec3 axleL = toDouble(d.nodes[static_cast<size_t>(p.axleLeft)].position);
  auto unit = [](DVec3 v) {
    const double l = std::sqrt(dot(v, v));
    return v * (1.0 / l);
  };
  const DVec3 axis = unit(axleL - axleR);
  DVec3 hint = toDouble(p.upHint);
  if (std::fabs(dot(hint, axis)) > 0.9) hint = {0.0, 0.0, 1.0};
  const DVec3 u = unit(hint - axis * dot(hint, axis));
  const DVec3 w = cross(axis, u);
  const DVec3 c = toDouble(p.center);
  const int n = p.segments;
  constexpr double kTwoPi = 6.283185307179586;

  PressureWheelNodes out;
  // Node order per segment j: tread A (right, −axis), tread B (left, +axis), rim A, rim B.
  const int base = nNodes;
  auto treadA = [&](int j) { return base + 4 * (((j % n) + n) % n); };
  auto treadB = [&](int j) { return treadA(j) + 1; };
  auto rimA = [&](int j) { return treadA(j) + 2; };
  auto rimB = [&](int j) { return treadA(j) + 3; };
  const double treadR = p.tyreRadius - p.treadNodeRadius;
  for (int j = 0; j < n; ++j) {
    // Row B sits half a segment ahead of row A: the two rows meet the road alternately, which halves the
    // "polygon" ripple of the contact force as the wheel rolls.
    const double thA = kTwoPi * j / n, thB = kTwoPi * (j + 0.5) / n;
    auto node = [&](double side, double halfWidth, double radius, float mass, float nodeRadius, uint16_t material,
                    uint8_t flags) {
      const double th = side < 0.0 ? thA : thB;
      const DVec3 radial = u * det::cos(th) + w * det::sin(th);
      NodeDesc nd;
      nd.position = toFloat(c + axis * (side * halfWidth) + radial * radius);
      nd.mass = mass;
      nd.radius = nodeRadius;
      nd.material = material;
      nd.flags = flags;
      d.nodes.push_back(nd);
    };
    const uint8_t treadFlags = node_flag::kCollide | node_flag::kTread;
    node(-1.0, 0.5 * p.treadWidth, treadR, p.treadNodeMass, p.treadNodeRadius, p.treadMaterial, treadFlags);
    node(+1.0, 0.5 * p.treadWidth, treadR, p.treadNodeMass, p.treadNodeRadius, p.treadMaterial, treadFlags);
    node(-1.0, 0.5 * p.rimWidth, p.rimRadius, p.rimNodeMass, p.rimNodeRadius, p.rimMaterial, node_flag::kCollide);
    node(+1.0, 0.5 * p.rimWidth, p.rimRadius, p.rimNodeMass, p.rimNodeRadius, p.rimMaterial, node_flag::kCollide);
    out.tread.push_back(treadA(j));
    out.tread.push_back(treadB(j));
    out.rim.push_back(rimA(j));
    out.rim.push_back(rimB(j));
  }
  for (int j = 0; j < 4 * n; ++j) out.all.push_back(base + j);

  auto position = [&](int i) { return toDouble(d.nodes[static_cast<size_t>(i)].position); };
  auto massOf = [&](int i) { return d.nodes[static_cast<size_t>(i)].mass; };
  auto beam = [&](int a, int b, float k, float zeta, float restShrink = 0.0f) {
    BeamDesc bd;
    bd.a = a;
    bd.b = b;
    bd.stiffness = k;
    const float ma = massOf(a), mb = massOf(b);
    const float mr = ma * mb / (ma + mb);
    bd.damping = 2.0f * zeta * std::sqrt(k * mr);
    if (restShrink > 0.0f) {
      const DVec3 dv = position(b) - position(a);
      bd.restLength = static_cast<float>(std::sqrt(dot(dv, dv))) - restShrink;
    }
    d.beams.push_back(bd);
  };
  // Hoop tension of one belt ring under the structural gauge: T = p·(w/2)·R. Pre-shrink the circumferential beams
  // by T/k so the inflated belt sits at its design radius.
  const float hoop = p.structuralPressure * 0.5f * p.treadWidth * p.tyreRadius;
  const float shrink = p.structuralPressure > 0.0f ? hoop / p.treadStiffness : 0.0f;
  for (int j = 0; j < n; ++j) {
    // rim: rings, across, diagonals, spokes to both axle nodes
    auto rimBeam = [&](int a, int b2) {
      beam(a, b2, p.rimStiffness, p.rimDampingRatio);
      if (p.rimYieldForce > 0.0f) {
        d.beams.back().plasticForce = p.rimYieldForce;
        d.beams.back().hardening = p.rimHardening;
      }
    };
    rimBeam(rimA(j), rimA(j + 1));
    rimBeam(rimB(j), rimB(j + 1));
    rimBeam(rimA(j), rimB(j));      // zig-zag across the staggered rows
    rimBeam(rimB(j), rimA(j + 1));
    const float spoke = p.spokeStiffness > 0.0f ? p.spokeStiffness : p.rimStiffness;
    beam(rimA(j), p.axleRight, spoke, p.rimDampingRatio);
    beam(rimA(j), p.axleLeft, spoke, p.rimDampingRatio);
    beam(rimB(j), p.axleRight, spoke, p.rimDampingRatio);
    beam(rimB(j), p.axleLeft, spoke, p.rimDampingRatio);
    // belt
    beam(treadA(j), treadA(j + 1), p.treadStiffness, p.treadDampingRatio, shrink);
    beam(treadB(j), treadB(j + 1), p.treadStiffness, p.treadDampingRatio, shrink);
    beam(treadA(j), treadB(j), p.treadStiffness, p.treadDampingRatio);
    beam(treadB(j), treadA(j + 1), p.treadStiffness, p.treadDampingRatio);
    beam(treadA(j), treadA(j + 2), p.treadBendStiffness, p.treadDampingRatio);
    beam(treadB(j), treadB(j + 2), p.treadBendStiffness, p.treadDampingRatio);
    // sidewalls
    for (const auto& [t, r] : {std::pair<int, int>{treadA(j), rimA(j)}, std::pair<int, int>{treadB(j), rimB(j)}}) {
      beam(t, r, std::max(p.sidewallTensionStiffness, p.sidewallStiffness), p.sidewallDampingRatio);
      d.beams.back().type = BeamType::kAnisotropic;
      d.beams.back().compressionStiffness = p.sidewallStiffness;
    }
    beam(treadA(j), rimA(j + 1), p.sidewallShearStiffness, p.sidewallDampingRatio);
    beam(treadA(j), rimA(j - 1), p.sidewallShearStiffness, p.sidewallDampingRatio);
    beam(treadB(j), rimB(j + 1), p.sidewallShearStiffness, p.sidewallDampingRatio);
    beam(treadB(j), rimB(j - 1), p.sidewallShearStiffness, p.sidewallDampingRatio);
    // cross (lateral carcass stiffness): each tread node to both staggered neighbours on the other rim ring
    const float cross = 0.5f * p.sidewallCrossStiffness;
    beam(treadA(j), rimB(j), cross, p.sidewallDampingRatio);
    beam(treadA(j), rimB(j - 1), cross, p.sidewallDampingRatio);
    beam(treadB(j), rimA(j), cross, p.sidewallDampingRatio);
    beam(treadB(j), rimA(j + 1), cross, p.sidewallDampingRatio);
  }

  if (p.structuralPressure > 0.0f) {
    PressureGroupDesc g;
    g.gaugePressure = p.structuralPressure;
    // Outward (from the air cavity) winding: `sign` = +1 radially out, −1 radially in, or 0 with an axial outward.
    auto tri = [&](int a, int b, int cc, double sign, DVec3 axial) {
      const std::array<int32_t, 3> t{a, b, cc};
      const DVec3 centroid = (position(a) + position(b) + position(cc)) * (1.0 / 3.0) - c;
      const DVec3 radial = centroid - axis * dot(centroid, axis);
      const DVec3 outward = sign != 0.0 ? radial * sign : axial;
      const DVec3 nrm = cross(position(b) - position(a), position(cc) - position(a));
      g.triangles.push_back(dot(nrm, outward) >= 0.0 ? t : std::array<int32_t, 3>{a, cc, b});
    };
    for (int j = 0; j < n; ++j) {
      tri(treadA(j), treadA(j + 1), treadB(j), 1.0, {});          // belt (strip over the staggered rows)
      tri(treadB(j), treadA(j + 1), treadB(j + 1), 1.0, {});
      tri(rimA(j), rimA(j + 1), rimB(j), -1.0, {});               // rim bed
      tri(rimB(j), rimA(j + 1), rimB(j + 1), -1.0, {});
      tri(rimA(j), rimA(j + 1), treadA(j + 1), 0.0, axis * -1.0); // right sidewall
      tri(rimA(j), treadA(j + 1), treadA(j), 0.0, axis * -1.0);
      tri(rimB(j), rimB(j + 1), treadB(j + 1), 0.0, axis);        // left sidewall
      tri(rimB(j), treadB(j + 1), treadB(j), 0.0, axis);
    }
    d.pressureGroups.push_back(std::move(g));
  }
  // Collision surface (§5.2): tread, sidewalls and rim bed, wound outward — what another car or the arch liner
  // touches; closed, so inside/outside is defined.
  if (p.collisionSurface) {
    auto tri = [&](int a, int b, int cc, double sign, DVec3 axial) {
      const DVec3 centroid = (position(a) + position(b) + position(cc)) * (1.0 / 3.0) - c;
      const DVec3 radial = centroid - axis * dot(centroid, axis);
      const DVec3 outward = sign != 0.0 ? radial * sign : axial;
      const DVec3 nrm = cross(position(b) - position(a), position(cc) - position(a));
      d.triangles.push_back(dot(nrm, outward) >= 0.0 ? CollisionTriDesc{a, b, cc, p.collisionGroup}
                                                     : CollisionTriDesc{a, cc, b, p.collisionGroup});
    };
    for (int j = 0; j < n; ++j) {
      tri(treadA(j), treadA(j + 1), treadB(j), 1.0, {});
      tri(treadB(j), treadA(j + 1), treadB(j + 1), 1.0, {});
      tri(rimA(j), rimA(j + 1), rimB(j), -1.0, {});    // rim bed: closes the surface (a torus around the hub)
      tri(rimB(j), rimA(j + 1), rimB(j + 1), -1.0, {});
      tri(rimA(j), rimA(j + 1), treadA(j + 1), 0.0, axis * -1.0);
      tri(rimA(j), treadA(j + 1), treadA(j), 0.0, axis * -1.0);
      tri(rimB(j), rimB(j + 1), treadB(j + 1), 0.0, axis);
      tri(rimB(j), treadB(j + 1), treadB(j), 0.0, axis);
    }
  }
  return out;
}

}  // namespace sbc

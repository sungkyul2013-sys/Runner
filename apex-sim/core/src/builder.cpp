#include "sbc/builder.h"

#include <cmath>
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
  return d;
}

}  // namespace sbc

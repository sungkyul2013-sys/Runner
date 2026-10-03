#include "sbc/vehicle_build.h"

#include <cmath>

#include "sbc/det_math.h"

namespace sbc {

void placeVehicle(VehicleBuild& build, const VehicleSpawn& spawn) {
  std::vector<NodeDesc>& nodes = build.body.nodes;
  if (spawn.speed != 0.0f) {
    for (NodeDesc& n : nodes) n.velocity = {0.0f, 0.0f, spawn.speed};
    for (const WheelDesc& w : build.vehicle.wheels) {
      const DVec3 left = toDouble(nodes[static_cast<size_t>(w.axleLeft)].position);
      const DVec3 right = toDouble(nodes[static_cast<size_t>(w.axleRight)].position);
      const DVec3 d = left - right;
      const DVec3 axis = d * (1.0 / std::sqrt(dot(d, d)));  // points left: forward rolling is +ω
      const double omega = spawn.speed / w.tyre.radius;
      for (const int32_t i : w.rotatingNodes) {
        NodeDesc& n = nodes[static_cast<size_t>(i)];
        const DVec3 spin = cross(axis * omega, toDouble(n.position) - right);
        n.velocity = toFloat(DVec3{0.0, 0.0, spawn.speed} + spin);
      }
    }
  }
  const double c = det::cos(spawn.yaw), s = det::sin(spawn.yaw);
  auto rotate = [c, s](Vec3 p) {
    return Vec3{static_cast<float>(c * p.x + s * p.z), p.y, static_cast<float>(-s * p.x + c * p.z)};
  };
  for (NodeDesc& n : nodes) {
    n.position = rotate(n.position);
    n.velocity = rotate(n.velocity);
  }
  build.body.origin = spawn.position;
}

}  // namespace sbc

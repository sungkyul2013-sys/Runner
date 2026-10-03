// SoftBodyCore — a vehicle ready to spawn: its node-beam body and its controller description.
#pragma once

#include "sbc/body.h"
#include "sbc/math.h"
#include "sbc/vehicle.h"

namespace sbc {

struct VehicleBuild {
  BodyDesc body;
  VehicleDesc vehicle;
};

struct VehicleSpawn {
  DVec3 position;       // [m] world position of the model origin
  double yaw = 0.0;     // [rad] heading about +Y (0 = model +Z along world +Z)
  float speed = 0.0f;   // [m/s] initial forward speed; wheels spin to match
};

// Moves a vehicle built in its model frame (+Z forward, +Y up, +X left) to a spawn pose: sets the body origin, rotates
// every node by `yaw`, gives the body the forward speed and the rotating wheel nodes the matching spin (ω = v / R0).
// Deterministic (det::sin/cos).
void placeVehicle(VehicleBuild& build, const VehicleSpawn& spawn);

}  // namespace sbc

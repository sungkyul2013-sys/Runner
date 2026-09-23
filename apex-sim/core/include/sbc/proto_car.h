// SoftBodyCore — "APEX Proto": a procedural reference car (original design) for vehicle tests, benchmarks and the
// web sandbox. 1.2 t front-engine RWD sports coupe: lattice chassis, double wishbone suspension at every corner
// (anti-roll bars, coilovers, bump stops, steering rack as hydro tie rods), pressure wheels, 6-speed gearbox, rear LSD.
// Model frame: +Z forward, +Y up, +X left; y = 0 at the tyre contact plane, z = 0 midway between the axles.
#pragma once

#include "sbc/body.h"
#include "sbc/builder.h"
#include "sbc/math.h"
#include "sbc/vehicle.h"

namespace sbc {

// The proto car's tyre (235/40 R18-like); axle nodes and centre are filled in per corner.
PressureWheelParams protoTyre();

struct ProtoCarOptions {
  DVec3 position;   // [m] world position of the model origin
  double yaw = 0.0; // [rad] heading about +Y (0 = model +Z along world +Z)
  float speed = 0.0f;  // [m/s] initial forward speed (wheels spun up to match)
  bool abs = true;
  PressureWheelParams tyre = protoTyre();
};

struct VehicleBuild {
  BodyDesc body;
  VehicleDesc vehicle;
};

VehicleBuild makeProtoCar(const ProtoCarOptions& options = {});

}  // namespace sbc

// SoftBodyCore — vehicle data loader (A§4.11, format: docs/VEHICLE_FORMAT.md).
#pragma once

#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "sbc/vehicle_build.h"

namespace sbc {

struct LoadedVehicle {
  VehicleBuild build;
  std::string id, name;
  std::string modelGlb;                                  // model.glb (path relative to the web root)
  std::vector<std::pair<std::string, double>> targets;   // "targets" (reference values for tests, KICKOFF C7)
  std::vector<std::string> nodeIds;                      // node index → id ("" for generated wheel nodes)
  std::vector<std::string> breakGroupIds;                // Body::breakGroup index → the beams' "breakGroup" name
};

// Parses an "apex-vehicle" JSON document (comments and trailing commas allowed) and places the vehicle at `spawn`.
// Without a "vehicle" section the result is a plain node-beam prop (build.vehicle.wheels is empty: add only the body).
// Throws std::invalid_argument naming the offending JSON path. Parsing is deterministic (yyjson's correctly rounded
// number parser), so the same file builds bit-identical bodies on every platform.
LoadedVehicle loadVehicleJson(std::string_view text, const VehicleSpawn& spawn = {});

}  // namespace sbc

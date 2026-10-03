// §4.4 damage → function: the vehicle's damage links read the body's damage groups (core/src/beams.cpp
// updateDamageGroups) and turn them into leaks, heat, wear and failing systems. Engineering models, deterministic
// (double precision, fixed order), part of the hashed vehicle state.
#include <algorithm>
#include <cmath>

#include "vehicle_impl.h"

namespace sbc {
namespace {

constexpr double kRadToRpm = 60.0 / (2.0 * 3.14159265358979323846);

// Severity of a damage group: twice its damaged share of beams plus 0.25 per impact, capped at 1.
double severity(const DamageGroupState& g) {
  if (g.firstStep < 0) return 0.0;
  const double bent = g.beams > 0 ? static_cast<double>(g.damaged) / g.beams : 0.0;
  return std::min(1.0, 2.0 * bent + 0.25 * g.impacts);
}

}  // namespace

void Vehicle::updateDamage(const Body& b, double dt, double speed) {
  const FluidsDesc& F = desc_.fluids;
  const size_t nw = desc_.wheels.size();
  uint32_t faults = faults_ & (fault::kSeized | fault::kEngineFailed | fault::kOutOfFuel);  // latched
  double coolantLeak = 0.0, oilLeak = 0.0, fuelLeak = 0.0, steering = 0.0, gearbox = 0.0, electrical = 0.0;
  std::fill(driveLost_.begin(), driveLost_.end(), uint8_t{0});
  std::fill(brakeFactor_.begin(), brakeFactor_.end(), 1.0);
  for (const DamageLinkDesc& l : desc_.damageLinks) {
    const double s = severity(b.damageGroups[static_cast<size_t>(l.group)]);
    if (s <= 0.0) continue;
    switch (l.effect) {
      case DamageEffect::kCoolantLeak: coolantLeak += l.rate * s; break;
      case DamageEffect::kOilLeak: oilLeak += l.rate * s; break;
      case DamageEffect::kFuelLeak: fuelLeak += l.rate * s; break;
      case DamageEffect::kSteering: steering = std::max(steering, s); break;
      case DamageEffect::kDriveLoss:
        if (s >= 0.4) driveLost_[static_cast<size_t>(l.wheel)] = 1;
        break;
      case DamageEffect::kBrakeLoss: {
        double& f = brakeFactor_[static_cast<size_t>(l.wheel)];
        f = std::min(f, s >= 0.5 ? 0.0 : 1.0 - s);
        break;
      }
      case DamageEffect::kGearbox: gearbox = std::max(gearbox, s); break;
      case DamageEffect::kElectrical: electrical = std::max(electrical, s); break;
    }
  }
  // Leaks drain the fluids (the fuel also burns).
  const double rpm = engineOmega_ * kRadToRpm;
  coolantL_ = std::max(0.0, coolantL_ - coolantLeak * dt);
  oilL_ = std::max(0.0, oilL_ - oilLeak * dt);
  const double burn = running_ ? (lastPower_ / (F.efficiency * F.fuelEnergy) + F.idleFuelLph / 3600.0) : 0.0;
  fuelL_ = std::max(0.0, fuelL_ - (burn + fuelLeak) * dt);
  if (coolantLeak > 0.0) faults |= fault::kCoolantLeak;
  if (oilLeak > 0.0) faults |= fault::kOilLeak;
  if (fuelLeak > 0.0) faults |= fault::kFuelLeak;

  // Cooling: heat in from the engine; out through the radiator above the thermostat, scaled by airflow and coolant.
  const double level = std::clamp(coolantL_ / F.coolantL * 1.5 - 0.25, 0.0, 1.0);
  const double flow = F.fanFlow + (1.0 - F.fanFlow) * std::min(1.0, std::fabs(speed) / F.fullFlowSpeed);
  const double heatIn = running_ ? F.heatShare * lastPower_ + F.idleHeatW : 0.0;
  const double open = std::clamp((coolantC_ - F.thermostatC) / 5.0 + 0.5, 0.0, 1.0);  // thermostat opening
  const double heatOut = F.radiatorUA * flow * level * open * (coolantC_ - F.ambientC)
                         + 40.0 * (coolantC_ - F.ambientC);  // block convection, always
  coolantC_ += (heatIn - heatOut) / F.heatCapacity * dt;
  // The engine management takes power down to 30 % between derateC and failC; driven on regardless, a dry engine
  // still overheats (idling, it does not).
  derate_ = std::clamp(1.0 - 0.7 * (coolantC_ - F.derateC) / (F.failC - F.derateC), 0.3, 1.0);
  if (coolantC_ > F.derateC) faults |= fault::kOverheat;
  if (coolantC_ >= F.failC) engineFailed_ = true;

  // Lubrication: pressure with speed and the oil left; starved bearings wear. Over-revving wears the engine too.
  const double oilLevel = std::clamp(oilL_ / F.oilL * 2.0 - 0.5, 0.0, 1.0);
  oilBar_ = running_ ? std::min<double>(F.maxOilBar, F.oilBarPer1000Rpm * rpm / 1000.0) * oilLevel : 0.0;
  if (running_ && oilBar_ < F.minOilBar && rpm > F.starveRpm) {
    engineWear_ = std::min(1.0, engineWear_ + F.seizeRate * dt);
    faults |= fault::kOilPressure;
  }
  const double over = rpm / desc_.engine.limiterRpm - 1.05;
  if (over > 0.0) {
    engineWear_ = std::min(1.0, engineWear_ + F.overrevRate * (over / 0.1) * dt);
    faults |= fault::kOverrev;
  }
  if (engineWear_ >= 1.0) {
    engineFailed_ = true;
    faults |= fault::kSeized;
  }
  if (fuelL_ <= 0.0) {
    engineFailed_ = true;
    faults |= fault::kOutOfFuel;
  }
  if (engineFailed_) {
    faults |= fault::kEngineFailed;
    running_ = false;
  }

  // Steering, gearbox, electrics.
  steerPlay_ = 0.2 * steering;
  steerPull_ = 0.25 * steering;
  steerJammed_ = steering >= 0.9;
  if (steering > 0.0) faults |= fault::kSteering;
  gearsLost_ = gearbox > 0.0 ? static_cast<int>(std::ceil(3.0 * gearbox)) : 0;
  if (gearsLost_ > 0) faults |= fault::kGearbox;
  electricalFailed_ = electrical >= 0.3;
  if (electricalFailed_) faults |= fault::kElectrical;
  for (size_t w = 0; w < nw; ++w) {
    if (driveLost_[w]) faults |= fault::kDrive;
    if (brakeFactor_[w] < 1.0) faults |= fault::kBrakes;
  }
  faults_ = faults;
}

}  // namespace sbc

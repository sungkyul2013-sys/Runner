// §6 tyre and wheel damage: punctures (sharp objects, pinch against the rim), blowouts, bead unseating, deflation and
// its effects, running flat until the tyre shreds and comes off, rim running (sparks), bent rims and hub bearings.
//
// The tyre's air is modelled where the body carries it: the cavity's pressure group (gauge), the sidewalls' stiffness
// in compression (their inflation stiffness) and the radial rate the vehicle applies at the hub. Deflation scales all
// three with the remaining pressure; the energy those changes move in or out of the body is booked as external work
// (the escaping air), so the §5.3 ledger stays closed. Shredding breaks every tread–rim beam: the tread ring becomes
// a part of its own (island split) and the wheel runs on its rim, whose nodes then meet the road through the ordinary
// contact model (steel on asphalt), with no tyre forces.
#include <algorithm>
#include <cmath>
#include <unordered_set>

#include "internal.h"
#include "sbc/det_math.h"
#include "sbc/scenes.h"
#include "sbc/world.h"
#include "vehicle_impl.h"

namespace sbc {

namespace {

DVec3 at(const Body& b, int i) { return {b.px[i], b.py[i], b.pz[i]}; }
DVec3 velocity(const Body& b, int i) { return {b.vx[i], b.vy[i], b.vz[i]}; }
double norm(DVec3 v) { return std::sqrt(dot(v, v)); }

// Structural share of the tyre that does not come from its air (carcass stiffness at zero pressure).
constexpr double kCarcassShare = 0.12;
constexpr double kFlat = 0.15;             // below this share of its pressure the tyre is flat
constexpr double kSpikeForce = 300.0;      // [N] tread load on a spike that pierces it
constexpr double kSpikeLeak = 1.0 / 12.0;  // [1/s] a spike strip empties a tyre in ≈ 12 s
constexpr double kPinchLeak = 0.25;        // [1/s] pinch cut: flat in ≈ 4 s
constexpr double kPinchGap = 0.005;        // [m] a loaded tread node this close to the rim radius is pinched
constexpr double kBlowoutPast = 0.025;     // [m] … and this far past it bursts the tyre
constexpr double kBlowoutLeak = 20.0;      // [1/s] ≈ 50 ms
constexpr double kBeadLeak = 5.0;          // [1/s]
constexpr double kBendSlow = 0.005, kBendFast = 0.02;          // rim plastic strain: slow and fast leak onset [-]
constexpr double kBendSlowLeak = 1.0 / 200.0, kBendFastLeak = 1.0 / 20.0;
constexpr double kBearingForce = 40000.0;  // [N] rim impact that damages the hub bearing

// Gas potential of pressure group g with gauge `gauge` at V0 (constraints.cpp): −(p0·V0·ln(V/V0) − p_amb·(V − V0)).
double gasEnergy(const Body& b, int g, double gauge) {
  if (b.groupBroken[static_cast<size_t>(g)]) return 0.0;
  const double v = detail::pressureGroupVolume(b, g);
  const double v0 = b.groupInitialVolume[static_cast<size_t>(g)];
  const double ambient = b.groupAmbientPressure[static_cast<size_t>(g)];
  if (!(v > 1e-9) || !(v0 > 0.0)) return 0.0;
  return -((gauge + ambient) * v0 * det::log(v / v0) - ambient * (v - v0));
}

// Elastic energy of beam i as it stands (its compression or tension rate).
double beamEnergy(const Body& b, int i) {
  const DVec3 d = at(b, b.beamB[i]) - at(b, b.beamA[i]);
  const double x = norm(d) - b.restLength[static_cast<size_t>(i)];
  const bool compressed = x < 0.0 && static_cast<BeamType>(b.beamType[static_cast<size_t>(i)]) == BeamType::kAnisotropic;
  const double k = compressed ? b.compressionStiffness[static_cast<size_t>(i)] : b.stiffness[static_cast<size_t>(i)];
  return 0.5 * k * x * x;
}

}  // namespace

void Vehicle::initTyres(const Body& b) {
  tyres_.assign(desc_.wheels.size(), TyreState{});
  spinNodes_.assign(desc_.wheels.size(), nullptr);
  for (size_t w = 0; w < desc_.wheels.size(); ++w) {
    const WheelDesc& wd = desc_.wheels[w];
    TyreState& t = tyres_[w];
    spinNodes_[w] = &wd.rotatingNodes;
    const std::unordered_set<int32_t> tread(wd.treadNodes.begin(), wd.treadNodes.end());
    for (const int32_t i : wd.rotatingNodes) {
      if (!tread.count(i)) t.rimNodes.push_back(i);
    }
    const std::unordered_set<int32_t> rim(t.rimNodes.begin(), t.rimNodes.end());
    for (int i = 0; i < b.beamCount(); ++i) {
      const int32_t a = b.beamA[static_cast<size_t>(i)], c = b.beamB[static_cast<size_t>(i)];
      if ((tread.count(a) && rim.count(c)) || (rim.count(a) && tread.count(c))) {
        t.carcass.push_back(i);
        if (static_cast<BeamType>(b.beamType[static_cast<size_t>(i)]) == BeamType::kAnisotropic) {
          t.sidewall.push_back(i);
          t.sidewallK0.push_back(b.compressionStiffness[static_cast<size_t>(i)]);
        }
      } else if (rim.count(a) && rim.count(c)) {
        t.rimBeams.push_back(i);
      }
    }
    {
      const DVec3 l = at(b, wd.axleLeft), r = at(b, wd.axleRight);
      const DVec3 c = (l + r) * 0.5, axis = (l - r) * (1.0 / norm(l - r));
      for (const int32_t i : t.rimNodes) {
        const DVec3 d = at(b, i) - c;
        t.rimRadius += norm(d - axis * dot(d, axis)) / static_cast<double>(t.rimNodes.size());
      }
    }
    for (int g = 0; g < b.pressureGroupCount() && t.group < 0; ++g) {
      for (int k = b.groupTriBegin[g] * 3; k < b.groupTriBegin[g + 1] * 3; ++k) {
        if (tread.count(b.pressureTri[static_cast<size_t>(k)])) {
          t.group = g;
          t.gauge0 = b.groupGaugePressure[static_cast<size_t>(g)];
          break;
        }
      }
    }
  }
}

void Vehicle::updateTyres(const World& world, Body& b, double dt, double speed, bool track) {
  const size_t nw = desc_.wheels.size();
  for (size_t w = 0; w < nw; ++w) {
    const WheelDesc& wd = desc_.wheels[w];
    const TyreParams& P = wd.tyre;
    TyreState& t = tyres_[w];
    t.sparks = 0.0;
    t.flags &= ~tyre_flag::kRimContact;
    if (wheelLost_[w]) continue;
    auto detached = [&](int32_t i) { return (b.flags[static_cast<size_t>(i)] & node_flag::kDetached) != 0; };

    // Rim contact: its nodes' static contact force and sliding speed (sparks); the tyre between them and the
    // obstacle is pinched.
    double rimForce = 0.0, slide = 0.0;
    DVec3 point;
    for (const int32_t i : t.rimNodes) {
      const double fn = b.patchForce[static_cast<size_t>(i)];
      if (!(fn > 0.0) || detached(i)) continue;
      const DVec3 n{b.patchNx[static_cast<size_t>(i)], b.patchNy[static_cast<size_t>(i)], b.patchNz[static_cast<size_t>(i)]};
      const DVec3 v = velocity(b, i);
      const double nn = dot(n, n);
      const DVec3 vt = nn > 0.0 ? v - n * (dot(v, n) / nn) : v;
      rimForce += fn;
      slide += fn * norm(vt);
      point += at(b, i) * fn;
    }
    if (rimForce > 1.0) {
      t.flags |= tyre_flag::kRimContact;
      slide /= rimForce;
      t.sparkPoint = point * (1.0 / rimForce);
      t.sparks = std::min(1.0, rimForce * slide / 2.0e5);  // 20 kN at 10 m/s: a full shower
    }
    if (rimForce > kBearingForce) {
      t.bearing = std::min(1.0, t.bearing + 0.25 * rimForce / kBearingForce);
      t.flags |= tyre_flag::kBearing;
    }

    // A tyre torn off (shredded here, or ripped away in a crash) leaves the rim.
    if (!(t.flags & tyre_flag::kShredded) && detached(wd.treadNodes.front())) {
      t.flags |= tyre_flag::kShredded | tyre_flag::kFlat;
      t.inflation = 0.0;
    }
    if (t.flags & tyre_flag::kShredded) {
      spinNodes_[w] = &t.rimNodes;
      continue;
    }

    // ---- damage triggers ----
    for (const int32_t i : wd.treadNodes) {
      if (b.patchForce[static_cast<size_t>(i)] > kSpikeForce && b.patchMaterial[static_cast<size_t>(i)] == material::kSpikes) {
        t.leak = std::max(t.leak, kSpikeLeak);
        t.flags |= tyre_flag::kPuncture;
      }
    }
    // Pinch: how close a loaded tread node came to the rim (the tyre bottomed out on an edge), or the rim itself.
    double closest = 1e9;
    {
      const DVec3 l = at(b, wd.axleLeft), r = at(b, wd.axleRight);
      const DVec3 c = (l + r) * 0.5, axis = (l - r) * (1.0 / std::max(norm(l - r), 1e-9));
      for (const int32_t i : wd.treadNodes) {
        if (!(b.patchForce[static_cast<size_t>(i)] > 0.0)) continue;
        const DVec3 d = at(b, i) - c;
        closest = std::min(closest, norm(d - axis * dot(d, axis)));
      }
    }
    if (t.inflation > kFlat && (closest < t.rimRadius + kPinchGap || rimForce > P.pinchForce)) {
      t.leak = std::max(t.leak, kPinchLeak);
      t.flags |= tyre_flag::kPuncture;
    }
    if (t.inflation > kFlat && (closest < t.rimRadius - kBlowoutPast || rimForce > P.blowoutForce)) {
      t.leak = std::max(t.leak, kBlowoutLeak);
      t.flags |= tyre_flag::kBlowout;
    }
    double bend = 0.0;
    for (const int32_t i : t.rimBeams) {
      const double l0 = b.initialRestLength[static_cast<size_t>(i)];
      if (l0 > 0.0) bend = std::max(bend, b.plasticDeformation[static_cast<size_t>(i)] / l0);
    }
    t.rimBend = bend;
    if (bend > kBendSlow) {
      t.flags |= tyre_flag::kRimBent;
      t.leak = std::max(t.leak, bend > kBendFast ? kBendFastLeak : kBendSlowLeak);
    }
    // Bead: a soft tyre cornered hard rolls off its seat (last step's patch force and load).
    const WheelTelemetry& last = telemetry_.wheels[w];
    if (t.inflation < 0.6 && std::fabs(speed) > 5.0 && last.load > 500.0f && std::fabs(last.forceY) > 0.7f * last.load) {
      t.leak = std::max(t.leak, kBeadLeak);
      t.flags |= tyre_flag::kBeadUnseated;
    }

    // ---- deflation ----
    t.inflation = std::max(0.0, t.inflation - t.leak * dt);
    if (t.inflation < kFlat) t.flags |= tyre_flag::kFlat;
    // A flat tyre is open to the air through its hole: its cavity no longer holds a charge that crushing would
    // compress (a sealed isothermal gas crushed to a sliver of its volume turns into a spring too stiff for its light
    // tread and rim nodes). The gas group goes; what it held is released.
    if ((t.flags & tyre_flag::kFlat) && t.group >= 0 && !b.groupBroken[static_cast<size_t>(t.group)]) {
      if (track) b.losses.fracture += gasEnergy(b, t.group, b.groupGaugePressure[static_cast<size_t>(t.group)]);
      b.groupBroken[static_cast<size_t>(t.group)] = 1;
    }
    const double s = kCarcassShare + (1.0 - kCarcassShare) * t.inflation;
    if (std::fabs(s - t.applied) > 1e-4 || (t.inflation == 0.0 && t.applied != kCarcassShare)) {
      // Write the new air stiffness into the body; the energy that moves is the air's work.
      double before = 0.0, after = 0.0;
      if (track) {
        for (const int32_t i : t.sidewall) before += beamEnergy(b, i);
        if (t.group >= 0) before += gasEnergy(b, t.group, b.groupGaugePressure[static_cast<size_t>(t.group)]);
      }
      for (size_t k = 0; k < t.sidewall.size(); ++k) {
        b.compressionStiffness[static_cast<size_t>(t.sidewall[k])] = static_cast<float>(t.sidewallK0[k] * s);
      }
      if (t.group >= 0) b.groupGaugePressure[static_cast<size_t>(t.group)] = static_cast<float>(t.gauge0 * t.inflation);
      if (track) {
        for (const int32_t i : t.sidewall) after += beamEnergy(b, i);
        if (t.group >= 0) after += gasEnergy(b, t.group, b.groupGaugePressure[static_cast<size_t>(t.group)]);
        b.losses.external += after - before;
      }
      t.applied = s;
    }

    // ---- running flat: the carcass heats and tears; past its distance the tyre comes off ----
    if (t.inflation < 0.1) {
      const double v = std::fabs(speed);
      t.flatRun += v * dt * (v / 20.0) * (v / 20.0);
      if (t.flatRun > P.shredDistance) {
        for (const int32_t i : t.carcass) {
          if (b.broken[static_cast<size_t>(i)]) continue;
          if (track) b.losses.fracture += beamEnergy(b, i);
          b.broken[static_cast<size_t>(i)] = 1;
          b.brokenBeamCount++;
          b.topologyVersion++;
        }
        if (t.group >= 0 && !b.groupBroken[static_cast<size_t>(t.group)]) {
          if (track) b.losses.fracture += gasEnergy(b, t.group, b.groupGaugePressure[static_cast<size_t>(t.group)]);
          b.groupBroken[static_cast<size_t>(t.group)] = 1;
        }
        t.flags |= tyre_flag::kShredded;
      }
    }

    // ---- what the tyre model sees ----
    t.muScale = 0.4 + 0.6 * std::sqrt(t.inflation);
    t.slipScale = 0.35 + 0.65 * t.inflation;  // cornering and braking stiffness
    t.crrScale = 1.0 + 6.0 * (1.0 - t.inflation);
    t.radialScale = s;
  }
  (void)world;
}

}  // namespace sbc

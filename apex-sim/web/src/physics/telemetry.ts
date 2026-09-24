// Vehicle telemetry records published by the physics worker (core sbc.h: SBC_VT_HEADER / SBC_VT_WHEEL layout; the
// worker stores the vehicle's body index in header field 30). Positions are body-local in the core; the client adds
// the body origin and subtracts its render origin, so everything here is in render space.
import { VT_HEADER, VT_WHEEL } from './layout';

/** Header field indices (Float32). */
export const VT = {
  time: 0,
  speed: 1,
  engineRpm: 2,
  engineTorque: 3,
  clutchTorque: 4,
  gear: 5,
  flags: 6, // 1 shifting, 2 engine running, 4 TCS active
  throttle: 7,
  brake: 8,
  steer: 9,
  clutch: 10,
  accelLong: 11,
  accelLat: 12,
  odometer: 13,
  position: 14,
  forward: 17,
  up: 20,
  left: 23,
  refCenterModel: 26,
  wheelCount: 29,
  body: 30,
  // §4.4 fluids and engine health
  coolantC: 32,
  coolantL: 33,
  oilBar: 34,
  oilL: 35,
  fuelL: 36,
  engineWear: 37,
  derate: 38,
  faults: 39, // core fault:: bits
  airbags: 40, // core airbag:: bits
  crashTime: 41,
  crashPeakG: 42,
  crashDeltaV: 43,
  // crash events (§5.3 event log), the latest one
  crashEvents: 44,
  eventActive: 45,
  eventStart: 46,
  eventPeakG: 47,
  eventPeakForce: 48,
  eventDeltaV: 49,
  eventAbsorbed: 50,
  eventSpeed: 51,
  eventPosition: 52, // world frame
  eventVelocity: 55,
  // §10 aerodynamics
  aeroDrag: 58,
  downforceFront: 59,
  downforceRear: 60,
  airspeed: 61,
} as const;

/** Wheel field indices (Float32, relative to the wheel's record). */
export const VW = {
  spin: 0,
  angle: 1,
  load: 2,
  slipRatio: 3,
  slipAngle: 4,
  forceX: 5,
  forceY: 6,
  brakeTorque: 7,
  driveTorque: 8,
  loadedRadius: 9,
  flags: 10, // 1 contact, 2 ABS active
  center: 11,
  axis: 14,
  tyreRadius: 17,
  // §6 tyre damage
  pressure: 18,
  tyreFlags: 19,
  sparks: 20,
  sparkPoint: 21,
  rimBend: 24,
  nominalPressure: 25,
  // §4.4 alignment
  camber: 26,
  toe: 27,
  camber0: 28, // at the vehicle's first step (design geometry)
  toe0: 29,
} as const;

/** Core tyre_flag:: bits (sbc/vehicle.h). */
export const TYRE = {
  puncture: 1 << 0,
  blowout: 1 << 1,
  beadUnseated: 1 << 2,
  flat: 1 << 3,
  rimContact: 1 << 4,
  shredded: 1 << 5,
  rimBent: 1 << 6,
  bearing: 1 << 7,
} as const;

export type V3 = [number, number, number];

export interface WheelState {
  spin: number; // [rad/s] relative to the carrier
  angle: number; // [rad] spin angle (wrapped to ±π)
  load: number; // [N]
  slipRatio: number;
  slipAngle: number; // [rad]
  contact: boolean;
  abs: boolean;
  center: V3; // render space
  axis: V3; // unit, points to the vehicle's left
  tyreRadius: number;
  loadedRadius: number;
  // §6 tyre damage
  pressure: number; // [bar]
  nominalPressure: number; // [bar]
  tyreFlags: number; // TYRE bits
  sparks: number; // rim-on-ground spark intensity [0, 1]
  sparkPoint: V3; // render space
  rimBend: number; // plastic strain of the rim [-]
  camber: number; // [rad] relative to the chassis, negative = top inward (§4.4 bent suspension)
  toe: number; // [rad] positive = toe-in (front wheels: steering included)
  camber0: number; // [rad] design camber (the vehicle's first step)
  toe0: number; // [rad] design toe
}

export interface VehicleState {
  body: number;
  time: number;
  speed: number; // [m/s] forward
  engineRpm: number;
  gear: number; // −1 R, 0 N, 1…
  shifting: boolean;
  engineRunning: boolean;
  tcs: boolean;
  throttle: number;
  brake: number;
  steer: number;
  accelLong: number;
  accelLat: number;
  odometer: number;
  position: V3; // chassis reference point, render space
  forward: V3;
  up: V3;
  left: V3;
  refCenterModel: V3; // the reference point's position in the model (GLB) frame
  wheels: WheelState[];
  // §4.4 fluids and engine health
  coolantC: number;
  coolantL: number;
  oilBar: number;
  oilL: number;
  fuelL: number;
  engineWear: number; // [0, 1]
  derate: number; // power available [0, 1]
  faults: number; // core fault:: bits (see FAULT)
  airbags: number; // core airbag:: bits (see AIRBAG)
  crashTime: number; // [s] first crash detection, −1: none
  crashPeakG: number;
  crashDeltaV: number; // [m/s] largest within 50 ms
  // Crash events (§5.3 event log): how many so far, and the latest (still open while eventActive).
  crashEvents: number;
  eventActive: boolean;
  eventStart: number; // [s]
  eventPeakG: number;
  eventPeakForce: number; // [N]
  eventDeltaV: number; // [m/s]
  eventAbsorbed: number; // [J] plastic + fracture work in the car's structure
  eventSpeed: number; // [m/s] at the start
  eventPosition: V3; // render space, at the start
  eventVelocity: V3; // [m/s] at the start
  // §10 aerodynamics (surface, wings, residual lift)
  aeroDrag: number; // [N]
  downforceFront: number; // [N]
  downforceRear: number; // [N]
  airspeed: number; // [m/s] forward through the air (wind and slipstream included)
}

/** Core airbag bits (sbc/vehicle.h airbag::). */
export const AIRBAG = { driver: 1, passenger: 2, sideLeft: 4, sideRight: 8 } as const;

/** Core fault bits (sbc/vehicle.h fault::). */
export const FAULT = {
  coolantLeak: 1 << 0,
  overheat: 1 << 1,
  oilLeak: 1 << 2,
  oilPressure: 1 << 3,
  seized: 1 << 4,
  fuelLeak: 1 << 5,
  outOfFuel: 1 << 6,
  steering: 1 << 7,
  drive: 1 << 8,
  brakes: 1 << 9,
  gearbox: 1 << 10,
  electrical: 1 << 11,
  overrev: 1 << 12,
  engineFailed: 1 << 13,
} as const;

const v3 = (r: ArrayLike<number>, i: number): V3 => [r[i], r[i + 1], r[i + 2]];

/** Decodes one record; `origin` = body origin − render origin (added to the body-local positions); `renderOrigin`
 *  (subtracted from world-frame positions). */
export function decodeVehicle(r: Float32Array, origin: V3, renderOrigin: V3 = [0, 0, 0]): VehicleState {
  const flags = r[VT.flags];
  const wheelCount = Math.max(0, Math.min(Math.round(r[VT.wheelCount]), (r.length - VT_HEADER) / VT_WHEEL));
  const wheels: WheelState[] = [];
  for (let i = 0; i < wheelCount; i++) {
    const o = VT_HEADER + VT_WHEEL * i;
    const wf = r[o + VW.flags];
    wheels.push({
      spin: r[o + VW.spin],
      angle: r[o + VW.angle],
      load: r[o + VW.load],
      slipRatio: r[o + VW.slipRatio],
      slipAngle: r[o + VW.slipAngle],
      contact: (wf & 1) !== 0,
      abs: (wf & 2) !== 0,
      center: [origin[0] + r[o + VW.center], origin[1] + r[o + VW.center + 1], origin[2] + r[o + VW.center + 2]],
      axis: v3(r, o + VW.axis),
      tyreRadius: r[o + VW.tyreRadius],
      loadedRadius: r[o + VW.loadedRadius],
      pressure: r[o + VW.pressure],
      nominalPressure: r[o + VW.nominalPressure],
      tyreFlags: Math.round(r[o + VW.tyreFlags]),
      sparks: r[o + VW.sparks],
      sparkPoint: [origin[0] + r[o + VW.sparkPoint], origin[1] + r[o + VW.sparkPoint + 1], origin[2] + r[o + VW.sparkPoint + 2]],
      rimBend: r[o + VW.rimBend],
      camber: r[o + VW.camber],
      toe: r[o + VW.toe],
      camber0: r[o + VW.camber0],
      toe0: r[o + VW.toe0],
    });
  }
  return {
    body: Math.round(r[VT.body]),
    time: r[VT.time],
    speed: r[VT.speed],
    engineRpm: r[VT.engineRpm],
    gear: Math.round(r[VT.gear]),
    shifting: (flags & 1) !== 0,
    engineRunning: (flags & 2) !== 0,
    tcs: (flags & 4) !== 0,
    throttle: r[VT.throttle],
    brake: r[VT.brake],
    steer: r[VT.steer],
    accelLong: r[VT.accelLong],
    accelLat: r[VT.accelLat],
    odometer: r[VT.odometer],
    position: [origin[0] + r[VT.position], origin[1] + r[VT.position + 1], origin[2] + r[VT.position + 2]],
    forward: v3(r, VT.forward),
    up: v3(r, VT.up),
    left: v3(r, VT.left),
    refCenterModel: v3(r, VT.refCenterModel),
    coolantC: r[VT.coolantC],
    coolantL: r[VT.coolantL],
    oilBar: r[VT.oilBar],
    oilL: r[VT.oilL],
    fuelL: r[VT.fuelL],
    engineWear: r[VT.engineWear],
    derate: r[VT.derate],
    faults: Math.round(r[VT.faults]),
    airbags: Math.round(r[VT.airbags]),
    crashTime: r[VT.crashTime],
    crashPeakG: r[VT.crashPeakG],
    crashDeltaV: r[VT.crashDeltaV],
    crashEvents: Math.round(r[VT.crashEvents]),
    eventActive: r[VT.eventActive] > 0.5,
    eventStart: r[VT.eventStart],
    eventPeakG: r[VT.eventPeakG],
    eventPeakForce: r[VT.eventPeakForce],
    eventDeltaV: r[VT.eventDeltaV],
    eventAbsorbed: r[VT.eventAbsorbed],
    eventSpeed: r[VT.eventSpeed],
    eventPosition: [r[VT.eventPosition] - renderOrigin[0], r[VT.eventPosition + 1] - renderOrigin[1], r[VT.eventPosition + 2] - renderOrigin[2]],
    eventVelocity: v3(r, VT.eventVelocity),
    aeroDrag: r[VT.aeroDrag],
    downforceFront: r[VT.downforceFront],
    downforceRear: r[VT.downforceRear],
    airspeed: r[VT.airspeed],
    wheels,
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
function unit(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
/** Shortest-arc blend of two wrapped angles. */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

/** Pose blend between two published states (render interpolation, A§2); scalars come from `b`. */
export function blendVehicle(a: VehicleState, b: VehicleState, t: number): VehicleState {
  if (a.wheels.length !== b.wheels.length || t >= 1) return b;
  return {
    ...b,
    position: lerp3(a.position, b.position, t),
    forward: unit(lerp3(a.forward, b.forward, t)),
    up: unit(lerp3(a.up, b.up, t)),
    left: unit(lerp3(a.left, b.left, t)),
    wheels: b.wheels.map((w, i) => ({
      ...w,
      center: lerp3(a.wheels[i].center, w.center, t),
      axis: unit(lerp3(a.wheels[i].axis, w.axis, t)),
      angle: lerpAngle(a.wheels[i].angle, w.angle, t),
    })),
  };
}

/** Gear label for the dashboard: R, N, 1…, with "M" prefix in manual mode. */
export function gearLabel(gear: number, manual: boolean): string {
  if (gear < 0) return 'R';
  if (gear === 0) return 'N';
  return manual ? `M${gear}` : `D${gear}`;
}

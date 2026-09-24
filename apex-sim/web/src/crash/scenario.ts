// Crash test launcher (M2, §12.7 in part): where and how fast each car starts so that it strikes its target at the
// set speed. No driver: the cars are launched at speed in neutral (the "cable pull" of a real test ends just before
// the impact). Scene "crash": a rigid barrier faces −Z at z = 0 and spans x ∈ [−6, 0]; car-to-car runs meet at
// CAR_TO_CAR_POINT on open ground.
import type { VehiclePose } from '../physics/messages';

export type V3 = [number, number, number];
export type CrashKind = 'fullWall' | 'offsetWall' | 'carToCar';

export interface CrashSpec {
  kind: CrashKind;
  speedA: number;  // [km/h]
  speedB: number;  // [km/h] car-to-car: the second car (0: parked)
  angle: number;   // [deg] car-to-car: B's heading relative to head-on (0 head-on, 90 into A's path from the side)
  offset: number;  // [m] car-to-car: B's path shifted toward A's left (+X)
  overlap: number; // [0, 1] offset wall: share of the car's width that strikes the barrier
}

/** A car's footprint about its model origin (ground level, mid-wheelbase). */
export interface CarDims {
  front: number; // [m] origin to the front bumper
  width: number; // [m]
}

export const SPEED_PRESETS = [32, 50, 56, 64, 80, 100] as const; // [km/h] §12.7
export const BARRIER_EDGE_X = 0;       // the barrier's free end
export const BARRIER_HALF_WIDTH = 3;   // [m] it spans x ∈ [−6, 0]
export const CAR_TO_CAR_POINT: V3 = [40, 0, 0];
const LEAD_TIME = 0.3; // [s] of travel before the impact
const MIN_RUNUP = 1.5; // [m]

export interface CrashLaunch {
  a: VehiclePose;
  b: VehiclePose | null;
  focus: V3; // where the impact happens
}

const runup = (kmh: number) => Math.max(MIN_RUNUP, (kmh / 3.6) * LEAD_TIME);

export function crashLaunch(spec: CrashSpec, dimsA: CarDims, dimsB: CarDims = dimsA): CrashLaunch {
  const vA = spec.speedA / 3.6;
  if (spec.kind !== 'carToCar') {
    // Full width: centred on the barrier. Offset: the car's +X side overlaps the barrier by overlap·width.
    const overlap = spec.kind === 'fullWall' ? 1 : Math.min(Math.max(spec.overlap, 0.05), 1);
    const x = spec.kind === 'fullWall' ? BARRIER_EDGE_X - BARRIER_HALF_WIDTH : BARRIER_EDGE_X + dimsA.width * (0.5 - overlap);
    const z = -(dimsA.front + runup(spec.speedA));
    return { a: { position: [x, 0, z], yaw: 0, speed: vA }, b: null, focus: [x, 0.5, 0] };
  }
  // Car-to-car: A drives +Z toward the meeting point P; B comes at it along heading yaw = π + angle. Head-on (angle 0)
  // the fronts meet at P; square to A's path (90°) A's front meets B's side, B's centre crossing P.
  const [px, , pz] = CAR_TO_CAR_POINT;
  const ang = (spec.angle * Math.PI) / 180;
  const c = Math.abs(Math.cos(ang)), s = Math.abs(Math.sin(ang));
  const t = LEAD_TIME;
  const aimA = dimsA.front + (dimsB.width / 2) * s;           // A's origin behind P when its front strikes
  const a: VehiclePose = { position: [px, 0, pz - aimA - Math.max(MIN_RUNUP, vA * t)], yaw: 0, speed: vA };
  const vB = spec.speedB / 3.6;
  const yawB = Math.PI + ang;
  const dir: V3 = [Math.sin(yawB), 0, Math.cos(yawB)];         // B's heading
  const aimB = dimsB.front * c;                                 // B's origin behind its strike point
  const back = aimB + (vB > 0 ? Math.max(MIN_RUNUP * c, vB * t) : 0);
  const b: VehiclePose = {
    position: [px + spec.offset - dir[0] * back, 0, pz - dir[2] * back],
    yaw: yawB,
    speed: vB,
  };
  return { a, b, focus: [px + spec.offset / 2, 0.5, pz] };
}

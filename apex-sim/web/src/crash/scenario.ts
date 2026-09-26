// Crash test launcher (M2, §12.7): where and how fast each car starts so that it strikes its target at the set speed.
// No driver: the cars are launched at speed in neutral (the "cable pull" of a real test ends just before the impact).
// Scene "crash" (core scenes.cpp): a rigid barrier faces −Z at z = 0 and spans x ∈ [−6, 0]; car-to-car runs meet at
// CAR_TO_CAR_POINT on open ground; a 254 mm side pole stands at POLE; a rollover kicker lies under the right-hand
// wheels of a car running +Z along x = ROLLOVER_X; drops fall at DROP_POINT.
import type { Localized } from '../ui/i18n';
import type { VehiclePose } from '../physics/messages';

export type V3 = [number, number, number];
export type CrashKind = 'fullWall' | 'offsetWall' | 'carToCar' | 'pole' | 'rollover' | 'drop' | 'crush';

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
  rear?: number; // [m] origin to the rear bumper (default: front)
}

export const SPEED_PRESETS = [32, 50, 56, 64, 80, 100] as const; // [km/h] §12.7
export const BARRIER_EDGE_X = 0;       // the barrier's free end
export const BARRIER_HALF_WIDTH = 3;   // [m] it spans x ∈ [−6, 0]
export const CAR_TO_CAR_POINT: V3 = [40, 0, 0];
export const POLE: V3 = [-25, 0, 25];
export const ROLLOVER_X = -45;      // the kicker's inner edge is 0.2 m right of a car centred here
export const ROLLOVER_Z = 20;       // where the kicker starts
export const DROP_POINT: V3 = [-60, 0, 0];
export const CRUSH_POINT: V3 = [-90, 0, 0]; // the dump-truck crush test's parked car (crash/CrashExtras.ts)
const G = 9.81;
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
  if (spec.kind === 'pole') {
    // Side pole: the car slides sideways (toward its left, +X) into the pole, which meets its driver's door (the
    // door and B-pillar region, ≈ 0.2 m behind the car's middle; the pole test aligns it with the driver's head).
    const x = POLE[0] - dimsA.width / 2 - 0.13 - Math.max(MIN_RUNUP, vA * LEAD_TIME);
    return { a: { position: [x, 0, POLE[2] + 0.2], yaw: 0, speed: 0, velocity: [vA, 0, 0] }, b: null, focus: [POLE[0], 0.8, POLE[2]] };
  }
  if (spec.kind === 'rollover') {
    const z = ROLLOVER_Z - dimsA.front - Math.max(4, vA * 0.6);
    return { a: { position: [ROLLOVER_X, 0, z], yaw: 0, speed: vA }, b: null, focus: [ROLLOVER_X, 0.8, ROLLOVER_Z + 3] };
  }
  if (spec.kind === 'crush') {
    // Parked; the dump trucks come down on it (CrashLab releases them after the launch).
    return { a: { position: [CRUSH_POINT[0], 0.05, CRUSH_POINT[2]], yaw: 0, speed: 0 }, b: null, focus: [CRUSH_POINT[0], 1.2, CRUSH_POINT[2]] };
  }
  if (spec.kind === 'drop') {
    // Falls flat from the height that gives the set impact speed: h = v² / 2g.
    const h = (vA * vA) / (2 * G);
    return { a: { position: [DROP_POINT[0], h, DROP_POINT[2]], yaw: 0, speed: 0 }, b: null, focus: [DROP_POINT[0], 0.8, DROP_POINT[2]] };
  }
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
  // B's origin behind its strike point along its heading: its front (head-on, angled), its side (90°: 0), or ahead of
  // it by its rear overhang when A runs into its back (beyond 90°: rear impacts).
  const rearEnd = Math.abs(spec.angle) > 90;
  const aimB = rearEnd ? -(dimsB.rear ?? dimsB.front) * c : dimsB.front * c;
  const back = aimB + (vB > 0 ? Math.max(MIN_RUNUP * c, vB * t) : 0);
  const b: VehiclePose = {
    position: [px + spec.offset - dir[0] * back, 0, pz - dir[2] * back],
    yaw: yawB,
    speed: vB,
  };
  return { a, b, focus: [px + spec.offset / 2, 0.5, pz] };
}

/** Ready-made tests (§12.7): the crash lab's scenario tiles. */
export interface CrashPreset {
  id: string;
  label: Localized;
  note: Localized;
  spec: Partial<CrashSpec> & { kind: CrashKind };
}

export const CRASH_PRESETS: CrashPreset[] = [
  { id: 'frontal', label: { ko: '정면 풀랩', en: 'Full-width frontal' }, note: { ko: '고정벽 · 56 km/h', en: 'Rigid wall · 56 km/h' }, spec: { kind: 'fullWall', speedA: 56 } },
  { id: 'offset', label: { ko: '오프셋 40 %', en: 'Offset 40 %' }, note: { ko: '고정벽 · 64 km/h', en: 'Rigid wall · 64 km/h' }, spec: { kind: 'offsetWall', speedA: 64, overlap: 0.4 } },
  { id: 'smallOverlap', label: { ko: '스몰 오버랩 25 %', en: 'Small overlap 25 %' }, note: { ko: '고정벽 · 64 km/h', en: 'Rigid wall · 64 km/h' }, spec: { kind: 'offsetWall', speedA: 64, overlap: 0.25 } },
  { id: 'headOn', label: { ko: '차대차 정면', en: 'Car to car, head-on' }, note: { ko: '64 + 64 km/h', en: '64 + 64 km/h' }, spec: { kind: 'carToCar', speedA: 64, speedB: 64, angle: 0, offset: 0 } },
  { id: 'side', label: { ko: '측면 충돌', en: 'Side impact' }, note: { ko: '정지 차 옆면 · 50 km/h', en: 'Parked car side · 50 km/h' }, spec: { kind: 'carToCar', speedA: 50, speedB: 0, angle: 90, offset: 0 } },
  { id: 'pole', label: { ko: '측면 기둥', en: 'Side pole' }, note: { ko: 'Ø 254 mm · 32 km/h', en: 'Ø 254 mm · 32 km/h' }, spec: { kind: 'pole', speedA: 32 } },
  { id: 'rear', label: { ko: '후방 추돌', en: 'Rear impact' }, note: { ko: '정지 차 뒤 · 50 km/h', en: 'Parked car rear · 50 km/h' }, spec: { kind: 'carToCar', speedA: 50, speedB: 0, angle: 180, offset: 0 } },
  { id: 'rollover', label: { ko: '전복 램프', en: 'Rollover ramp' }, note: { ko: '한쪽 바퀴 킥커 · 60 km/h', en: 'One-side kicker · 60 km/h' }, spec: { kind: 'rollover', speedA: 60 } },
  { id: 'drop', label: { ko: '낙하', en: 'Drop' }, note: { ko: '착지 32 km/h (4 m)', en: 'Lands at 32 km/h (4 m)' }, spec: { kind: 'drop', speedA: 32 } },
  { id: 'highSpeed', label: { ko: '초고속 벽', en: 'High-speed wall' }, note: { ko: '고정벽 · 200 km/h', en: 'Rigid wall · 200 km/h' }, spec: { kind: 'fullWall', speedA: 200 } },
  { id: 'crush', label: { ko: '덤프트럭 압착', en: 'Dump-truck crush' }, note: { ko: '16 t 트럭 두 대가 덮침', en: 'Two 16 t trucks come down' }, spec: { kind: 'crush', speedA: 0 } },
];

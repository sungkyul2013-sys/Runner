import { describe, expect, it } from 'vitest';
import { crashLaunch, type CrashSpec } from './scenario';
import { EventLog } from './events';
import type { VehicleState } from '../physics/telemetry';

const dims = { front: 2.3, width: 1.9 };
const spec = (s: Partial<CrashSpec>): CrashSpec => ({ kind: 'fullWall', speedA: 64, speedB: 0, angle: 0, offset: 0, overlap: 0.4, ...s });

describe('crash launcher', () => {
  it('starts a wall run in front of the barrier, centred, at the set speed', () => {
    const l = crashLaunch(spec({ speedA: 64 }), dims);
    expect(l.a.position[0]).toBe(-3);
    expect(l.a.position[2]).toBeLessThan(-dims.front);
    expect(l.a.speed).toBeCloseTo(64 / 3.6, 6);
    expect(l.b).toBeNull();
  });

  it('overlaps the barrier edge by the set share of the width', () => {
    const l = crashLaunch(spec({ kind: 'offsetWall', overlap: 0.4 }), dims);
    // x ≤ 0 is barrier: the car spans [x − w/2, x + w/2], of which 0.4 w lies at x ≤ 0.
    const x = l.a.position[0];
    expect(Math.min(dims.width, Math.max(0, 0 - (x - dims.width / 2)))).toBeCloseTo(0.4 * dims.width, 6);
  });

  it('brings two cars together at the meeting point at the same time', () => {
    for (const angle of [0, 45, 90]) {
      const l = crashLaunch(spec({ kind: 'carToCar', speedA: 50, speedB: 50, angle }), dims);
      const tA = (-l.a.position[2] - dims.front - (dims.width / 2) * Math.abs(Math.sin((angle * Math.PI) / 180))) / l.a.speed;
      const b = l.b!;
      const dir = [Math.sin(b.yaw), Math.cos(b.yaw)];
      // B's strike point (front for head-on, centre when square) reaches the meeting point x = 40, z = 0.
      const reach = dims.front * Math.abs(Math.cos((angle * Math.PI) / 180));
      const along = (40 - b.position[0]) * dir[0] + (0 - b.position[2]) * dir[1];
      const tB = (along - reach) / b.speed;
      expect(tA).toBeCloseTo(tB, 5);
    }
  });

  it('parks a stationary second car at the meeting point', () => {
    const l = crashLaunch(spec({ kind: 'carToCar', speedB: 0, angle: 90 }), dims);
    expect(l.b!.speed).toBe(0);
    expect(l.b!.position[0]).toBeCloseTo(40, 6);
    expect(l.b!.position[2]).toBeCloseTo(0, 6);
  });
});

function state(p: Partial<VehicleState>): VehicleState {
  return {
    crashEvents: 1, eventActive: false, eventStart: 1, eventPeakG: 30, eventPeakForce: 4.7e5, eventDeltaV: 18, eventAbsorbed: 1e5,
    eventSpeed: 17.8, eventPosition: [0, 0.5, -2], eventVelocity: [0, 0, 17.8], ...p,
  } as VehicleState;
}

describe('collision event log', () => {
  it('pairs two cars whose events begin together into one car-to-car row', () => {
    const log = new EventLog();
    log.observe('A', state({ eventStart: 1.0, eventVelocity: [0, 0, 13.9], eventAbsorbed: 6e4 }));
    log.observe('B', state({ eventStart: 1.01, eventVelocity: [0, 0, -13.9], eventAbsorbed: 5e4, eventPeakForce: 5e5 }));
    const rows = log.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0].cars).toEqual(['A', 'B']);
    expect(rows[0].relativeSpeed).toBeCloseTo(27.8, 6);
    expect(rows[0].absorbed).toBe(1.1e5);
    expect(rows[0].peakForce).toBe(5e5);
  });

  it("keeps a car's own events apart and updates an open one", () => {
    const log = new EventLog();
    expect(log.observe('A', state({ eventActive: true, eventPeakG: 10 }))).toBe(true);
    expect(log.observe('A', state({ eventActive: true, eventPeakG: 10 }))).toBe(false);
    expect(log.observe('A', state({ eventActive: false, eventPeakG: 25 }))).toBe(true);
    log.observe('A', state({ crashEvents: 2, eventStart: 3, eventPeakG: 5 }));
    const rows = log.rows();
    expect(rows.map((r) => r.peakG[0])).toEqual([25, 5]);
    expect(rows.every((r) => r.cars.length === 1)).toBe(true);
  });
});

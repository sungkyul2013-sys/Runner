import { describe, expect, it } from 'vitest';
import { blendSpin } from './telemetry';

const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

describe('wheel spin blend between published frames', () => {
  it('turns the way the wheel spins, also past half a turn per frame', () => {
    // 250 km/h on a 0.33 m wheel: 210 rad/s, 3.5 rad in a 16.7 ms frame — the shortest way round is backwards.
    const spin = 210, dt = 1 / 60, a = 2.9, b = wrap(a + spin * dt);
    const mid = blendSpin(a, b, spin, spin, dt, 0.5);
    expect(wrap(mid - (a + 0.5 * spin * dt))).toBeCloseTo(0, 6);
    // Monotonic forward through the frame.
    let last = a;
    for (let t = 0.1; t <= 1.0001; t += 0.1) {
      const x = blendSpin(a, b, spin, spin, dt, t);
      expect(x).toBeGreaterThan(last);
      last = x;
    }
    expect(wrap(last - b)).toBeCloseTo(0, 6);
  });

  it('still ends on the newest angle when the spin rate disagrees with the turn (a locked wheel, a slow phone)', () => {
    const a = 0.2, b = -0.3;
    expect(wrap(blendSpin(a, b, 30, 0, 0.05, 1) - b)).toBeCloseTo(0, 6);
    expect(blendSpin(a, b, 0, 0, 0.05, 0.5)).toBeCloseTo(-0.05, 6); // at rest: the short way, as before
  });
});

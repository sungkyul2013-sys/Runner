import { describe, expect, it } from 'vitest';
import { deflutterNode, type ChassisFrame } from './Flexbody';

type V3 = [number, number, number];

// A car driving along +X in render space, turned 90° (model forward = render +X): the filter works in its frame.
const frameAt = (t: number): ChassisFrame => ({ origin: [20 * t, 0.3, 5], axes: [[0, 0, -1], [0, 1, 0], [1, 0, 0]] });
const rigidOf = (c: ChassisFrame, r: V3): V3 => [0, 1, 2].map((i) => c.origin[i] + c.axes[0][i] * r[0] + c.axes[1][i] * r[1] + c.axes[2][i] * r[2]) as V3;
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Runs a node through the filter at 60 fps for `seconds`, its model-frame displacement `disp(t)`; returns the largest
 *  (after the first second) and the last distance of the drawn node from the rigid position, and the last distance
 *  from the physics one. */
function run(disp: (t: number) => V3, seconds: number) {
  const F = new Float32Array(12).fill(Number.NaN);
  const rest: V3 = [0.9, 0.5, 0.3];
  const alpha = 1 - Math.exp(-1 / 60 / 0.25);
  let maxOff = 0, lastOff = 0, lastErr = 0;
  for (let f = 0; f <= seconds * 60; f++) {
    const t = f / 60, c = frameAt(t), rigid = rigidOf(c, rest), d = disp(t);
    const p: V3 = [0, 1, 2].map((i) => rigid[i] + c.axes[0][i] * d[0] + c.axes[1][i] * d[1] + c.axes[2][i] * d[2]) as V3;
    // The node's rotation: the chassis rotation (columns = the axes).
    const M = [...c.axes[0], ...c.axes[1], ...c.axes[2]];
    const [q, m] = deflutterNode(F, 0, rest, p, M, c, alpha);
    lastOff = dist(q, rigid);
    lastErr = dist(q, p);
    if (t > 1) maxOff = Math.max(maxOff, lastOff); // after the mean has settled from its first sample
    for (let i = 0; i < 9; i++) expect(Math.abs(m[i] - M[i])).toBeLessThan(1e-4);
  }
  return { maxOff, lastOff, lastErr };
}

describe('flexbody flutter filter (§4.5)', () => {
  it('hides a panel vibrating by ±8 mm at 12 Hz', () => {
    const r = run((t) => [0.008 * Math.sin(2 * Math.PI * 12 * t), 0.004 * Math.cos(2 * Math.PI * 9 * t), 0], 3);
    expect(r.maxOff).toBeLessThan(0.0025);
  });
  it('draws a lasting dent as the physics has it', () => {
    const r = run((t) => (t > 0.5 ? [-0.06, 0, 0] : [0, 0, 0]), 2.5);
    expect(r.lastErr).toBeLessThan(0.001);
    expect(r.lastOff).toBeGreaterThan(0.059);
  });
  it('draws a crash at once', () => {
    // 25 cm of crush 0.1 s after the first frame: drawn within 4 cm the frame it happens.
    const F = new Float32Array(12).fill(Number.NaN);
    const rest: V3 = [0.9, 0.5, 2.1];
    const alpha = 1 - Math.exp(-1 / 60 / 0.25);
    const c = frameAt(0);
    const M = [...c.axes[0], ...c.axes[1], ...c.axes[2]];
    deflutterNode(F, 0, rest, rigidOf(c, rest), M, c, alpha);
    const crushed = rigidOf(c, [0.9, 0.5, 1.85]);
    const [q] = deflutterNode(F, 0, rest, crushed, M, c, alpha);
    expect(dist(q, crushed)).toBeLessThan(0.04);
  });
});

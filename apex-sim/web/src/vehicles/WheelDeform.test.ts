import { describe, expect, it } from 'vitest';
import { ringProfile, sampleRing, WHEEL_BINS } from './WheelDeform';

type V3 = [number, number, number];

/** A ring of `n` nodes at radius `r` around the X axis, turned by `phase`, one node pushed in to `dent`. */
function ring(n: number, r: number, phase: number, dent = -1, dentRadius = r): V3[] {
  return Array.from({ length: n }, (_, j) => {
    const a = phase + (2 * Math.PI * j) / n, rr = j === dent ? dentRadius : r;
    return [0.1, rr * Math.cos(a), rr * Math.sin(a)];
  });
}

describe('wheel deformation profile', () => {
  const axis: V3 = [1, 0, 0], up: V3 = [0, 1, 0], fwd: V3 = [0, 0, 1];

  it('a round ring at rest gives ratio 1 and its axial offset in every bin, whatever its spin', () => {
    for (const phase of [0, 0.13, 2.9]) {
      const p = ringProfile(sampleRing(ring(24, 0.3, phase), [0, 0, 0], axis, up, fwd), 0.3, 0.1);
      expect(p.ratio).toHaveLength(WHEEL_BINS);
      for (const x of p.ratio) expect(x).toBeCloseTo(1, 6);
      for (const x of p.offset) expect(x).toBeCloseTo(0, 6);
    }
  });

  it('a dented node pulls in the bins at its angle only', () => {
    // Node 6 of 24 sits at 90° (forward): bin 8 of 32 is exactly there.
    const p = ringProfile(sampleRing(ring(24, 0.3, 0, 6, 0.24), [0, 0, 0], axis, up, fwd), 0.3, 0.1);
    expect(p.ratio[8]).toBeCloseTo(0.8, 5);
    expect(p.ratio[24]).toBeCloseTo(1, 6);  // the opposite side is round
    expect(p.ratio[0]).toBeCloseTo(1, 6);
    expect(Math.min(...p.ratio)).toBeCloseTo(0.8, 5);
  });

  it('an axially bent ring shows as offsets; too few nodes give the rest profile', () => {
    const bent = ring(24, 0.3, 0).map(([x, y, z], j): V3 => [x + (j < 12 ? 0.02 : 0), y, z]);
    const p = ringProfile(sampleRing(bent, [0, 0, 0], axis, up, fwd), 0.3, 0.1);
    expect(p.offset[4]).toBeCloseTo(0.02, 6);
    expect(p.offset[20]).toBeCloseTo(0, 6);
    const none = ringProfile([], 0.3, 0.1);
    expect(none.ratio.every((x) => x === 1) && none.offset.every((x) => x === 0)).toBe(true);
  });
});

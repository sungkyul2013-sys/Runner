import { describe, expect, it } from 'vitest';
import { strainColor, TOKENS } from './palette';

describe('strainColor', () => {
  const out = new Float32Array(3);
  it('is neutral at zero strain', () => {
    expect(strainColor(0, out, 0)).toBe(true);
    expect(Array.from(out)).toEqual(TOKENS.neutralBeam.map((v) => Math.fround(v)));
  });
  it('is red in tension and blue in compression at full scale', () => {
    strainColor(0.05, out, 0);
    expect(out[0]).toBeCloseTo(TOKENS.tension[0]);
    strainColor(-0.05, out, 0);
    expect(out[2]).toBeCloseTo(TOKENS.compression[2]);
  });
  it('reports broken beams', () => {
    expect(strainColor(Number.NaN, out, 0)).toBe(false);
  });
});

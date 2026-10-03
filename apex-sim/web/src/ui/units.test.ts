import { describe, expect, it } from 'vitest';
import { formatEnergy, formatSeconds, speedKmh } from './units';

describe('units', () => {
  it('formats energy with SI prefixes', () => {
    expect(formatEnergy(237037)).toBe('237.04 kJ');
    expect(formatEnergy(12.34)).toBe('12.3 J');
    expect(formatEnergy(2.5e6)).toBe('2.50 MJ');
  });
  it('formats time', () => {
    expect(formatSeconds(3.14159)).toBe('3.14 s');
    expect(formatSeconds(125.5)).toBe('2:05.5');
  });
  it('converts 64 km/h crash speed', () => {
    expect(speedKmh(64 / 3.6)).toBeCloseTo(64, 10);
  });
});

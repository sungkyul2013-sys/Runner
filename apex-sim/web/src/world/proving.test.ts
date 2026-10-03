import { describe, expect, it } from 'vitest';
import { buildProving } from './maps/proving';

describe('proving ground (§13.3-1)', () => {
  it('builds with a ≥ 10 km oval and the test facilities', () => {
    const t0 = performance.now();
    const m = buildProving();
    const oval = m.roads.find((r) => r.spec.id === 'oval')!;
    let tris = 0;
    for (const mesh of m.physics.meshes) tris += mesh.indices.length / 3;
    console.log(`proving: ${(performance.now() - t0).toFixed(0)} ms, oval ${(oval.length / 1000).toFixed(2)} km, tris ${tris}, pois ${m.pois.length}`);
    let maxE = 0;
    for (const p of oval.st) maxE = Math.max(maxE, Math.abs(p.e));
    expect(oval.length).toBeGreaterThan(9800);
    expect(maxE).toBeGreaterThan(0.25);
    expect(m.physics.heightfield.heights.every((v) => Number.isFinite(v))).toBe(true);
  }, 120000);
});

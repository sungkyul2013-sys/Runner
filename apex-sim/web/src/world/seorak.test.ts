import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeDemPng, demHeight, type DemMeta } from './dem';
import { buildSeorak, seorakRoads } from './maps/seorak';

const meta = JSON.parse(readFileSync('web/public/data/dem/seorak.json', 'utf8')) as DemMeta;
const dem = decodeDemPng(new Uint8Array(readFileSync('web/public/data/dem/seorak.png')), meta);
const ROADS = 'web/public/data/dem/seorak.roads.json';

describe('운설령: real terrain (§13.1, §13.2-2)', () => {
  it('decodes the public DEM: Seoraksan relief, smooth between the samples', () => {
    let lo = Infinity, hi = -Infinity;
    for (const h of dem.heights) {
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    expect(lo).toBeGreaterThan(200);
    expect(hi).toBeGreaterThan(1600); // the Daecheongbong ridge (1,708 m) in the north-east
    expect(hi).toBeLessThan(1720);
    // Bicubic: halfway between two samples near a sample's neighbours' mean.
    const a = demHeight(dem, 0, 0), b = demHeight(dem, meta.cell, 0), mid = demHeight(dem, meta.cell / 2, 0);
    expect(Math.abs(mid - (a + b) / 2)).toBeLessThan(Math.abs(a - b) + 2);
  });

  it('the shipped road alignments are the ones the router lays over this DEM (WRITE_ROADS=1 rewrites them)', () => {
    const roads = seorakRoads(dem);
    if (process.env.WRITE_ROADS) writeFileSync(ROADS, JSON.stringify(roads) + '\n');
    expect(existsSync(ROADS)).toBe(true);
    const shipped = JSON.parse(readFileSync(ROADS, 'utf8')) as typeof roads;
    expect(shipped.pass.length).toBe(roads.pass.length);
    expect(shipped.forest.length).toBe(roads.forest.length);
    for (let i = 0; i < roads.pass.length; i++) expect(Math.hypot(shipped.pass[i][0] - roads.pass[i][0], shipped.pass[i][1] - roads.pass[i][1])).toBeLessThan(0.2);
  }, 180000);

  it('lays a hairpin pass road over the relief within the mountain road grade', () => {
    const t0 = performance.now();
    const roads = existsSync(ROADS) ? JSON.parse(readFileSync(ROADS, 'utf8')) : undefined;
    const m = buildSeorak(undefined, { dem, roads });
    const pass = m.roads.find((r) => r.spec.id === 'pass')!;
    let maxGrade = 0, top = 0, maxK = 0;
    for (const p of pass.st) {
      maxGrade = Math.max(maxGrade, Math.abs(p.grade));
      top = Math.max(top, p.y);
      maxK = Math.max(maxK, Math.abs(p.k));
    }
    let tris = 0;
    for (const mesh of m.physics.meshes) tris += mesh.indices.length / 3;
    if (process.env.MAP_LOG) writeFileSync(process.env.MAP_LOG, `seorak: ${(performance.now() - t0).toFixed(0)} ms, pass ${(pass.length / 1000).toFixed(1)} km, summit ${top.toFixed(0)} m, max grade ${maxGrade.toFixed(3)}, tightest R ${(1 / maxK).toFixed(0)} m, tris ${tris}, pois ${m.pois.length}\n`);
    expect(pass.length).toBeGreaterThan(9000);
    expect(top).toBeGreaterThan(750); // over the saddle (the real pass is at ≈ 920 m)
    expect(top).toBeLessThan(1100);
    expect(maxGrade).toBeLessThan(0.115); // the mountain style's grade limit (cut and fill take the rest)
    expect(1 / maxK).toBeLessThan(40); // hairpins …
    expect(1 / maxK).toBeGreaterThan(9); // … a car can turn in
    for (const id of ['village', 'hairpins', 'summit', 'east']) expect(m.pois.some((p) => p.id === id)).toBe(true);
    expect(m.physics.heightfield.heights.every((v) => Number.isFinite(v))).toBe(true);
  }, 180000);
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MapData } from './builder';
import { decodeDemPng, type DemMeta } from './dem';
import { roadSpawn, spawnPose, surfacesAt } from './ground';
import { buildHanbit } from './maps/hanbit';
import { buildProving } from './maps/proving';
import { buildSeorak } from './maps/seorak';
import type { OsmMap } from './osm';
import { Router } from './Route';

// §13.1 지도에서 텔레포트: a spot picked on the map puts the car on the road nearest it, on that road's carriageway
// (city streets stand on slabs over the terrain, bridges and elevated roads over the ground, tunnels under hills).
function teleports(m: MapData): { n: number; buried: number; offRoad: number; worst: string; gaps: number[] } {
  const router = new Router(m.graph);
  const roads = new Map(m.roads.map((r) => [r.spec.id, r]));
  let n = 0, buried = 0, offRoad = 0, worst = '';
  const gaps: number[] = [];
  for (const e of m.graph.edges) {
    for (let k = 0; k < e.xs.length; k += 5) {
      // A click 4 m beside the centre line (the map is not that precise), snapped back onto the road.
      const sx = e.xs[k] + 4 * Math.sin(k), sz = e.zs[k] + 4 * Math.cos(k);
      const snap = router.snap(sx, sz)!;
      const pose = roadSpawn(m, snap);
      const spot = { x: pose.position[0], z: pose.position[2] };
      const y = pose.position[1]; // the wheels' lowest points at spawn: 12 cm over the ground when all is well
      const surfaces = surfacesAt(m.physics, m.terrain, [[spot.x, spot.z]])[0];
      n++;
      // Buried: a surface of the world through the car (from 10 cm over its wheels' line, under its floor, to its roof).
      if (surfaces.some((h) => h > y + 0.1 && h < y + 1.2)) {
        buried++;
        worst ||= `${m.graph.edges[snap.edge].road} (${spot.x.toFixed(0)}, ${spot.z.toFixed(0)}): car at ${y.toFixed(2)}, surfaces ${surfaces.map((h) => h.toFixed(2)).join(' ')}`;
      }
      // What it lands on is the road it was put on (its carriageway, by the road's own profile).
      const support = Math.max(...surfaces.filter((h) => h <= y));
      const road = roads.get(m.graph.edges[snap.edge].road)!;
      if (support < y - 1.2) offRoad++; // dropped from high
      const near = road.nearest(spot.x, spot.z);
      if (near.s >= 0 && near.s <= road.length) {
        const gap = y - road.surfaceAt(spot.x, spot.z);
        gaps.push(gap);
        if (Math.abs(support - road.surfaceAt(spot.x, spot.z)) > 0.3) offRoad++;
      }
    }
  }
  gaps.sort((a, b) => a - b);
  return { n, buried, offRoad, worst, gaps };
}

function check(m: MapData) {
  const r = teleports(m);
  const q = (f: number) => r.gaps[Math.floor(f * (r.gaps.length - 1))].toFixed(2);
  console.log(`${m.id}: ${r.n} road teleports, buried ${r.buried}, not on the road's carriageway ${r.offRoad}; height over the carriageway p1 ${q(0.01)} p50 ${q(0.5)} p99 ${q(0.99)}${r.worst ? `; first buried: ${r.worst}` : ''}`);
  expect(r.buried).toBe(0);
  expect(r.offRoad / r.n).toBeLessThan(0.01);
  expect(Number(q(0.5))).toBeCloseTo(0.12, 1);
  // Points of interest: on their road (its surface by the road's profile, within the wheels' 12 cm and a lean), with
  // nothing through the car.
  for (const p of m.pois) {
    const pose = spawnPose(m, p);
    const y = pose.position[1];
    if (p.y !== undefined) expect(Math.abs(y - (p.y + 0.12)), p.id).toBeLessThan(0.12);
    const surfaces = surfacesAt(m.physics, m.terrain, [[pose.position[0], pose.position[2]]])[0];
    expect(surfaces.some((h) => h > y + 0.1 && h < y + 1.2), p.id).toBe(false);
    expect(Math.max(...surfaces.filter((h) => h <= y)), p.id).toBeGreaterThan(y - 0.4);
  }
}

describe('spawn and teleport poses (§13.1)', () => {
  it('a teleport onto a road of the proving ground lands on its carriageway', () => check(buildProving()), 300000);
  it('a teleport onto a road of Hanbit lands on its carriageway (slabs, bridges, elevated roads, tunnels)', () => check(buildHanbit()), 300000);
  it('a teleport onto a road of Hangyeryeong lands on its carriageway', () => {
    const meta = JSON.parse(readFileSync('web/public/data/dem/seorak.json', 'utf8')) as DemMeta;
    const dem = decodeDemPng(new Uint8Array(readFileSync('web/public/data/dem/seorak.png')), meta);
    const osm = JSON.parse(readFileSync('web/public/data/dem/seorak.osm.json', 'utf8')) as OsmMap;
    check(buildSeorak(undefined, { dem, osm }));
  }, 300000);
});

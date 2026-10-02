// 운설령 (Unseol Pass; §13.2-2 지방 & 산악, §13.1 / §13.4 실제 DEM): 8 × 8 km of real relief around the Hangyeryeong
// pass in Seoraksan, Gangwon (38.09 N, 128.43 E, 269 … 1,701 m), from public elevation data (data/dem/seorak:
// Terrain Tiles, written by tools/dem/fetch-dem.mjs). The mountains are real; the names are fictional, and the roads
// are not the real ones (their lines are not in the data): a grade-limited A* lays the pass road over the real
// relief (terrainRoute.ts) from the western plateau over the lowest saddle down to the eastern valley — on the steep
// valley walls it climbs in hairpins, as the real road does.
//  • 운설령로: two-lane mountain road (≈ 15 km), guardrails, hairpins; the summit rest area (parking, café, height sign)
//  • 운설 임도: a gravel forest road from the summit up to a ridge viewpoint
//  • 솔골 (village on the western plateau) and 오색골 (hamlet in the eastern valley)
//  • forest up to the ridges, rock and scree on the cliffs, alpine grass on the highest summits
import { MapBuilder, onRoad, type MapData } from '../builder';
import { demHeight, type Dem, type MapAssets } from '../dem';
import { fbm, hash2, rng, smoothstep } from '../noise';
import { relaxRadius, resample, routeTerrain, smoothPath } from '../terrainRoute';
import { MAT } from '../types';

export const SEORAK_DEM = 'data/dem/seorak';
export const SEORAK_ROADS = 'data/dem/seorak.roads.json';
const SIZE = 8000;
// Route search grid: the DEM's own 16 m cells, inset from the edges.
const GRID = { x0: -3920, z0: -3920, cell: 16, n: 490 };

export function buildSeorak(onStage?: (stage: string) => void, assets?: MapAssets): MapData {
  const dem = assets?.dem;
  if (!dem) throw new Error('운설령: the DEM is not loaded (data/dem/seorak)');
  const ground = (x: number, z: number) => demHeight(dem, x, z);
  // The DEM (≈ 30 m source data on a 16 m grid) is smooth below a few tens of metres: a little noise for the ground's
  // own unevenness (the road profile is smoothed over it).
  const natural = (x: number, z: number) => ground(x, z) + 0.9 * fbm(x / 40, z / 40, 3) + 0.2 * fbm(x / 8, z / 8, 2);
  const material = (x: number, z: number, y: number, slope: number): number => {
    if (slope > 0.62) return MAT.concrete; // rock faces
    if (slope > 0.45) return MAT.gravel; // scree
    if (y > 1500 && hash2(Math.floor(x / 40), Math.floor(z / 40), 5) > 0.5) return MAT.gravel; // bare summits
    if (y < 700 && x < -2400 && slope < 0.12 && hash2(Math.floor(x / 70), Math.floor(z / 45), 9) > 0.55) return MAT.dirt; // plateau fields
    return MAT.grass;
  };

  // ---- the road alignments over the real relief (precomputed with the DEM; computed here if missing) ----
  const roads = assets?.roads ?? seorakRoads(dem);
  onStage?.('route');
  const passPoints = roads.pass;

  const R = rng(380943);
  const b = new MapBuilder({
    id: 'seorak', name: { ko: '운설령', en: 'Unseol Pass' }, size: SIZE, cell: 4, seed: 380943, natural, material,
    latitude: 38.1, hazeColor: 0xb7c4d0, onStage, decorate: (m) => forests(m, R),
  });
  b.addRoad({ id: 'pass', name: { ko: '운설령로', en: 'Unseol Pass Road' }, style: 'mountain', styleOverride: { laneWidth: 3.2, lights: 0 }, points: passPoints });
  const pass = b.byId.get('pass')!;

  // Summit: the road's highest station.
  let top = 0;
  for (let i = 0; i < pass.st.length; i++) if (pass.st[i].y > pass.st[top].y) top = i;
  const summit = pass.st[top];

  // ---- forest road from the summit up to the ridge ----
  const forestPoints = roads.forest;
  if (forestPoints && forestPoints.length > 4) {
    const pts = forestPoints.map((q) => [q[0], q[1]] as [number, number]);
    pts[0] = onRoad(pass, pts[0][0], pts[0][1]);
    b.addRoad({ id: 'forest', name: { ko: '운설 임도', en: 'Unseol forest road' }, style: 'gravel', points: pts, start: { join: 'pass' } });
  }
  const fr = b.byId.get('forest');
  const peak: [number, number] = fr ? [fr.at(fr.length).x, fr.at(fr.length).z] : [summit.x, summit.z];

  // ---- buildings: 솔골 (west plateau village), the summit rest area, 오색골 (east valley hamlet) ----
  const slopeAt = (x: number, z: number) => Math.hypot(ground(x + 6, z) - ground(x - 6, z), ground(x, z + 6) - ground(x, z - 6)) / 12;
  const village = (s0: number, s1: number, count: number) => {
    let placed = 0;
    for (let tries = 0; tries < count * 12 && placed < count; tries++) {
      const s = s0 + R() * (s1 - s0);
      const p = pass.at(s);
      const side = R() < 0.5 ? -1 : 1, off = 16 + R() * 26;
      const x = p.x + side * off * p.tz, z = p.z - side * off * p.tx;
      if (slopeAt(x, z) > 0.16 || b.nearPaved(x, z, 9)) continue;
      const shop = off < 22 && R() < 0.35;
      const w = shop ? 9 + R() * 5 : 7 + R() * 4, d = shop ? 8 + R() * 4 : 7 + R() * 3;
      b.addBuilding({ x, z, y: b.terrain.heightAt(x, z), w, d, h: shop ? 4.5 : 5 + R() * 3.5, yaw: Math.atan2(p.tx, p.tz), type: shop ? 5 : 4, seed: Math.floor(R() * 1e6) });
      placed++;
    }
  };
  village(30, 1300, 26);
  village(pass.length - 900, pass.length - 40, 10);
  // Rest area at the summit: a parking pad beside the road, a café and the height sign.
  const sideOut = summit.k >= 0 ? -1 : 1; // the outside of the bend (the inside is the cut)
  const ux = summit.tz * sideOut, uz = -summit.tx * sideOut;
  const padC: [number, number] = [summit.x + ux * 22, summit.z + uz * 22];
  const padY = summit.y + 0.05;
  const half = (a: number, w: number): [number, number] => [padC[0] + summit.tx * a + ux * w, padC[1] + summit.tz * a + uz * w];
  b.addPad({ outline: [half(-28, -12), half(28, -12), half(28, 12), half(-28, 12)], y: () => padY, material: MAT.asphalt, look: 'asphalt', grid: 5, gridU: 2.5, fill: true });
  b.addBuilding({ x: padC[0] + ux * 22, z: padC[1] + uz * 22, y: padY, w: 22, d: 11, h: 6, yaw: Math.atan2(summit.tx, summit.tz), type: 5, seed: 9091 });
  const height = Math.round(summit.y);
  b.addSign({ x: padC[0] - summit.tx * 20 - ux * 9, y: padY, z: padC[1] - summit.tz * 20 - uz * 9, yaw: Math.atan2(-ux, -uz), text: { ko: '운설령', en: 'Unseol Pass' }, sub: { ko: `해발 ${height} m`, en: `${height} m above sea level` }, kind: 'place' });

  // ---- points of interest ----
  const face = (s: number, dir = 1) => {
    const p = pass.at(s);
    const u = -dir * pass.style.laneWidth * 0.5;
    const x = p.x + u * p.tz, z = p.z - u * p.tx;
    return { x, z, yaw: Math.atan2(dir * p.tx, dir * p.tz), y: pass.surfaceAt(x, z) };
  };
  // Hairpins: where the heading turns furthest within 150 m (a switchback turns ≈ 180°).
  let hairpin = 0, most = -1;
  for (let i = 0, j = 0; i < pass.st.length; i++) {
    while (j + 1 < pass.st.length && pass.st[j + 1].s - pass.st[i].s < 150) j++;
    let turn = 0;
    for (let k = i + 1; k <= j; k++) turn += pass.st[k].k * (pass.st[k].s - pass.st[k - 1].s);
    if (Math.abs(turn) > most) {
      most = Math.abs(turn);
      hairpin = pass.st[i].s;
    }
  }
  const poi = (id: string, kind: MapData['pois'][number]['kind'], ko: string, en: string, at: { x: number; z: number; yaw: number; y?: number }) => b.pois.push({ id, kind, label: { ko, en }, ...at });
  poi('village', 'spawn', '솔골 (서쪽 고원 마을)', 'Solgol (western village)', face(80));
  poi('hairpins', 'scenic', '헤어핀 구간', 'Hairpins', face(Math.max(0, hairpin - 60)));
  poi('summit', 'scenic', `운설령 정상 (${height} m)`, `Unseol Pass summit (${height} m)`, face(summit.s + 30));
  poi('east', 'spawn', '오색골 (동쪽 계곡)', 'Osaekgol (eastern valley)', face(pass.length - 80, -1));
  if (fr) poi('viewpoint', 'scenic', '운설 임도 전망대', 'Forest road viewpoint', (() => {
    const p = fr.at(Math.max(0, fr.length - 40));
    return { x: p.x, z: p.z, yaw: Math.atan2(p.tx, p.tz) };
  })());
  b.areas.push(
    { label: { ko: '운설령', en: 'Unseol Pass' }, x: summit.x, z: summit.z, size: 2 },
    { label: { ko: '솔골', en: 'Solgol' }, x: pass.at(600).x, z: pass.at(600).z, size: 1 },
    { label: { ko: '오색골', en: 'Osaekgol' }, x: pass.at(pass.length - 400).x, z: pass.at(pass.length - 400).z, size: 1 },
    { label: { ko: '운설 능선', en: 'Unseol ridge' }, x: peak[0], z: peak[1], size: 1 },
  );
  return b.build();
}

/**
 * The road alignments over the DEM: the pass road from the lowest point of the west edge to the lowest of the east
 * edge (grade-limited A*: hairpins where the walls are steep), and a gravel forest road from beside its summit up to
 * the highest ridge point within 1 km (stopping short of the rocks). Resampled every 14 m, bends eased to a 16 m radius (12 m on the forest road). Precomputed into
 * data/dem/seorak.roads.json (seorak.test.ts writes it with WRITE_ROADS=1 and checks it against this).
 */
export function seorakRoads(dem: Dem): { pass: Array<[number, number]>; forest: Array<[number, number]> } {
  const ground = (x: number, z: number) => demHeight(dem, x, z);
  const lowEdge = (x: number): [number, number] => {
    let best: [number, number] = [x, 0], low = Infinity;
    for (let z = -3600; z <= 3600; z += 16) {
      const y = ground(x, z);
      if (y < low) {
        low = y;
        best = [x, z];
      }
    }
    return best;
  };
  const path = routeTerrain({ height: ground, ...GRID, maxGrade: 0.09, gradeWeight: 60, overWeight: 25000 }, lowEdge(-3800), lowEdge(3800));
  if (!path) throw new Error('운설령: no road alignment over the terrain');
  const round = (pts: Array<[number, number]>) => pts.map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10] as [number, number]);
  const pass = round(relaxRadius(resample(smoothPath(path, 2, 32), 14), 16, 200));
  // Summit: the highest point of the alignment; the forest road leaves 20 m to its side.
  let top = 0;
  for (let i = 0; i < pass.length; i++) if (ground(pass[i][0], pass[i][1]) > ground(pass[top][0], pass[top][1])) top = i;
  const a = pass[Math.max(top - 1, 0)], c = pass[Math.min(top + 1, pass.length - 1)];
  const tx = c[0] - a[0], tz = c[1] - a[1], tl = Math.hypot(tx, tz) || 1;
  const [sx, sz] = pass[top];
  let peak: [number, number] = [sx, sz], peakY = -Infinity;
  for (let z = sz - 1000; z <= sz + 1000; z += 32) {
    for (let x = sx - 1000; x <= sx + 1000; x += 32) {
      if (Math.hypot(x - sx, z - sz) > 1000 || Math.abs(x) > 3700 || Math.abs(z) > 3700) continue;
      const y = ground(x, z);
      if (y > peakY) {
        peakY = y;
        peak = [x, z];
      }
    }
  }
  const target: [number, number] = [peak[0] + (sx - peak[0]) * 0.08, peak[1] + (sz - peak[1]) * 0.08];
  const from: [number, number] = [sx - (tz / tl) * 20, sz + (tx / tl) * 20];
  const forestPath = routeTerrain({ height: ground, ...GRID, maxGrade: 0.14, hardGrade: 0.4, gradeWeight: 30, overWeight: 4000 }, from, target);
  const forest = forestPath && forestPath.length > 4 ? round(relaxRadius(resample(smoothPath(forestPath, 2, 28), 14), 12, 200)) : [];
  return { pass, forest };
}

/** Forest over the mountains: dense on the slopes, thinning above 1,450 m and on rock; none on the roads. */
function forests(b: MapBuilder, R: () => number): void {
  const step = 20;
  for (let z = -3900; z < 3900; z += step) {
    for (let x = -3900; x < 3900; x += step) {
      const px = x + (R() - 0.5) * step, pz = z + (R() - 0.5) * step;
      if (fbm(px / 600, pz / 600, 2) < -0.3) continue; // clearings
      const y = b.terrain.heightAt(px, pz);
      const n = b.terrain.normalAt(px, pz);
      if (n[1] < 0.7) continue; // cliffs
      if (y > 1450 && R() < smoothstep(1450, 1650, y)) continue; // the tree line
      if (b.terrain.materialAt(px, pz) === MAT.dirt) continue; // fields
      if (b.nearPaved(px, pz, 7)) continue;
      b.addTree(px, pz, 0.85 + R() * 0.6, y > 1000 || R() < 0.6 ? 1 : 0);
    }
  }
}

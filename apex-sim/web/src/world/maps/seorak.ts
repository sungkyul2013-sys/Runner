// 한계령 (Hangyeryeong; §13.2-2 지방 & 산악, §13.1 / §13.4 실제 DEM·실제 지도): 8 × 8 km around the Hangyeryeong pass
// in Seoraksan, Gangwon (38.09 N, 128.43 E, 269 … 1,701 m). The relief is public elevation data (data/dem/seorak:
// Terrain Tiles, tools/dem/fetch-dem.mjs); the roads, streams and buildings are real map data (data/dem/seorak.osm.json:
// Overture Maps / OpenStreetMap, tools/overture/fetch-overture.py).
//  • 설악로 (National Route 44) over the pass, its hairpins down to Osaek; 필례로 from the pass, 대청봉길 at Osaek
//  • the streams in carved beds, water running down them; bridges where the roads cross them
//  • the rest area at the pass (parking, rest house, height sign), Osaek village (approximate: the data has few
//    buildings here), forest up to the ridges, rock and scree on the cliffs
// Without the map data the map falls back to a pass road a grade-limited A* lays over the same relief (fictional).
import { MapBuilder, onRoad, type MapData } from '../builder';
import { chainSegments, DRIVABLE, footprintBox, length, LineIndex, type OsmMap } from '../osm';
import type { RoadStyle, StyleName } from '../road';
import { demHeight, type Dem, type MapAssets } from '../dem';
import { fbm, hash2, rng, smoothstep } from '../noise';
import { relaxRadius, resample, routeTerrain, smoothPath } from '../terrainRoute';
import { MAT } from '../types';

export const SEORAK_DEM = 'data/dem/seorak';
export const SEORAK_ROADS = 'data/dem/seorak.roads.json';
export const SEORAK_OSM = 'data/dem/seorak.osm.json';
const SIZE = 8000;
// Route search grid: the DEM's own 16 m cells, inset from the edges.
const GRID = { x0: -3920, z0: -3920, cell: 16, n: 490 };

export function buildSeorak(onStage?: (stage: string) => void, assets?: MapAssets): MapData {
  const dem = assets?.dem;
  if (!dem) throw new Error('한계령: the DEM is not loaded (data/dem/seorak)');
  const osm = assets?.osm;
  const ground = (x: number, z: number) => demHeight(dem, x, z);

  // ---- streams (real data): beds carved into the DEM, water running down them ----
  // A bed follows the lowest ground across the stream line (±12 m: the 30 m source data blurs the valley floor) and
  // only descends along the flow; its banks rise at 0.8 into the hillside.
  const streamLines: Array<Array<[number, number]>> = [];
  const beds: number[][] = [];
  for (const w of osm?.water ?? []) {
    if (w.kind !== 'line' || w.pts.length < 2) continue;
    const pts = resample(w.pts, 10);
    const bed = pts.map(([x, z], i) => {
      const a = pts[Math.max(i - 1, 0)], c = pts[Math.min(i + 1, pts.length - 1)];
      const l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
      const nx = -(c[1] - a[1]) / l, nz = (c[0] - a[0]) / l;
      let low = Infinity;
      for (let u = -12; u <= 12; u += 3) low = Math.min(low, ground(x + nx * u, z + nz * u));
      return low - 0.9;
    });
    // Downhill from the higher end.
    if (bed[0] < bed[bed.length - 1]) {
      pts.reverse();
      bed.reverse();
    }
    for (let i = 1; i < bed.length; i++) bed[i] = Math.min(bed[i], bed[i - 1]);
    streamLines.push(pts);
    beds.push(bed);
  }
  const streams = new LineIndex(streamLines, 48);
  const bedAt = (x: number, z: number): { y: number; d: number } | null => {
    const n = streams.nearest(x, z, 40);
    if (!n) return null;
    const b = beds[n.line];
    return { y: b[n.i] + (b[n.i + 1] - b[n.i]) * n.u, d: n.d };
  };
  // The DEM (≈ 30 m source data on a 16 m grid) is smooth below a few tens of metres: a little noise for the ground's
  // own unevenness (the road profile is smoothed over it).
  const natural = (x: number, z: number) => {
    const h = ground(x, z) + 0.9 * fbm(x / 40, z / 40, 3) + 0.2 * fbm(x / 8, z / 8, 2);
    const bed = bedAt(x, z);
    return bed ? Math.min(h, bed.y + Math.max(0, bed.d - 2.2) * 0.8) : h;
  };
  const material = (x: number, z: number, y: number, slope: number): number => {
    const bed = bedAt(x, z);
    if (bed && bed.d < 6) return MAT.gravel; // stream beds
    if (slope > 0.62) return MAT.concrete; // rock faces
    if (slope > 0.45) return MAT.gravel; // scree
    if (y > 1500 && hash2(Math.floor(x / 40), Math.floor(z / 40), 5) > 0.5) return MAT.gravel; // bare summits
    return MAT.grass;
  };

  onStage?.('route');
  const R = rng(380943);
  const b = new MapBuilder({
    id: 'seorak', name: { ko: '한계령', en: 'Hangyeryeong' }, size: SIZE, cell: 4, seed: 380943, natural, material,
    latitude: 38.1, hazeColor: 0xb7c4d0, onStage, decorate: (m) => forests(m, R, (x, z) => (bedAt(x, z)?.d ?? 99) < 7),
  });
  streamLines.forEach((pts, i) => {
    if (pts.length < 2) return;
    const levels = beds[i].map((y) => y + 0.35);
    b.water.push({ kind: 'stream', level: Math.min(...levels), points: pts, levels, width: 3.2 });
  });

  // ---- roads: the real network (Overture / OpenStreetMap), or the alignment laid over the DEM ----
  const routed = assets?.roads?.pass ? { pass: assets.roads.pass, forest: assets.roads.forest ?? [] } : null;
  const main = osm ? realRoads(b, osm) : syntheticRoads(b, routed ?? seorakRoads(dem));
  const pass = b.byId.get(main.id)!;

  // Summit: the main road's highest station.
  let top = 0;
  for (let i = 0; i < pass.st.length; i++) if (pass.st[i].y > pass.st[top].y) top = i;
  const summit = pass.st[top];

  // ---- buildings: the real footprints, villages along the road, the summit rest area ----
  for (const f of osm?.buildings ?? []) {
    if (f.pts.length < 4) continue;
    const box = footprintBox(f.pts);
    if (Math.abs(box.x) > 3950 || Math.abs(box.z) > 3950) continue;
    if (b.footprintOnRoad(box.x, box.z, box.w, box.d, box.yaw, 0.5)) continue; // a footprint over a road we laid
    const h = f.height ?? (f.floors ? f.floors * 3.2 : 6);
    b.addBuilding({ x: box.x, z: box.z, y: b.terrain.heightAt(box.x, box.z), w: box.w, d: box.d, h, yaw: box.yaw, type: f.class === 'commercial' ? 5 : 4, seed: Math.floor(R() * 1e6) });
  }
  const slopeAt = (x: number, z: number) => Math.hypot(ground(x + 6, z) - ground(x - 6, z), ground(x, z + 6) - ground(x, z - 6)) / 12;
  const village = (road: string, s0: number, s1: number, count: number) => {
    const r = b.byId.get(road);
    if (!r) return;
    let placed = 0;
    for (let tries = 0; tries < count * 14 && placed < count; tries++) {
      const s = s0 + R() * (s1 - s0);
      const p = r.at(Math.min(Math.max(s, 0), r.length));
      const side = R() < 0.5 ? -1 : 1, off = 15 + R() * 24;
      const x = p.x + side * off * p.tz, z = p.z - side * off * p.tx;
      if (slopeAt(x, z) > 0.18 || (bedAt(x, z)?.d ?? 99) < 12) continue;
      const shop = off < 21 && R() < 0.4;
      const w = shop ? 9 + R() * 6 : 7 + R() * 4, d = shop ? 8 + R() * 4 : 7 + R() * 3, yaw = Math.atan2(p.tx, p.tz);
      // Clear of every road, not only the one it lines (대청봉길 runs behind the houses on Route 44).
      if (b.footprintOnRoad(x, z, w, d, yaw, 2)) continue;
      b.addBuilding({ x, z, y: b.terrain.heightAt(x, z), w, d, h: shop ? 4.5 + R() * 3 : 5 + R() * 3.5, yaw, type: shop ? 5 : 4, seed: Math.floor(R() * 1e6) });
      placed++;
    }
  };
  for (const v of main.villages) village(v.road, v.s0, v.s1, v.count);
  // Rest area at the pass: a parking pad beside the road, the rest house and the height sign.
  const sideOut = summit.k >= 0 ? -1 : 1; // the outside of the bend (the inside is the cut)
  const ux = summit.tz * sideOut, uz = -summit.tx * sideOut;
  const padC: [number, number] = [summit.x + ux * 22, summit.z + uz * 22];
  const padY = summit.y + 0.05;
  const half = (a: number, w: number): [number, number] => [padC[0] + summit.tx * a + ux * w, padC[1] + summit.tz * a + uz * w];
  b.addPad({ outline: [half(-28, -12), half(28, -12), half(28, 12), half(-28, 12)], y: () => padY, material: MAT.asphalt, look: 'asphalt', grid: 5, gridU: 2.5, fill: true });
  b.addBuilding({ x: padC[0] + ux * 22, z: padC[1] + uz * 22, y: padY, w: 24, d: 12, h: 7, yaw: Math.atan2(summit.tx, summit.tz), type: 5, seed: 9091 });
  const height = Math.round(summit.y);
  b.addSign({ x: padC[0] - summit.tx * 20 - ux * 9, y: padY, z: padC[1] - summit.tz * 20 - uz * 9, yaw: Math.atan2(-ux, -uz), text: main.passName, sub: { ko: `해발 ${height} m`, en: `${height} m above sea level` }, kind: 'place' });

  // ---- points of interest ----
  const face = (roadId: string, s: number, dir = 1) => {
    const r = b.byId.get(roadId)!;
    const p = r.at(Math.min(Math.max(s, 0), r.length));
    const u = -dir * r.style.laneWidth * 0.5;
    const x = p.x + u * p.tz, z = p.z - u * p.tx;
    return { x, z, yaw: Math.atan2(dir * p.tx, dir * p.tz), y: r.surfaceAt(x, z) };
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
  const poi = (id: string, kind: MapData['pois'][number]['kind'], label: { ko: string; en: string }, at: { x: number; z: number; yaw: number; y?: number }) => b.pois.push({ id, kind, label, ...at });
  poi('west', 'spawn', main.westName, face(main.id, 80));
  // The hairpins are taken climbing: the spawn faces up the road there.
  const upAt = pass.at(Math.min(hairpin + 40, pass.length)).y > pass.at(Math.max(hairpin - 40, 0)).y ? 1 : -1;
  poi('hairpins', 'scenic', { ko: '헤어핀 구간', en: 'Hairpins' }, face(main.id, upAt > 0 ? Math.max(0, hairpin - 80) : Math.min(pass.length, hairpin + 230), upAt));
  poi('summit', 'scenic', { ko: `${main.passName.ko} (${height} m)`, en: `${main.passName.en} (${height} m)` }, face(main.id, summit.s + 30));
  poi('east', 'spawn', main.eastName, face(main.id, pass.length - 80, -1));
  for (const extra of main.pois) poi(extra.id, 'scenic', extra.label, face(extra.road, extra.s, extra.dir));
  b.areas.push(
    { label: main.passName, x: summit.x, z: summit.z, size: 2 },
    ...main.areas,
  );
  return b.build();
}

interface MainRoad {
  id: string;
  passName: { ko: string; en: string };
  westName: { ko: string; en: string };
  eastName: { ko: string; en: string };
  villages: Array<{ road: string; s0: number; s1: number; count: number }>;
  pois: Array<{ id: string; label: { ko: string; en: string }; road: string; s: number; dir: number }>;
  areas: MapData['areas'];
}

/** Map style of a road class (real roads follow the terrain: grades up to 12 %). */
function styleOf(cls: string): { style: StyleName; styleOverride: Partial<RoadStyle> } {
  if (cls === 'motorway' || cls === 'trunk' || cls === 'primary' || cls === 'secondary') return { style: 'mountain', styleOverride: { laneWidth: 3.25, lights: 0, maxGrade: 0.12 } };
  if (cls === 'tertiary' || cls === 'unclassified' || cls === 'residential') return { style: 'rural', styleOverride: { lights: 0, maxGrade: 0.12, smooth: 80 } };
  if (cls === 'track') return { style: 'gravel', styleOverride: {} };
  return { style: 'farm', styleOverride: { maxGrade: 0.14 } };
}

/**
 * The real road network: Overture segments chained into roads (the longest — 설악로, National Route 44 over
 * Hangyeryeong — first, then its branches), resampled every 12 m with bends eased to 12 m radius, trimmed off the map's
 * edge; a branch ending on a road joins it (T-junction).
 */
function realRoads(b: MapBuilder, osm: OsmMap): MainRoad {
  const chains = chainSegments(osm.roads.filter((r) => DRIVABLE.has(r.class) && r.pts.length >= 2));
  const inside = (p: [number, number]) => Math.abs(p[0]) < 3960 && Math.abs(p[1]) < 3960;
  const ids: string[] = [];
  const counts = new Map<string, number>();
  for (const c of chains) {
    let pts = c.pts.filter(inside);
    if (pts.length < 2 || length(pts) < 40) continue;
    if (ids.length === 0 && pts[0][0] > pts[pts.length - 1][0]) pts.reverse(); // the main road runs west → east
    pts = relaxRadius(resample(pts, 12), 12, 200);
    const base = c.name ? c.name.replace(/\s+/g, '') : c.class;
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    const id = ids.length === 0 ? 'main' : `r_${base}_${n}`;
    // Ends on an earlier road: snap onto its centre line and join.
    const joinAt = (p: [number, number]) => {
      for (const other of ids) {
        const o = b.byId.get(other)!;
        const q = o.nearest(p[0], p[1]);
        if (q.d < 14 && q.s > 1 && q.s < o.length - 1) return other;
      }
      return null;
    };
    const startJoin = ids.length ? joinAt(pts[0]) : null, endJoin = ids.length ? joinAt(pts[pts.length - 1]) : null;
    if (startJoin) pts[0] = onRoad(b.byId.get(startJoin)!, pts[0][0], pts[0][1]);
    if (endJoin) pts[pts.length - 1] = onRoad(b.byId.get(endJoin)!, pts[pts.length - 1][0], pts[pts.length - 1][1]);
    const label = c.name ?? undefined;
    b.addRoad({
      id, ...(label ? { name: { ko: label, en: label } } : {}), ...styleOf(c.class), points: pts,
      ...(startJoin ? { start: { join: startJoin } } : {}), ...(endJoin ? { end: { join: endJoin } } : {}),
    });
    ids.push(id);
  }
  const mainRoad = b.byId.get('main')!;
  // Osaek (오색) lies where 대청봉길 leaves the main road in the eastern valley; 필례로 leaves it at the pass.
  const branch = (name: string) => ids.find((id) => b.byId.get(id)?.spec.name?.ko === name);
  const near = (id: string | undefined, x: number, z: number) => (id ? mainRoad.nearest(x, z).s : -1);
  const daecheong = branch('대청봉길');
  const dStart = daecheong ? b.byId.get(daecheong)!.at(0) : null;
  const osaekS = dStart ? near(daecheong, dStart.x, dStart.z) : mainRoad.length - 1500;
  const pillye = branch('Pillye-ro') ?? branch('필례로');
  return {
    id: 'main',
    passName: { ko: '한계령', en: 'Hangyeryeong Pass' },
    westName: { ko: '설악로 서쪽 (인제 방향)', en: 'Seorak-ro west (to Inje)' },
    eastName: { ko: '오색 (양양 방향)', en: 'Osaek (to Yangyang)' },
    villages: [
      { road: 'main', s0: Math.max(0, osaekS - 700), s1: Math.min(mainRoad.length, osaekS + 900), count: 30 },
      ...(daecheong ? [{ road: daecheong, s0: 0, s1: b.byId.get(daecheong)!.length, count: 10 }] : []),
    ],
    pois: pillye ? [{ id: 'pillye', label: { ko: '필례로 (필례약수 방향)', en: 'Pillye-ro' }, road: pillye, s: 220, dir: 1 }] : [],
    areas: [
      { label: { ko: '오색', en: 'Osaek' }, x: mainRoad.at(osaekS).x, z: mainRoad.at(osaekS).z, size: 1 },
      { label: { ko: '설악산', en: 'Seoraksan' }, x: 1700, z: -2600, size: 2 },
    ],
  };
}

/** Without the real data: the alignment the grade-limited router lays over the DEM (fictional names). */
function syntheticRoads(b: MapBuilder, roads: { pass: Array<[number, number]>; forest: Array<[number, number]> }): MainRoad {
  b.addRoad({ id: 'main', name: { ko: '운설령로', en: 'Unseol Pass Road' }, style: 'mountain', styleOverride: { laneWidth: 3.2, lights: 0 }, points: roads.pass });
  const main = b.byId.get('main')!;
  if (roads.forest.length > 4) {
    const pts = roads.forest.map((q) => [q[0], q[1]] as [number, number]);
    pts[0] = onRoad(main, pts[0][0], pts[0][1]);
    b.addRoad({ id: 'forest', name: { ko: '운설 임도', en: 'Unseol forest road' }, style: 'gravel', points: pts, start: { join: 'main' } });
  }
  const fr = b.byId.get('forest');
  return {
    id: 'main',
    passName: { ko: '운설령', en: 'Unseol Pass' },
    westName: { ko: '솔골 (서쪽 고원 마을)', en: 'Solgol (western village)' },
    eastName: { ko: '오색골 (동쪽 계곡)', en: 'Osaekgol (eastern valley)' },
    villages: [{ road: 'main', s0: 30, s1: 1300, count: 26 }, { road: 'main', s0: main.length - 900, s1: main.length - 40, count: 10 }],
    pois: fr ? [{ id: 'viewpoint', label: { ko: '운설 임도 전망대', en: 'Forest road viewpoint' }, road: 'forest', s: Math.max(0, fr.length - 40), dir: 1 }] : [],
    areas: [],
  };
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
function forests(b: MapBuilder, R: () => number, wet: (x: number, z: number) => boolean): void {
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
      if (b.nearPaved(px, pz, 7) || wet(px, pz)) continue;
      b.addTree(px, pz, 0.85 + R() * 0.6, y > 1000 || R() < 0.6 ? 1 : 0);
    }
  }
}

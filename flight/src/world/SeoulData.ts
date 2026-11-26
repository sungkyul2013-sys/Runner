// Decodes the packed OpenStreetMap extract (Gangnam/Songpa, Seoul). © OpenStreetMap contributors, ODbL 1.0.
import packed from '../assets/seoulData';
import { CITY } from './WorldDef';
import { hash01 } from '../core/math';

export interface OsmBuilding { ring: [number, number][]; h: number; minH: number; kind: number; tagged: boolean }
export interface OsmPoly { ring: [number, number][]; holes: [number, number][][] }
export interface OsmRoad { w: number; pts: [number, number][] }
export interface SeoulData { buildings: OsmBuilding[]; water: OsmPoly[]; parks: OsmPoly[]; roads: OsmRoad[] }

let cache: SeoulData | null = null;

function polyArea(r: [number, number][]) {
  let a = 0;
  for (let i = 0; i < r.length; i++) { const [x0, z0] = r[i], [x1, z1] = r[(i + 1) % r.length]; a += x0 * z1 - x1 * z0; }
  return a / 2;
}

export function seoul(): SeoulData {
  if (cache) return cache;
  const bin = Uint8Array.from(atob(packed), (c) => c.charCodeAt(0));
  const dv = new DataView(bin.buffer);
  let o = 0;
  const u8 = () => dv.getUint8(o++);
  const u16 = () => { const v = dv.getUint16(o, true); o += 2; return v; };
  const u32 = () => { const v = dv.getUint32(o, true); o += 4; return v; };
  const ring = (): [number, number][] => {
    const n = u16(); const r: [number, number][] = [];
    for (let i = 0; i < n; i++) { const x = dv.getInt16(o, true) / 4, z = dv.getInt16(o + 2, true) / 4; o += 4; r.push([x + CITY.cx, z + CITY.cz]); }
    return r;
  };
  o = 4;
  const nB = u32(), nW = u32(), nP = u32(), nR = u32();
  const buildings: OsmBuilding[] = [];
  for (let i = 0; i < nB; i++) {
    const h10 = u16(), mh10 = u16(), kind = u8();
    const r = ring();
    let h = h10 / 10;
    const tagged = h > 0;
    if (!tagged) {
      const area = Math.abs(polyArea(r));
      const k = hash01(Math.round(r[0][0] * 3), Math.round(r[0][1] * 3));
      if (kind === 1) h = area > 350 ? 38 + k * 48 : 12 + k * 18; // apartment towers vs villas
      else if (kind === 2) h = 7 + k * 4;
      else if (kind === 3) h = 14 + Math.min(1, area / 2500) * 50 + k * 20;
      else if (kind === 5) h = 14 + k * 8;
      else if (kind === 7) h = 28 + k * 10;
      else h = area < 150 ? 7 + k * 6 : area < 700 ? 11 + k * 16 : 16 + k * 26;
    }
    buildings.push({ ring: r, h, minH: mh10 / 10, kind, tagged });
  }
  const polys = (n: number) => {
    const out: OsmPoly[] = [];
    for (let i = 0; i < n; i++) { const nh = u8(); const r = ring(); const holes = []; for (let k = 0; k < nh; k++) holes.push(ring()); out.push({ ring: r, holes }); }
    return out;
  };
  const water = polys(nW), parks = polys(nP);
  const roads: OsmRoad[] = [];
  for (let i = 0; i < nR; i++) { const w = u8(); roads.push({ w, pts: ring() }); }
  addFillers(buildings, water, parks, roads);
  cache = { buildings, water, parks, roads };
  return cache;
}
export { polyArea };

/** Fill OSM gaps with procedural low/mid-rise blocks, avoiding roads, water, parks and existing buildings (raster mask). */
function addFillers(buildings: OsmBuilding[], water: OsmPoly[], parks: OsmPoly[], roads: OsmRoad[]) {
  if (typeof document === 'undefined') return;
  const RES = 4; // metres per pixel
  const W = Math.ceil((CITY.hx * 2) / RES), H = Math.ceil((CITY.hz * 2) / RES);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  const tx = (x: number) => (x - (CITY.cx - CITY.hx)) / RES, tz = (z: number) => (z - (CITY.cz - CITY.hz)) / RES;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
  const poly = (r: [number, number][]) => { g.beginPath(); r.forEach(([x, z], i) => (i ? g.lineTo(tx(x), tz(z)) : g.moveTo(tx(x), tz(z)))); g.closePath(); };
  for (const p of [...water, ...parks]) { poly(p.ring); g.fill(); }
  g.lineWidth = 1;
  for (const b of buildings) { poly(b.ring); g.fill(); g.stroke(); }
  for (const r of roads) {
    g.lineWidth = (r.w + 3) / RES;
    g.beginPath(); r.pts.forEach(([x, z], i) => (i ? g.lineTo(tx(x), tz(z)) : g.moveTo(tx(x), tz(z)))); g.stroke();
  }
  const m = g.getImageData(0, 0, W, H).data;
  const free = (x0: number, z0: number, x1: number, z1: number) => {
    for (let z = Math.floor(tz(z0)); z <= Math.ceil(tz(z1)); z++) for (let x = Math.floor(tx(x0)); x <= Math.ceil(tx(x1)); x++) {
      if (x < 0 || z < 0 || x >= W || z >= H) return false;
      if (m[(z * W + x) * 4] > 30) return false;
    }
    return true;
  };
  const STEP = 21;
  for (let z = CITY.cz - CITY.hz + 20; z < CITY.cz + CITY.hz - 20; z += STEP) {
    for (let x = CITY.cx - CITY.hx + 20; x < CITY.cx + CITY.hx - 20; x += STEP) {
      const k = hash01(Math.round(x), Math.round(z));
      if (k < 0.12) continue;
      const w = 8 + hash01(Math.round(x) * 3, Math.round(z)) * 10, d = 8 + hash01(Math.round(x), Math.round(z) * 5) * 10;
      const cx = x + (k - 0.5) * 6, cz = z + (hash01(Math.round(z), Math.round(x)) - 0.5) * 6;
      if (!free(cx - w / 2 - 1.5, cz - d / 2 - 1.5, cx + w / 2 + 1.5, cz + d / 2 + 1.5)) continue;
      const tall = hash01(Math.round(x) * 7, Math.round(z) * 11);
      const h = tall > 0.93 ? 30 + tall * 40 : 7 + tall * 17;
      buildings.push({ ring: [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]], h, minH: 0, kind: h > 26 ? 3 : 0, tagged: false });
    }
  }
}

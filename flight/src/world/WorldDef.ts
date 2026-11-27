// World layout + analytic height field. North = -Z, East = +X, Up = +Y (metres).
import { clamp, fbm, ridged, smoothstep, lerp, vnoise } from '../core/math';

export const WORLD_HALF = 262144; // ~524 km square world

export interface RunwayDef {
  id: string;
  name: string;
  cx: number; cz: number; elev: number;
  length: number; width: number;
  /** heading (deg) of the landing direction for the primary end */
  heading: number;
  lights: boolean;
  surface: 'asphalt' | 'deck' | 'grass';
}

export const AIRPORT = { cx: 0, cz: 0, elev: 12 };
export const RUNWAYS: RunwayDef[] = [
  { id: 'RKSA', name: '호라이즌 국제공항', cx: 0, cz: 0, elev: 12, length: 4000, width: 60, heading: 0, lights: true, surface: 'asphalt' },
  { id: 'ALTI', name: '이글 피크 산악 활주로', cx: -1800, cz: -8200, elev: 820, length: 1000, width: 30, heading: 0, lights: true, surface: 'asphalt' },
];
/** Distant airfields on the continents — reachable on long flights. Elevation is resolved from the terrain at load. */
export const AIRFIELDS: { id: string; name: string; cx: number; cz: number; length: number }[] = [
  { id: 'EAST', name: '이스트 플레인스 공항', cx: 74000, cz: -36000, length: 3600 },
  { id: 'DSRT', name: '듄 사막 기지', cx: -96000, cz: 58000, length: 3800 },
  { id: 'NRTH', name: '노스 리지 공항', cx: 18000, cz: -128000, length: 3200 },
  { id: 'SOUT', name: '사우스 코스트 공항', cx: 132000, cz: 96000, length: 3600 },
];
export const CARRIER = { cx: -5200, cz: 7600, deck: 20, length: 330, width: 76, heading: 0 };
export const CITY = { cx: 4300, cz: 0, hx: 2480, hz: 1880, elev: 18 };
export const LAKE = { cx: -4200, cz: -5200, r: 1100 };
export const CANYON_X = 9000;

function rectDist(x: number, z: number, cx: number, cz: number, hx: number, hz: number) {
  const dx = Math.max(Math.abs(x - cx) - hx, 0);
  const dz = Math.max(Math.abs(z - cz) - hz, 0);
  return Math.sqrt(dx * dx + dz * dz);
}

/** The detailed home island (airport, Seoul, canyon, lake). */
function homeIsland(x: number, z: number): number {
  const r = Math.hypot(x - 1500, z + 2500);
  // continental mask
  let land = 0.32 + fbm(x * 0.00009 + 3.1, z * 0.00009 - 7.7, 4) * 0.75;
  land -= smoothstep(3800, 9500, z) * 0.95; // southern ocean
  land -= smoothstep(-3800, -9500, x) * 0.8; // western ocean
  land -= smoothstep(17000, 25000, r) * 2.0; // the island ends
  land += smoothstep(5200, 1200, Math.hypot(x, z)) * 0.55; // airport always on land
  land += smoothstep(4500, 1500, rectDist(x, z, CITY.cx, CITY.cz, CITY.hx, CITY.hz)) * 0.5;

  if (land < 0) {
    // continental shelf / seabed
    return Math.max(land * 520, -380) + vnoise(x * 0.002, z * 0.002) * 6 - 4;
  }
  const coast = smoothstep(0, 0.12, land);
  let h = land * 110 * coast + fbm(x * 0.0011, z * 0.0011, 4) * 14 * coast;

  // Mountains — more to the north
  const north = smoothstep(1000, -9000, z) * 0.65;
  const mm = smoothstep(0.5, 0.9, fbm(x * 0.00016 + 9.2, z * 0.00016 - 2.4, 3) * 0.5 + 0.5 + north);
  const wx = x + fbm(x * 0.0003, z * 0.0003, 2) * 900, wz = z + fbm(x * 0.0003 + 5, z * 0.0003 - 5, 2) * 900;
  const rg = ridged(wx * 0.00026, wz * 0.00026, 7);
  h += (rg * rg * 0.55 + rg * 0.45) * 2200 * mm * coast;
  h += fbm(x * 0.004, z * 0.004, 3) * 22 * mm;

  // Eastern plateau with a meandering canyon
  const pl = smoothstep(6200, 7800, x) * smoothstep(-12000, -8000, z) * smoothstep(4200, 1800, z) * coast;
  if (pl > 0) {
    h += pl * (380 + fbm(x * 0.0007, z * 0.0007, 3) * 60);
    const cxp = CANYON_X + Math.sin(z * 0.00055) * 900 + Math.sin(z * 0.0017) * 220;
    const d = Math.abs(x - cxp);
    const carve = 1 - smoothstep(110, 420, d);
    h -= carve * pl * (360 + vnoise(z * 0.003, 1.7) * 30);
  }
  // Lake basin
  const ld = Math.hypot(x - LAKE.cx, z - LAKE.cz);
  if (ld < LAKE.r * 2.2) {
    const k = 1 - smoothstep(LAKE.r * 0.5, LAKE.r * 2.2, ld);
    h = lerp(h, -18 + fbm(x * 0.003, z * 0.003, 2) * 6, k);
  }
  return h;
}

/** Large-scale climate: dry (desert) 0..1 and cold (tundra) 0..1. */
export function climate(x: number, z: number) {
  const dry = smoothstep(0.05, -0.35, fbm(x * 8e-6 + 40, z * 8e-6 - 20, 3));
  const cold = smoothstep(-60000, -170000, z) * 0.8 + smoothstep(0.3, 0.7, fbm(x * 6e-6 - 9, z * 6e-6 + 2, 2) * 0.5 + 0.5) * 0.2;
  return { dry, cold };
}

/** Continents, mountain ranges, deserts and lakes beyond the home island. */
function continents(x: number, z: number): number {
  const rr = Math.hypot(x - 1500, z + 2500);
  let L = fbm(x * 1.1e-5 + 11, z * 1.1e-5 - 4, 5) * 1.15 + 0.12;
  const wob = fbm(x * 2.2e-5 + 5, z * 2.2e-5 - 1, 3) * 12000;
  L -= (1 - smoothstep(30000 + wob, 50000 + wob, rr)) * 1.1; // irregular sea channel around the home island
  let suppress = 1;
  for (const a of AIRFIELDS) {
    const d = Math.hypot(x - a.cx, z - a.cz);
    if (d < 14000) { L += (1 - smoothstep(3000, 14000, d)) * 0.7; suppress = Math.min(suppress, smoothstep(2500, 12000, d)); }
  }
  if (L < 0) return Math.max(L * 2200, -3000) + vnoise(x * 0.0005, z * 0.0005) * 20 - 6;
  const coast = smoothstep(0, 0.07, L);
  const { dry } = climate(x, z);
  let h = L * 280 * coast + fbm(x * 0.0004, z * 0.0004, 4) * 70 * coast;
  // mountain ranges (domain-warped ridges)
  const wx = x + fbm(x * 0.00003, z * 0.00003, 2) * 9000, wz = z + fbm(x * 0.00003 + 7, z * 0.00003 - 7, 2) * 9000;
  const mm = smoothstep(0.55, 0.85, fbm(x * 1.6e-5 - 7, z * 1.6e-5 + 3, 3) * 0.5 + 0.5 + L * 0.25) * coast * suppress;
  if (mm > 0) { const rg = ridged(wx * 0.00008, wz * 0.00008, 7); h += (rg * rg * 0.6 + rg * 0.4) * 3600 * mm; }
  // desert mesas: terraced plateaus
  if (dry > 0.4 && mm < 0.2) {
    const mesa = smoothstep(0.35, 0.55, fbm(x * 0.00012 + 3, z * 0.00012, 3) * 0.5 + 0.5) * (dry - 0.4) * 1.6 * suppress;
    if (mesa > 0) { const t = 160 * mesa; h += Math.floor(t / 40) * 40 + smoothstep(0, 1, (t % 40) / 40) * 40; }
  }
  // inland lakes
  const lk = fbm(x * 0.00005 + 21, z * 0.00005 - 13, 3);
  if (lk < -0.42 && dry < 0.5) h = lerp(h, -12, smoothstep(-0.42, -0.55, lk) * suppress);
  return h;
}

/** Raw natural terrain (before man-made flattening). */
function natural(x: number, z: number): number {
  const r = Math.hypot(x - 1500, z + 2500);
  if (r < 20000) return homeIsland(x, z);
  if (r > 30000) return continents(x, z);
  return lerp(homeIsland(x, z), continents(x, z), smoothstep(20000, 30000, r));
}

// resolve distant airfield elevations and register their runways
for (const a of AIRFIELDS) {
  const elev = Math.max(30, Math.round(natural(a.cx, a.cz)));
  RUNWAYS.push({ id: a.id, name: a.name, cx: a.cx, cz: a.cz, elev, length: a.length, width: 45, heading: 0, lights: true, surface: 'asphalt' });
}

/** Final ground height at (x,z) — terrain including flattened airport/city/altiport. */
export function terrainHeight(x: number, z: number): number {
  let h = natural(x, z);
  // Main airport plateau
  {
    const d = rectDist(x, z, AIRPORT.cx + 160, AIRPORT.cz, 560, 2700);
    const k = 1 - smoothstep(0, 900, d);
    if (k > 0) h = lerp(h, AIRPORT.elev + (d > 0 ? vnoise(x * 0.01, z * 0.01) * 2 * (d / 900) : 0), k);
  }
  // Approach corridors (RWY 36 from the south, RWY 18 from the north) kept clear of hills
  {
    const ax = Math.abs(x - AIRPORT.cx);
    const kS = (1 - smoothstep(350, 1400, ax)) * smoothstep(2200, 3100, z);
    if (kS > 0) h = lerp(h, Math.min(h, AIRPORT.elev + (z - 2200) * 0.012), kS);
    const kN = (1 - smoothstep(350, 1400, ax)) * smoothstep(-2200, -3100, z) * (1 - smoothstep(-7000, -9000, z));
    if (kN > 0) h = lerp(h, Math.min(h, AIRPORT.elev + (-2200 - z) * 0.02), kN);
  }
  // City
  {
    const d = rectDist(x, z, CITY.cx, CITY.cz, CITY.hx, CITY.hz);
    const k = 1 - smoothstep(0, 1400, d);
    if (k > 0) h = lerp(h, CITY.elev - (d > 0 ? 0 : 0.3), k);
  }
  // Mountain altiport
  {
    const r = RUNWAYS[1];
    const d = rectDist(x, z, r.cx, r.cz, 70, r.length / 2 + 60);
    const k = 1 - smoothstep(0, 650, d);
    if (k > 0) h = lerp(h, r.elev, k);
  }
  // Distant airfields: plateau + clear approach corridors
  if (Math.abs(x) > 40000 || Math.abs(z) > 40000) {
    for (let i = 2; i < RUNWAYS.length; i++) {
      const r = RUNWAYS[i];
      if (Math.abs(x - r.cx) > 9000 || Math.abs(z - r.cz) > 14000) continue;
      const d = rectDist(x, z, r.cx + 150, r.cz, 500, r.length / 2 + 400);
      const k = 1 - smoothstep(0, 1500, d);
      if (k > 0) h = lerp(h, r.elev, k);
      const ax = Math.abs(x - r.cx), along = Math.abs(z - r.cz) - r.length / 2 - 300;
      const kc = (1 - smoothstep(300, 1500, ax)) * smoothstep(0, 900, along) * (1 - smoothstep(9000, 12000, along));
      if (kc > 0) h = lerp(h, Math.min(h, r.elev + along * 0.025), kc);
    }
  }
  return h;
}

/** Runway (if any) containing point. Returns local coords along/across. */
export function runwayAt(x: number, z: number): { rw: RunwayDef; along: number; across: number } | null {
  for (const rw of RUNWAYS) {
    // all runways are aligned to the Z axis
    const along = rw.cz - z; // + towards north
    const across = x - rw.cx;
    if (Math.abs(along) <= rw.length / 2 + 60 && Math.abs(across) <= rw.width / 2 + 20) return { rw, along, across };
  }
  return null;
}

export function onCarrierDeck(x: number, z: number): boolean {
  return Math.abs(x - CARRIER.cx) < CARRIER.width / 2 - 2 && Math.abs(z - CARRIER.cz) < CARRIER.length / 2;
}

/** Surface height for physics (terrain, carrier deck, water returns 0 as "sea"). */
export function surfaceHeight(x: number, z: number): { h: number; water: boolean; deck: boolean } {
  if (onCarrierDeck(x, z)) return { h: CARRIER.deck, water: false, deck: true };
  const t = terrainHeight(x, z);
  if (t < 0) return { h: 0, water: true, deck: false };
  return { h: t, water: false, deck: false };
}

export function terrainNormal(x: number, z: number, e = 2): [number, number, number] {
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  const nx = -hx, ny = 2 * e, nz = -hz;
  const l = Math.hypot(nx, ny, nz);
  return [nx / l, ny / l, nz / l];
}

export const isFlatZone = (x: number, z: number) =>
  rectDist(x, z, AIRPORT.cx + 160, AIRPORT.cz, 560, 2250) < 40 ||
  rectDist(x, z, CITY.cx, CITY.cz, CITY.hx + 100, CITY.hz + 100) < 1 ||
  rectDist(x, z, RUNWAYS[1].cx, RUNWAYS[1].cz, 90, RUNWAYS[1].length / 2 + 80) < 1;

export const headingDeg = (fx: number, fz: number) => {
  const h = (Math.atan2(fx, -fz) * 180) / Math.PI;
  return h < 0 ? h + 360 : h;
};
export const clampWorld = (v: number) => clamp(v, -WORLD_HALF, WORLD_HALF);

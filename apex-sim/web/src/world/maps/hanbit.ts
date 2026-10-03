// 한빛 (Hanbit) — the open-world map (§13.2-1 메트로폴리스 + §13.2-2 지방 & 산악 motifs, all place names fictional).
// 6 × 6 km = 36 km² (§13.1: ≥ 25 km²): a Korean-style city on the north bank of a wide river (grid of arterials and
// streets, CBD towers, apartment complexes, a steep old-town hill), a riverside expressway passing over the bridge
// roads with a diamond interchange, two river bridges (one cable-stayed), a road tunnel through the hill north of the
// city, a valley road, a mountain pass with hairpins over the eastern massif, a lake among the mountains, the
// expressway boring through the massif to a toll plaza, and a farming town with a roundabout south of the river.
// Landmarks: a fountain roundabout where the two central avenues meet, a suspension bridge (은하대교) east of the city,
// a winding skyway up the hill north of the city to an observation tower, a round glass tower in the CBD, a stadium
// south of the river, narrow alleys through the mid-rise blocks and a warren of lanes in the old town.
import { MapBuilder, offsetPoints, onRoad, pointInPolygon, type CalmKind, type MapData, type Road, type RoadSpec } from '../builder';
import { CoarseField, fbm, hash2, lerp, noise2, ridged, rng, smoothstep } from '../noise';
import { widths, STYLES } from '../road';
import { MAT } from '../types';
import { estate, houseQuarter, parkingStrip, plaza, pocketPark, undergroundGarage, villaQuarter, type EstateKind, type Rect, type SculptureKind } from './neighbourhood';

const SIZE = 6000;
const WATER = 3.0; // river level [m]
const LAKE = 62; // lake level [m]

// River centre line (west → east) and half width.
const RIVER: Array<[number, number]> = [[-3300, 820], [-2400, 660], [-1500, 760], [-600, 690], [300, 700], [1200, 600], [2100, 690], [3300, 620]];
const RIVER_HALF = 190;
const LAKE_C: [number, number] = [2250, -2560];

// Districts.
const CITY = { x0: -2720, x1: 720, z0: -1420, z1: 60 }; // north bank city
const SOUTH = { x0: -2460, x1: 140, z0: 960, z1: 2150 }; // south bank district: riverside estates, the hillside quarters behind
const TOWN: [number, number] = [1650, 2150]; // farming town (roundabout)
// 한빛 오프로드 파크: moguls, a whoops lane, a mud bowl, a hill climb and a rock garden on dirt south-west of the town.
const PARK = { x: 1300, z: 2420, hx: 130, hz: 95 };

/** The off-road park's relief added to the natural ground [m] (0 outside), and whether (x, z) is in its mud bowl. */
function parkRelief(x: number, z: number): number {
  const u = x - PARK.x, v = z - PARK.z;
  const inside = smoothstep(PARK.hx + 20, PARK.hx - 10, Math.abs(u)) * smoothstep(PARK.hz + 20, PARK.hz - 10, Math.abs(v));
  if (inside <= 0) return 0;
  let h = 0;
  // Moguls (egg crate, 13 m pitch, ±0.75 m) over the west part.
  const mog = smoothstep(-125, -115, u) * smoothstep(-15, -25, u) * smoothstep(85, 75, Math.abs(v));
  h += mog * 0.75 * Math.sin((2 * Math.PI * u) / 13) * Math.sin((2 * Math.PI * v) / 13);
  // Whoops: a lane of ridges every 9 m, 0.45 m high, running north–south.
  const whoop = smoothstep(-2, 2, u) * smoothstep(14, 10, u) * smoothstep(88, 80, Math.abs(v));
  h += whoop * 0.45 * (0.5 + 0.5 * Math.cos((2 * Math.PI * v) / 9));
  // Mud bowl (0.9 m deep) and the hill climb (7 m, up to ≈ 35 %).
  h -= 0.9 * smoothstep(22, 6, Math.hypot(u - 60, v + 40));
  h += 7 * smoothstep(36, 4, Math.hypot(u - 70, v - 48));
  return h * inside;
}
const inMud = (x: number, z: number) => Math.hypot(x - PARK.x - 60, z - PARK.z + 40) < 17;
const inPark = (x: number, z: number) => Math.abs(x - PARK.x) < PARK.hx + 10 && Math.abs(z - PARK.z) < PARK.hz + 10;

function riverDist(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < RIVER.length; i++) {
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
    const dx = bx - ax, dz = bz - az;
    const w = Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0), 1);
    best = Math.min(best, Math.hypot(x - ax - dx * w, z - az - dz * w));
  }
  return best;
}

function rectMask(r: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number, soft: number): number {
  return smoothstep(r.x0 - soft, r.x0, x) * smoothstep(r.x1 + soft, r.x1, x) * smoothstep(r.z0 - soft, r.z0, z) * smoothstep(r.z1 + soft, r.z1, z);
}

const bell = (x: number, z: number, cx: number, cz: number, a: number, sigma: number) => a * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * sigma * sigma));

/** City ground (the draped streets): gently rising to the north, the old-town hill in the north-west, a lower hill
 *  under the east side's houses and villas (the streets there climb and dip, grades up to ≈ 5 %). */
function cityGround(x: number, z: number): number {
  const hill = bell(x, z, -2250, -1120, 42, 190) + bell(x, z, 430, -1000, 13, 170);
  return 11 + 0.0035 * (-z) + 2.5 * fbm(x / 1400, z / 1400, 2) + hill;
}

const STADIUM: [number, number] = [-900, 1425];
const HILL_PARK: [number, number] = [-1500, 1910]; // 남산 언덕공원, the top of the south hill

/** The south district's relief behind the riverside: two hills (남산 26 m, the east hill 16 m) and a low knoll, and a
 *  rolling ground (±3 m) the streets climb and dip over — grades to ≈ 11 %, crests no sharper than ≈ 1 km radius (a
 *  car at 60 km/h feels under 0.3 m/s² off them). The riverside strip (the bridges' ends) and the stadium stay flat. */
function southRelief(x: number, z: number): number {
  const rise = smoothstep(1150, 1450, z);
  if (rise <= 0) return 0;
  let h = bell(x, z, HILL_PARK[0], HILL_PARK[1], 26, 180) + bell(x, z, -420, 1880, 16, 170) + bell(x, z, -2150, 1640, 9, 150);
  h += 3.2 * Math.sin(x / 95 + 0.7) * Math.sin(z / 110 + 1.3);
  return h * rise * smoothstep(110, 190, Math.hypot(x - STADIUM[0], (z - STADIUM[1]) * 1.3));
}

function southGround(x: number, z: number): number {
  return 10 + 0.002 * (z - 960) + 1.5 * fbm(x / 1100 + 7, z / 1100, 2) + southRelief(x, z);
}

/** Large-scale natural terrain (evaluated on a coarse grid). */
function shape(x: number, z: number): number {
  // Rolling plain.
  let h = 9 + 7 * fbm(x / 1900 + 3.1, z / 1900 - 1.7, 3);
  // Northern valley floor rising gently east toward the lake.
  h += smoothstep(-1900, -2300, z) * smoothstep(300, 2300, x) * 55;
  // Hill north of the city (the tunnel goes under it).
  const northHill = smoothstep(-1470, -1760, z) * smoothstep(-2280, -2020, z);
  h += northHill * (70 + 30 * fbm(x / 700, z / 700, 3) + 30 * ridged(x / 900, z / 900, 4));
  // The rim mountains north of the valley.
  h += smoothstep(-2520, -2880, z) * (150 + 110 * ridged(x / 1100 + 5, z / 1100, 4));
  // Eastern massif (the mountain pass climbs over it, the expressway bores under its flank).
  const rm = Math.hypot((x - 1750) / 1.05, z + 1250);
  const massif = smoothstep(1300, 380, rm);
  h += massif * (95 + 50 * ridged(x / 1300 + 11, z / 1300 - 4, 5) + 60 * smoothstep(700, 0, rm));
  // Lake basin in the north-east, open to the valley on its west side.
  const rl = Math.hypot(x - LAKE_C[0], (z - LAKE_C[1]) * 1.35);
  h += smoothstep(1000, 520, rl) * smoothstep(1800, 2300, x) * 40;
  if (rl < 560) h = lerp(h, LAKE - 12 + 0.00004 * rl * rl, smoothstep(560, 380, rl));
  // South hills and the map rim.
  h += smoothstep(2250, 2800, z) * (50 + 70 * ridged(x / 900, z / 900 + 9, 4));
  const edge = Math.max(Math.abs(x), Math.abs(z));
  h += smoothstep(2720, 2990, edge) * (140 + 60 * fbm(x / 600, z / 600, 3));
  // Districts: flat city grounds (sidewalk level: the streets sit 0.15 m below).
  const cm = rectMask(CITY, x, z, 90);
  h = lerp(h, cityGround(x, z) + 0.15, cm);
  const sm = rectMask(SOUTH, x, z, 90);
  h = lerp(h, southGround(x, z) + 0.15, sm);
  // Farmland around the town: low and gentle.
  const fm = smoothstep(1500, 900, Math.hypot(x - 1500, z - 1850));
  h = lerp(h, 8 + 4 * fbm(x / 1600, z / 1600, 2), fm * 0.85);
  // River: banks, then the bed.
  const d = riverDist(x, z);
  const bank = 6.5 + 0.02 * Math.max(d - RIVER_HALF, 0);
  if (d < RIVER_HALF + 260) h = lerp(Math.min(h, bank + 30), h, smoothstep(RIVER_HALF + 60, RIVER_HALF + 260, d));
  if (d < RIVER_HALF + 60) h = lerp(WATER - 6, Math.min(h, 6.5), smoothstep(RIVER_HALF - 70, RIVER_HALF + 60, d));
  return h;
}

/** The pocket parks' art, in turn. */
const POCKET_ART: SculptureKind[] = ['cubes', 'statue', 'beads', 'wave', 'globe', 'obelisk'];

/** What each residential block of the city's east side is (block column i, row j). */
const CITY_RES: Record<string, EstateKind | 'villa' | 'house'> = {
  '6,0': 'house', '7,0': 'villa',
  '6,1': 'slab', '7,1': 'house',
  '6,2': 'villa', '7,2': 'tower',
  '6,3': 'low', '7,3': 'mixed',
};
/** The south district by row (river → hills) and column (west → east); the stadium has [1][2]. */
const SOUTH_RES: Array<Array<EstateKind | 'villa' | 'house'>> = [
  ['tower', 'slab', 'tower', 'mixed'],
  ['low', 'mixed', 'slab', 'slab'],
  ['villa', 'house', 'villa', 'terrace'],
  ['house', 'house', 'villa', 'house'],
];

export const timings: { last: Record<string, number> } = { last: {} };

export function buildHanbit(onStage?: (stage: string) => void): MapData {
  const tStart = performance.now();
  const coarse = new CoarseField(-SIZE / 2 - 60, -SIZE / 2 - 60, SIZE + 120, 20, shape);
  const tCoarse = performance.now() - tStart;
  // Fine detail (not in the districts or on the river bed): its mask is smooth, so it is sampled coarsely too.
  const roughness = new CoarseField(-SIZE / 2 - 60, -SIZE / 2 - 60, SIZE + 120, 20, (x, z) => (1 - rectMask(CITY, x, z, 90)) * (1 - rectMask(SOUTH, x, z, 90)) * smoothstep(RIVER_HALF - 20, RIVER_HALF + 80, riverDist(x, z)));
  const natural = (x: number, z: number) => {
    const base = coarse.at(x, z) + parkRelief(x, z);
    const rough = roughness.at(x, z);
    return rough > 0.01 ? base + rough * (0.9 * fbm(x / 70, z / 70, 2) + 0.25 * noise2(x / 17, z / 17)) : base;
  };
  const drape = (x: number, z: number) => (z > 600 ? southGround(x, z) : cityGround(x, z));
  const inRect = (r: typeof CITY, x: number, z: number, m: number) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
  const material = (x: number, z: number, y: number, slope: number): number => {
    if (inRect(SOUTH, x, z, 10) && z > 1560 && southRelief(x, z) > 19) return MAT.grass; // the hilltops: parks and gardens
    // The strips between the district's outer streets and its edge: lawns (they were bare concrete), not the riverside.
    if (inRect(SOUTH, x, z, 10) && (x < -2316 || x > -34 || z > 2076)) return MAT.grass;
    if (inRect(CITY, x, z, 10) && z < -20 && (x < -2616 || x > 616 || z < -1316)) return MAT.grass;
    if (inRect(CITY, x, z, 10) || inRect(SOUTH, x, z, 10)) return MAT.concrete; // paved plazas and lots
    if (inPark(x, z)) return inMud(x, z) ? MAT.mud : MAT.dirt; // off-road park (rough dirt, §11.4)
    if (y < WATER + 1.5 && riverDist(x, z) < RIVER_HALF + 40) return MAT.sand;
    if (y > 285) return MAT.snowPacked;
    if (slope > 0.3) return MAT.concrete; // rock
    if (slope > 0.2) return MAT.gravel; // scree
    if (y < 18 && Math.hypot(x - 1500, z - 1850) < 1300 && hash2(Math.floor(x / 90), Math.floor(z / 60), 3) > 0.62) return MAT.dirt; // ploughed fields
    return MAT.grass;
  };
  const R = rng(77);
  const b = new MapBuilder({ id: 'hanbit', name: { ko: '한빛시', en: 'Hanbit' }, size: SIZE, cell: 3, seed: 20260925, natural, drape, material, latitude: 37.5, hazeColor: 0xbfcad6, decorate: (m) => forests(m, R), onStage });
  b.water.push({ kind: 'river', level: WATER, points: RIVER, width: RIVER_HALF * 2 });
  const lake: Array<[number, number]> = [];
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    lake.push([LAKE_C[0] + Math.cos(a) * 470, LAKE_C[1] + (Math.sin(a) * 470) / 1.35]);
  }
  b.water.push({ kind: 'lake', level: LAKE, points: lake });

  const add = (spec: RoadSpec) => b.addRoad(spec);
  const W = (s: keyof typeof STYLES) => widths(STYLES[s]);

  // ---- north city: E–W edge streets, N–S streets (T into the edges), E–W inner streets (crossing) ----
  const EW = [-1300, -1050, -800, -550, -300, -50];
  const NS = [-2600, -2200, -1800, -1400, -1000, -600, -200, 250, 600];
  const ewName = ['한빛북로', '중앙대로', '누리로', '은하대로', '다솜로', '강변대로'];
  const nsName = ['서문로', '세종대로', '나래로', '가람로', '한결대로', '미리내로', '벌빛대로', '새솔로', '동문로'];
  const arterialEW = new Set([-1050, -550, -50]);
  const arterialNS = new Set([-2200, -1000, -200]);
  const ewId = (z: number) => `c_ew${z}`;
  const nsId = (x: number) => `c_ns${x}`;
  // 한빛 분수광장: the two central avenues (한결대로 × 은하대로) meet at a two-lane roundabout around a fountain.
  const RB = { x: -1000, z: -550, r: 56 };
  const rbRing: Array<[number, number]> = [];
  for (let k = 0; k < 24; k++) {
    const a = -(k / 24) * Math.PI * 2; // counter-clockwise traffic (keep right)
    rbRing.push([RB.x + Math.cos(a) * RB.r, RB.z + Math.sin(a) * RB.r]);
  }
  const rb = add({
    id: 'rb_fountain', name: { ko: '분수광장 로터리', en: 'Fountain Circus' }, style: 'ramp', points: rbRing, closed: true,
    styleOverride: { lanes: 2, laneWidth: 3.6, barrier: 'none', sidewalk: 4.2, shoulder: 0.5, verge: 0, emax: 0, crown: 0, smooth: 0, drape: true, lights: 24 },
  });
  for (const z of [EW[0], EW[EW.length - 1]]) {
    add({ id: ewId(z), name: { ko: ewName[EW.indexOf(z)], en: `${ewName[EW.indexOf(z)]}` }, style: arterialEW.has(z) ? 'arterial' : 'street', points: [[NS[0] - 16, z], [NS[NS.length - 1] + 16, z]] });
  }
  for (const x of NS) {
    const name = { ko: nsName[NS.indexOf(x)], en: nsName[NS.indexOf(x)] }, style = arterialNS.has(x) ? 'arterial' : 'street';
    if (x === RB.x) {
      // Split at the roundabout: the north half keeps the id.
      add({ id: nsId(x), name, style, points: [[x, EW[0] - 30], [x, RB.z - RB.r]], start: { join: ewId(EW[0]) }, end: { join: rb.spec.id } });
      add({ id: `${nsId(x)}s`, name, style, points: [[x, RB.z + RB.r], [x, EW[EW.length - 1] + 30]], start: { join: rb.spec.id }, end: { join: ewId(EW[EW.length - 1]) } });
      continue;
    }
    add({ id: nsId(x), name, style, points: [[x, EW[0] - 30], [x, EW[EW.length - 1] + 30]], start: { join: ewId(EW[0]) }, end: { join: ewId(EW[EW.length - 1]) } });
  }
  for (const z of EW.slice(1, -1)) {
    const name = { ko: ewName[EW.indexOf(z)], en: ewName[EW.indexOf(z)] }, style = arterialEW.has(z) ? 'arterial' : 'street';
    if (z === RB.z) {
      // The east half keeps the id (the city-hall spawn is on it).
      add({ id: `${ewId(z)}w`, name, style, points: [[NS[0] - 30, z], [RB.x - RB.r, z]], start: { join: nsId(NS[0]) }, end: { join: rb.spec.id } });
      add({ id: ewId(z), name, style, points: [[RB.x + RB.r, z], [NS[NS.length - 1] + 30, z]], start: { join: rb.spec.id }, end: { join: nsId(NS[NS.length - 1]) } });
      continue;
    }
    add({ id: ewId(z), name, style, points: [[NS[0] - 30, z], [NS[NS.length - 1] + 30, z]], start: { join: nsId(NS[0]) }, end: { join: nsId(NS[NS.length - 1]) } });
  }
  // The island: a stone kerb, lawn, flower beds, a ring of trees and the fountain in the middle.
  {
    const island = RB.r - rb.w.outer + 0.2;
    let top = -Infinity;
    for (let k = 0; k < 16; k++) top = Math.max(top, cityGround(RB.x + Math.cos(k) * island, RB.z + Math.sin(k) * island));
    top += 0.22;
    b.addCylinder({ x: RB.x, z: RB.z, y0: top - 1.5, y1: top, r0: island, material: MAT.concrete, look: 'stone', sides: 32 });
    b.addCylinder({ x: RB.x, z: RB.z, y0: top - 0.2, y1: top + 0.03, r0: island - 0.5, material: -1, look: 'grass' });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2;
      b.addCylinder({ x: RB.x + Math.cos(a) * (island - 7), z: RB.z + Math.sin(a) * (island - 7), y0: top, y1: top + 0.45, r0: 2.2, material: -1, look: 'white', color: k & 1 ? 0xf2c230 : 0xd9486e });
      b.addTree(RB.x + Math.cos(a + 0.39) * (island - 4), RB.z + Math.sin(a + 0.39) * (island - 4), 0.75, 2);
    }
    // The great fountain (한빛 대분수): a 23 m basin, 28 ring jets, a 24 m centre jet.
    b.addFountain({ x: RB.x, z: RB.z, y: top + 0.5, r: 23, jets: 28, height: 24 });
    b.addSign({ x: RB.x + 58, y: cityGround(RB.x + 58, RB.z - 58), z: RB.z - 58, yaw: 0, text: { ko: '한빛 분수광장', en: 'Hanbit Fountain Plaza' }, kind: 'place' });
  }
  // Old-town alleys climbing the hill (steep, narrow).
  add({ id: 'c_alley1', name: { ko: '달동네길', en: 'Daldongne-gil' }, style: 'alley', points: [[-2400, -1300], [-2400, -1050]], start: { join: ewId(-1300) }, end: { join: ewId(-1050) } });
  add({ id: 'c_alley2', name: { ko: '언덕길', en: 'Eondeok-gil' }, style: 'alley', points: [[-2600, -1180], [-2200, -1180]], start: { join: nsId(-2600) }, end: { join: nsId(-2200) } });
  // Winding lanes (골목): one lane wide between walls of low houses.
  // Old-town lanes (구도심 돌길): granite setts, felt through the tyres (§11.4 roughness).
  const lane = { sidewalk: 1.4, lights: 22, laneWidth: 2.7, shoulder: 0.1, surface: MAT.cobble };
  add({ id: 'c_alley3', name: { ko: '꼬불길', en: 'Kkobul-gil' }, style: 'alley', styleOverride: lane, points: [[-2100, -1300], [-2085, -1245], [-2035, -1205], [-2020, -1150], [-1965, -1105], [-1950, -1050]], start: { join: ewId(-1300) }, end: { join: ewId(-1050) } });
  add({ id: 'c_alley4', name: { ko: '우물길', en: 'Umul-gil' }, style: 'alley', styleOverride: lane, points: [[-2350, -1050], [-2335, -995], [-2385, -945], [-2362, -885], [-2305, -850], [-2300, -800]], start: { join: ewId(-1050) }, end: { join: ewId(-800) } });
  add({ id: 'c_alley5', name: { ko: '계단길', en: 'Gyedan-gil' }, style: 'alley', styleOverride: lane, points: [[-2200, -935], [-2140, -920], [-2080, -950], [-2000, -940], [-1930, -905], [-1800, -900]], start: { join: nsId(-2200) }, end: { join: nsId(-1800) } });

  // ---- south district: the riverside estates, then the hillside quarters (villas, houses, a terraced estate) over
  // 남산 and the east hill; edge streets E–W, N–S streets T into them, the inner E–W streets crossing ----
  const SEW = [1050, 1300, 1550, 1800, 2060];
  const SNS = [-2300, -1800, -1200, -600, -50];
  const sewName: Record<number, [string, string]> = { 1050: ['남강변로', 'Namgangbyeon-ro'], 1300: ['아람로', 'Aram-ro'], 1550: ['남한빛로', 'Namhanbit-ro'], 1800: ['언덕마을로', 'Eondeokmaeul-ro'], 2060: ['남산자락길', 'Namsanjarak-gil'] };
  const snsName: Record<number, [string, string]> = { [-2300]: ['서남로', 'Seonam-ro'], [-1800]: ['나래남로', 'Naraenam-ro'], [-1200]: ['솔빛로', 'Solbit-ro'], [-600]: ['한빛남로', 'Hanbitnam-ro'], [-50]: ['동남로', 'Dongnam-ro'] };
  const sewId = (z: number) => `s_ew${z}`;
  const snsId = (x: number) => `s_ns${x}`;
  const sEdge = [SEW[0], SEW[SEW.length - 1]];
  for (const z of sEdge) add({ id: sewId(z), name: { ko: sewName[z][0], en: sewName[z][1] }, style: z === 1050 ? 'arterial' : 'street', points: [[SNS[0] - 16, z], [SNS[SNS.length - 1] + 16, z]] });
  for (const x of SNS) add({ id: snsId(x), name: { ko: snsName[x][0], en: snsName[x][1] }, style: x === -1800 || x === -600 ? 'arterial' : 'street', points: [[x, sEdge[0] - 30], [x, sEdge[1] + 30]], start: { join: sewId(sEdge[0]) }, end: { join: sewId(sEdge[1]) } });
  for (const z of SEW.slice(1, -1)) add({ id: sewId(z), name: { ko: sewName[z][0], en: sewName[z][1] }, style: 'street', points: [[SNS[0] - 30, z], [SNS[SNS.length - 1] + 30, z]], start: { join: snsId(SNS[0]) }, end: { join: snsId(SNS[SNS.length - 1]) } });
  // Winding lanes over the two hills (골목길, one lane each way, the grades the hill's): past 남산 언덕공원 on its top,
  // and over the east hill.
  const hillLane = { sidewalk: 1.8, lights: 24, laneWidth: 2.9, shoulder: 0.2 };
  add({ id: 's_hill1', name: { ko: '남산언덕길', en: 'Namsan-eondeok-gil' }, style: 'alley', styleOverride: hillLane, points: [[-1650, 1800], [-1640, 1840], [-1600, 1875], [-1560, 1880], [-1520, 1850], [-1460, 1845], [-1420, 1880], [-1420, 1940], [-1400, 2000], [-1360, 2030], [-1350, 2060]], start: { join: sewId(1800) }, end: { join: sewId(2060) } });
  add({ id: 's_hill2', name: { ko: '동산길', en: 'Dongsan-gil' }, style: 'alley', styleOverride: hillLane, points: [[-480, 1800], [-470, 1840], [-430, 1870], [-380, 1880], [-340, 1920], [-330, 1975], [-290, 2020], [-280, 2060]], start: { join: sewId(1800) }, end: { join: sewId(2060) } });

  // ---- bridge roads (connectors): city → river → south district ----
  add({ id: 'C1', name: { ko: '나래교', en: 'Narae Bridge' }, style: 'connector', points: [[-1800, -60], [-1800, 250], [-1800, 600], [-1800, 1060]], start: { join: ewId(-50) }, end: { join: sewId(1050) } });
  add({ id: 'C2', name: { ko: '한빛대교', en: 'Hanbit Grand Bridge' }, style: 'connector', points: [[-600, -60], [-600, 250], [-600, 650], [-600, 1060]], start: { join: ewId(-50) }, end: { join: sewId(1050) }, landmark: true });

  // ---- farming town: roundabout and approach roads ----
  const ring: Array<[number, number]> = [];
  for (let k = 0; k < 16; k++) {
    const a = -(k / 16) * Math.PI * 2; // clockwise seen from above = counter-clockwise traffic (keep right)
    ring.push([TOWN[0] + Math.cos(a) * 30, TOWN[1] + Math.sin(a) * 30]);
  }
  add({ id: 'ring', name: { ko: '솔내 로터리', en: 'Sollae Roundabout' }, style: 'ramp', styleOverride: { barrier: 'none', lights: 18, verge: 3, shoulder: 0.6, emax: 0.02, laneWidth: 4.5 }, points: ring, closed: true, noRoute: false });
  add({ id: 'R2', name: { ko: '솔내로', en: 'Sollae-ro' }, style: 'rural', points: [[TOWN[0], TOWN[1] - 30], [1680, 1850], [1760, 1450], [1800, 1050], [1830, 780], [1860, 420], [1890, 160], [1925, -120], [1950, -330]], start: { join: 'ring' } });
  add({ id: 'R3', name: { ko: '들녘로', en: 'Deulnyeok-ro' }, style: 'rural', points: [[TOWN[0] - 30, TOWN[1]], [1350, 2100], [900, 1880], [500, 1600], [180, 1400], [-50, 1330]], start: { join: 'ring' }, end: { join: snsId(-50) } });
  add({ id: 'R4', name: { ko: '동녘길', en: 'Dongnyeok-gil' }, style: 'rural', points: [[TOWN[0] + 30, TOWN[1]], [2000, 2200], [2450, 2050], [2750, 1800]], start: { join: 'ring' } });
  add({ id: 'R5', name: { ko: '남산길', en: 'Namsan-gil' }, style: 'gravel', points: [[TOWN[0], TOWN[1] + 30], [1640, 2400], [1500, 2600], [1350, 2700], [1100, 2650]], start: { join: 'ring' } });
  // Farm roads between the fields (narrow concrete) and a forest trail.
  const on = (id: string, x: number, z: number) => onRoad(b.byId.get(id)!, x, z);
  add({ id: 'F1', style: 'farm', points: [on('R3', 1150, 1990), [1180, 1800], [1450, 1700], on('R2', 1720, 1650)], start: { join: 'R3' }, end: { join: 'R2' } });
  add({ id: 'F2', style: 'farm', points: [on('R3', 700, 1740), [900, 1500], [1200, 1380], on('R2', 1790, 1300)], start: { join: 'R3' }, end: { join: 'R2' } });
  add({ id: 'F3', style: 'farm', points: [on('R4', 2150, 2150), [2150, 1900], [2000, 1600], on('R2', 1810, 1000)], start: { join: 'R4' }, end: { join: 'R2' } });
  // 은하대교: suspension bridge from the city's east end over the river to 들녘로.
  add({
    id: 'C3', name: { ko: '은하대교', en: 'Eunha Bridge' }, style: 'connector',
    points: [[600, -60], [600, 250], [604, 480], [612, 700], [622, 920], [630, 1150], [612, 1400], on('R3', 556, 1638)],
    start: { join: ewId(-50) }, end: { join: 'R3' }, suspension: true,
  });
  add({ id: 'T2', name: { ko: '숲길', en: 'Forest trail' }, style: 'trail', points: [on('R5', 1180, 2670), [900, 2500], [650, 2450], [400, 2300], [150, 2380], [-200, 2250]], start: { join: 'R5' } });

  // ---- north: valley road, city tunnel road, mountain pass ----
  add({ id: 'N1', name: { ko: '북부순환로', en: 'Northern Loop' }, style: 'rural', points: [[2620, -2330], [2300, -2240], [1900, -2280], [1450, -2230], [900, -2330], [300, -2380], [-200, -2400], [-900, -2340], [-1600, -2420], [-2300, -2350], [-2620, -2380]] });
  add({ id: 'T1', name: { ko: '북악로 (북악터널)', en: 'Bugak-ro (Bugak Tunnel)' }, style: 'connector', styleOverride: { barrier: 'none' }, points: [[-200, -1300], [-200, -1450], [-190, -1600], [-170, -1900], [-160, -2150], [-190, -2300], on('N1', -200, -2400)], start: { join: ewId(-1300) }, end: { join: 'N1' }, tunnels: [[2, 4]] });
  // Mountain pass: hairpins up the north face of the massif, over the pass, down the south face to R2.
  add({
    id: 'M1', name: { ko: '한빛재 고갯길', en: 'Hanbit Pass' }, style: 'mountain',
    points: [on('N1', 1700, -2262), [1690, -2150], [1500, -2080], [1470, -2010], [1650, -1960], [1690, -1880], [1530, -1800], [1560, -1700], [1700, -1580], [1740, -1450],
      [1720, -1300], [1560, -1200], [1560, -1120], [1780, -1040], [1790, -960], [1600, -880], [1610, -800], [1820, -720], [1830, -620], [1700, -540], [1720, -450], [1850, -360], on('R2', 1935, -230)],
    start: { join: 'N1' }, end: { join: 'R2' },
  });

  // ---- 북녘 전원마을: a farming village in the northern valley along 북부순환로 — houses with blue, red and green
  // roofs scattered on the valley's slopes, plastic greenhouses (비닐하우스), an orchard, two concrete farm lanes
  // climbing the hillsides (농로, one lane each way) ----
  const villageLane = { laneWidth: 2.4, shoulder: 0.3, verge: 1.0, lights: 0 };
  add({ id: 'V1', name: { ko: '북녘마을길', en: 'Bungnyeok-maeul-gil' }, style: 'farm', styleOverride: villageLane, points: [on('N1', -1250, -2372), [-1240, -2325], [-1215, -2290], [-1225, -2262]], start: { join: 'N1' } }); // ends below the hill's steep face (a lane up it cut a scar)
  add({ id: 'V2', name: { ko: '북녘윗길', en: 'Bungnyeok-wit-gil' }, style: 'farm', styleOverride: villageLane, points: [on('N1', -1040, -2350), [-1050, -2410], [-1020, -2465], [-1060, -2520]], start: { join: 'N1' } });
  {
    const VR = rng(5150);
    const house = (x: number, z: number, yaw: number) => {
      if (b.footprintOnRoad(x, z, 14, 12, yaw, 3)) return;
      const w = 9 + VR() * 4, d = 7 + VR() * 3;
      let y = Infinity;
      for (const [a, c] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) y = Math.min(y, b.terrain.heightAt(x + a * w * Math.cos(yaw) + c * d * Math.sin(yaw), z - a * w * Math.sin(yaw) + c * d * Math.cos(yaw)));
      b.addBuilding({ x, z, y, w, d, h: VR() < 0.75 ? 3.1 : 5.6, yaw, type: VR() < 0.8 ? 4 : 9, seed: Math.floor(VR() * 1e9) });
      if (VR() < 0.6) b.addTree(x + (VR() - 0.5) * 16, z + (VR() - 0.5) * 16, 0.8 + VR() * 0.3, 0);
    };
    // Houses along the loop road, and up the two lanes.
    const n1 = b.byId.get('N1')!;
    const [sa, sb] = [n1.nearest(-1520, -2410).s, n1.nearest(-760, -2335).s].sort((a, c) => a - c); // N1 runs east → west
    for (let s = sa; s < sb; s += 20 + VR() * 26) {
      const p = n1.at(s);
      for (const side of [-1, 1]) {
        if (VR() < 0.35) continue;
        const u = side * (n1.w.full + 17 + VR() * 24);
        house(p.x + u * p.tz, p.z - u * p.tx, Math.atan2(p.tx, p.tz) + (VR() - 0.5) * 0.3);
      }
    }
    for (const id of ['V1', 'V2']) {
      const r = b.byId.get(id)!;
      for (let s = 30; s < r.length - 10; s += 22 + VR() * 14) {
        const p = r.at(s);
        const side = VR() < 0.5 ? -1 : 1;
        const u = side * (r.w.full + 15 + VR() * 8);
        house(p.x + u * p.tz, p.z - u * p.tx, Math.atan2(p.tx, p.tz));
      }
    }
    // Greenhouses: rows of long white tunnels south of the road, an orchard of small trees north of it.
    for (let k = 0; k < 7; k++) {
      const x = -1440 + k * 9, z = -2335;
      if (b.footprintOnRoad(x, z, 6, 40, 0, 3)) continue;
      b.addBox({ cx: x, cy: b.terrain.heightAt(x, z) + 1.2, cz: z, hx: 3, hy: 1.2, hz: 20, yaw: 0.08, material: MAT.concrete, look: 'none', color: 0xdfe6e9 });
    }
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 6; j++) {
        const x = -900 + i * 7 + (j & 1) * 3.5, z = -2445 - j * 7;
        if (!b.footprintOnRoad(x, z, 3, 3, 0, 2)) b.addTree(x, z, 0.55, 2);
      }
    }
    const p = n1.at(n1.nearest(-1300, -2380).s);
    b.addSign({ x: p.x + 9 * p.tz, y: p.y, z: p.z - 9 * p.tx, yaw: Math.atan2(-p.tx, -p.tz), text: { ko: '북녘 전원마을', en: 'Bungnyeok village' }, kind: 'place' });
  }

  // ---- expressway: along the north bank, over the bridge roads and R2, through the massif, to the toll plaza ----
  add({
    id: 'H1', name: { ko: '한빛고속도로', en: 'Hanbit Expressway' }, style: 'highway',
    points: [[-2640, 272], [-2300, 240], [-1500, 300], [-600, 260], [300, 250], [1100, 290], [1600, 190], [2050, -40], [2380, -420], [2560, -900], [2620, -1300], [2600, -1750], [2520, -2050], [2480, -2190], on('N1', 2470, -2280)],
    over: [{ road: 'C1' }, { road: 'C2' }, { road: 'C3' }, { road: 'R2' }], end: { join: 'N1' }, tunnels: [[8, 12]], fixed: [{ at: 8, y: 40, radius: 500 }, { at: 12, y: 95, radius: 300 }],
  });
  const H1 = b.byId.get('H1')!;
  const hw = W('highway'), rw = W('ramp');
  const off = hw.pe + rw.peLeft - 0.3;
  // Diamond interchange (한빛IC) at C2: stations of the crossing.
  const sx = H1.nearest(-600, 260).s;
  // Westbound (north side) off-ramp: leaves at ≈ x −250, runs beside, curves north to 강변대로.
  add({ id: 'IC_wb_off', name: { ko: '한빛IC 진출', en: 'Hanbit IC exit' }, style: 'ramp', points: [...offsetPoints(H1, sx + 460, sx + 300, off, 4), [-380, 150], [-420, 60], [-420, -50]], merge: { road: 'H1', at: 'start', length: 150 }, end: { join: ewId(-50) }, oneWayRoute: true });
  add({ id: 'IC_wb_on', name: { ko: '한빛IC 진입', en: 'Hanbit IC entry' }, style: 'ramp', points: [[-780, -50], [-780, 60], [-830, 150], ...offsetPoints(H1, sx - 300, sx - 460, off, 4)], start: { join: ewId(-50) }, merge: { road: 'H1', at: 'end', length: 150 }, oneWayRoute: true });
  // Eastbound (south side): off-ramp before the bridge road to C2 (west side), on-ramp from C2 (east side).
  add({ id: 'IC_eb_off', name: { ko: '한빛IC 진출', en: 'Hanbit IC exit' }, style: 'ramp', points: [...offsetPoints(H1, sx - 460, sx - 300, -off, 4), [-800, 380], [-700, 420], [-600, 425]], merge: { road: 'H1', at: 'start', length: 150 }, end: { join: 'C2' }, oneWayRoute: true });
  add({ id: 'IC_eb_on', name: { ko: '한빛IC 진입', en: 'Hanbit IC entry' }, style: 'ramp', points: [[-600, 425], [-500, 420], [-400, 380], ...offsetPoints(H1, sx + 300, sx + 460, -off, 4)], start: { join: 'C2' }, merge: { road: 'H1', at: 'end', length: 150 }, oneWayRoute: true });

  // ---- 누리지하차도: a street that dives under 중앙대로 (§13.2-1 지하차도): open cuts down to a short covered box
  // under the crossing, lit inside like the tunnels; the avenue above crosses it on the ground (no junction). ----
  const UX = -800, UZ = -1050;
  add({
    id: 'U1', name: { ko: '누리지하차도', en: 'Nuri Underpass' }, style: 'connector', styleOverride: { barrier: 'none' },
    points: [[UX, EW[0]], [UX, -1200], [UX, UZ - 46], [UX, UZ + 46], [UX, -900], [UX, EW[2]]],
    start: { join: ewId(EW[0]) }, end: { join: ewId(EW[2]) }, tunnels: [[2, 3]],
    fixed: [{ at: 2, y: cityGround(UX, UZ - 46) - 7.8, radius: 30 }, { at: 3, y: cityGround(UX, UZ + 46) - 7.8, radius: 30 }],
  });

  // ---- 북악스카이웨이: a skyway traversing the north hill's face, a hairpin, the ridge to the observation tower ----
  const sky = add({
    id: 'S1', name: { ko: '북악스카이웨이', en: 'Bugak Skyway' }, style: 'mountain', styleOverride: { lights: 40 },
    points: [[-400, -1300], [-408, -1420], [-470, -1500], [-700, -1565], [-1000, -1640], [-1190, -1690], [-1268, -1732], [-1250, -1786], [-1100, -1803], [-930, -1812]],
    start: { join: ewId(-1300) },
  });
  {
    const end = sky.at(sky.length);
    const cx = end.x + end.tx * 42, cz = end.z + end.tz * 42, y = end.y;
    const plaza: Array<[number, number]> = [];
    for (let k = 0; k < 28; k++) plaza.push([cx + Math.cos((k / 28) * Math.PI * 2) * 40, cz + Math.sin((k / 28) * Math.PI * 2) * 40]);
    b.addPad({ outline: plaza, y: () => y, material: MAT.concrete, look: 'concrete', grid: 8, fill: true });
    // 북악타워: tapered concrete shaft, glass observation deck, white cap, mast (lit at the top).
    b.addCylinder({ x: cx, z: cz, y0: y - 2, y1: y + 118, r0: 10, r1: 6, material: MAT.concrete, look: 'concrete', sides: 20 });
    b.addCylinder({ x: cx, z: cz, y0: y + 114, y1: y + 130, r0: 14.5, r1: 15.5, material: -1, look: 'tower' });
    b.addCylinder({ x: cx, z: cz, y0: y + 130, y1: y + 136, r0: 16, r1: 9, material: -1, look: 'white' });
    b.addCylinder({ x: cx, z: cz, y0: y + 136, y1: y + 164, r0: 3.4, r1: 2.6, material: -1, look: 'white' });
    b.addCylinder({ x: cx, z: cz, y0: y + 164, y1: y + 218, r0: 1.3, r1: 0.25, material: -1, look: 'steel' });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      b.addTree(cx + Math.cos(a) * 33, cz + Math.sin(a) * 33, 0.8, 2);
    }
    b.addSign({ x: end.x + end.tz * 8, y, z: end.z - end.tx * 8, yaw: Math.atan2(-end.tx, -end.tz), text: { ko: '북악타워 전망대', en: 'Bugak Tower' }, kind: 'place' });
  }

  // ---- 한빛고가로 (도시고속화도로): an elevated expressway across the city between 다솜로 and 강변대로, 11 m over the
  // streets it passes (no junctions), on concrete piers that keep off the streets below; it climbs from the west edge
  // street and comes down to the east one. ----
  const EZ = -175;
  const elevPts: Array<[number, number]> = [[NS[0] - 30, EZ]];
  const elevFixed: Array<{ at: number; y: number; radius: number }> = [];
  for (let i = 0; i + 1 < NS.length; i++) {
    const mid = (NS[i] + NS[i + 1]) / 2;
    if (i > 0 && i < NS.length - 2) elevFixed.push({ at: elevPts.length, y: cityGround(mid, EZ) + 11, radius: 60 });
    elevPts.push([mid, EZ]);
    if (i + 2 < NS.length) {
      elevFixed.push({ at: elevPts.length, y: cityGround(NS[i + 1], EZ) + 11, radius: 60 });
      elevPts.push([NS[i + 1], EZ]);
    }
  }
  elevPts.push([NS[NS.length - 1] + 30, EZ]);
  add({
    id: 'E1', name: { ko: '한빛고가로', en: 'Hanbit Elevated Road' }, style: 'connector', styleOverride: { lights: 40 },
    points: elevPts, fixed: elevFixed, start: { join: nsId(NS[0]) }, end: { join: nsId(NS[NS.length - 1]) },
  });

  // ---- apartment estates (대단지 아파트): an access lane through each, with humps (단지 내 방지턱); each estate its
  // own design (slabs, cross-plan towers, the old five-storey blocks, a mix, terraces up a hill) and palette ----
  const complex = (x0: number, z0: number, x1: number, z1: number, zTop: number, zBot: number, top: string, bottom: string, ground: (x: number, z: number) => number, design: EstateKind = 'slab') => {
    const cx = Math.round((x0 + x1) / 2);
    const id = `apt_${cx}_${zTop}`;
    const lane = add({ id, style: 'alley', points: [[cx, zTop], [cx, zBot]], start: { join: top }, end: { join: bottom } });
    const half = Math.max(W('alley').pe, W('alley').peLeft);
    // Estate humps (단지 내 방지턱): round ones, a long high one mid-lane, a raised crosswalk by the entrance.
    const kinds: CalmKind[] = ['table', 'hump', 'big', 'hump', 'hump', 'big'];
    for (let d = 30, k = 0; d < lane.length - 30; d += 58, k++) b.addCalming(lane, d, kinds[k % kinds.length]);
    b.addSign({ x: cx + half + 1.5, y: ground(cx + half + 1.5, zTop + 26), z: zTop + 26, yaw: 0, text: { ko: '과속방지턱', en: 'Speed humps' }, sub: { ko: '단지 내 서행 20', en: 'Estate 20 km/h' }, kind: 'info' });
    // The estate's underground car park (지하주차장): a ramp down from the access lane on its roomier side, the hall
    // under the blocks there.
    const outer = W('alley').outer;
    const roomE = x1 - (cx + outer), roomW = cx - outer - x0;
    const side: 1 | -1 = roomE >= roomW ? 1 : -1;
    const room = Math.max(roomE, roomW), depth = z1 - z0;
    const reserve: Rect[] = [], under: Rect[] = [];
    if (room > 30 + 40 + 6 && depth > 56) {
      const hd = Math.min(40, depth - 12), hw = Math.min(60, room - 36);
      const zc = Math.round(z0 + 4 + hd / 2 + (depth - 8 - hd) * 0.4);
      const g = undergroundGarage(b, cx + side * outer, zc, side, ground, hw, hd);
      reserve.push(g.ramp);
      under.push(g.hall);
      garages.push({ x: cx + side * (outer + 3), z: zc, yaw: side > 0 ? Math.PI / 2 : -Math.PI / 2 });
    }
    estate(b, R, { x0, z0, x1, z1 }, ground, design, [lane], reserve, under);
  };
  const garages: Array<{ x: number; z: number; yaw: number }> = [];
  // ---- villa and house quarters (빌라촌 · 단독주택가): narrow lanes through the block — N–S every ≈ 150 m from street
  // to street, one E–W across them (named after the street they leave, the Korean way: "언덕마을로12길") ----
  let laneNo = 2;
  let parkNo = 0;
  const quarter = (kind: 'villa' | 'house', r: Rect, top: string, bottom: string, left: string, right: string, zTop: number, zBot: number, xLeft: number, xRight: number, ground: (x: number, z: number) => number, base: string, through: Road[] = [], keep: Array<[number, number, number]> = []) => {
    const lanes: Road[] = [...through];
    const style = { sidewalk: 1.6, lights: 22, laneWidth: 2.9, shoulder: 0.2 };
    const n = through.length ? 0 : Math.max(1, Math.round((r.x1 - r.x0) / 150));
    for (let k = 1; k <= n; k++) {
      const x = Math.round(r.x0 + ((r.x1 - r.x0) * k) / (n + 1));
      lanes.push(add({ id: `lane_${x}_${zTop}`, name: { ko: `${base}${laneNo}길`, en: `${base} ${laneNo}-gil` }, style: 'alley', styleOverride: style, points: [[x, zTop], [x, zBot]], start: { join: top }, end: { join: bottom } }));
      laneNo += 2;
    }
    const zm = Math.round((zTop + zBot) / 2 / 5) * 5;
    lanes.push(add({ id: `lane_${xLeft}_${zm}`, name: { ko: `${base}${laneNo}길`, en: `${base} ${laneNo}-gil` }, style: 'alley', styleOverride: style, points: [[xLeft, zm], [xRight, zm]], start: { join: left }, end: { join: right } }));
    laneNo += 2;
    // A pocket park (어린이공원) with a piece of art, between the block's edge and its first lane.
    const parks: Array<[number, number, number]> = [];
    const px = Math.round(r.x0 + Math.min(70, (r.x1 - r.x0) / (n + 1) / 2)), pz = Math.round(r.z0 + (zm - r.z0) / 2);
    if (R() < 0.75 && lanes.every((l) => Math.abs(l.nearest(px, pz).u) > l.w.outer + 20)) {
      parks.push([px, pz, 15]);
      pocketPark(b, R, px, pz, 14, ground, POCKET_ART[parkNo++ % POCKET_ART.length]);
    }
    (kind === 'villa' ? villaQuarter : houseQuarter)(b, R, r, ground, lanes, [...keep, ...parks]);
  };

  // ---- buildings: city blocks ----
  let carParkAt = { x: 0, z: 0, y: 0 };
  let plazaAt = { x: 0, z: 0 };
  const oldAlleys = ['c_alley1', 'c_alley2', 'c_alley3', 'c_alley4', 'c_alley5'].map((id) => b.byId.get(id)!);
  const golName = ['먹자골목', '공방길', '책방골목', '꽃담길', '빵집골목', '카페거리', '은행나무길', '공구상가길', '인쇄골목', '한옥길', '사진관길', '국숫집골목'];
  let gol = 0;
  // The E–W street at z by x (은하대로 is split at the circus).
  const ewAt = (z: number, x: number) => (z === RB.z && x < RB.x ? `${ewId(z)}w` : ewId(z));
  // The round glass tower (한빛 원형타워) in the CBD block south-east of the circus.
  const RT = { x: -760, z: -430, r: 23 };
  const keep: Array<[number, number, number]> = [[RT.x, RT.z, RT.r + 8]];
  const ewW = (z: number) => (arterialEW.has(z) ? W('arterial') : W('street')).outer;
  const nsW = (x: number) => (arterialNS.has(x) ? W('arterial') : W('street')).outer;
  // The N–S street at x by z (한결대로 is split at the circus).
  const nsAt = (x: number, z: number) => (x === RB.x && z > RB.z ? `${nsId(x)}s` : nsId(x));
  // A back street (이면도로, named the Korean way after the avenue it runs behind: "누리로6길") through the middle of a
  // block, E–W from street to street; where a landmark stands in the middle it runs to one side of it.
  const backStreet = (i: number, j: number): Road | null => {
    const mid = Math.round((EW[j] + EW[j + 1]) / 2);
    const clear = (z: number) => keep.every(([kx, kz, kr]) => kx < NS[i] || kx > NS[i + 1] || Math.abs(z - kz) > kr + 16);
    const z = [mid, mid + 55, mid - 55].find(clear);
    if (z === undefined) return null;
    const no = 2 * (i + 1) + (j & 1);
    return add({
      id: `c_back_${i}_${j}`, name: { ko: `${ewName[j + 1]}${no}길`, en: `${ewName[j + 1]} ${no}-gil` }, style: 'alley',
      styleOverride: { sidewalk: 2.6, lights: 24, laneWidth: 3.0 },
      points: [[NS[i], z], [NS[i + 1], z]], start: { join: nsAt(NS[i], z) }, end: { join: nsAt(NS[i + 1], z) },
    });
  };
  for (let i = 0; i + 1 < NS.length; i++) {
    for (let j = 0; j + 1 < EW.length; j++) {
      const x0 = NS[i] + nsW(NS[i]) + 3, x1 = NS[i + 1] - nsW(NS[i + 1]) - 3;
      const z0 = EW[j] + ewW(EW[j]) + 3, z1 = EW[j + 1] - ewW(EW[j + 1]) - 3;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      let kind: 'cbd' | 'apart' | 'old' | 'mid' | 'park' = 'mid';
      if (Math.hypot(cx + 2250, cz + 1120) < 330) kind = 'old';
      else if (cx > -1300 && cx < 0 && cz > -1100 && cz < -300) kind = 'cbd';
      else if (cx > 0 || cz > -300) kind = 'apart';
      if (i === 5 && j === 2) kind = 'park'; // city hall plaza
      if (j === EW.length - 2) {
        // Under the elevated road: rows of villas and shops north and south of it, a strip of trees beneath.
        villaQuarter(b, R, { x0, z0, x1, z1: EZ - 24 }, cityGround);
        villaQuarter(b, R, { x0, z0: EZ + 24, x1, z1 }, cityGround);
        for (let x = x0 + 10; x < x1 - 10; x += 19) {
          if (!b.nearPaved(x, EZ - 14, 3)) b.addTree(x, EZ - 14, 0.8, 0);
          if (!b.nearPaved(x + 9, EZ + 14, 3)) b.addTree(x + 9, EZ + 14, 0.8, 0);
        }
        continue;
      }
      if (kind === 'park') {
        // 한빛광장: a wide open square before city hall (paving a car can drive on, a lawn oval, the fountain,
        // sculptures, flagpoles), and the public car park at the block's east end.
        plaza(b, R, { x0, z0, x1: x1 - 104, z1 }, cityGround, { lawn: true, fountain: { r: 11, height: 14, jets: 18 }, art: ['statue', 'cubes', 'globe', 'wave'], flags: true });
        plazaAt = { x: (x0 + x1 - 104) / 2, z: z1 - 12 };
        // Spawn on the ground floor, by the east entrance, facing in.
        const gy = carPark(b, x1 - 50, (z0 + z1) / 2, cityGround);
        carParkAt = { x: x1 - 50 + 30, z: (z0 + z1) / 2 - 4, y: gy + 0.02 };
        continue;
      }
      if (NS[i] < UX && NS[i + 1] > UX && j < 2) {
        // The underpass runs through these blocks: buildings keep clear of its cuts.
        fillBlock(b, R, x0, z0, UX - 26, z1, kind, cityGround);
        fillBlock(b, R, UX + 26, z0, x1, z1, kind, cityGround);
      } else if (kind === 'apart') {
        // The east side over its hill: houses on the hill's top, villas and estates of four designs around it.
        const res = CITY_RES[`${i},${j}`] ?? 'slab';
        if (res === 'villa' || res === 'house') {
          quarter(res, { x0, z0, x1, z1 }, ewAt(EW[j], cx), ewAt(EW[j + 1], cx), nsAt(NS[i], cz), nsAt(NS[i + 1], cz), EW[j], EW[j + 1], NS[i], NS[i + 1], cityGround, ewName[j + 1]);
        } else complex(x0, z0, x1, z1, EW[j], EW[j + 1], ewAt(EW[j], cx), ewAt(EW[j + 1], cx), cityGround, res);
      } else if (kind === 'mid') {
        // A narrow shopping alley (골목) N–S through the middle of each mid-rise block, crossed by a back street.
        const gx = Math.round(cx / 10) * 10 + (j & 1 ? 40 : -40);
        const alley = add({ id: `c_gol_${i}_${j}`, name: { ko: golName[gol % golName.length], en: golName[gol++ % golName.length] }, style: 'alley', styleOverride: { sidewalk: 2.4, lights: 20, laneWidth: 2.8 }, points: [[gx, EW[j]], [gx, EW[j + 1]]], start: { join: ewAt(EW[j], gx) }, end: { join: ewAt(EW[j + 1], gx) } });
        const back = backStreet(i, j);
        fillBlock(b, R, x0, z0, x1, z1, kind, cityGround, back ? [alley, back] : [alley]);
      } else if (kind === 'cbd') {
        // Business blocks: a back street between the towers.
        const back = backStreet(i, j);
        fillBlock(b, R, x0, z0, x1, z1, kind, cityGround, back ? [rb, back] : [rb], keep);
      } else fillBlock(b, R, x0, z0, x1, z1, kind, cityGround, kind === 'old' ? oldAlleys : [rb], keep);
    }
  }
  for (let i = 0; i + 1 < SNS.length; i++) {
    for (let j = 0; j + 1 < SEW.length; j++) {
      const sw = (x: number) => (x === -1800 || x === -600 ? W('arterial') : W('street')).outer;
      const ew = (z: number) => (z === 1050 ? W('arterial') : W('street')).outer;
      const x0 = SNS[i] + sw(SNS[i]) + 3, x1 = SNS[i + 1] - sw(SNS[i + 1]) - 3;
      const z0 = SEW[j] + ew(SEW[j]) + 3, z1 = SEW[j + 1] - ew(SEW[j + 1]) - 3;
      if (i === 2 && j === 1) {
        stadium(b, R, (x0 + x1) / 2, (z0 + z1) / 2, southGround);
        // Its forecourt to the west (the torch, a clock tower, a fountain), its car park to the east.
        plaza(b, R, { x0: x0 + 4, z0: z0 + 6, x1: (x0 + x1) / 2 - 104, z1: z1 - 6 }, southGround, { fountain: { r: 7, height: 9, jets: 12 }, art: ['torch', 'clock', 'beads'] });
        for (let zp = z0 + 14; zp < z1 - 20; zp += 16) parkingStrip(b, (x0 + x1) / 2 + 106, x1 - 6, zp, southGround);
        continue;
      }
      const res = SOUTH_RES[j][i];
      if (res === 'villa' || res === 'house') {
        const through = j === 3 && i === 1 ? [b.byId.get('s_hill1')!] : j === 3 && i === 3 ? [b.byId.get('s_hill2')!] : [];
        const keep: Array<[number, number, number]> = j === 3 && i === 1 ? [[HILL_PARK[0], HILL_PARK[1], 62]] : [];
        quarter(res, { x0, z0, x1, z1 }, sewId(SEW[j]), sewId(SEW[j + 1]), snsId(SNS[i]), snsId(SNS[i + 1]), SEW[j], SEW[j + 1], SNS[i], SNS[i + 1], southGround, sewName[SEW[j + 1]][0], through, keep);
      } else complex(x0, z0, x1, z1, SEW[j], SEW[j + 1], sewId(SEW[j]), sewId(SEW[j + 1]), southGround, res);
    }
  }
  // ---- traffic calming on the streets (§11.3): humps, raised crosswalks, cushions and rumble strips, every 120–220 m on
  // the city's and the south district's streets and lanes (not on the arterials); rumble strips on each approach to the
  // fountain circus; a school zone in the south district. ----
  {
    const RC = rng(4242);
    const pick = (): CalmKind => {
      const x = RC();
      return x < 0.42 ? 'hump' : x < 0.66 ? 'table' : x < 0.84 ? 'cushion' : x < 0.93 ? 'rumble' : 'big';
    };
    // The road's own unevenness (요철) between them: repair patches, manhole covers, heaved asphalt — the older the
    // street, the more (the hillside lanes most); the arterials get patches and covers only, no humps.
    const rough = (): CalmKind => {
      const x = RC();
      return x < 0.45 ? 'patch' : x < 0.75 ? 'manhole' : 'heave';
    };
    for (const r of b.roads) {
      const id = r.spec.id;
      const city = /^(c_ns|c_ew|s_ns|s_ew|c_gol_|c_alley|c_back_|lane_|s_hill)/.test(id);
      if (!city) continue;
      if (r.spec.style === 'arterial') {
        for (let s = 60 + RC() * 80; s < r.length - 40; s += 140 + RC() * 160) {
          const kind = RC() < 0.6 ? 'patch' : 'manhole';
          for (let t = 0; t < 30 && !b.addCalming(r, s + t, kind); t += 4);
        }
        continue;
      }
      // Narrow lanes (골목, back streets): a hump every 45–75 m, the odd raised crossing — slow the car to a walk.
      const narrow = r.spec.style === 'alley' && r.style.laneWidth <= 3.05 && r.style.lanes === 1;
      const hillside = /^(lane_|s_hill)/.test(id);
      for (let s = (narrow ? 25 : 50) + RC() * 30; s < r.length - (narrow ? 20 : 50); s += narrow ? 45 + RC() * 30 : 120 + RC() * 100) {
        const kind = narrow ? (RC() < (hillside ? 0.38 : 0.2) ? rough() : RC() < 0.78 ? 'hump' : 'table') : RC() < 0.3 ? rough() : pick();
        // Where one does not fit (a junction, a tight bend), the next metres are tried.
        for (let t = 0; t < 30 && !b.addCalming(r, s + t, kind); t += 4);
      }
    }
    const nsN = b.byId.get(nsId(RB.x))!, nsS = b.byId.get(`${nsId(RB.x)}s`)!, ewW = b.byId.get(`${ewId(RB.z)}w`)!, ewE = b.byId.get(ewId(RB.z))!;
    b.addCalming(nsN, nsN.length - 75, 'rumble');
    b.addCalming(nsS, 75, 'rumble');
    b.addCalming(ewW, ewW.length - 75, 'rumble');
    b.addCalming(ewE, 75, 'rumble');
    const school = b.byId.get(sewId(1300))!;
    // Near x −1480, wherever it fits between the estates' lanes and the cross streets.
    let sAt = NaN;
    for (let d = 0; d <= 200 && Number.isNaN(sAt); d += 10) {
      for (const sg of [1, -1]) {
        const s0 = school.nearest(-1480, 1300).s + sg * d;
        if (Number.isNaN(sAt) && b.addCalming(school, s0, 'school')) sAt = s0;
      }
    }
    if (!Number.isNaN(sAt)) {
      const p = school.at(sAt - 26);
      const u = -(school.w.pe + 1.2);
      b.addSign({ x: p.x + u * p.tz, y: southGround(p.x + u * p.tz, p.z - u * p.tx), z: p.z - u * p.tx, yaw: Math.atan2(-p.tx, -p.tz), text: { ko: '어린이보호구역', en: 'School zone' }, sub: { ko: '30 · 방지턱', en: '30 km/h · humps' }, kind: 'info' });
    }
  }
  // 남산 언덕공원: the top of the south hill — a lawn, a ring of trees, a pavilion (정자) with a tiled roof, benches,
  // and a sign; the hill lane passes below it.
  {
    const [px, pz] = HILL_PARK;
    const y = southGround(px, pz) + 0.15;
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      b.addTree(px + Math.cos(a) * 44, pz + Math.sin(a) * 44, 0.9 + (k % 3) * 0.15, k % 4 === 0 ? 1 : 0);
    }
    for (const [ox, oz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) b.addCylinder({ x: px + ox, z: pz + oz, y0: y, y1: y + 2.8, r0: 0.16, material: MAT.wood, look: 'white', color: 0x7a3b2a, sides: 6 });
    b.addCylinder({ x: px, z: pz, y0: y + 0.45, y1: y + 0.6, r0: 3.4, material: MAT.wood, look: 'white', color: 0x8a6a4a, sides: 8 });
    b.addCylinder({ x: px, z: pz, y0: y + 2.8, y1: y + 4.6, r0: 4.6, r1: 0.3, material: -1, look: 'white', color: 0x3f4448, sides: 8 });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      b.addBox({ cx: px + Math.cos(a) * 14, cy: y + 0.25, cz: pz + Math.sin(a) * 14, hx: 1.0, hy: 0.25, hz: 0.25, yaw: a, material: MAT.wood, look: 'wood' });
    }
    b.addSign({ x: px + 8, y, z: pz - 30, yaw: 0, text: { ko: '남산 언덕공원', en: 'Namsan Hill Park' }, kind: 'place' });
  }

  // Trees along the district's outer lawns (clear of the roads that cross them).
  for (const [x0, x1, z0, z1] of [[-2450, -2325, 1000, 2140], [-25, 130, 1000, 2140], [-2450, 130, 2085, 2140]] as const) {
    for (let k = 0; k < ((x1 - x0) * (z1 - z0)) / 900; k++) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
      if (!b.footprintOnRoad(x, z, 3, 3, 0, 2)) b.addTree(x, z, 0.8 + R() * 0.5, R() < 0.35 ? 1 : 0);
    }
  }

  // Landmark tower (한빛타워) in the CBD.
  b.addBuilding({ x: -800, z: -680, y: cityGround(-800, -680), w: 44, d: 44, h: 310, yaw: 0.2, type: 0, seed: 999 });
  {
    const y = cityGround(RT.x, RT.z) - 0.5;
    b.addCylinder({ x: RT.x, z: RT.z, y0: y, y1: y + 8, r0: RT.r + 3, material: MAT.concrete, look: 'stone', sides: 24 });
    b.addCylinder({ x: RT.x, z: RT.z, y0: y + 8, y1: y + 196, r0: RT.r, r1: RT.r - 3, material: MAT.concrete, look: 'tower', sides: 24 });
    b.addCylinder({ x: RT.x, z: RT.z, y0: y + 196, y1: y + 222, r0: RT.r - 3, r1: 4, material: -1, look: 'steel' });
    b.addCylinder({ x: RT.x, z: RT.z, y0: y + 222, y1: y + 250, r0: 1, r1: 0.2, material: -1, look: 'steel' });
  }

  // ---- town buildings along the approaches, a gas station and a car wash on R3 ----
  const townRoads = ['R2', 'R3', 'R4', 'R5'];
  for (const id of townRoads) {
    const r = b.byId.get(id)!;
    for (let s = 45; s < 330 && s < r.length - 20; s += 22 + R() * 10) {
      for (const side of [-1, 1]) {
        if (R() < 0.25) continue;
        const p = r.at(s);
        const u = side * (r.w.full + 9 + R() * 4);
        const x = p.x + u * p.tz, z = p.z - u * p.tx;
        const w = 9 + R() * 7, d = 8 + R() * 5;
        b.addBuilding({ x, z, y: b.terrain.heightAt(x, z), w, d, h: 4 + R() * 7, yaw: Math.atan2(p.tx, p.tz), type: R() < 0.5 ? 4 : 5, seed: Math.floor(R() * 1e6) });
      }
    }
  }
  gasStation(b, 'R3', 520, -1);
  // Quarry at R2's north end: rock faces and gravel pad.
  const q = b.byId.get('R2')!.at(b.byId.get('R2')!.length);
  b.addPad({ outline: [[q.x - 70, q.z - 110], [q.x + 70, q.z - 110], [q.x + 70, q.z + 10], [q.x - 70, q.z + 10]], y: (_x, z) => q.y + 0.02 * (z - q.z), material: MAT.gravel, look: 'terrain' });
  for (let k = 0; k < 14; k++) {
    b.addBox({ cx: q.x - 60 + R() * 120, cy: q.y + 1.5, cz: q.z - 100 + R() * 90, hx: 1 + R() * 2.5, hy: 1 + R() * 1.5, hz: 1 + R() * 2.5, yaw: R() * 3, material: MAT.concrete, look: 'rock' });
  }

  // ---- 한빛 오프로드 파크: a dirt track from 남산길 into the park; a rock garden; a washboard strip along its west edge ----
  add({ id: 'OP1', name: { ko: '오프로드 파크 진입로', en: 'Off-road park access' }, style: 'trail', points: [on('R5', 1570, 2505), [1500, 2470], [PARK.x + PARK.hx - 8, PARK.z + 10]], start: { join: 'R5' } });
  for (let k = 0; k < 22; k++) {
    const x = PARK.x + 95 + R() * 28, z = PARK.z - 75 + R() * 50;
    const s = 0.35 + R() * 0.5;
    b.addBox({ cx: x, cy: b.opts.natural(x, z) + s * 0.4, cz: z, hx: s * (1 + R()), hy: s, hz: s * (1 + R()), yaw: R() * 3, material: MAT.concrete, look: 'rock' });
  }
  {
    const x0 = PARK.x - PARK.hx + 2, x1 = x0 + 7, z0 = PARK.z - PARK.hz + 5, z1 = PARK.z + PARK.hz - 5;
    b.addPad({ outline: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y: (x, z) => b.opts.natural(x, z) + 0.05, material: MAT.washboard, look: 'terrain', grid: 3, fill: true });
    b.addSign({ x: PARK.x + PARK.hx - 4, y: b.opts.natural(PARK.x + PARK.hx - 4, PARK.z + 22), z: PARK.z + 22, yaw: -Math.PI / 2, text: { ko: '한빛 오프로드 파크', en: 'Hanbit Off-road Park' }, sub: { ko: '모글 · 우프스 · 진흙 · 언덕 · 바위', en: 'Moguls · whoops · mud · hill · rocks' }, kind: 'place' });
  }

  // ---- riverside park: parking lot, trees ----
  const lot = { x0: -1450, x1: -1250, z0: 70, z1: 150 };
  b.addPad({ outline: [[lot.x0, lot.z0], [lot.x1, lot.z0], [lot.x1, lot.z1], [lot.x0, lot.z1]], y: (x, z) => b.opts.natural(x, z) - 0.1, material: MAT.asphalt, look: 'asphalt', grid: 10 });
  // 강변 광장: a riverside square between the car park and 한빛대교 — the gateway arch, a wave of fins, a fountain.
  const RP = { x0: -1150, x1: -960, z0: 98, z1: 176 };
  plaza(b, R, RP, (x, z) => b.opts.natural(x, z), { fountain: { r: 8, height: 10, jets: 14 }, art: ['arch', 'wave', 'obelisk'] });
  for (let k = 0; k < 900; k++) {
    const x = -2700 + R() * 3400, z = 90 + R() * 200;
    if (x > RP.x0 - 6 && x < RP.x1 + 6 && z > RP.z0 - 6 && z < RP.z1 + 6) continue;
    const d = riverDist(x, z);
    if (d < RIVER_HALF + 70) continue;
    if (x > lot.x0 - 10 && x < lot.x1 + 10 && z > lot.z0 - 10 && z < lot.z1 + 10) continue;
    if (Math.abs(x + 1800) < 30 || Math.abs(x + 600) < 30) continue;
    b.addTree(x, z, 0.8 + R() * 0.5, R() < 0.3 ? 1 : 0);
  }

  // ---- signs and toll plaza ----
  tollPlaza(b, 'H1', H1.length - 380);
  directionSign(b, 'H1', sx - 700, -1, { ko: '한빛IC 1 km', en: 'Hanbit IC 1 km' }, { ko: '도심 · 한빛대교', en: 'City · Hanbit Bridge' });
  directionSign(b, 'H1', sx + 700, 1, { ko: '한빛IC 1 km', en: 'Hanbit IC 1 km' }, { ko: '도심 · 한빛대교', en: 'City · Hanbit Bridge' });
  directionSign(b, 'H1', H1.nearest(2560, -900).s - 300, -1, { ko: '한빛요금소 · 은빛호', en: 'Hanbit Toll · Eunbit Lake' }, { ko: '한빛산 터널 1.1 km', en: 'Hanbitsan Tunnel 1.1 km' });
  for (const [x, z, ko, en] of [[-420, -600, '한빛시청', 'City Hall'], [-2250, -1120, '구도심', 'Old Town'], [TOWN[0], TOWN[1] - 60, '솔내읍', 'Sollae'], [-600, 1100, '남한빛', 'South Hanbit']] as const) {
    b.addSign({ x: x + 22, y: b.terrain.heightAt(x + 22, z + 22), z: z + 22, yaw: 0, text: { ko, en }, kind: 'place' });
  }

  // ---- points of interest (spawn / teleport) and area labels ----
  const face = (id: string, s: number, dir = 1) => {
    const r = b.byId.get(id)!;
    const p = r.at(s);
    const u = r.style.oneWay ? 0 : -dir * ((r.style.median ?? 0) / 2 + r.style.laneWidth * (r.style.lanes - 0.5)); // outer right lane
    const x = p.x + u * p.tz, z = p.z - u * p.tx;
    // The road surface's own slope under the car (a draped lane follows the hillside, along and across).
    const fx = dir * p.tx, fz = dir * p.tz;
    const at = (a: number, l: number) => r.surfaceAt(x + a * fx + l * fz, z + a * fz - l * fx);
    return { x, z, yaw: Math.atan2(fx, fz), y: r.surfaceAt(x, z), pitch: Math.atan2(at(2, 0) - at(-2, 0), 4), roll: Math.atan2(at(0, 0.8) - at(0, -0.8), 1.6) };
  };
  const poi = (id: string, kind: MapData['pois'][number]['kind'], ko: string, en: string, at: { x: number; z: number; yaw: number; y?: number }) => b.pois.push({ id, kind, label: { ko, en }, ...at });
  poi('cityhall', 'spawn', '한빛시청 앞', 'City Hall', face(ewId(-550), 480));
  poi('fountain', 'landmark', '한빛 분수광장 로터리', 'Fountain Circus', face(`${ewId(-550)}w`, b.byId.get(`${ewId(-550)}w`)!.length - 160));
  poi('eunha', 'landmark', '은하대교 (현수교)', 'Eunha suspension bridge', face('C3', 330));
  poi('skyway', 'scenic', '북악스카이웨이', 'Bugak Skyway', face('S1', 140));
  poi('tvtower', 'scenic', '북악타워 전망대', 'Bugak Tower', face('S1', sky.length - 30));
  poi('stadium', 'city', '한빛 종합운동장', 'Hanbit Stadium', face(snsId(-600), 330));
  poi('alley', 'scenic', '구도심 골목길', 'Old-town lanes', face('c_alley3', 30));
  poi('cbd', 'city', '업무지구 (한빛타워)', 'CBD (Hanbit Tower)', face(nsId(-1000), 500, 1));
  poi('oldtown', 'scenic', '구도심 언덕길', 'Old-town hill', face('c_alley1', 20));
  poi('parking', 'service', '강변공원 주차장', 'Riverside parking', { x: -1350, z: 110, yaw: Math.PI / 2 });
  poi('bridge', 'landmark', '한빛대교', 'Hanbit Grand Bridge', face('C2', 200));
  poi('ic', 'service', '한빛IC', 'Hanbit IC', face('IC_wb_on', 10));
  poi('expressway', 'spawn', '한빛고속도로 (동쪽)', 'Expressway (east)', face('H1', H1.nearest(900, 290).s));
  poi('tunnel', 'landmark', '북악터널 입구', 'Bugak Tunnel', face('T1', 60));
  poi('pass', 'scenic', '한빛재 고갯길', 'Hanbit Pass', face('M1', 40));
  poi('summit', 'scenic', '한빛재 정상', 'Pass summit', face('M1', b.byId.get('M1')!.nearest(1740, -1450).s));
  poi('lake', 'scenic', '은빛호', 'Eunbit Lake', face('N1', 250));
  poi('toll', 'service', '한빛요금소', 'Hanbit Toll Plaza', face('H1', H1.length - 600));
  poi('town', 'city', '솔내읍 로터리', 'Sollae roundabout', face('R2', 40, 1));
  poi('farm', 'scenic', '들녘 농로', 'Farm roads', face('F2', 30));
  poi('quarry', 'service', '채석장', 'Quarry', face('R2', b.byId.get('R2')!.length - 40));
  poi('south', 'city', '남한빛 아파트단지', 'South Hanbit apartments', face(sewId(1300), 900));
  poi('underpass', 'landmark', '누리지하차도', 'Nuri Underpass', face('U1', 30));
  const apt = b.roads.find((r) => r.spec.id.startsWith('apt_') && r.spec.id.endsWith('_1050'))!;
  poi('estate', 'scenic', '아파트 단지 (방지턱)', 'Apartment estate (speed humps)', face(apt.spec.id, 8));
  poi('trail', 'scenic', '숲길 (비포장)', 'Forest trail (unpaved)', face('T2', 60));
  poi('elevated', 'landmark', '한빛고가로 (고가도로)', 'Hanbit Elevated Road', face('E1', 120));
  poi('offroad', 'scenic', '한빛 오프로드 파크', 'Hanbit Off-road Park', face('OP1', b.byId.get('OP1')!.length - 12));
  poi('village', 'scenic', '북녘 전원마을', 'Bungnyeok farming village', face('V1', 15));
  poi('plaza', 'landmark', '한빛광장 (분수·조형물)', 'Hanbit Plaza (fountain, sculptures)', { x: plazaAt.x, z: plazaAt.z, yaw: Math.PI });
  poi('riverplaza', 'scenic', '강변 광장', 'Riverside plaza', { x: (RP.x0 + RP.x1) / 2, z: RP.z1 - 22, yaw: Math.PI });
  if (garages.length) poi('garage', 'service', '아파트 지하주차장', 'Estate underground parking', garages[0]);
  poi('hillvillage', 'scenic', '남산 언덕마을 (오르막·내리막)', 'Namsan hill quarter (ups and downs)', face('s_hill1', 20));
  poi('villas', 'city', '빌라촌 골목 (요철·방지턱)', 'Villa lanes (bumps, humps)', face(b.roads.find((r) => r.spec.id.startsWith('lane_') && r.spec.id.endsWith('_1550'))!.spec.id, 20));
  poi('eastside', 'city', '동쪽 주택가 언덕', 'East side houses (hill)', face(nsId(250), 160, 1));
  poi('carpark', 'service', '시청 공영주차장 (지하·옥상)', 'City Hall car park', { x: carParkAt.x, z: carParkAt.z, yaw: -Math.PI / 2, y: carParkAt.y });
  b.areas.push(
    { label: { ko: '한빛시', en: 'Hanbit City' }, x: -1100, z: -700, size: 2 },
    { label: { ko: '구도심', en: 'Old Town' }, x: -2250, z: -1150, size: 1 },
    { label: { ko: '업무지구', en: 'CBD' }, x: -650, z: -700, size: 1 },
    { label: { ko: '남한빛', en: 'South Hanbit' }, x: -1150, z: 1300, size: 1 },
    { label: { ko: '한빛강', en: 'Hanbit River' }, x: 800, z: 680, size: 1 },
    { label: { ko: '솔내읍', en: 'Sollae' }, x: TOWN[0], z: TOWN[1] + 120, size: 1 },
    { label: { ko: '한빛산', en: 'Mt. Hanbit' }, x: 1750, z: -1250, size: 1 },
    { label: { ko: '은빛호', en: 'Eunbit Lake' }, x: LAKE_C[0], z: LAKE_C[1], size: 1 },
    { label: { ko: '북악산', en: 'Mt. Bugak' }, x: -600, z: -1850, size: 1 },
    { label: { ko: '분수광장', en: 'Fountain Circus' }, x: -1000, z: -500, size: 0 },
    { label: { ko: '종합운동장', en: 'Stadium' }, x: -900, z: 1425, size: 0 },
    { label: { ko: '남산 언덕마을', en: 'Namsan hill quarter' }, x: -1500, z: 1960, size: 1 },
    { label: { ko: '북녘 전원마을', en: 'Bungnyeok village' }, x: -1150, z: -2300, size: 1 },
    { label: { ko: '빌라촌', en: 'Villa quarter' }, x: -2050, z: 1680, size: 0 },
  );
  const data = b.build();
  data.parked = parkedCars(lot);
  timings.last = { coarse: tCoarse, ...b.timings, total: performance.now() - tStart };
  return data;
}

/** Parked cars in the riverside lot (spawned as simple lattice bodies by the free-roam mode). */
function parkedCars(lot: { x0: number; x1: number; z0: number; z1: number }): Array<{ x: number; z: number; yaw: number }> {
  const out: Array<{ x: number; z: number; yaw: number }> = [];
  for (let k = 0; k < 6; k++) out.push({ x: lot.x0 + 30 + k * 28, z: lot.z0 + 16, yaw: 0 });
  return out;
}

type BlockKind = 'cbd' | 'apart' | 'old' | 'mid' | 'park';

function fillBlock(b: MapBuilder, R: () => number, x0: number, z0: number, x1: number, z1: number, kind: BlockKind, ground: (x: number, z: number) => number, avoid: Road[] = [], keep: Array<[number, number, number]> = []): void {
  const w = x1 - x0, d = z1 - z0;
  if (w < 20 || d < 20) return;
  const base = (x: number, z: number) => ground(x, z) + 0.15;
  const put = (cx: number, cz: number, bw: number, bd: number, h: number, type: number, yaw = 0) => {
    // Clip to the block.
    bw = Math.min(bw, w - 4);
    bd = Math.min(bd, d - 4);
    b.addBuilding({ x: cx, z: cz, y: Math.min(base(cx - bw / 2, cz - bd / 2), base(cx + bw / 2, cz + bd / 2), base(cx - bw / 2, cz + bd / 2), base(cx + bw / 2, cz - bd / 2)), w: bw, d: bd, h, yaw, type, seed: Math.floor(R() * 1e9) });
  };
  if (kind === 'park') {
    for (let k = 0; k < 40; k++) b.addTree(x0 + 8 + R() * (w - 16), z0 + 8 + R() * (d - 16), 0.9 + R() * 0.4, R() < 0.5 ? 1 : 0);
    return;
  }
  if (kind === 'apart') {
    // Rows of slabs (대단지 아파트) with space between for parking and trees.
    const rows = Math.max(1, Math.floor((d - 20) / 46));
    for (let r = 0; r < rows; r++) {
      const cz = z0 + 18 + r * ((d - 36) / Math.max(rows - 1, 1));
      const n = Math.max(1, Math.floor((w - 20) / 72));
      for (let k = 0; k < n; k++) {
        const cx = x0 + 10 + (k + 0.5) * ((w - 20) / n);
        put(cx, rows === 1 ? (z0 + z1) / 2 : cz, 56, 14, 42 + Math.floor(R() * 12) * 3, 1);
      }
    }
    for (let k = 0; k < 10; k++) b.addTree(x0 + 5 + R() * (w - 10), z0 + 3 + R() * 4, 0.9, 0);
    return;
  }
  // Lots on a grid over the whole block: the street-facing ring is taller with shops, the inner lots lower, a few
  // left as courtyards with trees. Lots over a road through the block (old-town alleys) stay empty.
  const lotW = kind === 'cbd' ? 60 : kind === 'old' ? 15 : 30;
  const lotD = kind === 'cbd' ? 54 : kind === 'old' ? 14 : 27;
  const gap = kind === 'cbd' ? 14 : kind === 'old' ? 3 : 6;
  const nx = Math.max(1, Math.floor((w + gap) / (lotW + gap))), nz = Math.max(1, Math.floor((d + gap) / (lotD + gap)));
  const cw = (w - gap * (nx - 1)) / nx, cd = (d - gap * (nz - 1)) / nz;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const cx = x0 + i * (cw + gap) + cw / 2, cz = z0 + j * (cd + gap) + cd / 2;
      if (avoid.some((r) => r.nearest(cx, cz).d < r.w.outer + Math.max(cw, cd) / 2 + 2)) continue;
      if (keep.some(([kx, kz, kr]) => Math.hypot(cx - kx, cz - kz) < kr + Math.max(cw, cd) / 2)) continue;
      const edge = i === 0 || j === 0 || i === nx - 1 || j === nz - 1;
      if (!edge && R() < (kind === 'old' ? 0.12 : 0.22)) {
        for (let k = 0; k < 3; k++) b.addTree(cx + (R() - 0.5) * cw * 0.7, cz + (R() - 0.5) * cd * 0.7, 0.8 + R() * 0.4, 2);
        continue;
      }
      let h: number, type: number;
      if (kind === 'cbd') {
        h = edge ? 70 + R() * 160 : 28 + R() * 70;
        type = edge || R() < 0.5 ? 0 : 2;
      } else if (kind === 'old') {
        h = 6 + Math.floor(R() * 3) * 3;
        type = edge && R() < 0.45 ? 5 : 4;
      } else {
        h = edge ? 14 + Math.floor(R() * 8) * 3.5 : 10 + Math.floor(R() * 5) * 3.5;
        type = edge ? (R() < 0.4 ? 5 : 2) : R() < 0.12 ? 3 : 2;
      }
      put(cx, cz, cw - (kind === 'old' ? 1 : 2), cd - (kind === 'old' ? 1 : 2), h, type);
    }
  }
}

/**
 * Stadium (종합운동장): a grass pitch inside a red running track, tiered stands in an oval (blue and white seat
 * blocks, open at both ends so a car can drive in onto the pitch), a roof ring on columns, four floodlight masts.
 */
function stadium(b: MapBuilder, R: () => number, cx: number, cz: number, ground: (x: number, z: number) => number): void {
  const y = ground(cx, cz) + 0.05;
  const ellipse = (a: number, c: number, n = 40): Array<[number, number]> => Array.from({ length: n }, (_, k) => [cx + Math.cos((k / n) * Math.PI * 2) * a, cz + Math.sin((k / n) * Math.PI * 2) * c]);
  b.addPad({ outline: ellipse(72, 50), y: () => y, material: MAT.asphalt, look: 'paint', color: 0xb4513d, grid: 6, fill: true });
  b.addPad({ outline: [[cx - 53, cz - 34], [cx + 53, cz - 34], [cx + 53, cz + 34], [cx - 53, cz + 34]], y: () => y + 0.03, material: MAT.grass, look: 'paint', grid: 4, gridU: 7.57, colorAt: (px) => (Math.floor((px - cx + 53) / 7.57) & 1 ? 0x4f8a3a : 0x5c9a44) });
  const n = 44;
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.5) / n) * Math.PI * 2;
    if (Math.abs(Math.cos(a)) > 0.985) continue; // gates at both ends
    const seat = k % 4 < 2 ? 0x2f5fa8 : 0xe9edf2;
    for (let t = 0; t < 5; t++) {
      const ra = 76 + t * 4.2, rc = 54 + t * 4.2;
      const x = cx + Math.cos(a) * ra, z = cz + Math.sin(a) * rc;
      // Tangent of the ellipse at a: (−ra sin a, rc cos a).
      const yaw = Math.atan2(-ra * Math.sin(a), rc * Math.cos(a)); // box z along the tangent
      const len = (Math.PI * 2 * Math.sqrt((ra * ra + rc * rc) / 2)) / n / 2 + 0.6;
      const h = 1.6 + t * 2.4;
      b.addBox({ cx: x, cy: y + h / 2, cz: z, hx: 2.3, hy: h / 2, hz: len, yaw, material: MAT.concrete, look: 'none', color: t === 4 ? 0xbfc3c8 : seat });
    }
    if (k % 2 === 0) {
      const ra = 96, rc = 74;
      const x = cx + Math.cos(a) * ra, z = cz + Math.sin(a) * rc;
      const yaw = Math.atan2(-ra * Math.sin(a), rc * Math.cos(a)); // box z along the tangent
      b.addCylinder({ x, z, y0: y, y1: y + 20, r0: 0.6, material: MAT.steel, look: 'steel', sides: 6 });
      b.addBox({ cx: cx + Math.cos(a) * (ra - 9), cy: y + 20.5, cz: cz + Math.sin(a) * (rc - 9), hx: 11, hy: 0.35, hz: (Math.PI * 2 * Math.sqrt((ra * ra + rc * rc) / 2)) / n + 0.8, yaw, material: -1, look: 'stripe', color: 0xf4f5f6 });
    }
  }
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = cx + sx * 88, z = cz + sz * 66;
    b.addCylinder({ x, z, y0: y, y1: y + 42, r0: 1.1, r1: 0.7, material: MAT.steel, look: 'steel', sides: 8 });
    b.addBox({ cx: x, cy: y + 43, cz: z, hx: 4, hy: 1.6, hz: 0.5, yaw: Math.atan2(-sx, -sz) + Math.PI / 2, material: -1, look: 'stripe', color: 0xfff6d8 });
  }
  for (let k = 0; k < 60; k++) {
    const a = R() * Math.PI * 2, rr = 1 + R() * 0.25;
    b.addTree(cx + Math.cos(a) * 125 * rr, cz + Math.sin(a) * 92 * rr, 0.85 + R() * 0.3, 0);
  }
  b.addSign({ x: cx + 110, y, z: cz - 90, yaw: 0, text: { ko: '한빛 종합운동장', en: 'Hanbit Stadium' }, kind: 'place' });
}

function gasStation(b: MapBuilder, roadId: string, s: number, side: -1 | 1): void {
  const r = b.byId.get(roadId)!;
  const p = r.at(s);
  const u = side * (r.w.full + 22);
  const cx = p.x + u * p.tz, cz = p.z - u * p.tx;
  const yaw = Math.atan2(p.tx, p.tz);
  const y = p.y + 0.05;
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const local = (lx: number, lz: number): [number, number] => [cx + c * lx + sn * lz, cz - sn * lx + c * lz];
  // Forecourt pad (flat, connected to the road edge).
  const hw = 38, hd = 22;
  const pad: Array<[number, number]> = [local(-hw, -hd - 2), local(hw, -hd - 2), local(hw, hd), local(-hw, hd)];
  const inner = side * (r.w.full + 22 - hd - 4);
  void inner;
  b.addPad({ outline: pad, y: () => y, material: MAT.concrete, look: 'concrete', grid: 8 });
  // Canopy on four columns, pumps, the shop and a car wash.
  for (const [lx, lz] of [[-14, -6], [14, -6], [-14, 6], [14, 6]]) {
    const [x, z] = local(lx, lz);
    b.addBox({ cx: x, cy: y + 2.6, cz: z, hx: 0.25, hy: 2.6, hz: 0.25, yaw, material: MAT.steel, look: 'steel' });
  }
  const [kx, kz] = local(0, 0);
  b.addBox({ cx: kx, cy: y + 5.6, cz: kz, hx: 18, hy: 0.4, hz: 9, yaw, material: -1, look: 'stripe', color: 0xf2f2f2 });
  for (const lx of [-8, 8]) {
    const [x, z] = local(lx, 0);
    b.addBox({ cx: x, cy: y + 0.75, cz: z, hx: 0.5, hy: 0.75, hz: 1.2, yaw, material: MAT.steel, look: 'steel', color: 0xd24a2a });
  }
  const [sx, sz] = local(0, hd - 8);
  b.addBuilding({ x: sx, z: sz, y, w: 22, d: 10, h: 4.2, yaw, type: 5, seed: 4242 });
  const [wx, wz] = local(30, hd - 10);
  b.addBuilding({ x: wx, z: wz, y, w: 7, d: 14, h: 4.5, yaw, type: 3, seed: 4343 });
  const [gx, gz] = local(-32, -hd + 2);
  b.addSign({ x: gx, y: y, z: gz, yaw: yaw + Math.PI, text: { ko: '한빛주유소', en: 'Hanbit Fuel' }, sub: { ko: '세차 · 정비', en: 'Wash · Service' }, kind: 'info' });
}

function tollPlaza(b: MapBuilder, roadId: string, s: number): void {
  const r = b.byId.get(roadId)!;
  const p = r.at(s);
  const yaw = Math.atan2(p.tx, p.tz);
  const half = r.w.pe + 1;
  // Canopy over the carriageway, columns beyond the barriers.
  b.addBox({ cx: p.x, cy: p.y + 7.2, cz: p.z, hx: half + 2, hy: 0.5, hz: 7, yaw, material: -1, look: 'stripe', color: 0x2f6fd0 });
  for (const side of [-1, 1]) {
    const u = side * (half + 1.6);
    b.addBox({ cx: p.x + u * p.tz, cy: p.y + 3.6, cz: p.z - u * p.tx, hx: 0.5, hy: 3.6, hz: 0.5, yaw, material: MAT.concrete, look: 'concrete' });
  }
  b.addSign({ x: p.x, y: p.y + 7.9, z: p.z, yaw: yaw + Math.PI, text: { ko: '한빛요금소', en: 'Hanbit Toll Plaza' }, kind: 'highway' });
}

function directionSign(b: MapBuilder, roadId: string, s: number, dir: 1 | -1, text: { ko: string; en: string }, sub: { ko: string; en: string }): void {
  const r = b.byId.get(roadId)!;
  const p = r.at(s);
  // Overhead sign above the carriageway of that direction, facing the traffic.
  const u = -dir * (r.w.cw / 2 + (r.style.median ?? 0) / 4);
  const yaw = Math.atan2(-dir * p.tx, -dir * p.tz);
  b.addSign({ x: p.x + u * p.tz, y: p.y + 6.2, z: p.z - u * p.tx, yaw, text, sub, kind: 'highway' });
  const post = -dir * (r.w.pe + 1.2);
  b.addBox({ cx: p.x + post * p.tz, cy: p.y + 3.4, cz: p.z - post * p.tx, hx: 0.3, hy: 3.4, hz: 0.3, yaw, material: MAT.steel, look: 'steel' });
}

function forests(b: MapBuilder, R: () => number): void {
  const step = 24;
  for (let z = -2900; z < 2900; z += step) {
    for (let x = -2900; x < 2900; x += step) {
      const px = x + (R() - 0.5) * step, pz = z + (R() - 0.5) * step;
      const density = fbm(px / 500, pz / 500, 2);
      if (density < 0.02) continue;
      if (rectMask(CITY, px, pz, 150) > 0.01 || rectMask(SOUTH, px, pz, 150) > 0.01) continue;
      if (riverDist(px, pz) < RIVER_HALF + 80) continue;
      if (Math.hypot(px - 1500, pz - 1850) < 1100) continue; // fields
      const y = b.terrain.heightAt(px, pz);
      if (y < LAKE + 3 && Math.hypot(px - LAKE_C[0], (pz - LAKE_C[1]) * 1.35) < 560) continue;
      if (y > 300) continue;
      if (b.nearPaved(px, pz, 7)) continue;
      b.addTree(px, pz, 0.8 + R() * 0.7, y > 180 || R() < 0.45 ? 1 : 0);
    }
  }
}

export { pointInPolygon };

/**
 * 한빛시청 주차빌딩: a split-level car park, ground floor + two decks + the roof, and a basement (B1), 72 × 36 m (the
 * ground slab and the basement 78 × 42). Ramps run in the side strips (7 m wide): up 0→1 and 2→3 along the north strip
 * heading east, 1→2 along the south strip heading west, and down to B1 along the south strip under it. Every edge a
 * car could drop from has a wall; the decks are concrete slabs on columns, all of it physical.
 */
function carPark(b: MapBuilder, cx: number, cz: number, ground: (x: number, z: number) => number): number {
  const H = 3.2;
  let gy = -Infinity;
  for (const [u, v] of [[-39, -21], [39, -21], [-39, 21], [39, 21], [0, 0]]) gy = Math.max(gy, ground(cx + u, cz + v) + 0.15);
  gy += 0.05;
  const L = (k: number) => gy + k * H; // deck tops; L(−1): the basement floor
  const box = (u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, look: 'concrete' | 'stripe' | 'dark' = 'concrete', color?: number) =>
    b.addBox({ cx: cx + (u0 + u1) / 2, cy: (y0 + y1) / 2, cz: cz + (v0 + v1) / 2, hx: (u1 - u0) / 2, hy: (y1 - y0) / 2, hz: (v1 - v0) / 2, yaw: 0, material: MAT.concrete, look, color });
  const slab = (k: number, u0: number, u1: number, v0: number, v1: number) => box(u0, u1, v0, v1, L(k) - 0.3, L(k), 'concrete', 0xb9b6ae);
  const ramp = (u0: number, u1: number, v0: number, v1: number, y0: number, y1: number) => {
    const a = Math.min(u0, u1), c = Math.max(u0, u1);
    b.addPad({ outline: [[cx + a, cz + v0], [cx + c, cz + v0], [cx + c, cz + v1], [cx + a, cz + v1]], y: (x) => y0 + ((x - cx - u0) / (u1 - u0)) * (y1 - y0), material: MAT.concrete, look: 'concrete', grid: 2, carve: false });
  };
  // Basement: its floor (the terrain is dug out under it), retaining walls under the ground slab's edge.
  b.addPad({ outline: [[cx - 39, cz - 21], [cx + 39, cz - 21], [cx + 39, cz + 21], [cx - 39, cz + 21]], y: () => L(-1), material: MAT.concrete, look: 'concrete', grid: 6, fill: true });
  box(-39.6, -39, -21.6, 21.6, L(-1) - 0.3, gy - 0.3);
  box(39, 39.6, -21.6, 21.6, L(-1) - 0.3, gy - 0.3);
  box(-39, 39, -21.6, -21, L(-1) - 0.3, gy - 0.3);
  box(-39, 39, 21, 21.6, L(-1) - 0.3, gy - 0.3);
  // An apron over the dug-out edge outside the walls.
  for (const [u0, u1, v0, v1] of [[-43, 43, -25, -21.6], [-43, 43, 21.6, 25], [-43, -39.6, -21.6, 21.6], [39.6, 43, -21.6, 21.6]]) {
    b.addPad({ outline: [[cx + u0, cz + v0], [cx + u1, cz + v0], [cx + u1, cz + v1], [cx + u0, cz + v1]], y: () => gy - 0.03, material: MAT.concrete, look: 'concrete', grid: 6, carve: false });
  }
  // Ground slab with the opening of the ramp down (south strip, u −28 … 0).
  slab(0, -39, 39, -21, 11);
  slab(0, -39, -28, 11, 21);
  slab(0, 0, 39, 11, 21);
  // Decks 1, 2 and the roof: the middle bay, and the strips where no ramp passes.
  for (const k of [1, 2, 3]) {
    slab(k, -36, 36, -11, 11);
    slab(k, -36, -28, -18, -11);
    slab(k, 0, 36, -18, -11);
    if (k === 3) slab(k, -36, 36, 11, 18);
    else {
      slab(k, -36, -28, 11, 18);
      slab(k, 0, 36, 11, 18);
    }
  }
  ramp(-28, 0, -18, -11, L(0), L(1)); // 0 → 1, north strip, eastward
  ramp(-28, 0, -18, -11, L(2), L(3)); // 2 → 3
  ramp(0, -28, 11, 18, L(1), L(2)); // 1 → 2, south strip, westward
  ramp(0, -28, 11, 18, L(0), L(-1)); // 0 → B1
  // Walls along the ramps (inner and outer), and across the strips where a deck ends over a drop.
  const wall = 0.3;
  box(-28, 0, -11 - wall / 2, -11 + wall / 2, L(0), L(1) + 0.9);
  box(-28, 0, -11 - wall / 2, -11 + wall / 2, L(2) - 0.3, L(3) + 0.9);
  box(-28, 0, -18 - wall, -18, L(0), L(1) + 0.9);
  box(-28, 0, -18 - wall, -18, L(2) - 0.3, L(3) + 0.9);
  box(-28, 0, 11 - wall / 2, 11 + wall / 2, L(-1), L(0) + 0.9);
  box(-28, 0, 11 - wall / 2, 11 + wall / 2, L(1) - 0.3, L(2) + 0.9);
  box(-28, 0, 18, 18 + wall, L(1) - 0.3, L(2) + 0.9);
  box(-28, 0, 18, 18 + wall, gy - 0.3, L(0) + 0.9);
  box(-1.3, -1, -18, -11, L(0), L(0) + 1.0); // under the first ramp's high end
  box(-28, -27.7, -18, -11, L(1), L(1) + 1.0);
  box(0, 0.3, -18, -11, L(2), L(2) + 1.0);
  box(-28, -27.7, -18, -11, L(3), L(3) + 1.0);
  box(-28.3, -28, 11, 18, L(0), L(0) + 0.9);
  box(-28.3, -28, 11, 18, L(1), L(1) + 1.0);
  box(0, 0.3, 11, 18, L(2), L(2) + 1.0);
  // Parapets around decks 1–3 (yellow-striped at the corners of the ramps), columns down to the ground.
  for (const k of [1, 2, 3]) {
    box(-36, 36, -18.3, -18, L(k), L(k) + 1.0);
    box(-36, 36, 18, 18.3, L(k), L(k) + 1.0);
    box(-36.3, -36, -18.3, 18.3, L(k), L(k) + 1.0);
    box(36, 36.3, -18.3, 18.3, L(k), L(k) + 1.0);
  }
  for (const u of [-36, 12, 24, 36]) {
    for (const v of [-18, -11, 11, 18]) {
      const uc = Math.max(-35.7, Math.min(35.7, u)), vc = Math.sign(v) * (Math.abs(v) === 18 ? 17.7 : 11);
      box(uc - 0.3, uc + 0.3, vc - 0.3, vc + 0.3, L(-1), L(3) - 0.3, 'concrete', 0xc9c5bd);
    }
  }
  for (const u of [-24, 0, 24]) box(u - 0.3, u + 0.3, -0.3, 0.3, L(-1), L(0) - 0.3, 'concrete', 0xc9c5bd); // basement only
  // Lift and stair core at the west end, the name on top.
  box(-39, -36.3, -6, 6, L(0), L(3) + 3.2, 'dark');
  b.addSign({ x: cx + 41, y: gy, z: cz - 14, yaw: Math.PI / 2, text: { ko: '시청 공영주차장', en: 'City Hall car park' }, sub: { ko: '지상 3층 · 지하 1층', en: '3 decks · 1 basement' }, kind: 'info' });
  return gy;
}

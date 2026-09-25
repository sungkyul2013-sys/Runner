// 한빛 (Hanbit) — the open-world map (§13.2-1 메트로폴리스 + §13.2-2 지방 & 산악 motifs, all place names fictional).
// 6 × 6 km = 36 km² (§13.1: ≥ 25 km²): a Korean-style city on the north bank of a wide river (grid of arterials and
// streets, CBD towers, apartment complexes, a steep old-town hill), a riverside expressway passing over the bridge
// roads with a diamond interchange, two river bridges (one cable-stayed), a road tunnel through the hill north of the
// city, a valley road, a mountain pass with hairpins over the eastern massif, a lake among the mountains, the
// expressway boring through the massif to a toll plaza, and a farming town with a roundabout south of the river.
import { MapBuilder, offsetPoints, onRoad, pointInPolygon, type MapData, type Road, type RoadSpec } from '../builder';
import { CoarseField, fbm, hash2, lerp, noise2, ridged, rng, smoothstep } from '../noise';
import { widths, STYLES } from '../road';
import { MAT } from '../types';

const SIZE = 6000;
const WATER = 3.0; // river level [m]
const LAKE = 62; // lake level [m]

// River centre line (west → east) and half width.
const RIVER: Array<[number, number]> = [[-3300, 820], [-2400, 660], [-1500, 760], [-600, 690], [300, 700], [1200, 600], [2100, 690], [3300, 620]];
const RIVER_HALF = 190;
const LAKE_C: [number, number] = [2250, -2560];

// Districts.
const CITY = { x0: -2720, x1: 720, z0: -1420, z1: 60 }; // north bank city
const SOUTH = { x0: -2460, x1: 140, z0: 960, z1: 1640 }; // south bank district
const TOWN: [number, number] = [1650, 2150]; // farming town (roundabout)

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

/** City ground (the draped streets): gently rising to the north, the old-town hill in the north-west. */
function cityGround(x: number, z: number): number {
  const hill = 42 * Math.exp(-((x + 2250) ** 2 + (z + 1120) ** 2) / (2 * 190 * 190));
  return 11 + 0.0035 * (-z) + 2.5 * fbm(x / 1400, z / 1400, 2) + hill;
}

function southGround(x: number, z: number): number {
  return 10 + 0.002 * (z - 960) + 1.5 * fbm(x / 1100 + 7, z / 1100, 2);
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

export const timings: { last: Record<string, number> } = { last: {} };

export function buildHanbit(onStage?: (stage: string) => void): MapData {
  const tStart = performance.now();
  const coarse = new CoarseField(-SIZE / 2 - 60, -SIZE / 2 - 60, SIZE + 120, 20, shape);
  const tCoarse = performance.now() - tStart;
  // Fine detail (not in the districts or on the river bed): its mask is smooth, so it is sampled coarsely too.
  const roughness = new CoarseField(-SIZE / 2 - 60, -SIZE / 2 - 60, SIZE + 120, 20, (x, z) => (1 - rectMask(CITY, x, z, 90)) * (1 - rectMask(SOUTH, x, z, 90)) * smoothstep(RIVER_HALF - 20, RIVER_HALF + 80, riverDist(x, z)));
  const natural = (x: number, z: number) => {
    const base = coarse.at(x, z);
    const rough = roughness.at(x, z);
    return rough > 0.01 ? base + rough * (0.9 * fbm(x / 70, z / 70, 2) + 0.25 * noise2(x / 17, z / 17)) : base;
  };
  const drape = (x: number, z: number) => (z > 600 ? southGround(x, z) : cityGround(x, z));
  const inRect = (r: typeof CITY, x: number, z: number, m: number) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
  const material = (x: number, z: number, y: number, slope: number): number => {
    if (inRect(CITY, x, z, 10) || inRect(SOUTH, x, z, 10)) return MAT.concrete; // paved plazas and lots
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
  for (const z of [EW[0], EW[EW.length - 1]]) {
    add({ id: ewId(z), name: { ko: ewName[EW.indexOf(z)], en: `${ewName[EW.indexOf(z)]}` }, style: arterialEW.has(z) ? 'arterial' : 'street', points: [[NS[0] - 16, z], [NS[NS.length - 1] + 16, z]] });
  }
  for (const x of NS) {
    add({ id: nsId(x), name: { ko: nsName[NS.indexOf(x)], en: nsName[NS.indexOf(x)] }, style: arterialNS.has(x) ? 'arterial' : 'street', points: [[x, EW[0] - 30], [x, EW[EW.length - 1] + 30]], start: { join: ewId(EW[0]) }, end: { join: ewId(EW[EW.length - 1]) } });
  }
  for (const z of EW.slice(1, -1)) {
    add({ id: ewId(z), name: { ko: ewName[EW.indexOf(z)], en: ewName[EW.indexOf(z)] }, style: arterialEW.has(z) ? 'arterial' : 'street', points: [[NS[0] - 30, z], [NS[NS.length - 1] + 30, z]], start: { join: nsId(NS[0]) }, end: { join: nsId(NS[NS.length - 1]) } });
  }
  // Old-town alleys climbing the hill (steep, narrow).
  add({ id: 'c_alley1', name: { ko: '달동네길', en: 'Daldongne-gil' }, style: 'alley', points: [[-2400, -1300], [-2400, -1050]], start: { join: ewId(-1300) }, end: { join: ewId(-1050) } });
  add({ id: 'c_alley2', name: { ko: '언덕길', en: 'Eondeok-gil' }, style: 'alley', points: [[-2600, -1180], [-2200, -1180]], start: { join: nsId(-2600) }, end: { join: nsId(-2200) } });

  // ---- south district ----
  const SEW = [1050, 1300, 1550];
  const SNS = [-2300, -1800, -1200, -600, -50];
  const sewId = (z: number) => `s_ew${z}`;
  const snsId = (x: number) => `s_ns${x}`;
  for (const z of [SEW[0], SEW[2]]) add({ id: sewId(z), name: { ko: z === 1050 ? '남강변로' : '남한빛로', en: z === 1050 ? 'Namgangbyeon-ro' : 'Namhanbit-ro' }, style: z === 1050 ? 'arterial' : 'street', points: [[SNS[0] - 16, z], [SNS[SNS.length - 1] + 16, z]] });
  for (const x of SNS) add({ id: snsId(x), style: x === -1800 || x === -600 ? 'arterial' : 'street', points: [[x, SEW[0] - 30], [x, SEW[2] + 30]], start: { join: sewId(SEW[0]) }, end: { join: sewId(SEW[2]) } });
  add({ id: sewId(1300), name: { ko: '아람로', en: 'Aram-ro' }, style: 'street', points: [[SNS[0] - 30, 1300], [SNS[SNS.length - 1] + 30, 1300]], start: { join: snsId(SNS[0]) }, end: { join: snsId(SNS[SNS.length - 1]) } });

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

  // ---- expressway: along the north bank, over the bridge roads and R2, through the massif, to the toll plaza ----
  add({
    id: 'H1', name: { ko: '한빛고속도로', en: 'Hanbit Expressway' }, style: 'highway',
    points: [[-2640, 272], [-2300, 240], [-1500, 300], [-600, 260], [300, 250], [1100, 290], [1600, 190], [2050, -40], [2380, -420], [2560, -900], [2620, -1300], [2600, -1750], [2520, -2050], [2480, -2190], on('N1', 2470, -2280)],
    over: [{ road: 'C1' }, { road: 'C2' }, { road: 'R2' }], end: { join: 'N1' }, tunnels: [[8, 12]], fixed: [{ at: 8, y: 40, radius: 500 }, { at: 12, y: 95, radius: 300 }],
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

  // ---- apartment complexes (대단지 아파트): an access lane through each, with humps (단지 내 방지턱) ----
  const hump = (roadId: string, x: number, z: number, halfW: number) => {
    // Round hump, 3.6 m long, 8 cm high, painted in yellow and black stripes; it follows the lane's crossfall, so it
    // starts flush with the surface everywhere across the road.
    const road = b.byId.get(roadId)!;
    const z0 = z - 1.8, z1 = z + 1.8;
    b.addPad({
      outline: [[x - halfW, z0], [x - halfW, z1], [x + halfW, z1], [x + halfW, z0]],
      y: (px, pz) => road.surfaceAt(px, pz) + 0.006 + 0.08 * Math.sin((Math.PI * Math.min(Math.max(pz - z0, 0), 3.6)) / 3.6),
      material: MAT.paint, look: 'paint', grid: 0.5, gridU: 0.3,
      // Bands across the lane, two grid cells each (clean edges on the triangle colours).
      colorAt: (px) => (Math.floor((px - x + halfW) / 1.0) & 1 ? 0xf0bf2a : 0x1f2022),
    });
  };
  const complex = (x0: number, z0: number, x1: number, z1: number, zTop: number, zBot: number, top: string, bottom: string, ground: (x: number, z: number) => number) => {
    const cx = Math.round((x0 + x1) / 2);
    const id = `apt_${cx}_${zTop}`;
    add({ id, style: 'alley', points: [[cx, zTop], [cx, zBot]], start: { join: top }, end: { join: bottom } });
    const half = Math.max(W('alley').pe, W('alley').peLeft);
    for (let d = 42; d < zBot - zTop - 36; d += 58) hump(id, cx, zTop + d, half);
    b.addSign({ x: cx + half + 1.5, y: ground(cx + half + 1.5, zTop + 26), z: zTop + 26, yaw: 0, text: { ko: '과속방지턱', en: 'Speed humps' }, sub: { ko: '단지 내 서행 20', en: 'Estate 20 km/h' }, kind: 'info' });
    fillBlock(b, R, x0, z0, cx - 9, z1, 'apart', ground);
    fillBlock(b, R, cx + 9, z0, x1, z1, 'apart', ground);
  };

  // ---- buildings: city blocks ----
  const oldAlleys = ['c_alley1', 'c_alley2'].map((id) => b.byId.get(id)!);
  const ewW = (z: number) => (arterialEW.has(z) ? W('arterial') : W('street')).outer;
  const nsW = (x: number) => (arterialNS.has(x) ? W('arterial') : W('street')).outer;
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
      if (NS[i] < UX && NS[i + 1] > UX && j < 2) {
        // The underpass runs through these blocks: buildings keep clear of its cuts.
        fillBlock(b, R, x0, z0, UX - 26, z1, kind, cityGround);
        fillBlock(b, R, UX + 26, z0, x1, z1, kind, cityGround);
      } else if (kind === 'apart') complex(x0, z0, x1, z1, EW[j], EW[j + 1], ewId(EW[j]), ewId(EW[j + 1]), cityGround);
      else fillBlock(b, R, x0, z0, x1, z1, kind, cityGround, kind === 'old' ? oldAlleys : []);
    }
  }
  for (let i = 0; i + 1 < SNS.length; i++) {
    for (let j = 0; j + 1 < SEW.length; j++) {
      const sw = (x: number) => (x === -1800 || x === -600 ? W('arterial') : W('street')).outer;
      const ew = (z: number) => (z === 1050 ? W('arterial') : W('street')).outer;
      const x0 = SNS[i] + sw(SNS[i]) + 3, x1 = SNS[i + 1] - sw(SNS[i + 1]) - 3;
      const z0 = SEW[j] + ew(SEW[j]) + 3, z1 = SEW[j + 1] - ew(SEW[j + 1]) - 3;
      complex(x0, z0, x1, z1, SEW[j], SEW[j + 1], sewId(SEW[j]), sewId(SEW[j + 1]), southGround);
    }
  }
  // Landmark tower (한빛타워) in the CBD.
  b.addBuilding({ x: -800, z: -680, y: cityGround(-800, -680), w: 44, d: 44, h: 310, yaw: 0.2, type: 0, seed: 999 });

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

  // ---- riverside park: parking lot, trees ----
  const lot = { x0: -1450, x1: -1250, z0: 70, z1: 150 };
  b.addPad({ outline: [[lot.x0, lot.z0], [lot.x1, lot.z0], [lot.x1, lot.z1], [lot.x0, lot.z1]], y: (x, z) => b.opts.natural(x, z) - 0.1, material: MAT.asphalt, look: 'asphalt', grid: 10 });
  for (let k = 0; k < 900; k++) {
    const x = -2700 + R() * 3400, z = 90 + R() * 200;
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
  for (const [x, z, ko, en] of [[-1000, -560, '한빛시청', 'City Hall'], [-2250, -1120, '구도심', 'Old Town'], [TOWN[0], TOWN[1] - 60, '솔내읍', 'Sollae'], [-600, 1100, '남한빛', 'South Hanbit']] as const) {
    b.addSign({ x: x + 22, y: b.terrain.heightAt(x + 22, z + 22), z: z + 22, yaw: 0, text: { ko, en }, kind: 'place' });
  }

  // ---- points of interest (spawn / teleport) and area labels ----
  const face = (id: string, s: number, dir = 1) => {
    const r = b.byId.get(id)!;
    const p = r.at(s);
    const u = r.style.oneWay ? 0 : -dir * ((r.style.median ?? 0) / 2 + r.style.laneWidth * (r.style.lanes - 0.5)); // outer right lane
    const x = p.x + u * p.tz, z = p.z - u * p.tx;
    return { x, z, yaw: Math.atan2(dir * p.tx, dir * p.tz), y: r.surfaceAt(x, z) };
  };
  const poi = (id: string, kind: MapData['pois'][number]['kind'], ko: string, en: string, at: { x: number; z: number; yaw: number; y?: number }) => b.pois.push({ id, kind, label: { ko, en }, ...at });
  poi('cityhall', 'spawn', '한빛시청 앞', 'City Hall', face(ewId(-550), 1700));
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

function fillBlock(b: MapBuilder, R: () => number, x0: number, z0: number, x1: number, z1: number, kind: BlockKind, ground: (x: number, z: number) => number, avoid: Road[] = []): void {
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

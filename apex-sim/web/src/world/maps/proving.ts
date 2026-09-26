// 종합 주행시험장 (proving ground, §13.3-1; fictional): 5 × 5 km = 25 km².
//  • high-speed oval, 10.0 km round, banked turns (3 lanes of 4.5 m, 300 km/h+ on the straights)
//  • dynamic pad ⌀ 320 m with a skid-pad circle
//  • parallel braking lanes: dry, wet, low-µ tiles, µ-split, gravel, snow and ice
//  • handling circuit (≈ 3.4 km, elevation changes)
//  • grades 5 / 10 / 20 / 30 / 40 / 60 %, a 20 % side slope
//  • bump and ride street (humps, cushion, rumble strips, washboard, cobbles, potholes, joints, rail crossing)
//  • off-road area: moguls, rock garden, mud, a steep hill, gravel loop
//  • service roads, control tower, workshops, wind tunnel and K&C buildings
import { MapBuilder, onRoad, type MapData, type PadSpec } from '../builder';
import { CoarseField, fbm, hash2, rng, smoothstep } from '../noise';
import { MAT } from '../types';

const SIZE = 5000;
const BASE = 10;
const OVAL_C: [number, number] = [0, -1100];
const OVAL_HALF = 1500; // half straight length
const OVAL_R = 640;

function ovalPoints(): Array<[number, number]> {
  // Counter-clockwise seen from above (left turns): south straight heading +x, then north.
  const pts: Array<[number, number]> = [];
  const [cx, cz] = OVAL_C;
  const zs = cz + OVAL_R, zn = cz - OVAL_R;
  for (let x = -OVAL_HALF; x < OVAL_HALF; x += 150) pts.push([cx + x, zs]);
  for (let k = 0; k < 18; k++) {
    const a = Math.PI / 2 - (k / 18) * Math.PI; // from south (+z) around the east end to north
    pts.push([cx + OVAL_HALF + Math.cos(a) * OVAL_R, cz + Math.sin(a) * OVAL_R]);
  }
  for (let x = OVAL_HALF; x > -OVAL_HALF; x -= 150) pts.push([cx + x, zn]);
  for (let k = 0; k < 18; k++) {
    const a = -Math.PI / 2 - (k / 18) * Math.PI;
    pts.push([cx - OVAL_HALF + Math.cos(a) * OVAL_R, cz + Math.sin(a) * OVAL_R]);
  }
  return pts;
}

function circle(cx: number, cz: number, r: number, n = 64): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

function rect(x0: number, z0: number, x1: number, z1: number): Array<[number, number]> {
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}

// Regions.
const PAD = { c: [-1650, 650] as [number, number], r: 160 };
const BRAKE = { x0: -700, x1: 1000, z0: 260, z1: 330 }; // approach + test surfaces + run-off
const HANDLING_C: [number, number] = [1450, 950];
const OFFROAD = { x0: -600, x1: 700, z0: 1300, z1: 2100 };
const GRADES = { x0: -2150, x1: -1500, z0: 1500, z1: 1800 };
const STREET = { x0: -1400, x1: -500, z: 2250 };

function shape(x: number, z: number): number {
  let h = BASE + 2 * fbm(x / 1500, z / 1500, 2);
  // Hills around the handling circuit.
  const dh = Math.hypot(x - HANDLING_C[0], z - HANDLING_C[1]);
  h += smoothstep(700, 200, dh) * (14 + 10 * fbm(x / 300, z / 300, 2));
  // Off-road hill (steep north face) in the off-road area's north-east corner.
  const dhill = Math.hypot(x - 450, z - 1450);
  h += smoothstep(140, 20, dhill) * 32;
  // Map rim.
  const edge = Math.max(Math.abs(x), Math.abs(z));
  h += smoothstep(2250, 2490, edge) * (90 + 50 * fbm(x / 500, z / 500, 3));
  return h;
}

export function buildProving(onStage?: (stage: string) => void): MapData {
  const coarse = new CoarseField(-SIZE / 2 - 60, -SIZE / 2 - 60, SIZE + 120, 20, shape);
  const inRect = (r: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  const natural = (x: number, z: number) => {
    let h = coarse.at(x, z);
    if (inRect(OFFROAD, x, z)) {
      // Moguls (staggered mounds) in the western half, a rough field elsewhere.
      const m = smoothstep(OFFROAD.x0, OFFROAD.x0 + 30, x) * smoothstep(OFFROAD.x1, OFFROAD.x1 - 30, x) * smoothstep(OFFROAD.z0, OFFROAD.z0 + 30, z) * smoothstep(OFFROAD.z1, OFFROAD.z1 - 30, z);
      const mog = x < 0 && z > 1500 && z < 1800 ? 0.55 * Math.sin(x / 3.2) * Math.sin(z / 3.2) : 0;
      const ditch = x > 100 && x < 400 && Math.abs(z - 1950) < 12 ? -1.6 * (1 - Math.abs(z - 1950) / 12) : 0; // V ditch
      h += m * (mog + ditch + 0.35 * fbm(x / 9, z / 9, 2));
    }
    return h;
  };
  const material = (x: number, z: number, y: number, slope: number) => {
    if (inRect(OFFROAD, x, z)) {
      if (x > -200 && x < 50 && z > 1850 && z < 2000) return MAT.mud;
      return slope > 0.25 ? MAT.gravel : MAT.dirt;
    }
    if (slope > 0.35) return MAT.concrete;
    if (y > 80) return MAT.gravel;
    return MAT.grass;
  };
  const R = rng(5150);
  const b = new MapBuilder({ id: 'proving', name: { ko: '종합 주행시험장', en: 'Proving Ground' }, size: SIZE, cell: 4, seed: 777, natural, material, latitude: 36.5, hazeColor: 0xc3cedb, onStage,
    decorate: (m) => {
      for (let k = 0; k < 5000; k++) {
        const x = (R() - 0.5) * 4700, z = (R() - 0.5) * 4700;
        const edge = Math.max(Math.abs(x), Math.abs(z));
        const dense = edge > 2000 || Math.hypot(x - HANDLING_C[0], z - HANDLING_C[1]) < 650;
        if (!dense && R() < 0.85) continue;
        if (inRect(OFFROAD, x, z) || m.nearPaved(x, z, 10)) continue;
        if (Math.hypot(x - OVAL_C[0], (z - OVAL_C[1]) * 2.2) < OVAL_HALF + OVAL_R + 60 && Math.abs(z - OVAL_C[1]) < OVAL_R + 60) continue;
        m.addTree(x, z, 0.8 + R() * 0.6, R() < 0.5 ? 1 : 0);
      }
    },
  });
  const flat = (y: number) => () => y;

  // ---- high-speed oval ----
  b.addRoad({ id: 'oval', name: { ko: '고속 주회로', en: 'High-speed oval' }, style: 'track', styleOverride: { lanes: 3, laneWidth: 4.5, shoulder: 3.5, barrier: 'guardrail', verge: 8, smooth: 600, maxGrade: 0.01, lights: 0 }, points: ovalPoints(), closed: true, bank: 0.32, noRoute: true });

  // ---- service roads ----
  b.addRoad({ id: 'spine', name: { ko: '중앙 도로', en: 'Central road' }, style: 'rural', points: [[0, 2420], [0, 1900], [60, 1300], [0, 700], [0, 0], [0, -300]] });
  const on = (id: string, x: number, z: number) => onRoad(b.byId.get(id)!, x, z);
  b.addRoad({ id: 's_w', name: { ko: '서측 도로', en: 'West road' }, style: 'rural', points: [on('spine', 0, 0), [-600, 10], [-1300, 0], [-1900, 60], [-2050, 400], [-2000, 1200], [-1850, 1450]], start: { join: 'spine' } });
  b.addRoad({ id: 's_e', name: { ko: '동측 도로', en: 'East road' }, style: 'rural', points: [on('spine', 0, 0), [600, 10], [1200, 30], [1900, 150], [2050, 600]], start: { join: 'spine' } });
  // Oval entry (merges onto the south straight) and exit (leaves it before the spine).
  const oval = b.byId.get('oval')!;
  const sOn = oval.nearest(500, OVAL_C[1] + OVAL_R).s, sOff = oval.nearest(-900, OVAL_C[1] + OVAL_R).s;
  const off = oval.w.pe + 1.0 + 1.8 - 0.3;
  const along = (s: number, u: number): [number, number] => {
    const p = oval.at(s);
    return [p.x + u * p.tz, p.z - u * p.tx];
  };
  b.addRoad({ id: 'oval_in', name: { ko: '주회로 진입로', en: 'Oval entry' }, style: 'ramp', styleOverride: { lights: 0 }, points: [on('spine', 0, -260), [60, -330], [200, -400], along(sOn - 150, -off), along(sOn, -off), along(sOn + 220, -off)], start: { join: 'spine' }, merge: { road: 'oval', at: 'end', length: 230 }, oneWayRoute: true });
  b.addRoad({ id: 'oval_out', name: { ko: '주회로 진출로', en: 'Oval exit' }, style: 'ramp', styleOverride: { lights: 0 }, points: [along(sOff - 220, -off), along(sOff, -off), along(sOff + 150, -off), [-600, -380], [-380, -300], on('spine', -40, -240)], merge: { road: 'oval', at: 'start', length: 230 }, end: { join: 'spine' }, oneWayRoute: true });

  // ---- dynamic pad with a skid-pad circle (paint ring) ----
  const padY = BASE + 0.3;
  b.addPad({ outline: circle(PAD.c[0], PAD.c[1], PAD.r, 72), y: flat(padY), material: MAT.asphalt, look: 'asphalt', grid: 10, fill: true });
  for (const r of [30, 40]) {
    const ring: Array<[number, number]> = [];
    for (let k = 0; k <= 96; k++) ring.push([PAD.c[0] + Math.cos((k / 96) * Math.PI * 2) * r, PAD.c[1] + Math.sin((k / 96) * Math.PI * 2) * r]);
    for (let k = 0; k < 96; k++) {
      const [ax, az] = ring[k], [bx, bz] = ring[k + 1];
      const nx = (ax - PAD.c[0]) / r, nz = (az - PAD.c[1]) / r, mx = (bx - PAD.c[0]) / r, mz = (bz - PAD.c[1]) / r;
      b.addPad({ outline: [[ax - nx * 0.1, az - nz * 0.1], [bx - mx * 0.1, bz - mz * 0.1], [bx + mx * 0.1, bz + mz * 0.1], [ax + nx * 0.1, az + nz * 0.1]], y: flat(padY + 0.004), material: MAT.paint, look: 'paint', color: 0xf2f2ee, carve: false });
    }
  }
  b.addRoad({ id: 'pad_access', style: 'rural', styleOverride: { lights: 0 }, points: [on('s_w', -1650, 0), [-1650, 250], [-1650, PAD.c[1] - PAD.r + 3]], start: { join: 's_w' }, fixed: [{ at: 2, y: padY - 0.015, radius: 80 }] });

  // ---- braking lanes: approach, surfaces, run-off ----
  const brakeY = BASE + 0.4;
  const lanes: Array<[number, number, string, string]> = [
    [MAT.asphalt, 0x3d3e40, '건조 아스팔트', 'Dry asphalt'],
    [MAT.asphaltWet, 0x2c3035, '젖은 아스팔트', 'Wet asphalt'],
    [MAT.paintWet, 0x6d7c8c, '저µ 타일 (젖은 바잘트)', 'Low-µ tiles (wet basalt)'],
    [MAT.asphalt, 0x3d3e40, 'µ-split', 'µ-split'],
    [MAT.gravel, 0x9a8f7c, '자갈', 'Gravel'],
    [MAT.snowPacked, 0xe9eef3, '압설', 'Packed snow'],
    [MAT.ice, 0xcfe0ec, '빙판', 'Ice'],
  ];
  const laneW = 7;
  const zs = 360;
  const width = lanes.length * laneW;
  b.addPad({ outline: rect(BRAKE.x0, zs, 300, zs + width), y: flat(brakeY), material: MAT.asphalt, look: 'asphalt', grid: 12, gridU: 40, fill: true });
  lanes.forEach(([mat, col], i) => {
    const z0 = zs + i * laneW, z1 = z0 + laneW;
    if (i === 3) {
      // µ-split: left half ice, right half dry asphalt (heading +x: left is −z).
      b.addPad({ outline: rect(300, z0, 550, z0 + laneW / 2), y: flat(brakeY), material: MAT.ice, look: 'paint', color: 0xcfe0ec, grid: 4, gridU: 25 });
      b.addPad({ outline: rect(300, z0 + laneW / 2, 550, z1), y: flat(brakeY), material: MAT.asphalt, look: 'asphalt', grid: 4, gridU: 25 });
      return;
    }
    b.addPad({ outline: rect(300, z0, 550, z1), y: flat(brakeY), material: mat, look: mat === MAT.asphalt ? 'asphalt' : 'paint', color: col, grid: 4, gridU: 25 });
  });
  b.addPad({ outline: rect(550, zs, BRAKE.x1, zs + width), y: flat(brakeY), material: MAT.asphalt, look: 'asphalt', grid: 12, gridU: 40, fill: true });
  // Lane dividers painted on the approach.
  for (let i = 1; i < lanes.length; i++) {
    b.addPad({ outline: rect(BRAKE.x0 + 50, zs + i * laneW - 0.07, 550, zs + i * laneW + 0.07), y: flat(brakeY + 0.004), material: MAT.paint, look: 'paint', color: 0xf2f2ee, carve: false, grid: 1, gridU: 60 });
  }
  b.addRoad({ id: 'brake_access', style: 'rural', styleOverride: { lights: 0 }, points: [on('s_w', -900, 5), [-900, 200], [-760, 330], [BRAKE.x0 + 2, zs + width / 2]], start: { join: 's_w' }, fixed: [{ at: 3, y: brakeY - 0.015, radius: 80 }] });
  lanes.forEach(([, , ko, en], i) => {
    b.addSign({ x: 290, y: brakeY, z: zs + i * laneW + laneW / 2 - (i === 0 ? 0 : 0), yaw: -Math.PI / 2, text: { ko, en }, kind: 'info' });
  });

  // ---- handling circuit ----
  const hc = HANDLING_C;
  b.addRoad({
    id: 'handling', name: { ko: '핸들링 서킷', en: 'Handling circuit' }, style: 'track', styleOverride: { lanes: 2, laneWidth: 4.5, shoulder: 2.5, verge: 6, vergeMaterial: MAT.gravelTrap, smooth: 80, maxGrade: 0.1, designSpeed: 110, lights: 0, emax: 0.07 },
    points: [[hc[0] - 450, hc[1] + 250], [hc[0] - 100, hc[1] + 330], [hc[0] + 250, hc[1] + 280], [hc[0] + 380, hc[1] + 120], [hc[0] + 250, hc[1] - 20], [hc[0] + 430, hc[1] - 200], [hc[0] + 300, hc[1] - 380], [hc[0] + 40, hc[1] - 300], [hc[0] - 60, hc[1] - 120], [hc[0] - 260, hc[1] - 330], [hc[0] - 480, hc[1] - 220], [hc[0] - 400, hc[1] - 20], [hc[0] - 560, hc[1] + 120]],
    closed: true, noRoute: true,
  });
  b.addRoad({ id: 'hc_access', style: 'rural', styleOverride: { lights: 0 }, points: [on('s_e', 1100, 25), [1100, 400], on('handling', hc[0] - 470, hc[1] - 230)], start: { join: 's_e' }, end: { join: 'handling' } });

  // ---- grades 5 … 60 % and a 20 % side slope, on fill ----
  const grades = [0.05, 0.1, 0.2, 0.3, 0.4, 0.6];
  const rise = 6;
  grades.forEach((g, i) => {
    const x0 = GRADES.x0 + 20 + i * 70, x1 = x0 + 12;
    const len = rise / g;
    const zBottom = GRADES.z1, zTop = zBottom - len;
    const y0 = BASE + 0.2;
    b.addPad({ outline: rect(x0, zTop, x1, zBottom), y: (_x, z) => y0 + Math.min((zBottom - z) * g, rise), material: MAT.concrete, look: 'concrete', grid: 3, gridU: 4, fill: true });
    b.addPad({ outline: rect(x0, zTop - 20, x1, zTop), y: flat(y0 + rise), material: MAT.concrete, look: 'concrete', grid: 4, fill: true });
    b.addSign({ x: x0 - 2, y: y0, z: zBottom + 4, yaw: 0, text: { ko: `경사 ${Math.round(g * 100)}%`, en: `Grade ${Math.round(g * 100)}%` }, kind: 'info' });
  });
  b.addPad({ outline: rect(GRADES.x1 - 40, GRADES.z0, GRADES.x1 + 20, GRADES.z0 + 30), y: (_x, z) => BASE + 0.3 + (z - GRADES.z0) * 0.2, material: MAT.concrete, look: 'concrete', grid: 3, fill: true });
  b.addSign({ x: GRADES.x1 - 45, y: BASE, z: GRADES.z0 - 4, yaw: Math.PI, text: { ko: '횡경사 20%', en: 'Side slope 20%' }, kind: 'info' });
  b.addPad({ outline: rect(GRADES.x0, GRADES.z1, GRADES.x1 + 20, GRADES.z1 + 40), y: flat(BASE + 0.2), material: MAT.asphalt, look: 'asphalt', grid: 10, fill: true });

  // ---- bump and ride street ----
  const sy = BASE + 0.3;
  const bumps = (x: number): number => {
    const d = x - STREET.x0;
    // Round hump (L 3.6 m, H 0.1 m).
    if (d > 80 && d < 83.6) return 0.1 * Math.sin((Math.PI * (d - 80)) / 3.6);
    // Trapezoidal hump (1.5 m ramps, 4 m plateau, H 0.1 m).
    if (d > 150 && d < 157) return 0.1 * Math.min(1, (d - 150) / 1.5, (157 - d) / 1.5);
    // Rumble strips (λ 0.6 m, 1.2 cm).
    if (d > 230 && d < 260) return 0.012 * Math.max(0, Math.sin((2 * Math.PI * (d - 230)) / 0.6));
    // Washboard (λ 0.7 m, ±2 cm).
    if (d > 320 && d < 400) return 0.02 * Math.sin((2 * Math.PI * (d - 320)) / 0.7);
    // Sharp step joint.
    if (d > 470 && d < 470.4) return 0.025;
    // Pothole (−6 cm).
    if (d > 560 && d < 561.4) return -0.06 * Math.sin((Math.PI * (d - 560)) / 1.4);
    // Large hump (H 0.15 m, L 6 m).
    if (d > 650 && d < 656) return 0.15 * Math.sin((Math.PI * (d - 650)) / 6);
    return 0;
  };
  const street: PadSpec = { outline: rect(STREET.x0, STREET.z - 4, STREET.x1, STREET.z + 4), y: (x) => sy + bumps(x), material: MAT.asphalt, look: 'asphalt', grid: 4, gridU: 0.25, fill: true };
  b.addPad(street);
  // Cobbles and a steel rail crossing on the same street (their own materials).
  b.addPad({ outline: rect(STREET.x0 + 700, STREET.z - 4, STREET.x0 + 780, STREET.z + 4), y: (x) => sy + 0.01 * Math.sin(x * 9.1) * Math.sin(x * 3.3), material: MAT.cobble, look: 'paint', color: 0x7d766d, grid: 2, gridU: 0.3, fill: true });
  for (const off of [0, 1.5]) b.addBox({ cx: STREET.x0 + 820 + off, cy: sy + 0.01, cz: STREET.z, hx: 0.04, hy: 0.02, hz: 4, yaw: 0, material: MAT.steel, look: 'steel' });
  b.addRoad({ id: 'street_access', style: 'rural', styleOverride: { lights: 0 }, points: [on('spine', 0, 2250), [-300, 2250], [STREET.x1 - 2, STREET.z]], start: { join: 'spine' }, fixed: [{ at: 2, y: sy - 0.015, radius: 60 }] });
  b.addSign({ x: STREET.x1 + 8, y: sy, z: STREET.z - 8, yaw: -Math.PI / 2, text: { ko: '방지턱·승차감 시험로', en: 'Bump & ride street' }, kind: 'info' });

  // ---- off-road: gravel loop, rock garden, mud, hill ----
  b.addRoad({ id: 'or_loop', name: { ko: '오프로드 코스', en: 'Off-road course' }, style: 'gravel', points: [[OFFROAD.x0 + 40, OFFROAD.z0 + 40], [OFFROAD.x1 - 60, OFFROAD.z0 + 60], [OFFROAD.x1 - 40, OFFROAD.z1 - 60], [OFFROAD.x0 + 60, OFFROAD.z1 - 40]], closed: true, noRoute: true });
  b.addRoad({ id: 'or_access', style: 'gravel', points: [on('spine', 30, 1350), [-100, 1360], on('or_loop', -200, OFFROAD.z0 + 50)], start: { join: 'spine' }, end: { join: 'or_loop' } });
  for (let k = 0; k < 90; k++) {
    const x = 180 + R() * 120, z = 1560 + R() * 120;
    const s = 0.3 + R() * 0.9;
    b.addBox({ cx: x, cy: natural(x, z) + s * 0.4, cz: z, hx: s, hy: s * 0.8, hz: s * (0.7 + R() * 0.6), yaw: R() * 3, material: MAT.concrete, look: 'rock' });
  }
  // Log crossing (wood) and a V-ditch are in the terrain; logs as boxes.
  for (let k = 0; k < 3; k++) b.addBox({ cx: -350 + k * 6, cy: natural(-350 + k * 6, 1400) + 0.15, cz: 1400, hx: 0.16, hy: 0.16, hz: 4, yaw: 0, material: MAT.wood, look: 'wood' });

  // ---- buildings: tower, workshops, wind tunnel, K&C / shaker hall ----
  const bld = (x: number, z: number, w: number, d: number, h: number, type: number, yaw = 0) => b.addBuilding({ x, z, y: b.terrain.heightAt(x, z), w, d, h, yaw, type, seed: Math.floor(R() * 1e6) });
  bld(150, -250, 16, 16, 28, 0);
  bld(260, -200, 60, 22, 9, 3);
  bld(-260, 150, 80, 30, 14, 3);
  bld(260, 150, 50, 26, 12, 3);
  b.addSign({ x: -300, y: BASE, z: 120, yaw: Math.PI, text: { ko: '풍동 시험동', en: 'Wind tunnel' }, kind: 'info' });
  b.addSign({ x: 220, y: BASE, z: 120, yaw: Math.PI, text: { ko: 'K&C · 셰이커 리그동', en: 'K&C · shaker rigs' }, kind: 'info' });
  b.addSign({ x: 30, y: BASE, z: 2380, yaw: Math.PI, text: { ko: '종합 주행시험장', en: 'Proving Ground' }, sub: { ko: '관계자 외 출입 금지', en: 'Authorised vehicles only' }, kind: 'place' });

  // ---- points of interest ----
  const face = (id: string, s: number, dir = 1) => {
    const r = b.byId.get(id)!;
    const p = r.at(s);
    const u = r.style.oneWay ? 0 : -dir * ((r.style.median ?? 0) / 2 + r.style.laneWidth * (r.style.lanes - 0.5));
    const x = p.x + u * p.tz, z = p.z - u * p.tx;
    return { x, z, yaw: Math.atan2(dir * p.tx, dir * p.tz), y: r.surfaceAt(x, z) };
  };
  const poi = (id: string, kind: MapData['pois'][number]['kind'], ko: string, en: string, at: { x: number; z: number; yaw: number; y?: number }) => b.pois.push({ id, kind, label: { ko, en }, ...at });
  poi('gate', 'spawn', '정문', 'Main gate', face('spine', 40, 1));
  poi('oval', 'test', '고속 주회로 (남측 직선)', 'Oval — south straight', { ...face('oval', oval.nearest(-400, OVAL_C[1] + OVAL_R).s), x: -400, z: OVAL_C[1] + OVAL_R - 4.5, y: oval.surfaceAt(-400, OVAL_C[1] + OVAL_R - 4.5) });
  poi('oval_entry', 'test', '주회로 진입로', 'Oval entry', face('oval_in', 20));
  poi('pad', 'test', '다이나믹 패드', 'Dynamic pad', { x: PAD.c[0], z: PAD.c[1] + PAD.r - 20, yaw: Math.PI });
  poi('skidpad', 'test', '스키드패드 (R 40 m)', 'Skid pad (R 40 m)', { x: PAD.c[0] + 40, z: PAD.c[1], yaw: Math.PI });
  poi('brake', 'test', '제동 시험로', 'Braking lanes', { x: BRAKE.x0 + 30, z: zs + laneW / 2, yaw: Math.PI / 2 });
  poi('musplit', 'test', 'µ-split 차선', 'µ-split lane', { x: BRAKE.x0 + 30, z: zs + 3 * laneW + laneW / 2, yaw: Math.PI / 2 });
  poi('handling', 'test', '핸들링 서킷', 'Handling circuit', face('handling', 30));
  poi('grades', 'test', '경사로 (5–60%)', 'Grades (5–60%)', { x: GRADES.x0 + 26, z: GRADES.z1 + 25, yaw: Math.PI });
  poi('street', 'test', '방지턱 시험로', 'Bump street', { x: STREET.x0 + 20, z: STREET.z, yaw: Math.PI / 2 });
  poi('offroad', 'test', '오프로드 코스', 'Off-road course', face('or_loop', 20));
  b.areas.push(
    { label: { ko: '고속 주회로', en: 'High-speed oval' }, x: 0, z: -1100, size: 2 },
    { label: { ko: '다이나믹 패드', en: 'Dynamic pad' }, x: PAD.c[0], z: PAD.c[1], size: 1 },
    { label: { ko: '제동 시험로', en: 'Braking lanes' }, x: 150, z: 440, size: 1 },
    { label: { ko: '핸들링 서킷', en: 'Handling circuit' }, x: hc[0], z: hc[1], size: 1 },
    { label: { ko: '오프로드', en: 'Off-road' }, x: 50, z: 1700, size: 1 },
    { label: { ko: '경사로', en: 'Grades' }, x: -1830, z: 1600, size: 1 },
  );
  void hash2;
  return b.build();
}

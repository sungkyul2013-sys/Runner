// Residential blocks for the open-world map (§13.2-1): apartment estates in several designs, villa quarters and
// quarters of detached houses — so a district is not one slab repeated. Every generator takes the block's rectangle
// (inside its streets), the ground function (the blocks may lie on a hillside: a building stands on its lowest corner,
// the rest of its ground floor dug into the slope) and the roads that run through the block (lots clear of them).
import type { MapBuilder, Road } from '../builder';
import { MAT } from '../types';

export type Ground = (x: number, z: number) => number;
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Estate designs: long slabs in staggered rows, cross-plan towers, the old five-storey blocks (주공), a mix of slabs
 *  and towers, and slabs stepped up a hillside (terraces). */
export type EstateKind = 'slab' | 'tower' | 'low' | 'mixed' | 'terrace';

const FLOOR = 2.9; // [m] apartment storey

/** The lowest ground under a footprint (its four corners and the middle). */
function baseOf(ground: Ground, x: number, z: number, w: number, d: number, yaw: number): number {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  let y = ground(x, z);
  for (const [a, b] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) y = Math.min(y, ground(x + a * w * c + b * d * s, z - a * w * s + b * d * c));
  return y + 0.15;
}

/** Whether a footprint (with `margin` around it) reaches onto any of `roads` (the lanes through a block). */
function onRoads(roads: Road[], x: number, z: number, w: number, d: number, yaw: number, margin: number): boolean {
  const reach = Math.hypot(w, d) / 2 + margin;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const r of roads) {
    const half = r.w.outer + margin;
    if (Math.abs(r.nearest(x, z).u) > half + reach) continue;
    for (let a = -0.5; a <= 0.5; a += 0.25) {
      for (let b = -0.5; b <= 0.5; b += 0.25) {
        const n = r.nearest(x + a * w * c + b * d * s, z - a * w * s + b * d * c);
        if (n.s >= -margin && n.s <= r.length + margin && Math.abs(n.u) < half) return true;
      }
    }
  }
  return false;
}

/**
 * An apartment estate (대단지 아파트) filling `r`: one design and one palette for the whole estate (its seed), the
 * blocks' heights varying around the estate's, a community hall, a playground and car parks between the rows, trees
 * along the fences. `avoid`: the estate's own access lane (and anything else crossing it).
 */
export function estate(b: MapBuilder, R: () => number, r: Rect, ground: Ground, kind: EstateKind, avoid: Road[] = []): void {
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  if (w < 40 || d < 40) return;
  const floors = kind === 'low' ? 5 : kind === 'tower' ? 26 + Math.floor(R() * 10) : kind === 'terrace' ? 9 + Math.floor(R() * 5) : 15 + Math.floor(R() * 9);
  const tone = Math.floor(R() * 1000); // one wall tone and brand stripe for the estate (MapView reads seed % 1000)
  const put = (x: number, z: number, bw: number, bd: number, nFloors: number, yaw = 0) => {
    if (x - bw / 2 < r.x0 + 2 || x + bw / 2 > r.x1 - 2 || z - bd / 2 < r.z0 + 2 || z + bd / 2 > r.z1 - 2) return false;
    if (onRoads(avoid, x, z, bw, bd, yaw, 4)) return false;
    b.addBuilding({ x, z, y: baseOf(ground, x, z, bw, bd, yaw), w: bw, d: bd, h: 3 + nFloors * FLOOR, yaw, type: 1, seed: tone + 1000 * Math.floor(R() * 1e5) });
    return true;
  };
  if (kind === 'tower') {
    // Cross-plan towers (타워형) on a staggered grid: two crossing wings each.
    const pitch = 46;
    for (let z = r.z0 + 26, row = 0; z < r.z1 - 20; z += pitch, row++) {
      for (let x = r.x0 + 26 + (row & 1 ? pitch / 2 : 0); x < r.x1 - 20; x += pitch) {
        const f = floors + Math.floor(R() * 7) - 3;
        if (onRoads(avoid, x, z, 28, 28, 0, 4)) continue;
        if (put(x, z, 26, 11, f)) put(x, z, 11, 26, f);
      }
    }
  } else if (kind === 'terrace' || kind === 'slab' || kind === 'low' || kind === 'mixed') {
    // Slabs facing south in rows (the gap between rows about the slabs' height on flat ground, less on a hillside).
    const slabD = kind === 'low' ? 11 : 13;
    const gap = kind === 'low' ? 26 : kind === 'terrace' ? 24 : 34;
    for (let z = r.z0 + slabD / 2 + 6, row = 0; z < r.z1 - slabD / 2 - 4; z += slabD + gap, row++) {
      let x = r.x0 + 6 + (row & 1 ? 14 : 0);
      while (x < r.x1 - 20) {
        const tower = kind === 'mixed' && R() < 0.3;
        const len = tower ? 26 : kind === 'low' ? 48 + Math.floor(R() * 3) * 6 : 34 + Math.floor(R() * 4) * 8;
        const cx = x + len / 2;
        const f = kind === 'low' ? 5 : floors + Math.floor(R() * 7) - 3 + (kind === 'terrace' ? row : 0);
        if (tower) {
          if (put(cx, z, 26, 11, f + 6)) put(cx, z, 11, 26, f + 6);
        } else put(cx, z, len, slabD, f, (R() - 0.5) * 0.12);
        x += len + 12 + R() * 10;
      }
    }
  }
  // Community hall (관리동 · 주민공동시설), a playground and a car park near the estate's middle.
  const mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
  for (const [ox, oz] of [[0, 0], [30, 10], [-30, -10], [0, 30], [0, -30]]) {
    const x = mx + ox, z = mz + oz;
    if (!onRoads(avoid, x, z, 40, 30, 0, 3)) {
      b.addBuilding({ x, z, y: baseOf(ground, x, z, 20, 13, 0), w: 20, d: 13, h: 7.5, yaw: 0, type: 2, seed: Math.floor(R() * 1e6) });
      playground(b, R, x + 18, z, ground);
      break;
    }
  }
  for (let k = 0; k < Math.round((w + d) / 9); k++) {
    const t = R();
    const along = t < 0.5;
    const x = along ? r.x0 + 3 + R() * (w - 6) : R() < 0.5 ? r.x0 + 3 : r.x1 - 3;
    const z = along ? (R() < 0.5 ? r.z0 + 3 : r.z1 - 3) : r.z0 + 3 + R() * (d - 6);
    if (!onRoads(avoid, x, z, 2, 2, 0, 3)) b.addTree(x, z, 0.8 + R() * 0.4, 0);
  }
}

/** A playground: rubber floor, a slide tower and swings (small solid parts a car will hit). */
function playground(b: MapBuilder, R: () => number, x: number, z: number, ground: Ground): void {
  const y = ground(x, z) + 0.17;
  const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, color: number) =>
    b.addBox({ cx, cy, cz, hx, hy, hz, yaw: 0, material: MAT.concrete, look: 'none', color });
  box(x, y + 0.03, z, 7, 0.05, 6, R() < 0.5 ? 0x3f7f5a : 0x2f6aa0);
  box(x - 3, y + 1.2, z - 2, 1, 1.2, 1, 0xe2b13c);
  box(x - 3, y + 0.6, z + 0.5, 0.45, 0.6, 1.8, 0xd2533a);
  box(x + 3, y + 1.1, z + 2, 0.08, 1.1, 1.6, 0x8a8f96);
  box(x + 3, y + 2.2, z + 2, 0.12, 0.08, 1.8, 0x8a8f96);
}

/**
 * A villa quarter (빌라촌, 다세대·다가구): lots of about 15 × 17 m behind one another, four- and five-storey villas on
 * pilotis, now and then a two-storey house or a corner shop on the street, tight gaps between them.
 */
export function villaQuarter(b: MapBuilder, R: () => number, r: Rect, ground: Ground, avoid: Road[] = [], keep: Keep = []): void {
  lots(b, R, r, ground, avoid, keep, 15, 17, (_x, _z, lw, ld, edge) => {
    const t = R();
    if (edge && t < 0.18) return { type: 5, w: lw - 2, d: ld - 3, h: 7.5 };
    if (t < 0.28) return { type: 9, w: lw - 3, d: ld - 5, h: 5.6 };
    const floors = 3 + (R() < 0.55 ? 1 : 0) + (R() < 0.25 ? 1 : 0);
    return { type: 8, w: lw - 2.5, d: ld - 3.5, h: 2.7 + floors * 2.8 };
  });
}

/**
 * A quarter of detached houses (단독주택가): lots of about 14 × 16 m, one- and two-storey houses with pitched roofs in
 * red, blue, green or slate, or flat roofs with a water tank; a garden wall (담장) along the front of most, trees in
 * the yards.
 */
export function houseQuarter(b: MapBuilder, R: () => number, r: Rect, ground: Ground, avoid: Road[] = [], keep: Keep = []): void {
  lots(b, R, r, ground, avoid, keep, 14, 16, (_x, _z, lw, ld, edge) => {
    const t = R();
    if (edge && t < 0.08) return { type: 5, w: lw - 2, d: ld - 4, h: 4.2 };
    if (t < 0.5) return { type: 4, w: lw - 4 - R() * 2, d: ld - 6 - R() * 2, h: R() < 0.55 ? 3.2 : 5.8 };
    return { type: 9, w: lw - 4, d: ld - 6, h: R() < 0.5 ? 3.0 : 5.6 };
  }, true);
}

/** Circles (x, z, radius) left free: a park, a landmark. */
export type Keep = Array<[number, number, number]>;

type LotPick = (x: number, z: number, lw: number, ld: number, edge: boolean) => { type: number; w: number; d: number; h: number } | null;

/** Lots on a grid over `r` (rows facing the nearer of the block's long sides), each given a building by `pick`. */
function lots(b: MapBuilder, R: () => number, r: Rect, ground: Ground, avoid: Road[], keep: Keep, lotW: number, lotD: number, pick: LotPick, walls = false): void {
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const nx = Math.max(1, Math.floor(w / lotW)), nz = Math.max(1, Math.floor(d / lotD));
  const cw = w / nx, cd = d / nz;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = r.x0 + (i + 0.5) * cw, z = r.z0 + (j + 0.5) * cd;
      if (keep.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr + Math.max(cw, cd) / 2)) continue;
      if (onRoads(avoid, x, z, cw, cd, 0, 1.5)) continue;
      const edge = i === 0 || j === 0 || i === nx - 1 || j === nz - 1;
      if (!edge && R() < 0.07) {
        // An empty lot: a vegetable patch and a tree or two.
        b.addTree(x + (R() - 0.5) * cw * 0.5, z + (R() - 0.5) * cd * 0.5, 0.7 + R() * 0.4, R() < 0.3 ? 1 : 0);
        continue;
      }
      const lot = pick(x, z, cw, cd, edge);
      if (!lot) continue;
      // The house stands towards the back of its lot (the yard and the gate on the street side: the nearer edge).
      const front = j < nz / 2 ? -1 : 1;
      const yaw = (R() - 0.5) * 0.06;
      const bz = z - front * (cd - lot.d) * 0.3;
      const bx = x + (R() - 0.5) * (cw - lot.w) * 0.6;
      b.addBuilding({ x: bx, z: bz, y: baseOf(ground, bx, bz, lot.w, lot.d, yaw), w: lot.w, d: lot.d, h: lot.h, yaw, type: lot.type, seed: Math.floor(R() * 1e9) });
      if (walls && R() < 0.8) {
        // Garden wall along the lot's front with a gate gap; 1.5 m of brick or rendered block.
        const fz = z + front * (cd / 2 - 0.4);
        const color = R() < 0.5 ? 0x9b5a45 : R() < 0.6 ? 0xc9c3b6 : 0x8d8a84;
        const gate = (R() - 0.5) * (cw - 5);
        const y = ground(x, fz) + 0.15;
        for (const [a0, a1] of [[-cw / 2 + 0.3, gate - 1.6], [gate + 1.6, cw / 2 - 0.3]]) {
          if (a1 - a0 < 0.8) continue;
          b.addBox({ cx: x + (a0 + a1) / 2, cy: y + 0.75, cz: fz, hx: (a1 - a0) / 2, hy: 0.75, hz: 0.12, yaw: 0, material: MAT.concrete, look: 'none', color });
        }
      }
      if (R() < 0.45) b.addTree(x + (R() - 0.5) * (cw - 4), z + front * (cd / 2 - 3), 0.6 + R() * 0.3, 2);
    }
  }
}

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
const LIFT = 0.025; // [m] a ground-level pad drawn over the ground (its physics flush): no flicker against it

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
export function estate(b: MapBuilder, R: () => number, r: Rect, ground: Ground, kind: EstateKind, avoid: Road[] = [], reserve: Rect[] = [], underground: Rect[] = []): void {
  const inRect = (q: Rect, x: number, z: number, m: number) => x > q.x0 - m && x < q.x1 + m && z > q.z0 - m && z < q.z1 + m;
  const overlaps = (x: number, z: number, w: number, d: number) => reserve.some((q) => x + w / 2 > q.x0 && x - w / 2 < q.x1 && z + d / 2 > q.z0 && z - d / 2 < q.z1);
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  if (w < 40 || d < 40) return;
  const floors = kind === 'low' ? 5 : kind === 'tower' ? 26 + Math.floor(R() * 10) : kind === 'terrace' ? 9 + Math.floor(R() * 5) : 15 + Math.floor(R() * 9);
  const tone = Math.floor(R() * 1000); // one wall tone and brand stripe for the estate (MapView reads seed % 1000)
  const put = (x: number, z: number, bw: number, bd: number, nFloors: number, yaw = 0) => {
    if (x - bw / 2 < r.x0 + 2 || x + bw / 2 > r.x1 - 2 || z - bd / 2 < r.z0 + 2 || z + bd / 2 > r.z1 - 2) return false;
    if (onRoads(avoid, x, z, bw, bd, yaw, 4) || overlaps(x, z, bw + 4, bd + 4)) return false;
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
        } else if (put(cx, z, len, slabD, f, (R() - 0.5) * 0.12) && kind !== 'terrace' && R() < 0.7) {
          // Bays in front of the block (its south side), clear of lanes and the garage ramp.
          const z0 = z + slabD / 2 + 3;
          if (!onRoads(avoid, cx, z0 + 2.5, len, 5, 0, 2) && !overlaps(cx, z0 + 2.5, len, 6)) parkingStrip(b, x + 2, x + len - 2, z0, ground);
        }
        x += len + 12 + R() * 10;
      }
    }
  }
  // Community hall (관리동 · 주민공동시설), a playground and a car park near the estate's middle.
  const mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
  for (const [ox, oz] of [[0, 0], [30, 10], [-30, -10], [0, 30], [0, -30], [60, -40], [-60, 40]]) {
    const x = mx + ox, z = mz + oz;
    if (!onRoads(avoid, x, z, 40, 30, 0, 3) && !overlaps(x + 9, z, 44, 30)) {
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
    if (!onRoads(avoid, x, z, 2, 2, 0, 3) && !overlaps(x, z, 2, 2) && !underground.some((q) => inRect(q, x, z, 3.5))) b.addTree(x, z, 0.8 + R() * 0.4, 0);
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
 * A quarter of detached houses (단독주택가): lots of about 14 × 17 m, one- and two-storey houses with pitched roofs in
 * red, blue, green or slate, or flat roofs with a water tank, at the back of the lot; on a street or lane a driveway
 * through a car-wide gate in the garden wall (담장) to the front yard, a carport or a garage there; trees in the yards.
 */
export function houseQuarter(b: MapBuilder, R: () => number, r: Rect, ground: Ground, avoid: Road[] = [], keep: Keep = []): void {
  lots(b, R, r, ground, avoid, keep, 14, 17, (_x, _z, lw, ld, edge) => {
    const t = R();
    if (edge && t < 0.08) return { type: 5, w: lw - 2, d: ld - 4, h: 4.2 };
    // Depth for a front yard a car parks in (≥ 6.2 m on a 17 m lot).
    if (t < 0.5) return { type: 4, w: lw - 4 - R() * 2, d: ld - 9 - R() * 1.5, h: R() < 0.55 ? 3.2 : 5.8 };
    return { type: 9, w: lw - 4, d: ld - 9, h: R() < 0.5 ? 3.0 : 5.6 };
  }, true);
}

/** Circles (x, z, radius) left free: a park, a landmark. */
export type Keep = Array<[number, number, number]>;

type LotPick = (x: number, z: number, lw: number, ld: number, edge: boolean) => { type: number; w: number; d: number; h: number } | null;

/** Lots on a grid over `r`, each facing its open side — a street at the block's edge or a lane through it (else the
 *  nearer long side) — given a building by `pick`. `yards`: the house stands at the back of its lot; a lot on a street
 *  or lane gets a driveway through a gate in its garden wall to the front yard, and a carport or a garage there. */
function lots(b: MapBuilder, R: () => number, r: Rect, ground: Ground, avoid: Road[], keep: Keep, lotW: number, lotD: number, pick: LotPick, yards = false): void {
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const nx = Math.max(1, Math.floor(w / lotW)), nz = Math.max(1, Math.floor(d / lotD));
  const cw = w / nx, cd = d / nz;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = r.x0 + (i + 0.5) * cw, z = r.z0 + (j + 0.5) * cd;
      if (keep.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr + Math.max(cw, cd) / 2)) continue;
      if (onRoads(avoid, x, z, cw, cd, 0, 1.5)) continue;
      // The open sides: the block's edge streets, the lanes through it.
      const sides: Array<[number, number]> = [];
      if (j === 0) sides.push([0, -1]);
      if (j === nz - 1) sides.push([0, 1]);
      if (i === 0) sides.push([-1, 0]);
      if (i === nx - 1) sides.push([1, 0]);
      for (const [fx, fz] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
        if (!sides.some(([a, c]) => a === fx && c === fz) && onRoads(avoid, x + fx * (cw / 2 + 3.5), z + fz * (cd / 2 + 3.5), 1, 1, 0, 0.5)) sides.push([fx, fz]);
      }
      const open = sides.length > 0;
      if (!open && R() < 0.07) {
        // An empty lot: a vegetable patch and a tree or two.
        b.addTree(x + (R() - 0.5) * cw * 0.5, z + (R() - 0.5) * cd * 0.5, 0.7 + R() * 0.4, R() < 0.3 ? 1 : 0);
        continue;
      }
      const [fx, fz] = open ? sides[Math.floor(R() * sides.length)] : j < nz / 2 ? [0, -1] : [0, 1];
      const alongZ = fz !== 0; // the lot's depth runs along z (its front faces ±z)
      const D = alongZ ? cd : cw, Wd = alongZ ? cw : cd;
      const lot = pick(x, z, Wd, D, open);
      if (!lot) continue;
      // The building towards the back, a little off-centre across.
      const back = Math.max(0, (D - lot.d) / 2 - 1.2);
      const across = (R() - 0.5) * Math.max(0, Wd - lot.w) * 0.6;
      const yaw = (R() - 0.5) * 0.06;
      const bx = x - fx * back + (alongZ ? across : 0), bz = z - fz * back + (alongZ ? 0 : across);
      const bw = alongZ ? lot.w : lot.d, bd = alongZ ? lot.d : lot.w;
      b.addBuilding({ x: bx, z: bz, y: baseOf(ground, bx, bz, bw, bd, yaw), w: bw, d: bd, h: lot.h, yaw, type: lot.type, seed: Math.floor(R() * 1e9) });
      // Lot frame: u across (the right-hand side looking in), v from the front edge inwards.
      const ux = alongZ ? -fz : 0, uz = alongZ ? 0 : fx;
      const at = (u: number, v: number): [number, number] => [x + fx * (D / 2 - v) + ux * u, z + fz * (D / 2 - v) + uz * u];
      const yardDepth = D / 2 + back - lot.d / 2 - 0.6; // the front yard: from the front edge to the building's face
      const drive = yards && open && yardDepth >= 6.2 && lot.type !== 5;
      const gateU = drive ? (across > 0 ? -1 : 1) * (Wd / 2 - 2.3) : (R() - 0.5) * (Wd - 5);
      const gateHalf = drive ? 1.8 : 0.8;
      if (yards && R() < (drive ? 0.9 : 0.75)) {
        // Garden wall along the lot's front (1.5 m of brick or rendered block), the gate gap a car's width when it
        // has a driveway.
        const color = R() < 0.5 ? 0x9b5a45 : R() < 0.6 ? 0xc9c3b6 : 0x8d8a84;
        for (const [a0, a1] of [[-Wd / 2 + 0.3, gateU - gateHalf], [gateU + gateHalf, Wd / 2 - 0.3]]) {
          if (a1 - a0 < 0.8) continue;
          const [cx, cz] = at((a0 + a1) / 2, 0.4);
          b.addBox({ cx, cy: ground(cx, cz) + 0.15 + 0.75, cz, hx: alongZ ? (a1 - a0) / 2 : 0.12, hy: 0.75, hz: alongZ ? 0.12 : (a1 - a0) / 2, yaw: 0, material: MAT.concrete, look: 'none', color });
        }
      }
      if (drive) {
        // Driveway: concrete from the gate to the parking spot in the front yard.
        const v1 = Math.min(yardDepth, 6.4);
        const pts = [at(gateU - 1.5, 0), at(gateU + 1.5, 0), at(gateU + 1.5, v1), at(gateU - 1.5, v1)];
        b.addPad({ outline: pts, y: (px, pz) => ground(px, pz) + 0.15 + LIFT, material: MAT.concrete, look: 'paint', color: 0xa9a59c, grid: 3, carve: false, paintLift: LIFT });
        const t = R();
        const [cx, cz] = at(gateU, 0.6 + 2.8);
        const y = ground(cx, cz) + 0.17;
        if (t < 0.35) {
          // Carport: a tinted polycarbonate roof on four steel posts, 2.4 m clear.
          for (const [du, dv] of [[-1.55, 0.9], [1.55, 0.9], [-1.55, 5.9], [1.55, 5.9]]) {
            const [px, pz] = at(gateU + du, dv);
            b.addBox({ cx: px, cy: y + 1.2, cz: pz, hx: 0.06, hy: 1.2, hz: 0.06, yaw: 0, material: MAT.steel, look: 'steel' });
          }
          b.addBox({ cx, cy: y + 2.45, cz, hx: alongZ ? 1.75 : 2.9, hy: 0.05, hz: alongZ ? 2.9 : 1.75, yaw: 0, material: MAT.steel, look: 'none', color: R() < 0.5 ? 0x5f8aa0 : 0x7a8c6e });
        } else if (t < 0.55) {
          // Garage: walls left, right and back, a flat roof; open to the yard's gate.
          const color = R() < 0.5 ? 0xd8d1c2 : 0xa9a49a;
          for (const du of [-1.65, 1.65]) {
            const [px, pz] = at(gateU + du, 3.4);
            b.addBox({ cx: px, cy: y + 1.3, cz: pz, hx: alongZ ? 0.1 : 2.6, hy: 1.3, hz: alongZ ? 2.6 : 0.1, yaw: 0, material: MAT.concrete, look: 'none', color });
          }
          const [bx2, bz2] = at(gateU, 6.0);
          b.addBox({ cx: bx2, cy: y + 1.3, cz: bz2, hx: alongZ ? 1.75 : 0.1, hy: 1.3, hz: alongZ ? 0.1 : 1.75, yaw: 0, material: MAT.concrete, look: 'none', color });
          b.addBox({ cx, cy: y + 2.7, cz, hx: alongZ ? 1.8 : 2.7, hy: 0.1, hz: alongZ ? 2.7 : 1.8, yaw: 0, material: MAT.concrete, look: 'none', color: 0x6b6e72 });
        }
      } else if (yards && R() < 0.45) {
        const [tx, tz] = at((R() - 0.5) * (Wd - 4), 3);
        b.addTree(tx, tz, 0.6 + R() * 0.3, 2);
      }
    }
  }
}

/**
 * An underground car park (지하주차장) under part of an estate, entered from its access lane: a ramp 30 m long down
 * 3.7 m (14 %, eased in and out over 4 m) between walls, under a canopy at the top; then a hall `w` × `d` with
 * columns on a 9 m grid off the central aisle, marked bays along both long walls, the concrete deck over it at
 * ground level (3 m wider all round: it hides where the ground was dug out). `side`: the ramp leaves the lane towards
 * +x (1) or −x (−1); `x0`: the lane's outer edge; `zc`: the ramp's centre line. Returns the footprint (rect) kept
 * clear of trees and of buildings over the ramp.
 */
export function undergroundGarage(b: MapBuilder, x0: number, zc: number, side: 1 | -1, ground: Ground, w = 60, d = 40): { ramp: Rect; hall: Rect } {
  const L = 30, half = 3.6;
  const xr1 = x0 + side * L;
  const ramp: Rect = { x0: Math.min(x0, xr1), x1: Math.max(x0, xr1), z0: zc - half, z1: zc + half };
  const hx0 = xr1, hx1 = xr1 + side * w;
  const hall: Rect = { x0: Math.min(hx0, hx1), x1: Math.max(hx0, hx1), z0: zc - d / 2, z1: zc + d / 2 };
  let gMin = Infinity, gMax = -Infinity;
  for (let gx = hall.x0; gx <= hall.x1; gx += 6) for (let gz = hall.z0; gz <= hall.z1; gz += 6) {
    const g = ground(gx, gz);
    gMin = Math.min(gMin, g);
    gMax = Math.max(gMax, g);
  }
  const yTop = ground(x0, zc) + 0.15;
  const yF = Math.min(gMin, ground(xr1, zc)) + 0.15 - 3.7;
  const yS = Math.max(gMax, yTop - 0.15) + 0.15;
  const a = 4 / L;
  const ease = (t: number) => (t < a ? (t * t) / (2 * a * (1 - a)) : t > 1 - a ? 1 - ((1 - t) * (1 - t)) / (2 * a * (1 - a)) : (t - a / 2) / (1 - a));
  b.addPad({ outline: [[ramp.x0, ramp.z0], [ramp.x1, ramp.z0], [ramp.x1, ramp.z1], [ramp.x0, ramp.z1]], y: (x) => yTop + (yF - yTop) * ease(Math.min(1, Math.max(0, Math.abs(x - x0) / L))), material: MAT.concrete, look: 'concrete', grid: 1.5 });
  const box = (u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, color = 0xb9b6ae, look: 'concrete' | 'none' | 'steel' = 'none') =>
    b.addBox({ cx: (u0 + u1) / 2, cy: (y0 + y1) / 2, cz: (v0 + v1) / 2, hx: Math.abs(u1 - u0) / 2, hy: (y1 - y0) / 2, hz: Math.abs(v1 - v0) / 2, yaw: 0, material: MAT.concrete, look, color });
  // Ramp walls (a parapet 1 m over the ground) and the canopy over its top.
  for (const v of [ramp.z0 - 0.2, ramp.z1 + 0.2]) box(ramp.x0, ramp.x1, v - 0.2, v + 0.2, yF - 0.3, Math.max(yTop, yS) + 1.0, 0xc4c1b9);
  const cx0 = x0 + side * 1, cx1 = x0 + side * 9;
  b.addBox({ cx: (cx0 + cx1) / 2, cy: yTop + 3.4, cz: zc, hx: 4, hy: 0.08, hz: half + 0.6, yaw: 0, material: MAT.steel, look: 'none', color: 0x4f6f80 });
  for (const u of [cx0, cx1]) for (const v of [zc - half - 0.45, zc + half + 0.45]) b.addBox({ cx: u, cy: yTop + 1.7, cz: v, hx: 0.1, hy: 1.7, hz: 0.1, yaw: 0, material: MAT.steel, look: 'steel' });
  // The hall: floor (the ground dug out to it), walls (an opening for the ramp), the deck, columns.
  b.addPad({ outline: [[hall.x0, hall.z0], [hall.x1, hall.z0], [hall.x1, hall.z1], [hall.x0, hall.z1]], y: () => yF, material: MAT.concrete, look: 'paint', color: 0x8e9093, grid: 6, fill: true });
  const t = 0.3;
  box(hall.x0 - t, hall.x1 + t, hall.z0 - t, hall.z0, yF - 0.3, yS);
  box(hall.x0 - t, hall.x1 + t, hall.z1, hall.z1 + t, yF - 0.3, yS);
  const far = side > 0 ? hall.x1 : hall.x0, near = side > 0 ? hall.x0 : hall.x1;
  box(far, far + side * t, hall.z0, hall.z1, yF - 0.3, yS);
  box(near - side * t, near, hall.z0, zc - half - 0.4, yF - 0.3, yS);
  box(near - side * t, near, zc + half + 0.4, hall.z1, yF - 0.3, yS);
  box(hall.x0 - 3, hall.x1 + 3, hall.z0 - 3, hall.z1 + 3, yS - 0.4, yS, 0xb5b2aa, 'concrete');
  for (let u = hall.x0 + 9; u < hall.x1 - 4; u += 9) {
    for (const v of [zc - 9.5, zc + 9.5, zc - 17.5, zc + 17.5]) if (v > hall.z0 + 1 && v < hall.z1 - 1) box(u - 0.3, u + 0.3, v - 0.3, v + 0.3, yF, yS - 0.4, 0xc9c5bd);
  }
  // Bays along both long walls: white lines 5 m long every 2.5 m.
  for (let u = hall.x0 + 2; u < hall.x1 - 2; u += 2.5) {
    for (const [v0, v1] of [[hall.z0 + 0.3, hall.z0 + 5.3], [hall.z1 - 5.3, hall.z1 - 0.3]]) {
      b.addPad({ outline: [[u - 0.06, v0], [u + 0.06, v0], [u + 0.06, v1], [u - 0.06, v1]], y: () => yF + 0.006, material: MAT.paint, look: 'paint', color: 0xeeeeea, grid: 6, carve: false, paintLift: 0.006 });
    }
  }
  b.addSign({ x: x0 + side * 1.5, y: yTop, z: zc - half - 1.6, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2, text: { ko: '지하주차장', en: 'Underground parking' }, sub: { ko: '높이 2.3 m', en: 'Clearance 2.3 m' }, kind: 'info' });
  return { ramp: { x0: ramp.x0 - 1, x1: ramp.x1 + 1, z0: ramp.z0 - 1.5, z1: ramp.z1 + 1.5 }, hall };
}

/** Bays in the open between an estate's blocks: an asphalt strip 5 m deep with white lines every 2.5 m. */
export function parkingStrip(b: MapBuilder, x0: number, x1: number, z0: number, ground: Ground, depth = 5): void {
  const y = (x: number, z: number) => ground(x, z) + 0.15 + LIFT;
  b.addPad({ outline: [[x0, z0], [x1, z0], [x1, z0 + depth], [x0, z0 + depth]], y, material: MAT.asphalt, look: 'paint', color: 0x3b3d40, grid: 5, carve: false, paintLift: LIFT });
  for (let x = x0 + 0.2; x <= x1 - 0.1; x += 2.5) b.addPad({ outline: [[x - 0.06, z0 + 0.3], [x + 0.06, z0 + 0.3], [x + 0.06, z0 + depth], [x - 0.06, z0 + depth]], y: (px, pz) => y(px, pz) + 0.01, material: MAT.paint, look: 'paint', color: 0xe9e9e4, grid: 5, carve: false, paintLift: LIFT + 0.01 });
}

export type SculptureKind = 'beads' | 'cubes' | 'obelisk' | 'globe' | 'clock' | 'wave' | 'statue' | 'arch' | 'torch';

/**
 * Public art (조형물), solid (a car stops against it): a ring of steel beads, a twisting stack of cubes, an obelisk, a
 * steel globe, a clock tower, a wave of coloured fins, a bronze figure on a plinth, a gateway arch, a torch.
 */
export function sculpture(b: MapBuilder, kind: SculptureKind, x: number, z: number, y: number, s = 1, yaw = 0): void {
  const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, color: number, a = yaw, steel = false) =>
    b.addBox({ cx, cy, cz, hx, hy, hz, yaw: a, material: steel ? MAT.steel : MAT.concrete, look: 'none', color });
  const cyl = (y0: number, y1: number, r0: number, r1: number, color: number, sides = 16, ox = 0, oz = 0) =>
    b.addCylinder({ x: x + ox, z: z + oz, y0, y1, r0, r1, material: MAT.concrete, look: 'white', color, sides }); // 'white' takes the colour ('none' is not drawn)
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const local = (u: number, v: number): [number, number] => [x + u * c + v * sn, z - u * sn + v * c];
  switch (kind) {
    case 'beads': {
      // 32 steel beads on a vertical circle 4.5 m across, on a granite plinth.
      box(x, y + 0.3, z, 3.2 * s, 0.3, 1 * s, 0x8f8b84);
      const R = 2.25 * s;
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2;
        const [px, pz] = local(Math.cos(a) * R, 0);
        box(px, y + 0.6 + R + Math.sin(a) * R, pz, 0.26 * s, 0.26 * s, 0.26 * s, 0xd8dde2, yaw, true);
      }
      break;
    }
    case 'cubes':
      // Five cubes stacked, each turned 18° on the one below, red and white.
      for (let k = 0; k < 5; k++) {
        const e = (1.6 - k * 0.18) * s;
        box(x, y + k * 2.2 * s + e, z, e, e, e, k & 1 ? 0xf1efea : 0xc8372d, yaw + k * 0.31);
      }
      break;
    case 'obelisk':
      box(x, y + 0.5, z, 2.2 * s, 0.5, 2.2 * s, 0x8f8b84);
      cyl(y + 1, y + 16 * s, 1.1 * s, 0.55 * s, 0xd9d4c8, 4);
      cyl(y + 16 * s, y + 17.4 * s, 0.55 * s, 0.02, 0xc9a24a, 4);
      break;
    case 'globe': {
      // A steel globe 6 m across (stacked discs) on a short column.
      cyl(y, y + 1.4, 0.9 * s, 0.9 * s, 0x7e858c);
      const R = 3 * s, n = 9;
      for (let k = 0; k < n; k++) {
        const h0 = -R + (2 * R * k) / n, h1 = -R + (2 * R * (k + 1)) / n, hm = (h0 + h1) / 2;
        const r = Math.sqrt(Math.max(R * R - hm * hm, 0.01));
        cyl(y + 1.4 + R + h0, y + 1.4 + R + h1, r, r, k & 1 ? 0xb8c4cc : 0x9fb0bb, 18);
      }
      break;
    }
    case 'clock':
      // A clock tower: a brick shaft, the clock faces (white, dark hands), a copper roof.
      box(x, y + 6 * s, z, 1.4 * s, 6 * s, 1.4 * s, 0x9a5a44);
      box(x, y + 12.8 * s, z, 1.55 * s, 0.8 * s, 1.55 * s, 0xf2f0ea);
      box(x, y + 12.8 * s, z, 1.6 * s, 0.08 * s, 0.35 * s, 0x2b2c2e);
      cyl(y + 13.6 * s, y + 16.5 * s, 1.9 * s, 0.05, 0x4f8c7a, 4);
      break;
    case 'wave':
      // Twelve coloured fins rising and falling like a wave.
      for (let k = 0; k < 12; k++) {
        const [px, pz] = local((k - 5.5) * 1.1 * s, 0);
        const h = (2.2 + 1.8 * Math.sin((k / 11) * Math.PI * 1.5)) * s;
        const hue = [0x2f7fbf, 0x3aa0c8, 0x47b5a6, 0x6cc070, 0xe7c43c, 0xe48a3a][k % 6];
        box(px, y + h / 2, pz, 0.18 * s, h / 2, 0.7 * s, hue);
      }
      break;
    case 'statue':
      // A bronze figure (body, shoulders, head) on a granite plinth.
      box(x, y + 0.8, z, 1.2 * s, 0.8, 1.2 * s, 0x8f8b84);
      cyl(y + 1.6, y + 3.3 * s + 1.6 - 1.7 * s, 0.38 * s, 0.32 * s, 0x6e5a3a, 10);
      box(x, y + 1.6 + 1.75 * s, z, 0.5 * s, 0.14 * s, 0.22 * s, 0x6e5a3a);
      cyl(y + 1.6 + 1.9 * s, y + 1.6 + 2.25 * s, 0.17 * s, 0.15 * s, 0x6e5a3a, 10);
      break;
    case 'arch': {
      // A gateway arch 8 m wide (a car drives through): two pillars and a lintel.
      for (const u of [-4.6 * s, 4.6 * s]) {
        const [px, pz] = local(u, 0);
        box(px, y + 3.4 * s, pz, 0.6 * s, 3.4 * s, 0.6 * s, 0xc9c3b6);
      }
      box(x, y + 7.2 * s, z, 5.4 * s, 0.5 * s, 0.7 * s, 0xc9c3b6);
      box(x, y + 7.85 * s, z, 3.2 * s, 0.15 * s, 0.5 * s, 0xc9a24a);
      break;
    }
    case 'torch':
      // A torch: a tapering steel shaft and a flame-coloured crown.
      cyl(y, y + 0.6, 1.6 * s, 1.6 * s, 0x8f8b84, 8);
      cyl(y + 0.6, y + 9 * s, 0.7 * s, 1.1 * s, 0x9aa3ab, 10);
      cyl(y + 9 * s, y + 10.6 * s, 1.1 * s, 0.1, 0xf08a2a, 10);
      break;
  }
}

/**
 * A wide open square (광장) over `r`, on the ground and level with the sidewalks so a car can drive onto it over the
 * kerb: granite paving in 6 m squares with darker bands, a lawn oval in the middle, a fountain, sculptures on the
 * diagonals, a ring of trees at the edge and flagpoles along one side.
 */
export function plaza(b: MapBuilder, R: () => number, r: Rect, ground: Ground, opts: { lawn?: boolean; fountain?: { r: number; height: number; jets: number }; art: SculptureKind[]; flags?: boolean }): void {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const yAt = (x: number, z: number) => ground(x, z) + 0.15;
  // The paving drawn 3 cm over the ground (its physics flush with it: no lip at the edge, no flicker from afar).
  b.addPad({
    outline: [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]], y: (x, z) => yAt(x, z) + 0.03, material: MAT.concrete, look: 'paint', grid: 6, carve: false, paintLift: 0.03,
    colorAt: (x, z) => {
      const band = Math.abs(((x - cx) % 30 + 30) % 30 - 15) < 1.2 || Math.abs(((z - cz) % 30 + 30) % 30 - 15) < 1.2;
      return band ? 0x6f6c66 : (Math.floor(x / 6) + Math.floor(z / 6)) & 1 ? 0xa39e95 : 0x96928a;
    },
  });
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  if (opts.lawn) {
    const oval: Array<[number, number]> = [];
    for (let k = 0; k < 28; k++) oval.push([cx + Math.cos((k / 28) * Math.PI * 2) * w * 0.2, cz + Math.sin((k / 28) * Math.PI * 2) * d * 0.18]);
    b.addPad({ outline: oval, y: (x, z) => yAt(x, z) + 0.06, material: MAT.grass, look: 'paint', color: 0x5f9a48, grid: 6, carve: false, paintLift: 0.06 });
  }
  // Walkways of trees, lamps and benches along the two axes (a car drives between the rows).
  for (const [ax, az, len] of [[1, 0, w], [0, 1, d]] as const) {
    for (let t = -len / 2 + 10; t <= len / 2 - 10; t += 12) {
      if (Math.abs(t) < (ax ? w * 0.24 : d * 0.24)) continue; // the lawn
      const fz = cz - (opts.lawn ? d * 0.32 : 0);
      if (opts.fountain && Math.hypot(ax * t, cz + az * t - fz) < opts.fountain.r + 10) continue; // the fountain
      for (const side of [-7, 7]) {
        const x = cx + ax * t + az * side, z = cz + az * t + ax * side;
        b.addTree(x, z, 0.85, 2);
        if (Math.round(t / 12) % 2 === 0) b.addBox({ cx: x + az * 2.2 * Math.sign(side) * -1, cy: yAt(x, z) + 0.25, cz: z + ax * 2.2 * Math.sign(side) * -1, hx: ax ? 1 : 0.25, hy: 0.25, hz: ax ? 0.25 : 1, yaw: 0, material: MAT.wood, look: 'wood' });
      }
      if (Math.round(t / 12) % 2 === 1) b.addLamp(cx + ax * t, yAt(cx + ax * t, cz + az * t), cz + az * t, ax ? 0 : Math.PI / 2, 6, 1);
    }
  }
  if (opts.fountain) {
    const fz = cz - (opts.lawn ? d * 0.32 : 0);
    b.addFountain({ x: cx, z: fz, y: yAt(cx, fz) + 0.5, r: opts.fountain.r, jets: opts.fountain.jets, height: opts.fountain.height });
  }
  // The art on the diagonals, clear of the fountain and the lawn.
  opts.art.forEach((kind, k) => {
    const a = (k / opts.art.length) * Math.PI * 2 + Math.PI / 4;
    const x = cx + Math.cos(a) * w * 0.34, z = cz + Math.sin(a) * d * 0.36;
    sculpture(b, kind, x, z, yAt(x, z), 1, a + Math.PI / 2);
  });
  const n = Math.round((w + d) / 7);
  for (let k = 0; k < n; k++) {
    const t = R();
    const x = t < 0.5 ? r.x0 + 4 + R() * (w - 8) : R() < 0.5 ? r.x0 + 4 : r.x1 - 4;
    const z = t < 0.5 ? (R() < 0.5 ? r.z0 + 4 : r.z1 - 4) : r.z0 + 4 + R() * (d - 8);
    b.addTree(x, z, 0.9 + R() * 0.3, 0);
  }
  if (opts.flags) {
    for (let k = 0; k < 7; k++) {
      const x = cx - 18 + k * 6, z = r.z0 + 10, y = yAt(x, z);
      b.addCylinder({ x, z, y0: y, y1: y + 12, r0: 0.08, material: MAT.steel, look: 'steel', sides: 6 });
      b.addBox({ cx: x + 0.9, cy: y + 11.2, cz: z, hx: 0.85, hy: 0.55, hz: 0.02, yaw: 0, material: -1, look: 'none', color: [0xc8372d, 0x2f5fa8, 0xf1efea, 0x3a8a4a][k % 4] });
    }
  }
}

/** A pocket park (어린이공원) in a quarter: a lawn, trees round it, a playground and a piece of art. */
export function pocketPark(b: MapBuilder, R: () => number, x: number, z: number, r: number, ground: Ground, art: SculptureKind): void {
  const y = ground(x, z) + 0.17;
  const ring: Array<[number, number]> = [];
  for (let k = 0; k < 16; k++) ring.push([x + Math.cos((k / 16) * Math.PI * 2) * r, z + Math.sin((k / 16) * Math.PI * 2) * r]);
  b.addPad({ outline: ring, y: (px, pz) => ground(px, pz) + 0.15 + LIFT, material: MAT.grass, look: 'paint', color: 0x67a24e, grid: 4, carve: false, paintLift: LIFT });
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    b.addTree(x + Math.cos(a) * (r - 2.5), z + Math.sin(a) * (r - 2.5), 0.8 + R() * 0.3, k % 3 === 0 ? 1 : 0);
  }
  playground(b, R, x - r * 0.3, z, ground);
  sculpture(b, art, x + r * 0.35, z, y, 0.6, R() * Math.PI);
}

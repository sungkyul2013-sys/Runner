// Real map data (§13.1 실제 지도): the extract tools/overture/fetch-overture.py writes from Overture Maps (roads from
// OpenStreetMap, building footprints, streams and rivers) in a map's local frame (x east, z south [m]), and the
// helpers that turn it into map features.

export interface OsmRoad {
  id: string;
  class: string; // motorway, trunk, primary, secondary, tertiary, residential, unclassified, service, track, path, …
  subclass: string | null;
  name: string | null;
  surface: string | null;
  flags: string[]; // is_bridge, is_tunnel, …
  width: number | null;
  level: number | null;
  pts: Array<[number, number]>;
}

export interface OsmBuilding {
  height: number | null;
  floors: number | null;
  class: string | null;
  name: string | null;
  pts: Array<[number, number]>;
}

export interface OsmWater {
  kind: 'area' | 'line';
  class: string | null; // stream, river, lake, reservoir, …
  subtype: string | null;
  name: string | null;
  pts: Array<[number, number]>;
}

export interface OsmMap {
  meta: { lat: number; lon: number; size: number; release: string; source: string; attribution: string };
  roads: OsmRoad[];
  buildings: OsmBuilding[];
  water: OsmWater[];
}

/** Road classes a car drives on (paths, steps and footways are left out). */
export const DRIVABLE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'service', 'track']);

export interface Chain {
  class: string;
  name: string | null;
  flags: string[];
  surface: string | null;
  pts: Array<[number, number]>;
}

const near = (a: [number, number], b: [number, number], tol: number) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;

/**
 * Joins segments end to end into chains: the data splits one road wherever an attribute or a connection changes, a
 * map road wants it whole. Segments join when they share an end point and have the same name, or (unnamed) the same
 * class; a named road takes an unnamed bridge or link in between. Longest chains first.
 */
export function chainSegments(segments: Array<{ class: string; name: string | null; flags: string[]; surface: string | null; pts: Array<[number, number]> }>, tol = 1.5): Chain[] {
  const left = segments.map((s) => ({ ...s, pts: s.pts.slice() }));
  const chains: Chain[] = [];
  const key = (s: { class: string; name: string | null }) => s.name ?? `#${s.class}`;
  while (left.length) {
    left.sort((a, b) => length(b.pts) - length(a.pts));
    const seed = left.shift()!;
    const c: Chain = { class: seed.class, name: seed.name, flags: [...seed.flags], surface: seed.surface, pts: seed.pts };
    for (let grown = true; grown;) {
      grown = false;
      for (let i = 0; i < left.length; i++) {
        const s = left[i];
        if (key(s) !== key(c)) continue;
        const head = c.pts[0], tail = c.pts[c.pts.length - 1], a = s.pts[0], b = s.pts[s.pts.length - 1];
        if (near(tail, a, tol)) c.pts.push(...s.pts.slice(1));
        else if (near(tail, b, tol)) c.pts.push(...s.pts.slice(0, -1).reverse());
        else if (near(head, b, tol)) c.pts.unshift(...s.pts.slice(0, -1));
        else if (near(head, a, tol)) c.pts.unshift(...s.pts.slice(1).reverse());
        else continue;
        for (const f of s.flags) if (!c.flags.includes(f)) c.flags.push(f);
        left.splice(i, 1);
        grown = true;
        break;
      }
    }
    chains.push(c);
  }
  return chains.sort((a, b) => length(b.pts) - length(a.pts));
}

export function length(pts: Array<[number, number]>): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}

/** A footprint's oriented rectangle (principal axes of its outline): centre, sides (w along yaw's x), yaw. */
export function footprintBox(pts: Array<[number, number]>): { x: number; z: number; w: number; d: number; yaw: number } {
  const ring = pts.length > 1 && near(pts[0], pts[pts.length - 1], 0.01) ? pts.slice(0, -1) : pts;
  let cx = 0, cz = 0;
  for (const [x, z] of ring) {
    cx += x;
    cz += z;
  }
  cx /= ring.length;
  cz /= ring.length;
  let sxx = 0, szz = 0, sxz = 0;
  for (const [x, z] of ring) {
    sxx += (x - cx) ** 2;
    szz += (z - cz) ** 2;
    sxz += (x - cx) * (z - cz);
  }
  const angle = 0.5 * Math.atan2(2 * sxz, sxx - szz); // principal axis from +x toward +z
  const ux = Math.cos(angle), uz = Math.sin(angle);
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const [x, z] of ring) {
    const a = (x - cx) * ux + (z - cz) * uz, b = -(x - cx) * uz + (z - cz) * ux;
    a0 = Math.min(a0, a);
    a1 = Math.max(a1, a);
    b0 = Math.min(b0, b);
    b1 = Math.max(b1, b);
  }
  const ma = (a0 + a1) / 2, mb = (b0 + b1) / 2;
  // Builder yaw: 0 = +z, local x → (cos, 0, −sin): local x along the principal axis (ux, uz) means yaw = −angle.
  return { x: cx + ma * ux - mb * uz, z: cz + ma * uz + mb * ux, w: Math.max(a1 - a0, 3), d: Math.max(b1 - b0, 3), yaw: -angle };
}

const MASK_CELL = 16, MASK_HALF = 4100, MASK_N = Math.ceil((2 * MASK_HALF) / MASK_CELL);

/** Segment buckets for nearest-line queries (streams carved into the terrain); `reach` ≤ `cell`. */
export class LineIndex {
  private readonly cells = new Map<number, number[]>();
  readonly segs: Array<{ ax: number; az: number; bx: number; bz: number; line: number; i: number }> = [];

  // Coarse mask (16 m cells over ±4.1 km) of where any line is within reach: most queries end here.
  private readonly mask = new Uint8Array(MASK_N * MASK_N);

  constructor(lines: Array<Array<[number, number]>>, private readonly cell = 48) {
    const r = Math.ceil(cell / MASK_CELL) + 1;
    for (const pts of lines) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (MASK_CELL / 2)));
        for (let k = 0; k <= steps; k++) {
          const mx = Math.floor((ax + ((bx - ax) * k) / steps + MASK_HALF) / MASK_CELL), mz = Math.floor((az + ((bz - az) * k) / steps + MASK_HALF) / MASK_CELL);
          for (let a = -r; a <= r; a++) for (let c = -r; c <= r; c++) {
            const gx = mx + a, gz = mz + c;
            if (gx >= 0 && gz >= 0 && gx < MASK_N && gz < MASK_N) this.mask[gz * MASK_N + gx] = 1;
          }
        }
      }
    }
    lines.forEach((pts, line) => {
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const k = this.segs.length;
        this.segs.push({ ax, az, bx, bz, line, i });
        const x0 = Math.floor(Math.min(ax, bx) / cell), x1 = Math.floor(Math.max(ax, bx) / cell);
        const z0 = Math.floor(Math.min(az, bz) / cell), z1 = Math.floor(Math.max(az, bz) / cell);
        for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
          const id = gx * 100003 + gz;
          let list = this.cells.get(id);
          if (!list) this.cells.set(id, (list = []));
          list.push(k);
        }
      }
    });
  }

  /** Nearest segment within `reach` [m] (≤ cell): distance, line, segment index and position along it (0…1). */
  nearest(x: number, z: number, reach: number): { d: number; line: number; i: number; u: number } | null {
    const mx = Math.floor((x + MASK_HALF) / MASK_CELL), mz = Math.floor((z + MASK_HALF) / MASK_CELL);
    if (mx >= 0 && mz >= 0 && mx < MASK_N && mz < MASK_N && !this.mask[mz * MASK_N + mx]) return null;
    const gx = Math.floor(x / this.cell), gz = Math.floor(z / this.cell);
    let best: { d: number; line: number; i: number; u: number } | null = null;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = this.cells.get((gx + a) * 100003 + gz + b);
      if (!list) continue;
      for (const k of list) {
        const s = this.segs[k];
        const dx = s.bx - s.ax, dz = s.bz - s.az;
        const u = Math.min(Math.max(((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz || 1), 0), 1);
        const d = Math.hypot(x - s.ax - dx * u, z - s.az - dz * u);
        if (d < reach && (!best || d < best.d)) best = { d, line: s.line, i: s.i, u };
      }
    }
    return best;
  }
}

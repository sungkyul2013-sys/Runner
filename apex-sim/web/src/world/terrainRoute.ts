// Mountain road alignment over real terrain (§13.2-2 산악 헤어핀): an A* search on a height grid whose states carry the
// heading (16 directions), so the path can only turn as a road does — at most two direction steps per move, a
// switchback radius of ≈ 20 m on a 16 m grid. The cost per metre grows with the grade, steeply past the road's
// grade (the cut and fill it would take: the road's profile is grade-limited when it is built), and with the cross
// slope; each turn adds a little. Steep valley walls then make the zigzag of hairpins cheaper than a straight climb,
// as they make a real pass road, and the road follows the contours where it can.

export interface TerrainRouteOptions {
  height(x: number, z: number): number;
  /** Search grid: origin (its west / north corner), cell [m] and cells per side. */
  x0: number;
  z0: number;
  cell: number;
  n: number;
  maxGrade: number; // the road's grade: above it a move costs steeply more (the cut and fill to hold it)
  hardGrade?: number; // no move over terrain steeper than this (default 0.35: a cliff, not a cutting)
  gradeWeight?: number; // cost per metre × grade²
  overWeight?: number; // cost per metre × (grade − maxGrade)²
  sideWeight?: number; // cost per metre × cross slope²
  turnWeight?: number; // cost per direction step²
  /** Extra cost per metre at a point (no-go areas: ≥ 1e6). */
  avoid?(x: number, z: number): number;
}

// The 16 headings as grid steps (about 22.5° apart: 0, 26.6, 45, 63.4, 90 … degrees from +x toward +z).
const DIRS: Array<[number, number]> = [
  [1, 0], [2, 1], [1, 1], [1, 2], [0, 1], [-1, 2], [-1, 1], [-2, 1],
  [-1, 0], [-2, -1], [-1, -1], [-1, -2], [0, -1], [1, -2], [1, -1], [2, -1],
];
const MAX_TURN = 2;

/** Min-heap of (key, value) pairs. */
class Heap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(k: number, v: number): void {
    const keys = this.keys, vals = this.vals;
    let i = keys.length;
    keys.push(k);
    vals.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= k) break;
      keys[i] = keys[p];
      vals[i] = vals[p];
      i = p;
    }
    keys[i] = k;
    vals[i] = v;
  }
  pop(): number {
    const keys = this.keys, vals = this.vals;
    const top = vals[0];
    const k = keys.pop()!, v = vals.pop()!;
    if (keys.length > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mk = k;
        if (l < keys.length && keys[l] < mk) {
          m = l;
          mk = keys[l];
        }
        if (r < keys.length && keys[r] < mk) m = r;
        if (m === i) break;
        keys[i] = keys[m];
        vals[i] = vals[m];
        i = m;
      }
      keys[i] = k;
      vals[i] = v;
    }
    return top;
  }
}

/** Grid path from `from` to `to` (map coordinates), or null when the hard grade allows none. */
export function routeTerrain(o: TerrainRouteOptions, from: [number, number], to: [number, number]): Array<[number, number]> | null {
  const { n, cell, x0, z0 } = o;
  const side = n + 1;
  const gw = o.gradeWeight ?? 40, sw = o.sideWeight ?? 4, tw = o.turnWeight ?? 6, ow = o.overWeight ?? 3000;
  const hard = o.hardGrade ?? 0.35;
  const h = new Float32Array(side * side);
  const extra = new Float32Array(side * side);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const x = x0 + i * cell, z = z0 + j * cell;
      h[j * side + i] = o.height(x, z);
      extra[j * side + i] = o.avoid ? o.avoid(x, z) : 0;
    }
  }
  const node = (p: [number, number]) => {
    const i = Math.min(Math.max(Math.round((p[0] - x0) / cell), 0), n), j = Math.min(Math.max(Math.round((p[1] - z0) / cell), 0), n);
    return j * side + i;
  };
  const start = node(from), goal = node(to);
  const gi = goal % side, gj = Math.floor(goal / side);
  const states = side * side * 16;
  const best = new Float32Array(states).fill(Infinity);
  const prev = new Int32Array(states).fill(-1);
  const heap = new Heap();
  const heuristic = (k: number) => Math.hypot((k % side) - gi, Math.floor(k / side) - gj) * cell;
  for (let d = 0; d < 16; d++) {
    best[start * 16 + d] = 0;
    heap.push(heuristic(start), start * 16 + d);
  }
  const lens = DIRS.map(([a, b]) => Math.hypot(a, b) * cell);
  let found = -1;
  while (heap.size > 0) {
    const s = heap.pop();
    const k = Math.floor(s / 16), d = s % 16;
    if (k === goal) {
      found = s;
      break;
    }
    const g = best[s];
    const i = k % side, j = Math.floor(k / side);
    for (let t = -MAX_TURN; t <= MAX_TURN; t++) {
      const nd = (d + t + 16) % 16;
      const [di, dj] = DIRS[nd];
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni > n || nj > n) continue;
      const nk = nj * side + ni;
      const len = lens[nd];
      const dh = h[nk] - h[k];
      // Grade over the move, and over each half of a long (knight's) move: no jumping over a ridge.
      let grade = Math.abs(dh) / len;
      if (Math.abs(di) + Math.abs(dj) === 3) {
        const mx = x0 + (i + di / 2) * cell, mz = z0 + (j + dj / 2) * cell;
        const hm = o.height(mx, mz);
        grade = Math.max(grade, Math.abs(hm - h[k]) / (len / 2), Math.abs(h[nk] - hm) / (len / 2));
      }
      if (grade > hard) continue;
      const over = Math.max(0, grade - o.maxGrade);
      // Cross slope: the terrain gradient across the heading.
      const gx = (h[j * side + Math.min(i + 1, n)] - h[j * side + Math.max(i - 1, 0)]) / (2 * cell);
      const gz = (h[Math.min(j + 1, n) * side + i] - h[Math.max(j - 1, 0) * side + i]) / (2 * cell);
      const ux = di / Math.hypot(di, dj), uz = dj / Math.hypot(di, dj);
      const cross = -gx * uz + gz * ux;
      const cost = g + len * (1 + gw * grade * grade + ow * over * over + sw * cross * cross + extra[nk]) + tw * t * t;
      const ns = nk * 16 + nd;
      if (cost < best[ns]) {
        best[ns] = cost;
        prev[ns] = s;
        heap.push(cost + heuristic(nk), ns);
      }
    }
  }
  if (found < 0) return null;
  const path: Array<[number, number]> = [];
  for (let s = found; s >= 0; s = prev[s]) {
    const k = Math.floor(s / 16);
    path.push([x0 + (k % side) * cell, z0 + Math.floor(k / side) * cell]);
  }
  path.reverse();
  return removeLoops(path, 1.5 * cell);
}

/** The heading in the search state lets a path come back to a cell from another direction: a loop, or a road that
 *  runs over itself. Cuts every stretch that returns within `gap` [m] of an earlier point (≥ 6 points back). */
export function removeLoops(path: Array<[number, number]>, gap: number): Array<[number, number]> {
  const p = path.slice();
  for (let i = 0; i < p.length; i++) {
    for (let j = p.length - 1; j >= i + 6; j--) {
      if (Math.hypot(p[j][0] - p[i][0], p[j][1] - p[i][1]) < gap) {
        p.splice(i + 1, j - i - 1);
        break;
      }
    }
  }
  return p;
}

/** Smooths a grid path (moving average over ±`window` points, the ends kept) and thins it to about `spacing` m. */
export function smoothPath(path: Array<[number, number]>, window = 2, spacing = 32): Array<[number, number]> {
  const sm = path.map((p, i) => {
    if (i < window || i >= path.length - window) return p;
    let x = 0, z = 0;
    for (let k = -window; k <= window; k++) {
      x += path[i + k][0];
      z += path[i + k][1];
    }
    return [x / (2 * window + 1), z / (2 * window + 1)] as [number, number];
  });
  const out: Array<[number, number]> = [sm[0]];
  let acc = 0;
  for (let i = 1; i < sm.length; i++) {
    acc += Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]);
    // Keep the points where the heading turns hard (the hairpins' apexes) and otherwise one every `spacing` m.
    const turn = i + 1 < sm.length ? turnAngle(sm[i - 1], sm[i], sm[i + 1]) : 0;
    if (acc >= spacing || turn > 0.5 || i === sm.length - 1) {
      out.push(sm[i]);
      acc = 0;
    }
  }
  return out;
}

function turnAngle(a: [number, number], b: [number, number], c: [number, number]): number {
  const a1 = Math.atan2(b[1] - a[1], b[0] - a[0]), a2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
  let d = Math.abs(a2 - a1);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
}

/** Eases bends tighter than `rMin` [m] (radius from the turn over the neighbouring segments) by moving their points
 *  toward their neighbours' mean, a few passes at a time; the ends stay. */
export function relaxRadius(points: Array<[number, number]>, rMin: number, passes = 40): Array<[number, number]> {
  const p = points.map((q) => [q[0], q[1]] as [number, number]);
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (let i = 1; i + 1 < p.length; i++) {
      const a = p[i - 1], b = p[i], c = p[i + 1];
      const l = (Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1])) / 2;
      const turn = turnAngle(a, b, c);
      if (turn < 1e-6 || l / turn >= rMin) continue;
      b[0] += 0.5 * ((a[0] + c[0]) / 2 - b[0]);
      b[1] += 0.5 * ((a[1] + c[1]) / 2 - b[1]);
      moved = true;
    }
    if (!moved) break;
  }
  return p;
}

/** The polyline resampled at a uniform `step` [m] along its length (the ends kept). */
export function resample(points: Array<[number, number]>, step: number): Array<[number, number]> {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  const count = Math.max(1, Math.round(total / step));
  const out: Array<[number, number]> = [points[0]];
  let seg = 1, segStart = 0, segLen = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
  for (let k = 1; k < count; k++) {
    const s = (k / count) * total;
    while (seg < points.length - 1 && segStart + segLen < s) {
      segStart += segLen;
      seg++;
      segLen = Math.hypot(points[seg][0] - points[seg - 1][0], points[seg][1] - points[seg - 1][1]);
    }
    const t = segLen > 0 ? (s - segStart) / segLen : 0;
    const a = points[seg - 1], b = points[seg];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  out.push(points[points.length - 1]);
  return out;
}

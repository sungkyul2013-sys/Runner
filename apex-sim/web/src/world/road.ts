// Road geometry (§13.1 도로, §13.4 도로 파이프라인): a spline centreline, a vertical profile fitted to the ground
// (smoothing, grade limit, fixed heights at junctions and grade separations), superelevation from the curvature, and
// a cross-section (lanes, median, shoulders, kerbs and sidewalks, barriers, verges) swept along it.
//
// Coordinates: x east, z south, y up. Lateral offset u is positive to the left of the direction of travel along the
// centreline (the vehicle convention: heading +x, left is −z).
import { MAT } from './types';
import { clamp, smoothstep } from './noise';

/** Marking pattern (the road shader draws it from the lateral offset and station). */
export const PATTERN = {
  none: 0,
  highway: 1, // white dashed lanes, white outer edge, yellow inner (median) edge
  arterial: 2, // double yellow centre, white dashed lanes, white edge
  twoLane: 3, // single yellow centre (dashed on straights), white edge
  ramp: 4, // one-way: white edges, dashed lanes
  track: 5, // white edges only (circuits, test tracks)
  street: 6, // city street: single yellow centre, white edge, no lane dashes
} as const;

export interface RoadStyle {
  lanes: number; // per direction; one-way: total
  laneWidth: number; // [m] 3.0–3.6 (§13.1)
  oneWay?: boolean;
  median?: number; // [m] paved median width between the inner edge lines (0: painted centre)
  medianBarrier?: boolean; // concrete barrier in the median
  shoulder: number; // [m] outer paved shoulder
  sidewalk?: number; // [m] kerb + sidewalk (urban)
  verge: number; // [m] unpaved strip draped onto the terrain
  vergeMaterial?: number;
  barrier?: 'none' | 'guardrail' | 'wall';
  emax: number; // max superelevation [-]
  crown: number; // cross slope on straights [-]
  maxGrade: number; // [-]
  smooth: number; // [m] vertical smoothing window
  surface: number; // MAT id
  pattern: number;
  designSpeed: number; // [km/h]
  lights?: number; // [m] street lamp spacing (0: none)
  drape?: boolean; // exact ground function (city streets): no crown, no smoothing
  trees?: number; // [m] street tree spacing on the sidewalks
}

export const STYLES = {
  highway: { lanes: 2, laneWidth: 3.6, median: 3.0, medianBarrier: true, shoulder: 3.0, verge: 3, barrier: 'guardrail', emax: 0.08, crown: 0.02, maxGrade: 0.04, smooth: 420, surface: MAT.asphalt, pattern: PATTERN.highway, designSpeed: 120, lights: 50 },
  arterial: { lanes: 3, laneWidth: 3.3, shoulder: 0.8, sidewalk: 5, verge: 0, emax: 0.0, crown: 0.0, maxGrade: 0.1, smooth: 0, surface: MAT.asphalt, pattern: PATTERN.arterial, designSpeed: 60, lights: 32, drape: true, trees: 14 },
  street: { lanes: 1, laneWidth: 3.2, shoulder: 1.6, sidewalk: 4.8, verge: 0, emax: 0.0, crown: 0.0, maxGrade: 0.16, smooth: 0, surface: MAT.asphalt, pattern: PATTERN.street, designSpeed: 40, lights: 30, drape: true, trees: 12 },
  alley: { lanes: 1, laneWidth: 3.0, shoulder: 0.2, sidewalk: 4.6, verge: 0, emax: 0.0, crown: 0.0, maxGrade: 0.2, smooth: 0, surface: MAT.asphaltOld, pattern: PATTERN.none, designSpeed: 30, lights: 26, drape: true },
  connector: { lanes: 2, laneWidth: 3.4, shoulder: 1.2, verge: 2, barrier: 'wall', emax: 0.06, crown: 0.02, maxGrade: 0.06, smooth: 160, surface: MAT.asphalt, pattern: PATTERN.arterial, designSpeed: 70, lights: 36 },
  ramp: { lanes: 1, laneWidth: 3.6, oneWay: true, shoulder: 2.0, verge: 2, barrier: 'guardrail', emax: 0.08, crown: 0.02, maxGrade: 0.06, smooth: 90, surface: MAT.asphalt, pattern: PATTERN.ramp, designSpeed: 60, lights: 45 },
  rural: { lanes: 1, laneWidth: 3.25, shoulder: 1.0, verge: 2.5, emax: 0.06, crown: 0.02, maxGrade: 0.08, smooth: 120, surface: MAT.asphaltOld, pattern: PATTERN.twoLane, designSpeed: 70 },
  mountain: { lanes: 1, laneWidth: 3.0, shoulder: 0.5, verge: 1.5, barrier: 'guardrail', emax: 0.08, crown: 0.02, maxGrade: 0.11, smooth: 70, surface: MAT.asphalt, pattern: PATTERN.twoLane, designSpeed: 50 },
  gravel: { lanes: 1, laneWidth: 2.6, shoulder: 0.4, verge: 1.2, emax: 0.03, crown: 0.03, maxGrade: 0.14, smooth: 50, surface: MAT.gravel, pattern: PATTERN.none, designSpeed: 40 },
  farm: { lanes: 1, laneWidth: 1.6, shoulder: 0.2, verge: 1.0, emax: 0.0, crown: 0.01, maxGrade: 0.14, smooth: 40, surface: MAT.concrete, pattern: PATTERN.none, designSpeed: 30 },
  trail: { lanes: 1, laneWidth: 2.2, shoulder: 0.3, verge: 1.2, vergeMaterial: MAT.dirt, emax: 0.0, crown: 0.02, maxGrade: 0.3, smooth: 30, surface: MAT.dirt, pattern: PATTERN.none, designSpeed: 30 },
  track: { lanes: 2, laneWidth: 5.5, oneWay: true, shoulder: 3.0, verge: 6, vergeMaterial: MAT.grass, emax: 0.1, crown: 0.01, maxGrade: 0.08, smooth: 200, surface: MAT.asphalt, pattern: PATTERN.track, designSpeed: 180 },
} satisfies Record<string, RoadStyle>;

export type StyleName = keyof typeof STYLES;

/** One cross-section vertex: lateral offset u, height relative to the centre-line profile, and the material of the
 *  segment from this vertex to the next (−1: no surface — a gap in the polyline). */
export interface SectionPoint {
  u: number;
  dy: number;
  material: number;
  kind: SegmentKind; // rendering / physics role of the segment that starts here
  side: -1 | 0 | 1; // which side's outer parts it belongs to (for junction gaps): −1 right, 0 centre, 1 left
}

export type SegmentKind = 'road' | 'kerb' | 'sidewalk' | 'barrier' | 'rail' | 'verge' | 'none';

export interface Station {
  s: number;
  x: number;
  z: number;
  tx: number; // unit tangent
  tz: number;
  k: number; // signed curvature [1/m] (+: turning left)
  y: number; // profile height
  e: number; // superelevation (+: the left side lower)
  grade: number;
  flags: number; // STATION.*
  ground: number; // natural ground under the centre line
}

export const STATION = { bridge: 1, tunnel: 2, portal: 4 } as const;

/** Centripetal Catmull–Rom through the control points, densely sampled (about `step` metres). */
export function splinePolyline(points: Array<[number, number]>, closed: boolean, step = 1): Array<[number, number]> {
  const n = points.length;
  const at = (i: number): [number, number] => (closed ? points[((i % n) + n) % n] : points[Math.min(Math.max(i, 0), n - 1)]);
  const out: Array<[number, number]> = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    let p0 = at(i - 1);
    const p1 = at(i), p2 = at(i + 1);
    let p3 = at(i + 2);
    if (!closed && i === 0) p0 = [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]];
    if (!closed && i === segs - 1) p3 = [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]];
    const d = (a: [number, number], b: [number, number]) => Math.max(Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5), 1e-4);
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const m = Math.max(2, Math.ceil(len / step));
    for (let j = 0; j < m; j++) {
      const t = t1 + ((t2 - t1) * j) / m;
      const lerp2 = (a: [number, number], b: [number, number], ta: number, tb: number): [number, number] => {
        const w = (t - ta) / (tb - ta);
        return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
      };
      const a1 = lerp2(p0, p1, t0, t1), a2 = lerp2(p1, p2, t1, t2), a3 = lerp2(p2, p3, t2, t3);
      const b1 = lerp2(a1, a2, t0, t2), b2 = lerp2(a2, a3, t1, t3);
      out.push(lerp2(b1, b2, t1, t2));
    }
  }
  out.push(closed ? [...points[0]] as [number, number] : [...points[n - 1]] as [number, number]);
  return out;
}

/** Arc-length resampling of a dense polyline with spacing from the local radius (chord error ≈ 1 cm). */
export function stationsOf(dense: Array<[number, number]>, minStep = 2, maxStep = 8): Station[] {
  const n = dense.length;
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
  const total = cum[n - 1];
  const headingAt = (i: number) => {
    const a = dense[Math.max(i - 1, 0)], b = dense[Math.min(i + 1, n - 1)];
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };
  // Curvature from the heading change over ±3 m.
  const curvAt = (i: number) => {
    let j0 = i, j1 = i;
    while (j0 > 0 && cum[i] - cum[j0] < 3) j0--;
    while (j1 < n - 1 && cum[j1] - cum[i] < 3) j1++;
    if (j1 === j0) return 0;
    let dh = headingAt(j1) - headingAt(j0);
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    // atan2 over (x, z): heading grows toward +z, which is to the right of travel → a left turn decreases it.
    return -dh / (cum[j1] - cum[j0]);
  };
  const out: Station[] = [];
  let i = 0;
  let s = 0;
  for (;;) {
    while (i < n - 2 && cum[i + 1] < s) i++;
    const seg = cum[i + 1] - cum[i];
    const w = seg > 0 ? Math.min(Math.max((s - cum[i]) / seg, 0), 1) : 0;
    const x = dense[i][0] + (dense[i + 1][0] - dense[i][0]) * w;
    const z = dense[i][1] + (dense[i + 1][1] - dense[i][1]) * w;
    const h = headingAt(w < 0.5 ? i : i + 1);
    const k = curvAt(w < 0.5 ? i : i + 1);
    out.push({ s, x, z, tx: Math.cos(h), tz: Math.sin(h), k, y: 0, e: 0, grade: 0, flags: 0, ground: 0 });
    if (s >= total) break;
    const r = Math.abs(k) > 1e-6 ? 1 / Math.abs(k) : 1e6;
    const step = clamp(Math.sqrt(8 * r * 0.01), minStep, maxStep);
    s = Math.min(s + step, total);
    if (total - s < minStep * 0.5) s = total;
  }
  return out;
}

/** Moving average over a window of `w` metres (weighted by station spacing), `passes` times. */
export function smoothProfile(st: Station[], values: Float64Array, w: number, passes = 2): Float64Array {
  if (w <= 0) return values;
  let cur = values;
  for (let p = 0; p < passes; p++) {
    const next = new Float64Array(cur.length);
    let lo = 0, hi = 0, sum = 0, weight = 0;
    const segW = (j: number) => {
      const a = j > 0 ? st[j].s - st[j - 1].s : 0, b = j < st.length - 1 ? st[j + 1].s - st[j].s : 0;
      return (a + b) * 0.5 + 1e-6;
    };
    for (let i = 0; i < st.length; i++) {
      const s = st[i].s;
      while (hi < st.length && st[hi].s <= s + w / 2) {
        sum += cur[hi] * segW(hi);
        weight += segW(hi);
        hi++;
      }
      while (lo < hi && st[lo].s < s - w / 2) {
        sum -= cur[lo] * segW(lo);
        weight -= segW(lo);
        lo++;
      }
      next[i] = weight > 0 ? sum / weight : cur[i];
    }
    // Keep the ends where they were (the averaging window is one-sided there).
    next[0] = cur[0];
    next[st.length - 1] = cur[st.length - 1];
    cur = next;
  }
  return cur;
}

/** Limits the grade to ±g with forward and backward passes. */
export function limitGrade(st: Station[], y: Float64Array, g: number, fixed?: Uint8Array): void {
  for (let i = 1; i < st.length; i++) {
    if (fixed?.[i]) continue;
    const ds = st[i].s - st[i - 1].s;
    y[i] = clamp(y[i], y[i - 1] - g * ds, y[i - 1] + g * ds);
  }
  for (let i = st.length - 2; i >= 0; i--) {
    if (fixed?.[i]) continue;
    const ds = st[i + 1].s - st[i].s;
    y[i] = clamp(y[i], y[i + 1] - g * ds, y[i + 1] + g * ds);
  }
}

/** Adds (target − y(s0)) with a cosine falloff over ±radius around s0. */
export function bumpProfile(st: Station[], y: Float64Array, s0: number, target: number, radius: number, raiseOnly = false): void {
  const cur = interp(st, y, s0);
  const d = target - cur;
  if (raiseOnly && d <= 0) return;
  for (let i = 0; i < st.length; i++) {
    const r = Math.abs(st[i].s - s0) / radius;
    if (r < 1) y[i] += d * 0.5 * (1 + Math.cos(Math.PI * r));
  }
}

export function interp(st: Station[], v: ArrayLike<number>, s: number): number {
  if (s <= st[0].s) return v[0];
  const n = st.length;
  if (s >= st[n - 1].s) return v[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (st[m].s <= s) lo = m;
    else hi = m;
  }
  const w = (s - st[lo].s) / (st[hi].s - st[lo].s);
  return v[lo] + (v[hi] - v[lo]) * w;
}

/** Index of the last station with s ≤ the given station. */
export function stationIndex(st: Station[], s: number): number {
  let lo = 0, hi = st.length - 1;
  if (s >= st[hi].s) return hi;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (st[m].s <= s) lo = m;
    else hi = m;
  }
  return lo;
}

/** Superelevation from curvature: e = v²·κ / (2g) (half the lateral acceleration carried by the bank), limited to
 *  emax, smoothed along the road (runoff). */
export function superelevation(st: Station[], style: RoadStyle): void {
  if (style.emax <= 0) return;
  const v = style.designSpeed / 3.6;
  const raw = new Float64Array(st.length);
  for (let i = 0; i < st.length; i++) raw[i] = clamp((v * v * st[i].k) / (2 * 9.81), -style.emax, style.emax);
  const runoff = clamp(v * 2.2, 25, 90);
  const e = smoothProfile(st, raw, runoff, 2);
  for (let i = 0; i < st.length; i++) st[i].e = e[i];
}

/** Half widths of a style's parts. */
export function widths(style: RoadStyle) {
  const median = style.median ?? 0;
  const oneWay = !!style.oneWay;
  const cw = oneWay ? (style.lanes * style.laneWidth) / 2 : median / 2 + style.lanes * style.laneWidth;
  const inner = oneWay ? 1.0 : 0; // one-way roads: a narrow left shoulder
  const pe = cw + style.shoulder;
  const peLeft = oneWay ? cw + inner : pe;
  const kerb = style.sidewalk ? 0.15 : 0;
  const outer = pe + (style.sidewalk ?? 0) + (style.barrier && style.barrier !== 'none' ? 0.6 : 0);
  const outerLeft = peLeft + (style.sidewalk ?? 0) + (style.barrier && style.barrier !== 'none' ? 0.6 : 0);
  return { median, cw, pe, peLeft, kerb, outer, outerLeft, full: Math.max(outer, outerLeft) + style.verge };
}

/** Height of the carriageway at lateral offset u (without kerbs), relative to the profile. */
export function crossfall(style: RoadStyle, e: number, u: number): number {
  const c = style.drape ? 0 : style.crown;
  const ae = Math.abs(e);
  return -e * u - Math.max(c - ae, 0) * Math.abs(u);
}

/** Cross-section from the right outer edge to the left one (see SectionPoint). The point count depends on the style
 *  only (bridges and plain sections stitch together): parts that are absent collapse onto the edge with material −1.
 *  The verge's outer points carry dy = NaN: they are draped onto the terrain later. */
export function crossSection(style: RoadStyle, e: number, onBridge: boolean, inTunnel = false): SectionPoint[] {
  const w = widths(style);
  const pts: SectionPoint[] = [];
  const road = style.surface;
  const verge = onBridge || inTunnel ? -1 : style.verge > 0 ? (style.vergeMaterial ?? MAT.grass) : -1;
  const cf = (u: number) => crossfall(style, e, u);
  // Outward parts beyond the paved edge `pe` of one side: [u (outward), dy, material and kind of the next segment].
  const edgeParts = (pe: number, side: -1 | 1): Array<[number, number, number, SegmentKind]> => {
    const yEdge = cf(side * pe);
    if (style.sidewalk) {
      const sw = style.sidewalk;
      return [
        [pe, yEdge, MAT.concrete, 'kerb'],
        [pe, yEdge + 0.15, MAT.concrete, 'sidewalk'],
        [pe + sw, yEdge + 0.15, verge, verge >= 0 ? 'verge' : 'none'],
      ];
    }
    const kind = onBridge || inTunnel || style.barrier === 'wall' ? 'wall' : style.barrier === 'guardrail' ? 'rail' : 'none';
    if (kind === 'none') {
      return [
        [pe, yEdge, verge, verge >= 0 ? 'verge' : 'none'],
        [pe + 0.1, yEdge, verge, verge >= 0 ? 'verge' : 'none'],
        [pe + 0.45, yEdge, verge, verge >= 0 ? 'verge' : 'none'],
        [pe + 0.6, yEdge, verge, verge >= 0 ? 'verge' : 'none'],
      ];
    }
    const h = kind === 'wall' ? (inTunnel ? 0.3 : 1.0) : 0.75;
    const top: [number, SegmentKind] = kind === 'wall' ? [MAT.concrete, 'barrier'] : [MAT.steel, 'rail'];
    return [
      [pe, yEdge, top[0], top[1]],
      [pe + 0.1, yEdge + h, top[0], top[1]],
      [pe + 0.45, yEdge + h, top[0], top[1]],
      [pe + 0.6, yEdge, verge, verge >= 0 ? 'verge' : 'none'],
    ];
  };
  const right = edgeParts(w.pe, -1);
  const left = edgeParts(w.peLeft, 1);
  if (style.verge > 0) {
    const last = right[right.length - 1];
    pts.push({ u: -(last[0] + style.verge), dy: Number.NaN, material: verge, kind: verge >= 0 ? 'verge' : 'none', side: -1 });
  }
  for (let k = right.length - 1; k >= 0; k--) {
    const [u, dy] = right[k];
    // The segment from this point inward belongs to the part listed before it (or is the road).
    if (k > 0) pts.push({ u: -u, dy, material: right[k - 1][2], kind: right[k - 1][3], side: -1 });
    else pts.push({ u: -u, dy, material: road, kind: 'road', side: 0 });
  }
  pts.push({ u: -w.cw, dy: cf(-w.cw), material: road, kind: 'road', side: 0 });
  if (style.medianBarrier) {
    pts.push({ u: -0.3, dy: cf(-0.3), material: MAT.concrete, kind: 'barrier', side: 0 });
    pts.push({ u: -0.1, dy: cf(-0.3) + 0.81, material: MAT.concrete, kind: 'barrier', side: 0 });
    pts.push({ u: 0.1, dy: cf(0.3) + 0.81, material: MAT.concrete, kind: 'barrier', side: 0 });
    pts.push({ u: 0.3, dy: cf(0.3), material: road, kind: 'road', side: 0 });
  } else if (!style.drape && style.crown > 0) {
    pts.push({ u: 0, dy: cf(0), material: road, kind: 'road', side: 0 });
  }
  pts.push({ u: w.cw, dy: cf(w.cw), material: road, kind: 'road', side: 0 });
  for (const [u, dy, material, kind] of left) pts.push({ u, dy, material, kind, side: 1 });
  if (style.verge > 0) {
    const last = left[left.length - 1];
    pts.push({ u: last[0] + style.verge, dy: Number.NaN, material: -1, kind: 'none', side: 1 });
  }
  // Merge coincident neighbours (a zero-width shoulder): keep the later point's outgoing segment.
  const clean: SectionPoint[] = [];
  for (const p of pts) {
    const q = clean[clean.length - 1];
    if (q && Math.abs(q.u - p.u) < 1e-6 && Math.abs(q.dy - p.dy) < 1e-6) {
      clean[clean.length - 1] = p;
      continue;
    }
    clean.push(p);
  }
  return clean;
}

/** Street-lamp and tree offsets for a style (left side positive). */
export function lampOffset(style: RoadStyle): number {
  const w = widths(style);
  if (style.medianBarrier) return 0;
  if (style.sidewalk) return w.pe + 0.8;
  return w.pe + (style.barrier && style.barrier !== 'none' ? 1.2 : 1.0);
}

export { smoothstep };

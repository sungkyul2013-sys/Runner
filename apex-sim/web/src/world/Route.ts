// Waypoint route guidance (§13.1 웨이포인트 경로 안내, §18.3-7): the shortest path over the road graph (A*), from
// the point of the road nearest the car to the point nearest the waypoint, and turn-by-turn hints along it.
import type { GraphEdge, MapGraph } from './builder';

export interface RoutePoint {
  x: number;
  z: number;
}

export interface RoutePlan {
  points: RoutePoint[]; // polyline from the car to the waypoint
  length: number; // [m]
}

interface Snap {
  edge: number;
  seg: number; // segment index in the edge polyline
  t: number;
  x: number;
  z: number;
  d: number;
  along: number; // distance from the edge start [m]
}

function edgeLengths(e: GraphEdge): number[] {
  const out = [0];
  for (let i = 1; i < e.xs.length; i++) out.push(out[i - 1] + Math.hypot(e.xs[i] - e.xs[i - 1], e.zs[i] - e.zs[i - 1]));
  return out;
}

export class Router {
  private readonly adj = new Map<string, Array<{ edge: number; to: string; reverse: boolean }>>();
  private readonly cum: number[][];

  constructor(private readonly graph: MapGraph) {
    this.cum = graph.edges.map(edgeLengths);
    graph.edges.forEach((e, i) => {
      this.link(e.a, { edge: i, to: e.b, reverse: false });
      if (!e.oneWay) this.link(e.b, { edge: i, to: e.a, reverse: true });
    });
  }

  private link(node: string, v: { edge: number; to: string; reverse: boolean }): void {
    if (!this.adj.has(node)) this.adj.set(node, []);
    this.adj.get(node)!.push(v);
  }

  /** Nearest point on any road (plan distance). */
  snap(x: number, z: number): Snap | null {
    let best: Snap | null = null;
    this.graph.edges.forEach((e, i) => {
      for (let k = 0; k + 1 < e.xs.length; k++) {
        const ax = e.xs[k], az = e.zs[k], bx = e.xs[k + 1], bz = e.zs[k + 1];
        const dx = bx - ax, dz = bz - az;
        const l2 = dx * dx + dz * dz;
        const t = l2 > 0 ? Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / l2, 0), 1) : 0;
        const px = ax + dx * t, pz = az + dz * t;
        const d = Math.hypot(x - px, z - pz);
        if (!best || d < best.d) best = { edge: i, seg: k, t, x: px, z: pz, d, along: this.cum[i][k] + Math.sqrt(l2) * t };
      }
    });
    return best;
  }

  private nodePos(id: string): [number, number] {
    return this.graph.nodes.get(id) ?? [0, 0];
  }

  /** Shortest route from (x0, z0) to (x1, z1) along the roads, or null (no road nearby / not connected). */
  plan(x0: number, z0: number, x1: number, z1: number): RoutePlan | null {
    const a = this.snap(x0, z0), b = this.snap(x1, z1);
    if (!a || !b) return null;
    const ea = this.graph.edges[a.edge], eb = this.graph.edges[b.edge];
    const la = this.cum[a.edge][this.cum[a.edge].length - 1];
    const lb = this.cum[b.edge][this.cum[b.edge].length - 1];
    // Same edge: straight along it.
    if (a.edge === b.edge && (!ea.oneWay || b.along >= a.along)) {
      return this.finish([{ x: x0, z: z0 }, ...this.slice(a.edge, a.along, b.along), { x: x1, z: z1 }]);
    }
    // Virtual start: the car's point can leave toward either end of its edge (one-way edges: forward only).
    const dist = new Map<string, number>();
    const prev = new Map<string, { from: string; edge: number; reverse: boolean } | null>();
    const open: Array<{ node: string; f: number }> = [];
    const [tx, tz] = [b.x, b.z];
    const h = (id: string) => {
      const [x, z] = this.nodePos(id);
      return Math.hypot(x - tx, z - tz);
    };
    const push = (node: string, g: number, p: { from: string; edge: number; reverse: boolean } | null) => {
      if (g >= (dist.get(node) ?? Infinity)) return;
      dist.set(node, g);
      prev.set(node, p);
      open.push({ node, f: g + h(node) });
    };
    push(ea.b, la - a.along, { from: '@start', edge: a.edge, reverse: false });
    if (!ea.oneWay) push(ea.a, a.along, { from: '@start', edge: a.edge, reverse: true });
    const done = new Set<string>();
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const { node } = open.splice(bi, 1)[0];
      if (done.has(node)) continue;
      done.add(node);
      if (node === eb.a || node === eb.b) {
        // Could finish here; keep going until both ends are settled or the queue passes them (small graphs).
      }
      for (const v of this.adj.get(node) ?? []) {
        const len = this.cum[v.edge][this.cum[v.edge].length - 1];
        push(v.to, dist.get(node)! + len, { from: node, edge: v.edge, reverse: v.reverse });
      }
    }
    // Finish on the target edge from either end.
    const viaA = (dist.get(eb.a) ?? Infinity) + b.along;
    const viaB = eb.oneWay ? Infinity : (dist.get(eb.b) ?? Infinity) + (lb - b.along);
    if (!Number.isFinite(Math.min(viaA, viaB))) return null;
    const endNode = viaA <= viaB ? eb.a : eb.b;
    // Walk back.
    const legs: Array<{ edge: number; reverse: boolean }> = [];
    let cur = endNode;
    let startLeg: { edge: number; reverse: boolean } | null = null;
    for (let guard = 0; guard < 10000; guard++) {
      const p = prev.get(cur);
      if (!p) break;
      if (p.from === '@start') {
        startLeg = { edge: p.edge, reverse: p.reverse };
        break;
      }
      legs.unshift({ edge: p.edge, reverse: p.reverse });
      cur = p.from;
    }
    const pts: RoutePoint[] = [{ x: x0, z: z0 }];
    if (startLeg) pts.push(...(startLeg.reverse ? this.slice(a.edge, a.along, 0) : this.slice(a.edge, a.along, la)));
    for (const l of legs) {
      const L = this.cum[l.edge][this.cum[l.edge].length - 1];
      pts.push(...(l.reverse ? this.slice(l.edge, L, 0) : this.slice(l.edge, 0, L)));
    }
    pts.push(...(endNode === eb.a ? this.slice(b.edge, 0, b.along) : this.slice(b.edge, lb, b.along)));
    pts.push({ x: x1, z: z1 });
    return this.finish(pts);
  }

  /** Points of edge `e` between two distances along it (either direction). */
  private slice(e: number, from: number, to: number): RoutePoint[] {
    const edge = this.graph.edges[e];
    const cum = this.cum[e];
    const at = (d: number): RoutePoint => {
      let k = 0;
      while (k + 2 < cum.length && cum[k + 1] < d) k++;
      const seg = cum[k + 1] - cum[k];
      const t = seg > 0 ? Math.min(Math.max((d - cum[k]) / seg, 0), 1) : 0;
      return { x: edge.xs[k] + (edge.xs[k + 1] - edge.xs[k]) * t, z: edge.zs[k] + (edge.zs[k + 1] - edge.zs[k]) * t };
    };
    const out: RoutePoint[] = [at(from)];
    if (to >= from) {
      for (let k = 0; k < cum.length; k++) if (cum[k] > from && cum[k] < to) out.push({ x: edge.xs[k], z: edge.zs[k] });
    } else {
      for (let k = cum.length - 1; k >= 0; k--) if (cum[k] < from && cum[k] > to) out.push({ x: edge.xs[k], z: edge.zs[k] });
    }
    out.push(at(to));
    return out;
  }

  private finish(pts: RoutePoint[]): RoutePlan {
    const clean: RoutePoint[] = [];
    for (const p of pts) {
      const q = clean[clean.length - 1];
      if (!q || Math.hypot(p.x - q.x, p.z - q.z) > 0.5) clean.push(p);
    }
    let length = 0;
    for (let i = 1; i < clean.length; i++) length += Math.hypot(clean[i].x - clean[i - 1].x, clean[i].z - clean[i - 1].z);
    return { points: clean, length };
  }
}

export type Turn = 'straight' | 'left' | 'right' | 'uturn' | 'arrive';

/** The next manoeuvre along a route from the car's position: distance to it and its direction. */
export function nextManeuver(route: RoutePlan, x: number, z: number): { distance: number; turn: Turn; remaining: number; offRoute: number } {
  const p = route.points;
  // Nearest segment to the car.
  let best = 0, bd = Infinity, bt = 0;
  for (let i = 0; i + 1 < p.length; i++) {
    const dx = p[i + 1].x - p[i].x, dz = p[i + 1].z - p[i].z;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.min(Math.max(((x - p[i].x) * dx + (z - p[i].z) * dz) / l2, 0), 1) : 0;
    const d = Math.hypot(x - p[i].x - dx * t, z - p[i].z - dz * t);
    if (d < bd) {
      bd = d;
      best = i;
      bt = t;
    }
  }
  let remaining = Math.hypot(p[best + 1].x - p[best].x, p[best + 1].z - p[best].z) * (1 - bt);
  for (let i = best + 1; i + 1 < p.length; i++) remaining += Math.hypot(p[i + 1].x - p[i].x, p[i + 1].z - p[i].z);
  // Walk ahead until the heading turns by more than 35° within 30 m.
  let dist = Math.hypot(p[best + 1].x - p[best].x, p[best + 1].z - p[best].z) * (1 - bt);
  const heading = (i: number) => Math.atan2(p[i + 1].x - p[i].x, p[i + 1].z - p[i].z);
  for (let i = best + 1; i + 1 < p.length; i++) {
    let dh = heading(i) - heading(i - 1);
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    // Accumulate over short segments.
    let j = i, acc = dh, span = 0;
    while (Math.abs(acc) < 0.6 && j + 2 < p.length && span < 30) {
      span += Math.hypot(p[j + 1].x - p[j].x, p[j + 1].z - p[j].z);
      j++;
      let d2 = heading(j) - heading(j - 1);
      while (d2 > Math.PI) d2 -= 2 * Math.PI;
      while (d2 < -Math.PI) d2 += 2 * Math.PI;
      acc += d2;
    }
    if (Math.abs(acc) >= 0.6) {
      // Heading = atan2(x, z): a left turn (toward −x when heading +z…) decreases it in this frame? Heading measured
      // from +z toward +x; turning left (counter-clockwise seen from above, y up) increases it.
      const turn: Turn = Math.abs(acc) > 2.6 ? 'uturn' : acc > 0 ? 'left' : 'right';
      return { distance: dist, turn, remaining, offRoute: bd };
    }
    dist += Math.hypot(p[i + 1].x - p[i].x, p[i + 1].z - p[i].z);
  }
  return { distance: remaining, turn: 'arrive', remaining, offRoute: bd };
}

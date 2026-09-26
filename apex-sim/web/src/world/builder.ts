// Map builder (§13.4 맵 제작 파이프라인): terrain from a height function, roads swept along splines with their
// vertical profiles, embankments cut and filled into the terrain, junctions (crossings with a paved box, T-junctions
// blending into the parent road), bridges and tunnels where the profile leaves the ground, then the physics triangles
// (grouped per tile and material), the render meshes and the props (lamps, trees, signals, signs).
import { MAT, type AreaLabel, type MapPhysics, type Poi, type StaticMeshData } from './types';
import { clamp, hash2, lerp, rng, smoothstep } from './noise';
import {
  bumpProfile, crossfall, crossSection, interp, lampOffset, limitGrade, PATTERN, smoothProfile, splinePolyline, STATION,
  stationIndex, stationsOf, STYLES, superelevation, widths, type RoadStyle, type SegmentKind, type Station, type StyleName,
} from './road';
import { Terrain } from './terrain';
import type { Localized } from '../ui/i18n';

export interface RoadSpec {
  id: string;
  name?: Localized;
  style: StyleName;
  styleOverride?: Partial<RoadStyle>;
  points: Array<[number, number]>;
  closed?: boolean;
  /** Control-point index ranges bored as tunnels (straight grade between the portals). */
  tunnels?: Array<[number, number]>;
  /** Fixed heights at control points. */
  fixed?: Array<{ at: number; y: number; radius?: number }>;
  /** Grade separation: pass over these roads with at least `clearance` metres (default 7.5). */
  over?: Array<{ road: string; clearance?: number }>;
  /** T-junctions: this end meets the edge of an earlier road. */
  start?: { join: string };
  end?: { join: string };
  /** Constant bank on curves (banked ovals): e = bank · κ / κmax. */
  bank?: number;
  /** Starts where that road ends (same height; a change of style along one route). */
  continues?: string;
  /** Parallel merge / diverge lane along a parent road (ramps): this road's `at` end runs beside the parent's
   *  shoulder for `length` metres; that end takes the parent's height and neither road has a barrier between. */
  merge?: { road: string; at: 'start' | 'end'; length: number };
  /** Cable-stayed look for its bridges. */
  landmark?: boolean;
  /** Its long river span as a suspension bridge instead: two portal towers, main cables over them sagging to the
   *  deck at mid-span, vertical hangers, anchorages at both ends. */
  suspension?: boolean;
  /** Keep off the route graph (test tracks, pads' access lanes). */
  noRoute?: boolean;
  /** Directed in the route graph (ramps). */
  oneWayRoute?: boolean;
}

export interface Gap {
  s0: number;
  s1: number;
  mask: number; // 1 right outer parts, 2 centre (road), 4 left outer parts
}

export class Road {
  readonly style: RoadStyle;
  readonly w: ReturnType<typeof widths>;
  st: Station[] = [];
  readonly gaps: Gap[] = [];
  /** Junction stations (for crosswalks and stop lines): s → 'start' / 'end' flags per sub-ribbon. */
  readonly junctionS: number[] = [];
  /** Parent roads of T-junction ends and merges, for the surface blend (over `blend` metres from that end). */
  startParent: Road | null = null;
  endParent: Road | null = null;
  startBlend = 14;
  endBlend = 14;
  /** Route graph: node ids at stations. */
  readonly nodes: Array<{ s: number; node: string; extra?: [number, number] }> = [];
  ctrlS: number[] = [];

  constructor(readonly spec: RoadSpec) {
    this.style = { ...STYLES[spec.style], ...(spec.styleOverride ?? {}) };
    this.w = widths(this.style);
  }

  get length(): number {
    return this.st[this.st.length - 1].s;
  }

  /** Nearest station to (x, z) by plan distance (brute force: used for a few junction queries). */
  nearest(x: number, z: number): { i: number; s: number; u: number; along: number; d: number } {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.st.length; i++) {
      const d = (this.st[i].x - x) ** 2 + (this.st[i].z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    // Refine along the neighbouring segments.
    const p = this.st[best];
    const along = (x - p.x) * p.tx + (z - p.z) * p.tz;
    const u = (x - p.x) * p.tz - (z - p.z) * p.tx;
    return { i: best, s: p.s + along, u, along, d: Math.sqrt(bd) };
  }

  /** Station values interpolated at s. */
  at(s: number): Station {
    const i = stationIndex(this.st, s);
    const a = this.st[i], b = this.st[Math.min(i + 1, this.st.length - 1)];
    const w = b.s > a.s ? clamp((s - a.s) / (b.s - a.s), 0, 1) : 0;
    const tx = lerp(a.tx, b.tx, w), tz = lerp(a.tz, b.tz, w);
    const l = Math.hypot(tx, tz) || 1;
    return {
      s, x: lerp(a.x, b.x, w), z: lerp(a.z, b.z, w), tx: tx / l, tz: tz / l, k: lerp(a.k, b.k, w), y: lerp(a.y, b.y, w),
      e: lerp(a.e, b.e, w), grade: lerp(a.grade, b.grade, w), flags: w < 0.5 ? a.flags : b.flags, ground: lerp(a.ground, b.ground, w),
    };
  }

  /** Carriageway surface height near (x, z) (the plane of the nearest section, extended). */
  surfaceAt(x: number, z: number): number {
    const n = this.nearest(x, z);
    const p = this.at(clamp(n.s, 0, this.length));
    const along = (x - p.x) * p.tx + (z - p.z) * p.tz;
    const u = (x - p.x) * p.tz - (z - p.z) * p.tx;
    return p.y + p.grade * along + crossfall(this.style, p.e, clamp(u, -this.w.pe, this.w.peLeft));
  }

  inGap(s: number, side: -1 | 0 | 1): boolean {
    const bit = side === -1 ? 1 : side === 0 ? 2 : 4;
    for (const g of this.gaps) if (s > g.s0 + 1e-6 && s < g.s1 - 1e-6 && g.mask & bit) return true;
    return false;
  }
}

export interface WaterBody {
  kind: 'river' | 'lake';
  level: number;
  /** River: centre line and width; lake: outline polygon. */
  points: Array<[number, number]>;
  width?: number;
}

export interface BoxSpec {
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
  yaw: number;
  material: number;
  look: 'concrete' | 'steel' | 'container' | 'rock' | 'wood' | 'glass' | 'dark' | 'stripe' | 'none';
  color?: number;
}

/** Upright cylinder (towers, columns, fountain basins, tanks): physics as a prism, drawn round. */
export interface CylinderSpec {
  x: number;
  z: number;
  y0: number; // bottom
  y1: number; // top
  r0: number; // radius at the bottom
  r1?: number; // at the top (default r0): cones and tapered shafts
  material: number; // < 0: visual only
  look: 'concrete' | 'steel' | 'glass' | 'white' | 'stone' | 'dark' | 'grass' | 'tower' | 'none'; // none: physics only
  color?: number;
  sides?: number; // physics prism sides (default 16)
}

/** A fountain: the basin's rim radius and top (the jets, spray and water surface are drawn by MapView). */
export interface FountainSpec {
  x: number;
  z: number;
  y: number; // water surface
  r: number; // basin radius
  jets: number; // ring jets
  height: number; // central jet height [m]
}

export interface BuildingSpec {
  x: number;
  z: number;
  y: number; // base
  w: number; // along the local x (after yaw)
  d: number;
  h: number;
  yaw: number;
  type: number; // 0 glass tower, 1 apartment slab, 2 low-rise, 3 industrial/warehouse, 4 house, 5 shop
  seed: number;
}

export interface PadSpec {
  /** Polygon outline (convex or not), heights from `y(x, z)`. */
  outline: Array<[number, number]>;
  y: (x: number, z: number) => number;
  material: number;
  look: 'asphalt' | 'concrete' | 'paint' | 'none' | 'terrain';
  /** Grid spacing of the surface mesh [m] (four-point outlines: along each side; others: fan rows). */
  grid?: number;
  /** Four-point outlines: spacing along the first side (overrides grid). */
  gridU?: number;
  carve?: boolean;
  /** Raise the terrain under it to its level (ramps and platforms stand on fill). */
  fill?: boolean;
  /** Paint colour (look 'paint'). */
  color?: number;
  /** Paint colour by position (look 'paint'; per triangle, at its centre): stripes. */
  colorAt?: (x: number, z: number) => number;
}

export interface MeshAccum {
  pos: number[];
  idx: number[];
  col?: number[]; // rgb per vertex (painted pads)
  road?: number[]; // vec4 per vertex: u, s, distance to the sub-ribbon end, to its start
  style?: number[]; // vec4: lane width, lanes, median half, pattern + 8·junction flags
  lamp?: number[]; // vec2: spacing, lateral offset
}

export interface RenderTile {
  key: string;
  cx: number;
  cz: number;
  roads: MeshAccum;
  concrete: MeshAccum;
  rails: MeshAccum;
  verges: MeshAccum;
  tunnels: MeshAccum;
  pads: MeshAccum; // asphalt pads (road material, no markings)
  paint: MeshAccum; // painted pads (test pads, µ-split tiles)
}

export interface Signal {
  x: number;
  y: number;
  z: number;
  yaw: number; // the head faces this heading
  group: 0 | 1;
  arm: number; // overhang toward the road [m]
}

export interface Sign {
  x: number;
  y: number;
  z: number;
  yaw: number;
  text: Localized;
  sub?: Localized;
  kind: 'street' | 'highway' | 'place' | 'info';
}

export interface GraphEdge {
  a: string;
  b: string;
  oneWay: boolean;
  length: number;
  road: string;
  xs: Float32Array;
  zs: Float32Array;
  cls: StyleName;
}

export interface MapGraph {
  nodes: Map<string, [number, number]>;
  edges: GraphEdge[];
}

export interface MapRender {
  tiles: RenderTile[];
  boxes: BoxSpec[];
  buildings: BuildingSpec[];
  trees: Float32Array; // x, y, z, scale, type
  lamps: Float32Array; // x, y, z, yaw, height, kind (0 street, 1 highway double, 2 tunnel)
  posts: Float32Array; // guardrail posts: x, y, z, yaw
  signals: Signal[];
  signs: Sign[];
  water: WaterBody[];
  cables: Float32Array; // line segments x0 y0 z0 x1 y1 z1 (bridge stays)
  ropes: Float32Array; // thick cable segments x0 y0 z0 x1 y1 z1 radius (suspension main cables)
  cylinders: CylinderSpec[];
  fountains: FountainSpec[];
  tunnelLights: Float32Array; // x, y, z, yaw
  /** Map drawing of what the route graph leaves out: test tracks (closed loops) and paved areas. */
  lines: Array<{ cls: StyleName; xs: Float32Array; zs: Float32Array; closed: boolean }>;
  areas: Array<{ outline: Array<[number, number]>; look: string }>;
}

export interface MapData {
  id: string;
  name: Localized;
  size: number;
  physics: MapPhysics;
  render: MapRender;
  graph: MapGraph;
  pois: Poi[];
  areas: AreaLabel[];
  terrain: Terrain;
  roads: Road[];
  /** Height of the sea-level fog / horizon ring colour hints. */
  sky: { hazeColor: number; latitude: number };
  /** Parked cars (spawned as lattice bodies by the free-roam mode). */
  parked?: Array<{ x: number; z: number; yaw: number }>;
}

export interface BuilderOptions {
  id: string;
  name: Localized;
  size: number; // [m] square map side, centred on the origin
  cell: number;
  seed: number;
  natural(x: number, z: number): number;
  /** Ground of the draped (city) streets; defaults to `natural`. */
  drape?(x: number, z: number): number;
  /** Terrain material by position, slope (0 flat … 1 vertical) and height. */
  material(x: number, z: number, y: number, slope: number): number;
  latitude?: number;
  hazeColor?: number;
  /** Called once the terrain is final (after the roads cut into it): forests and other scattered props. */
  decorate?(b: MapBuilder): void;
  /** Progress reports (build stage names). */
  onStage?(stage: string): void;
}

const TILE = 512;
const RHO_MARGIN = 0.08; // [m] terrain kept under the ribbons
const EMBANK = 0.65; // cut / fill slope [-]

function newAccum(withRoad = false): MeshAccum {
  return withRoad ? { pos: [], idx: [], road: [], style: [], lamp: [] } : { pos: [], idx: [] };
}

export class MapBuilder {
  readonly terrain: Terrain;
  readonly roads: Road[] = [];
  readonly byId = new Map<string, Road>();
  readonly water: WaterBody[] = [];
  readonly boxes: BoxSpec[] = [];
  readonly buildings: BuildingSpec[] = [];
  readonly cylinders: CylinderSpec[] = [];
  readonly fountains: FountainSpec[] = [];
  readonly pads: PadSpec[] = [];
  readonly pois: Poi[] = [];
  readonly areas: AreaLabel[] = [];
  readonly signs: Sign[] = [];
  readonly treeList: number[] = [];
  readonly extraLamps: number[] = [];
  private readonly tiles = new Map<string, RenderTile>();
  private readonly phys = new Map<string, { origin: [number, number, number]; v: number[]; i: number[]; material: number }>();
  private readonly lamps: number[] = [];
  private readonly posts: number[] = [];
  private readonly signals: Signal[] = [];
  private readonly cables: number[] = [];
  private readonly ropes: number[] = [];
  private readonly tunnelLights: number[] = [];
  private readonly rand: () => number;
  private readonly drapeFn: (x: number, z: number) => number;
  /** Extra lowering / raising constraints (pads, holes) applied with the roads. */
  private readonly graphNodes = new Map<string, [number, number]>();

  constructor(readonly opts: BuilderOptions) {
    const n = Math.round(opts.size / opts.cell);
    this.terrain = new Terrain(-opts.size / 2, -opts.size / 2, opts.cell, n, n);
    this.terrain.fill(opts.natural);
    this.rand = rng(opts.seed);
    this.drapeFn = opts.drape ?? opts.natural;
  }

  random(): number {
    return this.rand();
  }

  /** True when a terrain sample within `r` metres of (x, z) is under or next to a road, pad or junction. */
  nearPaved(x: number, z: number, r: number): boolean {
    let hit = false;
    this.terrain.forSamples(x - r, z - r, x + r, z + r, (idx) => {
      if (this.terrain.locked[idx]) hit = true;
    });
    return hit;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Roads

  addRoad(spec: RoadSpec): Road {
    const road = new Road(spec);
    const style = road.style;
    const dense = splinePolyline(spec.points, !!spec.closed, 1);
    let st = stationsOf(dense, style.drape ? 4 : 2, style.drape ? 10 : 8);
    // Control points → stations.
    road.ctrlS = spec.points.map(([x, z]) => {
      let best = 0, bd = Infinity;
      for (const p of st) {
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bd) {
          bd = d;
          best = p.s;
        }
      }
      return best;
    });
    // T-junction ends: trim to the parent's paved edge (0.4 m into its shoulder).
    const trim = (which: 'start' | 'end', parentId: string) => {
      const parent = this.byId.get(parentId);
      if (!parent) throw new Error(`road ${spec.id}: unknown parent ${parentId}`);
      const order = which === 'start' ? st.map((_, i) => i) : st.map((_, i) => st.length - 1 - i);
      const outside = (i: number) => {
        const n = parent.nearest(st[i].x, st[i].z);
        return Math.abs(n.u) > (n.u >= 0 ? parent.w.peLeft : parent.w.pe) - 0.4 || n.d > parent.w.full + 30;
      };
      // Skip an overshoot beyond the parent, walk through its carriageway, stop at the first point outside.
      let k = 0;
      while (k < order.length && outside(order[k])) k++;
      let prev = -1;
      while (k < order.length && !outside(order[k])) prev = order[k++];
      const cut = k < order.length ? order[k] : -1;
      if (cut < 0 || prev < 0) throw new Error(`road ${spec.id}: its ${which} does not reach ${parentId}`);
      // Interpolate the exact crossing of the edge line between prev (inside) and cut (outside).
      const f = (i: number) => {
        const n = parent.nearest(st[i].x, st[i].z);
        return Math.abs(n.u) - ((n.u >= 0 ? parent.w.peLeft : parent.w.pe) - 0.4);
      };
      const a = f(prev), b = f(cut);
      const w = a / (a - b);
      const sp = lerp(st[prev].s, st[cut].s, w);
      const pEnd = { ...st[prev], s: sp, x: lerp(st[prev].x, st[cut].x, w), z: lerp(st[prev].z, st[cut].z, w) };
      const jn = parent.nearest(pEnd.x, pEnd.z);
      const js = parent.at(clamp(jn.s, 0, parent.length));
      const side = jn.u >= 0 ? 1 : -1;
      // Parent: open its outer parts on that side across the mouth.
      const sin = Math.max(Math.abs(js.tx * pEnd.tz - js.tz * pEnd.tx), 0.35);
      const half = (road.w.pe + 0.5) / sin;
      parent.gaps.push({ s0: jn.s - half, s1: jn.s + half, mask: side < 0 ? 1 : 4 });
      parent.junctionS.push(jn.s);
      const node = this.node(js.x, js.z);
      parent.nodes.push({ s: jn.s, node });
      if (which === 'start') {
        st = st.filter((p) => p.s >= sp);
        st.unshift(pEnd);
        const s0 = st[0].s;
        for (const p of st) p.s -= s0;
        road.ctrlS = road.ctrlS.map((s) => Math.max(s - s0, 0));
        road.startParent = parent;
        road.nodes.push({ s: 0, node, extra: [js.x, js.z] });
      } else {
        st = st.filter((p) => p.s <= sp);
        st.push(pEnd);
        road.endParent = parent;
        road.nodes.push({ s: sp, node, extra: [js.x, js.z] });
      }
    };
    if (spec.start) trim('start', spec.start.join);
    if (spec.end) trim('end', spec.end.join);
    road.st = st;
    const L = road.length;
    // Its own ends are junction-free graph nodes unless joined.
    if (!spec.start) road.nodes.push({ s: 0, node: this.node(st[0].x, st[0].z) });
    if (!spec.end && !spec.closed) road.nodes.push({ s: L, node: this.node(st[st.length - 1].x, st[st.length - 1].z) });
    if (spec.start) road.junctionS.push(0);
    if (spec.end) road.junctionS.push(L);

    // ---- vertical profile
    const n = st.length;
    const ground = new Float64Array(n);
    for (let i = 0; i < n; i++) ground[i] = style.drape ? this.drapeFn(st[i].x, st[i].z) : this.opts.natural(st[i].x, st[i].z);
    for (let i = 0; i < n; i++) st[i].ground = this.opts.natural(st[i].x, st[i].z);
    let y: Float64Array;
    if (style.drape) {
      y = ground;
    } else {
      // Over water the profile aims for the deck height (8 m over the water level).
      const target = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const wl = this.waterLevelAt(st[i].x, st[i].z);
        target[i] = wl !== null && ground[i] < wl + 1 ? Math.max(ground[i], wl + 9) : ground[i];
      }
      y = smoothProfile(st, target, style.smooth, 3);
      const fixed = new Uint8Array(n);
      const pin = (s: number, value: number, radius: number, raiseOnly = false) => {
        bumpProfile(st, y, s, value, radius, raiseOnly);
        const i = stationIndex(st, s);
        fixed[i] = 1;
        if (i + 1 < n) fixed[i + 1] = 1;
      };
      for (const f of spec.fixed ?? []) pin(road.ctrlS[f.at] ?? 0, f.y, f.radius ?? Math.max(style.smooth, 80));
      if (spec.merge) {
        const parent = this.byId.get(spec.merge.road);
        if (!parent) throw new Error(`road ${spec.id}: unknown merge parent ${spec.merge.road}`);
        const atStart = spec.merge.at === 'start';
        if (atStart) {
          road.startParent = parent;
          road.startBlend = spec.merge.length;
        } else {
          road.endParent = parent;
          road.endBlend = spec.merge.length;
        }
        // Heights along the whole merge follow the parent's edge.
        for (let i = 0; i < n; i++) {
          const d = atStart ? st[i].s : L - st[i].s;
          if (d > spec.merge.length) continue;
          y[i] = parent.surfaceAt(st[i].x, st[i].z) - 0.015;
          fixed[i] = 1;
        }
        // Gaps: the parent's outer parts on that side, this road's left outer parts, along the merge.
        const s0 = atStart ? 0 : L - spec.merge.length, s1 = atStart ? spec.merge.length : L;
        const pa = parent.nearest(road.st.length ? st[stationIndex(st, s0)].x : 0, st[stationIndex(st, s0)].z);
        const pb = parent.nearest(st[stationIndex(st, s1)].x, st[stationIndex(st, s1)].z);
        const side = pa.u >= 0 ? 4 : 1;
        parent.gaps.push({ s0: Math.min(pa.s, pb.s) - 25, s1: Math.max(pa.s, pb.s) + 25, mask: side });
        road.gaps.push({ s0: atStart ? -1 : s0, s1: atStart ? s1 + 25 : L + 1, mask: 4 });
        if (atStart) road.gaps[road.gaps.length - 1].s1 = s1 + 25;
        else road.gaps[road.gaps.length - 1].s0 = s0 - 25;
        const node = this.node(atStart ? st[0].x : st[n - 1].x, atStart ? st[0].z : st[n - 1].z);
        parent.nodes.push({ s: atStart ? pa.s : pb.s, node });
      }
      if (spec.continues) {
        const prev = this.byId.get(spec.continues);
        if (prev) pin(0, prev.st[prev.st.length - 1].y, 60);
      }
      if (road.startParent && !spec.merge) pin(0, road.startParent.surfaceAt(st[0].x, st[0].z) - 0.015, 60);
      if (road.endParent && !spec.merge) pin(L, road.endParent.surfaceAt(st[n - 1].x, st[n - 1].z) - 0.015, 60);
      for (const o of spec.over ?? []) {
        const other = this.byId.get(o.road);
        if (!other) continue;
        const hit = crossingOf(road, other);
        if (!hit) continue;
        pin(hit.sa, other.at(hit.sb).y + (o.clearance ?? 7.5), Math.max(style.smooth, 260), true);
      }
      // Tunnels: straight between the portals.
      for (const [a, b] of spec.tunnels ?? []) {
        const s0 = road.ctrlS[a], s1 = road.ctrlS[b];
        for (let i = 0; i < n; i++) if (st[i].s >= s0 && st[i].s <= s1) fixed[i] = 1;
      }
      limitGrade(st, y, style.maxGrade, fixed);
      for (const [a, b] of spec.tunnels ?? []) {
        let s0 = road.ctrlS[a], s1 = road.ctrlS[b];
        // Portals move out until their cutting is at most 14 m deep (at most 400 m).
        const depth = (s: number) => interp(st, ground, s) - interp(st, y, s);
        for (let k = 0; k < 80 && s0 > 20 && depth(s0 - 5) > 14; k++) s0 -= 5;
        for (let k = 0; k < 80 && s1 < L - 20 && depth(s1 + 5) > 14; k++) s1 += 5;
        const y0 = interp(st, y, s0), y1 = interp(st, y, s1);
        for (let i = 0; i < n; i++) {
          if (st[i].s < s0 || st[i].s > s1) continue;
          y[i] = lerp(y0, y1, (st[i].s - s0) / Math.max(s1 - s0, 1));
          st[i].flags |= STATION.tunnel;
          if (st[i].s - s0 < 16 || s1 - st[i].s < 16) st[i].flags |= STATION.portal;
        }
      }
    }
    for (let i = 0; i < n; i++) st[i].y = y[i];
    for (let i = 0; i < n; i++) {
      const a = st[Math.max(i - 1, 0)], b = st[Math.min(i + 1, n - 1)];
      st[i].grade = b.s > a.s ? (b.y - a.y) / (b.s - a.s) : 0;
    }
    // ---- bridges: the deck more than 4.5 m over the ground, or over water; dilated to the abutments, short gaps merged.
    if (!style.drape) {
      const raw = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        if (st[i].flags & STATION.tunnel) continue;
        const wl = this.waterLevelAt(st[i].x, st[i].z);
        if (st[i].y - st[i].ground > 4.5 || (wl !== null && st[i].ground < wl + 0.5)) raw[i] = 1;
      }
      const ranges: Array<[number, number]> = [];
      for (let i = 0; i < n; i++) {
        if (!raw[i]) continue;
        let j = i;
        while (j + 1 < n && raw[j + 1]) j++;
        ranges.push([st[i].s - 10, st[j].s + 10]);
        i = j;
      }
      const merged: Array<[number, number]> = [];
      for (const r of ranges) {
        const last = merged[merged.length - 1];
        if (last && r[0] - last[1] < 40) last[1] = r[1];
        else merged.push([...r]);
      }
      for (const [a, b] of merged) {
        if (b - a < 30) continue;
        for (const p of st) if (p.s >= a && p.s <= b && !(p.flags & STATION.tunnel)) p.flags |= STATION.bridge;
      }
    }
    // ---- superelevation
    if (spec.bank !== undefined) {
      // Curvature of the turns proper: the 85th percentile (spline wiggles at the ends of the straights spike).
      const ks = st.map((p) => Math.abs(p.k)).sort((a, b) => a - b);
      const kmax = ks[Math.floor(ks.length * 0.85)] || 1;
      const raw = new Float64Array(n);
      for (let i = 0; i < n; i++) raw[i] = kmax > 0 ? (spec.bank * st[i].k) / kmax : 0;
      const e = smoothProfile(st, raw, 120, 2);
      for (let i = 0; i < n; i++) st[i].e = clamp(e[i], -Math.abs(spec.bank), Math.abs(spec.bank));
    } else if (!style.drape) {
      superelevation(st, style);
    }
    this.roads.push(road);
    this.byId.set(spec.id, road);
    return road;
  }

  /** Paved area (parking lot, test pad, plaza) with its own surface. */
  addPad(pad: PadSpec): void {
    this.pads.push(pad);
  }

  addBox(b: BoxSpec): void {
    this.boxes.push(b);
  }

  addBuilding(b: BuildingSpec): void {
    this.buildings.push(b);
  }

  addCylinder(c: CylinderSpec): void {
    this.cylinders.push(c);
  }

  /** A fountain in a round basin: the basin is a solid stone drum (a car stops against it), the water and the jets
   *  are drawn on top. */
  addFountain(f: FountainSpec): void {
    this.fountains.push(f);
    // Solid to a car up to the rim; drawn as the pool floor under the water (MapView adds the rim and the water).
    this.addCylinder({ x: f.x, z: f.z, y0: f.y - 1.2, y1: f.y + 0.35, r0: f.r, material: MAT.concrete, look: 'none', sides: 24 });
    this.addCylinder({ x: f.x, z: f.z, y0: f.y - 1.2, y1: f.y - 0.35, r0: f.r - 0.2, material: -1, look: 'dark', color: 0x3c5560 });
    // The tiered centrepiece: a pedestal, a lower bowl, a shaft and an upper bowl.
    this.addCylinder({ x: f.x, z: f.z, y0: f.y - 0.4, y1: f.y + 0.9, r0: f.r * 0.17, r1: f.r * 0.13, material: -1, look: 'stone' });
    this.addCylinder({ x: f.x, z: f.z, y0: f.y + 0.9, y1: f.y + 1.3, r0: f.r * 0.14, r1: f.r * 0.36, material: -1, look: 'stone' });
    this.addCylinder({ x: f.x, z: f.z, y0: f.y + 1.3, y1: f.y + 2.6, r0: f.r * 0.06, material: -1, look: 'stone' });
    this.addCylinder({ x: f.x, z: f.z, y0: f.y + 2.6, y1: f.y + 2.9, r0: f.r * 0.06, r1: f.r * 0.2, material: -1, look: 'stone' });
  }

  addTree(x: number, z: number, scale: number, type: number): void {
    this.treeList.push(x, Number.NaN, z, scale, type);
  }

  addLamp(x: number, y: number, z: number, yaw: number, height = 9, kind = 0): void {
    this.extraLamps.push(x, y, z, yaw, height, kind);
  }

  addSign(s: Sign): void {
    this.signs.push(s);
  }

  waterLevelAt(x: number, z: number): number | null {
    for (const w of this.water) {
      if (w.kind === 'river') {
        const hw = (w.width ?? 100) / 2;
        for (let i = 0; i + 1 < w.points.length; i++) {
          const d = segDist(x, z, w.points[i], w.points[i + 1]);
          if (d < hw) return w.level;
        }
      } else if (pointInPolygon(x, z, w.points)) {
        return w.level;
      }
    }
    return null;
  }

  private node(x: number, z: number): string {
    const id = `${Math.round(x)},${Math.round(z)}`;
    if (!this.graphNodes.has(id)) this.graphNodes.set(id, [x, z]);
    return id;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Build

  /** Build stage timings [ms] (the last build). */
  readonly timings: Record<string, number> = {};

  build(): MapData {
    let t0 = performance.now();
    const lap = (name: string) => {
      const t = performance.now();
      this.timings[name] = t - t0;
      t0 = t;
      this.opts.onStage?.(name);
    };
    this.crossings();
    for (const r of this.roads) this.insertGapStations(r);
    lap('junctions');
    this.embankments();
    lap('embankments');
    const ribbons = this.roads.map((r) => this.sections(r));
    lap('sections');
    this.lowerUnderRibbons(ribbons);
    this.lowerUnderPads();
    this.tunnelHoles();
    lap('lowering');
    this.assignMaterials();
    lap('materials');
    this.opts.decorate?.(this);
    lap('decorate');
    for (let k = 0; k < this.roads.length; k++) this.emitRoad(this.roads[k], ribbons[k]);
    lap('roads');
    for (const pad of this.pads) this.emitPad(pad);
    for (const b of this.boxes) this.emitBox(b);
    for (const b of this.buildings) this.emitBuildingPhysics(b);
    for (const c of this.cylinders) this.emitCylinder(c);
    const trees = new Float32Array(this.treeList.length);
    for (let i = 0; i < this.treeList.length; i += 5) {
      trees[i] = this.treeList[i];
      trees[i + 1] = this.terrain.heightAt(this.treeList[i], this.treeList[i + 2]);
      trees[i + 2] = this.treeList[i + 2];
      trees[i + 3] = this.treeList[i + 3];
      trees[i + 4] = this.treeList[i + 4];
    }
    lap('props');
    const meshes: StaticMeshData[] = [];
    for (const m of this.phys.values()) {
      if (m.i.length === 0) continue;
      meshes.push({ origin: m.origin, vertices: new Float32Array(m.v), indices: new Int32Array(m.i), material: m.material });
    }
    return {
      id: this.opts.id,
      name: this.opts.name,
      size: this.opts.size,
      physics: { heightfield: this.terrain.data(), meshes },
      render: {
        tiles: [...this.tiles.values()],
        boxes: this.boxes,
        buildings: this.buildings,
        trees,
        lamps: new Float32Array([...this.lamps, ...this.extraLamps]),
        posts: new Float32Array(this.posts),
        signals: this.signals,
        signs: this.signs,
        water: this.water,
        cables: new Float32Array(this.cables),
        ropes: new Float32Array(this.ropes),
        cylinders: this.cylinders,
        fountains: this.fountains,
        tunnelLights: new Float32Array(this.tunnelLights),
        lines: this.roads.filter((r) => r.spec.noRoute).map((r) => {
          const xs: number[] = [], zs: number[] = [];
          for (let s = 0; s <= r.length; s += 10) {
            const p = r.at(s);
            xs.push(p.x);
            zs.push(p.z);
          }
          return { cls: r.spec.style, xs: new Float32Array(xs), zs: new Float32Array(zs), closed: !!r.spec.closed };
        }),
        areas: this.pads.filter((p) => polygonArea(p.outline) > 300 && p.look !== 'none').map((p) => ({ outline: p.outline, look: p.look })),
      },
      graph: this.graph(),
      pois: this.pois,
      areas: this.areas,
      terrain: this.terrain,
      roads: this.roads,
      sky: { hazeColor: this.opts.hazeColor ?? 0xb8c6d6, latitude: this.opts.latitude ?? 37.5 },
    };
  }

  /** At-grade crossings between draped roads: both ribbons open, a paved box in between, signals on arterials. */
  private crossings(): void {
    const draped = this.roads.filter((r) => r.style.drape);
    for (let a = 0; a < draped.length; a++) {
      for (let b = a + 1; b < draped.length; b++) {
        const A = draped[a], B = draped[b];
        const hits = crossingsOf(A, B);
        for (const hit of hits) {
          const pa = A.at(hit.sa), pb = B.at(hit.sb);
          const sin = Math.max(Math.abs(pa.tx * pb.tz - pa.tz * pb.tx), 0.3);
          const halfA = B.w.pe / sin, halfB = A.w.pe / sin;
          // Skip crossings at the very end of a road (a T drawn as a crossing).
          A.gaps.push({ s0: hit.sa - halfA, s1: hit.sa + halfA, mask: 7 });
          B.gaps.push({ s0: hit.sb - halfB, s1: hit.sb + halfB, mask: 7 });
          A.junctionS.push(hit.sa - halfA, hit.sa + halfA);
          B.junctionS.push(hit.sb - halfB, hit.sb + halfB);
          const node = this.node(pa.x, pa.z);
          A.nodes.push({ s: hit.sa, node });
          B.nodes.push({ s: hit.sb, node });
          // Paved box: the parallelogram of the two carriageways (+ shoulders).
          const la: [number, number] = [pa.tz, -pa.tx], lb: [number, number] = [pb.tz, -pb.tx];
          const corner = (ua: number, ub: number): [number, number] => {
            // Point with lateral offset ua from A's line and ub from B's line: solve p = pa + α·ta + ua·la with
            // (p − pb)·lb = ub.
            const base: [number, number] = [pa.x + ua * la[0], pa.z + ua * la[1]];
            const alpha = (ub - ((base[0] - pb.x) * lb[0] + (base[1] - pb.z) * lb[1])) / (pa.tx * lb[0] + pa.tz * lb[1]);
            return [base[0] + alpha * pa.tx, base[1] + alpha * pa.tz];
          };
          const c1 = corner(-A.w.pe, -B.w.pe), c2 = corner(A.w.peLeft, -B.w.pe), c3 = corner(A.w.peLeft, B.w.peLeft), c4 = corner(-A.w.pe, B.w.peLeft);
          this.pads.push({ outline: [c1, c2, c3, c4], y: this.drapeFn, material: MAT.asphalt, look: 'asphalt', grid: 6, carve: true });
          if (A.style.pattern === PATTERN.arterial || B.style.pattern === PATTERN.arterial) this.addSignals(A, hit.sa, halfA, B, hit.sb, halfB);
        }
      }
    }
  }

  private addSignals(A: Road, sa: number, halfA: number, B: Road, sb: number, halfB: number): void {
    const place = (R: Road, s: number, half: number, group: 0 | 1) => {
      for (const dir of [1, -1] as const) {
        // Traffic approaching the crossing in direction `dir` along R keeps right: its pole stands on the right kerb
        // before the box, the head over the lanes, facing the traffic.
        const p = R.at(clamp(s - dir * (half + 1.5), 0, R.length));
        const u = -dir * ((dir > 0 ? R.w.pe : R.w.peLeft) + 0.8);
        const x = p.x + u * p.tz, z = p.z - u * p.tx;
        const yaw = Math.atan2(-dir * p.tx, -dir * p.tz);
        this.signals.push({ x, y: this.drapeFn(x, z) + 0.15, z, yaw, group, arm: Math.min(R.style.lanes * R.style.laneWidth, 7) });
      }
    };
    place(A, sa, halfA, 0);
    place(B, sb, halfB, 1);
  }

  /** Adds stations at every gap boundary and junction station so the ribbons end exactly there. */
  private insertGapStations(r: Road): void {
    const cuts = new Set<number>();
    for (const g of r.gaps) {
      cuts.add(g.s0);
      cuts.add(g.s1);
    }
    const L = r.length;
    const add = [...cuts].filter((s) => s > 0.05 && s < L - 0.05).sort((a, b) => a - b);
    if (add.length === 0) return;
    const out: Station[] = [];
    let k = 0;
    for (let i = 0; i < r.st.length; i++) {
      while (k < add.length && add[k] < r.st[i].s - 0.05) {
        if (i > 0 && add[k] > r.st[i - 1].s + 0.05) out.push(r.at(add[k]));
        k++;
      }
      while (k < add.length && Math.abs(add[k] - r.st[i].s) <= 0.05) k++;
      out.push(r.st[i]);
    }
    r.st = out;
  }

  /** Cut and fill (§13.4 절토·성토): the terrain under the at-grade stations of profiled roads is set just under the
   *  road, and the ground beside it is held within an embankment slope of the road's edge. */
  private embankments(): void {
    const t = this.terrain;
    const setUnder = (r: Road) => {
      if (r.style.drape) return;
      const st = r.st;
      const W = r.w.full;
      for (let i = 0; i + 1 < st.length; i++) {
        const a = st[i], b = st[i + 1];
        if ((a.flags | b.flags) & (STATION.bridge | STATION.tunnel)) continue;
        this.forSegmentSamples(a, b, W, (idx, u, w) => {
          const p = w < 0.5 ? a : b;
          const y = lerp(a.y, b.y, w) + crossfall(r.style, p.e, clamp(u, -r.w.pe, r.w.peLeft)) - 0.15;
          t.heights[idx] = y;
          t.locked[idx] = 1;
        });
      }
    };
    const touched = new Uint8Array(t.heights.length);
    const clampBeside = (r: Road) => {
      if (r.style.drape) return;
      const st = r.st;
      const W = r.w.full;
      for (let i = 0; i + 1 < st.length; i++) {
        const a = st[i], b = st[i + 1];
        if ((a.flags | b.flags) & (STATION.bridge | STATION.tunnel)) continue;
        const reach = W + Math.min(Math.abs(a.y - a.ground) / EMBANK + 6, 90);
        this.forSegmentSamples(a, b, reach, (idx, u, w) => {
          if (t.locked[idx]) return;
          const d = Math.abs(u);
          if (d <= W) return;
          const p = w < 0.5 ? a : b;
          const yEdge = lerp(a.y, b.y, w) + crossfall(r.style, p.e, u < 0 ? -r.w.pe : r.w.peLeft);
          const lim = (d - W) * EMBANK;
          const h = clamp(t.heights[idx], yEdge - lim, yEdge + lim);
          if (h !== t.heights[idx]) touched[idx] = 1;
          t.heights[idx] = h;
        });
      }
    };
    for (const r of this.roads) setUnder(r);
    for (const r of this.roads) clampBeside(r);
    // Soften the cut and fill faces (the clamps leave creases one cell wide): four 3 × 3 box passes over the samples
    // they moved and their neighbours, never over the samples under the roads.
    const row = t.nx + 1;
    // Their neighbours too (the crease runs along the edge of the moved region).
    const soft = touched.slice();
    for (let i = row; i < touched.length - row; i++) {
      if (touched[i]) soft[i - 1] = soft[i + 1] = soft[i - row] = soft[i + row] = 1;
    }
    for (let pass = 0; pass < 4; pass++) {
      const src = t.heights.slice();
      for (let i = 0; i < soft.length; i++) {
        if (!soft[i] || t.locked[i]) continue;
        const ix = i % row, iz = (i - ix) / row;
        if (ix === 0 || iz === 0 || ix === t.nx || iz === t.nz) continue;
        let sum = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) sum += src[i + dz * row + dx];
        t.heights[i] = sum / 9;
      }
    }
    // Over tunnels the rock stays at least 7 m above the crown (cut-and-cover where the hill is too thin).
    for (const r of this.roads) {
      for (let i = 0; i + 1 < r.st.length; i++) {
        const a = r.st[i], b = r.st[i + 1];
        if (!(a.flags & b.flags & STATION.tunnel) || (a.flags | b.flags) & STATION.portal) continue;
        this.forSegmentSamples(a, b, r.w.full + 6, (idx, _u, w) => {
          t.heights[idx] = Math.max(t.heights[idx], lerp(a.y, b.y, w) + 7.5);
        });
      }
    }
  }

  /** Calls f for the terrain samples within `reach` of the segment a–b (lateral offset u, position w along it). */
  private forSegmentSamples(a: Station, b: Station, reach: number, f: (idx: number, u: number, w: number) => void): void {
    const t = this.terrain;
    const dx = b.x - a.x, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-9) return;
    const len = Math.sqrt(len2);
    const tx = dx / len, tz = dz / len;
    t.forSamples(Math.min(a.x, b.x) - reach, Math.min(a.z, b.z) - reach, Math.max(a.x, b.x) + reach, Math.max(a.z, b.z) + reach, (idx, x, z) => {
      const w = ((x - a.x) * dx + (z - a.z) * dz) / len2;
      if (w < -0.02 || w > 1.02) return;
      const u = (x - a.x) * tz - (z - a.z) * tx;
      if (Math.abs(u) > reach) return;
      f(idx, u, clamp(w, 0, 1));
    });
  }

  /** World positions of every cross-section point of every station (verge outer points NaN until draped). */
  private sections(r: Road): Float64Array[] {
    const out: Float64Array[] = [];
    for (const p of r.st) {
      const sec = crossSection(r.style, p.e, !!(p.flags & STATION.bridge), !!(p.flags & STATION.tunnel));
      const arr = new Float64Array(sec.length * 3);
      for (let k = 0; k < sec.length; k++) {
        const q = sec[k];
        const x = p.x + q.u * p.tz, z = p.z - q.u * p.tx;
        let y = Number.isNaN(q.dy) ? Number.NaN : r.style.drape ? this.drapeFn(x, z) + (q.dy) : p.y + q.dy;
        // T-junction ends blend into the parent road's surface.
        if (!Number.isNaN(y)) {
          const L = r.length;
          if (r.startParent && p.s < r.startBlend) y = lerp(y, r.startParent.surfaceAt(x, z) - 0.015 + (q.dy - crossfall(r.style, p.e, q.u)), smoothstep(r.startBlend, r.startBlend * 0.3, p.s));
          if (r.endParent && L - p.s < r.endBlend) y = lerp(y, r.endParent.surfaceAt(x, z) - 0.015 + (q.dy - crossfall(r.style, p.e, q.u)), smoothstep(r.endBlend, r.endBlend * 0.3, L - p.s));
          if (r.style.drape && (r.startParent || r.endParent) && (p.s < 0.6 || L - p.s < 0.6)) y -= 0.015;
        }
        arr[k * 3] = x;
        arr[k * 3 + 1] = y;
        arr[k * 3 + 2] = z;
      }
      out.push(arr);
    }
    return out;
  }

  /** Keeps the terrain under every at-grade ribbon triangle: each sample within one cell diagonal of a triangle is
   *  lowered below the triangle's plane (so every terrain triangle under a ribbon stays under it). */
  private lowerUnderRibbons(ribbons: Float64Array[][]): void {
    for (let k = 0; k < this.roads.length; k++) {
      const r = this.roads[k];
      const secs = ribbons[k];
      const sec = crossSection(r.style, 0, false);
      for (let i = 0; i + 1 < r.st.length; i++) {
        const a = r.st[i], b = r.st[i + 1];
        if ((a.flags | b.flags) & (STATION.bridge | STATION.tunnel)) continue;
        const sm = (a.s + b.s) / 2;
        for (let q = 0; q + 1 < sec.length; q++) {
          const kind = sec[q].kind;
          if (sec[q].material < 0 || kind === 'verge' || kind === 'none' || kind === 'kerb' || kind === 'barrier' || kind === 'rail') continue;
          if (r.inGap(sm, sec[q].side)) continue;
          const A = secs[i], B = secs[i + 1];
          if (Number.isNaN(A[q * 3 + 1]) || Number.isNaN(A[q * 3 + 4])) continue;
          this.lowerUnderTriangle(A, q, A, q + 1, B, q + 1);
          this.lowerUnderTriangle(A, q, B, q + 1, B, q);
        }
      }
    }
  }

  private lowerUnderTriangle(P: Float64Array, i: number, Q: Float64Array, j: number, R: Float64Array, k: number): void {
    const ax = P[i * 3], ay = P[i * 3 + 1], az = P[i * 3 + 2];
    const bx = Q[j * 3], by = Q[j * 3 + 1], bz = Q[j * 3 + 2];
    const cx = R[k * 3], cy = R[k * 3 + 1], cz = R[k * 3 + 2];
    this.lowerTri(ax, ay, az, bx, by, bz, cx, cy, cz);
  }

  private lowerTri(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, margin = RHO_MARGIN): void {
    const t = this.terrain;
    // Plane y = p·x + q·z + c.
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (Math.abs(ny) < 1e-9) return;
    const p = -nx / ny, q = -nz / ny, c = ay - p * ax - q * az;
    const rho = t.cell * Math.SQRT2 + 0.05;
    t.forSamples(Math.min(ax, bx, cx) - rho, Math.min(az, bz, cz) - rho, Math.max(ax, bx, cx) + rho, Math.max(az, bz, cz) + rho, (idx, x, z) => {
      if (triDist2(x, z, ax, az, bx, bz, cx, cz) > rho * rho) return;
      const y = p * x + q * z + c - margin;
      if (t.heights[idx] > y) t.heights[idx] = y;
      t.locked[idx] = 1;
    });
  }

  private lowerUnderPads(): void {
    const t = this.terrain;
    for (const pad of this.pads) {
      if (!pad.fill) continue;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of pad.outline) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        z0 = Math.min(z0, z);
        z1 = Math.max(z1, z);
      }
      t.forSamples(x0, z0, x1, z1, (idx, x, z) => {
        if (pointInPolygon(x, z, pad.outline)) {
          t.heights[idx] = pad.y(x, z) - 0.12;
          t.locked[idx] = 1;
        }
      });
    }
    for (const pad of this.pads) {
      if (pad.carve === false) continue;
      for (const [a, b, c] of padTriangles(pad)) {
        this.lowerTri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      }
    }
  }

  /** Portal holes: the terrain surface is removed over the first metres of each tunnel. */
  private tunnelHoles(): void {
    const t = this.terrain;
    for (const r of this.roads) {
      for (let i = 0; i + 1 < r.st.length; i++) {
        const a = r.st[i], b = r.st[i + 1];
        if (!(a.flags & STATION.portal && b.flags & STATION.portal)) continue;
        const half = r.w.full + 1.5;
        const cells: number[] = [];
        const row = t.nx + 1;
        t.forCells(Math.min(a.x, b.x) - half - 2 * t.cell, Math.min(a.z, b.z) - half - 2 * t.cell, Math.max(a.x, b.x) + half + 2 * t.cell, Math.max(a.z, b.z) + half + 2 * t.cell, (cell, x, z) => {
          const dx = b.x - a.x, dz = b.z - a.z;
          const len2 = dx * dx + dz * dz;
          const len = Math.sqrt(len2);
          const w = ((x - a.x) * dx + (z - a.z) * dz) / len2;
          const ext = (2 * t.cell) / len;
          if (w < -0.05 - ext || w > 1.05 + ext) return;
          if (w < -0.05 || w > 1.05) {
            // Just outside the portal: the face cell (rising from the cut floor to the ground above the tunnel) opens
            // too, over the carriageway only; the cut floor and its side slopes never do.
            if (Math.abs(((x - a.x) * dz - (z - a.z) * dx) / len) > half - t.cell) return;
            const ix = cell % t.nx, iz = (cell - ix) / t.nx, i = iz * row + ix;
            const top = Math.max(t.heights[i], t.heights[i + 1], t.heights[i + row], t.heights[i + row + 1]);
            if (top < Math.min(a.y, b.y) + 2.5) return;
          }
          const u = ((x - a.x) * dz - (z - a.z) * dx) / len;
          if (Math.abs(u) < half) cells.push(cell);
        });
        for (const c of cells) t.materials[c] = MAT.hole;
      }
    }
  }

  private assignMaterials(): void {
    const t = this.terrain;
    const row = t.nx + 1;
    for (let iz = 0; iz < t.nz; iz++) {
      for (let ix = 0; ix < t.nx; ix++) {
        const c = iz * t.nx + ix;
        if (t.materials[c] === MAT.hole) continue;
        const i = iz * row + ix;
        const h00 = t.heights[i], h10 = t.heights[i + 1], h01 = t.heights[i + row], h11 = t.heights[i + row + 1];
        const gx = (h10 + h11 - h00 - h01) / (2 * t.cell), gz = (h01 + h11 - h00 - h10) / (2 * t.cell);
        const slope = Math.min(Math.hypot(gx, gz), 3) / 3;
        const x = t.originX + (ix + 0.5) * t.cell, z = t.originZ + (iz + 0.5) * t.cell;
        t.materials[c] = this.opts.material(x, z, (h00 + h11) / 2, slope);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Geometry output

  private tile(x: number, z: number): RenderTile {
    const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
    const key = `${tx},${tz}`;
    let t = this.tiles.get(key);
    if (!t) {
      t = { key, cx: (tx + 0.5) * TILE, cz: (tz + 0.5) * TILE, roads: newAccum(true), concrete: newAccum(), rails: newAccum(), verges: newAccum(), tunnels: newAccum(), pads: newAccum(true), paint: { pos: [], idx: [], col: [] } };
      this.tiles.set(key, t);
    }
    return t;
  }

  /** Adds a physics triangle (world coordinates) to the tile mesh of its material. */
  private physTri(material: number, a: ArrayLike<number>, b: ArrayLike<number>, c: ArrayLike<number>): void {
    const cx = (a[0] + b[0] + c[0]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
    const tx = Math.floor(cx / TILE), tz = Math.floor(cz / TILE);
    const key = `${tx},${tz},${material}`;
    let m = this.phys.get(key);
    if (!m) {
      m = { origin: [(tx + 0.5) * TILE, 0, (tz + 0.5) * TILE], v: [], i: [], material };
      this.phys.set(key, m);
    }
    const base = m.v.length / 3;
    for (const p of [a, b, c]) m.v.push(p[0] - m.origin[0], p[1], p[2] - m.origin[2]);
    m.i.push(base, base + 1, base + 2);
  }

  private emitRoad(r: Road, secs: Float64Array[]): void {
    const st = r.st;
    const secDef = crossSection(r.style, 0, false);
    const t = this.terrain;
    // Drape the verge outer points (after all terrain edits).
    for (const arr of secs) {
      for (let k = 0; k < arr.length / 3; k++) {
        if (Number.isNaN(arr[k * 3 + 1])) arr[k * 3 + 1] = t.heightAt(arr[k * 3], arr[k * 3 + 2]) + 0.03;
      }
    }
    // Sub-ribbon ends (for crosswalks / stop lines): junction stations sorted.
    const js = [...r.junctionS].sort((a, b) => a - b);
    const nextJ = (s: number) => {
      for (const j of js) if (j >= s - 1e-3) return j - s;
      return 1e4;
    };
    const prevJ = (s: number) => {
      let best = 1e4;
      for (const j of js) if (j <= s + 1e-3) best = s - j;
      return best;
    };
    const jflags = (r.style.pattern === PATTERN.arterial || r.style.pattern === PATTERN.street) ? 1 : 0;
    const lampSpacing = r.style.lights ?? 0;
    const lampOff = lampOffset(r.style);
    const secOf = (p: Station) => crossSection(r.style, p.e, !!(p.flags & STATION.bridge), !!(p.flags & STATION.tunnel));
    let secA = secOf(st[0]);
    for (let i = 0; i + 1 < st.length; i++) {
      const a = st[i], b = st[i + 1];
      const secB = secOf(b);
      const sm = (a.s + b.s) / 2;
      const A = secs[i], B = secs[i + 1];
      const bridge = !!((a.flags & b.flags) & STATION.bridge);
      const tunnel = !!((a.flags & b.flags) & STATION.tunnel);
      // A segment takes the look of the section at its "more special" end (bridge walls start with the deck).
      const secSeg = (b.flags & ~a.flags) & (STATION.bridge | STATION.tunnel) ? secB : secA;
      secA = secB;
      if (A.length !== B.length) continue;
      for (let q = 0; q + 1 < A.length / 3; q++) {
        const def = secDef[q];
        const material = secSeg[q].material;
        const kind: SegmentKind = secSeg[q].kind;
        if (material < 0 || kind === 'none') continue;
        if (r.inGap(sm, def.side)) continue;
        const p00 = [A[q * 3], A[q * 3 + 1], A[q * 3 + 2]], p01 = [A[q * 3 + 3], A[q * 3 + 4], A[q * 3 + 5]];
        const p10 = [B[q * 3], B[q * 3 + 1], B[q * 3 + 2]], p11 = [B[q * 3 + 3], B[q * 3 + 4], B[q * 3 + 5]];
        // Winding: points run right → left, stations forward: (A, D, B) and (A, C, D) face "outward".
        this.physTri(material, p00, p11, p01);
        this.physTri(material, p00, p10, p11);
        const tile = this.tile((p00[0] + p11[0]) / 2, (p00[2] + p11[2]) / 2);
        const acc = kind === 'road' ? tile.roads : kind === 'rail' ? tile.rails : kind === 'verge' ? tile.verges : tile.concrete;
        const base = acc.pos.length / 3;
        acc.pos.push(...p00, ...p01, ...p10, ...p11);
        acc.idx.push(base, base + 3, base + 1, base, base + 2, base + 3);
        if (kind === 'road') {
          const uA = secDef[q].u, uB = secDef[q + 1].u;
          const sa = a.s, sb = b.s;
          for (const [u, s] of [[uA, sa], [uB, sa], [uA, sb], [uB, sb]]) {
            acc.road!.push(u, s, nextJ(s), prevJ(s));
            acc.style!.push(r.style.laneWidth, r.style.lanes, (r.style.median ?? 0) / 2 + (r.style.oneWay ? -1 : 0) * 0, r.style.pattern + 8 * (jflags && js.length ? 1 : 0) + (r.style.oneWay ? 16 : 0));
            acc.lamp!.push(tunnel ? 0 : lampSpacing, lampOff);
          }
        }
      }
      if (bridge) this.emitBridgeSegment(r, a, b, A, B);
      if (tunnel) this.emitTunnelSegment(r, a, b);
    }
    this.emitBridgeExtras(r);
    this.emitTunnelPortals(r);
    this.emitRoadProps(r, lampSpacing, lampOff);
  }

  private emitBridgeSegment(r: Road, a: Station, _b: Station, A: Float64Array, B: Float64Array): void {
    // Deck underside and fascias: outermost section points of each side, 1.6 m down.
    const n = A.length / 3;
    const findEdge = (arr: Float64Array, fromLeft: boolean) => {
      // First / last point with a real height (the verge points are absent on bridges: NaN was draped already).
      const k = fromLeft ? n - 1 - (r.style.verge > 0 ? 1 : 0) : r.style.verge > 0 ? 1 : 0;
      return [arr[k * 3], arr[k * 3 + 1], arr[k * 3 + 2]];
    };
    const aR = findEdge(A, false), aL = findEdge(A, true), bR = findEdge(B, false), bL = findEdge(B, true);
    const depth = 1.6;
    const d = (p: number[]) => [p[0], p[1] - depth, p[2]];
    const tile = this.tile(a.x, a.z);
    const quad = (acc: MeshAccum, p0: number[], p1: number[], p2: number[], p3: number[], mat: number) => {
      // p0 p1 at station a, p2 p3 at station b; face per (p0, p3, p1), (p0, p2, p3)
      this.physTri(mat, p0, p3, p1);
      this.physTri(mat, p0, p2, p3);
      const base = acc.pos.length / 3;
      acc.pos.push(...p0, ...p1, ...p2, ...p3);
      acc.idx.push(base, base + 3, base + 1, base, base + 2, base + 3);
    };
    // Underside faces down: run left → right.
    quad(tile.concrete, d(aL), d(aR), d(bL), d(bR), MAT.concrete);
    // Right fascia faces right: bottom → top at the right edge; left fascia: top → bottom at the left edge.
    quad(tile.concrete, d(aR), aR, d(bR), bR, MAT.concrete);
    quad(tile.concrete, aL, d(aL), bL, d(bL), MAT.concrete);
  }

  private emitBridgeExtras(r: Road): void {
    const st = r.st;
    const ranges: Array<[number, number]> = [];
    for (let i = 0; i < st.length; i++) {
      if (!(st[i].flags & STATION.bridge)) continue;
      let j = i;
      while (j + 1 < st.length && st[j + 1].flags & STATION.bridge) j++;
      ranges.push([st[i].s, st[j].s]);
      i = j;
    }
    const halfDeck = r.w.full - r.style.verge;
    for (const [s0, s1] of ranges) {
      const span = s1 - s0;
      const count = Math.max(1, Math.floor(span / 38));
      const pylons = r.spec.landmark && span > 250;
      const hung = r.spec.suspension && span > 250; // no piers under the suspended main span
      for (let k = 1; k < count; k++) {
        const s = s0 + (span * k) / count;
        if (hung && s > s0 + span * 0.18 - 10 && s < s0 + span * 0.82 + 10) continue;
        const p = r.at(s);
        const g = this.terrain.heightAt(p.x, p.z);
        const wl = this.waterLevelAt(p.x, p.z);
        const bottom = Math.min(g, wl ?? g) - 4;
        const top = p.y - 1.6;
        if (top - bottom < 1) continue;
        const yaw = Math.atan2(p.tx, p.tz);
        // Two columns under wide decks, one under narrow ones, and a cross beam.
        const cols = halfDeck > 8 ? [-halfDeck * 0.55, halfDeck * 0.55] : [0];
        for (const u of cols) {
          const x = p.x + u * p.tz, z = p.z - u * p.tx;
          this.boxes.push({ cx: x, cy: (top + bottom) / 2, cz: z, hx: 1.1, hy: (top - bottom) / 2, hz: 1.1, yaw, material: MAT.concrete, look: 'concrete' });
        }
        this.boxes.push({ cx: p.x, cy: top - 0.6, cz: p.z, hx: halfDeck * 0.9, hy: 0.6, hz: 1.0, yaw: yaw + Math.PI / 2, material: MAT.concrete, look: 'concrete' });
      }
      if (hung) {
        this.emitSuspension(r, s0, s1, halfDeck);
        continue;
      }
      if (pylons) {
        for (const f of [1 / 3, 2 / 3]) {
          const s = s0 + span * f;
          const p = r.at(s);
          const yaw = Math.atan2(p.tx, p.tz);
          const g = Math.min(this.terrain.heightAt(p.x, p.z), (this.waterLevelAt(p.x, p.z) ?? 1e9)) - 4;
          const h = 70;
          for (const u of [-(halfDeck + 1.2), halfDeck + 1.2]) {
            const x = p.x + u * p.tz, z = p.z - u * p.tx;
            this.boxes.push({ cx: x, cy: (p.y + h + g) / 2, cz: z, hx: 1.2, hy: (p.y + h - g) / 2, hz: 1.8, yaw, material: MAT.concrete, look: 'concrete', color: 0xd9dde3 });
            // Stay cables fanning to the deck edge, both ways along the bridge.
            for (let c = 1; c <= 9; c++) {
              for (const dir of [-1, 1]) {
                const q = r.at(clamp(s + dir * c * 12, s0, s1));
                const qx = q.x + u * q.tz, qz = q.z - u * q.tx;
                this.cables.push(x, p.y + h - c * 3.2, z, qx, q.y + 1.0, qz);
              }
            }
          }
          this.boxes.push({ cx: p.x, cy: p.y + h - 3, cz: p.z, hx: halfDeck + 2.4, hy: 1.2, hz: 1.4, yaw: yaw + Math.PI / 2, material: MAT.concrete, look: 'none', color: 0xd9dde3 });
        }
      }
    }
  }

  /**
   * Suspension span: two portal towers (legs outside the deck, three cross beams) at 18 % and 82 % of the span, a
   * main cable each side from an anchorage block beyond the ends over the tower saddles, sagging to 3 m over the deck
   * at mid-span (a parabola), vertical hangers every 12 m. Towers and anchorages are solid; cables are drawn only.
   */
  private emitSuspension(r: Road, s0: number, s1: number, halfDeck: number): void {
    const span = s1 - s0;
    const towerS = [s0 + span * 0.18, s0 + span * 0.82];
    const towerH = Math.min(110, Math.max(60, span * 0.13));
    const u0 = halfDeck + 1.6; // cable plane offset from the centre line
    const edgeY = (s: number) => r.at(clamp(s, 0, r.length)).y;
    for (const s of towerS) {
      const p = r.at(s);
      const yaw = Math.atan2(p.tx, p.tz);
      const g = Math.min(this.terrain.heightAt(p.x, p.z), this.waterLevelAt(p.x, p.z) ?? 1e9) - 6;
      const top = p.y + towerH;
      for (const u of [-u0, u0]) {
        const x = p.x + u * p.tz, z = p.z - u * p.tx;
        this.boxes.push({ cx: x, cy: (top + g) / 2, cz: z, hx: 1.6, hy: (top - g) / 2, hz: 2.6, yaw, material: MAT.concrete, look: 'none', color: 0xc9423a });
      }
      for (const h of [towerH * 0.35, towerH * 0.72, towerH - 2]) {
        this.boxes.push({ cx: p.x, cy: p.y + h, cz: p.z, hx: u0 + 1.6, hy: 1.4, hz: 1.6, yaw: yaw + Math.PI / 2, material: MAT.concrete, look: 'none', color: 0xc9423a });
      }
    }
    // Cable: anchorage (60 m beyond each end, 6 m over the ground) → saddle A → sag → saddle B → anchorage.
    const anchorA = Math.max(0, s0 - 60), anchorB = Math.min(r.length, s1 + 60);
    const [sa, sb] = towerS;
    const sagY = (s: number) => {
      // Parabola through both saddles (deck + towerH) with its low point 3 m over the deck at mid-span.
      const m = (sa + sb) / 2, half = (sb - sa) / 2;
      const low = edgeY(m) + 3, high = (edgeY(sa) + edgeY(sb)) / 2 + towerH;
      return low + (high - low) * ((s - m) / half) ** 2;
    };
    const cableY = (s: number): number => {
      if (s <= sa) return lerp(edgeY(anchorA) + 6, edgeY(sa) + towerH, (s - anchorA) / Math.max(sa - anchorA, 1));
      if (s >= sb) return lerp(edgeY(sb) + towerH, edgeY(anchorB) + 6, (s - sb) / Math.max(anchorB - sb, 1));
      return sagY(s);
    };
    for (const u of [-u0, u0]) {
      let prev: number[] | null = null;
      for (let s = anchorA; s <= anchorB + 0.01; s += 6) {
        const p = r.at(Math.min(s, r.length));
        const q = [p.x + u * p.tz, cableY(s), p.z - u * p.tx];
        if (prev) this.ropes.push(prev[0], prev[1], prev[2], q[0], q[1], q[2], 0.45);
        prev = q;
        // Hangers down to the deck edge over the suspended part.
        if (s > sa + 3 && s < sb - 3 && Math.round(s - anchorA) % 12 === 0) this.cables.push(q[0], q[1], q[2], q[0], p.y + 0.9, q[2]);
      }
      for (const s of [anchorA, anchorB]) {
        const p = r.at(s);
        const x = p.x + u * p.tz, z = p.z - u * p.tx;
        const g = this.terrain.heightAt(x, z);
        this.boxes.push({ cx: x, cy: g + 3.5, cz: z, hx: 3, hy: 4.5, hz: 5, yaw: Math.atan2(p.tx, p.tz), material: MAT.concrete, look: 'concrete' });
      }
    }
  }

  private emitTunnelSegment(r: Road, a: Station, b: Station): void {
    // Walls and ceiling, facing inward: left wall bottom → top, ceiling left → right, right wall top → bottom.
    const W = Math.max(r.w.pe, r.w.peLeft) + 0.6;
    const H = 6.4;
    const prof: Array<[number, number]> = [[W, -1.0], [W, 4.6], [W - 1.6, H], [-(W - 1.6), H], [-W, 4.6], [-W, -1.0]];
    const pt = (p: Station, u: number, dy: number) => [p.x + u * p.tz, p.y + dy, p.z - u * p.tx];
    const tile = this.tile(a.x, a.z);
    for (let k = 0; k + 1 < prof.length; k++) {
      const p0 = pt(a, ...prof[k]), p1 = pt(a, ...prof[k + 1]), p2 = pt(b, ...prof[k]), p3 = pt(b, ...prof[k + 1]);
      this.physTri(MAT.concrete, p0, p3, p1);
      this.physTri(MAT.concrete, p0, p2, p3);
      const acc = tile.tunnels;
      const base = acc.pos.length / 3;
      acc.pos.push(...p0, ...p1, ...p2, ...p3);
      acc.idx.push(base, base + 3, base + 1, base, base + 2, base + 3);
    }
    // Ceiling lights every ~12 m.
    if (Math.floor(a.s / 12) !== Math.floor(b.s / 12)) {
      const s = Math.floor(b.s / 12) * 12;
      const p = r.at(s);
      this.tunnelLights.push(p.x, p.y + H - 0.1, p.z, Math.atan2(p.tx, p.tz));
    }
  }

  private emitTunnelPortals(r: Road): void {
    const st = r.st;
    const W = Math.max(r.w.pe, r.w.peLeft) + 0.6;
    for (let i = 0; i + 1 < st.length; i++) {
      const enter = !(st[i].flags & STATION.tunnel) && st[i + 1].flags & STATION.tunnel;
      const leave = st[i].flags & STATION.tunnel && !(st[i + 1].flags & STATION.tunnel);
      if (!enter && !leave) continue;
      const p = enter ? st[i + 1] : st[i];
      const yaw = Math.atan2(p.tx, p.tz);
      const outer = W + 9;
      const top = p.y + 16;
      const bottom = p.y - 1;
      // Two side blocks and a lintel above the opening (6.4 m clear), 1.5 m thick, set 0.75 m into the tunnel.
      const inward = enter ? 0.75 : -0.75;
      const cx = p.x + p.tx * inward, cz = p.z + p.tz * inward;
      for (const side of [-1, 1]) {
        const u = side * (W + outer) / 2;
        this.boxes.push({ cx: cx + u * p.tz, cy: (top + bottom) / 2, cz: cz - u * p.tx, hx: (outer - W) / 2, hy: (top - bottom) / 2, hz: 0.75, yaw, material: MAT.concrete, look: 'concrete', color: 0xa9aca8 });
      }
      this.boxes.push({ cx, cy: (top + p.y + 6.4) / 2, cz, hx: W, hy: (top - p.y - 6.4) / 2, hz: 0.75, yaw, material: MAT.concrete, look: 'stripe', color: 0xa9aca8 });
    }
  }

  private emitRoadProps(r: Road, spacing: number, off: number): void {
    const L = r.length;
    // Street lamps (§13.1 야간 조명): staggered on both sides, or in the median of divided roads.
    if (spacing > 0) {
      for (let s = spacing / 2; s < L; s += spacing / (r.style.medianBarrier ? 1 : 2)) {
        const p = r.at(s);
        if (p.flags & STATION.tunnel) continue;
        const k = Math.round(s / (spacing / 2));
        const side = r.style.medianBarrier ? 0 : k % 2 === 0 ? -1 : 1;
        if (r.inGap(s, side === 0 ? 0 : side) || r.inGap(s, 0)) continue;
        if (this.nearJunction(r, s, 12)) continue;
        const u = side * ((side < 0 ? r.w.pe : r.w.peLeft) + (off - r.w.pe));
        const bridge = !!(p.flags & STATION.bridge);
        const uu = bridge && side !== 0 ? side * ((side < 0 ? r.w.pe : r.w.peLeft) + 0.3) : u;
        const x = p.x + uu * p.tz, z = p.z - uu * p.tx;
        const y = r.style.drape ? this.drapeFn(x, z) + 0.15 : p.y + crossfall(r.style, p.e, clamp(uu, -r.w.pe, r.w.peLeft)) + (bridge ? 1.0 : 0);
        const yaw = side === 0 ? Math.atan2(p.tx, p.tz) : Math.atan2(-side * p.tz, side * p.tx);
        this.lamps.push(x, y, z, yaw, r.style.medianBarrier ? 11 : 9, side === 0 ? 1 : 0);
      }
    }
    // Street trees on the sidewalks.
    const trees = r.style.trees ?? 0;
    if (trees > 0 && r.style.sidewalk) {
      for (let s = trees * 0.5; s < L; s += trees) {
        for (const side of [-1, 1] as const) {
          if (r.inGap(s, side) || r.inGap(s, 0) || this.nearJunction(r, s, 14)) continue;
          const p = r.at(s);
          const u = side * ((side < 0 ? r.w.pe : r.w.peLeft) + r.style.sidewalk - 1.4);
          this.treeList.push(p.x + u * p.tz, Number.NaN, p.z - u * p.tx, 0.8 + 0.3 * hash2(Math.round(s), side, 7), 2);
        }
      }
    }
    // Guardrail posts every 4 m (visual; the rail itself is part of the section).
    if (r.style.barrier === 'guardrail') {
      for (let s = 2; s < L; s += 4) {
        const p = r.at(s);
        if (p.flags & (STATION.bridge | STATION.tunnel)) continue;
        for (const side of [-1, 1] as const) {
          if (r.inGap(s, side)) continue;
          const u = side * ((side < 0 ? r.w.pe : r.w.peLeft) + 0.5);
          const x = p.x + u * p.tz, z = p.z - u * p.tx;
          this.posts.push(x, p.y + crossfall(r.style, p.e, side < 0 ? -r.w.pe : r.w.peLeft), z, Math.atan2(p.tx, p.tz));
        }
      }
    }
  }

  private nearJunction(r: Road, s: number, d: number): boolean {
    for (const j of r.junctionS) if (Math.abs(j - s) < d) return true;
    return false;
  }

  private emitPad(pad: PadSpec): void {
    const tris = padTriangles(pad);
    for (const [a, b, c] of tris) {
      this.physTri(pad.material, a, c, b);
      const tile = this.tile((a[0] + b[0] + c[0]) / 3, (a[2] + b[2] + c[2]) / 3);
      const acc = pad.look === 'asphalt' ? tile.pads : pad.look === 'terrain' ? tile.verges : pad.look === 'paint' ? tile.paint : tile.concrete;
      if (pad.look === 'none') continue;
      const base = acc.pos.length / 3;
      acc.pos.push(...a, ...c, ...b);
      acc.idx.push(base, base + 1, base + 2);
      if (acc.col) {
        const hex = pad.colorAt ? pad.colorAt((a[0] + b[0] + c[0]) / 3, (a[2] + b[2] + c[2]) / 3) : pad.color ?? 0xd8d8d2;
        const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, bb = (hex & 255) / 255;
        acc.col.push(r, g, bb, r, g, bb, r, g, bb);
      }
      if (acc.road) {
        for (const p of [a, c, b]) {
          acc.road.push(p[0], p[2], 1e4, 1e4);
          acc.style!.push(3.5, 1, 0, PATTERN.none);
          acc.lamp!.push(0, 0);
        }
      }
    }
  }

  private emitBox(b: BoxSpec): void {
    if (b.material < 0) return;
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    const corner = (i: number): number[] => {
      const lx = i & 1 ? b.hx : -b.hx, ly = i & 2 ? b.hy : -b.hy, lz = i & 4 ? b.hz : -b.hz;
      return [b.cx + c * lx + s * lz, b.cy + ly, b.cz - s * lx + c * lz];
    };
    const faces = [0, 4, 6, 0, 6, 2, 1, 3, 7, 1, 7, 5, 0, 1, 5, 0, 5, 4, 2, 6, 7, 2, 7, 3, 0, 2, 3, 0, 3, 1, 4, 5, 7, 4, 7, 6];
    for (let f = 0; f < faces.length; f += 3) this.physTri(b.material, corner(faces[f]), corner(faces[f + 1]), corner(faces[f + 2]));
  }

  /** Physics prism of a cylinder: side quads and the top cap (the bottom stands on the ground). */
  private emitCylinder(c: CylinderSpec): void {
    if (c.material < 0) return;
    const n = c.sides ?? 16;
    const r1 = c.r1 ?? c.r0;
    const ring = (y: number, r: number) => Array.from({ length: n }, (_, k) => {
      const a = (k / n) * Math.PI * 2;
      return [c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r];
    });
    const lo = ring(c.y0, c.r0), hi = ring(c.y1, r1);
    const top = [c.x, c.y1, c.z];
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      this.physTri(c.material, lo[k], hi[k1], hi[k]);
      this.physTri(c.material, lo[k], lo[k1], hi[k1]);
      this.physTri(c.material, top, hi[k], hi[k1]);
    }
  }

  private emitBuildingPhysics(b: BuildingSpec): void {
    this.emitBox({ cx: b.x, cy: b.y + b.h / 2 - 1, cz: b.z, hx: b.w / 2, hy: b.h / 2 + 1, hz: b.d / 2, yaw: b.yaw, material: MAT.concrete, look: 'none' });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Route graph (§13.1 웨이포인트 경로 안내)

  private graph(): MapGraph {
    const edges: GraphEdge[] = [];
    for (const r of this.roads) {
      if (r.spec.noRoute) continue;
      const nodes = [...r.nodes].sort((a, b) => a.s - b.s);
      // Closed loops: the first node again at the end.
      if (r.spec.closed && nodes.length) nodes.push({ ...nodes[0], s: r.length });
      for (let k = 0; k + 1 < nodes.length; k++) {
        const na = nodes[k], nb = nodes[k + 1];
        if (nb.s - na.s < 0.5 && na.node === nb.node) continue;
        const xs: number[] = [], zs: number[] = [];
        if (na.extra) {
          xs.push(na.extra[0]);
          zs.push(na.extra[1]);
        }
        const step = Math.max(8, (nb.s - na.s) / 200);
        for (let s = na.s; s < nb.s; s += step) {
          const p = r.at(s);
          xs.push(p.x);
          zs.push(p.z);
        }
        const pe = r.at(nb.s);
        xs.push(pe.x);
        zs.push(pe.z);
        if (nb.extra) {
          xs.push(nb.extra[0]);
          zs.push(nb.extra[1]);
        }
        edges.push({ a: na.node, b: nb.node, oneWay: !!r.spec.oneWayRoute, length: nb.s - na.s, road: r.spec.id, xs: new Float32Array(xs), zs: new Float32Array(zs), cls: r.spec.style });
      }
    }
    return { nodes: this.graphNodes, edges };
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Geometry helpers

/** The point of a built road's centre line nearest to (x, z). */
export function onRoad(r: Road, x: number, z: number): [number, number] {
  const n = r.nearest(x, z);
  const p = r.at(clamp(n.s, 0, r.length));
  return [p.x, p.z];
}

/** Points along a built road at lateral offset u (left positive), from station s0 to s1 (either direction). */
export function offsetPoints(r: Road, s0: number, s1: number, u: number, count: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 0; k < count; k++) {
    const p = r.at(clamp(lerp(s0, s1, k / Math.max(count - 1, 1)), 0, r.length));
    out.push([p.x + u * p.tz, p.z - u * p.tx]);
  }
  return out;
}

function segDist(x: number, z: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const w = l2 > 0 ? clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1) : 0;
  return Math.hypot(x - a[0] - dx * w, z - a[1] - dz * w);
}

function polygonArea(p: Array<[number, number]>): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
  return Math.abs(a) / 2;
}

export function pointInPolygon(x: number, z: number, poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Squared plan distance from (x, z) to the triangle. */
function triDist2(x: number, z: number, ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const s1 = (bx - ax) * (z - az) - (bz - az) * (x - ax);
  const s2 = (cx - bx) * (z - bz) - (cz - bz) * (x - bx);
  const s3 = (ax - cx) * (z - cz) - (az - cz) * (x - cx);
  if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) return 0;
  const d = (px: number, pz: number, qx: number, qz: number) => {
    const dx = qx - px, dz = qz - pz;
    const l2 = dx * dx + dz * dz;
    const w = l2 > 0 ? clamp(((x - px) * dx + (z - pz) * dz) / l2, 0, 1) : 0;
    const ex = x - px - dx * w, ez = z - pz - dz * w;
    return ex * ex + ez * ez;
  };
  return Math.min(d(ax, az, bx, bz), d(bx, bz, cx, cz), d(cx, cz, ax, az));
}

/** Plan crossings of two roads' centre lines (station on each). */
export function crossingsOf(a: Road, b: Road): Array<{ sa: number; sb: number }> {
  const out: Array<{ sa: number; sb: number }> = [];
  // Coarse bounding boxes per 16 stations keep this fast for long roads.
  const chunk = 16;
  const boxes = (r: Road) => {
    const res: Array<[number, number, number, number, number, number]> = [];
    for (let i = 0; i < r.st.length - 1; i += chunk) {
      const j = Math.min(i + chunk, r.st.length - 1);
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let k = i; k <= j; k++) {
        x0 = Math.min(x0, r.st[k].x);
        x1 = Math.max(x1, r.st[k].x);
        z0 = Math.min(z0, r.st[k].z);
        z1 = Math.max(z1, r.st[k].z);
      }
      res.push([i, j, x0, z0, x1, z1]);
    }
    return res;
  };
  const ba = boxes(a), bb = boxes(b);
  for (const [i0, i1, ax0, az0, ax1, az1] of ba) {
    for (const [j0, j1, bx0, bz0, bx1, bz1] of bb) {
      if (ax1 < bx0 || bx1 < ax0 || az1 < bz0 || bz1 < az0) continue;
      for (let i = i0; i < i1; i++) {
        const p = a.st[i], q = a.st[i + 1];
        for (let j = j0; j < j1; j++) {
          const r = b.st[j], s = b.st[j + 1];
          const d = (q.x - p.x) * (s.z - r.z) - (q.z - p.z) * (s.x - r.x);
          if (Math.abs(d) < 1e-9) continue;
          const u = ((r.x - p.x) * (s.z - r.z) - (r.z - p.z) * (s.x - r.x)) / d;
          const v = ((r.x - p.x) * (q.z - p.z) - (r.z - p.z) * (q.x - p.x)) / d;
          if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
          out.push({ sa: lerp(p.s, q.s, u), sb: lerp(r.s, s.s, v) });
        }
      }
    }
  }
  // Ends of roads touching are T-junctions, not crossings.
  return out.filter((h) => h.sa > 2 && h.sa < a.length - 2 && h.sb > 2 && h.sb < b.length - 2);
}

export function crossingOf(a: Road, b: Road): { sa: number; sb: number } | null {
  return crossingsOf(a, b)[0] ?? null;
}

/** Triangulated pad surface (a grid clipped to the outline; ear-free: cells fully inside, fan for the border). */
export function padTriangles(pad: PadSpec): Array<[number[], number[], number[]]> {
  const out: Array<[number[], number[], number[]]> = [];
  const poly = pad.outline;
  if (poly.length === 4) {
    // Bilinear grid between the four corners (long strips stay cheap: spacing per side).
    const [p0, p1, p2, p3] = poly;
    const lu = Math.max(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), Math.hypot(p2[0] - p3[0], p2[1] - p3[1]));
    const lv = Math.max(Math.hypot(p3[0] - p0[0], p3[1] - p0[1]), Math.hypot(p2[0] - p1[0], p2[1] - p1[1]));
    const nu = Math.max(1, Math.ceil(lu / (pad.gridU ?? pad.grid ?? 8))), nv = Math.max(1, Math.ceil(lv / (pad.grid ?? 8)));
    const at = (i: number, j: number) => {
      const u = i / nu, v = j / nv;
      const x = (1 - u) * (1 - v) * p0[0] + u * (1 - v) * p1[0] + u * v * p2[0] + (1 - u) * v * p3[0];
      const z = (1 - u) * (1 - v) * p0[1] + u * (1 - v) * p1[1] + u * v * p2[1] + (1 - u) * v * p3[1];
      return [x, pad.y(x, z), z];
    };
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        out.push(orientUp(at(i, j), at(i + 1, j), at(i + 1, j + 1)));
        out.push(orientUp(at(i, j), at(i + 1, j + 1), at(i, j + 1)));
      }
    }
    return out;
  }
  // Convex outlines: fan triangulation subdivided on a grid for heights.
  const g = pad.grid ?? 8;
  let cx = 0, cz = 0;
  for (const [x, z] of poly) {
    cx += x;
    cz += z;
  }
  cx /= poly.length;
  cz /= poly.length;
  const P = (x: number, z: number) => [x, pad.y(x, z), z];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const n = Math.max(1, Math.ceil(Math.max(Math.hypot(a[0] - cx, a[1] - cz), Math.hypot(b[0] - cx, b[1] - cz), Math.hypot(b[0] - a[0], b[1] - a[1])) / g));
    // Subdivided triangle (c, a, b): rows from the centre outward.
    const pt = (r: number, k: number) => {
      // r rows from the centre (0 … n), k along the row (0 … r)
      if (r === 0) return P(cx, cz);
      const ex = lerp(cx, a[0], r / n), ez = lerp(cz, a[1], r / n);
      const fx = lerp(cx, b[0], r / n), fz = lerp(cz, b[1], r / n);
      return P(lerp(ex, fx, k / r), lerp(ez, fz, k / r));
    };
    for (let r = 0; r < n; r++) {
      for (let k = 0; k <= r; k++) {
        out.push(orientUp(pt(r, k), pt(r + 1, k), pt(r + 1, k + 1)));
        if (k < r) out.push(orientUp(pt(r, k), pt(r + 1, k + 1), pt(r, k + 1)));
      }
    }
  }
  return out;
}

/** Orders a triangle so that (a, b, c) → used as (a, c, b) by emitPad faces up. */
function orientUp(a: number[], b: number[], c: number[]): [number[], number[], number[]] {
  // emitPad uses (a, c, b): make cross(c − a, b − a) point up.
  const ux = c[0] - a[0], uz = c[2] - a[2], vx = b[0] - a[0], vz = b[2] - a[2];
  const ny = uz * vx - ux * vz;
  return ny >= 0 ? [a, b, c] : [a, c, b];
}

export { MAT };

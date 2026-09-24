// Glass and lamp damage on the flexbody (§4.3): the core's damage groups (core/src/beams.cpp updateDamageGroups)
// decide *when* a pane or lamp is damaged — its frame bent permanently, or struck; this module decides how it looks.
//   laminated glass (windscreen): a spider-web crack grows from the first damage; a badly bent frame lets it sag
//   tempered glass (side, rear): shatters into granules (side-effect particles, §3) and leaves an empty frame
//   lamp: the lens breaks (holes, fragments) and the light goes out
// Pieces of the GLB's glass and lamp primitives are matched to groups by their area-weighted centroids, which the
// vehicle generator wrote into each group's "visual" block (tools/vehicle-gen/lib/glb.mjs connectedPieces).

export type V3 = [number, number, number];

export interface DamageGroupVisual {
  kind: 'glass' | 'lamp' | 'component';
  glass?: 'laminated' | 'tempered';
  pieces?: V3[]; // glass, lamp: area-weighted centroids of the GLB pieces of this group (model frame)
  fluid?: 'coolant' | 'oil' | 'fuel'; // component: what leaks from it (Leaks.ts)
  at?: V3;       // component: where (model frame)
}

export interface DamageGroupDef {
  id: string;
  visual?: DamageGroupVisual;
}

/** One group's state as the core reports it (sbc_body_damage_groups: 8 floats per group). */
export interface DamageStatus {
  beams: number;
  damaged: number;
  time: number; // [s] of the first damage, −1 while intact
  nodeA: number;
  nodeB: number; // == nodeA: the first damage was an impact on that node
  peakStrain: number;
  impacts: number;
  peakImpact: number; // [N]
}

export const DAMAGE_FLOATS = 8;

export function decodeDamage(f: ArrayLike<number>): DamageStatus[] {
  const out: DamageStatus[] = [];
  for (let o = 0; o + DAMAGE_FLOATS <= f.length; o += DAMAGE_FLOATS) {
    out.push({ beams: f[o], damaged: f[o + 1], time: f[o + 2], nodeA: f[o + 3], nodeB: f[o + 4], peakStrain: f[o + 5], impacts: f[o + 6], peakImpact: f[o + 7] });
  }
  return out;
}

export const enum PanelState {
  Intact = 0,
  Cracked = 1, // laminated glass: cracked, holds together
  Broken = 2,  // tempered glass shattered / lamp lens broken
}

export interface PanelLook {
  state: PanelState;
  crackRadius: number; // [m] extent of the crack pattern around its origin
  sag: number;         // [m] how far the middle of a laminated pane sags inward
}

/** How a damaged group looks. Laminated glass cracks wider the more of its frame is bent (and the more often it was
 *  struck) and sags once a quarter of its frame beams are bent; the rest break at the first damage. */
export function panelLook(def: DamageGroupDef, s: DamageStatus | undefined): PanelLook {
  const intact: PanelLook = { state: PanelState.Intact, crackRadius: 0, sag: 0 };
  if (!def.visual || def.visual.kind === 'component' || !s || (s.damaged <= 0 && s.impacts <= 0)) return intact;
  if (def.visual.kind === 'glass' && def.visual.glass === 'laminated') {
    const bent = s.beams > 0 ? s.damaged / s.beams : 0;
    return {
      state: PanelState.Cracked,
      crackRadius: Math.min(0.14 + 1.4 * bent + 0.12 * Math.min(s.impacts, 4), 1.6),
      sag: bent > 0.25 ? Math.min(0.12, 0.3 * (bent - 0.25)) : 0,
    };
  }
  return { state: PanelState.Broken, crackRadius: 0, sag: 0 };
}

/**
 * Connected pieces of a triangle mesh: triangles sharing a vertex, or a vertex position to 1 mm (the same rule as the
 * generator). Returns each triangle's piece and each piece's area-weighted centroid and area.
 */
export function splitPieces(pos: ArrayLike<number>, index: ArrayLike<number> | null): { triPiece: Int32Array; centroids: V3[]; areas: number[] } {
  const nv = pos.length / 3;
  const tris = index ? index.length / 3 : nv / 3;
  const vi = (t: number, k: number) => (index ? index[t * 3 + k] : t * 3 + k);
  const parent = new Int32Array(nv).map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  const join = (a: number, b: number) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent[a] = b;
  };
  const at = new Map<string, number>();
  for (let i = 0; i < nv; i++) {
    const key = `${Math.round(pos[i * 3] * 1000)},${Math.round(pos[i * 3 + 1] * 1000)},${Math.round(pos[i * 3 + 2] * 1000)}`;
    const j = at.get(key);
    if (j === undefined) at.set(key, i);
    else join(i, j);
  }
  for (let t = 0; t < tris; t++) {
    join(vi(t, 0), vi(t, 1));
    join(vi(t, 0), vi(t, 2));
  }
  const pieceOf = new Map<number, number>();
  const triPiece = new Int32Array(tris);
  const sums: number[][] = [];
  for (let t = 0; t < tris; t++) {
    const r = find(vi(t, 0));
    let p = pieceOf.get(r);
    if (p === undefined) {
      p = sums.length;
      pieceOf.set(r, p);
      sums.push([0, 0, 0, 0]);
    }
    triPiece[t] = p;
    const P = (k: number): V3 => {
      const i = vi(t, k);
      return [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    };
    const [a, b, c] = [P(0), P(1), P(2)];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const area = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
    const s = sums[p];
    for (let k = 0; k < 3; k++) s[k] += ((a[k] + b[k] + c[k]) / 3) * area;
    s[3] += area;
  }
  return {
    triPiece,
    centroids: sums.map((s) => (s[3] > 0 ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : [0, 0, 0]) as V3),
    areas: sums.map((s) => s[3]),
  };
}

/** Group index of each piece (−1: none) by nearest listed centroid within `tolerance` [m], among groups of `kind`. */
export function matchPieces(centroids: V3[], defs: DamageGroupDef[], kind: 'glass' | 'lamp', tolerance = 0.02): number[] {
  return centroids.map((c) => {
    let best = -1, bestD = tolerance;
    defs.forEach((d, g) => {
      if (d.visual?.kind !== kind) return;
      for (const p of d.visual.pieces ?? []) {
        const dist = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
        if (dist < bestD) {
          bestD = dist;
          best = g;
        }
      }
    });
    return best;
  });
}

/**
 * Normalised distance of every vertex of a piece set from the pieces' open boundary (0 on the rim, 1 at the point
 * farthest inside): the sag profile of a laminated pane. Boundary = vertices of edges used by one triangle only
 * (positions merged to 1 mm so the two shells' seams are not rims).
 */
export function rimDistance(pos: ArrayLike<number>, index: ArrayLike<number> | null, triPiece: Int32Array, pieces: Set<number>): Float32Array {
  const nv = pos.length / 3;
  const tris = triPiece.length;
  const vi = (t: number, k: number) => (index ? index[t * 3 + k] : t * 3 + k);
  const key = (i: number) => `${Math.round(pos[i * 3] * 1000)},${Math.round(pos[i * 3 + 1] * 1000)},${Math.round(pos[i * 3 + 2] * 1000)}`;
  const edges = new Map<string, number>();
  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (let t = 0; t < tris; t++) {
    if (!pieces.has(triPiece[t])) continue;
    for (let k = 0; k < 3; k++) {
      const e = edgeKey(key(vi(t, k)), key(vi(t, (k + 1) % 3)));
      edges.set(e, (edges.get(e) ?? 0) + 1);
    }
  }
  const rim: V3[] = [];
  for (const [e, n] of edges) {
    if (n !== 1) continue;
    for (const v of e.split('|')) rim.push(v.split(',').map((x) => Number(x) / 1000) as V3);
  }
  const out = new Float32Array(nv);
  const inPiece = new Uint8Array(nv);
  for (let t = 0; t < tris; t++) if (pieces.has(triPiece[t])) for (let k = 0; k < 3; k++) inPiece[vi(t, k)] = 1;
  let max = 0;
  for (let i = 0; i < nv; i++) {
    if (!inPiece[i]) continue;
    let d = Infinity;
    for (const r of rim) d = Math.min(d, Math.hypot(pos[i * 3] - r[0], pos[i * 3 + 1] - r[1], pos[i * 3 + 2] - r[2]));
    out[i] = rim.length ? d : 0;
    max = Math.max(max, out[i]);
  }
  if (max > 0) for (let i = 0; i < nv; i++) out[i] /= max;
  return out;
}

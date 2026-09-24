import { describe, expect, it } from 'vitest';
import { bindVertex, deformVertex, latticeCage, nodeFrame, relativeRotation, restFrame, type NodePose, type VehicleJsonNode } from './Flexbody';

type V3 = [number, number, number];

// A 3 × 2 × 3 lattice, 0.25 m pitch, lattice index i growing toward −x (as the Porsche generator's does).
function lattice(): VehicleJsonNode[] {
  const nodes: VehicleJsonNode[] = [['hub', 5, 5, 5]]; // a non-lattice node first: indices are JSON positions
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 3; k++) nodes.push([`c${i}_${j}_${k}`, -0.25 * i, 0.25 * j + 0.3, 0.25 * k]);
  return nodes;
}

const nodes = lattice();
const cage = latticeCage(nodes);
const rest = (node: number): V3 => [nodes[node][1], nodes[node][2], nodes[node][3]];
const restFrames = cage.map((c) => restFrame(c, rest));

/** Cage poses after moving every node with `map` (frames from the moved neighbours, as Flexbody.update builds them). */
function posesUnder(map: (p: V3) => V3): NodePose[] {
  return cage.map((c, k) => {
    const at = (node: number) => map(rest(node));
    const f = nodeFrame(at(c.index), at(c.x[0].node), at(c.z[0].node), c.x[0].sign, c.z[0].sign)!;
    return { p: at(c.index), M: relativeRotation(f, restFrames[k]), P: c.rest };
  });
}

// Rigid motion: rotation about an arbitrary axis plus a translation.
function rigid(p: V3): V3 {
  const [ax, ay, az] = [0.3, 0.8, -0.52];
  const n = Math.hypot(ax, ay, az), [ux, uy, uz] = [ax / n, ay / n, az / n];
  const a = 0.7, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  const [x, y, z] = p;
  return [
    (t * ux * ux + c) * x + (t * ux * uy - s * uz) * y + (t * ux * uz + s * uy) * z + 3,
    (t * ux * uy + s * uz) * x + (t * uy * uy + c) * y + (t * uy * uz - s * ux) * z - 1,
    (t * ux * uz - s * uy) * x + (t * uy * uz + s * ux) * y + (t * uz * uz + c) * z + 250,
  ];
}

// A crumple: the front (large z) is pushed back and bent down, the sides bulge.
const crumple = (p: V3): V3 => [p[0] * (1 + 0.4 * p[2]), p[1] - 0.3 * p[2] * p[2], p[2] * (1 - 0.35 * p[2]) + 0.05 * p[1]];

const unit = (v: V3): V3 => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const samples: V3[] = [[0.1, 0.62, 0.4], [-0.61, 0.2, -0.1], [-0.3, 0.45, 0.33], [-0.2, 0.37, 0.12]];
const n0: V3 = unit([0.2, 0.6, 0.8]);

describe('flexbody binding', () => {
  it('takes the lattice nodes with their JSON index and neighbour signs', () => {
    expect(cage.length).toBe(18);
    const c = cage.find((n) => n.index === 1)!; // c0_0_0 at x = 0: its +i neighbour lies toward −x
    expect(c.x[0]).toEqual({ node: 1 + 6, sign: -1 });
    expect(c.z[0]).toEqual({ node: 2, sign: 1 });
  });

  it('has weights summing to 1 and weight gradients summing to 0', () => {
    for (const v of samples) {
      const b = bindVertex(v, cage);
      expect(b.weights.reduce((a, w) => a + w, 0)).toBeCloseTo(1, 12);
      for (let j = 0; j < 3; j++) expect(b.gradients.reduce((a, g) => a + g[j], 0)).toBeCloseTo(0, 9);
    }
  });

  it('reproduces the rest shape exactly and follows rigid motion with its normals', () => {
    const atRest = posesUnder((p) => p);
    const moved = posesUnder(rigid);
    for (const v of samples) {
      const b = bindVertex(v, cage);
      const r = deformVertex(b, v, n0, atRest);
      r.position.forEach((x, i) => expect(x).toBeCloseTo(v[i], 10));
      unit(r.normal).forEach((x, i) => expect(x).toBeCloseTo(n0[i], 10));
      const m = deformVertex(b, v, n0, moved);
      const expected = rigid(v), o = rigid([0, 0, 0]), rn = rigid(n0).map((x, i) => x - o[i]);
      m.position.forEach((x, i) => expect(x).toBeCloseTo(expected[i], 9));
      unit(m.normal).forEach((x, i) => expect(x).toBeCloseTo(rn[i], 9));
    }
  });

  it('recomputes the normal of the deformed surface (cofactor of the true Jacobian)', () => {
    const poses = posesUnder(crumple);
    for (const v of samples) {
      const b = bindVertex(v, cage);
      // Finite-difference Jacobian of X ↦ x(X) (same K nearest nodes around the sample).
      const h = 1e-5;
      const F = [0, 1, 2].map((j) => {
        const e: V3 = [0, 0, 0];
        e[j] = h;
        const plus: V3 = [v[0] + e[0], v[1] + e[1], v[2] + e[2]], minus: V3 = [v[0] - e[0], v[1] - e[1], v[2] - e[2]];
        const bp = bindVertex(plus, cage), bm = bindVertex(minus, cage);
        const set = (ns: number[]) => [...ns].sort((a, c) => a - c);
        expect(set(bp.nodes)).toEqual(set(b.nodes));
        expect(set(bm.nodes)).toEqual(set(b.nodes));
        const xp = deformVertex(bp, plus, n0, poses).position, xm = deformVertex(bm, minus, n0, poses).position;
        return [0, 1, 2].map((i) => (xp[i] - xm[i]) / (2 * h)) as V3;
      });
      const cross = (a: V3, c: V3): V3 => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];
      const [c0, c1, c2] = [cross(F[1], F[2]), cross(F[2], F[0]), cross(F[0], F[1])];
      const numeric = unit([0, 1, 2].map((i) => c0[i] * n0[0] + c1[i] * n0[1] + c2[i] * n0[2]) as V3);
      const analytic = unit(deformVertex(b, v, n0, poses).normal);
      analytic.forEach((x, i) => expect(x).toBeCloseTo(numeric[i], 6));
      // …and the deformation really turned it (this is not the rest normal carried along).
      expect(Math.abs(analytic[0] * n0[0] + analytic[1] * n0[1] + analytic[2] * n0[2])).toBeLessThan(0.999);
    }
  });

  it('lets a vertex follow only the nodes of its own piece when the cage tears', () => {
    const v: V3 = [-0.12, 0.3, 0.13];
    const b = bindVertex(v, cage);
    const nearest = b.nodes[0];
    // Every other node flies off 2 m with a torn-off part; the vertex stays with its nearest node.
    const poses = posesUnder((p) => p).map((pose, k) => (k === nearest ? pose : { ...pose, p: [pose.p[0], pose.p[1] + 2, pose.p[2]] as V3 }));
    const pieces = cage.map((_, k) => (k === nearest ? 0 : 7));
    const d = deformVertex(b, v, n0, poses, pieces);
    d.position.forEach((x, i) => expect(x).toBeCloseTo(v[i], 10));
    unit(d.normal).forEach((x, i) => expect(x).toBeCloseTo(n0[i], 10));
  });

  it('refuses a degenerate frame (neighbour crushed onto the node or onto one line)', () => {
    expect(nodeFrame([0, 0, 0], [0, 0, 0], [0, 0, 1], 1, 1)).toBeNull();
    expect(nodeFrame([0, 0, 0], [1, 0, 0], [2, 0, 0], 1, 1)).toBeNull();
  });
});

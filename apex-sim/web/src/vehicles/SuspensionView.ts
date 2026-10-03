// Suspension x-ray (투시): the car's suspension drawn from its physics nodes while the body is a glass shell —
// wishbones and links, the knuckles that carry the hubs, tie rods and toe links, the anti-roll bars, the subframes,
// and each corner's coil-over: a coil that shortens and lengthens with its spring beam (its colour from extended,
// cyan, through static, white, to compressed, orange) around a damper whose rod slides in its body — or, on air
// suspension (the Ghost, the Maybach), a rubber air spring: a convoluted bellows rolling over its piston, coloured the
// same way. Everything follows the same interpolated node positions the rest of the car is drawn with, so what moves
// is what the physics moves.
import * as THREE from 'three/webgpu';
import type { RenderFrame } from '../physics/PhysicsClient';
import type { NodeLocator } from './Flexbody';

/** The suspension members of a vehicle document (node indices into the vehicle body). */
export interface SuspensionDef {
  links: Array<{ a: number; b: number; kind: SuspensionPart }>;
  springs: Array<{ top: number; bottom: number; corner: string; ratio: number }>;
  /** Each wheel carrier's nodes (hub bearings, ball joints, steering arm): drawn as one solid casting. */
  knuckles: number[][];
  /** Air springs (the chassis data's gas law) instead of coils. */
  air: boolean;
}

export type SuspensionPart = 'arm' | 'steer' | 'bar' | 'subframe';

/** "FL_laf" → ["FL", "laf"]. */
const corner = (id: string): [string, string] => {
  const k = id.indexOf('_');
  return k > 0 ? [id.slice(0, k), id.slice(k + 1)] : ['', id];
};
const MIRROR: Record<string, string> = { FL: 'FR', FR: 'FL', RL: 'RR', RR: 'RL' };

/** Subframe members a real cradle has: cross-members between a pivot and its mirror image (the steering rack among
 *  them) and the rail between an arm's front and rear pivots. The generator's bracing truss between them is not
 *  drawn (it read as scaffolding). */
function cradleMember(na: string, nb: string): boolean {
  const [ca, pa] = corner(na), [cb, pb] = corner(nb);
  if (pa === pb && MIRROR[ca] === cb) return true;
  const pair = [pa, pb].sort().join('+');
  return ca === cb && (pair === 'laf+lar' || pair === 'uaf+uar');
}

type BeamRow = [string, string, string, ...unknown[]];

/** Reads the suspension out of the document's beam groups, torsion bars and chassis corners (null: none). */
export function suspensionOf(doc: {
  beams?: BeamRow[];
  torsionBars?: Array<{ arm1: string; pivot1: string; pivot2: string; arm2: string }>;
  vehicle?: { chassis?: { corners?: Array<{ chassis: string; wheel: string; motionRatio?: number }>; airPolytropic?: number }; wheels?: Array<{ carrier?: string[] }> };
}, index: (id: string) => number): SuspensionDef | null {
  const kinds: Record<string, SuspensionPart> = { link: 'arm', tierod: 'steer', toelink: 'steer', subframe: 'subframe' };
  const links: SuspensionDef['links'] = [];
  const springs: SuspensionDef['springs'] = [];
  const ratios = new Map<string, number>();
  for (const c of doc.vehicle?.chassis?.corners ?? []) ratios.set(`${c.chassis}|${c.wheel}`, c.motionRatio ?? 1);
  for (const row of doc.beams ?? []) {
    const [na, nb, group] = row;
    const a = index(na), b = index(nb);
    if (a < 0 || b < 0) continue;
    const kind = kinds[group];
    if (kind && (kind !== 'subframe' || cradleMember(na, nb))) links.push({ a, b, kind });
    if (group === 'springFront' || group === 'springRear') springs.push({ top: a, bottom: b, corner: na.split('_')[0], ratio: ratios.get(`${na}|${nb}`) ?? 1 });
  }
  for (const t of doc.torsionBars ?? []) {
    const chain = [t.arm1, t.pivot1, t.pivot2, t.arm2].map(index);
    if (chain.some((i) => i < 0)) continue;
    for (let k = 0; k + 1 < chain.length; k++) links.push({ a: chain[k], b: chain[k + 1], kind: 'bar' });
  }
  const knuckles = (doc.vehicle?.wheels ?? []).map((w) => (w.carrier ?? []).map(index).filter((i) => i >= 0)).filter((k) => k.length >= 4);
  const air = (doc.vehicle?.chassis?.airPolytropic ?? 0) > 0;
  return links.length || springs.length ? { links, springs, knuckles, air } : null;
}

/** Faces of the convex hull of `pts` (brute force over the triples: a carrier has 6–7 nodes), wound outward. */
export function hullFaces(pts: THREE.Vector3[]): Array<[number, number, number]> {
  const faces: Array<[number, number, number]> = [];
  const n = pts.length, e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3();
  const centre = pts.reduce((c, p) => c.add(p), new THREE.Vector3()).divideScalar(n);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    nrm.crossVectors(e1.subVectors(pts[j], pts[i]), e2.subVectors(pts[k], pts[i]));
    if (nrm.lengthSq() < 1e-12) continue;
    nrm.normalize();
    let pos = 0, neg = 0;
    for (let m = 0; m < n; m++) {
      if (m === i || m === j || m === k) continue;
      const d = nrm.dot(e1.subVectors(pts[m], pts[i]));
      if (d > 1e-5) pos++;
      else if (d < -1e-5) neg++;
    }
    if (pos && neg) continue;
    // Outward: away from the centre.
    const out = nrm.dot(e1.subVectors(pts[i], centre)) >= 0;
    faces.push(out ? [i, j, k] : [i, k, j]);
  }
  return faces;
}

// Look: radius [m] and colour of each member kind.
const STYLE: Record<SuspensionPart, { radius: number; color: number; emissive: number }> = {
  arm: { radius: 0.015, color: 0xd5dce4, emissive: 0.18 },
  steer: { radius: 0.009, color: 0xf2c94c, emissive: 0.3 },
  bar: { radius: 0.011, color: 0x4a8fe7, emissive: 0.3 },
  subframe: { radius: 0.016, color: 0x4b525c, emissive: 0.05 },
};
const COIL_RADIUS = 0.052; // [m] coil centre-line radius
const COIL_LENGTH = 0.3; // [m] the coil geometry's own length (the air spring's bellows too)
const AIR_SEAT = 0.42; // the air spring's piston top, along the strut from its lower mount
const PISTON = { radius: 0.05, length: 0.11 }; // [m] the air spring's piston below the bellows

/** A rolling-lobe air spring's bellows, COIL_LENGTH long along +Y: the top plate, two convolutions, and the rubber
 *  rolling in over the piston at the bottom. */
function bellowsGeometry(): THREE.BufferGeometry {
  const L = COIL_LENGTH;
  const profile: Array<[number, number]> = [
    [0.0, 0], [0.05, 0], [0.068, 0.04], [0.078, 0.09], [0.079, 0.13], [0.07, 0.155], [0.079, 0.18], [0.08, 0.215],
    [0.071, 0.24], [0.078, 0.262], [0.072, 0.29], [0.062, 0.3], [0.0, 0.3],
  ];
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, (y / 0.3) * L));
  return new THREE.LatheGeometry(pts, 28);
}
const COLD = new THREE.Color(0x4cc9f0), NEUTRAL = new THREE.Color(0xf4f4f0), HOT = new THREE.Color(0xff6a2b);

/** Per-corner suspension state for the x-ray HUD: wheel travel from the static ride height [m] (+ compressed). */
export interface CornerTravel {
  corner: string;
  travel: number;
}

export class SuspensionView {
  readonly group = new THREE.Group();
  private readonly members: THREE.InstancedMesh;
  private readonly coils: THREE.InstancedMesh; // coils, or the air springs' bellows
  private readonly pistons: THREE.InstancedMesh | null = null;
  private readonly bodies: THREE.InstancedMesh;
  private readonly rods: THREE.InstancedMesh;
  private readonly rest: number[] = []; // spring lengths at the static ride height [m]
  private readonly learned: boolean[] = []; // the rest length was seen standing still (else: the first frame's)
  readonly travel: CornerTravel[];
  // Wheel carriers: one solid per corner, its hull's faces found at the first frame (node indices into the carrier).
  private readonly knuckles: Array<{ mesh: THREE.Mesh; faces: Array<[number, number, number]> | null }> = [];
  private readonly pts: THREE.Vector3[] = [];

  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly e = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private static readonly UP = new THREE.Vector3(0, 1, 0);

  constructor(private readonly def: SuspensionDef, private body: number) {
    this.group.name = 'suspension-xray';
    const metal = (color: number, emissive: number, roughness = 0.35, metalness = 0.75) => {
      const mat = new THREE.MeshStandardNodeMaterial({ color, roughness, metalness });
      mat.emissive = new THREE.Color(color).multiplyScalar(emissive);
      return mat;
    };
    // Members: one instanced unit cylinder (along +Y, 0…1), coloured per instance.
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false).translate(0, 0.5, 0);
    const memberMat = metal(0xffffff, 0.12);
    this.members = new THREE.InstancedMesh(cyl, memberMat, Math.max(1, def.links.length));
    def.links.forEach((l, i) => this.members.setColorAt(i, this.c.setHex(STYLE[l.kind].color)));
    // Coils: a helix of 7 turns in metres, COIL_LENGTH long along +Y (stretched to the spring's length per frame).
    const turns = 7;
    const points: THREE.Vector3[] = [];
    for (let k = 0; k <= turns * 24; k++) {
      const t = k / (turns * 24), a = t * turns * Math.PI * 2;
      points.push(new THREE.Vector3(COIL_RADIUS * Math.cos(a), t * COIL_LENGTH, COIL_RADIUS * Math.sin(a)));
    }
    const path = new THREE.CatmullRomCurve3(points);
    const coil = def.air ? bellowsGeometry() : new THREE.TubeGeometry(path, turns * 24, 0.0065, 6, false);
    // Air: rubber (matte; the load colour darkened to read as rubber), on a polished piston.
    const coilMat = def.air ? metal(0xffffff, 0.12, 0.75, 0.05) : metal(0xffffff, 0.25, 0.3, 0.55);
    this.coils = new THREE.InstancedMesh(coil, coilMat, Math.max(1, def.springs.length));
    if (def.air) {
      const piston = new THREE.CylinderGeometry(PISTON.radius, PISTON.radius * 0.92, 1, 20, 1, false).translate(0, 0.5, 0);
      this.pistons = new THREE.InstancedMesh(piston, metal(0xc9d0d8, 0.1, 0.2, 0.9), Math.max(1, def.springs.length));
    }
    this.bodies = new THREE.InstancedMesh(cyl, metal(0x23272d, 0.06, 0.45, 0.6), Math.max(1, def.springs.length));
    this.rods = new THREE.InstancedMesh(cyl, metal(0xeef2f6, 0.15, 0.12, 1.0), Math.max(1, def.springs.length));
    for (const mesh of [this.members, this.coils, this.bodies, this.rods, ...(this.pistons ? [this.pistons] : [])]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      this.group.add(mesh);
    }
    this.coils.instanceColor?.setUsage(THREE.DynamicDrawUsage);
    const casting = metal(0x8a929c, 0.08, 0.55, 0.7);
    casting.flatShading = true;
    for (const k of def.knuckles) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 3 * 64), 3).setUsage(THREE.DynamicDrawUsage));
      g.setDrawRange(0, 0);
      const mesh = new THREE.Mesh(g, casting);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.knuckles.push({ mesh, faces: null });
      while (this.pts.length < k.length) this.pts.push(new THREE.Vector3());
    }
    this.travel = def.springs.map((s) => ({ corner: s.corner, travel: 0 }));
    this.group.visible = false;
  }

  rebind(body: number): void {
    this.body = body;
    this.rest.length = 0;
    this.learned.length = 0;
    for (const k of this.knuckles) k.faces = null;
  }

  set visible(on: boolean) {
    this.group.visible = on;
  }

  /** Air springs (bellows) rather than coils. */
  get air(): boolean {
    return this.def.air;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  /** Poses every member from this frame's node positions. `still`: the car stands on its wheels at rest — the
   *  springs' lengths then are the static ride height the travel is measured from (learned while hidden too, so the
   *  x-ray switched on in a corner does not take the corner's compression for zero). */
  update(frame: RenderFrame, locate: NodeLocator, still = false): void {
    const at = (node: number, out: THREE.Vector3): boolean => {
      const [b, n] = locate(this.body, node);
      if (b >= frame.bodyCount || n >= frame.nodeCount[b]) return false;
      const o = (frame.nodeOffset[b] + n) * 3;
      out.set(frame.positions[o], frame.positions[o + 1], frame.positions[o + 2]);
      return true;
    };
    if (still) {
      this.def.springs.forEach((s, i) => {
        if (!at(s.top, this.a) || !at(s.bottom, this.b)) return;
        const len = this.a.distanceTo(this.b);
        // Low-passed: the landing bounce after a spawn settles into it.
        this.rest[i] = this.learned[i] ? this.rest[i] + 0.15 * (len - this.rest[i]) : len;
        this.learned[i] = true;
      });
    }
    if (!this.group.visible) return;
    this.def.links.forEach((l, i) => {
      const ok = at(l.a, this.a) && at(l.b, this.b);
      this.segment(this.members, i, this.a, this.b, ok ? STYLE[l.kind].radius : 0);
    });
    this.members.instanceMatrix.needsUpdate = true;
    this.def.springs.forEach((s, i) => {
      const ok = at(s.top, this.a) && at(s.bottom, this.b);
      const len = this.a.distanceTo(this.b);
      if (this.rest[i] === undefined && ok) this.rest[i] = len;
      const rest = this.rest[i] ?? len;
      // Wheel travel: the spring's shortening over its motion ratio (compression positive).
      const travel = (rest - len) / Math.max(s.ratio, 0.3);
      this.travel[i].travel = travel;
      // Coil: from the lower seat (a fifth up the damper) to the top mount. Air spring: the bellows from its piston's
      // top (which moves with the damper body) to the top mount, the piston below it.
      const seat = this.p.copy(this.b).lerp(this.a, this.def.air ? AIR_SEAT : 0.22);
      this.coil(i, seat, this.a, ok);
      if (this.pistons) {
        const down = this.e.copy(this.b).sub(this.a).normalize().multiplyScalar(PISTON.length).add(seat);
        this.segment(this.pistons, i, down, seat, ok ? 1 : 0, PISTON.length);
      }
      const k = Math.max(-1, Math.min(1, travel / 0.06));
      this.c.copy(NEUTRAL).lerp(k > 0 ? HOT : COLD, Math.abs(k));
      if (this.def.air) this.c.multiplyScalar(0.36);
      this.coils.setColorAt(i, this.c);
      // Damper: its body from the lower mount, its rod from the top mount (they overlap more as it compresses).
      this.segment(this.bodies, i, this.b, this.s.copy(this.b).lerp(this.a, Math.min(0.95, (0.58 * rest) / Math.max(len, 1e-3))), ok ? 0.024 : 0);
      this.segment(this.rods, i, this.a, this.s.copy(this.a).lerp(this.b, Math.min(0.95, (0.6 * rest) / Math.max(len, 1e-3))), ok ? 0.0095 : 0);
    });
    for (const mesh of [this.coils, this.bodies, this.rods, ...(this.pistons ? [this.pistons] : [])]) mesh.instanceMatrix.needsUpdate = true;
    if (this.coils.instanceColor) this.coils.instanceColor.needsUpdate = true;
    // Wheel carriers: the hull of their nodes (its faces fixed at the first frame: the carrier is stiff).
    this.def.knuckles.forEach((nodes, c) => {
      const k = this.knuckles[c];
      const pts = this.pts.slice(0, nodes.length);
      if (!nodes.every((node, i) => at(node, pts[i]))) {
        k.mesh.geometry.setDrawRange(0, 0);
        return;
      }
      k.faces ??= hullFaces(pts).slice(0, 64);
      const pos = k.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      k.faces.forEach((f, i) => f.forEach((v, j) => pos.setXYZ(3 * i + j, pts[v].x, pts[v].y, pts[v].z)));
      pos.needsUpdate = true;
      k.mesh.geometry.setDrawRange(0, 3 * k.faces.length);
      k.mesh.geometry.computeVertexNormals();
    });
  }

  /** Instance `i` of `mesh`: the unit cylinder from `from` to `to` with radius `r` (0: hidden) — or, given `fixed`,
   *  a mesh of its own size (r = 1) from `from` along the direction to `to`. */
  private segment(mesh: THREE.InstancedMesh, i: number, from: THREE.Vector3, to: THREE.Vector3, r: number, fixed = 0): void {
    const dir = this.s.copy(to).sub(from);
    const len = dir.length();
    if (len < 1e-5 || r <= 0) {
      this.m.makeScale(0, 0, 0);
    } else {
      this.q.setFromUnitVectors(SuspensionView.UP, dir.divideScalar(len));
      this.m.compose(from, this.q, fixed ? this.s.set(1, len, 1) : this.s.set(r, len, r));
    }
    mesh.setMatrixAt(i, this.m);
  }

  private coil(i: number, from: THREE.Vector3, to: THREE.Vector3, ok: boolean): void {
    const dir = this.s.copy(to).sub(from);
    const len = dir.length();
    if (len < 1e-5 || !ok) {
      this.m.makeScale(0, 0, 0);
    } else {
      this.q.setFromUnitVectors(SuspensionView.UP, dir.divideScalar(len));
      this.m.compose(from, this.q, this.s.set(1, len / COIL_LENGTH, 1));
    }
    this.coils.setMatrixAt(i, this.m);
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const mesh of [this.members, this.coils, this.bodies, this.rods, ...(this.pistons ? [this.pistons] : []), ...this.knuckles.map((k) => k.mesh)]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}

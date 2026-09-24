// Flexbody (§4.5, A§5): the vehicle's visual mesh deformed by its node-beam cage on the GPU.
//
// Binding (once, at load): the body meshes are baked into the model frame and every vertex X is tied to its K = 4
// nearest cage nodes (the chassis lattice) with inverse-square-distance weights w_k(X). Each node carries a frame
// built from the node and two lattice neighbours (Gram–Schmidt along the model's x and z), so it follows the node's
// rotation as well as its translation. With M_k = R_k·R0_kᵀ the node's rotation since rest, the deformation map is
//
//     x(X) = Σ w_k(X) · x_k(X),   x_k(X) = p_k + M_k·(X − P_k)
//
// which reproduces the rest shape exactly and follows any rigid motion exactly. Normals are recomputed from the
// deformation: its Jacobian F = Σ w_k·M_k + Σ (x_k − x) ⊗ ∇w_k (∇w_k fixed at bind time; Σ∇w_k = 0) maps the rest
// normal to the deformed one by the cofactor, n = cof(F)·n0 — the normal of the surface the vertex stage draws,
// stretch and shear between nodes included.
//
// Per frame: the cage nodes' positions, rotations and rest positions go into a float data texture (5 texels per
// node: p + piece, M's three columns, P); a TSL vertex stage evaluates x and n. The same node graph runs on WebGPU and
// on the WebGL2 fallback, which has no compute shaders (the UE design of §3 does this in a compute pass; this is the
// web platform's equivalent, ARCHITECTURE A§5). Meshes render in render space with an identity transform.
//
// Tearing: a node that broke off with a part lives in another body (island split, §4.3). The texture carries each
// node's piece (its current body); a vertex follows only the nodes in its nearest node's piece, and a triangle whose
// corners ended up in different pieces is discarded, so the panel parts along the tear instead of stretching across it.
//
// Glass and lamps (§4.3, Damage.ts): glass and lamp vertices carry their damage group; per-group uniforms drive a
// spider-web crack and an inward sag on laminated glass, discard shattered tempered glass and darken and hole broken
// lenses. `onBreak` receives the fragments (sampled on the deformed pane) for the debris particles.
import * as THREE from 'three/webgpu';
import {
  Fn, attribute, cross as crossNode, float, fract, int, ivec2, materialColor, materialOpacity, max, mix, negateOnBackSide, normalize, select, sin,
  smoothstep, fwidth, textureLoad, transformNormalToView, uniformArray, varying, varyingProperty, vec2, vec3, vec4,
} from 'three/tsl';
import type { RenderFrame } from '../physics/PhysicsClient';
import { matchPieces, panelLook, PanelState, rimDistance, splitPieces, type DamageGroupDef, type DamageStatus } from './Damage';

type V3 = [number, number, number];
type Frame = [V3, V3, V3]; // orthonormal columns e1, e2, e3

/** A frame neighbour: body node index and +1 when it lies toward +axis at rest, −1 toward −axis. */
interface Neighbour {
  node: number;
  sign: 1 | -1;
}

/** Cage node: index in the physics body and rest position in the model frame (+X left, +Y up, +Z forward). */
export interface CageNode {
  index: number;
  rest: V3;
  /** Lattice neighbours spanning the node frame (preferred first): along the model x axis, and along z. */
  x: Neighbour[];
  z: Neighbour[];
}

/** Resolves where a body node is now ([body, node]) — PhysicsClient.locate. */
export type NodeLocator = (body: number, node: number) => [number, number];

const K = 4;               // nodes per vertex
const TEXELS_PER_NODE = 5; // p (+ piece in w), M column 1, 2, 3, rest position P
const TEX_WIDTH = 250;     // a multiple of TEXELS_PER_NODE: a node's texels share one row
const XYZW = ['x', 'y', 'z', 'w'] as const;
const EPS = 1e-4;          // [m²] weight regulariser: w ∝ 1 / (d² + EPS)

// A vec4 element of a uniform array (the typings leave its node type open).
type Vec4Node = ReturnType<typeof vec4>;
const element = (arr: ReturnType<typeof uniformArray>, i: ReturnType<typeof int>): Vec4Node => arr.element(i) as unknown as Vec4Node;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const length = (a: V3) => Math.hypot(a[0], a[1], a[2]);

/**
 * Orthonormal node frame from the node and its x / z neighbours (Gram–Schmidt): e1 ≈ x, e2 ≈ z, e3 = e1 × e2.
 * Null when the neighbours are degenerate (crushed onto the node or onto one line).
 */
export function nodeFrame(p: V3, px: V3, pz: V3, xSign: number, zSign: number): Frame | null {
  const x = scale(sub(px, p), xSign);
  const lx = length(x);
  if (lx < 1e-5) return null;
  const e1 = scale(x, 1 / lx);
  const z = scale(sub(pz, p), zSign);
  const zPerp = sub(z, scale(e1, dot(z, e1)));
  const lz = length(zPerp);
  if (lz < 1e-3 * Math.max(length(z), 1e-5) || lz < 1e-6) return null;
  const e2 = scale(zPerp, 1 / lz);
  return [e1, e2, cross(e1, e2)];
}

/** Columns of M = R·R0ᵀ (the rotation from the rest frame R0 to the current frame R). */
export function relativeRotation(R: Frame, R0: Frame): Frame {
  const col = (j: number): V3 => [0, 1, 2].map((r) => R[0][r] * R0[0][j] + R[1][r] * R0[1][j] + R[2][r] * R0[2][j]) as V3;
  return [col(0), col(1), col(2)];
}

/** Rest frame of a cage node from its first usable pair of neighbours. */
export function restFrame(c: CageNode, restOf: (node: number) => V3 | null): Frame {
  for (const nx of c.x) {
    for (const nz of c.z) {
      const px = restOf(nx.node), pz = restOf(nz.node);
      const f = px && pz ? nodeFrame(c.rest, px, pz, nx.sign, nz.sign) : null;
      if (f) return f;
    }
  }
  return [[1, 0, 0], [0, 0, 1], [0, -1, 0]];
}

/** A vertex bound to its K nearest cage nodes: cage indices, weights (Σ = 1) and weight gradients (Σ = 0). */
export interface VertexBinding {
  nodes: number[];
  weights: number[];
  gradients: V3[];
}

/** Binds a model-frame rest vertex to the cage. */
export function bindVertex(v: V3, cage: CageNode[]): VertexBinding {
  const bestD = new Array<number>(K).fill(Infinity), bestK = new Array<number>(K).fill(0);
  for (let k = 0; k < cage.length; k++) {
    const r = cage[k].rest;
    const d = (v[0] - r[0]) ** 2 + (v[1] - r[1]) ** 2 + (v[2] - r[2]) ** 2;
    if (d >= bestD[K - 1]) continue;
    let s = K - 1;
    while (s > 0 && bestD[s - 1] > d) {
      bestD[s] = bestD[s - 1];
      bestK[s] = bestK[s - 1];
      s--;
    }
    bestD[s] = d;
    bestK[s] = k;
  }
  // u_k = 1/(d_k² + ε), ∇u_k = −2(X − P_k)·u_k²; w_k = u_k/U, ∇w_k = (∇u_k − w_k·Σ∇u)/U.
  const u = bestD.map((d) => 1 / (d + EPS));
  const U = u.reduce((a, b) => a + b, 0);
  const gu = bestK.map((k, s) => scale(sub(v, cage[k].rest), -2 * u[s] * u[s]));
  const gsum = gu.reduce((a, g) => add(a, g), [0, 0, 0] as V3);
  const weights = u.map((x) => x / U);
  return { nodes: bestK, weights, gradients: gu.map((g, s) => scale(sub(g, scale(gsum, weights[s])), 1 / U)) };
}

/** Current state of a cage node: position, rotation since rest (columns of M) and rest position. */
export interface NodePose {
  p: V3;
  M: Frame;
  P: V3;
}

/**
 * The vertex stage on the CPU (tests, tools): deformed position and normal (unnormalised cof(F)·n0) of a bound rest
 * vertex X with rest normal n0, given each node's piece (only nodes in the nearest node's piece carry the vertex).
 */
export function deformVertex(b: VertexBinding, X: V3, n0: V3, poses: NodePose[], pieces?: number[]): { position: V3; normal: V3 } {
  const piece = pieces?.[b.nodes[0]];
  const keep = b.nodes.map((k) => !pieces || pieces[k] === piece);
  const xs = b.nodes.map((k) => {
    const { p, M, P } = poses[k], d = sub(X, P);
    return add(p, add(scale(M[0], d[0]), add(scale(M[1], d[1]), scale(M[2], d[2]))));
  });
  let x: V3 = [0, 0, 0], wsum = 0;
  xs.forEach((xk, s) => {
    if (!keep[s]) return;
    x = add(x, scale(xk, b.weights[s]));
    wsum += b.weights[s];
  });
  x = scale(x, 1 / wsum);
  const F: Frame = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  b.nodes.forEach((k, s) => {
    if (!keep[s]) return;
    const w = b.weights[s] / wsum, g = b.gradients[s], r = sub(xs[s], x);
    for (let j = 0; j < 3; j++) F[j] = add(F[j], add(scale(poses[k].M[j], w), scale(r, g[j])));
  });
  const normal = add(scale(cross(F[1], F[2]), n0[0]), add(scale(cross(F[2], F[0]), n0[1]), scale(cross(F[0], F[1]), n0[2])));
  return { position: x, normal };
}

function floatAttribute(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): THREE.BufferAttribute {
  const out = new Float32Array(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
  return new THREE.BufferAttribute(out, a.itemSize);
}

export class Flexbody {
  /** Deformed meshes, in render space: add `group` to the scene. */
  readonly group = new THREE.Group();
  private readonly data: Float32Array;
  private readonly texture: THREE.DataTexture;
  private readonly located: Int32Array; // per cage node, 5 × [body, node]: itself, two x and two z neighbours
  private locatedVersion = -1;
  private readonly restFrames: Frame[];
  private readonly lastM: Float32Array; // last good rotation per cage node (9 floats), for degenerate moments
  private prevP: Float32Array | null = null; // cage positions of the previous update (fragment velocities)
  private prevTime = 0;
  private lastTime = 0;
  // Damage groups: definitions, per-group uniforms (state, crack radius, sag, seed | crack origin | sag direction)
  // and, per group, the panel vertices (mesh, vertex) the looks and fragments are computed from.
  private readonly defs: DamageGroupDef[];
  private readonly nodeRest: (node: number) => V3;
  private readonly panelState: THREE.Vector4[];
  private readonly panelCrack: THREE.Vector4[];
  private readonly panelSag: THREE.Vector4[];
  private readonly panelVerts: Array<Array<{ mesh: THREE.Mesh; tris: number[] }>>;
  private readonly states: PanelState[];
  /** Called when a tempered pane shatters or a lamp breaks, with fragment points and velocities (render space). */
  onBreak: ((kind: 'glass' | 'lamp', points: V3[], velocities: V3[], colors: THREE.Color[]) => void) | null = null;

  /**
   * @param root      the model's vehicle-frame root
   * @param bodyMesh  the body part of the model (wheels removed); its meshes move into `group`
   * @param cage      chassis lattice nodes of physics body `body`
   * @param damage    the vehicle's damage groups and its nodes' rest positions (model frame), for glass and lamps
   */
  constructor(root: THREE.Object3D, bodyMesh: THREE.Object3D, private readonly cage: CageNode[], private body: number,
              damage: { defs: DamageGroupDef[]; nodeRest: (node: number) => V3 } | null = null) {
    this.defs = damage?.defs ?? [];
    this.nodeRest = damage?.nodeRest ?? (() => [0, 0, 0]);
    const groups = Math.max(this.defs.length, 1);
    this.panelState = Array.from({ length: groups }, (_, g) => new THREE.Vector4(0, 0, 0, (g * 0.6180339887) % 1));
    this.panelCrack = Array.from({ length: groups }, () => new THREE.Vector4());
    this.panelSag = Array.from({ length: groups }, () => new THREE.Vector4(0, -1, 0, 0));
    this.panelVerts = Array.from({ length: groups }, () => []);
    this.states = Array.from({ length: groups }, () => PanelState.Intact);
    const rows = Math.ceil((cage.length * TEXELS_PER_NODE) / TEX_WIDTH);
    this.data = new Float32Array(TEX_WIDTH * rows * 4);
    this.texture = new THREE.DataTexture(this.data, TEX_WIDTH, rows, THREE.RGBAFormat, THREE.FloatType);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.located = new Int32Array(cage.length * 10);
    this.lastM = new Float32Array(cage.length * 9);

    const byIndex = new Map(cage.map((c) => [c.index, c]));
    this.restFrames = cage.map((c) => restFrame(c, (n) => byIndex.get(n)?.rest ?? null));
    cage.forEach((c, k) => {
      const o = k * TEXELS_PER_NODE * 4;
      this.data.set(c.rest, o);                  // p = P until the first update
      this.data.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], o + 4);
      this.data.set(c.rest, o + 16);             // P (static)
      this.lastM.set([1, 0, 0, 0, 1, 0, 0, 0, 1], k * 9);
    });
    this.texture.needsUpdate = true;

    this.group.matrixAutoUpdate = false;
    root.updateWorldMatrix(true, true);
    const rootInverse = root.matrixWorld.clone().invert();
    const meshes: THREE.Mesh[] = [];
    bodyMesh.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry.getAttribute('position')) meshes.push(mesh);
    });
    const material = new Map<THREE.Material, THREE.Material>(); // one flexbody copy per shared material
    for (const mesh of meshes) {
      this.bind(mesh, new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld), material);
      mesh.removeFromParent();
      mesh.matrixAutoUpdate = false;
      mesh.matrix.identity();
      this.group.add(mesh);
    }
    this.group.updateMatrixWorld(true);
  }

  get bodyIndex(): number {
    return this.body;
  }

  /** The vehicle was spawned again (a fresh world): follow physics body `body` from the next update. */
  rebind(body: number): void {
    this.body = body;
    this.locatedVersion = -1;
  }

  get meshes(): THREE.Mesh[] {
    return this.group.children as THREE.Mesh[];
  }

  private bind(mesh: THREE.Mesh, toModel: THREE.Matrix4, materials: Map<THREE.Material, THREE.Material>): void {
    // Bake the mesh into the model frame (its own copy: meshes may share geometry). A mirroring transform flips the
    // winding, which the identity transform no longer corrects for: restore it.
    const g = mesh.geometry.clone();
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    // Quantized attributes (KHR_mesh_quantization: normalized Int16 positions, Int8 normals) would clamp to [−1, 1]
    // once the model transform is baked in: widen them to Float32 first.
    for (const name of ['position', 'normal']) g.setAttribute(name, floatAttribute(g.getAttribute(name)));
    g.applyMatrix4(toModel);
    if (toModel.determinant() < 0) {
      if (g.index) {
        const idx = g.index;
        for (let t = 0; t + 2 < idx.count; t += 3) {
          const b = idx.getX(t + 1);
          idx.setX(t + 1, idx.getX(t + 2));
          idx.setX(t + 2, b);
        }
      } else {
        for (const attr of Object.values(g.attributes)) {
          const a = attr as THREE.BufferAttribute;
          for (let t = 0; t + 2 < a.count; t += 3) {
            for (let c = 0; c < a.itemSize; c++) {
              const b = a.getComponent(t + 1, c);
              a.setComponent(t + 1, c, a.getComponent(t + 2, c));
              a.setComponent(t + 2, c, b);
            }
          }
        }
      }
    }
    mesh.geometry = g;
    const role = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).userData?.apexRole as string | undefined;
    const kind = role === 'glass' || role === 'tint' ? 'glass' : role === 'lamp' ? 'lamp' : null;
    if (kind) this.bindPanels(mesh, kind);
    const pos = g.getAttribute('position');
    const n = pos.count;
    const ids = new Float32Array(n * K), weights = new Float32Array(n * K);
    const gradients = [0, 1, 2, 3].map(() => new Float32Array(n * 3));
    for (let i = 0; i < n; i++) {
      const b = bindVertex([pos.getX(i), pos.getY(i), pos.getZ(i)], this.cage);
      ids.set(b.nodes, i * K);
      weights.set(b.weights, i * K);
      for (let s = 0; s < K; s++) gradients[s].set(b.gradients[s], i * 3);
    }
    g.setAttribute('fbNodes', new THREE.BufferAttribute(ids, K));
    g.setAttribute('fbWeights', new THREE.BufferAttribute(weights, K));
    gradients.forEach((a, s) => g.setAttribute(`fbGrad${s}`, new THREE.BufferAttribute(a, 3)));
    // Deformed positions leave the rest bounds: never cull the car away.
    mesh.frustumCulled = false;

    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const flex = list.map((m) => {
      let f = materials.get(m);
      if (!f) {
        f = m.clone();
        this.deformMaterial(f as THREE.MeshPhysicalNodeMaterial, kind);
        materials.set(m, f);
      }
      return f;
    });
    mesh.material = Array.isArray(mesh.material) ? flex : flex[0];
  }

  /** Tags the glass / lamp vertices of a baked mesh with their damage group ('fbPanel', −1: none) and, for glass, their
   *  distance from the pane's rim ('fbRim': the sag profile); records each group's triangles and sag direction. */
  private bindPanels(mesh: THREE.Mesh, kind: 'glass' | 'lamp'): void {
    const g = mesh.geometry;
    const pos = g.getAttribute('position').array as Float32Array;
    const index = g.index ? (g.index.array as ArrayLike<number>) : null;
    const { triPiece, centroids } = splitPieces(pos, index);
    const pieceGroup = matchPieces(centroids, this.defs, kind);
    const n = pos.length / 3;
    const panel = new Float32Array(n).fill(-1);
    const vi = (t: number, k: number) => (index ? index[t * 3 + k] : t * 3 + k);
    const trisOf = new Map<number, number[]>();
    for (let t = 0; t < triPiece.length; t++) {
      const grp = pieceGroup[triPiece[t]];
      if (grp < 0) continue;
      for (let k = 0; k < 3; k++) panel[vi(t, k)] = grp;
      if (!trisOf.has(grp)) trisOf.set(grp, []);
      trisOf.get(grp)!.push(t);
    }
    g.setAttribute('fbPanel', new THREE.BufferAttribute(panel, 1));
    if (kind === 'glass') {
      const rim = new Float32Array(n);
      for (const [grp] of trisOf) {
        const pieces = new Set<number>();
        pieceGroup.forEach((pg, piece) => pg === grp && pieces.add(piece));
        const d = rimDistance(pos, index, triPiece, pieces);
        for (let i = 0; i < n; i++) if (panel[i] === grp) rim[i] = d[i];
      }
      g.setAttribute('fbRim', new THREE.BufferAttribute(rim, 1));
    }
    for (const [grp, tris] of trisOf) {
      this.panelVerts[grp].push({ mesh, tris });
      // Sag inward: against the pane's area-weighted normal, oriented away from the cabin centre.
      const centre = centroids.reduce((best, c, piece) => (pieceGroup[piece] === grp ? c : best), [0, 0, 0] as V3);
      const out = sub(centre, [0, 0.6, -0.2]);
      const l = length(out) || 1;
      this.panelSag[grp].set(-out[0] / l, -out[1] / l, -out[2] / l, 0);
    }
  }

  private deformMaterial(mat: THREE.MeshPhysicalNodeMaterial, kind: 'glass' | 'lamp' | null): void {
    const tex = this.texture;
    const fetch = (node: ReturnType<typeof int>, k: number) => {
      const t = node.mul(TEXELS_PER_NODE).add(k);
      return textureLoad(tex, ivec2(t.mod(TEX_WIDTH), t.div(TEX_WIDTH)));
    };
    const X0 = attribute('position', 'vec3');
    const panelIndex = kind ? attribute('fbPanel', 'float') : float(-1);
    const hasPanel = panelIndex.greaterThanEqual(0);
    const pi = int(max(panelIndex, 0));
    const stateArr = uniformArray(this.panelState, 'vec4');
    const crackArr = uniformArray(this.panelCrack, 'vec4');
    const sagArr = uniformArray(this.panelSag, 'vec4');
    const panel = select(hasPanel, element(stateArr, pi), vec4(0));
    // Laminated sag: the rest position moves inward by up to `sag` in the middle of the pane (0 at the rim) before
    // it is deformed with the body.
    const X = kind === 'glass'
      ? X0.add(element(sagArr, pi).xyz.mul(panel.z.mul(attribute('fbRim', 'float').mul(float(2).sub(attribute('fbRim', 'float'))))))
      : X0;
    const nodes = attribute('fbNodes', 'vec4');
    const w = attribute('fbWeights', 'vec4');
    const piece = fetch(int(nodes.x), 0).w;
    const deformedNormal = varyingProperty('vec3', 'v_fbNormal');
    const deform = Fn(() => {
      const x = vec3(0).toVar();
      const wsum = float(0).toVar();
      const terms = XYZW.map((c) => {
        const node = int(nodes[c]);
        const base = fetch(node, 0);
        const M = [fetch(node, 1).xyz, fetch(node, 2).xyz, fetch(node, 3).xyz];
        const d = X.sub(fetch(node, 4).xyz);
        const xk = base.xyz.add(M[0].mul(d.x)).add(M[1].mul(d.y)).add(M[2].mul(d.z)).toVar();
        // Only the nodes still in the nearest node's piece carry the vertex (a torn-off node does not drag it).
        const wk = w[c].mul(base.w.equal(piece).select(float(1), float(0))).toVar();
        x.addAssign(xk.mul(wk));
        wsum.addAssign(wk);
        return { xk, wk, M };
      });
      x.divAssign(wsum);
      // Jacobian columns F_j = Σ (w_k/W)·M_k,j + Σ (x_k − x)·∂w_k/∂X_j.
      const F = [vec3(0).toVar(), vec3(0).toVar(), vec3(0).toVar()];
      terms.forEach(({ xk, wk, M }, s) => {
        const wn = wk.div(wsum);
        const g = attribute(`fbGrad${s}`, 'vec3').mul(wk.greaterThan(0).select(float(1), float(0)));
        const r = xk.sub(x);
        F[0].addAssign(M[0].mul(wn).add(r.mul(g.x)));
        F[1].addAssign(M[1].mul(wn).add(r.mul(g.y)));
        F[2].addAssign(M[2].mul(wn).add(r.mul(g.z)));
      });
      const n0 = attribute('normal', 'vec3');
      deformedNormal.assign(F[1].cross(F[2]).mul(n0.x).add(F[2].cross(F[0]).mul(n0.y)).add(F[0].cross(F[1]).mul(n0.z)));
      return x;
    });
    const normal = negateOnBackSide(transformNormalToView(deformedNormal).normalize());
    // Piece and piece² interpolated over the triangle: their variance is 0 only when all three corners share a piece.
    const pieceMoments = varying(vec2(piece, piece.mul(piece)), 'v_fbPiece');
    mat.positionNode = deform();
    mat.normalNode = normal;
    if ('clearcoatNormalNode' in mat) mat.clearcoatNormalNode = normal;
    const intact = pieceMoments.y.sub(pieceMoments.x.mul(pieceMoments.x)).abs().lessThan(1e-3);
    mat.maskNode = intact;
    mat.needsUpdate = true;
    if (!kind) return;
    // Damaged glass and lamps (fragment terms on rest coordinates, so the pattern stays on the glass).
    const vX = vec3(varying(X0, 'v_fbRest'));
    const state = vec4(varying(panel, 'v_fbPanelState'));
    const broken = state.x.greaterThan(1.5);
    // Cell hash of the rest position (≈ 1.5 cm cells): which bits of a broken lens are missing.
    const cell = vX.mul(66).floor();
    const noise = fract(sin(cell.dot(vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
    if (kind === 'lamp') {
      mat.colorNode = materialColor.mul(select(broken, float(0.12), float(1)));
      mat.maskNode = intact.and(broken.and(noise.greaterThan(0.55)).not());
      mat.needsUpdate = true;
      return;
    }
    // Tempered: gone. Laminated: a spider web — radial cracks and rings around the origin, a crushed star at its
    // centre — fading out at the crack radius.
    mat.maskNode = intact.and(broken.not());
    const origin = vec3(varying(element(crackArr, pi).xyz, 'v_fbCrack'));
    const radius = state.y, seed = state.w;
    const d = vX.sub(origin);
    const r = d.length();
    const n0 = normalize(vec3(varying(attribute('normal', 'vec3'), 'v_fbRestNormal')));
    const t1 = normalize(crossNode(n0, select(n0.y.abs().lessThan(0.9), vec3(0, 1, 0), vec3(1, 0, 0))));
    const t2 = crossNode(n0, t1);
    const theta = d.dot(t2).atan(d.dot(t1));
    const spokes = 13;
    const a = theta.div(2 * Math.PI).mul(spokes).add(seed.mul(7)).add(sin(r.mul(31).add(seed.mul(40))).mul(0.18));
    const arc = fract(a.add(0.5)).sub(0.5).abs().mul((2 * Math.PI) / spokes).mul(r);
    // Line widths: ≈ 1 mm on the glass, never thinner than a pixel (fwidth), so distant cracks do not alias to dots.
    const spokeLine = float(1).sub(smoothstep(0.0005, max(0.0018, fwidth(arc).mul(1.5)), arc));
    const ringStep = float(0.055).add(seed.mul(0.03));
    const ring = fract(r.div(ringStep).add(sin(theta.mul(5).add(seed.mul(9))).mul(0.25))).sub(0.5).abs().mul(ringStep);
    const ringLine = float(1).sub(smoothstep(0.0005, max(0.0016, fwidth(ring).mul(1.5)), ring)).mul(float(1).sub(smoothstep(radius.mul(0.5), radius.mul(0.8), r)));
    const star = float(1).sub(smoothstep(0.012, 0.045, r));
    const extent = float(1).sub(smoothstep(radius.mul(0.8), radius, r));
    const crack = select(state.x.greaterThan(0.5), max(max(spokeLine, ringLine.mul(0.7)).mul(extent), star.mul(0.85)), float(0));
    mat.colorNode = mix(materialColor, vec3(0.9, 0.93, 0.95), crack);
    mat.opacityNode = max(materialOpacity, crack.mul(0.95));

  }

  private locateAll(locate: NodeLocator): void {
    const L = this.located;
    this.cage.forEach((c, k) => {
      const at = (node: number, slot: number) => {
        const [b, n] = locate(this.body, node);
        L[k * 10 + slot * 2] = b;
        L[k * 10 + slot * 2 + 1] = n;
      };
      at(c.index, 0);
      for (let j = 0; j < 2; j++) {
        at(c.x[j]?.node ?? c.index, 1 + j);
        at(c.z[j]?.node ?? c.index, 3 + j);
      }
    });
  }

  /** Uploads the cage for this frame (positions in render space). */
  update(frame: RenderFrame, locate: NodeLocator, islandVersion: number, now = performance.now()): void {
    this.prevP ??= new Float32Array(this.cage.length * 3);
    for (let k = 0; k < this.cage.length; k++) {
      const o = k * TEXELS_PER_NODE * 4;
      this.prevP.set(this.data.subarray(o, o + 3), k * 3);
    }
    this.prevTime = this.lastTime;
    this.lastTime = now;
    if (islandVersion !== this.locatedVersion) {
      this.locateAll(locate);
      this.locatedVersion = islandVersion;
    }
    const L = this.located, P = frame.positions, d = this.data;
    const at = (slot: number, k: number): V3 | null => {
      const b = L[k * 10 + slot * 2];
      if (b >= frame.bodyCount) return null;
      const o = (frame.nodeOffset[b] + L[k * 10 + slot * 2 + 1]) * 3;
      return [P[o], P[o + 1], P[o + 2]];
    };
    this.cage.forEach((c, k) => {
      const p = at(0, k);
      if (!p) return;
      const piece = L[k * 10];
      // The frame from neighbours in the node's own piece; else the last good rotation.
      let f: Frame | null = null;
      for (let jx = 0; jx < c.x.length && !f; jx++) {
        if (L[k * 10 + (1 + jx) * 2] !== piece) continue;
        for (let jz = 0; jz < c.z.length && !f; jz++) {
          if (L[k * 10 + (3 + jz) * 2] !== piece) continue;
          const px = at(1 + jx, k), pz = at(3 + jz, k);
          if (px && pz) f = nodeFrame(p, px, pz, c.x[jx].sign, c.z[jz].sign);
        }
      }
      if (f) relativeRotation(f, this.restFrames[k]).forEach((col, j) => this.lastM.set(col, k * 9 + j * 3));
      const o = k * TEXELS_PER_NODE * 4;
      d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2]; d[o + 3] = piece;
      for (let j = 0; j < 3; j++) {
        d[o + 4 + j * 4] = this.lastM[k * 9 + j * 3];
        d[o + 5 + j * 4] = this.lastM[k * 9 + j * 3 + 1];
        d[o + 6 + j * 4] = this.lastM[k * 9 + j * 3 + 2];
      }
    });
    this.texture.needsUpdate = true;
  }

  /** Current look of every damage group (index = group). */
  get panelStates(): readonly PanelState[] {
    return this.states;
  }

  /** Applies the core's damage-group state (sbc_body_damage_groups, in group order). */
  setDamage(status: DamageStatus[], rand: () => number = Math.random): void {
    this.defs.forEach((def, g) => {
      const look = panelLook(def, status[g]);
      const st = this.panelState[g];
      st.x = look.state;
      st.y = look.crackRadius;
      st.z = look.sag;
      const s = status[g];
      if (look.state !== PanelState.Intact && s && this.states[g] === PanelState.Intact) {
        // Crack origin: the panel vertex nearest the first damage (its beam's midpoint, or the struck node).
        const a = this.nodeRest(s.nodeA), b = this.nodeRest(s.nodeB);
        const at: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        let best: V3 = at, bestD = Infinity;
        for (const { mesh } of this.panelVerts[g]) {
          const pos = mesh.geometry.getAttribute('position');
          const panel = mesh.geometry.getAttribute('fbPanel');
          for (let i = 0; i < pos.count; i++) {
            if (panel.getX(i) !== g) continue;
            const d = (pos.getX(i) - at[0]) ** 2 + (pos.getY(i) - at[1]) ** 2 + (pos.getZ(i) - at[2]) ** 2;
            if (d < bestD) { bestD = d; best = [pos.getX(i), pos.getY(i), pos.getZ(i)]; }
          }
        }
        this.panelCrack[g].set(best[0], best[1], best[2], 0);
      }
      if (look.state === PanelState.Broken && this.states[g] !== PanelState.Broken && def.visual) this.shed(g, def.visual.kind, rand);
      this.states[g] = look.state;
    });
  }

  /** Fragments of a breaking pane or lens: random points on its deformed triangles, moving with the body there. */
  private shed(g: number, kind: 'glass' | 'lamp', rand: () => number): void {
    if (!this.onBreak) return;
    const points: V3[] = [], velocities: V3[] = [], colors: THREE.Color[] = [];
    const dt = this.lastTime > this.prevTime ? (this.lastTime - this.prevTime) / 1000 : 0;
    let area = 0;
    const tris: Array<{ mesh: THREE.Mesh; t: number; a: number }> = [];
    const at = (mesh: THREE.Mesh, i: number) => this.deformedVertex(mesh, i);
    const vi = (mesh: THREE.Mesh, t: number, k: number) => (mesh.geometry.index ? mesh.geometry.index.getX(t * 3 + k) : t * 3 + k);
    for (const { mesh, tris: list } of this.panelVerts[g]) {
      for (const t of list) {
        const [a, b, c] = [0, 1, 2].map((k) => at(mesh, vi(mesh, t, k)).x);
        const u = sub(b, a), v = sub(c, a);
        const ar = length(cross3(u, v)) / 2;
        area += ar;
        tris.push({ mesh, t, a: ar });
      }
    }
    if (area <= 0) return;
    // Granules of tempered glass: ~ 2 cm spacing over the pane (at most 700); lens shards: one per 25 cm² (≤ 120).
    const count = kind === 'glass' ? Math.min(700, Math.round(area / 4e-4)) : Math.min(120, Math.max(12, Math.round(area / 2.5e-3)));
    for (let k = 0; k < count; k++) {
      let pick = rand() * area, tri = tris[0];
      for (const x of tris) { pick -= x.a; tri = x; if (pick <= 0) break; }
      const corners = [0, 1, 2].map((c) => at(tri.mesh, vi(tri.mesh, tri.t, c)));
      let r1 = rand(), r2 = rand();
      if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
      const w = [1 - r1 - r2, r1, r2];
      points.push([0, 1, 2].map((c) => corners[0].x[c] * w[0] + corners[1].x[c] * w[1] + corners[2].x[c] * w[2]) as V3);
      velocities.push(dt > 0 ? ([0, 1, 2].map((c) => (corners[0].v[c] * w[0] + corners[1].v[c] * w[1] + corners[2].v[c] * w[2]) / dt) as V3) : [0, 0, 0]);
      const color = tri.mesh.geometry.getAttribute('color');
      const i0 = vi(tri.mesh, tri.t, 0);
      colors.push(color ? new THREE.Color(color.getX(i0), color.getY(i0), color.getZ(i0)) : new THREE.Color(0xd8ecf2));
    }
    this.onBreak(kind, points, velocities, colors);
  }

  /** CPU copy of the vertex stage: deformed position of vertex `i` and its displacement since the previous update. */
  private deformedVertex(mesh: THREE.Mesh, i: number): { x: V3; v: V3 } {
    const g = mesh.geometry;
    const pos = g.getAttribute('position'), nodes = g.getAttribute('fbNodes'), w = g.getAttribute('fbWeights');
    const X: V3 = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const x: V3 = [0, 0, 0], v: V3 = [0, 0, 0];
    const d = this.data, prev = this.prevP;
    for (let s = 0; s < K; s++) {
      const k = nodes.getComponent(i, s), wk = w.getComponent(i, s);
      const o = k * TEXELS_PER_NODE * 4;
      const rel = [X[0] - d[o + 16], X[1] - d[o + 17], X[2] - d[o + 18]];
      for (let c = 0; c < 3; c++) {
        const xc = d[o + c] + d[o + 4 + c] * rel[0] + d[o + 8 + c] * rel[1] + d[o + 12 + c] * rel[2];
        x[c] += wk * xc;
        if (prev) v[c] += wk * (d[o + c] - prev[k * 3 + c]);
      }
    }
    return { x, v };
  }

  set visible(on: boolean) {
    this.group.visible = on;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.texture.dispose();
  }
}

/** Node rows of an apex-vehicle JSON document: [id, x, y, z, …] in the model frame. */
export type VehicleJsonNode = [string, number, number, number, ...unknown[]];

/**
 * Cage of an apex-vehicle JSON document: the chassis lattice nodes (ids "c<i>_<j>_<k>", body node index = position in
 * the node list) with their x / z lattice neighbours. Lattice indices may grow toward −x or +x depending on the
 * generator: the signs come from the rest positions.
 */
export function latticeCage(nodes: VehicleJsonNode[]): CageNode[] {
  const byGrid = new Map<string, number>();
  const parsed: Array<{ index: number; i: number; j: number; k: number; rest: V3 }> = [];
  nodes.forEach((row, index) => {
    const m = /^c(\d+)_(\d+)_(\d+)$/.exec(row[0]);
    if (!m) return;
    const [i, j, k] = [Number(m[1]), Number(m[2]), Number(m[3])];
    byGrid.set(`${i},${j},${k}`, index);
    parsed.push({ index, i, j, k, rest: [row[1], row[2], row[3]] });
  });
  const neighbours = (p: V3, keys: string[], axis: 0 | 2): Neighbour[] =>
    keys.flatMap((key) => {
      const node = byGrid.get(key);
      if (node === undefined) return [];
      return [{ node, sign: (nodes[node][axis + 1] as number) >= p[axis] ? 1 : -1 } as Neighbour];
    });
  const cage: CageNode[] = [];
  for (const p of parsed) {
    const x = neighbours(p.rest, [`${p.i + 1},${p.j},${p.k}`, `${p.i - 1},${p.j},${p.k}`], 0);
    const z = neighbours(p.rest, [`${p.i},${p.j},${p.k + 1}`, `${p.i},${p.j},${p.k - 1}`], 2);
    if (x.length === 0 || z.length === 0) continue; // no frame: cannot carry vertices
    cage.push({ index: p.index, rest: p.rest, x, z });
  }
  return cage;
}

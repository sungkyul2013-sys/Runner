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
import * as THREE from 'three/webgpu';
import { Fn, attribute, float, int, ivec2, negateOnBackSide, textureLoad, transformNormalToView, varying, varyingProperty, vec2, vec3 } from 'three/tsl';
import type { RenderFrame } from '../physics/PhysicsClient';

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

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
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

  /**
   * @param root      the model's vehicle-frame root
   * @param bodyMesh  the body part of the model (wheels removed); its meshes move into `group`
   * @param cage      chassis lattice nodes of physics body `body`
   */
  constructor(root: THREE.Object3D, bodyMesh: THREE.Object3D, private readonly cage: CageNode[], private body: number) {
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
        this.deformMaterial(f as THREE.MeshPhysicalNodeMaterial);
        materials.set(m, f);
      }
      return f;
    });
    mesh.material = Array.isArray(mesh.material) ? flex : flex[0];
  }

  private deformMaterial(mat: THREE.MeshPhysicalNodeMaterial): void {
    const tex = this.texture;
    const fetch = (node: ReturnType<typeof int>, k: number) => {
      const t = node.mul(TEXELS_PER_NODE).add(k);
      return textureLoad(tex, ivec2(t.mod(TEX_WIDTH), t.div(TEX_WIDTH)));
    };
    const X = attribute('position', 'vec3');
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
    mat.maskNode = pieceMoments.y.sub(pieceMoments.x.mul(pieceMoments.x)).abs().lessThan(1e-3);
    mat.needsUpdate = true;
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
  update(frame: RenderFrame, locate: NodeLocator, islandVersion: number): void {
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

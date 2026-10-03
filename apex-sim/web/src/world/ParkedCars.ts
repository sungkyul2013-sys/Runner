// Parked cars (§13.1 충돌 가능한 주차 차량): each is a car-sized steel lattice in the physics (KNOWN_ISSUES: not a
// full vehicle); this draws a simple car body on it, placed and turned by its node cage (shunted, pushed, rolled).
import * as THREE from 'three/webgpu';
import type { RenderFrame } from '../physics/PhysicsClient';

const NX = 3, NY = 3, NZ = 6;
const COLORS = [0xd8dce2, 0x1f2227, 0x8b1e2d, 0x2b4a74, 0x9aa1a8, 0xf2f2f0];

function carGeometry(): THREE.BufferGeometry {
  // Unit car (1.8 × 1.3 × 4.4 m lattice box, origin at its centre): lower body, cabin, four wheels.
  const parts: Array<[THREE.BufferGeometry, number]> = [
    [new THREE.BoxGeometry(1.8, 0.62, 4.4).translate(0, -0.2, 0), 0],
    [new THREE.BoxGeometry(1.6, 0.5, 2.2).translate(0, 0.36, -0.2), 1],
  ];
  for (const [x, z] of [[-0.82, 1.35], [0.82, 1.35], [-0.82, -1.4], [0.82, -1.4]]) {
    parts.push([new THREE.CylinderGeometry(0.33, 0.33, 0.24, 14).rotateZ(Math.PI / 2).translate(x, -0.33, z), 2]);
  }
  const pos: number[] = [], nor: number[] = [], kind: number[] = [];
  for (const [g, k] of parts) {
    const f = g.toNonIndexed();
    f.computeVertexNormals();
    const p = f.getAttribute('position'), n = f.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      kind.push(k);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  // Colour per vertex: body (instance colour applied in the material), glass, tyres.
  const col: number[] = [];
  for (const k of kind) col.push(...(k === 0 ? [1, 1, 1] : k === 1 ? [0.18, 0.22, 0.27] : [0.06, 0.06, 0.07]));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

export class ParkedCars {
  private readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly ax = new THREE.Vector3();
  private readonly ay = new THREE.Vector3();
  private readonly az = new THREE.Vector3();
  private readonly c = new THREE.Vector3();

  constructor(scene: THREE.Scene, private readonly count: number) {
    const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.5 });
    this.mesh = new THREE.InstancedMesh(carGeometry(), mat, Math.max(count, 1));
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, color.setHex(COLORS[i % COLORS.length]));
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** The lattices are the first `count` bodies of the map world. */
  update(frame: RenderFrame | null): void {
    if (!frame) return;
    let shown = 0;
    for (let b = 0; b < this.count && b < frame.bodyCount; b++) {
      if (frame.nodeCount[b] !== NX * NY * NZ) continue;
      const p = frame.positions, o = frame.nodeOffset[b] * 3;
      const at = (i: number, j: number, k: number, out: THREE.Vector3) => {
        const n = o + ((k * NY + j) * NX + i) * 3;
        return out.set(p[n], p[n + 1], p[n + 2]);
      };
      // Axes from opposite faces, centre from all nodes.
      const tmp = new THREE.Vector3();
      this.ax.set(0, 0, 0);
      this.ay.set(0, 0, 0);
      this.az.set(0, 0, 0);
      this.c.set(0, 0, 0);
      for (let k = 0; k < NZ; k++) {
        for (let j = 0; j < NY; j++) {
          for (let i = 0; i < NX; i++) {
            at(i, j, k, tmp);
            this.c.add(tmp);
            if (i === 0) this.ax.sub(tmp);
            if (i === NX - 1) this.ax.add(tmp);
            if (j === 0) this.ay.sub(tmp);
            if (j === NY - 1) this.ay.add(tmp);
            if (k === 0) this.az.sub(tmp);
            if (k === NZ - 1) this.az.add(tmp);
          }
        }
      }
      this.c.multiplyScalar(1 / (NX * NY * NZ));
      this.az.normalize();
      this.ay.addScaledVector(this.az, -this.ay.dot(this.az)).normalize();
      this.ax.crossVectors(this.ay, this.az);
      this.m.makeBasis(this.ax, this.ay, this.az).setPosition(this.c);
      this.mesh.setMatrixAt(shown++, this.m);
    }
    this.mesh.count = shown;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
  }
}

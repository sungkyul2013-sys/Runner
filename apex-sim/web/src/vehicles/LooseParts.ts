// Parts torn off a vehicle that its GLB does not cover (§4.3 island split): a shredded tyre's carcass (§6), a broken
// suspension link. They are shown as what they are — their nodes, at node size, in dark rubber / steel — so nothing
// the physics carries is invisible (§1.2 보이는 것 = 물리).
import * as THREE from 'three/webgpu';
import type { BodyTopology } from '../physics/messages';
import type { RenderFrame } from '../physics/PhysicsClient';

export class LooseParts {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private bodies: number[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(private readonly capacity = 2000) {
    const material = new THREE.MeshStandardNodeMaterial({ color: 0x16181b, roughness: 0.85, metalness: 0.1 });
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.group.add(this.mesh);
  }

  /** The bodies descended from `root` (island split) that `shown` (the flexbody's bodies) does not display. */
  static find(topology: BodyTopology[], root: number, shown: Set<number>): number[] {
    const family = new Set([root]);
    for (const t of topology) if (t && t.source >= 0 && family.has(t.source)) family.add(t.index);
    return [...family].filter((b) => b !== root && !shown.has(b));
  }

  setBodies(bodies: number[]): void {
    this.bodies = bodies;
  }

  get count(): number {
    return this.mesh.count;
  }

  update(frame: RenderFrame | null, topology: BodyTopology[]): void {
    let k = 0;
    if (frame) {
      for (const b of this.bodies) {
        if (b >= frame.bodyCount || !topology[b]) continue;
        const start = frame.nodeOffset[b], n = frame.nodeCount[b], radius = topology[b].radius;
        for (let i = 0; i < n && k < this.capacity; i++) {
          const o = (start + i) * 3;
          this.v.set(frame.positions[o], frame.positions[o + 1], frame.positions[o + 2]);
          this.s.setScalar(radius[i] ?? 0.03);
          this.mesh.setMatrixAt(k++, this.m.compose(this.v, this.q, this.s));
        }
      }
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

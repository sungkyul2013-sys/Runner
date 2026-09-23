// Binds a vehicle's GLB visual (VehicleModel) to its physics state every frame (§4 렌더 = 노드 위치 표시):
//   body   ← chassis frame (reference node + forward/up/left from the core, A§4.8)
//   wheels ← each physics wheel's centre, spin axis (steer + camber) and spin angle
// The body mesh is rigid in M1; per-vertex flexbody deformation from the node cage follows in M2.
import * as THREE from 'three/webgpu';
import type { VehicleState, V3 } from '../physics/telemetry';
import type { VehicleModel } from '../vehicles/VehicleModel';

/** Rotation whose columns are the given orthonormal axes (x, y, z). */
function basis(x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Chassis rotation: model +X = left, +Y = up, +Z = forward (right-handed: left × up = forward). */
export function chassisFrame(v: Pick<VehicleState, 'forward' | 'up' | 'left'>): { x: THREE.Vector3; y: THREE.Vector3; z: THREE.Vector3 } {
  const z = new THREE.Vector3(...v.forward).normalize();
  const x = new THREE.Vector3(...v.left).addScaledVector(z, -new THREE.Vector3(...v.left).dot(z)).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return { x, y, z };
}

/** Model-frame position of a render-space point. */
export function toModelFrame(v: Pick<VehicleState, 'position' | 'forward' | 'up' | 'left' | 'refCenterModel'>, p: V3): V3 {
  const { x, y, z } = chassisFrame(v);
  const d = new THREE.Vector3(p[0] - v.position[0], p[1] - v.position[1], p[2] - v.position[2]);
  return [d.dot(x) + v.refCenterModel[0], d.dot(y) + v.refCenterModel[1], d.dot(z) + v.refCenterModel[2]];
}

export class VehicleView {
  readonly group = new THREE.Group();
  private mounts: THREE.Object3D[] = [];
  private mountScale: THREE.Vector3[] = [];
  private map: number[] | null = null; // physics wheel → model wheel

  constructor(readonly model: VehicleModel) {
    this.group.add(model.root);
    model.root.matrixAutoUpdate = false;
    // Wheel mounts leave the body's hierarchy: they are placed in world space from the physics hubs.
    for (const spin of model.wheels) {
      const mount = spin.parent!;
      this.mountScale.push(mount.scale.clone());
      mount.removeFromParent();
      mount.matrixAutoUpdate = false;
      this.group.add(mount);
      this.mounts.push(mount);
    }
  }

  set visible(on: boolean) {
    this.group.visible = on;
  }

  /** Nearest model wheel for every physics wheel, in the model frame (done once, at the first pose). */
  private bindWheels(v: VehicleState): number[] {
    const meta = this.model.meta.wheels;
    const used = new Set<number>();
    return v.wheels.map((w) => {
      const p = toModelFrame(v, w.center);
      let best = -1;
      let bestD = Infinity;
      meta.forEach((m, j) => {
        if (used.has(j)) return;
        const d = Math.hypot(m.position[0] - p[0], m.position[1] - p[1], m.position[2] - p[2]);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      });
      if (best >= 0) used.add(best);
      return best;
    });
  }

  update(v: VehicleState): void {
    const { x, y, z } = chassisFrame(v);
    const q = basis(x, y, z);
    const ref = new THREE.Vector3(...v.refCenterModel).applyQuaternion(q);
    const origin = new THREE.Vector3(...v.position).sub(ref);
    this.model.root.matrix.compose(origin, q, new THREE.Vector3(1, 1, 1));
    this.model.root.matrixWorldNeedsUpdate = true;

    if (!this.map) this.map = this.bindWheels(v);
    v.wheels.forEach((w, i) => {
      const j = this.map![i];
      if (j < 0 || j >= this.mounts.length) return;
      const axis = new THREE.Vector3(...w.axis).normalize();
      const up = y.clone().addScaledVector(axis, -y.dot(axis)).normalize();
      const fwd = new THREE.Vector3().crossVectors(axis, up);
      const mount = this.mounts[j];
      mount.matrix.compose(new THREE.Vector3(...w.center), basis(axis, up, fwd), this.mountScale[j]);
      mount.matrixWorldNeedsUpdate = true;
      this.model.wheels[j].rotation.x = w.angle; // positive about the left-pointing axis = rolling forward
    });
  }

  dispose(): void {
    this.group.removeFromParent();
  }
}

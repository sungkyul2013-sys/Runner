// Binds a vehicle's GLB visual (VehicleModel) to its physics state every frame (§4 렌더 = 노드 위치 표시):
//   body   ← chassis frame (reference node + forward/up/left from the core, A§4.8)
//   wheels ← each physics wheel's centre, spin axis (steer + camber) and spin angle
//   body   ← with a node cage (vehicle JSON lattice): per-vertex flexbody deformation on the GPU (M2, Flexbody.ts);
//            without one (the rigid fallback), the chassis frame
import * as THREE from 'three/webgpu';
import type { RenderFrame } from '../physics/PhysicsClient';
import { TYRE, type VehicleState, type V3 } from '../physics/telemetry';
import type { DamageGroupDef } from '../vehicles/Damage';
import { Flexbody, type CageNode, type NodeLocator, type VehiclePartDef } from '../vehicles/Flexbody';
import type { VehicleModel } from '../vehicles/VehicleModel';
import { sampleRing, type RingSample, type WheelRest } from '../vehicles/WheelDeform';

/** A physics wheel's ring nodes: body node index of its first node (segment j: base + 4j + tread A, tread B, rim A,
 *  rim B — core addPressureWheel) and its rest geometry. Indexed like the telemetry's wheels. */
export interface WheelRings {
  base: number;
  rest: WheelRest;
}

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
  readonly flexbody: Flexbody | null = null;

  /** `cage`: the chassis lattice of physics body `body` (null: the body mesh stays rigid on the chassis frame);
   *  `damage`: the vehicle's damage groups and node rest positions (glass and lamps). */
  constructor(readonly model: VehicleModel, cage: CageNode[] | null = null, private body = -1,
              damage: { defs: DamageGroupDef[]; nodeRest: (node: number) => [number, number, number]; parts?: VehiclePartDef[] } | null = null,
              private readonly rings: Array<WheelRings | undefined> = []) {
    this.group.add(model.root);
    model.root.matrixAutoUpdate = false;
    if (cage && cage.length > 0 && body >= 0) {
      this.flexbody = new Flexbody(model.root, model.body, cage, body, damage);
      this.group.add(this.flexbody.group);
    }
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

  /** Respawned into a fresh world as body `body` (same vehicle, same node order). */
  rebind(body: number): void {
    this.body = body;
    this.flexbody?.rebind(body);
    for (const d of this.model.deforms) d.reset();
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

  /** `frame` and `locate` drive the flexbody (ignored without one). */
  update(v: VehicleState, frame: RenderFrame | null = null, locate: NodeLocator | null = null, islandVersion = 0): void {
    if (this.flexbody && frame && locate) this.flexbody.update(frame, locate, islandVersion);
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
      // §6: rim and tyre bent the way the physics rings are.
      const deform = this.model.deforms[j];
      const ring = this.rings[i];
      if (deform && ring && frame && locate) {
        deform.spin.value = w.angle;
        deform.mirror.value = Math.sign(this.mountScale[j].x) || 1;
        deform.setRings(this.ringSamples(ring, frame, locate, w.center, axis, up, fwd), ring.rest);
      }
      // §6: the tyre flattens where it meets the road by the physics deflection; a shredded one is gone (rim only).
      const tyre = this.model.tyres[j];
      if (tyre) {
        tyre.group.visible = (w.tyreFlags & TYRE.shredded) === 0;
        const deflection = w.contact ? Math.max(0, w.tyreRadius - w.loadedRadius) : 0;
        tyre.floor.value = deflection > 0.002 ? -(tyre.radius - deflection) : -2 * tyre.radius;
      }
    });
  }

  /** The four rings of a physics wheel seen from its hub (nodes no longer with the rim — a shredded tyre — skipped). */
  private ringSamples(ring: WheelRings, frame: RenderFrame, locate: NodeLocator, c: V3, axis: THREE.Vector3, up: THREE.Vector3,
                      fwd: THREE.Vector3): [RingSample[], RingSample[], RingSample[], RingSample[]] {
    const n = ring.rest.segments;
    const [rimBody] = locate(this.body, ring.base + 2);
    const out: [V3[], V3[], V3[], V3[]] = [[], [], [], []];
    for (let s = 0; s < n; s++) {
      for (let k = 0; k < 4; k++) {
        const [b, node] = locate(this.body, ring.base + 4 * s + k);
        if (b !== rimBody || b >= frame.bodyCount || node >= frame.nodeCount[b]) continue;
        const o = (frame.nodeOffset[b] + node) * 3;
        out[k].push([frame.positions[o], frame.positions[o + 1], frame.positions[o + 2]]);
      }
    }
    const a: V3 = [axis.x, axis.y, axis.z], u: V3 = [up.x, up.y, up.z], f: V3 = [fwd.x, fwd.y, fwd.z];
    const rings = out.map((pts) => sampleRing(pts, c, a, u, f)) as [RingSample[], RingSample[], RingSample[], RingSample[]];
    // Axial positions from the wheel's own mid-plane (the mean over its rings), not the hub's axle nodes (which sit
    // off it: the knuckle's inner and outer bearing).
    const all = rings.flat();
    const mid = all.length ? all.reduce((sum, s) => sum + s.axial, 0) / all.length : 0;
    for (const ring of rings) for (const s of ring) s.axial -= mid;
    return rings;
  }

  dispose(): void {
    this.flexbody?.dispose();
    this.group.removeFromParent();
  }
}

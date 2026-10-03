// Airbags (§4.4 "에어백 전개(시각 효과)"): the core's crash sensor decides (sbc/vehicle.h airbag::); this shows the
// bags on the chassis frame — inflated within 30 ms, held, then vented to a limp shape over 1.5 s.
import * as THREE from 'three/webgpu';
import { AIRBAG } from '../physics/telemetry';

type V3 = [number, number, number];
export interface AirbagDef {
  bag: keyof typeof AIRBAG;
  at: V3;   // centre, model frame
  size: V3; // half extents when inflated
}

const INFLATE = 0.03, HOLD = 0.15, VENT = 1.5; // [s]

export class Airbags {
  readonly group = new THREE.Group();
  private bags: Array<{ def: AirbagDef; mesh: THREE.Mesh; since: number }>;

  constructor(defs: AirbagDef[]) {
    const material = new THREE.MeshStandardNodeMaterial({ color: 0xf1efe9, roughness: 0.92, metalness: 0 });
    const geometry = new THREE.SphereGeometry(1, 24, 16);
    this.bags = defs.map((def) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.fromArray(def.at);
      mesh.visible = false;
      this.group.add(mesh);
      return { def, mesh, since: -1 };
    });
  }

  /** Deployed bag count (tests). */
  get deployed(): number {
    return this.bags.filter((b) => b.since >= 0).length;
  }

  /** `bits`: the core's airbag bits; `dt`: render time step [s]. */
  update(bits: number, dt: number): void {
    for (const b of this.bags) {
      if (b.since < 0 && bits & AIRBAG[b.def.bag]) b.since = 0;
      if (b.since < 0) continue;
      b.since += dt;
      const t = b.since;
      const inflate = Math.min(1, t / INFLATE);
      const vent = t > INFLATE + HOLD ? Math.min(1, (t - INFLATE - HOLD) / VENT) : 0;
      const s = inflate * (1 - 0.45 * vent);
      const [x, y, z] = b.def.size;
      b.mesh.scale.set(Math.max(1e-3, x * s), Math.max(1e-3, y * s * (1 - 0.15 * vent)), Math.max(1e-3, z * s));
      b.mesh.position.set(b.def.at[0], b.def.at[1] - 0.06 * vent, b.def.at[2]);  // sags as it empties
      b.mesh.visible = true;
    }
  }

  reset(): void {
    for (const b of this.bags) {
      b.since = -1;
      b.mesh.visible = false;
    }
  }
}

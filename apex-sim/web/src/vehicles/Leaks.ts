// Fluid leaks (§4.4 "냉각수 누출(파티클, 바닥 얼룩)"): while the core reports a coolant, oil or fuel leak, drips fall
// from the damaged components (their places come from the vehicle JSON's damage groups) and pool into stains on the
// ground. Side-effect visuals (§3): the amounts follow the fluid levels the core integrates, the drops do not act on
// anything.
import * as THREE from 'three/webgpu';
import { FAULT, type VehicleState } from '../physics/telemetry';
import { chassisFrame } from '../drive/VehicleView';
import type { DamageGroupDef, DamageStatus } from './Damage';

type Fluid = 'coolant' | 'oil' | 'fuel';
type V3 = [number, number, number];

const COLOR: Record<Fluid, number> = { coolant: 0x2f9e68, oil: 0x241709, fuel: 0x8a7f50 };
const LEAK_FAULT: Record<Fluid, number> = { coolant: FAULT.coolantLeak, oil: FAULT.oilLeak, fuel: FAULT.fuelLeak };
const DROP_L = 0.02;       // [L] per drop drawn
const MAX_DROPS = 400;
const MAX_STAINS = 160;
const MERGE = 0.25;        // [m] a drop landing this close to a stain of its fluid joins it
const FILM = 2.5e-3;       // [m] puddle depth: coolant, oil and fuel stand a few millimetres deep on asphalt
const GRAVITY = 9.80665;

interface Source {
  group: number;
  fluid: Fluid;
  at: V3; // model frame
}

interface Drop {
  p: THREE.Vector3;
  v: THREE.Vector3;
  fluid: Fluid;
}

interface Stain {
  x: number;
  y: number; // ground height where it formed
  z: number;
  litres: number;
  fluid: Fluid;
}

export class Leaks {
  readonly group = new THREE.Group();
  private sources: Source[];
  private drops: Drop[] = [];
  private stains: Stain[] = [];
  private dropMesh: THREE.InstancedMesh;
  private stainMesh: THREE.InstancedMesh;
  private owed: Record<Fluid, number> = { coolant: 0, oil: 0, fuel: 0 }; // [L] leaked, not yet dropped
  private level: Record<Fluid, number> | null = null;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private readonly c = new THREE.Color();

  constructor(defs: DamageGroupDef[], public groundY = 0) {
    this.sources = [];
    defs.forEach((d, g) => {
      const v = d.visual;
      if (v?.kind === 'component' && v.fluid && v.at) this.sources.push({ group: g, fluid: v.fluid, at: v.at });
    });
    this.dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 6, 4),
      new THREE.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.1, transparent: true, opacity: 0.85 }), MAX_DROPS);
    this.stainMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24),
      new THREE.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.5, depthWrite: false }), MAX_STAINS);
    for (const mesh of [this.dropMesh, this.stainMesh]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // The per-fluid colours must exist before the first draw: a node material compiled without an instance colour
      // attribute would keep drawing the white base colour.
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count * 3).fill(1), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.stainMesh.renderOrder = -1;
    this.group.add(this.stainMesh, this.dropMesh);
  }

  get stainCount(): number {
    return this.stains.length;
  }

  /** Litres pooled on the ground per fluid (tests). */
  pooled(fluid: Fluid): number {
    return this.stains.filter((s) => s.fluid === fluid).reduce((a, s) => a + s.litres, 0);
  }

  clear(): void {
    this.drops = [];
    this.stains = [];
    this.level = null;
    this.owed = { coolant: 0, oil: 0, fuel: 0 };
    this.dropMesh.count = 0;
    this.stainMesh.count = 0;
  }

  update(dt: number, v: VehicleState, status: DamageStatus[] | null, rand: () => number = Math.random): void {
    // What leaked since the last frame: the level drop while the core reports a leak (fuel also burns: the burn at
    // this moment is small next to a leak, and only a leaking tank drips).
    const now: Record<Fluid, number> = { coolant: v.coolantL, oil: v.oilL, fuel: v.fuelL };
    if (this.level) {
      for (const f of ['coolant', 'oil', 'fuel'] as Fluid[]) {
        if (v.faults & LEAK_FAULT[f]) this.owed[f] += Math.max(0, this.level[f] - now[f]);
      }
    }
    this.level = now;
    const { x, y, z } = chassisFrame(v);
    const toRender = (p: V3): THREE.Vector3 => {
      const d = [p[0] - v.refCenterModel[0], p[1] - v.refCenterModel[1], p[2] - v.refCenterModel[2]];
      return new THREE.Vector3(...v.position).addScaledVector(x, d[0]).addScaledVector(y, d[1]).addScaledVector(z, d[2]);
    };
    const velocity = z.clone().multiplyScalar(v.speed);
    for (const f of ['coolant', 'oil', 'fuel'] as Fluid[]) {
      const from = this.sources.filter((s) => s.fluid === f && status?.[s.group] && (status[s.group].damaged > 0 || status[s.group].impacts > 0));
      while (this.owed[f] >= DROP_L && from.length) {
        this.owed[f] -= DROP_L;
        const s = from[Math.floor(rand() * from.length)];
        const p = toRender([s.at[0] + (rand() - 0.5) * 0.3, s.at[1] - 0.05, s.at[2] + (rand() - 0.5) * 0.2]);
        if (this.drops.length < MAX_DROPS) this.drops.push({ p, v: velocity.clone(), fluid: f });
        else this.land({ p, v: velocity, fluid: f });
      }
    }
    // Fall, then pool.
    this.drops = this.drops.filter((d) => {
      d.v.y -= GRAVITY * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y > this.groundY) return true;
      this.land(d);
      return false;
    });
    this.dropMesh.count = this.drops.length;
    this.drops.forEach((d, i) => {
      this.dropMesh.setMatrixAt(i, this.m.makeTranslation(d.p.x, d.p.y, d.p.z));
      this.dropMesh.setColorAt(i, this.c.setHex(COLOR[d.fluid]));
    });
    this.dropMesh.instanceMatrix.needsUpdate = true;
    if (this.dropMesh.instanceColor) this.dropMesh.instanceColor.needsUpdate = true;
  }

  private land(d: Drop): void {
    let stain = this.stains.find((s) => s.fluid === d.fluid && Math.hypot(s.x - d.p.x, s.z - d.p.z) < MERGE);
    if (!stain) {
      if (this.stains.length >= MAX_STAINS) this.stains.shift();
      stain = { x: d.p.x, y: this.groundY, z: d.p.z, litres: 0, fluid: d.fluid };
      this.stains.push(stain);
    }
    stain.litres += DROP_L;
    // A puddle spreads to its film depth: r = √(V / (π·FILM)).
    this.stainMesh.count = this.stains.length;
    this.stains.forEach((s, i) => {
      const r = Math.min(Math.sqrt((s.litres * 1e-3) / (Math.PI * FILM)), 1.5);
      this.m.compose(new THREE.Vector3(s.x, s.y + 0.012 + i * 1e-5, s.z), this.q, new THREE.Vector3(r, r, r));
      this.stainMesh.setMatrixAt(i, this.m);
      this.stainMesh.setColorAt(i, this.c.setHex(COLOR[s.fluid]));
    });
    this.stainMesh.instanceMatrix.needsUpdate = true;
    if (this.stainMesh.instanceColor) this.stainMesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.group.removeFromParent();
  }
}

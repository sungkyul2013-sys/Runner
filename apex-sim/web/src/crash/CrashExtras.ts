// Crash lab extras (§12.7): the backdrop the test runs on (the debug grid, a road, or open country — scenery only:
// the tested ground is the same flat concrete in every case), the dump-truck crush test (two loaded dump trucks come
// down on a parked car, one on its nose and one on its tail; 16 t node-beam bodies), and the camera presets.
import * as THREE from 'three/webgpu';
import { color, mix, positionWorld, smoothstep, fract, abs, float, vec2, sin } from 'three/tsl';
import type { PhysicsClient, RenderFrame } from '../physics/PhysicsClient';
import type { LatticeParams } from '../physics/sbc';

export type Backdrop = 'grid' | 'road' | 'terrain';

/** Scenery around the test ground. The grid is the app's own; road and terrain are built here on first use. */
export class CrashBackdrop {
  private readonly road = new THREE.Group();
  private readonly land = new THREE.Group();
  private built = { road: false, terrain: false };
  kind: Backdrop = 'grid';

  constructor(private readonly scene: THREE.Scene, private readonly grid: { visible: boolean } | null) {
    this.road.visible = this.land.visible = false;
    scene.add(this.road, this.land);
  }

  set(kind: Backdrop): void {
    this.kind = kind;
    if (kind === 'road' && !this.built.road) this.buildRoad();
    if (kind === 'terrain' && !this.built.terrain) this.buildTerrain();
    this.road.visible = kind === 'road';
    this.land.visible = kind === 'terrain';
    if (this.grid) this.grid.visible = kind === 'grid';
    const sky = kind === 'grid' ? null : new THREE.Color(kind === 'road' ? 0x9fb4c8 : 0xa9c3d8);
    this.scene.background = sky ?? new THREE.Color(0x0b0d10);
    this.scene.fog = sky ? new THREE.Fog(sky, 120, 900) : new THREE.Fog(0x0b0d10, 120, 900);
  }

  /** A wide asphalt apron with lane lines along the test runs, kerbs and a verge, low buildings far off. */
  private buildRoad(): void {
    this.built.road = true;
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92 });
    const p = positionWorld.xz;
    // Asphalt grain + lane lines every 3.6 m along Z (dashes), edge lines at ±12 m, a stop bar before the barrier.
    const grain = fract(sin(p.x.mul(12.9898).add(p.y.mul(78.233))).mul(43758.5453)).mul(0.05);
    const lane = abs(fract(p.x.div(3.6).add(0.5)).sub(0.5)).mul(3.6);
    const dash = smoothstep(0.35, 0.45, fract(p.y.div(9)));
    const lines = float(1).sub(smoothstep(0.06, 0.1, lane)).mul(dash).mul(float(1).sub(smoothstep(40, 41, abs(p.x.sub(20)))));
    const asphalt = color(0x3a3d42).add(grain);
    m.colorNode = mix(asphalt, color(0xe9e6dc), lines.clamp(0, 1));
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2), m);
    apron.position.set(-20, -0.004, 0);
    apron.receiveShadow = true;
    this.road.add(apron);
    const verge = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
    verge.colorNode = mix(color(0x55703f), color(0x6d8a4a), fract(sin(positionWorld.x.mul(0.37).add(positionWorld.z.mul(0.21))).mul(1000)).mul(0.5));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), verge);
    ground.position.y = -0.02;
    this.road.add(ground);
    const kerb = new THREE.MeshStandardMaterial({ color: 0xbfc2c4, roughness: 0.8 });
    for (const x of [-150, 110]) {
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 260), kerb);
      k.position.set(x, 0.07, 0);
      this.road.add(k);
    }
    const bmat = new THREE.MeshStandardMaterial({ color: 0xb9b4aa, roughness: 0.9 });
    const rnd = mulberry(7);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2, r = 260 + rnd() * 160;
      const h = 8 + rnd() * 30;
      const b = new THREE.Mesh(new THREE.BoxGeometry(18 + rnd() * 20, h, 16 + rnd() * 20), bmat);
      b.position.set(-20 + Math.cos(a) * r, h / 2, Math.sin(a) * r);
      b.rotation.y = rnd() * Math.PI;
      this.road.add(b);
    }
  }

  /** Open country: a grass field around a concrete pad, rolling hills on the horizon. */
  private buildTerrain(): void {
    this.built.terrain = true;
    const grass = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
    const q = positionWorld.xz;
    const n = fract(sin(q.x.mul(0.11).add(q.y.mul(0.07))).mul(9173.1)).mul(0.08).add(sin(q.x.mul(0.05)).mul(sin(q.y.mul(0.04))).mul(0.06));
    const pad = float(1).sub(smoothstep(90, 96, vec2(q.x.add(20), q.y).length()));
    grass.colorNode = mix(color(0x5b7a3c).add(n), color(0x9a9890).add(n.mul(0.5)), pad);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400, 1, 1).rotateX(-Math.PI / 2), grass);
    ground.position.y = -0.004;
    ground.receiveShadow = true;
    this.land.add(ground);
    // Hills: a ring of displaced cones well away from the test area (they are scenery; nothing drives there).
    const hill = new THREE.MeshStandardMaterial({ color: 0x5e7a45, roughness: 1, flatShading: true });
    const rnd = mulberry(3);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + rnd() * 0.2, r = 520 + rnd() * 300;
      const h = 40 + rnd() * 110;
      const g = new THREE.ConeGeometry(120 + rnd() * 140, h, 9, 3);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) if (pos.getY(k) > -h / 2 + 1) pos.setXYZ(k, pos.getX(k) * (0.85 + rnd() * 0.3), pos.getY(k), pos.getZ(k) * (0.85 + rnd() * 0.3));
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, hill);
      mesh.position.set(-20 + Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
      this.land.add(mesh);
    }
    const tree = new THREE.MeshStandardMaterial({ color: 0x2f5a2c, roughness: 1, flatShading: true });
    const trunk = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 });
    for (let i = 0; i < 60; i++) {
      const a = rnd() * Math.PI * 2, r = 130 + rnd() * 250;
      const t = new THREE.Group();
      const h = 4 + rnd() * 5;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.6 + rnd(), h, 7), tree);
      crown.position.y = h / 2 + 1.5;
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.6, 6), trunk);
      st.position.y = 0.8;
      t.add(crown, st);
      t.position.set(-20 + Math.cos(a) * r, 0, Math.sin(a) * r);
      this.land.add(t);
    }
  }
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- dump trucks ----

/** Where the crush test's car waits (open ground, west of the drop pad). */
export const CRUSH_POINT: [number, number, number] = [-90, 0, 0];
const TRUCK_SIZE: [number, number, number] = [2.5, 1.5, 6.4]; // [m] the loaded chassis block (cab over, bed behind)
const TRUCK_MASS = 16000; // [kg] a loaded two-axle dump truck

/** A dump truck's look (cab, tipper bed, six wheels), placed on its node-beam block every frame. */
function truckModel(tint: number): THREE.Group {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.45, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.15, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9a9da1, roughness: 0.55, metalness: 0.15 });
  const [w, h, l] = TRUCK_SIZE;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.35, l), dark);
  frame.position.y = -h / 2 + 0.45;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(w, 1.9, 1.8), paint);
  cab.position.set(0, 0.35, l / 2 - 0.9);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 0.8, 0.05), glass);
  screen.position.set(0, 0.8, l / 2 + 0.01);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, l - 2.1), steel);
  bed.position.set(0, 0.1, -1.0);
  const load = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.4, l - 2.4), new THREE.MeshStandardMaterial({ color: 0x6e5a44, roughness: 1 }));
  load.position.set(0, 0.8, -1.0);
  g.add(frame, cab, screen, bed, load);
  const tyre = new THREE.CylinderGeometry(0.55, 0.55, 0.45, 18).rotateZ(Math.PI / 2);
  for (const z of [l / 2 - 1.3, -l / 2 + 1.6, -l / 2 + 0.5]) {
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(tyre, dark);
      t.position.set(s * (w / 2 - 0.15), -h / 2 + 0.1, z);
      g.add(t);
    }
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

interface Truck {
  body: number;
  model: THREE.Group;
  rest: Float32Array | null; // node offsets from the centroid at spawn (the block's own frame)
}

/**
 * The crush test: two dump trucks drop onto the parked car (the first over its front half, the second 0.9 s later
 * over its rear half). They are rigid-ish node-beam blocks of 16 t; the car is crushed between them and the ground.
 */
export class DumpTrucks {
  private trucks: Truck[] = [];
  private pending: Array<{ at: number; params: LatticeParams; tint: number }> = [];
  private expect: number[] = []; // tints of spawned trucks waiting for their body index

  constructor(private readonly physics: PhysicsClient, private readonly scene: THREE.Scene) {
    physics.onTopology(({ reset, added }) => {
      if (reset) this.clearModels();
      for (const b of added) {
        if (b.source >= 0 || !this.expect.length) continue;
        if (b.nodeCount !== 3 * 3 * 7) continue; // the truck block's lattice
        const tint = this.expect.shift()!;
        const model = truckModel(tint);
        this.scene.add(model);
        this.trucks.push({ body: b.index, model, rest: null });
      }
    });
  }

  private clearModels(): void {
    for (const t of this.trucks) t.model.removeFromParent();
    this.trucks = [];
  }

  /** Arms the test at sim time `now`: the car stands at CRUSH_POINT facing +Z. */
  start(now: number): void {
    this.pending = [];
    this.expect = [];
    const [x, , z] = CRUSH_POINT;
    const truck = (dz: number, drop: number): LatticeParams => ({
      center: [x + 0.15, 1.35 + TRUCK_SIZE[1] / 2 + drop, z + dz],
      size: TRUCK_SIZE,
      nodes: [3, 3, 7],
      totalMass: TRUCK_MASS,
      nodeRadius: 0.1,
      axialStiffness: 3.0e7, // EA [N]: stiff, and still stable at the 2 kHz step with 254 kg nodes (ω·dt ≈ 0.8)
      dampingRatio: 0.12,
      yieldStrain: 0,
      hardening: 0,
      breakStrain: 0,
      deformLimit: 0,
      material: 0,
      velocity: [0, -3.5, 0],
      yawPitchRoll: [0.08, 0, 0],
    });
    this.pending.push({ at: now + 0.15, params: truck(1.6, 1.4), tint: 0xe0a321 }, { at: now + 1.05, params: truck(-1.9, 1.6), tint: 0xc4442f });
  }

  /** Per frame: releases the trucks on time and places their models on their blocks. */
  update(simTime: number, frame: RenderFrame | null): void {
    while (this.pending.length && simTime >= this.pending[0].at) {
      const p = this.pending.shift()!;
      this.expect.push(p.tint);
      this.physics.spawnLattice(p.params, 'dump truck');
    }
    if (!frame) return;
    for (const t of this.trucks) {
      if (t.body >= frame.bodyCount) continue;
      const off = frame.nodeOffset[t.body], n = frame.nodeCount[t.body];
      const pos = frame.positions;
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < n; i++) {
        cx += pos[(off + i) * 3];
        cy += pos[(off + i) * 3 + 1];
        cz += pos[(off + i) * 3 + 2];
      }
      cx /= n; cy /= n; cz /= n;
      if (!t.rest) {
        t.rest = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          t.rest[i * 3] = pos[(off + i) * 3] - cx;
          t.rest[i * 3 + 1] = pos[(off + i) * 3 + 1] - cy;
          t.rest[i * 3 + 2] = pos[(off + i) * 3 + 2] - cz;
        }
      }
      // Block axes: the mean of the nodes on the + side of each rest axis minus those on the − side.
      const ax = new THREE.Vector3(), az = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const px = pos[(off + i) * 3] - cx, py = pos[(off + i) * 3 + 1] - cy, pz = pos[(off + i) * 3 + 2] - cz;
        const sx = Math.sign(Math.round(t.rest[i * 3] * 100)), sz = Math.sign(Math.round(t.rest[i * 3 + 2] * 100));
        ax.x += sx * px; ax.y += sx * py; ax.z += sx * pz;
        az.x += sz * px; az.y += sz * py; az.z += sz * pz;
      }
      ax.normalize();
      az.addScaledVector(ax, -az.dot(ax)).normalize();
      const ay = new THREE.Vector3().crossVectors(az, ax);
      t.model.matrix.makeBasis(ax, ay, az).setPosition(cx, cy, cz);
      t.model.matrixAutoUpdate = false;
      t.model.matrixWorldNeedsUpdate = true;
    }
  }

  clear(): void {
    this.pending = [];
    this.expect = [];
    this.clearModels();
  }
}

/** Camera presets of the lab: where the camera goes relative to the point of impact. */
export type CameraPreset = 'side' | 'front' | 'top' | 'rear';
export function cameraPreset(p: CameraPreset, focus: THREE.Vector3): { position: THREE.Vector3; target: THREE.Vector3 } {
  const t = focus.clone().setY(Math.max(focus.y, 0.6));
  const off = p === 'side' ? new THREE.Vector3(9, 1.6, 0) : p === 'front' ? new THREE.Vector3(1.5, 1.8, 10) : p === 'top' ? new THREE.Vector3(0.01, 16, 0.01) : new THREE.Vector3(-1.5, 2.2, -11);
  return { position: t.clone().add(off), target: t };
}

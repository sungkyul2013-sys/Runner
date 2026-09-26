// Glass granules and lamp shards (§4.3 "파편은 물리 파티클"): side-effect particles that do not act on vehicles
// (§3: effects that do not interact with the vehicle may use a separate, simple physics). Ballistic flight with
// gravity and air drag, bounce and friction on the ground plane, then rest; the oldest are recycled at capacity.
import * as THREE from 'three/webgpu';

type V3 = [number, number, number];

export interface DebrisKind {
  size: number;        // [m] edge of a particle
  sizeJitter: number;  // ± fraction
  restitution: number;
  friction: number;    // ground friction coefficient
  material: THREE.Material;
}

const GRAVITY = 9.80665;
const DRAG = 0.6; // [1/s] linear air drag on small fragments

export class Debris {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private pos: Float32Array;
  private vel: Float32Array;
  private spin: Float32Array; // axis·angular speed
  private rot: THREE.Quaternion[];
  private scale: Float32Array;
  private resting: Uint8Array;
  private count = 0;
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly dq = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();

  /** `groundY`: height of the ground plane in render space. */
  constructor(private readonly kind: DebrisKind, readonly capacity = 3000, public groundY = 0) {
    const geometry = new THREE.BoxGeometry(1, 0.35, 0.8);
    this.mesh = new THREE.InstancedMesh(geometry, kind.material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Per-shard colours (lamp lenses) must exist before the first draw (see Leaks).
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.group.add(this.mesh);
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.spin = new Float32Array(capacity * 3);
    this.rot = Array.from({ length: capacity }, () => new THREE.Quaternion());
    this.scale = new Float32Array(capacity);
    this.resting = new Uint8Array(capacity);
  }

  get alive(): number {
    return this.count;
  }

  /** Adds particles at `points` moving with `velocities` plus a random scatter of `spread` [m/s]; `colors` optional. */
  spawn(points: V3[], velocities: V3[], spread: number, colors?: THREE.Color[], rand: () => number = Math.random): void {
    points.forEach((p, k) => {
      const i = this.next;
      this.next = (this.next + 1) % this.capacity;
      this.count = Math.min(this.count + 1, this.capacity);
      const v = velocities[k] ?? [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        this.pos[i * 3 + c] = p[c];
        this.vel[i * 3 + c] = v[c] + (rand() * 2 - 1) * spread + (c === 1 ? 0.3 * spread : 0);
        this.spin[i * 3 + c] = (rand() * 2 - 1) * 25;
      }
      this.rot[i].setFromEuler(new THREE.Euler(rand() * 6.3, rand() * 6.3, rand() * 6.3));
      this.scale[i] = this.kind.size * (1 + (rand() * 2 - 1) * this.kind.sizeJitter);
      this.resting[i] = 0;
      if (colors?.[k]) this.mesh.setColorAt(i, colors[k]);
    });
    this.mesh.count = this.count;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Advances the particles by `dt` [s] (render time; sub-stepped for stability). */
  update(dt: number): void {
    if (this.count === 0) return;
    const steps = Math.max(1, Math.ceil(dt / 0.008));
    const h = Math.min(dt, 0.1) / steps;
    const { restitution, friction } = this.kind;
    for (let i = 0; i < this.count; i++) {
      if (this.resting[i]) continue;
      const o = i * 3;
      for (let s = 0; s < steps; s++) {
        const damp = 1 - DRAG * h;
        this.vel[o] *= damp;
        this.vel[o + 1] = this.vel[o + 1] * damp - GRAVITY * h;
        this.vel[o + 2] *= damp;
        this.pos[o] += this.vel[o] * h;
        this.pos[o + 1] += this.vel[o + 1] * h;
        this.pos[o + 2] += this.vel[o + 2] * h;
        const floor = this.groundY + this.scale[i] * 0.2;
        if (this.pos[o + 1] < floor) {
          this.pos[o + 1] = floor;
          if (this.vel[o + 1] < 0) {
            const vn = -this.vel[o + 1];
            this.vel[o + 1] = vn * restitution;
            // Coulomb friction impulse on the tangential velocity.
            const vt = Math.hypot(this.vel[o], this.vel[o + 2]);
            const cut = vt > 0 ? Math.max(0, 1 - (friction * (1 + restitution) * vn) / vt) : 0;
            this.vel[o] *= cut;
            this.vel[o + 2] *= cut;
            for (let c = 0; c < 3; c++) this.spin[o + c] *= 0.6;
          }
          if (Math.abs(this.vel[o + 1]) < 0.15 && Math.hypot(this.vel[o], this.vel[o + 2]) < 0.05) {
            this.resting[i] = 1;
            break;
          }
        }
      }
      const w = Math.hypot(this.spin[o], this.spin[o + 1], this.spin[o + 2]);
      if (w > 0 && !this.resting[i]) {
        this.axis.set(this.spin[o] / w, this.spin[o + 1] / w, this.spin[o + 2] / w);
        this.dq.setFromAxisAngle(this.axis, w * dt);
        this.rot[i].premultiply(this.dq);
      }
      this.v.set(this.pos[o], this.pos[o + 1], this.pos[o + 2]);
      this.s.setScalar(this.scale[i]);
      this.q.copy(this.rot[i]);
      this.mesh.setMatrixAt(i, this.m.compose(this.v, this.q, this.s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.count = 0;
    this.next = 0;
    this.mesh.count = 0;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

/** Tempered-glass granules: small, clear, bouncy on asphalt. */
export function glassDebris(): Debris {
  return new Debris({
    size: 0.009,
    sizeJitter: 0.4,
    restitution: 0.3,
    friction: 0.5,
    material: new THREE.MeshStandardNodeMaterial({ color: 0xd8ecf2, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.85 }),
  }, 4000);
}

/** Lamp-lens shards: larger, coloured per shard (instance colour) by the lens they came from. */
export function lampDebris(): Debris {
  return new Debris({
    size: 0.018,
    sizeJitter: 0.5,
    restitution: 0.2,
    friction: 0.6,
    material: new THREE.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.9 }),
  }, 1500);
}

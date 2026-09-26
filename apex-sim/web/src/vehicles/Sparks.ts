// Rim sparks (§6 "림으로만 주행 — 불꽃"): a wheel whose rim scrapes the road throws short-lived glowing particles from
// the contact, as many as the core's spark intensity (contact force × sliding speed) asks for. Side effect only (§3):
// ballistic flight, a bounce off the ground, and they burn out in a fraction of a second.
import * as THREE from 'three/webgpu';

type V3 = [number, number, number];

const GRAVITY = 9.80665;
const LIFE = 0.35; // [s] mean
const RATE = 900; // particles per second at full intensity

export class Sparks {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly age: Float32Array;
  private next = 0;
  private live = 0;
  private carry = 0; // fractional particle left over from the last frame
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly z = new THREE.Vector3(0, 0, 1);

  constructor(readonly capacity = 1200, public groundY = 0) {
    // A streak along its velocity (unlit, hot orange-white).
    const material = new THREE.MeshBasicNodeMaterial({ color: 0xffc36b, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.group.add(this.mesh);
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.age = new Float32Array(capacity).fill(1e9);
  }

  /** Live particles (tests). */
  get alive(): number {
    return this.live;
  }

  /** Throws sparks from `point` for `dt` seconds at `intensity` [0, 1]; `base`: the road-relative velocity they leave with. */
  emit(point: V3, base: V3, intensity: number, dt: number, rand: () => number = Math.random): void {
    this.carry += Math.min(1, intensity) * RATE * dt;
    for (; this.carry >= 1; this.carry--) {
      const i = this.next;
      this.next = (this.next + 1) % this.capacity;
      const o = i * 3;
      for (let c = 0; c < 3; c++) {
        this.pos[o + c] = point[c];
        this.vel[o + c] = base[c] + (rand() * 2 - 1) * 2.5 + (c === 1 ? 1.5 + rand() * 2.5 : 0);
      }
      this.life[i] = LIFE * (0.5 + rand());
      this.age[i] = 0;
    }
  }

  update(dt: number): void {
    const h = Math.min(dt, 0.05);
    let count = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += h;
      const o = i * 3;
      this.vel[o + 1] -= GRAVITY * h;
      for (let c = 0; c < 3; c++) this.pos[o + c] += this.vel[o + c] * h;
      if (this.pos[o + 1] < this.groundY && this.vel[o + 1] < 0) {
        this.pos[o + 1] = this.groundY;
        this.vel[o + 1] *= -0.35;
        this.vel[o] *= 0.7;
        this.vel[o + 2] *= 0.7;
      }
      const fade = Math.max(0, 1 - this.age[i] / this.life[i]);
      this.v.set(this.vel[o], this.vel[o + 1], this.vel[o + 2]);
      const speed = this.v.length();
      this.q.setFromUnitVectors(this.z, speed > 1e-6 ? this.v.divideScalar(speed) : this.z);
      const w = 0.006 * fade;
      this.s.set(w, w, Math.max(w, Math.min(0.12, speed * 0.012)) * fade);
      this.v.set(this.pos[o], this.pos[o + 1], this.pos[o + 2]);
      this.mesh.setMatrixAt(count++, this.m.compose(this.v, this.q, this.s));
    }
    this.live = count;
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.age.fill(1e9);
    this.live = 0;
    this.mesh.count = 0;
  }
}

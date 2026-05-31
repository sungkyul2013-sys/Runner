import * as THREE from 'three';
import { ObjectPool } from '../world/ObjectPool';

// Shared geometry; each particle keeps its own (recoloured) basic material.
let sharedGeo: THREE.BoxGeometry | null = null;
function geo(): THREE.BoxGeometry {
  if (!sharedGeo) sharedGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  return sharedGeo;
}

class Particle {
  readonly mesh: THREE.Mesh;
  readonly vel = new THREE.Vector3();
  life = 0;
  maxLife = 1;
  gravity = -9;

  constructor() {
    this.mesh = new THREE.Mesh(
      geo(),
      new THREE.MeshBasicMaterial({ transparent: true }),
    );
    this.mesh.visible = false;
  }
  get mat(): THREE.MeshBasicMaterial {
    return this.mesh.material as THREE.MeshBasicMaterial;
  }
}

export interface BurstOptions {
  count?: number;
  speed?: number;
  life?: number;
  gravity?: number;
  size?: number;
}

/**
 * Pooled particle bursts for juice: coin sparkles, crash debris, bomb blasts,
 * jump puffs, power-up auras. Particles fly out, fall under gravity, shrink and
 * fade, then return to the pool — zero steady-state allocation.
 */
export class ParticleSystem {
  readonly group = new THREE.Group();
  private readonly pool: ObjectPool<Particle>;
  private active: Particle[] = [];

  constructor() {
    this.pool = new ObjectPool<Particle>(
      () => {
        const p = new Particle();
        this.group.add(p.mesh);
        return p;
      },
      (p) => {
        p.mesh.visible = false;
      },
    );
  }

  burst(pos: THREE.Vector3, color: number, opts: BurstOptions = {}): void {
    const count = opts.count ?? 10;
    const speed = opts.speed ?? 5;
    const life = opts.life ?? 0.6;
    const size = opts.size ?? 1;
    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      p.mesh.position.copy(pos);
      p.mesh.scale.setScalar(size);
      p.mesh.visible = true;
      p.mat.color.setHex(color);
      p.mat.opacity = 1;
      p.life = 0;
      p.maxLife = life * (0.7 + Math.random() * 0.6);
      p.gravity = opts.gravity ?? -9;
      // Random outward velocity (biased upward).
      const a = Math.random() * Math.PI * 2;
      const up = 0.4 + Math.random();
      const r = Math.random() * speed;
      p.vel.set(Math.cos(a) * r, up * speed, Math.sin(a) * r);
      this.active.push(p);
    }
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.pool.release(p);
        const last = this.active.length - 1;
        this.active[i] = this.active[last];
        this.active.pop();
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const t = 1 - p.life / p.maxLife;
      p.mat.opacity = t;
      p.mesh.scale.setScalar(Math.max(0.02, t));
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.y += dt * 5;
    }
  }

  reset(): void {
    for (const p of this.active) this.pool.release(p);
    this.active = [];
  }
}

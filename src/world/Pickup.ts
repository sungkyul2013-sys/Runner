import * as THREE from 'three';
import { POWERUPS, PowerupType } from '../config/powerups';

// Shared geometry (one glowing octahedron) + per-type material cache.
let geo: THREE.OctahedronGeometry | null = null;
const matCache = new Map<PowerupType, THREE.MeshStandardMaterial>();

function geometry(): THREE.OctahedronGeometry {
  if (!geo) geo = new THREE.OctahedronGeometry(0.5, 0);
  return geo;
}

function materialFor(type: PowerupType): THREE.MeshStandardMaterial {
  let m = matCache.get(type);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: POWERUPS[type].color,
      emissive: POWERUPS[type].color,
      emissiveIntensity: 0.45,
      metalness: 0.3,
      roughness: 0.35,
    });
    matCache.set(type, m);
  }
  return m;
}

export function disposePickupResources(): void {
  geo?.dispose();
  geo = null;
  for (const m of matCache.values()) m.dispose();
  matCache.clear();
}

/** A floating, spinning power-up token. Pooled like coins/obstacles. */
export class Pickup {
  readonly mesh = new THREE.Mesh(geometry());
  type: PowerupType = PowerupType.MAGNET;
  collected = false;

  constructor() {
    this.mesh.visible = false;
  }

  configure(type: PowerupType, x: number, y: number, z: number): void {
    this.type = type;
    this.mesh.material = materialFor(type);
    this.mesh.position.set(x, y, z);
    this.mesh.visible = true;
    this.collected = false;
  }

  update(scroll: number, dt: number): void {
    this.mesh.position.z += scroll;
    this.mesh.rotation.y += dt * 2;
    this.mesh.rotation.x += dt * 1.2;
  }

  get position(): THREE.Vector3 {
    return this.mesh.position;
  }
  get z(): number {
    return this.mesh.position.z;
  }

  reset(): void {
    this.mesh.visible = false;
    this.collected = false;
  }
}

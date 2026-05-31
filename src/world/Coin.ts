import * as THREE from 'three';
import { COIN_RADIUS, COLORS } from '../config/constants';

// Shared geometry/material — one disc reused by every pooled coin.
let coinGeo: THREE.CylinderGeometry | null = null;
let coinMat: THREE.MeshStandardMaterial | null = null;

function resources(): { geo: THREE.CylinderGeometry; mat: THREE.MeshStandardMaterial } {
  if (!coinGeo || !coinMat) {
    coinGeo = new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, 0.07, 16);
    // Lay the disc vertical (axis along Z) so it faces the camera and flips
    // about Y as it spins.
    coinGeo.rotateX(Math.PI / 2);
    coinMat = new THREE.MeshStandardMaterial({
      color: COLORS.coin,
      emissive: COLORS.coin,
      emissiveIntensity: 0.6,
      metalness: 0.7,
      roughness: 0.3,
    });
  }
  return { geo: coinGeo, mat: coinMat };
}

export function disposeCoinResources(): void {
  coinGeo?.dispose();
  coinMat?.dispose();
  coinGeo = null;
  coinMat = null;
}

/** A single pooled, spinning coin. */
export class Coin {
  readonly mesh: THREE.Mesh;
  collected = false;

  constructor() {
    const { geo, mat } = resources();
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.visible = false;
  }

  configure(x: number, y: number, z: number): void {
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.set(0, Math.random() * Math.PI, 0);
    this.mesh.visible = true;
    this.collected = false;
  }

  /** Scroll toward the camera and spin. */
  update(scroll: number, dt: number): void {
    this.mesh.position.z += scroll;
    this.mesh.rotation.y += dt * 5;
  }

  /** Magnet pull toward a point (frame-rate independent). */
  pullToward(x: number, y: number, z: number, dt: number): void {
    const t = 1 - Math.exp(-12 * dt);
    this.mesh.position.x += (x - this.mesh.position.x) * t;
    this.mesh.position.y += (y - this.mesh.position.y) * t;
    this.mesh.position.z += (z - this.mesh.position.z) * t;
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

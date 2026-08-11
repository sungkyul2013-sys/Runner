import * as THREE from 'three';
import {
  COIN_PICKUP_RADIUS,
  COIN_RADIUS,
  COLORS,
  RECYCLE_BEHIND,
} from '../config/constants';
import { Player, PLAYER_Z } from '../player/Player';
import type { PathPoint } from '../world/pathing';

/** Instance capacity — comfortably above the worst-case active coin count. */
const MAX_COINS = 320;

interface CoinRec {
  idx: number;
  x: number;
  y: number;
  z: number;
  spin: number;
  collected: boolean;
}

/**
 * Coins rendered as a single {@link THREE.InstancedMesh} — one draw call for
 * every coin on screen — while keeping full per-coin gameplay: the trail is laid
 * along the survivable line traced through each segment, magnet attraction
 * vacuums them in, and a free-list of instance indices means no per-frame
 * allocation. `onCollect(pos)` fires once per coin for score and FX.
 */
export class CoinSystem {
  readonly group = new THREE.Group();

  private readonly mesh: THREE.InstancedMesh;
  private readonly geo: THREE.CylinderGeometry;
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly dummy = new THREE.Object3D();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);

  private readonly free: number[] = [];
  private active: CoinRec[] = [];

  private readonly tmp = new THREE.Vector3();
  private readonly tmpPos = new THREE.Vector3();

  /** Fraction of the traced line that actually gets coins (mode dependent). */
  density = 1;

  constructor(private readonly onCollect: (pos: THREE.Vector3) => void) {
    this.geo = new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, 0.09, 18);
    this.geo.rotateX(Math.PI / 2); // face the camera, spin about Y
    this.mat = new THREE.MeshStandardMaterial({
      color: COLORS.coin,
      emissive: COLORS.coin,
      emissiveIntensity: 0.9, // bright enough for the bloom pass to catch
      metalness: 0.85,
      roughness: 0.22,
    });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, MAX_COINS);
    this.mesh.frustumCulled = false; // instances span the whole yard
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = MAX_COINS - 1; i >= 0; i--) {
      this.mesh.setMatrixAt(i, this.zero);
      this.free.push(i);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.mesh);
  }

  /** Lay a coin trail along a traced line starting at a segment's near edge. */
  layPath(points: readonly PathPoint[], nearZ: number, skip = 0): void {
    for (let i = 0; i < points.length; i++) {
      if (skip > 0 && i % (skip + 1) !== 0) continue;
      if (this.density < 1 && Math.random() > this.density) continue;
      const idx = this.free.pop();
      if (idx === undefined) return; // at capacity
      const p = points[i];
      this.active.push({
        idx, x: p.x, y: p.y, z: nearZ - p.dz, spin: Math.random() * Math.PI, collected: false,
      });
    }
  }

  update(scroll: number, dt: number, player: Player, magnetRadius = 0): void {
    const px = player.posX;
    const py = player.feet + 0.85;
    const recycleZ = PLAYER_Z + RECYCLE_BEHIND;
    const magnetSq = magnetRadius * magnetRadius;
    const pull = 1 - Math.exp(-11 * dt);

    for (let i = this.active.length - 1; i >= 0; i--) {
      const c = this.active[i];
      c.z += scroll;
      c.spin += dt * 5.5;

      if (magnetRadius > 0) {
        const dx = px - c.x, dy = py - c.y, dz = PLAYER_Z - c.z;
        if (dx * dx + dy * dy + dz * dz < magnetSq) {
          c.x += dx * pull;
          c.y += dy * pull;
          c.z += dz * pull;
        }
      }

      this.tmpPos.set(c.x, c.y, c.z);
      this.tmp.set(px, py, PLAYER_Z);
      if (!c.collected && this.tmpPos.distanceTo(this.tmp) < COIN_PICKUP_RADIUS) {
        c.collected = true;
        this.onCollect(this.tmpPos);
        this.release(i);
        continue;
      }
      if (c.z > recycleZ) {
        this.release(i);
        continue;
      }

      this.dummy.position.set(c.x, c.y, c.z);
      this.dummy.rotation.set(0, c.spin, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(c.idx, this.dummy.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private release(i: number): void {
    const c = this.active[i];
    this.mesh.setMatrixAt(c.idx, this.zero);
    this.free.push(c.idx);
    const last = this.active.length - 1;
    this.active[i] = this.active[last];
    this.active.pop();
  }

  reset(): void {
    for (const c of this.active) {
      this.mesh.setMatrixAt(c.idx, this.zero);
      this.free.push(c.idx);
    }
    this.active = [];
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

import * as THREE from 'three';
import {
  COIN_GROUND_Y,
  COIN_PICKUP_RADIUS,
  COIN_RADIUS,
  COLORS,
  GRAVITY,
  JUMP_VELOCITY,
  laneToX,
  LANES,
  RECYCLE_BEHIND,
  SEGMENT_LENGTH,
} from '../config/constants';
import { Player, PLAYER_Z } from '../player/Player';

const PATTERN_COUNT = 6;
const COIN_SPACING = 1.6;
/** Instance capacity — comfortably above the worst-case active coin count. */
const MAX_COINS = 120;

interface CoinRec {
  idx: number;
  x: number;
  y: number;
  z: number;
  spin: number;
  collected: boolean;
}

type Pattern = 'LINE' | 'ARCH';

/**
 * Coins rendered as a single {@link THREE.InstancedMesh} (one draw call for all
 * coins, Phase 8 perf) while keeping per-coin gameplay: spawn patterns, magnet
 * attraction, pickup and recycle. A free-list of instance indices avoids any
 * per-frame allocation. `onCollect(pos)` fires once per coin for fx/score.
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
  private nextSpawnZ = -SEGMENT_LENGTH;

  private readonly tmp = new THREE.Vector3();
  private readonly tmpPos = new THREE.Vector3();

  constructor(private readonly onCollect: (pos: THREE.Vector3) => void) {
    this.geo = new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, 0.07, 16);
    this.geo.rotateX(Math.PI / 2); // face the camera, flip about Y
    this.mat = new THREE.MeshStandardMaterial({
      color: COLORS.coin,
      emissive: COLORS.coin,
      emissiveIntensity: 0.85, // bright enough for the bloom pass to catch
      metalness: 0.7,
      roughness: 0.25,
    });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, MAX_COINS);
    this.mesh.frustumCulled = false; // instances span the whole track
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = MAX_COINS - 1; i >= 0; i--) {
      this.mesh.setMatrixAt(i, this.zero);
      this.free.push(i);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.mesh);

    this.fillAhead();
  }

  update(scroll: number, dt: number, player: Player, magnetRadius = 0): void {
    this.nextSpawnZ += scroll;

    const px = player.posX;
    const py = player.feet + 0.85;
    const recycleZ = PLAYER_Z + RECYCLE_BEHIND;
    const magnetSq = magnetRadius * magnetRadius;
    const pull = 1 - Math.exp(-12 * dt);

    for (let i = this.active.length - 1; i >= 0; i--) {
      const c = this.active[i];
      c.z += scroll;
      c.spin += dt * 5;

      if (magnetRadius > 0) {
        const dx = px - c.x, dy = py - c.y, dz = PLAYER_Z - c.z;
        if (dx * dx + dy * dy + dz * dz < magnetSq) {
          c.x += dx * pull;
          c.y += dy * pull;
          c.z += dz * pull;
        }
      }

      // Pickup.
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

      // Write the instance transform.
      this.dummy.position.set(c.x, c.y, c.z);
      this.dummy.rotation.set(0, c.spin, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(c.idx, this.dummy.matrix);
    }

    this.fillAhead();
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

  private fillAhead(): void {
    while (this.nextSpawnZ > -SEGMENT_LENGTH * 7) {
      this.spawnPattern(this.nextSpawnZ);
      this.nextSpawnZ -= SEGMENT_LENGTH;
    }
  }

  private spawnPattern(centerZ: number): void {
    const x = laneToX(LANES[(Math.random() * LANES.length) | 0]);
    const pattern: Pattern = Math.random() < 0.5 ? 'LINE' : 'ARCH';
    const startZ = centerZ - ((PATTERN_COUNT - 1) * COIN_SPACING) / 2;
    const apex = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);

    for (let i = 0; i < PATTERN_COUNT; i++) {
      const idx = this.free.pop();
      if (idx === undefined) return; // at capacity
      const z = startZ + i * COIN_SPACING;
      let y = COIN_GROUND_Y;
      if (pattern === 'ARCH') {
        const t = i / (PATTERN_COUNT - 1);
        y = COIN_GROUND_Y + Math.sin(t * Math.PI) * apex;
      }
      this.active.push({ idx, x, y, z, spin: Math.random() * Math.PI, collected: false });
    }
  }

  reset(): void {
    for (const c of this.active) {
      this.mesh.setMatrixAt(c.idx, this.zero);
      this.free.push(c.idx);
    }
    this.active = [];
    this.mesh.instanceMatrix.needsUpdate = true;
    this.nextSpawnZ = -SEGMENT_LENGTH;
    this.fillAhead();
  }
}

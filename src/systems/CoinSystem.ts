import * as THREE from 'three';
import {
  COIN_GROUND_Y,
  COIN_PICKUP_RADIUS,
  JUMP_VELOCITY,
  GRAVITY,
  laneToX,
  LANES,
  RECYCLE_BEHIND,
  SEGMENT_LENGTH,
} from '../config/constants';
import { Player, PLAYER_Z } from '../player/Player';
import { Coin } from '../world/Coin';
import { ObjectPool } from '../world/ObjectPool';

/** Coins per spawned pattern. */
const PATTERN_COUNT = 6;
const COIN_SPACING = 1.6;

type Pattern = 'LINE' | 'ARCH';

/**
 * Spawns coin patterns ahead of the player and handles collection (with an
 * optional magnet radius for the Magnet power-up). Mirrors {@link SegmentManager}'s
 * spawn-ahead / recycle-behind model and reuses {@link ObjectPool}. Calls
 * `onCollect` once per coin picked up so score/missions/SFX can react.
 */
export class CoinSystem {
  readonly group = new THREE.Group();

  private readonly pool: ObjectPool<Coin>;
  private active: Coin[] = [];
  private nextSpawnZ = -SEGMENT_LENGTH;

  private readonly tmp = new THREE.Vector3();

  constructor(private readonly onCollect: () => void) {
    this.pool = new ObjectPool<Coin>(
      () => {
        const c = new Coin();
        this.group.add(c.mesh);
        return c;
      },
      (c) => c.reset(),
    );
    this.fillAhead();
  }

  /** @param magnetRadius >0 attracts nearby coins toward the player. */
  update(scroll: number, dt: number, player: Player, magnetRadius = 0): void {
    this.nextSpawnZ += scroll;

    const px = player.posX;
    const py = player.feet + 0.85;
    const recycleZ = PLAYER_Z + RECYCLE_BEHIND;
    const magnetSq = magnetRadius * magnetRadius;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const c = this.active[i];
      c.update(scroll, dt);

      if (magnetRadius > 0) {
        const dx = px - c.position.x;
        const dy = py - c.position.y;
        const dz = PLAYER_Z - c.position.z;
        if (dx * dx + dy * dy + dz * dz < magnetSq) {
          c.pullToward(px, py, PLAYER_Z, dt);
        }
      }

      // Pickup test.
      this.tmp.set(px, py, PLAYER_Z);
      if (!c.collected && c.position.distanceTo(this.tmp) < COIN_PICKUP_RADIUS) {
        c.collected = true;
        this.onCollect();
        this.release(i);
        continue;
      }
      if (c.z > recycleZ) this.release(i);
    }

    this.fillAhead();
  }

  private release(i: number): void {
    this.pool.release(this.active[i]);
    const last = this.active.length - 1;
    this.active[i] = this.active[last];
    this.active.pop();
  }

  private fillAhead(): void {
    // Keep coins populated a little less far than obstacles.
    while (this.nextSpawnZ > -SEGMENT_LENGTH * 7) {
      this.spawnPattern(this.nextSpawnZ);
      this.nextSpawnZ -= SEGMENT_LENGTH;
    }
  }

  private spawnPattern(centerZ: number): void {
    const lane = LANES[(Math.random() * LANES.length) | 0];
    const x = laneToX(lane);
    const pattern: Pattern = Math.random() < 0.5 ? 'LINE' : 'ARCH';
    const startZ = centerZ - ((PATTERN_COUNT - 1) * COIN_SPACING) / 2;

    // ARCH traces the player's natural jump parabola so it rewards jumping.
    const apex = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY); // ~1.78
    for (let i = 0; i < PATTERN_COUNT; i++) {
      const z = startZ + i * COIN_SPACING;
      let y = COIN_GROUND_Y;
      if (pattern === 'ARCH') {
        const t = i / (PATTERN_COUNT - 1); // 0..1
        y = COIN_GROUND_Y + Math.sin(t * Math.PI) * apex;
      }
      const c = this.pool.acquire();
      c.configure(x, y, z);
      this.active.push(c);
    }
  }

  reset(): void {
    for (const c of this.active) this.pool.release(c);
    this.active = [];
    this.nextSpawnZ = -SEGMENT_LENGTH;
    this.fillAhead();
  }
}

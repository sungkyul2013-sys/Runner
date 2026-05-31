import * as THREE from 'three';
import {
  RECYCLE_BEHIND,
  SEGMENT_LENGTH,
  SLOT_SPACING,
  SPAWN_AHEAD,
} from '../config/constants';
import { PLAYER_Z } from '../player/Player';
import { Obstacle } from './Obstacle';
import { ObjectPool } from './ObjectPool';
import { TEMPLATES, type SegmentTemplate } from './segments/templates';

/** Empty warmup segments at run start so the player gets a clear runway. */
const WARMUP_SEGMENTS = 3;
/** Distance (units) of travel before each successive difficulty tier unlocks. */
const DIFFICULTY_STEP = 350;
const MAX_DIFFICULTY = 3;

/**
 * Procedurally fills the track with obstacle segments ahead of the player and
 * recycles them once they pass behind, reusing a single {@link ObjectPool} so
 * the active obstacle count stays bounded (no per-frame allocation, no leak).
 * Difficulty rises with distance by widening the pool of eligible templates.
 */
export class SegmentManager {
  readonly group = new THREE.Group();

  private readonly pool: ObjectPool<Obstacle>;
  private active: Obstacle[] = [];

  /** Near-edge Z of the next segment to spawn (more negative = further ahead). */
  private nextSpawnZ = PLAYER_Z;
  private segmentsSpawned = 0;

  constructor() {
    this.pool = new ObjectPool<Obstacle>(
      () => {
        const o = new Obstacle();
        this.group.add(o.mesh); // mesh stays parented; visibility is toggled
        return o;
      },
      (o) => o.reset(),
    );
    this.fillAhead(0);
  }

  /** Live obstacle list for the collision system to test against. */
  get obstacles(): readonly Obstacle[] {
    return this.active;
  }

  /** Advance the world: scroll, recycle behind, and spawn new content ahead. */
  update(scroll: number, dt: number, distance: number): void {
    this.nextSpawnZ += scroll;

    // Move + recycle (swap-remove to keep it allocation-free).
    const recycleZ = PLAYER_Z + RECYCLE_BEHIND;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const o = this.active[i];
      o.update(scroll, dt);
      if (o.z > recycleZ) {
        this.pool.release(o);
        const last = this.active.length - 1;
        this.active[i] = this.active[last];
        this.active.pop();
      }
    }

    this.fillAhead(distance);
  }

  /** Spawn segments until the track is populated out to SPAWN_AHEAD. */
  private fillAhead(distance: number): void {
    while (this.nextSpawnZ > -SPAWN_AHEAD) {
      const template =
        this.segmentsSpawned < WARMUP_SEGMENTS
          ? TEMPLATES[0] // empty warmup
          : this.pickTemplate(distance);
      this.spawnSegment(this.nextSpawnZ, template);
      this.nextSpawnZ -= SEGMENT_LENGTH;
      this.segmentsSpawned++;
    }
  }

  /** Pick a random template whose difficulty is unlocked by current distance. */
  private pickTemplate(distance: number): SegmentTemplate {
    const maxDiff = Math.min(
      MAX_DIFFICULTY,
      Math.floor(distance / DIFFICULTY_STEP),
    );
    const eligible = TEMPLATES.filter((t) => t.difficulty <= maxDiff);
    return eligible[(Math.random() * eligible.length) | 0];
  }

  /** Instantiate one template's obstacles at the given near-edge Z. */
  private spawnSegment(nearZ: number, template: SegmentTemplate): void {
    for (const p of template.placements) {
      const z = nearZ - (p.slot + 0.5) * SLOT_SPACING;
      const o = this.pool.acquire();
      o.configure(p.kind, p.lane, z);
      this.active.push(o);
    }
  }

  /**
   * Destroy (recycle) every destructible obstacle within `range` ahead of the
   * player — used by the Bomb power-up. Returns the world positions cleared so
   * the caller can spawn explosion FX. Walls (non-destructible) survive.
   */
  destroyAhead(range: number): THREE.Vector3[] {
    const cleared: THREE.Vector3[] = [];
    const minZ = PLAYER_Z - range;
    const maxZ = PLAYER_Z + 2;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const o = this.active[i];
      if (o.destructible && o.z >= minZ && o.z <= maxZ) {
        cleared.push(o.mesh.position.clone());
        this.pool.release(o);
        const last = this.active.length - 1;
        this.active[i] = this.active[last];
        this.active.pop();
      }
    }
    return cleared;
  }

  /** Clear all obstacles and reset the spawn cursor for a fresh run. */
  reset(): void {
    for (const o of this.active) this.pool.release(o);
    this.active = [];
    this.nextSpawnZ = PLAYER_Z;
    this.segmentsSpawned = 0;
    this.fillAhead(0);
  }
}

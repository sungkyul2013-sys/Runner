import * as THREE from 'three';
import { PLAYER_Z } from '../player/Player';
import type { Obstacle } from '../world/Obstacle';

/** Only obstacles within this Z window of the player can possibly collide. */
const Z_CHECK_RANGE = 4;

/**
 * Custom axis-aligned bounding-box (AABB) collision. No physics engine — for a
 * lane runner a per-frame box overlap test against nearby obstacles is exact
 * and cheap. Returns the first obstacle overlapping the player, or null.
 */
export class CollisionSystem {
  check(
    playerBox: THREE.Box3,
    obstacles: readonly Obstacle[],
  ): Obstacle | null {
    for (const o of obstacles) {
      // Cheap Z reject before the full box test.
      if (Math.abs(o.z - PLAYER_Z) > Z_CHECK_RANGE) continue;
      if (playerBox.intersectsBox(o.aabb)) return o;
    }
    return null;
  }
}

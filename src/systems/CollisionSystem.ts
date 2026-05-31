import { LAND_TOLERANCE } from '../config/constants';
import type { Player } from '../player/Player';
import { PLAYER_Z } from '../player/Player';
import type { Obstacle } from '../world/Obstacle';

/** Only obstacles within this Z window of the player can interact. */
const Z_CHECK_RANGE = 4;
/** A non-fatal pass this close (units) counts as a near-miss (Phase 7 bonus). */
const NEAR_MISS_MARGIN = 0.35;

export interface CollisionResult {
  /** The obstacle that killed the player this frame, or null. */
  fatal: Obstacle | null;
  /** Support height under the player (0 = track, >0 = riding a roof). */
  supportY: number;
  /** True if the player squeaked past an obstacle without hitting it. */
  nearMiss: boolean;
}

/**
 * Custom AABB collision for the lane runner. In one pass it computes:
 *  - the highest **rideable roof** the player is standing/landing on (support),
 *  - the first **fatal** hit (side/under contact, or any solid obstacle),
 *  - whether a **near-miss** occurred (close pass, no contact).
 * No physics engine needed — box overlap is exact and cheap here.
 */
export class CollisionSystem {
  resolve(player: Player, obstacles: readonly Obstacle[]): CollisionResult {
    const pbox = player.aabb;
    const feet = player.feet;
    const vy = player.verticalVelocity;

    let fatal: Obstacle | null = null;
    let supportY = 0;
    let nearMiss = false;

    for (const o of obstacles) {
      if (Math.abs(o.z - PLAYER_Z) > Z_CHECK_RANGE) continue;

      const ob = o.aabb;
      const overlapX = pbox.min.x <= ob.max.x && pbox.max.x >= ob.min.x;
      const overlapZ = pbox.min.z <= ob.max.z && pbox.max.z >= ob.min.z;

      if (!(overlapX && overlapZ)) {
        // No horizontal overlap — was it a near-miss in the adjacent lane?
        const dx = Math.max(ob.min.x - pbox.max.x, pbox.min.x - ob.max.x);
        const dz = Math.max(ob.min.z - pbox.max.z, pbox.min.z - ob.max.z);
        if (dx <= NEAR_MISS_MARGIN && dx > 0 && dz < 0) nearMiss = true;
        continue;
      }

      if (o.rideable) {
        const top = o.topY;
        // Landing on / standing on the roof while descending → safe support.
        if (feet >= top - LAND_TOLERANCE && vy <= 0.01) {
          if (top > supportY) supportY = top;
          continue;
        }
        // Below the roof but horizontally inside → smashed into its side.
        if (pbox.min.y < top - 0.05) fatal = o;
        continue;
      }

      // Solid obstacle: any box overlap is fatal (jump/slide shrink the player
      // box so cleared barriers/tunnels simply don't overlap).
      if (pbox.min.y <= ob.max.y && pbox.max.y >= ob.min.y) fatal = o;
    }

    return { fatal, supportY, nearMiss };
  }
}

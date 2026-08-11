import { LAND_TOLERANCE } from '../config/constants';
import type { Player } from '../player/Player';
import { PLAYER_Z } from '../player/Player';
import { Obstacle, ObstacleKind } from '../world/Obstacle';

/** Only obstacles within this Z window of the player can interact. */
const Z_CHECK_RANGE = 6;
/** A non-fatal pass this close (units) counts as a near-miss bonus. */
const NEAR_MISS_MARGIN = 0.4;

/**
 * Obstacles you merely *trip over* rather than slam into. Clipping one of these
 * makes the runner stumble — the inspector closes right up and a second mistake
 * inside the recovery window ends the run.
 */
const TRIP_KINDS = new Set<ObstacleKind>([
  ObstacleKind.BARRIER,
  ObstacleKind.CRATE,
  ObstacleKind.GATE,
]);

export interface CollisionResult {
  /** The obstacle that hit the player this frame, or null. */
  hit: Obstacle | null;
  /** True when the hit is a trip (survivable as a stumble) rather than a slam. */
  trip: boolean;
  /** Support height under the player (0 = ballast, >0 = riding a roof). */
  supportY: number;
  /** True if the player squeaked past an obstacle without touching it. */
  nearMiss: boolean;
  /** True while the player's feet are on a carriage roof. */
  onRoof: boolean;
}

/**
 * Analytic AABB collision for the yard. In a single pass it resolves:
 *  - the highest **walkable surface** under the player (carriage roofs and the
 *    interpolated slope of a boarding ramp), so roof-running just works,
 *  - the first **impact**, tagged as a trip or a slam,
 *  - whether a **near-miss** occurred (a close pass with no contact).
 * No physics engine required — box overlap is exact and cheap at this scale.
 */
export class CollisionSystem {
  resolve(player: Player, obstacles: readonly Obstacle[]): CollisionResult {
    const pbox = player.aabb;
    const feet = player.feet;

    let hit: Obstacle | null = null;
    let trip = false;
    let supportY = 0;
    let nearMiss = false;

    for (const o of obstacles) {
      if (Math.abs(o.z - PLAYER_Z) > Z_CHECK_RANGE + o.halfZ) continue;

      const ob = o.aabb;
      const overlapX = pbox.min.x <= ob.max.x && pbox.max.x >= ob.min.x;

      if (o.rideable) {
        const surf = o.surfaceAt(PLAYER_Z);
        if (surf >= 0 && overlapX) {
          if (feet >= surf - LAND_TOLERANCE) {
            if (surf > supportY) supportY = surf;
            continue; // standing on (or landing onto) the roof
          }
          // Below the deck and inside its footprint → ran into the body.
          if (pbox.max.y > ob.min.y && pbox.min.y < ob.max.y) {
            if (!hit) {
              hit = o;
              trip = TRIP_KINDS.has(o.kind);
            }
          }
          continue;
        }
        if (surf >= 0) {
          // Correct Z but wrong lane — still a candidate for a near-miss.
          const dx = Math.max(ob.min.x - pbox.max.x, pbox.min.x - ob.max.x);
          if (dx > 0 && dx <= NEAR_MISS_MARGIN) nearMiss = true;
        }
        continue;
      }

      // ── Solid, non-rideable pieces ──
      const overlapZ = pbox.min.z <= ob.max.z && pbox.max.z >= ob.min.z;
      if (!(overlapX && overlapZ)) {
        const dx = Math.max(ob.min.x - pbox.max.x, pbox.min.x - ob.max.x);
        const dz = Math.max(ob.min.z - pbox.max.z, pbox.min.z - ob.max.z);
        if (dx > 0 && dx <= NEAR_MISS_MARGIN && dz < 0) nearMiss = true;
        continue;
      }
      if (pbox.min.y <= ob.max.y && pbox.max.y >= ob.min.y && !hit) {
        hit = o;
        trip = TRIP_KINDS.has(o.kind);
      }
    }

    return { hit, trip, supportY, nearMiss, onRoof: supportY > 0.5 };
  }
}

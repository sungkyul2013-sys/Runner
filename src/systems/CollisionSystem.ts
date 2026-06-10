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
    const px = player.posX;

    let fatal: Obstacle | null = null;
    let supportY = 0;
    let nearMiss = false;

    for (const o of obstacles) {
      if (Math.abs(o.z - PLAYER_Z) > Z_CHECK_RANGE + o.rampLen) continue;

      // ── Rideable obstacles with a boarding ramp (run up the front stairs) ──
      if (o.rideable) {
        const top = o.topY;
        const inLaneX = Math.abs(px - o.position.x) <= o.halfX;
        if (inLaneX && o.rampLen > 0) {
          // Player Z is fixed near PLAYER_Z; the ramp scrolls toward them, so
          // map the obstacle's front/ramp edges (relative to the player) onto a
          // 0→top height ramp. When standing on the ramp/roof we provide support
          // rather than a fatal side hit.
          const front = o.bodyFrontZ; // roof front edge
          const start = o.rampStartZ; // ramp foot (further toward player, +Z)
          if (PLAYER_Z <= start && PLAYER_Z >= o.position.z - o.halfZ) {
            let surf: number;
            if (PLAYER_Z >= front) {
              // On the ramp incline: height rises from 0 (foot) to top (roof).
              const t = (start - PLAYER_Z) / (start - front); // 0..1
              surf = top * Math.min(1, Math.max(0, t));
            } else {
              // On the flat roof.
              surf = top;
            }
            // Accept the surface as support if the feet are near/above it.
            if (feet >= surf - LAND_TOLERANCE) {
              if (surf > supportY) supportY = surf;
            } else if (PLAYER_Z < front - 0.1) {
              // Below the roof and past the ramp → ran into the solid front face.
              fatal = o;
            }
            continue;
          }
        }
        // No ramp (or out of lane) — fall back to top-landing like a crate.
        const ob = o.aabb;
        const overlapX = pbox.min.x <= ob.max.x && pbox.max.x >= ob.min.x;
        const overlapZ = pbox.min.z <= ob.max.z && pbox.max.z >= ob.min.z;
        if (overlapX && overlapZ) {
          if (feet >= top - LAND_TOLERANCE && vy <= 0.01) {
            if (top > supportY) supportY = top;
          } else if (pbox.min.y < top - 0.05) {
            fatal = o;
          }
        }
        continue;
      }

      // ── Solid obstacles ──
      const ob = o.aabb;
      const overlapX = pbox.min.x <= ob.max.x && pbox.max.x >= ob.min.x;
      const overlapZ = pbox.min.z <= ob.max.z && pbox.max.z >= ob.min.z;
      if (!(overlapX && overlapZ)) {
        const dx = Math.max(ob.min.x - pbox.max.x, pbox.min.x - ob.max.x);
        const dz = Math.max(ob.min.z - pbox.max.z, pbox.min.z - ob.max.z);
        if (dx <= NEAR_MISS_MARGIN && dx > 0 && dz < 0) nearMiss = true;
        continue;
      }
      // Any box overlap is fatal (jump/slide shrink the player box so cleared
      // barriers/tunnels simply don't overlap).
      if (pbox.min.y <= ob.max.y && pbox.max.y >= ob.min.y) fatal = o;
    }

    return { fatal, supportY, nearMiss };
  }
}

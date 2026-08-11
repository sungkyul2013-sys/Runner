import {
  COIN_GROUND_Y,
  GRAVITY,
  JUMP_VELOCITY,
  laneToX,
  LOW_ROOF,
  PLAYER_HALF_STANDING,
  SLOT_LEN,
} from '../config/constants';
import type { Cell, SegmentLayout } from './SegmentManager';

/** One sampled point along the survivable line through a segment. */
export interface PathPoint {
  x: number;
  y: number;
  /** Distance into the segment from its near (+Z) edge. */
  dz: number;
  /** True where the line arcs over a hurdle — good spot for a coin arch. */
  airborne: boolean;
}

/** Spacing between sampled coins along the line. */
export const PATH_SPACING = 1.7;

/** Peak of a standing jump — the arch height coins are drawn at. */
const APEX = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);
/** Height of the runner while upright (used for overhead clearance). */
const STAND_HEIGHT = PLAYER_HALF_STANDING.y * 2;

function passable(c: Cell): boolean {
  if (!c.blocked) return true;
  // A blocked cell is still walkable if its roof is within a plain jump.
  return c.surface > 0 && c.surface <= LOW_ROOF + 0.01;
}

/** Cost of standing in a cell — used to prefer the calmest lane. */
function cost(c: Cell): number {
  if (!passable(c)) return 100;
  let k = 0;
  if (c.blocked) k += 3; // has to be boarded
  if (c.action === 'jump') k += 1;
  if (c.action === 'roll') k += 1;
  if (c.surface + STAND_HEIGHT > c.ceiling) k += 1; // has to be taken rolling
  return k;
}

/**
 * Walks a segment's occupancy grid and returns a survivable line through it —
 * the route the coin trail is laid along, so the coins themselves teach the
 * player where to go (rise over a hurdle, drop under a gantry, climb a ramp and
 * sprint the carriage roof). Greedy with a one-slot lookahead, biased toward
 * holding a lane so the trail reads as a deliberate route rather than a zigzag.
 */
export function tracePath(layout: SegmentLayout, startLane = 0): {
  points: PathPoint[];
  endLane: number;
} {
  const { grid, slots } = layout;
  const laneOf: number[] = [];
  let lane = startLane;

  for (let s = 0; s < slots; s++) {
    let best = lane;
    let bestCost = Infinity;
    for (const cand of [lane, lane - 1, lane + 1, lane - 2, lane + 2]) {
      if (cand < -1 || cand > 1) continue;
      const step = Math.abs(cand - lane);
      const c = grid[s][cand + 1];
      let k = cost(c) + step * 0.6;
      // One-slot lookahead keeps the line from walking into a dead end.
      if (s + 1 < slots) k += cost(grid[s + 1][cand + 1]) * 0.5;
      if (k < bestCost) {
        bestCost = k;
        best = cand;
      }
    }
    lane = best;
    laneOf.push(lane);
  }

  const points: PathPoint[] = [];
  const total = slots * SLOT_LEN;
  for (let dz = SLOT_LEN * 0.4; dz < total - SLOT_LEN * 0.3; dz += PATH_SPACING) {
    const s = Math.min(slots - 1, Math.floor(dz / SLOT_LEN));
    const cell = grid[s][laneOf[s] + 1];
    // Smoothly slide X between this slot's lane and the next one's.
    const frac = dz / SLOT_LEN - s;
    const nextLane = laneOf[Math.min(slots - 1, s + 1)];
    const x = laneToX(laneOf[s] + (nextLane - laneOf[s]) * Math.max(0, frac - 0.45) * 1.8);

    let y = COIN_GROUND_Y;
    let airborne = false;
    if (cell.surface > 0) {
      y = cell.surface + COIN_GROUND_Y;
    } else if (cell.action === 'jump') {
      // Arch the trail over the hurdle across this slot.
      const t = Math.min(1, Math.max(0, frac));
      y = COIN_GROUND_Y + Math.sin(t * Math.PI) * APEX * 0.85;
      airborne = true;
    } else if (cell.action === 'roll') {
      y = 0.55;
    }
    // Under a bore or a roof gantry the trail hugs the deck so it reads as
    // "get down here" rather than leading the player into the soffit.
    if (cell.surface + STAND_HEIGHT > cell.ceiling) y = cell.surface + 0.5;
    points.push({ x, y, dz, airborne });
  }

  return { points, endLane: lane };
}

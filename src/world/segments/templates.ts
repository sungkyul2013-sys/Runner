import { ObstacleKind } from '../Obstacle';

/** A single obstacle placement within a segment. */
export interface Placement {
  /** Slot row index 0..SLOTS_PER_SEGMENT-1 (0 = nearest the near edge). */
  slot: number;
  /** Lane index -1 | 0 | 1. */
  lane: -1 | 0 | 1;
  kind: ObstacleKind;
}

export interface SegmentTemplate {
  /** Lower = appears earlier / easier. Gated by distance travelled. */
  difficulty: number;
  /** Human note describing the intended survivable path (design intent). */
  safePath: string;
  placements: Placement[];
}

const K = ObstacleKind;

/**
 * Curated template set. **Invariant:** every template leaves at least one
 * survivable path — either a fully-empty lane, or a lane whose only hazards are
 * jump/slide types on non-adjacent slots (so a single action clears each). This
 * is what guarantees "always clearable" no matter the spawn sequence.
 */
export const TEMPLATES: SegmentTemplate[] = [
  // ── Difficulty 0 — warmup ──────────────────────────────────────────────
  { difficulty: 0, safePath: 'any lane (empty)', placements: [] },
  {
    difficulty: 0,
    safePath: 'lanes ±1 empty, or jump centre',
    placements: [{ slot: 2, lane: 0, kind: K.BARRIER }],
  },
  {
    difficulty: 0,
    safePath: 'lanes ±1 empty, or slide centre',
    placements: [{ slot: 2, lane: 0, kind: K.TUNNEL }],
  },
  {
    difficulty: 0,
    safePath: 'lanes 0/1 empty',
    placements: [{ slot: 2, lane: -1, kind: K.TRAIN }],
  },
  {
    difficulty: 0,
    safePath: 'lanes -1/0 empty',
    placements: [{ slot: 2, lane: 1, kind: K.TRAIN }],
  },

  // ── Difficulty 1 ───────────────────────────────────────────────────────
  {
    difficulty: 1,
    safePath: 'jump any lane',
    placements: [
      { slot: 2, lane: -1, kind: K.BARRIER },
      { slot: 2, lane: 0, kind: K.BARRIER },
      { slot: 2, lane: 1, kind: K.BARRIER },
    ],
  },
  {
    difficulty: 1,
    safePath: 'slide any lane',
    placements: [
      { slot: 2, lane: -1, kind: K.TUNNEL },
      { slot: 2, lane: 0, kind: K.TUNNEL },
      { slot: 2, lane: 1, kind: K.TUNNEL },
    ],
  },
  {
    difficulty: 1,
    safePath: 'centre lane empty',
    placements: [
      { slot: 2, lane: -1, kind: K.TRAIN },
      { slot: 2, lane: 1, kind: K.TRAIN },
    ],
  },
  {
    difficulty: 1,
    safePath: 'centre lane empty (weave past side trains)',
    placements: [
      { slot: 1, lane: -1, kind: K.TRAIN_MOVING },
      { slot: 3, lane: 1, kind: K.TRAIN },
    ],
  },
  {
    difficulty: 1,
    safePath: 'lanes ±1 empty, or jump centre twice (slots 1 & 3)',
    placements: [
      { slot: 1, lane: 0, kind: K.BARRIER },
      { slot: 3, lane: 0, kind: K.BARRIER },
    ],
  },

  // ── Difficulty 2 ───────────────────────────────────────────────────────
  {
    difficulty: 2,
    safePath: 'centre empty (train left, jump-barrier right)',
    placements: [
      { slot: 2, lane: -1, kind: K.TRAIN },
      { slot: 2, lane: 1, kind: K.BARRIER },
    ],
  },
  {
    difficulty: 2,
    safePath: 'slide on a side lane (centre train blocks)',
    placements: [
      { slot: 2, lane: 0, kind: K.TRAIN },
      { slot: 2, lane: -1, kind: K.TUNNEL },
      { slot: 2, lane: 1, kind: K.TUNNEL },
    ],
  },
  {
    difficulty: 2,
    safePath: 'lane +1 empty throughout',
    placements: [
      { slot: 1, lane: -1, kind: K.TRAIN_MOVING },
      { slot: 2, lane: 0, kind: K.BARRIER },
      { slot: 3, lane: -1, kind: K.WALL },
    ],
  },

  // ── Difficulty 3 — corridor shifts (force lane changes) ────────────────
  {
    difficulty: 3,
    safePath: 'start lane -1 (slot1), cross to lane +1 (slot3); slot2 clear',
    placements: [
      { slot: 1, lane: 0, kind: K.TRAIN },
      { slot: 1, lane: 1, kind: K.TRAIN },
      { slot: 3, lane: -1, kind: K.TRAIN },
      { slot: 3, lane: 0, kind: K.TRAIN },
    ],
  },
  {
    difficulty: 3,
    safePath: 'lane -1: slide slot1, then empty; sides blocked by walls/trains',
    placements: [
      { slot: 1, lane: -1, kind: K.TUNNEL },
      { slot: 1, lane: 0, kind: K.WALL },
      { slot: 2, lane: 1, kind: K.TRAIN_MOVING },
      { slot: 3, lane: 0, kind: K.BARRIER },
    ],
  },

  // ── Rideable & duck variety (jump onto roofs, slide under signs) ────────
  {
    difficulty: 1,
    safePath: 'jump onto the low train, or pass on a side lane',
    placements: [{ slot: 2, lane: 0, kind: K.LOW_TRAIN }],
  },
  {
    difficulty: 1,
    safePath: 'lanes 0/1 empty, or hop onto the crate',
    placements: [{ slot: 2, lane: -1, kind: K.CRATE }],
  },
  {
    difficulty: 2,
    safePath: 'centre empty, or jump onto either side crate',
    placements: [
      { slot: 2, lane: -1, kind: K.CRATE },
      { slot: 2, lane: 1, kind: K.CRATE },
    ],
  },
  {
    difficulty: 2,
    safePath: 'slide under any sign',
    placements: [
      { slot: 2, lane: -1, kind: K.SIGN },
      { slot: 2, lane: 0, kind: K.SIGN },
      { slot: 2, lane: 1, kind: K.SIGN },
    ],
  },
  {
    difficulty: 3,
    safePath: 'centre: jump onto the low train (sides blocked by trains)',
    placements: [
      { slot: 2, lane: -1, kind: K.TRAIN },
      { slot: 2, lane: 0, kind: K.LOW_TRAIN },
      { slot: 2, lane: 1, kind: K.TRAIN },
    ],
  },
  {
    difficulty: 3,
    safePath: 'lane 0: slide sign (slot1), then ride low train (slot3); sides walled',
    placements: [
      { slot: 1, lane: 0, kind: K.SIGN },
      { slot: 2, lane: -1, kind: K.WALL },
      { slot: 2, lane: 1, kind: K.WALL },
      { slot: 3, lane: 0, kind: K.LOW_TRAIN },
    ],
  },
];

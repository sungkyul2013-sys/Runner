import { kindLength, ObstacleKind } from '../Obstacle';
import { SLOT_LEN } from '../../config/constants';

/**
 * A single obstacle placement inside a segment.
 *
 * `slot` is the **nearest** authoring slot the piece occupies (0 = the segment's
 * near edge, i.e. the first thing the player meets). A piece automatically
 * occupies `SPECS[kind].slots` consecutive slots from there, so a seven-slot
 * rake laid at slot 2 fills slots 2‥8 and no other piece may share them.
 */
export interface Placement {
  slot: number;
  lane: -1 | 0 | 1;
  kind: ObstacleKind;
}

export interface SegmentTemplate {
  /** Lower = unlocked earlier. Gated by distance travelled. */
  difficulty: number;
  /** Total length of the template in slots. */
  slots: number;
  /** Human note describing the intended survivable line (design intent). */
  safePath: string;
  placements: Placement[];
  /** Optional tag used by the spawner to avoid repeating set-pieces. */
  tag?: string;
}

const K = ObstacleKind;

/** Centre-of-piece offset (world units) from the segment's near edge. */
export function placementOffset(p: Placement): number {
  return p.slot * SLOT_LEN + kindLength(p.kind) / 2;
}

/**
 * The curated layout book. **Invariant:** every template leaves at least one
 * survivable line under the real physics — verified by `npm run check:templates`,
 * which walks the grid with the actual jump arc, roll window, roof heights and
 * ramp boarding rules.
 */
export const TEMPLATES: SegmentTemplate[] = [
  // ── 0 · Warm-up ─────────────────────────────────────────────────────────
  { difficulty: 0, slots: 8, safePath: 'open yard', placements: [] },
  {
    difficulty: 0, slots: 10, safePath: 'sides clear, or hurdle the middle',
    placements: [{ slot: 5, lane: 0, kind: K.BARRIER }],
  },
  {
    difficulty: 0, slots: 10, safePath: 'sides clear, or roll the middle gate',
    placements: [{ slot: 5, lane: 0, kind: K.GATE }],
  },
  {
    difficulty: 0, slots: 10, safePath: 'lanes 0/+1 clear',
    placements: [{ slot: 3, lane: -1, kind: K.TRAIN_LOW }],
  },
  {
    difficulty: 0, slots: 10, safePath: 'lanes −1/0 clear',
    placements: [{ slot: 3, lane: 1, kind: K.TRAIN_TALL }],
  },
  {
    difficulty: 0, slots: 10, safePath: 'hop the crate or take a side lane',
    placements: [{ slot: 5, lane: 0, kind: K.CRATE }],
  },

  // ── 1 · Basics ──────────────────────────────────────────────────────────
  {
    difficulty: 1, slots: 10, safePath: 'jump — every lane hurdled',
    placements: [
      { slot: 5, lane: -1, kind: K.BARRIER },
      { slot: 5, lane: 0, kind: K.BARRIER },
      { slot: 5, lane: 1, kind: K.BARRIER },
    ],
  },
  {
    difficulty: 1, slots: 10, safePath: 'roll — every lane gated',
    placements: [
      { slot: 5, lane: -1, kind: K.GATE },
      { slot: 5, lane: 0, kind: K.GATE },
      { slot: 5, lane: 1, kind: K.GATE },
    ],
  },
  {
    difficulty: 1, slots: 10, safePath: 'centre lane runs clear between two rakes',
    placements: [
      { slot: 3, lane: -1, kind: K.TRAIN_TALL },
      { slot: 3, lane: 1, kind: K.TRAIN_TALL },
    ],
  },
  {
    difficulty: 1, slots: 12, safePath: 'sides clear — or ramp onto the centre carriage',
    tag: 'ramp-ride',
    placements: [
      { slot: 3, lane: 0, kind: K.RAMP },
      { slot: 4, lane: 0, kind: K.TRAIN_LOW },
    ],
  },
  {
    difficulty: 1, slots: 12, safePath: 'sides clear, or double-hurdle the middle',
    placements: [
      { slot: 3, lane: 0, kind: K.BARRIER },
      { slot: 8, lane: 0, kind: K.BARRIER },
    ],
  },
  {
    difficulty: 1, slots: 12, safePath: 'jump the hurdle, then roll the gate — any lane',
    placements: [
      { slot: 3, lane: -1, kind: K.BARRIER },
      { slot: 3, lane: 0, kind: K.BARRIER },
      { slot: 3, lane: 1, kind: K.BARRIER },
      { slot: 8, lane: -1, kind: K.GATE },
      { slot: 8, lane: 0, kind: K.GATE },
      { slot: 8, lane: 1, kind: K.GATE },
    ],
  },

  // ── 2 · Yard weaving ────────────────────────────────────────────────────
  {
    difficulty: 2, slots: 12, safePath: 'centre blocked — roll a side gate',
    placements: [
      { slot: 4, lane: 0, kind: K.TRAIN_TALL },
      { slot: 8, lane: -1, kind: K.GATE },
      { slot: 8, lane: 1, kind: K.GATE },
    ],
  },
  {
    difficulty: 2, slots: 12, safePath: 'staggered hurdles: hold a lane and hop, or weave',
    placements: [
      { slot: 2, lane: -1, kind: K.BARRIER },
      { slot: 5, lane: 0, kind: K.BARRIER },
      { slot: 8, lane: 1, kind: K.BARRIER },
    ],
  },
  {
    difficulty: 2, slots: 14, safePath: 'weave: left rake first, then right rake',
    placements: [
      { slot: 2, lane: -1, kind: K.TRAIN_TALL },
      { slot: 8, lane: 1, kind: K.TRAIN_TALL },
    ],
  },
  {
    difficulty: 2, slots: 12, safePath: 'dodge the pylon, hop the crate',
    placements: [
      { slot: 4, lane: 0, kind: K.PYLON },
      { slot: 8, lane: -1, kind: K.CRATE },
      { slot: 8, lane: 1, kind: K.BARRIER },
    ],
  },
  {
    difficulty: 2, slots: 14, safePath: 'ramp onto the long rake and sprint its roof — or hold lane +1',
    tag: 'roof-run',
    placements: [
      { slot: 2, lane: 0, kind: K.RAMP },
      { slot: 3, lane: 0, kind: K.TRAIN_LOW_LONG },
      { slot: 4, lane: -1, kind: K.TRAIN_TALL },
    ],
  },
  {
    difficulty: 2, slots: 12, safePath: 'buffer stop centre — sides open',
    placements: [
      { slot: 5, lane: 0, kind: K.BUFFER },
      { slot: 9, lane: 1, kind: K.BARRIER },
    ],
  },
  {
    difficulty: 2, slots: 14, safePath: 'two low rakes to hop between, or run the free right lane',
    placements: [
      { slot: 2, lane: -1, kind: K.TRAIN_LOW },
      { slot: 8, lane: 0, kind: K.TRAIN_LOW },
    ],
  },

  // ── 3 · Pressure ────────────────────────────────────────────────────────
  {
    difficulty: 3, slots: 14, safePath: 'corridor: centre stays open the whole way',
    placements: [
      { slot: 1, lane: -1, kind: K.TRAIN_TALL_LONG },
      { slot: 4, lane: 1, kind: K.TRAIN_TALL_LONG },
    ],
  },
  {
    difficulty: 3, slots: 14, safePath: 'left rake, then cut right past the pylon',
    placements: [
      { slot: 2, lane: 0, kind: K.TRAIN_TALL },
      { slot: 2, lane: 1, kind: K.TRAIN_TALL },
      { slot: 8, lane: -1, kind: K.TRAIN_TALL },
      { slot: 8, lane: 0, kind: K.PYLON },
    ],
  },
  {
    difficulty: 3, slots: 16, safePath: 'ride the centre rake, rolling under the roof gantry',
    tag: 'roof-gate',
    placements: [
      { slot: 2, lane: 0, kind: K.RAMP },
      { slot: 3, lane: 0, kind: K.TRAIN_LOW_LONG },
      { slot: 6, lane: 0, kind: K.ROOF_GATE },
      { slot: 3, lane: -1, kind: K.TRAIN_TALL },
      { slot: 8, lane: 1, kind: K.TRAIN_TALL },
    ],
  },
  {
    difficulty: 3, slots: 14, safePath: 'hurdle, gate, hurdle — hold any lane and act three times',
    placements: [
      { slot: 2, lane: -1, kind: K.BARRIER },
      { slot: 2, lane: 0, kind: K.BARRIER },
      { slot: 2, lane: 1, kind: K.BARRIER },
      { slot: 6, lane: -1, kind: K.GATE },
      { slot: 6, lane: 0, kind: K.GATE },
      { slot: 6, lane: 1, kind: K.GATE },
      { slot: 10, lane: -1, kind: K.BARRIER },
      { slot: 10, lane: 0, kind: K.BARRIER },
      { slot: 10, lane: 1, kind: K.BARRIER },
    ],
  },
  {
    difficulty: 3, slots: 16, safePath: 'express roars down lane −1 — stay right',
    tag: 'express',
    placements: [
      { slot: 6, lane: -1, kind: K.TRAIN_EXPRESS },
      { slot: 3, lane: 1, kind: K.BARRIER },
    ],
  },
  {
    difficulty: 3, slots: 16, safePath: 'express down the centre — pick a flank and hurdle',
    tag: 'express',
    placements: [
      { slot: 7, lane: 0, kind: K.TRAIN_EXPRESS },
      { slot: 3, lane: -1, kind: K.BARRIER },
      { slot: 3, lane: 1, kind: K.GATE },
    ],
  },
  {
    difficulty: 3, slots: 16, safePath: 'lane +1 free; left pair forces an early commit',
    placements: [
      { slot: 1, lane: -1, kind: K.TRAIN_TALL_LONG },
      { slot: 2, lane: 0, kind: K.TRAIN_LOW_LONG },
      { slot: 1, lane: 1, kind: K.RAMP },
      { slot: 11, lane: 1, kind: K.BARRIER },
    ],
  },

  // ── 4 · Set-pieces ──────────────────────────────────────────────────────
  {
    difficulty: 4, slots: 18, safePath: 'roof highway: ramp up, sprint two rakes, roll the gantry',
    tag: 'roof-run',
    placements: [
      { slot: 1, lane: 0, kind: K.RAMP },
      { slot: 2, lane: 0, kind: K.TRAIN_LOW_LONG },
      { slot: 5, lane: 0, kind: K.ROOF_GATE },
      { slot: 9, lane: 0, kind: K.TRAIN_LOW_LONG },
      { slot: 2, lane: -1, kind: K.TRAIN_TALL_LONG },
      { slot: 9, lane: -1, kind: K.TRAIN_TALL },
      { slot: 13, lane: 1, kind: K.BARRIER },
    ],
  },
  {
    difficulty: 4, slots: 16, safePath: 'slalom: three rakes staggered across the yard',
    placements: [
      { slot: 1, lane: -1, kind: K.TRAIN_TALL },
      { slot: 1, lane: 0, kind: K.TRAIN_TALL },
      { slot: 6, lane: 0, kind: K.TRAIN_TALL },
      { slot: 6, lane: 1, kind: K.TRAIN_TALL },
      { slot: 11, lane: -1, kind: K.TRAIN_TALL },
      { slot: 11, lane: 0, kind: K.TRAIN_TALL },
    ],
  },
  {
    difficulty: 4, slots: 18, safePath: 'gauntlet: hurdle, weave the rake, roll the gantry',
    placements: [
      { slot: 1, lane: -1, kind: K.BARRIER },
      { slot: 1, lane: 0, kind: K.BARRIER },
      { slot: 1, lane: 1, kind: K.BARRIER },
      { slot: 5, lane: -1, kind: K.TRAIN_TALL },
      { slot: 5, lane: 1, kind: K.TRAIN_TALL },
      { slot: 11, lane: -1, kind: K.GATE },
      { slot: 11, lane: 0, kind: K.GATE },
      { slot: 11, lane: 1, kind: K.GATE },
      { slot: 15, lane: 0, kind: K.PYLON },
    ],
  },
  {
    difficulty: 4, slots: 18, safePath: 'express left + rake right — thread the middle, hurdle late',
    tag: 'express',
    placements: [
      { slot: 8, lane: -1, kind: K.TRAIN_EXPRESS },
      { slot: 2, lane: 1, kind: K.TRAIN_TALL_LONG },
      { slot: 13, lane: 0, kind: K.BARRIER },
      { slot: 13, lane: 1, kind: K.BARRIER },
    ],
  },
  {
    difficulty: 4, slots: 18, safePath: 'double ramp: board left, hop the gap to the centre roof',
    tag: 'roof-hop',
    placements: [
      { slot: 1, lane: -1, kind: K.RAMP },
      { slot: 2, lane: -1, kind: K.TRAIN_LOW_LONG },
      { slot: 2, lane: 0, kind: K.TRAIN_TALL_LONG },
      { slot: 10, lane: -1, kind: K.TRAIN_LOW },
      { slot: 10, lane: 0, kind: K.CRATE },
      { slot: 14, lane: 1, kind: K.GATE },
    ],
  },
  // ── Tunnel bores — the signature "get off the roof" moment ─────────────
  {
    difficulty: 2, slots: 14, safePath: 'the bore is clear on the ballast; roll if you took the roof',
    tag: 'tunnel',
    placements: [
      { slot: 1, lane: 0, kind: K.RAMP },
      { slot: 2, lane: 0, kind: K.TRAIN_LOW_LONG },
      { slot: 6, lane: 0, kind: K.TUNNEL },
    ],
  },
  {
    difficulty: 3, slots: 18, safePath: 'ride the left rake into the bore and roll, or run the open right lane',
    tag: 'tunnel',
    placements: [
      { slot: 1, lane: -1, kind: K.RAMP },
      { slot: 2, lane: -1, kind: K.TRAIN_LOW_LONG },
      { slot: 5, lane: 0, kind: K.TUNNEL },
      { slot: 12, lane: 0, kind: K.BARRIER },
      { slot: 12, lane: -1, kind: K.BARRIER },
    ],
  },
  {
    difficulty: 4, slots: 20, safePath: 'two bores back to back — stay low through both',
    tag: 'tunnel',
    placements: [
      { slot: 1, lane: 1, kind: K.RAMP },
      { slot: 2, lane: 1, kind: K.TRAIN_LOW_LONG },
      { slot: 4, lane: 0, kind: K.TUNNEL },
      { slot: 11, lane: 0, kind: K.TUNNEL },
      { slot: 2, lane: -1, kind: K.TRAIN_TALL },
      { slot: 16, lane: 0, kind: K.GATE },
      { slot: 16, lane: 1, kind: K.GATE },
    ],
  },

  {
    difficulty: 4, slots: 16, safePath: 'crate field — hop or weave, gantry finish',
    placements: [
      { slot: 2, lane: -1, kind: K.CRATE },
      { slot: 2, lane: 1, kind: K.CRATE },
      { slot: 6, lane: 0, kind: K.CRATE },
      { slot: 10, lane: -1, kind: K.CRATE },
      { slot: 10, lane: 0, kind: K.CRATE },
      { slot: 14, lane: 1, kind: K.BARRIER },
    ],
  },
];

/**
 * Central, tunable game constants for **Sunset Runner** (석양 러너) — a warm,
 * sunset-themed 3-lane endless runner. Units are world units (≈ metres); the
 * world scrolls toward the camera along +Z while the player stays near origin.
 */

/** Dev-only overlays (FPS counter, etc.). Vite injects import.meta.env.DEV. */
export const DEV = import.meta.env.DEV;

// ── Lanes ────────────────────────────────────────────────────────────────
export const LANE_COUNT = 3;
export const LANE_WIDTH = 2.2;
export const LANES = [-1, 0, 1] as const;
export type LaneIndex = (typeof LANES)[number];

/** World-space X position for a given lane index. */
export function laneToX(lane: number): number {
  return lane * LANE_WIDTH;
}

// ── Speed (matched to the reference) ─────────────────────────────────────
export const BASE_SPEED = 11;
export const MAX_SPEED = 25;
export const SPEED_RAMP_PER_SEC = 0.2;

// ── Player movement ──────────────────────────────────────────────────────
export const LANE_LERP = 16;
export const JUMP_VELOCITY = 14;
export const GRAVITY = 38;
export const SLIDE_DURATION = 0.62;
export const LAND_TOLERANCE = 0.35;

export const PLAYER_RADIUS = 0.45;
export const PLAYER_HEIGHT = 1.7;
export const PLAYER_HALF_STANDING = { x: 0.45, y: 0.85, z: 0.45 };
export const PLAYER_HALF_SLIDING = { x: 0.45, y: 0.45, z: 0.45 };

// ── Camera ───────────────────────────────────────────────────────────────
export const CAMERA_BACK = 7.5;
export const CAMERA_HEIGHT = 4.2;
export const CAMERA_LOOK_AHEAD = 6;
export const CAMERA_FOV_BASE = 64;
export const CAMERA_FOV_MAX = 76;
export const CAMERA_FOLLOW_LERP = 8;

// ── Track / segments ─────────────────────────────────────────────────────
export const SEGMENT_LENGTH = 30;
export const SLOTS_PER_SEGMENT = 5;
export const SLOT_SPACING = SEGMENT_LENGTH / SLOTS_PER_SEGMENT;
export const ACTIVE_SEGMENTS = 8;
export const SPAWN_AHEAD = SEGMENT_LENGTH * ACTIVE_SEGMENTS;
export const RECYCLE_BEHIND = SEGMENT_LENGTH * 1.5;

// ── Progression ──────────────────────────────────────────────────────────
/** Distance between level-ups / biome transitions. */
export const LEVEL_DIST = 320;
/** Distance between checkpoints (coin / time bonus). */
export const CHECKPOINT_DIST = 800;
/** Challenge mode starting time (seconds). */
export const TIME_ATTACK_SECONDS = 60;

// ── Coins & score ──────────────────────────────────────────────────────────
export const COIN_VALUE = 5;
export const COIN_RADIUS = 0.34;
export const COIN_PICKUP_RADIUS = 0.95;
export const COIN_GROUND_Y = 1.0;

// ── Sunset palette ───────────────────────────────────────────────────────
export const COLORS = {
  groundA: 0x6b4a7a,
  groundB: 0x5d3f6c,
  laneStripe: 0xffd0a0,
  rail: 0xffd0a0,
  player: 0xff5e8a,
  playerGlow: 0xffd0a0,
  trainBody: 0xff3b5c,
  trainRoof: 0xffd36b,
  barrier: 0xffb13a,
  tunnel: 0x8a6cff,
  wall: 0x6e2e54,
  lowTrain: 0xff8a5c,
  crate: 0xc77a3a,
  sign: 0xffb13a,
  coin: 0xffd86b,
  coinGlow: 0xffb27a,
} as const;

// ── Biomes (6-stage sunset cycle) ────────────────────────────────────────
export interface Biome {
  name: string;
  top: number;
  mid: number;
  bottom: number;
  fog: number;
  sun: number;
}

export const BIOMES: Biome[] = [
  { name: '석양', top: 0x241a5e, mid: 0xff7eb3, bottom: 0xffd36b, fog: 0xff9966, sun: 0xffe9a8 },
  { name: '황혼', top: 0x1a1040, mid: 0x8a4ba3, bottom: 0xff9a6b, fog: 0xa9628f, sun: 0xffd0a0 },
  { name: '야간', top: 0x05061f, mid: 0x232a6a, bottom: 0x4a3a7a, fog: 0x232450, sun: 0xcfd8ff },
  { name: '새벽', top: 0x102a4a, mid: 0x5a8ad0, bottom: 0xffd0a0, fog: 0x7f9fc4, sun: 0xfff0c0 },
  { name: '창공', top: 0x1f5fd0, mid: 0x7ab8ff, bottom: 0xd6f0ff, fog: 0x9fc4ea, sun: 0xffffff },
  { name: '오로라', top: 0x041028, mid: 0x119a8a, bottom: 0x3a2a7a, fog: 0x10403a, sun: 0x9affe0 },
];

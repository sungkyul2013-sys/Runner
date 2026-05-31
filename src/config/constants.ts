/**
 * Central, tunable game constants. Kept in one place so balancing the game
 * (lanes, speeds, jump arcs, spawn density) never requires hunting through
 * the codebase. Reused across every phase.
 *
 * Units are arbitrary "world units"; roughly 1 unit ≈ 1 metre. The world
 * moves toward the camera along -Z (the player stays near the origin and the
 * track/obstacles flow past), so "forward" for the player is -Z.
 */

/** Dev-only overlays (FPS counter, etc.). Vite injects import.meta.env.DEV. */
export const DEV = import.meta.env.DEV;

// ── Lanes ────────────────────────────────────────────────────────────────
/** Number of lanes (classic 3-lane runner). */
export const LANE_COUNT = 3;
/** Horizontal distance between adjacent lane centres. */
export const LANE_WIDTH = 2.2;
/** Lane indices: -1 (left), 0 (centre), 1 (right). */
export const LANES = [-1, 0, 1] as const;
export type LaneIndex = (typeof LANES)[number];

/** World-space X position for a given lane index. */
export function laneToX(lane: number): number {
  return lane * LANE_WIDTH;
}

// ── Speed ────────────────────────────────────────────────────────────────
/** Starting forward speed of the world (units/second). */
export const BASE_SPEED = 14;
/** Speed gained per second of play (gentle ramp). */
export const SPEED_RAMP_PER_SEC = 0.22;
/** Hard cap so the game stays playable. */
export const MAX_SPEED = 42;

// ── Player movement ──────────────────────────────────────────────────────
/** How quickly the player eases toward the target lane (higher = snappier). */
export const LANE_LERP = 14;
/** Upward launch velocity for a jump (units/second). */
export const JUMP_VELOCITY = 11;
/** Gravity acceleration (units/second²). */
export const GRAVITY = 34;
/** Duration of a slide before auto-standing (seconds). */
export const SLIDE_DURATION = 0.6;

/** Player capsule dimensions (standing). */
export const PLAYER_RADIUS = 0.45;
export const PLAYER_HEIGHT = 1.7; // total height including caps
/** Collision-box half extents while standing vs sliding. */
export const PLAYER_HALF_STANDING = { x: 0.45, y: 0.85, z: 0.45 };
export const PLAYER_HALF_SLIDING = { x: 0.45, y: 0.45, z: 0.45 };

// ── Camera ───────────────────────────────────────────────────────────────
export const CAMERA_BACK = 7.5; // distance behind the player (+Z)
export const CAMERA_HEIGHT = 4.2; // height above the ground
export const CAMERA_LOOK_AHEAD = 6; // how far ahead the camera aims (-Z)
export const CAMERA_FOV_BASE = 65;
export const CAMERA_FOV_MAX = 78;
export const CAMERA_FOLLOW_LERP = 8; // lateral follow smoothing

// ── Track / segments ─────────────────────────────────────────────────────
/** Length of a single track segment along Z. */
export const SEGMENT_LENGTH = 30;
/** Number of slot rows per segment (obstacles snap to slot Z positions). */
export const SLOTS_PER_SEGMENT = 5;
/** Z gap between slots within a segment. */
export const SLOT_SPACING = SEGMENT_LENGTH / SLOTS_PER_SEGMENT;
/** How many segments are kept alive ahead of / around the player. */
export const ACTIVE_SEGMENTS = 8;
/** Distance ahead of the player to which the track is populated. */
export const SPAWN_AHEAD = SEGMENT_LENGTH * ACTIVE_SEGMENTS;
/** Distance behind the player after which a segment is recycled. */
export const RECYCLE_BEHIND = SEGMENT_LENGTH * 1.5;

// ── Colours (neon palette) ───────────────────────────────────────────────
export const COLORS = {
  background: 0x05060c,
  fog: 0x0a0e1f,
  groundA: 0x121833,
  groundB: 0x0d1226,
  laneStripe: 0x2de2e6,
  player: 0xff3cac,
  playerGlow: 0xffa6e0,
  trainBody: 0x7a5cff,
  barrier: 0xff6b3d,
  tunnel: 0x3df5ff,
  wall: 0x586073,
} as const;

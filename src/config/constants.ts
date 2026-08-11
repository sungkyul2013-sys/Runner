/**
 * Central, tunable constants for **METRO SURF (메트로 서프)** — a full
 * subway-runner: three rail lanes through a working train yard, long carriages
 * you leap onto and sprint across, an inspector + dog on your heels, and a
 * world tour of districts that swap out the whole skyline.
 *
 * Units are world units (≈ metres). The world scrolls toward the camera along
 * +Z while the player stays anchored at {@link PLAYER_Z}.
 */

/** Dev-only overlays (FPS counter, etc.). Vite injects import.meta.env.DEV. */
export const DEV = import.meta.env.DEV;

// ── Lanes ────────────────────────────────────────────────────────────────
export const LANE_COUNT = 3;
export const LANE_WIDTH = 2.6;
export const LANES = [-1, 0, 1] as const;
export type LaneIndex = (typeof LANES)[number];

/** World-space X position for a given lane index. */
export function laneToX(lane: number): number {
  return lane * LANE_WIDTH;
}

// ── Speed ────────────────────────────────────────────────────────────────
/** Starting run speed. */
export const BASE_SPEED = 13;
/** Terminal run speed — reached after ~75 s of clean running. */
export const MAX_SPEED = 34;
export const SPEED_RAMP_PER_SEC = 0.28;

// ── Player movement ──────────────────────────────────────────────────────
/** Lane-change easing rate. High = snappy, near-instant tracking of input. */
export const LANE_LERP = 24;
/** Upward launch speed of a hop. apex = v²/2g ≈ 2.6 units. */
export const JUMP_VELOCITY = 17;
export const GRAVITY = 55;
/** Roll (duck) duration in seconds. */
export const SLIDE_DURATION = 0.55;
/** Vertical slack allowed when deciding "landed on a roof". */
export const LAND_TOLERANCE = 0.45;

export const PLAYER_HALF_STANDING = { x: 0.42, y: 0.85, z: 0.4 };
export const PLAYER_HALF_SLIDING = { x: 0.42, y: 0.42, z: 0.4 };

// ── Camera ───────────────────────────────────────────────────────────────
export const CAMERA_BACK = 7.4;
export const CAMERA_HEIGHT = 4.0;
export const CAMERA_LOOK_AHEAD = 9;
export const CAMERA_FOV_BASE = 62;
export const CAMERA_FOV_MAX = 78;
export const CAMERA_FOLLOW_LERP = 9;

// ── Track / segments ─────────────────────────────────────────────────────
/** Authoring grid: every obstacle length is a whole number of slots. */
export const SLOT_LEN = 4;
/** Slots per segment template (templates may be shorter — see `slots`). */
export const SEGMENT_SLOTS = 12;
export const SEGMENT_LENGTH = SLOT_LEN * SEGMENT_SLOTS; // 48
export const ACTIVE_SEGMENTS = 7;
export const SPAWN_AHEAD = SEGMENT_LENGTH * ACTIVE_SEGMENTS;
export const RECYCLE_BEHIND = 26;

// ── Heights (the whole obstacle vocabulary keys off these) ───────────────
/** Roof height of a short carriage — reachable with a standing jump. */
export const LOW_ROOF = 2.0;
/** Roof height of a full-height carriage — only reachable from a roof/ramp. */
export const TALL_ROOF = 3.4;
/** Underside of a roll-under gate on the ground. */
export const GATE_BOTTOM = 1.02;
/** Underside of a roll-under gate mounted on a low carriage roof. */
export const ROOF_GATE_BOTTOM = LOW_ROOF + 0.95;

// ── Progression ──────────────────────────────────────────────────────────
/** Distance between district (world-tour) changes. */
export const DISTRICT_DIST = 900;
/** Distance between score-multiplier steps (Subway-Surfers style ramp). */
export const MULTIPLIER_STEP = 500;
/** Hard cap on the distance-driven part of the multiplier. */
export const MULTIPLIER_MAX = 30;

// ── Coins & score ──────────────────────────────────────────────────────────
export const COIN_RADIUS = 0.36;
export const COIN_PICKUP_RADIUS = 1.05;
export const COIN_GROUND_Y = 1.05;

// ── The chase (inspector + dog) ───────────────────────────────────────────
/** Resting distance the inspector keeps behind the player (inside the frame,
 *  low and slightly off to one side so he never masks the track ahead). */
export const CHASE_REST_Z = 3.6;
/** Distance the inspector closes to while the player is stumbling. */
export const CHASE_NEAR_Z = 2.0;
/** Seconds a stumble lasts before you recover (if you survive it). */
export const STUMBLE_TIME = 1.15;

// ── Palette ──────────────────────────────────────────────────────────────
export const COLORS = {
  rail: 0xb9c0c8,
  coin: 0xffcf3a,
  gate: 0xe8452f,
  pylon: 0x6d7580,
  crate: 0xc08a44,
  ramp: 0xffb020,
} as const;

/** Livery for one carriage type (body / roof / trim / window glow). */
export interface Livery {
  body: number;
  roof: number;
  trim: number;
  glass: number;
}

export const LIVERIES: Livery[] = [
  { body: 0xf0f3f7, roof: 0xd7dde5, trim: 0xe23c3c, glass: 0x2e3a4a }, // classic silver/red
  { body: 0xf6c944, roof: 0xe0b02c, trim: 0x2b2f38, glass: 0x2e3a4a }, // yellow line
  { body: 0x3fa9f5, roof: 0x2d86c8, trim: 0xf0f3f7, glass: 0x233346 }, // blue line
  { body: 0x5ec06a, roof: 0x45a153, trim: 0xf0f3f7, glass: 0x233346 }, // green line
  { body: 0xe0603c, roof: 0xc44a29, trim: 0xffe0a8, glass: 0x2e2a35 }, // orange line
  { body: 0x8b6ee0, roof: 0x7355c8, trim: 0xf3ecff, glass: 0x2a2340 }, // purple line
];

// ── Districts (world tour) ───────────────────────────────────────────────
export interface District {
  /** Display name (Korean) + latin subtitle. */
  name: string;
  sub: string;
  /** Sky gradient. */
  top: number;
  mid: number;
  bottom: number;
  fog: number;
  /** Sun / moon disc colour. */
  sun: number;
  /** Building body tints used by the skyline. */
  build: number[];
  /** Ground / ballast tint. */
  ground: number;
  /** True for night-time districts (stars + lit windows). */
  night: boolean;
  /** Accent colour used by the HUD banner. */
  accent: number;
}

export const DISTRICTS: District[] = [
  {
    name: '서울', sub: 'SEOUL', top: 0x1b2f6b, mid: 0x5aa0e0, bottom: 0xffd9a8,
    fog: 0x9dbbdd, sun: 0xfff3c8, build: [0x8fa4bd, 0x6e849f, 0xa8b8cc, 0x5c718c],
    ground: 0x8a8378, night: false, accent: 0x5aa0e0,
  },
  {
    name: '도쿄 야경', sub: 'TOKYO NIGHT', top: 0x07081c, mid: 0x1b2050, bottom: 0x3d2a6b,
    fog: 0x1a1c3c, sun: 0xdfe6ff, build: [0x2a2f52, 0x1e2340, 0x3a2f5c, 0x252a4a],
    ground: 0x4a4a55, night: true, accent: 0xff4fd8,
  },
  {
    name: '뉴욕', sub: 'NEW YORK', top: 0x2b1a48, mid: 0xb85a7a, bottom: 0xffb066,
    fog: 0xc9738a, sun: 0xffe0a8, build: [0x7a5a70, 0x5e4358, 0x8f6b80, 0x4a3448],
    ground: 0x7a6a68, night: false, accent: 0xffb066,
  },
  {
    name: '리우', sub: 'RIO', top: 0x0d5fa8, mid: 0x4fc3e8, bottom: 0xfff0c0,
    fog: 0x8fd4ea, sun: 0xffffff, build: [0xe0d0b0, 0xc8b898, 0xf0e4c8, 0xb0a488],
    ground: 0x9a8f7a, night: false, accent: 0x4fc3e8,
  },
  {
    name: '아이슬란드', sub: 'ICELAND', top: 0x041028, mid: 0x0f7a72, bottom: 0x2a2a6a,
    fog: 0x11423e, sun: 0x9affe0, build: [0x24455a, 0x1a3448, 0x2e5468, 0x152c3e],
    ground: 0xa8b4bc, night: true, accent: 0x2ee0b0,
  },
  {
    name: '사막 협곡', sub: 'CANYON', top: 0x3a2050, mid: 0xe07a4a, bottom: 0xffd08a,
    fog: 0xd08a68, sun: 0xfff0c0, build: [0xa8613c, 0x8c4e30, 0xc4784c, 0x6e3c26],
    ground: 0xb08050, night: false, accent: 0xe07a4a,
  },
  {
    name: '네온 지하', sub: 'NEON UNDER', top: 0x05030f, mid: 0x1a0a35, bottom: 0x2a1050,
    fog: 0x12082a, sun: 0xff4fd8, build: [0x2a1050, 0x1c0a38, 0x3a1668, 0x140628],
    ground: 0x3a3040, night: true, accent: 0xff4fd8,
  },
  {
    name: '설원', sub: 'SNOWFIELD', top: 0x4a6fa8, mid: 0xa8d0ea, bottom: 0xffffff,
    fog: 0xcfe2f0, sun: 0xffffff, build: [0xc8d6e4, 0xaebfd0, 0xdce8f2, 0x94a6bc],
    ground: 0xe8f0f8, night: false, accent: 0x7fb8e0,
  },
];

/** Legacy alias kept so older call-sites keep compiling. */
export const BIOMES = DISTRICTS;
export type Biome = District;

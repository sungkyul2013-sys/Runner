/** Every power-up in the game. */
export enum PowerupType {
  MAGNET = 'MAGNET',
  DOUBLE = 'DOUBLE',
  SNEAKERS = 'SNEAKERS',
  JETPACK = 'JETPACK',
  ROCKET = 'ROCKET',
  HOVERBOARD = 'HOVERBOARD',
  BOMB = 'BOMB',
  SLOWMO = 'SLOWMO', // brief slow-motion to thread tight gaps
  STAR = 'STAR', // shooting-star: timed invincibility + x3 score
  COINBURST = 'COINBURST', // instant coin payout
}

export interface PowerupDef {
  color: number;
  /** Short glyph shown on the pickup / HUD ring. */
  icon: string;
  label: string;
  /** Effect duration in seconds. 0 = instant (e.g. Bomb). */
  duration: number;
  /** Relative chance of spawning on the track. */
  weight: number;
}

/**
 * Tunable definitions for each power-up. Durations are the *base* values;
 * Phase 6 shop upgrades scale them. Shared by the pickup tokens, the
 * PowerupSystem and the HUD rings.
 */
export const POWERUPS: Record<PowerupType, PowerupDef> = {
  [PowerupType.MAGNET]: { color: 0x55aaff, icon: '🧲', label: '자석', duration: 5, weight: 5 },
  [PowerupType.DOUBLE]: { color: 0xffd86b, icon: '✨', label: 'x2', duration: 6, weight: 4 },
  [PowerupType.SNEAKERS]: { color: 0x66ff99, icon: '🥾', label: '부츠', duration: 5, weight: 4 },
  [PowerupType.JETPACK]: { color: 0xff9f43, icon: '🪂', label: '글라이드', duration: 5, weight: 2 },
  [PowerupType.ROCKET]: { color: 0xff5a2a, icon: '🚀', label: '로켓', duration: 5, weight: 2 },
  [PowerupType.HOVERBOARD]: { color: 0x8a7bff, icon: '🛹', label: '호버보드', duration: 16, weight: 3 },
  [PowerupType.BOMB]: { color: 0xff5630, icon: '💣', label: '폭탄', duration: 0, weight: 2 },
  [PowerupType.SLOWMO]: { color: 0x9ad8ff, icon: '⏳', label: '슬로우', duration: 4, weight: 2 },
  [PowerupType.STAR]: { color: 0xffe06b, icon: '⭐', label: '무적별', duration: 6, weight: 2 },
  [PowerupType.COINBURST]: { color: 0xffd86b, icon: '💰', label: '코인다발', duration: 0, weight: 2 },
};

/** Power-ups that appear as collectible tokens on the track. */
export const SPAWNABLE: PowerupType[] = [
  PowerupType.MAGNET,
  PowerupType.DOUBLE,
  PowerupType.SNEAKERS,
  PowerupType.JETPACK,
  PowerupType.ROCKET,
  PowerupType.HOVERBOARD,
  PowerupType.BOMB,
  PowerupType.SLOWMO,
  PowerupType.STAR,
  PowerupType.COINBURST,
];

// ── Effect magnitudes ──────────────────────────────────────────────────────
export const MAGNET_RADIUS = 7;
export const FLIGHT_MAGNET_RADIUS = 13; // vacuum coins while flying
export const SNEAKERS_JUMP_MULT = 1.6;
export const JETPACK_ALTITUDE = 5;
export const ROCKET_ALTITUDE = 11; // soars high for the dramatic lift-off view
export const ROCKET_SPEED_BOOST = 1.8;
export const SHIELD_INVULN = 1.2; // brief invuln after a hoverboard saves you
export const BOMB_RANGE = 36; // forward distance cleared by a bomb
export const SLOWMO_FACTOR = 0.55; // world speed while slow-mo is active
export const STAR_SCORE_MULT = 3; // score multiplier during the invincible star
export const COINBURST_AMOUNT = 30; // coins granted instantly by a coin-burst

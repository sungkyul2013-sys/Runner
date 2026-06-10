/** Every power-up in the game. */
export enum PowerupType {
  MAGNET = 'MAGNET',
  DOUBLE = 'DOUBLE',
  SNEAKERS = 'SNEAKERS',
  JETPACK = 'JETPACK',
  ROCKET = 'ROCKET',
  HOVERBOARD = 'HOVERBOARD',
  BOMB = 'BOMB',
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

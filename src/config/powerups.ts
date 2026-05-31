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
  [PowerupType.MAGNET]: { color: 0xff4d6d, icon: '🧲', label: 'Magnet', duration: 8, weight: 5 },
  [PowerupType.DOUBLE]: { color: 0xffd23f, icon: '✦', label: '2× Score', duration: 10, weight: 4 },
  [PowerupType.SNEAKERS]: { color: 0x6bff8c, icon: '⤒', label: 'Sneakers', duration: 8, weight: 4 },
  [PowerupType.JETPACK]: { color: 0xff9f43, icon: '🚀', label: 'Jetpack', duration: 5, weight: 3 },
  [PowerupType.ROCKET]: { color: 0x4dd2ff, icon: '➤', label: 'Rocket', duration: 2.6, weight: 2 },
  [PowerupType.HOVERBOARD]: { color: 0xb15cff, icon: '◈', label: 'Hoverboard', duration: 16, weight: 3 },
  [PowerupType.BOMB]: { color: 0xff5630, icon: '💣', label: 'Bomb', duration: 0, weight: 2 },
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
export const ROCKET_ALTITUDE = 7.5;
export const ROCKET_SPEED_BOOST = 1.7;
export const SHIELD_INVULN = 1.2; // brief invuln after a hoverboard saves you
export const BOMB_RANGE = 36; // forward distance cleared by a bomb

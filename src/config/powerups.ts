/**
 * Everything that can be picked up off the rails, and how strong it is.
 *
 * The four timed power-ups are the classic set — Coin Magnet, 2× Multiplier,
 * Super Sneakers and the Jetpack — joined by the collectibles that drive the
 * meta game: word letters, keys, mystery boxes, coin bags and spare
 * hoverboards.
 */
export enum PowerupType {
  MAGNET = 'MAGNET',
  DOUBLE = 'DOUBLE',
  SNEAKERS = 'SNEAKERS',
  JETPACK = 'JETPACK',
  /** Spare hoverboard charge. */
  BOARD = 'BOARD',
  /** Instant coin payout. */
  COINBAG = 'COINBAG',
  /** Instant key. */
  KEY = 'KEY',
  /** Random reward — coins, a key, a board or a power-up. */
  MYSTERY = 'MYSTERY',
  /** One letter of the current word hunt. */
  LETTER = 'LETTER',
}

export interface PowerupDef {
  color: number;
  /** Glyph shown on the token and the HUD ring. */
  icon: string;
  label: string;
  /** Effect duration in seconds. 0 = instant. */
  duration: number;
  /** Relative chance of spawning on the track. */
  weight: number;
}

export const POWERUPS: Record<PowerupType, PowerupDef> = {
  [PowerupType.MAGNET]: { color: 0x3fa9f5, icon: '🧲', label: '코인 자석', duration: 12, weight: 20 },
  [PowerupType.DOUBLE]: { color: 0xffd23f, icon: '✖️', label: '2배 점수', duration: 12, weight: 16 },
  [PowerupType.SNEAKERS]: { color: 0x6bff9a, icon: '👟', label: '슈퍼 스니커즈', duration: 12, weight: 16 },
  [PowerupType.JETPACK]: { color: 0xff7a2a, icon: '🚀', label: '제트팩', duration: 8, weight: 10 },
  [PowerupType.BOARD]: { color: 0x8a7bff, icon: '🛹', label: '호버보드', duration: 0, weight: 8 },
  [PowerupType.COINBAG]: { color: 0xffcf3a, icon: '💰', label: '코인 주머니', duration: 0, weight: 8 },
  [PowerupType.KEY]: { color: 0xffe066, icon: '🗝️', label: '열쇠', duration: 0, weight: 3 },
  [PowerupType.MYSTERY]: { color: 0xff4fd8, icon: '❓', label: '미스터리 박스', duration: 0, weight: 5 },
  [PowerupType.LETTER]: { color: 0x00e0ff, icon: '🔤', label: '글자', duration: 0, weight: 0 },
};

/** Power-ups that appear as free-standing tokens on the rails. */
export const SPAWNABLE: PowerupType[] = [
  PowerupType.MAGNET,
  PowerupType.DOUBLE,
  PowerupType.SNEAKERS,
  PowerupType.JETPACK,
  PowerupType.BOARD,
  PowerupType.COINBAG,
  PowerupType.KEY,
  PowerupType.MYSTERY,
];

/** The four upgradeable power-ups, in shop order. */
export const CORE_POWERUPS: PowerupType[] = [
  PowerupType.MAGNET,
  PowerupType.DOUBLE,
  PowerupType.SNEAKERS,
  PowerupType.JETPACK,
];

// ── Effect magnitudes ──────────────────────────────────────────────────────
export const MAGNET_RADIUS = 9;
/** Coins vacuum in from much further while airborne under a jetpack. */
export const FLIGHT_MAGNET_RADIUS = 16;
export const SNEAKERS_JUMP_MULT = 1.65;
export const JETPACK_ALTITUDE = 6.5;
/** World-speed multiplier while the jetpack burns. */
export const JETPACK_SPEED_BOOST = 1.15;
/** Brief invulnerability after a hoverboard eats a crash. */
export const BOARD_INVULN = 1.4;
/** Coins granted instantly by a coin bag. */
export const COINBAG_AMOUNT = 50;
/** Score multiplier granted by the 2× power-up. */
export const DOUBLE_MULT = 2;
/** Seconds of protection after a revive. */
export const REVIVE_INVULN = 2.6;

/** The letters the daily word hunt is spelled from. */
export const HUNT_WORD = 'METRO';

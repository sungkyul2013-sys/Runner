import { PowerupType } from '../config/powerups';

/**
 * Pricing/scaling for the two upgrade tracks bought in the shop:
 *  - **Ability potions** raise a character's passive ability level.
 *  - **Power-up upgrades** extend a power-up's active duration.
 */

export const ABILITY_MAX_LEVEL = 5;
export function abilityPotionCost(currentLevel: number): number {
  return 400 * (currentLevel + 1);
}

export const POWERUP_MAX_LEVEL = 4;
export function powerupUpgradeCost(currentLevel: number): number {
  return 300 * (currentLevel + 1);
}
/** Duration multiplier for a power-up at a given upgrade level. */
export function powerupDurationMult(level: number): number {
  return 1 + 0.15 * Math.min(level, POWERUP_MAX_LEVEL);
}

/** Power-ups whose duration can be upgraded (instant Bomb excluded). */
export const UPGRADABLE_POWERUPS: PowerupType[] = [
  PowerupType.MAGNET,
  PowerupType.DOUBLE,
  PowerupType.SNEAKERS,
  PowerupType.JETPACK,
  PowerupType.ROCKET,
  PowerupType.HOVERBOARD,
];

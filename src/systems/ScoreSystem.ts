import { COIN_VALUE } from '../config/constants';

/**
 * Tracks the run score and coin wallet. Score accrues from distance plus the
 * value of collected coins, scaled by the active **score multiplier** (the x2
 * power-up, the 네온/코스모스 character bonus, and the 코인 가치 upgrade).
 * Coins picked up are multiplied by **coinMult** (골든 스타 / 코스모스 = 2×).
 */
export class ScoreSystem {
  private _score = 0;
  coins = 0;
  /** Live score multiplier (distance + coin value). */
  multiplier = 1;
  /** Permanent character score bonus (e.g. +0.25 for 네온). */
  scoreBonus = 0;
  /** Coin pickup multiplier (e.g. 2 for 골든 스타). */
  coinMult = 1;
  /** Extra per-coin score from the 코인 가치 upgrade. */
  coinValueBonus = 0;

  addDistance(delta: number): void {
    this._score += delta * this.totalMult();
  }

  /** @returns number of coins added to the wallet (after coinMult). */
  addCoins(n: number): number {
    const got = n * this.coinMult;
    this.coins += got;
    this._score += got * (COIN_VALUE + this.coinValueBonus) * this.totalMult();
    return got;
  }

  /** Flat bonus to the score (combos, near-miss, checkpoints). */
  addBonus(points: number): void {
    this._score += points;
  }

  private totalMult(): number {
    return this.multiplier * (1 + this.scoreBonus);
  }

  get score(): number {
    return Math.floor(this._score);
  }

  reset(): void {
    this._score = 0;
    this.coins = 0;
    this.multiplier = 1;
    // scoreBonus / coinMult / coinValueBonus persist (set from loadout).
  }
}

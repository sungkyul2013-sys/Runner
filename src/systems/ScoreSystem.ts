import { COIN_VALUE } from '../config/constants';

/**
 * Tracks the run score and coin count. Score accrues from distance travelled
 * plus collected coins, scaled by an active multiplier (the 2× power-up sets
 * `multiplier = 2`, so it boosts both distance and coin gain while active).
 */
export class ScoreSystem {
  private _score = 0;
  coins = 0;
  multiplier = 1;

  /** Add the per-frame distance delta (world units ≈ metres). */
  addDistance(delta: number): void {
    this._score += delta * this.multiplier;
  }

  /** Register collected coins (updates both the counter and the score). */
  addCoins(n: number): void {
    this.coins += n;
    this._score += n * COIN_VALUE * this.multiplier;
  }

  get score(): number {
    return Math.floor(this._score);
  }

  reset(): void {
    this._score = 0;
    this.coins = 0;
    this.multiplier = 1;
  }
}

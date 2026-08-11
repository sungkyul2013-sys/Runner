/** Score awarded per coin, before multipliers. */
export const COIN_SCORE = 10;

/**
 * Tracks the run score and the coin purse. Distance accrues score every metre
 * and each coin adds {@link COIN_SCORE}; both are scaled by the live
 * **multiplier** — which is itself the distance ramp, the mission bonus, the
 * mode rules and the 2× power-up combined — plus the character's permanent
 * score bonus. Coins picked up are multiplied by `coinMult` (character perk ×
 * hoverboard perk).
 */
export class ScoreSystem {
  private _score = 0;
  coins = 0;
  /** Live score multiplier, recomputed by the game each frame. */
  multiplier = 1;
  /** Permanent character score bonus (0.25 = +25 %). */
  scoreBonus = 0;
  /** Coin pickup multiplier. */
  coinMult = 1;

  addDistance(delta: number): void {
    this._score += delta * this.totalMult();
  }

  /** @returns number of coins added to the purse (after coinMult). */
  addCoins(n: number): number {
    const got = Math.round(n * this.coinMult);
    this.coins += got;
    this._score += got * COIN_SCORE * this.totalMult();
    return got;
  }

  /** Flat bonus (combos, near-misses, checkpoints), also multiplied. */
  addBonus(points: number): void {
    this._score += points * this.totalMult();
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
    // scoreBonus / coinMult persist (set from the loadout).
  }
}

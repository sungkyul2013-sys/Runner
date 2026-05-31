import { levelForXp, type SaveManager } from '../data/SaveManager';

export interface RankResult {
  leveledTo?: number;
  /** Coin reward granted for levelling up (0 if no level-up). */
  reward: number;
}

/**
 * Converts a run into XP (distance + coins), levels the player up and pays a
 * coin reward on each level gained. Level is a pure function of total XP
 * ({@link levelForXp}); unlock messaging is surfaced via {@link RankResult}.
 */
export class RankSystem {
  constructor(private readonly save: SaveManager) {}

  applyRun(distance: number, coins: number): RankResult {
    const gained = Math.floor(distance / 10) + coins;
    const before = levelForXp(this.save.data.xp);
    this.save.addXp(gained);
    const after = levelForXp(this.save.data.xp);
    if (after > before) {
      const reward = after * 60;
      this.save.addCoins(reward);
      return { leveledTo: after, reward };
    }
    return { reward: 0 };
  }
}

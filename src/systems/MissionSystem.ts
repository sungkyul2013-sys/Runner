import { makeMission, type Mission } from '../data/missions';
import type { SaveManager } from '../data/SaveManager';

/**
 * Tracks the three rotating missions. After each run it advances progress
 * (coins are cumulative, distance is a single-run best, jetpack uses are
 * cumulative), pays out rewards for any completed mission, and rotates the
 * completed slot to a fresh, harder mission of the same kind.
 */
export class MissionSystem {
  constructor(private readonly save: SaveManager) {}

  get missions(): Mission[] {
    return this.save.data.missions;
  }

  /** Apply a finished run; returns the missions completed this run. */
  applyRun(coins: number, distance: number, jetpackUses: number): Mission[] {
    const d = this.save.data;
    const completed: Mission[] = [];

    d.missions.forEach((m, i) => {
      if (m.done) return;
      if (m.kind === 'coins') m.progress += coins;
      else if (m.kind === 'distance') m.progress = Math.max(m.progress, Math.floor(distance));
      else if (m.kind === 'jetpack') m.progress += jetpackUses;

      if (m.progress >= m.target) {
        m.done = true;
        this.save.addCoins(m.reward);
        completed.push({ ...m });
        const tier = (d.missionTiers[m.kind] ?? 0) + 1;
        d.missionTiers[m.kind] = tier;
        d.missions[i] = makeMission(m.kind, tier);
      }
    });

    this.save.save();
    return completed;
  }
}

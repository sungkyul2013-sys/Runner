import type { SaveData } from './SaveManager';

/** Milestone achievements; each reads a stat from the save and pays once. */
export interface AchievementDef {
  id: string;
  name: string;
  goal: number;
  reward: number;
  stat: (s: SaveData) => number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first', name: '첫 발걸음', goal: 1, reward: 50, stat: (s) => s.runs },
  { id: 'run10', name: '단골 러너', goal: 10, reward: 150, stat: (s) => s.runs },
  { id: 'coin500', name: '동전 수집가', goal: 500, reward: 200, stat: (s) => s.totalCoins },
  { id: 'coin5k', name: '부자', goal: 5000, reward: 500, stat: (s) => s.totalCoins },
  { id: 'dist5k', name: '마라토너', goal: 5000, reward: 300, stat: (s) => Math.floor(s.totalDistance) },
  { id: 'dist20k', name: '대륙 횡단', goal: 20000, reward: 800, stat: (s) => Math.floor(s.totalDistance) },
  { id: 'score1k', name: '고득점', goal: 1000, reward: 250, stat: (s) => s.best },
  { id: 'score3k', name: '에이스', goal: 3000, reward: 600, stat: (s) => s.best },
  { id: 'collect3', name: '컬렉터', goal: 3, reward: 400, stat: (s) => s.owned.length },
];

/** 7-day login reward cycle. */
export interface DailyReward {
  ic: string;
  coins: number;
  mile: number;
}

export const DAILY: DailyReward[] = [
  { ic: '🪙', coins: 50, mile: 0 },
  { ic: '🪙', coins: 80, mile: 0 },
  { ic: '💎', coins: 0, mile: 20 },
  { ic: '🪙', coins: 150, mile: 0 },
  { ic: '💎', coins: 0, mile: 40 },
  { ic: '🪙', coins: 250, mile: 0 },
  { ic: '👑', coins: 500, mile: 80 },
];

import type { SaveData } from './SaveManager';

/** Milestone achievements; each reads a stat from the profile and pays once. */
export interface AchievementDef {
  id: string;
  name: string;
  icon: string;
  goal: number;
  coins: number;
  keys?: number;
  stat: (s: SaveData) => number;
  /** How the progress number should be rendered. */
  unit?: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first', name: '첫 질주', icon: '🎬', goal: 1, coins: 200, stat: (s) => s.runs },
  { id: 'run25', name: '단골 러너', icon: '🎮', goal: 25, coins: 700, stat: (s) => s.runs },
  { id: 'run100', name: '선로의 주인', icon: '👑', goal: 100, coins: 2500, keys: 3, stat: (s) => s.runs },
  { id: 'coin2k', name: '동전 수집가', icon: '🪙', goal: 2000, coins: 600, stat: (s) => s.totalCoins },
  { id: 'coin20k', name: '금고', icon: '💰', goal: 20000, coins: 3000, keys: 2, stat: (s) => s.totalCoins },
  { id: 'dist10k', name: '마라토너', icon: '📏', goal: 10000, coins: 900, unit: 'm', stat: (s) => Math.floor(s.totalDistance) },
  { id: 'dist50k', name: '대륙 횡단', icon: '🌏', goal: 50000, coins: 3500, keys: 2, unit: 'm', stat: (s) => Math.floor(s.totalDistance) },
  { id: 'score50k', name: '고득점', icon: '⭐', goal: 50000, coins: 1200, stat: (s) => s.best },
  { id: 'score200k', name: '에이스', icon: '🏆', goal: 200000, coins: 4000, keys: 3, stat: (s) => s.best },
  { id: 'roof2k', name: '지붕 위의 삶', icon: '🚃', goal: 2000, coins: 1500, unit: 'm', stat: (s) => Math.floor(s.stats.roof ?? 0) },
  { id: 'crew5', name: '크루 결성', icon: '🦸', goal: 5, coins: 1500, stat: (s) => s.ownedChars.length },
  { id: 'crew10', name: '올스타', icon: '🌟', goal: 10, coins: 4000, keys: 3, stat: (s) => s.ownedChars.length },
  { id: 'lvmax', name: '한계 돌파', icon: '⬆️', goal: 1, coins: 3000, keys: 2,
    stat: (s) => Object.values(s.charLevels ?? {}).filter((l) => l >= 5).length },
  { id: 'boards4', name: '보드 콜렉터', icon: '🛹', goal: 4, coins: 1500, stat: (s) => s.ownedBoards.length },
  { id: 'hunt3', name: '단어 사냥꾼', icon: '🔤', goal: 3, coins: 2000, keys: 2, stat: (s) => s.huntCompleted },
  { id: 'set10', name: '미션 마스터', icon: '📋', goal: 10, coins: 3000, keys: 2, stat: (s) => s.missionSet - 1 },
];

/** 7-day login reward cycle. */
export interface DailyReward {
  ic: string;
  coins: number;
  keys: number;
}

export const DAILY: DailyReward[] = [
  { ic: '🪙', coins: 200, keys: 0 },
  { ic: '🪙', coins: 350, keys: 0 },
  { ic: '🗝️', coins: 150, keys: 1 },
  { ic: '🪙', coins: 600, keys: 0 },
  { ic: '🗝️', coins: 300, keys: 2 },
  { ic: '🪙', coins: 900, keys: 0 },
  { ic: '👑', coins: 1800, keys: 3 },
];

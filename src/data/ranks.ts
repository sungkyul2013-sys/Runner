/**
 * Ranks. Every run pays XP from its score, coins and distance, and crossing a
 * threshold promotes the player to the next title — the long, always-visible
 * progression line that sits under everything else in the meta game. Each
 * promotion also pays a coin/key purse, so a rank-up is a moment, not a label.
 */
export interface RankDef {
  /** 1-based level. */
  level: number;
  name: string;
  icon: string;
  /** Total lifetime XP needed to reach this rank. */
  need: number;
  /** Promotion purse. */
  coins: number;
  keys: number;
  /** Badge accent. */
  color: string;
}

/** XP earned by one finished run. */
export function xpForRun(score: number, coins: number, distance: number): number {
  return Math.floor(score / 120) + Math.floor(coins / 8) + Math.floor(distance / 40);
}

export const RANKS: RankDef[] = [
  { level: 1, name: '무임승차', icon: '🎫', need: 0, coins: 0, keys: 0, color: '#9aa8bd' },
  { level: 2, name: '초보 태거', icon: '🖍️', need: 120, coins: 300, keys: 0, color: '#8fd4ff' },
  { level: 3, name: '거리의 화가', icon: '🎨', need: 320, coins: 500, keys: 1, color: '#6bff9a' },
  { level: 4, name: '선로 러너', icon: '🏃', need: 650, coins: 800, keys: 0, color: '#6bff9a' },
  { level: 5, name: '지붕 워커', icon: '🚃', need: 1100, coins: 1200, keys: 1, color: '#ffd23f' },
  { level: 6, name: '스프린터', icon: '💨', need: 1750, coins: 1600, keys: 1, color: '#ffd23f' },
  { level: 7, name: '보드 마스터', icon: '🛹', need: 2600, coins: 2200, keys: 2, color: '#ff9f43' },
  { level: 8, name: '야간 특급', icon: '🚄', need: 3800, coins: 3000, keys: 2, color: '#ff9f43' },
  { level: 9, name: '그림자', icon: '🌑', need: 5400, coins: 4000, keys: 3, color: '#ff4fd8' },
  { level: 10, name: '전설의 러너', icon: '⚡', need: 7600, coins: 5500, keys: 3, color: '#ff4fd8' },
  { level: 11, name: '메트로 킹', icon: '👑', need: 10500, coins: 8000, keys: 5, color: '#ffd23f' },
  { level: 12, name: '노선의 신화', icon: '🌟', need: 15000, coins: 12000, keys: 8, color: '#ffd23f' },
];

/** The rank a given lifetime XP total sits in. */
export function rankFor(xp: number): RankDef {
  let r = RANKS[0];
  for (const d of RANKS) if (xp >= d.need) r = d;
  return r;
}

/** The next rank up, or null at the cap. */
export function nextRank(xp: number): RankDef | null {
  return RANKS.find((d) => d.need > xp) ?? null;
}

/** 0‥1 progress through the current rank band. */
export function rankProgress(xp: number): number {
  const cur = rankFor(xp);
  const next = nextRank(xp);
  if (!next) return 1;
  return Math.min(1, Math.max(0, (xp - cur.need) / (next.need - cur.need)));
}

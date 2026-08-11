/**
 * Missions. Three are active at a time; clear all three and the **set** is
 * complete — you bank a coin reward and your permanent score multiplier goes up
 * by one, exactly the loop that keeps a Subway-Surfers run ladder climbing.
 * Goals scale with the set number, so set 12 asks a lot more than set 1.
 */
export type MissionMetric =
  | 'coins'
  | 'distance'
  | 'score'
  | 'jump'
  | 'roll'
  | 'lane'
  | 'roof'
  | 'powerup'
  | 'letter'
  | 'board'
  | 'nearmiss'
  | 'mystery'
  | 'express'
  | 'magnet'
  | 'jetpack'
  | 'sneakers'
  | 'multiplier'
  | 'runs';

export interface MissionDef {
  id: string;
  metric: MissionMetric;
  icon: string;
  /** Base goal at set 1; scaled by `goalFor`. */
  base: number;
  /** How fast the goal grows per set (multiplied). */
  growth: number;
  /** Rendered mission line. */
  text: (n: number) => string;
  /** True when the metric only counts inside a single run. */
  perRun?: boolean;
}

export const MISSIONS: MissionDef[] = [
  { id: 'coins', metric: 'coins', icon: '🪙', base: 300, growth: 1.35, text: (n) => `코인 ${n}개 모으기` },
  { id: 'coins-run', metric: 'coins', icon: '🪙', base: 90, growth: 1.28, perRun: true, text: (n) => `한 번의 질주에서 코인 ${n}개 모으기` },
  { id: 'dist', metric: 'distance', icon: '📏', base: 2500, growth: 1.32, text: (n) => `총 ${n}m 달리기` },
  { id: 'dist-run', metric: 'distance', icon: '🏁', base: 900, growth: 1.26, perRun: true, text: (n) => `한 번에 ${n}m 달리기` },
  { id: 'score-run', metric: 'score', icon: '⭐', base: 15000, growth: 1.4, perRun: true, text: (n) => `한 번에 ${n}점 넘기기` },
  { id: 'jump', metric: 'jump', icon: '⬆️', base: 60, growth: 1.3, text: (n) => `${n}번 점프하기` },
  { id: 'roll', metric: 'roll', icon: '⬇️', base: 45, growth: 1.3, text: (n) => `${n}번 구르기` },
  { id: 'lane', metric: 'lane', icon: '↔️', base: 120, growth: 1.3, text: (n) => `레인을 ${n}번 바꾸기` },
  { id: 'roof', metric: 'roof', icon: '🚃', base: 400, growth: 1.34, text: (n) => `열차 지붕 위를 ${n}m 달리기` },
  { id: 'roof-run', metric: 'roof', icon: '🚃', base: 120, growth: 1.26, perRun: true, text: (n) => `한 번에 지붕 위 ${n}m 달리기` },
  { id: 'power', metric: 'powerup', icon: '🎁', base: 12, growth: 1.3, text: (n) => `파워업 ${n}개 사용하기` },
  { id: 'magnet', metric: 'magnet', icon: '🧲', base: 6, growth: 1.28, text: (n) => `코인 자석 ${n}번 먹기` },
  { id: 'jetpack', metric: 'jetpack', icon: '🚀', base: 5, growth: 1.28, text: (n) => `제트팩 ${n}번 타기` },
  { id: 'sneakers', metric: 'sneakers', icon: '👟', base: 5, growth: 1.28, text: (n) => `슈퍼 스니커즈 ${n}번 신기` },
  { id: 'letter', metric: 'letter', icon: '🔤', base: 8, growth: 1.3, text: (n) => `글자 토큰 ${n}개 모으기` },
  { id: 'board', metric: 'board', icon: '🛹', base: 6, growth: 1.3, text: (n) => `호버보드 ${n}번 타기` },
  { id: 'near', metric: 'nearmiss', icon: '😮', base: 25, growth: 1.32, text: (n) => `아슬아슬하게 ${n}번 스치기` },
  { id: 'mystery', metric: 'mystery', icon: '❓', base: 3, growth: 1.35, text: (n) => `미스터리 박스 ${n}개 열기` },
  { id: 'express', metric: 'express', icon: '🚄', base: 6, growth: 1.3, text: (n) => `특급 열차 ${n}번 피하기` },
  { id: 'mult', metric: 'multiplier', icon: '✖️', base: 6, growth: 1.25, perRun: true, text: (n) => `배율 x${n}에 도달하기` },
  { id: 'runs', metric: 'runs', icon: '🎮', base: 6, growth: 1.3, text: (n) => `${n}번 질주하기` },
];

/** Goal for a mission at a given set number (1-based), rounded readably. */
export function goalFor(def: MissionDef, set: number): number {
  const raw = def.base * Math.pow(def.growth, Math.max(0, set - 1));
  if (raw >= 1000) return Math.round(raw / 100) * 100;
  if (raw >= 100) return Math.round(raw / 10) * 10;
  return Math.max(1, Math.round(raw));
}

/** Coin reward for completing a whole set. */
export function setReward(set: number): number {
  return 400 + set * 250;
}

/** Pick three distinct missions for a set, avoiding the previous three. */
export function rollMissions(set: number, avoid: string[] = []): {
  id: string;
  goal: number;
  progress: number;
}[] {
  const pool = MISSIONS.filter((m) => !avoid.includes(m.id));
  const chosen: MissionDef[] = [];
  const bag = pool.length >= 3 ? [...pool] : [...MISSIONS];
  while (chosen.length < 3 && bag.length) {
    const i = (Math.random() * bag.length) | 0;
    chosen.push(bag.splice(i, 1)[0]);
  }
  return chosen.map((m) => ({ id: m.id, goal: goalFor(m, set), progress: 0 }));
}

export function getMission(id: string): MissionDef {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
}

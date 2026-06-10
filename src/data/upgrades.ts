/** Permanent upgrades bought with coins (reference's 5-track model). */
export interface UpgradeDef {
  id: string;
  name: string;
  emoji: string;
  max: number;
  cost: (level: number) => number;
  desc: string;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'magnet', name: '코인 자석', emoji: '🧲', max: 5, cost: (l) => 120 * (l + 1), desc: '자석 지속시간 증가' },
  { id: 'boots', name: '점프 부츠', emoji: '🥾', max: 5, cost: (l) => 120 * (l + 1), desc: '부츠 지속시간 증가' },
  { id: 'x2', name: '스코어 x2', emoji: '✨', max: 5, cost: (l) => 150 * (l + 1), desc: 'x2 지속시간 증가' },
  { id: 'multiplier', name: '코인 가치', emoji: '💰', max: 5, cost: (l) => 200 * (l + 1), desc: '코인당 점수 +' },
  { id: 'headstart', name: '스타트 부스트', emoji: '🚀', max: 3, cost: (l) => 400 * (l + 1), desc: '시작 가속 시간' },
];

export type UpgradeId = (typeof UPGRADES)[number]['id'];

export function getUpgrade(id: string): UpgradeDef {
  return UPGRADES.find((u) => u.id === id)!;
}

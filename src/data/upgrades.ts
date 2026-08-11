import { POWERUPS, PowerupType } from '../config/powerups';

/** Permanent upgrades bought with coins. Each level is pricier than the last. */
export interface UpgradeDef {
  id: string;
  name: string;
  emoji: string;
  max: number;
  cost: (level: number) => number;
  desc: string;
  /** Value shown for the *next* level, e.g. "12s → 15s". */
  valueAt: (level: number) => string;
}

/** Seconds added to a power-up per upgrade level. */
export const UPGRADE_SECONDS = 2.5;

function powerUpgrade(id: string, type: PowerupType, emoji: string, base: number): UpgradeDef {
  const def = POWERUPS[type];
  return {
    id,
    name: def.label,
    emoji,
    max: 5,
    cost: (l) => base * (l + 1),
    desc: '지속 시간 +2.5초 / 레벨',
    valueAt: (l) => `${(def.duration + l * UPGRADE_SECONDS).toFixed(1)}초`,
  };
}

export const UPGRADES: UpgradeDef[] = [
  powerUpgrade('magnet', PowerupType.MAGNET, '🧲', 250),
  powerUpgrade('double', PowerupType.DOUBLE, '✖️', 300),
  powerUpgrade('sneakers', PowerupType.SNEAKERS, '👟', 250),
  powerUpgrade('jetpack', PowerupType.JETPACK, '🚀', 400),
  {
    id: 'boardtime', name: '호버보드', emoji: '🛹', max: 5,
    cost: (l) => 350 * (l + 1),
    desc: '보드 지속 시간 +5초 / 레벨',
    valueAt: (l) => `${30 + l * 5}초`,
  },
  {
    id: 'headstart', name: '스타트 부스트', emoji: '⚡', max: 4,
    cost: (l) => 500 * (l + 1),
    desc: '출발 가속 거리 증가',
    valueAt: (l) => `${200 + l * 150}m`,
  },
];

export type UpgradeId = (typeof UPGRADES)[number]['id'];

export function getUpgrade(id: string): UpgradeDef {
  return UPGRADES.find((u) => u.id === id)!;
}

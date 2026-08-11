import type { Inventory } from './SaveManager';

/** Items bought before a run and consumed by it. */
export interface ConsumableDef {
  id: keyof Inventory;
  name: string;
  emoji: string;
  price: number;
  /** Priced in keys instead of coins. */
  key?: boolean;
  desc: string;
  glow: string;
}

export const CONSUMABLES: ConsumableDef[] = [
  {
    id: 'headstart', name: '헤드스타트', emoji: '⚡', price: 350,
    desc: '출발하자마자 1000m를 무적으로 돌파', glow: '#ffd23f88',
  },
  {
    id: 'booster', name: '스코어 부스터', emoji: '✖️', price: 500,
    desc: '이번 질주 내내 점수 2배', glow: '#ff8a1f88',
  },
  {
    id: 'board', name: '예비 호버보드', emoji: '🛹', price: 300,
    desc: '질주 시작 시 보드 1개를 들고 출발', glow: '#8a7bff88',
  },
  {
    id: 'mystery', name: '미스터리 박스', emoji: '❓', price: 3, key: true,
    desc: '결과 화면에서 열어 무작위 보상 획득', glow: '#ff4fd888',
  },
];

export function getConsumable(id: string): ConsumableDef {
  return CONSUMABLES.find((c) => c.id === id)!;
}

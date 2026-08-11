/**
 * The world tour — a reward track that advances with **lifetime distance**.
 * Each stop is a real district on the route; reaching it unlocks a claimable
 * crate of coins, keys and spare boards, so long-haul play always pays out.
 */
export interface Milestone {
  /** Lifetime metres required. */
  need: number;
  coins: number;
  keys: number;
  boards: number;
  icon: string;
  /** District this stop corresponds to. */
  label: string;
}

export const JOURNEY: Milestone[] = [
  { need: 1500, coins: 300, keys: 0, boards: 1, icon: '📦', label: '서울' },
  { need: 4000, coins: 600, keys: 1, boards: 0, icon: '📦', label: '도쿄 야경' },
  { need: 8000, coins: 1000, keys: 0, boards: 2, icon: '🎁', label: '뉴욕' },
  { need: 14000, coins: 1600, keys: 2, boards: 0, icon: '🎁', label: '리우' },
  { need: 22000, coins: 2400, keys: 1, boards: 2, icon: '🧊', label: '아이슬란드' },
  { need: 34000, coins: 3400, keys: 3, boards: 0, icon: '🏜️', label: '사막 협곡' },
  { need: 50000, coins: 5000, keys: 3, boards: 3, icon: '🌆', label: '네온 지하' },
  { need: 70000, coins: 7000, keys: 5, boards: 3, icon: '❄️', label: '설원' },
  { need: 100000, coins: 12000, keys: 8, boards: 5, icon: '👑', label: '월드 투어 완주' },
];

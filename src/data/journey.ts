/**
 * The mileage "journey" — a Clash-Royale-style reward track. Each milestone
 * unlocks once the player's *lifetime* mileage (totalMileage) reaches `need`,
 * and can then be claimed for coins and/or consumable items. Designed to be
 * generous so progress feels constant.
 */
export interface Milestone {
  need: number; // lifetime mileage required
  coins: number;
  bomb: number;
  rocket: number;
  /** Big chest emoji shown on the node. */
  icon: string;
  /** Optional label for a special node. */
  label?: string;
}

export const JOURNEY: Milestone[] = [
  { need: 20, coins: 150, bomb: 1, rocket: 0, icon: '📦' },
  { need: 50, coins: 300, bomb: 0, rocket: 1, icon: '📦' },
  { need: 100, coins: 500, bomb: 2, rocket: 0, icon: '🎁' },
  { need: 180, coins: 800, bomb: 0, rocket: 2, icon: '🎁' },
  { need: 300, coins: 1200, bomb: 2, rocket: 1, icon: '💎', label: '보석 상자' },
  { need: 450, coins: 1800, bomb: 0, rocket: 3, icon: '🎁' },
  { need: 650, coins: 2500, bomb: 3, rocket: 2, icon: '👑', label: '왕관 상자' },
  { need: 900, coins: 3500, bomb: 3, rocket: 3, icon: '💎', label: '보석 상자' },
  { need: 1300, coins: 5000, bomb: 4, rocket: 4, icon: '👑', label: '전설 상자' },
];

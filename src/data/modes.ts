import type { GameMode } from './SaveManager';

/** Per-mode rules + presentation for the mode carousel. */
export interface ModeDef {
  id: GameMode;
  icon: string;
  name: string;
  desc: string;
  /** Run timer in seconds (0 = endless). */
  timer: number;
  /** Base speed multiplier. */
  speedMult: number;
  /** Score multiplier for the whole run. */
  scoreMult: number;
  /** Coin trail density multiplier. */
  coinDensity: number;
  /** Cap on layout difficulty (4 = no cap). */
  difficultyCap: number;
  /** Paid revive allowed on the results screen. */
  reviveAllowed: boolean;
  /** Extra oncoming expresses. */
  expressRush: boolean;
  /** Seconds added at each checkpoint in timed modes. */
  timeBonus: number;
}

export const MODES: ModeDef[] = [
  {
    id: 'endless', icon: '♾️', name: '엔들리스', desc: '클래식 — 잡히지 말고 최대한 멀리',
    timer: 0, speedMult: 1, scoreMult: 1, coinDensity: 1, difficultyCap: 4,
    reviveAllowed: true, expressRush: false, timeBonus: 0,
  },
  {
    id: 'timeattack', icon: '⏱️', name: '타임 어택', desc: '90초 — 체크포인트마다 +8초',
    timer: 90, speedMult: 1.05, scoreMult: 1.2, coinDensity: 1, difficultyCap: 4,
    reviveAllowed: true, expressRush: false, timeBonus: 8,
  },
  {
    id: 'coinrush', icon: '🪙', name: '코인 러시', desc: '60초 코인 파티 — 장애물은 순한 맛',
    timer: 60, speedMult: 1, scoreMult: 1, coinDensity: 2.2, difficultyCap: 2,
    reviveAllowed: true, expressRush: false, timeBonus: 6,
  },
  {
    id: 'express', icon: '🚄', name: '특급 러시', desc: '특급 열차가 끊임없이 달려온다',
    timer: 0, speedMult: 1.1, scoreMult: 1.6, coinDensity: 1, difficultyCap: 4,
    reviveAllowed: true, expressRush: true, timeBonus: 0,
  },
  {
    id: 'hardcore', icon: '💀', name: '하드코어', desc: '초고속 · 부활 없음 · 점수 2배',
    timer: 0, speedMult: 1.3, scoreMult: 2, coinDensity: 0.85, difficultyCap: 4,
    reviveAllowed: false, expressRush: false, timeBonus: 0,
  },
];

export function getMode(id: GameMode): ModeDef {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}

/** Distance between checkpoints (coin / time bonus). */
export const CHECKPOINT_DIST = 1000;

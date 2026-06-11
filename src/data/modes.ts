import type { GameMode } from './SaveManager';

/** Per-mode rules + presentation for the mode-select carousel. */
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
  /** Coin pattern density multiplier. */
  coinDensity: number;
  /** Cap on obstacle template difficulty (3 = none). */
  difficultyCap: number;
  /** Paid revive allowed on the game-over screen. */
  reviveAllowed: boolean;
  /** Floor periodically turns to lava — touching it then is fatal. */
  lava: boolean;
}

export const MODES: ModeDef[] = [
  {
    id: 'endless', icon: '♾️', name: '무한 모드', desc: '클래식 — 최대한 멀리!',
    timer: 0, speedMult: 1, scoreMult: 1, coinDensity: 1, difficultyCap: 3,
    reviveAllowed: true, lava: false,
  },
  {
    id: 'challenge', icon: '⏱️', name: '챌린지', desc: '60초 타임어택, 체크포인트 +6초',
    timer: 60, speedMult: 1, scoreMult: 1, coinDensity: 1, difficultyCap: 3,
    reviveAllowed: true, lava: false,
  },
  {
    id: 'lava', icon: '🌋', name: '용암 바닥', desc: '바닥이 주기적으로 용암으로! 공중·지붕으로 피하세요',
    timer: 0, speedMult: 0.95, scoreMult: 1.5, coinDensity: 1, difficultyCap: 2,
    reviveAllowed: true, lava: true,
  },
  {
    id: 'rush', icon: '🪙', name: '코인 러시', desc: '45초 동안 코인 파티 — 장애물은 쉬움',
    timer: 45, speedMult: 1.05, scoreMult: 1, coinDensity: 2, difficultyCap: 1,
    reviveAllowed: true, lava: false,
  },
  {
    id: 'hardcore', icon: '💀', name: '하드코어', desc: '빠르고 무자비 — 부활 불가, 점수 2배',
    timer: 0, speedMult: 1.25, scoreMult: 2, coinDensity: 1, difficultyCap: 3,
    reviveAllowed: false, lava: false,
  },
];

export function getMode(id: GameMode): ModeDef {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}

// ── Lava cycle tuning ───────────────────────────────────────────────────────
/** Seconds of safe floor between lava phases. */
export const LAVA_SAFE = 6;
/** Seconds of warning glow before the floor becomes deadly. */
export const LAVA_WARN = 1.6;
/** Seconds the floor stays molten (deadly to stand on). */
export const LAVA_HOT = 2.4;

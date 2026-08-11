/**
 * Hoverboards. Deploy one with a double-tap (or Shift / E): it carries you for
 * {@link BOARD_BASE_SECONDS} seconds and, crucially, **absorbs one crash** — the
 * board shatters instead of you. Each deck also carries a perk, so which board
 * you equip changes how a run plays.
 */
export interface BoardAbility {
  /** Extra seconds of board time. */
  extraTime?: number;
  /** Jump multiplier while riding. */
  jumpMult?: number;
  /** World-speed multiplier while riding. */
  speedMult?: number;
  /** Coin magnet stays on for the whole ride. */
  magnet?: boolean;
  /** Coins are worth double while riding. */
  coinMult?: number;
  /** Absorbs two crashes instead of one. */
  doubleAbsorb?: boolean;
  /** Automatically hops small hurdles while riding. */
  autoHop?: boolean;
}

export interface BoardColors {
  deck: number;
  glow: number;
  trim: number;
}

export interface BoardDef {
  id: string;
  name: string;
  /** Price in coins, or keys when `key` is true. 0 = owned by default. */
  price: number;
  key?: boolean;
  blurb: string;
  colors: BoardColors;
  ability: BoardAbility;
}

/** Base ride time before board perks and upgrades. */
export const BOARD_BASE_SECONDS = 30;

export const BOARDS: BoardDef[] = [
  {
    id: 'standard', name: '스탠다드', price: 0,
    blurb: '기본기에 충실한 보드',
    colors: { deck: 0x3fa9f5, glow: 0x9adfff, trim: 0xf0f3f7 },
    ability: {},
  },
  {
    id: 'lowrider', name: '로우라이더', price: 800,
    blurb: '🛹 지속 +10초',
    colors: { deck: 0xe0603c, glow: 0xffb37a, trim: 0x2b2f38 },
    ability: { extraTime: 10 },
  },
  {
    id: 'bouncer', name: '바운서', price: 1500,
    blurb: '⬆️ 점프 +45% · 낮은 장애물 자동 통과',
    colors: { deck: 0x6bff9a, glow: 0xd0ffd8, trim: 0x14321f },
    ability: { jumpMult: 1.45, autoHop: true },
  },
  {
    id: 'magneto', name: '마그네토', price: 2400,
    blurb: '🧲 타는 내내 코인 자석',
    colors: { deck: 0x8a7bff, glow: 0xcfc8ff, trim: 0xf0f3f7 },
    ability: { magnet: true },
  },
  {
    id: 'daytripper', name: '데이트리퍼', price: 3600,
    blurb: '💰 타는 동안 코인 2배',
    colors: { deck: 0xffd23f, glow: 0xfff2b0, trim: 0x6a4a00 },
    ability: { coinMult: 2 },
  },
  {
    id: 'bolt', name: '볼트', price: 5200,
    blurb: '💨 속도 +18% · 지속 +5초',
    colors: { deck: 0x00e0ff, glow: 0xc8faff, trim: 0x00303a },
    ability: { speedMult: 1.18, extraTime: 5 },
  },
  {
    id: 'phantom', name: '팬텀', price: 9, key: true,
    blurb: '🗝️ 충돌 2회 흡수',
    colors: { deck: 0x2a1a4a, glow: 0xb08bff, trim: 0x8a7bff },
    ability: { doubleAbsorb: true },
  },
  {
    id: 'aurora', name: '오로라 웨이브', price: 18, key: true,
    blurb: '🗝️ 자석 + 지속 +12초 + 점프 +25%',
    colors: { deck: 0x0f7a72, glow: 0x9affe0, trim: 0x2ee0b0 },
    ability: { magnet: true, extraTime: 12, jumpMult: 1.25 },
  },
];

export function getBoard(id: string): BoardDef {
  return BOARDS.find((b) => b.id === id) ?? BOARDS[0];
}

/**
 * The 8 Sunset Runner characters. Each has a fixed humanoid look (skin / shirt /
 * pants / shoes / hat colours + trail colour) assembled from primitives, and a
 * fixed passive **ability** expressed as flat run modifiers. Faithful to the
 * reference roster (러너 / 아쿠아 / 섀도우 닌자 / 네온 라이더 / 우주인 / 피닉스 /
 * 골든 스타 / 코스모스). Prices are coins unless `gem` is true (premium).
 */
export interface CharAbility {
  /** Magnet power-up duration multiplier (아쿠아). */
  magnetMult?: number;
  /** Permanent score multiplier (네온 라이더, 코스모스). */
  scoreMult?: number;
  /** Coin value multiplier (골든 스타, 코스모스). */
  coinMult?: number;
  /** Lane-change speed multiplier (섀도우 닌자). */
  laneSpeedMult?: number;
  /** Extra seconds of invulnerability after a hit absorb (섀도우 닌자). */
  hitInvulnBonus?: number;
  /** Reduced gravity / higher jumps (우주인). */
  lowGravity?: boolean;
  /** One free revive per run (피닉스). */
  revive?: boolean;
}

export interface CharColors {
  skin: number;
  shirt: number;
  pants: number;
  shoes: number;
  hat: number;
  trail: number;
}

export interface CharacterDef {
  id: string;
  name: string;
  /** Price in coins, or in gems when `gem` is true. 0 = owned by default. */
  price: number;
  gem?: boolean;
  /** Short ability blurb shown in the UI. */
  blurb: string;
  colors: CharColors;
  ability: CharAbility;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'runner',
    name: '러너',
    price: 0,
    blurb: '균형 잡힌 올라운더',
    colors: { skin: 0xffd0a8, shirt: 0xff5e8a, pants: 0x3a4a8a, shoes: 0xfff2d0, hat: 0xff5e8a, trail: 0xff7eb3 },
    ability: {},
  },
  {
    id: 'aqua',
    name: '아쿠아',
    price: 600,
    blurb: '🧲 자석 지속 +50%',
    colors: { skin: 0xffe0c0, shirt: 0x3ad1ff, pants: 0x1c6fb0, shoes: 0xd0f6ff, hat: 0x3ad1ff, trail: 0x55c8ff },
    ability: { magnetMult: 1.5 },
  },
  {
    id: 'ninja',
    name: '섀도우 닌자',
    price: 1500,
    blurb: '⚡ 초고속 레인 이동 + 피격 무적 +1초',
    colors: { skin: 0xe8c9a8, shirt: 0x2a2540, pants: 0x15121f, shoes: 0x403a5a, hat: 0x2a2540, trail: 0x8a7bff },
    ability: { laneSpeedMult: 1.6, hitInvulnBonus: 1 },
  },
  {
    id: 'neon',
    name: '네온 라이더',
    price: 3000,
    blurb: '✨ 점수 상시 +25%',
    colors: { skin: 0xffd0a8, shirt: 0xff3bd0, pants: 0x2a0f4a, shoes: 0x00ffd0, hat: 0xff3bd0, trail: 0xff7eff },
    ability: { scoreMult: 1.25 },
  },
  {
    id: 'astro',
    name: '우주인',
    price: 5000,
    blurb: '🌙 저중력 — 더 높고 길게 점프',
    colors: { skin: 0xffe6cc, shirt: 0xeef2ff, pants: 0xc9d2e6, shoes: 0xaab4cc, hat: 0xeef2ff, trail: 0xcfe0ff },
    ability: { lowGravity: true },
  },
  {
    id: 'phoenix',
    name: '피닉스',
    price: 9000,
    blurb: '💖 1회 부활 — 충돌해도 한 번 살아남음',
    colors: { skin: 0xffd0a8, shirt: 0xff5a2a, pants: 0xb02810, shoes: 0xffd23f, hat: 0xff8a2a, trail: 0xff6a2a },
    ability: { revive: true },
  },
  {
    id: 'golden',
    name: '골든 스타',
    price: 18000,
    blurb: '💰 모든 코인 2배',
    colors: { skin: 0xffe0b0, shirt: 0xffd23f, pants: 0xb88a10, shoes: 0xfff0a0, hat: 0xffd23f, trail: 0xffe06b },
    ability: { coinMult: 2 },
  },
  {
    id: 'celestial',
    name: '코스모스',
    price: 150,
    gem: true,
    blurb: '💎 코인 2배 + 점수 +25%',
    colors: { skin: 0xf0e0ff, shirt: 0x6a4bd0, pants: 0x2a1a5a, shoes: 0x9affe0, hat: 0x6a4bd0, trail: 0x9affe0 },
    ability: { coinMult: 2, scoreMult: 1.25 },
  },
];

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

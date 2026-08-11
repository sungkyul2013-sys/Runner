/**
 * The METRO SURF crew. Each runner has a hand-built look (skin / hair / top /
 * bottom / shoes / cap / accent) assembled from primitives by
 * {@link Character}, a short bio, and a passive perk expressed as flat run
 * modifiers. The starter is free; the rest cost coins, and the two headliners
 * cost keys.
 */
export interface CharAbility {
  /** Coin Magnet duration multiplier. */
  magnetMult?: number;
  /** Permanent score multiplier (1.2 = +20 %). */
  scoreMult?: number;
  /** Coin pickup multiplier. */
  coinMult?: number;
  /** Lane-change speed multiplier. */
  laneSpeedMult?: number;
  /** Extra seconds of invulnerability after absorbing a hit. */
  hitInvulnBonus?: number;
  /** Reduced gravity — higher, floatier jumps. */
  lowGravity?: boolean;
  /** Survive one stumble per run for free. */
  extraStumble?: boolean;
  /** Start every run with a hoverboard already charged. */
  freeBoard?: boolean;
  /** Letters and mystery boxes are drawn to you like a weak magnet. */
  tokenMagnet?: boolean;
  /** Jetpack duration multiplier. */
  jetpackMult?: number;
  /** Duration multiplier applied to *every* timed power-up. */
  powerMult?: number;
  /** Style-chain payout multiplier. */
  trickMult?: number;
  /** Headstart distance multiplier. */
  headstartMult?: number;
  /** Gravity multiplier while rising — a floatier arc without a full moon-jump. */
  glide?: number;
  /** Free hoverboards carried into every run (resolved from freeBoard + level). */
  freeBoards?: number;
  /** Free stumbles per run beyond the base one. */
  extraStumbles?: number;
}

/** Levels a character can be upgraded to. */
export const MAX_CHAR_LEVEL = 5;

/** Coin cost of taking a character from `level` to `level + 1`. */
export function charUpgradeCost(level: number): number {
  return Math.round(700 * Math.pow(level, 1.7) / 50) * 50;
}

/**
 * A character's perk at a given level. Every numeric bonus grows by 25 % of its
 * base value per level, so a level-5 runner is twice the character a level-1 one
 * is, and the two flag perks turn into real numbers along the way.
 */
export function scaledAbility(def: CharacterDef, level: number): CharAbility {
  const lv = Math.max(1, Math.min(MAX_CHAR_LEVEL, level));
  const k = 1 + (lv - 1) * 0.25;
  const a = def.ability;
  const grow = (v: number | undefined): number | undefined =>
    v === undefined ? undefined : 1 + (v - 1) * k;
  const shrink = (v: number | undefined): number | undefined =>
    v === undefined ? undefined : 1 - (1 - v) * k;
  return {
    ...a,
    magnetMult: grow(a.magnetMult),
    scoreMult: grow(a.scoreMult),
    coinMult: grow(a.coinMult),
    laneSpeedMult: grow(a.laneSpeedMult),
    jetpackMult: grow(a.jetpackMult),
    powerMult: grow(a.powerMult),
    trickMult: grow(a.trickMult),
    headstartMult: grow(a.headstartMult),
    glide: shrink(a.glide),
    hitInvulnBonus: a.hitInvulnBonus === undefined ? undefined : a.hitInvulnBonus * k,
    freeBoards: a.freeBoard ? (lv >= 3 ? 2 : 1) : 0,
    extraStumbles: a.extraStumble ? (lv >= 4 ? 2 : 1) : 0,
  };
}

/** A one-line summary of what the next level buys. */
export function levelBlurb(def: CharacterDef, level: number): string {
  const a = def.ability;
  const pct = (v: number) => `${Math.round((v - 1) * (1 + level * 0.25) * 100)}%`;
  if (a.magnetMult) return `자석 지속 +${pct(a.magnetMult)}`;
  if (a.scoreMult) return `점수 +${pct(a.scoreMult)}`;
  if (a.coinMult) return `코인 +${pct(a.coinMult)}`;
  if (a.powerMult) return `파워업 지속 +${pct(a.powerMult)}`;
  if (a.trickMult) return `스타일 보너스 +${pct(a.trickMult)}`;
  if (a.jetpackMult) return `제트팩 지속 +${pct(a.jetpackMult)}`;
  if (a.headstartMult) return `헤드스타트 +${pct(a.headstartMult)}`;
  if (a.laneSpeedMult) return `레인 전환 +${pct(a.laneSpeedMult)}`;
  if (a.glide) return '체공 시간 증가';
  if (a.freeBoard) return level >= 2 ? '시작 보드 2개' : '시작 보드 1개';
  if (a.extraStumble) return level >= 3 ? '무료 회복 2회' : '무료 회복 1회';
  return '기본 능력 강화';
}

export interface CharColors {
  skin: number;
  hair: number;
  top: number;
  bottom: number;
  shoes: number;
  cap: number;
  accent: number;
  trail: number;
}

export interface CharacterDef {
  id: string;
  name: string;
  /** Price in coins, or in keys when `key` is true. 0 = owned by default. */
  price: number;
  key?: boolean;
  /** One-line perk summary shown on the card. */
  blurb: string;
  /** Flavour bio shown on the detail panel. */
  bio: string;
  colors: CharColors;
  ability: CharAbility;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'jino',
    name: '지노',
    price: 0,
    blurb: '균형 잡힌 올라운더',
    bio: '역 앞 벽화를 그리다 순찰에 걸린 뒤로, 매일 밤 선로를 달린다.',
    colors: { skin: 0xf6c9a0, hair: 0x2b2028, top: 0xe23c3c, bottom: 0x2f3a52, shoes: 0xf4f4f4, cap: 0xe23c3c, accent: 0xffd23f, trail: 0xff6a4d },
    ability: {},
  },
  {
    id: 'mina',
    name: '미나',
    price: 500,
    blurb: '🧲 자석 지속 +60%',
    bio: '고물상집 딸. 자석이라면 눈 감고도 만든다.',
    colors: { skin: 0xffdcb8, hair: 0x8a4bd0, top: 0x3ad1ff, bottom: 0x1c4f78, shoes: 0xfff0a0, cap: 0x3ad1ff, accent: 0xff4fd8, trail: 0x55c8ff },
    ability: { magnetMult: 1.6 },
  },
  {
    id: 'tex',
    name: '텍스',
    price: 900,
    blurb: '⚡ 레인 전환 초고속 + 무적 +1초',
    bio: '스케이트 파크 출신. 몸이 먼저 움직인다.',
    colors: { skin: 0x8d5a3b, hair: 0x1b1418, top: 0x2b2f38, bottom: 0x14171d, shoes: 0x3ad17a, cap: 0x2b2f38, accent: 0x3ad17a, trail: 0x6bff9a },
    ability: { laneSpeedMult: 1.7, hitInvulnBonus: 1 },
  },
  {
    id: 'nari',
    name: '나리',
    price: 1400,
    blurb: '🎒 시작부터 호버보드 1개',
    bio: '보드 정비공. 남는 보드는 늘 가방 안에 있다.',
    colors: { skin: 0xf3c49a, hair: 0xd8a13a, top: 0xf6c944, bottom: 0x4a3a2a, shoes: 0x2b3038, cap: 0xf6c944, accent: 0xe0603c, trail: 0xffd23f },
    ability: { freeBoard: true },
  },
  {
    id: 'kaito',
    name: '카이토',
    price: 2200,
    blurb: '🪂 제트팩 지속 +50%',
    bio: '공항 정비반 막내. 하늘에 미련이 많다.',
    colors: { skin: 0xffd7ae, hair: 0x232a3a, top: 0xe8ecf2, bottom: 0x37507a, shoes: 0xe23c3c, cap: 0xe8ecf2, accent: 0x3fa9f5, trail: 0x9ad8ff },
    ability: { jetpackMult: 1.5 },
  },
  {
    id: 'zoe',
    name: '조이',
    price: 3200,
    blurb: '✨ 점수 상시 +25%',
    bio: '네온 간판 디자이너. 어두울수록 빛난다.',
    colors: { skin: 0xf0c2a0, hair: 0xff4fd8, top: 0x2a1040, bottom: 0x140828, shoes: 0xff4fd8, cap: 0x2a1040, accent: 0x00ffd0, trail: 0xff7eff },
    ability: { scoreMult: 1.25 },
  },
  {
    id: 'oleg',
    name: '올레그',
    price: 4800,
    blurb: '🌙 저중력 — 더 높고 길게 점프',
    bio: '전직 고공 작업자. 떨어지는 법을 모른다.',
    colors: { skin: 0xf7ddc4, hair: 0xd8d8dc, top: 0xeef2ff, bottom: 0xb9c3d6, shoes: 0x9aa4b8, cap: 0xeef2ff, accent: 0x7fb8e0, trail: 0xcfe0ff },
    ability: { lowGravity: true },
  },
  {
    id: 'sol',
    name: '솔',
    price: 6500,
    blurb: '💖 한 번의 비틀거림을 무료로 회복',
    bio: '불꽃놀이 기술자. 넘어져도 다시 타오른다.',
    colors: { skin: 0xd89a6a, hair: 0xff6a2a, top: 0xff5a2a, bottom: 0x8c2a12, shoes: 0xffd23f, cap: 0xff8a2a, accent: 0xffd23f, trail: 0xff6a2a },
    ability: { extraStumble: true },
  },
  {
    id: 'rina',
    name: '리나',
    price: 9000,
    blurb: '💰 모든 코인 2배',
    bio: '분실물 센터 직원. 동전은 절대 놓치지 않는다.',
    colors: { skin: 0xffe0b0, hair: 0xffd23f, top: 0xffd23f, bottom: 0x9a7410, shoes: 0xfff6c8, cap: 0xffd23f, accent: 0xf0f3f7, trail: 0xffe06b },
    ability: { coinMult: 2 },
  },
  {
    id: 'byte',
    name: '바이트',
    price: 12000,
    blurb: '🔤 글자·상자가 끌려옴',
    bio: '개찰구를 해킹하던 아이. 이제는 선로를 해킹한다.',
    colors: { skin: 0xc8d4e0, hair: 0x00ffd0, top: 0x14324a, bottom: 0x0a1c2c, shoes: 0x00ffd0, cap: 0x14324a, accent: 0x00ffd0, trail: 0x00ffd0 },
    ability: { tokenMagnet: true },
  },
  {
    id: 'hiro',
    name: '히로',
    price: 15000,
    blurb: '🪁 체공 시간 증가 — 더 길게 난다',
    bio: '옥상에서 옥상으로 뛰던 파쿠르 키드. 착지는 나중 문제.',
    colors: { skin: 0xf1c49c, hair: 0x1f2430, top: 0x2ee0b0, bottom: 0x14323a, shoes: 0xf4f4f4, cap: 0x2ee0b0, accent: 0xffd23f, trail: 0x2ee0b0 },
    ability: { glide: 0.82 },
  },
  {
    id: 'luna',
    name: '루나',
    price: 18000,
    blurb: '🔥 스타일 체인 보너스 2배',
    bio: '심야 스케이트 크루의 리더. 점수보다 폼이 먼저다.',
    colors: { skin: 0xe9c7b0, hair: 0xc8a2ff, top: 0x2a1a4a, bottom: 0x140b26, shoes: 0xc8a2ff, cap: 0x2a1a4a, accent: 0xc8a2ff, trail: 0xb08bff },
    ability: { trickMult: 2 },
  },
  {
    id: 'dos',
    name: '도스',
    price: 22000,
    blurb: '⏳ 모든 파워업 지속 +35%',
    bio: '폐역 자판기를 고치던 손. 뭐든 조금 더 오래 가게 만든다.',
    colors: { skin: 0xa8724c, hair: 0x241a14, top: 0xf6c944, bottom: 0x3a2a18, shoes: 0x2b2f38, cap: 0xf6c944, accent: 0xe0603c, trail: 0xffd23f },
    ability: { powerMult: 1.35 },
  },
  {
    id: 'sage',
    name: '세이지',
    price: 8, key: true,
    blurb: '🗝️ 헤드스타트 2배 + 무료 회복',
    bio: '노선도를 전부 외운 은퇴 기관사. 첫 구간은 눈 감고도 간다.',
    colors: { skin: 0xf3d9c0, hair: 0xdcdce4, top: 0x2f4f5c, bottom: 0x1a2c34, shoes: 0xdcdce4, cap: 0x2f4f5c, accent: 0x8ff0ff, trail: 0x8ff0ff },
    ability: { headstartMult: 2, extraStumble: true },
  },
  {
    id: 'noir',
    name: '느와르',
    price: 12,
    key: true,
    blurb: '🗝️ 코인 2배 + 점수 +25%',
    bio: '아무도 얼굴을 본 적 없는 전설의 태거.',
    colors: { skin: 0xe8e0f0, hair: 0x1a1024, top: 0x2a1a4a, bottom: 0x120a20, shoes: 0x8a7bff, cap: 0x2a1a4a, accent: 0x8a7bff, trail: 0x9a8bff },
    ability: { coinMult: 2, scoreMult: 1.25 },
  },
  {
    id: 'aurora',
    name: '오로라',
    price: 20,
    key: true,
    blurb: '🗝️ 저중력 + 자석 +60% + 무료 보드',
    bio: '오로라가 뜨는 밤에만 나타난다는 소문의 러너.',
    colors: { skin: 0xfbe7d6, hair: 0x2ee0b0, top: 0x0f7a72, bottom: 0x123a52, shoes: 0x9affe0, cap: 0x0f7a72, accent: 0x9affe0, trail: 0x2ee0b0 },
    ability: { lowGravity: true, magnetMult: 1.6, freeBoard: true },
  },
];

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

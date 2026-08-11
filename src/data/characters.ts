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

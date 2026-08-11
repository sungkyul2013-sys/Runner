import { type CharColors, getCharacter } from './characters';

/**
 * Outfits. Every runner ships in their default fit and can be re-styled with
 * two alternates that recolour the rig — a fresh look for the same perk, in the
 * spirit of Subway Surfers' outfit unlocks. Outfits only ever *override* part of
 * the palette, so each one still reads as the same character.
 */
export interface OutfitDef {
  id: string;
  name: string;
  /** Price in coins, or in keys when `key` is true. 0 = owned by default. */
  price: number;
  key?: boolean;
  /** Palette overrides applied on top of the character's default colours. */
  colors: Partial<CharColors>;
}

/** Composite key used by the save file. */
export function outfitKey(charId: string, outfitId: string): string {
  return `${charId}:${outfitId}`;
}

const DEFAULT: OutfitDef = { id: 'default', name: '기본', price: 0, colors: {} };

/** Per-character outfit lists. Index 0 is always the free default fit. */
export const OUTFITS: Record<string, OutfitDef[]> = {
  jino: [
    DEFAULT,
    {
      id: 'varsity', name: '바시티', price: 1200,
      colors: { top: 0x1d3f7a, cap: 0xf0f3f7, accent: 0xffd23f, bottom: 0x1a1f2c, shoes: 0xe23c3c },
    },
    {
      id: 'hivis', name: '야간 작업', price: 2600,
      colors: { top: 0xcaff3a, cap: 0x2b2f38, accent: 0x2b2f38, bottom: 0x2b2f38, shoes: 0xcaff3a },
    },
  ],
  mina: [
    DEFAULT,
    {
      id: 'sunset', name: '노을', price: 1400,
      colors: { top: 0xff8a5c, cap: 0xff8a5c, accent: 0xffe27a, hair: 0xff4fd8 },
    },
    {
      id: 'deepsea', name: '심해', price: 2800,
      colors: { top: 0x0f3d5c, cap: 0x0f3d5c, accent: 0x2ee0b0, hair: 0x2ee0b0, bottom: 0x08202e },
    },
  ],
  tex: [
    DEFAULT,
    {
      id: 'court', name: '코트', price: 1600,
      colors: { top: 0xf0f3f7, cap: 0xe23c3c, accent: 0xe23c3c, bottom: 0xd7dde5, shoes: 0x1b1418 },
    },
    {
      id: 'midnight', name: '미드나잇', price: 3200,
      colors: { top: 0x14324a, cap: 0x14324a, accent: 0x00e0ff, shoes: 0x00e0ff },
    },
  ],
  nari: [
    DEFAULT,
    {
      id: 'garage', name: '정비소', price: 1800,
      colors: { top: 0x2b6f5a, cap: 0x2b6f5a, accent: 0xf6c944, bottom: 0x2a2018 },
    },
    {
      id: 'candy', name: '캔디', price: 3400,
      colors: { top: 0xff9ce8, cap: 0xff9ce8, accent: 0xffffff, hair: 0xffe27a, bottom: 0x8a3f7a },
    },
  ],
  kaito: [
    DEFAULT,
    {
      id: 'pilot', name: '파일럿', price: 2000,
      colors: { top: 0x2a3a52, cap: 0xf0f3f7, accent: 0xffd23f, bottom: 0x1a2233 },
    },
    {
      id: 'stormfront', name: '스톰프론트', price: 3800,
      colors: { top: 0x1a1f2c, cap: 0x1a1f2c, accent: 0x8fd4ff, shoes: 0x8fd4ff },
    },
  ],
  zoe: [
    DEFAULT,
    {
      id: 'holo', name: '홀로', price: 2400,
      colors: { top: 0x0a2a3a, cap: 0x0a2a3a, accent: 0x00ffd0, hair: 0x00ffd0 },
    },
    {
      id: 'crimson', name: '크림슨', price: 4200,
      colors: { top: 0x3a0a1c, cap: 0x3a0a1c, accent: 0xff3b57, hair: 0xff3b57, shoes: 0xff3b57 },
    },
  ],
  oleg: [
    DEFAULT,
    {
      id: 'orbital', name: '오비탈', price: 2800,
      colors: { top: 0xd7dde5, cap: 0xd7dde5, accent: 0xff7a2a, bottom: 0x8f9aad },
    },
    {
      id: 'voidwalk', name: '보이드', price: 4600,
      colors: { top: 0x1a1c2c, cap: 0x1a1c2c, accent: 0xb08bff, bottom: 0x0e1018, shoes: 0xb08bff },
    },
  ],
  sol: [
    DEFAULT,
    {
      id: 'ember', name: '엠버', price: 3000,
      colors: { top: 0x2a1008, cap: 0x2a1008, accent: 0xff9f43, hair: 0xffd23f },
    },
    {
      id: 'frostfire', name: '프로스트파이어', price: 5000,
      colors: { top: 0x0f4a6a, cap: 0x0f4a6a, accent: 0x8ff0ff, hair: 0x8ff0ff, shoes: 0xffffff },
    },
  ],
  rina: [
    DEFAULT,
    {
      id: 'platinum', name: '플래티넘', price: 3400,
      colors: { top: 0xdfe6ee, cap: 0xdfe6ee, accent: 0x9aa4b8, bottom: 0x6e7686 },
    },
    {
      id: 'jackpot', name: '잭팟', price: 5600,
      colors: { top: 0x1d6b3a, cap: 0x1d6b3a, accent: 0xffd23f, hair: 0xffd23f, shoes: 0xffd23f },
    },
  ],
  byte: [
    DEFAULT,
    {
      id: 'redshift', name: '레드시프트', price: 3800,
      colors: { top: 0x3a0e14, cap: 0x3a0e14, accent: 0xff3b57, hair: 0xff3b57, shoes: 0xff3b57 },
    },
    {
      id: 'goldpatch', name: '골드패치', price: 6000,
      colors: { top: 0x1a1408, cap: 0x1a1408, accent: 0xffd23f, hair: 0xffd23f, shoes: 0xffd23f },
    },
  ],
  hiro: [
    DEFAULT,
    { id: 'dusk', name: '더스크', price: 4200,
      colors: { top: 0x2a1a4a, cap: 0x2a1a4a, accent: 0xff9f43, hair: 0xff9f43 } },
    { id: 'jade', name: '제이드', price: 6800,
      colors: { top: 0x0f4a3a, cap: 0x0f4a3a, accent: 0xcaff3a, shoes: 0xcaff3a } },
  ],
  luna: [
    DEFAULT,
    { id: 'ember', name: '엠버', price: 4600,
      colors: { top: 0x3a1208, cap: 0x3a1208, accent: 0xff8a1f, hair: 0xff8a1f } },
    { id: 'frost', name: '프로스트', price: 7200,
      colors: { top: 0x12384a, cap: 0x12384a, accent: 0x8ff0ff, hair: 0x8ff0ff } },
  ],
  dos: [
    DEFAULT,
    { id: 'oil', name: '오일', price: 5000,
      colors: { top: 0x1c1c22, cap: 0x1c1c22, accent: 0xf6c944, bottom: 0x14141a } },
    { id: 'signal', name: '시그널', price: 7600,
      colors: { top: 0x1d6b3a, cap: 0x1d6b3a, accent: 0xff3b30, shoes: 0xff3b30 } },
  ],
  sage: [
    DEFAULT,
    { id: 'lastrun', name: '라스트 런', price: 5, key: true,
      colors: { top: 0x3a2a12, cap: 0x3a2a12, accent: 0xffd23f, hair: 0xffe9a8 } },
    { id: 'nightline', name: '나이트라인', price: 9, key: true,
      colors: { top: 0x101828, cap: 0x101828, accent: 0x3fa9f5, hair: 0x8fd4ff } },
  ],
  noir: [
    DEFAULT,
    {
      id: 'whiteout', name: '화이트아웃', price: 6, key: true,
      colors: { top: 0xe8ecf2, cap: 0xe8ecf2, accent: 0x2a1a4a, bottom: 0xb9c3d6, hair: 0xe8ecf2 },
    },
    {
      id: 'bloodmoon', name: '블러드문', price: 10, key: true,
      colors: { top: 0x2a0a12, cap: 0x2a0a12, accent: 0xff2a4a, hair: 0xff2a4a, shoes: 0xff2a4a },
    },
  ],
  aurora: [
    DEFAULT,
    {
      id: 'solarflare', name: '솔라플레어', price: 8, key: true,
      colors: { top: 0x7a3a0f, cap: 0x7a3a0f, accent: 0xffd23f, hair: 0xff9f43, shoes: 0xffd23f },
    },
    {
      id: 'nebula', name: '네뷸라', price: 14, key: true,
      colors: { top: 0x2a1050, cap: 0x2a1050, accent: 0xff4fd8, hair: 0xb08bff, shoes: 0xff4fd8 },
    },
  ],
};

/** Every outfit available for a character (always at least the default fit). */
export function outfitsFor(charId: string): OutfitDef[] {
  return OUTFITS[charId] ?? [DEFAULT];
}

export function getOutfit(charId: string, outfitId: string): OutfitDef {
  const list = outfitsFor(charId);
  return list.find((o) => o.id === outfitId) ?? list[0];
}

/** The character's palette with the chosen outfit's overrides applied. */
export function resolveColors(charId: string, outfitId: string): CharColors {
  return { ...getCharacter(charId).colors, ...getOutfit(charId, outfitId).colors };
}

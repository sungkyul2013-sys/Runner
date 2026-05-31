export type CosmeticSlot = 'hair' | 'outfit';

export interface CosmeticDef {
  id: string;
  slot: CosmeticSlot;
  name: string;
  price: number;
  /** Build hint consumed by the Character rig / Wardrobe. */
  style: string;
  /** Optional tint applied by the rig (outfit recolour). */
  color?: number;
}

/**
 * Cosmetic catalogue (hair styles + outfits). Each is assembled from primitives
 * by the rig. `style` selects the build; `color` optionally recolours the body.
 * The `*-none`/`*-classic` defaults are free and owned from the start.
 */
export const COSMETICS: CosmeticDef[] = [
  // Hair / headgear
  { id: 'hair-none', slot: 'hair', name: 'Bare', price: 0, style: 'none' },
  { id: 'hair-spike', slot: 'hair', name: 'Spikes', price: 300, style: 'spike' },
  { id: 'hair-pony', slot: 'hair', name: 'Ponytail', price: 400, style: 'pony' },
  { id: 'hair-visor', slot: 'hair', name: 'Visor', price: 600, style: 'visor' },
  // Outfits (recolour + accent)
  { id: 'outfit-classic', slot: 'outfit', name: 'Classic', price: 0, style: 'classic' },
  { id: 'outfit-jacket', slot: 'outfit', name: 'Neon Jacket', price: 500, style: 'jacket', color: 0x12203a },
  { id: 'outfit-hoodie', slot: 'outfit', name: 'Hoodie', price: 700, style: 'hoodie', color: 0x2a1240 },
];

export const DEFAULT_COSMETICS = ['hair-none', 'outfit-classic'];

export function getCosmetic(id: string): CosmeticDef | undefined {
  return COSMETICS.find((c) => c.id === id);
}

export interface EquippedCosmetics {
  hair: string;
  outfit: string;
}

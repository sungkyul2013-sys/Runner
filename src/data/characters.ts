/** Passive ability identifiers a character can carry. */
export type AbilityId = 'magnet' | 'headstart' | 'coinBonus';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  /** Description with `{v}` substituted for the current magnitude. */
  desc: string;
  base: number;
  perLevel: number;
  maxLevel: number;
}

export type Archetype = 'runner' | 'mech' | 'sprite';

export interface CharacterDef {
  id: string;
  name: string;
  /** Coin price (0 = owned by default). */
  price: number;
  archetype: Archetype;
  palette: { primary: number; secondary: number; accent: number; glow: number };
  ability: AbilityDef;
}

/**
 * The three original playable characters. Each is assembled from primitives by
 * the {@link Character} rig (no external art) and carries one upgradeable
 * passive ability. Prices/abilities are balancing knobs.
 */
export const CHARACTERS: CharacterDef[] = [
  {
    id: 'nova',
    name: 'Nova',
    price: 0,
    archetype: 'runner',
    palette: { primary: 0xff3cac, secondary: 0x2de2e6, accent: 0xffffff, glow: 0xffa6e0 },
    ability: {
      id: 'magnet',
      name: 'Coin Affinity',
      desc: 'Passively pulls coins within {v} units.',
      base: 2.5,
      perLevel: 1.5,
      maxLevel: 5,
    },
  },
  {
    id: 'bolt',
    name: 'Bolt',
    price: 1500,
    archetype: 'mech',
    palette: { primary: 0x7a5cff, secondary: 0x4be0a0, accent: 0xc9d4ff, glow: 0xb15cff },
    ability: {
      id: 'headstart',
      name: 'Turbo Start',
      desc: 'Begins each run with a {v}s speed burst.',
      base: 2.0,
      perLevel: 0.6,
      maxLevel: 5,
    },
  },
  {
    id: 'pixel',
    name: 'Pixel',
    price: 2500,
    archetype: 'sprite',
    palette: { primary: 0xffd23f, secondary: 0x4dd2ff, accent: 0xffffff, glow: 0xfff3b0 },
    ability: {
      id: 'coinBonus',
      name: 'Midas Touch',
      desc: 'Coins are worth +{v}% more.',
      base: 0.15,
      perLevel: 0.1,
      maxLevel: 5,
    },
  },
];

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

/** Magnitude of an ability at a given upgrade level. */
export function abilityMagnitude(a: AbilityDef, level: number): number {
  return a.base + a.perLevel * Math.min(level, a.maxLevel);
}

/** Human-readable ability description at a level (for the UI). */
export function abilityText(a: AbilityDef, level: number): string {
  const v = abilityMagnitude(a, level);
  const shown = a.id === 'coinBonus' ? Math.round(v * 100).toString() : v.toFixed(1);
  return a.desc.replace('{v}', shown);
}

import { PowerupType } from '../config/powerups';
import { DEFAULT_COSMETICS, type CosmeticSlot, type EquippedCosmetics } from './cosmetics';
import { makeMission, MISSION_KINDS, type Mission, type MissionKind } from './missions';

const KEY = 'neondash.save';
const VERSION = 1;

export interface Settings {
  muted: boolean;
  quality: 'high' | 'low';
}

export interface SaveData {
  version: number;
  totalCoins: number;
  bestScore: number;
  ownedCharacters: string[];
  selectedCharacter: string;
  ownedCosmetics: string[];
  equipped: EquippedCosmetics;
  abilityLevels: Record<string, number>;
  powerupLevels: Partial<Record<PowerupType, number>>;
  xp: number;
  missions: Mission[];
  missionTiers: Record<MissionKind, number>;
  settings: Settings;
}

function defaults(): SaveData {
  return {
    version: VERSION,
    totalCoins: 0,
    bestScore: 0,
    ownedCharacters: ['nova'],
    selectedCharacter: 'nova',
    ownedCosmetics: [...DEFAULT_COSMETICS],
    equipped: { hair: 'hair-none', outfit: 'outfit-classic' },
    abilityLevels: {},
    powerupLevels: {},
    xp: 0,
    missions: MISSION_KINDS.map((k) => makeMission(k, 0)),
    missionTiers: { coins: 0, distance: 0, jetpack: 0 },
    settings: { muted: false, quality: 'high' },
  };
}

/** XP needed is flat-per-level; level is 1-based. */
export function levelForXp(xp: number): number {
  return 1 + Math.floor(xp / 1000);
}
export function xpIntoLevel(xp: number): { into: number; need: number } {
  return { into: xp % 1000, need: 1000 };
}

/**
 * Persistent player profile backed by localStorage. All meta state lives here;
 * systems read/write through it and call {@link save}. Access is guarded so the
 * module is safe to import where localStorage is unavailable.
 */
export class SaveManager {
  private d: SaveData;

  constructor() {
    this.d = this.load();
  }

  private load(): SaveData {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<SaveData>;
        if (p && p.version === VERSION) {
          const base = defaults();
          return {
            ...base,
            ...p,
            equipped: { ...base.equipped, ...p.equipped },
            settings: { ...base.settings, ...p.settings },
            abilityLevels: { ...p.abilityLevels },
            powerupLevels: { ...p.powerupLevels },
            missionTiers: { ...base.missionTiers, ...p.missionTiers },
            missions: p.missions && p.missions.length === 3 ? p.missions : base.missions,
          };
        }
      }
    } catch {
      /* corrupt or unavailable — fall through to defaults */
    }
    return defaults();
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.d));
    } catch {
      /* storage unavailable — run is still playable, just not persisted */
    }
  }

  get data(): SaveData {
    return this.d;
  }

  // ── Coins / economy ───────────────────────────────────────────────────────
  addCoins(n: number): void {
    this.d.totalCoins += n;
    this.save();
  }
  spend(n: number): boolean {
    if (this.d.totalCoins < n) return false;
    this.d.totalCoins -= n;
    this.save();
    return true;
  }

  // ── Best score / XP ───────────────────────────────────────────────────────
  recordRun(score: number): boolean {
    const isBest = score > this.d.bestScore;
    if (isBest) this.d.bestScore = score;
    this.save();
    return isBest;
  }
  addXp(n: number): void {
    this.d.xp += n;
    this.save();
  }

  // ── Characters ────────────────────────────────────────────────────────────
  ownsCharacter(id: string): boolean {
    return this.d.ownedCharacters.includes(id);
  }
  buyCharacter(id: string): void {
    if (!this.ownsCharacter(id)) this.d.ownedCharacters.push(id);
    this.save();
  }
  selectCharacter(id: string): void {
    this.d.selectedCharacter = id;
    this.save();
  }
  abilityLevel(charId: string): number {
    return this.d.abilityLevels[charId] ?? 0;
  }
  raiseAbility(charId: string): void {
    this.d.abilityLevels[charId] = this.abilityLevel(charId) + 1;
    this.save();
  }

  // ── Cosmetics ─────────────────────────────────────────────────────────────
  ownsCosmetic(id: string): boolean {
    return this.d.ownedCosmetics.includes(id);
  }
  buyCosmetic(id: string): void {
    if (!this.ownsCosmetic(id)) this.d.ownedCosmetics.push(id);
    this.save();
  }
  equip(slot: CosmeticSlot, id: string): void {
    this.d.equipped[slot] = id;
    this.save();
  }

  // ── Power-up upgrades ─────────────────────────────────────────────────────
  powerupLevel(type: PowerupType): number {
    return this.d.powerupLevels[type] ?? 0;
  }
  raisePowerup(type: PowerupType): void {
    this.d.powerupLevels[type] = this.powerupLevel(type) + 1;
    this.save();
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  setMuted(m: boolean): void {
    this.d.settings.muted = m;
    this.save();
  }
  setQuality(q: 'high' | 'low'): void {
    this.d.settings.quality = q;
    this.save();
  }
}

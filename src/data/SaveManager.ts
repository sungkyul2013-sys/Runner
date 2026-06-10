const KEY = 'sunsetrunner.save';
const VERSION = 2;

export type GameMode = 'endless' | 'challenge';

export interface Settings {
  muted: boolean;
  quality: 'high' | 'low';
}

/** Day-key for the daily reward (YYYY-MM-DD in local time). */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export interface SaveData {
  version: number;
  coins: number;
  /** Premium currency (gems / mileage). */
  mileage: number;
  best: number; // endless best
  bestChallenge: number;
  owned: string[]; // owned character ids
  selected: string;
  upgrades: Record<string, number>;
  inventory: { bomb: number; rocket: number };
  claimedAchievements: string[];
  dailyStreak: number; // index 0..6 next to claim
  lastDaily: string; // day-key of last claim
  runs: number;
  totalCoins: number;
  totalDistance: number;
  totalTime: number; // cumulative seconds played (drives play-time mileage)
  settings: Settings;
}

function defaults(): SaveData {
  return {
    version: VERSION,
    coins: 0,
    mileage: 0,
    best: 0,
    bestChallenge: 0,
    owned: ['runner'],
    selected: 'runner',
    upgrades: {},
    inventory: { bomb: 0, rocket: 0 },
    claimedAchievements: [],
    dailyStreak: 0,
    lastDaily: '',
    runs: 0,
    totalCoins: 0,
    totalDistance: 0,
    totalTime: 0,
    settings: { muted: false, quality: 'high' },
  };
}

/**
 * Persistent Sunset Runner profile (localStorage). Holds the wallet (coins +
 * gems/mileage), best scores per mode, owned/selected character, permanent
 * upgrades, consumable inventory, achievement claims, the daily-reward streak,
 * lifetime stats and settings. All access is guarded so the module is safe
 * where localStorage is unavailable (e.g. Node verification scripts).
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
            owned: p.owned && p.owned.length ? p.owned : base.owned,
            upgrades: { ...p.upgrades },
            inventory: { ...base.inventory, ...p.inventory },
            claimedAchievements: [...(p.claimedAchievements ?? [])],
            settings: { ...base.settings, ...p.settings },
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
      /* storage unavailable — run still playable, just not persisted */
    }
  }

  get data(): SaveData {
    return this.d;
  }

  // ── Wallet ────────────────────────────────────────────────────────────────
  addCoins(n: number): void {
    this.d.coins += n;
    this.save();
  }
  spend(n: number): boolean {
    if (this.d.coins < n) return false;
    this.d.coins -= n;
    this.save();
    return true;
  }
  addMileage(n: number): void {
    this.d.mileage += n;
    this.save();
  }
  spendMileage(n: number): boolean {
    if (this.d.mileage < n) return false;
    this.d.mileage -= n;
    this.save();
    return true;
  }

  // ── Run results ─────────────────────────────────────────────────────────────
  /**
   * Apply a finished run. Mileage (💎) is awarded generously: a base from this
   * run's distance + coins, a **distance milestone** bonus when you beat your
   * best, a **bonus** carried in (treasure chests), plus a **play-time** trickle
   * that rewards how long you've played overall. Returns the total mileage +
   * whether a record was set.
   */
  recordRun(
    mode: GameMode,
    score: number,
    coins: number,
    distance: number,
    bonusMileage = 0,
    runSeconds = 0,
  ): { mileage: number; isBest: boolean } {
    this.d.runs++;
    this.d.coins += coins;
    this.d.totalCoins += coins;
    this.d.totalDistance += distance;
    this.d.totalTime += runSeconds;

    // Base mileage — distance + coins (more generous than before).
    let mileage = Math.floor(distance / 60) + Math.floor(coins / 6) + bonusMileage;

    let isBest = false;
    if (mode === 'endless' && score > this.d.best) {
      // Distance milestone: a chunky reward for a new best (further = more).
      mileage += 10 + Math.floor(distance / 200);
      this.d.best = score;
      isBest = true;
    } else if (mode === 'challenge' && score > this.d.bestChallenge) {
      mileage += 10 + Math.floor(score / 200);
      this.d.bestChallenge = score;
      isBest = true;
    }

    // Play-time reward: +1💎 per full 2 minutes of cumulative play crossed.
    const before = Math.floor((this.d.totalTime - runSeconds) / 120);
    const after = Math.floor(this.d.totalTime / 120);
    mileage += Math.max(0, after - before) * 3;

    this.d.mileage += mileage;
    this.save();
    return { mileage, isBest };
  }

  // ── Characters ────────────────────────────────────────────────────────────
  owns(id: string): boolean {
    return this.d.owned.includes(id);
  }
  buy(id: string): void {
    if (!this.owns(id)) this.d.owned.push(id);
    this.save();
  }
  select(id: string): void {
    this.d.selected = id;
    this.save();
  }

  // ── Upgrades ────────────────────────────────────────────────────────────────
  upgradeLevel(id: string): number {
    return this.d.upgrades[id] ?? 0;
  }
  raiseUpgrade(id: string): void {
    this.d.upgrades[id] = this.upgradeLevel(id) + 1;
    this.save();
  }

  // ── Consumables ─────────────────────────────────────────────────────────────
  addItem(id: 'bomb' | 'rocket', n = 1): void {
    this.d.inventory[id] += n;
    this.save();
  }
  useItem(id: 'bomb' | 'rocket'): boolean {
    if (this.d.inventory[id] <= 0) return false;
    this.d.inventory[id]--;
    this.save();
    return true;
  }

  // ── Achievements ────────────────────────────────────────────────────────────
  claimAchievement(id: string, reward: number): void {
    if (this.d.claimedAchievements.includes(id)) return;
    this.d.claimedAchievements.push(id);
    this.d.coins += reward;
    this.save();
  }

  // ── Daily ─────────────────────────────────────────────────────────────────
  canClaimDaily(): boolean {
    return this.d.lastDaily !== todayKey();
  }
  /** Claim today's reward, advancing the 7-day streak. Returns the day index. */
  claimDaily(coins: number, mileage: number): number {
    const idx = this.d.dailyStreak % 7;
    this.d.coins += coins;
    this.d.mileage += mileage;
    this.d.lastDaily = todayKey();
    this.d.dailyStreak = (this.d.dailyStreak + 1) % 7;
    this.save();
    return idx;
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

import { HUNT_WORD } from '../config/powerups';
import { getMission, MISSIONS, rollMissions, setReward, type MissionMetric } from './missions';

const KEY = 'metrosurf.save';
const VERSION = 3;

/** All playable game modes. */
export type GameMode = 'endless' | 'timeattack' | 'coinrush' | 'express' | 'hardcore';

export interface Settings {
  muted: boolean;
  quality: 'high' | 'low';
  /** Haptic feedback on crashes (mobile). */
  vibrate: boolean;
  /** Camera shake intensity. */
  shake: 'off' | 'low' | 'high';
  /** Show the coin-combo meter during runs. */
  showCombo: boolean;
  /** Show the FPS counter. */
  showFps: boolean;
  /** Draw on-screen swipe hints for the first few runs. */
  showHints: boolean;
  /** Left-handed layout puts the item buttons on the right. */
  leftHanded: boolean;
}

export interface MissionSlot {
  id: string;
  goal: number;
  progress: number;
}

export interface TopRun {
  score: number;
  distance: number;
  coins: number;
  mode: GameMode;
  /** Local day-key of the run. */
  day: string;
  character: string;
}

export interface Inventory {
  /** Skip the first stretch of the yard at speed. */
  headstart: number;
  /** Double score for the whole run. */
  booster: number;
  /** Opens for a random reward at the results screen. */
  mystery: number;
  /** Spare hoverboards carried into the run. */
  board: number;
}

/** Day-key for daily rewards (YYYY-M-D in local time). */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export interface SaveData {
  version: number;
  coins: number;
  /** Premium currency — buys headline characters, boards and revives. */
  keys: number;
  best: number;
  bests: Partial<Record<GameMode, number>>;
  topRuns: TopRun[];

  ownedChars: string[];
  selectedChar: string;
  ownedBoards: string[];
  selectedBoard: string;

  upgrades: Record<string, number>;
  inventory: Inventory;

  missions: MissionSlot[];
  missionSet: number;
  /** Extra score multiplier earned by clearing mission sets. */
  multiplierBonus: number;

  /** Letters of {@link HUNT_WORD} collected so far this cycle. */
  huntLetters: string[];
  huntCompleted: number;

  dailyStreak: number;
  lastDaily: string;

  runs: number;
  totalCoins: number;
  totalDistance: number;
  totalTime: number;
  totalScore: number;
  /** Lifetime counters keyed by mission metric. */
  stats: Partial<Record<MissionMetric, number>>;

  claimedAchievements: string[];
  /** Indices of claimed world-tour milestones. */
  claimedMilestones: number[];
  settings: Settings;
}

function defaults(): SaveData {
  return {
    version: VERSION,
    coins: 0,
    keys: 0,
    best: 0,
    bests: {},
    topRuns: [],
    ownedChars: ['jino'],
    selectedChar: 'jino',
    ownedBoards: ['standard'],
    selectedBoard: 'standard',
    upgrades: {},
    inventory: { headstart: 0, booster: 0, mystery: 0, board: 0 },
    missions: rollMissions(1),
    missionSet: 1,
    multiplierBonus: 0,
    huntLetters: [],
    huntCompleted: 0,
    dailyStreak: 0,
    lastDaily: '',
    runs: 0,
    totalCoins: 0,
    totalDistance: 0,
    totalTime: 0,
    totalScore: 0,
    stats: {},
    claimedAchievements: [],
    claimedMilestones: [],
    settings: {
      muted: false, quality: 'high', vibrate: true, shake: 'high',
      showCombo: true, showFps: false, showHints: true, leftHanded: false,
    },
  };
}

/**
 * The persistent METRO SURF profile (localStorage). Holds the wallet (coins +
 * keys), per-mode bests and the top-run board, the owned/equipped character and
 * hoverboard, permanent power-up upgrades, the consumable inventory, the live
 * mission set and the multiplier bonus it feeds, the word-hunt letters, the
 * daily streak, lifetime stats and settings.
 *
 * Every access is guarded so the module is safe where localStorage is missing
 * (the Node verification scripts run against it directly).
 */
export class SaveManager {
  private d: SaveData;
  private dirty = false;

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
            ownedChars: p.ownedChars?.length ? p.ownedChars : base.ownedChars,
            ownedBoards: p.ownedBoards?.length ? p.ownedBoards : base.ownedBoards,
            upgrades: { ...p.upgrades },
            inventory: { ...base.inventory, ...p.inventory },
            missions: p.missions?.length === 3 ? p.missions : base.missions,
            bests: { ...p.bests },
            topRuns: [...(p.topRuns ?? [])],
            huntLetters: [...(p.huntLetters ?? [])],
            stats: { ...p.stats },
            claimedAchievements: [...(p.claimedAchievements ?? [])],
            claimedMilestones: [...(p.claimedMilestones ?? [])],
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
    this.dirty = false;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.d));
    } catch {
      /* storage unavailable — the run stays playable, just not persisted */
    }
  }

  /** Mark dirty without touching storage (called from hot paths). */
  private touch(): void {
    this.dirty = true;
  }

  /** Flush a pending write (called at safe points such as run end). */
  flush(): void {
    if (this.dirty) this.save();
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
  addKeys(n: number): void {
    this.d.keys += n;
    this.save();
  }
  spendKeys(n: number): boolean {
    if (this.d.keys < n) return false;
    this.d.keys -= n;
    this.save();
    return true;
  }

  // ── Characters & boards ───────────────────────────────────────────────────
  ownsChar(id: string): boolean {
    return this.d.ownedChars.includes(id);
  }
  buyChar(id: string): void {
    if (!this.ownsChar(id)) this.d.ownedChars.push(id);
    this.save();
  }
  selectChar(id: string): void {
    this.d.selectedChar = id;
    this.save();
  }
  ownsBoard(id: string): boolean {
    return this.d.ownedBoards.includes(id);
  }
  buyBoard(id: string): void {
    if (!this.ownsBoard(id)) this.d.ownedBoards.push(id);
    this.save();
  }
  selectBoard(id: string): void {
    this.d.selectedBoard = id;
    this.save();
  }

  // ── Upgrades ──────────────────────────────────────────────────────────────
  upgradeLevel(id: string): number {
    return this.d.upgrades[id] ?? 0;
  }
  raiseUpgrade(id: string): void {
    this.d.upgrades[id] = this.upgradeLevel(id) + 1;
    this.save();
  }

  // ── Consumables ───────────────────────────────────────────────────────────
  addItem(id: keyof Inventory, n = 1): void {
    this.d.inventory[id] += n;
    this.save();
  }
  useItem(id: keyof Inventory): boolean {
    if (this.d.inventory[id] <= 0) return false;
    this.d.inventory[id]--;
    this.save();
    return true;
  }

  // ── Missions ──────────────────────────────────────────────────────────────
  /** Add to every *cumulative* mission tracking `metric`. Returns completions. */
  bumpMission(metric: MissionMetric, delta: number): string[] {
    if (delta <= 0) return [];
    const done: string[] = [];
    for (const slot of this.d.missions) {
      const def = getMission(slot.id);
      if (def.perRun || def.metric !== metric) continue;
      if (slot.progress >= slot.goal) continue;
      slot.progress = Math.min(slot.goal, slot.progress + delta);
      if (slot.progress >= slot.goal) done.push(slot.id);
    }
    if (done.length) this.save();
    else this.touch();
    return done;
  }

  /** Raise every *per-run* mission tracking `metric` to `value`. */
  setRunMission(metric: MissionMetric, value: number): string[] {
    const done: string[] = [];
    for (const slot of this.d.missions) {
      const def = getMission(slot.id);
      if (!def.perRun || def.metric !== metric) continue;
      if (slot.progress >= slot.goal) continue;
      if (value > slot.progress) slot.progress = Math.min(slot.goal, value);
      if (slot.progress >= slot.goal) done.push(slot.id);
    }
    if (done.length) this.save();
    else this.touch();
    return done;
  }

  /** Clear per-run mission progress that was not completed (new run starts). */
  resetRunMissions(): void {
    for (const slot of this.d.missions) {
      const def = getMission(slot.id);
      if (def.perRun && slot.progress < slot.goal) slot.progress = 0;
    }
    this.touch();
  }

  get missionsComplete(): boolean {
    return this.d.missions.every((m) => m.progress >= m.goal);
  }

  /**
   * If all three missions are done, bank the set reward, bump the permanent
   * multiplier and roll a fresh set. Returns the reward, or null.
   */
  completeMissionSet(): { coins: number; set: number; multiplier: number } | null {
    if (!this.missionsComplete) return null;
    const set = this.d.missionSet;
    const coins = setReward(set);
    this.d.coins += coins;
    this.d.multiplierBonus += 1;
    this.d.missionSet = set + 1;
    this.d.missions = rollMissions(this.d.missionSet, this.d.missions.map((m) => m.id));
    this.save();
    return { coins, set, multiplier: this.d.multiplierBonus };
  }

  /** Swap one mission for a fresh one (costs keys in the UI). */
  rerollMission(index: number): void {
    const avoid = this.d.missions.map((m) => m.id);
    const pool = MISSIONS.filter((m) => !avoid.includes(m.id));
    const pick = pool.length ? pool[(Math.random() * pool.length) | 0] : MISSIONS[0];
    this.d.missions[index] = rollMissions(this.d.missionSet, avoid.filter((id) => id !== pick.id))[0];
    this.save();
  }

  // ── Word hunt ─────────────────────────────────────────────────────────────
  /** The next letter the player still needs, or null when the word is done. */
  nextHuntLetter(): string | null {
    for (const ch of HUNT_WORD) if (!this.d.huntLetters.includes(ch)) return ch;
    return null;
  }
  /** Collect a letter. Returns true when that completes the word. */
  collectLetter(ch: string): boolean {
    if (this.d.huntLetters.includes(ch)) return false;
    this.d.huntLetters.push(ch);
    const complete = this.d.huntLetters.length >= HUNT_WORD.length;
    if (complete) {
      this.d.huntCompleted++;
      this.d.huntLetters = [];
      this.d.keys += 1;
      this.d.coins += 500;
    }
    this.save();
    return complete;
  }

  // ── Run results ───────────────────────────────────────────────────────────
  bestFor(mode: GameMode): number {
    const b = this.d.bests[mode] ?? 0;
    return mode === 'endless' ? Math.max(b, this.d.best) : b;
  }

  /** Record a finished run: wallet, bests, top-run board and lifetime stats. */
  recordRun(
    mode: GameMode,
    score: number,
    coins: number,
    distance: number,
    runSeconds: number,
    character: string,
  ): { isBest: boolean; rank: number } {
    this.d.runs++;
    this.d.coins += coins;
    this.d.totalCoins += coins;
    this.d.totalDistance += distance;
    this.d.totalTime += runSeconds;
    this.d.totalScore += score;
    this.d.stats.runs = (this.d.stats.runs ?? 0) + 1;

    let isBest = false;
    if (score > this.bestFor(mode)) {
      this.d.bests[mode] = score;
      if (mode === 'endless') this.d.best = score;
      isBest = true;
    }

    const entry: TopRun = {
      score, distance: Math.floor(distance), coins, mode, day: todayKey(), character,
    };
    this.d.topRuns.push(entry);
    this.d.topRuns.sort((a, b) => b.score - a.score);
    this.d.topRuns = this.d.topRuns.slice(0, 8);
    const rank = this.d.topRuns.indexOf(entry);

    this.save();
    return { isBest, rank: rank < 0 ? -1 : rank };
  }

  /** Lifetime counter used by achievements and the stats panel. */
  addStat(metric: MissionMetric, n: number): void {
    if (n <= 0) return;
    this.d.stats[metric] = (this.d.stats[metric] ?? 0) + n;
    this.touch();
  }
  stat(metric: MissionMetric): number {
    return this.d.stats[metric] ?? 0;
  }

  // ── World tour ────────────────────────────────────────────────────────────
  /** Lifetime distance drives the world-tour reward track. */
  get journeyProgress(): number {
    return Math.floor(this.d.totalDistance);
  }
  milestoneClaimed(index: number): boolean {
    return this.d.claimedMilestones.includes(index);
  }
  claimMilestone(index: number, coins: number, keys: number, boards: number): boolean {
    if (this.milestoneClaimed(index)) return false;
    this.d.claimedMilestones.push(index);
    this.d.coins += coins;
    this.d.keys += keys;
    this.d.inventory.board += boards;
    this.save();
    return true;
  }

  // ── Achievements ──────────────────────────────────────────────────────────
  claimAchievement(id: string, coins: number, keys = 0): void {
    if (this.d.claimedAchievements.includes(id)) return;
    this.d.claimedAchievements.push(id);
    this.d.coins += coins;
    this.d.keys += keys;
    this.save();
  }

  // ── Daily ─────────────────────────────────────────────────────────────────
  canClaimDaily(): boolean {
    return this.d.lastDaily !== todayKey();
  }
  claimDaily(coins: number, keys: number): number {
    const idx = this.d.dailyStreak % 7;
    this.d.coins += coins;
    this.d.keys += keys;
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
  patchSettings(p: Partial<Settings>): void {
    Object.assign(this.d.settings, p);
    this.save();
  }

  /** Wipe the whole profile (settings menu "reset data"). */
  wipe(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* unavailable */
    }
    this.d = defaults();
  }
}

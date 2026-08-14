/**
 * Profile store — a tiny observable object persisted to localStorage.
 *
 * Everything the learner does funnels through `record*` helpers so that XP,
 * streaks, per-topic tallies and badge unlocks stay in one place instead of
 * being recomputed by each view.
 */

import {
  DOMAINS,
  SKILLS,
  type DailyQuests,
  type Quest,
  type QuestKind,
  type AttemptLog,
  type Domain,
  type Profile,
  type Settings,
  type Skill,
  type Tally,
} from './types';
import { BADGES } from '../data/badges';

const KEY = 'soo-korean:profile:v1';
const PROFILE_VERSION = 1;

/** Attempts are the only unbounded list; keep the most recent slice. */
const MAX_ATTEMPTS = 600;

const emptyTally = (): Tally => ({ seen: 0, correct: 0 });

function blankRecord<K extends string>(keys: readonly K[]): Record<K, Tally> {
  const out = {} as Record<K, Tally>;
  for (const k of keys) out[k] = emptyTally();
  return out;
}

export function todayISO(d = new Date()): string {
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`);
  return Math.round(ms / 86400000);
}

function defaultProfile(): Profile {
  return {
    version: PROFILE_VERSION,
    name: '',
    grade: '',
    goal: '',
    createdAt: Date.now(),
    xp: 0,
    coins: 0,
    streak: 0,
    bestStreak: 0,
    lastStudyDate: '',
    studyDates: [],
    minutes: 0,
    byDomain: blankRecord(DOMAINS),
    bySkill: blankRecord(SKILLS),
    byTopic: {},
    attempts: [],
    wrong: [],
    bookmarks: [],
    srs: [],
    diagnostics: [],
    mocks: [],
    routine: null,
    essays: [],
    badges: [],
    stages: {},
    daily: null,
    onboarded: false,
    settings: {
      theme: 'system',
      motion: 'full',
      sound: true,
      fontScale: 1,
      quality: 'high',
    },
  };
}

/**
 * Merge a persisted blob over a fresh profile so that fields added in later
 * versions of the app simply appear with their defaults.
 */
function hydrate(raw: unknown): Profile {
  const base = defaultProfile();
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Partial<Profile>;
  const merged: Profile = {
    ...base,
    ...src,
    byDomain: { ...base.byDomain, ...(src.byDomain ?? {}) },
    bySkill: { ...base.bySkill, ...(src.bySkill ?? {}) },
    byTopic: { ...base.byTopic, ...(src.byTopic ?? {}) },
    settings: { ...base.settings, ...(src.settings ?? {}) },
    attempts: Array.isArray(src.attempts) ? src.attempts : [],
    wrong: Array.isArray(src.wrong) ? src.wrong : [],
    bookmarks: Array.isArray(src.bookmarks) ? src.bookmarks : [],
    srs: Array.isArray(src.srs) ? src.srs : [],
    diagnostics: Array.isArray(src.diagnostics) ? src.diagnostics : [],
    mocks: Array.isArray(src.mocks) ? src.mocks : [],
    essays: Array.isArray(src.essays) ? src.essays : [],
    badges: Array.isArray(src.badges) ? src.badges : [],
    stages: { ...base.stages, ...(src.stages ?? {}) },
    daily: src.daily ?? null,
    onboarded: src.onboarded ?? false,
    studyDates: Array.isArray(src.studyDates) ? src.studyDates : [],
    version: PROFILE_VERSION,
  };
  return merged;
}

type Listener = (p: Profile) => void;

class Store {
  profile: Profile;
  private listeners = new Set<Listener>();
  private saveTimer: number | null = null;

  constructor() {
    this.profile = hydrate(this.read());
  }

  private read(): unknown {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Mutate the profile and notify listeners. Saves are debounced. */
  update(fn: (p: Profile) => void): void {
    const before = levelFromXp(this.profile.xp).level;
    fn(this.profile);
    const after = levelFromXp(this.profile.xp).level;
    if (after > before) pendingLevelUps.push(after);
    this.syncBadges();
    for (const l of this.listeners) l(this.profile);
    this.save();
  }

  save(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      try {
        localStorage.setItem(KEY, JSON.stringify(this.profile));
      } catch {
        /* Quota or private mode — the session still works in memory. */
      }
    }, 180);
  }

  reset(): void {
    this.profile = defaultProfile();
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    for (const l of this.listeners) l(this.profile);
  }

  import(raw: unknown): boolean {
    const next = hydrate(raw);
    if (!next) return false;
    this.profile = next;
    for (const l of this.listeners) l(this.profile);
    this.save();
    return true;
  }

  private syncBadges(): void {
    for (const b of BADGES) {
      if (!this.profile.badges.includes(b.id) && b.test(this.profile)) {
        this.profile.badges.push(b.id);
        newBadges.push(b.id);
      }
    }
  }
}

/** Badges unlocked since the last drain — the shell turns these into toasts. */
export const newBadges: string[] = [];

/** Levels reached since the last drain — the shell turns these into a celebration. */
export const pendingLevelUps: number[] = [];

/** Quests finished since the last drain — the shell turns these into toasts. */
export const finishedQuests: Quest[] = [];

export const store = new Store();

/* ------------------------------------------------------------------ */
/* Derived values                                                      */
/* ------------------------------------------------------------------ */

/** XP needed to reach level `n` (1-indexed). Gently super-linear. */
export function xpForLevel(n: number): number {
  return Math.round(60 * n ** 1.45);
}

export function levelFromXp(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let remaining = xp;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level += 1;
    if (level > 99) break;
  }
  return { level, into: remaining, need: xpForLevel(level) };
}

export const RANKS = [
  { at: 1, name: '입문 독자' },
  { at: 4, name: '성실한 독자' },
  { at: 8, name: '문장 탐구자' },
  { at: 13, name: '맥락 해석가' },
  { at: 19, name: '논리 설계자' },
  { at: 26, name: '비평의 시선' },
  { at: 34, name: '언어의 장인' },
  { at: 45, name: '국어의 감각' },
];

export function rankFor(level: number): string {
  let name = RANKS[0].name;
  for (const r of RANKS) if (level >= r.at) name = r.name;
  return name;
}

export function accuracy(t: Tally): number {
  return t.seen === 0 ? 0 : t.correct / t.seen;
}

/* ------------------------------------------------------------------ */
/* Recording helpers                                                   */
/* ------------------------------------------------------------------ */

function bump(t: Tally | undefined, correct: boolean): Tally {
  const next = t ?? emptyTally();
  next.seen += 1;
  if (correct) next.correct += 1;
  return next;
}

/** Mark today as studied and roll the streak forward. */
export function touchStreak(p: Profile): void {
  const today = todayISO();
  if (p.lastStudyDate === today) return;
  if (p.lastStudyDate && daysBetween(p.lastStudyDate, today) === 1) p.streak += 1;
  else p.streak = 1;
  p.lastStudyDate = today;
  p.bestStreak = Math.max(p.bestStreak, p.streak);
  if (!p.studyDates.includes(today)) p.studyDates.push(today);
  if (p.studyDates.length > 400) p.studyDates.splice(0, p.studyDates.length - 400);
}

export interface AttemptInput {
  qid: string;
  domain: Domain;
  skill: Skill;
  topic: string;
  correct: boolean;
  chosen: number;
  ms: number;
  /** Practice awards XP; review/diagnostic pass their own multiplier. */
  xpScale?: number;
  /** Current consecutive-correct run, used by the combo quest. */
  combo?: number;
}

export function recordAttempt(input: AttemptInput): number {
  const gained = Math.round((input.correct ? 12 : 4) * (input.xpScale ?? 1));
  store.update((p) => {
    const log: AttemptLog = {
      qid: input.qid,
      domain: input.domain,
      skill: input.skill,
      topic: input.topic,
      correct: input.correct,
      chosen: input.chosen,
      ms: input.ms,
      at: Date.now(),
    };
    p.attempts.push(log);
    if (p.attempts.length > MAX_ATTEMPTS) p.attempts.splice(0, p.attempts.length - MAX_ATTEMPTS);

    p.byDomain[input.domain] = bump(p.byDomain[input.domain], input.correct);
    p.bySkill[input.skill] = bump(p.bySkill[input.skill], input.correct);
    p.byTopic[input.topic] = bump(p.byTopic[input.topic], input.correct);

    p.xp += gained;
    p.coins += input.correct ? 3 : 1;
    touchStreak(p);

    const existing = p.wrong.find((w) => w.qid === input.qid);
    if (!input.correct) {
      if (existing) {
        existing.wrongCount += 1;
        existing.chosen = input.chosen;
        existing.clearedStreak = 0;
        existing.at = Date.now();
      } else {
        p.wrong.push({
          qid: input.qid,
          chosen: input.chosen,
          wrongCount: 1,
          clearedStreak: 0,
          at: Date.now(),
        });
      }
    } else if (existing) {
      existing.clearedStreak += 1;
      // Two clean repeats retire the note.
      if (existing.clearedStreak >= 2) {
        p.wrong = p.wrong.filter((w) => w.qid !== input.qid);
      }
    }
  });

  questProgress('answer', 1);
  if (input.correct) questProgress('correct', 1);
  if (input.combo) questProgress('combo', input.combo, 'max');

  return gained;
}

export function addMinutes(mins: number): void {
  store.update((p) => {
    p.minutes += mins;
    p.xp += Math.round(mins * 2);
    touchStreak(p);
  });
}

export function toggleBookmark(qid: string): boolean {
  let on = false;
  store.update((p) => {
    if (p.bookmarks.includes(qid)) p.bookmarks = p.bookmarks.filter((x) => x !== qid);
    else {
      p.bookmarks.push(qid);
      on = true;
    }
  });
  return on;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  store.update((p) => {
    p.settings[key] = value;
  });
  applySettings();
}

/** Push settings onto the document element. Called on boot and on change. */
export function applySettings(): void {
  const s = store.profile.settings;
  const root = document.documentElement;
  if (s.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', s.theme);
  root.setAttribute('data-motion', s.motion);
  root.style.setProperty('--font-scale', String(s.fontScale));
}

/** True when the learner asked for less motion, or the OS did. */
export function reducedMotion(): boolean {
  if (store.profile.settings.motion === 'reduced') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Resolved dark/light, accounting for the `system` setting. */
export function isDark(): boolean {
  const t = store.profile.settings.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/* ------------------------------------------------------------------ */
/* Journey map                                                         */
/* ------------------------------------------------------------------ */

/** Save a stage result, keeping the learner's best stars, accuracy and bonus. */
export function recordStage(
  stageId: string,
  acc: number,
  stars: number,
  bonus: boolean,
): { improved: boolean; bonusFirst: boolean } {
  let improved = false;
  let bonusFirst = false;
  store.update((p) => {
    const prev = p.stages[stageId];
    if (!prev) {
      p.stages[stageId] = { stars, best: acc, plays: 1, bonus };
      improved = stars > 0;
      bonusFirst = bonus;
    } else {
      improved = stars > prev.stars;
      bonusFirst = bonus && !prev.bonus;
      p.stages[stageId] = {
        stars: Math.max(prev.stars, stars),
        best: Math.max(prev.best, acc),
        plays: prev.plays + 1,
        bonus: prev.bonus || bonus,
      };
    }
    // Clearing a stage pays out in coins; repeats pay a token amount.
    p.coins += improved ? 15 + stars * 5 : 3;
    if (bonusFirst) p.coins += 25;
  });
  if (stars > 0) questProgress('stage', 1);
  return { improved, bonusFirst };
}

/* ------------------------------------------------------------------ */
/* Daily quests                                                        */
/* ------------------------------------------------------------------ */

interface QuestTemplate {
  kind: QuestKind;
  label: (n: number) => string;
  targets: number[];
  reward: number;
}

const QUEST_POOL: QuestTemplate[] = [
  { kind: 'answer', label: (n) => `문항 ${n}개 풀기`, targets: [10, 15, 20], reward: 20 },
  { kind: 'correct', label: (n) => `정답 ${n}개 맞히기`, targets: [8, 12, 16], reward: 25 },
  { kind: 'stage', label: (n) => `스테이지 ${n}개 클리어`, targets: [1, 2], reward: 30 },
  { kind: 'combo', label: (n) => `${n}연속 정답 만들기`, targets: [4, 5, 6], reward: 25 },
  { kind: 'vocab', label: (n) => `어휘 카드 ${n}장 학습`, targets: [10, 15, 20], reward: 20 },
];

/** All-three-done bonus. */
export const QUEST_SET_BONUS = 50;

/**
 * Deterministic per-day pick: the same day always yields the same three
 * quests, so reloading the page cannot reroll an inconvenient set.
 */
function rollQuests(dateISO: string): Quest[] {
  let seed = 0;
  for (let i = 0; i < dateISO.length; i += 1) seed = (seed * 31 + dateISO.charCodeAt(i)) | 0;
  const rnd = mulberry32(seed);
  const pool = [...QUEST_POOL];
  const out: Quest[] = [];
  for (let i = 0; i < 3 && pool.length; i += 1) {
    const idx = Math.floor(rnd() * pool.length);
    const t = pool.splice(idx, 1)[0];
    const target = t.targets[Math.floor(rnd() * t.targets.length)];
    out.push({
      id: `${dateISO}-${t.kind}`,
      kind: t.kind,
      label: t.label(target),
      target,
      progress: 0,
      reward: t.reward,
      done: false,
    });
  }
  return out;
}

/** Small local PRNG so the roll does not depend on `dom.ts`. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns today's quest set, generating a fresh one at each date change. */
export function ensureDaily(): DailyQuests {
  const today = todayISO();
  const cur = store.profile.daily;
  if (cur && cur.date === today) return cur;
  const next: DailyQuests = { date: today, quests: rollQuests(today), bonusClaimed: false };
  store.update((p) => {
    p.daily = next;
  });
  return next;
}

/**
 * Advance every quest of `kind`. `mode` decides how the amount is applied:
 * counters add up, bests take the maximum.
 */
export function questProgress(kind: QuestKind, amount: number, mode: 'add' | 'max' = 'add'): void {
  ensureDaily();
  store.update((p) => {
    const daily = p.daily;
    if (!daily) return;
    for (const q of daily.quests) {
      if (q.kind !== kind || q.done) continue;
      q.progress = mode === 'max' ? Math.max(q.progress, amount) : q.progress + amount;
      if (q.progress >= q.target) {
        q.progress = q.target;
        q.done = true;
        p.coins += q.reward;
        p.xp += 15;
        finishedQuests.push(q);
      }
    }
    if (!daily.bonusClaimed && daily.quests.length > 0 && daily.quests.every((q) => q.done)) {
      daily.bonusClaimed = true;
      p.coins += QUEST_SET_BONUS;
      p.xp += 40;
    }
  });
}

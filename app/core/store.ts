/**
 * Everything the app remembers between visits: theme, quiz history, the
 * markup the student produced in the lab, and their study plan.
 *
 * Persistence is best-effort — private-mode Safari throws on write, and a
 * study app should degrade to "works, forgets" rather than break.
 */

import { addDays, todayISO } from './dates';

export interface DomainScore {
  correct: number;
  total: number;
}

export interface QuizRun {
  at: number;
  score: number;
  total: number;
  /** seconds spent */
  seconds: number;
  byDomain: Record<string, DomainScore>;
}

export interface StudyPlan {
  grade: string;
  goal: string;
  perWeek: number;
  minutes: number;
  createdAt: number;
}

/** When the course starts and which weekdays it runs on. */
export interface Timetable {
  /** `YYYY-MM-DD`, local. */
  startISO: string;
  /** Weekday numbers, 0 = 일요일. */
  days: number[];
  createdAt: number;
}

export interface AppState {
  theme: 'system' | 'light' | 'dark';
  runs: QuizRun[];
  labBest: number;
  plan: StudyPlan | null;
  timetable: Timetable | null;
  /** lesson id → the date it was completed. */
  done: Record<string, string>;
  /** lesson id → what the student wrote for it. */
  drafts: Record<string, string>;
  seenIntro: boolean;
  streak: { days: number; last: string };
}

const KEY = 'su-nonsul.v1';

const EMPTY: AppState = {
  theme: 'system',
  runs: [],
  labBest: 0,
  plan: null,
  timetable: null,
  done: {},
  drafts: {},
  seenIntro: false,
  streak: { days: 0, last: '' },
};

function read(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      ...EMPTY,
      ...parsed,
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      // An older save has no timetable and no completion map; both default
      // to "nothing done yet" rather than breaking the study screen.
      done: parsed.done && typeof parsed.done === 'object' ? parsed.done : {},
      drafts: parsed.drafts && typeof parsed.drafts === 'object' ? parsed.drafts : {},
      timetable: parsed.timetable ?? null,
      streak: parsed.streak ?? { ...EMPTY.streak },
    };
  } catch {
    return { ...EMPTY };
  }
}

type Listener = (s: AppState) => void;

class Store {
  private state: AppState = read();
  private listeners = new Set<Listener>();

  get(): Readonly<AppState> {
    return this.state;
  }

  set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      // Storage unavailable (private mode, quota). The session still works.
    }
    for (const fn of this.listeners) fn(this.state);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /* ── derived helpers ───────────────────────────────────────────── */

  get lastRun(): QuizRun | null {
    return this.state.runs.length > 0 ? this.state.runs[this.state.runs.length - 1] : null;
  }

  get best(): number {
    return this.state.runs.reduce((m, r) => Math.max(m, r.score / r.total), 0);
  }

  addRun(run: QuizRun): void {
    // Keep the last 20 — enough for the trend line, small enough for storage.
    this.set({ runs: [...this.state.runs, run].slice(-20) });
    this.touchStreak();
  }

  /* ── the course ────────────────────────────────────────────────── */

  get doneCount(): number {
    return Object.keys(this.state.done).length;
  }

  isDone(lessonId: string): boolean {
    return lessonId in this.state.done;
  }

  draft(lessonId: string): string {
    return this.state.drafts[lessonId] ?? '';
  }

  /** Keeps what the student wrote. An empty draft is dropped, not stored. */
  saveDraft(lessonId: string, text: string): void {
    const next = { ...this.state.drafts };
    if (text.trim()) next[lessonId] = text;
    else delete next[lessonId];
    this.set({ drafts: next });
  }

  /** Marks a session done (or undoes it). Completing one counts as study. */
  markLesson(lessonId: string, done: boolean): void {
    const next = { ...this.state.done };
    if (done) next[lessonId] = todayISO();
    else delete next[lessonId];

    this.set({ done: next });
    if (done) this.touchStreak();
  }

  /** Counts consecutive calendar days with at least one session. */
  private touchStreak(): void {
    const today = todayISO();
    const { days, last } = this.state.streak;
    if (last === today) return;

    this.set({ streak: { days: last === addDays(today, -1) ? days + 1 : 1, last: today } });
  }
}

export const store = new Store();

/* ─────────────────────────────── theme ───────────────────────────── */

export function applyTheme(theme: AppState['theme']): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  // Keep the browser chrome in step with the app's ground.
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content',
    dark ? '#05060b' : '#f4f2ec',
  );
}

/** Cycles system → light → dark → system. */
export function nextTheme(current: AppState['theme']): AppState['theme'] {
  return current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
}

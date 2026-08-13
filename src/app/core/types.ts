/**
 * Shared domain types for 수 국어논술.
 *
 * The whole app is built around two vocabularies:
 *  - `Domain` — the *subject* area a piece of content belongs to (what shelf it
 *    sits on: 문학 / 문법 / 비문학 / 어휘 / 논술).
 *  - `Skill`  — the *competency* a question actually measures. A 비문학 question
 *    and a 문학 question can both measure 추론적 이해, and the diagnostic report
 *    is far more useful when it speaks in competencies rather than shelves.
 */

export const DOMAINS = ['literature', 'grammar', 'nonfiction', 'vocab', 'writing'] as const;
export type Domain = (typeof DOMAINS)[number];

export const DOMAIN_LABEL: Record<Domain, string> = {
  literature: '문학',
  grammar: '문법',
  nonfiction: '비문학',
  vocab: '어휘',
  writing: '논술',
};

export const DOMAIN_ICON: Record<Domain, string> = {
  literature: '📖',
  grammar: '🧩',
  nonfiction: '🔬',
  vocab: '💠',
  writing: '✍️',
};

/** Per-domain accent hues, used for charts, chips and the 3D scene. */
export const DOMAIN_HUE: Record<Domain, number> = {
  literature: 268,
  grammar: 205,
  nonfiction: 168,
  vocab: 42,
  writing: 336,
};

export const SKILLS = [
  '사실적 이해',
  '추론적 이해',
  '비판적 이해',
  '어휘·어법',
  '문학 감상',
  '논리·구성',
] as const;
export type Skill = (typeof SKILLS)[number];

/** 1 = 기본, 2 = 응용, 3 = 심화. */
export type Level = 1 | 2 | 3;

export const LEVEL_LABEL: Record<Level, string> = {
  1: '기본',
  2: '응용',
  3: '심화',
};

export interface Passage {
  id: string;
  domain: Domain;
  title: string;
  source: string;
  /** Optional one-line framing shown above the passage. */
  intro?: string;
  /** Paragraphs. Rendered in order; `[n]` markers are highlighted. */
  body: string[];
  /** Estimated reading time in seconds, used by the 독해 속도 trainer. */
  readSeconds: number;
}

export interface Question {
  id: string;
  domain: Domain;
  skill: Skill;
  /** Fine-grained topic, e.g. '음운 변동' — drives the weakness report. */
  topic: string;
  level: Level;
  passageId?: string;
  stem: string;
  choices: string[];
  /** Index into `choices`. */
  answer: number;
  explain: string;
  /** Optional per-choice notes shown in review mode. */
  choiceNotes?: string[];
}

export interface VocabEntry {
  id: string;
  word: string;
  /** 한자 표기 or 원어 — optional. */
  hanja?: string;
  reading?: string;
  meaning: string;
  example: string;
  kind: '한자어' | '고유어' | '한자성어' | '속담' | '관용구' | '문학어';
  level: Level;
}

export interface Concept {
  id: string;
  domain: Domain;
  group: string;
  title: string;
  summary: string;
  points: string[];
  examples: string[];
  /** Common exam traps for this concept. */
  trap?: string;
}

export interface SpellingItem {
  id: string;
  prompt: string;
  choices: [string, string];
  answer: 0 | 1;
  rule: string;
}

export interface Badge {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** Evaluated against the live profile. */
  test: (p: Profile) => boolean;
}

/* ------------------------------------------------------------------ */
/* Persisted profile                                                   */
/* ------------------------------------------------------------------ */

export interface Tally {
  seen: number;
  correct: number;
}

export interface AttemptLog {
  qid: string;
  domain: Domain;
  skill: Skill;
  topic: string;
  correct: boolean;
  chosen: number;
  /** Milliseconds spent on the question. */
  ms: number;
  at: number;
}

export interface WrongNote {
  qid: string;
  chosen: number;
  wrongCount: number;
  /** Cleared once the learner gets it right twice in review. */
  clearedStreak: number;
  at: number;
  memo?: string;
}

export interface SrsCard {
  id: string;
  /** Leitner box 0..4. Box 5 = 졸업. */
  box: number;
  due: number;
  lapses: number;
}

export interface RoutineTask {
  id: string;
  label: string;
  domain: Domain;
  minutes: number;
  /** Deep-link into the app, e.g. `#/practice?domain=grammar`. */
  href?: string;
  done: boolean;
}

export interface RoutineDay {
  /** 0 = 일요일 … 6 = 토요일. */
  weekday: number;
  tasks: RoutineTask[];
}

export interface Routine {
  createdAt: number;
  goal: string;
  targetLabel: string;
  minutesPerDay: number;
  activeDays: number[];
  focus: Domain[];
  days: RoutineDay[];
  /** ISO date (YYYY-MM-DD) → number of tasks completed that day. */
  history: Record<string, number>;
}

export interface DiagnosticResult {
  at: number;
  total: number;
  correct: number;
  bySkill: Record<Skill, Tally>;
  byDomain: Record<Domain, Tally>;
  /** 1(기초) … 9(최상) — an internal band, not a school grade. */
  band: number;
  seconds: number;
}

export interface EssayDraft {
  id: string;
  promptId: string;
  title: string;
  outline: string;
  body: string;
  updatedAt: number;
  /** Self-assessment rubric scores, 0..4 each. */
  rubric: Record<string, number>;
}

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  motion: 'full' | 'reduced';
  sound: boolean;
  fontScale: number;
  quality: 'high' | 'lite';
}

export interface Profile {
  version: number;
  name: string;
  grade: string;
  goal: string;
  createdAt: number;

  xp: number;
  coins: number;
  streak: number;
  bestStreak: number;
  lastStudyDate: string;
  studyDates: string[];
  minutes: number;

  byDomain: Record<Domain, Tally>;
  bySkill: Record<Skill, Tally>;
  byTopic: Record<string, Tally>;

  attempts: AttemptLog[];
  wrong: WrongNote[];
  bookmarks: string[];
  srs: SrsCard[];

  diagnostics: DiagnosticResult[];
  mocks: { at: number; correct: number; total: number; seconds: number }[];
  routine: Routine | null;
  essays: EssayDraft[];
  badges: string[];

  settings: Settings;
}

import type { Domain, Level, Question, Skill } from '../../core/types';
import { EXTRA_QUESTIONS } from './extra';
import { GRAMMAR_QUESTIONS } from './grammar';
import { LITERATURE_QUESTIONS } from './literature';
import { NONFICTION_QUESTIONS } from './nonfiction';
import { VOCAB_QUESTIONS } from './vocab';
import { WRITING_QUESTIONS } from './writing';

export const QUESTIONS: Question[] = [
  ...NONFICTION_QUESTIONS,
  ...LITERATURE_QUESTIONS,
  ...GRAMMAR_QUESTIONS,
  ...VOCAB_QUESTIONS,
  ...WRITING_QUESTIONS,
  ...EXTRA_QUESTIONS,
];

export const QUESTION_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

export interface QueryFilter {
  domain?: Domain | 'all';
  level?: Level | 'all';
  skill?: Skill | 'all';
  topic?: string;
  ids?: string[];
}

export function queryQuestions(f: QueryFilter): Question[] {
  if (f.ids) {
    return f.ids.map((id) => QUESTION_BY_ID.get(id)).filter((q): q is Question => Boolean(q));
  }
  return QUESTIONS.filter((q) => {
    if (f.domain && f.domain !== 'all' && q.domain !== f.domain) return false;
    if (f.level && f.level !== 'all' && q.level !== f.level) return false;
    if (f.skill && f.skill !== 'all' && q.skill !== f.skill) return false;
    if (f.topic && q.topic !== f.topic) return false;
    return true;
  });
}

/** Distinct topics for a domain, in first-seen order. */
export function topicsFor(domain: Domain | 'all'): string[] {
  const seen: string[] = [];
  for (const q of QUESTIONS) {
    if (domain !== 'all' && q.domain !== domain) continue;
    if (!seen.includes(q.topic)) seen.push(q.topic);
  }
  return seen;
}

export const QUESTION_COUNT = QUESTIONS.length;

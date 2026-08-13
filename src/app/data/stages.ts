import type { Domain, Level } from '../core/types';

/**
 * The journey map: an ordered run of stages the learner climbs, each bound to a
 * slice of the question bank. Stage N unlocks when stage N−1 has been cleared
 * (1★ or better), so the path always has exactly one obvious next step.
 */
export interface Stage {
  id: string;
  /** 1-indexed position along the path. */
  no: number;
  name: string;
  chapter: string;
  domain: Domain;
  level: Level | 'mixed';
  count: number;
  /** Boss stages are longer, mixed-domain and worth more. */
  boss?: boolean;
}

export const STAGES: Stage[] = [
  { id: 'st-01', no: 1, name: '첫 문장', chapter: '1장 · 말의 뼈대', domain: 'grammar', level: 1, count: 5 },
  { id: 'st-02', no: 2, name: '소리의 규칙', chapter: '1장 · 말의 뼈대', domain: 'grammar', level: 1, count: 5 },
  { id: 'st-03', no: 3, name: '낱말 모으기', chapter: '1장 · 말의 뼈대', domain: 'vocab', level: 1, count: 5 },
  { id: 'st-04', no: 4, name: '음운의 문', chapter: '1장 · 말의 뼈대', domain: 'grammar', level: 2, count: 6 },
  { id: 'st-05', no: 5, name: '1장 관문', chapter: '1장 · 말의 뼈대', domain: 'grammar', level: 'mixed', count: 8, boss: true },

  { id: 'st-06', no: 6, name: '화자의 자리', chapter: '2장 · 시의 결', domain: 'literature', level: 1, count: 5 },
  { id: 'st-07', no: 7, name: '심상의 방', chapter: '2장 · 시의 결', domain: 'literature', level: 2, count: 5 },
  { id: 'st-08', no: 8, name: '반어와 역설', chapter: '2장 · 시의 결', domain: 'literature', level: 2, count: 5 },
  { id: 'st-09', no: 9, name: '옛 노래', chapter: '2장 · 시의 결', domain: 'literature', level: 3, count: 5 },
  { id: 'st-10', no: 10, name: '2장 관문', chapter: '2장 · 시의 결', domain: 'literature', level: 'mixed', count: 8, boss: true },

  { id: 'st-11', no: 11, name: '문단의 지도', chapter: '3장 · 지문의 숲', domain: 'nonfiction', level: 1, count: 5 },
  { id: 'st-12', no: 12, name: '근거 찾기', chapter: '3장 · 지문의 숲', domain: 'nonfiction', level: 2, count: 5 },
  { id: 'st-13', no: 13, name: '어휘의 샘', chapter: '3장 · 지문의 숲', domain: 'vocab', level: 2, count: 5 },
  { id: 'st-14', no: 14, name: '추론의 다리', chapter: '3장 · 지문의 숲', domain: 'nonfiction', level: 3, count: 6 },
  { id: 'st-15', no: 15, name: '3장 관문', chapter: '3장 · 지문의 숲', domain: 'nonfiction', level: 'mixed', count: 8, boss: true },

  { id: 'st-16', no: 16, name: '문장 고치기', chapter: '4장 · 쓰는 자리', domain: 'writing', level: 1, count: 5 },
  { id: 'st-17', no: 17, name: '논리의 함정', chapter: '4장 · 쓰는 자리', domain: 'writing', level: 2, count: 5 },
  { id: 'st-18', no: 18, name: '높임과 시제', chapter: '4장 · 쓰는 자리', domain: 'grammar', level: 3, count: 5 },
  { id: 'st-19', no: 19, name: '개요의 탑', chapter: '4장 · 쓰는 자리', domain: 'writing', level: 3, count: 5 },
  { id: 'st-20', no: 20, name: '최종 관문', chapter: '4장 · 쓰는 자리', domain: 'nonfiction', level: 'mixed', count: 10, boss: true },
];

export const STAGE_BY_ID = new Map(STAGES.map((s) => [s.id, s]));

export const CHAPTERS = [...new Set(STAGES.map((s) => s.chapter))];

/** Stars earned for a given accuracy. */
export function starsFor(accuracy: number): number {
  if (accuracy >= 0.999) return 3;
  if (accuracy >= 0.8) return 2;
  if (accuracy >= 0.6) return 1;
  return 0;
}

export function isUnlocked(stage: Stage, progress: Record<string, { stars: number }>): boolean {
  if (stage.no === 1) return true;
  const prev = STAGES[stage.no - 2];
  return (progress[prev.id]?.stars ?? 0) > 0;
}

/** Index of the first stage that has not been cleared yet. */
export function currentStageIndex(progress: Record<string, { stars: number }>): number {
  const i = STAGES.findIndex((s) => (progress[s.id]?.stars ?? 0) === 0);
  return i === -1 ? STAGES.length - 1 : i;
}

export function totalStars(progress: Record<string, { stars: number }>): number {
  return STAGES.reduce((sum, s) => sum + (progress[s.id]?.stars ?? 0), 0);
}

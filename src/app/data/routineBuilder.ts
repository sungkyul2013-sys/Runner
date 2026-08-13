import { DOMAIN_LABEL, type Domain, type Profile, type Routine, type RoutineDay, type RoutineTask } from '../core/types';
import { accuracy } from '../core/store';

export const WEEKDAY_LABEL = ['일', '월', '화', '수', '목', '금', '토'];

export interface RoutineInput {
  goal: string;
  targetLabel: string;
  minutesPerDay: number;
  activeDays: number[];
  focus: Domain[];
}

interface TaskBlueprint {
  label: string;
  domain: Domain;
  /** Relative share of the daily budget. */
  weight: number;
  href: string;
  /** Only scheduled when the day index matches. */
  everyN?: number;
}

/**
 * Blueprint pool. The builder picks blocks per day so that the week covers all
 * focus areas, keeps a daily warm-up, and always ends the week with review.
 */
const BLOCKS: Record<Domain, TaskBlueprint[]> = {
  literature: [
    { label: '문학 개념 카드 읽기', domain: 'literature', weight: 0.25, href: '#/concepts?domain=literature' },
    { label: '시 한 편 정독 + 문항 3개', domain: 'literature', weight: 0.45, href: '#/practice?domain=literature' },
    { label: '소설 지문 세트 풀이', domain: 'literature', weight: 0.5, href: '#/practice?domain=literature&level=2' },
  ],
  grammar: [
    { label: '문법 개념 1단원 정리', domain: 'grammar', weight: 0.3, href: '#/concepts?domain=grammar' },
    { label: '문법 문항 10개', domain: 'grammar', weight: 0.4, href: '#/practice?domain=grammar' },
    { label: '맞춤법 스피드 퀴즈', domain: 'grammar', weight: 0.2, href: '#/spelling' },
  ],
  nonfiction: [
    { label: '비문학 지문 1세트 (구조 표시하며 읽기)', domain: 'nonfiction', weight: 0.55, href: '#/practice?domain=nonfiction' },
    { label: '읽기 속도 측정', domain: 'nonfiction', weight: 0.2, href: '#/reading' },
    { label: '선택지 근거 찾기 훈련', domain: 'nonfiction', weight: 0.35, href: '#/practice?domain=nonfiction&level=3' },
  ],
  vocab: [
    { label: '어휘 카드 15장 (간격 반복)', domain: 'vocab', weight: 0.25, href: '#/vocab' },
    { label: '한자성어·관용구 점검', domain: 'vocab', weight: 0.25, href: '#/practice?domain=vocab' },
  ],
  writing: [
    { label: '개요 짜기 훈련', domain: 'writing', weight: 0.35, href: '#/writing' },
    { label: '논술 초고 작성', domain: 'writing', weight: 0.6, href: '#/writing' },
    { label: '고쳐쓰기 · 논리 오류 점검', domain: 'writing', weight: 0.3, href: '#/practice?domain=writing' },
  ],
};

const WARMUP: TaskBlueprint = { label: '오답노트 3문항 복습', domain: 'grammar', weight: 0.18, href: '#/review' };
const WEEKLY_REVIEW: TaskBlueprint = { label: '주간 리뷰 — 성취도 확인과 다음 주 조정', domain: 'writing', weight: 0.3, href: '#/dashboard' };

/** Domains ordered weakest-first, using the learner's own history. */
export function weakestDomains(p: Profile): Domain[] {
  const all = Object.keys(DOMAIN_LABEL) as Domain[];
  return [...all].sort((a, b) => {
    const ta = p.byDomain[a];
    const tb = p.byDomain[b];
    // Unseen domains count as "unknown" and sort just after the truly weak.
    const sa = ta.seen === 0 ? 0.55 : accuracy(ta);
    const sb = tb.seen === 0 ? 0.55 : accuracy(tb);
    return sa - sb;
  });
}

let taskSeq = 0;
function makeTask(bp: TaskBlueprint, minutes: number): RoutineTask {
  taskSeq += 1;
  return {
    id: `t${Date.now().toString(36)}-${taskSeq}`,
    label: bp.label,
    domain: bp.domain,
    minutes,
    href: bp.href,
    done: false,
  };
}

export function buildRoutine(input: RoutineInput, profile: Profile): Routine {
  const focus = input.focus.length ? input.focus : weakestDomains(profile).slice(0, 3);
  const days: RoutineDay[] = [];
  const active = [...input.activeDays].sort((a, b) => a - b);

  active.forEach((weekday, i) => {
    // Rotate the focus list so each session leads with a different area.
    const lead = focus[i % focus.length];
    const second = focus[(i + 1) % focus.length];

    const picks: TaskBlueprint[] = [WARMUP];
    const leadBlocks = BLOCKS[lead];
    picks.push(leadBlocks[i % leadBlocks.length]);
    if (input.minutesPerDay >= 40) {
      const secondBlocks = BLOCKS[second];
      picks.push(secondBlocks[(i + 1) % secondBlocks.length]);
    }
    if (input.minutesPerDay >= 75) {
      const third = focus[(i + 2) % focus.length];
      const thirdBlocks = BLOCKS[third];
      picks.push(thirdBlocks[(i + 2) % thirdBlocks.length]);
    }
    // Vocabulary is cheap and compounding — add it whenever there's room.
    if (input.minutesPerDay >= 30 && !picks.some((p) => p.domain === 'vocab')) {
      picks.push(BLOCKS.vocab[i % BLOCKS.vocab.length]);
    }
    // Close out the last active day of the week with a review block.
    if (i === active.length - 1) picks.push(WEEKLY_REVIEW);

    const totalWeight = picks.reduce((s, p) => s + p.weight, 0);
    const tasks = picks.map((bp) => {
      const raw = (bp.weight / totalWeight) * input.minutesPerDay;
      const minutes = Math.max(5, Math.round(raw / 5) * 5);
      return makeTask(bp, minutes);
    });

    days.push({ weekday, tasks });
  });

  return {
    createdAt: Date.now(),
    goal: input.goal,
    targetLabel: input.targetLabel,
    minutesPerDay: input.minutesPerDay,
    activeDays: active,
    focus,
    days,
    history: {},
  };
}

export function routineTotals(r: Routine): { tasks: number; done: number; minutes: number } {
  let tasks = 0;
  let done = 0;
  let minutes = 0;
  for (const d of r.days) {
    for (const t of d.tasks) {
      tasks += 1;
      minutes += t.minutes;
      if (t.done) done += 1;
    }
  }
  return { tasks, done, minutes };
}

/** Preset goals offered in the wizard. */
export const GOAL_PRESETS = [
  { id: 'exam', label: '내신 대비', target: '다음 시험까지', focus: ['grammar', 'literature'] as Domain[] },
  { id: 'suneung', label: '수능 국어', target: '수능까지', focus: ['nonfiction', 'literature', 'grammar'] as Domain[] },
  { id: 'essay', label: '논술 대비', target: '논술 전형까지', focus: ['writing', 'nonfiction'] as Domain[] },
  { id: 'literacy', label: '문해력 기르기', target: '3개월 목표', focus: ['vocab', 'nonfiction'] as Domain[] },
  { id: 'balance', label: '약점 보완', target: '한 달 집중', focus: [] as Domain[] },
];

import { addDays, fromISO } from '../core/dates';

/**
 * 정규 과정 — six stages, twenty-four sessions.
 *
 * Two different questions have to be answerable from the same material:
 *
 *   "무엇을 배우는가"  → the stages, in order, each with its own gate.
 *   "오늘 뭐 하지"     → those same sessions laid on a calendar.
 *
 * So the curriculum is written once, as an ordered list, and the timetable
 * is *derived* by dealing that list onto the weekdays the student picked.
 * There is no second copy of the schedule to fall out of step, and moving
 * the start date simply re-deals the same cards.
 */

export type LessonKind = 'read' | 'drill' | 'write' | 'redline' | 'test';

export const KINDS: Record<
  LessonKind,
  { label: string; tone: string; icon: string; action: string | null; cta: string }
> = {
  read: { label: '읽기', tone: 'var(--cheong)', icon: 'book', action: null, cta: '읽고 완료 표시' },
  drill: { label: '문제', tone: 'var(--text)', icon: 'quiz', action: '/quiz', cta: '문제 풀러 가기' },
  write: { label: '쓰기', tone: 'var(--geumbak)', icon: 'plan', action: null, cta: '쓰고 완료 표시' },
  redline: { label: '첨삭', tone: 'var(--jeomsak)', icon: 'lab', action: '/lab', cta: '첨삭 랩 열기' },
  test: { label: '점검', tone: 'var(--ok)', icon: 'spark', action: '/quiz', cta: '점검 테스트' },
};

export interface Lesson {
  /** Stable across releases — completion is stored under this. */
  id: string;
  kind: LessonKind;
  title: string;
  detail: string;
  minutes: number;
  /** Writing sessions only: the character count being aimed at. */
  target?: number;
}

export interface Stage {
  no: number;
  name: string;
  aim: string;
  /** What has to be true before the next stage is worth opening. */
  gate: string;
  lessons: Lesson[];
}

export const STAGES: Stage[] = [
  {
    no: 1,
    name: '문장',
    aim: '한 문장을 끝까지 책임집니다.',
    gate: '주어와 서술어가 어긋난 문장을 스스로 찾아낼 것',
    lessons: [
      {
        id: 's1-1',
        kind: 'read',
        title: '소리 내어 두 번 읽기',
        detail: '짧은 글 한 편을 소리 내어 두 번 읽고, 걸리는 낱말마다 표시합니다. 뜻은 찾지 말고 표시만 합니다.',
        minutes: 15,
      },
      {
        id: 's1-2',
        kind: 'drill',
        title: '어휘 · 표현 진단',
        detail: '12문항 진단으로 어휘·독해·교정·구성 중 어디가 약한지 먼저 확인합니다.',
        minutes: 12,
      },
      {
        id: 's1-3',
        kind: 'write',
        target: 40,
        title: '한 문장으로 줄이기',
        detail: '읽은 글을 40자 안쪽 한 문장으로 줄여 씁니다. “재미있다”처럼 반응을 적는 말은 쓰지 않습니다.',
        minutes: 15,
      },
      {
        id: 's1-4',
        kind: 'redline',
        title: '문장 첨삭 첫 시도',
        detail: '첨삭 랩에서 고칠 자리를 직접 짚고, 선생님 첨삭과 얼마나 겹치는지 봅니다.',
        minutes: 20,
      },
    ],
  },
  {
    no: 2,
    name: '문단',
    aim: '한 문단에 생각 하나만 담습니다.',
    gate: '문단마다 중심 문장을 한 개만 남길 것',
    lessons: [
      {
        id: 's2-1',
        kind: 'read',
        title: '중심 문장 찾기',
        detail: '문단마다 중심 문장에 밑줄을 긋습니다. 두 개가 그어지면 그 문단은 쪼개야 하는 문단입니다.',
        minutes: 20,
      },
      {
        id: 's2-2',
        kind: 'write',
        target: 150,
        title: '한 문단 쓰기',
        detail: '중심 문장 하나에 뒷받침 문장 셋. 쓴 뒤 순서를 바꿔 보고, 바꿔도 말이 되면 아직 문단이 아닙니다.',
        minutes: 25,
      },
      {
        id: 's2-3',
        kind: 'drill',
        title: '독해 문항 풀기',
        detail: '지문에서 문단의 역할을 묻는 문항으로 방금 쓴 원칙을 남의 글에 적용해 봅니다.',
        minutes: 15,
      },
      {
        id: 's2-4',
        kind: 'redline',
        title: '문단 첨삭',
        detail: '뒷받침 문장이 중심 문장을 정말 받치고 있는지 문장 단위로 확인합니다.',
        minutes: 20,
      },
    ],
  },
  {
    no: 3,
    name: '요약',
    aim: '남의 글을 내 말로 옮깁니다.',
    gate: '원문 표현을 베끼지 않고 200자로 줄일 것',
    lessons: [
      {
        id: 's3-1',
        kind: 'read',
        title: '구조 그리기',
        detail: '글 전체를 도입·전개·결론으로 나누고, 각 덩어리에 제목을 붙입니다.',
        minutes: 25,
      },
      {
        id: 's3-2',
        kind: 'write',
        target: 200,
        title: '200자 요약',
        detail: '원문에 있는 표현을 그대로 쓰지 않고 요약합니다. 베낀 자리는 스스로 표시해 둡니다.',
        minutes: 25,
      },
      {
        id: 's3-3',
        kind: 'drill',
        title: '요약 판별 문항',
        detail: '잘못된 요약 네 개 중 무엇이 왜 틀렸는지 고릅니다. 빠뜨림·덧붙임·왜곡을 구분합니다.',
        minutes: 15,
      },
      {
        id: 's3-4',
        kind: 'redline',
        title: '요약 첨삭',
        detail: '내 말로 바꾼 자리와 베낀 자리를 나누어 표시하고, 베낀 자리를 다시 씁니다.',
        minutes: 20,
      },
    ],
  },
  {
    no: 4,
    name: '근거',
    aim: '주장에는 반드시 이유를 붙입니다.',
    gate: '주장 하나에 성격이 다른 근거 두 개를 댈 것',
    lessons: [
      {
        id: 's4-1',
        kind: 'read',
        title: '주장과 근거 가려 읽기',
        detail: '한 편을 읽으며 주장에는 동그라미, 근거에는 세모를 칩니다. 근거 없는 주장을 세어 봅니다.',
        minutes: 20,
      },
      {
        id: 's4-2',
        kind: 'write',
        target: 80,
        title: '개요 짜기',
        detail: '주장 한 줄, 근거 두 줄, 예상 반론 한 줄. 본문을 쓰기 전에 이 네 줄을 먼저 확정합니다.',
        minutes: 20,
      },
      {
        id: 's4-3',
        kind: 'write',
        target: 400,
        title: '근거 두 개로 쓰기',
        detail: '개요대로 400자를 씁니다. 근거 둘이 같은 말의 반복이면 하나는 버리고 다시 찾습니다.',
        minutes: 30,
      },
      {
        id: 's4-4',
        kind: 'redline',
        title: '근거 첨삭',
        detail: '“왜?”라고 세 번 물어도 버티는 근거인지 확인합니다. 버티지 못하면 그 자리가 고칠 자리입니다.',
        minutes: 20,
      },
    ],
  },
  {
    no: 5,
    name: '반론',
    aim: '반대편을 먼저 씁니다.',
    gate: '내 주장을 가장 아프게 치는 반론을 스스로 쓸 것',
    lessons: [
      {
        id: 's5-1',
        kind: 'read',
        title: '반대편 글 읽기',
        detail: '내 주장과 반대되는 글을 읽고, 그중 가장 강한 문장을 하나 옮겨 적습니다.',
        minutes: 20,
      },
      {
        id: 's5-2',
        kind: 'write',
        target: 200,
        title: '예상 반론 쓰기',
        detail: '내 글을 읽은 사람이 할 법한 반론을 한 문단으로 씁니다. 약한 반론을 세우면 연습이 되지 않습니다.',
        minutes: 25,
      },
      {
        id: 's5-3',
        kind: 'write',
        target: 200,
        title: '재반박 문단',
        detail: '반론을 인정할 부분과 인정하지 않을 부분으로 나눈 뒤, 인정하지 않는 쪽만 반박합니다.',
        minutes: 25,
      },
      {
        id: 's5-4',
        kind: 'redline',
        title: '반론 첨삭',
        detail: '반론을 세워 두고 대충 넘긴 자리가 없는지 봅니다. 가장 흔한 실패가 여기서 나옵니다.',
        minutes: 20,
      },
    ],
  },
  {
    no: 6,
    name: '한 편',
    aim: '글 한 편을 끝내고, 다시 씁니다.',
    gate: '같은 주제로 초고와 고쳐 쓴 글을 나란히 놓을 것',
    lessons: [
      {
        id: 's6-1',
        kind: 'write',
        target: 800,
        title: '초고 800자',
        detail: '앞의 다섯 단계를 한 편에 모읍니다. 시간을 재고, 정해진 시간 안에 끝냅니다.',
        minutes: 40,
      },
      {
        id: 's6-2',
        kind: 'redline',
        title: '초고 첨삭',
        detail: '문장·문단·근거·반론 순서로 봅니다. 문장부터 고치면 문단이 또 흔들립니다.',
        minutes: 25,
      },
      {
        id: 's6-3',
        kind: 'write',
        target: 800,
        title: '리라이팅',
        detail: '첨삭을 반영해 같은 주제를 다시 씁니다. 고쳐 쓴 글이 한 편으로 완성되는 지점입니다.',
        minutes: 40,
      },
      {
        id: 's6-4',
        kind: 'test',
        title: '최종 점검',
        detail: '처음 풀었던 진단을 다시 풉니다. 시작할 때 점수와 나란히 놓고 봅니다.',
        minutes: 12,
      },
    ],
  },
];

/** The whole course in teaching order. */
export const LESSONS: Lesson[] = STAGES.flatMap((s) => s.lessons);

export const TOTAL_LESSONS = LESSONS.length;

export const stageOf = (lessonId: string): Stage =>
  STAGES.find((s) => s.lessons.some((l) => l.id === lessonId)) ?? STAGES[0];

export const lessonById = (id: string): Lesson | undefined => LESSONS.find((l) => l.id === id);

/* ─────────────────────────── the timetable ───────────────────────── */

export interface Session {
  /** `YYYY-MM-DD` */
  date: string;
  lesson: Lesson;
  stage: Stage;
  /** 1-based position in the course. */
  no: number;
}

/** Weekdays a plan of `perWeek` sessions falls on — spaced, not stacked. */
export function defaultDays(perWeek: number): number[] {
  if (perWeek <= 1) return [3];
  if (perWeek === 2) return [2, 5];
  if (perWeek === 3) return [1, 3, 5];
  return [1, 2, 4, 5];
}

/**
 * Deals the course onto the calendar: walk forward from `startISO` and hand
 * the next session to every date whose weekday the student chose.
 */
export function buildSchedule(startISO: string, days: number[]): Session[] {
  const picked = [...new Set(days)].filter((d) => d >= 0 && d <= 6);
  if (picked.length === 0) return [];

  const out: Session[] = [];
  let date = startISO;

  // At most a year of walking — with one session a week, 24 sessions fit.
  for (let step = 0; step < 400 && out.length < LESSONS.length; step += 1) {
    if (picked.includes(fromISO(date).getDay())) {
      const lesson = LESSONS[out.length];
      out.push({ date, lesson, stage: stageOf(lesson.id), no: out.length + 1 });
    }
    date = addDays(date, 1);
  }

  return out;
}

/** Sessions keyed by date, for the calendar's per-cell lookup. */
export function byDate(sessions: Session[]): Map<string, Session[]> {
  const map = new Map<string, Session[]>();
  for (const s of sessions) {
    const list = map.get(s.date);
    if (list) list.push(s);
    else map.set(s.date, [s]);
  }
  return map;
}

/** The first and last calendar date a stage occupies, when scheduled. */
export function stageSpan(sessions: Session[], stage: Stage): [string, string] | null {
  const mine = sessions.filter((s) => s.stage.no === stage.no);
  if (mine.length === 0) return null;
  return [mine[0].date, mine[mine.length - 1].date];
}

/** The first session on or after `fromDate` — "다음 수업". */
export function nextSession(sessions: Session[], fromDate: string): Session | null {
  return sessions.find((s) => s.date >= fromDate) ?? null;
}

import { h, icon } from '../core/dom';
import type { Router } from '../core/router';
import { buzz, toast } from '../core/ui';
import { store } from '../core/store';
import { DOMAINS, type Domain } from '../data/questions';
import { TEACHER } from '../data/content';
import { STAGES as COURSE_STAGES, TOTAL_LESSONS } from '../data/curriculum';

/**
 * 학습 맵 — the progression board that turns the separate screens into one
 * platform.
 *
 * Everything here is *derived* from what the visitor has actually done:
 * XP, level, badges and stage unlocks all read out of the same saved runs,
 * lab score and plan. Nothing is awarded for opening a screen, and there is
 * no separate progress state to drift out of sync with reality.
 */

/* ─────────────────────────── the economy ─────────────────────────── */

const LEVELS = [0, 60, 140, 260, 420, 620, 880, 1200];

const LEVEL_NAMES = [
  '입문',
  '읽는 사람',
  '요약하는 사람',
  '근거를 대는 사람',
  '고쳐 쓰는 사람',
  '반론을 받는 사람',
  '논증하는 사람',
  '자기 문장',
];

interface Progress {
  xp: number;
  level: number;
  name: string;
  intoLevel: number;
  levelSpan: number;
  runs: number;
  best: number;
  labBest: number;
  hasPlan: boolean;
  hasTimetable: boolean;
  lessons: number;
  stagesCleared: number;
  streak: number;
  weakest: Domain | null;
}

function read(): Progress {
  const s = store.get();
  const runs = s.runs.length;
  const best = store.best;
  const labBest = s.labBest;
  const hasPlan = s.plan !== null;
  const lessons = store.doneCount;
  const stagesCleared = COURSE_STAGES.filter((st) =>
    st.lessons.every((l) => store.isDone(l.id)),
  ).length;

  // Earned, not granted: each run pays for the questions it got right, and
  // each completed session of the course pays the same way.
  const xp =
    s.runs.reduce((sum, r) => sum + 10 + r.score * 5, 0) +
    Math.round(labBest / 2) +
    (hasPlan ? 30 : 0) +
    lessons * 12 +
    stagesCleared * 40 +
    Math.max(0, s.streak.days - 1) * 15;

  let level = 1;
  for (let i = 0; i < LEVELS.length; i += 1) if (xp >= LEVELS[i]) level = i + 1;

  const floor = LEVELS[level - 1];
  const ceil = LEVELS[level] ?? LEVELS[LEVELS.length - 1] + 400;

  const last = store.lastRun;
  const weakest = last
    ? (DOMAINS.map((d) => ({
        d,
        r: last.byDomain[d] ? last.byDomain[d].correct / Math.max(1, last.byDomain[d].total) : 1,
      })).sort((a, b) => a.r - b.r)[0].d as Domain)
    : null;

  return {
    xp,
    level,
    name: LEVEL_NAMES[level - 1] ?? LEVEL_NAMES[LEVEL_NAMES.length - 1],
    intoLevel: xp - floor,
    levelSpan: Math.max(1, ceil - floor),
    runs,
    best,
    labBest,
    hasPlan,
    hasTimetable: s.timetable !== null,
    lessons,
    stagesCleared,
    streak: s.streak.days,
    weakest,
  };
}

/* ─────────────────────────── the stages ──────────────────────────── */

interface Stage {
  no: number;
  title: string;
  /** A function when the line has to quote live numbers. */
  note: string | ((p: Progress) => string);
  route: string;
  /** Unlocked when this is true. */
  open: (p: Progress) => boolean;
  /** Cleared when this is true. */
  done: (p: Progress) => boolean;
  reward: number;
}

const STAGES: Stage[] = [
  {
    no: 1,
    title: '진단 12문항',
    note: '어휘 · 독해 · 교정 · 구성을 한 번에 재봅니다.',
    route: '/quiz',
    open: () => true,
    done: (p) => p.runs >= 1,
    reward: 70,
  },
  {
    no: 2,
    title: '영역별 분석 읽기',
    note: '어디가 약한지, 왜 약한지 확인합니다.',
    route: '/result',
    open: (p) => p.runs >= 1,
    done: (p) => p.runs >= 1,
    reward: 10,
  },
  {
    no: 3,
    title: '첨삭 랩 첫 채점',
    note: '학생 글을 직접 고쳐 보고 선생님 첨삭과 맞춰 봅니다.',
    route: '/lab',
    open: (p) => p.runs >= 1,
    done: (p) => p.labBest > 0,
    reward: 40,
  },
  {
    no: 4,
    title: '첨삭 70점 넘기',
    note: '자리와 이유를 모두 맞히면 70점을 넘습니다.',
    route: '/lab',
    open: (p) => p.labBest > 0,
    done: (p) => p.labBest >= 70,
    reward: 50,
  },
  {
    no: 5,
    title: '4주 플랜 설계',
    note: '진단 결과로 읽기·쓰기·첨삭을 배치합니다.',
    route: '/plan',
    open: (p) => p.runs >= 1,
    done: (p) => p.hasPlan,
    reward: 30,
  },
  {
    no: 6,
    title: '시간표 배치',
    note: '시작일과 요일을 고르면 24회차가 날짜에 붙습니다.',
    route: '/study',
    open: (p) => p.hasPlan,
    done: (p) => p.hasTimetable,
    reward: 25,
  },
  {
    no: 7,
    title: '1단계 문장 마치기',
    note: '읽기 · 문제 · 쓰기 · 첨삭 네 회차를 모두 완료합니다.',
    route: '/study',
    open: (p) => p.hasTimetable,
    done: () => COURSE_STAGES[0].lessons.every((l) => store.isDone(l.id)),
    reward: 80,
  },
  {
    no: 8,
    title: '정규 과정 절반',
    note: (p) => `${TOTAL_LESSONS}회차 중 ${TOTAL_LESSONS / 2}회차까지 — 지금 ${p.lessons}회차 완료.`,
    route: '/study',
    open: (p) => p.lessons >= 1,
    done: (p) => p.lessons >= TOTAL_LESSONS / 2,
    reward: 120,
  },
  {
    no: 9,
    title: '내 단계 확인',
    note: '어느 과정에서 시작하면 되는지 봅니다.',
    route: '/courses',
    open: (p) => p.hasPlan,
    done: (p) => p.hasPlan,
    reward: 10,
  },
  {
    no: 10,
    title: '진단 다시 풀기',
    note: '80점을 넘기면 다음 단계가 열립니다.',
    route: '/quiz',
    open: (p) => p.runs >= 1,
    done: (p) => p.best >= 0.8,
    reward: 90,
  },
  {
    no: 11,
    title: '상담 신청',
    note: `${TEACHER.name} ${TEACHER.role}이 결과를 직접 확인합니다.`,
    route: '/apply',
    open: (p) => p.hasPlan && p.labBest > 0,
    done: () => false,
    reward: 0,
  },
];

/* ─────────────────────────── the badges ──────────────────────────── */

const BADGES: { key: string; label: string; note: string; has: (p: Progress) => boolean }[] = [
  { key: '진', label: '첫 진단', note: '진단을 한 번 완주', has: (p) => p.runs >= 1 },
  { key: '삭', label: '첨삭가', note: '첨삭 랩 70점 이상', has: (p) => p.labBest >= 70 },
  { key: '계', label: '설계자', note: '4주 플랜 저장', has: (p) => p.hasPlan },
  { key: '표', label: '시간표', note: '24회차를 날짜에 배치', has: (p) => p.hasTimetable },
  { key: '차', label: '첫 회차', note: '정규 과정 1회차 완료', has: (p) => p.lessons >= 1 },
  { key: '단', label: '단계 통과', note: '한 단계를 모두 완료', has: (p) => p.stagesCleared >= 1 },
  { key: '연', label: '연속 3일', note: '3일 연속 학습', has: (p) => p.streak >= 3 },
  { key: '반', label: '반복 학습', note: '진단 3회 이상', has: (p) => p.runs >= 3 },
  { key: '수', label: '자기 문장', note: '진단 80점 이상', has: (p) => p.best >= 0.8 },
];

/* ──────────────────────────── the view ───────────────────────────── */

export function mapView(router: Router): HTMLElement {
  const p = read();
  const cleared = STAGES.filter((s) => s.done(p)).length;

  const levelPct = Math.min(1, p.intoLevel / p.levelSpan);
  const bar = h('i', { style: { width: '0%' } });
  requestAnimationFrame(() =>
    requestAnimationFrame(() => (bar.style.width = `${levelPct * 100}%`)),
  );

  return h(
    'div',
    { class: 'wrap stack--lg stack map' },

    /* ── level header ─────────────────────────────────────────────── */
    h(
      'header',
      { class: 'lvl card ruled rise' },
      h(
        'div',
        { class: 'lvl__top' },
        h(
          'div',
          { class: 'lvl__badge' },
          h('span', { class: 'mono', text: 'LV' }),
          h('b', { class: 'num', text: String(p.level) }),
        ),
        h(
          'div',
          { class: 'lvl__id' },
          h('h1', { class: 'h2', text: p.name }),
          h('p', { class: 'sm', text: `${p.xp.toLocaleString('ko-KR')} XP · 스테이지 ${cleared}/${STAGES.length} 완료` }),
        ),
      ),
      h(
        'div',
        { class: 'lvl__meter' },
        h('div', { class: 'lvl__track' }, bar),
        h(
          'div',
          { class: 'lvl__scale mono' },
          h('span', { text: `LV ${p.level}` }),
          h('span', {
            text:
              p.level < LEVELS.length
                ? `다음까지 ${Math.max(0, p.levelSpan - p.intoLevel)} XP`
                : '최고 단계',
          }),
        ),
      ),
      p.weakest
        ? h('p', { class: 'lvl__hint', text: `지금 가장 급한 영역은 ${p.weakest}입니다.` })
        : h('p', { class: 'lvl__hint', text: '진단을 한 번 풀면 여기에 약점이 표시됩니다.' }),
    ),

    /* ── the path ─────────────────────────────────────────────────── */
    h(
      'section',
      { class: 'stack', style: { gap: '12px' } },
      h(
        'div',
        { class: 'row row--between' },
        h('h2', { class: 'h2', text: '스테이지' }),
        h('span', { class: 'mono', text: `${cleared} / ${STAGES.length}` }),
      ),
      h(
        'ol',
        { class: 'path' },
        ...STAGES.map((s, i) => {
          const open = s.open(p);
          const done = s.done(p);
          const state = done ? 'done' : open ? 'open' : 'locked';

          return h(
            'li',
            {
              class: `node node--${state} rise`,
              style: { '--d': `${i * 45}ms` } as Partial<CSSStyleDeclaration>,
            },
            h(
              'button',
              {
                class: 'node__hit',
                type: 'button',
                // Not aria-disabled: a locked stage is still a working
                // control that explains why it is locked. Its state is
                // announced by the "잠김" label inside it.
                on: {
                  click: () => {
                    if (!open) {
                      buzz([20, 40, 20]);
                      toast('앞 단계를 먼저 완료해 주세요.');
                      return;
                    }
                    buzz(12);
                    router.go(s.route);
                  },
                },
              },
              h(
                'span',
                { class: 'node__chip' },
                done ? icon('check', 18) : h('b', { class: 'num', text: String(s.no) }),
              ),
              h(
                'span',
                { class: 'node__body' },
                h('b', { text: s.title }),
                h('span', { class: 'sm', text: typeof s.note === 'function' ? s.note(p) : s.note }),
              ),
              h(
                'span',
                { class: 'node__meta mono' },
                done ? '완료' : open ? (s.reward > 0 ? `+${s.reward} XP` : '마지막') : '잠김',
              ),
            ),
          );
        }),
      ),
    ),

    /* ── badges ───────────────────────────────────────────────────── */
    h(
      'section',
      { class: 'stack', style: { gap: '12px' } },
      h(
        'div',
        { class: 'row row--between' },
        h('h2', { class: 'h2', text: '배지' }),
        h('span', { class: 'mono', text: `${BADGES.filter((bd) => bd.has(p)).length} / ${BADGES.length}` }),
      ),
      h(
        'div',
        { class: 'badges' },
        ...BADGES.map((bd) => {
          const has = bd.has(p);
          return h(
            'div',
            { class: `badge ${has ? 'is-on' : ''}` },
            h('span', { class: 'badge__seal', text: bd.key }),
            h('b', { text: bd.label }),
            h('span', { class: 'sm', text: bd.note }),
          );
        }),
      ),
    ),

    /* ── the way out ──────────────────────────────────────────────── */
    h(
      'section',
      { class: 'card card--solid rise' },
      h('span', { class: 'eyebrow', text: '한 번에 돌리기' }),
      h('p', {
        class: 'body',
        style: { marginTop: '10px' },
        text: '스테이지를 하나씩 열지 않고, 진단부터 상담까지 이어서 한 번에 진행할 수도 있습니다.',
      }),
      h(
        'div',
        { class: 'row', style: { gap: '8px', marginTop: '18px', flexWrap: 'wrap' } },
        h(
          'button',
          { class: 'btn btn--primary', type: 'button', on: { click: () => router.go('/try') } },
          '프로그램 체험',
          icon('arrow', 17),
        ),
        h(
          'button',
          { class: 'btn btn--ghost', type: 'button', on: { click: () => router.go('/apply') } },
          '상담 신청',
        ),
      ),
    ),
  );
}

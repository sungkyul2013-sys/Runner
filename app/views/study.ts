import { h, icon } from '../core/dom';
import type { Router } from '../core/router';
import { buzz, meter, ring, segmented, sheet, toast } from '../core/ui';
import { store } from '../core/store';
import { morph } from '../core/stage';
import {
  KINDS,
  STAGES,
  TOTAL_LESSONS,
  buildSchedule,
  byDate,
  defaultDays,
  nextSession,
  stageSpan,
  type Lesson,
  type Session,
  type Stage,
} from '../data/curriculum';
import {
  WEEKDAYS,
  dayLabel,
  fromISO,
  monthGrid,
  monthLabel,
  relativeDay,
  todayISO,
  weekStart,
} from '../core/dates';

/**
 * 학습 시스템 — the same course seen two ways.
 *
 *   날짜  the timetable: what to do today, on a calendar you can walk.
 *   단계  the curriculum: six stages in order, each with a gate.
 *
 * Neither view owns the data. The stages are the source; the calendar is
 * dealt from them; completion is stored per lesson id, so re-picking the
 * start date or the weekdays moves the schedule without losing a thing.
 */

/**
 * Survives navigation *and* re-renders. Marking a session done rebuilds the
 * panel, and without this the calendar would snap back to today every time
 * — so which tab, which day and which month are held outside the view.
 */
let lastTab = 0;
let selectedISO: string | null = null;
let cursor: { y: number; m: number } | null = null;

/** Called when the timetable itself changes and the old position is moot. */
function resetCalendar(): void {
  selectedISO = null;
  cursor = null;
}

export function studyView(router: Router): HTMLElement {
  const panel = h('div', { class: 'stack stack--lg' });

  const render = (): void => {
    panel.replaceChildren(lastTab === 0 ? datePanel(router, render) : stagePanel(router, render));

    // The 3D follows the reading: 원고지 for the calendar, a stacked tower
    // for the ladder. Deferred a frame because the router asserts the
    // route's own shape after the view is built.
    requestAnimationFrame(() => morph(lastTab === 0 ? 'grid' : 'sphere'));
  };

  const root = h(
    'div',
    { class: 'wrap stack--lg stack study' },

    h(
      'header',
      { class: 'stack', style: { gap: '10px' } },
      h('span', { class: 'eyebrow', text: '학습 시스템' }),
      h(
        'h1',
        { class: 'h1' },
        '오늘 할 것이 ',
        h('span', { class: 'pen', text: '정해져' }),
        ' 있습니다.',
      ),
      h('p', {
        class: 'body',
        text: '6단계 24회차를 순서대로 배치합니다. 날짜별로 오늘 분량을 확인하고, 단계별로 지금 어디까지 왔는지 봅니다.',
      }),
    ),

    h(
      'div',
      { class: 'study__bar' },
      segmented(['날짜', '단계'], lastTab, (i) => {
        lastTab = i;
        render();
      }),
    ),

    panel,
  );

  render();
  return root;
}

/* ───────────────────────────── shared bits ───────────────────────── */

const schedule = (): Session[] => {
  const tt = store.get().timetable;
  return tt ? buildSchedule(tt.startISO, tt.days) : [];
};

/** One session, as a row. Tapping opens the detail sheet. */
function lessonRow(
  router: Router,
  lesson: Lesson,
  stage: Stage,
  after: () => void,
  opts: { date?: string; locked?: boolean; showStage?: boolean } = {},
): HTMLElement {
  const kind = KINDS[lesson.kind];
  const done = store.isDone(lesson.id);

  return h(
    'button',
    {
      class: `les ${done ? 'is-done' : ''} ${opts.locked ? 'is-locked' : ''}`,
      type: 'button',
      style: { '--tone': kind.tone } as Partial<CSSStyleDeclaration>,
      on: {
        click: () => {
          if (opts.locked) {
            buzz([20, 40, 20]);
            toast('앞 단계를 3회 이상 마치면 열립니다.');
            return;
          }
          buzz(10);
          openLesson(router, lesson, stage, after, opts.date);
        },
      },
    },
    h('span', { class: 'les__kind mono', text: kind.label }),
    h(
      'span',
      { class: 'les__body' },
      h('b', { text: lesson.title }),
      h('span', {
        class: 'sm',
        text: opts.showStage
          ? `${stage.no}단계 ${stage.name} · ${lesson.minutes}분`
          : lesson.detail,
      }),
    ),
    done
      ? h('span', { class: 'les__end les__end--done' }, icon('check', 16))
      : h('span', {
          class: 'les__end mono',
          // A draft in progress is more useful than the estimate it replaces.
          text: draftLen(lesson) > 0 ? `${draftLen(lesson)}자` : `${lesson.minutes}분`,
        }),
  );
}

/** Characters written for a session, spaces excluded. */
const draftLen = (lesson: Lesson): number => store.draft(lesson.id).replace(/\s/g, '').length;

/**
 * The writing surface for a 쓰기 회차.
 *
 * It saves as you type — a study app that loses a paragraph to a stray tap
 * has failed at the one job the paragraph was for. The counter is honest
 * about Korean: it counts characters without spaces, the way 원고지 does.
 */
function writingPad(lesson: Lesson): HTMLElement {
  const target = lesson.target ?? 0;
  const count = h('b', { class: 'num' });
  const note = h('span', { class: 'sm' });

  const area = h('textarea', {
    class: 'pad',
    rows: '7',
    placeholder: '여기에 씁니다. 쓰는 동안 자동으로 저장됩니다.',
    'aria-label': `${lesson.title} 쓰기`,
  });
  area.value = store.draft(lesson.id);

  const paint = (): void => {
    const len = area.value.replace(/\s/g, '').length;
    count.textContent = String(len);
    note.textContent = target > 0 ? `자 / 목표 ${target}자` : '자';

    const state = target === 0 ? '' : len >= target ? 'is-met' : len >= target * 0.6 ? 'is-near' : '';
    count.className = `num ${state}`;
  };

  let timer = 0;
  area.addEventListener('input', () => {
    paint();
    // Debounced: one write per pause, not one per keystroke.
    window.clearTimeout(timer);
    timer = window.setTimeout(() => store.saveDraft(lesson.id, area.value), 400);
  });
  // A sheet can be flung away mid-sentence; flush on the way out.
  area.addEventListener('blur', () => store.saveDraft(lesson.id, area.value));

  paint();

  return h(
    'div',
    { class: 'padwrap' },
    area,
    h('div', { class: 'pad__foot' }, count, note),
  );
}

/** The detail sheet: what the session is, where it happens, and done/undone. */
function openLesson(
  router: Router,
  lesson: Lesson,
  stage: Stage,
  after: () => void,
  date?: string,
): void {
  const kind = KINDS[lesson.kind];
  const done = store.isDone(lesson.id);
  const pad = lesson.kind === 'write' ? writingPad(lesson) : null;

  const body = h(
    'div',
    { class: 'stack', style: { gap: '14px' } },
    h(
      'div',
      { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } },
      h('span', { class: 'chip', text: `${stage.no}단계 · ${stage.name}` }),
      h('span', { class: 'chip', text: kind.label }),
      h('span', { class: 'chip', text: `${lesson.minutes}분` }),
    ),
    h('p', { class: 'body', text: lesson.detail }),
    // A writing session is done *here*, not somewhere else.
    pad,
    date
      ? h('p', { class: 'sm', text: `예정일 ${dayLabel(date)} · ${relativeDay(date)}` })
      : h('p', { class: 'sm', text: '시간표를 만들면 이 회차에 날짜가 붙습니다.' }),
    h('p', { class: 'sm', text: `이 단계의 통과 조건 — ${stage.gate}` }),
  );

  const mark = (next: boolean): void => {
    // Closing the sheet unmounts the pad, so what is in it is saved first.
    const area = pad?.querySelector('textarea');
    if (area) store.saveDraft(lesson.id, area.value);

    store.markLesson(lesson.id, next);
    buzz(next ? 14 : 8);
    toast(next ? '완료로 표시했습니다.' : '완료를 취소했습니다.', next ? 'good' : 'plain');
    handle.close();
    after();
  };

  const toggle = h(
    'button',
    {
      class: `btn ${kind.action ? 'btn--ghost' : 'btn--primary'} ${kind.action ? '' : 'btn--block'}`,
      type: 'button',
      on: { click: () => mark(!done) },
    },
    done ? '완료 취소' : kind.action ? '완료로 표시' : kind.cta,
  );

  const footer = h(
    'div',
    { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
    kind.action
      ? h(
          'button',
          {
            class: 'btn btn--primary',
            type: 'button',
            on: {
              click: () => {
                handle.close();
                router.go(kind.action as string);
              },
            },
          },
          kind.cta,
          icon('arrow', 17),
        )
      : null,
    toggle,
  );

  const handle = sheet(lesson.title, body, footer);
}

/* ─────────────────────────── 날짜 — the timetable ────────────────── */

function datePanel(router: Router, reload: () => void): HTMLElement {
  const tt = store.get().timetable;
  if (!tt) {
    return h(
      'div',
      { class: 'stack stack--lg' },
      setupCard(reload),
      h(
        'section',
        { class: 'card card--flat' },
        h('span', { class: 'eyebrow', text: '먼저 볼 것' }),
        h('p', {
          class: 'body',
          style: { marginTop: '10px' },
          text: '시간표가 없어도 단계별 과정은 지금 바로 볼 수 있습니다. 무엇을 배우는지 확인한 뒤 날짜를 붙이셔도 됩니다.',
        }),
      ),
    );
  }

  const sessions = schedule();
  const map = byDate(sessions);
  const today = todayISO();
  const doneCount = store.doneCount;

  /* ── 오늘 ─────────────────────────────────────────────────────── */

  const todays = map.get(today) ?? [];
  const upcoming = nextSession(sessions, today);
  const thisWeek = weekStart(today);
  const weekSessions = sessions.filter((s) => weekStart(s.date) === thisWeek);
  const weekDone = weekSessions.filter((s) => store.isDone(s.lesson.id)).length;

  const todayCard = h(
    'section',
    { class: 'card card--solid today rise' },
    h(
      'div',
      { class: 'row row--between' },
      h('span', { class: 'eyebrow', text: '오늘' }),
      h('span', { class: 'mono', text: dayLabel(today) }),
    ),
    h(
      'div',
      { class: 'today__grid' },
      ring(
        doneCount / TOTAL_LESSONS,
        104,
        h(
          'div',
          {},
          h('b', { class: 'num', text: String(doneCount) }),
          h('span', { text: `/ ${TOTAL_LESSONS}회` }),
        ),
      ),
      h(
        'div',
        { class: 'stack', style: { gap: '8px' } },
        todays.length > 0
          ? h('p', { class: 'body', text: `오늘은 ${todays.length}회차, 약 ${todays.reduce((m, s) => m + s.lesson.minutes, 0)}분입니다.` })
          : h('p', {
              class: 'body',
              text: upcoming
                ? `오늘은 쉬는 날입니다. 다음 수업은 ${dayLabel(upcoming.date)}, ${relativeDay(upcoming.date)}.`
                : '예정된 회차를 모두 지났습니다. 시간표를 다시 만들어 한 바퀴 더 돌 수 있습니다.',
            }),
        h('p', { class: 'sm', text: `이번 주 ${weekDone}/${weekSessions.length}회 완료 · 연속 ${store.get().streak.days}일` }),
      ),
    ),
    ...(todays.length > 0
      ? [
          h(
            'div',
            { class: 'stack les__list', style: { gap: '8px', marginTop: '16px' } },
            ...todays.map((s) => lessonRow(router, s.lesson, s.stage, reload, { date: s.date, showStage: true })),
          ),
        ]
      : upcoming
        ? [
            h(
              'div',
              { class: 'stack les__list', style: { gap: '8px', marginTop: '16px' } },
              lessonRow(router, upcoming.lesson, upcoming.stage, reload, {
                date: upcoming.date,
                showStage: true,
              }),
            ),
          ]
        : []),
  );

  /* ── 달력 ─────────────────────────────────────────────────────── */

  // The day in focus: today when it carries work, otherwise the next date
  // that does — unless the visitor has already picked one.
  if (selectedISO === null) selectedISO = map.has(today) ? today : (upcoming?.date ?? today);
  const selected = (): string => selectedISO as string;

  if (cursor === null) {
    const anchor = fromISO(selected());
    cursor = { y: anchor.getFullYear(), m: anchor.getMonth() };
  }
  const at = (): { y: number; m: number } => cursor as { y: number; m: number };

  const title = h('b', { class: 'cal__title' });
  const grid = h('div', { class: 'cal__grid' });
  const dayCard = h('section', { class: 'card' });

  function paintDay(): void {
    const list = map.get(selected()) ?? [];
    const stage = list[0]?.stage ?? null;

    dayCard.replaceChildren(
      h(
        'div',
        { class: 'row row--between' },
        h('div', {}, h('b', { class: 'h3', text: dayLabel(selected()) })),
        h('span', { class: 'chip', text: relativeDay(selected()) }),
      ),
      stage
        ? h('p', { class: 'sm', style: { marginTop: '6px' }, text: `${stage.no}단계 · ${stage.name} — ${stage.aim}` })
        : h('p', {
            class: 'sm',
            style: { marginTop: '6px' },
            text: '수업이 없는 날입니다. 지난 회차를 다시 보거나, 읽던 책을 이어 읽는 날로 씁니다.',
          }),
      h(
        'div',
        { class: 'stack les__list', style: { gap: '8px', marginTop: list.length ? '14px' : '0' } },
        ...list.map((s) =>
          lessonRow(router, s.lesson, s.stage, reload, { date: s.date, showStage: false }),
        ),
      ),
    );
  }

  function paintCal(): void {
    const { y: year, m: month } = at();
    title.textContent = monthLabel(year, month);

    grid.replaceChildren(
      ...monthGrid(year, month).map((iso) => {
        const d = fromISO(iso);
        const out = d.getMonth() !== month;
        const list = map.get(iso) ?? [];
        const allDone = list.length > 0 && list.every((s) => store.isDone(s.lesson.id));

        const classes = [
          'cal__cell',
          out ? 'is-out' : '',
          iso === todayISO() ? 'is-today' : '',
          iso === selected() ? 'is-sel' : '',
          list.length > 0 ? 'has-work' : '',
          allDone ? 'is-done' : '',
          d.getDay() === 0 ? 'is-sun' : '',
          d.getDay() === 6 ? 'is-sat' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return h(
          'button',
          {
            class: classes,
            type: 'button',
            'aria-label': `${dayLabel(iso)}${list.length ? ` · ${list.length}회차` : ' · 수업 없음'}`,
            'aria-pressed': String(iso === selected()),
            on: {
              click: () => {
                selectedISO = iso;
                // Tapping a spill-over day walks to that month, the way
                // every phone calendar does.
                if (out) cursor = { y: d.getFullYear(), m: d.getMonth() };
                buzz(8);
                paintCal();
                paintDay();
              },
            },
          },
          h('span', { class: 'cal__num num', text: String(d.getDate()) }),
          h(
            'span',
            { class: 'cal__dots' },
            ...list
              .slice(0, 3)
              .map((s) =>
                h('i', {
                  class: store.isDone(s.lesson.id) ? 'is-done' : '',
                  style: { background: KINDS[s.lesson.kind].tone } as Partial<CSSStyleDeclaration>,
                }),
              ),
          ),
        );
      }),
    );
  }

  const step = (delta: number): void => {
    const d = new Date(at().y, at().m + delta, 1);
    cursor = { y: d.getFullYear(), m: d.getMonth() };
    buzz(8);
    paintCal();
  };

  const calCard = h(
    'section',
    { class: 'card cal' },
    h(
      'div',
      { class: 'cal__head' },
      h(
        'button',
        { class: 'iconbtn', type: 'button', 'aria-label': '이전 달', on: { click: () => step(-1) } },
        icon('back', 18),
      ),
      title,
      h(
        'button',
        {
          class: 'iconbtn',
          type: 'button',
          'aria-label': '다음 달',
          style: { transform: 'scaleX(-1)' },
          on: { click: () => step(1) },
        },
        icon('back', 18),
      ),
    ),
    h(
      'div',
      { class: 'cal__week mono' },
      ...WEEKDAYS.map((w, i) =>
        h('span', { class: i === 0 ? 'is-sun' : i === 6 ? 'is-sat' : '', text: w }),
      ),
    ),
    grid,
    h(
      'div',
      { class: 'cal__legend' },
      ...(['read', 'drill', 'write', 'redline'] as const).map((k) =>
        h(
          'span',
          {},
          h('i', { style: { background: KINDS[k].tone } as Partial<CSSStyleDeclaration> }),
          KINDS[k].label,
        ),
      ),
      h(
        'button',
        {
          class: 'btn btn--quiet btn--sm',
          type: 'button',
          on: {
            click: () => {
              const now = new Date();
              cursor = { y: now.getFullYear(), m: now.getMonth() };
              selectedISO = todayISO();
              paintCal();
              paintDay();
            },
          },
        },
        '오늘로',
      ),
    ),
  );

  paintCal();
  paintDay();

  /* ── the course line ──────────────────────────────────────────── */

  const last = sessions[sessions.length - 1];

  return h(
    'div',
    { class: 'stack stack--lg' },
    todayCard,
    calCard,
    dayCard,
    h(
      'section',
      { class: 'card card--flat' },
      h(
        'div',
        { class: 'row row--between' },
        h('span', { class: 'eyebrow', text: '전체 진행' }),
        h('span', { class: 'mono', text: `${Math.round((doneCount / TOTAL_LESSONS) * 100)}%` }),
      ),
      h('div', { style: { marginTop: '14px' } }, meter('완료한 회차', doneCount, TOTAL_LESSONS)),
      h('p', {
        class: 'sm',
        style: { marginTop: '12px' },
        text: last
          ? `${dayLabel(sessions[0].date)} 시작 · ${dayLabel(last.date)} 마지막 회차 · 주 ${tt.days.length}회`
          : '요일이 비어 있어 회차가 배치되지 않았습니다.',
      }),
      h(
        'div',
        { class: 'row', style: { gap: '8px', marginTop: '16px', flexWrap: 'wrap' } },
        h(
          'button',
          {
            class: 'btn btn--ghost btn--sm',
            type: 'button',
            on: {
              click: () => {
                const handle = sheet('시간표 다시 만들기', setupCard(() => {
                  handle.close();
                  reload();
                }, true));
              },
            },
          },
          '시간표 바꾸기',
        ),
        h(
          'button',
          { class: 'btn btn--quiet btn--sm', type: 'button', on: { click: () => router.go('/plan') } },
          '4주 플랜 보기',
          icon('arrow', 15),
        ),
      ),
    ),
  );
}

/* ───────────────────────── the setup control ─────────────────────── */

/** Start date + weekdays. Used on the empty state and inside the sheet. */
function setupCard(onDone: () => void, bare = false): HTMLElement {
  const s = store.get();
  let start = s.timetable?.startISO ?? todayISO();
  let days = [...(s.timetable?.days ?? defaultDays(s.plan?.perWeek ?? 2))];

  const preview = h('p', { class: 'sm setup__preview' });
  const save = h('button', { class: 'btn btn--primary btn--block', type: 'button' });

  const dayBtns = WEEKDAYS.map((w, i) =>
    h(
      'button',
      {
        class: 'wk',
        type: 'button',
        'aria-pressed': 'false',
        on: {
          click: () => {
            days = days.includes(i) ? days.filter((d) => d !== i) : [...days, i];
            buzz(10);
            paint();
          },
        },
      },
      w,
    ),
  );

  function paint(): void {
    dayBtns.forEach((b, i) => {
      const on = days.includes(i);
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });

    const sessions = buildSchedule(start, days);
    const ok = sessions.length === TOTAL_LESSONS;

    preview.textContent = ok
      ? `주 ${days.length}회 · 총 ${TOTAL_LESSONS}회차 · ${dayLabel(sessions[0].date)} 시작, ${dayLabel(sessions[sessions.length - 1].date)} 마무리`
      : '요일을 하나 이상 골라 주세요.';

    save.disabled = !ok;
    save.textContent = s.timetable ? '시간표 다시 만들기' : '시간표 만들기';
  }

  const dateInput = h('input', {
    type: 'date',
    value: start,
    'aria-label': '시작일',
    on: {
      change: (e: Event) => {
        const v = (e.target as HTMLInputElement).value;
        // An empty or half-typed date must not wipe the preview.
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) start = v;
        paint();
      },
    },
  });

  save.addEventListener('click', () => {
    store.set({ timetable: { startISO: start, days: [...days].sort(), createdAt: Date.now() } });
    // The dates just moved; where the calendar was looking no longer means
    // anything, so it re-opens on the new course.
    resetCalendar();
    buzz(14);
    toast('시간표를 만들었습니다.', 'good');
    onDone();
  });

  const inner = h(
    'div',
    { class: 'stack', style: { gap: '18px' } },
    h(
      'label',
      { class: 'formfield' },
      h('span', { text: '시작일' }),
      dateInput,
    ),
    h(
      'div',
      { class: 'field' },
      h('span', { class: 'mono', text: '수업 요일' }),
      h('div', { class: 'wk__row' }, ...dayBtns),
    ),
    preview,
    save,
  );

  paint();

  if (bare) return inner;

  return h(
    'section',
    { class: 'card rise' },
    h('span', { class: 'eyebrow', text: '시간표 만들기' }),
    h('h2', { class: 'h3', style: { margin: '12px 0 8px' }, text: '언제부터, 무슨 요일에 할까요?' }),
    h('p', {
      class: 'sm',
      style: { marginBottom: '18px' },
      text: '고른 요일에 24회차가 순서대로 배치됩니다. 나중에 언제든 다시 만들 수 있고, 완료한 회차는 그대로 남습니다.',
    }),
    inner,
  );
}

/* ─────────────────────────── 단계 — the ladder ───────────────────── */

function stagePanel(router: Router, reload: () => void): HTMLElement {
  const sessions = schedule();
  const doneOf = (stage: Stage): number => stage.lessons.filter((l) => store.isDone(l.id)).length;

  const doneCount = store.doneCount;
  const current = STAGES.find((st) => doneOf(st) < st.lessons.length) ?? STAGES[STAGES.length - 1];

  return h(
    'div',
    { class: 'stack stack--lg' },

    h(
      'section',
      { class: 'card card--solid rise' },
      h(
        'div',
        { class: 'row row--between' },
        h('span', { class: 'eyebrow', text: '정규 과정' }),
        h('span', { class: 'mono', text: `${doneCount} / ${TOTAL_LESSONS}회차` }),
      ),
      h(
        'p',
        { class: 'body', style: { marginTop: '14px' } },
        '지금은 ',
        h('b', { text: `${current.no}단계 · ${current.name}` }),
        ' 입니다. ',
        current.aim,
      ),
      h('div', { style: { marginTop: '16px' } }, meter('단계 진행', doneOf(current), current.lessons.length, 'var(--jeomsak)')),
    ),

    h(
      'div',
      { class: 'ladder' },
      ...STAGES.map((stage, i) => {
        const done = doneOf(stage);
        const prev = i === 0 ? null : STAGES[i - 1];
        const open = prev === null || doneOf(prev) >= 3;
        const span = stageSpan(sessions, stage);
        const state = done === stage.lessons.length ? 'done' : open ? 'open' : 'locked';

        return h(
          'article',
          {
            class: `sstage sstage--${state} card rise`,
            style: { '--d': `${i * 55}ms` } as Partial<CSSStyleDeclaration>,
          },
          h(
            'div',
            { class: 'sstage__head' },
            h(
              'span',
              { class: 'sstage__no' },
              h('span', { class: 'mono', text: 'STAGE' }),
              h('b', { class: 'num', text: String(stage.no).padStart(2, '0') }),
            ),
            h(
              'div',
              { class: 'sstage__id' },
              h('h2', { class: 'h3', text: stage.name }),
              h('p', { class: 'sm', text: stage.aim }),
            ),
            h('span', {
              class: 'sstage__count mono',
              text: state === 'locked' ? '잠김' : `${done}/${stage.lessons.length}`,
            }),
          ),
          span
            ? h('p', {
                class: 'sstage__when mono',
                text: `${dayLabel(span[0])} — ${dayLabel(span[1])}`,
              })
            : null,
          h('div', { class: 'sstage__bar' }, h('i', { style: { width: `${(done / stage.lessons.length) * 100}%` } })),
          h(
            'div',
            { class: 'stack les__list', style: { gap: '8px' } },
            ...stage.lessons.map((lesson) => {
              const at = sessions.find((s) => s.lesson.id === lesson.id);
              return lessonRow(router, lesson, stage, reload, {
                date: at?.date,
                locked: !open,
              });
            }),
          ),
          h('p', { class: 'sstage__gate' }, h('span', { class: 'mono', text: '통과 조건' }), stage.gate),
        );
      }),
    ),

    h(
      'section',
      { class: 'card card--flat' },
      h('span', { class: 'eyebrow', text: '단계를 마치면' }),
      h('p', {
        class: 'body',
        style: { margin: '10px 0 18px' },
        text: '6단계를 마치면 처음 진단과 마지막 점검을 나란히 놓고 상담합니다. 무엇이 얼마나 달라졌는지 글로 확인할 수 있습니다.',
      }),
      h(
        'div',
        { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
        h(
          'button',
          { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: () => router.go('/map') } },
          '학습 맵 보기',
        ),
        h(
          'button',
          { class: 'btn btn--quiet btn--sm', type: 'button', on: { click: () => router.go('/apply') } },
          '상담 신청',
          icon('arrow', 15),
        ),
      ),
    ),
  );
}

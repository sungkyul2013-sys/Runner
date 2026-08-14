import { h, icon } from '../core/dom';
import type { Router } from '../core/router';
import { buzz, toast } from '../core/ui';
import { store } from '../core/store';
import { GOALS, GRADES, buildPlan, planMinutes } from '../data/content';
import { defaultDays } from '../data/curriculum';
import { todayISO } from '../core/dates';

/**
 * 학습 플랜 — three inputs, a four-week cycle out.
 *
 * The plan is recomputed on every change rather than behind a "generate"
 * button, so the controls feel like a system you are operating instead of
 * a form you are filling in.
 */
export function planView(router: Router): HTMLElement {
  const saved = store.get().plan;

  let grade: string = saved?.grade ?? GRADES[2];
  let goal: string = saved?.goal ?? GOALS[1];
  let perWeek = saved?.perWeek ?? 2;

  const output = h('div', { class: 'stack', style: { gap: '12px' } });
  const summary = h('div', { class: 'plan__summary' });

  /* ── control group builders ──────────────────────────────────────── */

  function chips(
    label: string,
    values: readonly string[],
    current: () => string,
    set: (v: string) => void,
  ): HTMLElement {
    const row = h('div', { class: 'scroll-x plan__chips' });

    const paint = (): void => {
      for (const el of Array.from(row.children)) {
        el.classList.toggle('chip--on', (el as HTMLElement).dataset.v === current());
        el.setAttribute('aria-pressed', String((el as HTMLElement).dataset.v === current()));
      }
    };

    row.append(
      ...values.map((v) =>
        h(
          'button',
          {
            class: 'chip',
            'data-v': v,
            on: {
              click: () => {
                set(v);
                buzz(10);
                paint();
                render();
              },
            },
          },
          v,
        ),
      ),
    );
    paint();

    return h('div', { class: 'field' }, h('span', { class: 'mono', text: label }), row);
  }

  /* ── the stepper for sessions per week ───────────────────────────── */

  const perWeekOut = h('b', { class: 'num h2' });

  function stepper(): HTMLElement {
    const step = (delta: number): void => {
      const next = Math.min(4, Math.max(1, perWeek + delta));
      if (next === perWeek) return;
      perWeek = next;
      buzz(10);
      render();
    };

    return h(
      'div',
      { class: 'field' },
      h('span', { class: 'mono', text: '주당 횟수' }),
      h(
        'div',
        { class: 'stepper' },
        h(
          'button',
          { class: 'stepper__btn', 'aria-label': '줄이기', on: { click: () => step(-1) } },
          '−',
        ),
        h('div', { class: 'stepper__val' }, perWeekOut, h('span', { class: 'sm', text: '회 / 주' })),
        h(
          'button',
          { class: 'stepper__btn', 'aria-label': '늘리기', on: { click: () => step(1) } },
          '+',
        ),
      ),
    );
  }

  const savePlan = (): void => {
    store.set({
      plan: { grade, goal, perWeek, minutes: planMinutes(grade, perWeek), createdAt: Date.now() },
    });
  };

  /* ── render the generated plan ───────────────────────────────────── */

  function render(): void {
    perWeekOut.textContent = String(perWeek);

    const weeks = buildPlan(goal, perWeek);
    const minutes = planMinutes(grade, perWeek);
    const load = minutes >= 360 ? '높음' : minutes >= 200 ? '보통' : '가벼움';

    summary.replaceChildren(
      h('div', {}, h('b', { class: 'num', text: String(minutes) }), h('span', { text: '분 / 주' })),
      h('div', {}, h('b', { text: load }), h('span', { text: '학습 부담' })),
      h(
        'div',
        {},
        h('b', { class: 'num', text: String(weeks.length * perWeek) }),
        h('span', { text: '회 / 4주' }),
      ),
    );

    output.replaceChildren(
      ...weeks.map((w, i) =>
        h(
          'article',
          {
            class: 'week card card--flat rise',
            style: { '--d': `${i * 60}ms` } as Partial<CSSStyleDeclaration>,
          },
          h('span', { class: 'week__no mono', text: `WEEK ${w.week}` }),
          h(
            'div',
            { class: 'week__grid' },
            h('div', {}, h('span', { class: 'mono', text: '읽기' }), h('p', { text: w.read })),
            h('div', {}, h('span', { class: 'mono', text: '쓰기' }), h('p', { text: w.write })),
            h(
              'div',
              {},
              h('span', { class: 'mono', text: '첨삭' }),
              h('p', { class: 'red', text: w.redline }),
            ),
          ),
        ),
      ),
    );
  }

  const root = h(
    'div',
    { class: 'wrap stack--lg stack' },

    h(
      'header',
      { class: 'stack', style: { gap: '10px' } },
      h('span', { class: 'eyebrow', text: '학습 플랜' }),
      h('h1', { class: 'h1' }, '4주를 ', h('span', { class: 'pen', text: '설계' }), '합니다.'),
      h('p', {
        class: 'body',
        text: '학년과 목표, 주당 횟수를 고르면 읽기·쓰기·첨삭이 자동으로 배치됩니다. 상담 때 이 표를 그대로 들고 오시면 됩니다.',
      }),
    ),

    h(
      'section',
      { class: 'card' },
      h(
        'div',
        { class: 'stack', style: { gap: '20px' } },
        chips(
          '학년',
          GRADES,
          () => grade,
          (v) => (grade = v),
        ),
        chips(
          '목표',
          GOALS,
          () => goal,
          (v) => (goal = v),
        ),
        stepper(),
      ),
    ),

    h('section', { class: 'card card--solid' }, summary),
    output,

    h(
      'div',
      { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
      h(
        'button',
        {
          class: 'btn btn--primary',
          on: {
            click: () => {
              savePlan();
              toast('플랜을 저장했습니다.', 'good');
              buzz(14);
            },
          },
        },
        '이 플랜 저장',
      ),
      h(
        'button',
        {
          class: 'btn btn--ghost',
          on: {
            click: () => {
              // The plan says how often; the timetable says which days and
              // from when. Saving both here means one tap gets a calendar.
              savePlan();
              store.set({
                timetable: {
                  startISO: todayISO(),
                  days: defaultDays(perWeek),
                  createdAt: Date.now(),
                },
              });
              buzz(14);
              toast('오늘부터 시간표를 배치했습니다.', 'good');
              router.go('/study');
            },
          },
        },
        '이 플랜으로 시간표 만들기',
        icon('arrow', 17),
      ),
      h(
        'button',
        { class: 'btn btn--quiet', on: { click: () => router.go('/apply') } },
        '상담 신청',
      ),
    ),
  );

  render();
  return root;
}

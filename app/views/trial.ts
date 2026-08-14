import { h, icon } from '../core/dom';
import type { Router } from '../core/router';
import { buzz, meter, ring, toast } from '../core/ui';
import { store } from '../core/store';
import { withJosa } from '../core/hangul';
import { DOMAINS, DOMAIN_COURSE, DOMAIN_NOTE, type Domain } from '../data/questions';
import { GOALS, GRADES, TEACHER, buildPlan, courseById, planMinutes } from '../data/content';
import { quizView } from './quiz';
import { consultForm } from './apply';

/**
 * 프로그램 체험 — the whole thing in one sitting.
 *
 * The app's screens can each be visited on their own, but that leaves the
 * visitor to assemble the story. This runs the real sequence the academy
 * runs — 진단 → 분석 → 설계 → 상담 — as one flow, each step handing its
 * result to the next, and ends on the consultation with everything already
 * filled in.
 *
 * State lives at module scope so a mid-flow detour (a tab, a back button)
 * returns to the same step instead of starting over.
 */

type Step = 0 | 1 | 2 | 3 | 4;

const STEPS: { key: Step; label: string; note: string }[] = [
  { key: 0, label: '시작', note: '학년 확인' },
  { key: 1, label: '진단', note: '12문항' },
  { key: 2, label: '분석', note: '영역별' },
  { key: 3, label: '설계', note: '4주 플랜' },
  { key: 4, label: '상담', note: '신청' },
];

interface Flow {
  step: Step;
  grade: string;
  goal: string;
  perWeek: number;
  done: boolean;
}

let flow: Flow | null = null;

export function resetTrial(): void {
  flow = null;
}

const fresh = (): Flow => ({ step: 0, grade: GRADES[2], goal: GOALS[1], perWeek: 2, done: false });

/** The weakest domain from the most recent run, which drives everything after. */
function weakest(): Domain {
  const run = store.lastRun;
  if (!run) return DOMAINS[0];

  return DOMAINS.map((d) => ({
    d,
    r: run.byDomain[d] ? run.byDomain[d].correct / Math.max(1, run.byDomain[d].total) : 1,
  })).sort((a, b) => a.r - b.r)[0].d;
}

/** Goal implied by the grade, so the plan step needs no extra question. */
function goalFor(grade: string): string {
  if (grade.startsWith('초')) return GOALS[0];
  if (grade.startsWith('중')) return GOALS[1];
  if (grade === '고3 · N수') return GOALS[3];
  return GOALS[2];
}

export function trialView(router: Router): HTMLElement {
  if (!flow || flow.done) flow = fresh();
  const state = flow;

  const root = h('div', { class: 'trial' });
  const body = h('div', { class: 'trial__body' });

  /* ── progress header ─────────────────────────────────────────────── */

  const marks = STEPS.map((s) =>
    h(
      'div',
      { class: 'tstep' },
      h('i', { class: 'tstep__bar' }),
      h('span', { class: 'tstep__label', text: s.label }),
    ),
  );

  const head = h(
    'header',
    { class: 'trial__head' },
    h(
      'div',
      { class: 'wrap row row--between' },
      h('span', { class: 'eyebrow', text: '프로그램 체험' }),
      h('span', { class: 'mono', id: 'trialStep' }),
    ),
    h('div', { class: 'wrap trial__marks' }, ...marks),
  );

  function paintHead(): void {
    marks.forEach((m, i) => {
      m.classList.toggle('is-done', i < state.step);
      m.classList.toggle('is-now', i === state.step);
    });
    const el = head.querySelector('#trialStep');
    if (el) el.textContent = `${state.step + 1} / ${STEPS.length} · ${STEPS[state.step].note}`;
  }

  function go(step: Step): void {
    state.step = step;
    paintHead();
    render();
    // Each step is a screen of its own; start it at the top.
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }

  /* ── 0 · 시작 ─────────────────────────────────────────────────────── */

  function stepStart(): HTMLElement {
    const chips = h('div', { class: 'scroll-x plan__chips' });

    const paint = (): void => {
      for (const el of Array.from(chips.children)) {
        el.classList.toggle('chip--on', (el as HTMLElement).dataset.v === state.grade);
      }
    };

    chips.append(
      ...GRADES.map((g) =>
        h(
          'button',
          {
            class: 'chip',
            'data-v': g,
            type: 'button',
            on: {
              click: () => {
                state.grade = g;
                state.goal = goalFor(g);
                buzz(10);
                paint();
              },
            },
          },
          g,
        ),
      ),
    );
    paint();

    return h(
      'div',
      { class: 'wrap stack--lg stack rise' },
      h(
        'header',
        { class: 'stack', style: { gap: '12px' } },
        h('h1', { class: 'h1' }, '한 번에 ', h('span', { class: 'pen', text: '끝까지' }), ' 돌려봅니다.'),
        h('p', {
          class: 'body',
          text: '학원이 실제로 하는 순서 그대로입니다. 진단 12문항을 풀면 영역별 분석이 나오고, 그 결과로 4주 플랜이 만들어지고, 마지막에 상담 신청까지 이어집니다. 약 8분.',
        }),
      ),
      h(
        'section',
        { class: 'card' },
        h('span', { class: 'mono', text: '학년' }),
        h('p', { class: 'sm', style: { margin: '6px 0 12px' }, text: '이 선택이 플랜과 상담 메모에 그대로 들어갑니다.' }),
        chips,
      ),
      h(
        'section',
        { class: 'card card--solid' },
        h('span', { class: 'eyebrow', text: '진행 순서' }),
        h(
          'ol',
          { class: 'timeline', style: { marginTop: '16px' } },
          ...STEPS.slice(1).map((s) =>
            h(
              'li',
              {},
              h('span', { class: 'timeline__at mono', text: s.label }),
              h('p', { text: s.note }),
            ),
          ),
        ),
      ),
      h(
        'button',
        {
          class: 'btn btn--primary btn--block btn--lg',
          type: 'button',
          on: {
            click: () => {
              buzz(14);
              go(1);
            },
          },
        },
        '진단 시작',
        icon('arrow', 18),
      ),
    );
  }

  /* ── 1 · 진단 ─────────────────────────────────────────────────────── */

  function stepQuiz(): HTMLElement {
    // The quiz engine, embedded: it saves the run and hands control back.
    return quizView(router, () => {
      buzz([16, 40, 16]);
      go(2);
    });
  }

  /* ── 2 · 분석 ─────────────────────────────────────────────────────── */

  function stepAnalysis(): HTMLElement {
    const run = store.lastRun;
    if (!run) return stepStart();

    const pct = run.score / run.total;
    const weak = weakest();
    const course = courseById(DOMAIN_COURSE[weak]);
    const strong = DOMAINS.map((d) => ({
      d,
      r: run.byDomain[d] ? run.byDomain[d].correct / Math.max(1, run.byDomain[d].total) : 0,
    })).sort((a, b) => b.r - a.r)[0].d;

    return h(
      'div',
      { class: 'wrap stack--lg stack rise' },
      h(
        'section',
        { class: 'scorecard card ruled' },
        h('span', { class: 'eyebrow', text: '분석' }),
        ring(
          pct,
          148,
          h('div', {}, h('b', { class: 'num', text: String(Math.round(pct * 100)) }), h('span', { text: '점' })),
        ),
        h('h1', {
          class: 'h2',
          text: `${withJosa(strong, '은', '는')} 강점, ${withJosa(weak, '이', '가')} 과제입니다.`,
        }),
        h('p', {
          class: 'body',
          text: `${run.total}문항 중 ${run.score}문항 정답 · ${Math.floor(run.seconds / 60)}분 ${run.seconds % 60}초`,
        }),
      ),

      h(
        'section',
        { class: 'card' },
        h('h2', { class: 'h3', text: '영역별' }),
        h(
          'div',
          { class: 'stack', style: { marginTop: '16px', gap: '18px' } },
          ...DOMAINS.map((d) => {
            const sc = run.byDomain[d] ?? { correct: 0, total: 0 };
            const r = sc.correct / Math.max(1, sc.total);
            const tone = r >= 0.7 ? 'var(--ok)' : r >= 0.4 ? 'var(--cheong)' : 'var(--jeomsak)';
            return h(
              'div',
              {},
              meter(d, sc.correct, sc.total, tone),
              h('p', { class: 'sm', style: { marginTop: '4px' }, text: DOMAIN_NOTE[d] }),
            );
          }),
        ),
      ),

      course
        ? h(
            'section',
            { class: 'card card--solid' },
            h('span', { class: 'eyebrow', text: `${TEACHER.name} ${TEACHER.role}의 판단` }),
            h('p', {
              class: 'body',
              style: { marginTop: '10px' },
              text: `${weak} 영역을 먼저 세우는 편이 빠릅니다. ${course.name} 단계에서 시작하시길 권합니다.`,
            }),
          )
        : null,

      h(
        'button',
        {
          class: 'btn btn--primary btn--block btn--lg',
          type: 'button',
          on: {
            click: () => {
              buzz(12);
              go(3);
            },
          },
        },
        '이 결과로 플랜 만들기',
        icon('arrow', 18),
      ),
    );
  }

  /* ── 3 · 설계 ─────────────────────────────────────────────────────── */

  function stepPlan(): HTMLElement {
    const weeks = h('div', { class: 'stack', style: { gap: '12px' } });
    const summary = h('div', { class: 'plan__summary' });
    const perWeekOut = h('b', { class: 'num h2' });

    const draw = (): void => {
      perWeekOut.textContent = String(state.perWeek);
      const list = buildPlan(state.grade, state.goal, state.perWeek);
      const minutes = planMinutes(state.grade, state.perWeek);

      summary.replaceChildren(
        h('div', {}, h('b', { class: 'num', text: String(minutes) }), h('span', { text: '분 / 주' })),
        h('div', {}, h('b', { text: state.goal }), h('span', { text: '목표' })),
        h('div', {}, h('b', { text: state.grade }), h('span', { text: '학년' })),
      );

      weeks.replaceChildren(
        ...list.map((w, i) =>
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
    };

    const step = (delta: number): void => {
      const next = Math.min(4, Math.max(1, state.perWeek + delta));
      if (next === state.perWeek) return;
      state.perWeek = next;
      buzz(10);
      draw();
    };

    draw();

    return h(
      'div',
      { class: 'wrap stack--lg stack rise' },
      h(
        'header',
        { class: 'stack', style: { gap: '10px' } },
        h('h1', { class: 'h1' }, '진단 결과로 짠 ', h('span', { class: 'pen', text: '4주' }), '.'),
        h('p', {
          class: 'body',
          text: `${weakest()} 영역을 매주 건드리도록 배치했습니다. 주당 횟수만 바꿔 보세요.`,
        }),
      ),
      h(
        'section',
        { class: 'card' },
        h('span', { class: 'mono', text: '주당 횟수' }),
        h(
          'div',
          { class: 'stepper', style: { marginTop: '10px' } },
          h('button', { class: 'stepper__btn', type: 'button', 'aria-label': '줄이기', on: { click: () => step(-1) } }, '−'),
          h('div', { class: 'stepper__val' }, perWeekOut, h('span', { class: 'sm', text: '회 / 주' })),
          h('button', { class: 'stepper__btn', type: 'button', 'aria-label': '늘리기', on: { click: () => step(1) } }, '+'),
        ),
      ),
      h('section', { class: 'card card--solid' }, summary),
      weeks,
      h(
        'button',
        {
          class: 'btn btn--primary btn--block btn--lg',
          type: 'button',
          on: {
            click: () => {
              store.set({
                plan: {
                  grade: state.grade,
                  goal: state.goal,
                  perWeek: state.perWeek,
                  minutes: planMinutes(state.grade, state.perWeek),
                  createdAt: Date.now(),
                },
              });
              buzz(14);
              toast('플랜을 저장했습니다.', 'good');
              go(4);
            },
          },
        },
        '이 플랜으로 상담 신청',
        icon('arrow', 18),
      ),
    );
  }

  /* ── 4 · 상담 ─────────────────────────────────────────────────────── */

  function stepConsult(): HTMLElement {
    const done = h('div', {});

    const form = consultForm(() => {
      state.done = true;
      done.replaceChildren(
        h(
          'section',
          { class: 'card card--solid rise' },
          h('span', { class: 'eyebrow', text: '접수 완료' }),
          h('h2', { class: 'h2', style: { marginTop: '10px' }, text: '체험이 끝났습니다.' }),
          h('p', {
            class: 'body',
            text: `진단 결과와 4주 플랜을 함께 보내드렸습니다. ${TEACHER.name} ${TEACHER.role}이 직접 확인하고 영업일 기준 1일 이내에 연락드립니다.`,
          }),
          h(
            'div',
            { class: 'row', style: { gap: '8px', marginTop: '18px', flexWrap: 'wrap' } },
            h(
              'button',
              { class: 'btn btn--ghost', type: 'button', on: { click: () => router.go('/lab') } },
              '첨삭 랩도 해보기',
            ),
            h(
              'button',
              { class: 'btn btn--quiet', type: 'button', on: { click: () => router.go('/') } },
              '홈으로',
            ),
          ),
        ),
      );
      done.scrollIntoView({ block: 'center' });
    });

    return h(
      'div',
      { class: 'wrap stack--lg stack rise' },
      h(
        'header',
        { class: 'stack', style: { gap: '10px' } },
        h('h1', { class: 'h1' }, '마지막으로, ', h('span', { class: 'pen', text: '상담' }), '.'),
        h('p', {
          class: 'body',
          text: '앞에서 나온 진단 점수와 플랜이 메모에 이미 들어가 있습니다. 이름과 연락처만 남겨 주세요.',
        }),
      ),
      done,
      form,
      h('p', {
        class: 'sm',
        style: { textAlign: 'center' },
        text: '연락처·수치는 예시 데이터이며, 입력값은 전송되지 않습니다.',
      }),
    );
  }

  /* ── render ───────────────────────────────────────────────────────── */

  function render(): void {
    const views: Record<Step, () => HTMLElement> = {
      0: stepStart,
      1: stepQuiz,
      2: stepAnalysis,
      3: stepPlan,
      4: stepConsult,
    };
    body.replaceChildren(views[state.step]());
  }

  root.append(head, body);
  paintHead();
  render();
  return root;
}

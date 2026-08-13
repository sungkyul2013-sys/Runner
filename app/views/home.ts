import { h, icon } from '../core/dom';
import type { Router } from '../core/router';
import { buzz, meter } from '../core/ui';
import { store } from '../core/store';
import { QUESTIONS, type ChoiceQ } from '../data/questions';
import { COURSES } from '../data/content';

/** Picks a stable "question of the day" so it changes daily, not per reload. */
function todayQuestion(): ChoiceQ {
  const choices = QUESTIONS.filter((q): q is ChoiceQ => q.type === 'choice');
  const day = Math.floor(Date.now() / 86400000);
  return choices[day % choices.length];
}

/** A single playable question, right on the home screen. */
function dailyCard(router: Router): HTMLElement {
  const q = todayQuestion();
  let done = false;

  const options = h('div', { class: 'stack', style: { gap: '8px' } });
  const foot = h('div', { class: 'daily__foot' });

  const rows = q.options.map((opt, i) =>
    h(
      'button',
      {
        class: 'opt opt--sm',
        on: {
          click: () => {
            if (done) return;
            done = true;

            const ok = i === q.answer;
            buzz(ok ? 14 : [24, 55, 24]);
            rows.forEach((r, j) => {
              if (j === q.answer) r.classList.add('is-right');
              else if (j === i) r.classList.add('is-wrong');
            });

            foot.replaceChildren(
              h(
                'div',
                { class: `feedback is-shown ${ok ? 'is-ok' : 'is-no'}` },
                h(
                  'div',
                  { class: 'feedback__head' },
                  icon(ok ? 'check' : 'close', 17),
                  h('b', { text: ok ? '맞았습니다' : '아깝습니다' }),
                ),
                h('p', { text: q.explain }),
              ),
              h(
                'button',
                {
                  class: 'btn btn--primary btn--block',
                  on: { click: () => router.go('/quiz') },
                },
                '12문항 진단 시작',
                icon('arrow', 17),
              ),
            );
          },
        },
      },
      h('span', { class: 'opt__key mono', text: String(i + 1) }),
      h('span', { text: opt }),
    ),
  );
  options.append(...rows);

  foot.append(
    h('p', { class: 'sm', text: '한 문제만 풀어 보고 결정하셔도 됩니다.' }),
  );

  return h(
    'section',
    { class: 'card ruled rise', style: { '--d': '120ms' } as Partial<CSSStyleDeclaration> },
    h(
      'div',
      { class: 'row row--between' },
      h('span', { class: 'eyebrow', text: '오늘의 문제' }),
      h('span', { class: 'chip', text: q.domain }),
    ),
    h('h2', { class: 'h3', style: { margin: '14px 0 16px', whiteSpace: 'pre-line' }, text: q.prompt }),
    options,
    foot,
  );
}

/** Shown only once there is history to show. */
function progressCard(router: Router): HTMLElement | null {
  const run = store.lastRun;
  const { streak, plan, labBest } = store.get();
  if (!run && !plan && labBest === 0) return null;

  return h(
    'section',
    { class: 'card card--solid rise', style: { '--d': '60ms' } as Partial<CSSStyleDeclaration> },
    h(
      'div',
      { class: 'row row--between' },
      h('span', { class: 'eyebrow', text: '내 기록' }),
      streak.days > 1 ? h('span', { class: 'chip chip--on', text: `${streak.days}일 연속` }) : null,
    ),
    h(
      'div',
      { class: 'grid grid--2', style: { marginTop: '16px' } },
      run
        ? h(
            'button',
            { class: 'stat stat--tap', on: { click: () => router.go('/result') } },
            h('b', { class: 'num', text: String(Math.round((run.score / run.total) * 100)) }),
            h('span', { text: '최근 진단 점수' }),
          )
        : null,
      labBest > 0
        ? h(
            'button',
            { class: 'stat stat--tap', on: { click: () => router.go('/lab') } },
            h('b', { class: 'num', text: String(labBest) }),
            h('span', { text: '첨삭 랩 최고점' }),
          )
        : null,
      plan
        ? h(
            'button',
            { class: 'stat stat--tap', on: { click: () => router.go('/plan') } },
            h('b', { class: 'num', text: String(plan.perWeek) }),
            h('span', { text: `주당 · ${plan.goal}` }),
          )
        : null,
    ),
    run
      ? h(
          'div',
          { style: { marginTop: '18px' } },
          meter('전체 정답률', run.score, run.total, 'var(--cheong)'),
        )
      : null,
  );
}

export function homeView(router: Router): HTMLElement {
  const tiles: [string, string, string, string][] = [
    ['quiz', '/quiz', '진단 테스트', '12문항 · 약 8분'],
    ['lab', '/lab', '첨삭 랩', '직접 고쳐 보기'],
    ['plan', '/plan', '학습 플랜', '4주 자동 설계'],
    ['book', '/courses', '과정', '4단계'],
  ];

  return h(
    'div',
    { class: 'wrap stack--lg stack home' },

    h(
      'header',
      { class: 'hero rise' },
      h('span', { class: 'eyebrow', text: 'since 2009 · 소수정예' }),
      h(
        'h1',
        { class: 'display' },
        '생각을 쓰다,',
        h('br'),
        '세상을 ',
        h('span', { class: 'pen', text: '읽다' }),
        '.',
      ),
      h('p', {
        class: 'body',
        text: '읽기에서 시작해 사유로 이어지고, 마침내 자기 문장으로 완성되는 국어. 먼저 한 문제 풀어 보세요.',
      }),
      h(
        'div',
        { class: 'row', style: { gap: '8px', flexWrap: 'wrap', marginTop: '6px' } },
        h(
          'button',
          { class: 'btn btn--primary', on: { click: () => router.go('/quiz') } },
          '무료 진단 시작',
          icon('arrow', 17),
        ),
        h(
          'button',
          { class: 'btn btn--ghost', on: { click: () => router.go('/apply') } },
          '상담 신청',
        ),
      ),
    ),

    progressCard(router),

    h(
      'nav',
      { class: 'tiles', 'aria-label': '주요 기능' },
      ...tiles.map(([ic, path, title, note], i) =>
        h(
          'button',
          {
            class: 'tile card card--tap rise',
            style: { '--d': `${80 + i * 50}ms` } as Partial<CSSStyleDeclaration>,
            on: {
              click: () => {
                buzz(10);
                router.go(path);
              },
            },
          },
          h('span', { class: 'tile__icon' }, icon(ic, 20)),
          h('b', { text: title }),
          h('span', { class: 'sm', text: note }),
        ),
      ),
    ),

    dailyCard(router),

    h(
      'section',
      { class: 'stack', style: { gap: '12px' } },
      h(
        'div',
        { class: 'row row--between' },
        h('h2', { class: 'h2', text: '과정' }),
        h(
          'button',
          { class: 'btn btn--quiet btn--sm', on: { click: () => router.go('/courses') } },
          '전체 보기',
          icon('arrow', 15),
        ),
      ),
      h(
        'div',
        { class: 'scroll-x' },
        ...COURSES.map((c) =>
          h(
            'button',
            {
              class: 'minicard card card--tap',
              on: { click: () => router.go(`/course/${c.id}`) },
            },
            h('span', { class: 'mono', text: c.who }),
            h('b', { text: c.name }),
            h('span', { class: 'sm', text: c.hours }),
          ),
        ),
      ),
    ),

    h(
      'section',
      { class: 'card ruled' },
      h('span', { class: 'eyebrow', text: '수업 원칙' }),
      h(
        'ul',
        { class: 'ticks', style: { marginTop: '14px' } },
        h('li', { text: '발췌문이 아니라 한 권을 끝까지 읽습니다.' }),
        h('li', { text: '“잘 썼어요”로 끝내지 않고 문장마다 이유를 답니다.' }),
        h('li', { text: '어휘·문장·논리·분량을 매달 기록해 커리큘럼을 조정합니다.' }),
      ),
      h(
        'button',
        {
          class: 'btn btn--ghost btn--block',
          style: { marginTop: '18px' },
          on: { click: () => router.go('/lab') },
        },
        '첨삭이 어떻게 이뤄지는지 직접 해보기',
      ),
    ),

    h('p', {
      class: 'sm',
      style: { textAlign: 'center' },
      text: '본 페이지의 연락처·수치·인물은 예시 데이터입니다.',
    }),
  );
}

import { h, icon } from '../core/dom';
import type { Router } from '../core/router';
import { COURSES, courseById } from '../data/content';

/** 과정 목록 — one card per step, tappable through to the detail view. */
export function coursesView(router: Router): HTMLElement {
  return h(
    'div',
    { class: 'wrap stack--lg stack' },

    h(
      'header',
      { class: 'stack', style: { gap: '10px' } },
      h('span', { class: 'eyebrow', text: '과정' }),
      h('h1', { class: 'h1' }, '학년이 아니라 ', h('span', { class: 'pen', text: '단계' }), '로.'),
      h('p', {
        class: 'body',
        text: '같은 학년이어도 시작점은 다릅니다. 진단 결과에 따라 들어가는 단계가 달라집니다.',
      }),
    ),

    h(
      'div',
      { class: 'grid' },
      ...COURSES.map((c, i) =>
        h(
          'button',
          {
            class: 'coursecard card card--tap rise',
            style: { '--d': `${i * 70}ms` } as Partial<CSSStyleDeclaration>,
            on: { click: () => router.go(`/course/${c.id}`) },
          },
          h(
            'div',
            { class: 'row row--between' },
            h('span', { class: 'mono', text: `${c.step} · ${c.who}` }),
            h('span', { class: 'coursecard__arrow' }, icon('arrow', 18)),
          ),
          h('h2', { class: 'h2', text: c.name }),
          h('p', { class: 'body', text: c.summary }),
          h(
            'div',
            { class: 'row', style: { gap: '6px', flexWrap: 'wrap', marginTop: 'auto' } },
            h('span', { class: 'chip', text: c.hours }),
            h('span', { class: 'chip', text: `정원 ${c.cap}명` }),
          ),
        ),
      ),
    ),
  );
}

/** 과정 상세 — a nested view with a back arrow in the top bar. */
export function courseView(router: Router, id: string): HTMLElement {
  const c = courseById(id);

  if (!c) {
    return h(
      'div',
      { class: 'wrap stack' },
      h('h1', { class: 'h1', text: '없는 과정입니다.' }),
      h(
        'button',
        { class: 'btn btn--primary', on: { click: () => router.go('/courses') } },
        '과정 목록으로',
      ),
    );
  }

  return h(
    'div',
    { class: 'wrap stack--lg stack' },

    h(
      'header',
      { class: 'stack ruled', style: { gap: '10px' } },
      h('span', { class: 'mono', text: `${c.step} · ${c.who}` }),
      h('h1', { class: 'display', text: c.name }),
      h('p', { class: 'body', text: c.summary }),
      h(
        'div',
        { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } },
        h('span', { class: 'chip chip--on', text: c.hours }),
        h('span', { class: 'chip', text: `정원 ${c.cap}명` }),
      ),
    ),

    h(
      'section',
      { class: 'card' },
      h('h2', { class: 'h3', text: '이 과정이 다루는 것' }),
      h(
        'ul',
        { class: 'ticks' },
        ...c.points.map((p) => h('li', { text: p })),
      ),
    ),

    h(
      'section',
      { class: 'card card--solid' },
      h('h2', { class: 'h3', text: '수업 한 시간' }),
      h('p', { class: 'sm', text: '실제 진행 순서입니다.' }),
      h(
        'ol',
        { class: 'timeline' },
        ...c.week.map((w) =>
          h(
            'li',
            {},
            h('span', { class: 'timeline__at mono', text: w.label }),
            h('p', { text: w.detail }),
          ),
        ),
      ),
    ),

    h(
      'div',
      { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
      h(
        'button',
        { class: 'btn btn--primary', on: { click: () => router.go('/apply') } },
        '이 과정 상담하기',
        icon('arrow', 17),
      ),
      h(
        'button',
        { class: 'btn btn--ghost', on: { click: () => router.go('/quiz') } },
        '먼저 진단해 보기',
      ),
    ),
  );
}

import { h, icon } from '../core/dom';
import type { Router } from '../core/router';
import { meter, ring, toast } from '../core/ui';
import { store } from '../core/store';
import { DOMAINS, DOMAIN_COURSE, DOMAIN_NOTE, type Domain } from '../data/questions';
import { courseById } from '../data/content';
import { resetQuiz } from './quiz';

/** A bar chart of past attempts — enough to see a trend, no library. */
function history(): HTMLElement | null {
  const runs = store.get().runs;
  if (runs.length < 2) return null;

  const recent = runs.slice(-8);
  return h(
    'section',
    { class: 'card rise', style: { '--d': '160ms' } as Partial<CSSStyleDeclaration> },
    h('h2', { class: 'h3', text: '지난 기록' }),
    h('p', { class: 'sm', text: `${recent.length}회 · 최근이 오른쪽입니다.` }),
    h(
      'div',
      { class: 'spark' },
      ...recent.map((r, i) => {
        const pct = Math.round((r.score / r.total) * 100);
        const bar = h('i', { style: { height: '4%' } });
        requestAnimationFrame(() =>
          window.setTimeout(() => (bar.style.height = `${Math.max(6, pct)}%`), i * 70),
        );
        return h(
          'div',
          { class: 'spark__col', title: `${pct}점` },
          bar,
          h('span', { class: 'mono', text: String(pct) }),
        );
      }),
    ),
  );
}

export function resultView(router: Router): HTMLElement {
  const run = store.lastRun;

  if (!run) {
    return h(
      'div',
      { class: 'wrap stack' },
      h('h1', { class: 'h1', text: '아직 진단 기록이 없습니다.' }),
      h('p', { class: 'body', text: '12문항, 약 8분이면 지금 위치를 확인할 수 있습니다.' }),
      h(
        'button',
        { class: 'btn btn--primary', on: { click: () => router.go('/quiz') } },
        '진단 시작하기',
      ),
    );
  }

  const pct = run.score / run.total;
  const percent = Math.round(pct * 100);

  // The weakest domain drives the recommendation.
  const ranked = DOMAINS.map((d) => ({
    domain: d,
    ratio: run.byDomain[d] ? run.byDomain[d].correct / Math.max(1, run.byDomain[d].total) : 0,
  })).sort((a, b) => a.ratio - b.ratio);

  const weakest = ranked[0].domain as Domain;
  const strongest = ranked[ranked.length - 1].domain as Domain;
  const course = courseById(DOMAIN_COURSE[weakest]);

  const grade =
    percent >= 85 ? '아주 좋음' : percent >= 65 ? '안정권' : percent >= 45 ? '보완 필요' : '기초부터';

  return h(
    'div',
    { class: 'wrap stack--lg stack' },

    h(
      'section',
      { class: 'scorecard card ruled rise' },
      h('span', { class: 'eyebrow', text: '진단 결과' }),
      ring(
        pct,
        150,
        h(
          'div',
          {},
          h('b', { class: 'num', text: String(percent) }),
          h('span', { text: '점' }),
        ),
      ),
      h('h1', { class: 'h2', text: grade }),
      h('p', {
        class: 'body',
        text: `${run.total}문항 중 ${run.score}문항 정답 · ${Math.floor(run.seconds / 60)}분 ${run.seconds % 60}초 소요`,
      }),
      h(
        'div',
        { class: 'row', style: { gap: '8px', flexWrap: 'wrap', justifyContent: 'center' } },
        h('span', { class: 'chip', text: `강점 ${strongest}` }),
        h('span', { class: 'chip chip--on', text: `보완 ${weakest}` }),
        store.get().streak.days > 1
          ? h('span', { class: 'chip', text: `${store.get().streak.days}일 연속` })
          : null,
      ),
    ),

    h(
      'section',
      { class: 'card rise', style: { '--d': '80ms' } as Partial<CSSStyleDeclaration> },
      h('h2', { class: 'h3', text: '영역별' }),
      h(
        'div',
        { class: 'stack', style: { marginTop: '16px', gap: '18px' } },
        ...DOMAINS.map((d) => {
          const s = run.byDomain[d] ?? { correct: 0, total: 0 };
          const tone =
            s.correct / Math.max(1, s.total) >= 0.7
              ? 'var(--ok)'
              : s.correct / Math.max(1, s.total) >= 0.4
                ? 'var(--cheong)'
                : 'var(--jeomsak)';
          return h(
            'div',
            {},
            meter(d, s.correct, s.total, tone),
            h('p', { class: 'sm', style: { marginTop: '4px' }, text: DOMAIN_NOTE[d] }),
          );
        }),
      ),
    ),

    course
      ? h(
          'section',
          { class: 'card card--solid rise', style: { '--d': '120ms' } as Partial<CSSStyleDeclaration> },
          h('span', { class: 'eyebrow', text: '추천 과정' }),
          h('h2', { class: 'h2', style: { marginTop: '10px' }, text: course.name }),
          h('p', {
            class: 'body',
            text: `${weakest} 영역을 먼저 세우는 것이 빠릅니다. ${course.summary}`,
          }),
          h(
            'div',
            { class: 'row', style: { gap: '8px', marginTop: '18px', flexWrap: 'wrap' } },
            h(
              'button',
              {
                class: 'btn btn--primary',
                on: { click: () => router.go(`/course/${course.id}`) },
              },
              '과정 보기',
              icon('arrow', 17),
            ),
            h(
              'button',
              { class: 'btn btn--ghost', on: { click: () => router.go('/plan') } },
              '학습 플랜 만들기',
            ),
          ),
        )
      : null,

    history(),

    h(
      'div',
      { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
      h(
        'button',
        {
          class: 'btn btn--ghost',
          on: {
            click: () => {
              resetQuiz();
              router.go('/quiz');
            },
          },
        },
        icon('reset', 17),
        '다시 풀기',
      ),
      h(
        'button',
        {
          class: 'btn btn--quiet',
          on: {
            click: async () => {
              const text = `수 국어논술 진단 결과 — ${percent}점 (보완: ${weakest})`;
              try {
                if (navigator.share) await navigator.share({ title: '진단 결과', text });
                else {
                  await navigator.clipboard.writeText(text);
                  toast('결과를 복사했습니다.', 'good');
                }
              } catch {
                // Share sheet dismissed, or clipboard blocked — nothing to report.
              }
            },
          },
        },
        '결과 공유',
      ),
    ),
  );
}

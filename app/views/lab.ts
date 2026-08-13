import { h, icon } from '../core/dom';
import type { Router } from '../core/router';
import { buzz, sheet, toast } from '../core/ui';
import { store } from '../core/store';
import { LAB_PARAGRAPH, LAB_REASONS, LAB_REWRITE, LAB_TARGETS } from '../data/content';

/**
 * 첨삭 랩 — the student marks up someone else's paragraph.
 *
 * Tap a sentence, pick why it fails, and the app scores the markup against
 * the teacher's. It is the one place on the site where you do the school's
 * job instead of reading about it, so the grading is honest: marking a
 * clean sentence costs you, and picking the wrong reason only earns half.
 */

interface Mark {
  index: number;
  reason: string;
}

export function labView(router: Router): HTMLElement {
  const marks = new Map<number, Mark>();
  let checked = false;

  const root = h('div', { class: 'wrap stack--lg stack' });

  const paragraph = h('div', { class: 'lab__para card ruled' });
  const tally = h('p', { class: 'sm' });
  const actions = h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } });

  const updateTally = (): void => {
    tally.textContent = checked
      ? ''
      : `${marks.size}곳 표시함 · 선생님은 ${LAB_TARGETS.length}곳을 잡았습니다.`;
  };

  /* ── the paragraph, one tappable sentence per row ─────────────────── */

  function drawParagraph(): void {
    paragraph.replaceChildren(
      ...LAB_PARAGRAPH.map((text, i) => {
        const mark = marks.get(i);
        const target = LAB_TARGETS.find((t) => t.index === i);

        const el = h(
          'button',
          {
            class: [
              'lab__sent',
              mark ? 'is-marked' : '',
              checked && target && mark ? 'is-hit' : '',
              checked && target && !mark ? 'is-missed' : '',
              checked && !target && mark ? 'is-false' : '',
            ]
              .filter(Boolean)
              .join(' '),
            'aria-pressed': mark ? 'true' : 'false',
            on: { click: () => (checked ? explain(i) : pick(i)) },
          },
          h('span', { class: 'lab__no mono', text: String(i + 1) }),
          h('span', { class: 'lab__text', text }),
        );

        if (mark) {
          el.append(h('span', { class: 'lab__reason', text: mark.reason }));
        }
        if (checked && target && !mark) {
          el.append(h('span', { class: 'lab__reason lab__reason--miss', text: '놓친 곳' }));
        }
        return el;
      }),
    );
    updateTally();
  }

  /* ── choosing a reason, in a sheet ───────────────────────────────── */

  function pick(index: number): void {
    buzz(10);
    const existing = marks.get(index);

    const list = h(
      'div',
      { class: 'stack', style: { gap: '8px' } },
      ...LAB_REASONS.map((reason) =>
        h(
          'button',
          {
            class: `opt ${existing?.reason === reason ? 'is-on' : ''}`,
            on: {
              click: () => {
                if (reason === LAB_REASONS[LAB_REASONS.length - 1]) marks.delete(index);
                else marks.set(index, { index, reason });
                buzz(12);
                handle.close();
                drawParagraph();
              },
            },
          },
          h('span', { text: reason }),
        ),
      ),
    );

    const handle = sheet(
      `${index + 1}번 문장`,
      h(
        'div',
        { class: 'stack', style: { gap: '14px' } },
        h('p', { class: 'lab__quote', text: LAB_PARAGRAPH[index] }),
        h('p', { class: 'sm', text: '이 문장의 문제는 무엇인가요?' }),
        list,
      ),
    );
  }

  function explain(index: number): void {
    const target = LAB_TARGETS.find((t) => t.index === index);
    sheet(
      `${index + 1}번 문장`,
      h(
        'div',
        { class: 'stack', style: { gap: '12px' } },
        h('p', { class: 'lab__quote', text: LAB_PARAGRAPH[index] }),
        target
          ? h(
              'div',
              { class: 'stack', style: { gap: '6px' } },
              h('span', { class: 'eyebrow', text: target.reason }),
              h('p', { class: 'body', text: target.note }),
            )
          : h('p', { class: 'body', text: '이 문장은 손댈 곳이 없습니다. 근거를 받치는 자리입니다.' }),
      ),
    );
  }

  /* ── scoring ─────────────────────────────────────────────────────── */

  function grade(): void {
    checked = true;

    let hits = 0;
    let halves = 0;
    let falses = 0;

    for (const target of LAB_TARGETS) {
      const mark = marks.get(target.index);
      if (!mark) continue;
      if (mark.reason === target.reason) hits += 1;
      else halves += 1;
    }
    for (const [index] of marks) {
      if (!LAB_TARGETS.some((t) => t.index === index)) falses += 1;
    }

    const raw = hits + halves * 0.5 - falses * 0.5;
    const score = Math.max(0, Math.round((raw / LAB_TARGETS.length) * 100));

    if (score > store.get().labBest) store.set({ labBest: score });
    buzz(score >= 70 ? [14] : [26, 60, 26]);

    drawParagraph();

    actions.replaceChildren(
      h(
        'button',
        {
          class: 'btn btn--ghost',
          on: {
            click: () => {
              marks.clear();
              checked = false;
              drawParagraph();
              drawResult(null);
              drawActions();
            },
          },
        },
        icon('reset', 17),
        '다시 하기',
      ),
      h(
        'button',
        { class: 'btn btn--primary', on: { click: () => router.go('/apply') } },
        '첨삭 받아보기',
        icon('arrow', 17),
      ),
    );

    drawResult({ score, hits, halves, falses });
  }

  /* ── result panel ────────────────────────────────────────────────── */

  const resultSlot = h('div', {});

  function drawResult(r: { score: number; hits: number; halves: number; falses: number } | null): void {
    if (!r) {
      resultSlot.replaceChildren();
      return;
    }

    const verdict =
      r.score >= 85
        ? '선생님과 거의 같게 봤습니다.'
        : r.score >= 55
          ? '방향은 맞습니다. 이유가 한 끗 다릅니다.'
          : '무엇이 문제인지부터 함께 봅시다.';

    resultSlot.replaceChildren(
      h(
        'section',
        { class: 'card card--solid rise' },
        h(
          'div',
          { class: 'row row--between' },
          h('span', { class: 'eyebrow', text: '채점' }),
          h('b', { class: 'num h2', text: `${r.score}점` }),
        ),
        h('p', { class: 'h3', style: { marginTop: '10px' }, text: verdict }),
        h(
          'ul',
          { class: 'lab__score' },
          h('li', {}, h('b', { text: String(r.hits) }), '정확히 일치'),
          h('li', {}, h('b', { text: String(r.halves) }), '자리는 맞고 이유가 다름'),
          h('li', {}, h('b', { text: String(r.falses) }), '문제없는 문장에 표시'),
        ),
        h(
          'div',
          { class: 'lab__rewrite' },
          h('span', { class: 'eyebrow', text: '선생님이 다시 쓴 글' }),
          h('p', { text: LAB_REWRITE }),
        ),
        store.get().labBest > 0
          ? h('p', { class: 'sm', text: `개인 최고 ${store.get().labBest}점` })
          : null,
      ),
    );
  }

  function drawActions(): void {
    actions.replaceChildren(
      h(
        'button',
        {
          class: 'btn btn--red',
          on: {
            click: () => {
              if (marks.size === 0) {
                toast('먼저 문장을 하나 이상 표시해 주세요.');
                buzz([20, 40, 20]);
                return;
              }
              grade();
            },
          },
        },
        '채점하기',
      ),
      h(
        'button',
        {
          class: 'btn btn--quiet btn--sm',
          on: {
            click: () =>
              sheet(
                '첨삭 기준',
                h(
                  'div',
                  { class: 'stack', style: { gap: '12px' } },
                  ...LAB_REASONS.slice(0, 3).map((r, i) =>
                    h(
                      'div',
                      {},
                      h('b', { text: `${i + 1}. ${r}` }),
                      h('p', { class: 'sm', text: LAB_TARGETS[i]?.note ?? '' }),
                    ),
                  ),
                ),
              ),
          },
        },
        '기준 보기',
      ),
    );
  }

  root.append(
    h(
      'header',
      { class: 'stack', style: { gap: '10px' } },
      h('span', { class: 'eyebrow', text: '첨삭 랩' }),
      h('h1', { class: 'h1' }, '선생님이 되어 ', h('span', { class: 'pen', text: '고쳐' }), ' 보세요.'),
      h('p', {
        class: 'body',
        text: '중2 학생이 쓴 독서기록문입니다. 손봐야 할 문장을 눌러 이유를 고르고, 채점을 눌러 선생님의 첨삭과 비교해 보세요.',
      }),
    ),
    tally,
    paragraph,
    actions,
    resultSlot,
  );

  drawParagraph();
  drawActions();
  return root;
}

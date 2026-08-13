import { sfx } from '../core/audio';
import { h, shuffle } from '../core/dom';
import { burstFrom, enhance } from '../core/motion';
import { type ViewHandle } from '../core/router';
import { store, touchStreak } from '../core/store';
import type { SpellingItem } from '../core/types';
import { SPELLING } from '../data/spelling';
import { emptyState, sectionHead, statCard, toast } from '../ui/components';

const ROUND = 12;

export function spellingView(): ViewHandle {
  const el = h('div.wrap.section--tight');
  const body = h('div');
  el.appendChild(body);
  let timer: number | null = null;

  function renderHome(): void {
    if (timer) window.clearInterval(timer);
    timer = null;
    body.replaceChildren();

    body.appendChild(
      sectionHead(
        'spelling',
        '맞춤법 스피드',
        `헷갈리는 표기 ${SPELLING.length}쌍. 한 문항에 <b>7초</b>, 고르면 곧바로 규칙이 뜹니다.`,
      ),
    );

    body.appendChild(
      h(
        'div.card',
        { style: { marginBottom: '22px' } },
        h(
          'div.spread',
          h(
            'div',
            h('h3.h3', { style: { marginBottom: '4px' } }, `${ROUND}문항 스프린트`),
            h('p.small.muted', '틀린 문항의 규칙은 끝나고 한 번에 정리해 드립니다.'),
          ),
          h(
            'button.btn.btn--primary.btn--lg',
            {
              'data-magnetic': '',
              onclick: () => {
                sfx.nav();
                start();
              },
            },
            '시작 →',
          ),
        ),
      ),
    );

    body.appendChild(
      h(
        'div.card',
        h('h3.h3', { style: { marginBottom: '14px' } }, `전체 규칙 목록 (${SPELLING.length})`),
        h(
          'div.grid',
          { style: { gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' } },
          ...SPELLING.map((s) =>
            h(
              'div.card.card--flat.card--pad-s',
              h(
                'div.row',
                { style: { marginBottom: '6px' } },
                h('b', { style: { color: 'var(--ok)' } }, s.choices[s.answer]),
                h('span.small.muted', { style: { textDecoration: 'line-through' } }, s.choices[1 - s.answer]),
              ),
              h('div.tiny.muted', { style: { lineHeight: '1.7' } }, s.rule),
            ),
          ),
        ),
      ),
    );

    enhance(body);
  }

  function start(): void {
    const set = shuffle(SPELLING).slice(0, ROUND);
    let i = 0;
    let correct = 0;
    const missed: SpellingItem[] = [];
    let remaining = 7;

    const stage = h('div', { style: { maxWidth: '620px', marginInline: 'auto' } });
    body.replaceChildren(stage);

    const renderItem = () => {
      if (timer) window.clearInterval(timer);
      if (i >= set.length) {
        finish();
        return;
      }
      const item = set[i];
      remaining = 7;
      stage.replaceChildren();

      const timeLabel = h('span', '7');
      stage.appendChild(
        h(
          'div.spread',
          { style: { marginBottom: '12px' } },
          h('span.small.muted', `${i + 1} / ${set.length}`),
          h(
            'div.row',
            h('div.timer-pill', h('span', '⏱'), timeLabel),
            h(
              'button.btn.btn--ghost.btn--sm',
              {
                onclick: () => {
                  sfx.tap();
                  renderHome();
                },
              },
              '나가기',
            ),
          ),
        ),
      );
      stage.appendChild(h('div.quiz__bar', h('i', { style: { width: `${(i / set.length) * 100}%` } })));

      const prompt = item.prompt.replace(item.choices[item.answer], '(　　)').replace(item.choices[1 - item.answer], '(　　)');
      const card = h(
        'div.card',
        { style: { marginTop: '18px', textAlign: 'center' } },
        h('p.small.muted', { style: { marginBottom: '10px' } }, '빈칸에 알맞은 표기는?'),
        h('p', { style: { fontSize: '1.2rem', fontWeight: '600', marginBottom: '22px' } }, prompt),
      );

      const options = h('div.grid', { style: { gridTemplateColumns: '1fr 1fr', gap: '12px' } });
      const order = Math.random() < 0.5 ? [0, 1] : [1, 0];
      const buttons: HTMLElement[] = [];
      for (const idx of order) {
        const btn = h(
          'button.choice',
          {
            style: { justifyContent: 'center', fontSize: '1.05rem', fontWeight: '650', padding: '20px 12px' },
            onclick: () => answer(idx, btn),
          },
          h('span', item.choices[idx]),
        );
        buttons.push(btn);
        options.appendChild(btn);
      }
      card.appendChild(options);
      const ruleBox = h('div', { style: { marginTop: '16px' } });
      card.appendChild(ruleBox);
      stage.appendChild(card);

      timer = window.setInterval(() => {
        remaining -= 1;
        timeLabel.textContent = String(Math.max(0, remaining));
        if (remaining <= 2) sfx.tick();
        if (remaining <= 0) {
          if (timer) window.clearInterval(timer);
          answer(-1, null);
        }
      }, 1000);

      function answer(picked: number, btn: HTMLElement | null): void {
        if (timer) window.clearInterval(timer);
        buttons.forEach((b) => ((b as HTMLButtonElement).disabled = true));
        const ok = picked === item.answer;
        if (ok) {
          correct += 1;
          btn?.classList.add('is-right');
          sfx.correct();
          if (btn) burstFrom(btn, 12);
        } else {
          missed.push(item);
          btn?.classList.add('is-wrong');
          const rightBtn = buttons[order.indexOf(item.answer)];
          rightBtn?.classList.add('is-right');
          sfx.wrong();
        }
        ruleBox.replaceChildren(
          h(
            'div.explain',
            { style: { textAlign: 'left' } },
            h(
              'div',
              { class: `verdict verdict--${ok ? 'ok' : 'no'}` },
              h('span', ok ? '✓' : '✕'),
              h('span', ok ? '정답' : picked < 0 ? '시간 초과' : '오답'),
            ),
            h('div', item.rule),
          ),
        );
        window.setTimeout(() => {
          i += 1;
          renderItem();
        }, 1400);
      }
    };

    const finish = () => {
      store.update((p) => {
        p.xp += correct * 4;
        p.coins += correct;
        touchStreak(p);
      });
      sfx.done();
      stage.replaceChildren(
        h(
          'div.card',
          { style: { textAlign: 'center' } },
          h('div', { style: { fontSize: '2.4rem' } }, correct >= ROUND * 0.8 ? '🏅' : '⚡'),
          h('h2.h1', { style: { marginTop: '6px' } }, `${correct} / ${set.length}`),
          h(
            'p.lede',
            { style: { marginInline: 'auto', marginTop: '8px' } },
            correct === set.length
              ? '전부 맞혔습니다. 표기 감각이 안정적입니다.'
              : '틀린 규칙만 아래에 모았습니다. 소리 내어 한 번씩 읽어 보세요.',
          ),
          h(
            'div.row',
            { style: { justifyContent: 'center', marginTop: '22px' } },
            h(
              'button.btn.btn--primary',
              {
                onclick: () => {
                  sfx.nav();
                  start();
                },
              },
              '한 번 더',
            ),
            h(
              'button.btn.btn--ghost',
              {
                onclick: () => {
                  sfx.tap();
                  renderHome();
                },
              },
              '목록으로',
            ),
          ),
        ),
      );

      if (missed.length) {
        stage.appendChild(
          h(
            'div.card',
            { style: { marginTop: '18px' } },
            h('h3.h3', { style: { marginBottom: '12px' } }, `다시 볼 규칙 (${missed.length})`),
            h(
              'div.stack',
              { style: { gap: '10px' } },
              ...missed.map((m) =>
                h(
                  'div.card.card--flat.card--pad-s',
                  h(
                    'div.row',
                    { style: { marginBottom: '6px' } },
                    h('b', { style: { color: 'var(--ok)' } }, m.choices[m.answer]),
                    h('span.small.muted', { style: { textDecoration: 'line-through' } }, m.choices[1 - m.answer]),
                  ),
                  h('div.small.muted', { style: { lineHeight: '1.7' } }, m.rule),
                ),
              ),
            ),
          ),
        );
      } else {
        toast('전부 정답입니다', '🏅');
      }
      enhance(stage);
    };

    renderItem();
  }

  if (!SPELLING.length) body.appendChild(emptyState('⚡', '문항이 없습니다', '데이터를 확인해 주세요.'));
  else renderHome();

  return {
    el,
    title: '맞춤법 스피드',
    destroy() {
      if (timer) window.clearInterval(timer);
    },
  };
}

export const SPELLING_STAT = statCard;

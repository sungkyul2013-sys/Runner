/**
 * One question runner used by 문제 풀이, 진단 평가, 모의고사 and 오답노트.
 *
 * The caller supplies the question list and a mode; the runner owns the
 * per-question UI, keyboard shortcuts, timing and the result payload.
 */

import { sfx } from '../core/audio';
import { clamp, h, mmss } from '../core/dom';
import { burstFrom } from '../core/motion';
import { recordAttempt, store, toggleBookmark } from '../core/store';
import { DOMAIN_HUE, type Question } from '../core/types';
import { PASSAGE_BY_ID } from '../data/passages';
import { domainTag, levelTag, ticker, toast, type Ticker } from './components';

export type QuizMode = 'practice' | 'diagnostic' | 'mock' | 'review';

export interface QuizResult {
  answers: { q: Question; chosen: number; correct: boolean; ms: number }[];
  seconds: number;
  aborted: boolean;
  /** Longest run of consecutive correct answers in this session. */
  bestCombo: number;
}

export interface QuizOptions {
  questions: Question[];
  mode: QuizMode;
  /** Countdown in seconds for the whole set (0 = count up). */
  limitSeconds?: number;
  /** Hide explanations until the end (diagnostic / mock). */
  deferFeedback?: boolean;
  onFinish: (r: QuizResult) => void;
  onExit?: () => void;
}

export interface QuizHandle {
  el: HTMLElement;
  destroy: () => void;
}

const NUM = ['①', '②', '③', '④', '⑤', '⑥'];

export function createQuiz(opts: QuizOptions): QuizHandle {
  const { questions, mode, deferFeedback = false } = opts;
  const answers: QuizResult['answers'] = [];

  let index = 0;
  let locked = false;
  let combo = 0;
  let bestCombo = 0;
  let qStart = performance.now();
  let clock: Ticker | null = null;
  let finished = false;

  const root = h('div.quiz');
  const barFill = h('i', { style: { width: '0%' } });
  const progressBar = h('div.quiz__bar', barFill);
  const head = h('div.spread', { style: { marginBottom: '10px' } });
  const stage = h('div');
  const comboBadge = h('div.combo', { style: { display: 'none' } });

  root.append(comboBadge, head, progressBar, stage);

  /** A "+12 XP" that floats up from wherever the learner tapped. */
  function floatXp(amount: number, from: Element): void {
    const layer = document.getElementById('fx-layer');
    if (!layer) return;
    const r = from.getBoundingClientRect();
    const el = h('span.xp-float', `+${amount} XP`);
    el.style.left = `${r.left + r.width / 2}px`;
    el.style.top = `${r.top}px`;
    layer.appendChild(el);
    window.setTimeout(() => el.remove(), 1100);
  }

  function renderCombo(): void {
    if (combo < 2) {
      comboBadge.style.display = 'none';
      return;
    }
    comboBadge.style.display = '';
    comboBadge.replaceChildren(h('span', '\u26a1'), h('span', `${combo} 연속`));
    // Re-trigger the pop animation on every increment.
    comboBadge.style.animation = 'none';
    void comboBadge.offsetWidth;
    comboBadge.style.animation = '';
  }

  /* ------------------------------- header ------------------------------- */
  const counter = h('span.small.muted');
  const exitBtn = h(
    'button.btn.btn--ghost.btn--sm',
    {
      onclick: () => {
        sfx.tap();
        finish(true);
      },
    },
    '나가기',
  );

  function buildHead(): void {
    head.replaceChildren();
    const left = h('div.row', counter);
    const right = h('div.row');
    if (opts.limitSeconds && opts.limitSeconds > 0) {
      clock = ticker(opts.limitSeconds, () => {
        toast('시간이 종료되었습니다', '⏰');
        finish(false);
      });
      right.appendChild(clock.el);
    } else {
      clock = ticker(0);
      right.appendChild(clock.el);
    }
    right.appendChild(exitBtn);
    head.append(left, right);
  }

  /* ------------------------------ rendering ----------------------------- */
  function render(): void {
    const q = questions[index];
    locked = false;
    qStart = performance.now();

    counter.textContent = `${index + 1} / ${questions.length}`;
    barFill.style.width = `${(index / questions.length) * 100}%`;

    stage.replaceChildren();
    const card = h('div.card', { style: { padding: '26px' } });

    // Passage (collapsible on mobile).
    const passage = q.passageId ? PASSAGE_BY_ID.get(q.passageId) : undefined;
    if (passage) {
      const isPoem = passage.domain === 'literature';
      card.appendChild(
        h(
          'div',
          { style: { marginBottom: '18px' } },
          h(
            'div.spread',
            { style: { marginBottom: '10px' } },
            h('div', h('b', passage.title), h('span.small.muted', ` · ${passage.source}`)),
            h('span.tag', '지문'),
          ),
          h(
            `div.passage${isPoem ? '.passage--poem' : ''}`,
            ...passage.body.map((p) =>
              h('p', { html: p.replace(/\[(\d+)\]/g, '<mark>[$1]</mark>') }),
            ),
          ),
        ),
      );
    }

    // Meta row.
    card.appendChild(
      h(
        'div.row',
        { style: { marginBottom: '4px' } },
        domainTag(q.domain),
        levelTag(q.level),
        h('span.tag', q.topic),
        h('span.tag', q.skill),
        h(
          'button.icon-btn',
          {
            style: { marginLeft: 'auto' },
            title: '북마크',
            onclick: (e: MouseEvent) => {
              const on = toggleBookmark(q.id);
              (e.currentTarget as HTMLElement).textContent = on ? '★' : '☆';
              toast(on ? '북마크에 담았습니다' : '북마크에서 뺐습니다', on ? '★' : '☆', 1500);
            },
          },
          store.profile.bookmarks.includes(q.id) ? '★' : '☆',
        ),
      ),
    );

    card.appendChild(h('div.q-stem', { html: q.stem }));

    const choiceWrap = h('div.choices');
    q.choices.forEach((choice, i) => {
      const btn = h(
        'button.choice',
        {
          onclick: () => pick(i, btn),
        },
        h('span.choice__no', NUM[i] ?? String(i + 1)),
        h('span', { html: choice }),
      );
      choiceWrap.appendChild(btn);
    });
    card.appendChild(choiceWrap);

    const footer = h('div', { style: { marginTop: '18px' } });
    card.appendChild(footer);
    stage.appendChild(card);

    // Deferred-feedback modes get a skip button so nobody gets stuck.
    if (deferFeedback) {
      footer.appendChild(
        h(
          'div.row',
          { style: { justifyContent: 'flex-end' } },
          h(
            'button.btn.btn--ghost.btn--sm',
            {
              onclick: () => {
                if (locked) return;
                combo = 0;
                commit(-1, 0);
                next();
              },
            },
            '모르겠어요 · 넘기기',
          ),
        ),
      );
    }

    function pick(i: number, btn: HTMLElement): void {
      if (locked) return;
      locked = true;
      const ms = Math.round(performance.now() - qStart);
      const correct = i === q.answer;

      [...choiceWrap.children].forEach((c) => ((c as HTMLButtonElement).disabled = true));

      if (deferFeedback) {
        btn.classList.add('is-picked');
        sfx.tap();
        combo = correct ? combo + 1 : 0;
        bestCombo = Math.max(bestCombo, combo);
        commit(i, ms);
        window.setTimeout(next, 260);
        return;
      }

      btn.classList.add(correct ? 'is-right' : 'is-wrong');
      if (!correct) {
        (choiceWrap.children[q.answer] as HTMLElement).classList.add('is-right');
        sfx.wrong();
        combo = 0;
        renderCombo();
        card.classList.remove('shake');
        void card.offsetWidth;
        card.classList.add('shake');
      } else {
        sfx.correct();
        burstFrom(btn, DOMAIN_HUE[q.domain]);
        combo += 1;
        bestCombo = Math.max(bestCombo, combo);
        renderCombo();
      }

      const gained = commit(i, ms);
      floatXp(gained, btn);
      showExplain(correct);
    }

    function showExplain(correct: boolean): void {
      footer.replaceChildren();
      const box = h(
        'div.explain',
        h(
          'div',
          { class: `verdict verdict--${correct ? 'ok' : 'no'}` },
          h('span', correct ? '✓' : '✕'),
          h('span', correct ? '정답입니다' : `오답 — 정답은 ${NUM[q.answer]}`),
        ),
        h('div', { html: q.explain }),
      );
      if (q.choiceNotes?.length) {
        const list = h('div', { style: { marginTop: '12px' } });
        q.choiceNotes.forEach((note, i) => {
          list.appendChild(h('div.choice-note', `${NUM[i]} ${note}`));
        });
        box.appendChild(list);
      }
      footer.appendChild(box);
      footer.appendChild(
        h(
          'div.row',
          { style: { marginTop: '18px', justifyContent: 'space-between' } },
          h('span.tiny.muted', h('span.kbd', 'Enter'), ' 다음 문제'),
          h(
            'button.btn.btn--primary',
            { onclick: next },
            index + 1 >= questions.length ? '결과 보기' : '다음 문제 →',
          ),
        ),
      );
      footer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function commit(chosen: number, ms: number): number {
      const correct = chosen === q.answer;
      answers.push({ q, chosen, correct, ms });
      // Diagnostics and mocks report separately; practice/review award XP now.
      // A running combo multiplies the reward, up to 2x.
      const comboBonus = correct ? Math.min(1 + combo * 0.15, 2) : 1;
      const xpScale = (mode === 'practice' ? 1 : mode === 'review' ? 1.2 : 0.5) * comboBonus;
      return recordAttempt({
        qid: q.id,
        domain: q.domain,
        skill: q.skill,
        topic: q.topic,
        correct,
        chosen,
        ms,
        xpScale,
        combo,
      });
    }
  }

  function next(): void {
    index += 1;
    if (index >= questions.length) {
      finish(false);
      return;
    }
    render();
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function finish(aborted: boolean): void {
    if (finished) return;
    finished = true;
    const seconds = clock?.seconds() ?? 0;
    clock?.stop();
    document.removeEventListener('keydown', onKey);
    if (aborted && answers.length === 0) {
      opts.onExit?.();
      return;
    }
    barFill.style.width = '100%';
    opts.onFinish({ answers, seconds, aborted, bestCombo });
  }

  /* ------------------------------ shortcuts ----------------------------- */
  function onKey(e: KeyboardEvent): void {
    if (finished) return;
    const target = e.target as HTMLElement;
    if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;

    if (/^[1-5]$/.test(e.key)) {
      const i = Number(e.key) - 1;
      const btn = stage.querySelectorAll<HTMLButtonElement>('.choice')[i];
      if (btn && !btn.disabled) {
        e.preventDefault();
        btn.click();
      }
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && locked && !deferFeedback) {
      e.preventDefault();
      next();
    }
  }
  document.addEventListener('keydown', onKey);

  buildHead();
  render();

  return {
    el: root,
    destroy() {
      finished = true;
      clock?.stop();
      document.removeEventListener('keydown', onKey);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Result screen                                                       */
/* ------------------------------------------------------------------ */

export function quizSummary(result: QuizResult, actions: HTMLElement[]): HTMLElement {
  const total = result.answers.length;
  const correct = result.answers.filter((a) => a.correct).length;
  const rate = total ? correct / total : 0;
  const avg = total ? result.answers.reduce((s, a) => s + a.ms, 0) / total / 1000 : 0;

  const message =
    rate >= 0.9 ? '완벽에 가깝습니다.' : rate >= 0.7 ? '안정적입니다. 틀린 유형만 다시 보면 됩니다.' :
    rate >= 0.5 ? '절반은 잡혔습니다. 오답의 원인을 유형으로 묶어 보세요.' :
    '지금이 가장 많이 오를 구간입니다. 해설부터 천천히 다시 읽어 보세요.';

  const list = h('div.stack', { style: { marginTop: '22px' } });
  result.answers.forEach((a, i) => {
    list.appendChild(
      h(
        'div.card.card--flat.card--pad-s',
        h(
          'div.spread',
          h(
            'div',
            { style: { flex: '1', minWidth: '0' } },
            h('div.small', { style: { fontWeight: '600', marginBottom: '3px' } }, `${i + 1}. ${a.q.topic}`),
            h('div.tiny.muted', `${a.q.skill} · ${mmss(a.ms / 1000)}`),
          ),
          h(
            'span.tag',
            { style: { color: a.correct ? 'var(--ok)' : 'var(--bad)' } },
            a.correct ? '정답' : a.chosen < 0 ? '미응답' : '오답',
          ),
        ),
      ),
    );
  });

  return h(
    'div',
    h(
      'div.card',
      { style: { textAlign: 'center' } },
      h('div', { style: { fontSize: '2.6rem', marginBottom: '6px' } }, rate >= 0.7 ? '🎉' : rate >= 0.5 ? '💪' : '📖'),
      h('h2.h1', `${correct} / ${total}`),
      h('p.lede', { style: { marginInline: 'auto', marginTop: '8px' } }, message),
      h(
        'div.stat-grid',
        { style: { marginTop: '26px' } },
        h('div.stat', h('b', `${Math.round(rate * 100)}%`), h('span', '정답률')),
        h('div.stat', h('b', mmss(result.seconds)), h('span', '소요 시간')),
        h('div.stat', h('b', `${avg.toFixed(1)}초`), h('span', '문항 평균')),
        h('div.stat', h('b', `⚡ ${result.bestCombo}`), h('span', '최고 연속')),
      ),
      h('div.row', { style: { justifyContent: 'center', marginTop: '26px' } }, ...actions),
    ),
    list,
  );
}

export function scoreBand(rate: number): number {
  // Maps accuracy onto a 1..9 internal band.
  return clamp(Math.round(rate * 8) + 1, 1, 9);
}

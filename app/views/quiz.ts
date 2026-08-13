import { h, icon } from '../core/dom';
import type { Router } from '../core/router';
import { sortable, swipe } from '../core/sortable';
import { buzz, toast } from '../core/ui';
import { store, type DomainScore } from '../core/store';
import { DOMAINS, QUESTIONS, type Question } from '../data/questions';

/**
 * 진단 — the quiz engine.
 *
 * Three answer mechanics share one shell: choose, tap the faulty phrase,
 * and drag an outline into order. Answers are locked in on submit and the
 * explanation is shown immediately, because the point of a diagnostic is
 * what the student learns from being wrong.
 *
 * Session state lives at module scope so navigating away and back resumes
 * mid-quiz instead of silently discarding progress.
 */

interface Session {
  index: number;
  answers: (boolean | null)[];
  startedAt: number;
  finished: boolean;
}

let session: Session | null = null;

export function resetQuiz(): void {
  session = null;
}

function fresh(): Session {
  return {
    index: 0,
    answers: QUESTIONS.map(() => null),
    startedAt: Date.now(),
    finished: false,
  };
}

/** Deterministic shuffle so the same item always presents the same way. */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed * 9301 + 49297;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function quizView(router: Router): HTMLElement {
  if (!session || session.finished) session = fresh();
  const state = session;

  const root = h('div', { class: 'wrap quiz' });
  const body = h('div', { class: 'quiz__body' });

  /* ── header: progress pips + timer ───────────────────────────────── */

  const pips = h('div', { class: 'pips', 'aria-hidden': 'true' });
  const counter = h('span', { class: 'mono' });
  const timer = h('span', { class: 'mono num' });

  const drawPips = (): void => {
    pips.replaceChildren(
      ...QUESTIONS.map((_, i) =>
        h('i', {
          class: [
            'pip',
            state.answers[i] === true ? 'pip--ok' : '',
            state.answers[i] === false ? 'pip--no' : '',
            i === state.index ? 'pip--now' : '',
          ]
            .filter(Boolean)
            .join(' '),
        }),
      ),
    );
    counter.textContent = `${state.index + 1} / ${QUESTIONS.length}`;
  };

  let tick = 0;
  const startTimer = (): void => {
    const update = (): void => {
      const s = Math.floor((Date.now() - state.startedAt) / 1000);
      timer.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    };
    update();
    tick = window.setInterval(update, 1000);
  };
  startTimer();
  // The view is replaced wholesale on navigation; stop the clock with it.
  const observer = new MutationObserver(() => {
    if (!document.body.contains(root)) {
      window.clearInterval(tick);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  root.append(
    h(
      'header',
      { class: 'quiz__head' },
      h(
        'div',
        { class: 'row row--between' },
        h('span', { class: 'eyebrow', text: '진단 테스트' }),
        h('span', { class: 'row', style: { gap: '6px' } }, icon('clock', 15), timer),
      ),
      pips,
      h(
        'div',
        { class: 'row row--between', style: { marginTop: '6px' } },
        counter,
        h(
          'button',
          {
            class: 'btn btn--quiet btn--sm',
            on: {
              click: () => {
                resetQuiz();
                router.go('/quiz');
                toast('처음부터 다시 시작합니다.');
              },
            },
          },
          icon('reset', 15),
          '처음부터',
        ),
      ),
    ),
    body,
  );

  /* ── one question ────────────────────────────────────────────────── */

  function renderQuestion(): void {
    const q = QUESTIONS[state.index];
    const card = h('article', { class: 'qcard card ruled rise' });

    card.append(
      h(
        'div',
        { class: 'qcard__meta' },
        h('span', { class: 'tag', text: q.domain }),
        h('span', { class: 'mono', text: q.type === 'order' ? 'DRAG' : q.type === 'tap' ? 'TAP' : 'CHOICE' }),
      ),
    );

    if (q.type === 'choice' && q.passage) {
      card.append(h('blockquote', { class: 'passage', text: q.passage }));
    }

    card.append(h('h2', { class: 'qcard__prompt', text: q.prompt }));

    const answerZone = h('div', { class: 'qcard__answers' });
    card.append(answerZone);

    const feedback = h('div', { class: 'feedback' });
    const submit = h(
      'button',
      { class: 'btn btn--primary btn--block', disabled: true },
      '확인하기',
    );

    let check: (() => boolean) | null = null;
    let answered = false;

    /* — mechanic 1: choose — */
    if (q.type === 'choice') {
      let picked = -1;
      const rows = q.options.map((opt, i) =>
        h(
          'button',
          {
            class: 'opt',
            'data-i': i,
            on: {
              click: () => {
                if (answered) return;
                picked = i;
                buzz(10);
                for (const r of Array.from(answerZone.children)) {
                  r.classList.toggle('is-on', Number((r as HTMLElement).dataset.i) === i);
                }
                submit.disabled = false;
              },
            },
          },
          h('span', { class: 'opt__key mono', text: String(i + 1) }),
          h('span', { text: opt }),
        ),
      );
      answerZone.append(...rows);

      check = () => {
        const ok = picked === q.answer;
        rows.forEach((r, i) => {
          r.classList.remove('is-on');
          if (i === q.answer) r.classList.add('is-right');
          else if (i === picked) r.classList.add('is-wrong');
        });
        return ok;
      };
    }

    /* — mechanic 2: tap the faulty phrase — */
    if (q.type === 'tap') {
      let picked = -1;
      answerZone.classList.add('taps');
      const chips = q.segments.map((seg, i) =>
        h(
          'button',
          {
            class: 'taps__seg',
            'data-i': i,
            on: {
              click: () => {
                if (answered) return;
                picked = i;
                buzz(10);
                for (const c of Array.from(answerZone.children)) {
                  c.classList.toggle('is-on', Number((c as HTMLElement).dataset.i) === i);
                }
                submit.disabled = false;
              },
            },
          },
          seg,
        ),
      );
      answerZone.append(...chips);

      check = () => {
        const ok = picked === q.answer;
        chips.forEach((c, i) => {
          c.classList.remove('is-on');
          if (i === q.answer) c.classList.add('is-right');
          else if (i === picked) c.classList.add('is-wrong');
        });
        card.append(
          h(
            'p',
            { class: 'fixline' },
            h('span', { class: 'mono', text: '고치면' }),
            h('b', { text: q.fix }),
          ),
        );
        return ok;
      };
    }

    /* — mechanic 3: drag into order — */
    if (q.type === 'order') {
      const order = shuffled(
        q.steps.map((_, i) => i),
        state.index + 7,
      );
      const list = h('ol', { class: 'sortlist' });
      list.append(
        ...order.map((original, pos) =>
          h(
            'li',
            { class: 'sortrow', 'data-sortable-item': '', 'data-index': original },
            h('span', { class: 'sortrow__no mono', text: String(pos + 1) }),
            h('span', { class: 'sortrow__text', text: q.steps[original] }),
            h('span', { class: 'sortrow__grip', 'aria-hidden': 'true' }),
          ),
        ),
      );

      const renumber = (): void => {
        Array.from(list.children).forEach((row, i) => {
          const no = row.querySelector('.sortrow__no');
          if (no) no.textContent = String(i + 1);
        });
      };

      sortable(list, () => {
        renumber();
        submit.disabled = false;
      });

      answerZone.append(
        h('p', { class: 'hint', text: '항목을 위아래로 끌어 순서를 바꾸세요.' }),
        list,
      );
      submit.disabled = false;

      check = () => {
        const got = Array.from(list.children).map((r) => Number((r as HTMLElement).dataset.index));
        const ok = got.every((v, i) => v === i);
        Array.from(list.children).forEach((row, i) => {
          row.classList.add(got[i] === i ? 'is-right' : 'is-wrong');
        });
        if (!ok) {
          // Show the correct sequence rather than leaving them guessing.
          card.append(
            h(
              'div',
              { class: 'answerkey' },
              h('span', { class: 'mono', text: '바른 순서' }),
              h('ol', {}, ...q.steps.map((s) => h('li', { text: s }))),
            ),
          );
        }
        return ok;
      };
    }

    /* — submit & advance — */
    const advance = h('button', { class: 'btn btn--primary btn--block hide' });

    submit.addEventListener('click', () => {
      if (answered || !check) return;
      answered = true;
      submit.disabled = true;

      const ok = check();
      state.answers[state.index] = ok;
      drawPips();
      buzz(ok ? [14] : [26, 60, 26]);

      feedback.className = `feedback is-shown ${ok ? 'is-ok' : 'is-no'}`;
      feedback.replaceChildren(
        h(
          'div',
          { class: 'feedback__head' },
          icon(ok ? 'check' : 'close', 18),
          h('b', { text: ok ? '맞았습니다' : '다시 봅시다' }),
        ),
        h('p', { text: (QUESTIONS[state.index] as Question).explain }),
      );

      submit.classList.add('hide');
      advance.classList.remove('hide');
      advance.textContent =
        state.index === QUESTIONS.length - 1 ? '결과 보기' : '다음 문제';
      advance.focus();
    });

    advance.addEventListener('click', () => next());

    card.append(feedback, h('div', { class: 'qcard__foot' }, submit, advance));
    body.replaceChildren(card);

    // Swiping the card advances once it has been answered.
    swipe(card, {
      left: () => answered && next(),
      right: () => {
        if (state.index === 0) return;
        state.index -= 1;
        renderQuestion();
        drawPips();
      },
    });
  }

  function next(): void {
    if (state.index < QUESTIONS.length - 1) {
      state.index += 1;
      drawPips();
      renderQuestion();
      return;
    }
    finish();
  }

  function finish(): void {
    window.clearInterval(tick);
    state.finished = true;

    const byDomain: Record<string, DomainScore> = {};
    for (const d of DOMAINS) byDomain[d] = { correct: 0, total: 0 };

    QUESTIONS.forEach((q, i) => {
      const bucket = byDomain[q.domain];
      bucket.total += 1;
      if (state.answers[i]) bucket.correct += 1;
    });

    store.addRun({
      at: Date.now(),
      score: state.answers.filter(Boolean).length,
      total: QUESTIONS.length,
      seconds: Math.round((Date.now() - state.startedAt) / 1000),
      byDomain,
    });

    session = null;
    router.go('/result');
  }

  drawPips();
  renderQuestion();
  return root;
}

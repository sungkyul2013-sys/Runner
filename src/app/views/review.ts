import { sfx } from '../core/audio';
import { h, shuffle } from '../core/dom';
import { enhance } from '../core/motion';
import { go, type ViewHandle } from '../core/router';
import { store } from '../core/store';
import { DOMAIN_LABEL, type Question } from '../core/types';
import { QUESTION_BY_ID } from '../data/questions';
import { confirmDialog, domainTag, emptyState, levelTag, sectionHead, statCard, toast } from '../ui/components';
import { createQuiz, quizSummary, type QuizHandle } from '../ui/QuizRunner';

type Tab = 'wrong' | 'bookmark';

export function reviewView(params: URLSearchParams): ViewHandle {
  const el = h('div.wrap.section--tight');
  const body = h('div');
  el.appendChild(body);
  let quiz: QuizHandle | null = null;
  let tab: Tab = params.get('tab') === 'bookmark' ? 'bookmark' : 'wrong';

  function wrongQuestions(): { q: Question; count: number }[] {
    return store.profile.wrong
      .map((w) => ({ q: QUESTION_BY_ID.get(w.qid), count: w.wrongCount, streak: w.clearedStreak }))
      .filter((x): x is { q: Question; count: number; streak: number } => Boolean(x.q))
      .sort((a, b) => b.count - a.count);
  }

  function bookmarkQuestions(): Question[] {
    return store.profile.bookmarks
      .map((id) => QUESTION_BY_ID.get(id))
      .filter((q): q is Question => Boolean(q));
  }

  function renderList(): void {
    quiz?.destroy();
    quiz = null;
    body.replaceChildren();

    const wrong = wrongQuestions();
    const marks = bookmarkQuestions();
    const p = store.profile;

    body.appendChild(
      sectionHead(
        'review',
        '오답노트',
        '틀린 문항은 <b>두 번 연속 맞히면</b> 자동으로 졸업합니다. 한 번 맞혀도 목록에 남는 이유입니다.',
      ),
    );

    body.appendChild(
      h(
        'div.grid.grid--4',
        { style: { marginBottom: '24px' }, 'data-reveal-stagger': '50' },
        statCard(String(wrong.length), '복습 대기'),
        statCard(String(marks.length), '북마크'),
        statCard(String(p.attempts.filter((a) => !a.correct).length), '누적 오답'),
        statCard(
          String(
            new Set(p.wrong.map((w) => QUESTION_BY_ID.get(w.qid)?.topic).filter(Boolean)).size,
          ),
          '약점 유형 수',
        ),
      ),
    );

    body.appendChild(
      h(
        'div.spread',
        { style: { marginBottom: '18px' } },
        h(
          'div.seg',
          h(
            'button',
            {
              class: tab === 'wrong' ? 'is-on' : '',
              onclick: () => {
                sfx.tap();
                tab = 'wrong';
                renderList();
              },
            },
            `오답 ${wrong.length}`,
          ),
          h(
            'button',
            {
              class: tab === 'bookmark' ? 'is-on' : '',
              onclick: () => {
                sfx.tap();
                tab = 'bookmark';
                renderList();
              },
            },
            `북마크 ${marks.length}`,
          ),
        ),
        h(
          'div.row',
          tab === 'wrong' && wrong.length
            ? h(
                'button.btn.btn--primary',
                {
                  'data-magnetic': '',
                  onclick: () => {
                    sfx.nav();
                    start(shuffle(wrong.map((w) => w.q)).slice(0, 10));
                  },
                },
                `복습 시작 (${Math.min(10, wrong.length)}문항)`,
              )
            : null,
          tab === 'bookmark' && marks.length
            ? h(
                'button.btn.btn--primary',
                {
                  onclick: () => {
                    sfx.nav();
                    start(shuffle(marks).slice(0, 10));
                  },
                },
                `북마크 풀기 (${Math.min(10, marks.length)}문항)`,
              )
            : null,
          tab === 'wrong' && wrong.length
            ? h(
                'button.btn.btn--ghost.btn--sm',
                {
                  onclick: () =>
                    confirmDialog(
                      '오답노트를 비울까요?',
                      '복습 대기 중인 문항이 모두 사라집니다. 누적 통계는 그대로 유지됩니다.',
                      () => {
                        store.update((prof) => {
                          prof.wrong = [];
                        });
                        toast('오답노트를 비웠습니다', '🧹');
                        renderList();
                      },
                      '비우기',
                    ),
                },
                '비우기',
              )
            : null,
        ),
      ),
    );

    const items = tab === 'wrong' ? wrong.map((w) => ({ q: w.q, count: w.count })) : marks.map((q) => ({ q, count: 0 }));

    if (!items.length) {
      body.appendChild(
        tab === 'wrong'
          ? emptyState(
              '🎉',
              '복습할 오답이 없습니다',
              '아직 문제를 풀지 않았거나, 모두 졸업시켰습니다.',
              h(
                'button.btn.btn--primary',
                {
                  onclick: () => {
                    sfx.nav();
                    go('practice');
                  },
                },
                '문제 풀러 가기',
              ),
            )
          : emptyState('☆', '북마크가 비어 있습니다', '문제를 풀다가 별 아이콘을 누르면 여기에 모입니다.'),
      );
      enhance(body);
      return;
    }

    // Group by topic so the list reads as a weakness map, not a flat list.
    const byTopic = new Map<string, { q: Question; count: number }[]>();
    for (const it of items) {
      const arr = byTopic.get(it.q.topic) ?? [];
      arr.push(it);
      byTopic.set(it.q.topic, arr);
    }

    const list = h('div.stack');
    for (const [topicName, group] of [...byTopic.entries()].sort((a, b) => b[1].length - a[1].length)) {
      list.appendChild(
        h(
          'div.card',
          { 'data-reveal': '' },
          h(
            'div.spread',
            { style: { marginBottom: '12px' } },
            h(
              'div.row',
              h('h3.h3', topicName),
              h('span.tag', `${group.length}문항`),
            ),
            h(
              'button.btn.btn--ghost.btn--sm',
              {
                onclick: () => {
                  sfx.nav();
                  start(group.map((g) => g.q));
                },
              },
              '이 유형만 풀기',
            ),
          ),
          h(
            'div.stack',
            { style: { gap: '8px' } },
            ...group.map((g) =>
              h(
                'div.card.card--flat.card--pad-s',
                h(
                  'div.row',
                  { style: { marginBottom: '6px' } },
                  domainTag(g.q.domain),
                  levelTag(g.q.level),
                  g.count > 1 ? h('span.tag', { style: { color: 'var(--bad)' } }, `${g.count}회 오답`) : null,
                ),
                h('div.small', { html: g.q.stem.replace(/<br>[\s\S]*/, '') }),
                h(
                  'details',
                  { style: { marginTop: '8px' } },
                  h('summary.tiny.muted', { style: { cursor: 'pointer' } }, '해설 보기'),
                  h(
                    'div.small.muted',
                    { style: { marginTop: '8px', lineHeight: '1.75' }, html: g.q.explain },
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }
    body.appendChild(list);
    enhance(body);
  }

  function start(questions: Question[]): void {
    if (!questions.length) return;
    body.replaceChildren();
    quiz = createQuiz({
      questions,
      mode: 'review',
      onExit: () => renderList(),
      onFinish: (result) => {
        quiz?.destroy();
        quiz = null;
        const graduated = result.answers.filter((a) => a.correct).length;
        body.replaceChildren();
        body.appendChild(
          quizSummary(result, [
            h(
              'button.btn.btn--primary',
              {
                onclick: () => {
                  sfx.tap();
                  renderList();
                },
              },
              '오답노트로 돌아가기',
            ),
            h(
              'button.btn.btn--ghost',
              {
                onclick: () => {
                  sfx.tap();
                  go('practice');
                },
              },
              '새 문제 풀기',
            ),
          ]),
        );
        if (graduated) {
          toast(`${graduated}문항을 다시 맞혔습니다`, '♻️');
        }
        enhance(body);
      },
    });
    body.appendChild(quiz.el);
  }

  renderList();

  return {
    el,
    title: '오답노트',
    destroy() {
      quiz?.destroy();
    },
  };
}

export const REVIEW_DOMAIN_LABEL = DOMAIN_LABEL;

import { sfx } from '../core/audio';
import { h, mmss, shuffle } from '../core/dom';
import { enhance } from '../core/motion';
import { go, type ViewHandle } from '../core/router';
import { addMinutes, store } from '../core/store';
import type { Passage } from '../core/types';
import { PASSAGES } from '../data/passages';
import { queryQuestions } from '../data/questions';
import { sectionHead, statCard, toast } from '../ui/components';
import { createQuiz, quizSummary, type QuizHandle } from '../ui/QuizRunner';

/** Korean reading speed is usually counted in 어절 (whitespace-delimited chunks). */
function countEojeol(passage: Passage): number {
  return passage.body.join(' ').trim().split(/\s+/).filter(Boolean).length;
}

const STRUCTURE_TAGS = ['도입', '전개', '전환', '반론·한계', '정리'];

export function readingView(): ViewHandle {
  const el = h('div.wrap.section--tight');
  const body = h('div');
  el.appendChild(body);
  let quiz: QuizHandle | null = null;

  function renderHome(): void {
    quiz?.destroy();
    quiz = null;
    body.replaceChildren();

    const nonfiction = PASSAGES.filter((p) => p.domain === 'nonfiction');

    body.appendChild(
      sectionHead(
        'reading lab',
        '독해 훈련실',
        '지문을 <b>읽는 속도</b>와 <b>구조를 보는 눈</b>을 따로 훈련합니다. 읽기가 끝나면 곧바로 문항으로 확인합니다.',
      ),
    );

    body.appendChild(
      h(
        'div.grid.grid--3',
        { style: { marginBottom: '26px' }, 'data-reveal-stagger': '60' },
        h(
          'div.card',
          { 'data-reveal': '', 'data-tilt': '6' },
          h('div', { style: { fontSize: '1.7rem', marginBottom: '10px' } }, '⏱️'),
          h('h3.h3', { style: { marginBottom: '6px' } }, '속도 측정'),
          h('p.small.muted', '지문을 끝까지 읽고 버튼을 누르면 분당 어절 수를 계산합니다.'),
        ),
        h(
          'div.card',
          { 'data-reveal': '', 'data-tilt': '6' },
          h('div', { style: { fontSize: '1.7rem', marginBottom: '10px' } }, '🧱'),
          h('h3.h3', { style: { marginBottom: '6px' } }, '구조 표시'),
          h('p.small.muted', '문단마다 기능을 골라 붙이고, 정답 구조와 맞춰 봅니다.'),
        ),
        h(
          'div.card',
          { 'data-reveal': '', 'data-tilt': '6' },
          h('div', { style: { fontSize: '1.7rem', marginBottom: '10px' } }, '🎯'),
          h('h3.h3', { style: { marginBottom: '6px' } }, '문항 확인'),
          h('p.small.muted', '읽은 지문에 딸린 문항을 바로 풀어 이해도를 검증합니다.'),
        ),
      ),
    );

    body.appendChild(
      h(
        'div.grid.grid--2',
        { 'data-reveal-stagger': '50' },
        ...PASSAGES.map((p) => {
          const qs = queryQuestions({}).filter((q) => q.passageId === p.id);
          return h(
            'div.card',
            { 'data-reveal': '' },
            h(
              'div.spread',
              { style: { marginBottom: '10px' } },
              h('span.tag', p.source),
              h('span.tiny.muted', `${countEojeol(p)}어절 · 문항 ${qs.length}개`),
            ),
            h('h3.h3', { style: { marginBottom: '6px' } }, p.title),
            h('p.small.muted', { style: { marginBottom: '16px' } }, p.intro ?? ''),
            h(
              'div.row',
              h(
                'button.btn.btn--primary.btn--sm',
                {
                  onclick: () => {
                    sfx.nav();
                    startTimedRead(p);
                  },
                },
                '속도 측정하며 읽기',
              ),
              p.domain === 'nonfiction'
                ? h(
                    'button.btn.btn--ghost.btn--sm',
                    {
                      onclick: () => {
                        sfx.nav();
                        startStructure(p);
                      },
                    },
                    '구조 표시',
                  )
                : null,
              qs.length
                ? h(
                    'button.btn.btn--ghost.btn--sm',
                    {
                      onclick: () => {
                        sfx.nav();
                        startQuestions(p);
                      },
                    },
                    '문항만 풀기',
                  )
                : null,
            ),
          );
        }),
      ),
    );

    if (nonfiction.length) {
      body.appendChild(
        h(
          'div.card.card--flat',
          { style: { marginTop: '24px' } },
          h('h3.h3', { style: { marginBottom: '10px' } }, '읽기 속도의 기준'),
          h(
            'div.grid.grid--4',
            statCard('250 어절/분', '느린 정독'),
            statCard('350 어절/분', '보통'),
            statCard('450 어절/분', '빠른 편'),
            statCard('550+ 어절/분', '훑어 읽기'),
          ),
          h(
            'p.tiny.muted',
            { style: { marginTop: '12px' } },
            '빠를수록 좋은 것은 아닙니다. 이해도가 유지되는 최고 속도를 찾는 것이 목표입니다.',
          ),
        ),
      );
    }

    enhance(body);
  }

  /* --------------------------- timed reading --------------------------- */
  function startTimedRead(p: Passage): void {
    body.replaceChildren();
    const started = Date.now();
    const eojeol = countEojeol(p);

    const stage = h(
      'div',
      { style: { maxWidth: '780px', marginInline: 'auto' } },
      h(
        'div.spread',
        { style: { marginBottom: '14px' } },
        h('div', h('b', p.title), h('span.small.muted', ` · ${p.source}`)),
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
      h(
        'div.card',
        h(
          `div.passage${p.domain === 'literature' ? '.passage--poem' : ''}`,
          { style: { maxHeight: 'none' } },
          ...p.body.map((para) => h('p', { html: para.replace(/\[(\d+)\]/g, '<mark>[$1]</mark>') })),
        ),
        h(
          'div.row',
          { style: { marginTop: '20px', justifyContent: 'center' } },
          h(
            'button.btn.btn--primary.btn--lg',
            {
              'data-magnetic': '',
              onclick: () => {
                const seconds = Math.max(1, (Date.now() - started) / 1000);
                const wpm = Math.round((eojeol / seconds) * 60);
                addMinutes(Math.max(1, Math.round(seconds / 60)));
                sfx.done();
                showSpeed(p, wpm, seconds);
              },
            },
            '다 읽었습니다',
          ),
        ),
        h('p.tiny.muted.center', { style: { marginTop: '10px' } }, '이해하며 읽으세요. 다 읽은 직후 문항으로 확인합니다.'),
      ),
    );
    body.appendChild(stage);
    enhance(body);
  }

  function showSpeed(p: Passage, wpm: number, seconds: number): void {
    const grade =
      wpm >= 520 ? '훑어 읽기 구간입니다. 이해도가 함께 유지되는지 문항으로 확인해 보세요.' :
      wpm >= 400 ? '빠른 편입니다. 이 속도에서 정답률이 유지되면 실전에서 유리합니다.' :
      wpm >= 300 ? '표준 속도입니다. 구조 표시를 병행하면 정확도가 올라갑니다.' :
      '정독 구간입니다. 지금은 속도보다 근거 찾기를 우선하세요.';

    body.replaceChildren(
      h(
        'div',
        { style: { maxWidth: '680px', marginInline: 'auto' } },
        h(
          'div.card',
          { style: { textAlign: 'center' } },
          h('div', { style: { fontSize: '2.4rem' } }, '⏱️'),
          h('h2.h1', { style: { marginTop: '6px' } }, `${wpm} 어절/분`),
          h('p.lede', { style: { marginInline: 'auto', marginTop: '8px' } }, grade),
          h(
            'div.stat-grid',
            { style: { marginTop: '24px' } },
            statCard(mmss(seconds), '소요 시간'),
            statCard(String(countEojeol(p)), '지문 분량(어절)'),
            statCard(`${Math.round(p.readSeconds / 60 * 10) / 10}분`, '권장 시간'),
          ),
          h(
            'div.row',
            { style: { justifyContent: 'center', marginTop: '24px' } },
            h(
              'button.btn.btn--primary',
              {
                onclick: () => {
                  sfx.nav();
                  startQuestions(p);
                },
              },
              '문항으로 이해도 확인 →',
            ),
            h(
              'button.btn.btn--ghost',
              {
                onclick: () => {
                  sfx.tap();
                  renderHome();
                },
              },
              '훈련실로',
            ),
          ),
        ),
      ),
    );
    enhance(body);
  }

  /* -------------------------- structure marking ------------------------- */
  function startStructure(p: Passage): void {
    body.replaceChildren();
    const picks: (string | null)[] = p.body.map(() => null);

    const stage = h('div', { style: { maxWidth: '820px', marginInline: 'auto' } });
    const rebuild = () => {
      stage.replaceChildren(
        h(
          'div.spread',
          { style: { marginBottom: '14px' } },
          h('div', h('b', p.title), h('span.small.muted', ' · 문단 기능 표시')),
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
        h(
          'p.small.muted',
          { style: { marginBottom: '16px' } },
          '각 문단이 글에서 맡은 역할을 골라 보세요. 정답은 하나로 정해져 있지 않지만, 스스로 이름을 붙이는 과정 자체가 훈련입니다.',
        ),
        ...p.body.map((para, i) =>
          h(
            'div.card',
            { style: { marginBottom: '12px' } },
            h('p', { style: { marginBottom: '12px', lineHeight: '1.85' }, html: para.replace(/\[(\d+)\]/g, '<mark>[$1]</mark>') }),
            h(
              'div.chips',
              ...STRUCTURE_TAGS.map((tag) =>
                h(
                  `button.chip${picks[i] === tag ? '.is-on' : ''}`,
                  {
                    onclick: () => {
                      sfx.tap();
                      picks[i] = picks[i] === tag ? null : tag;
                      rebuild();
                    },
                  },
                  tag,
                ),
              ),
            ),
          ),
        ),
        h(
          'div.card.card--flat',
          h('h3.h3', { style: { marginBottom: '10px' } }, '표시 요약'),
          h(
            'div.small',
            { style: { lineHeight: '2' } },
            ...picks.map((tag, i) => h('div', `${i + 1}문단 — ${tag ?? '미표시'}`)),
          ),
          h(
            'div.row',
            { style: { marginTop: '16px' } },
            h(
              'button.btn.btn--primary',
              {
                onclick: () => {
                  const filled = picks.filter(Boolean).length;
                  if (filled < p.body.length) {
                    toast(`${p.body.length - filled}개 문단이 남았습니다`, '📝', 1800);
                    return;
                  }
                  addMinutes(3);
                  sfx.done();
                  startQuestions(p);
                },
              },
              '문항으로 확인하기 →',
            ),
          ),
        ),
      );
      enhance(stage);
    };
    rebuild();
    body.appendChild(stage);
  }

  /* ----------------------------- questions ----------------------------- */
  function startQuestions(p: Passage): void {
    const set = shuffle(queryQuestions({}).filter((q) => q.passageId === p.id));
    if (!set.length) {
      toast('이 지문에는 연결된 문항이 없습니다', '📄');
      renderHome();
      return;
    }
    body.replaceChildren();
    quiz = createQuiz({
      questions: set,
      mode: 'practice',
      onExit: () => renderHome(),
      onFinish: (result) => {
        quiz?.destroy();
        quiz = null;
        body.replaceChildren(
          quizSummary(result, [
            h(
              'button.btn.btn--primary',
              {
                onclick: () => {
                  sfx.tap();
                  renderHome();
                },
              },
              '훈련실로 돌아가기',
            ),
            h(
              'button.btn.btn--ghost',
              {
                onclick: () => {
                  sfx.tap();
                  go('practice', { domain: p.domain });
                },
              },
              '같은 영역 더 풀기',
            ),
          ]),
        );
        enhance(body);
      },
    });
    body.appendChild(quiz.el);
  }

  renderHome();

  return {
    el,
    title: '독해 훈련실',
    destroy() {
      quiz?.destroy();
      void store;
    },
  };
}

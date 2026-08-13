import { sfx } from '../core/audio';
import { h, shuffle } from '../core/dom';
import { enhance } from '../core/motion';
import { go, replace, type ViewHandle } from '../core/router';
import { accuracy, store } from '../core/store';
import { DOMAINS, DOMAIN_HUE, DOMAIN_ICON, DOMAIN_LABEL, LEVEL_LABEL, type Domain, type Level } from '../core/types';
import { queryQuestions, topicsFor } from '../data/questions';
import { chipRow, emptyState, sectionHead, toast } from '../ui/components';
import { createQuiz, quizSummary, type QuizHandle } from '../ui/QuizRunner';

const SET_SIZES = [5, 10, 20];

export function practiceView(params: URLSearchParams): ViewHandle {
  const el = h('div.wrap.section--tight');
  let quiz: QuizHandle | null = null;

  let domain = (params.get('domain') ?? 'all') as Domain | 'all';
  let level = (params.get('level') ?? 'all') as Level | 'all';
  let topic = params.get('topic') ?? '';
  let size = Number(params.get('size') ?? 10);
  const autostart = params.get('start') === '1';

  const body = h('div');
  el.appendChild(body);

  function syncUrl(): void {
    replace('practice', {
      domain: domain === 'all' ? undefined : domain,
      level: level === 'all' ? undefined : String(level),
      topic: topic || undefined,
      size: String(size),
    });
  }

  function pool() {
    return queryQuestions({
      domain,
      level: level === 'all' ? 'all' : (Number(level) as Level),
      topic: topic || undefined,
    });
  }

  /* ------------------------------ setup ------------------------------ */
  function renderSetup(): void {
    quiz?.destroy();
    quiz = null;
    body.replaceChildren();

    const available = pool();
    const p = store.profile;

    body.appendChild(
      sectionHead(
        'practice',
        '문제 풀이',
        '영역과 난이도를 고르면 그 자리에서 세트가 만들어집니다. 해설은 매 문항 바로 확인할 수 있습니다.',
      ),
    );

    // Domain accuracy strip — makes the weak area obvious before choosing.
    body.appendChild(
      h(
        'div.grid.grid--4',
        { style: { marginBottom: '30px' }, 'data-reveal-stagger': '40' },
        ...DOMAINS.map((d) => {
          const t = p.byDomain[d];
          const on = domain === d;
          return h(
            'button.card.card--link',
            {
              'data-reveal': '',
              style: {
                padding: '18px',
                textAlign: 'left',
                borderColor: on ? `hsl(${DOMAIN_HUE[d]} 70% 58%)` : undefined,
                borderWidth: on ? '2px' : undefined,
              },
              onclick: () => {
                sfx.tap();
                domain = on ? 'all' : d;
                topic = '';
                syncUrl();
                renderSetup();
              },
            },
            h('div', { style: { fontSize: '1.4rem', marginBottom: '8px' } }, DOMAIN_ICON[d]),
            h('div', { style: { fontWeight: '650' } }, DOMAIN_LABEL[d]),
            h(
              'div.tiny.muted',
              t.seen ? `${t.correct}/${t.seen} · 정답률 ${Math.round(accuracy(t) * 100)}%` : '아직 기록 없음',
            ),
          );
        }),
      ),
    );

    const controls = h('div.card', { style: { marginBottom: '24px' } });

    controls.appendChild(h('div.small', { style: { fontWeight: '700', marginBottom: '9px' } }, '난이도'));
    controls.appendChild(
      chipRow(
        [
          { value: 'all', label: '전체' },
          { value: '1', label: `★ ${LEVEL_LABEL[1]}` },
          { value: '2', label: `★★ ${LEVEL_LABEL[2]}` },
          { value: '3', label: `★★★ ${LEVEL_LABEL[3]}` },
        ],
        String(level),
        (v) => {
          level = v === 'all' ? 'all' : (Number(v) as Level);
          syncUrl();
          renderSetup();
        },
        true,
      ),
    );

    const topics = topicsFor(domain);
    if (topics.length > 1) {
      controls.appendChild(
        h('div.small', { style: { fontWeight: '700', margin: '20px 0 9px' } }, `세부 유형 (${topics.length})`),
      );
      controls.appendChild(
        chipRow(
          [{ value: '', label: '전체' }, ...topics.map((t) => ({ value: t, label: t }))],
          topic,
          (v) => {
            topic = v;
            syncUrl();
            renderSetup();
          },
        ),
      );
    }

    controls.appendChild(h('div.small', { style: { fontWeight: '700', margin: '20px 0 9px' } }, '문항 수'));
    controls.appendChild(
      chipRow(
        SET_SIZES.map((n) => ({ value: String(n), label: `${n}문항` })),
        String(size),
        (v) => {
          size = Number(v);
          syncUrl();
          renderSetup();
        },
        true,
      ),
    );

    controls.appendChild(h('div.divider'));
    controls.appendChild(
      h(
        'div.spread',
        h(
          'div',
          h('div', { style: { fontWeight: '650' } }, `${Math.min(size, available.length)}문항 준비됨`),
          h('div.tiny.muted', `조건에 맞는 문항 ${available.length}개 중에서 무작위로 뽑습니다.`),
        ),
        h(
          'button.btn.btn--primary',
          {
            disabled: available.length === 0,
            'data-magnetic': '',
            onclick: () => {
              sfx.nav();
              start();
            },
          },
          '풀기 시작 →',
        ),
      ),
    );
    body.appendChild(controls);

    if (available.length === 0) {
      body.appendChild(
        emptyState(
          '🗂️',
          '조건에 맞는 문항이 없습니다',
          '난이도나 유형 조건을 넓혀 보세요.',
          h(
            'button.btn.btn--ghost',
            {
              onclick: () => {
                domain = 'all';
                level = 'all';
                topic = '';
                syncUrl();
                renderSetup();
              },
            },
            '조건 초기화',
          ),
        ),
      );
    }

    // Quick-start shortcuts.
    body.appendChild(
      h(
        'div.card.card--flat',
        h('div.small', { style: { fontWeight: '700', marginBottom: '10px' } }, '빠른 시작'),
        h(
          'div.chips',
          h(
            'button.chip',
            {
              onclick: () => {
                domain = 'all';
                level = 'all';
                topic = '';
                size = 10;
                syncUrl();
                start();
              },
            },
            '🎲 전 영역 랜덤 10문항',
          ),
          h(
            'button.chip',
            {
              onclick: () => {
                const weak = [...DOMAINS].sort((a, b) => {
                  const ta = p.byDomain[a];
                  const tb = p.byDomain[b];
                  return (ta.seen ? accuracy(ta) : 0.55) - (tb.seen ? accuracy(tb) : 0.55);
                })[0];
                domain = weak;
                level = 'all';
                topic = '';
                size = 10;
                syncUrl();
                toast(`가장 약한 영역: ${DOMAIN_LABEL[weak]}`, '🎯', 2000);
                start();
              },
            },
            '🎯 약점 영역 집중',
          ),
          h(
            'button.chip',
            {
              onclick: () => {
                domain = 'all';
                level = 3;
                topic = '';
                size = 5;
                syncUrl();
                start();
              },
            },
            '🔥 심화 5문항',
          ),
          h(
            'button.chip',
            {
              onclick: () => {
                sfx.tap();
                go('review');
              },
            },
            `♻️ 오답노트 (${p.wrong.length})`,
          ),
        ),
      ),
    );

    enhance(body);
  }

  /* ------------------------------- run ------------------------------- */
  function start(): void {
    const available = pool();
    if (!available.length) return;
    const picked = shuffle(available).slice(0, size);

    body.replaceChildren();
    quiz = createQuiz({
      questions: picked,
      mode: 'practice',
      onExit: () => renderSetup(),
      onFinish: (result) => {
        quiz?.destroy();
        quiz = null;
        body.replaceChildren();
        body.appendChild(
          quizSummary(result, [
            h(
              'button.btn.btn--primary',
              {
                onclick: () => {
                  sfx.nav();
                  start();
                },
              },
              '한 세트 더',
            ),
            h(
              'button.btn.btn--ghost',
              {
                onclick: () => {
                  sfx.tap();
                  renderSetup();
                },
              },
              '조건 바꾸기',
            ),
            h(
              'button.btn.btn--ghost',
              {
                onclick: () => {
                  sfx.tap();
                  go('dashboard');
                },
              },
              '리포트 보기',
            ),
          ]),
        );
        enhance(body);
      },
    });
    body.appendChild(quiz.el);
  }

  if (autostart && pool().length) start();
  else renderSetup();

  return {
    el,
    title: '문제 풀이',
    destroy() {
      quiz?.destroy();
    },
  };
}

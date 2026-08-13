import { sfx } from '../core/audio';
import { h, mmss, pct, shuffle } from '../core/dom';
import { enhance } from '../core/motion';
import { go, type ViewHandle } from '../core/router';
import { store } from '../core/store';
import { DOMAINS, DOMAIN_LABEL, type Question } from '../core/types';
import { QUESTIONS } from '../data/questions';
import { chipRow, sectionHead, statCard, toast } from '../ui/components';
import { createQuiz, quizSummary, type QuizHandle } from '../ui/QuizRunner';

interface MockPreset {
  id: string;
  name: string;
  count: number;
  minutes: number;
  desc: string;
}

const PRESETS: MockPreset[] = [
  { id: 'sprint', name: '스프린트', count: 10, minutes: 12, desc: '짧게 감각만 점검합니다.' },
  { id: 'half', name: '하프', count: 20, minutes: 26, desc: '실전의 절반 분량으로 페이스를 만듭니다.' },
  { id: 'full', name: '풀세트', count: 30, minutes: 42, desc: '집중력이 흔들리는 구간까지 확인합니다.' },
];

/** Spread the set across domains so a mock never becomes a single-topic quiz. */
function buildMockSet(count: number): Question[] {
  const perDomain = Math.ceil(count / DOMAINS.length);
  const picked: Question[] = [];
  for (const d of DOMAINS) {
    picked.push(...shuffle(QUESTIONS.filter((q) => q.domain === d)).slice(0, perDomain));
  }
  const rest = shuffle(QUESTIONS.filter((q) => !picked.includes(q)));
  while (picked.length < count && rest.length) picked.push(rest.pop() as Question);
  // Order by domain so the paper reads like a real exam section by section.
  return picked
    .slice(0, count)
    .sort((a, b) => DOMAINS.indexOf(a.domain) - DOMAINS.indexOf(b.domain));
}

export function mockView(): ViewHandle {
  const el = h('div.wrap.section--tight');
  const body = h('div');
  el.appendChild(body);
  let quiz: QuizHandle | null = null;
  let preset = PRESETS[1];

  function renderIntro(): void {
    quiz?.destroy();
    quiz = null;
    body.replaceChildren();

    const mocks = store.profile.mocks;
    const best = mocks.length ? Math.max(...mocks.map((m) => m.correct / m.total)) : 0;

    body.appendChild(
      sectionHead(
        'mock exam',
        '모의고사',
        '제한 시간 안에서 <b>넘어가는 판단</b>을 연습합니다. 해설은 끝난 뒤 한 번에 확인합니다.',
      ),
    );

    body.appendChild(
      h(
        'div.card',
        { style: { marginBottom: '24px' } },
        h('div.small', { style: { fontWeight: '700', marginBottom: '10px' } }, '분량 선택'),
        chipRow(
          PRESETS.map((p) => ({ value: p.id, label: `${p.name} · ${p.count}문항 ${p.minutes}분` })),
          preset.id,
          (v) => {
            preset = PRESETS.find((p) => p.id === v) ?? PRESETS[1];
            renderIntro();
          },
          true,
        ),
        h('p.small.muted', { style: { marginTop: '12px' } }, preset.desc),
        h('div.divider'),
        h(
          'div.spread',
          h(
            'div.small.muted',
            `문항당 평균 ${((preset.minutes * 60) / preset.count).toFixed(0)}초 · 다섯 영역이 고르게 출제됩니다.`,
          ),
          h(
            'button.btn.btn--primary',
            {
              'data-magnetic': '',
              onclick: () => {
                sfx.nav();
                start();
              },
            },
            '시험 시작 →',
          ),
        ),
      ),
    );

    body.appendChild(
      h(
        'div.grid.grid--4',
        { style: { marginBottom: '26px' }, 'data-reveal-stagger': '50' },
        statCard(String(mocks.length), '응시 횟수'),
        statCard(mocks.length ? pct(best) : '—', '최고 정답률'),
        statCard(
          mocks.length ? pct(mocks.reduce((s, m) => s + m.correct / m.total, 0) / mocks.length) : '—',
          '평균 정답률',
        ),
        statCard(mocks.length ? mmss(mocks[mocks.length - 1].seconds) : '—', '최근 소요'),
      ),
    );

    body.appendChild(
      h(
        'div.card.card--flat',
        h('h3.h3', { style: { marginBottom: '12px' } }, '시험장 규칙 세 가지'),
        h(
          'ul.list-check',
          h('li', '한 문항에 2분을 넘기면 표시하고 넘어갑니다. 넘어가는 것도 실력입니다.'),
          h('li', '선택지를 고를 때 지문의 근거 위치를 머릿속으로 한 번 짚습니다.'),
          h('li', '끝나고 나서 <b>맞힌 문제</b>의 근거도 확인합니다. 찍어서 맞힌 것을 걸러 내기 위해서입니다.'),
        ),
      ),
    );

    if (mocks.length) {
      body.appendChild(
        h(
          'div.card',
          { style: { marginTop: '24px' } },
          h('h3.h3', { style: { marginBottom: '14px' } }, '응시 기록'),
          h(
            'div.stack',
            { style: { gap: '8px' } },
            ...[...mocks].reverse().slice(0, 8).map((m) =>
              h(
                'div.card.card--flat.card--pad-s',
                h(
                  'div.spread',
                  h(
                    'div',
                    h('div.small', { style: { fontWeight: '650' } }, new Date(m.at).toLocaleString('ko-KR')),
                    h('div.tiny.muted', `${m.total}문항 · ${mmss(m.seconds)}`),
                  ),
                  h('span.tag', `${m.correct}/${m.total} · ${pct(m.correct / m.total)}`),
                ),
              ),
            ),
          ),
        ),
      );
    }

    enhance(body);
  }

  function start(): void {
    const set = buildMockSet(preset.count);
    body.replaceChildren();
    toast(`${preset.name} 시작 — ${preset.minutes}분`, '⏱️');

    quiz = createQuiz({
      questions: set,
      mode: 'mock',
      deferFeedback: true,
      limitSeconds: preset.minutes * 60,
      onExit: () => renderIntro(),
      onFinish: (result) => {
        quiz?.destroy();
        quiz = null;
        const correct = result.answers.filter((a) => a.correct).length;
        store.update((p) => {
          p.mocks.push({ at: Date.now(), correct, total: result.answers.length, seconds: result.seconds });
          p.xp += 40;
        });
        sfx.done();

        // Per-domain breakdown of this paper.
        const rows = DOMAINS.map((d) => {
          const inD = result.answers.filter((a) => a.q.domain === d);
          return { d, seen: inD.length, ok: inD.filter((a) => a.correct).length };
        }).filter((r) => r.seen > 0);

        body.replaceChildren();
        body.appendChild(
          quizSummary(result, [
            h(
              'button.btn.btn--primary',
              {
                onclick: () => {
                  sfx.nav();
                  go('review');
                },
              },
              '오답노트로 이동',
            ),
            h(
              'button.btn.btn--ghost',
              {
                onclick: () => {
                  sfx.tap();
                  renderIntro();
                },
              },
              '다시 응시',
            ),
          ]),
        );
        body.insertBefore(
          h(
            'div.card',
            { style: { marginBottom: '18px' } },
            h('h3.h3', { style: { marginBottom: '12px' } }, '영역별 성적'),
            h(
              'div.grid.grid--4',
              ...rows.map((r) =>
                h(
                  'div.card.card--flat.card--pad-s',
                  h('div.tiny.muted', DOMAIN_LABEL[r.d]),
                  h('div', { style: { fontWeight: '700', fontSize: '1.15rem' } }, `${r.ok}/${r.seen}`),
                ),
              ),
            ),
          ),
          body.firstChild,
        );
        enhance(body);
      },
    });
    body.appendChild(quiz.el);
  }

  renderIntro();

  return {
    el,
    title: '모의고사',
    destroy() {
      quiz?.destroy();
    },
  };
}

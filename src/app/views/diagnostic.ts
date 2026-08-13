import { sfx } from '../core/audio';
import { h, mmss, pct, shuffle } from '../core/dom';
import { burst, enhance } from '../core/motion';
import { go, type ViewHandle } from '../core/router';
import { accuracy, store } from '../core/store';
import {
  DOMAINS,
  DOMAIN_HUE,
  DOMAIN_LABEL,
  SKILLS,
  type DiagnosticResult,
  type Domain,
  type Question,
  type Skill,
  type Tally,
} from '../core/types';
import { QUESTIONS } from '../data/questions';
import { emptyState, progressRow, radar, sectionHead, statCard } from '../ui/components';
import { createQuiz, quizSummary, scoreBand, type QuizHandle } from '../ui/QuizRunner';

/** 15 questions: balanced across skills first, then across domains. */
function buildDiagnosticSet(): Question[] {
  const picked: Question[] = [];
  const used = new Set<string>();

  // Two per competency (12), preferring a spread of difficulty.
  for (const skill of SKILLS) {
    const bySkill = shuffle(QUESTIONS.filter((q) => q.skill === skill));
    const easy = bySkill.find((q) => q.level <= 2 && !used.has(q.id));
    const hard = bySkill.find((q) => q.level >= 2 && !used.has(q.id) && q.id !== easy?.id);
    for (const q of [easy, hard]) {
      if (q && !used.has(q.id)) {
        used.add(q.id);
        picked.push(q);
      }
    }
  }

  // Top up to 15 with domains that are still thin in the set.
  const counts = new Map<Domain, number>(DOMAINS.map((d) => [d, 0]));
  for (const q of picked) counts.set(q.domain, (counts.get(q.domain) ?? 0) + 1);
  const thin = [...counts.entries()].sort((a, b) => a[1] - b[1]).map(([d]) => d);

  for (const d of thin) {
    if (picked.length >= 15) break;
    const extra = shuffle(QUESTIONS.filter((q) => q.domain === d && !used.has(q.id)))[0];
    if (extra) {
      used.add(extra.id);
      picked.push(extra);
    }
  }
  while (picked.length < 15) {
    const extra = shuffle(QUESTIONS.filter((q) => !used.has(q.id)))[0];
    if (!extra) break;
    used.add(extra.id);
    picked.push(extra);
  }

  return shuffle(picked).slice(0, 15);
}

const BAND_LABEL = [
  '', '기초 다지기', '기본 정착', '개념 적용', '평균 근접', '평균 상회',
  '안정권', '상위권', '최상위 근접', '최상위',
];

function adviceFor(weakest: Skill, weakDomain: Domain): string[] {
  const bySkill: Record<Skill, string> = {
    '사실적 이해': '지문에서 답의 근거가 되는 문장을 손으로 짚는 훈련부터 시작하세요. 선택지마다 “몇 문단 몇 번째 문장”을 적어 보면 정확도가 빠르게 올라갑니다.',
    '추론적 이해': '문장과 문장 사이의 생략된 고리를 채우는 연습이 필요합니다. 문단을 읽고 “그래서 결국?”을 한 문장으로 요약해 보세요.',
    '비판적 이해': '글쓴이의 전제를 찾아내는 훈련을 권합니다. “이 주장이 성립하려면 무엇이 참이어야 하는가”를 매번 물어보세요.',
    '어휘·어법': '개념 사전의 문법 카드를 순서대로 읽고, 맞춤법 스피드 퀴즈를 매일 3분씩 돌리는 것이 가장 빠릅니다.',
    '문학 감상': '화자·상황·태도의 3단 메모를 시 한 편마다 남겨 보세요. 표현법은 “반어 vs 역설”처럼 짝으로 외우면 헷갈리지 않습니다.',
    '논리·구성': '개요를 먼저 쓰고 글을 쓰는 습관이 필요합니다. 논술 훈련실의 개요 칸을 채우지 않고는 본문을 쓰지 마세요.',
  };
  return [
    bySkill[weakest],
    `영역으로는 ${DOMAIN_LABEL[weakDomain]}의 정답률이 가장 낮습니다. 다음 2주는 ${DOMAIN_LABEL[weakDomain]} 비중을 40% 이상으로 잡으세요.`,
    '오답노트에 쌓인 문항은 두 번 연속 맞히면 자동으로 졸업합니다. 매 학습 시작 시 3문항씩 복습하는 것을 루틴에 넣어 두었습니다.',
  ];
}

export function diagnosticView(): ViewHandle {
  const el = h('div.wrap.section--tight');
  let quiz: QuizHandle | null = null;
  const body = h('div');
  el.appendChild(body);

  function renderIntro(): void {
    body.replaceChildren();
    const past = store.profile.diagnostics;

    body.appendChild(
      sectionHead(
        'diagnostic',
        '진단 평가',
        '15문항 · 약 12분. 점수가 아니라 <b>여섯 개 역량의 균형</b>을 봅니다. 결과는 그대로 학습 루틴의 설계도가 됩니다.',
      ),
    );

    body.appendChild(
      h(
        'div.grid.grid--2',
        { style: { marginBottom: '26px' }, 'data-reveal-stagger': '60' },
        h(
          'div.card',
          { 'data-reveal': '', 'data-tilt': '6' },
          h('h3.h3', { style: { marginBottom: '12px' } }, '무엇을 재나요'),
          h(
            'ul.list-check',
            ...SKILLS.map((s) => h('li', s)),
          ),
        ),
        h(
          'div.card',
          { 'data-reveal': '', 'data-tilt': '6' },
          h('h3.h3', { style: { marginBottom: '12px' } }, '진행 방식'),
          h(
            'ul.list-check',
            h('li', '문항마다 해설은 <b>마지막에</b> 한 번에 보여 줍니다'),
            h('li', '모르는 문항은 “넘기기”로 건너뛸 수 있습니다'),
            h('li', '제한 시간은 없지만 소요 시간을 기록합니다'),
            h('li', '결과는 이 브라우저에만 저장됩니다'),
          ),
        ),
      ),
    );

    body.appendChild(
      h(
        'div.row',
        { style: { marginBottom: '34px' } },
        h(
          'button.btn.btn--primary.btn--lg',
          {
            'data-magnetic': '',
            onclick: () => {
              sfx.nav();
              start();
            },
          },
          past.length ? '다시 진단하기' : '진단 시작하기',
          h('span', '→'),
        ),
        past.length
          ? h(
              'button.btn.btn--ghost',
              {
                onclick: () => {
                  sfx.tap();
                  renderReport(past[past.length - 1], past[past.length - 2]);
                },
              },
              '최근 결과 다시 보기',
            )
          : null,
      ),
    );

    if (past.length) {
      body.appendChild(
        h(
          'div.card',
          h('h3.h3', { style: { marginBottom: '14px' } }, `진단 이력 (${past.length}회)`),
          h(
            'div.stack',
            { style: { gap: '8px' } },
            ...[...past].reverse().map((d) =>
              h(
                'button.card.card--flat.card--pad-s',
                {
                  style: { textAlign: 'left', width: '100%' },
                  onclick: () => {
                    sfx.tap();
                    const idx = past.indexOf(d);
                    renderReport(d, idx > 0 ? past[idx - 1] : undefined);
                  },
                },
                h(
                  'div.spread',
                  h(
                    'div',
                    h('div.small', { style: { fontWeight: '650' } }, new Date(d.at).toLocaleDateString('ko-KR')),
                    h('div.tiny.muted', `${d.correct}/${d.total} · ${mmss(d.seconds)}`),
                  ),
                  h('span.tag', `${BAND_LABEL[d.band]} (${d.band}단계)`),
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
    const set = buildDiagnosticSet();
    body.replaceChildren();
    quiz = createQuiz({
      questions: set,
      mode: 'diagnostic',
      deferFeedback: true,
      onExit: () => renderIntro(),
      onFinish: (result) => {
        quiz?.destroy();
        quiz = null;

        const bySkill = {} as Record<Skill, Tally>;
        for (const s of SKILLS) bySkill[s] = { seen: 0, correct: 0 };
        const byDomain = {} as Record<Domain, Tally>;
        for (const d of DOMAINS) byDomain[d] = { seen: 0, correct: 0 };

        for (const a of result.answers) {
          bySkill[a.q.skill].seen += 1;
          byDomain[a.q.domain].seen += 1;
          if (a.correct) {
            bySkill[a.q.skill].correct += 1;
            byDomain[a.q.domain].correct += 1;
          }
        }

        const correct = result.answers.filter((a) => a.correct).length;
        const record: DiagnosticResult = {
          at: Date.now(),
          total: result.answers.length,
          correct,
          bySkill,
          byDomain,
          band: scoreBand(result.answers.length ? correct / result.answers.length : 0),
          seconds: result.seconds,
        };

        const previous = store.profile.diagnostics[store.profile.diagnostics.length - 1];
        store.update((p) => {
          p.diagnostics.push(record);
          p.xp += 60;
        });
        sfx.levelUp();
        burst(window.innerWidth / 2, window.innerHeight / 3, 265, 40);

        body.replaceChildren();
        body.appendChild(
          quizSummary(result, [
            h(
              'button.btn.btn--primary',
              {
                onclick: () => {
                  sfx.nav();
                  renderReport(record, previous);
                },
              },
              '역량 리포트 보기 →',
            ),
          ]),
        );
        enhance(body);
      },
    });
    body.appendChild(quiz.el);
  }

  function renderReport(d: DiagnosticResult, previous?: DiagnosticResult): void {
    body.replaceChildren();

    const skillValues = SKILLS.map((s) => {
      const t = d.bySkill[s];
      return t.seen ? t.correct / t.seen : 0;
    });
    const prevValues = previous
      ? SKILLS.map((s) => {
          const t = previous.bySkill[s];
          return t.seen ? t.correct / t.seen : 0;
        })
      : null;

    const scored = SKILLS.map((s, i) => ({ skill: s, value: skillValues[i], seen: d.bySkill[s].seen }))
      .filter((x) => x.seen > 0)
      .sort((a, b) => a.value - b.value);
    const weakest = scored[0]?.skill ?? SKILLS[0];
    const strongest = scored[scored.length - 1]?.skill ?? SKILLS[0];

    const domainScored = DOMAINS.map((dm) => ({ domain: dm, t: d.byDomain[dm] }))
      .filter((x) => x.t.seen > 0)
      .sort((a, b) => accuracy(a.t) - accuracy(b.t));
    const weakDomain = domainScored[0]?.domain ?? 'nonfiction';

    body.appendChild(
      sectionHead(
        'report',
        '진단 리포트',
        `${new Date(d.at).toLocaleString('ko-KR')} 기준 · ${d.total}문항 ${mmss(d.seconds)} 소요`,
      ),
    );

    body.appendChild(
      h(
        'div.stat-grid',
        { style: { marginBottom: '26px' }, 'data-reveal-stagger': '50' },
        statCard(`${d.correct}/${d.total}`, '정답 수'),
        statCard(pct(d.correct / d.total), '정답률'),
        statCard(`${d.band}단계`, '종합 밴드', BAND_LABEL[d.band]),
        statCard(mmss(d.seconds), '소요 시간'),
      ),
    );

    body.appendChild(
      h(
        'div.grid.grid--2',
        { style: { marginBottom: '26px' } },
        h(
          'div.card',
          { 'data-reveal': '' },
          h('h3.h3', { style: { marginBottom: '4px' } }, '역량 레이더'),
          h(
            'p.tiny.muted',
            { style: { marginBottom: '10px' } },
            prevValues ? '점선은 직전 진단 결과입니다.' : '다음 진단 때 이 도형과 겹쳐서 비교합니다.',
          ),
          radar(
            SKILLS.map((s) => s.replace('·', '·​')),
            prevValues
              ? [{ values: prevValues, className: 'shape--prev' }, { values: skillValues }]
              : [{ values: skillValues }],
            Math.min(340, window.innerWidth - 96),
          ),
        ),
        h(
          'div.card',
          { 'data-reveal': '' },
          h('h3.h3', { style: { marginBottom: '16px' } }, '영역별 정답률'),
          ...DOMAINS.filter((dm) => d.byDomain[dm].seen > 0).map((dm) =>
            progressRow(
              DOMAIN_LABEL[dm],
              accuracy(d.byDomain[dm]),
              DOMAIN_HUE[dm],
              `${d.byDomain[dm].correct}/${d.byDomain[dm].seen}`,
            ),
          ),
          h('div.divider'),
          h(
            'div.stack',
            { style: { gap: '8px' } },
            h(
              'div.spread',
              h('span.small.muted', '가장 강한 역량'),
              h('span.small', { style: { fontWeight: '700', color: 'var(--ok)' } }, strongest),
            ),
            h(
              'div.spread',
              h('span.small.muted', '가장 약한 역량'),
              h('span.small', { style: { fontWeight: '700', color: 'var(--bad)' } }, weakest),
            ),
          ),
        ),
      ),
    );

    body.appendChild(
      h(
        'div.card',
        { 'data-reveal': '', style: { marginBottom: '26px' } },
        h('h3.h3', { style: { marginBottom: '14px' } }, '처방'),
        h('ul.list-check', ...adviceFor(weakest, weakDomain).map((a) => h('li', { html: a }))),
      ),
    );

    body.appendChild(
      h(
        'div.row',
        h(
          'button.btn.btn--primary.btn--lg',
          {
            'data-magnetic': '',
            onclick: () => {
              sfx.nav();
              go('routine', { from: 'diagnostic' });
            },
          },
          '이 결과로 루틴 만들기 →',
        ),
        h(
          'button.btn.btn--ghost',
          {
            onclick: () => {
              sfx.tap();
              go('practice', { domain: weakDomain });
            },
          },
          `${DOMAIN_LABEL[weakDomain]} 바로 풀기`,
        ),
        h(
          'button.btn.btn--ghost',
          {
            onclick: () => {
              sfx.tap();
              renderIntro();
            },
          },
          '진단 화면으로',
        ),
      ),
    );

    enhance(body);
    window.scrollTo({ top: 0 });
  }

  if (QUESTIONS.length < 15) {
    body.appendChild(emptyState('⚠️', '문항이 부족합니다', '문항 은행을 확인해 주세요.'));
  } else {
    renderIntro();
  }

  return {
    el,
    title: '진단 평가',
    destroy() {
      quiz?.destroy();
    },
  };
}

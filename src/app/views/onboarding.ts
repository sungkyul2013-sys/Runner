/**
 * 3분 체험 — the guided first run.
 *
 * A newcomer should not have to guess what this place is. In one continuous
 * pass they take a real diagnostic, see the report it produces, learn one thing
 * the way 수 국어논술 teaches it, meet a vocabulary card, and leave with a study
 * routine already built. Nothing here is a mock-up: every step writes to the
 * same profile the rest of the app reads.
 */

import { sfx } from '../core/audio';
import { clamp, h, pct, shuffle } from '../core/dom';
import { burst, burstFrom, enhance } from '../core/motion';
import { go, type ViewHandle } from '../core/router';
import { accuracy, store, touchStreak } from '../core/store';
import {
  DOMAINS,
  DOMAIN_LABEL,
  SKILLS,
  type DiagnosticResult,
  type Domain,
  type Question,
  type Skill,
  type Tally,
} from '../core/types';
import { BRAND } from '../data/academy';
import { CONCEPTS } from '../data/concepts';
import { QUESTIONS } from '../data/questions';
import { WEEKDAY_LABEL, buildRoutine } from '../data/routineBuilder';
import { STAGES } from '../data/stages';
import { VOCAB } from '../data/vocab';
import { radar } from '../ui/components';
import { rosette, seal } from '../ui/ornament';
import { createQuiz, scoreBand, type QuizHandle } from '../ui/QuizRunner';

const STEPS = ['환영', '진단', '리포트', '수업', '어휘', '루틴', '완료'] as const;
type Step = number;

/** One question per competency, easy end first — a five-minute read of the learner. */
function miniDiagnostic(): Question[] {
  const picked: Question[] = [];
  const used = new Set<string>();
  for (const skill of SKILLS) {
    const pool = shuffle(QUESTIONS.filter((q) => q.skill === skill && q.level <= 2 && !q.passageId));
    const q = pool.find((x) => !used.has(x.id)) ?? shuffle(QUESTIONS.filter((x) => x.skill === skill))[0];
    if (q && !used.has(q.id)) {
      used.add(q.id);
      picked.push(q);
    }
  }
  return picked.slice(0, 6);
}

export function onboardingView(): ViewHandle {
  const el = h('div.ob');
  let step: Step = 0;
  let quiz: QuizHandle | null = null;

  /** Filled in as the learner moves through the course. */
  let report: DiagnosticResult | null = null;
  let weakDomain: Domain = 'nonfiction';
  let weakSkill: Skill = SKILLS[0];
  let lessonCorrect = 0;
  let lessonTotal = 0;
  let vocabSeen = false;
  let routineMade = false;

  const rail = h('div.ob__rail');
  const stage = h('div.ob__stage');
  el.append(
    h(
      'header.ob__top',
      h(
        'div.ob__brand',
        h('span.ob__mark', '수'),
        h('span.ob__brandname', BRAND.name),
      ),
      h(
        'button.ob__skip',
        {
          onclick: () => {
            sfx.tap();
            finish(false);
          },
        },
        '건너뛰기',
      ),
    ),
    rail,
    stage,
  );

  function paintRail(): void {
    rail.replaceChildren(
      ...STEPS.map((label, i) =>
        h(
          'div',
          { class: `ob__pip${i === step ? ' is-on' : ''}${i < step ? ' is-done' : ''}`, title: label },
          h('i'),
        ),
      ),
    );
  }

  function goTo(next: Step): void {
    quiz?.destroy();
    quiz = null;
    step = next;
    paintRail();
    stage.replaceChildren();
    stage.classList.remove('is-in');
    RENDERERS[step]();
    void stage.offsetWidth;
    stage.classList.add('is-in');
    enhance(stage);
    el.scrollIntoView({ block: 'start' });
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }

  function panel(
    eyebrow: string,
    title: string,
    lede: string,
    ...content: (Node | null)[]
  ): HTMLElement {
    return h(
      'div.ob__panel',
      h('div.ob__eyebrow', eyebrow),
      h('h1.ob__title', title),
      h('p.ob__lede', { html: lede }),
      ...content,
    );
  }

  function nextBtn(label: string, onClick: () => void, ghost = false): HTMLElement {
    return h(
      `button.btn${ghost ? '.btn--ghost' : '.btn--primary'}.btn--lg.btn--block`,
      {
        onclick: () => {
          sfx.nav();
          onClick();
        },
      },
      label,
    );
  }

  /* ------------------------------ 0. 환영 ------------------------------ */
  function renderWelcome(): void {
    const mark = h('div.ob__hero', h('span.ob__hero-seal', seal('수')));
    mark.appendChild(h('span.ob__hero-rosette', rosette(52)));

    stage.appendChild(
      panel(
        'welcome',
        `${BRAND.name}에 오신 것을 환영합니다`,
        `${BRAND.since}년부터 국어만 가르쳐 왔습니다. 우리가 어떻게 가르치는지, 설명 대신 <b>3분 동안 직접 겪어</b> 보십시오.`,
        mark,
        h(
          'ol.ob__course',
          ...[
            ['진단', '6문항으로 여섯 역량의 균형을 봅니다'],
            ['리포트', '점수가 아니라 무엇이 약한지를 읽습니다'],
            ['수업', '약한 영역을 근거 찾는 방식으로 배웁니다'],
            ['어휘', '간격 반복 카드를 한 장 넘겨 봅니다'],
            ['루틴', '가능한 시간에 맞춰 주간 계획을 만듭니다'],
          ].map(([t, d], i) =>
            h(
              'li.ob__course-item',
              { 'data-reveal': '', 'data-reveal-delay': String(i * 70) },
              h('span.ob__course-no', String(i + 1)),
              h('div', h('b', t), h('span', d)),
            ),
          ),
        ),
        h('div', { style: { marginTop: '22px' } }, nextBtn('3분 체험 시작', () => goTo(1))),
        h(
          'p.ob__note',
          '체험에서 푼 문제와 만든 루틴은 그대로 저장됩니다. 계정은 필요 없습니다.',
        ),
      ),
    );
  }

  /* ------------------------------ 1. 진단 ------------------------------ */
  function renderDiagnostic(): void {
    const set = miniDiagnostic();
    stage.appendChild(
      h(
        'div.ob__panel',
        h('div.ob__eyebrow', 'step 1 · 진단'),
        h('h1.ob__title', '지금 어디에 서 있는지부터'),
        h(
          'p.ob__lede',
          '여섯 문항, 각각 다른 역량을 봅니다. 해설은 끝난 뒤 한 번에 보여 드립니다. 모르면 넘겨도 괜찮습니다.',
        ),
      ),
    );

    quiz = createQuiz({
      questions: set,
      mode: 'diagnostic',
      deferFeedback: true,
      onExit: () => goTo(0),
      onFinish: (result) => {
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
        report = {
          at: Date.now(),
          total: result.answers.length,
          correct,
          bySkill,
          byDomain,
          band: scoreBand(result.answers.length ? correct / result.answers.length : 0),
          seconds: result.seconds,
        };
        store.update((p) => {
          p.diagnostics.push(report as DiagnosticResult);
          p.xp += 40;
        });

        const rankedSkills = SKILLS.filter((s) => bySkill[s].seen > 0).sort(
          (a, b) => accuracy(bySkill[a]) - accuracy(bySkill[b]),
        );
        weakSkill = rankedSkills[0] ?? SKILLS[0];
        const rankedDomains = DOMAINS.filter((d) => byDomain[d].seen > 0).sort(
          (a, b) => accuracy(byDomain[a]) - accuracy(byDomain[b]),
        );
        weakDomain = rankedDomains[0] ?? 'nonfiction';

        sfx.done();
        goTo(2);
      },
    });
    stage.appendChild(quiz.el);
  }

  /* ----------------------------- 2. 리포트 ----------------------------- */
  function renderReport(): void {
    const r = report;
    if (!r) {
      goTo(1);
      return;
    }
    const values = SKILLS.map((s) => (r.bySkill[s].seen ? r.bySkill[s].correct / r.bySkill[s].seen : 0));
    // At a clean sweep there is no "weak" area yet — the copy has to say so
    // rather than inventing a weakness the numbers do not show.
    const perfect = r.correct === r.total;
    const skillLabel = perfect ? '먼저 다질 역량' : '가장 얇은 역량';
    const domainLabel = perfect ? '먼저 다질 영역' : '가장 약한 영역';

    stage.appendChild(
      panel(
        'step 2 · 리포트',
        perfect ? '기초는 이미 잡혀 있습니다' : '점수가 아니라 균형을 봅니다',
        perfect
          ? `${r.correct}/${r.total} 정답. 이 정도면 기본기는 충분합니다. 다음은 <b>난도를 올려 무너지는 지점</b>을 찾을 차례입니다.`
          : `${r.correct}/${r.total} 정답. 하지만 우리가 보는 것은 이 숫자가 아니라 <b>어느 쪽이 얇은가</b>입니다.`,
        h(
          'div.card',
          { style: { marginTop: '18px' } },
          radar(SKILLS.map((s) => s), [{ values }], Math.min(320, window.innerWidth - 100)),
        ),
        h(
          'div.ob__verdict',
          h(
            'div.ob__verdict-row',
            h('span.tiny.muted', skillLabel),
            h('b', weakSkill),
          ),
          h(
            'div.ob__verdict-row',
            h('span.tiny.muted', domainLabel),
            h('b', DOMAIN_LABEL[weakDomain]),
          ),
          h(
            'div.ob__verdict-row',
            h('span.tiny.muted', '종합 밴드'),
            h('b', `${r.band}단계 / 9`),
          ),
        ),
        h('p.ob__note', {
          html: perfect
            ? '여섯 문항으로 사람을 판단하지 않습니다. 실제 수업에서는 15문항 진단으로 난도별 반응까지 확인합니다.'
            : '진단 한 번으로 사람을 판단하지 않습니다. 다만 <b>어디부터 손대야 하는지</b>는 이것만으로도 정해집니다.',
        }),
        h(
          'div',
          { style: { marginTop: '20px' } },
          nextBtn(`${DOMAIN_LABEL[weakDomain]} 수업 받아보기`, () => goTo(3)),
        ),
      ),
    );
  }

  /* ------------------------------ 3. 수업 ------------------------------ */
  function renderLesson(): void {
    const concept = CONCEPTS.find((c) => c.domain === weakDomain) ?? CONCEPTS[0];
    const set = shuffle(QUESTIONS.filter((q) => q.domain === weakDomain && q.level <= 2)).slice(0, 3);
    lessonTotal = set.length;

    stage.appendChild(
      panel(
        'step 3 · 수업',
        '“느낌상 3번”을 없애는 방식',
        `${DOMAIN_LABEL[weakDomain]}에서 가장 자주 걸리는 지점을 먼저 짚고, 바로 문항으로 확인합니다. 매 문항 해설이 즉시 열립니다.`,
        h(
          'div.card.ob__concept',
          h('span.tag', '수 국어논술 개념 카드'),
          h('h3.h3', { style: { margin: '10px 0 6px' } }, concept.title),
          h('p.small.muted', { style: { marginBottom: '12px' } }, concept.summary),
          h('ul.list-check', ...concept.points.slice(0, 3).map((pt) => h('li', { html: pt }))),
          concept.trap
            ? h(
                'div.ob__trap',
                h('b', '⚠️ 시험 함정 '),
                h('span', { html: concept.trap }),
              )
            : null,
        ),
      ),
    );

    const quizWrap = h('div', { style: { marginTop: '18px' } });
    stage.appendChild(quizWrap);

    quiz = createQuiz({
      questions: set,
      mode: 'practice',
      onExit: () => goTo(2),
      onFinish: (result) => {
        lessonCorrect = result.answers.filter((a) => a.correct).length;
        sfx.done();
        goTo(4);
      },
    });
    quizWrap.appendChild(quiz.el);
  }

  /* ------------------------------ 4. 어휘 ------------------------------ */
  function renderVocab(): void {
    const card = shuffle(VOCAB.filter((v) => v.level <= 2))[0] ?? VOCAB[0];
    let flipped = false;

    const flip = h(
      'div.flip',
      { style: { marginTop: '18px' } },
      h(
        'div.flip__in',
        h(
          'div.flip__face',
          h('span.tag', card.kind),
          h('div', { style: { fontSize: 'clamp(2rem, 8vw, 2.8rem)', fontWeight: '900', letterSpacing: '-0.03em' } }, card.word),
          card.hanja ? h('div.muted', { style: { fontSize: '1.05rem' } }, card.hanja) : null,
          h('p.tiny.muted', { style: { marginTop: '10px' } }, '카드를 눌러 뜻 확인'),
        ),
        h(
          'div.flip__face.flip__face--back',
          h('span.tag', card.kind),
          h('div', { style: { fontSize: '1.3rem', fontWeight: '800', marginTop: '6px' } }, card.word),
          h('p', { style: { marginTop: '8px', lineHeight: '1.7' } }, card.meaning),
          h('p.small.muted', { style: { marginTop: '12px' } }, `예) ${card.example}`),
        ),
      ),
    );

    const cta = h('div', { style: { marginTop: '20px', opacity: '0.45', pointerEvents: 'none', transition: 'opacity .3s' } });
    cta.appendChild(nextBtn('루틴 만들러 가기', () => goTo(5)));

    flip.addEventListener('click', () => {
      flip.classList.toggle('is-flipped');
      sfx.flip();
      if (!flipped) {
        flipped = true;
        vocabSeen = true;
        store.update((p) => {
          if (!p.srs.some((c) => c.id === card.id)) {
            p.srs.push({ id: card.id, box: 1, due: Date.now() + 86400000, lapses: 0 });
          }
          p.xp += 5;
          touchStreak(p);
        });
        cta.style.opacity = '1';
        cta.style.pointerEvents = 'auto';
      }
    });

    stage.appendChild(
      panel(
        'step 4 · 어휘',
        '외우지 말고, 다시 만나게 하십시오',
        '어휘는 한 번에 외우는 것이 아니라 <b>잊을 만할 때 다시 만나야</b> 남습니다. 이 카드는 내일 다시 나타납니다.',
        flip,
        cta,
      ),
    );
  }

  /* ------------------------------ 5. 루틴 ------------------------------ */
  function renderRoutine(): void {
    let days = [1, 3, 5];
    let minutes = 40;

    const minutesLabel = h('b', `${minutes}분`);
    const dayChips = h('div.chips');
    const preview = h('div.ob__preview');

    const paintPreview = () => {
      const weekly = days.length * minutes;
      preview.replaceChildren(
        h('div.ob__preview-row', h('span', '주간 학습'), h('b', `${days.length}일 · ${weekly}분`)),
        h(
          'div.ob__preview-row',
          h('span', '집중 영역'),
          h('b', DOMAIN_LABEL[weakDomain]),
        ),
        h('div.ob__preview-row', h('span', '한 달 누적'), h('b', `약 ${Math.round((weekly * 4.3) / 60)}시간`)),
      );
    };

    const paintDays = () => {
      dayChips.replaceChildren(
        ...WEEKDAY_LABEL.map((label, i) =>
          h(
            `button.chip${days.includes(i) ? '.is-on' : ''}`,
            {
              onclick: () => {
                sfx.tap();
                days = days.includes(i) ? days.filter((d) => d !== i) : [...days, i];
                paintDays();
                paintPreview();
              },
            },
            label,
          ),
        ),
      );
    };
    paintDays();
    paintPreview();

    stage.appendChild(
      panel(
        'step 5 · 루틴',
        '계획은 의지가 아니라 시간에 맞춥니다',
        `진단에서 드러난 <b>${DOMAIN_LABEL[weakDomain]}</b>을 앞에 두고, 실제로 낼 수 있는 시간만큼만 짭니다.`,
        h(
          'div.card',
          { style: { marginTop: '18px' } },
          h('div.consult__label', '학습 요일'),
          dayChips,
          h(
            'div.spread',
            { style: { margin: '20px 0 8px' } },
            h('span.consult__label', { style: { margin: '0' } }, '하루 학습 시간'),
            minutesLabel,
          ),
          h('input', {
            type: 'range',
            min: '15',
            max: '90',
            step: '5',
            value: String(minutes),
            oninput: (e: Event) => {
              minutes = Number((e.target as HTMLInputElement).value);
              minutesLabel.textContent = `${minutes}분`;
              paintPreview();
            },
          }),
          h('div.divider'),
          preview,
        ),
        h(
          'div',
          { style: { marginTop: '18px' } },
          h(
            'button.btn.btn--primary.btn--lg.btn--block',
            {
              disabled: false,
              onclick: (e: MouseEvent) => {
                if (!days.length) {
                  sfx.wrong();
                  return;
                }
                const routine = buildRoutine(
                  {
                    goal: `${DOMAIN_LABEL[weakDomain]} 보완`,
                    targetLabel: '첫 4주',
                    minutesPerDay: minutes,
                    activeDays: days,
                    focus: [weakDomain],
                  },
                  store.profile,
                );
                store.update((p) => {
                  p.routine = routine;
                  p.xp += 30;
                });
                routineMade = true;
                sfx.levelUp();
                burstFrom(e.currentTarget as HTMLElement, 45);
                goTo(6);
              },
            },
            '내 루틴 만들기',
          ),
        ),
      ),
    );
  }

  /* ------------------------------ 6. 완료 ------------------------------ */
  function renderDone(): void {
    const p = store.profile;
    const today = p.routine?.days.find((d) => d.weekday === new Date().getDay());

    store.update((prof) => {
      prof.onboarded = true;
      prof.coins += 60;
      prof.xp += 40;
    });
    burst(window.innerWidth / 2, window.innerHeight / 3, 45, 46);

    stage.appendChild(
      panel(
        'step 6 · 완료',
        '한 바퀴를 도셨습니다',
        `이 3분 동안 <b>${BRAND.name}</b>이 한 학기 동안 반복하는 흐름을 그대로 겪으셨습니다. 진단 → 처방 → 수업 → 반복 → 계획.`,
        h(
          'div.ob__ledger',
          h(
            'div.ob__ledger-row',
            h('span.ob__check', '✓'),
            h('div', h('b', '진단 완료'), h('span', `여섯 역량 측정 · 밴드 ${report?.band ?? '-'}단계`)),
          ),
          h(
            'div.ob__ledger-row',
            h('span.ob__check', '✓'),
            h(
              'div',
              h('b', '수업 체험'),
              h('span', `${DOMAIN_LABEL[weakDomain]} ${lessonCorrect}/${lessonTotal} · 해설로 근거 확인`),
            ),
          ),
          h(
            'div.ob__ledger-row',
            h('span.ob__check', vocabSeen ? '✓' : '—'),
            h('div', h('b', '어휘 카드'), h('span', vocabSeen ? '간격 반복 시작 · 내일 다시 만납니다' : '건너뜀')),
          ),
          h(
            'div.ob__ledger-row',
            h('span.ob__check', routineMade ? '✓' : '—'),
            h(
              'div',
              h('b', '학습 루틴'),
              h('span', routineMade ? `주 ${p.routine?.activeDays.length ?? 0}일 · 하루 ${p.routine?.minutesPerDay ?? 0}분` : '건너뜀'),
            ),
          ),
        ),
        today && today.tasks.length
          ? h(
              'div.card.ob__today',
              h('div.ob__eyebrow', { style: { marginBottom: '8px' } }, '오늘 할 일'),
              ...today.tasks.slice(0, 3).map((t) =>
                h('div.ob__today-row', h('i'), h('span', t.label), h('b', `${t.minutes}분`)),
              ),
            )
          : null,
        h(
          'div.ob__unlocked',
          h('div.ob__eyebrow', { style: { marginBottom: '10px' } }, '이제 열려 있는 것'),
          h(
            'div.ob__chips',
            ...[
              `스테이지 ${STAGES.length}개`,
              `문항 ${QUESTIONS.length}개`,
              `어휘 ${VOCAB.length}개`,
              `개념 ${CONCEPTS.length}장`,
              '모의고사',
              '오답노트',
              '독해 훈련실',
              '논술 훈련실',
              '맞춤법 스피드',
              '성취 리포트',
            ].map((t) => h('span.chip', t)),
          ),
        ),
        h(
          'div.ob__actions',
          nextBtn('학습 지도 열기', () => finish(true)),
          nextBtn('학원 소개 · 상담 신청 보기', () => {
            store.update((prof) => {
              prof.onboarded = true;
            });
            go('home');
            window.setTimeout(() => document.getElementById('consult')?.scrollIntoView({ behavior: 'smooth' }), 420);
          }, true),
        ),
        h('p.ob__note', `${BRAND.tagline} — ${BRAND.slogan.join(' · ')}`),
      ),
    );
  }

  function finish(toMap: boolean): void {
    quiz?.destroy();
    quiz = null;
    store.update((p) => {
      p.onboarded = true;
    });
    go(toMap ? 'journey' : 'home');
  }

  const RENDERERS: (() => void)[] = [
    renderWelcome,
    renderDiagnostic,
    renderReport,
    renderLesson,
    renderVocab,
    renderRoutine,
    renderDone,
  ];

  return {
    el,
    title: '3분 체험',
    mounted() {
      paintRail();
      RENDERERS[0]();
      stage.classList.add('is-in');
      enhance(el);
    },
    destroy() {
      quiz?.destroy();
    },
  };
}

export const OB_CLAMP = clamp;
export const OB_PCT = pct;

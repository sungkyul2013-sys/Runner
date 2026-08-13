import { sfx } from '../core/audio';
import { h, shuffle } from '../core/dom';
import { burst } from '../core/motion';
import { type ViewHandle } from '../core/router';
import { recordStage, store } from '../core/store';
import { DOMAIN_ICON, DOMAIN_LABEL, type Question } from '../core/types';
import { queryQuestions } from '../data/questions';
import { STAGES, currentStageIndex, isUnlocked, starsFor, totalStars, type Stage } from '../data/stages';
import { createJourney, type JourneyHandle } from '../three/JourneyScene';
import { toast } from '../ui/components';
import { createQuiz, type QuizHandle } from '../ui/QuizRunner';

/** Build the question set for a stage, padding from neighbouring levels. */
function stageQuestions(stage: Stage): Question[] {
  const exact = queryQuestions({
    domain: stage.domain,
    level: stage.level === 'mixed' ? 'all' : stage.level,
  });
  let pool = shuffle(exact);
  if (pool.length < stage.count) {
    const extra = shuffle(queryQuestions({ domain: stage.domain })).filter((q) => !pool.includes(q));
    pool = [...pool, ...extra];
  }
  if (pool.length < stage.count) {
    const any = shuffle(queryQuestions({})).filter((q) => !pool.includes(q));
    pool = [...pool, ...any];
  }
  return pool.slice(0, stage.count);
}

export function journeyView(): ViewHandle {
  const el = h('div.journey');
  let scene: JourneyHandle | null = null;
  let quiz: QuizHandle | null = null;

  const canvas = h('canvas.journey__canvas') as HTMLCanvasElement;
  const sheet = h('div.sheet');
  const hud = h('div.journey__top');
  const chapterBanner = h('div.journey__chapter');
  const playLayer = h('div.journey__play');

  el.append(canvas, hud, chapterBanner, sheet, playLayer);

  function renderTop(): void {
    const stars = totalStars(store.profile.stages);
    const max = STAGES.length * 3;
    hud.replaceChildren(
      h(
        'div.journey__chip',
        h('span', '★'),
        h('b', `${stars}`),
        h('span.tiny', `/ ${max}`),
      ),
      h(
        'div.journey__chip',
        h('span', '🚩'),
        h('b', String(STAGES.filter((s) => (store.profile.stages[s.id]?.stars ?? 0) > 0).length)),
        h('span.tiny', `/ ${STAGES.length}`),
      ),
    );
  }

  /** The bottom sheet describing whichever stone is in focus. */
  function renderSheet(stage: Stage): void {
    chapterBanner.textContent = stage.chapter;
    const prog = store.profile.stages[stage.id];
    const unlocked = isUnlocked(stage, store.profile.stages);
    const stars = prog?.stars ?? 0;

    sheet.replaceChildren(
      h('div.sheet__grip'),
      h(
        'div.sheet__body',
        h(
          'div.spread',
          h(
            'div',
            h(
              'div.row',
              { style: { gap: '8px' } },
              h('h2.sheet__name', stage.name),
              stage.boss ? h('span.pill.pill--gold', '관문') : null,
            ),
          ),
          h(
            'div.stars',
            ...[0, 1, 2].map((i) => h(`span.star${i < stars ? '.is-on' : ''}`, '★')),
          ),
        ),
        h(
          'div.row',
          { style: { marginTop: '10px' } },
          h('span.pill', `${DOMAIN_ICON[stage.domain]} ${DOMAIN_LABEL[stage.domain]}`),
          h('span.pill', stage.level === 'mixed' ? '종합' : '★'.repeat(stage.level)),
          h('span.pill', `${stage.count}문항`),
          prog ? h('span.pill', `최고 ${Math.round(prog.best * 100)}%`) : null,
        ),
        h(
          'button.btn3d',
          {
            class: unlocked ? 'btn3d--go' : 'btn3d--locked',
            disabled: !unlocked,
            onclick: () => {
              if (!unlocked) {
                sfx.wrong();
                toast('앞 단계를 먼저 클리어하세요', '🔒', 1800);
                return;
              }
              sfx.nav();
              startStage(stage);
            },
          },
          unlocked ? (stars > 0 ? '다시 도전' : '시작하기') : '잠김',
        ),
      ),
    );
  }

  /* ------------------------------ playing ------------------------------ */
  function startStage(stage: Stage): void {
    const questions = stageQuestions(stage);
    if (!questions.length) {
      toast('이 단계의 문항을 불러오지 못했습니다', '⚠️');
      return;
    }
    el.classList.add('is-playing');
    playLayer.replaceChildren();

    quiz = createQuiz({
      questions,
      mode: 'practice',
      onExit: () => closePlay(),
      onFinish: (result) => {
        const correct = result.answers.filter((a) => a.correct).length;
        const acc = result.answers.length ? correct / result.answers.length : 0;
        const stars = starsFor(acc);
        const { improved } = recordStage(stage.id, acc, stars);
        scene?.refresh(stage.id);
        renderTop();

        if (stars > 0) {
          sfx.levelUp();
          burst(window.innerWidth / 2, window.innerHeight / 2.6, 45, 46);
        } else {
          sfx.wrong();
        }

        quiz?.destroy();
        quiz = null;
        playLayer.replaceChildren(
          h(
            'div.clear',
            h('div.clear__card',
              h('div.clear__badge', stars > 0 ? '🏁' : '💤'),
              h('h2.clear__title', stars === 3 ? '완벽 클리어' : stars > 0 ? '단계 클리어' : '재도전'),
              h(
                'div.stars.stars--lg',
                ...[0, 1, 2].map((i) =>
                  h(`span.star${i < stars ? '.is-on' : ''}`, { style: { animationDelay: `${i * 150}ms` } }, '★'),
                ),
              ),
              h('p.clear__score', `${correct} / ${result.answers.length} · 정답률 ${Math.round(acc * 100)}%`),
              h(
                'p.clear__note',
                stars === 3
                  ? '더 볼 것이 없습니다. 다음 돌로 넘어가세요.'
                  : stars > 0
                    ? improved ? '별을 새로 얻었습니다.' : '이미 얻은 별이 유지됩니다. 만점을 노려 보세요.'
                    : '60% 이상이면 별 하나가 열립니다. 해설을 다시 읽고 도전하세요.',
              ),
              h(
                'div.clear__actions',
                h(
                  'button.btn3d.btn3d--go',
                  {
                    onclick: () => {
                      sfx.nav();
                      closePlay();
                      const next = currentStageIndex(store.profile.stages);
                      scene?.focus(next);
                      renderSheet(STAGES[next]);
                    },
                  },
                  stars > 0 ? '지도로 돌아가기' : '지도로',
                ),
                h(
                  'button.btn3d.btn3d--ghost',
                  {
                    onclick: () => {
                      sfx.tap();
                      startStage(stage);
                    },
                  },
                  '다시 도전',
                ),
              ),
            ),
          ),
        );
      },
    });
    playLayer.appendChild(quiz.el);
    playLayer.scrollTop = 0;
  }

  function closePlay(): void {
    quiz?.destroy();
    quiz = null;
    playLayer.replaceChildren();
    el.classList.remove('is-playing');
  }

  renderTop();

  return {
    el,
    title: '학습 맵',
    mounted() {
      const start = currentStageIndex(store.profile.stages);
      scene = createJourney({
        canvas,
        onSelect: (stage, unlocked) => {
          sfx.tap();
          renderSheet(stage);
          if (!unlocked) toast('앞 단계를 먼저 클리어하세요', '🔒', 1600);
        },
        onFocusChange: (stage) => renderSheet(stage),
      });
      if (!scene) {
        // No WebGL — fall back to a plain list so the map is never a dead end.
        canvas.remove();
        el.classList.add('journey--flat');
        el.insertBefore(
          h(
            'div.stack',
            { style: { padding: '16px' } },
            ...STAGES.map((s) =>
              h(
                'button.card.stage-row',
                {
                  onclick: () => {
                    renderSheet(s);
                    if (isUnlocked(s, store.profile.stages)) startStage(s);
                  },
                },
                h('b', `${s.no}. ${s.name}`),
                h('span.tiny.muted', `${DOMAIN_LABEL[s.domain]} · ${s.count}문항`),
              ),
            ),
          ),
          sheet,
        );
      }
      scene?.focus(start, true);
      renderSheet(STAGES[start]);
    },
    destroy() {
      quiz?.destroy();
      scene?.destroy();
    },
  };
}

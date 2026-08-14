import { sfx } from '../core/audio';
import { h } from '../core/dom';
import { enhance } from '../core/motion';
import { go, type ViewHandle } from '../core/router';
import { QUEST_SET_BONUS, ensureDaily, store } from '../core/store';
import { CONCEPTS } from '../data/concepts';
import { QUESTION_COUNT } from '../data/questions';
import { SPELLING } from '../data/spelling';
import { VOCAB } from '../data/vocab';
import { WRITING_PROMPTS } from '../data/writingPrompts';

interface Tool {
  icon: string;
  name: string;
  desc: string;
  href: string;
  hue: number;
  badge?: () => string | null;
}

export function hubView(): ViewHandle {
  const p = store.profile;

  const TOOLS: Tool[] = [
    { icon: '🧭', name: '진단 평가', desc: '6역량 15문항', href: 'diagnostic', hue: 205, badge: () => (p.diagnostics.length ? `${p.diagnostics.length}회` : 'NEW') },
    { icon: '🎯', name: '문제 풀이', desc: `${QUESTION_COUNT}문항 은행`, href: 'practice', hue: 45 },
    { icon: '📚', name: '개념 사전', desc: `${CONCEPTS.length}장 카드`, href: 'concepts', hue: 168 },
    { icon: '💠', name: '어휘 카드', desc: `${VOCAB.length}개 · 간격 반복`, href: 'vocab', hue: 42 },
    { icon: '⚡', name: '맞춤법 스피드', desc: `${SPELLING.length}쌍 · 7초`, href: 'spelling', hue: 12 },
    { icon: '🔬', name: '독해 훈련실', desc: '속도 · 구조 표시', href: 'reading', hue: 190 },
    { icon: '✍️', name: '논술 훈련실', desc: `논제 ${WRITING_PROMPTS.length}개`, href: 'writing', hue: 336 },
    { icon: '🗓️', name: '학습 루틴', desc: p.routine ? '오늘의 계획' : '주간 설계', href: 'routine', hue: 225 },
    { icon: '⏱️', name: '모의고사', desc: '제한 시간 실전', href: 'mock', hue: 280 },
    { icon: '♻️', name: '오답노트', desc: '복습 대기', href: 'review', hue: 355, badge: () => (p.wrong.length ? String(p.wrong.length) : null) },
    { icon: '📈', name: '성취 리포트', desc: '레이더 · 뱃지', href: 'dashboard', hue: 150 },
    { icon: '⚙️', name: '설정', desc: '테마 · 데이터', href: 'settings', hue: 220 },
  ];

  const daily = ensureDaily();
  const allDone = daily.quests.every((q) => q.done);

  const el = h(
    'div.wrap.section--tight',
    h(
      'div',
      { style: { marginBottom: '16px' } },
      h('div.eyebrow', 'toolbox'),
      h('h1.h1', '학습 도구'),
      h('p.lede', { style: { marginTop: '6px' } }, '필요한 훈련을 골라 바로 시작하세요.'),
    ),
    h(
      'section',
      { style: { marginBottom: '24px' } },
      h(
        'div.spread',
        { style: { marginBottom: '10px' } },
        h('h2.h3', '오늘의 과제'),
        h(
          'span.pill',
          { class: allDone ? 'pill pill--gold' : 'pill' },
          allDone ? `전부 완료 · +${QUEST_SET_BONUS}🪙` : `${daily.quests.filter((q) => q.done).length}/${daily.quests.length}`,
        ),
      ),
      h(
        'div.quests',
        ...daily.quests.map((q) =>
          h(
            'div',
            { class: `quest${q.done ? ' is-done' : ''}` },
            h('div.quest__label', q.done ? `✓ ${q.label}` : q.label),
            h('div.quest__reward', `+${q.reward} 🪙`),
            h('div.quest__bar', h('i', { style: { width: `${Math.min(100, (q.progress / q.target) * 100)}%` } })),
            h('div.quest__count', `${q.progress} / ${q.target}`),
          ),
        ),
      ),
    ),
    h(
      'div.hub-grid',
      { 'data-reveal-stagger': '40' },
      ...TOOLS.map((t) => {
        const badge = t.badge?.();
        return h(
          'button.hub-tile',
          {
            'data-reveal': 'scale',
            onclick: () => {
              sfx.nav();
              go(t.href);
            },
          },
          h(
            'div.spread',
            { style: { alignItems: 'flex-start' } },
            h('div.hub-tile__icon', { style: `--h:${t.hue}` }, t.icon),
            badge ? h('span.pill.pill--gold', badge) : null,
          ),
          h('b', t.name),
          h('span', t.desc),
        );
      }),
    ),
  );

  return {
    el,
    title: '학습 도구',
    mounted() {
      enhance(el);
    },
  };
}

import { sfx } from '../core/audio';
import { h } from '../core/dom';
import { countUpOnView, enhance, onScrollProgress } from '../core/motion';
import { go, type ViewHandle } from '../core/router';
import { levelFromXp, rankFor, store } from '../core/store';
import { DOMAIN_HUE } from '../core/types';
import {
  BRAND,
  CONTACT,
  FAQ,
  HERO_STATS,
  PILLARS,
  PROCESS,
  TEACHERS,
  TESTIMONIALS,
  TRACKS,
} from '../data/academy';
import { QUESTION_COUNT } from '../data/questions';
import { CONCEPTS } from '../data/concepts';
import { VOCAB } from '../data/vocab';
import { createHeroScene } from '../three/HeroScene';
import { accordion, sectionHead } from '../ui/components';

const TOOLS = [
  { icon: '🧭', name: '진단 평가', desc: '6개 역량을 15문항으로 진단하고 레이더 리포트를 받습니다.', href: 'diagnostic', hue: 205 },
  { icon: '🎯', name: '문제 풀이', desc: '영역·난이도·유형별로 골라 푸는 문항 은행.', href: 'practice', hue: 268 },
  { icon: '📚', name: '개념 사전', desc: '문법·문학·독해 전략을 함정까지 정리한 카드.', href: 'concepts', hue: 168 },
  { icon: '💠', name: '어휘 트레이너', desc: '간격 반복(Leitner)으로 외우는 3D 플립 카드.', href: 'vocab', hue: 42 },
  { icon: '⚡', name: '맞춤법 스피드', desc: '헷갈리는 표기를 30초 안에 가르는 훈련.', href: 'spelling', hue: 12 },
  { icon: '🔬', name: '독해 훈련실', desc: '읽기 속도 측정과 문단 구조 표시 훈련.', href: 'reading', hue: 190 },
  { icon: '✍️', name: '논술 훈련실', desc: '개요 → 초고 → 루브릭 자기 평가까지.', href: 'writing', hue: 336 },
  { icon: '🗓️', name: '학습 루틴', desc: '약점과 가용 시간으로 주간 계획을 설계합니다.', href: 'routine', hue: 225 },
  { icon: '⏱️', name: '모의고사', desc: '제한 시간 안에서 실전 운영을 연습합니다.', href: 'mock', hue: 280 },
  { icon: '♻️', name: '오답노트', desc: '틀린 문제만 모아 두 번 맞히면 졸업합니다.', href: 'review', hue: 355 },
  { icon: '📈', name: '성취 리포트', desc: '영역별 정답률, 스트릭, 뱃지를 한눈에.', href: 'dashboard', hue: 150 },
  { icon: '⚙️', name: '설정', desc: '테마·모션·사운드·데이터 백업.', href: 'settings', hue: 220 },
];

/**
 * Word-by-word reveal. The gradient has to live on the individual word spans:
 * `background-clip: text` only paints the element's own text, so putting it on
 * a wrapper would leave the words inside invisible.
 */
function splitWords(text: string, delayStart = 0, wordClass = ''): HTMLElement {
  const wrap = h('span.reveal-words');
  const words = text.split(' ');
  words.forEach((word, i) => {
    const span = h(`span${wordClass ? `.${wordClass}` : ''}`, {
      style: { animationDelay: `${delayStart + i * 90}ms` },
    }, word);
    wrap.appendChild(span);
    if (i < words.length - 1) wrap.appendChild(document.createTextNode(' '));
  });
  return wrap;
}

export function homeView(): ViewHandle {
  const el = h('div');
  let scene: ReturnType<typeof createHeroScene> = null;
  const unsubs: (() => void)[] = [];

  /* -------------------------------- hero -------------------------------- */
  const canvas = h('canvas.hero__canvas') as HTMLCanvasElement;
  const p = store.profile;
  const { level } = levelFromXp(p.xp);
  const returning = p.attempts.length > 0;

  const hero = h(
    'section.hero',
    canvas,
    h('div.hero__veil'),
    h(
      'div.wrap.hero__inner',
      h(
        'div.hero__badge',
        { style: { marginBottom: '26px' } },
        h('i.hero__dot'),
        returning ? `${rankFor(level)} · Lv.${level}` : `since ${BRAND.since} · 국어 전문 학원`,
      ),
      h(
        'h1.h-display',
        { style: { marginBottom: '24px' } },
        splitWords('읽고 따지고'),
        h('br'),
        splitWords('쓰는 힘.', 270, 'grad-text'),
      ),
      h('p.lede', { style: { maxWidth: '46ch', marginBottom: '34px' } }, BRAND.lead),
      h(
        'div.row',
        h(
          'button.btn.btn--primary.btn--lg',
          {
            'data-magnetic': '',
            onclick: () => {
              sfx.nav();
              go(returning ? 'practice' : 'diagnostic');
            },
          },
          returning ? '이어서 학습하기' : '무료 진단 평가 시작',
          h('span', '→'),
        ),
        h(
          'button.btn.btn--ghost.btn--lg',
          {
            onclick: () => {
              sfx.tap();
              document.getElementById('tools')?.scrollIntoView({ behavior: 'smooth' });
            },
          },
          '기능 둘러보기',
        ),
      ),
      h(
        'div.hero__stats',
        ...HERO_STATS.map((s) => {
          const b = h('b', '0');
          countUpOnView(b, s.value, { suffix: s.suffix });
          return h('div.hero__stat', b, h('span', s.label));
        }),
      ),
    ),
    h('div.scroll-cue', h('i'), h('span', 'SCROLL')),
  );
  el.appendChild(hero);

  /* ------------------------------- marquee ------------------------------ */
  const words = [
    '현대시', '고전시가', '음운 변동', '문장 성분', '비문학 독해', '한자성어', '개요 짜기',
    '높임법', '피동·사동', '논증 구조', '중세 국어', '오답 분석', '요약 훈련', '어휘 확장',
    '문학 감상', '읽기 속도', '선택지 근거', '띄어쓰기',
  ];
  const marqueeRow = (rev: boolean) =>
    h(
      `div.marquee__row${rev ? '.marquee__row--rev' : ''}`,
      ...[...words, ...words].map((w) => h('span.chip-lg', w)),
    );
  el.appendChild(
    h(
      'div.section--tight',
      { style: { paddingTop: '0' } },
      h('div.marquee', marqueeRow(false)),
      h('div.marquee', { style: { marginTop: '14px' } }, marqueeRow(true)),
    ),
  );

  /* ------------------------------- pillars ------------------------------ */
  const pinCards = PILLARS.map((pl, i) =>
    h(
      `div.pin__card${i === 0 ? '.is-on' : ''}`,
      h(
        'div.card',
        { style: { padding: 'clamp(24px, 3vw, 34px)' } },
        h('div', { style: { fontSize: '2.2rem', marginBottom: '12px' } }, pl.icon),
        h('h3.h1', { style: { marginBottom: '10px' } }, pl.title),
        h('p.lede', { style: { marginBottom: '18px' } }, pl.copy),
        h('ul.list-check', ...pl.detail.map((d) => h('li', d))),
      ),
    ),
  );
  const pips = PILLARS.map((_, i) => h(`i.pin__pip${i === 0 ? '.is-on' : ''}`));

  // The heading lives inside the sticky stage so it stays with the cards
  // instead of leaving a viewport-sized gap above them.
  const pinStage = h(
    'div.pin__stage',
    h(
      'div.pin__head',
      h('div.eyebrow', 'our method'),
      h('h2.h1', '수 국어논술이 가르치는 순서'),
      h('p.lede', { style: { marginTop: '12px' } }, '진단 → 구조 → 근거 → 표현. 네 단계는 순서를 바꾸지 않습니다.'),
    ),
    h('div.pin__cards', ...pinCards),
    h('div.pin__track', ...pips),
  );

  const pinSection = h('section.section', h('div.pin', pinStage));
  el.appendChild(pinSection);

  /* -------------------------------- tools ------------------------------- */
  el.appendChild(
    h(
      'section.section#tools',
      { style: { background: 'var(--bg-3)' } },
      h(
        'div.wrap',
        sectionHead(
          'the app',
          '모든 국어 학습을 한 앱에서',
          `문항 <b>${QUESTION_COUNT}개</b> · 개념 카드 <b>${CONCEPTS.length}장</b> · 어휘 <b>${VOCAB.length}개</b>가 들어 있습니다.`,
          true,
        ),
        h(
          'div.grid.grid--3',
          { 'data-reveal-stagger': '50' },
          ...TOOLS.map((t) =>
            h(
              'div.card.card--link',
              {
                'data-reveal': 'scale',
                'data-tilt': '7',
                role: 'button',
                tabindex: '0',
                onclick: () => {
                  sfx.nav();
                  go(t.href);
                },
                onkeydown: (e: KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    go(t.href);
                  }
                },
              },
              h(
                'div',
                {
                  style: {
                    fontSize: '1.7rem',
                    width: '54px',
                    height: '54px',
                    borderRadius: '17px',
                    display: 'grid',
                    placeItems: 'center',
                    marginBottom: '16px',
                    background: `color-mix(in oklab, hsl(${t.hue} 82% 60%) 16%, transparent)`,
                  },
                },
                t.icon,
              ),
              h('h3.h3', { style: { marginBottom: '7px' } }, t.name),
              h('p.small.muted', t.desc),
            ),
          ),
        ),
      ),
    ),
  );

  /* ------------------------------- tracks ------------------------------- */
  el.appendChild(
    h(
      'section.section',
      h(
        'div.wrap',
        sectionHead('curriculum', '학년이 아니라 진단으로 배정합니다', '여섯 개의 트랙, 각자의 출발선.'),
        h(
          'div.grid.grid--3',
          { 'data-reveal-stagger': '60' },
          ...TRACKS.map((t) =>
            h(
              'div.card',
              { 'data-reveal': '', 'data-tilt': '6', style: `--h:${t.hue}` },
              h(
                'div.spread',
                { style: { marginBottom: '14px' } },
                h('span.tag.tag--h', { style: `--h:${t.hue}` }, t.target),
                h('span.tiny.muted', t.weekly),
              ),
              h('h3.h2', { style: { marginBottom: '6px' } }, t.name),
              h('p.small.muted', { style: { marginBottom: '18px' } }, t.tagline),
              h(
                'div.stack',
                { style: { gap: '10px' } },
                ...t.modules.map((m) =>
                  h(
                    'div',
                    h('div.small', { style: { fontWeight: '650' } }, m.label),
                    h('div.tiny.muted', m.desc),
                  ),
                ),
              ),
              h('div.divider', { style: { margin: '18px 0' } }),
              h('p.small', { style: { color: `hsl(${t.hue} 60% 48%)`, fontWeight: '600' } }, `→ ${t.outcome}`),
            ),
          ),
        ),
      ),
    ),
  );

  /* ------------------------------- process ------------------------------ */
  el.appendChild(
    h(
      'section.section',
      { style: { background: 'var(--bg-3)' } },
      h(
        'div.wrap',
        h(
          'div.grid.grid--2',
          { style: { alignItems: 'start', gap: '48px' } },
          h(
            'div',
            sectionHead('process', '한 학기가 흐르는 방식', '수업은 다섯 개의 마디로 반복됩니다.'),
            h(
              'div.row',
              h(
                'button.btn.btn--primary',
                {
                  'data-magnetic': '',
                  onclick: () => {
                    sfx.nav();
                    go('diagnostic');
                  },
                },
                '지금 진단부터 시작하기',
              ),
            ),
          ),
          h(
            'div.timeline',
            { 'data-reveal-stagger': '80' },
            ...PROCESS.map((s) =>
              h(
                'div.tl-step',
                { 'data-reveal': 'right' },
                h('div.tl-num', s.step),
                h(
                  'div',
                  h('h4.h3', { style: { marginBottom: '4px' } }, s.title),
                  h('p.small.muted', s.copy),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  /* ------------------------------ teachers ------------------------------ */
  el.appendChild(
    h(
      'section.section',
      h(
        'div.wrap',
        sectionHead('teachers', '가르치는 사람들', '각자의 영역에서 오래 한 가지를 파고든 강사진.'),
        h(
          'div.grid.grid--4',
          { 'data-reveal-stagger': '70' },
          ...TEACHERS.map((t) =>
            h(
              'div.card',
              { 'data-reveal': 'scale', 'data-tilt': '9' },
              h('div.avatar', { style: `--h:${t.hue}` }, t.initial),
              h('h4.h3', { style: { marginTop: '16px' } }, t.name),
              h('div.small.muted', { style: { marginBottom: '10px' } }, t.role),
              h('span.tag', t.focus),
              h(
                'p.small',
                { style: { marginTop: '14px', fontStyle: 'italic', color: 'var(--ink-2)' } },
                `“${t.words}”`,
              ),
            ),
          ),
        ),
      ),
    ),
  );

  /* ----------------------------- testimonials --------------------------- */
  el.appendChild(
    h(
      'section.section--tight',
      h(
        'div.wrap',
        h(
          'div.grid.grid--4',
          { 'data-reveal-stagger': '60' },
          ...TESTIMONIALS.map((t) =>
            h(
              'div.card.card--flat',
              { 'data-reveal': '' },
              h('p.small', { style: { marginBottom: '12px', lineHeight: '1.75' } }, `“${t.text}”`),
              h('div.tiny.muted', `— ${t.who}`),
            ),
          ),
        ),
      ),
    ),
  );

  /* --------------------------------- faq -------------------------------- */
  el.appendChild(
    h(
      'section.section',
      h(
        'div.wrap',
        { style: { maxWidth: '820px' } },
        sectionHead('faq', '자주 묻는 질문'),
        accordion(FAQ.map((f) => ({ q: f.q, a: f.a }))),
      ),
    ),
  );

  /* --------------------------------- cta -------------------------------- */
  el.appendChild(
    h(
      'section.section',
      h(
        'div.wrap',
        h(
          'div.card',
          {
            'data-reveal': 'scale',
            style: {
              padding: 'clamp(36px, 6vw, 72px)',
              textAlign: 'center',
              background: 'var(--grad)',
              border: 'none',
              color: '#fff',
            },
          },
          h('h2.h1', { style: { color: '#fff', marginBottom: '14px' } }, '오늘의 한 문제부터.'),
          h(
            'p',
            { style: { opacity: '0.92', maxWidth: '48ch', marginInline: 'auto', marginBottom: '28px' } },
            '진단은 5분, 첫 루틴 설계는 2분이면 끝납니다. 계정도, 설치도 필요 없습니다.',
          ),
          h(
            'div.row',
            { style: { justifyContent: 'center' } },
            h(
              'button.btn.btn--lg',
              {
                style: { background: '#fff', color: 'var(--a1)' },
                'data-magnetic': '',
                onclick: () => {
                  sfx.nav();
                  go('diagnostic');
                },
              },
              '진단 평가 시작하기',
            ),
            h(
              'button.btn.btn--lg',
              {
                style: { background: 'rgba(255,255,255,.18)', color: '#fff' },
                onclick: () => {
                  sfx.nav();
                  go('routine');
                },
              },
              '루틴부터 짜기',
            ),
          ),
        ),
      ),
    ),
  );

  /* ------------------------------- contact ------------------------------ */
  el.appendChild(
    h(
      'footer.footer',
      h(
        'div.wrap',
        h(
          'div.grid.grid--3',
          h(
            'div',
            h(
              'div.brand',
              { style: { marginBottom: '12px' } },
              h('span.brand__mark', '수'),
              h('span', BRAND.name),
            ),
            h('p.small.muted', BRAND.tagline),
          ),
          h(
            'div',
            h('div.small', { style: { fontWeight: '700', marginBottom: '8px' } }, '찾아오시는 길'),
            h('p.small.muted', CONTACT.address),
            h('p.small.muted', CONTACT.hours),
          ),
          h(
            'div',
            h('div.small', { style: { fontWeight: '700', marginBottom: '8px' } }, '상담'),
            h('p.small.muted', CONTACT.phone),
            h('p.small.muted', CONTACT.email),
            h('p.tiny.muted', { style: { marginTop: '6px' } }, CONTACT.note),
          ),
        ),
        h('div.divider'),
        h(
          'div.spread',
          h('span.tiny.muted', `© ${new Date().getFullYear()} ${BRAND.name}. 학습 기록은 이 브라우저에만 저장됩니다.`),
          h('span.tiny.muted', BRAND.slogan.join(' · ')),
        ),
      ),
    ),
  );

  return {
    el,
    title: '홈',
    mounted() {
      scene = createHeroScene(canvas);
      if (scene) {
        unsubs.push(onScrollProgress(hero, (prog) => scene?.setProgress(prog)));
      }

      // Pinned pillar sequence.
      unsubs.push(
        onScrollProgress(pinSection.querySelector<HTMLElement>('.pin')!, (prog) => {
          const idx = Math.min(PILLARS.length - 1, Math.floor(prog * PILLARS.length * 1.02));
          pinCards.forEach((c, i) => c.classList.toggle('is-on', i === idx));
          pips.forEach((c, i) => c.classList.toggle('is-on', i === idx));
        }),
      );

      enhance(el);
    },
    destroy() {
      scene?.destroy();
      for (const u of unsubs) u();
    },
  };
}

export const HOME_DOMAIN_HUES = DOMAIN_HUE;

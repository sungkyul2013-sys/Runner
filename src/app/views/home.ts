import { sfx } from '../core/audio';
import { h } from '../core/dom';
import { countUpOnView, enhance, onScrollProgress } from '../core/motion';
import { go, type ViewHandle } from '../core/router';
import { levelFromXp, rankFor, store } from '../core/store';
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
import { STAGES, currentStageIndex, totalStars } from '../data/stages';
import { createHeroScene } from '../three/HeroScene';
import { accordion, sectionHead } from '../ui/components';

function splitWords(text: string, delayStart = 0, wordClass = ''): HTMLElement {
  const wrap = h('span.reveal-words');
  const words = text.split(' ');
  words.forEach((word, i) => {
    const span = h(
      `span${wordClass ? `.${wordClass}` : ''}`,
      { style: { animationDelay: `${delayStart + i * 90}ms` } },
      word,
    );
    wrap.appendChild(span);
    if (i < words.length - 1) wrap.appendChild(document.createTextNode(' '));
  });
  return wrap;
}

export function homeView(): ViewHandle {
  const el = h('div');
  let scene: ReturnType<typeof createHeroScene> = null;
  const unsubs: (() => void)[] = [];

  const p = store.profile;
  const { level } = levelFromXp(p.xp);
  const returning = p.attempts.length > 0;
  const stageIdx = currentStageIndex(p.stages);
  const nextStage = STAGES[stageIdx];

  /* ---------------------------- title screen ---------------------------- */
  const canvas = h('canvas.hero__canvas') as HTMLCanvasElement;

  const hero = h(
    'section.hero',
    canvas,
    h('div.hero__veil'),
    h(
      'div.wrap.hero__inner',
      h(
        'div.hero__badge',
        { style: { marginBottom: '18px' } },
        h('i.hero__dot'),
        returning ? `${rankFor(level)} · Lv.${level}` : `since ${BRAND.since} · 국어 전문 학원`,
      ),
      h(
        'h1.h-display',
        { style: { marginBottom: '14px' } },
        splitWords('읽고 따지고'),
        h('br'),
        splitWords('쓰는 힘.', 270, 'sticker'),
      ),
      h(
        'p.lede',
        { style: { marginBottom: '22px' } },
        '문학 · 문법 · 비문학 · 어휘 · 논술을 스무 개의 단계로 나눠 하나씩 넘습니다.',
      ),
      h(
        'div.stack',
        { style: { gap: '10px' } },
        h(
          'button.btn.btn--primary.btn--lg.btn--block',
          {
            onclick: () => {
              sfx.nav();
              go('journey');
            },
          },
          returning ? `${nextStage.no}단계 · ${nextStage.name}` : '지도에서 시작하기',
          h('span', '→'),
        ),
        h(
          'button.btn.btn--ghost.btn--block',
          {
            onclick: () => {
              sfx.nav();
              go(returning ? 'hub' : 'diagnostic');
            },
          },
          returning ? '학습 도구 열기' : '먼저 진단 평가 받기',
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

  /* ------------------------------ progress ------------------------------ */
  const stars = totalStars(p.stages);
  el.appendChild(
    h(
      'div.wrap',
      { style: { marginTop: '8px' } },
      h(
        'div.card',
        { 'data-reveal': '' },
        h(
          'div.spread',
          { style: { marginBottom: '12px' } },
          h(
            'div',
            h('div.eyebrow', { style: { marginBottom: '2px' } }, 'your run'),
            h('h3.h3', returning ? '이어서 하기' : '아직 시작 전'),
          ),
          h('span.pill.pill--gold', `★ ${stars} / ${STAGES.length * 3}`),
        ),
        h(
          'div.grid.grid--4',
          h('div.card.card--flat.card--pad-s', h('div.tiny.muted', '연속'), h('b', `${p.streak}일`)),
          h('div.card.card--flat.card--pad-s', h('div.tiny.muted', '푼 문항'), h('b', String(p.attempts.length))),
          h('div.card.card--flat.card--pad-s', h('div.tiny.muted', '코인'), h('b', String(p.coins))),
          h('div.card.card--flat.card--pad-s', h('div.tiny.muted', '오답'), h('b', String(p.wrong.length))),
        ),
      ),
    ),
  );

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
      h('div.marquee', marqueeRow(false)),
      h('div.marquee', { style: { marginTop: '9px' } }, marqueeRow(true)),
    ),
  );

  /* ------------------------------- method ------------------------------- */
  el.appendChild(
    h(
      'section.section',
      h(
        'div.wrap',
        h(
          'div.pin',
          h(
            'div.pin__stage',
            h(
              'div.pin__head',
              h('div.eyebrow', 'our method'),
              h('h2.h1', '가르치는 순서'),
              h('p.lede', { style: { marginTop: '8px' } }, '진단 → 구조 → 근거 → 표현. 네 단계는 순서를 바꾸지 않습니다.'),
            ),
            h(
              'div.pin__cards',
              { 'data-reveal-stagger': '70' },
              ...PILLARS.map((pl) =>
                h(
                  'div.pin__card',
                  { 'data-reveal': 'scale' },
                  h(
                    'div.card',
                    h('div', { style: { fontSize: '1.9rem', marginBottom: '10px' } }, pl.icon),
                    h('h3.h2', { style: { marginBottom: '8px' } }, pl.title),
                    h('p.lede', { style: { marginBottom: '14px' } }, pl.copy),
                    h('ul.list-check', ...pl.detail.map((d) => h('li', d))),
                  ),
                ),
              ),
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
      { style: { background: 'var(--bg-3)' } },
      h(
        'div.wrap',
        sectionHead('curriculum', '학년이 아니라 진단으로', '여섯 개의 트랙, 각자의 출발선.'),
        h(
          'div.stack',
          { 'data-reveal-stagger': '50' },
          ...TRACKS.map((t) =>
            h(
              'details.card',
              { 'data-reveal': '', style: `--h:${t.hue}` },
              h(
                'summary',
                { style: { listStyle: 'none' } },
                h(
                  'div.spread',
                  h(
                    'div',
                    h('span.tag.tag--h', { style: `--h:${t.hue}` }, t.target),
                    h('h3.h3', { style: { marginTop: '6px' } }, t.name),
                    h('div.tiny.muted', t.tagline),
                  ),
                  h('span.tiny.muted', t.weekly),
                ),
              ),
              h(
                'div.stack',
                { style: { gap: '9px', marginTop: '14px' } },
                ...t.modules.map((m) =>
                  h('div', h('div.small', { style: { fontWeight: '700' } }, m.label), h('div.tiny.muted', m.desc)),
                ),
              ),
              h('div.divider'),
              h('p.small', { style: { color: `hsl(${t.hue} 58% 46%)`, fontWeight: '700' } }, `→ ${t.outcome}`),
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
      h(
        'div.wrap',
        sectionHead('process', '한 학기가 흐르는 방식'),
        h(
          'div.timeline',
          { 'data-reveal-stagger': '70' },
          ...PROCESS.map((s) =>
            h(
              'div.tl-step',
              { 'data-reveal': 'right' },
              h('div.tl-num', s.step),
              h('div', h('h4.h3', { style: { marginBottom: '2px' } }, s.title), h('p.small.muted', s.copy)),
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
      { style: { background: 'var(--bg-3)' } },
      h(
        'div.wrap',
        sectionHead('teachers', '가르치는 사람들'),
        h(
          'div.stack',
          { 'data-reveal-stagger': '60' },
          ...TEACHERS.map((t) =>
            h(
              'div.card',
              { 'data-reveal': '' },
              h(
                'div.row',
                { style: { gap: '13px', flexWrap: 'nowrap', alignItems: 'flex-start' } },
                h('div.avatar', { style: `--h:${t.hue}` }, t.initial),
                h(
                  'div',
                  { style: { minWidth: '0' } },
                  h('h4.h3', t.name),
                  h('div.tiny.muted', { style: { marginBottom: '6px' } }, `${t.role} · ${t.focus}`),
                  h('p.small', { style: { color: 'var(--ink-2)', fontStyle: 'italic' } }, `“${t.words}”`),
                ),
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
          'div.grid.grid--2',
          { 'data-reveal-stagger': '50' },
          ...TESTIMONIALS.map((t) =>
            h(
              'div.card.card--flat',
              { 'data-reveal': '' },
              h('p.small', { style: { marginBottom: '9px', lineHeight: '1.7' } }, `“${t.text}”`),
              h('div.tiny.muted', `— ${t.who}`),
            ),
          ),
        ),
      ),
    ),
  );

  /* --------------------------------- faq -------------------------------- */
  el.appendChild(
    h('section.section', h('div.wrap', sectionHead('faq', '자주 묻는 질문'), accordion(FAQ))),
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
              padding: '30px 22px',
              textAlign: 'center',
              background: 'linear-gradient(160deg, var(--gold), var(--danjeong))',
              border: 'none',
              color: '#241300',
            },
          },
          h('h2.h1', { style: { color: '#241300', marginBottom: '10px' } }, '오늘의 한 단계부터.'),
          h(
            'p.small',
            { style: { opacity: '0.86', marginBottom: '20px' } },
            '계정도, 설치도 필요 없습니다. 기록은 이 브라우저에만 남습니다.',
          ),
          h(
            'button.btn.btn--block',
            {
              style: { background: '#1a1206', color: '#ffd76a', boxShadow: '0 4px 0 #000' },
              onclick: () => {
                sfx.nav();
                go('journey');
              },
            },
            '지도 열기',
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
          'div.stack',
          h(
            'div',
            h('div', { style: { fontWeight: '900', fontSize: '1.05rem', marginBottom: '4px' } }, BRAND.name),
            h('p.small.muted', BRAND.tagline),
          ),
          h(
            'div',
            h('div.small', { style: { fontWeight: '800', marginBottom: '4px' } }, '찾아오시는 길'),
            h('p.small.muted', CONTACT.address),
            h('p.small.muted', CONTACT.hours),
          ),
          h(
            'div',
            h('div.small', { style: { fontWeight: '800', marginBottom: '4px' } }, '상담'),
            h('p.small.muted', `${CONTACT.phone} · ${CONTACT.email}`),
            h('p.tiny.muted', CONTACT.note),
          ),
        ),
        h('div.divider'),
        h('span.tiny.muted', `© ${new Date().getFullYear()} ${BRAND.name} · ${BRAND.slogan.join(' · ')}`),
      ),
    ),
  );

  return {
    el,
    title: '홈',
    mounted() {
      scene = createHeroScene(canvas);
      if (scene) unsubs.push(onScrollProgress(hero, (prog) => scene?.setProgress(prog)));
      enhance(el);
    },
    destroy() {
      scene?.destroy();
      for (const u of unsubs) u();
    },
  };
}

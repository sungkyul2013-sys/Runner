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
import { CONCEPTS } from '../data/concepts';
import { QUESTION_COUNT } from '../data/questions';
import { PASSAGES } from '../data/passages';
import { STAGES, clearedCount, currentStageIndex, totalStars } from '../data/stages';
import { VOCAB } from '../data/vocab';
import { createHeroScene } from '../three/HeroScene';
import { accordion } from '../ui/components';
import { consultForm } from '../ui/consultForm';
import { cornerMark, ornamentRule, seal } from '../ui/ornament';

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

/** Section heading in the editorial style used down the marketing scroll. */
function head(eyebrow: string, title: string, lede?: string): HTMLElement {
  return h(
    'header.sect-head',
    { 'data-reveal': '' },
    h('div.sect-head__eyebrow', h('i'), h('span', eyebrow)),
    h('h2.sect-head__title', title),
    lede ? h('p.sect-head__lede', { html: lede }) : null,
  );
}

export function homeView(): ViewHandle {
  const el = h('div.home');
  let scene: ReturnType<typeof createHeroScene> = null;
  const unsubs: (() => void)[] = [];

  const p = store.profile;
  const { level } = levelFromXp(p.xp);
  const returning = p.attempts.length > 0;
  /** A newcomer gets the guided course as the headline action. */
  const firstRun = !p.onboarded && !returning;
  const nextStage = STAGES[currentStageIndex(p.stages)];

  /* =============================== 표지 ================================ */
  const canvas = h('canvas.hero__canvas') as HTMLCanvasElement;

  const cover = h(
    'section.cover',
    canvas,
    h('div.hero__veil'),
    h(
      'div.cover__frame',
      h('span.cover__corner.cover__corner--tl', cornerMark(0)),
      h('span.cover__corner.cover__corner--tr', cornerMark(90)),
      h('span.cover__corner.cover__corner--br', cornerMark(180)),
      h('span.cover__corner.cover__corner--bl', cornerMark(270)),
    ),
    h('div.cover__rail', '讀 · 論 · 述'),
    h(
      'div.cover__inner',
      h(
        'div.cover__badge',
        h('i.hero__dot'),
        returning ? `${rankFor(level)} · Lv.${level}` : `since ${BRAND.since} · 국어 전문 학원`,
      ),
      h(
        'h1.cover__title',
        splitWords('읽고 따지고'),
        h('br'),
        splitWords('쓰는 힘.', 260, 'foil'),
      ),
      h('p.cover__lede', '문학 · 문법 · 비문학 · 어휘 · 논술을 스물여덟 단계로 나눠 하나씩 넘습니다.'),
      h(
        'div.cover__actions',
        h(
          'button.btn.btn--primary.btn--lg.btn--block',
          {
            onclick: () => {
              sfx.nav();
              go(firstRun ? 'start' : 'journey');
            },
          },
          firstRun ? '3분 체험 시작' : `${nextStage.no}단계 · ${nextStage.name}`,
          h('span', '→'),
        ),
        h(
          'button.btn.btn--ghost.btn--block',
          {
            onclick: () => {
              sfx.nav();
              go(firstRun ? 'journey' : 'hub');
            },
          },
          firstRun ? '체험 없이 바로 둘러보기' : '학습 도구 열기',
        ),
      ),
      firstRun
        ? h(
            'p.cover__hint',
            '진단 · 수업 · 어휘 · 루틴까지 한 번에 겪어 보는 안내 코스입니다.',
          )
        : null,
      returning
        ? h(
            'div.cover__run',
            h('span', `★ ${totalStars(p.stages)}`),
            h('i'),
            h('span', `${clearedCount(p.stages)}/${STAGES.length} 단계`),
            h('i'),
            h('span', `🔥 ${p.streak}일`),
          )
        : null,
    ),
    h('div.cover__seal', seal('수')),
    h('div.scroll-cue', h('i'), h('span', '아래로')),
  );
  el.appendChild(cover);

  /* ============================ 학원 소개 ============================== */

  el.appendChild(
    h(
      'section.section',
      h(
        'div.wrap',
        head(
          '수 국어논술',
          '국어는 재능이 아니라 습관입니다',
          '읽는 힘, 따지는 힘, 쓰는 힘. 세 가지를 하나의 흐름으로 잇는 것이 우리 수업의 전부입니다.',
        ),
        h(
          'div.figures',
          { 'data-reveal-stagger': '70' },
          ...HERO_STATS.map((s) => {
            const b = h('b', '0');
            countUpOnView(b, s.value, { suffix: s.suffix });
            return h('div.figure', { 'data-reveal': '' }, b, h('span', s.label));
          }),
        ),
      ),
    ),
  );

  el.appendChild(h('div.wrap', ornamentRule()));

  /* 방법론 */
  el.appendChild(
    h(
      'section.section',
      h(
        'div.wrap',
        head('method', '가르치는 순서', '진단 → 구조 → 근거 → 표현. 네 단계는 순서를 바꾸지 않습니다.'),
        h(
          'div.stack',
          { style: { gap: '14px' }, 'data-reveal-stagger': '80' },
          ...PILLARS.map((pl, i) =>
            h(
              'article.pillar',
              { 'data-reveal': 'scale' },
              h('div.pillar__no', String(i + 1).padStart(2, '0')),
              h('div.pillar__icon', pl.icon),
              h('h3.pillar__title', pl.title),
              h('p.pillar__copy', pl.copy),
              h('ul.list-check', ...pl.detail.map((d) => h('li', d))),
            ),
          ),
        ),
      ),
    ),
  );

  /* 커리큘럼 */
  el.appendChild(
    h(
      'section.section.section--sunk',
      h(
        'div.wrap',
        head('curriculum', '학년이 아니라 진단으로', '여섯 개의 트랙, 각자의 출발선.'),
        h(
          'div.stack',
          { 'data-reveal-stagger': '50' },
          ...TRACKS.map((t) =>
            h(
              'details.track',
              { 'data-reveal': '', style: `--h:${t.hue}` },
              h(
                'summary.track__head',
                h(
                  'div',
                  h('span.tag.tag--h', { style: `--h:${t.hue}` }, t.target),
                  h('h3.track__name', t.name),
                  h('div.tiny.muted', t.tagline),
                ),
                h('span.track__chev', '＋'),
              ),
              h('div.track__meta', t.weekly),
              h(
                'div.stack',
                { style: { gap: '10px', marginTop: '12px' } },
                ...t.modules.map((m) =>
                  h(
                    'div.track__mod',
                    h('div.small', { style: { fontWeight: '700' } }, m.label),
                    h('div.tiny.muted', m.desc),
                  ),
                ),
              ),
              h('div.track__out', `→ ${t.outcome}`),
            ),
          ),
        ),
      ),
    ),
  );

  /* 앱이 하는 일 */
  el.appendChild(
    h(
      'section.section',
      h(
        'div.wrap',
        head(
          'the app',
          '수업이 없는 날에도',
          `문항 <b>${QUESTION_COUNT}개</b> · 지문 <b>${PASSAGES.length}편</b> · 개념 <b>${CONCEPTS.length}장</b> · 어휘 <b>${VOCAB.length}개</b>가 손안에 있습니다.`,
        ),
        h(
          'div.grid.grid--2',
          { 'data-reveal-stagger': '60' },
          ...[
            { t: '스물여덟 단계의 여정', d: '별 셋을 모두 모으면 다음 장이 열립니다. 단계마다 보너스 목표가 따로 있습니다.', k: '🗺️' },
            { t: '여섯 역량 진단', d: '점수가 아니라 균형을 봅니다. 결과가 그대로 루틴의 설계도가 됩니다.', k: '🧭' },
            { t: '오답은 두 번 맞혀야 졸업', d: '한 번 맞힌 것은 우연일 수 있습니다.', k: '♻️' },
            { t: '논술 문장 점검', d: '이중 피동·겹말·긴 문장·모호한 지시어를 자동으로 잡아 줍니다.', k: '✍️' },
          ].map((x) =>
            h(
              'div.feature',
              { 'data-reveal': '' },
              h('div.feature__icon', x.k),
              h('h4.feature__title', x.t),
              h('p.feature__copy', x.d),
            ),
          ),
        ),
      ),
    ),
  );

  el.appendChild(h('div.wrap', ornamentRule()));

  /* 프로세스 */
  el.appendChild(
    h(
      'section.section',
      h(
        'div.wrap',
        head('process', '한 학기가 흐르는 방식'),
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

  /* 강사진 */
  el.appendChild(
    h(
      'section.section.section--sunk',
      h(
        'div.wrap',
        head('teachers', '가르치는 사람들'),
        h(
          'div.stack',
          { 'data-reveal-stagger': '60' },
          ...TEACHERS.map((t) =>
            h(
              'article.teacher',
              { 'data-reveal': '' },
              h('div.avatar', { style: `--h:${t.hue}` }, t.initial),
              h(
                'div',
                { style: { minWidth: '0' } },
                h('h4.teacher__name', t.name),
                h('div.tiny.muted', `${t.role} · ${t.focus}`),
                h('p.teacher__words', `“${t.words}”`),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  /* 후기 */
  el.appendChild(
    h(
      'section.section',
      h(
        'div.wrap',
        head('voices', '남겨 주신 말'),
        h(
          'div.stack',
          { 'data-reveal-stagger': '50' },
          ...TESTIMONIALS.map((t) =>
            h(
              'blockquote.quote',
              { 'data-reveal': '' },
              h('p', t.text),
              h('cite', `— ${t.who}`),
            ),
          ),
        ),
      ),
    ),
  );

  /* FAQ */
  el.appendChild(h('section.section', h('div.wrap', head('faq', '자주 묻는 질문'), accordion(FAQ))));

  el.appendChild(h('div.wrap', ornamentRule()));

  /* ============================== 상담 ================================= */
  el.appendChild(
    h(
      'section.section#consult',
      h(
        'div.wrap',
        head(
          'consultation',
          '상담은 진단에서 시작합니다',
          '학생의 현재 좌표를 확인하고, 무엇부터 바꿀지 함께 정합니다. 상담은 40분, 사전 예약제로 운영합니다.',
        ),
        h('div.card.consult__card', { 'data-reveal': 'scale' }, consultForm()),
        h(
          'div.contact-grid',
          { 'data-reveal': '' },
          h('div.contact-cell', h('span.tiny.muted', '오시는 길'), h('b', CONTACT.address)),
          h('div.contact-cell', h('span.tiny.muted', '운영 시간'), h('b', CONTACT.hours)),
          h('div.contact-cell', h('span.tiny.muted', '전화'), h('b', CONTACT.phone)),
          h('div.contact-cell', h('span.tiny.muted', '메일'), h('b', CONTACT.email)),
        ),
      ),
    ),
  );

  /* 푸터 */
  el.appendChild(
    h(
      'footer.footer',
      h(
        'div.wrap',
        h(
          'div.footer__top',
          h('div.footer__mark', seal('수')),
          h(
            'div',
            h('div.footer__name', BRAND.name),
            h('p.small.muted', BRAND.tagline),
          ),
        ),
        h('div.divider'),
        h(
          'div.spread',
          h('span.tiny.muted', `© ${new Date().getFullYear()} ${BRAND.name}`),
          h('span.tiny.muted', BRAND.slogan.join(' · ')),
        ),
        h(
          'p.tiny.muted',
          { style: { marginTop: '12px' } },
          '학습 기록은 이 브라우저에만 저장되며 어디로도 전송되지 않습니다.',
        ),
      ),
    ),
  );

  return {
    el,
    title: '홈',
    mounted() {
      scene = createHeroScene(canvas);
      if (scene) unsubs.push(onScrollProgress(cover, (prog) => scene?.setProgress(prog)));
      enhance(el);
    },
    destroy() {
      scene?.destroy();
      for (const u of unsubs) u();
    },
  };
}

import { h } from '../core/dom';
import type { Router } from '../core/router';
import { morph, onScroll, pinProgress, type ScrollState } from '../core/stage';
import type { ShapeName } from '../../shared/three/shapes';
import { COURSES, TEACHER } from '../data/content';

/**
 * The long-form chapter below the app home.
 *
 * Six full-bleed screens, product-page pacing: one idea each, a pinned
 * stage where the 3D form turns over three beats, and a pinned horizontal
 * run through the four courses. Everything reads from the shared scroll
 * loop, and every subscriber dies with its element.
 */

const reduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Reveals an element once, the first time it clears the fold. */
function reveal(el: HTMLElement, at = 0.16): HTMLElement {
  if (reduced() || !('IntersectionObserver' in window)) {
    el.classList.add('is-seen');
    return el;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-seen');
        io.disconnect();
      }
    },
    { threshold: at },
  );
  io.observe(el);
  return el;
}

/* ─────────────────────────── 01 opening ──────────────────────────── */

function opening(): HTMLElement {
  return h(
    'section',
    { class: 'ch ch--ink ch--open', 'data-ground': 'ink', 'data-shape': 'glyph' },
    h(
      'div',
      { class: 'ch__wrap' },
      reveal(
        h(
          'div',
          { class: 'lift' },
          h('p', { class: 'ch__eyebrow', text: '수 국어논술' }),
          h(
            'h2',
            { class: 'ch__display' },
            '읽는 힘은',
            h('br'),
            h('span', { class: 'pen', text: '타고나지' }),
            ' 않습니다.',
          ),
          h('p', {
            class: 'ch__lede',
            text: '매주 한 편을 쓰고, 문장마다 이유를 들으며 고쳐 쓰는 동안 만들어집니다.',
          }),
          h('p', { class: 'ch__cue' }, h('i'), '아래로'),
        ),
      ),
    ),
  );
}

/* ──────────────────────── 02 pinned stage ────────────────────────── */

interface Beat {
  no: string;
  head: [string, string];
  sub: string;
  shape: ShapeName;
}

const BEATS: Beat[] = [
  {
    no: '01 — 칸',
    head: ['한 칸에서', '시작합니다.'],
    sub: '원고지 한 칸을 채우는 일. 모든 글은 여기서 출발합니다.',
    shape: 'grid',
  },
  {
    no: '02 — 완독',
    head: ['한 권을', '끝까지.'],
    sub: '발췌문이 아니라 완독. 긴 지문 앞에서 흔들리지 않는 힘이 여기서 생깁니다.',
    shape: 'book',
  },
  {
    no: '03 — 문장',
    head: ['자기 문장으로', '끝냅니다.'],
    sub: '남의 요약이 아니라 내 주장으로 닫는 글. 그것이 논술입니다.',
    shape: 'glyph',
  },
];

function stageChapter(): HTMLElement {
  const beats = BEATS.map((b, i) =>
    h(
      'div',
      { class: `beat${i === 0 ? ' is-on' : ''}` },
      h('p', { class: 'beat__no', text: b.no }),
      h('h2', { class: 'beat__head' }, b.head[0], h('br'), b.head[1]),
      h('p', { class: 'beat__sub', text: b.sub }),
    ),
  );

  const ticks = BEATS.map(() => h('i'));
  const rail = h(
    'div',
    { class: 'stage__rail', 'aria-hidden': 'true' },
    ...ticks.map((t) => h('div', { class: 'stage__tick' }, t)),
  );

  const section = h(
    'section',
    { class: 'stage', 'data-ground': 'ink' },
    h(
      'div',
      { class: 'stage__pin' },
      h('div', { class: 'beats' }, ...beats),
      rail,
    ),
  );

  let active = -1;

  onScroll(section, ({ vh }: ScrollState) => {
    // Lead-in and hand-off keep the first and last beats on screen a beat
    // longer than a plain three-way split would.
    const p = pinProgress(section, vh);
    const eased = Math.min(1, Math.max(0, (p - 0.08) / 0.84));
    const exact = eased * BEATS.length;
    const index = Math.min(BEATS.length - 1, Math.floor(exact));

    for (let i = 0; i < ticks.length; i += 1) {
      const fill = Math.min(1, Math.max(0, exact - i));
      ticks[i].style.width = `${fill * 100}%`;
    }

    // Asserted every frame: morph() ignores a repeat, and this is what
    // restores the right form when you scroll back up into the stage.
    morph(BEATS[index].shape);

    if (index === active) return;
    active = index;
    beats.forEach((b, i) => b.classList.toggle('is-on', i === index));
  });

  return section;
}

/* ───────────────────────── 03 the rewrite ────────────────────────── */

function rewriteChapter(): HTMLElement {
  const block = h(
    'div',
    { class: 'rewrite' },
    h('p', { class: 'rewrite__meta', text: '첨삭 전' }),
    h(
      'p',
      { class: 'rewrite__line rewrite__before' },
      h('span', { text: '나는 이 책이 정말 재미있었다고 생각한다.' }),
    ),
    h('p', { class: 'rewrite__meta', text: '같은 학생, 2주 뒤' }),
    h('p', {
      class: 'rewrite__line rewrite__after',
      text: '주인공은 실패할 것을 알면서도 같은 선택을 반복한다.',
    }),
    h('p', {
      class: 'rewrite__caption',
      text: '문장마다 왜 고쳐야 하는지를 적어 돌려주고, 학생이 같은 글을 다시 씁니다. 가르친 것은 표현이 아니라 근거를 세우는 순서입니다.',
    }),
  );

  return h(
    'section',
    { class: 'ch ch--paper', 'data-ground': 'paper' },
    h(
      'div',
      { class: 'ch__wrap' },
      reveal(
        h(
          'div',
          { class: 'lift' },
          h('p', { class: 'ch__eyebrow', text: '첨삭' }),
          h(
            'h2',
            { class: 'ch__display' },
            '한 문장이',
            h('br'),
            '바뀌는 데',
            h('br'),
            h('span', { class: 'pen', text: '2주' }),
            '.',
          ),
        ),
      ),
      h('div', { style: { marginTop: 'clamp(40px, 8vw, 72px)' } }, reveal(block, 0.3)),
    ),
  );
}

/* ───────────────────────── 04 the teacher ────────────────────────── */

function teacherChapter(): HTMLElement {
  return h(
    'section',
    { class: 'ch ch--ink', 'data-ground': 'ink', 'data-shape': 'sphere' },
    h(
      'div',
      { class: 'ch__wrap' },
      reveal(
        h(
          'div',
          { class: 'lift' },
          h('p', { class: 'ch__eyebrow', text: '선생님' }),
          h(
            'h2',
            { class: 'ch__display' },
            '한 반을',
            h('br'),
            h('span', { class: 'pen', text: '끝까지' }),
            ' 맡습니다.',
          ),
          h(
            'div',
            { class: 'teacher' },
            h(
              'div',
              { class: 'teacher__id' },
              h('span', { class: 'teacher__name', text: `${TEACHER.name} ${TEACHER.role}` }),
              h('span', { class: 'teacher__line', text: TEACHER.line }),
            ),
            h('p', { class: 'teacher__bio', text: TEACHER.bio }),
            h('blockquote', { class: 'teacher__quote', text: TEACHER.belief }),
          ),
        ),
      ),
    ),
  );
}

/* ───────────────────────── 05 the numbers ────────────────────────── */

const SPECS: [number, string, string][] = [
  [1200, '+', '누적 수강생'],
  [26, '개월', '평균 재원 기간'],
  [48000, '편', '누적 1:1 첨삭'],
  [94, '%', '학부모 재등록률'],
];

function numbersChapter(): HTMLElement {
  const rows = SPECS.map(([value, unit, label]) => {
    const out = h('b', { class: 'num', text: '0' });

    const row = h(
      'div',
      { class: 'spec lift' },
      h('span', { class: 'spec__n' }, out, h('em', { text: unit })),
      h('span', { class: 'spec__label', text: label }),
    );

    if (reduced() || !('IntersectionObserver' in window)) {
      out.textContent = value.toLocaleString('ko-KR');
      row.classList.add('is-seen');
      return row;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          row.classList.add('is-seen');
          io.disconnect();

          const t0 = performance.now();
          const step = (now: number): void => {
            const t = Math.min(1, (now - t0) / 1400);
            const eased = 1 - Math.pow(1 - t, 3);
            out.textContent = Math.round(value * eased).toLocaleString('ko-KR');
            if (t < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.6 },
    );
    io.observe(row);
    return row;
  });

  return h(
    'section',
    { class: 'ch ch--ink', 'data-ground': 'ink', 'data-shape': 'wave' },
    h(
      'div',
      { class: 'ch__wrap' },
      reveal(
        h(
          'div',
          { class: 'lift' },
          h('p', { class: 'ch__eyebrow', text: '기록' }),
          h('h2', { class: 'ch__display' }, '숫자는 결과가 아니라', h('br'), '누적된 시간입니다.'),
        ),
      ),
      h('div', { class: 'specs' }, ...rows),
      h('p', { class: 'specs__note', text: '2009년 개원 이후 누적 · 본 페이지의 수치는 예시 데이터입니다.' }),
    ),
  );
}

/* ────────────────────── 05 pinned course rail ────────────────────── */

function stepsChapter(router: Router): HTMLElement {
  const track = h(
    'div',
    { class: 'steps__track' },
    ...COURSES.map((c, i) =>
      h(
        'button',
        {
          class: 'step',
          type: 'button',
          on: { click: () => router.go(`/course/${c.id}`) },
        },
        h('span', { class: 'step__no', text: `0${i + 1}` }),
        h('span', { class: 'step__name', text: c.name }),
        h('span', { class: 'step__who', text: c.who }),
        h('span', { class: 'step__sum', text: c.summary }),
        h('span', { class: 'step__hours', text: `${c.hours} · 정원 ${c.cap}명` }),
      ),
    ),
  );

  const section = h(
    'section',
    { class: 'steps', 'data-ground': 'ink', 'data-shape': 'helix' },
    h(
      'div',
      { class: 'steps__pin' },
      h(
        'header',
        { class: 'steps__head' },
        h('p', { class: 'ch__eyebrow', text: '과정' }),
        h('h2', { class: 'beat__head' }, '학년이 아니라', h('br'), '단계로 나눕니다.'),
      ),
      track,
    ),
  );

  const pin = section.querySelector('.steps__pin') as HTMLElement;

  /**
   * How far the row must slide for its last card to reach the right edge.
   *
   * Measured live rather than once at build time — the section is built
   * before the router mounts it, so anything cached then is geometry from
   * a detached element. The span is taken between the first and last card,
   * which is transform-invariant (both shift equally), and compared with
   * the pinned container rather than the viewport: on desktop the side
   * rail means those are not the same width.
   */
  const travelNow = (): number => {
    const first = track.firstElementChild as HTMLElement | null;
    const last = track.lastElementChild as HTMLElement | null;
    if (!first || !last) return 0;

    const span = last.getBoundingClientRect().right - first.getBoundingClientRect().left;
    const pad = parseFloat(getComputedStyle(track).paddingInlineStart) || 0;
    return Math.max(0, span + pad * 2 - pin.clientWidth);
  };

  onScroll(section, ({ vh }: ScrollState) => {
    const p = pinProgress(section, vh);
    track.style.transform = `translate3d(${-p * travelNow()}px,0,0)`;
  });

  return section;
}

/* ───────────────────────────── 06 close ──────────────────────────── */

function closing(router: Router): HTMLElement {
  return h(
    'section',
    { class: 'ch ch--paper ch--close', 'data-ground': 'paper' },
    h(
      'div',
      { class: 'ch__wrap' },
      reveal(
        h(
          'div',
          { class: 'lift' },
          h('p', { class: 'ch__eyebrow', style: { justifyContent: 'center' }, text: '시작' }),
          h('h2', { class: 'ch__display' }, '지금, ', h('span', { class: 'pen', text: '12문항' }), '.'),
          h('p', {
            class: 'ch__lede',
            text: '8분이면 지금 어디에 서 있는지 확인할 수 있습니다. 결과지는 등록 여부와 관계없이 드립니다.',
          }),
          h(
            'div',
            { class: 'close__acts' },
            h(
              'button',
              { class: 'btn btn--primary', type: 'button', on: { click: () => router.go('/quiz') } },
              '무료 진단 시작',
            ),
            h(
              'button',
              { class: 'btn btn--ghost', type: 'button', on: { click: () => router.go('/apply') } },
              '상담 신청',
            ),
          ),
          h('p', {
            class: 'close__fine',
            text: '서울특별시 ○○구 ○○로 00, 3층 · 평일 14:00–22:00 · 연락처와 수치는 예시 데이터입니다.',
          }),
        ),
      ),
    ),
  );
}

/* ──────────────────────────── assembly ───────────────────────────── */

export function showcase(router: Router): HTMLElement {
  const root = h(
    'div',
    { class: 'showcase' },
    opening(),
    stageChapter(),
    rewriteChapter(),
    teacherChapter(),
    numbersChapter(),
    stepsChapter(router),
    closing(router),
  );

  // The page ground follows whichever chapter holds the middle of the
  // screen, so ink chapters can stay transparent and let the field show.
  const chapters = Array.from(root.querySelectorAll<HTMLElement>('[data-ground]'));

  onScroll(root, ({ vh }: ScrollState) => {
    const line = vh * 0.5;
    let ground = '';
    let shape: string | undefined;

    for (const ch of chapters) {
      const r = ch.getBoundingClientRect();
      if (r.top <= line && r.bottom >= line) {
        ground = ch.dataset.ground ?? '';
        shape = ch.dataset.shape;
        break;
      }
    }

    document.body.classList.toggle('is-dark-chapter', ground === 'ink');
    document.body.classList.toggle('is-paper-chapter', ground === 'paper');

    // Chapters that own a shape claim it; the pinned stage drives its own.
    if (shape) morph(shape as ShapeName);
  });

  // A view can be torn down mid-chapter — never leave the page dark.
  const guard = new MutationObserver(() => {
    if (!root.isConnected) {
      document.body.classList.remove('is-dark-chapter', 'is-paper-chapter');
      guard.disconnect();
    }
  });
  guard.observe(document.body, { childList: true, subtree: true });

  // Reveal whatever is already on screen at first paint.
  requestAnimationFrame(() => {
    for (const el of root.querySelectorAll<HTMLElement>('.lift')) {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.9) el.classList.add('is-seen');
    }
  });

  return root;
}

import { clamp01, pinProgress, type ScrollState } from './scroll';

/**
 * The page's movement, in one place.
 *
 * The rule this site follows: circles move, rectangles stay put. Reveals
 * rise, the hero title turns in character by character, the emphasis is a
 * ring rather than an underline, and the one long horizontal move (the
 * lesson rail) is driven by scroll rather than by a timer.
 */

const reduced = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ──────────────────────────── 1 · 등장 ──────────────────────────── */

export function initReveals(): void {
  const items = Array.from(document.querySelectorAll<HTMLElement>('.reveal'));
  if (items.length === 0) return;

  if (reduced() || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }

  // Siblings stagger, so a row of cards arrives as a row, not all at once.
  const seen = new Map<Element, number>();
  for (const el of items) {
    const parent = el.parentElement ?? document.body;
    const n = seen.get(parent) ?? 0;
    seen.set(parent, n + 1);
    el.style.setProperty('--d', `${Math.min(n, 5) * 90}ms`);
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.1 },
  );

  items.forEach((el) => io.observe(el));
}

/* ─────────────────────── 2 · 제목 한 글자씩 ─────────────────────── */

/**
 * Splits `[data-split]` into per-character spans. `data-ring="말"` marks the
 * word the ring is drawn around — this site's only emphasis mark, taken from
 * the ㅇ in 라온.
 */
export function initSplit(): void {
  document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
    const text = el.textContent ?? '';
    const phrase = el.dataset.ring ?? '';
    const from = phrase ? text.indexOf(phrase) : -1;
    const to = from === -1 ? -1 : from + phrase.length;

    el.textContent = '';
    el.setAttribute('aria-label', text);

    let ring: HTMLElement | null = null;
    let i = 0;

    for (const ch of Array.from(text)) {
      const span = document.createElement('span');
      span.className = 'ch';
      span.textContent = ch === ' ' ? ' ' : ch;
      span.style.setProperty('--d', `${120 + i * 34}ms`);
      span.setAttribute('aria-hidden', 'true');

      const inRing = from !== -1 && i >= from && i < to;
      if (inRing) {
        if (!ring) {
          ring = document.createElement('span');
          ring.className = 'ring';
          ring.setAttribute('aria-hidden', 'true');
          el.append(ring);
        }
        ring.append(span);
      } else {
        el.append(span);
      }
      i += 1;
    }
  });
}

/* ──────────────────────────── 3 · 숫자 ──────────────────────────── */

export function initCounters(): void {
  const items = Array.from(document.querySelectorAll<HTMLElement>('.count'));
  if (items.length === 0) return;

  const run = (el: HTMLElement): void => {
    const to = Number(el.dataset.to ?? '0');
    const suffix = el.dataset.suffix ?? '';
    // A year is not a quantity: 2014 must not come out as "2,014".
    const fmt = (n: number): string =>
      el.dataset.group === 'off' ? String(n) : n.toLocaleString('ko-KR');
    const dur = 1300;
    const started = performance.now();

    const tick = (now: number): void => {
      const t = clamp01((now - started) / dur);
      // Ease out: fast first, so the number reads before it settles.
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(Math.round(to * eased)) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if (reduced() || !('IntersectionObserver' in window)) {
    items.forEach((el) => {
      const n = Number(el.dataset.to ?? '0');
      el.textContent =
        (el.dataset.group === 'off' ? String(n) : n.toLocaleString('ko-KR')) +
        (el.dataset.suffix ?? '');
    });
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        run(e.target as HTMLElement);
        io.unobserve(e.target);
      }
    },
    { threshold: 0.6 },
  );
  items.forEach((el) => io.observe(el));
}

/* ─────────────────────── 4 · 기울기 · 자석 ──────────────────────── */

/** Cards lean toward the pointer. Fine pointers only — no phone tilt. */
export function initTilt(): void {
  if (reduced() || !window.matchMedia('(pointer: fine)').matches) return;

  document.querySelectorAll<HTMLElement>('.tilt').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(900px) rotateX(${-y * 5}deg) rotateY(${x * 6}deg) translateY(-3px)`;
    });
    el.addEventListener('pointerleave', () => {
      el.style.transform = '';
    });
  });
}

/** Buttons drift a few pixels toward the cursor before it arrives. */
export function initMagnetic(): void {
  if (reduced() || !window.matchMedia('(pointer: fine)').matches) return;

  document.querySelectorAll<HTMLElement>('.magnet').forEach((el) => {
    const reset = (): void => {
      el.style.setProperty('--mx', '0px');
      el.style.setProperty('--my', '0px');
    };

    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width - 0.5) * 14}px`);
      el.style.setProperty('--my', `${((e.clientY - r.top) / r.height - 0.5) * 10}px`);
    });
    el.addEventListener('pointerleave', reset);
    el.addEventListener('blur', reset);
  });
}

/* ─────────────────── 5 · 상단 바 · 현재 섹션 ────────────────────── */

export function initBar(): (s: ScrollState) => void {
  const bar = document.getElementById('bar');
  const menu = document.getElementById('menuBtn');
  const drawer = document.getElementById('drawer');
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.bar__nav a'));

  const targets = links
    .map((a) => ({ a, el: document.querySelector<HTMLElement>(a.getAttribute('href') ?? '') }))
    .filter((t): t is { a: HTMLAnchorElement; el: HTMLElement } => t.el !== null);

  const close = (): void => {
    drawer?.setAttribute('hidden', '');
    menu?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('is-locked');
  };

  menu?.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') === 'true';
    if (open) close();
    else {
      drawer?.removeAttribute('hidden');
      menu.setAttribute('aria-expanded', 'true');
    }
  });
  drawer?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).tagName === 'A') close();
  });

  return ({ y, vh }) => {
    bar?.classList.toggle('is-stuck', y > 12);

    // Whichever linked section holds the middle of the screen owns the nav.
    let active: HTMLAnchorElement | null = null;
    for (const t of targets) {
      const r = t.el.getBoundingClientRect();
      if (r.top <= vh * 0.5 && r.bottom >= vh * 0.5) active = t.a;
    }
    for (const { a } of targets) a.classList.toggle('is-on', a === active);
  };
}

/* ─────────────────── 6 · 수업의 흐름 (가로 이동) ────────────────── */

/**
 * The lesson rail moves sideways as the section scrolls past.
 *
 * Travel is measured live rather than cached: the section is laid out after
 * this runs, and the measurement has to be against the pinned container, not
 * the viewport, or the last card stops short on wide screens.
 */
export function initFlow(): ((s: ScrollState) => void) | null {
  const section = document.getElementById('flow');
  const track = document.getElementById('flowTrack');
  const fill = document.getElementById('flowFill');
  const pin = section?.querySelector<HTMLElement>('.flow__pin');
  if (!section || !track || !pin) return null;

  const travel = (): number => {
    const cards = Array.from(track.children) as HTMLElement[];
    if (cards.length === 0) return 0;
    const first = cards[0].getBoundingClientRect();
    const last = cards[cards.length - 1].getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(track).paddingInlineStart) || 0;
    return Math.max(0, last.right - first.left + pad * 2 - pin.clientWidth);
  };

  return ({ vh }) => {
    const box = section.getBoundingClientRect();
    if (box.bottom <= 0 || box.top >= vh) return;

    const p = pinProgress(section, vh);
    // Lead in and hand off, so the first and last cards hold a beat longer.
    const eased = clamp01((p - 0.08) / 0.84);
    track.style.transform = `translate3d(${-eased * travel()}px, 0, 0)`;
    if (fill) fill.style.width = `${eased * 100}%`;
  };
}

/* ────────────────────────── 7 · 후기 띠 ─────────────────────────── */

/**
 * The testimonial row loops for ever and leans into the scroll: it drifts on
 * its own, and moving the page pushes it along.
 */
export function initMarquee(): ((s: ScrollState) => void) | null {
  const row = document.getElementById('voiceRow');
  if (!row) return null;

  // Duplicated once so the loop can reset at exactly half the width.
  row.append(...Array.from(row.children).map((n) => n.cloneNode(true)));

  let x = 0;
  let half = row.scrollWidth / 2;
  let last = performance.now();
  let push = 0;

  if (reduced()) return () => undefined;

  const frame = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    half = row.scrollWidth / 2 || half;
    x -= (26 + Math.abs(push) * 40) * dt;
    push *= 0.9;
    if (-x >= half) x += half;

    row.style.transform = `translate3d(${x}px, 0, 0)`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  return ({ v }) => {
    push = Math.max(-1, Math.min(1, v / 2600));
  };
}

/* ─────────────────────────── 8 · 토스트 ────────────────────────── */

let toastTimer = 0;

export function toast(message: string): void {
  const el = document.getElementById('toast');
  if (!el) return;

  el.textContent = message;
  el.classList.add('is-up');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('is-up'), 3200);
}

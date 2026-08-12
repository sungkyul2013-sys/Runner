import { clamp01, pinProgress, type ScrollState } from './scroll';

const reduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ─────────────────────── 1. Scroll reveals ────────────────────────────── */

/** Fade/rise elements once, staggering siblings that share a parent. */
export function initReveals(): void {
  const items = Array.from(document.querySelectorAll<HTMLElement>('.reveal'));
  if (items.length === 0) return;

  if (reduced() || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }

  // Give each element a delay based on its index among revealing siblings.
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
    { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
  );

  items.forEach((el) => io.observe(el));
}

/* ─────────────────────── 2. Headline character split ──────────────────── */

/**
 * Wraps each character of `[data-split]` so it can fly in individually.
 *
 * `data-underline="…"` marks a substring to be struck with the correction-red
 * rule — the same emphasis language the section headings use, so the hero
 * carries the page's one accent instead of inventing a second one.
 */
export function initSplitText(): void {
  let i = 0;
  document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
    const text = el.textContent ?? '';
    const chars = Array.from(text);

    const phrase = el.dataset.underline ?? '';
    const from = phrase ? text.indexOf(phrase) : -1;
    const to = from === -1 ? -1 : from + phrase.length;

    el.textContent = '';
    el.setAttribute('aria-label', text);

    chars.forEach((ch, n) => {
      const span = document.createElement('span');
      span.className = n >= from && n < to && from !== -1 ? 'ch ch--u' : 'ch';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = ch === ' ' ? '\u00a0' : ch;
      span.style.setProperty('--d', `${240 + i * 42}ms`);
      el.appendChild(span);
      i += 1;
    });
  });
}

/* ─────────────────────── 3. Manifesto word wash ───────────────────────── */

/** Splits the manifesto into words and lights them up as you scroll past. */
export function initWordWash(): ((s: ScrollState) => void) | null {
  const host = document.querySelector<HTMLElement>('[data-words]');
  const section = host?.closest<HTMLElement>('.manifesto');
  if (!host || !section) return null;

  const text = (host.textContent ?? '').trim().replace(/\s+/g, ' ');
  host.textContent = '';
  host.setAttribute('aria-label', text);

  const words = text.split(' ').map((w) => {
    const span = document.createElement('span');
    span.className = 'w';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = `${w} `;
    host.appendChild(span);
    return span;
  });

  if (reduced()) {
    words.forEach((w) => w.classList.add('on'));
    return null;
  }

  let lastLit = -1;

  return ({ y, vh }: ScrollState) => {
    // Use the middle 70% of the pin so the first and last words breathe.
    const p = clamp01((pinProgress(section, y, vh) - 0.12) / 0.72);
    const lit = Math.round(p * words.length);
    if (lit === lastLit) return;
    lastLit = lit;

    for (let i = 0; i < words.length; i += 1) {
      const on = i < lit;
      words[i].classList.toggle('on', on);
      // The leading edge glows a touch brighter.
      words[i].classList.toggle('hot', on && i >= lit - 3);
    }
  };
}

/* ─────────────────────── 4. Counting numbers ──────────────────────────── */

/**
 * Stat figures roll like an odometer: one column per digit, each spun from
 * zero to its final value with a stagger, so the number assembles from the
 * left instead of ticking through meaningless intermediate totals.
 */
export function initCounters(): void {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-count]'));
  if (nodes.length === 0) return;

  const build = (el: HTMLElement): (() => void) => {
    const target = Number(el.dataset.count ?? 0);
    const suffix = el.dataset.suffix ?? '';
    const text = target.toLocaleString('ko-KR');

    el.textContent = '';
    el.setAttribute('aria-label', text + suffix);

    const odo = document.createElement('span');
    odo.className = 'odo';
    odo.setAttribute('aria-hidden', 'true');

    const columns: HTMLElement[] = [];
    let digitIndex = 0;

    for (const ch of text) {
      if (ch < '0' || ch > '9') {
        // Separators sit still — only digits roll.
        const sep = document.createElement('span');
        sep.textContent = ch;
        odo.appendChild(sep);
        continue;
      }

      const col = document.createElement('span');
      col.className = 'odo__d';
      const reel = document.createElement('i');
      // 0-9 then the final digit again, so the reel always spins forward.
      for (let d = 0; d <= 9; d += 1) {
        const cell = document.createElement('span');
        cell.textContent = String(d);
        reel.appendChild(cell);
      }
      reel.dataset.stop = ch;
      col.style.setProperty('--d', `${digitIndex * 110}ms`);
      col.appendChild(reel);
      odo.appendChild(col);
      columns.push(reel);
      digitIndex += 1;
    }

    const suf = document.createElement('i');
    suf.className = 'stat__suf';
    suf.textContent = suffix;
    suf.setAttribute('aria-hidden', 'true');

    el.append(odo, suf);

    return () => {
      for (const reel of columns) {
        const stop = Number(reel.dataset.stop ?? 0);
        if (reduced()) {
          reel.style.transition = 'none';
        }
        reel.style.transform = `translateY(-${stop}em)`;
      }
    };
  };

  const runners = new Map<Element, () => void>();
  for (const el of nodes) runners.set(el, build(el));

  if (reduced() || !('IntersectionObserver' in window)) {
    runners.forEach((run) => run());
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        runners.get(e.target)?.();
        io.unobserve(e.target);
      }
    },
    { threshold: 0.45 },
  );

  nodes.forEach((el) => io.observe(el));
}

/* ─────────────────────── 5. Pointer tilt on cards ─────────────────────── */

export function initTilt(): void {
  if (reduced() || !window.matchMedia('(pointer: fine)').matches) return;

  document.querySelectorAll<HTMLElement>('.tilt').forEach((el) => {
    el.addEventListener('pointerenter', () => el.classList.add('is-live'));

    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--ry', `${x * 9}deg`);
      el.style.setProperty('--rx', `${-y * 9}deg`);
      el.style.setProperty('--s', '1.015');
    });

    el.addEventListener('pointerleave', () => {
      el.classList.remove('is-live');
      el.style.setProperty('--ry', '0deg');
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--s', '1');
    });
  });
}

/* ─────────────────────── 6. Magnetic controls ─────────────────────────── */

/**
 * Primary controls lean toward the cursor before you reach them. Kept to a
 * few pixels — the point is that the button feels alive under the hand, not
 * that it visibly moves.
 */
export function initMagnetic(): void {
  if (reduced() || !window.matchMedia('(pointer: fine)').matches) return;

  const targets = document.querySelectorAll<HTMLElement>('.btn--primary, .btn--lg');

  for (const el of targets) {
    let raf = 0;

    const move = (e: PointerEvent): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.setProperty('--tx', `${dx * 0.16}px`);
        el.style.setProperty('--ty', `${dy * 0.28}px`);
      });
    };

    const reset = (): void => {
      cancelAnimationFrame(raf);
      el.style.removeProperty('--tx');
      el.style.removeProperty('--ty');
    };

    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', reset);
    el.addEventListener('blur', reset);
  }
}

/* ─────────────────────── 7. Paper spotlight ───────────────────────────── */

/** Warms the paper chapters under the cursor. Desktop, fine pointers only. */
export function initSpotlight(): void {
  if (reduced() || !window.matchMedia('(pointer: fine)').matches) return;

  const sections = Array.from(document.querySelectorAll<HTMLElement>('.section--light'));
  if (sections.length === 0) return;

  window.addEventListener(
    'pointermove',
    (e) => {
      for (const sec of sections) {
        const r = sec.getBoundingClientRect();
        const inside = e.clientY >= r.top && e.clientY <= r.bottom;
        sec.style.setProperty('--spot', inside ? '1' : '0');
        if (!inside) continue;
        sec.style.setProperty('--mx', `${e.clientX - r.left}px`);
        sec.style.setProperty('--my', `${e.clientY - r.top}px`);
      }
    },
    { passive: true },
  );
}

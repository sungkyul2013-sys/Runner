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

/** Gradient stops for the accent headline, sampled once per character. */
const GRAD_STOPS: [number, number, number][] = [
  [255, 255, 255],
  [52, 213, 255],
  [126, 138, 255],
];

function gradientAt(t: number): string {
  const step = 1 / (GRAD_STOPS.length - 1);
  const i = Math.min(GRAD_STOPS.length - 2, Math.floor(t / step));
  const f = (t - i * step) / step;
  const a = GRAD_STOPS[i];
  const b = GRAD_STOPS[i + 1];
  const mix = (k: number): number => Math.round(a[k] + (b[k] - a[k]) * f);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

/**
 * Wraps each character of `[data-split]` so it can fly in individually.
 *
 * `data-split="grad"` also tints each character along the brand gradient:
 * `background-clip: text` on the line cannot survive the split, because the
 * per-character spans paint on top of the clipped background.
 */
export function initSplitText(): void {
  let i = 0;
  document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
    const text = el.textContent ?? '';
    const chars = Array.from(text);
    const grad = el.dataset.split === 'grad';

    el.textContent = '';
    el.setAttribute('aria-label', text);

    chars.forEach((ch, n) => {
      const span = document.createElement('span');
      span.className = 'ch';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = ch === ' ' ? ' ' : ch;
      span.style.setProperty('--d', `${240 + i * 42}ms`);
      if (grad) span.style.color = gradientAt(chars.length > 1 ? n / (chars.length - 1) : 0);
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

export function initCounters(): void {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-count]'));
  if (nodes.length === 0) return;

  // Number and unit are separate nodes so the unit can be set in a smaller
  // size — "48,000편" at headline scale otherwise overflows its tile.
  for (const el of nodes) {
    el.textContent = '';
    const num = document.createElement('span');
    const suf = document.createElement('i');
    suf.className = 'stat__suf';
    suf.textContent = el.dataset.suffix ?? '';
    el.append(num, suf);
  }

  const run = (el: HTMLElement): void => {
    const target = Number(el.dataset.count ?? 0);
    const num = el.firstElementChild as HTMLElement;

    if (reduced()) {
      num.textContent = target.toLocaleString('ko-KR');
      return;
    }

    const dur = 1700;
    const t0 = performance.now();

    const step = (now: number): void => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      num.textContent = Math.round(target * eased).toLocaleString('ko-KR');
      if (p < 1) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  };

  if (!('IntersectionObserver' in window)) {
    nodes.forEach(run);
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

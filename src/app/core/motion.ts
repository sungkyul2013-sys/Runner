/**
 * Motion kit: the behaviours that give the site its "scroll and it responds"
 * feel — reveal-on-enter, scroll-linked progress, 3D pointer tilt, magnetic
 * buttons, and number count-ups.
 *
 * Everything degrades to "just show it" when reduced motion is requested.
 */

import { clamp } from './dom';
import { reducedMotion } from './store';

/* ------------------------------------------------------------------ */
/* Reveal on enter                                                     */
/* ------------------------------------------------------------------ */

let revealObserver: IntersectionObserver | null = null;

function revealNow(el: Element): void {
  el.classList.add('is-in');
}

export function observeReveals(root: ParentNode = document): void {
  const targets = [...root.querySelectorAll('[data-reveal]')].filter((e) => !e.classList.contains('is-in'));
  if (!targets.length) return;

  if (reducedMotion()) {
    targets.forEach(revealNow);
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const delay = Number((e.target as HTMLElement).dataset.revealDelay ?? 0);
          window.setTimeout(() => revealNow(e.target), delay);
          revealObserver?.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
    );
  }
  targets.forEach((t) => revealObserver?.observe(t));
}

/**
 * Stagger children of a container: `data-reveal-stagger="70"` on the parent
 * gives each `[data-reveal]` child an increasing delay.
 */
export function applyStagger(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-reveal-stagger]').forEach((parent) => {
    const step = Number(parent.dataset.revealStagger || 60);
    const kids = [...parent.children].filter((c) => (c as HTMLElement).hasAttribute('data-reveal'));
    kids.forEach((k, i) => {
      (k as HTMLElement).dataset.revealDelay = String(i * step);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Scroll-linked values                                                */
/* ------------------------------------------------------------------ */

type ScrollFn = (progress: number, rect: DOMRect) => void;
interface ScrollBinding {
  el: HTMLElement;
  fn: ScrollFn;
}

const bindings: ScrollBinding[] = [];
let rafPending = false;

/**
 * Call `fn` with 0..1 progress as `el` travels through the viewport
 * (0 = element top hits the bottom edge, 1 = element bottom leaves the top).
 */
export function onScrollProgress(el: HTMLElement, fn: ScrollFn): () => void {
  const b = { el, fn };
  bindings.push(b);
  scheduleScroll();
  return () => {
    const i = bindings.indexOf(b);
    if (i >= 0) bindings.splice(i, 1);
  };
}

function runScroll(): void {
  rafPending = false;
  const vh = window.innerHeight;
  for (const b of bindings) {
    if (!b.el.isConnected) continue;
    const r = b.el.getBoundingClientRect();
    const total = r.height + vh;
    const travelled = vh - r.top;
    b.fn(clamp(travelled / total, 0, 1), r);
  }
}

function scheduleScroll(): void {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(runScroll);
}

window.addEventListener('scroll', scheduleScroll, { passive: true });
window.addEventListener('resize', scheduleScroll);

/** Drop bindings whose element left the document (called on route change). */
export function pruneScrollBindings(): void {
  for (let i = bindings.length - 1; i >= 0; i -= 1) {
    if (!bindings[i].el.isConnected) bindings.splice(i, 1);
  }
}

/* ------------------------------------------------------------------ */
/* 3D pointer tilt                                                     */
/* ------------------------------------------------------------------ */

/**
 * Give an element a real perspective tilt that follows the pointer, plus a
 * moving specular sheen. `strength` is the max rotation in degrees.
 */
export function tilt(el: HTMLElement, strength = 9): void {
  if (reducedMotion()) return;
  let raf = 0;
  let tx = 0;
  let ty = 0;
  let cx = 0;
  let cy = 0;

  const loop = () => {
    cx += (tx - cx) * 0.14;
    cy += (ty - cy) * 0.14;
    el.style.setProperty('--rx', `${(-cy * strength).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${(cx * strength).toFixed(2)}deg`);
    el.style.setProperty('--mx', `${(50 + cx * 45).toFixed(1)}%`);
    el.style.setProperty('--my', `${(50 + cy * 45).toFixed(1)}%`);
    if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) raf = requestAnimationFrame(loop);
    else raf = 0;
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(loop);
  };

  el.classList.add('tilt');
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    tx = (e.clientX - r.left) / r.width - 0.5;
    ty = (e.clientY - r.top) / r.height - 0.5;
    kick();
  });
  el.addEventListener('pointerleave', () => {
    tx = 0;
    ty = 0;
    kick();
  });
}

export function tiltAll(root: ParentNode = document, strength = 9): void {
  root.querySelectorAll<HTMLElement>('[data-tilt]').forEach((el) => {
    if (el.dataset.tiltBound) return;
    el.dataset.tiltBound = '1';
    tilt(el, Number(el.dataset.tilt) || strength);
  });
}

/** Buttons that lean toward the cursor. */
export function magnetic(el: HTMLElement, radius = 18): void {
  if (reducedMotion()) return;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const dx = ((e.clientX - r.left) / r.width - 0.5) * radius;
    const dy = ((e.clientY - r.top) / r.height - 0.5) * radius;
    el.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
  });
  el.addEventListener('pointerleave', () => {
    el.style.transform = '';
  });
}

export function magneticAll(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
    if (el.dataset.magBound) return;
    el.dataset.magBound = '1';
    magnetic(el);
  });
}

/* ------------------------------------------------------------------ */
/* Numbers                                                             */
/* ------------------------------------------------------------------ */

export function countUp(el: HTMLElement, to: number, opts: { dur?: number; suffix?: string; decimals?: number } = {}): void {
  const dur = opts.dur ?? 900;
  const dec = opts.decimals ?? 0;
  const suffix = opts.suffix ?? '';
  if (reducedMotion()) {
    el.textContent = to.toFixed(dec) + suffix;
    return;
  }
  const from = 0;
  const t0 = performance.now();
  const step = (t: number) => {
    const p = clamp((t - t0) / dur, 0, 1);
    const eased = 1 - (1 - p) ** 3;
    el.textContent = (from + (to - from) * eased).toFixed(dec) + suffix;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Count up once the element scrolls into view. */
export function countUpOnView(el: HTMLElement, to: number, opts?: { suffix?: string; decimals?: number }): void {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          countUp(el, to, opts);
          io.disconnect();
        }
      }
    },
    { threshold: 0.4 },
  );
  io.observe(el);
}

/* ------------------------------------------------------------------ */
/* Confetti — used on level-ups and finished sessions                  */
/* ------------------------------------------------------------------ */

export function burst(x: number, y: number, hue = 265, count = 26): void {
  if (reducedMotion()) return;
  const layer = document.getElementById('fx-layer');
  if (!layer) return;
  for (let i = 0; i < count; i += 1) {
    const p = document.createElement('i');
    p.className = 'confetti';
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = 60 + Math.random() * 160;
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist - 60}px`);
    p.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    p.style.setProperty('--h', String(hue + Math.random() * 70 - 35));
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.animationDelay = `${Math.random() * 90}ms`;
    layer.appendChild(p);
    window.setTimeout(() => p.remove(), 1500);
  }
}

export function burstFrom(el: Element, hue?: number): void {
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, hue);
}

/** Apply every enhancement to a freshly rendered subtree. */
export function enhance(root: ParentNode = document): void {
  applyStagger(root);
  observeReveals(root);
  tiltAll(root);
  magneticAll(root);
  scheduleScroll();
}

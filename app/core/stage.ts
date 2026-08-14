import { Scene } from '../../shared/three/Scene';
import type { ShapeName } from '../../shared/three/shapes';

/**
 * The 3D layer, and the one scroll loop everything reads from.
 *
 * Views are replaced wholesale by the router, so scroll subscribers are
 * registered against the element they belong to and dropped automatically
 * once that element leaves the document. No teardown bookkeeping in views.
 */

export interface ScrollState {
  y: number;
  vh: number;
  /** 0 → 1 over the whole document */
  progress: number;
}

let scene: Scene | null = null;

export function initStage(canvas: HTMLCanvasElement): Scene | null {
  try {
    scene = new Scene(canvas, 'glyph');
    scene.intro();
    scene.start();
  } catch (err) {
    // No WebGL: the app is fully usable without it, so drop the layer.
    console.warn('[수] 3D layer unavailable.', err);
    scene = null;
  }

  // A handle for poking at the layer while developing; never shipped.
  if (import.meta.env.DEV) (window as unknown as { __stage?: Scene | null }).__stage = scene;
  return scene;
}

export const stage = (): Scene | null => scene;

let requested: ShapeName | null = null;

/**
 * Idempotent, so a section can assert its shape on every scroll frame
 * rather than only when something changes. Without that, scrolling back
 * into a chapter left whatever shape the last chapter had asked for.
 */
export function morph(shape: ShapeName): void {
  if (shape === requested) return;
  requested = shape;
  scene?.morphTo(shape);
}

/**
 * Gives the 3D a box on the page to sit in — the hero's reserved band. The
 * scene drops it by itself once the element leaves the document, so views
 * register and forget.
 */
export function focusOn(el: HTMLElement | null): void {
  scene?.setFocusEl(el);
}

/** Called by the theme switch: the field is ink on paper, light on ink. */
export function setStageTheme(dark: boolean): void {
  scene?.setTheme(dark);
}

/* ─────────────────────────── scroll bus ──────────────────────────── */

interface Sub {
  el: HTMLElement;
  fn: (s: ScrollState) => void;
}

const subs: Sub[] = [];

/** Runs `fn` every frame the page scrolls, until `el` is detached. */
export function onScroll(el: HTMLElement, fn: (s: ScrollState) => void): void {
  subs.push({ el, fn });
}

const state: ScrollState = { y: 0, vh: 0, progress: 0 };

export function tickScroll(): ScrollState {
  state.y = window.scrollY;
  state.vh = window.innerHeight;
  const max = document.documentElement.scrollHeight - state.vh;
  state.progress = max > 40 ? Math.min(1, Math.max(0, state.y / max)) : 0;

  for (let i = subs.length - 1; i >= 0; i -= 1) {
    if (!subs[i].el.isConnected) subs.splice(i, 1);
    else subs[i].fn(state);
  }
  return state;
}

/** How far `el` has travelled through the viewport: 0 entering, 1 leaving. */
export function passProgress(el: HTMLElement, vh: number): number {
  const r = el.getBoundingClientRect();
  const span = r.height + vh;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (vh - r.top) / span));
}

/** Progress through a pinned section: 0 when it sticks, 1 when it releases. */
export function pinProgress(el: HTMLElement, vh: number): number {
  const r = el.getBoundingClientRect();
  const span = r.height - vh;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, -r.top / span));
}

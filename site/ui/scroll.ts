/**
 * One rAF loop, one layout read, many subscribers.
 *
 * Every scroll-driven effect on the page (progress bar, nav state, pinned
 * rail, 3D shape changes) reads from this single tick instead of attaching
 * its own listener, so we never thrash layout more than once a frame.
 */

export interface ScrollState {
  /** window.scrollY */
  y: number;
  /** viewport height */
  vh: number;
  /** 0 → 1 over the scrollable document */
  progress: number;
  /** seconds since last tick, clamped */
  dt: number;
  /** elapsed seconds since start */
  t: number;
}

type Sub = (s: ScrollState) => void;

export class Scroller {
  private subs: Sub[] = [];
  private raf = 0;
  private last = performance.now();
  private started = 0;

  readonly state: ScrollState = { y: 0, vh: 0, progress: 0, dt: 0, t: 0 };

  on(fn: Sub): void {
    this.subs.push(fn);
  }

  start(): void {
    this.started = performance.now();
    this.last = this.started;
    this.tick();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  private tick = (): void => {
    this.raf = requestAnimationFrame(this.tick);

    const now = performance.now();
    const s = this.state;
    s.dt = Math.min((now - this.last) / 1000, 0.05);
    s.t = (now - this.started) / 1000;
    this.last = now;

    s.y = window.scrollY;
    s.vh = window.innerHeight;
    const max = document.documentElement.scrollHeight - s.vh;
    s.progress = max > 0 ? Math.min(1, Math.max(0, s.y / max)) : 0;

    for (const fn of this.subs) fn(s);
  };
}

/** Progress of `el` through the viewport, 0 when entering, 1 when it exits. */
export function pinProgress(el: HTMLElement, y: number, vh: number): number {
  const top = el.offsetTop;
  const span = el.offsetHeight - vh;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (y - top) / span));
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

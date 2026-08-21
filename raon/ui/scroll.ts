/**
 * One scroll loop for the whole page.
 *
 * Every effect on this site reads the same state object, so the page takes
 * one layout measurement per frame instead of one per effect. Subscribers
 * are plain functions; nothing here knows what they do.
 */

export interface ScrollState {
  /** Scroll offset in px. */
  y: number;
  /** Viewport height in px. */
  vh: number;
  /** 0 → 1 across the whole document. */
  progress: number;
  /** Scroll velocity in px/s, smoothed. */
  v: number;
}

export type Subscriber = (s: ScrollState) => void;

export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * 0 → 1 across a sticky section's travel: 0 as its top reaches the top of
 * the viewport, 1 when its last screen is on show.
 */
export function pinProgress(section: HTMLElement, vh: number): number {
  const r = section.getBoundingClientRect();
  const travel = r.height - vh;
  if (travel <= 0) return 0;
  return clamp01(-r.top / travel);
}

export class Scroller {
  private subs: Subscriber[] = [];
  private raf = 0;
  private ticking = false;
  private last = 0;
  private lastAt = 0;
  private v = 0;

  on(fn: Subscriber): void {
    this.subs.push(fn);
  }

  start(): void {
    window.addEventListener('scroll', this.request, { passive: true });
    window.addEventListener('resize', this.request, { passive: true });
    this.emit();
  }

  stop(): void {
    window.removeEventListener('scroll', this.request);
    window.removeEventListener('resize', this.request);
    cancelAnimationFrame(this.raf);
  }

  private request = (): void => {
    if (this.ticking) return;
    this.ticking = true;
    this.raf = requestAnimationFrame(() => {
      this.emit();
      this.ticking = false;
    });
  };

  private emit(): void {
    const y = window.scrollY;
    const vh = window.innerHeight;
    const now = performance.now();

    const dt = Math.max(16, now - this.lastAt);
    const raw = ((y - this.last) / dt) * 1000;
    // Smoothed, so a single jumpy frame does not throw the whole page around.
    this.v += (raw - this.v) * 0.3;
    this.last = y;
    this.lastAt = now;

    const max = Math.max(1, document.documentElement.scrollHeight - vh);
    const state: ScrollState = { y, vh, progress: clamp01(y / max), v: this.v };

    for (const fn of this.subs) fn(state);
  }
}

import { pinProgress, type ScrollState } from './scroll';

/**
 * The curriculum chapter: while the section is pinned, vertical scrolling is
 * translated into horizontal travel across the course cards.
 */
export function initRail(): ((s: ScrollState) => void) | null {
  const section = document.querySelector<HTMLElement>('.rail');
  const track = document.getElementById('railTrack');
  const bar = document.getElementById('railBar');
  if (!section || !track || !bar) return null;

  let travel = 0;

  const measure = (): void => {
    // How far the track must slide for its last card to reach the right edge.
    // Measured from the untransformed layout: a flex container's scrollWidth
    // omits its trailing padding, which would clip the final card.
    const last = track.lastElementChild as HTMLElement | null;
    if (!last) return;

    const prev = track.style.transform;
    track.style.transform = 'none';
    const right = last.getBoundingClientRect().right;
    track.style.transform = prev;

    travel = Math.max(0, right + 24 - window.innerWidth);
  };

  measure();
  window.addEventListener('resize', measure, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(track);

  let skew = 0;

  return ({ y, vh, v, dt }: ScrollState) => {
    const p = pinProgress(section, y, vh);

    // Fast scrolling leans the cards very slightly, the way a physical shelf
    // would lag behind a shove. Capped so it never reads as a glitch.
    const want = Math.max(-3, Math.min(3, v * 0.0022));
    skew += (want - skew) * Math.min(1, dt * 7);

    track.style.transform = `translate3d(${-p * travel}px,0,0) skewX(${skew}deg)`;
    bar.style.width = `${12 + p * 88}%`;
  };
}

/**
 * Testimonial marquee. Each row is duplicated until it comfortably overflows,
 * then translated modulo one set width for a seam-free loop.
 */
export function initMarquee(): ((s: ScrollState) => void) | null {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('.marquee__row'));
  if (rows.length === 0) return null;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;

  const items = rows.map((row) => {
    const set = row.querySelector<HTMLElement>('.marquee__set');
    if (!set) return null;

    // Two copies is enough once a set is at least as wide as the viewport.
    let width = set.scrollWidth;
    while (width < window.innerWidth * 2) {
      row.appendChild(set.cloneNode(true));
      width += set.scrollWidth;
    }
    row.appendChild(set.cloneNode(true));

    const item = {
      row,
      span: () => (row.firstElementChild as HTMLElement).scrollWidth,
      speed: Number(row.dataset.speed ?? 1) * 34,
      reverse: row.classList.contains('marquee__row--rev'),
      offset: 0,
      hover: false,
      drag: 0,
      rate: 1,
    };

    // Slow to a stop under the pointer so a quote can actually be read.
    row.addEventListener('pointerenter', () => {
      item.hover = true;
    });
    row.addEventListener('pointerleave', () => {
      item.hover = false;
    });

    // And let it be dragged, like a shelf of cards.
    let dragging = false;
    let lastX = 0;

    row.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      row.classList.add('is-dragging');
      row.setPointerCapture(e.pointerId);
    });
    row.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      item.drag -= e.clientX - lastX;
      lastX = e.clientX;
    });
    const end = (e: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      row.classList.remove('is-dragging');
      row.releasePointerCapture(e.pointerId);
    };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);

    return item;
  });

  return ({ dt }: ScrollState) => {
    for (const it of items) {
      if (!it) continue;
      const span = it.span();
      if (span <= 0) continue;

      // Ease between running and held rather than snapping.
      it.rate += ((it.hover ? 0.06 : 1) - it.rate) * Math.min(1, dt * 6);

      const step = it.speed * it.rate * dt + (it.reverse ? -it.drag : it.drag);
      it.drag = 0;
      it.offset = (((it.offset + step) % span) + span) % span;

      const x = it.reverse ? it.offset - span : -it.offset;
      it.row.style.transform = `translate3d(${x}px,0,0)`;
    }
  };
}

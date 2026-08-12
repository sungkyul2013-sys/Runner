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

  return ({ y, vh }: ScrollState) => {
    const p = pinProgress(section, y, vh);
    track.style.transform = `translate3d(${-p * travel}px,0,0)`;
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

    return {
      row,
      span: () => (row.firstElementChild as HTMLElement).scrollWidth,
      speed: Number(row.dataset.speed ?? 1) * 34,
      reverse: row.classList.contains('marquee__row--rev'),
      offset: 0,
    };
  });

  return ({ dt }: ScrollState) => {
    for (const it of items) {
      if (!it) continue;
      const span = it.span();
      if (span <= 0) continue;

      it.offset = (it.offset + it.speed * dt) % span;
      const x = it.reverse ? it.offset - span : -it.offset;
      it.row.style.transform = `translate3d(${x}px,0,0)`;
    }
  };
}

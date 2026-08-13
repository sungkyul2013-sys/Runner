import { buzz } from './ui';

/**
 * Drag-to-reorder that works with a finger first.
 *
 * Pointer Events cover mouse, touch and pen in one path. The list sets
 * `touch-action: none` on its rows so a vertical drag reorders instead of
 * scrolling the page — which is why the whole row is the handle: on a
 * phone, a 20px grip is a miss waiting to happen.
 */
export function sortable(list: HTMLElement, onChange?: (order: number[]) => void): () => void {
  let dragging: HTMLElement | null = null;
  let startY = 0;
  let offset = 0;
  let pointerId = -1;

  const rows = (): HTMLElement[] => Array.from(list.children) as HTMLElement[];

  const onDown = (e: PointerEvent): void => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-sortable-item]');
    if (!row || !list.contains(row)) return;

    dragging = row;
    pointerId = e.pointerId;
    startY = e.clientY;
    offset = 0;

    row.setPointerCapture(e.pointerId);
    row.classList.add('is-dragging');
    list.classList.add('is-sorting');
    buzz(8);
  };

  const onMove = (e: PointerEvent): void => {
    if (!dragging || e.pointerId !== pointerId) return;
    e.preventDefault();

    offset = e.clientY - startY;
    dragging.style.transform = `translateY(${offset}px)`;

    // Swap with whichever neighbour the pointer has passed the middle of.
    const box = dragging.getBoundingClientRect();
    const centre = box.top + box.height / 2;

    for (const row of rows()) {
      if (row === dragging) continue;
      const r = row.getBoundingClientRect();
      const overlaps = centre > r.top && centre < r.bottom;
      if (!overlaps) continue;

      const before = centre < r.top + r.height / 2;
      list.insertBefore(dragging, before ? row : row.nextSibling);

      // Re-anchor so the element stays under the finger after the move.
      const moved = dragging.getBoundingClientRect();
      startY += moved.top - box.top;
      offset = e.clientY - startY;
      dragging.style.transform = `translateY(${offset}px)`;
      buzz(6);
      break;
    }
  };

  const onUp = (e: PointerEvent): void => {
    if (!dragging || e.pointerId !== pointerId) return;

    dragging.style.transform = '';
    dragging.classList.remove('is-dragging');
    list.classList.remove('is-sorting');
    dragging.releasePointerCapture?.(e.pointerId);
    dragging = null;
    pointerId = -1;

    onChange?.(rows().map((r) => Number(r.dataset.index ?? 0)));
  };

  list.addEventListener('pointerdown', onDown);
  list.addEventListener('pointermove', onMove);
  list.addEventListener('pointerup', onUp);
  list.addEventListener('pointercancel', onUp);

  return () => {
    list.removeEventListener('pointerdown', onDown);
    list.removeEventListener('pointermove', onMove);
    list.removeEventListener('pointerup', onUp);
    list.removeEventListener('pointercancel', onUp);
  };
}

/**
 * Horizontal swipe detection for card decks. Ignores gestures that are
 * mostly vertical so the page can still be scrolled through the card.
 */
export function swipe(
  el: HTMLElement,
  handlers: { left?: () => void; right?: () => void },
): () => void {
  let x0 = 0;
  let y0 = 0;
  let active = false;

  const down = (e: PointerEvent): void => {
    if ((e.target as HTMLElement).closest('[data-sortable-item], button, a, input')) return;
    active = true;
    x0 = e.clientX;
    y0 = e.clientY;
  };

  const up = (e: PointerEvent): void => {
    if (!active) return;
    active = false;

    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.6) return;

    (dx < 0 ? handlers.left : handlers.right)?.();
  };

  el.addEventListener('pointerdown', down, { passive: true });
  el.addEventListener('pointerup', up, { passive: true });
  el.addEventListener('pointercancel', () => (active = false), { passive: true });

  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointerup', up);
  };
}

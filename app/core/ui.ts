import { h, icon, qs } from './dom';

/* ─────────────────────────────── haptics ─────────────────────────── */

/**
 * Short taps on Android/Chrome; a no-op on iOS Safari, which does not
 * expose the Vibration API. Never called in a loop.
 */
export function buzz(pattern: number | number[] = 12): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  navigator.vibrate?.(pattern);
}

/* ──────────────────────────────── toast ──────────────────────────── */

let toastEl: HTMLElement | null = null;
let toastTimer = 0;

export function toast(message: string, kind: 'plain' | 'good' | 'bad' = 'plain'): void {
  if (!toastEl) {
    toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastEl);
  }

  toastEl.replaceChildren(
    kind === 'plain' ? '' : icon(kind === 'good' ? 'check' : 'close', 17),
    h('span', { text: message }),
  );
  toastEl.classList.add('is-up');

  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl?.classList.remove('is-up'), 2800);
}

/* ──────────────────────────── bottom sheet ───────────────────────── */

interface SheetHandle {
  close: () => void;
  el: HTMLElement;
}

let openSheet: SheetHandle | null = null;

/**
 * A bottom sheet on phones, a centred dialog from 720px up — same call.
 * On touch it can be flung away; the drag is tracked on the sheet itself
 * so a scrolled body inside still works.
 */
export function sheet(title: string, body: Node, footer?: Node): SheetHandle {
  openSheet?.close();

  const scrim = h('div', { class: 'scrim' });
  const grip = h('div', { class: 'sheet__grip' });

  const el = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    grip,
    h(
      'div',
      { class: 'row row--between', style: { marginBottom: '14px' } },
      h('h2', { class: 'h3', text: title }),
      h(
        'button',
        { class: 'iconbtn', 'aria-label': '닫기', on: { click: () => close() } },
        icon('close', 18),
      ),
    ),
    h('div', { class: 'sheet__body' }, body),
    footer ? h('div', { style: { marginTop: '18px' } }, footer) : null,
  );

  document.body.append(scrim, el);
  document.body.classList.add('is-locked');

  // Next frame, so the transition has a starting state to ease from.
  requestAnimationFrame(() => {
    scrim.classList.add('is-open');
    el.classList.add('is-open');
  });

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    scrim.classList.remove('is-open');
    el.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    window.setTimeout(() => {
      scrim.remove();
      el.remove();
    }, 460);
    if (openSheet?.el === el) openSheet = null;
    window.removeEventListener('keydown', onKey);
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  window.addEventListener('keydown', onKey);
  scrim.addEventListener('click', close);

  /* drag-to-dismiss (phones only — the dialog form has no grip) */
  let startY = 0;
  let dy = 0;
  let dragging = false;

  const onDown = (e: PointerEvent): void => {
    if (window.innerWidth >= 720) return;
    dragging = true;
    startY = e.clientY;
    dy = 0;
    el.classList.add('is-dragging');
    el.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent): void => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);
    el.style.transform = `translateY(${dy}px)`;
    scrim.style.opacity = String(Math.max(0, 1 - dy / 400));
  };
  const onUp = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('is-dragging');
    el.releasePointerCapture(e.pointerId);
    el.style.transform = '';
    scrim.style.opacity = '';
    // Past a third of its height, or a decisive flick, it goes.
    if (dy > el.offsetHeight * 0.32) {
      buzz(8);
      close();
    }
  };

  grip.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);

  openSheet = { close, el };
  return openSheet;
}

/* ─────────────────────────── small components ────────────────────── */

/**
 * The brand band: 수 국어논술 running edge to edge.
 *
 * The name is the only thing on the page allowed to repeat, so it is the
 * only thing that moves on its own. The strip is duplicated once and slid
 * by exactly half its width, which is what makes the loop seamless.
 */
export function brandBand(): HTMLElement {
  const beats = ['수 국어논술', '읽고 · 쓰고 · 고쳐 쓴다', 'SINCE 2009', '윤원수 원장', '한 문장을 끝까지'];

  const run = (): HTMLElement =>
    h(
      'span',
      { class: 'band__run' },
      ...beats.flatMap((text) => [
        h('i', { class: 'band__seal', text: '수', 'aria-hidden': 'true' }),
        h('b', { text }),
      ]),
    );

  return h(
    'div',
    { class: 'band', role: 'presentation' },
    h('div', { class: 'band__track' }, run(), run()),
  );
}

/**
 * Segmented control. The thumb is one column wide, so it can be moved by
 * whole multiples of its own width — no measuring, and it stays right
 * through a resize or a font swap.
 */
export function segmented(
  labels: string[],
  initial: number,
  onPick: (index: number) => void,
): HTMLElement {
  const thumb = h('i', {
    class: 'seg__thumb',
    'aria-hidden': 'true',
    style: { width: `calc((100% - 8px) / ${labels.length})` },
  });

  const buttons = labels.map((label, i) =>
    h(
      'button',
      {
        type: 'button',
        role: 'tab',
        text: label,
        'aria-selected': String(i === initial),
        on: {
          click: () => {
            if (thumb.dataset.at === String(i)) return;
            paint(i);
            buzz(10);
            onPick(i);
          },
        },
      },
    ),
  );

  function paint(i: number): void {
    thumb.dataset.at = String(i);
    thumb.style.transform = `translateX(${i * 100}%)`;
    buttons.forEach((b, j) => b.setAttribute('aria-selected', String(i === j)));
  }

  const root = h('div', { class: 'seg', role: 'tablist' }, thumb, ...buttons);
  paint(initial);
  return root;
}

/** A labelled bar — used for domain scores and plan load. */
export function meter(label: string, value: number, max: number, tone = 'var(--cheong)'): HTMLElement {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const fill = h('i', {
    style: { width: '0%', background: tone },
  });

  // Animate on the next frame so the bar visibly fills.
  requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = `${pct}%`)));

  return h(
    'div',
    { class: 'meter' },
    h(
      'div',
      { class: 'meter__head' },
      h('span', { text: label }),
      h('b', { class: 'num', text: `${value}/${max}` }),
    ),
    h('div', { class: 'meter__track' }, fill),
  );
}

/** Circular progress used by the quiz timer and the result score. */
export function ring(pct: number, size = 132, label?: Node): HTMLElement {
  const ns = 'http://www.w3.org/2000/svg';
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;

  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.classList.add('ring__svg');

  const mk = (cls: string): SVGCircleElement => {
    const el = document.createElementNS(ns, 'circle');
    el.setAttribute('cx', String(size / 2));
    el.setAttribute('cy', String(size / 2));
    el.setAttribute('r', String(r));
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke-width', '7');
    el.setAttribute('stroke-linecap', 'round');
    el.classList.add(cls);
    return el;
  };

  const track = mk('ring__track');
  const bar = mk('ring__bar');
  bar.style.strokeDasharray = String(c);
  bar.style.strokeDashoffset = String(c);
  svg.append(track, bar);

  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      bar.style.strokeDashoffset = String(c * (1 - Math.min(1, Math.max(0, pct))));
    }),
  );

  return h('div', { class: 'ring' }, svg, label ? h('div', { class: 'ring__label' }, label) : null);
}

/** Sets the top bar into brand mode or nested (back arrow) mode. */
export function setTopbar(title: string | null, onBack?: () => void): void {
  const slot = qs('#topbarLead');
  if (!slot) return;

  if (title === null) {
    slot.replaceChildren(
      h(
        'a',
        { class: 'brand', href: '#/', 'aria-label': '수 국어논술 홈' },
        h('span', { class: 'brand__mark', text: '수' }),
        h('span', { text: '국어논술' }),
      ),
    );
    return;
  }

  slot.replaceChildren(
    h(
      'button',
      { class: 'topbar__back', 'aria-label': '뒤로', on: { click: () => onBack?.() } },
      icon('back', 20),
    ),
    h('span', { class: 'topbar__title', text: title }),
  );
}

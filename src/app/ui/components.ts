/** Reusable UI pieces shared by the views. */

import { clamp, esc, h, pct } from '../core/dom';
import { sfx } from '../core/audio';
import { DOMAIN_HUE, DOMAIN_ICON, DOMAIN_LABEL, LEVEL_LABEL, type Domain, type Level } from '../core/types';

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

let toastWrap: HTMLElement | null = null;

export function toast(message: string, icon = '✨', ms = 2600): void {
  if (!toastWrap) {
    toastWrap = h('div.toast-wrap');
    document.body.appendChild(toastWrap);
  }
  const el = h('div.toast', h('span', icon), h('span', message));
  toastWrap.appendChild(el);
  window.setTimeout(() => {
    el.classList.add('is-out');
    window.setTimeout(() => el.remove(), 380);
  }, ms);
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export interface ModalOpts {
  title: string;
  body: Node | string;
  actions?: { label: string; primary?: boolean; onClick?: () => void | boolean }[];
  onClose?: () => void;
}

export function modal(opts: ModalOpts): () => void {
  const close = () => {
    root.remove();
    document.removeEventListener('keydown', onKey);
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };

  const box = h(
    'div.modal__box',
    h('h3.h2', { style: { marginBottom: '14px' } }, opts.title),
    typeof opts.body === 'string' ? h('div.lede', { html: opts.body }) : opts.body,
    opts.actions?.length
      ? h(
          'div.row',
          { style: { marginTop: '24px', justifyContent: 'flex-end' } },
          ...opts.actions.map((a) =>
            h(
              `button.btn${a.primary ? '.btn--primary' : '.btn--ghost'}`,
              {
                onclick: () => {
                  sfx.tap();
                  const keep = a.onClick?.();
                  if (keep !== true) close();
                },
              },
              a.label,
            ),
          ),
        )
      : null,
  );

  const root = h(
    'div.modal',
    {
      onclick: (e: MouseEvent) => {
        if (e.target === root) close();
      },
    },
    box,
  );

  document.body.appendChild(root);
  document.addEventListener('keydown', onKey);
  return close;
}

export function confirmDialog(title: string, body: string, onYes: () => void, yesLabel = '확인'): void {
  modal({
    title,
    body,
    actions: [
      { label: '취소' },
      { label: yesLabel, primary: true, onClick: onYes },
    ],
  });
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

export function sectionHead(eyebrow: string, title: string, lede?: string, center = false): HTMLElement {
  return h(
    `div${center ? '.center' : ''}`,
    { style: { marginBottom: '42px', ...(center ? { marginInline: 'auto', maxWidth: '760px' } : {}) } },
    h('div.eyebrow', { 'data-reveal': '' }, eyebrow),
    h('h2.h1', { 'data-reveal': '', 'data-reveal-delay': '60' }, title),
    lede
      ? h('p.lede', {
          'data-reveal': '',
          'data-reveal-delay': '120',
          style: { marginTop: '16px', ...(center ? { marginInline: 'auto' } : {}) },
          html: lede,
        })
      : null,
  );
}

export function domainTag(domain: Domain): HTMLElement {
  return h(
    'span.tag.tag--h',
    { style: `--h:${DOMAIN_HUE[domain]}` },
    `${DOMAIN_ICON[domain]} ${DOMAIN_LABEL[domain]}`,
  );
}

export function levelTag(level: Level): HTMLElement {
  return h('span.tag', '★'.repeat(level) + ` ${LEVEL_LABEL[level]}`);
}

export function statCard(value: string, label: string, hint?: string): HTMLElement {
  return h(
    'div.stat',
    { 'data-reveal': '' },
    h('b', value),
    h('span', label),
    hint ? h('div.tiny.muted', { style: { marginTop: '4px' } }, hint) : null,
  );
}

export function bar(value: number, hue?: number): HTMLElement {
  const el = h(`div.bar${hue !== undefined ? '.bar--h' : ''}`, hue !== undefined ? { style: `--h:${hue}` } : {});
  const fill = h('i', { style: { width: '0%' } });
  el.appendChild(fill);
  requestAnimationFrame(() => {
    fill.style.width = `${clamp(value, 0, 1) * 100}%`;
  });
  return el;
}

export function ring(value: number, label?: string): HTMLElement {
  const el = h('div.ring', { style: `--p:0` }, h('b', label ?? pct(value)));
  requestAnimationFrame(() => {
    el.style.setProperty('--p', String(Math.round(clamp(value, 0, 1) * 100)));
  });
  return el;
}

export function progressRow(label: string, value: number, hue: number, meta?: string): HTMLElement {
  return h(
    'div',
    { style: { marginBottom: '14px' } },
    h(
      'div.spread',
      { style: { marginBottom: '6px' } },
      h('span.small', { style: { fontWeight: '600' } }, label),
      h('span.small.muted', meta ?? pct(value)),
    ),
    bar(value, hue),
  );
}

export function emptyState(icon: string, title: string, body: string, action?: HTMLElement): HTMLElement {
  return h(
    'div.empty',
    h('div.empty__icon', icon),
    h('h3.h3', { style: { marginBottom: '8px' } }, title),
    h('p.small', body),
    action ? h('div', { style: { marginTop: '20px' } }, action) : null,
  );
}

export function chipRow(
  options: { value: string; label: string }[],
  active: string,
  onPick: (value: string) => void,
  grad = false,
): HTMLElement {
  const row = h('div.chips');
  for (const o of options) {
    const b = h(
      `button.chip${grad ? '.chip--grad' : ''}${o.value === active ? '.is-on' : ''}`,
      {
        onclick: () => {
          sfx.tap();
          onPick(o.value);
        },
      },
      o.label,
    );
    row.appendChild(b);
  }
  return row;
}

export function accordion(items: { q: string; a: string }[]): HTMLElement {
  const wrap = h('div');
  for (const it of items) {
    const answer = h('div.acc__a', { html: esc(it.a) });
    const node = h(
      'div.acc',
      { 'data-reveal': '' },
      h(
        'button.acc__q',
        {
          onclick: () => {
            const open = node.classList.toggle('is-open');
            if (open) sfx.tap();
          },
        },
        h('span', it.q),
        h('i', '＋'),
      ),
      answer,
    );
    wrap.appendChild(node);
  }
  return wrap;
}

/* ------------------------------------------------------------------ */
/* Radar chart                                                         */
/* ------------------------------------------------------------------ */

export interface RadarSeries {
  values: number[];
  className?: string;
}

/** Inline SVG radar. `labels` and each series share the same length. */
export function radar(labels: string[], series: RadarSeries[], size = 300): HTMLElement {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 46;
  const n = labels.length;
  const ns = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', 'radar');
  svg.setAttribute('role', 'img');

  const pointAt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(a) * r * v, cy + Math.sin(a) * r * v] as const;
  };

  // Concentric rings.
  for (const level of [0.25, 0.5, 0.75, 1]) {
    const pts = Array.from({ length: n }, (_, i) => pointAt(i, level).join(',')).join(' ');
    const poly = document.createElementNS(ns, 'polygon');
    poly.setAttribute('points', pts);
    poly.setAttribute('class', 'grid-line');
    svg.appendChild(poly);
  }

  // Spokes + labels.
  labels.forEach((label, i) => {
    const [x, y] = pointAt(i, 1);
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', String(cx));
    line.setAttribute('y1', String(cy));
    line.setAttribute('x2', String(x));
    line.setAttribute('y2', String(y));
    line.setAttribute('class', 'axis');
    svg.appendChild(line);

    const [lx, ly] = pointAt(i, 1.19);
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', String(lx));
    text.setAttribute('y', String(ly));
    text.setAttribute('text-anchor', lx > cx + 6 ? 'start' : lx < cx - 6 ? 'end' : 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.textContent = label;
    svg.appendChild(text);
  });

  // Series, drawn back to front so the primary sits on top.
  series.forEach((s, si) => {
    const pts = s.values.map((v, i) => pointAt(i, clamp(v, 0, 1)).join(',')).join(' ');
    const poly = document.createElementNS(ns, 'polygon');
    poly.setAttribute('points', pts);
    poly.setAttribute('class', `shape ${s.className ?? ''}`.trim());
    poly.style.opacity = '0';
    poly.style.transform = 'scale(0.6)';
    poly.style.transformOrigin = 'center';
    poly.style.transition = 'opacity .6s cubic-bezier(.22,1,.36,1), transform .8s cubic-bezier(.22,1,.36,1)';
    svg.appendChild(poly);
    window.setTimeout(() => {
      poly.style.opacity = '1';
      poly.style.transform = 'none';
    }, 60 + si * 120);

    if (!s.className) {
      s.values.forEach((v, i) => {
        const [x, y] = pointAt(i, clamp(v, 0, 1));
        const dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('cx', String(x));
        dot.setAttribute('cy', String(y));
        dot.setAttribute('r', '3.5');
        dot.setAttribute('class', 'dot');
        svg.appendChild(dot);
      });
    }
  });

  return h('div.radar-wrap', svg);
}

/* ------------------------------------------------------------------ */
/* Heatmap                                                             */
/* ------------------------------------------------------------------ */

/** GitHub-style contribution grid for the last `weeks` weeks. */
export function heatmap(dates: string[], weeks = 20): HTMLElement {
  const set = new Set(dates);
  const grid = h('div.heat');
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - weeks * 7 - today.getDay());

  for (let i = 0; i < weeks * 7 + today.getDay() + 1; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const on = set.has(iso);
    grid.appendChild(
      h('i', {
        'data-l': on ? '3' : '0',
        title: `${iso}${on ? ' · 학습' : ''}`,
      }),
    );
  }
  return grid;
}

/* ------------------------------------------------------------------ */
/* Timer                                                               */
/* ------------------------------------------------------------------ */

export interface Ticker {
  el: HTMLElement;
  stop: () => void;
  seconds: () => number;
}

/** Counts up (limit 0) or down (limit > 0). Calls `onEnd` when it hits 0. */
export function ticker(limitSeconds: number, onEnd?: () => void): Ticker {
  const el = h('div.timer-pill', h('span', '⏱'), h('span', '00:00'));
  const label = el.lastElementChild as HTMLElement;
  const started = Date.now();
  let stopped = false;

  const render = () => {
    if (stopped) return;
    const elapsed = Math.floor((Date.now() - started) / 1000);
    const shown = limitSeconds > 0 ? Math.max(0, limitSeconds - elapsed) : elapsed;
    label.textContent = `${String(Math.floor(shown / 60)).padStart(2, '0')}:${String(shown % 60).padStart(2, '0')}`;
    if (limitSeconds > 0 && shown <= 30) el.classList.add('is-hot');
    if (limitSeconds > 0 && shown <= 0) {
      stopped = true;
      onEnd?.();
      return;
    }
    window.setTimeout(render, 250);
  };
  render();

  return {
    el,
    stop: () => {
      stopped = true;
    },
    seconds: () => Math.floor((Date.now() - started) / 1000),
  };
}

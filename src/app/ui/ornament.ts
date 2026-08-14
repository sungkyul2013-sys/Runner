/**
 * Ornaments drawn from 단청, the polychrome painting on Korean palace eaves.
 * A 연화(lotus) rosette and a hairline rule stand in for the section breaks a
 * printed book would use; the 낙관 seal signs the cover.
 */

import { h } from '../core/dom';

const NS = 'http://www.w3.org/2000/svg';

function svg(width: number, height: number, viewBox: string): SVGSVGElement {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', viewBox);
  el.setAttribute('width', String(width));
  el.setAttribute('height', String(height));
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  return el;
}

function path(d: string, opts: { fill?: string; stroke?: string; w?: number; opacity?: number } = {}): SVGPathElement {
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d);
  p.setAttribute('fill', opts.fill ?? 'none');
  p.setAttribute('stroke', opts.stroke ?? 'currentColor');
  p.setAttribute('stroke-width', String(opts.w ?? 1));
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  if (opts.opacity !== undefined) p.setAttribute('opacity', String(opts.opacity));
  return p;
}

/** A lotus rosette: eight petals around a double core. */
export function rosette(size = 34): SVGSVGElement {
  const el = svg(size, size, '0 0 48 48');
  const cx = 24;
  const cy = 24;
  const petals = 8;
  for (let i = 0; i < petals; i += 1) {
    const a = (Math.PI * 2 * i) / petals;
    const tipX = cx + Math.cos(a) * 20;
    const tipY = cy + Math.sin(a) * 20;
    const leftX = cx + Math.cos(a - 0.36) * 11;
    const leftY = cy + Math.sin(a - 0.36) * 11;
    const rightX = cx + Math.cos(a + 0.36) * 11;
    const rightY = cy + Math.sin(a + 0.36) * 11;
    el.appendChild(
      path(
        `M ${leftX.toFixed(2)} ${leftY.toFixed(2)} Q ${tipX.toFixed(2)} ${tipY.toFixed(2)} ${rightX.toFixed(2)} ${rightY.toFixed(2)}`,
        { w: 1.1, opacity: 0.9 },
      ),
    );
  }
  const c1 = document.createElementNS(NS, 'circle');
  c1.setAttribute('cx', String(cx));
  c1.setAttribute('cy', String(cy));
  c1.setAttribute('r', '7');
  c1.setAttribute('fill', 'none');
  c1.setAttribute('stroke', 'currentColor');
  c1.setAttribute('stroke-width', '1.1');
  el.appendChild(c1);
  const c2 = document.createElementNS(NS, 'circle');
  c2.setAttribute('cx', String(cx));
  c2.setAttribute('cy', String(cy));
  c2.setAttribute('r', '2.6');
  c2.setAttribute('fill', 'currentColor');
  el.appendChild(c2);
  return el;
}

/** A hairline rule broken by a rosette — the divider between sections. */
export function ornamentRule(): HTMLElement {
  return h(
    'div.ornament',
    h('i.ornament__line'),
    h('span.ornament__mark', rosette(30)),
    h('i.ornament__line'),
  );
}

/** Corner brackets for the cover frame. */
export function cornerMark(rotate: number): SVGSVGElement {
  const el = svg(26, 26, '0 0 26 26');
  el.style.transform = `rotate(${rotate}deg)`;
  el.appendChild(path('M 1 9 L 1 1 L 9 1', { w: 1.2 }));
  el.appendChild(path('M 5 13 L 5 5 L 13 5', { w: 1, opacity: 0.55 }));
  return el;
}

/**
 * 낙관 — the carved seal an author stamps on finished work. Red ground with
 * the glyph reversed out, set very slightly off-square the way a hand-pressed
 * stamp lands.
 */
export function seal(glyph = '수', caption?: string): HTMLElement {
  return h(
    'div.seal',
    { title: caption ?? '수 국어논술' },
    h('span.seal__glyph', glyph),
  );
}

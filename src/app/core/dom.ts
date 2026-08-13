/** Minimal hyperscript helpers — no framework, no virtual DOM. */

type Child = Node | string | number | null | undefined | false | Child[];

export interface Attrs {
  class?: string;
  html?: string;
  text?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  dataset?: Record<string, string>;
  [key: string]: unknown;
}

function append(parent: Node, child: Child): void {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) {
    for (const c of child) append(parent, c);
    return;
  }
  if (child instanceof Node) parent.appendChild(child);
  else parent.appendChild(document.createTextNode(String(child)));
}

/**
 * `h('div.card', { onclick }, ...children)`.
 * The tag accepts `tag.class1.class2#id` shorthand.
 */
export function h(tag: string, attrs?: Attrs | Child, ...children: Child[]): HTMLElement {
  const idMatch = tag.match(/#([\w-]+)/);
  const classes = [...tag.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const name = tag.replace(/[.#][\w-]+/g, '') || 'div';
  const el = document.createElement(name);
  if (idMatch) el.id = idMatch[1];
  if (classes.length) el.classList.add(...classes);

  let rest = children;
  if (attrs && !Array.isArray(attrs) && !(attrs instanceof Node) && typeof attrs === 'object') {
    for (const [k, v] of Object.entries(attrs as Attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.classList.add(...String(v).split(/\s+/).filter(Boolean));
      else if (k === 'html') el.innerHTML = String(v);
      else if (k === 'text') el.textContent = String(v);
      else if (k === 'style') {
        if (typeof v === 'string') el.setAttribute('style', v);
        else Object.assign(el.style, v);
      } else if (k === 'dataset') {
        Object.assign(el.dataset, v as Record<string, string>);
      } else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2), v as EventListener);
      } else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  } else if (attrs !== undefined) {
    rest = [attrs as Child, ...children];
  }

  for (const c of rest) append(el, c);
  return el;
}

export function frag(...children: Child[]): DocumentFragment {
  const f = document.createDocumentFragment();
  for (const c of children) append(f, c);
  return f;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function qs<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(sel);
}

export function qsa<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] {
  return [...root.querySelectorAll<T>(sel)];
}

/** Escape text destined for an `html:` attribute. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

/** `1,234` */
export function fmt(n: number): string {
  return n.toLocaleString('ko-KR');
}

export function pct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Deterministic shuffle when a seed is given, Fisher–Yates otherwise. */
export function shuffle<T>(arr: T[], seed?: number): T[] {
  const out = [...arr];
  let rnd = seed === undefined ? Math.random : mulberry32(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

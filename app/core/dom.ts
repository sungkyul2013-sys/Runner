/**
 * A ~60-line DOM builder. The app has no framework: views are functions
 * that return elements, and this is the only thing they need.
 */

type Child = Node | string | number | null | undefined | false | Child[];

export interface Props {
  class?: string;
  html?: string;
  text?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  data?: Record<string, string | number | boolean | undefined>;
  /** Event handlers: `on: { click: fn }`. */
  on?: Record<string, EventListenerOrEventListenerObject>;
  [attr: string]: unknown;
}

function append(el: HTMLElement, child: Child): void {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) {
    for (const c of child) append(el, c);
    return;
  }
  el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;

    if (key === 'class') el.className = String(value);
    else if (key === 'html') el.innerHTML = String(value);
    else if (key === 'text') el.textContent = String(value);
    else if (key === 'style') {
      if (typeof value === 'string') el.setAttribute('style', value);
      else Object.assign(el.style, value);
    } else if (key === 'data') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v !== undefined) el.dataset[k] = String(v);
      }
    } else if (key === 'on') {
      for (const [type, fn] of Object.entries(value as Record<string, EventListener>)) {
        el.addEventListener(type, fn);
      }
    } else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }

  for (const child of children) append(el, child);
  return el;
}

export const qs = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector<T>(sel);

export const qsa = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(sel));

/** Inline icon set — one path each, sized by the caller's font size. */
const ICONS: Record<string, string> = {
  home: 'M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',
  quiz: 'M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.8.3-1.2.9-1.2 1.7v.4M12 17.2h.01M4 5h16v14H4z',
  lab: 'M5 19h14M7 15.5 15.5 7l2 2L9 17.5H7zM4 5h9',
  plan: 'M4 6h16M4 12h10M4 18h13M18.5 16.5l1.6 1.6 3-3.4',
  chat: 'M4 5h16v11H9l-5 4z',
  back: 'm14.5 5-7 7 7 7',
  close: 'M6 6l12 12M18 6 6 18',
  sun: 'M12 4.6V2.5M12 21.5v-2.1M19.4 12h2.1M2.5 12h2.1M17.2 6.8l1.5-1.5M5.3 18.7l1.5-1.5M17.2 17.2l1.5 1.5M5.3 5.3l1.5 1.5M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8.2 8.2 0 1 0 20 14.5z',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  arrow: 'M5 12h13m-5-5 5 5-5 5',
  reset: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5V9H9',
  clock: 'M12 7v5.2l3.2 2M12 3.8a8.2 8.2 0 1 1 0 16.4 8.2 8.2 0 0 1 0-16.4z',
  cal: 'M4.5 6.5h15v13h-15zM8 3.8v4M16 3.8v4M4.5 10.6h15',
  flag: 'M6 21V4.5h12l-2.4 4 2.4 4H6',
  book: 'M12 6.5C10.5 5 8.5 4.5 4 4.5v13c4.5 0 6.5.5 8 2 1.5-1.5 3.5-2 8-2v-13c-4.5 0-6.5.5-8 2Zm0 0v13',
  spark: 'M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.2l-1.8-5.6L4.5 10.8 10.2 9z',
};

export function icon(name: keyof typeof ICONS | string, size = 24): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name] ?? ICONS.spark);
  svg.appendChild(path);
  return svg;
}

/** Replaces everything inside `host` with `next`. */
export function mount(host: HTMLElement, next: Node): void {
  host.replaceChildren(next);
}

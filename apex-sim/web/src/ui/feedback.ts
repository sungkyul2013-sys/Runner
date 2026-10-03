// Feedback (§18.5 즉각적인 피드백, 툴팁): a toast at the bottom centre for every change the player makes or the game
// reports, and a tooltip for anything that carries a `data-tip` (or an icon button's aria-label) — on hover with a
// mouse, on a long press with a finger. Both are single shared layers; callers only describe what happened.
import { icon, type IconName } from './icons';

export type ToastKind = '' | 'ok' | 'warn' | 'error';

let stack: HTMLElement | null = null;
const live = new Map<string, { node: HTMLElement; timer: number }>();

/**
 * Shows a short message at the bottom centre. A toast with the same `key` replaces the previous one (a slider being
 * dragged updates one toast instead of stacking many). Errors stay longer.
 */
export function notify(text: string, kind: ToastKind = '', opts: { icon?: IconName; key?: string; ms?: number } = {}): void {
  if (typeof document === 'undefined') return;
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    document.body.append(stack);
  }
  const ms = opts.ms ?? (kind === 'error' ? 9000 : kind === 'warn' ? 4200 : 2400);
  const key = opts.key ?? text;
  const old = live.get(key);
  let node: HTMLElement;
  if (old) {
    clearTimeout(old.timer);
    node = old.node;
    node.className = `toast2 ${kind}`;
    node.replaceChildren();
  } else {
    node = document.createElement('div');
    node.className = `toast2 ${kind}`;
    stack.append(node);
    while (stack.children.length > 4) stack.firstElementChild?.remove();
  }
  const ic = opts.icon ?? (kind === 'error' ? 'alert' : kind === 'warn' ? 'alert' : kind === 'ok' ? 'check' : null);
  if (ic) node.append(icon(ic));
  const span = document.createElement('span');
  span.textContent = text;
  node.append(span);
  const timer = window.setTimeout(() => {
    node.classList.add('out');
    window.setTimeout(() => node.remove(), 260);
    live.delete(key);
  }, ms);
  live.set(key, { node, timer });
}

// ---- tooltips ----

let tip: HTMLElement | null = null;
let showTimer = 0;
let owner: HTMLElement | null = null;

function tipText(e: HTMLElement): string {
  return e.dataset.tip ?? (e.classList.contains('icon-btn') || e.classList.contains('dock-btn') ? e.getAttribute('aria-label') ?? '' : '');
}

function place(target: HTMLElement): void {
  if (!tip) return;
  const r = target.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const below = r.top < 90 || target.dataset.tipAt === 'below';
  let x = r.left + r.width / 2 - t.width / 2;
  x = Math.max(8, Math.min(innerWidth - t.width - 8, x));
  const y = below ? r.bottom + 8 : r.top - t.height - 8;
  tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(Math.max(8, y))}px)`;
}

function show(target: HTMLElement): void {
  const text = tipText(target);
  if (!text) return;
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tip';
    tip.setAttribute('role', 'tooltip');
    document.body.append(tip);
  }
  tip.replaceChildren();
  const [head, ...rest] = text.split('\n');
  const b = document.createElement('b');
  b.textContent = head;
  tip.append(b);
  if (rest.length) {
    const s = document.createElement('span');
    s.textContent = rest.join(' ');
    tip.append(s);
  }
  if (target.dataset.key) {
    const k = document.createElement('kbd');
    k.textContent = target.dataset.key;
    b.append(k);
  }
  owner = target;
  tip.classList.add('on');
  place(target);
}

function hide(): void {
  clearTimeout(showTimer);
  owner = null;
  tip?.classList.remove('on');
}

let installed = false;
/** Installs the shared tooltip layer (idempotent). */
export function installTooltips(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const find = (e: Event) => (e.target instanceof Element ? e.target.closest<HTMLElement>('[data-tip], .icon-btn[aria-label], .dock-btn[aria-label]') : null);
  document.addEventListener('pointerover', (e) => {
    if ((e as PointerEvent).pointerType === 'touch') return;
    const t = find(e);
    if (t === owner) return;
    hide();
    if (t) showTimer = window.setTimeout(() => show(t), 380);
  });
  document.addEventListener('pointerout', (e) => {
    const t = find(e);
    if (t && (!(e as PointerEvent).relatedTarget || !t.contains((e as PointerEvent).relatedTarget as Node))) hide();
  });
  // Touch: a long press shows the tip (the tap itself still works), lifting the finger hides it.
  document.addEventListener('pointerdown', (e) => {
    hide();
    if (e.pointerType !== 'touch') return;
    const t = find(e);
    if (t) showTimer = window.setTimeout(() => show(t), 520);
  });
  document.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') window.setTimeout(hide, 900);
    else clearTimeout(showTimer);
  });
  document.addEventListener('keydown', hide);
  document.addEventListener('scroll', hide, true);
}

/** Sets a tooltip (first line bold, the rest a description) and an optional keyboard shortcut. */
export function tipOf<T extends HTMLElement>(e: T, text: string, key?: string): T {
  e.dataset.tip = text;
  if (key) e.dataset.key = key;
  return e;
}

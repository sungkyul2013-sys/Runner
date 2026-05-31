/**
 * Tiny DOM UI kit shared by every screen (menu, shop, character select, pause,
 * game-over, settings). Keeps the neon styling consistent and injects the
 * keyframe animations once. Everything overlays the WebGL canvas.
 */

export const NEON = {
  cyan: '#2de2e6',
  pink: '#ff3cac',
  gold: '#ffd23f',
  ink: '#05060c',
  text: '#e8f7ff',
};

let injected = false;
function ensureStyles(): void {
  if (injected) return;
  injected = true;
  const s = document.createElement('style');
  s.textContent = `
    @keyframes nd-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
    @keyframes nd-pulse { 0%,100%{filter:drop-shadow(0 0 14px ${NEON.cyan})} 50%{filter:drop-shadow(0 0 28px ${NEON.pink})} }
    @keyframes nd-fade { from{opacity:0} to{opacity:1} }
    .nd-btn{cursor:pointer;border:none;border-radius:12px;font:700 18px/1 system-ui,sans-serif;
      padding:14px 26px;color:${NEON.ink};background:${NEON.cyan};transition:transform .08s,box-shadow .2s;
      box-shadow:0 0 16px ${NEON.cyan}aa;pointer-events:auto}
    .nd-btn:hover{transform:translateY(-2px);box-shadow:0 0 26px ${NEON.cyan}}
    .nd-btn.pink{background:${NEON.pink};box-shadow:0 0 16px ${NEON.pink}aa}
    .nd-btn.pink:hover{box-shadow:0 0 26px ${NEON.pink}}
    .nd-btn.ghost{background:transparent;color:${NEON.text};border:2px solid ${NEON.cyan}66;
      box-shadow:none;font-size:15px;padding:10px 18px}
    .nd-btn.ghost:hover{border-color:${NEON.cyan};box-shadow:0 0 14px ${NEON.cyan}66}
    .nd-btn:disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none}
    .nd-card{background:rgba(12,16,32,.86);border:1px solid ${NEON.cyan}33;border-radius:16px;
      padding:16px;display:flex;flex-direction:column;gap:8px;min-width:150px}
    .nd-card.sel{border-color:${NEON.pink};box-shadow:0 0 18px ${NEON.pink}66}
  `;
  document.head.appendChild(s);
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: Partial<CSSStyleDeclaration> = {},
  html?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e.style, style);
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function button(
  label: string,
  onClick: () => void,
  variant: 'cyan' | 'pink' | 'ghost' = 'cyan',
): HTMLButtonElement {
  const b = el('button');
  b.className = `nd-btn${variant === 'cyan' ? '' : ' ' + variant}`;
  b.innerHTML = label;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/** A full-screen overlay container (hidden by default). */
export function screen(opaque = true): HTMLDivElement {
  ensureStyles();
  const s = el('div', {
    position: 'fixed',
    inset: '0',
    display: 'none',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '20px',
    zIndex: '100',
    color: NEON.text,
    fontFamily: 'system-ui, sans-serif',
    background: opaque
      ? 'radial-gradient(ellipse at 50% 30%, rgba(20,26,54,.9), rgba(5,6,12,.96))'
      : 'transparent',
    animation: 'nd-fade .25s ease',
    pointerEvents: 'auto',
  });
  document.body.appendChild(s);
  return s;
}

export function show(s: HTMLElement, on: boolean): void {
  s.style.display = on ? 'flex' : 'none';
}

/** Format a coin count with the coin glyph. */
export function coinStr(n: number): string {
  return `<span style="color:${NEON.gold}">◉</span> ${n}`;
}

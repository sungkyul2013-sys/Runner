/**
 * Tiny DOM UI kit shared by every screen (menu, shop, character select, pause,
 * game-over, settings). Holds the Sunset Runner theme palette and injects the
 * shared keyframe animations once. Everything overlays the WebGL canvas.
 * (The export is named `NEON` for historical reasons but carries sunset tones.)
 */

export const NEON = {
  cyan: '#ff7eb3', // accent2 — pink/magenta
  pink: '#ffb27a', // accent — warm orange
  gold: '#ffd86b', // bright gold
  ink: '#120a22', // dark navy ink
  text: '#fff2e0', // warm off-white text
};

let injected = false;
function ensureStyles(): void {
  if (injected) return;
  injected = true;
  const s = document.createElement('style');
  s.textContent = `
    @keyframes nd-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
    @keyframes nd-breathe { 0%,100%{box-shadow:0 0 18px ${NEON.gold}88} 50%{box-shadow:0 0 34px ${NEON.cyan}cc} }
    @keyframes nd-fade { from{opacity:0} to{opacity:1} }
    @keyframes nd-pop { 0%{transform:scale(.6);opacity:0} 100%{transform:scale(1);opacity:1} }
    .nd-btn{cursor:pointer;border:none;border-radius:14px;font:800 18px/1 'Trebuchet MS',system-ui,sans-serif;
      padding:14px 28px;color:${NEON.ink};background:linear-gradient(120deg,${NEON.gold},${NEON.cyan});
      transition:transform .08s,filter .2s,box-shadow .2s;box-shadow:0 6px 18px rgba(0,0,0,.35);pointer-events:auto}
    .nd-btn:hover{transform:translateY(-2px);filter:brightness(1.06)}
    .nd-btn:active{transform:scale(.96)}
    .nd-tab:active{transform:scale(.95)}
    .nd-btn.pink{background:linear-gradient(120deg,${NEON.pink},${NEON.cyan})}
    .nd-btn.ghost{background:rgba(40,24,70,0.40);color:${NEON.text};border:1px solid rgba(255,210,180,0.30);
      font-size:15px;padding:11px 18px;box-shadow:none}
    .nd-btn.ghost:hover{background:rgba(60,36,90,0.55)}
    .nd-btn:disabled{filter:grayscale(.7) brightness(.7);cursor:not-allowed;transform:none}
    .nd-card{background:rgba(22,14,44,0.55);border:1px solid rgba(255,210,180,0.30);border-radius:16px;
      padding:14px;display:flex;flex-direction:column;gap:8px;min-width:150px;backdrop-filter:blur(7px)}
    .nd-card.sel{border-color:${NEON.gold};box-shadow:0 0 18px ${NEON.gold}66}
    .nd-tab{cursor:pointer;border:none;border-radius:12px;font:700 14px/1 system-ui;padding:9px 12px;
      background:rgba(40,24,70,0.40);color:${NEON.text};border:1px solid rgba(255,210,180,0.18);pointer-events:auto}
    .nd-tab.on{background:linear-gradient(120deg,${NEON.gold},${NEON.pink});color:${NEON.ink}}
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
      ? 'radial-gradient(ellipse at 50% 25%, rgba(60,30,80,.72), rgba(18,10,34,.94))'
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
  return `🪙 ${n}`;
}

/** Format a gem/mileage count. */
export function gemStr(n: number): string {
  return `💎 ${n}`;
}

/** Cinematic vignette overlay (call once at boot). */
export function vignette(): void {
  const v = el('div', {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '40',
    background: 'radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(10,4,20,0.45) 100%)',
  });
  document.body.appendChild(v);
}

/** A small tab button. */
export function tab(label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button');
  b.className = 'nd-tab';
  b.innerHTML = label;
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return b;
}

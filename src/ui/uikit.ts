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
    @keyframes nd-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-9px)} }
    @keyframes nd-breathe { 0%,100%{box-shadow:0 8px 26px rgba(255,126,179,.5),0 0 0 0 ${NEON.gold}66}
      50%{box-shadow:0 10px 34px rgba(255,126,179,.7),0 0 0 8px ${NEON.gold}00} }
    @keyframes nd-fade { from{opacity:0} to{opacity:1} }
    @keyframes nd-slideup { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
    @keyframes nd-pop { 0%{transform:scale(.6);opacity:0} 70%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
    @keyframes nd-shine { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
    @keyframes nd-spin { to{transform:rotate(360deg)} }
    .nd-btn{position:relative;overflow:hidden;cursor:pointer;border:none;border-radius:16px;
      font:800 18px/1 'Trebuchet MS',system-ui,sans-serif;padding:15px 30px;color:${NEON.ink};
      background:linear-gradient(120deg,${NEON.gold},${NEON.cyan});
      transition:transform .1s cubic-bezier(.34,1.56,.64,1),filter .2s,box-shadow .2s;
      box-shadow:0 6px 18px rgba(0,0,0,.35);pointer-events:auto}
    .nd-btn::after{content:'';position:absolute;inset:0;background:linear-gradient(110deg,
      transparent 30%,rgba(255,255,255,.45) 50%,transparent 70%);background-size:200% 100%;
      animation:nd-shine 3.5s linear infinite;pointer-events:none}
    .nd-btn:hover{transform:translateY(-3px) scale(1.02);filter:brightness(1.08)}
    .nd-btn:active{transform:scale(.95)}
    .nd-tab:active{transform:scale(.93)}
    .nd-btn.pink{background:linear-gradient(120deg,${NEON.pink},#8a7bff)}
    .nd-btn.ghost{background:rgba(40,24,70,0.45);color:${NEON.text};border:1px solid rgba(255,210,180,0.30);
      font-size:15px;padding:12px 20px;box-shadow:none}
    .nd-btn.ghost::after{display:none}
    .nd-btn.ghost:hover{background:rgba(70,40,100,0.6)}
    .nd-btn:disabled{filter:grayscale(.7) brightness(.6);cursor:not-allowed;transform:none}
    .nd-btn:disabled::after{display:none}
    .nd-card{position:relative;background:linear-gradient(160deg,rgba(46,26,72,0.66),rgba(20,12,38,0.62));
      border:1px solid rgba(255,210,180,0.28);border-radius:18px;padding:15px;display:flex;
      flex-direction:column;gap:8px;min-width:150px;backdrop-filter:blur(9px);
      box-shadow:0 8px 22px rgba(0,0,0,.32);transition:transform .12s,box-shadow .2s,border-color .2s}
    .nd-card:hover{transform:translateY(-3px);box-shadow:0 14px 30px rgba(0,0,0,.45)}
    .nd-card.sel{border-color:${NEON.gold};box-shadow:0 0 0 2px ${NEON.gold}55,0 10px 26px rgba(0,0,0,.4)}
    .nd-card.locked{filter:saturate(.5) brightness(.82)}
    .nd-tab{position:relative;cursor:pointer;border:none;border-radius:14px;font:800 14px/1 'Trebuchet MS',system-ui;
      padding:10px 15px;background:rgba(40,24,70,0.45);color:${NEON.text};
      border:1px solid rgba(255,210,180,0.16);pointer-events:auto;transition:transform .1s,background .2s}
    .nd-tab:hover{background:rgba(66,38,96,0.6)}
    .nd-tab.on{background:linear-gradient(120deg,${NEON.gold},${NEON.pink});color:${NEON.ink};
      box-shadow:0 4px 14px rgba(255,126,179,.4)}
    .nd-chip{display:inline-flex;align-items:center;gap:6px;background:rgba(22,14,44,0.6);
      border:1px solid rgba(255,210,180,0.28);border-radius:999px;padding:7px 14px;
      font:800 16px/1 'Trebuchet MS',system-ui;backdrop-filter:blur(8px)}
    .nd-scroll::-webkit-scrollbar{width:8px}
    .nd-scroll::-webkit-scrollbar-thumb{background:rgba(255,210,180,.3);border-radius:4px}
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

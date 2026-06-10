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
    @keyframes nd-breathe { 0%,100%{box-shadow:0 8px 22px rgba(255,126,179,.32),0 0 0 0 ${NEON.gold}40}
      50%{box-shadow:0 10px 30px rgba(255,126,179,.45),0 0 0 8px ${NEON.gold}00} }
    @keyframes nd-fade { from{opacity:0} to{opacity:1} }
    @keyframes nd-slideup { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
    @keyframes nd-pop { 0%{transform:scale(.5);opacity:0} 65%{transform:scale(1.12)} 100%{transform:scale(1);opacity:1} }
    @keyframes nd-popin { 0%{opacity:0;transform:translateY(24px) scale(.9) rotateX(18deg)}
      100%{opacity:1;transform:translateY(0) scale(1) rotateX(0)} }
    @keyframes nd-shine { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
    @keyframes nd-spin { to{transform:rotate(360deg)} }
    @keyframes nd-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
    @keyframes nd-aurora { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }

    .nd-btn{position:relative;overflow:hidden;cursor:pointer;border:none;border-radius:18px;
      font:800 17px/1 'Trebuchet MS',system-ui,sans-serif;padding:14px 28px;color:${NEON.ink};
      background:linear-gradient(135deg,${NEON.gold},${NEON.cyan});
      transition:transform .14s cubic-bezier(.34,1.7,.5,1),filter .2s,box-shadow .25s;
      box-shadow:0 8px 0 rgba(120,60,30,.28),0 12px 26px rgba(0,0,0,.42);pointer-events:auto}
    .nd-btn::before{content:'';position:absolute;inset:0 0 50% 0;border-radius:18px 18px 40% 40%;
      background:linear-gradient(180deg,rgba(255,255,255,.26),transparent);pointer-events:none}
    .nd-btn::after{content:'';position:absolute;inset:0;background:linear-gradient(110deg,
      transparent 35%,rgba(255,255,255,.28) 50%,transparent 65%);background-size:220% 100%;
      animation:nd-shine 3.8s linear infinite;pointer-events:none}
    .nd-btn:hover{transform:translateY(-3px) scale(1.03);filter:brightness(1.08)}
    .nd-btn:active{transform:translateY(4px) scale(.97);box-shadow:0 3px 0 rgba(120,60,30,.28),0 6px 14px rgba(0,0,0,.4)}
    .nd-btn.pink{background:linear-gradient(135deg,${NEON.pink},#8a7bff)}
    .nd-btn.ghost{background:rgba(46,26,74,0.5);color:${NEON.text};border:1px solid rgba(255,210,180,0.26);
      font-size:14px;padding:11px 18px;box-shadow:0 4px 0 rgba(0,0,0,.3),0 8px 16px rgba(0,0,0,.3)}
    .nd-btn.ghost::after{display:none}
    .nd-btn.ghost::before{inset:0 0 55% 0}
    .nd-btn.ghost:hover{background:rgba(72,42,104,0.62)}
    .nd-btn:disabled{filter:grayscale(.7) brightness(.55);cursor:not-allowed;transform:none;
      box-shadow:0 4px 0 rgba(0,0,0,.25)}
    .nd-btn:disabled::after{display:none}

    .nd-card{position:relative;background:linear-gradient(155deg,rgba(58,32,90,0.62),rgba(22,12,40,0.58));
      border:1px solid rgba(255,210,180,0.26);border-radius:22px;padding:16px;display:flex;
      flex-direction:column;gap:8px;min-width:150px;backdrop-filter:blur(14px);
      box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 12px 28px rgba(0,0,0,.4);
      transition:transform .16s cubic-bezier(.34,1.5,.5,1),box-shadow .25s,border-color .2s;
      transform-style:preserve-3d}
    .nd-card::before{content:'';position:absolute;top:0;left:0;right:0;height:42%;border-radius:22px 22px 60% 60%/22px 22px 30% 30%;
      background:linear-gradient(180deg,rgba(255,255,255,.10),transparent);pointer-events:none}
    .nd-card:hover{transform:translateY(-5px) scale(1.02);box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 20px 40px rgba(0,0,0,.5)}
    .nd-card.sel{border-color:${NEON.gold};
      box-shadow:0 0 0 2px ${NEON.gold}66,inset 0 1px 0 rgba(255,255,255,.2),0 16px 34px rgba(255,180,90,.25)}
    .nd-card.locked{filter:saturate(.45) brightness(.78)}

    .nd-tab{position:relative;cursor:pointer;border:none;border-radius:16px;font:800 14px/1 'Trebuchet MS',system-ui;
      padding:10px 16px;background:rgba(46,26,74,0.5);color:${NEON.text};
      border:1px solid rgba(255,210,180,0.16);pointer-events:auto;
      transition:transform .14s cubic-bezier(.34,1.6,.5,1),background .2s;
      box-shadow:0 4px 0 rgba(0,0,0,.28)}
    .nd-tab:hover{background:rgba(72,42,104,0.62);transform:translateY(-2px)}
    .nd-tab:active{transform:translateY(3px);box-shadow:0 1px 0 rgba(0,0,0,.28)}
    .nd-tab.on{background:linear-gradient(135deg,${NEON.gold},${NEON.pink});color:${NEON.ink};
      box-shadow:0 5px 0 rgba(150,80,40,.3),0 8px 18px rgba(255,126,179,.4)}

    .nd-chip{display:inline-flex;align-items:center;gap:6px;
      background:linear-gradient(160deg,rgba(40,22,66,0.74),rgba(20,12,38,0.66));
      border:1px solid rgba(255,210,180,0.26);border-radius:999px;padding:7px 15px;
      font:800 15px/1 'Trebuchet MS',system-ui;backdrop-filter:blur(10px);
      box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 6px 14px rgba(0,0,0,.32)}

    /* Pop-out 3D bottom navigation buttons. */
    .nd-nav{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;
      background:none;border:none;cursor:pointer;pointer-events:auto;padding:6px 16px;
      transition:transform .18s cubic-bezier(.34,1.8,.5,1)}
    .nd-nav .nd-navicon{font-size:24px;line-height:1;transition:transform .2s cubic-bezier(.34,1.8,.5,1),filter .2s;
      filter:grayscale(.55) opacity(.66) drop-shadow(0 2px 3px rgba(0,0,0,.4))}
    .nd-nav .nd-navlbl{font:800 10px/1 system-ui;letter-spacing:1px;color:rgba(255,242,224,.55);transition:color .2s}
    .nd-nav:hover .nd-navicon{transform:translateY(-3px) scale(1.08)}
    .nd-nav.on .nd-navicon{filter:none drop-shadow(0 4px 8px rgba(255,180,90,.6));transform:translateY(-8px) scale(1.28)}
    .nd-nav.on .nd-navlbl{color:${NEON.gold}}
    .nd-nav.on::before{content:'';position:absolute;bottom:-2px;width:28px;height:4px;border-radius:3px;
      background:linear-gradient(90deg,${NEON.gold},${NEON.pink});box-shadow:0 0 8px ${NEON.gold}88}
    /* Centre "home" nav button sits raised in a circular badge (Clash-style). */
    .nd-nav.home{margin-top:-14px}
    .nd-nav.home .nd-navicon{font-size:26px;width:54px;height:54px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      background:linear-gradient(160deg,${NEON.gold},${NEON.pink});color:${NEON.ink};
      border:3px solid rgba(255,240,220,.8);
      box-shadow:0 6px 0 rgba(150,80,40,.4),0 10px 20px rgba(0,0,0,.45);filter:none}
    .nd-nav.home:hover .nd-navicon{transform:translateY(-2px) scale(1.05)}
    .nd-nav.home.on .nd-navicon{transform:translateY(-2px) scale(1.05)}
    .nd-nav.home.on::before{display:none}

    .nd-cog{cursor:pointer;border:none;width:42px;height:42px;border-radius:14px;font-size:18px;
      background:linear-gradient(160deg,rgba(40,22,66,0.74),rgba(20,12,38,0.66));
      border:1px solid rgba(255,210,180,0.26);backdrop-filter:blur(10px);pointer-events:auto;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 5px 14px rgba(0,0,0,.34);
      transition:transform .14s cubic-bezier(.34,1.6,.5,1)}
    .nd-cog:hover{transform:rotate(40deg)}
    .nd-cog:active{transform:scale(.92)}

    .nd-scroll::-webkit-scrollbar{width:8px}
    .nd-scroll::-webkit-scrollbar-thumb{background:rgba(255,210,180,.32);border-radius:4px}
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
      ? 'radial-gradient(ellipse at 50% 25%, rgba(60,30,80,.5), rgba(18,10,34,.82))'
      : 'transparent',
    backdropFilter: opaque ? 'blur(14px) saturate(1.1)' : 'none',
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

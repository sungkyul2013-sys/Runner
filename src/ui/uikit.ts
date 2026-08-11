/**
 * The shared DOM UI kit for METRO SURF: the theme palette, one injected
 * stylesheet with every animation and component class, and small factory
 * helpers. Everything renders as an overlay on top of the WebGL canvas, so the
 * live 3D scene stays visible behind the menus.
 */

export const UI = {
  /** Primary accent — coins, headline numbers, the play button. */
  gold: '#ffd23f',
  /** Secondary accent — rails, information, the metro blue. */
  blue: '#3fa9f5',
  /** Tertiary accent — mystery, premium, keys. */
  magenta: '#ff4fd8',
  /** Positive / complete. */
  green: '#6bff9a',
  /** Danger / caught. */
  red: '#ff5f52',
  /** Page ink. */
  ink: '#0a0d16',
  /** Body text. */
  text: '#eef3fb',
  /** Muted text. */
  dim: 'rgba(238,243,251,0.62)',
};

let injected = false;
function ensureStyles(): void {
  if (injected) return;
  injected = true;
  const s = document.createElement('style');
  s.textContent = `
    @keyframes ms-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
    @keyframes ms-breathe { 0%,100%{box-shadow:0 10px 0 rgba(120,70,10,.42),0 14px 30px rgba(0,0,0,.5),0 0 0 0 ${UI.gold}55}
      55%{box-shadow:0 10px 0 rgba(120,70,10,.42),0 16px 40px rgba(0,0,0,.55),0 0 0 14px ${UI.gold}00} }
    @keyframes ms-fade { from{opacity:0} to{opacity:1} }
    @keyframes ms-slideup { from{opacity:0;transform:translateY(26px)} to{opacity:1;transform:translateY(0)} }
    @keyframes ms-popin { 0%{opacity:0;transform:translateY(22px) scale(.92) rotateX(16deg)}
      100%{opacity:1;transform:translateY(0) scale(1) rotateX(0)} }
    @keyframes ms-shine { 0%{background-position:-220% 0} 100%{background-position:220% 0} }
    @keyframes ms-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
    @keyframes ms-spin { to{transform:rotate(360deg)} }
    @keyframes ms-glow { 0%,100%{filter:drop-shadow(0 0 6px currentColor)} 50%{filter:drop-shadow(0 0 16px currentColor)} }
    @keyframes ms-scroll { to{background-position:0 -64px} }

    /* ── Buttons ────────────────────────────────────────────────────────── */
    .ms-btn{position:relative;overflow:hidden;cursor:pointer;border:none;border-radius:18px;
      font:900 17px/1 'Trebuchet MS',system-ui,sans-serif;padding:15px 30px;color:#1b1405;
      background:linear-gradient(150deg,#ffe27a,${UI.gold} 45%,#f0a01a);
      transition:transform .13s cubic-bezier(.34,1.7,.5,1),filter .2s,box-shadow .25s;
      box-shadow:0 7px 0 rgba(140,84,10,.5),0 12px 26px rgba(0,0,0,.45);pointer-events:auto;
      letter-spacing:.3px;text-shadow:0 1px 0 rgba(255,255,255,.4)}
    .ms-btn::before{content:'';position:absolute;inset:0 0 52% 0;border-radius:18px 18px 40% 40%;
      background:linear-gradient(180deg,rgba(255,255,255,.4),transparent);pointer-events:none}
    .ms-btn::after{content:'';position:absolute;inset:0;background:linear-gradient(110deg,
      transparent 36%,rgba(255,255,255,.42) 50%,transparent 64%);background-size:220% 100%;
      animation:ms-shine 4.2s linear infinite;pointer-events:none}
    .ms-btn:hover{transform:translateY(-3px) scale(1.025);filter:brightness(1.06)}
    .ms-btn:active{transform:translateY(4px) scale(.98);box-shadow:0 3px 0 rgba(140,84,10,.5),0 6px 14px rgba(0,0,0,.42)}
    .ms-btn.blue{background:linear-gradient(150deg,#8fd4ff,${UI.blue} 45%,#1a72c0);color:#04203a;
      box-shadow:0 7px 0 rgba(10,70,120,.55),0 12px 26px rgba(0,0,0,.45)}
    .ms-btn.magenta{background:linear-gradient(150deg,#ff9ce8,${UI.magenta} 45%,#c01f9c);color:#2a0524;
      box-shadow:0 7px 0 rgba(120,10,95,.55),0 12px 26px rgba(0,0,0,.45)}
    .ms-btn.green{background:linear-gradient(150deg,#b6ffcd,${UI.green} 45%,#22b85e);color:#062a15;
      box-shadow:0 7px 0 rgba(10,100,50,.55),0 12px 26px rgba(0,0,0,.45)}
    .ms-btn.ghost{background:linear-gradient(160deg,rgba(38,46,70,.72),rgba(18,22,38,.66));color:${UI.text};
      border:1px solid rgba(255,255,255,.18);font-size:14px;padding:12px 20px;
      box-shadow:0 4px 0 rgba(0,0,0,.34),0 8px 16px rgba(0,0,0,.34);text-shadow:none}
    .ms-btn.ghost::after{display:none}
    .ms-btn.ghost::before{inset:0 0 56% 0;background:linear-gradient(180deg,rgba(255,255,255,.12),transparent)}
    .ms-btn.ghost:hover{background:linear-gradient(160deg,rgba(56,66,96,.8),rgba(26,32,52,.72))}
    .ms-btn:disabled{filter:grayscale(.75) brightness(.55);cursor:not-allowed;transform:none;
      box-shadow:0 4px 0 rgba(0,0,0,.3)}
    .ms-btn:disabled::after{display:none}

    /* ── Cards ──────────────────────────────────────────────────────────── */
    .ms-card{position:relative;background:linear-gradient(158deg,rgba(34,42,68,0.93),rgba(11,14,26,0.9));
      border:1px solid rgba(255,255,255,0.14);border-radius:22px;padding:15px;display:flex;
      flex-direction:column;gap:8px;backdrop-filter:blur(16px);
      box-shadow:inset 0 1px 0 rgba(255,255,255,.16),0 12px 28px rgba(0,0,0,.45);
      transition:transform .16s cubic-bezier(.34,1.5,.5,1),box-shadow .25s,border-color .2s;
      transform-style:preserve-3d}
    .ms-card::before{content:'';position:absolute;top:0;left:0;right:0;height:44%;
      border-radius:22px 22px 60% 60%/22px 22px 30% 30%;
      background:linear-gradient(180deg,rgba(255,255,255,.09),transparent);pointer-events:none}
    .ms-card:hover{transform:translateY(-5px) scale(1.015);box-shadow:inset 0 1px 0 rgba(255,255,255,.2),0 20px 40px rgba(0,0,0,.55)}
    .ms-card.sel{border-color:${UI.gold};
      box-shadow:0 0 0 2px ${UI.gold}55,inset 0 1px 0 rgba(255,255,255,.22),0 16px 34px rgba(255,190,60,.22)}
    .ms-card.locked{filter:saturate(.4) brightness(.76)}
    .ms-card.flat:hover{transform:none}

    /* ── Tabs, chips, nav ───────────────────────────────────────────────── */
    .ms-tab{position:relative;cursor:pointer;border-radius:15px;font:800 13px/1 'Trebuchet MS',system-ui;
      padding:10px 16px;background:linear-gradient(160deg,rgba(38,46,70,.88),rgba(18,22,38,.84));color:${UI.text};
      border:1px solid rgba(255,255,255,.12);pointer-events:auto;white-space:nowrap;
      transition:transform .14s cubic-bezier(.34,1.6,.5,1),background .2s;
      box-shadow:0 4px 0 rgba(0,0,0,.3)}
    .ms-tab:hover{background:linear-gradient(160deg,rgba(56,66,96,.7),rgba(26,32,52,.6));transform:translateY(-2px)}
    .ms-tab:active{transform:translateY(3px);box-shadow:0 1px 0 rgba(0,0,0,.3)}
    .ms-tab.on{background:linear-gradient(150deg,#ffe27a,${UI.gold});color:#1b1405;
      box-shadow:0 5px 0 rgba(140,84,10,.42),0 8px 18px rgba(255,200,60,.32)}

    .ms-chip{display:inline-flex;align-items:center;gap:6px;
      background:linear-gradient(160deg,rgba(30,38,62,0.9),rgba(12,16,28,0.85));
      border:1px solid rgba(255,255,255,0.16);border-radius:999px;padding:7px 14px;
      font:800 14px/1 'Trebuchet MS',system-ui;backdrop-filter:blur(12px);white-space:nowrap;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 6px 14px rgba(0,0,0,.36)}

    .ms-nav{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;
      background:none;border:none;cursor:pointer;pointer-events:auto;padding:6px 12px;
      transition:transform .18s cubic-bezier(.34,1.8,.5,1)}
    .ms-nav .ms-navicon{font-size:23px;line-height:1;transition:transform .2s cubic-bezier(.34,1.8,.5,1),filter .2s;
      filter:grayscale(.6) opacity(.62) drop-shadow(0 2px 3px rgba(0,0,0,.5))}
    .ms-nav .ms-navlbl{font:800 10px/1 system-ui;letter-spacing:.6px;color:rgba(238,243,251,.5);transition:color .2s}
    .ms-nav:hover .ms-navicon{transform:translateY(-3px) scale(1.08)}
    .ms-nav.on .ms-navicon{filter:drop-shadow(0 4px 10px rgba(255,200,60,.6));transform:translateY(-7px) scale(1.26)}
    .ms-nav.on .ms-navlbl{color:${UI.gold}}
    .ms-nav.on::before{content:'';position:absolute;bottom:-2px;width:26px;height:4px;border-radius:3px;
      background:linear-gradient(90deg,${UI.gold},#ff9f43);box-shadow:0 0 8px ${UI.gold}99}
    .ms-nav.home{margin-top:-16px}
    .ms-nav.home .ms-navicon{font-size:25px;width:56px;height:56px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      background:linear-gradient(160deg,#ffe27a,${UI.gold} 55%,#f0a01a);color:#1b1405;
      border:3px solid rgba(255,246,214,.85);
      box-shadow:0 6px 0 rgba(140,84,10,.5),0 10px 22px rgba(0,0,0,.5);filter:none}
    .ms-nav.home:hover .ms-navicon{transform:translateY(-2px) scale(1.05)}
    .ms-nav.home.on .ms-navicon{transform:translateY(-2px) scale(1.05)}
    .ms-nav.home.on::before{display:none}

    .ms-cog{cursor:pointer;border:none;width:42px;height:42px;border-radius:14px;font-size:18px;
      background:linear-gradient(160deg,rgba(34,42,66,0.78),rgba(14,18,32,0.7));color:${UI.text};
      border:1px solid rgba(255,255,255,0.16);backdrop-filter:blur(12px);pointer-events:auto;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 5px 14px rgba(0,0,0,.4);
      transition:transform .18s cubic-bezier(.34,1.6,.5,1)}
    .ms-cog:hover{transform:rotate(45deg)}
    .ms-cog:active{transform:scale(.92)}

    /* ── Progress bars ──────────────────────────────────────────────────── */
    .ms-bar{position:relative;height:9px;border-radius:6px;background:rgba(255,255,255,.11);overflow:hidden;
      box-shadow:inset 0 1px 3px rgba(0,0,0,.5)}
    .ms-bar>i{display:block;height:100%;border-radius:6px;
      background:linear-gradient(90deg,${UI.gold},#ff9f43);
      box-shadow:0 0 10px rgba(255,190,60,.6);transition:width .5s cubic-bezier(.34,1.3,.5,1)}
    .ms-bar.blue>i{background:linear-gradient(90deg,#8fd4ff,${UI.blue});box-shadow:0 0 10px rgba(63,169,245,.6)}
    .ms-bar.green>i{background:linear-gradient(90deg,#b6ffcd,${UI.green});box-shadow:0 0 10px rgba(107,255,154,.6)}

    .ms-scroll::-webkit-scrollbar{width:8px;height:8px}
    .ms-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.22);border-radius:4px}
    .ms-scroll::-webkit-scrollbar-track{background:transparent}
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

export type ButtonVariant = 'gold' | 'blue' | 'magenta' | 'green' | 'ghost';

export function button(label: string, onClick: () => void, variant: ButtonVariant = 'gold'): HTMLButtonElement {
  const b = el('button');
  b.className = `ms-btn${variant === 'gold' ? '' : ' ' + variant}`;
  b.innerHTML = label;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

export function tab(label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button');
  b.className = 'ms-tab';
  b.innerHTML = label;
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return b;
}

/** A labelled progress bar row. */
export function bar(pct: number, variant: '' | 'blue' | 'green' = ''): HTMLDivElement {
  const d = el('div');
  d.className = `ms-bar ${variant}`.trim();
  d.innerHTML = `<i style="width:${Math.max(0, Math.min(100, pct))}%"></i>`;
  return d;
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
    gap: '18px',
    zIndex: '100',
    color: UI.text,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    background: opaque
      ? 'radial-gradient(ellipse at 50% 18%, rgba(46,62,110,.58), rgba(7,10,20,.9))'
      : 'transparent',
    backdropFilter: opaque ? 'blur(16px) saturate(1.15)' : 'none',
    animation: 'ms-fade .22s ease',
    pointerEvents: 'auto',
  });
  document.body.appendChild(s);
  return s;
}

export function show(s: HTMLElement, on: boolean): void {
  s.style.display = on ? 'flex' : 'none';
}

/** Format a coin count with its glyph. */
export function coinStr(n: number): string {
  return `🪙 ${n.toLocaleString()}`;
}

/** Format a key count with its glyph. */
export function keyStr(n: number): string {
  return `🗝️ ${n}`;
}

/** Pack a numeric colour into a CSS hex string. */
export function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

/** Cinematic vignette + a subtle scanline veil (call once at boot). */
export function vignette(): void {
  const v = el('div', {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '40',
    background: 'radial-gradient(ellipse at 50% 42%, transparent 52%, rgba(4,6,14,0.55) 100%)',
  });
  document.body.appendChild(v);
}

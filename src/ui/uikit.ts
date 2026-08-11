/**
 * The shared DOM UI kit for METRO SURF — a Supercell-style treatment: every
 * control is a chunky 3D slab with a dark comic outline, a saturated vertical
 * gradient face, a glossy top light and a solid colour edge underneath that
 * compresses when pressed. Text is heavy white with a dark stroke so it reads
 * over any face colour. One injected stylesheet carries the whole system;
 * everything overlays the WebGL canvas so the live 3D scene stays visible.
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
  /** Comic outline ink used on every 3D slab. */
  line: '#131a2c',
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
    /* ── Responsive scale ───────────────────────────────────────────────────
       One set of tokens drives every control's size, so shrinking the UI for a
       small phone is a single breakpoint rather than dozens of clamps. */
    :root{
      --ms-card-min: 150px;   /* gallery column width */
      --ms-r: 18px;           /* slab corner radius */
      --ms-btn-fs: 17px;      /* button label */
      --ms-btn-py: 15px;      /* button padding */
      --ms-btn-px: 30px;
      --ms-tab-fs: 13px;
      --ms-gap: 12px;
    }
    @media (max-width: 430px){
      :root{ --ms-card-min: 132px; --ms-r: 15px; --ms-btn-fs: 15px;
             --ms-btn-py: 13px; --ms-btn-px: 22px; --ms-tab-fs: 12px; --ms-gap: 9px; }
    }
    @media (max-width: 360px){
      :root{ --ms-card-min: 118px; --ms-btn-fs: 14px; --ms-btn-py: 12px; --ms-gap: 8px; }
    }

    /* Gallery grid: columns fill the width instead of wrapping to one per row
       on a narrow phone, which was the single worst mobile problem. */
    .ms-grid{display:grid;width:100%;
      grid-template-columns:repeat(auto-fill,minmax(var(--ms-card-min),1fr));
      gap:var(--ms-gap);align-content:start;justify-items:stretch}
    .ms-grid.wide{grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr))}

    @keyframes ms-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
    @keyframes ms-breathe { 0%,100%{filter:brightness(1) drop-shadow(0 0 0 ${UI.gold}00)}
      55%{filter:brightness(1.07) drop-shadow(0 0 18px ${UI.gold}66)} }
    @keyframes ms-fade { from{opacity:0} to{opacity:1} }
    @keyframes ms-slideup { from{opacity:0;transform:translateY(26px)} to{opacity:1;transform:translateY(0)} }
    @keyframes ms-popin { 0%{opacity:0;transform:translateY(22px) scale(.92) rotateX(16deg)}
      100%{opacity:1;transform:translateY(0) scale(1) rotateX(0)} }
    @keyframes ms-shine { 0%{background-position:-220% 0} 100%{background-position:220% 0} }
    @keyframes ms-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
    @keyframes ms-spin { to{transform:rotate(360deg)} }
    @keyframes ms-wobble { 0%,100%{transform:rotate(-2.2deg)} 50%{transform:rotate(-1.2deg) translateY(-3px)} }
    @keyframes ms-floatup { 0%{top:104%;opacity:0;transform:translateX(0) rotate(0)}
      12%{opacity:.6} 85%{opacity:.34}
      100%{top:-8%;opacity:0;transform:translateX(14px) rotate(30deg)} }
    @keyframes ms-logoshine { 0%,72%{transform:translateX(-130%) skewX(-18deg)}
      92%,100%{transform:translateX(230%) skewX(-18deg)} }

    /* ── 3D slab buttons (Supercell style) ─────────────────────────────── */
    .ms-btn{
      --edge:#96650a; --lo:#e0940c;
      position:relative;overflow:hidden;cursor:pointer;
      border:2.5px solid ${UI.line};border-radius:var(--ms-r);
      font:900 var(--ms-btn-fs)/1 'Trebuchet MS',system-ui,sans-serif;color:#fff;
      letter-spacing:.5px;padding:var(--ms-btn-py) var(--ms-btn-px);
      background:linear-gradient(180deg,#fff0a4 0%,${UI.gold} 32%,#f5a71b 68%,var(--lo) 100%);
      -webkit-text-stroke:.8px rgba(26,16,2,.55);
      text-shadow:0 2.5px 0 rgba(26,16,2,.5);
      box-shadow:0 6px 0 var(--edge),0 6px 0 2.5px ${UI.line},0 13px 22px rgba(0,0,0,.5),
        inset 0 2.5px 1px rgba(255,255,255,.6),inset 0 -4px 8px rgba(80,40,0,.22);
      transition:transform .12s cubic-bezier(.34,1.7,.5,1),box-shadow .12s,filter .2s;
      pointer-events:auto}
    .ms-btn::before{content:'';position:absolute;inset:2px 2px 52% 2px;
      border-radius:calc(var(--ms-r) - 4px) calc(var(--ms-r) - 4px) 40% 40%;
      background:linear-gradient(180deg,rgba(255,255,255,.5),rgba(255,255,255,0));pointer-events:none}
    .ms-btn::after{content:'';position:absolute;inset:0;background:linear-gradient(110deg,
      transparent 38%,rgba(255,255,255,.45) 50%,transparent 62%);background-size:230% 100%;
      animation:ms-shine 4.6s linear infinite;pointer-events:none}
    .ms-btn:hover{transform:translateY(-2px);filter:brightness(1.06)}
    .ms-btn:active{transform:translateY(5px);
      box-shadow:0 1px 0 var(--edge),0 1px 0 2.5px ${UI.line},0 4px 10px rgba(0,0,0,.42),
        inset 0 2px 1px rgba(255,255,255,.5),inset 0 -2px 5px rgba(80,40,0,.22)}
    .ms-btn.blue{--edge:#155a94; --lo:#1d7ecb;
      background:linear-gradient(180deg,#bfe4ff 0%,${UI.blue} 32%,#2287d6 68%,var(--lo) 100%);
      -webkit-text-stroke:.8px rgba(4,26,44,.6);text-shadow:0 2.5px 0 rgba(4,26,44,.55)}
    .ms-btn.magenta{--edge:#8f0e6e; --lo:#cf22a4;
      background:linear-gradient(180deg,#ffc4ef 0%,${UI.magenta} 34%,#df2eb2 68%,var(--lo) 100%);
      -webkit-text-stroke:.8px rgba(40,4,32,.6);text-shadow:0 2.5px 0 rgba(40,4,32,.55)}
    .ms-btn.green{--edge:#0e7a3c; --lo:#23b45e;
      background:linear-gradient(180deg,#ccffdd 0%,${UI.green} 30%,#2fc86b 66%,var(--lo) 100%);
      -webkit-text-stroke:.8px rgba(4,34,16,.6);text-shadow:0 2.5px 0 rgba(4,34,16,.55)}
    .ms-btn.ghost{--edge:#10162a;
      background:linear-gradient(180deg,#46536f 0%,#333e58 45%,#242e45 100%);
      font-size:calc(var(--ms-btn-fs) - 3px);padding:calc(var(--ms-btn-py) - 3px) calc(var(--ms-btn-px) - 8px);
      -webkit-text-stroke:.5px rgba(8,12,22,.5);text-shadow:0 2px 0 rgba(8,12,22,.5);
      box-shadow:0 5px 0 var(--edge),0 5px 0 2.5px ${UI.line},0 10px 16px rgba(0,0,0,.4),
        inset 0 2px 1px rgba(255,255,255,.22),inset 0 -3px 6px rgba(0,0,0,.25)}
    .ms-btn.ghost::after{display:none}
    /* Small variant for buttons that live inside a gallery card. */
    .ms-btn.sm{font-size:calc(var(--ms-btn-fs) - 3px);padding:9px 14px;border-radius:12px;
      box-shadow:0 4px 0 var(--edge),0 4px 0 2.5px ${UI.line},0 7px 14px rgba(0,0,0,.4),
        inset 0 2px 1px rgba(255,255,255,.5)}
    .ms-btn.sm:active{transform:translateY(3px);
      box-shadow:0 1px 0 var(--edge),0 1px 0 2.5px ${UI.line}}
    .ms-btn:disabled{filter:grayscale(.8) brightness(.6);cursor:not-allowed;transform:none}
    .ms-btn:disabled::after{display:none}

    /* ── Cards ─────────────────────────────────────────────────────────── */
    .ms-card{position:relative;word-break:keep-all;overflow-wrap:anywhere;
      background:linear-gradient(178deg,#2c3654 0%,#1d2540 46%,#141b30 100%);
      border:2px solid ${UI.line};border-radius:var(--ms-r);padding:12px 10px;display:flex;
      flex-direction:column;gap:7px;
      box-shadow:0 5px 0 rgba(8,12,24,.9),0 12px 26px rgba(0,0,0,.5),
        inset 0 2px 0 rgba(255,255,255,.14),inset 0 -4px 8px rgba(0,0,0,.28);
      transition:transform .16s cubic-bezier(.34,1.5,.5,1),box-shadow .25s,border-color .2s;
      transform-style:preserve-3d}
    .ms-card::before{content:'';position:absolute;inset:2px 2px 55% 2px;
      border-radius:calc(var(--ms-r) - 4px) calc(var(--ms-r) - 4px) 50% 50%/
        calc(var(--ms-r) - 4px) calc(var(--ms-r) - 4px) 26% 26%;
      background:linear-gradient(180deg,rgba(255,255,255,.1),transparent);pointer-events:none}
    .ms-card:hover{transform:translateY(-4px)}
    .ms-card.sel{border-color:${UI.gold};
      box-shadow:0 5px 0 #8a5a06,0 12px 30px rgba(255,190,60,.25),
        inset 0 2px 0 rgba(255,255,255,.2),inset 0 -4px 8px rgba(0,0,0,.28)}
    .ms-card.locked{filter:saturate(.4) brightness(.78)}
    .ms-card.flat:hover{transform:none}

    /* ── Tabs, chips ───────────────────────────────────────────────────── */
    .ms-tab{position:relative;cursor:pointer;border-radius:13px;
      font:900 var(--ms-tab-fs)/1 'Trebuchet MS',system-ui;color:#fff;
      padding:9px 14px;border:2px solid ${UI.line};pointer-events:auto;white-space:nowrap;
      background:linear-gradient(180deg,#46536f,#2b3550 55%,#202942);
      -webkit-text-stroke:.4px rgba(8,12,22,.45);text-shadow:0 1.5px 0 rgba(8,12,22,.45);
      box-shadow:0 4px 0 #10162a,0 4px 0 2px ${UI.line},inset 0 1.5px 0 rgba(255,255,255,.2);
      transition:transform .13s cubic-bezier(.34,1.6,.5,1)}
    .ms-tab:hover{transform:translateY(-2px)}
    .ms-tab:active{transform:translateY(3px);box-shadow:0 1px 0 #10162a,0 1px 0 2px ${UI.line}}
    .ms-tab.on{background:linear-gradient(180deg,#fff0a4,${UI.gold} 40%,#eda312);
      box-shadow:0 4px 0 #96650a,0 4px 0 2px ${UI.line},inset 0 1.5px 0 rgba(255,255,255,.55);
      -webkit-text-stroke:.6px rgba(26,16,2,.5);text-shadow:0 2px 0 rgba(26,16,2,.45)}

    .ms-chip{display:inline-flex;align-items:center;gap:6px;
      background:linear-gradient(180deg,#2b3550 0%,#1b2238 60%,#141a2c 100%);
      border:2px solid ${UI.line};border-radius:999px;padding:7px 14px;
      font:800 14px/1 'Trebuchet MS',system-ui;white-space:nowrap;
      box-shadow:0 3px 0 rgba(8,12,24,.85),inset 0 1.5px 0 rgba(255,255,255,.16)}

    /* ── Bottom navigation: beveled icon slabs ─────────────────────────── */
    .ms-nav{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;
      background:none;border:none;cursor:pointer;pointer-events:auto;padding:4px 8px;
      transition:transform .18s cubic-bezier(.34,1.8,.5,1)}
    .ms-nav{padding:4px 6px}
    .ms-nav .ms-navicon{font-size:21px;line-height:1;width:46px;height:40px;border-radius:12px;
      display:flex;align-items:center;justify-content:center;
      background:linear-gradient(180deg,#3d4966,#27304b 55%,#1b2338);
      border:2px solid ${UI.line};
      box-shadow:0 3.5px 0 #0c1120,inset 0 1.5px 0 rgba(255,255,255,.2);
      filter:saturate(.7);
      transition:transform .2s cubic-bezier(.34,1.8,.5,1),box-shadow .2s,filter .2s}
    .ms-nav .ms-navlbl{font:800 10px/1 system-ui;letter-spacing:.6px;
      color:rgba(238,243,251,.55);transition:color .2s}
    .ms-nav:hover .ms-navicon{transform:translateY(-3px)}
    .ms-nav.on .ms-navicon{filter:none;transform:translateY(-7px) scale(1.1);
      background:linear-gradient(180deg,#fff0a4,${UI.gold} 42%,#eda312);
      box-shadow:0 4px 0 #96650a,0 8px 16px rgba(255,190,60,.4),inset 0 2px 0 rgba(255,255,255,.55)}
    .ms-nav.on .ms-navlbl{color:${UI.gold}}
    .ms-nav.home{margin-top:-16px}
    .ms-nav.home .ms-navlbl{margin-top:5px}
    .ms-nav.home .ms-navicon{font-size:25px;width:56px;height:52px;border-radius:50%;
      background:linear-gradient(180deg,#fff0a4,${UI.gold} 42%,#eda312);
      border:3px solid ${UI.line};
      box-shadow:0 5px 0 #96650a,0 5px 0 3px ${UI.line},0 12px 22px rgba(0,0,0,.5),
        inset 0 2.5px 0 rgba(255,255,255,.6);filter:none}
    .ms-nav.home:hover .ms-navicon,.ms-nav.home.on .ms-navicon{transform:translateY(-2px) scale(1.04)}

    .ms-cog{cursor:pointer;width:44px;height:44px;border-radius:13px;font-size:18px;
      color:${UI.text};border:2px solid ${UI.line};pointer-events:auto;
      background:linear-gradient(180deg,#3d4966,#27304b 55%,#1b2338);
      box-shadow:0 3.5px 0 #0c1120,inset 0 1.5px 0 rgba(255,255,255,.2);
      transition:transform .18s cubic-bezier(.34,1.6,.5,1)}
    .ms-cog:hover{transform:translateY(-2px)}
    .ms-cog:active{transform:translateY(2px);box-shadow:0 1px 0 #0c1120}

    /* ── Progress bars ─────────────────────────────────────────────────── */
    .ms-bar{position:relative;height:11px;border-radius:7px;border:1.5px solid ${UI.line};
      background:linear-gradient(180deg,#0e1322,#1a2136);overflow:hidden;
      box-shadow:inset 0 2px 3px rgba(0,0,0,.6)}
    .ms-bar>i{display:block;height:100%;border-radius:5px;
      background:linear-gradient(180deg,#fff0a4,${UI.gold} 45%,#eda312);
      box-shadow:inset 0 1.5px 0 rgba(255,255,255,.55),0 0 8px rgba(255,190,60,.5);
      transition:width .5s cubic-bezier(.34,1.3,.5,1)}
    .ms-bar.blue>i{background:linear-gradient(180deg,#bfe4ff,${UI.blue} 45%,#1d7ecb);
      box-shadow:inset 0 1.5px 0 rgba(255,255,255,.5),0 0 8px rgba(63,169,245,.5)}
    .ms-bar.green>i{background:linear-gradient(180deg,#ccffdd,${UI.green} 45%,#23b45e);
      box-shadow:inset 0 1.5px 0 rgba(255,255,255,.5),0 0 8px rgba(107,255,154,.5)}

    /* ── Wordmark + ribbon (the premium home hero) ─────────────────────── */
    .ms-logo{position:relative;display:inline-block;
      font:900 clamp(30px,min(9.5vw,8vh),64px)/0.95 'Trebuchet MS',system-ui;
      letter-spacing:1px;color:${UI.gold};transform:rotate(-2.2deg);
      animation:ms-wobble 5s ease-in-out infinite;
      -webkit-text-stroke:2.5px #1c1430;
      text-shadow:0 4px 0 #8a5a06,0 6px 0 #1c1430,0 14px 26px rgba(0,0,0,.55)}
    .ms-logo em{font-style:normal;color:${UI.blue};
      text-shadow:0 4px 0 #155a94,0 6px 0 #1c1430,0 14px 26px rgba(0,0,0,.55)}
    .ms-logo .ms-logoshine{position:absolute;inset:0;overflow:hidden;pointer-events:none}
    .ms-logo .ms-logoshine::before{content:'';position:absolute;top:-10%;bottom:-10%;width:34%;
      background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent);
      animation:ms-logoshine 5.2s ease-in-out infinite}
    .ms-ribbon{display:inline-flex;align-items:center;gap:7px;
      font:900 11px/1 'Trebuchet MS',system-ui;color:#fff;letter-spacing:2px;
      padding:7px 18px;border-radius:999px;border:2px solid ${UI.line};
      background:linear-gradient(180deg,#e05a9c 0%,#c02478 60%,#a01560 100%);
      -webkit-text-stroke:.4px rgba(40,4,28,.5);text-shadow:0 1.5px 0 rgba(40,4,28,.5);
      box-shadow:0 3.5px 0 #6e0a42,0 3.5px 0 2px ${UI.line},inset 0 1.5px 0 rgba(255,255,255,.35)}

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

/** Cinematic vignette (call once at boot). */
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

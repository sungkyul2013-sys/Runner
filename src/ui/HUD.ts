import { HUNT_WORD, POWERUPS } from '../config/powerups';
import type { EffectView } from '../systems/PickupSystem';

export interface RunStats {
  score: number;
  coins: number;
  keys: number;
  distance: number;
  /** Live score multiplier (distance ramp × missions × power-ups). */
  multiplier: number;
  /** Remaining seconds in timed modes (undefined in endless). */
  time?: number;
}

const GLASS = 'linear-gradient(160deg,rgba(24,28,44,0.66),rgba(12,14,26,0.58))';
const BORDER = '1px solid rgba(255,255,255,0.16)';
const SHADOW = 'inset 0 1px 0 rgba(255,255,255,.16),0 8px 20px rgba(0,0,0,.42)';

/**
 * The in-run HUD. Top-left carries the score readout with its live multiplier
 * and the distance; top-right the wallet and the pause key; under them the
 * running power-up timer rings. The word-hunt strip sits centre-top, the
 * hoverboard and item buttons pin to the bottom corner (side follows the
 * left-handed setting), and transient banners, mission toasts, express warnings
 * and the resume countdown float over everything. Pure DOM on top of the WebGL
 * canvas — menus live in {@link ScreenManager}.
 */
export class HUD {
  private readonly scoreEl: HTMLDivElement;
  private readonly multEl: HTMLDivElement;
  private readonly distEl: HTMLDivElement;
  private readonly timeEl: HTMLDivElement;
  private readonly coinsEl: HTMLDivElement;
  private readonly keysEl: HTMLDivElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly ringsEl: HTMLDivElement;
  private readonly comboEl: HTMLDivElement;
  private readonly huntEl: HTMLDivElement;
  private readonly actionsEl: HTMLDivElement;
  private readonly boardBtn: HTMLButtonElement;
  private readonly toastEl: HTMLDivElement;
  private readonly all: HTMLElement[] = [];

  private onPause: () => void = () => {};
  private onBoard: () => void = () => {};

  constructor() {
    HUD.ensureStyle('hud-base', `
      @keyframes hud-pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
      @keyframes hud-rise{0%{opacity:0;transform:translate(-50%,10px)}12%{opacity:1;transform:translate(-50%,0)}
        82%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-16px)}}
      @keyframes hud-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}
      @keyframes hud-flash{0%,100%{opacity:.35}50%{opacity:1}}
      .hud-ring{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;
        animation:hud-pop .3s cubic-bezier(.34,1.6,.5,1) both}
      .hud-ring>div{width:36px;height:36px;border-radius:50%;background:#0d1020;display:flex;
        align-items:center;justify-content:center;font-size:17px}
      .hud-letter{width:30px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;
        font:900 17px/1 'Trebuchet MS',system-ui;transition:all .3s cubic-bezier(.34,1.6,.5,1)}
    `);

    // ── Score block (top-left) ──
    const left = this.mk({ top: 'calc(env(safe-area-inset-top,0px) + 12px)', left: '14px', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' });
    const scoreRow = document.createElement('div');
    Object.assign(scoreRow.style, { display: 'flex', alignItems: 'baseline', gap: '8px' } as CSSStyleDeclaration);
    this.scoreEl = document.createElement('div');
    Object.assign(this.scoreEl.style, {
      font: `900 40px/1 'Trebuchet MS',system-ui`, color: '#ffffff',
      textShadow: '0 3px 12px rgba(0,0,0,.7), 0 0 22px rgba(120,180,255,.35)',
      fontVariantNumeric: 'tabular-nums',
    } as CSSStyleDeclaration);
    this.scoreEl.textContent = '0';
    this.multEl = document.createElement('div');
    Object.assign(this.multEl.style, {
      font: `900 19px/1 'Trebuchet MS',system-ui`, color: '#ffd23f',
      textShadow: '0 2px 10px rgba(255,180,40,.7)',
    } as CSSStyleDeclaration);
    this.multEl.textContent = '×1';
    scoreRow.append(this.scoreEl, this.multEl);

    const subRow = document.createElement('div');
    Object.assign(subRow.style, { display: 'flex', gap: '8px', alignItems: 'center' } as CSSStyleDeclaration);
    this.distEl = this.chip('📏 0m', '#dfe7f5');
    this.timeEl = this.chip('⏱ 0', '#ffd23f');
    this.timeEl.style.display = 'none';
    subRow.append(this.distEl, this.timeEl);
    left.append(scoreRow, subRow);

    // ── Wallet + pause (top-right) ──
    const right = this.mk({ top: 'calc(env(safe-area-inset-top,0px) + 12px)', right: '14px', gap: '8px', alignItems: 'center' });
    right.style.pointerEvents = 'auto';
    this.coinsEl = this.chip('🪙 0', '#ffcf3a');
    this.keysEl = this.chip('🗝️ 0', '#ffe066');
    this.pauseBtn = document.createElement('button');
    Object.assign(this.pauseBtn.style, {
      width: '42px', height: '42px', borderRadius: '13px', border: BORDER,
      background: GLASS, color: '#fff', font: '17px/1 system-ui', cursor: 'pointer',
      backdropFilter: 'blur(8px)', boxShadow: SHADOW,
    } as CSSStyleDeclaration);
    this.pauseBtn.textContent = '⏸';
    this.pauseBtn.addEventListener('click', () => this.onPause());
    right.append(this.coinsEl, this.keysEl, this.pauseBtn);

    // ── Power-up rings (under the wallet) ──
    this.ringsEl = this.mk({ top: 'calc(env(safe-area-inset-top,0px) + 64px)', right: '14px', gap: '8px' });

    // ── Word-hunt strip (centre, tucked under the top row so it never
    //    collides with the wallet chips on a narrow phone) ──
    this.huntEl = this.mk({
      top: 'calc(env(safe-area-inset-top,0px) + 74px)', left: '50%',
      transform: 'translateX(-50%)', gap: '5px',
    });

    // ── Combo meter ──
    this.comboEl = this.mk({
      top: '126px', left: '50%', transform: 'translateX(-50%)',
      font: `900 24px/1 'Trebuchet MS',system-ui`, color: '#ffd23f',
      textShadow: '0 2px 14px rgba(255,140,40,.8)',
    });
    this.comboEl.style.display = 'none';

    // ── Mission / reward toast column ──
    this.toastEl = this.mk({
      bottom: '120px', left: '50%', transform: 'translateX(-50%)',
      flexDirection: 'column', gap: '8px', alignItems: 'center',
    });

    // ── Action buttons (bottom corner) ──
    this.actionsEl = this.mk({ bottom: 'calc(env(safe-area-inset-bottom,0px) + 18px)', right: '18px', gap: '10px' });
    this.actionsEl.style.pointerEvents = 'auto';
    this.boardBtn = this.actionButton('🛹', () => this.onBoard());
    this.actionsEl.append(this.boardBtn);

    this.all.push(left, right, this.ringsEl, this.huntEl, this.comboEl, this.actionsEl, this.toastEl);
    this.setVisible(false);
  }

  // ── Construction helpers ──────────────────────────────────────────────────
  private mk(style: Partial<CSSStyleDeclaration>): HTMLDivElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', pointerEvents: 'none', zIndex: '50', display: 'flex', ...style,
    } as CSSStyleDeclaration);
    document.body.appendChild(el);
    return el;
  }

  private chip(text: string, color: string): HTMLDivElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      background: GLASS, border: BORDER, borderRadius: '999px', padding: '5px 12px',
      backdropFilter: 'blur(8px)', boxShadow: SHADOW, color,
      font: `800 15px/1 'Trebuchet MS',system-ui`, whiteSpace: 'nowrap',
      fontVariantNumeric: 'tabular-nums',
    } as CSSStyleDeclaration);
    el.textContent = text;
    return el;
  }

  private actionButton(emoji: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    Object.assign(b.style, {
      position: 'relative', width: '60px', height: '60px', borderRadius: '18px',
      border: BORDER, background: GLASS, color: '#fff', font: '27px/1 system-ui',
      cursor: 'pointer', backdropFilter: 'blur(8px)', boxShadow: SHADOW,
      transition: 'transform .12s cubic-bezier(.34,1.6,.5,1)',
    } as CSSStyleDeclaration);
    b.textContent = emoji;
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); b.style.transform = 'scale(.9)'; });
    b.addEventListener('pointerup', (e) => { e.stopPropagation(); b.style.transform = 'none'; });
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    const badge = document.createElement('span');
    badge.dataset.badge = '1';
    Object.assign(badge.style, {
      position: 'absolute', bottom: '-5px', right: '-5px', background: '#ffd23f',
      color: '#141826', font: `900 12px/1 'Trebuchet MS',monospace`, borderRadius: '9px',
      padding: '3px 6px', boxShadow: '0 2px 6px rgba(0,0,0,.45)',
    } as CSSStyleDeclaration);
    badge.textContent = '0';
    b.append(badge);
    return b;
  }

  // ── Wiring ────────────────────────────────────────────────────────────────
  bindControls(onPause: () => void, onBoard: () => void): void {
    this.onPause = onPause;
    this.onBoard = onBoard;
  }

  /** Move the action buttons to the other side for left-handed players. */
  setHandedness(left: boolean): void {
    this.actionsEl.style.right = left ? 'auto' : '18px';
    this.actionsEl.style.left = left ? '18px' : 'auto';
  }

  // ── Live updates ──────────────────────────────────────────────────────────
  private lastMult = 1;
  setRun(s: RunStats): void {
    this.scoreEl.textContent = s.score.toLocaleString();
    this.multEl.textContent = `×${s.multiplier}`;
    if (s.multiplier !== this.lastMult) {
      this.lastMult = s.multiplier;
      this.multEl.style.animation = 'none';
      void this.multEl.offsetWidth;
      this.multEl.style.animation = 'hud-pulse .45s cubic-bezier(.34,1.6,.5,1)';
    }
    this.distEl.textContent = `📏 ${Math.floor(s.distance)}m`;
    if (s.time !== undefined) {
      this.timeEl.style.display = 'block';
      this.timeEl.textContent = `⏱ ${s.time}`;
      this.timeEl.style.color = s.time <= 10 ? '#ff6a5a' : '#ffd23f';
      this.timeEl.style.animation = s.time <= 10 ? 'hud-flash .8s ease-in-out infinite' : 'none';
    } else {
      this.timeEl.style.display = 'none';
    }
    this.coinsEl.textContent = `🪙 ${s.coins}`;
    this.keysEl.textContent = `🗝️ ${s.keys}`;
  }

  /** Draw the countdown rings for the live timed power-ups. */
  setEffects(views: readonly EffectView[]): void {
    let html = '';
    for (const v of views) {
      const def = POWERUPS[v.type];
      const col = `#${def.color.toString(16).padStart(6, '0')}`;
      const deg = Math.max(0, Math.min(1, v.frac)) * 360;
      html += `<div class="hud-ring" style="background:conic-gradient(${col} ${deg}deg, rgba(255,255,255,0.14) 0);
        box-shadow:0 0 12px ${col}aa"><div>${def.icon}</div></div>`;
    }
    if (this.ringsHtml !== html) {
      this.ringsHtml = html;
      this.ringsEl.innerHTML = html;
    }
  }
  private ringsHtml = '';

  /** Hoverboard button state: spare charges and the live ride fraction. */
  setBoard(charges: number, rideFraction: number): void {
    const badge = this.boardBtn.querySelector('[data-badge]') as HTMLElement;
    if (badge) badge.textContent = `${charges}`;
    const riding = rideFraction > 0;
    this.boardBtn.disabled = charges <= 0 && !riding;
    this.boardBtn.style.filter = charges > 0 || riding ? 'none' : 'grayscale(.85) brightness(.6)';
    this.boardBtn.style.background = riding
      ? `conic-gradient(#8a7bff ${rideFraction * 360}deg, rgba(20,24,40,.7) 0)`
      : GLASS;
  }

  /** Word-hunt progress strip. */
  setHunt(collected: readonly string[]): void {
    let html = '';
    for (const ch of HUNT_WORD) {
      const got = collected.includes(ch);
      html += `<div class="hud-letter" style="background:${got
        ? 'linear-gradient(160deg,#00e0ff,#0090c0)'
        : 'rgba(18,22,36,.55)'};color:${got ? '#08202c' : 'rgba(255,255,255,.35)'};
        border:1px solid ${got ? '#9af0ff' : 'rgba(255,255,255,.14)'};
        box-shadow:${got ? '0 4px 12px rgba(0,224,255,.45)' : 'none'}">${ch}</div>`;
    }
    if (this.huntHtml !== html) {
      this.huntHtml = html;
      this.huntEl.innerHTML = html;
    }
  }
  private huntHtml = '';

  /** Settings toggle: hide the combo meter entirely when false. */
  comboEnabled = true;

  setCombo(count: number): void {
    if (this.comboEnabled && count >= 8) {
      this.comboEl.style.display = 'block';
      this.comboEl.textContent = `콤보 ×${count}`;
    } else {
      this.comboEl.style.display = 'none';
    }
  }

  setVisible(on: boolean): void {
    for (const el of this.all) {
      el.style.display = on && el !== this.comboEl ? 'flex' : 'none';
    }
  }

  // ── Transient overlays ────────────────────────────────────────────────────
  popup(text: string, color = '#ffffff'): void {
    HUD.ensureStyle('hud-popup',
      '@keyframes hud-popup{0%{opacity:0;transform:translate(-50%,0) scale(.7)}' +
      '20%{opacity:1;transform:translate(-50%,-20px) scale(1)}' +
      '100%{opacity:0;transform:translate(-50%,-70px) scale(1)}}');
    const e = document.createElement('div');
    Object.assign(e.style, {
      position: 'fixed', top: '36%', left: '50%', color,
      font: `900 28px/1 'Trebuchet MS',system-ui`, textShadow: `0 0 16px ${color}, 0 3px 8px rgba(0,0,0,.6)`,
      pointerEvents: 'none', zIndex: '70', animation: 'hud-popup 0.95s ease-out forwards',
    } as CSSStyleDeclaration);
    e.textContent = text;
    document.body.appendChild(e);
    setTimeout(() => e.remove(), 1000);
  }

  banner(title: string, subtitle = '', color = '#ffd23f'): void {
    HUD.ensureStyle('hud-banner',
      '@keyframes hud-banner{0%{opacity:0;transform:translate(-50%,-24px) scale(.9)}' +
      '14%,78%{opacity:1;transform:translate(-50%,0) scale(1)}' +
      '100%{opacity:0;transform:translate(-50%,-20px) scale(.96)}}');
    const e = document.createElement('div');
    Object.assign(e.style, {
      position: 'fixed', top: '22%', left: '50%', textAlign: 'center',
      pointerEvents: 'none', zIndex: '72', animation: 'hud-banner 2.2s ease-in-out forwards',
    } as CSSStyleDeclaration);
    e.innerHTML =
      `<div style="font:900 clamp(28px,7vw,42px)/1 'Trebuchet MS',system-ui;color:${color};
        text-shadow:0 3px 18px rgba(0,0,0,.7)">${title}</div>` +
      (subtitle ? `<div style="font:800 15px/1.5 system-ui;color:#fff;opacity:.92;margin-top:4px">${subtitle}</div>` : '');
    document.body.appendChild(e);
    setTimeout(() => e.remove(), 2250);
  }

  /** A stacked toast used for mission progress and rewards. */
  toast(icon: string, text: string, color = '#6bff9a'): void {
    const e = document.createElement('div');
    Object.assign(e.style, {
      background: GLASS, border: `1px solid ${color}66`, borderRadius: '14px',
      padding: '9px 16px', color: '#fff', font: `800 14px/1.2 system-ui`,
      boxShadow: `0 8px 22px rgba(0,0,0,.45), 0 0 18px ${color}33`,
      backdropFilter: 'blur(10px)', display: 'flex', gap: '9px', alignItems: 'center',
      animation: 'hud-rise 2.6s ease-out forwards',
      maxWidth: 'min(340px, 88vw)', textAlign: 'left',
    } as CSSStyleDeclaration);
    e.innerHTML = `<span style="font-size:19px;flex-shrink:0">${icon}</span><span>${text}</span>`;
    this.toastEl.appendChild(e);
    setTimeout(() => e.remove(), 2650);
  }

  /** Full-width warning strip for an oncoming express. */
  warn(lane: number): void {
    HUD.ensureStyle('hud-warn',
      '@keyframes hud-warn{0%{opacity:0}12%,70%{opacity:1}100%{opacity:0}}');
    const side = lane < 0 ? '왼쪽' : lane > 0 ? '오른쪽' : '가운데';
    const e = document.createElement('div');
    Object.assign(e.style, {
      position: 'fixed', top: '46%', left: '0', right: '0', textAlign: 'center',
      pointerEvents: 'none', zIndex: '71', animation: 'hud-warn 1.8s ease-out forwards',
    } as CSSStyleDeclaration);
    e.innerHTML =
      `<div style="display:inline-block;padding:8px 22px;border-radius:999px;
        background:linear-gradient(90deg,rgba(226,60,47,.9),rgba(255,140,40,.9));
        font:900 18px/1 'Trebuchet MS',system-ui;color:#fff;
        box-shadow:0 6px 26px rgba(226,60,47,.6)">🚄 특급 열차 — ${side} 선로!</div>`;
    document.body.appendChild(e);
    setTimeout(() => e.remove(), 1850);
  }

  /** "3 · 2 · 1 · GO!" resume countdown; calls `onGo` when it finishes. */
  countdown(onGo: () => void): void {
    HUD.ensureStyle('hud-count',
      '@keyframes hud-count{0%{opacity:0;transform:translate(-50%,-50%) scale(1.9)}' +
      '30%{opacity:1;transform:translate(-50%,-50%) scale(1)}' +
      '100%{opacity:0;transform:translate(-50%,-50%) scale(.7)}}');
    const steps = ['3', '2', '1', 'GO!'];
    let i = 0;
    const tick = () => {
      const e = document.createElement('div');
      const go = steps[i] === 'GO!';
      Object.assign(e.style, {
        position: 'fixed', top: '44%', left: '50%', zIndex: '90', pointerEvents: 'none',
        font: `900 ${go ? 92 : 118}px/1 'Trebuchet MS',system-ui`,
        color: go ? '#6bff9a' : '#ffd23f',
        textShadow: '0 6px 34px rgba(0,0,0,.75)',
        animation: 'hud-count 0.7s ease-out forwards',
      } as CSSStyleDeclaration);
      e.textContent = steps[i];
      document.body.appendChild(e);
      setTimeout(() => e.remove(), 700);
      i++;
      if (i < steps.length) setTimeout(tick, 600);
      else setTimeout(onGo, 400);
    };
    tick();
  }

  private static styles = new Set<string>();
  private static ensureStyle(id: string, css: string): void {
    if (HUD.styles.has(id)) return;
    HUD.styles.add(id);
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }
}

import { HUNT_WORD, POWERUPS } from '../config/powerups';

/** Default notification accent (kept local so the HUD has no UI-kit import). */
const UI_GREEN = '#6bff9a';
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

const GLASS = 'linear-gradient(180deg,#2b3550 0%,#1b2238 60%,#141a2c 100%)';
const BORDER = '2px solid #131a2c';
const SHADOW = '0 3.5px 0 rgba(8,12,24,.9), inset 0 1.5px 0 rgba(255,255,255,.18)';

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
  private readonly noteEl: HTMLDivElement;
  private readonly all: HTMLElement[] = [];

  // The notification slot: one live message, a short queue behind it.
  private noteBusy = false;
  private noteText = '';
  private notePriority = 0;
  private noteTimer = 0;
  private readonly queue: { icon: string; text: string; color: string; priority: number }[] = [];

  private onPause: () => void = () => {};
  private onBoard: () => void = () => {};

  constructor() {
    HUD.ensureStyle('hud-base', `
      @keyframes hud-pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
      @keyframes hud-rise{0%{opacity:0;transform:translate(-50%,10px)}12%{opacity:1;transform:translate(-50%,0)}
        82%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-16px)}}
      @keyframes hud-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}
      @keyframes hud-flash{0%,100%{opacity:.35}50%{opacity:1}}
      @keyframes hud-note{0%{opacity:0;transform:translate(-50%,-10px) scale(.94)}
        100%{opacity:1;transform:translate(-50%,0) scale(1)}}
      @keyframes hud-noteout{0%{opacity:1}100%{opacity:0;transform:translate(-50%,-8px)}}
      .hud-ring{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;
        justify-content:center;animation:hud-pop .3s cubic-bezier(.34,1.6,.5,1) both}
      .hud-ring>div{width:31px;height:31px;border-radius:50%;background:#0d1020;display:flex;
        align-items:center;justify-content:center;font-size:15px}
      @media (max-width:430px){
        .hud-ring{width:34px;height:34px}
        .hud-ring>div{width:26px;height:26px;font-size:13px}
      }
      .hud-letter{width:20px;height:23px;border-radius:6px;display:flex;align-items:center;
        justify-content:center;font:900 12px/1 'Trebuchet MS',system-ui;
        border:1.5px solid #131a2c;transition:all .3s cubic-bezier(.34,1.6,.5,1)}
    `);

    // ── Score block (top-left) ──
    const left = this.mk({
      top: 'calc(env(safe-area-inset-top,0px) + 12px)', left: '14px',
      flexDirection: 'column', gap: '6px', alignItems: 'flex-start',
      maxWidth: '52vw', // never let a six-figure score run under the wallet
    });
    const scoreRow = document.createElement('div');
    Object.assign(scoreRow.style, { display: 'flex', alignItems: 'baseline', gap: '6px' } as CSSStyleDeclaration);
    this.scoreEl = document.createElement('div');
    Object.assign(this.scoreEl.style, {
      font: `900 clamp(24px,7.2vw,40px)/1 'Trebuchet MS',system-ui`, color: '#ffffff',
      // A dark stroke + drop shadow keeps the readout legible over a bright
      // district without needing a panel behind it.
      webkitTextStroke: '2px rgba(10,14,26,.85)',
      textShadow: '0 4px 0 rgba(10,14,26,.55), 0 8px 18px rgba(0,0,0,.6)',
      fontVariantNumeric: 'tabular-nums', letterSpacing: '.5px',
    } as unknown as CSSStyleDeclaration);
    this.scoreEl.textContent = '0';
    this.multEl = document.createElement('div');
    Object.assign(this.multEl.style, {
      font: `900 clamp(15px,4.4vw,20px)/1 'Trebuchet MS',system-ui`, color: '#ffd23f',
      webkitTextStroke: '1.6px rgba(10,14,26,.8)',
      textShadow: '0 3px 0 rgba(10,14,26,.5), 0 0 14px rgba(255,180,40,.6)',
    } as unknown as CSSStyleDeclaration);
    this.multEl.textContent = '×1';
    scoreRow.append(this.scoreEl);

    const subRow = document.createElement('div');
    Object.assign(subRow.style, { display: 'flex', gap: '6px', alignItems: 'center' } as CSSStyleDeclaration);
    this.distEl = document.createElement('div');
    Object.assign(this.distEl.style, {
      font: `900 clamp(12px,3.4vw,15px)/1 'Trebuchet MS',system-ui`,
      color: 'rgba(238,243,251,.9)', fontVariantNumeric: 'tabular-nums',
      webkitTextStroke: '1.4px rgba(10,14,26,.8)',
      textShadow: '0 2px 0 rgba(10,14,26,.5)', letterSpacing: '.3px',
    } as unknown as CSSStyleDeclaration);
    this.distEl.textContent = '0 m';
    this.timeEl = this.chip('⏱ 0', '#ffd23f');
    this.timeEl.style.display = 'none';
    subRow.append(this.multEl, this.distEl, this.timeEl);
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
      top: 'calc(env(safe-area-inset-top,0px) + 72px)', left: '50%',
      transform: 'translateX(-50%)', gap: '4px',
    });

    // ── Combo meter ──
    this.comboEl = this.mk({
      top: '126px', left: '50%', transform: 'translateX(-50%)',
      font: `900 24px/1 'Trebuchet MS',system-ui`, color: '#ffd23f',
      textShadow: '0 2px 14px rgba(255,140,40,.8)',
    });
    this.comboEl.style.display = 'none';

    // ── The notification slot: one line, tucked under the HUD so it never
    //    sits over the rails the player is reading. ──
    this.noteEl = this.mk({
      top: 'calc(env(safe-area-inset-top,0px) + 108px)', left: '50%',
      transform: 'translateX(-50%)', alignItems: 'center', gap: '8px',
      maxWidth: 'min(340px, 88vw)', padding: '7px 14px', borderRadius: '13px',
      background: GLASS, border: `2px solid ${UI_GREEN}`, color: '#fff',
      font: `800 13px/1.25 system-ui`, whiteSpace: 'nowrap',
      boxShadow: '0 4px 0 rgba(8,12,24,.9), 0 8px 18px rgba(0,0,0,.5)',
    });
    this.noteEl.style.display = 'none';

    // ── Action buttons (bottom corner) ──
    this.actionsEl = this.mk({ bottom: 'calc(env(safe-area-inset-bottom,0px) + 18px)', right: '18px', gap: '10px' });
    this.actionsEl.style.pointerEvents = 'auto';
    this.boardBtn = this.actionButton('🛹', () => this.onBoard());
    this.actionsEl.append(this.boardBtn);

    this.all.push(left, right, this.ringsEl, this.huntEl, this.comboEl, this.actionsEl);
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
      background: GLASS, border: BORDER, borderRadius: '999px', padding: '6px 13px',
      boxShadow: SHADOW, color,
      font: `900 15px/1 'Trebuchet MS',system-ui`, whiteSpace: 'nowrap',
      fontVariantNumeric: 'tabular-nums',
      textShadow: '0 1.5px 0 rgba(8,12,22,.6)',
    } as CSSStyleDeclaration);
    el.textContent = text;
    return el;
  }

  private actionButton(emoji: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    Object.assign(b.style, {
      position: 'relative', width: '64px', height: '64px', borderRadius: '20px',
      border: BORDER, background: GLASS, color: '#fff', font: '29px/1 system-ui',
      cursor: 'pointer', boxShadow: SHADOW,
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
  private lastCoins = -1;
  setRun(s: RunStats): void {
    this.scoreEl.textContent = s.score.toLocaleString();
    this.multEl.textContent = `×${s.multiplier}`;
    if (s.multiplier !== this.lastMult) {
      this.lastMult = s.multiplier;
      this.multEl.style.animation = 'none';
      void this.multEl.offsetWidth;
      this.multEl.style.animation = 'hud-pulse .45s cubic-bezier(.34,1.6,.5,1)';
    }
    this.distEl.textContent = `${Math.floor(s.distance)} m`;
    if (s.time !== undefined) {
      this.timeEl.style.display = 'block';
      this.timeEl.textContent = `⏱ ${s.time}`;
      this.timeEl.style.color = s.time <= 10 ? '#ff6a5a' : '#ffd23f';
      this.timeEl.style.animation = s.time <= 10 ? 'hud-flash .8s ease-in-out infinite' : 'none';
    } else {
      this.timeEl.style.display = 'none';
    }
    if (s.coins !== this.lastCoins) {
      this.lastCoins = s.coins;
      this.coinsEl.style.animation = 'none';
      void this.coinsEl.offsetWidth;
      this.coinsEl.style.animation = 'hud-pulse .28s cubic-bezier(.34,1.7,.5,1)';
    }
    this.coinsEl.textContent = `🪙 ${s.coins}`;
    this.keysEl.textContent = `🗝️ ${s.keys}`;
    this.keysEl.style.display = s.keys > 0 ? 'block' : 'none';
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
        ? 'linear-gradient(180deg,#8ff0ff,#00c8f0 55%,#0090c0)'
        : 'linear-gradient(180deg,#2b3550,#141a2c)'};
        color:${got ? '#04202e' : 'rgba(255,255,255,.28)'};
        box-shadow:${got ? '0 2.5px 0 rgba(8,12,24,.9)' : '0 2px 0 rgba(8,12,24,.8)'}">${ch}</div>`;
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
    if (!on) {
      this.noteEl.style.display = 'none';
      this.noteBusy = false;
      this.noteText = '';
      this.queue.length = 0;
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
      position: 'fixed', top: '40%', left: '50%', color,
      font: `900 clamp(20px,6vw,28px)/1 'Trebuchet MS',system-ui`,
      webkitTextStroke: '2px rgba(10,14,26,.85)',
      textShadow: `0 3px 0 rgba(10,14,26,.6), 0 0 18px ${color}`,
      pointerEvents: 'none', zIndex: '70', animation: 'hud-popup 0.95s ease-out forwards',
    } as unknown as CSSStyleDeclaration);
    e.textContent = text;
    document.body.appendChild(e);
    setTimeout(() => e.remove(), 1000);
  }

  private bannerEl: HTMLDivElement | null = null;

  /** A big centred announcement. Only one at a time — a new one replaces it. */
  banner(title: string, subtitle = '', color = '#ffd23f'): void {
    HUD.ensureStyle('hud-banner',
      '@keyframes hud-banner{0%{opacity:0;transform:translate(-50%,-24px) scale(.9)}' +
      '14%,78%{opacity:1;transform:translate(-50%,0) scale(1)}' +
      '100%{opacity:0;transform:translate(-50%,-20px) scale(.96)}}');
    this.bannerEl?.remove();
    const e = document.createElement('div');
    this.bannerEl = e;
    Object.assign(e.style, {
      position: 'fixed', top: '27%', left: '50%', textAlign: 'center',
      width: 'min(420px, 92vw)',
      pointerEvents: 'none', zIndex: '72', animation: 'hud-banner 2.2s ease-in-out forwards',
    } as CSSStyleDeclaration);
    e.innerHTML =
      `<div style="font:900 clamp(28px,7vw,44px)/1 'Trebuchet MS',system-ui;color:${color};
        -webkit-text-stroke:2.5px rgba(10,14,26,.9);
        text-shadow:0 4px 0 rgba(10,14,26,.6), 0 10px 24px rgba(0,0,0,.7)">${title}</div>` +
      (subtitle ? `<div style="font:800 15px/1.5 system-ui;color:#fff;opacity:.92;margin-top:4px">${subtitle}</div>` : '');
    document.body.appendChild(e);
    setTimeout(() => {
      e.remove();
      if (this.bannerEl === e) this.bannerEl = null;
    }, 2250);
  }

  /**
   * **The single notification lane.**
   *
   * Every in-run message — mission complete, power-up picked up, letter found,
   * reward opened, control hint — goes through one slot pinned just under the
   * HUD, well clear of the lanes ahead and of the runner. Only one shows at a
   * time; anything raised while it is busy queues behind it, and a repeat of
   * the message already showing is dropped rather than stacking. That is what
   * stops the screen filling with overlapping cards mid-run.
   *
   * @param priority higher wins: an urgent note replaces whatever is showing.
   */
  notify(icon: string, text: string, color = UI_GREEN, priority = 0): void {
    if (this.noteText === text) return;                       // already saying it
    if (this.noteBusy) {
      if (priority > this.notePriority) {
        this.queue.length = 0;                                // urgent: cut in
        this.noteTimer = 0;
      } else {
        if (this.queue.length >= 3) this.queue.shift();       // never let it pile up
        if (!this.queue.some((q) => q.text === text)) this.queue.push({ icon, text, color, priority });
        return;
      }
    }
    this.showNote(icon, text, color, priority);
  }

  private showNote(icon: string, text: string, color: string, priority: number): void {
    this.noteBusy = true;
    this.noteText = text;
    this.notePriority = priority;
    this.noteTimer = 1.9;
    this.noteEl.style.borderColor = color;
    this.noteEl.style.boxShadow =
      `0 4px 0 rgba(8,12,24,.9), 0 8px 18px rgba(0,0,0,.5), 0 0 16px ${color}55`;
    this.noteEl.innerHTML =
      `<span style="font-size:17px;flex-shrink:0">${icon}</span>` +
      `<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${text}</span>`;
    this.noteEl.style.display = 'flex';
    this.noteEl.style.animation = 'none';
    void this.noteEl.offsetWidth;
    this.noteEl.style.animation = 'hud-note .22s cubic-bezier(.34,1.7,.5,1)';
  }

  /** Advance the notification slot. Called every frame by the game. */
  tick(dt: number): void {
    if (!this.noteBusy) return;
    this.noteTimer -= dt;
    if (this.noteTimer > 0) return;
    const next = this.queue.shift();
    if (next) {
      this.showNote(next.icon, next.text, next.color, next.priority);
    } else {
      this.noteBusy = false;
      this.noteText = '';
      this.notePriority = 0;
      this.noteEl.style.animation = 'hud-noteout .2s ease forwards';
      window.setTimeout(() => {
        if (!this.noteBusy) this.noteEl.style.display = 'none';
      }, 200);
    }
  }

  /** Legacy alias — everything funnels into {@link notify}. */
  toast(icon: string, text: string, color = UI_GREEN): void {
    this.notify(icon, text, color);
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

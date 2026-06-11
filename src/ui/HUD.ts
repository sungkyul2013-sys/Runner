/**
 * In-run HUD for Sunset Runner. Top-left shows Score / Level / (Challenge) Time
 * in glass pills; top-right shows Coins + a Pause button; centre-top shows the
 * coin-combo meter and slide-in level banners; bottom-left holds the consumable
 * item buttons (💣 / 🚀) with count badges; the power-up chips float top-right.
 * Pure DOM overlaying the WebGL canvas. The game-over / menu screens live in
 * ScreenManager.
 */
export interface RunStats {
  score: number;
  coins: number;
  distance: number;
  level: number;
  /** Remaining seconds in Challenge mode (undefined in Endless). */
  time?: number;
}

const GLASS = 'rgba(22,14,44,0.55)';
const BORDER = '1px solid rgba(255,210,180,0.30)';

export class HUD {
  private readonly scorePill: HTMLDivElement;
  private readonly levelPill: HTMLDivElement;
  private readonly timePill: HTMLDivElement;
  private readonly coinsEl: HTMLDivElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly powerupsEl: HTMLDivElement;
  private readonly comboEl: HTMLDivElement;
  private readonly itemsEl: HTMLDivElement;
  private readonly all: HTMLElement[] = [];

  private onPause: () => void = () => {};
  private onBomb: () => void = () => {};
  private onRocket: () => void = () => {};

  constructor() {
    // Top-left stat pills.
    const left = this.mk({ top: '14px', left: '14px', display: 'flex', gap: '8px', alignItems: 'flex-start' });
    this.scorePill = this.pill('SCORE', '0', '#fff2e0', '34px');
    this.levelPill = this.pill('LEVEL', '1', '#c9a8ff');
    this.timePill = this.pill('TIME', '60', '#ffd86b');
    this.timePill.style.display = 'none';
    left.append(this.scorePill, this.levelPill, this.timePill);

    // Top-right coins + pause.
    const right = this.mk({ top: '14px', right: '14px', display: 'flex', gap: '10px', alignItems: 'center' });
    right.style.pointerEvents = 'auto';
    this.coinsEl = document.createElement('div');
    Object.assign(this.coinsEl.style, {
      font: `800 22px/1 'Trebuchet MS',system-ui`, color: '#ffd86b',
      textShadow: '0 0 12px rgba(255,216,107,0.6)',
    } as CSSStyleDeclaration);
    this.coinsEl.innerHTML = '🪙 0';
    this.pauseBtn = document.createElement('button');
    Object.assign(this.pauseBtn.style, {
      width: '40px', height: '40px', borderRadius: '12px', border: BORDER,
      background: GLASS, color: '#fff', font: '18px/1 system-ui', cursor: 'pointer',
    } as CSSStyleDeclaration);
    this.pauseBtn.textContent = '⏸';
    this.pauseBtn.addEventListener('click', () => this.onPause());
    right.append(this.coinsEl, this.pauseBtn);

    // Power-up chips (below coins, top-right).
    this.powerupsEl = this.mk({ top: '64px', right: '14px', display: 'flex', gap: '8px' });

    // Combo meter (centre-top).
    this.comboEl = this.mk({
      top: '90px', left: '50%', transform: 'translateX(-50%)',
      font: `900 26px/1 'Trebuchet MS',system-ui`, color: '#ffd86b',
      textShadow: '0 2px 14px rgba(255,126,179,0.7)',
    });
    this.comboEl.style.display = 'none';

    // Consumable item buttons (bottom-left).
    this.itemsEl = this.mk({ bottom: '18px', left: '18px', display: 'flex', gap: '10px' });
    this.itemsEl.style.pointerEvents = 'auto';
    this.bombBtn = this.itemButton('💣', () => this.onBomb());
    this.rocketBtn = this.itemButton('🚀', () => this.onRocket());
    this.itemsEl.append(this.bombBtn, this.rocketBtn);

    this.all.push(left, right, this.powerupsEl, this.comboEl, this.itemsEl);
    this.setVisible(false);
  }

  private bombBtn: HTMLButtonElement;
  private rocketBtn: HTMLButtonElement;

  // ── Construction helpers ──────────────────────────────────────────────────
  private mk(style: Partial<CSSStyleDeclaration>): HTMLDivElement {
    const el = document.createElement('div');
    Object.assign(el.style, { position: 'fixed', pointerEvents: 'none', zIndex: '50', ...style } as CSSStyleDeclaration);
    document.body.appendChild(el);
    return el;
  }

  private pill(label: string, value: string, color: string, valueSize = '24px'): HTMLDivElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      background: GLASS, border: BORDER, borderRadius: '14px', padding: '6px 12px',
      backdropFilter: 'blur(6px)', textAlign: 'center', minWidth: '54px',
    } as CSSStyleDeclaration);
    el.innerHTML =
      `<div style="font:700 10px/1 system-ui;letter-spacing:2px;opacity:.7;color:#fff">${label}</div>` +
      `<div data-v style="font:800 ${valueSize}/1.2 'Trebuchet MS',system-ui;color:${color}">${value}</div>`;
    return el;
  }

  private setPill(el: HTMLElement, value: string): void {
    const v = el.querySelector('[data-v]');
    if (v) v.textContent = value;
  }

  private itemButton(emoji: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    Object.assign(b.style, {
      position: 'relative', width: '52px', height: '52px', borderRadius: '14px',
      border: BORDER, background: GLASS, color: '#fff', font: '24px/1 system-ui',
      cursor: 'pointer', backdropFilter: 'blur(6px)',
    } as CSSStyleDeclaration);
    b.textContent = emoji;
    b.addEventListener('click', onClick);
    const badge = document.createElement('span');
    badge.dataset.badge = '1';
    Object.assign(badge.style, {
      position: 'absolute', bottom: '-4px', right: '-4px', background: '#ffd86b',
      color: '#120a22', font: '700 11px/1 monospace', borderRadius: '8px', padding: '1px 5px',
    } as CSSStyleDeclaration);
    badge.textContent = '0';
    b.append(badge);
    return b;
  }

  // ── Wiring ──────────────────────────────────────────────────────────────
  bindControls(onPause: () => void, onBomb: () => void, onRocket: () => void): void {
    this.onPause = onPause;
    this.onBomb = onBomb;
    this.onRocket = onRocket;
  }

  get powerupContainer(): HTMLDivElement {
    return this.powerupsEl;
  }

  // ── Live updates ──────────────────────────────────────────────────────────
  setRun(s: RunStats): void {
    this.setPill(this.scorePill, `${s.score}`);
    this.setPill(this.levelPill, `${s.level}`);
    if (s.time !== undefined) {
      this.timePill.style.display = 'block';
      this.setPill(this.timePill, `${s.time}`);
    } else {
      this.timePill.style.display = 'none';
    }
    this.coinsEl.innerHTML = `🪙 ${s.coins}`;
  }

  /** Settings toggle: hide the combo meter entirely when false. */
  comboEnabled = true;

  setCombo(count: number): void {
    if (this.comboEnabled && count >= 5) {
      this.comboEl.style.display = 'block';
      this.comboEl.textContent = `x${count} COIN COMBO`;
    } else {
      this.comboEl.style.display = 'none';
    }
  }

  setItems(bomb: number, rocket: number): void {
    this.updateItem(this.bombBtn, bomb);
    this.updateItem(this.rocketBtn, rocket);
  }
  private updateItem(b: HTMLButtonElement, n: number): void {
    const badge = b.querySelector('[data-badge]') as HTMLElement;
    if (badge) badge.textContent = `${n}`;
    b.style.filter = n > 0 ? 'none' : 'grayscale(0.8) brightness(0.6)';
    b.disabled = n <= 0;
  }

  setVisible(on: boolean): void {
    for (const el of this.all) {
      // Combo starts hidden; everything else shows as flex when the run is live.
      el.style.display = on && el !== this.comboEl ? 'flex' : 'none';
    }
  }

  // ── Transient popups / banners ──────────────────────────────────────────────
  popup(text: string, color = '#fff2e0'): void {
    HUD.ensureStyle('nd-popup',
      '@keyframes nd-popup{0%{opacity:0;transform:translate(-50%,0) scale(.7)}' +
      '20%{opacity:1;transform:translate(-50%,-18px) scale(1)}' +
      '100%{opacity:0;transform:translate(-50%,-60px) scale(1)}}');
    const e = document.createElement('div');
    Object.assign(e.style, {
      position: 'fixed', top: '34%', left: '50%', color,
      font: `800 26px/1 'Trebuchet MS',system-ui`, textShadow: `0 0 14px ${color}`,
      pointerEvents: 'none', zIndex: '70', animation: 'nd-popup 0.9s ease-out forwards',
    } as CSSStyleDeclaration);
    e.textContent = text;
    document.body.appendChild(e);
    setTimeout(() => e.remove(), 950);
  }

  banner(title: string, subtitle = ''): void {
    HUD.ensureStyle('nd-banner',
      '@keyframes nd-banner{0%{opacity:0;transform:translate(-50%,-20px)}' +
      '15%,80%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-20px)}}');
    const e = document.createElement('div');
    Object.assign(e.style, {
      position: 'fixed', top: '20%', left: '50%', textAlign: 'center',
      pointerEvents: 'none', zIndex: '72', animation: 'nd-banner 2.2s ease-in-out forwards',
    } as CSSStyleDeclaration);
    e.innerHTML =
      `<div style="font:900 36px/1 'Trebuchet MS',system-ui;color:#ffd86b;text-shadow:0 2px 16px rgba(255,126,179,.7)">${title}</div>` +
      (subtitle ? `<div style="font:700 16px/1.4 system-ui;color:#fff;opacity:.9">${subtitle}</div>` : '');
    document.body.appendChild(e);
    setTimeout(() => e.remove(), 2250);
  }

  /** "3 · 2 · 1 · GO!" start countdown; calls `onGo` when it finishes. */
  countdown(onGo: () => void): void {
    HUD.ensureStyle('nd-count',
      '@keyframes nd-count{0%{opacity:0;transform:translate(-50%,-50%) scale(1.8)}' +
      '30%{opacity:1;transform:translate(-50%,-50%) scale(1)}' +
      '100%{opacity:0;transform:translate(-50%,-50%) scale(.7)}}');
    const steps = ['3', '2', '1', 'GO!'];
    let i = 0;
    const tick = () => {
      const e = document.createElement('div');
      const go = steps[i] === 'GO!';
      Object.assign(e.style, {
        position: 'fixed', top: '42%', left: '50%', zIndex: '90', pointerEvents: 'none',
        font: `900 ${go ? 96 : 120}px/1 'Trebuchet MS',system-ui`,
        color: go ? '#6bffb0' : '#ffd86b',
        textShadow: '0 4px 30px rgba(255,126,179,.8)',
        animation: 'nd-count 0.7s ease-out forwards',
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

  /** Compatibility no-op (game-over now lives in ScreenManager). */
  hideGameOver(): void {}

  private static styles = new Set<string>();
  private static ensureStyle(id: string, css: string): void {
    if (HUD.styles.has(id)) return;
    HUD.styles.add(id);
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }
}

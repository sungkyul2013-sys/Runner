/**
 * In-run HUD: live score (centre), coin count (top-left) and distance, plus a
 * container for power-up timer rings (filled by the PowerupSystem in Phase 4)
 * and a lightweight game-over overlay. The richer game-over / menu screens
 * arrive in Phase 5; this stays focused on the playing state. Pure DOM overlay.
 */
export interface RunStats {
  score: number;
  coins: number;
  distance: number;
  best?: number;
}

export class HUD {
  private readonly scoreEl: HTMLDivElement;
  private readonly coinsEl: HTMLDivElement;
  private readonly powerupsEl: HTMLDivElement;
  private readonly overlayEl: HTMLDivElement;

  constructor() {
    this.scoreEl = this.mk({
      top: '10px',
      left: '50%',
      transform: 'translateX(-50%)',
      font: '700 30px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace',
      color: '#e8f7ff',
      textShadow: '0 0 14px rgba(45,226,230,0.85)',
      textAlign: 'center',
    });
    this.scoreEl.innerHTML = `<div>0</div><div style="font-size:13px;opacity:0.7">0 m</div>`;

    this.coinsEl = this.mk({
      top: '14px',
      left: '16px',
      font: '700 22px/1 ui-monospace, monospace',
      color: '#ffd23f',
      textShadow: '0 0 12px rgba(255,210,63,0.8)',
    });
    this.coinsEl.textContent = '◉ 0';

    this.powerupsEl = this.mk({
      top: '14px',
      right: '16px',
      display: 'flex',
      gap: '8px',
    });

    this.overlayEl = document.createElement('div');
    Object.assign(this.overlayEl.style, {
      position: 'fixed',
      inset: '0',
      display: 'none',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px',
      background: 'rgba(5,6,12,0.74)',
      color: '#e8f7ff',
      font: '16px/1.5 system-ui, sans-serif',
      textAlign: 'center',
      zIndex: '100',
    } as CSSStyleDeclaration);
    document.body.appendChild(this.overlayEl);
  }

  /** Transient floating text (near-miss, combo, score pops). */
  popup(text: string, color = '#e8f7ff'): void {
    if (!HUD.popStyle) {
      HUD.popStyle = true;
      const s = document.createElement('style');
      s.textContent =
        '@keyframes nd-popup{0%{opacity:0;transform:translate(-50%,0) scale(.7)}' +
        '20%{opacity:1;transform:translate(-50%,-18px) scale(1)}' +
        '100%{opacity:0;transform:translate(-50%,-60px) scale(1)}}';
      document.head.appendChild(s);
    }
    const e = document.createElement('div');
    Object.assign(e.style, {
      position: 'fixed',
      top: '32%',
      left: '50%',
      color,
      font: '800 26px/1 system-ui, sans-serif',
      textShadow: `0 0 14px ${color}`,
      pointerEvents: 'none',
      zIndex: '70',
      animation: 'nd-popup 0.9s ease-out forwards',
    } as CSSStyleDeclaration);
    e.textContent = text;
    document.body.appendChild(e);
    setTimeout(() => e.remove(), 950);
  }

  private static popStyle = false;

  private mk(style: Partial<CSSStyleDeclaration>): HTMLDivElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '50',
      ...style,
    } as CSSStyleDeclaration);
    document.body.appendChild(el);
    return el;
  }

  /** Container the PowerupSystem renders its timer rings into. */
  get powerupContainer(): HTMLDivElement {
    return this.powerupsEl;
  }

  setRun(stats: RunStats): void {
    this.scoreEl.innerHTML =
      `<div>${stats.score}</div>` +
      `<div style="font-size:13px;opacity:0.7">${Math.floor(stats.distance)} m</div>`;
    this.coinsEl.textContent = `◉ ${stats.coins}`;
  }

  setVisible(on: boolean): void {
    const d = on ? 'block' : 'none';
    this.scoreEl.style.display = d;
    this.coinsEl.style.display = d;
    this.powerupsEl.style.display = on ? 'flex' : 'none';
  }

  showGameOver(stats: RunStats): void {
    const best = stats.best ?? 0;
    const isBest = stats.score >= best && stats.score > 0;
    this.overlayEl.innerHTML = `
      <div style="font:700 44px/1 system-ui,sans-serif;color:#ff3cac;text-shadow:0 0 20px rgba(255,60,172,0.7)">GAME OVER</div>
      <div style="font:700 30px/1 ui-monospace,monospace">${stats.score}</div>
      <div style="opacity:0.85">◉ ${stats.coins} &nbsp;·&nbsp; ${Math.floor(stats.distance)} m</div>
      <div style="opacity:0.7;font-size:14px">Best ${Math.max(best, stats.score)}${isBest ? ' &nbsp;🏆 NEW!' : ''}</div>
      <div style="margin-top:8px;opacity:0.85">Press <b>Space</b> / <b>Enter</b> or <b>tap</b> to run again</div>
    `;
    this.overlayEl.style.display = 'flex';
  }

  hideGameOver(): void {
    this.overlayEl.style.display = 'none';
  }
}

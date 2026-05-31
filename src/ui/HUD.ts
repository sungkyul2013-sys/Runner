/**
 * Minimal in-game HUD: a live distance readout and a game-over overlay with a
 * restart prompt. Deliberately lightweight — the full screen flow (menu, pause,
 * rich game-over) arrives in Phase 5. Pure DOM so it overlays the WebGL canvas.
 */
export class HUD {
  private readonly distanceEl: HTMLDivElement;
  private readonly overlayEl: HTMLDivElement;

  constructor() {
    this.distanceEl = document.createElement('div');
    Object.assign(this.distanceEl.style, {
      position: 'fixed',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      font: '600 22px/1 ui-monospace, SFMono-Regular, Menlo, monospace',
      color: '#e8f7ff',
      textShadow: '0 0 12px rgba(45,226,230,0.8)',
      pointerEvents: 'none',
      zIndex: '50',
    } as CSSStyleDeclaration);
    this.distanceEl.textContent = '0 m';
    document.body.appendChild(this.distanceEl);

    this.overlayEl = document.createElement('div');
    Object.assign(this.overlayEl.style, {
      position: 'fixed',
      inset: '0',
      display: 'none',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      background: 'rgba(5,6,12,0.72)',
      color: '#e8f7ff',
      font: '16px/1.5 system-ui, sans-serif',
      textAlign: 'center',
      zIndex: '100',
    } as CSSStyleDeclaration);
    document.body.appendChild(this.overlayEl);
  }

  setDistance(meters: number): void {
    this.distanceEl.textContent = `${Math.floor(meters)} m`;
  }

  showGameOver(meters: number): void {
    this.overlayEl.innerHTML = `
      <div style="font:700 40px/1 system-ui,sans-serif;color:#ff3cac;text-shadow:0 0 18px rgba(255,60,172,0.7)">GAME OVER</div>
      <div style="font:600 24px/1 ui-monospace,monospace">${Math.floor(meters)} m</div>
      <div style="opacity:0.85">Press <b>Space</b> / <b>Enter</b> or <b>tap</b> to run again</div>
    `;
    this.overlayEl.style.display = 'flex';
  }

  hideGameOver(): void {
    this.overlayEl.style.display = 'none';
  }
}

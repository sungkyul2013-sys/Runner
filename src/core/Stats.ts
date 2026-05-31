/**
 * Tiny, dependency-free FPS overlay for development. Renders a small panel in
 * the top-left showing a rolling average frame rate and frame time. Original
 * implementation (no external stats.js dependency).
 */
export class Stats {
  private readonly el: HTMLDivElement;
  private frames = 0;
  private acc = 0; // accumulated time since last refresh (seconds)
  private fps = 0;

  constructor() {
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed',
      top: '8px',
      left: '8px',
      padding: '4px 8px',
      font: '12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
      color: '#2de2e6',
      background: 'rgba(5, 6, 12, 0.6)',
      border: '1px solid rgba(45, 226, 230, 0.35)',
      borderRadius: '6px',
      pointerEvents: 'none',
      zIndex: '9999',
      whiteSpace: 'pre',
    } as CSSStyleDeclaration);
    this.el.textContent = 'FPS --';
    document.body.appendChild(this.el);
  }

  /** Call once per rendered frame with the frame delta time (seconds). */
  update(dt: number): void {
    this.frames++;
    this.acc += dt;
    // Refresh the readout ~4x per second to keep it legible.
    if (this.acc >= 0.25) {
      this.fps = this.frames / this.acc;
      const ms = (this.acc / this.frames) * 1000;
      this.el.textContent = `FPS ${this.fps.toFixed(0)}  ${ms.toFixed(1)}ms`;
      this.frames = 0;
      this.acc = 0;
    }
  }

  dispose(): void {
    this.el.remove();
  }
}

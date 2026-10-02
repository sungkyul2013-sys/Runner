// Suspension x-ray readout (서스펜션 스트로크): each corner's wheel travel from where it stood when the x-ray came on —
// a bar either side of the zero line (compression up, orange; rebound down, cyan) and millimetres.
import type { CornerTravel } from '../vehicles/SuspensionView';
import { t } from './i18n';

const RANGE = 0.06; // [m] full bar

export class SuspensionHud {
  readonly root = document.createElement('div');
  private readonly cells = new Map<string, { bar: HTMLElement; value: HTMLElement }>();
  private last = 0;

  constructor() {
    this.root.className = 'susp-hud';
    this.root.hidden = true;
    const title = document.createElement('div');
    title.className = 'susp-title';
    title.textContent = t('suspHud');
    const grid = document.createElement('div');
    grid.className = 'susp-grid';
    for (const corner of ['FL', 'FR', 'RL', 'RR']) {
      const cell = document.createElement('div');
      cell.className = 'susp-cell';
      const label = document.createElement('span');
      label.className = 'susp-label';
      label.textContent = corner;
      const track = document.createElement('div');
      track.className = 'susp-track';
      const bar = document.createElement('i');
      track.append(bar);
      const value = document.createElement('b');
      value.className = 'mono';
      cell.append(label, track, value);
      grid.append(cell);
      this.cells.set(corner, { bar, value });
    }
    const note = document.createElement('small');
    note.textContent = t('suspHudNote');
    this.root.append(title, grid, note);
    document.body.append(this.root);
  }

  set visible(on: boolean) {
    this.root.hidden = !on;
  }

  update(travel: CornerTravel[]): void {
    const now = performance.now();
    if (this.root.hidden || now - this.last < 60) return;
    this.last = now;
    for (const c of travel) {
      const cell = this.cells.get(c.corner);
      if (!cell) continue;
      const k = Math.max(-1, Math.min(1, c.travel / RANGE));
      cell.bar.style.height = `${(Math.abs(k) * 50).toFixed(1)}%`;
      cell.bar.style.bottom = k >= 0 ? '50%' : `${(50 - Math.abs(k) * 50).toFixed(1)}%`;
      cell.bar.className = k >= 0 ? 'bump' : 'rebound';
      const mm = Math.round(c.travel * 1000);
      cell.value.textContent = `${mm > 0 ? '+' : mm < 0 ? '−' : ''}${Math.abs(mm)} mm`;
    }
  }

  dispose(): void {
    this.root.remove();
  }
}

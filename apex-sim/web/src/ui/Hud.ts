// Performance / physics readout (§20 콘솔·프로파일러 오버레이, §5.3 에너지 계측).
import type { FrameStats } from '../physics/PhysicsClient';
import { t, type StringKey } from './i18n';
import { formatEnergy, formatInt, formatMs, formatPercent, formatSeconds } from './units';

const ROWS: (StringKey | '-')[] = [
  'fps', 'physicsStep', 'rtf', 'simTime', '-', 'bodies', 'contacts', 'ccd', '-',
  'kinetic', 'potential', 'plastic', 'dissipated', 'balance', '-', 'memory', 'drawCalls', 'backend',
];

export interface RenderStats {
  frameMs: number;
  drawCalls: number;
  backend: string;
  threads: number;
}

export class Hud {
  readonly root: HTMLElement;
  private cells = new Map<StringKey, HTMLElement>();

  constructor() {
    this.root = document.createElement('dl');
    this.root.className = 'hud';
    this.root.setAttribute('aria-live', 'off');
    for (const key of ROWS) {
      if (key === '-') {
        const sep = document.createElement('div');
        sep.className = 'sep';
        this.root.append(sep);
        continue;
      }
      const dt = document.createElement('dt');
      dt.textContent = t(key);
      const dd = document.createElement('dd');
      dd.textContent = '—';
      this.cells.set(key, dd);
      this.root.append(dt, dd);
    }
  }

  update(s: FrameStats | null, r: RenderStats): void {
    this.set('fps', `${formatMs(r.frameMs, 1)} · ${(1000 / Math.max(r.frameMs, 1e-3)).toFixed(0)} fps`);
    this.set('drawCalls', formatInt(r.drawCalls));
    this.set('backend', `${r.backend} / ${r.threads}`);
    if (!s) return;
    this.set('physicsStep', `${formatMs(s.stepMs, 3)} / 0.5 ms`, s.stepMs > 0.5 ? 'warn' : '');
    const rtfText = s.paused ? '—' : `${s.rtf.toFixed(2)} × ${s.timeScale < 1 ? `(1/${Math.round(1 / s.timeScale)})` : ''}`;
    this.set('rtf', s.overloaded ? `${rtfText} ${t('overloaded')}` : rtfText, s.overloaded ? 'bad' : '');
    this.set('simTime', `${formatSeconds(s.simTime)} · #${formatInt(s.stepIndex)}`);
    this.set('bodies', `${s.bodies} / ${formatInt(s.nodes)} / ${formatInt(s.beams)}`);
    this.set('contacts', `${formatInt(s.staticContacts)} / ${formatInt(s.bodyContacts)}`);
    this.set('ccd', formatInt(s.ccdClamps));
    const e = s.energy;
    this.set('kinetic', formatEnergy(e.kinetic));
    this.set('potential', formatEnergy(e.gravity + e.beam + e.contact));
    this.set('plastic', formatEnergy(e.plastic));
    this.set('dissipated', formatEnergy(e.beamDamping + e.contactDamping + e.friction + e.plastic + e.fracture + e.ccd));
    const scale = Math.max(Math.abs(e.external), 1);
    const err = Math.abs(e.balance) / scale;
    this.set('balance', formatPercent(err), err < 0.02 ? 'good' : err < 0.05 ? 'warn' : 'bad');
    this.set('memory', `${s.wasmMemoryMB.toFixed(0)} MB`);
  }

  private set(key: StringKey, text: string, cls = ''): void {
    const c = this.cells.get(key);
    if (!c) return;
    if (c.textContent !== text) c.textContent = text;
    if (c.className !== cls) c.className = cls;
  }
}

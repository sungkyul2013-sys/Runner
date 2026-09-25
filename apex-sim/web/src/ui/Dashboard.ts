// Driving HUD (§18.4 계기): the speed and the revs on one round gauge, and (§4.4) warning lights for the faults the
// damage links report. Failed electrics make the cluster flicker. Numbers use the tabular mono face.
import { FAULT, TYRE, type VehicleState } from '../physics/telemetry';
import { t, type StringKey } from './i18n';
import type { HudPreset, SpeedUnit } from './settings';

// Warning lights: fault bits → label (shown only while the fault is present).
const WARNINGS: Array<[number, StringKey]> = [
  [FAULT.engineFailed | FAULT.seized, 'warnEngine'],
  [FAULT.overheat, 'warnTemp'],
  [FAULT.coolantLeak, 'warnCoolant'],
  [FAULT.oilPressure | FAULT.oilLeak, 'warnOil'],
  [FAULT.outOfFuel | FAULT.fuelLeak, 'warnFuel'],
  [FAULT.brakes, 'warnBrakes'],
  [FAULT.steering, 'warnSteering'],
  [FAULT.drive, 'warnDrive'],
  [FAULT.gearbox, 'warnGearbox'],
  [FAULT.electrical, 'warnBattery'],
];

// Wheel order of the vehicle description (the generator's: front left, front right, rear left, rear right).
const WHEEL_NAMES = ['FL', 'FR', 'RL', 'RR'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

export interface DashboardFlags {
  manual: boolean;
  abs: boolean;
  tcs: boolean;
  camera: string;
}

const SVG = 'http://www.w3.org/2000/svg';
const SWEEP = 270; // degrees of the rev arc, from bottom-left round the top to bottom-right
const R = 44; // arc radius in the 100 × 100 view box
const ARC = (2 * Math.PI * R * SWEEP) / 360;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** Driving cluster (§18.4, simplified for phones): one round gauge — the speed in large digits and the revs as an arc
 *  with its redline and a shift glow. Fault lights appear under it only while a fault is present. */
export class Dashboard {
  readonly root = el('div', 'dash');
  private speed = el('b', 'dash-speed', '0');
  private unitLabel = el('small', 'dash-unit', 'km/h');
  private rpmText = el('span', 'dash-rpm-text', '0');
  private fill: SVGCircleElement;
  private redline: number;
  private warnings = el('div', 'dash-warn');
  private warnLamps = WARNINGS.map(([, key]) => el('span', 'lamp warn', t(key)));
  private tyreLamp = el('span', 'lamp warn', t('warnTyre')); // §6 tyre pressure (TPMS)
  private flicker = 0;
  private unit: SpeedUnit = 'kmh';
  private readonly scale: number;

  constructor(redlineRpm: number) {
    this.redline = redlineRpm;
    this.scale = Math.ceil((redlineRpm * 1.12) / 1000) * 1000;
    const g = svg('svg', { viewBox: '0 0 100 100', class: 'dash-arc', 'aria-hidden': 'true' });
    const rot = 90 + (360 - SWEEP) / 2; // start angle of the arc (SVG: 0° = +x, clockwise)
    const ring = (cls: string, dash: string, offset = 0) =>
      svg('circle', { cx: 50, cy: 50, r: R, class: cls, 'stroke-dasharray': dash, 'stroke-dashoffset': offset, transform: `rotate(${rot} 50 50)` });
    const redFrac = redlineRpm / this.scale;
    g.append(ring('arc-bg', `${ARC} 1000`), ring('arc-red', `${ARC * (1 - redFrac)} 1000`, -ARC * redFrac));
    this.fill = ring('arc-fill', `0 1000`);
    g.append(this.fill);
    // Ticks every 1000 rpm, numbers every 2000.
    for (let k = 0; k <= this.scale / 1000; k++) {
      const a = ((rot + (SWEEP * k * 1000) / this.scale) * Math.PI) / 180;
      const major = k % 2 === 0;
      const r0 = major ? 36.5 : 38.5;
      g.append(svg('line', { x1: 50 + Math.cos(a) * r0, y1: 50 + Math.sin(a) * r0, x2: 50 + Math.cos(a) * 40.5, y2: 50 + Math.sin(a) * 40.5, class: k * 1000 >= redlineRpm ? 'tick red' : 'tick' }));
      if (major) {
        const tx = svg('text', { x: 50 + Math.cos(a) * 30.5, y: 50 + Math.sin(a) * 30.5 + 2.2, class: 'tick-num' });
        tx.textContent = String(k);
        g.append(tx);
      }
    }
    const face = el('div', 'dash-face');
    face.append(this.speed, this.unitLabel, this.rpmText);
    const dial = el('div', 'dash-dial');
    dial.append(g, face);
    this.warnings.append(...this.warnLamps, this.tyreLamp);
    this.root.append(dial, this.warnings);
    this.root.hidden = true;
  }

  /** §18.4 HUD presets: none hides the cluster, minimal keeps only the speed digits, racing and engineer show the
   *  gauge (engineer adds the stats panel — the app shows that). */
  setPreset(p: HudPreset): void {
    this.root.classList.toggle('hud-minimal', p === 'minimal');
    this.root.classList.toggle('hud-off', p === 'none');
  }

  setUnit(u: SpeedUnit): void {
    this.unit = u;
    this.unitLabel.textContent = u === 'mph' ? 'mph' : 'km/h';
  }

  update(v: VehicleState | null, _f?: DashboardFlags, _dt = 1 / 60): void {
    if (!v) return;
    const kmh = Math.abs(v.speed) * (this.unit === 'mph' ? 2.23694 : 3.6);
    this.speed.textContent = kmh < 0.5 ? '0' : kmh.toFixed(0);
    const frac = Math.min(Math.max(v.engineRpm / this.scale, 0), 1);
    this.fill.setAttribute('stroke-dasharray', `${(ARC * frac).toFixed(2)} 1000`);
    const shift = v.engineRpm > this.redline * 0.93;
    this.root.classList.toggle('shift', shift);
    this.rpmText.textContent = `${(v.engineRpm / 1000).toFixed(1)}k rpm`;
    WARNINGS.forEach(([bits], i) => (this.warnLamps[i].hidden = (v.faults & bits) === 0));
    // Tyre pressure: any wheel under 80 % of its pressure, or off its rim; the lamp names the wheels.
    const low = v.wheels.map((w, i) => ((w.tyreFlags & TYRE.shredded) || w.pressure < 0.8 * w.nominalPressure ? i : -1)).filter((i) => i >= 0);
    this.tyreLamp.hidden = low.length === 0;
    if (low.length) this.tyreLamp.textContent = `${t('warnTyre')} ${low.map((i) => `${WHEEL_NAMES[i] ?? i} ${v.wheels[i].pressure.toFixed(1)}`).join(' · ')}`;
    this.warnings.hidden = this.warnLamps.every((l) => l.hidden) && this.tyreLamp.hidden;
    // Failed electrics: the cluster flickers.
    if (v.faults & FAULT.electrical) {
      this.flicker = (this.flicker + 1) % 997;
      this.root.style.opacity = (this.flicker * 7919) % 13 < 3 ? '0.25' : '1';
    } else {
      this.root.style.opacity = '';
    }
  }
}

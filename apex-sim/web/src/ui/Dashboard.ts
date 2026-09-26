// Driving HUD (§18.4 계기). One instrument at the bottom centre that changes shape with the screen: a half dial in
// landscape (the rev arc sweeping over the speed digits, pedal bars along its flat edge) and, in portrait, a round
// dial that rises from the bottom edge. Gear, shift light, TCS / ABS / manual tags, and (§4.4) warning lights only
// while a fault is present; failed electrics make it flicker. Numbers use the tabular mono face.
import './gauge.css';
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
  esc?: boolean;
  /** Real-time factor of the physics (§21.2: shown when the simulation runs slower than real time). */
  rtf?: number;
  camera: string;
}

const SVG = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** A dial geometry: centre, radius and the swept angles (SVG degrees: 0 = +x, clockwise). */
interface Dial {
  box: string;
  cx: number;
  cy: number;
  r: number;
  from: number;
  sweep: number;
}
// Landscape: a half dial over a flat base. Portrait: 240° of a circle (its foot hidden under the screen edge).
const HALF: Dial = { box: '0 0 320 176', cx: 160, cy: 164, r: 142, from: 180, sweep: 180 };
const ROUND: Dial = { box: '0 0 200 200', cx: 100, cy: 100, r: 86, from: 150, sweep: 240 };

const rad = (deg: number) => (deg * Math.PI) / 180;
function arcPath(d: Dial, a0: number, a1: number, r = d.r): string {
  const p = (a: number) => `${(d.cx + Math.cos(rad(a)) * r).toFixed(2)} ${(d.cy + Math.sin(rad(a)) * r).toFixed(2)}`;
  return `M ${p(a0)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p(a1)}`;
}

/** One dial face: track, redline zone, rev fill, ticks and numbers. */
class Face {
  readonly svg: SVGSVGElement;
  private readonly fill: SVGPathElement;
  private readonly len: number;

  constructor(d: Dial, redline: number, scale: number, cls: string) {
    this.svg = svg('svg', { viewBox: d.box, class: `dash-svg ${cls}`, 'aria-hidden': 'true' });
    const end = d.from + d.sweep;
    const redFrom = d.from + d.sweep * (redline / scale);
    this.svg.append(
      svg('path', { d: arcPath(d, d.from, end), class: 'arc-bg' }),
      svg('path', { d: arcPath(d, redFrom, end), class: 'arc-red' }),
    );
    this.fill = svg('path', { d: arcPath(d, d.from, end), class: 'arc-fill' });
    this.len = rad(d.sweep) * d.r;
    this.fill.setAttribute('stroke-dasharray', `0 ${this.len + 10}`);
    this.svg.append(this.fill);
    for (let k = 0; k <= scale / 1000; k++) {
      const a = rad(d.from + (d.sweep * k * 1000) / scale);
      const major = k % 2 === 0 || scale <= 8000;
      const r0 = d.r - (major ? 16 : 12), r1 = d.r - 8;
      this.svg.append(svg('line', { x1: d.cx + Math.cos(a) * r0, y1: d.cy + Math.sin(a) * r0, x2: d.cx + Math.cos(a) * r1, y2: d.cy + Math.sin(a) * r1, class: k * 1000 >= redline ? 'tick red' : 'tick' }));
      if (major) {
        const tr = d.r - 27;
        const tx = svg('text', { x: d.cx + Math.cos(a) * tr, y: d.cy + Math.sin(a) * tr + 4, class: 'tick-num' });
        tx.textContent = String(k);
        this.svg.append(tx);
      }
    }
  }

  set(frac: number): void {
    this.fill.setAttribute('stroke-dasharray', `${(this.len * Math.min(Math.max(frac, 0), 1)).toFixed(1)} ${this.len + 10}`);
  }
}

/** Driving cluster (§18.4): the dial changes shape with the orientation (CSS shows one of the two faces). */
export class Dashboard {
  readonly root = el('div', 'dash');
  private readonly dial = el('div', 'dash-dial');
  private speed = el('b', 'dash-speed', '0');
  private unitLabel = el('small', 'dash-unit', 'km/h');
  private gear = el('span', 'dash-gear', 'N');
  private rpmText = el('span', 'dash-rpm-text', '0');
  private tags = el('div', 'dash-tags');
  private tagTcs = el('i', '', 'TCS');
  private tagAbs = el('i', '', 'ABS');
  private tagMan = el('i', '', 'M');
  private tagEsc = el('i', '', 'ESC');
  private rtfBadge = el('span', 'dash-rtf');
  private rtfShown = 1;
  private lit = -1;
  private pedals = el('div', 'dash-pedals');
  /** Shift lights: green, amber, red from 72 % of the redline; all flash at the change point. */
  private lights = el('div', 'dash-lights');
  private brakeBar = el('i', 'dash-brake');
  private throttleBar = el('i', 'dash-throttle');
  private faces: Face[] = [];
  private redline = 7000;
  private scale = 8000;
  private warnings = el('div', 'dash-warn');
  private warnLamps = WARNINGS.map(([, key]) => el('span', 'lamp warn', t(key)));
  private tyreLamp = el('span', 'lamp warn', t('warnTyre')); // §6 tyre pressure (TPMS)
  private flicker = 0;
  private unit: SpeedUnit = 'kmh';
  /** §18.4 G-meter (friction circle, ±1.5 g) and the steering input, beside the dial (racing / engineer). */
  private readonly aux = el('div', 'dash-aux');
  private readonly gDot = el('i', 'dash-gdot');
  private readonly gText = el('span', 'dash-gtext', '0.00 g');
  private readonly steerMark = el('i', 'dash-steer-mark');
  private gx = 0;
  private gz = 0;

  constructor(redlineRpm: number) {
    const face = el('div', 'dash-face');
    face.append(this.speed, this.unitLabel);
    this.tags.append(this.tagMan, this.tagTcs, this.tagAbs, this.tagEsc);
    this.pedals.append(this.brakeBar, this.throttleBar);
    for (let i = 0; i < 10; i++) this.lights.append(el('i', i < 4 ? 'g' : i < 7 ? 'y' : 'r'));
    this.dial.append(face, this.lights, this.gear, this.rpmText, this.tags, this.pedals);
    this.warnings.append(...this.warnLamps, this.tyreLamp);
    this.rtfBadge.hidden = true;
    const gm = el('div', 'dash-gmeter');
    gm.append(el('i', 'dash-gring'), this.gDot);
    const steer = el('div', 'dash-steer');
    steer.append(this.steerMark);
    this.aux.append(gm, this.gText, steer);
    this.aux.setAttribute('aria-hidden', 'true');
    const row = el('div', 'dash-row');
    row.append(this.aux, this.dial);
    this.root.append(this.warnings, this.rtfBadge, row);
    this.root.hidden = true;
    this.setRedline(redlineRpm);
  }

  /** Rebuilds the dial for a car with this redline [rpm]. */
  setRedline(redlineRpm: number): void {
    this.redline = redlineRpm;
    this.scale = Math.ceil((redlineRpm * 1.12) / 1000) * 1000;
    for (const f of this.faces) f.svg.remove();
    this.faces = [new Face(HALF, redlineRpm, this.scale, 'half'), new Face(ROUND, redlineRpm, this.scale, 'round')];
    this.dial.prepend(...this.faces.map((f) => f.svg));
  }

  /** §18.4 HUD presets: none hides the cluster, minimal keeps only the speed digits and the gear, racing and
   *  engineer show the dial (engineer adds the stats panel — the app shows that). */
  setPreset(p: HudPreset): void {
    this.root.classList.toggle('hud-minimal', p === 'minimal');
    this.root.classList.toggle('hud-off', p === 'none');
  }

  setUnit(u: SpeedUnit): void {
    this.unit = u;
    this.unitLabel.textContent = u === 'mph' ? 'mph' : 'km/h';
  }

  update(v: VehicleState | null, f?: DashboardFlags, _dt = 1 / 60): void {
    if (!v) return;
    const kmh = Math.abs(v.speed) * (this.unit === 'mph' ? 2.23694 : 3.6);
    this.speed.textContent = kmh < 0.5 ? '0' : kmh.toFixed(0);
    const frac = v.engineRpm / this.scale;
    for (const face of this.faces) face.set(frac);
    this.root.classList.toggle('shift', v.engineRpm > this.redline * 0.93);
    const lit = Math.round(Math.min(Math.max((v.engineRpm / this.redline - 0.72) / 0.24, 0), 1) * 10);
    if (lit !== this.lit) {
      this.lit = lit;
      this.lights.querySelectorAll('i').forEach((l, i) => l.classList.toggle('on', i < lit));
    }
    this.rpmText.textContent = `${(v.engineRpm / 1000).toFixed(1)}k`;
    this.gear.textContent = v.gear < 0 ? 'R' : v.gear === 0 ? 'N' : String(v.gear);
    this.gear.classList.toggle('shifting', v.shifting);
    // G-meter: smoothed (τ ≈ 0.08 s); the dot shows the load felt — right in a left turn, up under braking.
    const k = Math.min(_dt / 0.08, 1);
    this.gx += (-v.accelLat / 9.81 - this.gx) * k;
    this.gz += (v.accelLong / 9.81 - this.gz) * k;
    const gm = Math.hypot(this.gx, this.gz), clip = Math.min(1, 1.5 / Math.max(gm, 1e-6));
    this.gDot.style.left = `${(50 + this.gx * clip * 33.3).toFixed(1)}%`;
    this.gDot.style.top = `${(50 + this.gz * clip * 33.3).toFixed(1)}%`;
    this.gText.textContent = `${gm.toFixed(2)} g`;
    this.steerMark.style.left = `${(50 - v.steer * 50).toFixed(1)}%`;
    this.throttleBar.style.setProperty('--v', v.throttle.toFixed(2));
    this.brakeBar.style.setProperty('--v', v.brake.toFixed(2));
    if (f) {
      this.tagTcs.className = f.tcs ? (v.tcs ? 'on act' : 'on') : '';
      this.tagAbs.className = f.abs ? 'on' : '';
      this.tagMan.className = f.manual ? 'on' : '';
      this.tagEsc.className = f.esc ? (v.esc ? 'on act' : 'on') : '';
      // §21.2: the physics running slower than real time is shown, not hidden (the car then looks slow).
      if (f.rtf !== undefined) {
        this.rtfShown += (f.rtf - this.rtfShown) * 0.05;
        const slow = this.rtfShown < 0.93;
        this.rtfBadge.hidden = !slow;
        if (slow) this.rtfBadge.textContent = `${t('rtfBadge')} ${Math.round(this.rtfShown * 100)} %`;
      }
    }
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

// Driving HUD (§18.4 계기): speed, gear, tachometer, pedals, driver aids, and (§4.4) coolant temperature, oil
// pressure and fuel with warning lights for the faults the damage links report. Failed electrics make the cluster
// flicker. Numbers use the tabular mono face.
import { FAULT, gearLabel, TYRE, type VehicleState } from '../physics/telemetry';
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

export class Dashboard {
  readonly root = el('div', 'dash');
  private speed = el('b', 'dash-speed', '0');
  private gear = el('b', 'dash-gear', 'N');
  private rpmFill = el('i');
  private rpmText = el('span', 'dash-rpm-text', '0');
  private throttle = el('i');
  private brake = el('i');
  private lamps = { tcs: el('span', 'lamp', 'TCS'), abs: el('span', 'lamp', 'ABS'), mode: el('span', 'lamp on', 'AUTO'), cam: el('span', 'lamp on', '') };
  private redline: number;
  private temp = el('span', 'gauge', '');
  private oil = el('span', 'gauge', '');
  private fuel = el('span', 'gauge', '');
  private warnings = el('div', 'dash-warn');
  private warnLamps = WARNINGS.map(([, key]) => el('span', 'lamp warn', t(key)));
  private tyreLamp = el('span', 'lamp warn', t('warnTyre')); // §6 tyre pressure (TPMS)
  private flicker = 0;
  private unit: SpeedUnit = 'kmh';
  private unitLabel = el('small', '', 'km/h');
  // §18.4 G meter: lateral and longitudinal acceleration of the chassis, a dot in a ring (1.5 g at the edge).
  private gDot = el('i');
  private gText = el('span', 'dash-g-text', '0.0 g');
  private lastVel: [number, number, number] | null = null;
  private gFilt: [number, number] = [0, 0];

  constructor(redlineRpm: number) {
    this.redline = redlineRpm;
    const rpm = el('div', 'dash-rpm');
    const bar = el('div', 'bar');
    const zone = el('em');
    zone.style.left = `${(redlineRpm / (redlineRpm * 1.1)) * 100}%`;
    bar.append(this.rpmFill, zone);
    rpm.append(bar, this.rpmText);
    const pedals = el('div', 'dash-pedals');
    const tb = el('div', 'pedal throttle');
    tb.append(this.throttle);
    const bb = el('div', 'pedal brake');
    bb.append(this.brake);
    pedals.append(bb, tb);
    const main = el('div', 'dash-main');
    const speedBox = el('div', 'dash-speedbox');
    speedBox.append(this.speed, this.unitLabel);
    const g = el('div', 'dash-g');
    const ring = el('div', 'dash-g-ring');
    ring.append(this.gDot);
    g.append(ring, this.gText);
    main.append(pedals, speedBox, this.gear, g);
    const lamps = el('div', 'dash-lamps');
    lamps.append(this.lamps.mode, this.lamps.tcs, this.lamps.abs, this.lamps.cam);
    const gauges = el('div', 'dash-gauges');
    gauges.append(this.temp, this.oil, this.fuel);
    this.warnings.append(...this.warnLamps, this.tyreLamp);
    this.root.append(rpm, main, gauges, this.warnings, lamps, el('div', 'dash-help', t('driveHelp')));
    this.root.hidden = true;
  }

  /** §18.4 HUD presets: none hides the cluster, minimal keeps speed, gear and revs, racing adds pedals, aids, fluids
   *  and the G meter; engineer is racing plus the stats panel (the app shows that). */
  setPreset(p: HudPreset): void {
    this.root.classList.toggle('hud-minimal', p === 'minimal');
    this.root.classList.toggle('hud-off', p === 'none');
  }

  setUnit(u: SpeedUnit): void {
    this.unit = u;
    this.unitLabel.textContent = u === 'mph' ? 'mph' : 'km/h';
  }

  update(v: VehicleState | null, f: DashboardFlags, dt = 1 / 60): void {
    if (!v) return;
    const kmh = Math.abs(v.speed) * (this.unit === 'mph' ? 2.23694 : 3.6);
    this.speed.textContent = kmh < 0.5 ? '0' : kmh.toFixed(0);
    // G meter from the change of the chassis velocity (heading × forward speed: the turn gives the lateral part) over
    // the frame, in the car's frame, filtered (frames jitter).
    const vv: [number, number, number] = [v.forward[0] * v.speed, v.forward[1] * v.speed, v.forward[2] * v.speed];
    if (this.lastVel && dt > 1e-4) {
      const a = [(vv[0] - this.lastVel[0]) / dt, (vv[1] - this.lastVel[1]) / dt, (vv[2] - this.lastVel[2]) / dt];
      const lon = (a[0] * v.forward[0] + a[1] * v.forward[1] + a[2] * v.forward[2]) / 9.81;
      const lat = (a[0] * v.left[0] + a[1] * v.left[1] + a[2] * v.left[2]) / 9.81;
      const k = 1 - Math.exp(-dt * 8);
      this.gFilt = [this.gFilt[0] + (lat - this.gFilt[0]) * k, this.gFilt[1] + (lon - this.gFilt[1]) * k];
      const clamp = (x: number) => Math.max(-1.5, Math.min(1.5, x));
      this.gDot.style.transform = `translate(${(-clamp(this.gFilt[0]) / 1.5) * 26}px, ${(-clamp(this.gFilt[1]) / 1.5) * 26}px)`;
      this.gText.textContent = `${Math.hypot(this.gFilt[0], this.gFilt[1]).toFixed(1)} g`;
    }
    this.lastVel = vv;
    this.gear.textContent = gearLabel(v.gear, f.manual);
    const scale = this.redline * 1.1;
    this.rpmFill.style.width = `${Math.min(100, (v.engineRpm / scale) * 100)}%`;
    this.rpmFill.className = v.engineRpm > this.redline * 0.97 ? 'hot' : '';
    this.rpmText.textContent = `${Math.round(v.engineRpm)} rpm`;
    this.throttle.style.height = `${v.throttle * 100}%`;
    this.brake.style.height = `${v.brake * 100}%`;
    this.lamps.mode.textContent = f.manual ? 'MAN' : 'AUTO';
    this.lamps.tcs.className = `lamp ${f.tcs ? (v.tcs ? 'act' : 'on') : 'off'}`;
    const absActive = v.wheels.some((w) => w.abs);
    this.lamps.abs.className = `lamp ${f.abs ? (absActive ? 'act' : 'on') : 'off'}`;
    this.lamps.cam.textContent = f.camera;
    // §4.4 fluids and warnings
    this.temp.textContent = `${t('gaugeTemp')} ${Math.round(v.coolantC)}°C`;
    this.temp.className = `gauge ${v.faults & FAULT.overheat ? 'bad' : ''}`;
    this.oil.textContent = `${t('gaugeOil')} ${v.oilBar.toFixed(1)} bar`;
    this.oil.className = `gauge ${v.faults & FAULT.oilPressure ? 'bad' : ''}`;
    this.fuel.textContent = `${t('gaugeFuel')} ${v.fuelL.toFixed(1)} L`;
    this.fuel.className = `gauge ${v.faults & (FAULT.fuelLeak | FAULT.outOfFuel) ? 'bad' : ''}`;
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

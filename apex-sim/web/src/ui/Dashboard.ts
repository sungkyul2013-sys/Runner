// Driving HUD (§18.4 계기): speed, gear, tachometer, pedals, driver aids. Numbers use the tabular mono face.
import { gearLabel, type VehicleState } from '../physics/telemetry';
import { t } from './i18n';

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
    speedBox.append(this.speed, el('small', '', 'km/h'));
    main.append(pedals, speedBox, this.gear);
    const lamps = el('div', 'dash-lamps');
    lamps.append(this.lamps.mode, this.lamps.tcs, this.lamps.abs, this.lamps.cam);
    this.root.append(rpm, main, lamps, el('div', 'dash-help', t('driveHelp')));
    this.root.hidden = true;
  }

  update(v: VehicleState | null, f: DashboardFlags): void {
    if (!v) return;
    const kmh = Math.abs(v.speed) * 3.6;
    this.speed.textContent = kmh < 0.5 ? '0' : kmh.toFixed(0);
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
  }
}

// Crash lab controls (M2 launch tool): scenario, cars, speeds, geometry, launch, slow motion, the collision event
// log, the wheels' alignment and tyres (§4.4, §6) and the energy / momentum graphs.
import { DRIVE_VEHICLES, type VehiclePreset } from '../app/presets';
import { t, tl } from '../ui/i18n';
import { TYRE } from '../physics/telemetry';
import type { WheelRow } from './CrashLab';
import type { CollisionRow } from './events';
import { CRASH_PRESETS, SPEED_PRESETS, type CrashSpec } from './scenario';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...children);
  return e;
}

function numberInput(value: number, min: number, max: number, step: number, label: string): HTMLInputElement {
  return el('input', { type: 'number', value: String(value), min: String(min), max: String(max), step: String(step), ariaLabel: label });
}

export interface CrashPanelActions {
  launch(spec: CrashSpec, a: VehiclePreset, b: VehiclePreset): void;
}

/** The crash lab's controls for the app shell's sheet (§18.3-9 시나리오 빌더 → 실행 → 리포트): ready-made tests as
 *  tiles, their details, and the report (event log, wheels, energy and momentum graphs); the launch is the screen's
 *  one core action, a floating button (§18.5). */
export class CrashPanel {
  readonly scenario: HTMLElement;
  readonly details: HTMLElement;
  readonly report: HTMLElement;
  readonly fab: HTMLButtonElement;
  private readonly logBody: HTMLTableSectionElement;
  private readonly wheelBody: HTMLTableSectionElement;
  private readonly spec: CrashSpec;
  /** Launches with the current settings (the R key, &go=1). */
  readonly launch: () => void;

  constructor(actions: CrashPanelActions, initial: Partial<CrashSpec> = {}, graphs: HTMLElement[] = [], vehicleA?: string, vehicleB?: string) {
    this.spec = { kind: 'fullWall', speedA: 56, speedB: 0, angle: 0, offset: 0, overlap: 0.4, ...initial };
    const car = (label: string) => {
      const s = el('select', { ariaLabel: label });
      for (const v of DRIVE_VEHICLES) s.append(el('option', { value: v.id }, tl(v.label)));
      return s;
    };
    const carA = car(t('crashCarA')), carB = car(t('crashCarB'));
    if (vehicleA) carA.value = vehicleA;
    if (vehicleB) carB.value = vehicleB;
    const speedA = numberInput(this.spec.speedA, 1, 350, 1, t('crashSpeedA'));
    const chips = SPEED_PRESETS.map((kmh) => {
      const b = el('button', { className: 'chip' }, String(kmh));
      b.onclick = () => {
        speedA.value = String(kmh);
        sync();
      };
      return b;
    });
    const overlap = numberInput(Math.round(this.spec.overlap * 100), 5, 100, 5, t('crashOverlap'));
    const speedB = numberInput(this.spec.speedB, 0, 350, 1, t('crashSpeedB'));
    const angle = numberInput(this.spec.angle, -180, 180, 5, t('crashAngle'));
    const offset = numberInput(this.spec.offset, -3, 3, 0.1, t('crashOffset'));
    const row = (label: string, ...controls: Node[]) => el('label', { className: 'field' }, el('span', {}, label), ...controls);
    const wallOnly = row(t('crashOverlap'), overlap, el('small', {}, '%'));
    const pairOnly = el('div', { className: 'sheet-section' },
      row(t('crashCarB'), carB), row(t('crashSpeedB'), speedB, el('small', {}, 'km/h')), row(t('crashAngle'), angle, el('small', {}, '°')),
      row(t('crashOffset'), offset, el('small', {}, 'm')));
    const tiles = CRASH_PRESETS.map((p) => {
      const b = el('button', { className: 'tile' }, el('b', {}, tl(p.label)), el('small', {}, tl(p.note)));
      b.onclick = () => {
        Object.assign(this.spec, { speedB: 0, angle: 0, offset: 0, overlap: 0.4 }, p.spec);
        speedA.value = String(this.spec.speedA);
        speedB.value = String(this.spec.speedB);
        angle.value = String(this.spec.angle);
        offset.value = String(this.spec.offset);
        overlap.value = String(Math.round(this.spec.overlap * 100));
        preset = p.id;
        sync();
      };
      return [p, b] as const;
    });
    let preset = CRASH_PRESETS.find((p) => p.spec.kind === this.spec.kind && (p.spec.speedA ?? 0) === this.spec.speedA)?.id ?? '';
    const sync = () => {
      this.spec.speedA = Number(speedA.value) || 0;
      this.spec.speedB = Number(speedB.value) || 0;
      this.spec.angle = Number(angle.value) || 0;
      this.spec.offset = Number(offset.value) || 0;
      this.spec.overlap = (Number(overlap.value) || 40) / 100;
      wallOnly.hidden = this.spec.kind !== 'offsetWall';
      pairOnly.hidden = this.spec.kind !== 'carToCar';
      chips.forEach((c) => c.classList.toggle('active', Number(c.textContent) === this.spec.speedA));
      for (const [p, b] of tiles) b.classList.toggle('active', p.id === preset);
    };
    for (const input of [speedA, overlap, speedB, angle, offset]) input.onchange = () => {
      preset = '';
      sync();
    };
    sync();
    const vehicle = (s: HTMLSelectElement) => DRIVE_VEHICLES.find((v) => v.id === s.value) ?? DRIVE_VEHICLES[0];
    this.fab = el('button', { className: 'fab primary' }, t('crashLaunch'));
    this.launch = () => {
      sync();
      actions.launch({ ...this.spec }, vehicle(carA), vehicle(carB));
    };
    this.fab.onclick = this.launch;

    this.logBody = el('tbody');
    const head = el('thead', {}, el('tr', {}, ...[t('logTime'), t('logWhat'), t('logWhere'), t('logSpeed'), t('logForce'), t('logEnergy'), t('logG')].map((h) => el('th', {}, h))));
    const table = el('div', { className: 'tablewrap' }, el('table', { className: 'eventlog' }, head, this.logBody));
    this.wheelBody = el('tbody');
    const wheelHead = el('thead', {}, el('tr', {}, ...[t('wheelCar'), t('wheelWheel'), t('wheelCamber'), t('wheelToe'), t('wheelTyre')].map((h) => el('th', {}, h))));
    const wheels = el('div', { className: 'tablewrap' }, el('table', { className: 'eventlog wheels' }, wheelHead, this.wheelBody));

    this.scenario = el('div', { className: 'grid2' }, ...tiles.map(([, b]) => b));
    this.details = el('div', { className: 'sheet-section' }, row(t('crashCarA'), carA), row(t('crashSpeedA'), speedA, el('small', {}, 'km/h')),
      el('div', { className: 'chips' }, ...chips), wallOnly, pairOnly);
    this.report = el('div', { className: 'sheet-section' }, el('h3', {}, t('crashLog')), table, el('h3', {}, t('wheelTitle')), wheels, ...graphs);
    this.setLog([]);
    this.setWheels([]);
  }

  setLog(rows: CollisionRow[]): void {
    this.logBody.replaceChildren();
    if (rows.length === 0) {
      this.logBody.append(el('tr', {}, el('td', { colSpan: 7, className: 'empty' }, t('logEmpty'))));
      return;
    }
    for (const r of rows) {
      const what = r.cars.length > 1 ? r.cars.map((c) => c.split(' · ')[0]).join('↔') : `${r.cars[0].split(' · ')[0]}→${t('logWorld')}`;
      const tr = el('tr', { className: r.active ? 'live' : '' },
        el('td', {}, r.time.toFixed(2)),
        el('td', {}, what),
        el('td', {}, `${r.position[0].toFixed(0)}, ${r.position[2].toFixed(0)}`),
        el('td', {}, (r.relativeSpeed * 3.6).toFixed(1)),
        el('td', {}, (r.peakForce / 1e3).toFixed(0)),
        el('td', {}, (r.absorbed / 1e3).toFixed(1)),
        el('td', {}, r.peakG.map((g) => g.toFixed(0)).join(' / ')));
      this.logBody.append(tr);
    }
  }

  /** Camber and toe per wheel (highlighted once more than 1° off the design alignment) and the tyre's state. */
  setWheels(rows: WheelRow[]): void {
    this.wheelBody.replaceChildren();
    if (rows.length === 0) {
      this.wheelBody.append(el('tr', {}, el('td', { colSpan: 5, className: 'empty' }, t('wheelEmpty'))));
      return;
    }
    const sign = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}°`;
    for (const r of rows) {
      const tyre = r.flags & TYRE.shredded ? t('tyreShredded') : r.flags & TYRE.flat ? t('tyreFlat') : `${r.pressure.toFixed(1)} bar`;
      const damaged = r.bent || (r.flags & (TYRE.puncture | TYRE.blowout | TYRE.flat | TYRE.shredded)) !== 0;
      this.wheelBody.append(el('tr', { className: damaged ? 'live' : '' },
        el('td', {}, r.car), el('td', {}, r.wheel), el('td', {}, sign(r.camber)), el('td', {}, sign(r.toe)), el('td', {}, tyre)));
    }
  }
}

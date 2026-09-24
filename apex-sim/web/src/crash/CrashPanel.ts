// Crash lab controls (M2 launch tool): scenario, cars, speeds, geometry, launch, slow motion, the collision event
// log, the wheels' alignment and tyres (§4.4, §6) and the energy / momentum graphs.
import { DRIVE_VEHICLES, type VehiclePreset } from '../app/presets';
import { t, tl } from '../ui/i18n';
import { TIME_SCALES } from '../ui/SandboxPanel';
import { TYRE } from '../physics/telemetry';
import type { WheelRow } from './CrashLab';
import type { CollisionRow } from './events';
import { SPEED_PRESETS, type CrashKind, type CrashSpec } from './scenario';

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
  setTimeScale(scale: number): void;
  setXray(on: boolean): void;
  setFollow(on: boolean): void;
  back(): void;
}

export class CrashPanel {
  readonly root: HTMLElement;
  readonly graphs: HTMLElement;
  private readonly logBody: HTMLTableSectionElement;
  private readonly wheelBody: HTMLTableSectionElement;
  private readonly spec: CrashSpec;
  /** Launches with the current settings (the R key, &go=1). */
  readonly launch: () => void;

  constructor(actions: CrashPanelActions, initial: Partial<CrashSpec> = {}, graphs: HTMLElement[] = [], vehicleA?: string, vehicleB?: string) {
    this.spec = { kind: 'fullWall', speedA: 64, speedB: 0, angle: 0, offset: 0, overlap: 0.4, ...initial };
    const kind = el('select', { ariaLabel: t('crashScenario') });
    for (const [id, label] of [['fullWall', t('crashFullWall')], ['offsetWall', t('crashOffsetWall')], ['carToCar', t('crashCarToCar')]] as const) {
      kind.append(el('option', { value: id }, label));
    }
    kind.value = this.spec.kind;
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
    const angle = numberInput(this.spec.angle, -90, 90, 5, t('crashAngle'));
    const offset = numberInput(this.spec.offset, -3, 3, 0.1, t('crashOffset'));
    const row = (label: string, ...controls: Node[]) => el('label', { className: 'field' }, el('span', {}, label), ...controls);
    const wallOnly = row(t('crashOverlap'), overlap, el('small', {}, '%'));
    const pairOnly = el('div', { className: 'section' },
      row(t('crashCarB'), carB), row(t('crashSpeedB'), speedB, el('small', {}, 'km/h')), row(t('crashAngle'), angle, el('small', {}, '°')),
      row(t('crashOffset'), offset, el('small', {}, 'm')));
    const sync = () => {
      this.spec.kind = kind.value as CrashKind;
      this.spec.speedA = Number(speedA.value) || 0;
      this.spec.speedB = Number(speedB.value) || 0;
      this.spec.angle = Number(angle.value) || 0;
      this.spec.offset = Number(offset.value) || 0;
      this.spec.overlap = (Number(overlap.value) || 40) / 100;
      wallOnly.hidden = this.spec.kind !== 'offsetWall';
      pairOnly.hidden = this.spec.kind !== 'carToCar';
      chips.forEach((c) => c.classList.toggle('active', Number(c.textContent) === this.spec.speedA));
    };
    for (const input of [kind, speedA, overlap, speedB, angle, offset]) input.onchange = sync;
    sync();
    const vehicle = (s: HTMLSelectElement) => DRIVE_VEHICLES.find((v) => v.id === s.value) ?? DRIVE_VEHICLES[0];
    const launch = el('button', { className: 'primary' }, t('crashLaunch'));
    this.launch = () => {
      sync();
      actions.launch({ ...this.spec }, vehicle(carA), vehicle(carB));
    };
    launch.onclick = this.launch;
    const slow = el('select', { ariaLabel: t('time') });
    for (const s of TIME_SCALES) slow.append(el('option', { value: String(s) }, s === 1 ? t('crashRealtime') : `1/${Math.round(1 / s)}`));
    slow.onchange = () => actions.setTimeScale(Number(slow.value));
    const xray = el('button', {}, t('crashXray'));
    let xrayOn = false;
    xray.onclick = () => {
      xrayOn = !xrayOn;
      xray.classList.toggle('active', xrayOn);
      actions.setXray(xrayOn);
    };
    const follow = el('button', { className: 'active' }, t('crashFollow'));
    follow.onclick = () => actions.setFollow(follow.classList.toggle('active'));
    const back = el('button', {}, t('backToSandbox'));
    back.onclick = () => actions.back();

    this.logBody = el('tbody');
    const head = el('thead', {}, el('tr', {}, ...[t('logTime'), t('logWhat'), t('logWhere'), t('logSpeed'), t('logForce'), t('logEnergy'), t('logG')].map((h) => el('th', {}, h))));
    const table = el('table', { className: 'eventlog' }, head, this.logBody);
    this.wheelBody = el('tbody');
    const wheelHead = el('thead', {}, el('tr', {}, ...[t('wheelCar'), t('wheelWheel'), t('wheelCamber'), t('wheelToe'), t('wheelTyre')].map((h) => el('th', {}, h))));
    const wheels = el('table', { className: 'eventlog wheels' }, wheelHead, this.wheelBody);

    this.root = el('aside', { className: 'panel crashpanel' },
      el('div', { className: 'brand' }, el('b', {}, 'APEX_SIM'), el('span', {}, t('crashTitle'))),
      el('div', { className: 'section' }, el('h2', {}, t('crashScenario')), kind, row(t('crashCarA'), carA),
        row(t('crashSpeedA'), speedA, el('small', {}, 'km/h')), el('div', { className: 'chips' }, ...chips), wallOnly),
      pairOnly,
      el('div', { className: 'row controls' }, launch, slow, xray, follow, back),
      el('div', { className: 'section' }, el('h2', {}, t('crashLog')), table),
      el('div', { className: 'section' }, el('h2', {}, t('wheelTitle')), wheels));
    this.graphs = el('div', { className: 'graphs' }, ...graphs);
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

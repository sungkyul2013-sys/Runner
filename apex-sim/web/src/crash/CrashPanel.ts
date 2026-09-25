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
  /** A new pick: the cars wait at their marks. */
  stage?(spec: CrashSpec, a: VehiclePreset, b: VehiclePreset): void;
}

// Scenario pictograms (top view, side view for the rollover and the drop): car A in the accent colour, a parked
// car B grey, barriers light.
const A = 'var(--accent)', B = '#8a93a3', W = '#cfd5dd';
const car = (x: number, y: number, w: number, h: number, fill = A) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}"/>`;
const arrow = (x1: number, y1: number, x2: number, y2: number) => {
  const a = Math.atan2(y2 - y1, x2 - x1), l = 4;
  const p = (da: number) => `${(x2 - l * Math.cos(a + da)).toFixed(1)},${(y2 - l * Math.sin(a + da)).toFixed(1)}`;
  return `<path d="M${x1} ${y1}L${x2} ${y2}M${p(0.6)}L${x2} ${y2}L${p(-0.6)}" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
};
const wall = (x: number, y: number, w: number, h: number) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="${W}"/>`;
const PICTOGRAMS: Record<string, string> = {
  frontal: arrow(2, 20, 12, 20) + car(14, 12, 26, 16) + wall(44, 3, 5, 34),
  offset: arrow(2, 20, 12, 20) + car(14, 12, 26, 16) + wall(44, 3, 5, 15.4),
  smallOverlap: arrow(2, 20, 12, 20) + car(14, 12, 26, 16) + wall(44, 3, 5, 13),
  headOn: car(4, 13, 22, 14) + car(38, 13, 22, 14, B) + arrow(27, 8, 33, 8) + arrow(37, 32, 31, 32),
  side: car(20, 4, 28, 13, B) + car(27, 22, 13, 16) + arrow(33.5, 40, 33.5, 39),
  pole: car(10, 6, 14, 28) + `<circle cx="44" cy="20" r="4.5" fill="${W}"/>` + arrow(27, 20, 36, 20),
  rear: car(4, 13, 22, 14) + car(36, 13, 22, 14, B) + arrow(8, 7, 20, 7),
  rollover: `<path d="M2 35H62" stroke="${W}" stroke-width="2"/><path d="M28 35L44 35L44 27Z" fill="${W}"/><g transform="rotate(-24 34 18)">${car(22, 12, 26, 9)}</g>`,
  drop: `<path d="M2 36H62" stroke="${W}" stroke-width="2"/>${car(18, 4, 28, 9)}` + arrow(32, 17, 32, 31),
  highSpeed: `<path d="M1 14H9M3 20H11M1 26H9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>` + car(14, 12, 26, 16) + wall(44, 3, 5, 34),
};

function pictogram(id: string): HTMLElement {
  const i = el('i', { className: 'tile-pic', ariaHidden: 'true' });
  i.innerHTML = `<svg viewBox="0 0 64 40" width="64" height="40">${PICTOGRAMS[id] ?? ''}</svg>`;
  return i;
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
  /** Places the cars at their marks, at rest. */
  readonly stage: () => void;
  /** The result card (after the main impact of a launch). */
  readonly result = el('div', { className: 'crash-result', hidden: true });
  private armed = false;
  private presetLabel = '';
  private wheels: WheelRow[] = [];
  private resultTimer = 0;

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
      const b = el('button', { className: 'tile crash-tile' }, pictogram(p.id), el('b', {}, tl(p.label)), el('small', {}, tl(p.note)));
      b.onclick = () => {
        Object.assign(this.spec, { speedB: 0, angle: 0, offset: 0, overlap: 0.4 }, p.spec);
        speedA.value = String(this.spec.speedA);
        speedB.value = String(this.spec.speedB);
        angle.value = String(this.spec.angle);
        offset.value = String(this.spec.offset);
        overlap.value = String(Math.round(this.spec.overlap * 100));
        preset = p.id;
        sync();
        stage();
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
      this.hideResult();
      this.armed = true;
      this.presetLabel = tl((CRASH_PRESETS.find((p) => p.id === preset) ?? { label: { ko: t('crashCustom'), en: t('crashCustom') } }).label);
      actions.launch({ ...this.spec }, vehicle(carA), vehicle(carB));
    };
    this.fab.onclick = this.launch;
    const stage = () => {
      this.hideResult();
      this.armed = false;
      actions.stage?.({ ...this.spec }, vehicle(carA), vehicle(carB));
    };
    this.stage = stage;
    carA.onchange = carB.onchange = stage;

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
    // The first impact of a launch, once over, gets the result card (the strongest finished one).
    const done = rows.filter((r) => !r.active);
    if (this.armed && done.length && !this.resultTimer) {
      this.resultTimer = window.setTimeout(() => {
        this.resultTimer = 0;
        if (!this.armed) return;
        this.armed = false;
        this.showResult(done.reduce((a, b) => (b.absorbed > a.absorbed ? b : a)));
      }, 700);
    }
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
    this.wheels = rows;
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

  private hideResult(): void {
    clearTimeout(this.resultTimer);
    this.resultTimer = 0;
    this.result.hidden = true;
  }

  /** The result card: impact speed, peak deceleration, peak force, absorbed energy (all measured), the damaged
   *  wheels, and relaunch / close. */
  private showResult(r: CollisionRow): void {
    const stats: Array<[string, number, (x: number) => string]> = [
      [t('resSpeed'), r.relativeSpeed * 3.6, (x) => `${x.toFixed(1)}<small>km/h</small>`],
      [t('resG'), Math.max(...r.peakG), (x) => `${x.toFixed(0)}<small>g</small>`],
      [t('resForce'), r.peakForce / 1e3, (x) => `${x.toFixed(0)}<small>kN</small>`],
      [t('resEnergy'), r.absorbed / 1e3, (x) => `${x.toFixed(1)}<small>kJ</small>`],
    ];
    this.result.hidden = false;
    const grid = el('div', { className: 'cr-stats' });
    for (const [label, value, fmt] of stats) {
      const b = el('b');
      const cell = el('div', {}, b, el('span', {}, label));
      grid.append(cell);
      const t0 = performance.now();
      const tick = () => {
        const f = Math.min(1, (performance.now() - t0) / 800);
        b.innerHTML = fmt(value * (1 - Math.pow(1 - f, 3)));
        if (f < 1) requestAnimationFrame(tick);
      };
      tick();
    }
    const bad = this.wheels.filter((w) => w.bent || (w.flags & (TYRE.puncture | TYRE.blowout | TYRE.flat | TYRE.shredded)) !== 0);
    const what = r.cars.length > 1 ? r.cars.map((c) => c.split(' · ')[0]).join(' ↔ ') : `${r.cars[0].split(' · ')[1] ?? r.cars[0]} → ${t('logWorld')}`;
    const again = el('button', { className: 'primary' }, t('resAgain'));
    again.onclick = () => this.launch();
    const close = el('button', { className: 'icon-btn', ariaLabel: t('close') }, '✕');
    close.onclick = () => this.hideResult();
    this.result.replaceChildren(
      el('div', { className: 'cr-head' }, el('div', {}, el('small', {}, t('resTitle')), el('b', {}, this.presetLabel)), close),
      el('div', { className: 'cr-what' }, what),
      grid,
      el('div', { className: 'cr-note' }, bad.length ? `${t('resWheels')} ${bad.length}` + ' · ' + bad.map((w) => `${w.car} ${w.wheel}`).join(', ') : t('resWheelsOk')),
      el('div', { className: 'row' }, again),
    );
    this.result.hidden = false;
    this.result.classList.remove('in');
    void this.result.offsetWidth;
    this.result.classList.add('in');
  }
}

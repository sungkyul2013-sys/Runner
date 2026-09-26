// M0 sandbox control panel (debug UI; the product UI follows the M5 style guide).
import { DRIVE_VEHICLES, SCENES, SPAWNS, type SpawnPreset } from '../app/presets';
import { t, tl } from './i18n';

export interface PanelActions {
  loadScene(id: string, bodies?: number): void;
  spawn(preset: SpawnPreset): void;
  togglePause(): void;
  step(steps: number): void;
  setTimeScale(scale: number): void;
  setShowNodes(on: boolean): void;
  setShowBeams(on: boolean): void;
  drive(vehicleId: string): void;
  crash(vehicleId: string): void;
}

export const TIME_SCALES = [1, 0.5, 0.2, 0.1, 0.05, 0.01] as const; // §20: 슬로모션 1/2 ~ 1/100

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...children);
  return e;
}

export class SandboxPanel {
  readonly root: HTMLElement;
  private pauseButton: HTMLButtonElement;
  private sceneSelect: HTMLSelectElement;
  private speedSelect: HTMLSelectElement;

  constructor(actions: PanelActions) {
    this.sceneSelect = el('select', { ariaLabel: t('scene') });
    for (const s of SCENES) this.sceneSelect.append(el('option', { value: s.id }, tl(s.label)));
    this.sceneSelect.onchange = () => {
      const s = SCENES.find((x) => x.id === this.sceneSelect.value)!;
      actions.loadScene(s.id, s.bodies);
    };

    const spawnButtons = SPAWNS.map((p) => {
      const b = el('button', { className: 'spawn' }, el('span', {}, tl(p.label)), el('kbd', {}, p.key));
      b.onclick = () => actions.spawn(p);
      return b;
    });

    this.pauseButton = el('button', { className: 'primary' }, t('pause'));
    this.pauseButton.onclick = () => actions.togglePause();
    const stepButton = el('button', {}, t('step'));
    stepButton.onclick = () => actions.step(1);
    const resetButton = el('button', {}, t('reset'));
    resetButton.onclick = () => this.sceneSelect.onchange?.(new Event('change'));
    this.speedSelect = el('select', { ariaLabel: 'time scale' });
    for (const s of TIME_SCALES) this.speedSelect.append(el('option', { value: String(s) }, s === 1 ? '1×' : `1/${Math.round(1 / s)}×`));
    this.speedSelect.onchange = () => actions.setTimeScale(Number(this.speedSelect.value));

    const nodesToggle = el('button', { className: 'active' }, t('nodes'));
    nodesToggle.onclick = () => {
      nodesToggle.classList.toggle('active');
      actions.setShowNodes(nodesToggle.classList.contains('active'));
    };
    const beamsToggle = el('button', { className: 'active' }, t('beams'));
    beamsToggle.onclick = () => {
      beamsToggle.classList.toggle('active');
      actions.setShowBeams(beamsToggle.classList.contains('active'));
    };

    const vehicleSelect = el('select', { ariaLabel: t('drive') });
    for (const v of DRIVE_VEHICLES) vehicleSelect.append(el('option', { value: v.id }, tl(v.label)));
    const driveButton = el('button', { className: 'primary' }, t('startDrive'));
    driveButton.onclick = () => actions.drive(vehicleSelect.value);
    const crashButton = el('button', {}, t('startCrash'));
    crashButton.onclick = () => actions.crash(vehicleSelect.value);

    this.root = el(
      'aside',
      { className: 'panel' },
      el('div', { className: 'brand' }, el('b', {}, 'APEX_SIM'), el('span', {}, t('subtitle'))),
      el('div', { className: 'section' }, el('h2', {}, t('drive')), vehicleSelect, el('div', { className: 'row' }, driveButton, crashButton)),
      el('div', { className: 'section' }, el('h2', {}, t('scene')), this.sceneSelect),
      el('div', { className: 'section' }, el('h2', {}, t('spawn')), ...spawnButtons),
      el('div', { className: 'section' }, el('h2', {}, t('time')), el('div', { className: 'row' }, this.pauseButton, stepButton, resetButton), this.speedSelect),
      el('div', { className: 'section' }, el('h2', {}, t('view')), el('div', { className: 'row' }, nodesToggle, beamsToggle)),
    );
  }

  setPaused(paused: boolean): void {
    this.pauseButton.textContent = paused ? t('resume') : t('pause');
  }

  setScene(id: string): void {
    this.sceneSelect.value = id;
  }

  setTimeScale(scale: number): void {
    this.speedSelect.value = String(scale);
  }
}

// Time control (every mode): play / pause, the time scale as a free slider (0.01× … 2×, logarithmic) with preset
// stops, and single steps while paused. Space pauses, [ and ] step the scale. Every change is announced by a toast.
import { notify, tipOf } from './feedback';
import { t } from './i18n';
import { icon } from './icons';

export interface TimeHost {
  isPaused(): boolean;
  setPaused(paused: boolean): void;
  setTimeScale(scale: number): void;
  /** Single steps (paused): advances the physics by `steps` fixed steps. */
  step?(steps: number): void;
}

export const TIME_MIN = 0.01;
export const TIME_MAX = 2;
const STOPS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2];

/** Slider position 0 … 1 ↔ scale (logarithmic, so slow motion gets most of the travel). */
export const scaleAt = (u: number) => Math.exp(Math.log(TIME_MIN) + u * (Math.log(TIME_MAX) - Math.log(TIME_MIN)));
export const sliderAt = (s: number) => (Math.log(s) - Math.log(TIME_MIN)) / (Math.log(TIME_MAX) - Math.log(TIME_MIN));

/** Scale → a short label: "1×", "0.25×", "1/100". */
export function scaleLabel(s: number): string {
  if (s >= 0.995 && s <= 1.005) return '1×';
  if (s < 0.1) return `1/${Math.round(1 / s)}`;
  return `${s >= 1 ? s.toFixed(s % 1 ? 1 : 0) : s.toFixed(2).replace(/0$/, '')}×`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  e.append(...children);
  return e;
}

export class TimeControl {
  readonly root = el('div', 'timectl');
  private readonly playBtn = el('button', 'tc2-play');
  private readonly scaleBtn = el('button', 'tc2-scale mono');
  /** The scale popover (the phone UI lifts it out of the capsule to span the screen). */
  readonly pop = el('div', 'tc2-pop');
  private readonly range = el('input', 'tc2-range') as HTMLInputElement;
  private readonly stepRow = el('div', 'tc2-steps');
  private scale = 1;

  constructor(private readonly host: TimeHost) {
    tipOf(this.playBtn, `${t('timePlayPause')}\n${t('timePlayPauseTip')}`, 'Space');
    tipOf(this.scaleBtn, `${t('timeScale')}\n${t('timeScaleTip')}`, '[ ]');
    this.playBtn.onclick = () => this.togglePause();
    this.scaleBtn.onclick = (e) => {
      e.stopPropagation();
      this.pop.hidden = !this.pop.hidden;
    };
    this.range.type = 'range';
    this.range.min = '0';
    this.range.max = '1';
    this.range.step = '0.001';
    this.range.value = String(sliderAt(1));
    this.range.oninput = () => this.setScale(snap(scaleAt(Number(this.range.value))));
    const chips = el('div', 'tc2-chips', ...STOPS.map((s) => {
      const b = el('button', 'chip', scaleLabel(s));
      b.onclick = () => this.setScale(s);
      return b;
    }));
    const step1 = el('button', 'chip', icon('step'), el('span', '', t('timeStep1')));
    step1.onclick = () => this.step(1);
    const step100 = el('button', 'chip', icon('step'), el('span', '', t('timeStep100')));
    step100.onclick = () => this.step(100);
    tipOf(step1, `${t('timeStep1')}\n${t('timeStepTip')}`, '.');
    this.stepRow.append(step1, step100);
    this.stepRow.hidden = !host.step;
    this.pop.append(el('div', 'tc2-pop-h', el('span', '', t('timeScale')), el('small', '', t('timeScaleRange'))), this.range, chips, this.stepRow);
    this.pop.hidden = true;
    this.root.append(this.playBtn, this.scaleBtn, this.pop);
    document.addEventListener('pointerdown', (e) => {
      if (!this.root.contains(e.target as Node) && !this.pop.contains(e.target as Node)) this.pop.hidden = true;
    });
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '[' || e.key === ']') {
        const i = STOPS.findIndex((s) => s >= this.scale - 1e-6);
        const j = Math.min(Math.max((i < 0 ? STOPS.length - 1 : i) + (e.key === ']' ? 1 : -1), 0), STOPS.length - 1);
        this.setScale(STOPS[j]);
      } else if (e.key === '.' && this.host.step && this.host.isPaused()) this.step(1);
    });
    this.sync();
  }

  togglePause(): void {
    const next = !this.host.isPaused();
    this.host.setPaused(next);
    this.sync();
    notify(next ? t('timePaused') : t('timeResumed'), '', { icon: next ? 'pause' : 'play', key: 'time-pause' });
  }

  setScale(s: number, quiet = false): void {
    this.scale = Math.min(Math.max(s, TIME_MIN), TIME_MAX);
    this.host.setTimeScale(this.scale);
    this.range.value = String(sliderAt(this.scale));
    this.sync();
    if (!quiet) notify(`${t('timeScale')} ${scaleLabel(this.scale)}`, '', { icon: 'timer', key: 'time-scale' });
  }

  get timeScale(): number {
    return this.scale;
  }

  private step(n: number): void {
    if (!this.host.step) return;
    if (!this.host.isPaused()) this.host.setPaused(true);
    this.host.step(n);
    this.sync();
  }

  /** Re-reads the paused state (another control may have changed it). */
  sync(): void {
    const paused = this.host.isPaused();
    this.playBtn.replaceChildren(icon(paused ? 'play' : 'pause'));
    this.playBtn.ariaLabel = paused ? t('timeResume') : t('timePause');
    this.root.classList.toggle('paused', paused);
    this.scaleBtn.textContent = scaleLabel(this.scale);
    this.root.classList.toggle('slow', this.scale < 0.99);
    this.root.classList.toggle('fast', this.scale > 1.01);
    for (const b of this.pop.querySelectorAll<HTMLButtonElement>('.tc2-chips .chip')) b.classList.toggle('active', b.textContent === scaleLabel(this.scale));
  }
}

/** Snaps to a preset stop when the slider is within ≈ 10 % of it (easy to land on 1× again). */
function snap(s: number): number {
  for (const stop of STOPS) if (Math.abs(Math.log(s / stop)) < 0.018 * Math.log(TIME_MAX / TIME_MIN)) return stop;
  return Number(s.toPrecision(2));
}

// Loading screen (§18.3-16): progress, the current stage, a tip, and the shader compile step.
import { brandmark } from './brand';
import { t, type StringKey } from './i18n';

const TIPS: StringKey[] = ['tip1', 'tip2', 'tip3', 'tip4', 'tip5', 'tip6'];

export class LoadingScreen {
  readonly root = document.createElement('div');
  private readonly bar = document.createElement('i');
  private readonly stage = document.createElement('small');

  constructor(title: string, subtitle: string) {
    this.root.className = 'loading-screen';
    const brand = brandmark('ls-brand', 'div');
    const h = document.createElement('h2');
    h.textContent = title;
    const sub = document.createElement('p');
    sub.textContent = subtitle;
    const track = document.createElement('div');
    track.className = 'ls-track';
    track.append(this.bar);
    const tip = document.createElement('p');
    tip.className = 'ls-tip';
    tip.textContent = `${t('tipLabel')} · ${t(TIPS[Math.floor(Math.random() * TIPS.length)])}`;
    this.root.append(brand, h, sub, track, this.stage, tip);
    document.body.append(this.root);
  }

  progress(fraction: number, stage: string): void {
    this.bar.style.width = `${Math.round(Math.min(Math.max(fraction, 0), 1) * 100)}%`;
    this.stage.textContent = stage;
  }

  done(): void {
    this.root.classList.add('out');
    setTimeout(() => this.root.remove(), 400);
  }
}

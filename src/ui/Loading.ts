import { NEON } from './uikit';

/**
 * Boot loading screen with a progress bar. The game's assets are procedural
 * (no downloads), so this animates a brief, polished warm-up then fades out to
 * reveal the menu. {@link done} can be called early once the first frame draws.
 */
export class Loading {
  private readonly root: HTMLDivElement;
  private readonly bar: HTMLDivElement;
  private pct = 0;
  private raf = 0;

  constructor() {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed', inset: '0', zIndex: '200',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px',
      background: 'radial-gradient(ellipse at 50% 40%, #141a36, #05060c)',
      transition: 'opacity .5s ease',
    } as CSSStyleDeclaration);

    const title = document.createElement('div');
    Object.assign(title.style, {
      font: '900 64px/1 system-ui,sans-serif', letterSpacing: '2px',
      background: `linear-gradient(95deg, ${NEON.cyan}, ${NEON.pink})`,
      webkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
    } as CSSStyleDeclaration);
    title.textContent = 'NEONDASH';

    const track = document.createElement('div');
    Object.assign(track.style, {
      width: 'min(320px,70vw)', height: '8px', borderRadius: '5px',
      background: 'rgba(255,255,255,.12)', overflow: 'hidden',
    } as CSSStyleDeclaration);
    this.bar = document.createElement('div');
    Object.assign(this.bar.style, {
      height: '100%', width: '0%',
      background: `linear-gradient(90deg, ${NEON.cyan}, ${NEON.pink})`,
    } as CSSStyleDeclaration);
    track.appendChild(this.bar);

    this.root.append(title, track);
    document.body.appendChild(this.root);
    this.tick();
  }

  private tick = (): void => {
    this.pct = Math.min(100, this.pct + 2.5);
    this.bar.style.width = `${this.pct}%`;
    if (this.pct < 100) this.raf = requestAnimationFrame(this.tick);
  };

  done(): void {
    cancelAnimationFrame(this.raf);
    this.pct = 100;
    this.bar.style.width = '100%';
    this.root.style.opacity = '0';
    setTimeout(() => this.root.remove(), 520);
  }
}

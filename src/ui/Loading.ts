import { UI } from './uikit';

/**
 * Boot screen. Every asset in METRO SURF is generated procedurally (no
 * downloads), so this plays a short, polished warm-up over an animated rail
 * motif and fades out to reveal the menu. {@link done} cuts it short as soon as
 * the first frames have rendered.
 */
export class Loading {
  private readonly root: HTMLDivElement;
  private readonly bar: HTMLDivElement;
  private readonly tipEl: HTMLDivElement;
  private pct = 0;
  private raf = 0;
  private tipTimer = 0;

  private static readonly TIPS = [
    '낮은 장애물에 스치면 휘청입니다 — 검표원이 바짝 따라붙어요.',
    '경사로를 밟으면 열차 지붕 위로 올라갈 수 있습니다.',
    '더블 탭으로 호버보드를 소환하면 충돌 한 번을 막아줍니다.',
    '코인은 항상 안전한 경로를 따라 놓여 있습니다 — 따라가 보세요.',
    'METRO 글자를 모두 모으면 열쇠와 코인을 받습니다.',
    '미션 세트를 완료할 때마다 상시 점수 배율이 +1 올라갑니다.',
    '특급 열차 경고가 뜨면 즉시 다른 선로로 피하세요.',
  ];

  constructor() {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed', inset: '0', zIndex: '200',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '18px',
      background: 'linear-gradient(175deg, #0a0d16 0%, #1a2444 45%, #3a2258 78%, #6a2a48 100%)',
      transition: 'opacity .5s ease', overflow: 'hidden',
    } as CSSStyleDeclaration);

    // Animated rail lines receding into the distance.
    const rails = document.createElement('div');
    Object.assign(rails.style, {
      position: 'absolute', inset: '0', opacity: '0.16', pointerEvents: 'none',
      background: 'repeating-linear-gradient(180deg, transparent 0 30px, rgba(255,255,255,.5) 30px 34px)',
      animation: 'ms-loadscroll 1.1s linear infinite',
      maskImage: 'linear-gradient(180deg, transparent, black 40%, black 60%, transparent)',
      WebkitMaskImage: 'linear-gradient(180deg, transparent, black 40%, black 60%, transparent)',
    } as unknown as CSSStyleDeclaration);
    const style = document.createElement('style');
    style.textContent = '@keyframes ms-loadscroll{to{background-position:0 64px}}';
    document.head.appendChild(style);
    this.root.appendChild(rails);

    const title = document.createElement('div');
    Object.assign(title.style, {
      font: `900 clamp(40px,11vw,78px)/0.94 'Trebuchet MS',system-ui,sans-serif`,
      letterSpacing: '3px', textAlign: 'center', zIndex: '1',
      background: `linear-gradient(115deg, ${UI.gold}, #ff9f43 40%, ${UI.magenta} 78%, ${UI.blue})`,
      webkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
      filter: 'drop-shadow(0 6px 20px rgba(255,150,60,.35))',
    } as unknown as CSSStyleDeclaration);
    title.innerHTML = 'METRO<br>SURF';

    const track = document.createElement('div');
    Object.assign(track.style, {
      width: 'min(320px,70vw)', height: '9px', borderRadius: '5px', zIndex: '1',
      background: 'rgba(255,255,255,.12)', overflow: 'hidden',
      boxShadow: 'inset 0 1px 3px rgba(0,0,0,.6)',
    } as CSSStyleDeclaration);
    this.bar = document.createElement('div');
    Object.assign(this.bar.style, {
      height: '100%', width: '0%',
      background: `linear-gradient(90deg, ${UI.blue}, ${UI.gold})`,
      boxShadow: `0 0 12px ${UI.gold}88`,
    } as CSSStyleDeclaration);
    track.appendChild(this.bar);

    this.tipEl = document.createElement('div');
    Object.assign(this.tipEl.style, {
      font: '700 12px/1.6 system-ui', color: 'rgba(238,243,251,.72)', textAlign: 'center',
      maxWidth: 'min(420px,86vw)', zIndex: '1', minHeight: '38px', padding: '0 12px',
      transition: 'opacity .3s ease',
    } as CSSStyleDeclaration);
    this.tipEl.textContent = `💡 ${Loading.TIPS[(Math.random() * Loading.TIPS.length) | 0]}`;

    this.root.append(title, track, this.tipEl);
    document.body.appendChild(this.root);
    this.tick();
  }

  private tick = (): void => {
    this.pct = Math.min(100, this.pct + 2.2);
    this.bar.style.width = `${this.pct}%`;
    if (++this.tipTimer % 110 === 0) {
      this.tipEl.style.opacity = '0';
      setTimeout(() => {
        this.tipEl.textContent = `💡 ${Loading.TIPS[(Math.random() * Loading.TIPS.length) | 0]}`;
        this.tipEl.style.opacity = '1';
      }, 300);
    }
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

import type { SaveManager } from '../data/SaveManager';
import { levelForXp } from '../data/SaveManager';
import { button, coinStr, el, NEON, screen, show } from './uikit';

export interface MenuCallbacks {
  onPlay: () => void;
  onCharacters: () => void;
  onShop: () => void;
  onSettings: () => void;
}

/**
 * The home screen: an animated neon wordmark over the attract-mode runner, a
 * big Play button, navigation to Characters / Shop / Settings, and a live
 * footer with best score, total coins and rank. Pure DOM over the 3D canvas.
 */
export class Menu {
  readonly root: HTMLDivElement;
  private readonly footer: HTMLDivElement;

  constructor(cb: MenuCallbacks) {
    this.root = screen(false);
    this.root.style.justifyContent = 'space-between';
    this.root.style.padding = '8vh 0 6vh';

    // Title block (top).
    const top = el('div', { textAlign: 'center', animation: 'nd-float 4s ease-in-out infinite' });
    const title = el(
      'div',
      {
        font: '900 clamp(48px,12vw,120px)/0.9 system-ui,sans-serif',
        letterSpacing: '2px',
        background: `linear-gradient(95deg, ${NEON.cyan}, ${NEON.pink}, ${NEON.gold})`,
        webkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        animation: 'nd-pulse 3s ease-in-out infinite',
      },
      'NEON<span style="opacity:.92">DASH</span>',
    );
    const tag = el(
      'div',
      { marginTop: '6px', font: '600 16px/1 system-ui,sans-serif', color: NEON.cyan, opacity: '0.85' },
      'ENDLESS NEON RUNNER',
    );
    top.append(title, tag);

    // Buttons (centre).
    const mid = el('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' });
    const play = button('▶  PLAY', cb.onPlay, 'pink');
    play.style.fontSize = '24px';
    play.style.padding = '18px 56px';
    const row = el('div', { display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' });
    row.append(
      button('Characters', cb.onCharacters, 'ghost'),
      button('Shop', cb.onShop, 'ghost'),
      button('Settings', cb.onSettings, 'ghost'),
    );
    mid.append(play, row);

    // Footer stats.
    this.footer = el('div', {
      font: '600 15px/1.6 ui-monospace,monospace',
      textAlign: 'center',
      opacity: '0.9',
    });

    this.root.append(top, mid, this.footer);
  }

  refresh(save: SaveManager): void {
    const d = save.data;
    this.footer.innerHTML =
      `Best <b style="color:${NEON.gold}">${d.bestScore}</b> &nbsp;·&nbsp; ` +
      `${coinStr(d.totalCoins)} &nbsp;·&nbsp; ` +
      `Rank <b style="color:${NEON.cyan}">${levelForXp(d.xp)}</b>`;
  }

  show(on: boolean): void {
    show(this.root, on);
  }
}

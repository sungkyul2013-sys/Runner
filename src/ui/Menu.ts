import { missionLabel } from '../data/missions';
import type { SaveManager } from '../data/SaveManager';
import { levelForXp, xpIntoLevel } from '../data/SaveManager';
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
    const lvl = levelForXp(d.xp);
    const { into, need } = xpIntoLevel(d.xp);
    const xpPct = Math.round((into / need) * 100);

    const missions = d.missions
      .map((m) => {
        const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
        const cap = Math.min(m.progress, m.target);
        return `<div style="margin:3px 0">
          <div style="display:flex;justify-content:space-between;font-size:12px;opacity:.9">
            <span>${missionLabel(m)}</span><span style="color:${NEON.gold}">+${m.reward}</span></div>
          <div style="height:6px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${NEON.cyan}"></div></div>
          <div style="font-size:10px;opacity:.6">${cap}/${m.target}</div>
        </div>`;
      })
      .join('');

    this.footer.innerHTML = `
      <div style="display:flex;gap:18px;justify-content:center;margin-bottom:8px">
        <span>Best <b style="color:${NEON.gold}">${d.bestScore}</b></span>
        <span>${coinStr(d.totalCoins)}</span>
        <span>Rank <b style="color:${NEON.cyan}">${lvl}</b></span>
      </div>
      <div style="width:min(420px,86vw);height:7px;border-radius:4px;background:rgba(255,255,255,.12);
        overflow:hidden;margin:0 auto 12px"><div style="height:100%;width:${xpPct}%;
        background:linear-gradient(90deg,${NEON.cyan},${NEON.pink})"></div></div>
      <div style="width:min(420px,86vw);text-align:left;margin:0 auto">
        <div style="font-size:12px;letter-spacing:1px;color:${NEON.cyan};margin-bottom:2px">MISSIONS</div>
        ${missions}
      </div>`;
  }

  show(on: boolean): void {
    show(this.root, on);
  }
}

import type { RunnerGame } from '../core/RunnerGame';
import { GameState } from '../core/GameStateManager';
import type { SaveManager } from '../data/SaveManager';
import { CharacterSelect } from './CharacterSelect';
import { Menu } from './Menu';
import { Shop } from './Shop';
import { button, coinStr, el, NEON, screen, show } from './uikit';

const REVIVE_COST = 50;

type Nav = 'home' | 'characters' | 'shop' | 'settings';

/**
 * Wires the DOM screens to the game's {@link GameState}. Shows the right
 * overlay per state (menu navigation while in MENU, a pause sheet, a rich
 * game-over sheet), and routes button presses back into the game's flow API
 * (startRun / toMenu / pause / resume / revive). Cosmetic/character changes
 * refresh the live attract-mode preview via the game's loadout.
 */
export class ScreenManager {
  private readonly menu: Menu;
  private readonly characters: CharacterSelect;
  private readonly shop: Shop;
  private readonly settings: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly gameover: HTMLDivElement;
  private readonly pauseBtn: HTMLButtonElement;

  private nav: Nav = 'home';
  private reviveUsed = false;

  constructor(
    private readonly game: RunnerGame,
    private readonly save: SaveManager,
  ) {
    const refresh = () => this.game.refreshLoadout();

    this.menu = new Menu({
      onPlay: () => this.start(),
      onCharacters: () => this.goto('characters'),
      onShop: () => this.goto('shop'),
      onSettings: () => this.goto('settings'),
    });
    this.characters = new CharacterSelect(save, refresh, () => this.goto('home'));
    this.shop = new Shop(save, refresh, () => this.goto('home'));
    this.settings = this.buildSettings();
    this.pause = this.buildPause();
    this.gameover = this.buildGameOver();

    this.pauseBtn = button('⏸', () => this.game.pause(), 'ghost');
    Object.assign(this.pauseBtn.style, {
      position: 'fixed', bottom: '16px', right: '16px', zIndex: '60', display: 'none',
    } as CSSStyleDeclaration);
    document.body.appendChild(this.pauseBtn);

    this.game.state.onChange((next) => this.onState(next));
    window.addEventListener('keydown', this.onKey);

    this.onState(this.game.state.state); // initial paint
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (this.game.state.is(GameState.PLAYING)) this.game.pause();
      else if (this.game.state.is(GameState.PAUSED)) this.game.resume();
    }
  };

  private start(): void {
    this.reviveUsed = false;
    this.game.startRun();
  }
  private home(): void {
    this.reviveUsed = false;
    this.game.toMenu();
  }
  private goto(nav: Nav): void {
    this.nav = nav;
    if (this.game.state.is(GameState.MENU)) this.paintMenu();
  }

  private onState(s: GameState): void {
    const menu = s === GameState.MENU;
    this.pauseBtn.style.display = s === GameState.PLAYING ? 'block' : 'none';
    show(this.pause, s === GameState.PAUSED);
    show(this.gameover, s === GameState.GAMEOVER);
    if (s === GameState.GAMEOVER) this.paintGameOver();
    if (!menu) {
      this.menu.show(false);
      this.characters.show(false);
      this.shop.show(false);
      show(this.settings, false);
    } else {
      this.nav = this.nav === 'home' ? 'home' : this.nav; // keep current sub-screen
      this.paintMenu();
    }
  }

  private paintMenu(): void {
    this.menu.refresh(this.save);
    this.menu.show(this.nav === 'home');
    this.characters.show(this.nav === 'characters');
    this.shop.show(this.nav === 'shop');
    show(this.settings, this.nav === 'settings');
  }

  // ── Settings sheet ─────────────────────────────────────────────────────────
  private buildSettings(): HTMLDivElement {
    const root = screen(true);
    root.append(el('div', { font: '800 28px/1 system-ui' }, 'SETTINGS'));

    const muteBtn = button('', () => {
      this.save.setMuted(!this.save.data.settings.muted);
      syncMute();
    });
    const syncMute = () => {
      muteBtn.innerHTML = this.save.data.settings.muted ? '🔇  Sound: Off' : '🔊  Sound: On';
    };
    syncMute();

    const qBtn = button('', () => {
      this.save.setQuality(this.save.data.settings.quality === 'high' ? 'low' : 'high');
      syncQ();
    }, 'ghost');
    const syncQ = () => {
      qBtn.innerHTML = `Quality: ${this.save.data.settings.quality === 'high' ? 'High' : 'Low'}`;
    };
    syncQ();

    root.append(muteBtn, qBtn, button('← Back', () => this.goto('home'), 'ghost'));
    return root;
  }

  // ── Pause sheet ─────────────────────────────────────────────────────────────
  private buildPause(): HTMLDivElement {
    const root = screen(true);
    root.append(
      el('div', { font: '800 36px/1 system-ui' }, 'PAUSED'),
      button('Resume', () => this.game.resume(), 'pink'),
      button('Restart', () => this.start(), 'ghost'),
      button('Main Menu', () => this.home(), 'ghost'),
    );
    return root;
  }

  // ── Game-over sheet ──────────────────────────────────────────────────────────
  private gameoverBody!: HTMLDivElement;
  private buildGameOver(): HTMLDivElement {
    const root = screen(true);
    this.gameoverBody = el('div', {
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
    });
    root.append(this.gameoverBody);
    return root;
  }

  private paintGameOver(): void {
    const s = this.game.getRunStats();
    const isBest = s.score >= (s.best ?? 0) && s.score > 0;
    this.gameoverBody.innerHTML = '';
    this.gameoverBody.append(
      el('div', { font: '800 46px/1 system-ui', color: NEON.pink, textShadow: `0 0 22px ${NEON.pink}aa` }, 'GAME OVER'),
      el('div', { font: '800 34px/1 ui-monospace,monospace' }, `${s.score}`),
      el('div', { opacity: '0.9' }, `${coinStr(s.coins)} &nbsp;·&nbsp; ${Math.floor(s.distance)} m`),
      el('div', { opacity: '0.75', font: '14px/1 system-ui' },
        `Best ${Math.max(s.best ?? 0, s.score)}${isBest ? ' &nbsp;🏆 NEW!' : ''}`),
    );

    // Mission completions + rank-up rewards earned this run.
    const summary = this.game.getRunSummary();
    if (summary.rank.leveledTo !== undefined) {
      this.gameoverBody.append(
        el('div', { color: NEON.cyan, font: '700 15px/1.4 system-ui' },
          `⭐ Rank ${summary.rank.leveledTo}! +${summary.rank.reward} coins`),
      );
    }
    for (const m of summary.completed) {
      this.gameoverBody.append(
        el('div', { color: NEON.gold, font: '700 14px/1.4 system-ui' },
          `✓ Mission complete! +${m.reward} coins`),
      );
    }

    const btns = el('div', { display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap', justifyContent: 'center' });
    const canRevive = !this.reviveUsed && this.save.data.totalCoins >= REVIVE_COST;
    const revive = button(`Revive ${coinStr(REVIVE_COST)}`, () => {
      if (this.reviveUsed || !this.save.spend(REVIVE_COST)) return;
      this.reviveUsed = true;
      this.game.revive();
    }, 'pink');
    revive.disabled = !canRevive;
    btns.append(revive, button('Restart', () => this.start(), 'cyan'), button('Menu', () => this.home(), 'ghost'));
    this.gameoverBody.append(btns);
  }
}

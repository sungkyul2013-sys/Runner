import type { AudioManager } from '../audio/AudioManager';
import { HUNT_WORD } from '../config/powerups';
import type { Engine } from '../core/Engine';
import { GameState } from '../core/GameStateManager';
import type { RunnerGame } from '../core/RunnerGame';
import { ACHIEVEMENTS, DAILY } from '../data/achievements';
import { BOARDS, type BoardDef } from '../data/boards';
import { DISTRICTS } from '../config/constants';
import { CHARACTERS, type CharColors, type CharacterDef } from '../data/characters';
import { outfitsFor, resolveColors } from '../data/outfits';
import { CONSUMABLES } from '../data/consumables';
import { JOURNEY } from '../data/journey';
import { getMission } from '../data/missions';
import { nextRank, rankFor, rankProgress } from '../data/ranks';
import { MODES } from '../data/modes';
import type { GameMode, SaveManager } from '../data/SaveManager';
import { UPGRADES } from '../data/upgrades';
import { bar, button, coinStr, el, hex, keyStr, screen, show, tab, UI } from './uikit';

/** Keys charged for the n-th revive of a run (index clamped). */
const REVIVE_KEYS = [1, 2, 3, 5];

type Nav = 'characters' | 'boards' | 'play' | 'shop' | 'records' | 'settings';
type ShopTab = 'items' | 'upgrades';
type RecordTab = 'missions' | 'ranks' | 'daily' | 'journey' | 'achievements';

/**
 * Owns every full-screen overlay and the flow between them, driven off the
 * game's {@link GameState}.
 *
 * The home screen keeps the live 3D runner centre stage: a slim top bar with
 * the wallet, a mission tracker card, the mode carousel and the play button,
 * over a five-slot bottom navigation. Behind it sit the crew and hoverboard
 * galleries with live previews, the shop (consumables + permanent upgrades),
 * and the records hub (missions, top runs, daily streak, world tour and
 * achievements). It also renders the pause sheet, the settings panel and the
 * results screen with its revive, mystery box and run breakdown.
 */
export class ScreenManager {
  private readonly menu: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly gameover: HTMLDivElement;
  private readonly help: HTMLDivElement;

  private header!: HTMLDivElement;
  private content!: HTMLDivElement;
  private navbar!: HTMLDivElement;
  private grid!: HTMLDivElement;
  private ambience!: HTMLDivElement;
  private gameoverBody!: HTMLDivElement;

  private mode: GameMode = 'endless';
  private nav: Nav = 'play';
  private shopTab: ShopTab = 'items';
  private recordTab: RecordTab = 'missions';
  private revives = 0;
  private cardIndex = 0;

  constructor(
    private readonly game: RunnerGame,
    private readonly save: SaveManager,
    private readonly audio: AudioManager,
    private readonly engine: Engine,
  ) {
    this.engine.setQuality(save.data.settings.quality);
    this.audio.setMuted(save.data.settings.muted);
    window.addEventListener('pointerdown', () => this.audio.unlock());

    this.menu = this.buildMenuShell();
    this.pause = this.buildPause();
    this.gameover = this.buildGameOver();
    this.help = this.buildHelp();

    this.game.state.onChange((s) => this.onState(s));
    window.addEventListener('keydown', this.onKey);
    this.onState(this.game.state.state);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (this.game.state.is(GameState.PLAYING)) this.game.pause();
      else if (this.game.state.is(GameState.PAUSED)) this.game.resume();
    }
  };

  private onState(s: GameState): void {
    show(this.menu, s === GameState.MENU);
    show(this.pause, s === GameState.PAUSED);
    show(this.gameover, s === GameState.GAMEOVER);
    if (s === GameState.MENU) this.renderMenu();
    if (s === GameState.GAMEOVER) this.renderGameOver();
  }

  private startRun(): void {
    this.revives = 0;
    this.audio.unlock();
    this.audio.startBgm();
    this.audio.ui();
    this.game.setMode(this.mode);
    this.game.beginRun();
  }

  private toHome(): void {
    this.revives = 0;
    this.audio.stopBgm();
    this.nav = 'play';
    this.game.toMenu();
  }

  // ── App shell ─────────────────────────────────────────────────────────────
  private buildMenuShell(): HTMLDivElement {
    const root = screen(false);
    root.style.cssText += 'justify-content:stretch;align-items:stretch;gap:0;padding:0';

    this.header = el('div', {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: 'calc(env(safe-area-inset-top,0px) + 14px) 16px 10px',
      flexShrink: '0', zIndex: '2', gap: '8px',
    });

    this.content = el('div', {
      flex: '1', overflowY: 'auto', padding: '6px 14px 6px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '9px',
      perspective: '1300px',
    });
    this.content.className = 'ms-scroll';

    this.navbar = el('div', {
      display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end',
      margin: '0 auto calc(env(safe-area-inset-bottom,0px) + 12px)',
      width: 'min(520px,96vw)', padding: '12px 6px 10px', flexShrink: '0', zIndex: '3',
      borderRadius: '24px', border: `2px solid ${UI.line}`,
      background: 'linear-gradient(180deg,#333e5c 0%,#1e2740 55%,#141b2e 100%)',
      boxShadow: `0 5px 0 #0b1020, 0 5px 0 2px ${UI.line}, 0 16px 34px rgba(0,0,0,.6),`
        + ' inset 0 2px 0 rgba(255,255,255,.16)',
    });

    // Drifting emoji ambience behind the whole shell — cheap, and it keeps the
    // home screen alive between the 3D scene and the UI slabs.
    this.ambience = el('div', {
      position: 'absolute', top: '0', left: '0', right: '0', bottom: '104px',
      overflow: 'hidden', pointerEvents: 'none', zIndex: '0',
    });
    root.append(this.ambience, this.header, this.content, this.navbar);
    return root;
  }

  /** Emoji that drift up behind the home screen. */
  private static readonly AMBIENT = ['🪙', '🗝️', '🛹', '🧲', '👟', '🚀', '❓', '✖️', '🚃', '⭐'];

  /** Rebuild the drifting emoji layer (home tab only — galleries stay calm). */
  private renderAmbience(on: boolean): void {
    this.ambience.innerHTML = '';
    this.ambience.style.display = on ? 'block' : 'none';
    if (!on) return;
    for (let i = 0; i < 12; i++) {
      const glyph = ScreenManager.AMBIENT[i % ScreenManager.AMBIENT.length];
      // Bias toward the edges so nothing drifts across the wordmark or the
      // character standing in the middle of the frame.
      const side = i % 2 === 0 ? 3 + Math.random() * 24 : 73 + Math.random() * 24;
      this.ambience.append(el('div', {
        position: 'absolute',
        left: `${side}%`,
        top: '104%',
        fontSize: `${15 + Math.random() * 17}px`,
        opacity: '0',
        filter: 'drop-shadow(0 4px 8px rgba(0,0,0,.5)) saturate(.85)',
        animation: `ms-floatup ${13 + Math.random() * 10}s linear infinite`,
        animationDelay: `${-Math.random() * 20}s`,
      }, glyph));
    }
  }

  private readonly views: Record<Nav, () => void> = {
    play: () => this.viewPlay(),
    characters: () => this.viewCharacters(),
    boards: () => this.viewBoards(),
    shop: () => this.viewShop(),
    records: () => this.viewRecords(),
    settings: () => this.viewSettings(),
  };

  private renderMenu(): void {
    // The home tab keeps the live yard fully visible; every gallery drops a
    // scrim behind it so text and cards stay readable over a bright district.
    this.menu.style.background = this.nav === 'play'
      ? 'transparent'
      : 'linear-gradient(180deg,rgba(6,9,18,.86) 0%,rgba(9,13,26,.78) 45%,rgba(6,9,18,.9) 100%)';
    this.menu.style.backdropFilter = this.nav === 'play' ? 'none' : 'blur(6px) saturate(1.05)';
    this.renderAmbience(this.nav === 'play');
    this.renderHeader();
    this.renderNavbar();
    this.content.scrollTop = 0;
    this.content.innerHTML = '';
    this.content.style.justifyContent = 'flex-start';
    this.cardIndex = 0;
    this.content.style.animation = 'none';
    void this.content.offsetWidth; // reflow to restart the entrance
    this.content.style.animation = 'ms-popin .4s cubic-bezier(.34,1.5,.5,1) both';
    this.views[this.nav]();
  }

  private go(nav: Nav): void {
    if (this.nav === nav) return;
    this.nav = nav;
    this.audio.ui();
    this.renderMenu();
  }

  /** Re-render the active view in place (after a purchase / claim). */
  private refresh(): void {
    this.renderHeader();
    this.renderNavbar();
    this.content.innerHTML = '';
    this.content.scrollTop = 0;
    this.cardIndex = 0;
    this.views[this.nav]();
  }

  private renderHeader(): void {
    const d = this.save.data;
    this.header.innerHTML = '';
    const left = el('div', { display: 'flex', gap: '7px', alignItems: 'center' });
    const cog = el('button');
    cog.className = 'ms-cog';
    cog.innerHTML = '⚙️';
    cog.addEventListener('click', () => this.go('settings'));
    const helpBtn = el('button');
    helpBtn.className = 'ms-cog';
    helpBtn.innerHTML = '❔';
    helpBtn.addEventListener('click', () => { show(this.help, true); this.audio.ui(); });
    left.append(cog, helpBtn);

    const wallet = el('div', { display: 'flex', gap: '8px', alignItems: 'center' });
    wallet.append(
      this.currencySlab('🪙', d.coins.toLocaleString(), UI.gold, '#96650a'),
      this.currencySlab('🗝️', `${d.keys}`, UI.magenta, '#8f0e6e'),
    );
    this.header.append(left, wallet);
  }

  /**
   * A currency readout built like a Supercell counter: a dark capsule with the
   * glyph on a coloured disc at the left and a "+" nub on the right that jumps
   * straight to the shop.
   */
  private currencySlab(glyph: string, value: string, tint: string, edge: string): HTMLDivElement {
    const wrap = el('div', {
      position: 'relative', display: 'flex', alignItems: 'center', gap: '7px',
      padding: '3px 30px 3px 3px', borderRadius: '999px',
      border: `2px solid ${UI.line}`,
      background: 'linear-gradient(180deg,#2b3550 0%,#1b2238 60%,#141a2c 100%)',
      boxShadow: `0 3.5px 0 rgba(8,12,24,.9), inset 0 1.5px 0 rgba(255,255,255,.16)`,
    });
    wrap.append(el('div', {
      width: '26px', height: '26px', borderRadius: '50%', flexShrink: '0',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px',
      background: `linear-gradient(180deg, ${tint}, ${edge})`,
      border: `2px solid ${UI.line}`,
      boxShadow: 'inset 0 2px 0 rgba(255,255,255,.45)',
    }, glyph));
    wrap.append(el('span', {
      font: `900 14px/1 'Trebuchet MS',system-ui`, color: '#fff',
      fontVariantNumeric: 'tabular-nums',
      textShadow: '0 1.5px 0 rgba(8,12,22,.6)',
    }, value));
    const plus = el('button', {
      position: 'absolute', right: '-2px', top: '50%', transform: 'translateY(-50%)',
      width: '24px', height: '24px', borderRadius: '50%', cursor: 'pointer',
      pointerEvents: 'auto', border: `2px solid ${UI.line}`,
      background: `linear-gradient(180deg,#8fe6a8,${UI.green} 50%,#23b45e)`,
      color: '#062a15', font: `900 15px/1 'Trebuchet MS',system-ui`,
      boxShadow: '0 2.5px 0 #0e7a3c, inset 0 1.5px 0 rgba(255,255,255,.5)',
    }, '+');
    plus.addEventListener('click', (e) => { e.stopPropagation(); this.go('shop'); });
    wrap.append(plus);
    return wrap;
  }

  private renderNavbar(): void {
    this.navbar.innerHTML = '';
    const dot = this.save.canClaimDaily()
      || ACHIEVEMENTS.some((a) => a.stat(this.save.data) >= a.goal && !this.save.data.claimedAchievements.includes(a.id))
      || JOURNEY.some((m, i) => this.save.journeyProgress >= m.need && !this.save.milestoneClaimed(i));
    const items: Array<[Nav, string, string, boolean]> = [
      ['characters', '🦸', '크루', false],
      ['boards', '🛹', '보드', false],
      ['play', '🏠', '홈', false],
      ['shop', '🛒', '상점', false],
      ['records', '🏅', '기록', dot],
    ];
    for (const [nav, icon, label, badge] of items) {
      const on = this.nav === nav;
      const home = nav === 'play';
      const b = el('button');
      b.className = `ms-nav${on ? ' on' : ''}${home ? ' home' : ''}`;
      b.innerHTML =
        `<span class="ms-navicon">${icon}</span>` +
        `<span class="ms-navlbl">${label}</span>` +
        (badge
          ? `<span style="position:absolute;top:0;right:8px;width:9px;height:9px;border-radius:50%;
              background:${UI.red};box-shadow:0 0 8px ${UI.red}"></span>`
          : '');
      b.addEventListener('click', () => this.go(nav));
      this.navbar.append(b);
    }
  }

  // ── Shared bits ───────────────────────────────────────────────────────────
  private sectionTitle(icon: string, label: string, sub: string): HTMLDivElement {
    const t = el('div', { textAlign: 'center', marginBottom: '0px', flexShrink: '0' });
    t.innerHTML =
      `<div style="font:900 25px/1 'Trebuchet MS',system-ui;color:${UI.gold};
        filter:drop-shadow(0 2px 10px rgba(255,190,60,.4))">${icon} ${label}</div>` +
      `<div style="font:700 11px/1.35 system-ui;opacity:.55;letter-spacing:.8px;margin-top:4px">${sub}</div>`;
    return t;
  }

  private gridBody(gap = '13px'): HTMLDivElement {
    const g = el('div', {
      width: '100%', display: 'flex', flexWrap: 'wrap', gap, justifyContent: 'center', padding: '4px 0 6px',
    });
    return g;
  }

  private card(width = '190px'): HTMLDivElement {
    const c = el('div');
    c.className = 'ms-card';
    c.style.width = width;
    c.style.animation = 'ms-popin .38s cubic-bezier(.34,1.5,.5,1) both';
    c.style.animationDelay = `${(this.cardIndex++ % 10) * 0.04}s`;
    return c;
  }

  private tabRow(pairs: Array<[string, string, () => void]>, current: string): HTMLDivElement {
    const row = el('div', {
      display: 'flex', gap: '7px', justifyContent: 'center', flexShrink: '0',
      flexWrap: 'wrap', maxWidth: 'min(560px,96vw)',
    });
    for (const [id, label, fn] of pairs) {
      const b = tab(label, fn);
      if (id === current) b.className = 'ms-tab on';
      row.append(b);
    }
    return row;
  }

  // ── View: PLAY ────────────────────────────────────────────────────────────
  private viewPlay(): void {
    const d = this.save.data;
    const c = CHARACTERS.find((x) => x.id === d.selectedChar)!;
    const b = BOARDS.find((x) => x.id === d.selectedBoard)!;
    this.content.style.justifyContent = 'space-between';

    // ── Hero: extruded wordmark with a shine sweep, and a ribbon naming the
    //    district the backdrop is currently touring. ──
    const district = DISTRICTS[this.game.menuDistrictIndex % DISTRICTS.length];
    const title = el('div', {
      textAlign: 'center', flexShrink: '0', display: 'flex',
      flexDirection: 'column', alignItems: 'center', gap: '8px', marginTop: '0px',
    });
    const logo = el('div', {}, 'METRO <em>SURF</em><span class="ms-logoshine"></span>');
    logo.className = 'ms-logo';
    const ribbon = el('div', {}, `${district.night ? '🌙' : '☀️'} ${district.name} · ${district.sub}`);
    ribbon.className = 'ms-ribbon';
    title.append(logo, ribbon);

    // Compact rank + mission status (tap for the full board).
    const status = this.statusCard();

    const spacer = el('div', { flex: '1', minHeight: '6px' });

    const bottom = el('div', {
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '9px',
      flexShrink: '0', animation: 'ms-slideup .38s ease both', width: '100%',
    });

    // Loadout pills — tap either to jump to its gallery.
    const pills = el('div', { display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' });
    const charPill = el('button');
    charPill.className = 'ms-chip';
    charPill.style.cssText += 'cursor:pointer;font-size:13px;pointer-events:auto;border:none';
    const worn = resolveColors(c.id, this.save.outfitOf(c.id));
    charPill.innerHTML = `<span style="font-size:16px">🦸</span><b style="color:${hex(worn.accent)}">${c.name}</b>
      <span style="opacity:.55;font-size:11px">${c.blurb}</span>`;
    charPill.addEventListener('click', () => this.go('characters'));
    const boardPill = el('button');
    boardPill.className = 'ms-chip';
    boardPill.style.cssText += 'cursor:pointer;font-size:13px;pointer-events:auto;border:none';
    boardPill.innerHTML = `<span style="font-size:16px">🛹</span><b style="color:${hex(b.colors.deck)}">${b.name}</b>`;
    boardPill.addEventListener('click', () => this.go('boards'));
    pills.append(charPill, boardPill);

    // Mode carousel.
    const carousel = el('div', {
      display: 'flex', gap: '9px', overflowX: 'auto', maxWidth: 'min(540px,96vw)',
      padding: '5px 10px 9px', scrollSnapType: 'x mandatory', flexShrink: '0',
      maskImage: 'linear-gradient(90deg,transparent,#000 4%,#000 96%,transparent)',
      WebkitMaskImage: 'linear-gradient(90deg,transparent,#000 4%,#000 96%,transparent)',
    } as unknown as Partial<CSSStyleDeclaration>);
    carousel.className = 'ms-scroll';
    for (const m of MODES) {
      const on = this.mode === m.id;
      const cardEl = el('button', {
        flexShrink: '0', width: '114px', cursor: 'pointer',
        scrollSnapAlign: 'center', pointerEvents: 'auto', textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
        padding: '10px 7px 9px', borderRadius: '16px',
        border: `2px solid ${UI.line}`,
        color: '#fff',
        background: on
          ? `linear-gradient(180deg,#fff0a4,${UI.gold} 40%,#eda312)`
          : 'linear-gradient(180deg,#3d4966,#262f4a 55%,#1a2237)',
        boxShadow: on
          ? `0 5px 0 #96650a, 0 5px 0 2px ${UI.line}, 0 12px 22px rgba(255,190,60,.3),`
            + ' inset 0 2px 0 rgba(255,255,255,.5)'
          : `0 5px 0 #0c1120, 0 5px 0 2px ${UI.line}, inset 0 2px 0 rgba(255,255,255,.18)`,
        transition: 'transform .15s cubic-bezier(.34,1.6,.5,1)',
        transform: on ? 'translateY(-5px)' : 'none',
      } as Partial<CSSStyleDeclaration>);
      const ink = on ? 'rgba(26,16,2,.55)' : 'rgba(8,12,22,.6)';
      cardEl.innerHTML =
        `<span style="font-size:25px;filter:drop-shadow(0 3px 4px rgba(0,0,0,.45))">${m.icon}</span>` +
        `<span style="font:900 13px/1 'Trebuchet MS',system-ui;color:#fff;
           -webkit-text-stroke:.6px ${ink};text-shadow:0 2px 0 ${ink}">${m.name}</span>` +
        `<span style="font:700 9px/1.2 system-ui;height:11px;overflow:hidden;white-space:nowrap;
           text-overflow:ellipsis;max-width:100%;
           color:${on ? 'rgba(40,24,2,.8)' : 'rgba(238,243,251,.7)'}">${m.desc}</span>` +
        `<span style="font:900 10px/1 'Trebuchet MS',monospace;
           color:${on ? 'rgba(40,24,2,.85)' : UI.gold}">🏆 ${this.save.bestFor(m.id).toLocaleString()}</span>`;
      cardEl.addEventListener('click', () => { this.mode = m.id; this.audio.ui(); this.renderMenu(); });
      carousel.append(cardEl);
      // Keep the chosen mode centred so the carousel never opens mid-card.
      if (on) requestAnimationFrame(() => cardEl.scrollIntoView({ block: 'nearest', inline: 'center' }));
    }

    const play = button('▶  질주 시작', () => this.startRun(), 'green');
    play.style.font = `900 22px/1 'Trebuchet MS',system-ui`;
    play.style.padding = '17px 56px';
    play.style.animation = 'ms-breathe 2.6s ease-in-out infinite';

    bottom.append(pills, carousel, play);
    this.content.append(title, status, spacer, bottom);
  }

  /**
   * The home status card — the one always-visible read on where the player
   * stands. A rank badge and its XP bar sit on top; under them the live mission
   * set as three filled/empty pips and the word-hunt letters. Tapping it opens
   * the full board.
   */
  private statusCard(): HTMLDivElement {
    const d = this.save.data;
    const rank = rankFor(d.xp);
    const next = nextRank(d.xp);
    const pct = rankProgress(d.xp) * 100;

    const wrap = el('div');
    wrap.className = 'ms-card flat';
    wrap.style.cssText +=
      'width:min(440px,94vw);flex-shrink:0;padding:8px 11px;cursor:pointer;pointer-events:auto;'
      + 'flex-direction:row;align-items:center;gap:10px';

    // Rank badge.
    wrap.append(el('div', {
      width: '38px', height: '38px', flexShrink: '0', borderRadius: '12px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
      border: `2px solid ${UI.line}`,
      background: `linear-gradient(180deg, ${rank.color}, ${rank.color}88 60%, #1b2338)`,
      boxShadow: '0 3px 0 rgba(8,12,24,.9), inset 0 2px 0 rgba(255,255,255,.4)',
    }, rank.icon));

    // Rank name + XP bar + the mission / hunt read-out, stacked tight.
    const info = el('div', { flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '4px' });
    const top = el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' });
    top.innerHTML =
      `<span style="font:900 13px/1 'Trebuchet MS',system-ui;color:${rank.color};
         white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Lv.${rank.level} ${rank.name}</span>` +
      `<span style="font:800 9px/1 ui-monospace,monospace;color:rgba(238,243,251,.55);flex-shrink:0">` +
      (next ? `${d.xp.toLocaleString()}/${next.need.toLocaleString()} XP` : 'MAX') + `</span>`;
    const xpBar = bar(pct, 'green');
    xpBar.style.height = '8px';

    let pips = '';
    for (const slot of d.missions) {
      const done = slot.progress >= slot.goal;
      const def = getMission(slot.id);
      pips += `<span title="${def.text(slot.goal)}" style="width:19px;height:19px;border-radius:6px;
        display:inline-flex;align-items:center;justify-content:center;font-size:10px;
        border:1.5px solid ${UI.line};
        background:${done ? `linear-gradient(180deg,#ccffdd,${UI.green} 55%,#23b45e)` : 'rgba(255,255,255,.07)'};
        filter:${done ? 'none' : 'grayscale(.7) opacity(.75)'}">${done ? '✅' : def.icon}</span>`;
    }
    let letters = '';
    for (const ch of HUNT_WORD) {
      const got = d.huntLetters.includes(ch);
      letters += `<span style="width:15px;height:18px;border-radius:4px;display:inline-flex;
        align-items:center;justify-content:center;font:900 9px/1 'Trebuchet MS',system-ui;
        border:1.5px solid ${UI.line};
        background:${got ? `linear-gradient(180deg,#bfe4ff,${UI.blue} 55%,#1d7ecb)` : 'rgba(255,255,255,.07)'};
        color:${got ? '#04202e' : 'rgba(238,243,251,.3)'}">${ch}</span>`;
    }
    const bottom = el('div', {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
    });
    bottom.innerHTML =
      `<span style="display:flex;align-items:center;gap:4px">
         <b style="font:900 10px/1 'Trebuchet MS',system-ui;color:${UI.green}">SET ${d.missionSet}</b>${pips}</span>` +
      `<span style="display:flex;gap:2px;align-items:center">${letters}</span>`;
    info.append(top, xpBar, bottom);
    wrap.append(info);

    wrap.addEventListener('click', () => {
      this.recordTab = 'missions';
      this.go('records');
    });
    return wrap;
  }

  /** The three live missions, their progress and the set reward. */
  private missionCard(): HTMLDivElement {
    const d = this.save.data;
    const wrap = el('div');
    wrap.className = 'ms-card flat';
    wrap.style.cssText += 'width:min(430px,94vw);gap:9px;flex-shrink:0;padding:13px 15px';
    const head = el('div', {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    });
    head.innerHTML =
      `<span style="font:900 13px/1 'Trebuchet MS',system-ui;letter-spacing:1px;color:${UI.green}">📋 미션 세트 ${d.missionSet}</span>` +
      `<span style="font:800 11px/1 system-ui;opacity:.6">완료 시 상시 배율 +1</span>`;
    wrap.append(head);

    d.missions.forEach((slot, i) => {
      const def = getMission(slot.id);
      const done = slot.progress >= slot.goal;
      const pct = Math.min(100, (slot.progress / slot.goal) * 100);
      const row = el('div', { display: 'flex', flexDirection: 'column', gap: '4px' });
      const top = el('div', { display: 'flex', alignItems: 'center', gap: '7px' });
      top.innerHTML =
        `<span style="font-size:15px">${done ? '✅' : def.icon}</span>` +
        `<span style="font:700 12px/1.2 system-ui;flex:1;${done ? 'opacity:.55;text-decoration:line-through' : ''}">${def.text(slot.goal)}</span>` +
        `<span style="font:800 11px/1 ui-monospace,monospace;color:${done ? UI.green : UI.gold}">${Math.floor(slot.progress)}/${slot.goal}</span>`;
      row.append(top, bar(pct, done ? 'green' : ''));
      if (!done) {
        const re = el('button');
        re.className = 'ms-tab';
        re.style.cssText += 'align-self:flex-end;padding:4px 9px;font-size:10px;margin-top:1px';
        re.innerHTML = '🔄 교체 🗝️1';
        re.addEventListener('click', () => {
          if (!this.save.spendKeys(1)) {
            this.audio.ui();
            return;
          }
          this.save.rerollMission(i);
          this.audio.power();
          this.refresh();
        });
        row.append(re);
      }
      wrap.append(row);
    });

    // Word-hunt strip.
    const hunt = el('div', {
      display: 'flex', gap: '5px', alignItems: 'center', justifyContent: 'center',
      marginTop: '2px', paddingTop: '9px', borderTop: '1px solid rgba(255,255,255,.1)',
    });
    let html = `<span style="font:800 11px/1 system-ui;opacity:.6;margin-right:4px">단어 사냥</span>`;
    for (const ch of HUNT_WORD) {
      const got = d.huntLetters.includes(ch);
      html += `<span style="width:24px;height:28px;border-radius:7px;display:inline-flex;align-items:center;
        justify-content:center;font:900 14px/1 'Trebuchet MS',system-ui;
        background:${got ? `linear-gradient(160deg,#8ff0ff,${UI.blue})` : 'rgba(255,255,255,.08)'};
        color:${got ? '#04202e' : 'rgba(238,243,251,.3)'};
        border:1px solid ${got ? '#9af0ff' : 'rgba(255,255,255,.12)'}">${ch}</span>`;
    }
    html += `<span style="font:800 11px/1 system-ui;color:${UI.magenta};margin-left:6px">→ 🗝️1 · 🪙500</span>`;
    hunt.innerHTML = html;
    wrap.append(hunt);
    return wrap;
  }

  // ── View: CREW ────────────────────────────────────────────────────────────
  private viewCharacters(): void {
    this.content.append(
      this.sectionTitle('🦸', '크루', '능력을 가진 러너를 모아 장착하세요'),
    );
    this.grid = this.gridBody();
    this.content.append(this.grid);
    const d = this.save.data;
    for (const c of CHARACTERS) {
      const owned = this.save.ownsChar(c.id);
      const selected = d.selectedChar === c.id;
      const card = this.card('202px');
      card.style.alignItems = 'center';
      card.style.textAlign = 'center';
      if (selected) card.className = 'ms-card sel';
      else if (!owned) card.className = 'ms-card locked';

      const worn = resolveColors(c.id, this.save.outfitOf(c.id));
      card.append(
        this.figure(worn, selected),
        el('div', { font: `900 19px/1 'Trebuchet MS',system-ui`, color: hex(worn.accent) }, c.name),
        el('div', { font: '800 11px/1.35', opacity: '0.95', minHeight: '30px' }, c.blurb),
        el('div', { font: '600 10px/1.4', opacity: '0.5', minHeight: '26px' }, c.bio),
      );
      if (owned) card.append(this.outfitRow(c));
      if (selected) {
        card.append(el('div', { color: UI.gold, font: `900 13px/1` }, '✓ 장착 중'));
      } else if (owned) {
        card.append(button('장착', () => {
          this.save.selectChar(c.id);
          this.game.refreshLoadout();
          this.audio.power();
          this.refresh();
        }, 'blue'));
      } else {
        const price = c.key ? keyStr(c.price) : coinStr(c.price);
        const b = button(price, () => {
          const ok = c.key ? this.save.spendKeys(c.price) : this.save.spend(c.price);
          if (ok) {
            this.save.buyChar(c.id);
            this.save.selectChar(c.id);
            this.game.refreshLoadout();
            this.audio.power();
          } else this.audio.ui();
          this.refresh();
        }, c.key ? 'magenta' : 'gold');
        b.disabled = c.key ? d.keys < c.price : d.coins < c.price;
        card.append(b);
      }
      this.grid.append(card);
    }
  }

  /** A stacked-box mini runner built from a resolved character palette. */
  private figure(colors: CharColors, popped: boolean): HTMLDivElement {
    const skin = hex(colors.skin);
    const hair = hex(colors.hair);
    const top = hex(colors.top);
    const bottom = hex(colors.bottom);
    const shoes = hex(colors.shoes);
    const cap = hex(colors.cap);
    const accent = hex(colors.accent);

    const stage = el('div', {
      position: 'relative', width: '100%', height: '116px', display: 'flex',
      alignItems: 'flex-end', justifyContent: 'center', perspective: '520px',
    });
    stage.append(el('div', {
      position: 'absolute', bottom: '5px', width: '84px', height: '22px', borderRadius: '50%',
      background: `radial-gradient(ellipse at 50% 50%, ${accent}55, transparent 70%)`, filter: 'blur(3px)',
    }));
    const fig = el('div', {
      position: 'relative', width: '62px', height: '100px',
      animation: `ms-bounce ${popped ? 1.7 : 2.5}s ease-in-out infinite`,
      transformStyle: 'preserve-3d', transform: 'rotateX(6deg)',
    });
    const part = (bg: string, w: number, h: number, y: number, r = 6, extra = '') => el('div', {
      position: 'absolute', left: '50%', bottom: `${y}px`, width: `${w}px`, height: `${h}px`,
      transform: 'translateX(-50%)', background: bg, borderRadius: `${r}px`,
      boxShadow: 'inset 0 2px 3px rgba(255,255,255,.35),inset 0 -3px 5px rgba(0,0,0,.32),0 4px 8px rgba(0,0,0,.38)',
    } as Partial<CSSStyleDeclaration>, extra);
    fig.append(
      part(shoes, 34, 9, 0, 4),        // sneakers
      part(bottom, 30, 22, 7, 5),      // legs
      part(top, 40, 32, 26, 8),        // torso
      part(accent, 8, 26, 28, 3),      // zip stripe
      part(skin, 30, 27, 55, 8),       // head
      part(hair, 32, 12, 72, 6),       // hair
      part(cap, 42, 11, 78, 6),        // cap peak
      part(cap, 28, 11, 86, 6),        // cap crown
    );
    fig.append(el('div', {
      position: 'absolute', left: '50%', bottom: '64px', transform: 'translateX(-50%)',
      width: '19px', height: '5px', display: 'flex', justifyContent: 'space-between',
    }, '<span style="width:5px;height:5px;background:#20222c;border-radius:50%"></span>' +
       '<span style="width:5px;height:5px;background:#20222c;border-radius:50%"></span>'));
    stage.append(fig);
    return stage;
  }

  /**
   * The fit row under an owned runner: one swatch per outfit, showing the top,
   * cap and accent colours. Tap to equip; tap a locked one to buy it.
   */
  private outfitRow(c: CharacterDef): HTMLDivElement {
    const list = outfitsFor(c.id);
    const wornId = this.save.outfitOf(c.id);
    const row = el('div', {
      display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center',
      flexWrap: 'wrap', paddingTop: '7px', marginTop: '1px',
      borderTop: '1px solid rgba(255,255,255,.1)', width: '100%',
    });
    for (const o of list) {
      const owned = this.save.ownsOutfit(c.id, o.id);
      const on = wornId === o.id;
      const colors = resolveColors(c.id, o.id);
      const btn = el('button', {
        position: 'relative', width: '44px', padding: '4px 0 5px', cursor: 'pointer',
        pointerEvents: 'auto', borderRadius: '11px',
        border: `2px solid ${on ? UI.gold : 'rgba(255,255,255,.14)'}`,
        background: on ? 'rgba(255,210,63,.14)' : 'rgba(255,255,255,.05)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
        filter: owned ? 'none' : 'saturate(.5) brightness(.72)',
        transition: 'transform .13s cubic-bezier(.34,1.6,.5,1)',
      });
      btn.innerHTML =
        `<span style="display:flex;gap:2px">
           <i style="width:9px;height:14px;border-radius:3px;background:${hex(colors.cap)}"></i>
           <i style="width:11px;height:14px;border-radius:3px;background:${hex(colors.top)}"></i>
           <i style="width:6px;height:14px;border-radius:3px;background:${hex(colors.accent)}"></i>
         </span>` +
        `<span style="font:800 8px/1 system-ui;opacity:.8;white-space:nowrap">
           ${owned ? o.name : (o.key ? `🗝️${o.price}` : `🪙${o.price}`)}</span>`;
      btn.addEventListener('click', () => {
        if (owned) {
          this.save.selectOutfit(c.id, o.id);
          if (this.save.data.selectedChar === c.id) this.game.refreshLoadout();
          this.audio.ui();
        } else {
          const ok = o.key ? this.save.spendKeys(o.price) : this.save.spend(o.price);
          if (!ok) {
            this.audio.ui();
            return;
          }
          this.save.buyOutfit(c.id, o.id);
          this.save.selectOutfit(c.id, o.id);
          if (this.save.data.selectedChar === c.id) this.game.refreshLoadout();
          this.audio.power();
        }
        this.refresh();
      });
      row.append(btn);
    }
    return row;
  }

  // ── View: BOARDS ──────────────────────────────────────────────────────────
  private viewBoards(): void {
    this.content.append(
      this.sectionTitle('🛹', '호버보드', '더블 탭으로 소환 — 충돌을 1회 막아줍니다'),
    );
    this.grid = this.gridBody();
    this.content.append(this.grid);
    const d = this.save.data;
    for (const b of BOARDS) {
      const owned = this.save.ownsBoard(b.id);
      const selected = d.selectedBoard === b.id;
      const card = this.card('196px');
      card.style.alignItems = 'center';
      card.style.textAlign = 'center';
      if (selected) card.className = 'ms-card sel';
      else if (!owned) card.className = 'ms-card locked';
      card.append(
        this.boardArt(b),
        el('div', { font: `900 18px/1 'Trebuchet MS',system-ui`, color: hex(b.colors.deck) }, b.name),
        el('div', { font: '800 11px/1.35', opacity: '0.9', minHeight: '30px' }, b.blurb),
      );
      if (selected) card.append(el('div', { color: UI.gold, font: '900 13px/1' }, '✓ 장착 중'));
      else if (owned) {
        card.append(button('장착', () => {
          this.save.selectBoard(b.id);
          this.game.refreshLoadout();
          this.audio.power();
          this.refresh();
        }, 'blue'));
      } else {
        const price = b.key ? keyStr(b.price) : coinStr(b.price);
        const btn = button(price, () => {
          const ok = b.key ? this.save.spendKeys(b.price) : this.save.spend(b.price);
          if (ok) {
            this.save.buyBoard(b.id);
            this.save.selectBoard(b.id);
            this.game.refreshLoadout();
            this.audio.power();
          } else this.audio.ui();
          this.refresh();
        }, b.key ? 'magenta' : 'gold');
        btn.disabled = b.key ? d.keys < b.price : d.coins < b.price;
        card.append(btn);
      }
      this.grid.append(card);
    }
  }

  /** A hovering deck drawn in CSS, tinted with the board's palette. */
  private boardArt(b: BoardDef): HTMLDivElement {
    const deck = hex(b.colors.deck);
    const glow = hex(b.colors.glow);
    const trim = hex(b.colors.trim);
    const stage = el('div', {
      position: 'relative', width: '100%', height: '94px', display: 'flex',
      alignItems: 'center', justifyContent: 'center', perspective: '460px',
    });
    stage.append(el('div', {
      position: 'absolute', bottom: '14px', width: '110px', height: '24px', borderRadius: '50%',
      background: `radial-gradient(ellipse at 50% 50%, ${glow}88, transparent 72%)`, filter: 'blur(4px)',
    }));
    const board = el('div', {
      position: 'relative', width: '128px', height: '34px', borderRadius: '18px',
      background: `linear-gradient(160deg, ${deck}, ${trim})`,
      border: `2px solid ${glow}`,
      boxShadow: `inset 0 3px 6px rgba(255,255,255,.4), inset 0 -5px 10px rgba(0,0,0,.4), 0 10px 22px ${glow}55`,
      transform: 'rotateX(52deg) rotateZ(-9deg)',
      animation: 'ms-float 2.8s ease-in-out infinite',
    });
    board.append(el('div', {
      position: 'absolute', inset: '7px 16px', borderRadius: '12px',
      background: `linear-gradient(90deg, transparent, ${glow}66, transparent)`,
    }));
    stage.append(board);
    // Thruster pods.
    for (const x of [-42, 42]) {
      stage.append(el('div', {
        position: 'absolute', bottom: '30px', left: `calc(50% + ${x}px)`, width: '12px', height: '12px',
        borderRadius: '50%', background: glow, filter: 'blur(1px)',
        boxShadow: `0 0 14px ${glow}`,
      }));
    }
    return stage;
  }

  // ── View: SHOP ────────────────────────────────────────────────────────────
  private viewShop(): void {
    this.content.append(this.sectionTitle('🛒', '상점', '질주 전에 챙기는 아이템과 영구 강화'));
    this.content.append(this.tabRow([
      ['items', '🎒 소모품', () => { this.shopTab = 'items'; this.refresh(); }],
      ['upgrades', '⬆️ 강화', () => { this.shopTab = 'upgrades'; this.refresh(); }],
    ], this.shopTab));
    this.grid = this.gridBody();
    this.content.append(this.grid);
    if (this.shopTab === 'items') this.renderItems();
    else this.renderUpgrades();
  }

  private emojiStage(emoji: string, glow: string, height = 78): HTMLDivElement {
    const stage = el('div', {
      position: 'relative', width: '100%', height: `${height}px`, display: 'flex',
      alignItems: 'flex-end', justifyContent: 'center',
    });
    stage.append(el('div', {
      position: 'absolute', bottom: '4px', width: '68px', height: '18px', borderRadius: '50%',
      background: `radial-gradient(ellipse at 50% 50%, ${glow}, transparent 70%)`, filter: 'blur(3px)',
    }));
    stage.append(el('div', {
      position: 'absolute', bottom: '17px', fontSize: '50px', lineHeight: '1',
      animation: 'ms-bounce 2.4s ease-in-out infinite',
      filter: 'drop-shadow(0 8px 12px rgba(0,0,0,.55))',
    }, emoji));
    return stage;
  }

  private renderItems(): void {
    const d = this.save.data;
    for (const item of CONSUMABLES) {
      const have = d.inventory[item.id];
      const card = this.card('198px');
      card.style.alignItems = 'center';
      card.style.textAlign = 'center';
      const chip = el('div', { font: '800 12px/1', color: UI.gold });
      chip.className = 'ms-chip';
      chip.textContent = `보유 ${have}`;
      card.append(
        this.emojiStage(item.emoji, item.glow),
        el('div', { font: `900 17px/1 'Trebuchet MS',system-ui` }, item.name),
        el('div', { font: '600 11px/1.4', opacity: '0.85', minHeight: '32px' }, item.desc),
        chip,
      );
      const price = item.key ? keyStr(item.price) : coinStr(item.price);
      const b = button(price, () => {
        const ok = item.key ? this.save.spendKeys(item.price) : this.save.spend(item.price);
        if (ok) {
          this.save.addItem(item.id);
          this.audio.power();
        } else this.audio.ui();
        this.refresh();
      }, item.key ? 'magenta' : 'gold');
      b.disabled = item.key ? d.keys < item.price : d.coins < item.price;
      card.append(b);
      this.grid.append(card);
    }
  }

  private renderUpgrades(): void {
    for (const u of UPGRADES) {
      const lvl = this.save.upgradeLevel(u.id);
      const card = this.card('192px');
      card.style.alignItems = 'center';
      card.style.textAlign = 'center';
      const icon = this.emojiStage(u.emoji, '#ffd23f55', 62);
      const pips = el('div', { display: 'flex', gap: '5px', justifyContent: 'center' });
      for (let i = 0; i < u.max; i++) {
        pips.append(el('div', {
          width: '11px', height: '11px', borderRadius: '50%',
          background: i < lvl ? `linear-gradient(160deg,${UI.gold},#ff9f43)` : 'rgba(255,255,255,.13)',
          boxShadow: i < lvl ? `0 0 8px ${UI.gold},inset 0 1px 1px rgba(255,255,255,.55)` : 'inset 0 1px 2px rgba(0,0,0,.45)',
        }));
      }
      card.append(
        icon,
        el('div', { font: `900 16px/1 'Trebuchet MS',system-ui` }, u.name),
        el('div', { font: '600 11px/1.35', opacity: '0.75', minHeight: '26px' }, u.desc),
        el('div', { font: '800 12px/1', color: UI.blue },
          lvl >= u.max ? u.valueAt(lvl) : `${u.valueAt(lvl)} → ${u.valueAt(lvl + 1)}`),
        pips,
      );
      if (lvl >= u.max) card.append(el('div', { color: UI.gold, font: '900 14px/1', marginTop: '2px' }, '⭐ MAX'));
      else {
        const cost = u.cost(lvl);
        const b = button(coinStr(cost), () => {
          if (this.save.spend(cost)) {
            this.save.raiseUpgrade(u.id);
            this.game.refreshLoadout();
            this.audio.power();
          } else this.audio.ui();
          this.refresh();
        });
        b.disabled = this.save.data.coins < cost;
        card.append(b);
      }
      this.grid.append(card);
    }
  }

  // ── View: RECORDS ─────────────────────────────────────────────────────────
  private viewRecords(): void {
    this.content.append(this.sectionTitle('🏅', '기록', '미션 · 최고 기록 · 출석 · 월드 투어 · 업적'));
    this.content.append(this.tabRow([
      ['missions', '📋 미션', () => { this.recordTab = 'missions'; this.refresh(); }],
      ['ranks', '🏆 최고 기록', () => { this.recordTab = 'ranks'; this.refresh(); }],
      ['daily', '🎁 출석', () => { this.recordTab = 'daily'; this.refresh(); }],
      ['journey', '🗺️ 월드 투어', () => { this.recordTab = 'journey'; this.refresh(); }],
      ['achievements', '⭐ 업적', () => { this.recordTab = 'achievements'; this.refresh(); }],
    ], this.recordTab));
    this.grid = this.gridBody();
    this.content.append(this.grid);
    ({
      missions: () => this.grid.append(this.missionCard()),
      ranks: () => this.renderRanks(),
      daily: () => this.renderDaily(),
      journey: () => this.renderJourney(),
      achievements: () => this.renderAchievements(),
    })[this.recordTab]();
  }

  private renderRanks(): void {
    const d = this.save.data;
    const wrap = el('div');
    wrap.className = 'ms-card flat';
    wrap.style.cssText += 'width:min(460px,94vw);gap:8px';
    wrap.append(el('div', {
      font: `900 14px/1 'Trebuchet MS',system-ui`, letterSpacing: '1px', color: UI.gold, marginBottom: '2px',
    }, '🏆 최고의 질주 TOP 8'));

    if (!d.topRuns.length) {
      wrap.append(el('div', { font: '700 12px/1.6', opacity: '.6', textAlign: 'center', padding: '14px 0' },
        '아직 기록이 없습니다 — 첫 질주를 시작하세요!'));
    }
    d.topRuns.forEach((r, i) => {
      const mode = MODES.find((m) => m.id === r.mode) ?? MODES[0];
      const ch = CHARACTERS.find((c) => c.id === r.character);
      const medal = ['🥇', '🥈', '🥉'][i] ?? `${i + 1}`;
      const row = el('div', {
        display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
        borderRadius: '13px', background: i < 3 ? 'rgba(255,210,63,.09)' : 'rgba(255,255,255,.04)',
        border: `1px solid ${i < 3 ? 'rgba(255,210,63,.28)' : 'rgba(255,255,255,.07)'}`,
      });
      row.innerHTML =
        `<span style="font:900 16px/1;width:26px;text-align:center">${medal}</span>` +
        `<span style="flex:1;min-width:0">
           <b style="font:900 16px/1.2 'Trebuchet MS',system-ui;color:${UI.gold}">${r.score.toLocaleString()}</b>
           <span style="font:700 10px/1.4 system-ui;opacity:.6;display:block">
             ${mode.icon} ${mode.name} · ${ch ? ch.name : r.character} · ${r.day}</span>
         </span>` +
        `<span style="font:800 11px/1.5 system-ui;opacity:.8;text-align:right">
           📏 ${r.distance}m<br>🪙 ${r.coins}</span>`;
      wrap.append(row);
    });

    // Per-mode bests.
    const modeWrap = el('div');
    modeWrap.className = 'ms-card flat';
    modeWrap.style.cssText += 'width:min(460px,94vw);gap:7px';
    modeWrap.append(el('div', {
      font: `900 14px/1 'Trebuchet MS',system-ui`, letterSpacing: '1px', color: UI.blue, marginBottom: '2px',
    }, '🎮 모드별 최고 점수'));
    for (const m of MODES) {
      const row = el('div', { display: 'flex', justifyContent: 'space-between', font: '800 13px/1.7' });
      row.innerHTML = `<span style="opacity:.8">${m.icon} ${m.name}</span>` +
        `<b style="color:${UI.gold}">${this.save.bestFor(m.id).toLocaleString()}</b>`;
      modeWrap.append(row);
    }
    this.grid.append(wrap, modeWrap);
  }

  private renderDaily(): void {
    const d = this.save.data;
    const wrap = el('div', {
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', width: '100%',
    });
    const row = el('div', { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' });
    DAILY.forEach((r, i) => {
      const claimed = i < d.dailyStreak;
      const isNext = i === d.dailyStreak % 7 && this.save.canClaimDaily();
      const cell = el('div');
      cell.className = `ms-card${isNext ? ' sel' : ''}`;
      cell.style.cssText += 'width:92px;align-items:center;text-align:center;gap:4px;padding:11px 8px';
      cell.style.opacity = claimed ? '0.5' : '1';
      cell.style.animation = 'ms-popin .38s cubic-bezier(.34,1.5,.5,1) both';
      cell.style.animationDelay = `${i * 0.04}s`;
      const reward = [r.coins ? `${r.coins}🪙` : '', r.keys ? `${r.keys}🗝️` : ''].filter(Boolean).join(' ');
      cell.innerHTML =
        `<div style="font:800 10px/1;opacity:.6;letter-spacing:1px">DAY ${i + 1}</div>` +
        `<div style="font-size:29px;filter:drop-shadow(0 3px 5px rgba(0,0,0,.45))">${r.ic}</div>` +
        `<div style="font:800 11px/1.2;color:${UI.gold}">${reward}</div>` +
        (claimed ? `<div style="font:900 12px/1;color:${UI.green}">✓</div>` : '');
      row.append(cell);
    });
    wrap.append(row);
    const claimBtn = button(this.save.canClaimDaily() ? '오늘 보상 받기 🎁' : '내일 다시 오세요', () => {
      if (!this.save.canClaimDaily()) return;
      const r = DAILY[d.dailyStreak % 7];
      this.save.claimDaily(r.coins, r.keys);
      this.audio.power();
      this.refresh();
    }, 'magenta');
    claimBtn.disabled = !this.save.canClaimDaily();
    wrap.append(claimBtn);
    this.grid.append(wrap);
  }

  /** The world tour: a leaning 3D board of crates on pillars. */
  private renderJourney(): void {
    const prog = this.save.journeyProgress;
    const info = el('div');
    info.className = 'ms-chip';
    info.style.cssText += 'font-size:13px;gap:8px';
    info.innerHTML = `누적 주행 <b style="color:${UI.blue}">${prog.toLocaleString()} m</b>`;
    this.grid.append(info);

    const viewport = el('div', { perspective: '900px', width: 'min(470px,96vw)', flexShrink: '0' });
    const board = el('div', {
      position: 'relative', display: 'flex', flexDirection: 'column-reverse',
      alignItems: 'center', padding: '18px 0 26px',
      transform: 'rotateX(13deg)', transformStyle: 'preserve-3d',
    });
    const maxNeed = JOURNEY[JOURNEY.length - 1].need;
    const frac = Math.min(1, prog / maxNeed);
    board.append(el('div', {
      position: 'absolute', top: '0', bottom: '0', left: '50%', width: '10px',
      transform: 'translateX(-50%)', borderRadius: '5px',
      background: 'rgba(24,30,48,.8)', boxShadow: 'inset 0 0 8px rgba(0,0,0,.6)',
    }));
    board.append(el('div', {
      position: 'absolute', bottom: '0', left: '50%', width: '10px',
      height: `${Math.max(3, frac * 100)}%`, transform: 'translateX(-50%)', borderRadius: '5px',
      background: `linear-gradient(180deg,${UI.blue},${UI.gold})`,
      boxShadow: `0 0 12px ${UI.gold}66`,
    }));
    board.append(el('div', {
      position: 'absolute', bottom: `calc(${Math.min(96, frac * 100)}% - 15px)`, left: '50%',
      transform: 'translateX(-50%)', width: '34px', height: '34px', borderRadius: '50%',
      background: `linear-gradient(150deg,${UI.gold},#ff9f43)`,
      border: '2px solid rgba(255,246,214,.9)', zIndex: '5',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px',
      boxShadow: '0 4px 12px rgba(0,0,0,.55)', animation: 'ms-bounce 1.6s ease-in-out infinite',
    }, '🏃'));

    JOURNEY.forEach((m, i) => {
      const reached = prog >= m.need;
      const claimed = this.save.milestoneClaimed(i);
      const claimable = reached && !claimed;
      const side = i % 2 === 0 ? 'flex-start' : 'flex-end';
      const depth = Math.max(0.84, 1 - i * 0.017);

      const row = el('div', {
        width: '100%', display: 'flex', justifyContent: side,
        position: 'relative', padding: '8px 10px', zIndex: '1',
      });
      const spot = el('div', {
        position: 'relative', width: '156px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', transform: `scale(${depth})`,
        animation: 'ms-popin .42s cubic-bezier(.34,1.5,.5,1) both', animationDelay: `${i * 0.05}s`,
      });
      const crate = el('div', {
        fontSize: '48px', lineHeight: '1', zIndex: '3', position: 'relative',
        filter: claimed
          ? 'grayscale(.8) brightness(.7) drop-shadow(0 8px 10px rgba(0,0,0,.55))'
          : reached ? 'drop-shadow(0 10px 14px rgba(0,0,0,.6))'
            : 'saturate(.35) brightness(.5) drop-shadow(0 8px 10px rgba(0,0,0,.55))',
        animation: claimable ? 'ms-bounce 1.3s ease-in-out infinite' : 'ms-float 3.4s ease-in-out infinite',
      }, m.icon);

      const topCol = claimable ? UI.gold : reached ? '#6f8ac0' : '#3a4360';
      const pillar = el('div', { position: 'relative', width: '96px', height: '72px', marginTop: '-10px' });
      pillar.append(
        el('div', {
          position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%)',
          width: '102px', height: '20px', borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(0,0,0,.5), transparent 70%)', filter: 'blur(2px)',
        }),
        el('div', {
          position: 'absolute', bottom: '0', left: '50%', transform: 'translateX(-50%)',
          width: '82px', height: '56px', borderRadius: '10px 10px 14px 14px',
          background: 'linear-gradient(180deg,#2f3a58 0%,#1d2437 70%,#141a29 100%)',
          boxShadow: 'inset 6px 0 10px rgba(255,255,255,.06), inset -6px 0 12px rgba(0,0,0,.5)',
        }),
        el('div', {
          position: 'absolute', top: '0', left: '50%', transform: 'translateX(-50%)',
          width: '90px', height: '29px', borderRadius: '50% / 46%',
          background: `linear-gradient(160deg, ${topCol}, #3d4a6e)`,
          boxShadow: `inset 0 3px 6px rgba(255,255,255,.35), 0 3px 8px rgba(0,0,0,.4)${claimable ? `,0 0 18px ${UI.gold}66` : ''}`,
        }),
        el('div', {
          position: 'absolute', bottom: '13px', left: '50%', transform: 'translateX(-50%)',
          font: `900 13px/1 'Trebuchet MS',system-ui`, color: 'rgba(238,243,251,.9)',
          textShadow: '0 2px 3px rgba(0,0,0,.65)',
        }, `${(m.need / 1000).toFixed(m.need >= 10000 ? 0 : 1)}km`),
      );

      const reward = el('div', {
        font: '800 12px/1.4', textAlign: 'center', marginTop: '5px',
        color: reached ? '#fff' : 'rgba(238,243,251,.5)',
      }, `<span style="color:${UI.gold}">${m.coins}🪙</span>` +
         (m.keys ? ` <span style="color:${UI.magenta}">${m.keys}🗝️</span>` : '') +
         (m.boards ? ` 🛹${m.boards}` : ''));

      spot.append(crate, pillar, reward,
        el('div', { font: '800 11px/1.3', color: UI.blue, marginTop: '2px' }, m.label));

      if (claimed) {
        spot.append(el('div', { color: UI.green, font: '800 12px/1', marginTop: '4px' }, '✓ 수령 완료'));
      } else if (claimable) {
        const b = button('받기 🎁', () => {
          if (this.save.claimMilestone(i, m.coins, m.keys, m.boards)) {
            this.audio.power();
            this.refresh();
          }
        }, 'magenta');
        b.style.cssText += 'padding:9px 18px;font-size:13px;margin-top:4px';
        spot.append(b);
      } else {
        spot.append(el('div', { font: '800 12px/1', color: 'rgba(238,243,251,.4)', marginTop: '4px' }, '🔒'));
      }
      row.append(spot);
      board.append(row);
    });

    viewport.append(board);
    this.grid.append(viewport);
  }

  private renderAchievements(): void {
    const d = this.save.data;
    for (const a of ACHIEVEMENTS) {
      const cur = a.stat(d);
      const done = cur >= a.goal;
      const claimed = d.claimedAchievements.includes(a.id);
      const pct = Math.min(100, (cur / a.goal) * 100);
      const card = this.card('240px');
      card.append(
        el('div', { display: 'flex', gap: '9px', alignItems: 'center' },
          `<span style="font-size:24px">${a.icon}</span>` +
          `<b style="font:900 15px/1.2 'Trebuchet MS',system-ui">${a.name}</b>`),
        el('div', { font: '700 11px/1', opacity: '0.7' },
          `${Math.min(cur, a.goal).toLocaleString()} / ${a.goal.toLocaleString()}${a.unit ?? ''}`),
        bar(pct, done ? 'green' : 'blue'),
      );
      const reward = `${coinStr(a.coins)}${a.keys ? ` · ${keyStr(a.keys)}` : ''}`;
      if (claimed) card.append(el('div', { color: UI.green, font: '800 13px/1' }, '✓ 수령 완료'));
      else if (done) {
        card.append(button(`보상 ${reward}`, () => {
          this.save.claimAchievement(a.id, a.coins, a.keys ?? 0);
          this.audio.power();
          this.refresh();
        }, 'green'));
      } else card.append(el('div', { font: '800 12px/1', color: UI.gold }, `보상 ${reward}`));
      this.grid.append(card);
    }
  }

  // ── View: SETTINGS ────────────────────────────────────────────────────────
  private viewSettings(): void {
    const wrap = el('div', {
      display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '0.5vh',
      alignItems: 'center', width: '100%',
    });
    wrap.append(this.sectionTitle('⚙️', '설정', '취향에 맞게 조정하세요'));

    const s = this.save.data.settings;
    const toggleRow = (icon: string, label: string, value: () => string, onTap: () => void) => {
      const row = el('button', {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: 'min(430px,94vw)', cursor: 'pointer', pointerEvents: 'auto',
        padding: '13px 16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.14)',
        background: 'linear-gradient(158deg,rgba(40,50,78,0.66),rgba(14,18,32,0.6))',
        color: UI.text, boxShadow: '0 4px 0 rgba(0,0,0,.32),0 8px 16px rgba(0,0,0,.32)',
        transition: 'transform .12s',
      });
      row.addEventListener('pointerdown', () => (row.style.transform = 'translateY(3px)'));
      row.addEventListener('pointerup', () => (row.style.transform = 'none'));
      const sync = () => {
        row.innerHTML =
          `<span style="font:800 14px/1 system-ui">${icon} ${label}</span>` +
          `<span style="font:900 14px/1 'Trebuchet MS',system-ui;color:${UI.gold}">${value()}</span>`;
      };
      sync();
      row.addEventListener('click', () => { onTap(); this.audio.ui(); sync(); });
      return row;
    };

    wrap.append(
      toggleRow('🔊', '사운드', () => (s.muted ? '끔' : '켬'), () => {
        this.save.setMuted(!s.muted);
        this.audio.setMuted(s.muted);
      }),
      toggleRow('🎨', '그래픽 품질', () => (s.quality === 'high' ? '높음' : '낮음'), () => {
        this.save.setQuality(s.quality === 'high' ? 'low' : 'high');
        this.engine.setQuality(s.quality);
      }),
      toggleRow('📳', '진동', () => (s.vibrate ? '켬' : '끔'), () => {
        this.save.patchSettings({ vibrate: !s.vibrate });
      }),
      toggleRow('📷', '화면 흔들림', () => ({ off: '끔', low: '약하게', high: '강하게' }[s.shake]), () => {
        const next = s.shake === 'high' ? 'low' : s.shake === 'low' ? 'off' : 'high';
        this.save.patchSettings({ shake: next });
        this.game.applySettings();
      }),
      toggleRow('🔥', '콤보 표시', () => (s.showCombo ? '켬' : '끔'), () => {
        this.save.patchSettings({ showCombo: !s.showCombo });
        this.game.applySettings();
      }),
      toggleRow('🖐️', '버튼 위치', () => (s.leftHanded ? '왼쪽' : '오른쪽'), () => {
        this.save.patchSettings({ leftHanded: !s.leftHanded });
        this.game.applySettings();
      }),
      toggleRow('💡', '조작 힌트', () => (s.showHints ? '켬' : '끔'), () => {
        this.save.patchSettings({ showHints: !s.showHints });
      }),
      toggleRow('🖥️', 'FPS 표시', () => (s.showFps ? '켬' : '끔'), () => {
        this.save.patchSettings({ showFps: !s.showFps });
        this.game.applySettings();
      }),
    );

    const d = this.save.data;
    const mins = Math.floor(d.totalTime / 60);
    const stats = el('div');
    stats.className = 'ms-card flat';
    stats.style.cssText += 'width:min(430px,94vw);gap:6px;margin-top:4px';
    const row = (l: string, v: string) =>
      `<div style="display:flex;justify-content:space-between;font:700 13px/1.7">
         <span style="opacity:.65">${l}</span><b style="color:${UI.gold}">${v}</b></div>`;
    stats.innerHTML =
      `<div style="font:900 13px/1;letter-spacing:1.5px;opacity:.6;margin-bottom:2px">📊 통계</div>` +
      row('총 질주', `${d.runs.toLocaleString()} 회`) +
      row('누적 시간', `${mins.toLocaleString()} 분`) +
      row('누적 거리', `${Math.floor(d.totalDistance).toLocaleString()} m`) +
      row('누적 코인', `${d.totalCoins.toLocaleString()}`) +
      row('지붕 주행', `${Math.floor(d.stats.roof ?? 0).toLocaleString()} m`) +
      row('점프 / 구르기', `${d.stats.jump ?? 0} / ${d.stats.roll ?? 0}`) +
      row('단어 완성', `${d.huntCompleted} 회`) +
      row('최고 점수', `${d.best.toLocaleString()}`);

    let armed = false;
    const reset = button('🗑️ 데이터 초기화', () => {
      if (!armed) {
        armed = true;
        reset.innerHTML = '⚠️ 한 번 더 누르면 전체 삭제!';
        setTimeout(() => { armed = false; reset.innerHTML = '🗑️ 데이터 초기화'; }, 2500);
        return;
      }
      this.save.wipe();
      location.reload();
    }, 'ghost');
    reset.style.cssText += 'border-color:rgba(255,95,82,.5);color:#ff9086';

    wrap.append(stats, reset, button('← 홈으로', () => this.go('play'), 'ghost'));
    this.content.append(wrap);
  }

  // ── Help sheet ────────────────────────────────────────────────────────────
  private buildHelp(): HTMLDivElement {
    const root = screen(true);
    root.style.display = 'none';
    const panel = el('div');
    panel.className = 'ms-card flat';
    panel.style.cssText += 'width:min(430px,92vw);gap:11px;padding:20px';
    const line = (k: string, v: string) =>
      `<div style="display:flex;gap:10px;align-items:center">
         <span style="min-width:104px;font:900 12px/1.3 'Trebuchet MS',system-ui;color:${UI.gold}">${k}</span>
         <span style="font:700 12px/1.45 system-ui;opacity:.88">${v}</span></div>`;
    panel.innerHTML =
      `<div style="font:900 22px/1 'Trebuchet MS',system-ui;color:${UI.gold};text-align:center">❔ 조작법</div>` +
      `<div style="font:700 11px/1.5 system-ui;opacity:.6;text-align:center;margin-bottom:4px">
         선로를 달리고, 열차를 뛰어넘고, 검표원을 따돌리세요</div>` +
      line('← → / A D / 스와이프', '레인 이동') +
      line('↑ / W / 스페이스 / 위로 스와이프', '점프 — 낮은 장애물과 열차 지붕') +
      line('↓ / S / 아래로 스와이프', '구르기 — 게이트 아래로 통과') +
      line('더블 탭 / Shift / E', '호버보드 소환 (충돌 1회 방어)') +
      line('Esc / P', '일시정지') +
      `<div style="height:1px;background:rgba(255,255,255,.12);margin:6px 0"></div>` +
      `<div style="font:900 13px/1 'Trebuchet MS',system-ui;color:${UI.blue}">파워업</div>` +
      line('🧲 코인 자석', '주변 코인을 빨아들입니다') +
      line('✖️ 2배 점수', '점수 배율 2배') +
      line('👟 슈퍼 스니커즈', '점프 높이 대폭 상승') +
      line('🚀 제트팩', '하늘로 날아 모든 장애물 통과') +
      `<div style="height:1px;background:rgba(255,255,255,.12);margin:6px 0"></div>` +
      `<div style="font:900 13px/1 'Trebuchet MS',system-ui;color:${UI.magenta}">수집품</div>` +
      line('🔤 글자', `${HUNT_WORD}를 완성하면 열쇠와 코인 보상`) +
      line('🗝️ 열쇠', '부활 · 프리미엄 캐릭터/보드 구매') +
      line('❓ 미스터리 박스', '무작위 보상') +
      `<div style="height:1px;background:rgba(255,255,255,.12);margin:6px 0"></div>` +
      `<div style="font:900 13px/1 'Trebuchet MS',system-ui;color:${UI.green}">스타일 체인</div>` +
      line('🌀 긴 체공', '오래 떠 있다가 착지하면 체인 +1') +
      line('🚃 지붕 착지', '열차 지붕에 올라타면 체인 +1') +
      line('😮 니어미스', '장애물을 아슬아슬하게 스치면 체인 +1') +
      `<div style="font:700 11px/1.5 system-ui;opacity:.8">
         체인이 끊길 때 <b style="color:#ff8a1f">체인²×25</b>의 보너스 점수를 한 번에 받습니다.</div>` +
      `<div style="height:1px;background:rgba(255,255,255,.12);margin:6px 0"></div>` +
      `<div style="font:700 12px/1.6 system-ui;opacity:.88">
         🚨 검표원과 개는 출발 직후와 <b style="color:${UI.red}">휘청</b>일 때만 따라붙고,
         깨끗하게 달리면 화면 밖으로 떨어집니다. 회복 전에 한 번 더 부딪히면 붙잡힙니다.</div>` +
      `<div style="font:700 12px/1.6 system-ui;opacity:.88;margin-top:4px">
         🎫 질주할 때마다 <b style="color:${UI.green}">XP</b>가 쌓여 등급이 오르고,
         등급이 오를 때마다 코인과 열쇠를 받습니다.</div>`;
    const close = button('닫기', () => show(this.help, false), 'ghost');
    root.append(panel, close);
    root.addEventListener('click', (e) => { if (e.target === root) show(this.help, false); });
    return root;
  }

  // ── Pause ─────────────────────────────────────────────────────────────────
  private buildPause(): HTMLDivElement {
    const root = screen(true);
    const panel = el('div', {
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px',
      animation: 'ms-popin .3s cubic-bezier(.34,1.5,.5,1) both',
    });
    panel.append(
      el('div', { fontSize: '48px', animation: 'ms-float 3s ease-in-out infinite' }, '⏸️'),
      el('div', { font: `900 34px/1 'Trebuchet MS',system-ui`, color: UI.gold }, '일시정지'),
      button('▶ 계속하기', () => this.game.resume(), 'green'),
      button('다시 시작', () => this.startRun(), 'ghost'),
      button('❔ 조작법', () => show(this.help, true), 'ghost'),
      button('홈으로', () => this.toHome(), 'ghost'),
    );
    root.append(panel);
    return root;
  }

  // ── Results ───────────────────────────────────────────────────────────────
  private buildGameOver(): HTMLDivElement {
    const root = screen(false);
    root.style.cssText +=
      `justify-content:space-between;padding:calc(env(safe-area-inset-top,0px) + 22px) 14px ` +
      `calc(env(safe-area-inset-bottom,0px) + 16px);` +
      `background:linear-gradient(170deg,rgba(6,12,30,.88) 0%,rgba(26,20,64,.7) 40%,` +
      `rgba(90,26,74,.5) 68%,rgba(255,150,60,.42) 100%);backdrop-filter:blur(3px)`;
    this.gameoverBody = el('div', {
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'space-between', width: '100%', height: '100%',
    });
    root.append(this.gameoverBody);
    return root;
  }

  private renderGameOver(): void {
    const r = this.game.getRunResult();
    const d = this.save.data;
    const mode = MODES.find((m) => m.id === r.mode) ?? MODES[0];
    const best = this.save.bestFor(r.mode);
    this.gameoverBody.innerHTML = '';

    const top = el('div', { textAlign: 'center', animation: 'ms-popin .45s cubic-bezier(.34,1.5,.5,1) both' });
    const isRecord = r.isBest && r.score > 0;
    top.innerHTML =
      `<div style="font:900 clamp(34px,9vw,56px)/1 'Trebuchet MS',system-ui;
        background:linear-gradient(115deg,${UI.blue},${UI.magenta} 50%,${UI.gold});
        -webkit-background-clip:text;background-clip:text;color:transparent;
        filter:drop-shadow(0 4px 16px rgba(255,120,180,.42))">${isRecord ? 'NEW RECORD!' : 'GAME OVER'}</div>` +
      `<div style="font:800 12px/1.7 system-ui;opacity:.8;letter-spacing:2px">${mode.icon} ${mode.name}` +
      (r.rank >= 0 && r.rank < 8 ? ` · 🏆 TOP ${r.rank + 1}` : '') + `</div>` +
      (isRecord
        ? `<div style="font:900 16px/1.6 'Trebuchet MS',system-ui;color:${UI.gold};
             animation:ms-bounce 1.2s ease-in-out infinite">🏆 최고 기록 경신!</div>`
        : '');

    const spacer = el('div', { flex: '1' });

    const bottom = el('div', {
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
      animation: 'ms-slideup .42s ease both', width: '100%',
    });

    const statsBar = el('div', { display: 'flex', gap: '7px', flexWrap: 'wrap', justifyContent: 'center' });
    const chip = (icon: string, label: string, value: string, color = '#fff') => {
      const c = el('div', { flexDirection: 'column', gap: '2px', padding: '8px 14px' });
      c.className = 'ms-chip';
      c.innerHTML =
        `<span style="font:700 9px/1 system-ui;opacity:.6;letter-spacing:1px">${icon} ${label}</span>` +
        `<span style="font:900 17px/1 'Trebuchet MS',system-ui;color:${color}">${value}</span>`;
      return c;
    };
    statsBar.append(
      chip('⭐', 'SCORE', r.score.toLocaleString(), UI.gold),
      chip('✖️', '배율', `×${r.multiplier}`, UI.green),
      chip('🪙', '코인', `${r.coins}`, UI.gold),
      chip('📏', '거리', `${r.distance}m`),
      chip('🏆', '최고', best.toLocaleString()),
    );
    if (r.keys > 0) statsBar.append(chip('🗝️', '열쇠', `+${r.keys}`, UI.magenta));
    if (r.letters > 0) statsBar.append(chip('🔤', '글자', `+${r.letters}`, UI.blue));
    if (r.bestChain >= 2) statsBar.append(chip('🔥', '스타일', `×${r.bestChain}`, '#ff8a1f'));

    // ── XP + rank: the always-there progression read, and the promotion
    //    celebration when this run pushed the player over a threshold. ──
    const rank = rankFor(d.xp);
    const next = nextRank(d.xp);
    const xpRow = el('div');
    xpRow.className = 'ms-card flat';
    xpRow.style.cssText +=
      'width:min(440px,94vw);flex-direction:row;align-items:center;gap:10px;padding:8px 12px';
    xpRow.append(el('div', {
      width: '34px', height: '34px', flexShrink: '0', borderRadius: '11px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
      border: `2px solid ${UI.line}`,
      background: `linear-gradient(180deg, ${rank.color}, ${rank.color}88 60%, #1b2338)`,
      boxShadow: '0 3px 0 rgba(8,12,24,.9), inset 0 2px 0 rgba(255,255,255,.4)',
    }, rank.icon));
    const xpInfo = el('div', { flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '4px' });
    const xpTop = el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' });
    xpTop.innerHTML =
      `<span style="font:900 13px/1 'Trebuchet MS',system-ui;color:${rank.color}">Lv.${rank.level} ${rank.name}</span>` +
      `<span style="font:900 12px/1 'Trebuchet MS',system-ui;color:${UI.green}">+${r.xp} XP</span>`;
    const xpBar = bar(rankProgress(d.xp) * 100, 'green');
    xpBar.style.height = '9px';
    xpInfo.append(xpTop, xpBar);
    if (next) {
      xpInfo.append(el('div', { font: '700 9px/1 ui-monospace,monospace', color: 'rgba(238,243,251,.55)' },
        `다음 등급까지 ${(next.need - d.xp).toLocaleString()} XP`));
    }
    xpRow.append(xpInfo);
    bottom.append(xpRow);

    for (const p of r.promotions) {
      const promo = el('div');
      promo.className = 'ms-chip';
      promo.style.cssText +=
        `font-size:13px;color:#fff;animation:ms-bounce 1.4s ease-in-out infinite;`
        + `background:linear-gradient(180deg,#ffe27a,${UI.gold} 45%,#eda312);border-color:${UI.line}`;
      promo.innerHTML = `<span style="font-size:17px">${p.icon}</span>`
        + `<b style="color:#2a1a02">등급 상승! Lv.${p.level} ${p.name}</b>`
        + `<span style="color:#3a2604;font-weight:800">🪙+${p.coins}${p.keys ? ` 🗝️+${p.keys}` : ''}</span>`;
      bottom.append(promo);
    }

    // Mission summary for this run.
    if (r.missionsDone.length || r.setsCleared) {
      const missions = el('div');
      missions.className = 'ms-chip';
      missions.style.cssText += `font-size:12px;color:${UI.green}`;
      missions.innerHTML = `📋 미션 ${r.missionsDone.length}개 완료` +
        (r.setsCleared ? ` · 세트 ${r.setsCleared}회 클리어 (상시 배율 +${r.setsCleared})` : '');
      bottom.append(missions);
    }

    const btns = el('div', { display: 'flex', gap: '9px', flexWrap: 'wrap', justifyContent: 'center' });
    const cost = REVIVE_KEYS[Math.min(this.revives, REVIVE_KEYS.length - 1)];
    if (mode.reviveAllowed) {
      const revive = button(`🗝️ ${cost} 부활`, () => {
        if (!this.save.spendKeys(cost)) {
          this.audio.ui();
          return;
        }
        this.revives++;
        this.audio.power();
        this.game.revive();
      }, 'green');
      revive.disabled = d.keys < cost;
      btns.append(revive);
    } else {
      btns.append(el('div', {
        font: '800 12px/2.9 system-ui', color: 'rgba(238,243,251,.6)', padding: '0 10px',
      }, '💀 하드코어 — 부활 불가'));
    }
    if (d.inventory.mystery > 0) {
      const my = button(`❓ 상자 열기 (${d.inventory.mystery})`, () => {
        const res = this.game.openCarriedMystery();
        if (res) {
          this.audio.power();
          my.innerHTML = `${res.icon} ${res.text}`;
          my.disabled = true;
          this.renderHeader();
        }
      }, 'magenta');
      btns.append(my);
    }
    btns.append(button('다시 도전 ▶', () => this.startRun()), button('홈으로', () => this.toHome(), 'ghost'));

    bottom.append(statsBar, btns);
    this.gameoverBody.append(top, spacer, bottom);
  }
}

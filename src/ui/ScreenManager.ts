import type { AudioManager } from '../audio/AudioManager';
import type { Engine } from '../core/Engine';
import { GameState } from '../core/GameStateManager';
import type { RunnerGame } from '../core/RunnerGame';
import { ACHIEVEMENTS, DAILY } from '../data/achievements';
import { CHARACTERS } from '../data/characters';
import { CONSUMABLES } from '../data/consumables';
import type { GameMode, SaveManager } from '../data/SaveManager';
import { UPGRADES } from '../data/upgrades';
import { button, coinStr, el, gemStr, NEON, screen, show, tab } from './uikit';

const REVIVE_COST = 80;
/** Shop sub-tabs (inside the SHOP nav tab). */
type Tab = 'characters' | 'items' | 'upgrades' | 'daily' | 'achievements';
/** Instagram-style bottom navigation tabs. */
type Nav = 'play' | 'shop' | 'rewards' | 'settings';

/**
 * Owns every full-screen overlay and the flow between them, driven off the
 * game's {@link GameState}. The home screen carries the brand, the live
 * character/ability tag, mode select (Endless/Challenge), the big Play button
 * and a 5-tab shop (characters / items / upgrades / daily / achievements). Also
 * renders the pause sheet, settings and the rich game-over screen. All buying/
 * equipping mutates the {@link SaveManager} and refreshes the live preview.
 */
export class ScreenManager {
  /** The single menu app-shell (header + content + bottom tab bar). */
  private readonly menu: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly gameover: HTMLDivElement;

  private header!: HTMLDivElement;
  private content!: HTMLDivElement;
  private navbar!: HTMLDivElement;
  private shopBody!: HTMLDivElement;
  private gameoverBody!: HTMLDivElement;

  private mode: GameMode = 'endless';
  private nav: Nav = 'play';
  private tabSel: Tab = 'characters';
  private reviveUsed = false;

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
    this.reviveUsed = false;
    this.audio.unlock();
    this.audio.startBgm();
    this.audio.ui();
    this.game.setMode(this.mode);
    this.game.beginRun();
  }
  private toHome(): void {
    this.reviveUsed = false;
    this.audio.stopBgm();
    this.nav = 'play';
    this.game.toMenu();
  }

  // ── Instagram-style app shell ──────────────────────────────────────────────
  private buildMenuShell(): HTMLDivElement {
    const root = screen(false);
    root.style.cssText +=
      'justify-content:stretch;align-items:stretch;gap:0;padding:0';

    // Top header: brand + wallet chips.
    this.header = el('div', {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: 'calc(env(safe-area-inset-top,0px) + 14px) 18px 12px',
      borderBottom: '1px solid rgba(255,210,180,0.12)', flexShrink: '0',
    });

    // Scrollable content area (one view per nav tab).
    this.content = el('div', {
      flex: '1', overflowY: 'auto', padding: '14px 14px 18px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px',
    });
    this.content.className = 'nd-scroll';

    // Bottom nav bar (icon tabs).
    this.navbar = el('div', {
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      padding: '8px 6px calc(env(safe-area-inset-bottom,0px) + 8px)',
      borderTop: '1px solid rgba(255,210,180,0.16)',
      background: 'rgba(14,8,28,0.66)', backdropFilter: 'blur(12px)', flexShrink: '0',
    });

    root.append(this.header, this.content, this.navbar);
    return root;
  }

  private renderMenu(): void {
    this.renderHeader();
    this.renderNavbar();
    this.content.scrollTop = 0;
    this.content.innerHTML = '';
    ({
      play: () => this.viewPlay(),
      shop: () => this.viewShop(),
      rewards: () => this.viewRewards(),
      settings: () => this.viewSettings(),
    })[this.nav]();
  }

  private go(nav: Nav): void {
    if (this.nav === nav) return;
    this.nav = nav;
    this.audio.ui();
    this.renderMenu();
  }

  /** Re-render the active shop/rewards view in place (after a purchase). */
  private refreshShop(): void {
    this.renderHeader();
    if (this.nav === 'rewards') this.viewRewards();
    else this.viewShop();
  }

  private renderHeader(): void {
    const d = this.save.data;
    this.header.innerHTML =
      `<div style="font:900 22px/1 'Trebuchet MS',system-ui;
        background:linear-gradient(120deg,${NEON.gold},${NEON.pink},#8a7bff);
        -webkit-background-clip:text;background-clip:text;color:transparent">SUNSET RUNNER</div>` +
      `<div style="display:flex;gap:8px">
        <span class="nd-chip" style="color:${NEON.gold};font-size:14px">${coinStr(d.coins)}</span>
        <span class="nd-chip" style="color:#9ad8ff;font-size:14px">${gemStr(d.mileage)}</span>
      </div>`;
  }

  private renderNavbar(): void {
    this.navbar.innerHTML = '';
    const dot = this.save.canClaimDaily() ||
      ACHIEVEMENTS.some((a) => a.stat(this.save.data) >= a.goal && !this.save.data.claimedAchievements.includes(a.id));
    const items: Array<[Nav, string, string, boolean]> = [
      ['play', '🏠', '홈', false],
      ['shop', '🛒', '상점', false],
      ['rewards', '🎁', '보상', dot],
      ['settings', '⚙️', '설정', false],
    ];
    for (const [nav, icon, label, badge] of items) {
      const on = this.nav === nav;
      const b = el('button', {
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
        background: 'none', border: 'none', cursor: 'pointer', pointerEvents: 'auto',
        padding: '4px 14px', position: 'relative', transition: 'transform .1s',
      });
      b.innerHTML =
        `<span style="font-size:23px;filter:${on ? 'none' : 'grayscale(.5) opacity(.7)'}">${icon}</span>` +
        `<span style="font:800 10px/1 system-ui;letter-spacing:1px;color:${on ? NEON.gold : 'rgba(255,242,224,.6)'}">${label}</span>` +
        (badge ? `<span style="position:absolute;top:2px;right:10px;width:8px;height:8px;border-radius:50%;background:#ff6b8a;box-shadow:0 0 8px #ff6b8a"></span>` : '');
      b.addEventListener('click', () => this.go(nav));
      this.navbar.append(b);
    }
  }

  // ── View: PLAY (hero + mode select + play button) ──────────────────────────
  private viewPlay(): void {
    const d = this.save.data;
    const c = CHARACTERS.find((x) => x.id === d.selected)!;

    const hero = el('div', { textAlign: 'center', marginTop: '2vh', animation: 'nd-slideup .4s ease both' });
    hero.append(
      el('div', {
        font: `900 clamp(36px,9vw,76px)/0.92 'Trebuchet MS',system-ui`, letterSpacing: '1px',
        background: `linear-gradient(120deg,${NEON.gold},${NEON.pink},#8a7bff)`,
        webkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        filter: 'drop-shadow(0 4px 18px rgba(255,126,179,.4))', animation: 'nd-float 4s ease-in-out infinite',
      }, 'SUNSET<span style="opacity:.95">RUNNER</span>'),
      el('div', { font: '700 14px/1 system-ui', color: NEON.pink, opacity: '0.9', marginTop: '6px', letterSpacing: '3px' },
        '석양을 달리는 무한 질주'),
    );

    // Character preview card (live 3D runner shows behind).
    const tagc = el('div', { animation: 'nd-slideup .42s ease both' });
    tagc.className = 'nd-card sel';
    tagc.style.cssText += 'align-items:center;text-align:center;padding:14px 26px;min-width:240px';
    tagc.innerHTML =
      `<div style="font:800 11px/1 system-ui;opacity:.65;letter-spacing:3px">선택한 캐릭터</div>` +
      `<div style="font:900 26px/1.2 'Trebuchet MS',system-ui;color:${NEON.gold}">${c.name}</div>` +
      `<div style="font:700 13px/1.3 system-ui;color:#fff;opacity:.92">${c.blurb}</div>`;
    const swap = button('캐릭터 변경 ▸', () => { this.tabSel = 'characters'; this.go('shop'); }, 'ghost');
    swap.style.cssText += 'margin-top:4px;font-size:13px;padding:8px 16px';
    tagc.append(swap);

    // Twin mode cards.
    const modes = el('div', { display: 'flex', gap: '12px', animation: 'nd-slideup .44s ease both' });
    const mk = (m: GameMode, icon: string, label: string, sub: string) => {
      const card = el('div');
      card.className = `nd-card${this.mode === m ? ' sel' : ''}`;
      card.style.cssText += 'cursor:pointer;align-items:center;text-align:center;width:150px;gap:3px';
      card.innerHTML =
        `<div style="font-size:30px">${icon}</div>` +
        `<div style="font:800 16px/1 'Trebuchet MS',system-ui">${label}</div>` +
        `<div style="font:600 11px/1.2 system-ui;opacity:.7">${sub}</div>`;
      card.addEventListener('click', () => { this.mode = m; this.audio.ui(); this.renderMenu(); });
      return card;
    };
    modes.append(
      mk('endless', '♾️', '무한 모드', `최고 ${d.best}`),
      mk('challenge', '⏱️', '챌린지', `최고 ${d.bestChallenge}`),
    );

    const play = button('게임 시작 ▶', () => this.startRun(), 'pink');
    play.style.font = `900 25px/1 'Trebuchet MS',system-ui`;
    play.style.padding = '19px 64px';
    play.style.animation = 'nd-breathe 2.4s ease-in-out infinite';

    this.content.append(hero, tagc, modes, play);
  }

  // ── View: SHOP (sub-tabs: characters / items / upgrades) ────────────────────
  private viewShop(): void {
    if (this.tabSel === 'daily' || this.tabSel === 'achievements') this.tabSel = 'characters';
    const tabs: Array<[Tab, string]> = [
      ['characters', '🛒 캐릭터'], ['items', '🎒 아이템'], ['upgrades', '⬆️ 강화'],
    ];
    const tabRow = el('div', { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' });
    for (const [t, label] of tabs) {
      const b = tab(label, () => { this.tabSel = t; this.viewShop(); });
      if (this.tabSel === t) b.className = 'nd-tab on';
      tabRow.append(b);
    }
    this.shopBody = el('div', {
      width: '100%', display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', padding: '4px',
    });
    this.content.innerHTML = '';
    this.content.append(tabRow, this.shopBody);
    this.cardIndex = 0;
    ({
      characters: () => this.renderCharacters(),
      items: () => this.renderItems(),
      upgrades: () => this.renderUpgrades(),
    } as Record<string, () => void>)[this.tabSel]();
  }

  // ── View: REWARDS (daily + achievements) ────────────────────────────────────
  private viewRewards(): void {
    const sub: Array<[Tab, string]> = [['daily', '🎁 출석'], ['achievements', '🏆 업적']];
    if (this.tabSel !== 'daily' && this.tabSel !== 'achievements') this.tabSel = 'daily';
    const tabRow = el('div', { display: 'flex', gap: '8px', justifyContent: 'center' });
    for (const [t, label] of sub) {
      const b = tab(label, () => { this.tabSel = t; this.viewRewards(); });
      if (this.tabSel === t) b.className = 'nd-tab on';
      tabRow.append(b);
    }
    this.shopBody = el('div', {
      width: '100%', display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', padding: '4px',
    });
    this.content.innerHTML = '';
    this.content.append(tabRow, this.shopBody);
    this.cardIndex = 0;
    if (this.tabSel === 'daily') this.renderDaily();
    else this.renderAchievements();
  }

  // ── View: SETTINGS ──────────────────────────────────────────────────────────
  private viewSettings(): void {
    const wrap = el('div', { display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '2vh', alignItems: 'center' });
    wrap.append(el('div', { font: `900 26px/1 'Trebuchet MS',system-ui`, color: NEON.gold }, '⚙️ 설정'));
    const muteBtn = button('', () => {
      const n = !this.save.data.settings.muted;
      this.save.setMuted(n); this.audio.setMuted(n); syncM();
    });
    const syncM = () => { muteBtn.innerHTML = this.save.data.settings.muted ? '🔇 사운드: 끔' : '🔊 사운드: 켬'; };
    syncM();
    const qBtn = button('', () => {
      const n = this.save.data.settings.quality === 'high' ? 'low' : 'high';
      this.save.setQuality(n); this.engine.setQuality(n); syncQ();
    }, 'ghost');
    const syncQ = () => { qBtn.innerHTML = `그래픽: ${this.save.data.settings.quality === 'high' ? '높음' : '낮음'}`; };
    syncQ();
    const stats = el('div');
    stats.className = 'nd-card';
    stats.style.cssText += 'width:min(420px,90vw);gap:6px;margin-top:6px';
    const d = this.save.data;
    const row = (l: string, v: string) =>
      `<div style="display:flex;justify-content:space-between"><span style="opacity:.7">${l}</span><b style="color:${NEON.gold}">${v}</b></div>`;
    stats.innerHTML =
      row('총 플레이', `${d.runs} 회`) + row('누적 거리', `${Math.floor(d.totalDistance)} m`) +
      row('누적 코인', `${d.totalCoins}`) + row('최고 점수', `${d.best}`);
    wrap.append(muteBtn, qBtn, stats);
    this.content.append(wrap);
  }

  private cardIndex = 0;
  private card(): HTMLDivElement {
    const c = el('div');
    c.className = 'nd-card';
    c.style.width = '190px';
    // Staggered entrance for a lively shop.
    c.style.animation = `nd-slideup .35s ease both`;
    c.style.animationDelay = `${(this.cardIndex++ % 8) * 0.035}s`;
    return c;
  }

  private renderCharacters(): void {
    const d = this.save.data;
    for (const c of CHARACTERS) {
      const owned = this.save.owns(c.id);
      const selected = d.selected === c.id;
      const card = this.card();
      if (selected) card.className = 'nd-card sel';
      const swatch = `#${c.colors.shirt.toString(16).padStart(6, '0')}`;
      card.append(
        el('div', { font: '800 19px/1', color: swatch }, c.name),
        el('div', { font: '600 12px/1.4', opacity: '0.9', minHeight: '34px' }, c.blurb),
      );
      if (selected) card.append(el('div', { color: NEON.gold, font: '700 14px/1', textAlign: 'center' }, '✓ 선택됨'));
      else if (owned) card.append(button('선택', () => { this.save.select(c.id); this.game.refreshLoadout(); this.refreshShop(); }, 'ghost'));
      else {
        const price = c.gem ? gemStr(c.price) : coinStr(c.price);
        const b = button(`구매 ${price}`, () => {
          const ok = c.gem ? this.save.spendMileage(c.price) : this.save.spend(c.price);
          if (ok) { this.save.buy(c.id); this.save.select(c.id); this.game.refreshLoadout(); this.audio.power(); }
          this.refreshShop();
        }, 'pink');
        b.disabled = c.gem ? d.mileage < c.price : d.coins < c.price;
        card.append(b);
      }
      this.shopBody.append(card);
    }
  }

  private renderItems(): void {
    for (const item of CONSUMABLES) {
      const have = this.save.data.inventory[item.id];
      const card = this.card();
      card.append(
        el('div', { font: '800 19px/1' }, `${item.emoji} ${item.name}`),
        el('div', { font: '600 12px/1.4', opacity: '0.9', minHeight: '34px' }, item.desc),
        el('div', { font: '700 13px/1', color: NEON.gold }, `보유: ${have}`),
      );
      const b = button(`구매 ${coinStr(item.price)}`, () => {
        if (this.save.spend(item.price)) { this.save.addItem(item.id); this.audio.power(); }
        this.refreshShop();
      }, 'pink');
      b.disabled = this.save.data.coins < item.price;
      card.append(b);
      this.shopBody.append(card);
    }
  }

  private renderUpgrades(): void {
    for (const u of UPGRADES) {
      const lvl = this.save.upgradeLevel(u.id);
      const card = this.card();
      card.append(
        el('div', { font: '800 18px/1' }, `${u.emoji} ${u.name}`),
        el('div', { font: '600 12px/1.3', opacity: '0.85' }, u.desc),
        el('div', { font: '700 13px/1', color: NEON.gold }, `Lv ${lvl}/${u.max}`),
      );
      if (lvl >= u.max) card.append(el('div', { color: NEON.gold, font: '700 13px/1' }, 'MAX'));
      else {
        const cost = u.cost(lvl);
        const b = button(`강화 ${coinStr(cost)}`, () => {
          if (this.save.spend(cost)) { this.save.raiseUpgrade(u.id); this.game.refreshLoadout(); this.audio.power(); }
          this.refreshShop();
        });
        b.disabled = this.save.data.coins < cost;
        card.append(b);
      }
      this.shopBody.append(card);
    }
  }

  private renderDaily(): void {
    const d = this.save.data;
    const wrap = el('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', width: '100%' });
    const row = el('div', { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' });
    DAILY.forEach((r, i) => {
      const claimed = i < d.dailyStreak;
      const isNext = i === d.dailyStreak % 7 && this.save.canClaimDaily();
      const cell = el('div');
      cell.className = `nd-card${isNext ? ' sel' : ''}`;
      cell.style.cssText += 'width:88px;align-items:center;text-align:center;gap:4px';
      cell.style.opacity = claimed ? '0.5' : '1';
      cell.innerHTML =
        `<div style="font:700 11px/1;opacity:.7">DAY ${i + 1}</div>` +
        `<div style="font-size:26px">${r.ic}</div>` +
        `<div style="font:700 12px/1;color:${NEON.gold}">${r.coins ? r.coins + '🪙' : r.mile + '💎'}</div>` +
        (claimed ? `<div style="font:700 11px/1;color:#6bffb0">✓</div>` : '');
      row.append(cell);
    });
    wrap.append(row);
    const claimBtn = button(this.save.canClaimDaily() ? '오늘 보상 받기 🎁' : '내일 다시 오세요', () => {
      if (!this.save.canClaimDaily()) return;
      const r = DAILY[d.dailyStreak % 7];
      this.save.claimDaily(r.coins, r.mile);
      this.audio.power();
      this.refreshShop();
    }, 'pink');
    claimBtn.disabled = !this.save.canClaimDaily();
    wrap.append(claimBtn);
    this.shopBody.append(wrap);
  }

  private renderAchievements(): void {
    const d = this.save.data;
    for (const a of ACHIEVEMENTS) {
      const cur = a.stat(d);
      const done = cur >= a.goal;
      const claimed = d.claimedAchievements.includes(a.id);
      const pct = Math.min(100, Math.round((cur / a.goal) * 100));
      const card = this.card();
      card.style.width = '240px';
      card.append(
        el('div', { font: '800 16px/1' }, a.name),
        el('div', { font: '600 12px/1', opacity: '0.8' }, `${Math.min(cur, a.goal)} / ${a.goal}`),
        el('div', { height: '7px', borderRadius: '4px', background: 'rgba(255,255,255,.12)', overflow: 'hidden' },
          `<div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${NEON.gold},${NEON.pink})"></div>`),
      );
      if (claimed) card.append(el('div', { color: '#6bffb0', font: '700 13px/1' }, '✓ 완료'));
      else if (done) {
        card.append(button(`보상 ${coinStr(a.reward)}`, () => { this.save.claimAchievement(a.id, a.reward); this.audio.power(); this.refreshShop(); }, 'pink'));
      } else card.append(el('div', { font: '700 13px/1', color: NEON.gold }, `+${a.reward}🪙`));
      this.shopBody.append(card);
    }
  }


  // ── Pause ─────────────────────────────────────────────────────────────────────
  private buildPause(): HTMLDivElement {
    const root = screen(true);
    root.append(
      el('div', { fontSize: '52px', animation: 'nd-float 3s ease-in-out infinite' }, '⏸️'),
      el('div', { font: `900 38px/1 'Trebuchet MS',system-ui`, color: NEON.gold }, '일시정지'),
      button('▶ 계속하기', () => this.game.resume(), 'pink'),
      button('다시 시작', () => this.startRun(), 'ghost'),
      button('홈으로', () => this.toHome(), 'ghost'),
    );
    return root;
  }

  // ── Game over ───────────────────────────────────────────────────────────────────
  private buildGameOver(): HTMLDivElement {
    const root = screen(true);
    this.gameoverBody = el('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' });
    root.append(this.gameoverBody);
    return root;
  }

  private renderGameOver(): void {
    const r = this.game.getRunResult();
    const d = this.save.data;
    const modeLabel = r.mode === 'challenge' ? '⏱️ 챌린지' : '♾️ 무한 모드';
    const best = r.mode === 'challenge' ? d.bestChallenge : d.best;
    this.gameoverBody.innerHTML = '';
    this.gameoverBody.style.animation = 'nd-slideup .4s ease both';

    this.gameoverBody.append(
      el('div', { font: `900 50px/1 'Trebuchet MS',system-ui`, color: NEON.pink, textShadow: `0 2px 24px ${NEON.pink}aa` }, 'GAME OVER'),
      el('div', { font: '800 13px/1 system-ui', opacity: '0.8', letterSpacing: '2px' }, modeLabel),
    );

    // Stats panel card.
    const panel = el('div');
    panel.className = 'nd-card';
    panel.style.cssText += 'align-items:center;gap:6px;padding:18px 30px;margin-top:4px';
    const stat = (label: string, value: string, color = '#fff') =>
      `<div style="display:flex;justify-content:space-between;gap:30px;width:200px">
        <span style="opacity:.7;font:700 13px/1.6 system-ui">${label}</span>
        <span style="font:800 16px/1.6 'Trebuchet MS',system-ui;color:${color}">${value}</span></div>`;
    panel.innerHTML =
      `<div style="font:900 40px/1 'Trebuchet MS',system-ui;color:${NEON.gold}">${r.score}</div>` +
      `<div style="font:700 11px/1 system-ui;opacity:.6;letter-spacing:2px;margin-bottom:6px">SCORE</div>` +
      stat('🪙 코인', `${r.coins}`, NEON.gold) +
      stat('📏 거리', `${Math.floor(r.distance)} m`) +
      stat('🏆 최고', `${best}`) +
      stat('💎 마일리지', `+${r.mileage}`, '#9ad8ff');
    this.gameoverBody.append(panel);

    if (r.isBest && r.score > 0) {
      this.gameoverBody.append(
        el('div', { color: NEON.gold, font: `900 20px/1 'Trebuchet MS',system-ui`, animation: 'nd-pop .5s ease both' }, '🏆 신기록 달성!'),
      );
    }

    const btns = el('div', { display: 'flex', gap: '12px', marginTop: '10px', flexWrap: 'wrap', justifyContent: 'center' });
    const canRevive = !this.reviveUsed && d.coins >= REVIVE_COST;
    const revive = button(`💖 부활 ${coinStr(REVIVE_COST)}`, () => {
      if (this.reviveUsed || !this.save.spend(REVIVE_COST)) return;
      this.reviveUsed = true;
      this.game.revive();
    }, 'pink');
    revive.disabled = !canRevive;
    btns.append(revive, button('다시 도전 ▶', () => this.startRun()), button('홈으로', () => this.toHome(), 'ghost'));
    this.gameoverBody.append(btns);
  }
}

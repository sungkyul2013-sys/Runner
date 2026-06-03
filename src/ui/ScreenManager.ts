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
type Tab = 'characters' | 'items' | 'upgrades' | 'daily' | 'achievements';

/**
 * Owns every full-screen overlay and the flow between them, driven off the
 * game's {@link GameState}. The home screen carries the brand, the live
 * character/ability tag, mode select (Endless/Challenge), the big Play button
 * and a 5-tab shop (characters / items / upgrades / daily / achievements). Also
 * renders the pause sheet, settings and the rich game-over screen. All buying/
 * equipping mutates the {@link SaveManager} and refreshes the live preview.
 */
export class ScreenManager {
  private readonly home: HTMLDivElement;
  private readonly shop: HTMLDivElement;
  private readonly settings: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly gameover: HTMLDivElement;

  private homeBody!: HTMLDivElement;
  private shopBody!: HTMLDivElement;
  private shopTabs!: HTMLDivElement;
  private gameoverBody!: HTMLDivElement;

  private mode: GameMode = 'endless';
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

    this.home = this.buildHome();
    this.shop = this.buildShop();
    this.settings = this.buildSettings();
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
    show(this.home, s === GameState.MENU);
    show(this.pause, s === GameState.PAUSED);
    show(this.gameover, s === GameState.GAMEOVER);
    show(this.shop, false);
    show(this.settings, false);
    if (s === GameState.MENU) this.renderHome();
    if (s === GameState.GAMEOVER) this.renderGameOver();
  }

  private startRun(): void {
    this.reviveUsed = false;
    this.audio.unlock();
    this.audio.startBgm();
    this.audio.ui();
    this.game.setMode(this.mode);
    this.game.startRun();
  }
  private toHome(): void {
    this.reviveUsed = false;
    this.audio.stopBgm();
    this.game.toMenu();
  }

  // ── Home ───────────────────────────────────────────────────────────────────
  private buildHome(): HTMLDivElement {
    const root = screen(false);
    root.style.justifyContent = 'space-between';
    root.style.padding = '6vh 0 4vh';
    this.homeBody = el('div', {
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'space-between', gap: '14px', height: '100%', width: '100%',
    });
    root.append(this.homeBody);
    return root;
  }

  private renderHome(): void {
    const d = this.save.data;
    const c = CHARACTERS.find((x) => x.id === d.selected)!;
    this.homeBody.innerHTML = '';

    // Wallet bar.
    const wallet = el('div', {
      position: 'absolute', top: '14px', left: '0', right: '0',
      display: 'flex', justifyContent: 'space-between', padding: '0 16px',
      font: `800 18px/1 'Trebuchet MS',system-ui`,
    });
    wallet.innerHTML =
      `<span style="color:${NEON.gold}">${coinStr(d.coins)}</span>` +
      `<span style="color:#9ad8ff">${gemStr(d.mileage)}</span>`;

    // Title.
    const top = el('div', { textAlign: 'center', marginTop: '4vh', animation: 'nd-float 4s ease-in-out infinite' });
    top.append(
      el('div', {
        font: `900 clamp(40px,10vw,92px)/0.95 'Trebuchet MS',system-ui`, letterSpacing: '1px',
        background: `linear-gradient(120deg,${NEON.gold},${NEON.pink},#8a7bff)`,
        webkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
      }, 'SUNSET RUNNER'),
      el('div', { font: '700 15px/1 system-ui', color: NEON.pink, opacity: '0.9', marginTop: '4px' },
        '석양을 달리는 무한 질주'),
    );

    // Character tag.
    const tag = el('div', {
      background: 'rgba(22,14,44,0.55)', border: '1px solid rgba(255,210,180,0.3)',
      borderRadius: '16px', padding: '10px 18px', textAlign: 'center', backdropFilter: 'blur(7px)',
    });
    tag.innerHTML =
      `<div style="font:700 12px/1 system-ui;opacity:.7;letter-spacing:2px">CHARACTER</div>` +
      `<div style="font:800 22px/1.3 'Trebuchet MS',system-ui;color:${NEON.gold}">${c.name}</div>` +
      `<div style="font:600 13px/1.3 system-ui;color:#fff;opacity:.9">${c.blurb}</div>`;

    // Mode select.
    const modes = el('div', { display: 'flex', gap: '10px' });
    const mk = (m: GameMode, label: string) => {
      const b = tab(label, () => { this.mode = m; this.renderHome(); });
      if (this.mode === m) b.className = 'nd-tab on';
      b.style.font = `800 15px/1 'Trebuchet MS',system-ui`;
      b.style.padding = '11px 20px';
      return b;
    };
    modes.append(mk('endless', '♾️ 무한 모드'), mk('challenge', '⏱️ 챌린지'));

    // Play button.
    const play = button('게임 시작 ▶', () => this.startRun(), 'pink');
    play.style.font = `900 24px/1 'Trebuchet MS',system-ui`;
    play.style.padding = '18px 60px';
    play.style.animation = 'nd-breathe 2.4s ease-in-out infinite';

    const mid = el('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' });
    mid.append(tag, modes, play);

    // Tab bar to the shop.
    const tabs = el('div', { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' });
    const goShop = (t: Tab) => { this.tabSel = t; show(this.home, false); show(this.shop, true); this.renderShop(); this.audio.ui(); };
    const dailyBadge = this.save.canClaimDaily() ? ' <span style="color:#ff6b8a">!</span>' : '';
    const achBadge = ACHIEVEMENTS.some((a) => a.stat(this.save.data) >= a.goal && !this.save.data.claimedAchievements.includes(a.id)) ? ' <span style="color:#ff6b8a">!</span>' : '';
    tabs.append(
      tab('🛒 캐릭터', () => goShop('characters')),
      tab('🎒 아이템', () => goShop('items')),
      tab('⬆️ 강화', () => goShop('upgrades')),
      tab('🎁 보상' + dailyBadge, () => goShop('daily')),
      tab('🏆 업적' + achBadge, () => goShop('achievements')),
    );

    const bottom = el('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' });
    const settingsBtn = button('⚙ 설정', () => { show(this.home, false); show(this.settings, true); }, 'ghost');
    bottom.append(tabs, settingsBtn,
      el('div', { font: '600 13px/1.5 ui-monospace,monospace', opacity: '0.85', textAlign: 'center' },
        `최고 ${d.best}　·　챌린지 ${d.bestChallenge}　·　런 ${d.runs}`));

    this.homeBody.append(wallet, top, mid, bottom);
  }

  // ── Shop (5 tabs) ────────────────────────────────────────────────────────────
  private buildShop(): HTMLDivElement {
    const root = screen(true);
    root.style.justifyContent = 'flex-start';
    root.style.padding = '4vh 0';
    const bar = el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: 'min(820px,94vw)' });
    bar.append(el('div', { font: `800 26px/1 'Trebuchet MS',system-ui` }, 'SHOP'),
      (this.walletEl = el('div', { font: '700 18px/1 ui-monospace,monospace' })));
    this.shopTabs = el('div', { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', margin: '4px 0' });
    this.shopBody = el('div', {
      width: 'min(820px,94vw)', maxHeight: '60vh', overflowY: 'auto',
      display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', padding: '6px',
    });
    root.append(bar, this.shopTabs, this.shopBody, button('← 뒤로', () => { show(this.shop, false); show(this.home, true); this.renderHome(); }, 'ghost'));
    return root;
  }
  private walletEl!: HTMLDivElement;

  private renderShop(): void {
    const tabs: Array<[Tab, string]> = [
      ['characters', '🛒 캐릭터'], ['items', '🎒 아이템'], ['upgrades', '⬆️ 강화'],
      ['daily', '🎁 보상'], ['achievements', '🏆 업적'],
    ];
    this.shopTabs.innerHTML = '';
    for (const [t, label] of tabs) {
      const b = tab(label, () => { this.tabSel = t; this.renderShop(); });
      if (this.tabSel === t) b.className = 'nd-tab on';
      this.shopTabs.append(b);
    }
    this.walletEl.innerHTML = `${coinStr(this.save.data.coins)}　${gemStr(this.save.data.mileage)}`;
    this.shopBody.innerHTML = '';
    ({
      characters: () => this.renderCharacters(),
      items: () => this.renderItems(),
      upgrades: () => this.renderUpgrades(),
      daily: () => this.renderDaily(),
      achievements: () => this.renderAchievements(),
    })[this.tabSel]();
  }

  private card(): HTMLDivElement {
    const c = el('div');
    c.className = 'nd-card';
    c.style.width = '190px';
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
      else if (owned) card.append(button('선택', () => { this.save.select(c.id); this.game.refreshLoadout(); this.renderShop(); }, 'ghost'));
      else {
        const price = c.gem ? gemStr(c.price) : coinStr(c.price);
        const b = button(`구매 ${price}`, () => {
          const ok = c.gem ? this.save.spendMileage(c.price) : this.save.spend(c.price);
          if (ok) { this.save.buy(c.id); this.save.select(c.id); this.game.refreshLoadout(); this.audio.power(); }
          this.renderShop();
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
        this.renderShop();
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
          this.renderShop();
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
      this.renderShop();
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
        card.append(button(`보상 ${coinStr(a.reward)}`, () => { this.save.claimAchievement(a.id, a.reward); this.audio.power(); this.renderShop(); }, 'pink'));
      } else card.append(el('div', { font: '700 13px/1', color: NEON.gold }, `+${a.reward}🪙`));
      this.shopBody.append(card);
    }
  }

  // ── Settings ────────────────────────────────────────────────────────────────
  private buildSettings(): HTMLDivElement {
    const root = screen(true);
    root.append(el('div', { font: `800 28px/1 'Trebuchet MS',system-ui` }, '설정'));
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
    root.append(muteBtn, qBtn, button('← 뒤로', () => { show(this.settings, false); show(this.home, true); this.renderHome(); }, 'ghost'));
    return root;
  }

  // ── Pause ─────────────────────────────────────────────────────────────────────
  private buildPause(): HTMLDivElement {
    const root = screen(true);
    root.append(
      el('div', { font: `900 36px/1 'Trebuchet MS',system-ui` }, '일시정지'),
      button('계속하기', () => this.game.resume(), 'pink'),
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
    this.gameoverBody.append(
      el('div', { font: `900 46px/1 'Trebuchet MS',system-ui`, color: NEON.pink, textShadow: `0 2px 20px ${NEON.pink}aa` }, 'GAME OVER'),
      el('div', { font: '700 14px/1 system-ui', opacity: '0.85' }, modeLabel),
      el('div', { font: `900 36px/1 'Trebuchet MS',system-ui` }, `${r.score}`),
      el('div', { opacity: '0.9' }, `🪙 ${r.coins}　·　${Math.floor(r.distance)} m`),
      el('div', { font: '700 14px/1 system-ui', opacity: '0.8' }, `최고 ${best}　·　+${r.mileage}💎`),
    );
    if (r.isBest && r.score > 0) {
      const nb = el('div', { color: NEON.gold, font: `800 18px/1 'Trebuchet MS',system-ui`, animation: 'nd-pop .4s ease' }, '🏆 신기록 달성!');
      this.gameoverBody.append(nb);
    }
    const btns = el('div', { display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap', justifyContent: 'center' });
    const canRevive = !this.reviveUsed && d.coins >= REVIVE_COST;
    const revive = button(`부활 ${coinStr(REVIVE_COST)}`, () => {
      if (this.reviveUsed || !this.save.spend(REVIVE_COST)) return;
      this.reviveUsed = true;
      this.game.revive();
    }, 'pink');
    revive.disabled = !canRevive;
    btns.append(revive, button('다시 도전 ▶', () => this.startRun()), button('홈으로', () => this.toHome(), 'ghost'));
    this.gameoverBody.append(btns);
  }
}

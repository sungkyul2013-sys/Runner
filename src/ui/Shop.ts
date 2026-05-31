import { POWERUPS } from '../config/powerups';
import { abilityText, getCharacter } from '../data/characters';
import { COSMETICS } from '../data/cosmetics';
import {
  ABILITY_MAX_LEVEL,
  abilityPotionCost,
  POWERUP_MAX_LEVEL,
  powerupUpgradeCost,
  UPGRADABLE_POWERUPS,
} from '../data/potions';
import type { SaveManager } from '../data/SaveManager';
import { button, coinStr, el, NEON, screen, show } from './uikit';

/**
 * Shop: spend coins on cosmetics (hair/outfit), an ability potion that upgrades
 * the equipped character's passive, and power-up duration upgrades. Mutates the
 * save and calls `onChange` so the live loadout/preview updates immediately.
 */
export class Shop {
  readonly root: HTMLDivElement;
  private readonly coinsEl: HTMLDivElement;
  private readonly body: HTMLDivElement;

  constructor(
    private readonly save: SaveManager,
    private readonly onChange: () => void,
    onBack: () => void,
  ) {
    this.root = screen(true);
    this.root.style.justifyContent = 'flex-start';
    this.root.style.padding = '5vh 0';

    const bar = el('div', {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      width: 'min(760px,92vw)',
    });
    bar.append(
      el('div', { font: '800 28px/1 system-ui' }, 'SHOP'),
      (this.coinsEl = el('div', { font: '700 20px/1 ui-monospace,monospace' })),
    );

    this.body = el('div', {
      width: 'min(760px,92vw)',
      maxHeight: '64vh',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '18px',
      padding: '4px',
    });

    this.root.append(bar, this.body, button('← Back', onBack, 'ghost'));
  }

  private section(title: string): HTMLDivElement {
    const wrap = el('div', { display: 'flex', flexDirection: 'column', gap: '8px' });
    wrap.append(el('div', { font: '700 16px/1 system-ui', color: NEON.cyan }, title));
    const grid = el('div', { display: 'flex', gap: '10px', flexWrap: 'wrap' });
    wrap.append(grid);
    this.body.append(wrap);
    return grid;
  }

  private render(): void {
    this.coinsEl.innerHTML = coinStr(this.save.data.totalCoins);
    this.body.innerHTML = '';

    // ── Cosmetics ──
    const cos = this.section('Cosmetics');
    for (const c of COSMETICS) {
      const owned = this.save.ownsCosmetic(c.id);
      const equipped = this.save.data.equipped[c.slot] === c.id;
      const card = el('div');
      card.className = `nd-card${equipped ? ' sel' : ''}`;
      card.append(
        el('div', { font: '700 15px/1 system-ui' }, c.name),
        el('div', { font: '600 11px/1 system-ui', opacity: '0.6' }, c.slot),
      );
      if (equipped) {
        card.append(el('div', { color: NEON.cyan, font: '700 13px/1' }, '✓ Equipped'));
      } else if (owned) {
        card.append(button('Equip', () => { this.save.equip(c.slot, c.id); this.onChange(); this.render(); }, 'ghost'));
      } else {
        const b = button(`Buy ${coinStr(c.price)}`, () => {
          if (this.save.spend(c.price)) { this.save.buyCosmetic(c.id); this.save.equip(c.slot, c.id); this.onChange(); }
          this.render();
        }, 'pink');
        b.disabled = this.save.data.totalCoins < c.price;
        card.append(b);
      }
      cos.append(card);
    }

    // ── Ability potion (selected character) ──
    const ab = this.section('Ability Potion');
    const def = getCharacter(this.save.data.selectedCharacter);
    const lvl = this.save.abilityLevel(def.id);
    const card = el('div');
    card.className = 'nd-card';
    card.style.minWidth = '260px';
    card.append(
      el('div', { font: '700 15px/1 system-ui' }, `${def.name} — ${def.ability.name}`),
      el('div', { font: '600 12px/1.4 system-ui', opacity: '0.85' },
        `Lv ${lvl}/${ABILITY_MAX_LEVEL} · ${abilityText(def.ability, lvl)}`),
    );
    if (lvl >= ABILITY_MAX_LEVEL) {
      card.append(el('div', { color: NEON.gold, font: '700 13px/1' }, 'MAX'));
    } else {
      const cost = abilityPotionCost(lvl);
      const b = button(`Upgrade ${coinStr(cost)}`, () => {
        if (this.save.spend(cost)) { this.save.raiseAbility(def.id); this.onChange(); }
        this.render();
      });
      b.disabled = this.save.data.totalCoins < cost;
      card.append(b);
    }
    ab.append(card);

    // ── Power-up upgrades ──
    const pu = this.section('Power-up Durations');
    for (const t of UPGRADABLE_POWERUPS) {
      const def2 = POWERUPS[t];
      const l = this.save.powerupLevel(t);
      const c2 = el('div');
      c2.className = 'nd-card';
      c2.append(
        el('div', { font: '700 14px/1 system-ui' }, `${def2.icon} ${def2.label}`),
        el('div', { font: '600 11px/1 system-ui', opacity: '0.7' }, `Lv ${l}/${POWERUP_MAX_LEVEL}`),
      );
      if (l >= POWERUP_MAX_LEVEL) {
        c2.append(el('div', { color: NEON.gold, font: '700 12px/1' }, 'MAX'));
      } else {
        const cost = powerupUpgradeCost(l);
        const b = button(`+15% ${coinStr(cost)}`, () => {
          if (this.save.spend(cost)) this.save.raisePowerup(t);
          this.render();
        }, 'ghost');
        b.disabled = this.save.data.totalCoins < cost;
        c2.append(b);
      }
      pu.append(c2);
    }
  }

  show(on: boolean): void {
    if (on) this.render();
    show(this.root, on);
  }
}

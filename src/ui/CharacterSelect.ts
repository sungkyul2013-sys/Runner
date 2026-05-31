import { abilityText, CHARACTERS } from '../data/characters';
import type { SaveManager } from '../data/SaveManager';
import { button, coinStr, el, NEON, screen, show } from './uikit';

/**
 * Character carousel. Renders the three characters as cards (owned / selected /
 * for-sale); selecting or buying one updates the save and calls `onChange`, so
 * the attract-mode runner behind the panel instantly becomes that character.
 * The panel sits low and the backdrop is transparent so the live preview shows.
 */
export class CharacterSelect {
  readonly root: HTMLDivElement;
  private readonly cards: HTMLDivElement;
  private readonly coinsEl: HTMLDivElement;

  constructor(
    private readonly save: SaveManager,
    private readonly onChange: () => void,
    onBack: () => void,
  ) {
    this.root = screen(false);
    this.root.style.justifyContent = 'flex-end';
    this.root.style.paddingBottom = '5vh';

    const bar = el('div', {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: 'min(720px,92vw)',
      marginBottom: '4px',
    });
    const title = el('div', { font: '800 26px/1 system-ui,sans-serif' }, 'CHARACTERS');
    this.coinsEl = el('div', { font: '700 18px/1 ui-monospace,monospace' });
    bar.append(title, this.coinsEl);

    this.cards = el('div', {
      display: 'flex',
      gap: '14px',
      flexWrap: 'wrap',
      justifyContent: 'center',
      maxWidth: '92vw',
    });

    const back = button('← Back', onBack, 'ghost');
    this.root.append(bar, this.cards, back);
  }

  private render(): void {
    const d = this.save.data;
    this.coinsEl.innerHTML = coinStr(d.totalCoins);
    this.cards.innerHTML = '';

    for (const c of CHARACTERS) {
      const owned = this.save.ownsCharacter(c.id);
      const selected = d.selectedCharacter === c.id;
      const lvl = this.save.abilityLevel(c.id);
      const card = el('div');
      card.className = `nd-card${selected ? ' sel' : ''}`;
      card.style.width = '200px';

      const swatch = `#${c.palette.primary.toString(16).padStart(6, '0')}`;
      card.append(
        el('div', { font: '800 20px/1 system-ui', color: swatch }, c.name),
        el('div', { font: '600 12px/1.4 system-ui', opacity: '0.85', minHeight: '34px' },
          `<b>${c.ability.name}</b><br>${abilityText(c.ability, lvl)}`),
      );

      if (selected) {
        card.append(el('div', { color: NEON.cyan, font: '700 14px/1', textAlign: 'center' }, '✓ SELECTED'));
      } else if (owned) {
        card.append(button('Select', () => {
          this.save.selectCharacter(c.id);
          this.onChange();
          this.render();
        }));
      } else {
        const b = button(`Buy ${coinStr(c.price)}`, () => {
          if (this.save.spend(c.price)) {
            this.save.buyCharacter(c.id);
            this.save.selectCharacter(c.id);
            this.onChange();
          }
          this.render();
        }, 'pink');
        b.disabled = d.totalCoins < c.price;
        card.append(b);
      }
      this.cards.append(card);
    }
  }

  show(on: boolean): void {
    if (on) this.render();
    show(this.root, on);
  }
}

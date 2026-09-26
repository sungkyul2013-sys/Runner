// Phone UI in-mode frame (§18.5 thumb reach, one core action per screen): ONE slim row at the top — pause menu,
// mode and car, the time capsule, the panel and the quick menu — and nothing else on the road. Every action lives in
// the quick menu, a bottom sheet of large labelled tiles (toggles show their state). The mode's panel is a bottom
// sheet dragged between half and full height (a side drawer on a phone held sideways), the pause menu a bottom
// action sheet, the settings a full-screen page. Same contract as the PC frame (ModeShell), so every mode runs on
// either UI.
import { notify } from '../feedback';
import { icon, type IconName } from '../icons';
import { t } from '../i18n';
import { SettingsView } from '../SettingsView';
import type { ModePanel, ModeShell, ShellActions } from '../Shell';
import { TimeControl } from '../TimeControl';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  e.append(...children);
  return e;
}

/** A phone held sideways: panels come in from the side (a bottom sheet would cover the road). */
export function landscapePhone(): boolean {
  return globalThis.matchMedia?.('(orientation: landscape) and (max-height: 600px)').matches ?? false;
}

function roundButton(name: IconName, label: string): HTMLButtonElement {
  const b = el('button', 'm-round', icon(name));
  b.ariaLabel = label;
  return b;
}

/**
 * The mode's panel on a phone: a bottom sheet with a grab handle — drag up for full height, down for half or to
 * close; the chevron does the same with a tap. Sideways, a drawer from the right, swiped right to close.
 */
export class MobileSheet implements ModePanel {
  readonly root = el('aside', 'm-sheet');
  readonly body = el('div', 'sheet-body m-sheet-body');
  private readonly title = el('b', 'm-sheet-title');
  private readonly expand = roundButton('expand', t('mExpand'));
  onToggle: (open: boolean) => void = () => {};

  constructor(title: string, open: boolean) {
    const grab = el('div', 'm-grab', el('i'));
    const close = roundButton('close', t('panelClose'));
    close.onclick = () => this.setOpen(false);
    this.expand.classList.add('m-expand');
    this.expand.onclick = () => this.setFull(!this.full);
    this.title.textContent = title;
    const head = el('header', 'm-sheet-head', this.title, this.expand, close);
    this.root.append(grab, head, this.body);
    this.root.classList.add('ready');
    this.setOpen(open);
    this.dragToResize(grab, head);
  }

  get open(): boolean {
    return this.root.classList.contains('open');
  }

  private get full(): boolean {
    return this.root.classList.contains('full');
  }

  setOpen(on: boolean): void {
    if (on === this.open) return;
    this.root.classList.toggle('open', on);
    if (!on) this.setFull(false);
    this.onToggle(on);
  }

  setFull(on: boolean): void {
    this.root.classList.toggle('full', on);
    this.expand.ariaPressed = String(on);
  }

  setTitle(title: string): void {
    this.title.textContent = title;
  }

  section(title: string, ...children: Node[]): HTMLElement {
    const s = el('section', 'sheet-section', el('h3', '', title), ...children);
    this.body.append(s);
    return s;
  }

  tabs(items: Array<{ title: string; icon?: IconName; nodes: Node[] }>, initial = 0): { select(i: number): void } {
    const bar = el('nav', 'sheet-tabs m-tabs');
    const panes = items.map((it) => el('div', 'sheet-pane', ...it.nodes));
    const buttons = items.map((it, i) => {
      const b = el('button', 'sheet-tab', ...(it.icon ? [icon(it.icon)] : []), el('span', '', it.title));
      b.onclick = () => select(i);
      return b;
    });
    const select = (i: number) => {
      buttons.forEach((b, k) => b.classList.toggle('on', k === i));
      panes.forEach((p, k) => (p.hidden = k !== i));
      this.body.scrollTop = 0;
      buttons[i]?.scrollIntoView({ block: 'nearest', inline: 'center' });
    };
    bar.append(...buttons);
    this.body.append(bar, ...panes);
    select(initial);
    return { select };
  }

  /** The handle and the header follow the finger; on release the sheet snaps to half, full or closed. */
  private dragToResize(...handles: HTMLElement[]): void {
    for (const h of handles) {
      h.addEventListener('pointerdown', (e) => {
        if ((e.target as Element).closest('button')) return;
        const side = landscapePhone();
        const x0 = e.clientX, y0 = e.clientY, t0 = performance.now();
        h.setPointerCapture(e.pointerId);
        this.root.classList.add('dragging');
        const onMove = (m: PointerEvent) => {
          const d = side ? Math.max(0, m.clientX - x0) : m.clientY - y0;
          this.root.style.setProperty('--drag', `${side ? d : Math.max(d, -innerHeight * 0.4)}px`);
        };
        const onUp = (u: PointerEvent) => {
          h.removeEventListener('pointermove', onMove);
          h.removeEventListener('pointerup', onUp);
          h.removeEventListener('pointercancel', onUp);
          this.root.classList.remove('dragging');
          this.root.style.removeProperty('--drag');
          const d = side ? u.clientX - x0 : u.clientY - y0;
          const flick = Math.abs(d) / Math.max(performance.now() - t0, 1) > 0.6; // px per ms
          if (side) {
            if (d > 80 || (flick && d > 20)) this.setOpen(false);
          } else if (d < -50 || (flick && d < -15)) this.setFull(true);
          else if (d > 70 || (flick && d > 20)) {
            if (this.full) this.setFull(false);
            else this.setOpen(false);
          } else if (Math.abs(d) < 6 && (e.target as Element).closest('.m-grab')) this.setFull(!this.full);
        };
        h.addEventListener('pointermove', onMove);
        h.addEventListener('pointerup', onUp);
        h.addEventListener('pointercancel', onUp);
      });
    }
  }
}

/** A bottom action sheet over a dimmed backdrop (the quick menu, the pause menu). Tapping the backdrop closes it. */
class ActionSheet {
  readonly layer = el('div', 'm-layer');
  readonly card = el('div', 'm-action-card');
  onClose: () => void = () => {};

  constructor(className: string) {
    this.layer.classList.add(className);
    this.layer.append(this.card);
    this.layer.hidden = true;
    this.layer.addEventListener('pointerdown', (e) => {
      if (e.target === this.layer) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.layer.hidden;
  }

  open(): void {
    this.layer.hidden = false;
    this.layer.classList.remove('out');
  }

  close(): void {
    if (this.layer.hidden) return;
    this.layer.hidden = true;
    this.onClose();
  }
}

export class MobileShell implements ModeShell {
  readonly mobile = true;
  readonly root = el('div', 'm-shell');
  readonly sheet: MobileSheet;
  readonly time: TimeControl | null;
  private readonly titleText = el('b', 'm-title');
  private readonly subText = el('span', 'm-sub');
  private readonly quick = new ActionSheet('m-quick');
  private readonly quickGrid = el('div', 'm-quick-grid');
  private readonly quickHead = el('div', 'm-quick-head');
  private readonly pause = new ActionSheet('m-pause');
  private readonly settingsLayer = el('div', 'm-layer m-settings-layer');
  private readonly panelBtn = roundButton('sliders', t('panelToggle'));
  private readonly moreBtn = roundButton('apps', t('mQuick'));
  private readonly panelTile: HTMLButtonElement;
  private settingsView: SettingsView | null = null;
  private pausedByMenu = false;

  constructor(title: string, subtitle: string, private readonly actionsImpl: ShellActions, sheetOpen = false) {
    const menuBtn = roundButton('menu', t('menuPaused'));
    menuBtn.onclick = () => this.openPause();
    this.titleText.textContent = title;
    this.subText.textContent = subtitle;
    this.time = actionsImpl.time ? new TimeControl(actionsImpl.time) : null;
    this.sheet = new MobileSheet(title, sheetOpen);
    this.panelBtn.onclick = () => this.sheet.setOpen(!this.sheet.open);
    this.moreBtn.onclick = () => (this.quick.isOpen ? this.quick.close() : this.openQuick());
    this.sheet.onToggle = (open) => this.syncPanel(open);
    const top = el('header', 'm-top', menuBtn, el('div', 'm-titles', this.titleText, this.subText), ...(this.time ? [this.time.root] : []), this.panelBtn, this.moreBtn);

    // Quick menu: the mode's actions as tiles, then the panel and the settings.
    const closeQuick = roundButton('close', t('close'));
    closeQuick.onclick = () => this.quick.close();
    this.quickHead.append(el('div', 'm-titles', el('b', '', t('mQuick')), el('span', '', subtitle ? `${title} · ${subtitle}` : title)), closeQuick);
    this.panelTile = this.tile('sliders', t('panelToggle'));
    this.panelTile.onclick = () => {
      this.quick.close();
      this.sheet.setOpen(true);
    };
    const settingsTile = this.tile('settings', t('menuSettings'));
    settingsTile.onclick = () => {
      this.quick.close();
      this.openSettings();
    };
    this.quickGrid.append(this.panelTile, settingsTile);
    this.quick.card.append(el('div', 'm-grab', el('i')), this.quickHead, this.quickGrid);
    this.quick.onClose = () => (this.moreBtn.ariaPressed = 'false');

    this.buildPause();
    this.settingsLayer.hidden = true;
    // The time popover spans the screen under the top row (inside the blurred capsule it could not).
    this.root.append(top, ...(this.time ? [this.time.pop] : []), this.sheet.root, this.quick.layer, this.pause.layer, this.settingsLayer);
    this.syncPanel(this.sheet.open);
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || e.repeat) return;
      if (document.body.classList.contains('ov3-on') || document.querySelector('.worldmap')) return;
      if (!this.settingsLayer.hidden) this.closeSettings();
      else if (this.quick.isOpen) this.quick.close();
      else if (this.pause.isOpen) this.closePause();
      else this.openPause();
    });
  }

  private syncPanel(open: boolean): void {
    this.panelBtn.ariaPressed = String(open);
    this.panelTile.ariaPressed = String(open);
    document.body.classList.toggle('m-panel-open', open);
  }

  private tile(name: IconName, label: string): HTMLButtonElement {
    const b = el('button', 'm-tile', el('span', 'm-tile-ic', icon(name)), el('span', 'm-tile-label', label));
    b.ariaLabel = label;
    return b;
  }

  setTitle(title: string, subtitle = ''): void {
    this.titleText.textContent = title;
    this.subText.textContent = subtitle;
    const line = this.quickHead.querySelector('.m-titles span');
    if (line) line.textContent = subtitle ? `${title} · ${subtitle}` : title;
  }

  addAction(name: IconName, label: string, onClick: (btn: HTMLButtonElement) => void, toggle?: boolean, tip?: string): HTMLButtonElement {
    label = label.replace(/\s*\([A-Z]\)$/, ''); // a keyboard hint means nothing on a phone
    const b = this.tile(name, label);
    if (tip) b.dataset.tip = `${label}\n${tip}`;
    const state = el('small', 'm-tile-state');
    if (toggle !== undefined) {
      b.ariaPressed = String(toggle);
      b.append(state);
    }
    const showState = () => (state.textContent = b.ariaPressed === 'true' ? t('stateOn') : t('stateOff'));
    showState();
    b.onclick = () => {
      if (b.ariaPressed !== null) {
        b.ariaPressed = String(b.ariaPressed !== 'true');
        showState();
        notify(`${label} · ${b.ariaPressed === 'true' ? t('stateOn') : t('stateOff')}`, '', { icon: name, key: `act-${name}` });
      } else this.quick.close(); // a one-shot action: back to the road
      onClick(b);
    };
    this.quickGrid.insertBefore(b, this.panelTile);
    return b;
  }

  private openQuick(): void {
    this.quick.open();
    this.moreBtn.ariaPressed = 'true';
  }

  get menuOpen(): boolean {
    return this.pause.isOpen || !this.settingsLayer.hidden;
  }

  openPause(): void {
    if (this.pause.isOpen) return;
    this.quick.close();
    this.pause.open();
    this.pausedByMenu = true;
    this.actionsImpl.setPaused?.(true);
    this.time?.sync();
  }

  closePause(): void {
    this.pause.close();
  }

  openSettings(): void {
    this.settingsView ??= new SettingsView(() => this.closeSettings(), true);
    this.settingsLayer.replaceChildren(this.settingsView.root);
    this.settingsLayer.hidden = false;
  }

  closeSettings(): void {
    this.settingsLayer.hidden = true;
  }

  private buildPause(): void {
    const item = (key: Parameters<typeof t>[0], name: IconName, run: () => void, primary = false) => {
      const b = el('button', primary ? 'm-row primary' : 'm-row', icon(name), el('span', '', t(key)));
      b.onclick = run;
      return b;
    };
    this.pause.card.append(
      el('div', 'm-grab', el('i')),
      el('div', 'm-quick-head', el('div', 'm-titles', el('b', '', t('menuPaused')), el('span', '', this.titleText.textContent ?? ''))),
      item('menuResume', 'play', () => this.closePause(), true),
      ...(this.actionsImpl.restart ? [item('menuRestart', 'restart', () => { this.closePause(); this.actionsImpl.restart!(); })] : []),
      item('menuSettings', 'settings', () => this.openSettings()),
      item('menuMain', 'back', () => this.actionsImpl.mainMenu()),
    );
    this.pause.onClose = () => {
      if (this.pausedByMenu) this.actionsImpl.setPaused?.(false);
      this.pausedByMenu = false;
      this.time?.sync();
    };
  }
}

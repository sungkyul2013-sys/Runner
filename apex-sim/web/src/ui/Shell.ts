// In-mode frame of the app (§18 UI, §18.5 one core action per screen, everything within three steps): a slim top bar
// (menu, mode title, a few icon actions), ONE collapsible control sheet for the mode (a side panel on wide screens, a
// bottom sheet on phones), the pause menu and the settings overlay. Every mode (test ground, crash lab, sandbox,
// free roam) uses the same frame, so the screen never fills with separate windows.
import { icon, type IconName } from './icons';
import { t } from './i18n';
import { SettingsView } from './SettingsView';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  e.append(...children);
  return e;
}

export interface ShellActions {
  mainMenu(): void;
  restart?(): void;
  /** Called when the pause menu opens or closes (the mode pauses its world). */
  setPaused?(paused: boolean): void;
}

/** The mode's control sheet: header (title, collapse), scrolling body. */
export class Sheet {
  readonly root = el('aside', 'sheet');
  readonly body = el('div', 'sheet-body');
  private readonly title = el('b');
  private readonly toggle = el('button', 'icon-btn sheet-toggle');

  constructor(title: string, open: boolean) {
    const handle = el('div', 'sheet-handle');
    const head = el('header', 'sheet-head', this.title, this.toggle);
    this.title.textContent = title;
    this.toggle.append(icon('chevron'));
    this.toggle.ariaLabel = t('sheetControls');
    this.toggle.onclick = () => this.setOpen(!this.open);
    handle.onclick = () => this.setOpen(!this.open);
    head.addEventListener('dblclick', () => this.setOpen(!this.open));
    this.root.append(handle, head, this.body);
    this.setOpen(open);
    // Bottom sheet (phones): a vertical swipe on the header opens or closes it.
    let startY = -1;
    head.addEventListener('pointerdown', (e) => (startY = e.clientY));
    head.addEventListener('pointerup', (e) => {
      if (startY >= 0 && Math.abs(e.clientY - startY) > 30) this.setOpen(e.clientY < startY);
      startY = -1;
    });
  }

  get open(): boolean {
    return this.root.classList.contains('open');
  }

  setOpen(on: boolean): void {
    this.root.classList.toggle('open', on);
    this.toggle.ariaExpanded = String(on);
  }

  setTitle(title: string): void {
    this.title.textContent = title;
  }

  /** A titled group of controls in the sheet. */
  section(title: string, ...children: Node[]): HTMLElement {
    const s = el('section', 'sheet-section', el('h3', '', title), ...children);
    this.body.append(s);
    return s;
  }
}

export class Shell {
  readonly root = el('div', 'shell');
  readonly topbar = el('header', 'topbar');
  readonly actions = el('div', 'topbar-actions');
  readonly sheet: Sheet;
  private readonly titleText = el('b', 'topbar-title');
  private readonly subText = el('span', 'topbar-sub');
  private readonly pauseLayer = el('div', 'overlay-layer pause-layer');
  private readonly settingsLayer = el('div', 'overlay-layer settings-layer');
  private settingsView: SettingsView | null = null;
  private pausedByMenu = false;

  constructor(title: string, subtitle: string, private readonly actionsImpl: ShellActions, sheetOpen = !isNarrow()) {
    const menuBtn = el('button', 'icon-btn', icon('menu'));
    menuBtn.ariaLabel = t('menuPaused');
    menuBtn.onclick = () => this.openPause();
    const brand = el('span', 'topbar-brand', 'APEX');
    this.titleText.textContent = title;
    this.subText.textContent = subtitle;
    this.topbar.append(menuBtn, brand, el('div', 'topbar-titles', this.titleText, this.subText), this.actions);
    this.sheet = new Sheet(title, sheetOpen);
    // Compact screens (landscape phones): the sheet's header is hidden while it is closed (it would sit on the touch
    // controls); this top-bar button opens and closes it instead.
    const panelBtn = el('button', 'icon-btn sheet-open-btn', icon('panel'));
    panelBtn.ariaLabel = title;
    panelBtn.onclick = () => this.sheet.setOpen(!this.sheet.open);
    this.topbar.append(panelBtn);
    this.root.append(this.topbar, this.sheet.root, this.pauseLayer, this.settingsLayer);
    this.pauseLayer.hidden = true;
    this.settingsLayer.hidden = true;
    this.buildPause();
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || e.repeat) return;
      if (!this.settingsLayer.hidden) this.closeSettings();
      else if (!this.pauseLayer.hidden) this.closePause();
      else this.openPause();
    });
  }

  setTitle(title: string, subtitle = ''): void {
    this.titleText.textContent = title;
    this.subText.textContent = subtitle;
  }

  /** An icon action in the top bar; `toggle` buttons show their state (aria-pressed). */
  addAction(name: IconName, label: string, onClick: (btn: HTMLButtonElement) => void, toggle?: boolean): HTMLButtonElement {
    const b = el('button', 'icon-btn', icon(name));
    b.ariaLabel = label;
    b.title = label;
    if (toggle !== undefined) b.ariaPressed = String(toggle);
    b.onclick = () => {
      if (b.ariaPressed !== null) b.ariaPressed = String(b.ariaPressed !== 'true');
      onClick(b);
    };
    this.actions.append(b);
    return b;
  }

  get menuOpen(): boolean {
    return !this.pauseLayer.hidden || !this.settingsLayer.hidden;
  }

  openPause(): void {
    if (!this.pauseLayer.hidden) return;
    this.pauseLayer.hidden = false;
    this.pausedByMenu = true;
    this.actionsImpl.setPaused?.(true);
    (this.pauseLayer.querySelector('button') as HTMLButtonElement | null)?.focus();
  }

  closePause(): void {
    this.pauseLayer.hidden = true;
    if (this.pausedByMenu) this.actionsImpl.setPaused?.(false);
    this.pausedByMenu = false;
  }

  openSettings(): void {
    this.settingsView ??= new SettingsView(() => this.closeSettings());
    this.settingsLayer.replaceChildren(this.settingsView.root);
    this.settingsLayer.hidden = false;
  }

  closeSettings(): void {
    this.settingsLayer.hidden = true;
  }

  private buildPause(): void {
    const card = el('div', 'menu-card');
    const item = (key: Parameters<typeof t>[0], name: IconName, run: () => void, primary = false) => {
      const b = el('button', primary ? 'menu-item primary' : 'menu-item', icon(name), el('span', '', t(key)));
      b.onclick = run;
      return b;
    };
    card.append(
      el('h2', '', t('menuPaused')),
      item('menuResume', 'play', () => this.closePause(), true),
      ...(this.actionsImpl.restart ? [item('menuRestart', 'restart', () => { this.closePause(); this.actionsImpl.restart!(); })] : []),
      item('menuSettings', 'settings', () => this.openSettings()),
      item('menuMain', 'back', () => this.actionsImpl.mainMenu()),
    );
    this.pauseLayer.append(card);
    this.pauseLayer.addEventListener('pointerdown', (e) => {
      if (e.target === this.pauseLayer) this.closePause();
    });
  }
}

/** Phones in portrait and small windows: the sheet starts closed and sits at the bottom. */
export function isNarrow(): boolean {
  return globalThis.matchMedia?.('(max-width: 760px)').matches ?? false;
}

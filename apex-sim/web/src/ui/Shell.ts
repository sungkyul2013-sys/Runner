// In-mode frame of the app (§18 UI, §18.5 one core action per screen, everything within three steps). Three quiet
// islands at the top — the mode chip (menu, mode, car), the time capsule (play / pause, time scale) and the action
// dock (labelled buttons with tooltips) — and ONE panel for the mode's controls: a floating window that can be moved
// by its title and resized from its corner on wide screens (its place is remembered per mode), a bottom sheet on
// phones. The pause menu and the settings overlay complete it. Every mode uses the same frame.
import { notify, tipOf } from './feedback';
import { icon, type IconName } from './icons';
import { t } from './i18n';
import { SettingsView } from './SettingsView';
import { TimeControl, type TimeHost } from './TimeControl';

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
  /** With it, the shell shows the time capsule (every mode that runs physics). */
  time?: TimeHost;
}

const RECTS_KEY = 'apex.panels.v1';
type Rect = { x: number; y: number; w: number; h: number };

function loadRects(): Record<string, Rect> {
  try {
    return JSON.parse(localStorage.getItem(RECTS_KEY) ?? '{}') as Record<string, Rect>;
  } catch {
    return {};
  }
}

function saveRect(key: string, r: Rect): void {
  try {
    localStorage.setItem(RECTS_KEY, JSON.stringify({ ...loadRects(), [key]: r }));
  } catch {
    // not persisted
  }
}

/**
 * The mode's panel. Wide screens: a floating window (drag the title bar, resize from the corner grip, double-click
 * the title to fold it). Phones: a bottom sheet (swipe the handle).
 */
export class Sheet {
  readonly root = el('aside', 'sheet');
  readonly body = el('div', 'sheet-body');
  private readonly title = el('b');
  private readonly toggle = el('button', 'icon-btn sheet-toggle');
  private readonly grip = el('div', 'sheet-grip');
  private rect: Rect | null = null;
  onToggle: (open: boolean) => void = () => {};

  constructor(title: string, open: boolean, private readonly key = title) {
    const handle = el('div', 'sheet-handle');
    const move = el('span', 'sheet-move', icon('drag'));
    const head = el('header', 'sheet-head', move, this.title, this.toggle);
    this.title.textContent = title;
    this.toggle.append(icon('close'));
    this.toggle.ariaLabel = t('panelClose');
    this.toggle.onclick = (e) => {
      e.stopPropagation();
      this.setOpen(false);
    };
    handle.onclick = () => this.setOpen(!this.open);
    head.addEventListener('dblclick', () => this.root.classList.toggle('folded'));
    this.grip.append(icon('drag'));
    tipOf(this.grip, t('panelResize'));
    this.root.append(handle, head, this.body, this.grip);
    this.rect = loadRects()[key] ?? null;
    this.setOpen(open);
    // Phones: a vertical swipe on the header opens or closes the bottom sheet.
    let startY = -1;
    head.addEventListener('pointerdown', (e) => {
      if (floating()) this.drag(e, 'move');
      else startY = e.clientY;
    });
    head.addEventListener('pointerup', (e) => {
      if (startY >= 0 && Math.abs(e.clientY - startY) > 30) this.setOpen(e.clientY < startY);
      startY = -1;
    });
    this.grip.addEventListener('pointerdown', (e) => this.drag(e, 'size'));
    window.addEventListener('resize', () => this.applyRect());
    requestAnimationFrame(() => this.applyRect());
  }

  get open(): boolean {
    return this.root.classList.contains('open');
  }

  setOpen(on: boolean): void {
    if (on === this.open && this.root.classList.contains('ready')) return;
    this.root.classList.add('ready');
    this.root.classList.toggle('open', on);
    this.root.classList.remove('folded');
    this.toggle.ariaExpanded = String(on);
    this.onToggle(on);
  }

  setTitle(title: string): void {
    this.title.textContent = title;
  }

  /** A titled group of controls in the panel. */
  section(title: string, ...children: Node[]): HTMLElement {
    const s = el('section', 'sheet-section', el('h3', '', title), ...children);
    this.body.append(s);
    return s;
  }

  /** Tabs across the top of the panel, one pane each (the crash lab: presets, details, results, view). */
  tabs(items: Array<{ title: string; icon?: IconName; nodes: Node[] }>, initial = 0): { select(i: number): void } {
    const bar = el('nav', 'sheet-tabs');
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
    };
    bar.append(...buttons);
    this.body.append(bar, ...panes);
    select(initial);
    return { select };
  }

  /** Moves (title bar) or resizes (corner grip) the floating window with the pointer. */
  private drag(e: PointerEvent, kind: 'move' | 'size'): void {
    if (!floating() || (e.target as Element).closest('button')) return;
    e.preventDefault();
    const r0 = this.root.getBoundingClientRect();
    const x0 = e.clientX, y0 = e.clientY;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    this.root.classList.add('dragging');
    const onMove = (m: PointerEvent) => {
      const dx = m.clientX - x0, dy = m.clientY - y0;
      this.rect = kind === 'move'
        ? { x: r0.left + dx, y: r0.top + dy, w: r0.width, h: r0.height }
        : { x: r0.left, y: r0.top, w: r0.width + dx, h: r0.height + dy };
      this.applyRect();
    };
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      this.root.classList.remove('dragging');
      if (this.rect) saveRect(this.key, this.rect);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }

  /** Keeps the window on screen and at least a usable size. */
  private applyRect(): void {
    const s = this.root.style;
    if (!floating() || !this.rect) {
      s.left = s.top = s.width = s.height = s.right = '';
      return;
    }
    const w = Math.min(Math.max(this.rect.w, 280), innerWidth - 16);
    const h = Math.min(Math.max(this.rect.h, 160), innerHeight - 16);
    const x = Math.min(Math.max(this.rect.x, 8), innerWidth - w - 8);
    const y = Math.min(Math.max(this.rect.y, 8), innerHeight - 48);
    s.left = `${x}px`;
    s.top = `${y}px`;
    s.right = 'auto';
    s.width = `${w}px`;
    s.height = `${Math.min(h, innerHeight - y - 8)}px`;
  }
}

export class Shell {
  readonly root = el('div', 'shell');
  readonly topbar = el('header', 'topbar');
  readonly actions = el('nav', 'dock');
  readonly sheet: Sheet;
  readonly time: TimeControl | null;
  private readonly titleText = el('b', 'chip-title');
  private readonly subText = el('span', 'chip-sub');
  private readonly pauseLayer = el('div', 'overlay-layer pause-layer');
  private readonly settingsLayer = el('div', 'overlay-layer settings-layer');
  private readonly panelBtn: HTMLButtonElement;
  private settingsView: SettingsView | null = null;
  private pausedByMenu = false;

  constructor(title: string, subtitle: string, private readonly actionsImpl: ShellActions, sheetOpen = !isNarrow()) {
    const menuBtn = el('button', 'icon-btn chip-menu', icon('menu'));
    menuBtn.ariaLabel = t('menuPaused');
    tipOf(menuBtn, `${t('menuPaused')}\n${t('menuTip')}`, 'Esc');
    menuBtn.onclick = () => this.openPause();
    this.titleText.textContent = title;
    this.subText.textContent = subtitle;
    const chip = el('div', 'modechip', menuBtn, el('div', 'chip-titles', this.titleText, this.subText));
    this.time = actionsImpl.time ? new TimeControl(actionsImpl.time) : null;
    this.sheet = new Sheet(title, sheetOpen);
    this.panelBtn = this.dockButton('sliders', t('panelToggle'), t('panelToggleTip'));
    this.panelBtn.classList.add('dock-panel');
    this.panelBtn.onclick = () => this.sheet.setOpen(!this.sheet.open);
    this.sheet.onToggle = (open) => (this.panelBtn.ariaPressed = String(open));
    this.panelBtn.ariaPressed = String(this.sheet.open);
    this.actions.append(this.panelBtn);
    this.topbar.append(chip, ...(this.time ? [this.time.root] : []), this.actions);
    this.root.append(this.topbar, this.sheet.root, this.pauseLayer, this.settingsLayer);
    this.pauseLayer.hidden = true;
    this.settingsLayer.hidden = true;
    this.buildPause();
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || e.repeat) return;
      // The 3D overview and the world map close on Escape themselves.
      if (document.body.classList.contains('ov3-on') || document.querySelector('.worldmap')) return;
      if (!this.settingsLayer.hidden) this.closeSettings();
      else if (!this.pauseLayer.hidden) this.closePause();
      else this.openPause();
    });
  }

  setTitle(title: string, subtitle = ''): void {
    this.titleText.textContent = title;
    this.subText.textContent = subtitle;
  }

  private dockButton(name: IconName, label: string, tip?: string, key?: string): HTMLButtonElement {
    const b = el('button', 'dock-btn', icon(name), el('span', 'dock-label', label));
    b.ariaLabel = label;
    tipOf(b, tip ? `${label}\n${tip}` : label, key);
    return b;
  }

  /**
   * A labelled action in the dock; `toggle` buttons show their state (aria-pressed). `tip` is the tooltip's
   * description, `key` its keyboard shortcut. The toast names the new state of a toggle.
   */
  addAction(name: IconName, label: string, onClick: (btn: HTMLButtonElement) => void, toggle?: boolean, tip?: string, key?: string): HTMLButtonElement {
    const b = this.dockButton(name, label, tip, key);
    if (toggle !== undefined) b.ariaPressed = String(toggle);
    b.onclick = () => {
      if (b.ariaPressed !== null) {
        b.ariaPressed = String(b.ariaPressed !== 'true');
        notify(`${label} · ${b.ariaPressed === 'true' ? t('stateOn') : t('stateOff')}`, '', { icon: name, key: `act-${name}` });
      }
      onClick(b);
    };
    this.actions.insertBefore(b, this.panelBtn);
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
    this.time?.sync();
    (this.pauseLayer.querySelector('button') as HTMLButtonElement | null)?.focus();
  }

  closePause(): void {
    this.pauseLayer.hidden = true;
    if (this.pausedByMenu) this.actionsImpl.setPaused?.(false);
    this.pausedByMenu = false;
    this.time?.sync();
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

/** Phones (either way round) and small windows: the panel starts closed (it would cover the touch controls). */
export function isNarrow(): boolean {
  return globalThis.matchMedia?.('(max-width: 760px), (max-height: 520px)').matches ?? false;
}

/** The panel floats (movable, resizable) where there is room for it: not on phones. */
function floating(): boolean {
  return !(globalThis.matchMedia?.('(max-width: 760px), (max-height: 520px)').matches ?? false);
}

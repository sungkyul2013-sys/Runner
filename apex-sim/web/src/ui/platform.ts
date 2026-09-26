// Which UI the page wears: the phone UI (touch-first: one slim top row, a quick-action sheet with labelled tiles, the
// mode panel as a draggable bottom sheet, full-screen settings, thumb-reach menus) or the PC UI (mouse and keyboard:
// capsules along the top, a floating movable panel, tooltips with shortcuts). Chosen once per page load: the URL's
// ?ui=mobile|desktop, else the setting, else the device (a touch screen without a fine pointer is a phone or tablet).
import { settings, type UiLayout } from './settings';

export type UiPlatform = 'mobile' | 'desktop';

/** The device's own choice: touch-only devices get the phone UI; anything with a mouse or trackpad the PC UI. */
export function autoPlatform(): UiPlatform {
  const mm = (q: string) => globalThis.matchMedia?.(q).matches ?? false;
  return mm('(pointer: coarse)') && !mm('(any-pointer: fine)') ? 'mobile' : 'desktop';
}

export function resolvePlatform(layout: UiLayout = settings.get().uiLayout, search = globalThis.location?.search ?? ''): UiPlatform {
  const q = new URLSearchParams(search).get('ui');
  if (q === 'mobile' || q === 'desktop') return q;
  return layout === 'auto' ? autoPlatform() : layout;
}

let current: UiPlatform | null = null;

/** The UI of this page load (fixed: switching reloads the page, every screen is built for one of the two). */
export function platform(): UiPlatform {
  current ??= resolvePlatform();
  return current;
}

export function isMobileUi(): boolean {
  return platform() === 'mobile';
}

/** Marks the document (html[data-ui]) so each UI's style sheet applies. */
export function applyPlatform(): void {
  document.documentElement.dataset.ui = platform();
}

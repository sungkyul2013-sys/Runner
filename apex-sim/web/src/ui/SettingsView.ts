// Settings overlay (§18.3-14 설정): gameplay (HUD preset, units), controls (touch layout §15.4), graphics (quality
// preset), accessibility and language (§18.6). Every change applies at once (§18.5 즉각적인 피드백); each tab has a
// restore-defaults button.
import { setLang, t, type StringKey } from './i18n';
import { defaultSettings, settings, type Settings } from './settings';
import { icon } from './icons';
import { notify } from './feedback';
import { DEFAULT_TOUCH_LAYOUT } from './TouchControls';
import type { IconName } from './icons';
import { platform } from './platform';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  e.append(...children);
  return e;
}

type Tab = 'gameplay' | 'controls' | 'graphics' | 'audio' | 'access';

/** Touch layout fields this view edits (the rest of TouchLayout — positions — is kept as stored). */
interface TouchPrefs {
  steer: 'buttons' | 'wheel' | 'tilt' | 'slider';
  size: number;
  pedalSize: number;
  opacity: number;
  autoAccelerate: boolean;
  haptics: boolean;
}
const TOUCH_DEFAULTS: TouchPrefs = {
  steer: DEFAULT_TOUCH_LAYOUT.steer, size: DEFAULT_TOUCH_LAYOUT.size, pedalSize: DEFAULT_TOUCH_LAYOUT.pedalSize, opacity: DEFAULT_TOUCH_LAYOUT.opacity,
  autoAccelerate: DEFAULT_TOUCH_LAYOUT.autoAccelerate, haptics: DEFAULT_TOUCH_LAYOUT.haptics,
};

export function touchPrefs(s: Settings = settings.get()): TouchPrefs {
  return { ...TOUCH_DEFAULTS, ...((s.touchLayout as Partial<TouchPrefs> | null) ?? {}) };
}

const TABS: Array<[Tab, StringKey, IconName]> = [['gameplay', 'setGameplay', 'gauge'], ['controls', 'setControls', 'touch'], ['graphics', 'setGraphics', 'layers'], ['audio', 'setAudio', 'volume'], ['access', 'setAccess', 'eye']];

/**
 * PC: a card with tabs across the top. Phone (`mobile`): a full-screen page — the categories as a list (each with its
 * current values), a tap opens one, the back arrow returns.
 */
export class SettingsView {
  readonly root = el('div', 'settings-card');
  /** Opens the on-screen layout editor for the touch controls (set by the app; absent: the button is hidden). */
  static onEditTouchLayout: (() => void) | null = null;
  private tab: Tab | null = 'gameplay';
  private readonly body = el('div', 'settings-body');
  private readonly tabs = el('nav', 'settings-tabs');
  private readonly heading = el('h2', '', t('menuSettings'));
  private readonly backBtn = el('button', 'icon-btn m-settings-back', icon('back'));

  constructor(private readonly onClose: () => void, private readonly mobile = false) {
    const close = el('button', 'icon-btn', icon('close'));
    close.ariaLabel = t('close');
    close.onclick = () => this.onClose();
    if (mobile) {
      this.tab = null;
      this.root.classList.add('m-settings');
      this.backBtn.ariaLabel = t('mBack');
      this.backBtn.onclick = () => {
        if (this.tab === null) this.onClose();
        else {
          this.tab = null;
          this.render();
        }
      };
      this.root.append(el('header', 'settings-head', this.backBtn, this.heading, close), this.body);
    } else this.root.append(el('header', 'settings-head', this.heading, close), this.tabs, this.body);
    settings.onChange(() => this.render());
    this.render();
  }

  /** One line under a category on the phone list: what is set there now. */
  private summary(tab: Tab, s: Settings): string {
    const p = touchPrefs(s);
    const pct = (v: number) => `${Math.round(v * 100)} %`;
    switch (tab) {
      case 'gameplay':
        return [t(s.hud === 'none' ? 'hudNone' : s.hud === 'minimal' ? 'hudMinimal' : s.hud === 'racing' ? 'hudRacing' : 'hudEngineer'), t(s.speedUnit === 'kmh' ? 'unitKmh' : 'unitMph')].join(' · ');
      case 'controls':
        return [t(p.steer === 'slider' ? 'steerSlider' : p.steer === 'buttons' ? 'steerButtons' : p.steer === 'wheel' ? 'steerWheel' : 'steerTilt'), `${t('setTouchSize')} ${pct(p.size)}`].join(' · ');
      case 'graphics':
        return t(s.quality === 'auto' ? 'qAuto' : s.quality === 'low' ? 'qLow' : s.quality === 'medium' ? 'qMedium' : 'qHigh');
      case 'audio':
        return s.muted ? t('setMute') : `${t('setVolume')} ${pct(s.volume)}`;
      default:
        return [`${t('setUiLayout')}: ${t(s.uiLayout === 'mobile' ? 'uiMobile' : s.uiLayout === 'desktop' ? 'uiDesktop' : 'uiAuto')}`, t(s.lang === 'ko' ? 'langKo' : 'langEn')].join(' · ');
    }
  }

  private render(): void {
    const s0 = settings.get();
    if (this.mobile) {
      const entry = TABS.find(([id]) => id === this.tab);
      this.heading.textContent = entry ? t(entry[1]) : t('menuSettings');
      this.backBtn.hidden = this.tab === null;
      if (this.tab === null) {
        this.body.replaceChildren(el('nav', 'm-set-list', ...TABS.map(([id, key, ic]) => {
          const b = el('button', 'm-set-row', icon(ic), el('span', '', el('b', '', t(key)), el('small', '', this.summary(id, s0))), icon('chevron'));
          b.onclick = () => {
            this.tab = id;
            this.render();
            this.body.scrollTop = 0;
          };
          return b;
        })));
        return;
      }
    }
    this.tabs.replaceChildren(...TABS.map(([id, key]) => {
      const b = el('button', id === this.tab ? 'tab active' : 'tab', t(key));
      b.onclick = () => {
        this.tab = id;
        this.render();
      };
      return b;
    }));
    const s = settings.get();
    const rows: HTMLElement[] = [];
    if (this.tab === 'gameplay') {
      rows.push(choice('setHud', s.hud, [['none', 'hudNone'], ['minimal', 'hudMinimal'], ['racing', 'hudRacing'], ['engineer', 'hudEngineer']], (v) => settings.set({ hud: v })));
      rows.push(choice('setSpeedUnit', s.speedUnit, [['kmh', 'unitKmh'], ['mph', 'unitMph']], (v) => settings.set({ speedUnit: v })));
      rows.push(toggle('setMinimap', s.minimapRotate, (v) => settings.set({ minimapRotate: v })));
    } else if (this.tab === 'controls') {
      const p = touchPrefs(s);
      const setTouch = (patch: Partial<TouchPrefs>) => settings.set({ touchLayout: { ...((s.touchLayout as object | null) ?? {}), ...p, ...patch } });
      rows.push(choice('setTouch', s.touchControls, [['auto', 'touchAuto'], ['on', 'on'], ['off', 'off']], (v) => settings.set({ touchControls: v })));
      rows.push(choice('setSteer', p.steer, [['slider', 'steerSlider'], ['buttons', 'steerButtons'], ['wheel', 'steerWheel'], ['tilt', 'steerTilt']], (v) => setTouch({ steer: v })));
      rows.push(slider('setTouchSize', p.size, 0.75, 1.5, 0.05, (v) => `${Math.round(v * 100)} %`, (v) => setTouch({ size: v })));
      rows.push(slider('setPedalSize', p.pedalSize, 0.7, 1.6, 0.05, (v) => `${Math.round(v * 100)} %`, (v) => setTouch({ pedalSize: v })));
      rows.push(slider('setTouchOpacity', p.opacity, 0.2, 1, 0.05, (v) => `${Math.round(v * 100)} %`, (v) => setTouch({ opacity: v })));
      rows.push(toggle('setAutoAccel', p.autoAccelerate, (v) => setTouch({ autoAccelerate: v })));
      rows.push(toggle('setHaptics', p.haptics, (v) => setTouch({ haptics: v })));
      if (SettingsView.onEditTouchLayout) {
        const edit = el('button', 'wide', t('setEditLayout'));
        edit.onclick = () => {
          this.onClose();
          SettingsView.onEditTouchLayout?.();
        };
        rows.push(edit);
      }
      rows.push(el('p', 'settings-note', t('keysHelp')));
    } else if (this.tab === 'audio') {
      const pct = (v: number) => `${Math.round(v * 100)} %`;
      rows.push(toggle('setMute', s.muted, (v) => settings.set({ muted: v })));
      rows.push(slider('setVolume', s.volume, 0, 1, 0.05, pct, (v) => settings.set({ volume: v })));
      rows.push(slider('setVolEngine', s.volEngine, 0, 1, 0.05, pct, (v) => settings.set({ volEngine: v })));
      rows.push(slider('setVolTyres', s.volTyres, 0, 1, 0.05, pct, (v) => settings.set({ volTyres: v })));
      rows.push(slider('setVolCrash', s.volCrash, 0, 1, 0.05, pct, (v) => settings.set({ volCrash: v })));
      rows.push(slider('setVolEnv', s.volEnv, 0, 1, 0.05, pct, (v) => settings.set({ volEnv: v })));
      rows.push(slider('setVolUi', s.volUi, 0, 1, 0.05, pct, (v) => settings.set({ volUi: v })));
      rows.push(el('p', 'settings-note', t('audioNote')));
    } else if (this.tab === 'graphics') {
      rows.push(choice('setQuality', s.quality, [['auto', 'qAuto'], ['low', 'qLow'], ['medium', 'qMedium'], ['high', 'qHigh']], (v) => settings.set({ quality: v })));
      rows.push(el('p', 'settings-note', t('qualityNote')));
    } else {
      rows.push(choice('setUiLayout', s.uiLayout, [['auto', 'uiAuto'], ['mobile', 'uiMobile'], ['desktop', 'uiDesktop']], (v) => settings.set({ uiLayout: v })));
      rows.push(el('p', 'settings-note', el('b', 'ui-now', `${t('uiNow')}: ${t(platform() === 'mobile' ? 'uiMobile' : 'uiDesktop')}`), el('br'), t('uiLayoutNote')));
      rows.push(choice('setLang', s.lang, [['ko', 'langKo'], ['en', 'langEn']], (v) => {
        setLang(v);
        settings.set({ lang: v });
      }));
      rows.push(choice('setAccent', s.accent, [['orange', 'accentOrange'], ['blue', 'accentBlue'], ['mint', 'accentMint']], (v) => settings.set({ accent: v })));
      rows.push(slider('setUiScale', s.uiScale, 0.75, 1.5, 0.05, (v) => `${Math.round(v * 100)} %`, (v) => settings.set({ uiScale: v })));
      rows.push(toggle('setReduceMotion', s.reduceMotion, (v) => settings.set({ reduceMotion: v })));
    }
    const reset = el('button', 'ghost', t('setReset'));
    reset.onclick = () => {
      const d = defaultSettings();
      if (this.tab === 'gameplay') settings.set({ hud: d.hud, speedUnit: d.speedUnit });
      else if (this.tab === 'controls') settings.set({ touchControls: d.touchControls, touchLayout: null });
      else if (this.tab === 'graphics') settings.set({ quality: d.quality });
      else if (this.tab === 'audio') settings.set({ volume: d.volume, volEngine: d.volEngine, volTyres: d.volTyres, volCrash: d.volCrash, volEnv: d.volEnv, volUi: d.volUi, muted: d.muted });
      else {
        setLang(d.lang);
        settings.set({ lang: d.lang, accent: d.accent, uiScale: d.uiScale, reduceMotion: d.reduceMotion, uiLayout: d.uiLayout });
      }
    };
    this.body.replaceChildren(...rows, reset);
  }
}

function field(label: StringKey, control: HTMLElement): HTMLElement {
  return el('div', 'setting', el('label', '', t(label)), control);
}

function choice<V extends string>(label: StringKey, value: V, options: [V, StringKey][], set: (v: V) => void): HTMLElement {
  const seg = el('div', 'segmented');
  seg.role = 'radiogroup';
  for (const [v, key] of options) {
    const b = el('button', v === value ? 'active' : '', t(key));
    b.role = 'radio';
    b.ariaChecked = String(v === value);
    b.onclick = () => {
      set(v);
      notify(`${t(label)} · ${t(key)}`, '', { icon: 'settings', key: `set-${label}` });
    };
    seg.append(b);
  }
  return field(label, seg);
}

function slider(label: StringKey, value: number, min: number, max: number, step: number, format: (v: number) => string, set: (v: number) => void): HTMLElement {
  const input = Object.assign(document.createElement('input'), { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  const out = el('output', '', format(value));
  input.oninput = () => (out.textContent = format(Number(input.value)));
  input.onchange = () => {
    set(Number(input.value));
    notify(`${t(label)} · ${format(Number(input.value))}`, '', { icon: 'settings', key: `set-${label}` });
  };
  return field(label, el('div', 'range', input, out));
}

function toggle(label: StringKey, value: boolean, set: (v: boolean) => void): HTMLElement {
  const b = el('button', value ? 'switch on' : 'switch');
  b.role = 'switch';
  b.ariaChecked = String(value);
  b.append(el('i'));
  b.onclick = () => {
    set(!value);
    notify(`${t(label)} · ${t(value ? 'stateOff' : 'stateOn')}`, '', { icon: 'settings', key: `set-${label}` });
  };
  return field(label, b);
}

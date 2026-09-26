// Player settings (§18.3-14 설정, §18.4 HUD presets, §18.6 accessibility, units and language, §15.4 touch layout),
// kept in localStorage. A setting changed anywhere is applied everywhere through `onChange`.
import type { Lang } from './i18n';

export type HudPreset = 'none' | 'minimal' | 'racing' | 'engineer';
export type Quality = 'low' | 'medium' | 'high';
export type SpeedUnit = 'kmh' | 'mph';
export type Accent = 'orange' | 'blue' | 'mint';
/** Which UI to wear: by the device, the phone UI or the PC UI (ui/platform). */
export type UiLayout = 'auto' | 'mobile' | 'desktop';

export interface Settings {
  lang: Lang;
  hud: HudPreset;
  speedUnit: SpeedUnit;
  quality: Quality | 'auto';
  accent: Accent;
  uiScale: number;          // 0.75 … 1.5
  reduceMotion: boolean;
  touchControls: 'auto' | 'on' | 'off';
  uiLayout: UiLayout;       // phone UI or PC UI (a change reloads the page)
  touchLayout: unknown;     // TouchLayout (ui/TouchControls), stored as given
  lastMode: string | null;  // "최근 플레이 이어하기" (the main menu's continue card)
  minimapRotate: boolean;   // §18.4 미니맵(회전·고정)
  worldHour: number;        // free roam: time of day [h]
  worldWeather: string;     // free roam: weather
  worldTimeScale: number;   // game seconds per real second
  lastMap: string;          // free roam: map id
  car: string;              // the chosen car (showroom id): the menu shows it, every mode drives it
  volume: number;           // §17 mixer: master 0 … 1
  volEngine: number;
  volTyres: number;
  volCrash: number;
  volEnv: number;
  volUi: number;
  muted: boolean;
  uiVersion: number;        // stored settings older than the current UI get its new defaults once
}

/** UI generation: 2 = the redesigned frame (blue accent, slider steering by default). */
export const UI_VERSION = 2;

export const ACCENTS: Record<Accent, string> = { orange: '#ff6b2c', blue: '#3d8bff', mint: '#2ee6a6' };
/** Text colour on an accent fill (contrast ≥ 4.5 : 1). */
export const ACCENT_INK: Record<Accent, string> = { orange: '#140a05', blue: '#ffffff', mint: '#04140e' };

const KEY = 'apex.settings.v1';

export function defaultSettings(): Settings {
  return {
    lang: 'ko',
    hud: 'racing',
    speedUnit: 'kmh',
    quality: 'auto',
    accent: 'blue',
    uiScale: 1,
    reduceMotion: false,
    touchControls: 'auto',
    uiLayout: 'auto',
    touchLayout: null,
    lastMode: null,
    minimapRotate: true,
    worldHour: 13,
    worldWeather: 'clear',
    worldTimeScale: 30,
    lastMap: 'hanbit',
    car: 'porsche_911_turbo_991',
    volume: 0.8,
    volEngine: 0.8,
    volTyres: 0.7,
    volCrash: 0.9,
    volEnv: 0.6,
    volUi: 0.5,
    muted: false,
    uiVersion: UI_VERSION,
  };
}

/** Merges stored values over the defaults, keeping only known keys of the right type (old or hand-edited storage). */
export function parseSettings(raw: string | null): Settings {
  const base = defaultSettings();
  if (!raw) return base;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const out: Settings = { ...base };
    for (const k of Object.keys(base) as (keyof Settings)[]) {
      if (!(k in v)) continue;
      const value = v[k];
      if (k === 'touchLayout') out.touchLayout = value;
      else if (k === 'lastMode') out.lastMode = typeof value === 'string' ? value : null;
      else if (typeof value === typeof base[k]) (out as unknown as Record<string, unknown>)[k] = value;
    }
    out.uiScale = Math.min(1.5, Math.max(0.75, out.uiScale));
    if (!['auto', 'mobile', 'desktop'].includes(out.uiLayout)) out.uiLayout = 'auto';
    // Settings from before the redesign: its identity (accent) and the slider steering the player asked for.
    if (!(typeof v.uiVersion === 'number' && v.uiVersion >= UI_VERSION)) {
      if (out.accent === 'orange') out.accent = 'blue';
      if (out.touchLayout && typeof out.touchLayout === 'object') out.touchLayout = { ...(out.touchLayout as object), steer: 'slider' };
      out.uiVersion = UI_VERSION;
    }
    return out;
  } catch {
    return base;
  }
}

class Store {
  private value: Settings;
  private listeners: Array<(s: Settings) => void> = [];

  constructor() {
    let raw: string | null = null;
    try {
      raw = globalThis.localStorage?.getItem(KEY) ?? null;
    } catch {
      raw = null; // storage blocked (private mode, sandboxed frame): defaults for this session
    }
    this.value = parseSettings(raw);
  }

  get(): Settings {
    return this.value;
  }

  set(patch: Partial<Settings>): void {
    this.value = { ...this.value, ...patch };
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(this.value));
    } catch {
      // not persisted; still applied
    }
    for (const l of this.listeners) l(this.value);
  }

  onChange(l: (s: Settings) => void): () => void {
    this.listeners.push(l);
    return () => (this.listeners = this.listeners.filter((x) => x !== l));
  }
}

export const settings = new Store();

/** Rendering quality the device gets when set to auto: phones and small tablets low, others high. */
export function autoQuality(): Quality {
  const coarse = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  const cores = globalThis.navigator?.hardwareConcurrency ?? 4;
  if (coarse) return cores >= 8 ? 'medium' : 'low';
  return cores >= 6 ? 'high' : 'medium';
}

/** The accent as a number (3D materials take it when they are made). */
export function accentHex(s: Settings = settings.get()): number {
  return parseInt(ACCENTS[s.accent].slice(1), 16);
}

export function effectiveQuality(s: Settings = settings.get()): Quality {
  return s.quality === 'auto' ? autoQuality() : s.quality;
}

/** Applies the display settings to the document: accent colour, UI scale, reduced motion, language. */
export function applyDocumentSettings(s: Settings): void {
  const root = document.documentElement;
  root.style.setProperty('--accent', ACCENTS[s.accent]);
  root.style.setProperty('--accent-ink', ACCENT_INK[s.accent]);
  root.style.setProperty('--ui-scale', String(s.uiScale));
  root.classList.toggle('reduce-motion', s.reduceMotion);
  root.lang = s.lang;
}

// Player settings (§18.3-14 설정, §18.4 HUD presets, §18.6 accessibility, units and language, §15.4 touch layout),
// kept in localStorage. A setting changed anywhere is applied everywhere through `onChange`.
import type { Lang } from './i18n';

export type HudPreset = 'none' | 'minimal' | 'racing' | 'engineer';
export type Quality = 'low' | 'medium' | 'high';
export type SpeedUnit = 'kmh' | 'mph';
export type Accent = 'orange' | 'blue' | 'mint';

export interface Settings {
  lang: Lang;
  hud: HudPreset;
  speedUnit: SpeedUnit;
  quality: Quality | 'auto';
  accent: Accent;
  uiScale: number;          // 0.75 … 1.5
  reduceMotion: boolean;
  touchControls: 'auto' | 'on' | 'off';
  touchLayout: unknown;     // TouchLayout (ui/TouchControls), stored as given
  lastMode: string | null;  // "최근 플레이 이어하기" (the main menu's continue card)
  minimapRotate: boolean;   // §18.4 미니맵(회전·고정)
  worldHour: number;        // free roam: time of day [h]
  worldWeather: string;     // free roam: weather
  worldTimeScale: number;   // game seconds per real second
  lastMap: string;          // free roam: map id
}

export const ACCENTS: Record<Accent, string> = { orange: '#ff6b2c', blue: '#3d8bff', mint: '#2ee6a6' };

const KEY = 'apex.settings.v1';

export function defaultSettings(): Settings {
  return {
    lang: 'ko',
    hud: 'racing',
    speedUnit: 'kmh',
    quality: 'auto',
    accent: 'orange',
    uiScale: 1,
    reduceMotion: false,
    touchControls: 'auto',
    touchLayout: null,
    lastMode: null,
    minimapRotate: true,
    worldHour: 13,
    worldWeather: 'clear',
    worldTimeScale: 30,
    lastMap: 'hanbit',
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

export function effectiveQuality(s: Settings = settings.get()): Quality {
  return s.quality === 'auto' ? autoQuality() : s.quality;
}

/** Applies the display settings to the document: accent colour, UI scale, reduced motion, language. */
export function applyDocumentSettings(s: Settings): void {
  const root = document.documentElement;
  root.style.setProperty('--accent', ACCENTS[s.accent]);
  root.style.setProperty('--ui-scale', String(s.uiScale));
  root.classList.toggle('reduce-motion', s.reduceMotion);
  root.lang = s.lang;
}

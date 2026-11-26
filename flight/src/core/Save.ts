// Persistent settings + progress (localStorage, guarded).
export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export type ControlMode = 'split' | 'stick' | 'tilt';
export type AssistLevel = 'beginner' | 'standard' | 'realistic';

export interface Settings {
  quality: Quality;
  resScale: number; // 0.5..1.25 multiplier on DPR
  shadows: boolean;
  bloom: boolean;
  clouds: boolean;
  trees: number; // 0..1
  showFps: boolean;
  controlMode: ControlMode;
  swapSides: boolean;
  invertPitch: boolean;
  sensitivity: number; // 0.5..1.5
  assist: AssistLevel;
  autoRudder: boolean;
  groundAssist: boolean;
  landingAssist: boolean;
  units: 'aviation' | 'metric';
  volume: number;
  engineVol: number;
  voice: boolean;
  vibration: boolean;
  hudColor: 'green' | 'cyan' | 'amber';
}

export interface Progress {
  stars: Record<string, number>;
  best: Record<string, number>;
  flights: number;
  landings: number;
  bestLanding: number;
  kills: number;
  flightTime: number;
  selectedAircraft: string;
  liveries: Record<string, number>;
  tutorialSeen: boolean;
}

const isMobile = typeof navigator !== 'undefined' && (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900));

export const DEFAULT_SETTINGS: Settings = {
  quality: isMobile ? 'medium' : 'high',
  resScale: 1,
  shadows: true,
  bloom: true,
  clouds: true,
  trees: isMobile ? 0.6 : 1,
  showFps: false,
  controlMode: isMobile ? 'split' : 'stick',
  swapSides: false,
  invertPitch: false,
  sensitivity: 1,
  assist: 'beginner',
  autoRudder: true,
  groundAssist: true,
  landingAssist: true,
  units: 'aviation',
  volume: 0.8,
  engineVol: 0.8,
  voice: true,
  vibration: true,
  hudColor: 'green',
};

const DEFAULT_PROGRESS: Progress = {
  stars: {}, best: {}, flights: 0, landings: 0, bestLanding: 0, kills: 0, flightTime: 0,
  selectedAircraft: 'kestrel', liveries: {}, tutorialSeen: false,
};

const KEY = 'skyace.v1';

function load(): { settings: Settings; progress: Progress } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return { settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) }, progress: { ...DEFAULT_PROGRESS, ...(d.progress || {}) } };
    }
  } catch { /* storage blocked */ }
  return { settings: { ...DEFAULT_SETTINGS }, progress: structuredClone(DEFAULT_PROGRESS) };
}

const state = load();
export const settings = state.settings;
export const progress = state.progress;
export const IS_MOBILE = isMobile;

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ settings, progress })); } catch { /* ignore */ }
}
export function resetProgress() {
  Object.assign(progress, structuredClone(DEFAULT_PROGRESS));
  save();
}

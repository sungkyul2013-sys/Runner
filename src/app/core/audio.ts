/**
 * Tiny synthesised UI sound kit — no audio files, no network.
 * Every sound is a short shaped oscillator so the whole app stays offline.
 */

import { store } from './store';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ensure(): AudioContext | null {
  if (!store.profile.settings.sound) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface ToneOpts {
  freq: number;
  to?: number;
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

function tone(o: ToneOpts): void {
  const c = ensure();
  if (!c || !master) return;
  const t0 = c.currentTime + (o.delay ?? 0);
  const dur = o.dur ?? 0.12;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.5, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sfx = {
  tap: () => tone({ freq: 620, to: 520, dur: 0.06, type: 'triangle', gain: 0.28 }),
  nav: () => {
    tone({ freq: 440, to: 660, dur: 0.1, type: 'sine', gain: 0.3 });
    tone({ freq: 880, dur: 0.08, type: 'sine', gain: 0.12, delay: 0.04 });
  },
  correct: () => {
    tone({ freq: 659, dur: 0.1, type: 'sine', gain: 0.4 });
    tone({ freq: 988, dur: 0.14, type: 'sine', gain: 0.32, delay: 0.07 });
    tone({ freq: 1319, dur: 0.2, type: 'sine', gain: 0.2, delay: 0.14 });
  },
  wrong: () => {
    tone({ freq: 220, to: 150, dur: 0.22, type: 'sawtooth', gain: 0.22 });
    tone({ freq: 165, to: 120, dur: 0.26, type: 'sine', gain: 0.18, delay: 0.03 });
  },
  levelUp: () => {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ freq: f, dur: 0.24, type: 'triangle', gain: 0.32, delay: i * 0.09 }),
    );
  },
  badge: () => {
    [784, 1047, 1319].forEach((f, i) => tone({ freq: f, dur: 0.3, type: 'sine', gain: 0.28, delay: i * 0.07 }));
  },
  tick: () => tone({ freq: 1200, dur: 0.03, type: 'square', gain: 0.06 }),
  done: () => {
    tone({ freq: 392, dur: 0.18, type: 'sine', gain: 0.3 });
    tone({ freq: 587, dur: 0.32, type: 'sine', gain: 0.26, delay: 0.12 });
  },
  flip: () => tone({ freq: 340, to: 700, dur: 0.09, type: 'triangle', gain: 0.18 }),
};

/** Browsers gate audio until a gesture; wire that up once. */
export function unlockAudioOnFirstGesture(): void {
  const kick = () => {
    ensure();
    window.removeEventListener('pointerdown', kick);
    window.removeEventListener('keydown', kick);
  };
  window.addEventListener('pointerdown', kick, { once: false });
  window.addEventListener('keydown', kick, { once: false });
}

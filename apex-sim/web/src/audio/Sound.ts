// Sound (§17), synthesised with WebAudio — no samples to download. Driven by the car's telemetry:
//  engine   firing-frequency layers (rpm × cylinders / 2 for a four-stroke) through a load-dependent low-pass and a
//           soft clipper, a sub-harmonic rumble, and the turbo's whistle rising with boost (throttle × rpm);
//  tyres    squeal from slip (angle and ratio) × load, scrub on gravel, the rim scraping when a tyre is off;
//  road     low rumble growing with speed; wind: band-passed noise growing with the square of the airspeed;
//  crash    a burst whose loudness and colour follow the impact force (metal crunch, then debris rattle), glass;
//  UI       a soft click for buttons.
// The mixer has master, engine, tyres, crash, environment and UI volumes (settings). Audio starts on the first user
// gesture (the browsers' autoplay rule); until then everything is silent.
import type { VehicleState } from '../physics/telemetry';

export interface MixerLevels {
  master: number;
  engine: number;
  tyres: number;
  crash: number;
  env: number;
  ui: number;
}

export const DEFAULT_MIX: MixerLevels = { master: 0.8, engine: 0.8, tyres: 0.7, crash: 0.9, env: 0.6, ui: 0.5 };

/** Engine character (the four-stroke firing order sets the pitch; the rest the colour). */
export interface EngineVoice {
  cylinders: number;
  turbo: boolean;
  idleRpm: number;
  redlineRpm: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

class Engine {
  private readonly out: GainNode;
  private readonly main: OscillatorNode;
  private readonly second: OscillatorNode;
  private readonly sub: OscillatorNode;
  private readonly filter: BiquadFilterNode;
  private readonly mainGain: GainNode;
  private readonly subGain: GainNode;
  private readonly turbo: OscillatorNode;
  private readonly turboGain: GainNode;
  private readonly intake: AudioBufferSourceNode;
  private readonly intakeFilter: BiquadFilterNode;
  private readonly intakeGain: GainNode;

  constructor(private readonly ctx: AudioContext, dest: AudioNode, noise: AudioBuffer, private voice: EngineVoice) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(2.2 * x);
    }
    shaper.curve = curve;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 3;
    this.mainGain = ctx.createGain();
    this.main = ctx.createOscillator();
    this.main.type = 'sawtooth';
    this.second = ctx.createOscillator();
    this.second.type = 'square';
    const secondGain = ctx.createGain();
    secondGain.gain.value = 0.35;
    this.main.connect(this.mainGain);
    this.second.connect(secondGain).connect(this.mainGain);
    this.mainGain.connect(shaper).connect(this.filter).connect(this.out);
    this.sub = ctx.createOscillator();
    this.sub.type = 'triangle';
    this.subGain = ctx.createGain();
    this.sub.connect(this.subGain).connect(this.out);
    this.turbo = ctx.createOscillator();
    this.turbo.type = 'sine';
    this.turboGain = ctx.createGain();
    this.turboGain.gain.value = 0;
    this.turbo.connect(this.turboGain).connect(this.out);
    this.intake = ctx.createBufferSource();
    this.intake.buffer = noise;
    this.intake.loop = true;
    this.intakeFilter = ctx.createBiquadFilter();
    this.intakeFilter.type = 'bandpass';
    this.intakeFilter.Q.value = 1.2;
    this.intakeGain = ctx.createGain();
    this.intake.connect(this.intakeFilter).connect(this.intakeGain).connect(this.out);
    for (const o of [this.main, this.second, this.sub, this.turbo]) o.start();
    this.intake.start();
  }

  setVoice(v: EngineVoice): void {
    this.voice = v;
  }

  update(rpm: number, throttle: number, running: boolean, level: number): void {
    const t = this.ctx.currentTime, tc = 0.03;
    const v = this.voice;
    const r = Math.max(rpm, running ? v.idleRpm * 0.9 : 0);
    const firing = (r / 60) * (v.cylinders / 2); // [Hz]
    const load = clamp01(throttle);
    const rev = clamp01((r - v.idleRpm) / Math.max(v.redlineRpm - v.idleRpm, 1));
    this.main.frequency.setTargetAtTime(Math.max(firing, 8), t, tc);
    this.second.frequency.setTargetAtTime(Math.max(firing * 2, 16), t, tc);
    this.sub.frequency.setTargetAtTime(Math.max(firing / 2, 4), t, tc);
    // Load opens the sound up (the intake roars, the exhaust note gets bright); a closed throttle mutes the top.
    this.filter.frequency.setTargetAtTime(260 + firing * (1.6 + 3.2 * load) + 900 * load * rev, t, tc);
    this.mainGain.gain.setTargetAtTime(0.18 + 0.32 * load, t, tc);
    this.subGain.gain.setTargetAtTime(0.16 * (1 - 0.5 * rev), t, tc);
    this.intakeFilter.frequency.setTargetAtTime(500 + firing * 4, t, tc);
    this.intakeGain.gain.setTargetAtTime(0.05 + 0.25 * load * (0.3 + rev), t, tc);
    const boost = v.turbo ? clamp01(load * 1.3 - 0.2) * clamp01((r - 2000) / 3500) : 0;
    this.turbo.frequency.setTargetAtTime(2400 + 5200 * boost, t, 0.25);
    this.turboGain.gain.setTargetAtTime(0.025 * boost, t, 0.2);
    this.out.gain.setTargetAtTime(running ? level * (0.35 + 0.65 * (0.4 + 0.6 * rev)) : 0, t, running ? 0.05 : 0.4);
  }

  stop(): void {
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  }
}

/** A looping filtered noise voice (tyre squeal, road, wind, scrape). */
class NoiseVoice {
  readonly gain: GainNode;
  readonly filter: BiquadFilterNode;
  constructor(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer, type: BiquadFilterType, freq: number, q: number) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = type;
    this.filter.frequency.value = freq;
    this.filter.Q.value = q;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    src.connect(this.filter).connect(this.gain).connect(dest);
    src.start(ctx.currentTime + Math.random() * 0.5);
  }
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Record<keyof Omit<MixerLevels, 'master'>, GainNode> | null = null;
  private noise: AudioBuffer | null = null;
  private engine: Engine | null = null;
  private squeal: NoiseVoice | null = null;
  private squealTone: OscillatorNode | null = null;
  private squealToneGain: GainNode | null = null;
  private road: NoiseVoice | null = null;
  private wind: NoiseVoice | null = null;
  private scrape: NoiseVoice | null = null;
  private mix: MixerLevels = { ...DEFAULT_MIX };
  private muted = false;
  private voice: EngineVoice = { cylinders: 6, turbo: true, idleRpm: 850, redlineRpm: 7200 };
  private lastEvents = -1;
  private lastBody = -1;

  constructor() {
    // Browsers start audio only from a user gesture: the first one anywhere starts it.
    const start = () => {
      this.ensure();
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
    };
    for (const type of ['pointerdown', 'keydown', 'touchstart'] as const) window.addEventListener(type, start, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
    // UI: a quiet click for every button press.
    document.addEventListener('click', (e) => {
      if (e.target instanceof Element && e.target.closest('button, [role=button], .tc-c')) this.click();
    }, { capture: true });
  }

  private ensure(): boolean {
    if (this.ctx) return true;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return false;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    this.ctx = ctx;
    // A gentle compressor on the master: crashes do not clip, the engine stays present (night mode would squeeze more).
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    const bus = () => {
      const g = ctx.createGain();
      g.connect(this.master!);
      return g;
    };
    this.buses = { engine: bus(), tyres: bus(), crash: bus(), env: bus(), ui: bus() };
    // Two seconds of white noise, shared by every noise voice.
    const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
    this.engine = new Engine(ctx, this.buses.engine, n, this.voice);
    this.squeal = new NoiseVoice(ctx, this.buses.tyres, n, 'bandpass', 1100, 9);
    this.squealTone = ctx.createOscillator();
    this.squealTone.type = 'triangle';
    this.squealTone.frequency.value = 950;
    this.squealToneGain = ctx.createGain();
    this.squealToneGain.gain.value = 0;
    this.squealTone.connect(this.squealToneGain).connect(this.buses.tyres);
    this.squealTone.start();
    this.road = new NoiseVoice(ctx, this.buses.env, n, 'lowpass', 160, 0.7);
    this.wind = new NoiseVoice(ctx, this.buses.env, n, 'bandpass', 700, 0.5);
    this.scrape = new NoiseVoice(ctx, this.buses.crash, n, 'bandpass', 2600, 4);
    this.applyMix();
    return true;
  }

  setMix(m: Partial<MixerLevels>, muted = this.muted): void {
    this.mix = { ...this.mix, ...m };
    this.muted = muted;
    this.applyMix();
  }

  private applyMix(): void {
    if (!this.ctx || !this.master || !this.buses) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.mix.master, t, 0.05);
    for (const k of Object.keys(this.buses) as Array<keyof typeof this.buses>) this.buses[k].gain.setTargetAtTime(this.mix[k], t, 0.05);
  }

  setEngine(v: Partial<EngineVoice>): void {
    this.voice = { ...this.voice, ...v };
    this.engine?.setVoice(this.voice);
  }

  /** Per rendered frame with the driven car's state (null: no car — everything fades out). */
  update(v: VehicleState | null, timeScale = 1, paused = false): void {
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    if (!v || paused) {
      this.engine.stop();
      for (const n of [this.squeal, this.road, this.wind, this.scrape]) n?.gain.gain.setTargetAtTime(0, t, 0.1);
      this.squealToneGain?.gain.setTargetAtTime(0, t, 0.1);
      return;
    }
    // Slow motion: the world's sounds drop in pitch and level with the time scale.
    const slow = Math.min(1, Math.max(0.15, timeScale));
    this.engine.update(v.engineRpm * slow, v.throttle, v.engineRunning, 1);
    const speed = Math.abs(v.speed);
    // Tyres: the loudest-sliding tyre sets the squeal (slip angle past ≈ 5°, slip ratio past ≈ 0.1), scaled by load.
    let slide = 0, scrape = 0;
    for (const w of v.wheels) {
      if (w.contact) {
        const s = Math.max(0, Math.abs(w.slipAngle) - 0.09) * 5 + Math.max(0, Math.abs(w.slipRatio) - 0.1) * 3;
        slide = Math.max(slide, Math.min(1, s) * Math.min(1, w.load / 4000) * Math.min(1, speed / 4));
      }
      scrape = Math.max(scrape, w.sparks);
    }
    this.squeal!.gain.gain.setTargetAtTime(0.28 * slide * slow, t, 0.05);
    this.squeal!.filter.frequency.setTargetAtTime((900 + 500 * slide) * slow, t, 0.05);
    this.squealToneGain!.gain.setTargetAtTime(0.05 * slide * slide * slow, t, 0.05);
    this.squealTone!.frequency.setTargetAtTime((820 + 260 * slide + 40 * Math.sin(t * 13)) * slow, t, 0.05);
    this.road!.gain.gain.setTargetAtTime(Math.min(0.5, 0.012 * speed) * slow, t, 0.1);
    this.road!.filter.frequency.setTargetAtTime((120 + speed * 4) * slow, t, 0.1);
    const air = Math.max(0, v.airspeed);
    this.wind!.gain.gain.setTargetAtTime(Math.min(0.55, 0.00004 * air * air) * slow, t, 0.1);
    this.wind!.filter.frequency.setTargetAtTime((400 + air * 18) * slow, t, 0.1);
    this.scrape!.gain.gain.setTargetAtTime(0.3 * scrape * slow, t, 0.04);
    // Crash events: one burst per new event, as loud as its peak force; a new car resets the count.
    if (v.body !== this.lastBody) {
      this.lastBody = v.body;
      this.lastEvents = v.crashEvents;
    }
    if (v.crashEvents > this.lastEvents) {
      this.lastEvents = v.crashEvents;
      this.impact(v.eventPeakForce, slow);
    }
  }

  /** A crash: a low thump, a metal crunch and debris, loudness and length from the peak force [N]. */
  impact(force: number, slow = 1): void {
    if (!this.ctx || !this.noise || !this.buses) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const k = Math.min(1, Math.log10(Math.max(force, 1e3) / 1e3) / 3); // 1 kN … 1 MN → 0 … 1
    const len = (0.25 + 1.2 * k) / Math.max(slow, 0.2);
    const burst = (type: BiquadFilterType, f: number, q: number, gain: number, decay: number, delay = 0) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.playbackRate.value = slow;
      const flt = ctx.createBiquadFilter();
      flt.type = type;
      flt.frequency.value = f * slow;
      flt.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + delay);
      g.gain.linearRampToValueAtTime(gain, t + delay + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0005, t + delay + decay);
      src.connect(flt).connect(g).connect(this.buses!.crash);
      src.start(t + delay, Math.random());
      src.stop(t + delay + decay + 0.05);
    };
    burst('lowpass', 140, 0.8, 0.9 * (0.3 + 0.7 * k), 0.35 * len);            // thump
    burst('bandpass', 900, 1.5, 0.55 * (0.2 + 0.8 * k), 0.6 * len, 0.01);     // crunch
    burst('highpass', 3500, 0.7, 0.25 * k, 0.9 * len, 0.05);                  // debris, glass
    // Metal: a few inharmonic partials ringing out.
    for (const [f, a] of [[183, 0.12], [431, 0.08], [977, 0.05]] as const) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f * (0.9 + Math.random() * 0.2) * slow;
      const g = ctx.createGain();
      g.gain.setValueAtTime(a * k, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.5 * len);
      o.connect(g).connect(this.buses.crash);
      o.start(t);
      o.stop(t + 0.55 * len);
    }
  }

  /** Glass breaking (a windscreen or a lamp). */
  glass(amount = 1): void {
    if (!this.ctx || !this.noise || !this.buses) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const flt = ctx.createBiquadFilter();
      flt.type = 'bandpass';
      flt.frequency.value = 3000 + Math.random() * 5000;
      flt.Q.value = 6;
      const g = ctx.createGain();
      const d = i * 0.03 + Math.random() * 0.05;
      g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(0.25 * amount, t + d + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0005, t + d + 0.18 + Math.random() * 0.2);
      src.connect(flt).connect(g).connect(this.buses.crash);
      src.start(t + d, Math.random());
      src.stop(t + d + 0.5);
    }
  }

  /** A soft UI click. */
  click(): void {
    if (!this.ctx || !this.buses || this.ctx.state !== 'running') return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(700, t + 0.04);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.05);
    o.connect(g).connect(this.buses.ui);
    o.start(t);
    o.stop(t + 0.06);
  }
}

/** The app's one sound system. */
export const sound = typeof window !== 'undefined' ? new Sound() : (null as unknown as Sound);

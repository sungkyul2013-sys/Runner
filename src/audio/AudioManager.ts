/**
 * All sound is synthesised with the Web Audio API — no asset files, fully
 * original, works offline. Provides the short SFX set (jump, roll, coin, crash,
 * power-up, whistle, UI) plus a looping two-bar synth track with a driving
 * bassline that suits a train yard. The AudioContext is created lazily and
 * resumed on the first user gesture, per the browser autoplay rules.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted: boolean;
  private bgmTimer: number | null = null;
  private bgmStep = 0;

  constructor(muted = false) {
    this.muted = muted;
  }

  /** Create/resume the audio context — call from a user gesture. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext
          || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.45;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      /* audio unavailable — the game stays fully playable */
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.45;
  }

  private get t(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** A short oscillator note with an exponential decay, optional pitch slide. */
  private blip(
    freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, when = 0,
  ): void {
    if (!this.ctx || !this.master) return;
    const t = this.t + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** A burst of filtered noise (impacts, slides, wheel rumble). */
  private noise(dur: number, vol: number, filter?: { type: BiquadFilterType; freq: number }): void {
    if (!this.ctx || !this.master) return;
    const t = this.t;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = filter.type;
      f.frequency.value = filter.freq;
      src.connect(f).connect(g).connect(this.master);
    } else {
      src.connect(g).connect(this.master);
    }
    src.start(t);
  }

  jump(): void {
    this.blip(340, 0.16, 'square', 0.16, 720);
  }
  slide(): void {
    this.noise(0.26, 0.16, { type: 'bandpass', freq: 1400 });
  }
  whoosh(): void {
    this.noise(0.12, 0.1, { type: 'highpass', freq: 900 });
  }
  coin(): void {
    this.blip(1046, 0.05, 'triangle', 0.14);
    this.blip(1568, 0.09, 'triangle', 0.12, undefined, 0.045);
  }
  crash(): void {
    this.noise(0.45, 0.42, { type: 'lowpass', freq: 900 });
    this.blip(140, 0.42, 'sawtooth', 0.3, 46);
  }
  power(): void {
    this.blip(523, 0.09, 'square', 0.14);
    this.blip(659, 0.09, 'square', 0.14, undefined, 0.07);
    this.blip(880, 0.15, 'square', 0.14, undefined, 0.14);
  }
  /** The inspector's whistle — used when the chase closes in. */
  whistle(): void {
    this.blip(1900, 0.16, 'sine', 0.1, 2300);
    this.blip(2200, 0.2, 'sine', 0.08, 1800, 0.12);
  }
  ui(): void {
    this.blip(620, 0.045, 'square', 0.09);
  }

  // ── Looping BGM: a two-bar minor progression with a driving pulse ──────────
  private static readonly BASS = [98, 98, 73.4, 73.4, 87.3, 87.3, 110, 110];
  private static readonly LEAD = [
    587.3, 698.5, 880, 698.5, 523.3, 587.3, 698.5, 0,
    659.3, 784, 987.8, 784, 587.3, 659.3, 784, 0,
  ];

  startBgm(): void {
    if (this.bgmTimer !== null || !this.ctx) return;
    const stepMs = 210;
    this.bgmTimer = window.setInterval(() => {
      if (!this.ctx) return;
      const s = this.bgmStep++;
      this.blip(AudioManager.BASS[(s >> 1) % AudioManager.BASS.length], 0.22, 'triangle', 0.1);
      const lead = AudioManager.LEAD[s % AudioManager.LEAD.length];
      if (lead > 0) this.blip(lead, 0.14, 'square', 0.038);
      if (s % 4 === 0) this.noise(0.05, 0.05, { type: 'lowpass', freq: 220 }); // kick
      if (s % 2 === 1) this.noise(0.025, 0.026, { type: 'highpass', freq: 6000 }); // hat
    }, stepMs);
  }

  stopBgm(): void {
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

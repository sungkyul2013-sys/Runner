/**
 * All sound is synthesised with the Web Audio API — zero asset files, fully
 * original, works offline. Provides short SFX (jump/slide/coin/crash/power-up/
 * UI) and a simple looping synth BGM, with a master mute. The AudioContext is
 * created lazily and resumed on the first user gesture (browser autoplay rule).
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
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      /* audio unavailable — game stays fully playable */
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  private get t(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** A short oscillator note with an exponential decay, optional pitch slide. */
  private blip(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, when = 0): void {
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

  /** A burst of filtered noise (impacts / slides). */
  private noise(dur: number, vol: number): void {
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
    src.connect(g).connect(this.master);
    src.start(t);
  }

  jump(): void { this.blip(360, 0.18, 'square', 0.2, 760); }
  slide(): void { this.noise(0.22, 0.16); }
  whoosh(): void { this.noise(0.1, 0.1); }
  coin(): void { this.blip(988, 0.06, 'triangle', 0.18); this.blip(1319, 0.1, 'triangle', 0.16, undefined, 0.05); }
  crash(): void { this.noise(0.4, 0.5); this.blip(120, 0.4, 'sawtooth', 0.35, 50); }
  power(): void { this.blip(523, 0.1, 'square', 0.16); this.blip(659, 0.1, 'square', 0.16, undefined, 0.08); this.blip(784, 0.16, 'square', 0.16, undefined, 0.16); }
  ui(): void { this.blip(620, 0.05, 'square', 0.1); }

  // ── Looping BGM: a warm two-bar progression (Am–F–C–G feel) ──────────────────
  //   16 steps; bass on halves, arpeggio lead, soft hat on off-beats.
  private static readonly BASS = [110, 110, 87.3, 87.3, 130.8, 130.8, 98, 98];
  private static readonly LEAD = [
    440, 523.3, 659.3, 523.3, 349.2, 440, 523.3, 0,
    523.3, 659.3, 784, 659.3, 392, 494, 587.3, 0,
  ];

  startBgm(): void {
    if (this.bgmTimer !== null || !this.ctx) return;
    const stepMs = 230;
    this.bgmTimer = window.setInterval(() => {
      if (!this.ctx) return;
      const s = this.bgmStep++;
      this.blip(AudioManager.BASS[(s >> 1) % AudioManager.BASS.length], 0.24, 'triangle', 0.11);
      const lead = AudioManager.LEAD[s % AudioManager.LEAD.length];
      if (lead > 0) this.blip(lead, 0.15, 'square', 0.045);
      if (s % 2 === 1) this.noise(0.03, 0.03); // hat
    }, stepMs);
  }

  stopBgm(): void {
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

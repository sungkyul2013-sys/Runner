import { settings } from './Save';
import { clamp } from './math';

/** Fully synthesised Web Audio engine — no sample files needed. */
export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private eng!: { kind: 'jet' | 'prop'; gain: GainNode; f1: BiquadFilterNode; whine: OscillatorNode; whineG: GainNode; ab: GainNode; abF: BiquadFilterNode; saw: OscillatorNode; saw2: OscillatorNode; sawG: GainNode; chop: GainNode; lfo: OscillatorNode; cockpit: BiquadFilterNode };
  private wind!: { gain: GainNode; f: BiquadFilterNode };
  private stallHorn!: { osc: OscillatorNode; gain: GainNode };
  private warnTone!: { osc: OscillatorNode; gain: GainNode };
  private rain!: GainNode;
  private noiseBuf!: AudioBuffer;
  private lastSpeak = new Map<string, number>();
  private music: GainNode | null = null;
  private musicNodes: AudioNode[] = [];

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.master.gain.value = settings.volume;
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = w * 0.6 + b * 3; }
    const noise = () => { const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; s.start(); return s; };

    // engine chain
    const cockpit = ctx.createBiquadFilter(); cockpit.type = 'lowpass'; cockpit.frequency.value = 20000;
    const egain = ctx.createGain(); egain.gain.value = 0;
    egain.connect(cockpit).connect(this.master);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 0.8;
    noise().connect(f1).connect(egain);
    const whine = ctx.createOscillator(); whine.type = 'sine';
    const whineG = ctx.createGain(); whineG.gain.value = 0;
    whine.connect(whineG).connect(egain); whine.start();
    const abF = ctx.createBiquadFilter(); abF.type = 'lowpass'; abF.frequency.value = 400;
    const ab = ctx.createGain(); ab.gain.value = 0;
    noise().connect(abF).connect(ab).connect(egain);
    const saw = ctx.createOscillator(); saw.type = 'sawtooth';
    const saw2 = ctx.createOscillator(); saw2.type = 'square';
    const sawF = ctx.createBiquadFilter(); sawF.type = 'lowpass'; sawF.frequency.value = 900;
    const sawG = ctx.createGain(); sawG.gain.value = 0;
    const chop = ctx.createGain(); chop.gain.value = 1;
    const lfo = ctx.createOscillator(); lfo.type = 'sine';
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.45;
    lfo.connect(lfoG).connect(chop.gain); lfo.start();
    saw.connect(sawF); saw2.connect(sawF); sawF.connect(chop).connect(sawG).connect(egain);
    saw.start(); saw2.start();
    this.eng = { kind: 'jet', gain: egain, f1, whine, whineG, ab, abF, saw, saw2, sawG, chop, lfo, cockpit };

    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.Q.value = 0.5;
    const wg = ctx.createGain(); wg.gain.value = 0;
    noise().connect(wf).connect(wg).connect(this.master);
    this.wind = { gain: wg, f: wf };

    const so = ctx.createOscillator(); so.type = 'square'; so.frequency.value = 420;
    const sg = ctx.createGain(); sg.gain.value = 0;
    const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 1500;
    so.connect(sf).connect(sg).connect(this.master); so.start();
    this.stallHorn = { osc: so, gain: sg };
    const wo = ctx.createOscillator(); wo.type = 'square'; wo.frequency.value = 1000;
    const wgn = ctx.createGain(); wgn.gain.value = 0;
    wo.connect(wgn).connect(this.master); wo.start();
    this.warnTone = { osc: wo, gain: wgn };
    const rf = ctx.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 2500;
    this.rain = ctx.createGain(); this.rain.gain.value = 0;
    noise().connect(rf).connect(this.rain).connect(this.master);
  }

  setVolume() { if (this.ctx) this.master.gain.value = settings.volume; }

  engine(kind: 'jet' | 'prop', rpm: number, ab: number, tas: number, inCockpit: boolean, doppler: number, distGain: number, rain: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const e = this.eng;
    const ev = settings.engineVol * distGain;
    e.cockpit.frequency.setTargetAtTime(inCockpit ? 1400 : 18000, t, 0.1);
    if (kind === 'jet') {
      e.gain.gain.setTargetAtTime((0.12 + rpm * 0.4 + ab * 0.35) * ev, t, 0.1);
      e.f1.frequency.setTargetAtTime((300 + rpm * 1800) * doppler, t, 0.1);
      e.whine.frequency.setTargetAtTime((1800 + rpm * 4200) * doppler, t, 0.1);
      e.whineG.gain.setTargetAtTime(0.04 + rpm * 0.05, t, 0.1);
      e.ab.gain.setTargetAtTime(ab * 1.4, t, 0.1);
      e.abF.frequency.setTargetAtTime(200 + ab * 500, t, 0.1);
      e.sawG.gain.setTargetAtTime(0, t, 0.1);
    } else {
      const f = (38 + rpm * 80) * doppler;
      e.gain.gain.setTargetAtTime((0.15 + rpm * 0.5) * ev, t, 0.1);
      e.saw.frequency.setTargetAtTime(f, t, 0.08);
      e.saw2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
      e.lfo.frequency.setTargetAtTime(f * 0.5, t, 0.08);
      e.sawG.gain.setTargetAtTime(0.5, t, 0.1);
      e.f1.frequency.setTargetAtTime((250 + rpm * 500) * doppler, t, 0.1);
      e.whineG.gain.setTargetAtTime(0, t, 0.1);
      e.ab.gain.setTargetAtTime(0, t, 0.1);
    }
    this.wind.gain.gain.setTargetAtTime(clamp(tas / 260, 0, 1) ** 1.5 * 0.5 * (inCockpit ? 0.6 : 1), t, 0.2);
    this.wind.f.frequency.setTargetAtTime(300 + tas * 6, t, 0.2);
    this.rain.gain.setTargetAtTime(rain * 0.12, t, 0.5);
  }

  silenceEngine() { if (!this.ctx) return; const t = this.ctx.currentTime; this.eng.gain.gain.setTargetAtTime(0, t, 0.2); this.wind.gain.gain.setTargetAtTime(0, t, 0.2); this.stallHorn.gain.gain.setTargetAtTime(0, t, 0.05); this.warnTone.gain.gain.setTargetAtTime(0, t, 0.05); this.rain.gain.setTargetAtTime(0, t, 0.3); }

  stall(on: boolean) { if (this.ctx) this.stallHorn.gain.gain.setTargetAtTime(on ? 0.08 : 0, this.ctx.currentTime, 0.03); }
  /** Lock / missile warning tones. mode: 0 off, 1 seeking, 2 locked, 3 missile warning */
  tone(mode: number, time: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    let g = 0, f = 1000;
    if (mode === 1) { g = Math.sin(time * 18) > 0 ? 0.05 : 0; f = 900; }
    else if (mode === 2) { g = 0.06; f = 1500; }
    else if (mode === 3) { g = Math.sin(time * 30) > 0 ? 0.09 : 0; f = 1900; }
    this.warnTone.osc.frequency.setTargetAtTime(f, t, 0.01);
    this.warnTone.gain.gain.setTargetAtTime(g, t, 0.01);
  }

  private burst(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'lowpass', sweep = 0, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * sweep), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  private beep(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  gun() { this.burst(0.07, 1800, 0.7, 0.16, 'bandpass', 0.4); this.burst(0.05, 200, 1, 0.12); }
  missile() { this.burst(1.4, 1200, 0.6, 0.35, 'bandpass', 0.25); this.burst(0.4, 120, 1, 0.4); }
  explosion(dist: number, size: number) {
    const g = clamp(1.2 / (1 + dist / 400), 0.02, 1) * Math.min(1.5, size);
    const delay = Math.min(3, dist / 340);
    this.burst(1.8 + size * 0.5, 900, 0.7, 0.6 * g, 'lowpass', 0.06, delay);
    this.burst(0.6, 90, 1, 0.9 * g, 'lowpass', 0.5, delay);
  }
  thunder(dist: number) { this.burst(4, 400, 0.4, 0.5 / (1 + dist / 2000), 'lowpass', 0.15, dist / 340); }
  hit() { this.burst(0.12, 2500, 1.5, 0.25, 'bandpass'); this.beep(140, 0.15, 0.15, 'square'); }
  touchdown(strength: number) { this.burst(0.35, 2200, 2, clamp(strength, 0.05, 0.4), 'bandpass', 0.5); this.burst(0.2, 120, 1, clamp(strength * 1.5, 0.1, 0.6)); }
  gearMotor() { this.burst(2.6, 320, 4, 0.06, 'bandpass', 1.2); }
  click() { this.beep(1800, 0.04, 0.06, 'square'); }
  ui() { this.beep(1200, 0.05, 0.05, 'sine'); this.beep(1800, 0.06, 0.03, 'sine', 0.03); }
  ring(ok: boolean) { if (ok) { this.beep(880, 0.12, 0.12, 'triangle'); this.beep(1320, 0.18, 0.12, 'triangle', 0.08); } else this.beep(220, 0.25, 0.12, 'sawtooth'); }
  success() { [523, 659, 784, 1046].forEach((f, i) => this.beep(f, 0.5, 0.1, 'triangle', i * 0.12)); }
  fail() { [392, 330, 262].forEach((f, i) => this.beep(f, 0.5, 0.1, 'sawtooth', i * 0.18)); }
  catapult() { this.burst(2.2, 300, 0.6, 0.6, 'lowpass', 3); }
  hook() { this.burst(0.8, 600, 2, 0.5, 'bandpass', 0.3); this.beep(90, 0.5, 0.3, 'sawtooth'); }

  /** Voice callouts via speech synthesis (throttled). */
  say(key: string, text: string, minGap = 4, lang = 'en-US') {
    if (!settings.voice || !('speechSynthesis' in window)) return;
    const now = performance.now() / 1000;
    if ((this.lastSpeak.get(key) ?? -99) + minGap > now) return;
    this.lastSpeak.set(key, now);
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang; u.rate = lang === 'en-US' ? 1.15 : 1.05; u.pitch = 0.9; u.volume = settings.volume;
      speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }

  menuMusic(on: boolean) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (on && !this.music) {
      this.music = ctx.createGain(); this.music.gain.value = 0;
      this.music.gain.setTargetAtTime(0.05 * settings.volume, ctx.currentTime, 2);
      const rev = ctx.createBiquadFilter(); rev.type = 'lowpass'; rev.frequency.value = 1800;
      this.music.connect(this.master);
      rev.connect(this.music);
      const chords = [[220, 277.2, 329.6, 440], [196, 246.9, 293.7, 392], [174.6, 220, 261.6, 349.2], [196, 246.9, 329.6, 392]];
      chords[0].forEach((_, vi) => {
        const o = ctx.createOscillator(); o.type = vi === 0 ? 'triangle' : 'sawtooth';
        const g = ctx.createGain(); g.gain.value = vi === 0 ? 0.6 : 0.12;
        const lf = ctx.createOscillator(); lf.frequency.value = 0.1 + vi * 0.03; const lg = ctx.createGain(); lg.gain.value = 3;
        lf.connect(lg).connect(o.detune); lf.start();
        for (let k = 0; k < 64; k++) o.frequency.setValueAtTime(chords[k % 4][vi] * (vi === 0 ? 0.5 : 1), ctx.currentTime + k * 4);
        o.connect(g).connect(rev); o.start();
        this.musicNodes.push(o, lf);
      });
    } else if (!on && this.music) {
      const m = this.music; const nodes = this.musicNodes;
      m.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
      setTimeout(() => { nodes.forEach((n) => { try { (n as OscillatorNode).stop(); } catch { /* */ } }); m.disconnect(); }, 2500);
      this.music = null; this.musicNodes = [];
    }
  }
}

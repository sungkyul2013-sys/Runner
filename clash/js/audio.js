/*
 * audio.js - dependency-free WebAudio synth for the clash game.
 * Classic script (no modules). Exposes window.RA.Audio with init, play, setVolume,
 * setMuted, startMusic, stopMusic. All sounds are synthesized (oscillators + noise),
 * no asset files are loaded.
 *
 * Settings are read live from RA.Save.data.settings ({sound, music, volume}) on every
 * play() call. If RA.Save is missing, defaults are sound=true, music=true, volume=0.7.
 * setVolume()/setMuted() override the saved values for this page session only.
 *
 * Limits: at most 24 active audio nodes (new sounds are dropped above that), and each
 * sound name plays at most once per 40ms. No public call throws.
 */
(function () {
  'use strict';
  window.RA = window.RA || {};

  var MAX_NODES = 24;
  var MIN_GAP_MS = 40;
  var BUS_TRIM = 0.6;     // headroom so overlapping sounds do not clip
  var MUSIC_LEVEL = 0.25; // music sits well below sfx
  var STEP_SEC = 0.25;    // eighth notes at 120 BPM
  var STEPS = 64;         // 8 bars of 8 eighth notes
  var LOOKAHEAD = 0.12;

  var ctx = null;
  var noiseBuf = null;
  var volOverride = null;
  var muted = false;
  var active = 0;
  var lastAt = {};
  var mus = { running: false, timer: null, bus: null, step: 0, next: 0 };

  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function num(x, d) { return (typeof x === 'number' && isFinite(x)) ? x : d; }
  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function cfg() {
    var d = { sound: true, music: true, volume: 0.7 };
    try {
      var R = window.RA;
      if (!R || !R.Save) return d;
      var s = R.Save.data && R.Save.data.settings;
      if (!s) return d;
      return {
        sound: s.sound !== false,
        music: s.music !== false,
        volume: clamp(num(s.volume, 0.7), 0, 1)
      };
    } catch (e) {
      return d;
    }
  }

  function masterVol() {
    return clamp(volOverride !== null ? volOverride : cfg().volume, 0, 1);
  }

  function init() {
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
      }
      if (ctx.state === 'suspended' && ctx.resume) {
        var p = ctx.resume();
        if (p && p.catch) p.catch(function () {});
      }
    } catch (e) {}
  }

  function getNoise() {
    if (!noiseBuf) {
      var sr = ctx.sampleRate || 44100;
      noiseBuf = ctx.createBuffer(1, sr, sr);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  function track(src) {
    active++;
    src.onended = function () { active = Math.max(0, active - 1); };
  }

  // Voice helper: all offsets are seconds from t0. p is the pitch multiplier.
  function makeVoice(out, p, t0) {
    var v = {};
    v.tone = function (type, f, f2, at, dur, peak) {
      var t = t0 + at;
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f * p, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2 * p, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(Math.min(peak, 1), t + Math.min(0.01, dur * 0.1));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + dur + 0.03);
      track(o);
    };
    v.noise = function (at, dur, peak, ftype, fa, fb) {
      var t = t0 + at;
      var s = ctx.createBufferSource();
      var f = ctx.createBiquadFilter();
      var g = ctx.createGain();
      s.buffer = getNoise();
      s.loop = true;
      f.type = ftype;
      f.frequency.setValueAtTime(fa * p, t);
      if (fb) f.frequency.exponentialRampToValueAtTime(fb * p, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(Math.min(peak, 1), t + Math.min(0.01, dur * 0.1));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f);
      f.connect(g);
      g.connect(out);
      s.start(t, Math.random() * 0.5);
      s.stop(t + dur + 0.03);
      track(s);
    };
    return v;
  }

  var SOUNDS = {
    click: function (v) {
      v.tone('square', 1800, 900, 0, 0.03, 0.12);
    },
    deploy: function (v) {
      v.tone('sine', 220, 660, 0, 0.18, 0.25);
      v.tone('triangle', 660, 990, 0.16, 0.1, 0.18);
    },
    hit: function (v) {
      v.noise(0, 0.08, 0.4, 'lowpass', 1500);
      v.tone('square', 180, 90, 0, 0.08, 0.2);
    },
    tower_hit: function (v) {
      v.tone('sawtooth', 120, 60, 0, 0.25, 0.22);
      v.noise(0, 0.2, 0.3, 'lowpass', 800, 200);
    },
    arrow: function (v) {
      v.noise(0, 0.12, 0.3, 'bandpass', 3000, 1200);
      v.tone('triangle', 900, 500, 0, 0.1, 0.15);
    },
    spell: function (v) {
      var notes = [523, 659, 784, 1047];
      for (var i = 0; i < notes.length; i++) {
        v.tone('sine', notes[i], notes[i] * 1.01, i * 0.06, 0.3, 0.2);
      }
    },
    zap: function (v) {
      v.tone('sawtooth', 1400, 200, 0, 0.15, 0.18);
      v.noise(0, 0.1, 0.15, 'highpass', 4000);
    },
    fireball: function (v) {
      v.noise(0, 0.5, 0.4, 'lowpass', 400, 1400);
      v.tone('sine', 150, 80, 0, 0.5, 0.3);
    },
    explode: function (v) {
      v.noise(0, 0.6, 0.7, 'lowpass', 1200, 80);
      v.tone('sine', 80, 30, 0, 0.5, 0.5);
    },
    death: function (v) {
      v.tone('sawtooth', 440, 110, 0, 0.6, 0.2);
      v.tone('triangle', 330, 82, 0, 0.6, 0.1);
    },
    tower_destroy: function (v) {
      v.noise(0, 0.9, 0.8, 'lowpass', 900, 60);
      v.tone('sine', 90, 25, 0, 0.9, 0.5);
      v.noise(0.15, 0.12, 0.25, 'highpass', 2000);
      v.noise(0.3, 0.12, 0.25, 'highpass', 2000);
    },
    win: function (v) {
      var notes = [523, 659, 784, 1047];
      for (var i = 0; i < notes.length; i++) {
        v.tone('triangle', notes[i], null, i * 0.12, 0.45, 0.25);
      }
      v.tone('triangle', 1319, null, 0.5, 0.4, 0.22);
    },
    lose: function (v) {
      var notes = [392, 349, 311, 262];
      for (var i = 0; i < notes.length; i++) {
        v.tone('sine', notes[i], null, i * 0.22, 0.3, 0.25);
      }
    },
    elixir_full: function (v) {
      v.tone('sine', 880, null, 0, 0.35, 0.25);
      v.tone('sine', 1320, null, 0.08, 0.3, 0.18);
    },
    emote: function (v) {
      v.tone('triangle', 660, 990, 0, 0.12, 0.22);
      v.tone('triangle', 990, 1320, 0.1, 0.12, 0.2);
    },
    coin: function (v) {
      v.tone('square', 988, null, 0, 0.08, 0.12);
      v.tone('square', 1319, null, 0.08, 0.18, 0.12);
    },
    chest: function (v) {
      v.noise(0, 0.7, 0.12, 'highpass', 3000, 6000);
      var notes = [523, 659, 784, 1047];
      for (var i = 0; i < notes.length; i++) {
        v.tone('triangle', notes[i], null, i * 0.12, 0.35, 0.22);
      }
      v.tone('sine', 1568, null, 0.5, 0.4, 0.2);
    },
    error: function (v) {
      v.tone('square', 220, null, 0, 0.18, 0.15);
      v.tone('square', 175, null, 0.2, 0.2, 0.15);
    }
  };

  function play(name, opts) {
    try {
      var c = cfg();
      if (muted || !c.sound) return;
      var fn = SOUNDS.hasOwnProperty(name) ? SOUNDS[name] : null;
      if (!fn) return;
      init();
      if (!ctx || ctx.state === 'closed' || ctx.state === 'suspended') return;
      var t = nowMs();
      if (lastAt[name] !== undefined && t - lastAt[name] < MIN_GAP_MS) return;
      if (active > MAX_NODES) return;
      var p = (opts && typeof opts.pitch === 'number') ? clamp(opts.pitch, 0.5, 2) : 1;
      var pv = (opts && typeof opts.vol === 'number') ? clamp(opts.vol, 0, 1) : 1;
      var level = masterVol() * pv * BUS_TRIM;
      if (level <= 0) return;
      lastAt[name] = t;
      var bus = ctx.createGain();
      bus.gain.value = level;
      bus.connect(ctx.destination);
      fn(makeVoice(bus, p, ctx.currentTime + 0.005));
      setTimeout(function () { try { bus.disconnect(); } catch (e) {} }, 1500);
    } catch (e) {}
  }

  // Music: 8-bar loop, D dorian melody over a simple bass line, 120 BPM.
  var DORIAN = [0, 2, 3, 5, 7, 9, 10, 12];
  var MEL = [
    [0, 2, 4, 2, 5, 4, 2, 0],
    [0, -1, 2, 4, 6, 5, 4, 2],
    [3, -1, 5, 3, 2, -1, 0, -1],
    [4, 4, 6, 4, 2, -1, 1, 2],
    [0, 2, 4, 2, 5, 4, 2, 0],
    [3, -1, 2, 3, 4, -1, 2, 1],
    [4, 5, 6, 5, 4, 2, 1, -1],
    [1, -1, 2, 1, 0, -1, -1, -1]
  ];
  var BASS = [0, 0, 8, -2, 0, 5, -2, 7]; // semitones above D2 per bar

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function scheduleStep(step, t) {
    var bar = Math.floor(step / 8);
    var i = step % 8;
    var v = makeVoice(mus.bus, 1, t);
    var deg = MEL[bar][i];
    if (deg >= 0 && active < MAX_NODES) {
      v.tone('triangle', mtof(62 + DORIAN[deg]), null, 0, STEP_SEC * 0.9, 0.3);
    }
    if (i % 2 === 0 && active < MAX_NODES) {
      v.tone('triangle', mtof(38 + BASS[bar]), null, 0, STEP_SEC * 1.8, 0.4);
    }
  }

  function musicTick() {
    try {
      if (!mus.running || !ctx || !mus.bus) return;
      var t = ctx.currentTime;
      var on = cfg().music && !muted;
      mus.bus.gain.value = on ? masterVol() * MUSIC_LEVEL : 0;
      if (!on || ctx.state !== 'running') {
        mus.next = t + 0.05;
        return;
      }
      if (mus.next < t) mus.next = t + 0.05;
      var horizon = t + LOOKAHEAD;
      while (mus.next < horizon) {
        scheduleStep(mus.step, mus.next);
        mus.next += STEP_SEC;
        mus.step = (mus.step + 1) % STEPS;
      }
    } catch (e) {}
  }

  function startMusic() {
    try {
      if (mus.running || !cfg().music) return;
      init();
      if (!ctx) return;
      mus.bus = ctx.createGain();
      mus.bus.gain.value = 0;
      mus.bus.connect(ctx.destination);
      mus.step = 0;
      mus.next = ctx.currentTime + 0.1;
      mus.running = true;
      mus.timer = setInterval(musicTick, 25);
      musicTick();
    } catch (e) {}
  }

  function stopMusic() {
    try {
      mus.running = false;
      if (mus.timer) clearInterval(mus.timer);
      mus.timer = null;
      var b = mus.bus;
      mus.bus = null;
      if (b) {
        b.gain.value = 0;
        setTimeout(function () { try { b.disconnect(); } catch (e) {} }, 300);
      }
    } catch (e) {}
  }

  function setVolume(v) {
    try { volOverride = clamp(num(v, 0.7), 0, 1); } catch (e) {}
  }

  function setMuted(b) {
    try { muted = !!b; } catch (e) {}
  }

  window.RA.Audio = {
    init: init,
    play: play,
    setVolume: setVolume,
    setMuted: setMuted,
    startMusic: startMusic,
    stopMusic: stopMusic
  };
})();

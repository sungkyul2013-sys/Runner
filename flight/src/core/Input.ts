import { settings } from './Save';
import { clamp } from './math';

export type InputEvent = 'gear' | 'flapsUp' | 'flapsDown' | 'missile' | 'flare' | 'camera' | 'cameraPrev' | 'pause' | 'ap' | 'app' | 'hook' | 'airbrake' | 'lights' | 'hud' | 'smoke' | 'catapult' | 'lookReset' | 'photo' | 'target' | 'engine';

export interface InputState {
  pitch: number; roll: number; yaw: number; throttle: number; steer: number;
  ab: boolean; brake: number; fire: boolean;
  lookX: number; lookY: number; zoom: number; looking: boolean;
}

/** Live flight status pushed by the game so on-screen controls can be contextual. */
export interface ControlStatus {
  weapons: boolean; gun: number; missiles: number; flares: number; lock: number; locked: boolean;
  retract: boolean; gearDown: boolean; onGround: boolean; lowSlow: boolean; hook: boolean; hookDown: boolean; catapult: boolean;
  flaps: string; hasFlaps: boolean; airbrake: boolean; hasAirbrake: boolean; ap: boolean;
}

const KEY_AXES: Record<string, [keyof InputState, number]> = {
  KeyW: ['pitch', -1], ArrowUp: ['pitch', -1], KeyS: ['pitch', 1], ArrowDown: ['pitch', 1],
  KeyA: ['roll', -1], ArrowLeft: ['roll', -1], KeyD: ['roll', 1], ArrowRight: ['roll', 1],
  KeyQ: ['yaw', -1], KeyE: ['yaw', 1],
};
const KEY_EVENTS: Record<string, InputEvent> = {
  KeyG: 'gear', KeyF: 'flapsDown', KeyV: 'flapsUp', KeyR: 'missile', KeyX: 'flare', KeyC: 'camera', Escape: 'pause', KeyP: 'pause',
  KeyT: 'ap', KeyY: 'app', KeyH: 'hook', KeyZ: 'airbrake', KeyL: 'lights', KeyU: 'hud', KeyK: 'smoke', KeyJ: 'catapult', KeyO: 'photo', Tab: 'target', KeyI: 'engine',
};

const SVG = (d: string) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const IC = {
  gun: SVG('<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
  msl: SVG('<path d="M5 19l9-9M14 10l4-6 2 2-6 4M5 19l-1 1M8 13l-3 1 2 2M11 16l-1 3-2-2"/>'),
  flr: SVG('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>'),
  gear: SVG('<circle cx="12" cy="16" r="4.5"/><circle cx="12" cy="16" r="1.4"/><path d="M12 11.5V3M8 5h8"/>'),
  brk: SVG('<circle cx="12" cy="12" r="8"/><path d="M5 5l14 14M9 9h6v6H9z"/>'),
  hook: SVG('<path d="M12 3v10a4 4 0 1 1-4-4"/>'),
  cat: SVG('<path d="M3 16h12l3-4h3M15 8l3 4-3 4M3 20h18"/>'),
  air: SVG('<path d="M3 15l9-6 9 6M8 15v-3M16 15v-3"/>'),
  pause: SVG('<path d="M8 5v14M16 5v14"/>'),
  cam: SVG('<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>'),
  ap: SVG('<path d="M4 20L12 4l8 16M7.5 13h9"/>'),
  more: SVG('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'),
  pitch: SVG('<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>'),
  roll: SVG('<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>'),
  stick: SVG('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>'),
  light: SVG('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>'),
  smoke: SVG('<path d="M4 16c2-3 5-3 7 0s5 3 7 0M4 10c2-3 5-3 7 0s5 3 7 0"/>'),
  hud: SVG('<rect x="4" y="5" width="16" height="12"/><path d="M8 11h8M12 7v8"/>'),
  tgt: SVG('<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><circle cx="12" cy="12" r="2"/>'),
  eng: SVG('<circle cx="12" cy="12" r="8"/><path d="M12 4v8l5 3"/>'),
  land: SVG('<path d="M2 20h20M4 14l6-1 5-6h2l-2 6 5 1v2l-16-1z"/>'),
};

interface Floater { el: HTMLElement; th: HTMLElement; kind: 'v' | 'h' | 's'; id: number | null; ox: number; oy: number; range: number }

/** Unified input: keyboard, gamepad, touch (floating split / floating stick), device tilt. */
export class Input {
  state: InputState = { pitch: 0, roll: 0, yaw: 0, throttle: 0, steer: 0, ab: false, brake: 0, fire: false, lookX: 0, lookY: 0, zoom: 0, looking: false };
  private events = new Set<InputEvent>();
  private keys = new Set<string>();
  private kAxes = { pitch: 0, roll: 0, yaw: 0 };
  private touchAxes = { pitch: 0, roll: 0, yaw: 0 };
  private tilt = { ok: false, p0: 0, r0: 0, raw: [0, 0] as [number, number] };
  private touchBrake = false; private touchFire = false;
  readonly root: HTMLDivElement;
  private lever = 0; // physical lever position 0..1 (0.86 = MIL detent, above = AB)
  private thrEl!: HTMLElement;
  private ctxEls: Record<string, HTMLElement> = {};
  private wpnEls: Record<string, HTMLElement> = {};
  private drawer!: HTMLElement;
  private lookId: number | null = null; private lookLast = [0, 0];
  private pinchD = 0;
  private lastStatus = '';
  enabled = false;
  hasWeapons = false;
  /** Test/automation hook: values here override live input each frame. */
  override: Partial<InputState> | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'fc';
    document.body.appendChild(this.root);
    addEventListener('keydown', (e) => {
      if (!this.enabled && e.code !== 'Escape') return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat && KEY_EVENTS[e.code]) this.events.add(KEY_EVENTS[e.code]);
      if (!e.repeat && e.code === 'Digit1') this.events.add('camera');
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('wheel', (e) => { if (this.enabled) this.state.zoom += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('mousedown', (e) => { if (this.enabled && (e.button === 2 || e.button === 1)) { this.state.looking = true; this.lookLast = [e.clientX, e.clientY]; } });
    addEventListener('mousemove', (e) => {
      if (!this.state.looking || this.lookId !== null) return;
      this.state.lookX += (e.clientX - this.lookLast[0]) * 0.005; this.state.lookY += (e.clientY - this.lookLast[1]) * 0.005;
      this.lookLast = [e.clientX, e.clientY];
    });
    addEventListener('mouseup', () => { if (this.lookId === null) this.state.looking = false; });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('deviceorientation', (e) => {
      if (e.beta == null || e.gamma == null) return;
      const ang = screen.orientation?.angle ?? 0;
      const land = Math.abs(ang) === 90 || ang === 270;
      const sgn = ang === -90 || ang === 270 ? -1 : 1;
      this.tilt.raw = land ? [-e.gamma * sgn, e.beta * sgn] : [e.beta, e.gamma];
      this.tilt.ok = true;
    });
    this.build();
  }

  calibrateTilt() { this.tilt.p0 = this.tilt.raw[0]; this.tilt.r0 = this.tilt.raw[1]; }
  async requestTilt() {
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    if (DOE?.requestPermission) { try { await DOE.requestPermission(); } catch { /* denied */ } }
    setTimeout(() => this.calibrateTilt(), 300);
  }
  private buzz(ms = 8) { if (settings.vibration) navigator.vibrate?.(ms); }

  /** (Re)build the on-screen controls for the current control mode. */
  build() {
    this.root.innerHTML = '';
    this.ctxEls = {}; this.wpnEls = {}; this.lastStatus = '';
    const mode = settings.controlMode;
    const swap = settings.swapSides;
    this.root.dataset.mode = mode;

    // ---- floating zones ----
    const zoneL = this.div('zone l'), zoneR = this.div('zone r');
    const leftKind: 'v' | 'h' | null = mode === 'split' ? (swap ? 'h' : 'v') : null;
    const rightKind: 'v' | 'h' | 's' | null = mode === 'split' ? (swap ? 'v' : 'h') : mode === 'stick' ? 's' : null;
    const hint = (z: HTMLElement, k: 'v' | 'h' | 's' | null) => { if (!k) return; z.innerHTML = `<div class="hint">${k === 'v' ? IC.pitch : k === 'h' ? IC.roll : IC.stick}<span>${k === 'v' ? 'PITCH' : k === 'h' ? 'ROLL' : 'STICK'}</span></div>`; };
    hint(zoneL, leftKind); hint(zoneR, rightKind);
    if (leftKind) this.floater(zoneL, leftKind);
    if (rightKind) this.floater(zoneR, rightKind);
    if (mode === 'tilt') {
      const c = this.div('calib'); c.textContent = 'RECALIBRATE TILT';
      c.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.calibrateTilt(); this.buzz(); });
    }

    // ---- throttle lever with detents ----
    const thr = this.div('thr');
    thr.innerHTML = `<div class="rail"></div><div class="ab"></div><div class="fill"></div>
      <div class="det" style="bottom:0"><span>IDLE</span></div><div class="det" style="bottom:86%"><span>MIL</span></div><div class="det" style="bottom:100%"><span>AB</span></div>
      <div class="kn">THR</div><div class="ro m">0%</div>`;
    this.thrEl = thr;
    {
      let id: number | null = null, y0 = 0, p0 = 0;
      thr.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); id = e.pointerId; try { thr.setPointerCapture(id); } catch { /* */ } y0 = e.clientY; p0 = this.lever; this.buzz(6); });
      thr.addEventListener('pointermove', (e) => {
        if (e.pointerId !== id) return;
        const hgt = thr.getBoundingClientRect().height;
        const before = this.lever;
        this.lever = clamp(p0 + (y0 - e.clientY) / hgt, 0, 1);
        if ((before < 0.86) !== (this.lever < 0.86) || (before > 0.02) !== (this.lever > 0.02)) this.buzz(14);
        this.applyLever();
      });
      const up = (e: PointerEvent) => { if (e.pointerId === id) id = null; };
      thr.addEventListener('pointerup', up); thr.addEventListener('pointercancel', up);
    }

    // ---- weapons ----
    const wpn = this.div('wpn');
    const rbtn = (parent: HTMLElement, key: string, cls: string, icon: string, ev?: InputEvent, hold?: (on: boolean) => void) => {
      const b = document.createElement('button');
      b.className = `rb ${cls}`;
      b.innerHTML = `${icon}<i class="ring"></i><span class="q m"></span>`;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (ev) this.events.add(ev);
        hold?.(true);
        b.classList.add('on'); b.classList.remove('fx'); void b.offsetWidth; b.classList.add('fx');
        this.buzz();
      });
      const up = () => { hold?.(false); b.classList.remove('on'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
      parent.appendChild(b);
      return b;
    };
    this.wpnEls.flr = rbtn(wpn, 'flr', 'md', IC.flr, 'flare');
    this.wpnEls.msl = rbtn(wpn, 'msl', 'lg', IC.msl, 'missile');
    this.wpnEls.gun = rbtn(wpn, 'gun', 'xl gun', IC.gun, undefined, (on) => (this.touchFire = on));

    // ---- contextual systems ----
    const ctx = this.div('ctx');
    this.ctxEls.gear = rbtn(ctx, 'gear', 'sm', IC.gear, 'gear');
    const flp = document.createElement('div');
    flp.className = 'flp m';
    flp.innerHTML = '<button data-f="-">−</button><span>FLAP</span><button data-f="+">+</button>';
    flp.querySelectorAll<HTMLElement>('button').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.events.add(b.dataset.f === '+' ? 'flapsDown' : 'flapsUp'); this.buzz(); }));
    ctx.appendChild(flp);
    this.ctxEls.flaps = flp;
    this.ctxEls.brk = rbtn(ctx, 'brk', 'sm', IC.brk, undefined, (on) => (this.touchBrake = on));
    this.ctxEls.air = rbtn(ctx, 'air', 'sm', IC.air, 'airbrake');
    this.ctxEls.hook = rbtn(ctx, 'hook', 'sm', IC.hook, 'hook');
    this.ctxEls.cat = rbtn(ctx, 'cat', 'sm', IC.cat, 'catapult');

    // ---- system corner + drawer ----
    const sys = this.div('sys');
    const sq = (icon: string, fn: () => void, key?: string) => {
      const b = document.createElement('button'); b.className = 'sq'; b.innerHTML = icon;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); this.buzz(); });
      sys.appendChild(b);
      if (key) this.ctxEls[key] = b;
      return b;
    };
    sq(IC.more, () => this.drawer.classList.toggle('open'));
    sq(IC.ap, () => this.events.add('ap'), 'apbtn');
    sq(IC.cam, () => this.events.add('camera'));
    sq(IC.pause, () => this.events.add('pause'));
    this.drawer = this.div('drawer');
    const dItem = (icon: string, label: string, ev: InputEvent) => {
      const b = document.createElement('button'); b.innerHTML = `${icon}${label}`;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.events.add(ev); this.drawer.classList.remove('open'); this.buzz(); });
      this.drawer.appendChild(b);
    };
    dItem(IC.land, '자동 착륙 (APP)', 'app');
    dItem(IC.tgt, '목표 전환', 'target');
    dItem(IC.light, '조명', 'lights');
    dItem(IC.smoke, '스모크', 'smoke');
    dItem(IC.hud, 'HUD 표시', 'hud');
    dItem(IC.eng, '엔진 재시동', 'engine');
    dItem(IC.cam, '포토 모드', 'photo');

    // ---- rudder ----
    const rud = this.div('rud');
    if (settings.assist === 'beginner') rud.style.display = 'none';
    rud.innerHTML = '<span>RUDDER</span><div class="tk"></div>';
    const tk = rud.querySelector('.tk') as HTMLElement;
    {
      let id: number | null = null;
      const mv = (x: number) => { const r = rud.getBoundingClientRect(); const v = clamp(((x - r.left) / r.width) * 2 - 1, -1, 1); this.touchAxes.yaw = v; tk.style.transform = `translateX(${v * r.width * 0.42}px)`; };
      rud.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); id = e.pointerId; try { rud.setPointerCapture(id); } catch { /* */ } mv(e.clientX); });
      rud.addEventListener('pointermove', (e) => { if (e.pointerId === id) mv(e.clientX); });
      const up = (e: PointerEvent) => { if (e.pointerId === id) { id = null; this.touchAxes.yaw = 0; tk.style.transform = ''; } };
      rud.addEventListener('pointerup', up); rud.addEventListener('pointercancel', up);
    }

    this.setWeapons(this.hasWeapons);
    this.applyLever();

    // ---- look area (anything not captured above) ----
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target !== this.root) return;
      this.drawer.classList.remove('open');
      this.lookId = e.pointerId; this.lookLast = [e.clientX, e.clientY]; this.state.looking = true;
    });
    this.root.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      this.state.lookX += (e.clientX - this.lookLast[0]) * 0.006; this.state.lookY += (e.clientY - this.lookLast[1]) * 0.006;
      this.lookLast = [e.clientX, e.clientY];
    });
    const end = (e: PointerEvent) => { if (e.pointerId === this.lookId) { this.lookId = null; this.state.looking = false; } };
    this.root.addEventListener('pointerup', end); this.root.addEventListener('pointercancel', end);
    this.root.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && e.target === this.root) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (this.pinchD) this.state.zoom += (this.pinchD - d) * 0.02;
        this.pinchD = d;
      }
    }, { passive: true });
    this.root.addEventListener('touchend', () => (this.pinchD = 0));
  }

  /** A control that spawns under the thumb wherever the zone is touched. */
  private floater(zone: HTMLElement, kind: 'v' | 'h' | 's') {
    const el = document.createElement('div');
    el.className = `fl ${kind}`;
    const ticks = kind === 's'
      ? [0, 90, 180, 270].map((a) => `<i class="tick" style="transform:rotate(${a}deg) translateY(-${88}px)"></i>`).join('')
      : [-1, -0.5, 0, 0.5, 1].map((t) => kind === 'v' ? `<i class="tick" style="top:${t * 84}px"></i>` : `<i class="tick" style="left:${t * 92}px"></i>`).join('');
    el.innerHTML = `<div class="trk"></div>${ticks}<div class="th"></div><div class="lbl">${kind === 'v' ? 'PITCH' : kind === 'h' ? 'ROLL' : 'STICK'}</div>`;
    this.root.appendChild(el);
    const f: Floater = { el, th: el.querySelector('.th') as HTMLElement, kind, id: null, ox: 0, oy: 0, range: kind === 's' ? 70 : kind === 'v' ? 84 : 92 };
    const set = (dx: number, dy: number) => {
      let vx = 0, vy = 0;
      if (f.kind === 'v') vy = clamp(dy / f.range, -1, 1);
      else if (f.kind === 'h') vx = clamp(dx / f.range, -1, 1);
      else { vx = dx / f.range; vy = dy / f.range; const m = Math.hypot(vx, vy); if (m > 1) { vx /= m; vy /= m; } }
      f.th.style.transform = `translate(${vx * f.range}px, ${vy * f.range}px)`;
      el.classList.toggle('hot', Math.max(Math.abs(vx), Math.abs(vy)) > 0.92);
      if (f.kind === 'v') this.touchAxes.pitch = vy;
      else if (f.kind === 'h') this.touchAxes.roll = vx;
      else { this.touchAxes.roll = vx; this.touchAxes.pitch = vy; }
    };
    zone.addEventListener('pointerdown', (e) => {
      if (f.id !== null) return;
      e.preventDefault(); e.stopPropagation();
      f.id = e.pointerId; try { zone.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      const half = f.kind === 'v' ? [40, 120] : f.kind === 'h' ? [130, 40] : [100, 100];
      f.ox = clamp(e.clientX, half[0] + 8, innerWidth - half[0] - 8);
      f.oy = clamp(e.clientY, half[1] + 8, innerHeight - half[1] - 8);
      el.style.left = `${f.ox}px`; el.style.top = `${f.oy}px`;
      el.classList.add('on'); zone.classList.add('used');
      set(e.clientX - f.ox, e.clientY - f.oy);
      this.buzz(6);
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === f.id) set(e.clientX - f.ox, e.clientY - f.oy); });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== f.id) return;
      f.id = null; set(0, 0); el.classList.remove('on', 'hot');
    };
    zone.addEventListener('pointerup', up); zone.addEventListener('pointercancel', up);
  }

  private applyLever() {
    const thr = Math.min(1, this.lever / 0.86);
    this.state.throttle = thr;
    this.state.ab = this.lever > 0.93;
    this.syncLever();
  }
  private syncLever() {
    if (!this.thrEl) return;
    const hgt = this.thrEl.getBoundingClientRect().height || 200;
    (this.thrEl.querySelector('.kn') as HTMLElement).style.transform = `translateY(${(1 - this.lever) * hgt}px)`;
    (this.thrEl.querySelector('.fill') as HTMLElement).style.transform = `scaleY(${this.lever})`;
    (this.thrEl.querySelector('.ro') as HTMLElement).textContent = this.lever > 0.93 ? 'AB' : `${Math.round(Math.min(1, this.lever / 0.86) * 100)}%`;
    this.thrEl.classList.toggle('ab-on', this.lever > 0.93);
  }

  setWeapons(on: boolean) {
    this.hasWeapons = on;
    for (const b of Object.values(this.wpnEls)) b.style.display = on ? '' : 'none';
  }
  /** Contextual visibility + live readouts (cheap: only touches the DOM when something changed). */
  setStatus(s: ControlStatus) {
    const key = JSON.stringify([s.weapons, s.gun, s.missiles, s.flares, Math.round(s.lock * 10), s.locked, s.retract, s.gearDown, s.onGround, s.lowSlow, s.hook, s.hookDown, s.catapult, s.flaps, s.hasFlaps, s.airbrake, s.hasAirbrake, s.ap]);
    if (key === this.lastStatus) return;
    this.lastStatus = key;
    const vis = (k: string, v: boolean) => this.ctxEls[k]?.classList.toggle('hid', !v);
    vis('gear', s.retract && (s.lowSlow || !s.gearDown));
    vis('flaps', s.hasFlaps);
    vis('brk', s.onGround);
    vis('air', s.hasAirbrake && !s.onGround);
    vis('hook', s.hook);
    vis('cat', s.catapult);
    this.ctxEls.gear?.classList.toggle('act', s.gearDown);
    this.ctxEls.hook?.classList.toggle('act', s.hookDown);
    this.ctxEls.air?.classList.toggle('act', s.airbrake);
    this.ctxEls.apbtn?.classList.toggle('on', s.ap);
    const fl = this.ctxEls.flaps?.querySelector('span');
    if (fl) fl.textContent = s.flaps;
    if (this.wpnEls.gun) {
      (this.wpnEls.gun.querySelector('.q') as HTMLElement).textContent = String(s.gun);
      this.wpnEls.gun.classList.toggle('empty', s.gun <= 0);
      (this.wpnEls.msl.querySelector('.q') as HTMLElement).textContent = String(s.missiles);
      this.wpnEls.msl.style.setProperty('--p', String(s.locked ? 1 : s.lock));
      this.wpnEls.msl.classList.toggle('lock', s.locked);
      this.wpnEls.msl.classList.toggle('empty', s.missiles <= 0);
      (this.wpnEls.flr.querySelector('.q') as HTMLElement).textContent = String(s.flares);
      this.wpnEls.flr.style.display = s.flares > 0 || this.hasWeapons ? (this.hasWeapons || s.flares > 0 ? '' : 'none') : 'none';
    }
  }

  show(on: boolean) { this.root.style.display = on ? '' : 'none'; this.enabled = on; if (!on) { this.keys.clear(); this.drawer?.classList.remove('open'); } }
  setThrottle(v: number) { this.state.throttle = v; this.lever = clamp(v, 0, 1) * 0.86; this.syncLever(); }

  private div(cls: string) { const e = document.createElement('div'); e.className = cls; this.root.appendChild(e); return e; }

  consume(): Set<InputEvent> { const e = new Set(this.events); this.events.clear(); return e; }
  push(e: InputEvent) { this.events.add(e); }

  update(dt: number) {
    const k = this.keys;
    for (const ax of ['pitch', 'roll', 'yaw'] as const) {
      let target = 0;
      for (const [code, [a, v]] of Object.entries(KEY_AXES)) if (a === ax && k.has(code)) target += v;
      const cur = this.kAxes[ax];
      const rate = target === 0 ? 6 : 3;
      this.kAxes[ax] = cur + clamp(target - cur, -rate * dt, rate * dt);
    }
    let kbThr = false;
    if (k.has('ShiftLeft') || k.has('ShiftRight') || k.has('Equal') || k.has('PageUp')) { this.lever = Math.min(0.86, this.lever + dt * 0.5); kbThr = true; }
    if (k.has('ControlLeft') || k.has('ControlRight') || k.has('Minus') || k.has('PageDown')) { this.lever = Math.max(0, this.lever - dt * 0.5); kbThr = true; }
    if (kbThr) this.applyLever();
    let ab = this.state.ab;
    if (k.has('Backquote') || k.has('KeyN')) ab = true;
    let brake = k.has('KeyB') ? 1 : 0;
    let fire = k.has('Space');
    let pitch = this.kAxes.pitch, roll = this.kAxes.roll, yaw = this.kAxes.yaw;
    const steer = (k.has('Comma') ? -1 : 0) + (k.has('Period') ? 1 : 0);

    const pads = navigator.getGamepads?.() ?? [];
    for (const gp of pads) {
      if (!gp) continue;
      const dz = (v: number) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
      roll += dz(gp.axes[0] ?? 0); pitch += dz(gp.axes[1] ?? 0);
      yaw += dz(gp.axes[2] ?? 0);
      const rt = gp.buttons[7]?.value ?? 0, lt = gp.buttons[6]?.value ?? 0;
      if (rt > 0.05 || lt > 0.05) { this.lever = clamp(this.lever + (rt - lt) * dt * 0.7, 0, 1); this.applyLever(); }
      if (gp.buttons[0]?.pressed) fire = true;
      if (gp.buttons[2]?.pressed) brake = 1;
      const edge = (i: number, ev: InputEvent) => { const p = gp.buttons[i]?.pressed; const key = `gp${i}`; if (p && !this.keys.has(key)) { this.events.add(ev); this.keys.add(key); } else if (!p) this.keys.delete(key); };
      edge(1, 'missile'); edge(3, 'camera'); edge(4, 'flare'); edge(5, 'gear'); edge(9, 'pause'); edge(12, 'flapsDown'); edge(13, 'flapsUp'); edge(8, 'ap'); edge(10, 'airbrake');
      if (gp.buttons[11]?.pressed) ab = true;
      if (Math.abs(gp.axes[3] ?? 0) > 0.3) this.state.lookY += dz(gp.axes[3]) * dt * 2;
    }
    if (settings.controlMode === 'tilt' && this.tilt.ok) {
      pitch += clamp((this.tilt.raw[0] - this.tilt.p0) / 25, -1, 1);
      roll += clamp((this.tilt.raw[1] - this.tilt.r0) / 30, -1, 1);
    }
    pitch += this.touchAxes.pitch; roll += this.touchAxes.roll; yaw += this.touchAxes.yaw;
    if (this.touchBrake) brake = 1;
    if (this.touchFire) fire = true;

    // +pitch = pull (nose up). Expo curve for fine control around centre.
    const sens = settings.sensitivity;
    const expo = (v: number) => clamp(Math.sign(v) * (0.45 * Math.abs(v) + 0.55 * Math.abs(v) ** 2.2) * sens, -1, 1);
    let p = expo(clamp(pitch, -1, 1));
    if (settings.invertPitch) p = -p;
    this.state.pitch = p;
    this.state.roll = expo(clamp(roll, -1, 1));
    this.state.yaw = clamp(yaw, -1, 1);
    this.state.brake = brake; this.state.fire = fire; this.state.steer = steer;
    this.state.ab = ab && this.state.throttle > 0.98;
    if (this.override) Object.assign(this.state, this.override);
  }
}

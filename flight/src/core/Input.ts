import { settings } from './Save';
import { clamp } from './math';

export type InputEvent = 'gear' | 'flapsUp' | 'flapsDown' | 'missile' | 'flare' | 'camera' | 'cameraPrev' | 'pause' | 'ap' | 'app' | 'hook' | 'airbrake' | 'lights' | 'hud' | 'smoke' | 'catapult' | 'lookReset' | 'photo' | 'target' | 'engine';

export interface InputState {
  pitch: number; roll: number; yaw: number; throttle: number; steer: number;
  ab: boolean; brake: number; fire: boolean;
  lookX: number; lookY: number; zoom: number; looking: boolean;
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

/** Unified input: keyboard, mouse, gamepad, touch (split / stick) and device tilt. */
export class Input {
  state: InputState = { pitch: 0, roll: 0, yaw: 0, throttle: 0, steer: 0, ab: false, brake: 0, fire: false, lookX: 0, lookY: 0, zoom: 0, looking: false };
  private events = new Set<InputEvent>();
  private keys = new Set<string>();
  private kAxes = { pitch: 0, roll: 0, yaw: 0 };
  private touchAxes = { pitch: 0, roll: 0, yaw: 0 };
  private tilt = { pitch: 0, roll: 0, ok: false, p0: 0, r0: 0, raw: [0, 0] as [number, number] };
  private touchBrake = false; private touchFire = false;
  readonly root: HTMLDivElement;
  private throttleKnob!: HTMLDivElement;
  private abZone!: HTMLDivElement;
  private weaponBtns: HTMLElement[] = [];
  private lookId: number | null = null; private lookLast = [0, 0];
  private pinchD = 0;
  enabled = false;
  hasWeapons = false;
  /** Test/automation hook: values here override live input each frame. */
  override: Partial<InputState> | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'tc-root';
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
    // mouse look (right/middle drag) on desktop
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
      const land = Math.abs((screen.orientation?.angle ?? 0)) === 90;
      const sgn = (screen.orientation?.angle ?? 0) === -90 || (screen.orientation?.angle ?? 0) === 270 ? -1 : 1;
      // landscape: beta → roll, gamma → pitch
      const p = land ? -e.gamma * sgn : e.beta;
      const r = land ? e.beta * sgn : e.gamma;
      this.tilt.raw = [p, r];
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

  /** (Re)build the on-screen controls for the current control mode. */
  build() {
    this.root.innerHTML = '';
    const mode = settings.controlMode;
    const swap = settings.swapSides;
    const L = swap ? 'right' : 'left', R = swap ? 'left' : 'right';
    this.root.dataset.mode = mode;
    // throttle lever (always on the "left" side)
    const thr = this.el('div', `tc-throttle tc-${L}`);
    thr.innerHTML = '<div class="tc-thr-track"><div class="tc-thr-fill"></div></div><div class="tc-thr-knob"><span>THR</span></div><div class="tc-thr-ab">AB</div>';
    this.throttleKnob = thr.querySelector('.tc-thr-knob') as HTMLDivElement;
    this.abZone = thr.querySelector('.tc-thr-ab') as HTMLDivElement;
    this.drag(thr, (x, y, r) => { this.state.throttle = clamp(1 - (y - r.top) / r.height, 0, 1) * 1.06; this.state.ab = this.state.throttle > 1.0; this.state.throttle = Math.min(1, this.state.throttle); }, () => {});

    if (mode === 'split') {
      // vertical pitch slider (left) + horizontal roll slider (right) — 조종간 분리 모드
      const p = this.el('div', `tc-slider tc-vert tc-${L}2`);
      p.innerHTML = '<div class="tc-rail"></div><div class="tc-thumb"></div><div class="tc-lbl top">기수 ▼</div><div class="tc-lbl bot">기수 ▲</div>';
      const pt = p.querySelector('.tc-thumb') as HTMLDivElement;
      this.drag(p, (x, y, r) => { const v = clamp(((y - r.top) / r.height) * 2 - 1, -1, 1); this.touchAxes.pitch = v; pt.style.transform = `translate(-50%, ${v * r.height * 0.42}px)`; }, () => { this.touchAxes.pitch = 0; pt.style.transform = 'translate(-50%,0)'; });
      const rr = this.el('div', `tc-slider tc-horz tc-${R}`);
      rr.innerHTML = '<div class="tc-rail"></div><div class="tc-thumb"></div><div class="tc-lbl l">◀ 좌선회</div><div class="tc-lbl r">우선회 ▶</div>';
      const rt = rr.querySelector('.tc-thumb') as HTMLDivElement;
      this.drag(rr, (x, y, r) => { const v = clamp(((x - r.left) / r.width) * 2 - 1, -1, 1); this.touchAxes.roll = v; rt.style.transform = `translate(${v * r.width * 0.42}px, -50%)`; }, () => { this.touchAxes.roll = 0; rt.style.transform = 'translate(0,-50%)'; });
    } else if (mode === 'stick') {
      const s = this.el('div', `tc-stick tc-${R}`);
      s.innerHTML = '<div class="tc-stick-base"><div class="tc-cross"></div><div class="tc-stick-knob"></div></div>';
      const k = s.querySelector('.tc-stick-knob') as HTMLDivElement;
      this.drag(s, (x, y, r) => {
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2, R0 = r.width * 0.42;
        let dx = (x - cx) / R0, dy = (y - cy) / R0;
        const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
        this.touchAxes.roll = dx; this.touchAxes.pitch = dy;
        k.style.transform = `translate(calc(-50% + ${dx * R0}px), calc(-50% + ${dy * R0}px))`;
      }, () => { this.touchAxes.roll = 0; this.touchAxes.pitch = 0; k.style.transform = 'translate(-50%,-50%)'; });
    } else {
      const c = this.el('button', `tc-btn tc-calib tc-${R}`);
      c.textContent = '기울기 보정';
      c.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.calibrateTilt(); });
    }
    // rudder slider
    const rud = this.el('div', `tc-rudder tc-${L}b`);
    rud.innerHTML = '<div class="tc-rail"></div><div class="tc-thumb"></div><span class="tc-rud-l">러더</span>';
    const rth = rud.querySelector('.tc-thumb') as HTMLDivElement;
    this.drag(rud, (x, y, r) => { const v = clamp(((x - r.left) / r.width) * 2 - 1, -1, 1); this.touchAxes.yaw = v; rth.style.transform = `translate(${v * r.width * 0.4}px,-50%)`; }, () => { this.touchAxes.yaw = 0; rth.style.transform = 'translate(0,-50%)'; });

    // action buttons
    const cluster = this.el('div', `tc-cluster tc-${R}c`);
    const btn = (label: string, cls: string, ev?: InputEvent, hold?: (on: boolean) => void) => {
      const b = document.createElement('button');
      b.className = `tc-btn ${cls}`;
      b.innerHTML = label;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (ev) this.events.add(ev); hold?.(true); b.classList.add('on'); if (settings.vibration) navigator.vibrate?.(8); });
      const up = () => { hold?.(false); b.classList.remove('on'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
      cluster.appendChild(b);
      return b;
    };
    const fire = btn('<b>GUN</b>', 'tc-fire wpn', undefined, (on) => (this.touchFire = on));
    const msl = btn('<b>MSL</b>', 'tc-msl wpn', 'missile');
    const flr = btn('FLR', 'tc-small wpn', 'flare');
    this.weaponBtns = [fire, msl, flr];
    btn('BRK', 'tc-small', undefined, (on) => (this.touchBrake = on));
    btn('GEAR', 'tc-small', 'gear');
    btn('FLP+', 'tc-small', 'flapsDown');
    btn('FLP−', 'tc-small', 'flapsUp');
    btn('SPD BRK', 'tc-small', 'airbrake');
    // top bar
    const top = this.el('div', 'tc-top');
    const tb = (label: string, ev: InputEvent, title: string) => { const b = document.createElement('button'); b.className = 'tc-topbtn'; b.title = title; b.innerHTML = label; b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.events.add(ev); }); top.appendChild(b); return b; };
    tb('❚❚', 'pause', '일시정지');
    tb('◉ CAM', 'camera', '시점');
    tb('A/P', 'ap', '오토파일럿');
    tb('APP', 'app', '자동 접근');
    tb('HOOK', 'hook', '테일훅');
    tb('LT', 'lights', '조명');
    tb('SMK', 'smoke', '스모크');
    tb('CAT', 'catapult', '캐터펄트');
    tb('◎', 'target', '목표 전환');
    this.setWeapons(this.hasWeapons);

    // look area = background drag (camera look / pinch zoom)
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target !== this.root) return;
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

  setWeapons(on: boolean) { this.hasWeapons = on; for (const b of this.weaponBtns) b.style.display = on ? '' : 'none'; }
  show(on: boolean) { this.root.style.display = on ? '' : 'none'; this.enabled = on; if (!on) this.keys.clear(); }
  setThrottle(v: number) { this.state.throttle = v; }

  private el(tag: string, cls: string) { const e = document.createElement(tag) as HTMLDivElement; e.className = cls; this.root.appendChild(e); return e; }
  private drag(el: HTMLElement, move: (x: number, y: number, r: DOMRect) => void, release: () => void) {
    let id: number | null = null;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); id = e.pointerId; el.setPointerCapture(e.pointerId); move(e.clientX, e.clientY, el.getBoundingClientRect()); el.classList.add('active'); });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e.clientX, e.clientY, el.getBoundingClientRect()); });
    const up = (e: PointerEvent) => { if (e.pointerId === id) { id = null; release(); el.classList.remove('active'); } };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }

  consume(): Set<InputEvent> { const e = new Set(this.events); this.events.clear(); return e; }
  push(e: InputEvent) { this.events.add(e); }

  update(dt: number) {
    const k = this.keys;
    // keyboard axes (ramped)
    for (const ax of ['pitch', 'roll', 'yaw'] as const) {
      let target = 0;
      for (const [code, [a, v]] of Object.entries(KEY_AXES)) if (a === ax && k.has(code)) target += v;
      const cur = this.kAxes[ax];
      const rate = target === 0 ? 6 : 3;
      this.kAxes[ax] = cur + clamp(target - cur, -rate * dt, rate * dt);
    }
    if (k.has('ShiftLeft') || k.has('ShiftRight') || k.has('Equal') || k.has('PageUp')) this.state.throttle = Math.min(1, this.state.throttle + dt * 0.6);
    if (k.has('ControlLeft') || k.has('ControlRight') || k.has('Minus') || k.has('PageDown')) this.state.throttle = Math.max(0, this.state.throttle - dt * 0.6);
    let ab = this.state.ab;
    if (k.has('Backquote') || k.has('KeyN')) ab = true;
    let brake = k.has('KeyB') ? 1 : 0;
    let fire = k.has('Space');
    let pitch = this.kAxes.pitch, roll = this.kAxes.roll, yaw = this.kAxes.yaw;
    let steer = (k.has('Comma') ? -1 : 0) + (k.has('Period') ? 1 : 0);

    // gamepad
    const pads = navigator.getGamepads?.() ?? [];
    for (const gp of pads) {
      if (!gp) continue;
      const dz = (v: number) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
      roll += dz(gp.axes[0] ?? 0); pitch += dz(gp.axes[1] ?? 0);
      yaw += dz(gp.axes[2] ?? 0);
      const rt = gp.buttons[7]?.value ?? 0, lt = gp.buttons[6]?.value ?? 0;
      if (rt > 0.05 || lt > 0.05) this.state.throttle = clamp(this.state.throttle + (rt - lt) * dt * 0.8, 0, 1);
      if (gp.buttons[0]?.pressed) fire = true;
      if (gp.buttons[2]?.pressed) brake = 1;
      const edge = (i: number, ev: InputEvent) => { const p = gp.buttons[i]?.pressed; const key = `gp${i}`; if (p && !this.keys.has(key)) { this.events.add(ev); this.keys.add(key); } else if (!p) this.keys.delete(key); };
      edge(1, 'missile'); edge(3, 'camera'); edge(4, 'flare'); edge(5, 'gear'); edge(9, 'pause'); edge(12, 'flapsDown'); edge(13, 'flapsUp'); edge(8, 'ap'); edge(10, 'airbrake');
      if (gp.buttons[11]?.pressed) ab = true;
      this.state.lookX += dz(gp.axes[2] ?? 0) * 0; // right stick X used as yaw
      if (Math.abs(gp.axes[3] ?? 0) > 0.3) { this.state.lookY += dz(gp.axes[3]) * dt * 2; }
    }

    // touch / tilt
    if (settings.controlMode === 'tilt' && this.tilt.ok) {
      pitch += clamp((this.tilt.raw[0] - this.tilt.p0) / 25, -1, 1);
      roll += clamp((this.tilt.raw[1] - this.tilt.r0) / 30, -1, 1);
    }
    pitch += this.touchAxes.pitch; roll += this.touchAxes.roll; yaw += this.touchAxes.yaw;
    if (this.touchBrake) brake = 1;
    if (this.touchFire) fire = true;

    // sensitivity / expo / invert: stick convention → +pitch = pull (nose up)
    const sens = settings.sensitivity;
    const expo = (v: number) => clamp(Math.sign(v) * (0.45 * Math.abs(v) + 0.55 * Math.abs(v) ** 2.2) * sens, -1, 1);
    let p = expo(clamp(pitch, -1, 1));
    if (settings.invertPitch) p = -p;
    this.state.pitch = p;
    this.state.roll = expo(clamp(roll, -1, 1));
    this.state.yaw = clamp(yaw, -1, 1);
    this.state.brake = brake; this.state.fire = fire; this.state.ab = ab && this.state.throttle > 0.98; this.state.steer = steer;
    if (this.override) Object.assign(this.state, this.override);
    // reflect throttle on lever
    if (this.throttleKnob) {
      const h = this.throttleKnob.parentElement!.getBoundingClientRect().height;
      this.throttleKnob.style.transform = `translate(-50%, ${-this.state.throttle * h * 0.82}px)`;
      (this.throttleKnob.parentElement!.querySelector('.tc-thr-fill') as HTMLDivElement).style.height = `${this.state.throttle * 100}%`;
      this.abZone.classList.toggle('on', this.state.ab);
    }
  }
}

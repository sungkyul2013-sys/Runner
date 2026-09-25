// Mobile touch driving controls (§15.4 모바일 조작): steering (buttons / virtual wheel / tilt / drag slider) in the left
// thumb zone, analog throttle and brake pedals, handbrake and shift buttons in the right one, camera / reset / pause at
// the top. Every control can be moved (edit mode), scaled and faded; haptics on shifts, pedal floor and reset.
// Pointer Events with capture, tracked by pointerId, so both thumbs (and a third finger) work at once. The overlay
// itself ignores pointers; only the controls take them, so the 3D canvas underneath keeps working.
import './touch.css';
import { tl, type Localized } from './i18n';

export type SteerMode = 'buttons' | 'wheel' | 'tilt' | 'slider';
export type TouchAction = 'shiftUp' | 'shiftDown' | 'camera' | 'reset' | 'pause';
export type ControlId = 'steer' | 'throttle' | 'brake' | 'handbrake' | 'shiftUp' | 'shiftDown' | 'camera' | 'reset' | 'pause';
export interface TouchLayout {
  steer: SteerMode;
  size: number; // 0.75 … 1.5, scales every control
  opacity: number; // 0.2 … 1
  autoAccelerate: boolean; // throttle held at 100 % unless braking (brake pedal still works)
  haptics: boolean; // navigator.vibrate on shifts / pedal floor / reset
  showShift: boolean; // shift buttons (manual gearbox) visible
  positions: Partial<Record<ControlId, { x: number; y: number }>>; // user offsets [px] from each control's default anchor
}
/** steer −1 … 1, positive = left; analog = false in 'buttons' mode (the caller rate-limits it like a keyboard). */
export interface TouchState { throttle: number; brake: number; steer: number; handbrake: number; analog: boolean }

export const CONTROL_IDS: readonly ControlId[] = ['steer', 'throttle', 'brake', 'handbrake', 'shiftUp', 'shiftDown', 'camera', 'reset', 'pause'];
const STEER_MODES: readonly SteerMode[] = ['buttons', 'wheel', 'tilt', 'slider'];
export const DEFAULT_TOUCH_LAYOUT: TouchLayout = { steer: 'wheel', size: 1, opacity: 0.85, autoAccelerate: false, haptics: true, showShift: true, positions: {} };

const WHEEL_MAX = 2.1; // [rad] ≈ 120° lock to lock / 2
const AUTO_BRAKE = 0.05; // brake above this cancels auto-acceleration

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---- pure helpers (unit tested) ----

/** Pedal amount 0 … 1: a real touch force / pen pressure when the device reports one (0 < force < 1 and not the 0.5
 *  that mice and force-less touches report), otherwise how far up the pedal the finger is (bottom 0.25, top 1). */
export function pedalAmount(pointerY: number, rectTop: number, rectHeight: number, force?: number): number {
  if (force !== undefined && force > 0 && force < 1 && force !== 0.5) return force;
  const up = (rectTop + rectHeight - pointerY) / Math.max(rectHeight, 1e-6);
  return 0.25 + 0.75 * clamp(up, 0, 1);
}

/** Virtual wheel rotation (clockwise positive = right) → steer (positive = left). */
export function wheelAngleToSteer(angleRad: number, maxRad = WHEEL_MAX): number {
  return clamp(-angleRad / maxRad, -1, 1) || 0;
}

/** Roll of the screen's horizontal axis [°], positive = left edge down, from DeviceOrientation β/γ and the screen
 *  rotation. Uses the gravity vector rather than a raw angle so it works in any orientation and however far the
 *  phone is tipped back (β/γ alone flip near vertical). */
export function tiltRollDeg(gammaDeg: number, betaDeg: number, screenAngleDeg: number): number {
  const r = Math.PI / 180;
  const b = betaDeg * r, g = gammaDeg * r, s = screenAngleDeg * r;
  // Gravity in device axes for the W3C Z-X'-Y'' angles is (cos β sin γ, −sin β, −cos β cos γ); the screen's right
  // axis in device axes is (cos θ, −sin θ, 0). Their dot product is the sine of the roll.
  const right = Math.cos(b) * Math.sin(g) * Math.cos(s) + Math.sin(b) * Math.sin(s);
  return -Math.asin(clamp(right, -1, 1)) / r;
}

/** Roll [°] → steer with a dead zone and full lock at `fullDeg`. */
export function tiltShape(rollDeg: number, deadzoneDeg = 3, fullDeg = 30): number {
  const a = Math.abs(rollDeg);
  if (a <= deadzoneDeg) return 0;
  return Math.sign(rollDeg) * Math.min(1, (a - deadzoneDeg) / Math.max(1e-6, fullDeg - deadzoneDeg));
}

/** DeviceOrientation → steer (positive = left) for screen.orientation.angle 0 / 90 / −90 / 180 / 270. */
export function tiltToSteer(gammaDeg: number, betaDeg: number, screenAngleDeg: number, deadzoneDeg = 3, fullDeg = 30): number {
  return tiltShape(tiltRollDeg(gammaDeg, betaDeg, screenAngleDeg), deadzoneDeg, fullDeg);
}

/** Drag slider: finger x offset from the track centre → steer, positive = left (finger left). */
export function sliderToSteer(dx: number, halfWidth: number): number {
  return halfWidth > 0 ? clamp(-dx / halfWidth, -1, 1) || 0 : 0;
}

/** Auto-acceleration: full throttle unless the brake pedal is pressed. */
export function resolveThrottle(throttle: number, brake: number, autoAccelerate: boolean): number {
  return autoAccelerate ? (brake > AUTO_BRAKE ? 0 : 1) : throttle;
}

/** Any stored / partial value → a valid layout (unknown modes fall back, size and opacity are clamped). */
export function normalizeLayout(l: unknown): TouchLayout {
  const d = DEFAULT_TOUCH_LAYOUT;
  const o = (typeof l === 'object' && l !== null ? l : {}) as Partial<Record<keyof TouchLayout, unknown>>;
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : def);
  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
  const positions: TouchLayout['positions'] = {};
  const src = (typeof o.positions === 'object' && o.positions !== null ? o.positions : {}) as Record<string, { x?: unknown; y?: unknown } | undefined>;
  for (const id of CONTROL_IDS) {
    const p = src[id];
    if (p && typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y)) positions[id] = { x: p.x, y: p.y };
  }
  return {
    steer: STEER_MODES.includes(o.steer as SteerMode) ? (o.steer as SteerMode) : d.steer,
    size: num(o.size, 0.75, 1.5, d.size),
    opacity: num(o.opacity, 0.2, 1, d.opacity),
    autoAccelerate: bool(o.autoAccelerate, d.autoAccelerate),
    haptics: bool(o.haptics, d.haptics),
    showShift: bool(o.showShift, d.showShift),
    positions,
  };
}

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
}

// ---- component ----

const L = {
  left: { ko: '왼쪽', en: 'Left' },
  right: { ko: '오른쪽', en: 'Right' },
  steer: { ko: '조향', en: 'Steering' },
  calibrate: { ko: '기울기 보정', en: 'Recenter' },
  tiltHint: { ko: '탭하여 기울기 조향 켜기', en: 'Tap to enable tilt steering' },
  throttle: { ko: '가속', en: 'Gas' },
  brake: { ko: '브레이크', en: 'Brake' },
  handbrake: { ko: '핸드브레이크', en: 'Handbrake' },
  shiftUp: { ko: '시프트 업', en: 'Shift up' },
  shiftDown: { ko: '시프트 다운', en: 'Shift down' },
  camera: { ko: '카메라', en: 'Camera' },
  reset: { ko: '리셋', en: 'Reset' },
  pause: { ko: '일시정지', en: 'Pause' },
} satisfies Record<string, Localized>;

// 2 px line icons, 24 × 24, currentColor (static markup only).
const ICON = {
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
  minus: '<path d="M6 12h12"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v4h4"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  handbrake: '<circle cx="12" cy="12" r="5.5"/><path d="M5 6.5a8.5 8.5 0 0 0 0 11M19 6.5a8.5 8.5 0 0 1 0 11M12 9.5v3M12 15v.01"/>',
  grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
  // Wheel face in a 100 × 100 box: rim, hub, three spokes and an accent tick at 12 o'clock to show the rotation.
  wheel: '<circle cx="50" cy="50" r="44"/><circle cx="50" cy="50" r="9"/><path d="M6 50h35M59 50h35M50 59v35"/><path class="tc-tick" d="M50 6v10"/>',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

function icon(body: string, cls = 'tc-ic', box = 24): HTMLElement {
  const s = el('span', cls);
  s.innerHTML = `<svg viewBox="0 0 ${box} ${box}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  return s;
}

/** One finger on one control. */
interface Press {
  id: ControlId;
  node: HTMLElement;
  edit: boolean; // started in edit mode: drags the control
  x0: number; y0: number; // down position
  ox: number; oy: number; // edit: the control's offset at down
  rect: DOMRect; // control rect at down
  amount: number; // pedal amount
  side: number; // steering buttons: +1 left half, −1 right half
  angle: number; // wheel: last finger angle around the centre (NaN until far enough from it)
  cal: boolean; // tilt: went down on the recenter button
}

export class TouchControls {
  readonly root = el('div', 'tc');
  onAction: (a: TouchAction) => void = () => {};
  onLayoutChange: (l: TouchLayout) => void = () => {};
  private lay: TouchLayout = normalizeLayout(DEFAULT_TOUCH_LAYOUT);
  private nodes = {} as Record<ControlId, HTMLElement>;
  private presses = new Map<number, Press>();
  private editing = false;
  private builtSteer: SteerMode | null = null;
  private floored = { throttle: false, brake: false };
  // steering state
  private wheelAngle = 0;
  private wheelVel = 0;
  private raf = 0;
  private slider = 0;
  private roll: number | null = null;
  private rollCentre = 0;
  private tiltAsked = false;
  private tiltOn = false;
  private docOn = false;
  // steering parts (rebuilt with the mode)
  private halves: HTMLElement[] = [];
  private wheelFace: HTMLElement | null = null;
  private thumb: HTMLElement | null = null;
  private dot: HTMLElement | null = null;
  private hint: HTMLElement | null = null;
  private calBtn: HTMLElement | null = null;

  constructor(layout: TouchLayout = DEFAULT_TOUCH_LAYOUT) {
    const labels: Record<ControlId, Localized> = {
      steer: L.steer, throttle: L.throttle, brake: L.brake, handbrake: L.handbrake, shiftUp: L.shiftUp,
      shiftDown: L.shiftDown, camera: L.camera, reset: L.reset, pause: L.pause,
    };
    for (const id of CONTROL_IDS) {
      const n = el('div', `tc-c tc-${id}`);
      n.dataset.id = id;
      n.setAttribute('role', 'button');
      n.setAttribute('aria-label', tl(labels[id]));
      this.nodes[id] = n;
    }
    const pedal = (id: 'throttle' | 'brake') => this.nodes[id].append(el('i', 'tc-fill'), el('span', 'tc-ridges'), el('b', 'tc-label', tl(labels[id])));
    pedal('throttle');
    pedal('brake');
    this.nodes.throttle.classList.add('tc-pedal');
    this.nodes.brake.classList.add('tc-pedal');
    this.nodes.handbrake.append(icon(ICON.handbrake));
    this.nodes.shiftUp.append(icon(ICON.plus));
    this.nodes.shiftDown.append(icon(ICON.minus));
    this.nodes.camera.append(icon(ICON.camera));
    this.nodes.reset.append(icon(ICON.reset));
    this.nodes.pause.append(icon(ICON.pause));
    for (const id of ['handbrake', 'shiftUp', 'shiftDown', 'camera', 'reset', 'pause'] as const) this.nodes[id].classList.add('tc-btn');
    for (const id of ['camera', 'reset', 'pause'] as const) this.nodes[id].classList.add('tc-small');
    for (const id of CONTROL_IDS) if (id !== 'steer') this.nodes[id].append(icon(ICON.grip, 'tc-grip')); // edit-mode handle
    this.root.append(...CONTROL_IDS.map((id) => this.nodes[id]));
    this.root.hidden = true;

    // Delegated pointer handling: with capture, moves / ups target the captured control and bubble up to the root.
    this.root.addEventListener('pointerdown', (e) => this.down(e));
    this.root.addEventListener('pointermove', (e) => this.move(e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) this.root.addEventListener(type, (e) => this.up(e));
    this.root.addEventListener('contextmenu', (e) => e.preventDefault()); // long press on a pedal must not open a menu
    this.setLayout(layout);
  }

  get state(): TouchState {
    const analog = this.lay.steer !== 'buttons';
    if (this.root.hidden || this.editing) return { throttle: 0, brake: 0, steer: 0, handbrake: 0, analog };
    const brake = this.pedal('brake');
    return {
      throttle: resolveThrottle(this.pedal('throttle'), brake, this.lay.autoAccelerate),
      brake,
      steer: this.steerValue(),
      handbrake: this.driving().some((p) => p.id === 'handbrake') ? 1 : 0,
      analog,
    };
  }

  get layout(): TouchLayout {
    return normalizeLayout(this.lay); // a copy: callers may store / mutate it
  }

  setLayout(l: TouchLayout): void {
    this.lay = normalizeLayout(l);
    this.root.style.setProperty('--s', String(this.lay.size));
    this.root.style.setProperty('--o', String(this.lay.opacity));
    this.nodes.throttle.hidden = this.lay.autoAccelerate;
    this.nodes.shiftUp.hidden = this.nodes.shiftDown.hidden = !this.lay.showShift;
    for (const id of CONTROL_IDS) this.place(id);
    if (this.builtSteer !== this.lay.steer) {
      this.release(); // a finger held on the old steering control must not leak into the new one
      this.buildSteer();
    }
    this.syncListeners();
  }

  setEditMode(on: boolean): void {
    this.editing = on;
    this.root.classList.toggle('editing', on);
    this.release();
  }

  setVisible(on: boolean): void {
    this.root.hidden = !on;
    this.release();
    this.syncListeners();
  }

  haptic(ms = 12): void {
    if (this.lay.haptics && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(ms);
  }

  dispose(): void {
    this.root.hidden = true;
    this.release();
    this.syncListeners();
    cancelAnimationFrame(this.raf);
    this.root.remove();
  }

  // ---- pointer handling ----

  private down(e: PointerEvent): void {
    const node = e.target instanceof Element ? e.target.closest<HTMLElement>('.tc-c') : null;
    if (!node) return;
    e.preventDefault();
    const id = node.dataset.id as ControlId;
    try {
      node.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already released pointer: still works while the finger stays on the control */
    }
    const off = this.lay.positions[id] ?? { x: 0, y: 0 };
    const p: Press = { id, node, edit: this.editing, x0: e.clientX, y0: e.clientY, ox: off.x, oy: off.y, rect: node.getBoundingClientRect(), amount: 0, side: 0, angle: NaN, cal: false };
    this.presses.set(e.pointerId, p);
    node.classList.add('on');
    if (p.edit) return;
    if (id === 'shiftUp' || id === 'shiftDown') {
      this.haptic(15);
      this.onAction(id); // on press, not release: shifting must not lag
    } else if (id === 'steer' && this.lay.steer === 'tilt') {
      p.cal = !!this.calBtn && inside(this.calBtn.getBoundingClientRect(), e);
    } else if (id === 'steer' && this.lay.steer === 'wheel') {
      cancelAnimationFrame(this.raf); // grabbing the wheel stops its return
      this.wheelVel = 0;
    }
    this.drive(p, e);
  }

  private move(e: PointerEvent): void {
    const p = this.presses.get(e.pointerId);
    if (!p) return;
    if (!p.edit) return this.drive(p, e);
    // Edit mode: drag the control, kept inside the viewport.
    const dx = clamp(e.clientX - p.x0, -p.rect.left, window.innerWidth - p.rect.right);
    const dy = clamp(e.clientY - p.y0, -p.rect.top, window.innerHeight - p.rect.bottom);
    this.lay.positions[p.id] = { x: Math.round(p.ox + dx), y: Math.round(p.oy + dy) };
    this.place(p.id);
  }

  private up(e: PointerEvent): void {
    // iOS grants DeviceOrientation only from a user activation, which for touches is the pointerup.
    if (e.type === 'pointerup' && this.lay.steer === 'tilt' && !this.tiltAsked) this.requestTilt();
    const p = this.presses.get(e.pointerId);
    if (!p) return;
    this.presses.delete(e.pointerId);
    if (![...this.presses.values()].some((q) => q.node === p.node)) p.node.classList.remove('on');
    if (p.edit) {
      const pos = this.lay.positions[p.id];
      if (pos && (pos.x !== p.ox || pos.y !== p.oy)) this.onLayoutChange(this.layout);
      return;
    }
    const tap = e.type === 'pointerup' && inside(p.node.getBoundingClientRect(), e);
    if (p.id === 'throttle' || p.id === 'brake') this.showPedal(p.id);
    else if ((p.id === 'camera' || p.id === 'pause' || p.id === 'reset') && tap) {
      if (p.id === 'reset') this.haptic(30);
      this.onAction(p.id);
    } else if (p.id === 'steer') this.steerReleased(p, e);
  }

  /** Driving input of one finger (down and move). */
  private drive(p: Press, e: PointerEvent): void {
    const { id, rect } = p;
    if (id === 'throttle' || id === 'brake') {
      // Position always works; a real force sensor can only add to it (Android reports touch-area "pressure").
      p.amount = Math.max(pedalAmount(e.clientY, rect.top, rect.height), pedalAmount(e.clientY, rect.top, rect.height, e.pressure));
      if (this.showPedal(id) >= 0.98 && !this.floored[id]) {
        this.floored[id] = true; // pedal floor: one tick until it comes back up
        this.haptic(8);
      }
      return;
    }
    if (id !== 'steer') return;
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    if (this.lay.steer === 'buttons') {
      p.side = e.clientX < cx ? 1 : -1; // one zone: the thumb can slide from ◀ to ▶
      this.showButtons();
    } else if (this.lay.steer === 'wheel') {
      const dx = e.clientX - cx, dy = e.clientY - cy;
      if (Math.hypot(dx, dy) < 12) return; // the angle is noise near the hub
      const a = Math.atan2(dy, dx); // screen y points down: clockwise positive
      if (!Number.isNaN(p.angle)) {
        let d = a - p.angle;
        d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
        this.wheelAngle = clamp(this.wheelAngle + d, -WHEEL_MAX, WHEEL_MAX);
        this.showWheel();
      }
      p.angle = a;
    } else if (this.lay.steer === 'slider') {
      const half = rect.width / 2 - (this.thumb?.offsetWidth ?? 0) / 2;
      this.slider = sliderToSteer(e.clientX - cx, half);
      this.nodes.steer.classList.add('drag');
      this.showSlider();
    }
  }

  private steerReleased(p: Press, e: PointerEvent): void {
    const still = this.driving().some((q) => q.id === 'steer');
    if (this.lay.steer === 'buttons') this.showButtons();
    else if (this.lay.steer === 'wheel' && !still) this.springWheel();
    else if (this.lay.steer === 'slider' && !still) {
      this.slider = 0;
      this.nodes.steer.classList.remove('drag'); // CSS transition slides the thumb home
      this.showSlider();
    } else if (this.lay.steer === 'tilt' && p.cal && this.calBtn && e.type === 'pointerup' && inside(this.calBtn.getBoundingClientRect(), e)) {
      this.rollCentre = this.roll ?? 0;
      this.haptic(10);
      this.showTilt();
    }
  }

  /** Ends every press (mode / visibility changes): no stuck pedal or wheel. */
  private release(): void {
    for (const [pid, p] of this.presses) {
      try {
        p.node.releasePointerCapture(pid);
      } catch {
        /* already released */
      }
      p.node.classList.remove('on');
    }
    this.presses.clear();
    this.showPedal('throttle');
    this.showPedal('brake');
    this.slider = 0;
    this.nodes.steer.classList.remove('drag');
    this.showSlider();
    this.showButtons();
    if (this.wheelAngle !== 0) this.springWheel();
  }

  private driving(): Press[] {
    return [...this.presses.values()].filter((p) => !p.edit);
  }

  private pedal(id: 'throttle' | 'brake'): number {
    return this.driving().reduce((m, p) => (p.id === id ? Math.max(m, p.amount) : m), 0);
  }

  private steerValue(): number {
    switch (this.lay.steer) {
      case 'buttons': {
        const s = this.driving().filter((p) => p.id === 'steer');
        return (s.some((p) => p.side > 0) ? 1 : 0) - (s.some((p) => p.side < 0) ? 1 : 0);
      }
      case 'wheel':
        return wheelAngleToSteer(this.wheelAngle);
      case 'slider':
        return this.slider;
      case 'tilt':
        return this.roll === null ? 0 : tiltShape(this.roll - this.rollCentre);
    }
  }

  // ---- steering visuals ----

  private buildSteer(): void {
    const n = this.nodes.steer;
    this.builtSteer = this.lay.steer;
    n.className = `tc-c tc-steer tc-${this.lay.steer}`;
    this.halves = [];
    this.wheelFace = this.thumb = this.dot = this.hint = this.calBtn = null;
    this.wheelAngle = this.wheelVel = this.slider = 0;
    cancelAnimationFrame(this.raf);
    const parts: HTMLElement[] = [];
    if (this.lay.steer === 'buttons') {
      this.halves = [icon(ICON.left, 'tc-half'), icon(ICON.right, 'tc-half')];
      this.halves[0].setAttribute('aria-label', tl(L.left));
      this.halves[1].setAttribute('aria-label', tl(L.right));
      parts.push(...this.halves);
    } else if (this.lay.steer === 'wheel') {
      this.wheelFace = icon(ICON.wheel, 'tc-face', 100);
      parts.push(this.wheelFace);
    } else if (this.lay.steer === 'slider') {
      this.thumb = el('span', 'tc-thumb');
      parts.push(icon(ICON.left, 'tc-end'), el('span', 'tc-mid'), this.thumb, icon(ICON.right, 'tc-end'));
    } else {
      this.dot = el('i', 'tc-dot');
      const gauge = el('span', 'tc-gauge');
      gauge.append(this.dot);
      this.hint = el('small', 'tc-hint', tl(L.tiltHint));
      this.calBtn = el('span', 'tc-cal', tl(L.calibrate));
      parts.push(gauge, this.hint, this.calBtn);
    }
    n.replaceChildren(...parts, icon(ICON.grip, 'tc-grip'));
    this.showWheel();
    this.showTilt();
  }

  private showPedal(id: 'throttle' | 'brake'): number {
    const a = this.pedal(id);
    if (a < 0.9) this.floored[id] = false;
    const fill = this.nodes[id].firstElementChild;
    if (fill instanceof HTMLElement) fill.style.transform = `scaleY(${a})`;
    return a;
  }

  private showButtons(): void {
    const s = this.driving().filter((p) => p.id === 'steer');
    this.halves.forEach((h, i) => h.classList.toggle('on', s.some((p) => p.side === (i === 0 ? 1 : -1))));
  }

  private showWheel(): void {
    if (this.wheelFace) this.wheelFace.style.transform = `rotate(${this.wheelAngle}rad)`;
  }

  private showSlider(): void {
    if (!this.thumb) return;
    const half = this.nodes.steer.clientWidth / 2 - this.thumb.offsetWidth / 2;
    this.thumb.style.transform = `translateX(${-this.slider * half}px)`;
  }

  private showTilt(): void {
    if (this.hint) this.hint.hidden = this.roll !== null;
    if (this.dot) this.dot.style.transform = `translateX(${-this.steerValue() * 50}%)`;
  }

  /** Damped spring back to centre (ζ ≈ 0.7: one small overshoot, settled in ≈ 0.4 s). */
  private springWheel(): void {
    cancelAnimationFrame(this.raf);
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
      last = now;
      const k = 180, c = 2 * Math.sqrt(k) * 0.7;
      this.wheelVel += (-k * this.wheelAngle - c * this.wheelVel) * dt;
      this.wheelAngle += this.wheelVel * dt;
      if (Math.abs(this.wheelAngle) < 0.002 && Math.abs(this.wheelVel) < 0.02) this.wheelAngle = this.wheelVel = 0;
      this.showWheel();
      if (this.wheelAngle !== 0 || this.wheelVel !== 0) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  // ---- tilt sensor and page gestures ----

  private readonly onOrientation = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return;
    const legacy = (window as unknown as { orientation?: number }).orientation;
    const angle = screen.orientation?.angle ?? legacy ?? 0;
    this.roll = tiltRollDeg(e.gamma, e.beta, angle);
    this.showTilt();
  };

  private requestTilt(): void {
    this.tiltAsked = true;
    const DOE = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : null) as unknown as { requestPermission?: () => Promise<string> } | null;
    DOE?.requestPermission?.().catch(() => {}); // the listener is already attached; events start once granted
  }

  // Two-finger pinch on the page would zoom it (and cancel our pointers); Safari needs its gesture event too.
  private readonly noPinch = (e: TouchEvent) => {
    if (e.touches.length > 1) e.preventDefault();
  };
  private readonly noGesture = (e: Event) => e.preventDefault();

  private syncListeners(): void {
    const visible = !this.root.hidden;
    const tilt = visible && this.lay.steer === 'tilt';
    if (tilt !== this.tiltOn) {
      this.tiltOn = tilt;
      if (tilt) window.addEventListener('deviceorientation', this.onOrientation);
      else window.removeEventListener('deviceorientation', this.onOrientation);
    }
    if (visible !== this.docOn) {
      this.docOn = visible;
      if (visible) {
        document.addEventListener('touchmove', this.noPinch, { passive: false });
        document.addEventListener('gesturestart', this.noGesture);
      } else {
        document.removeEventListener('touchmove', this.noPinch);
        document.removeEventListener('gesturestart', this.noGesture);
      }
    }
  }

  private place(id: ControlId): void {
    const p = this.lay.positions[id];
    if (p) this.nodes[id].style.setProperty('translate', `${p.x}px ${p.y}px`);
    else this.nodes[id].style.removeProperty('translate');
  }
}

function inside(r: DOMRect, e: PointerEvent): boolean {
  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
}

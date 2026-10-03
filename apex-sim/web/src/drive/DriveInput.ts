// Driver input (§17 입력): keyboard and gamepad → core VehicleInput. Pure logic lives in `DriveLogic` (unit tested);
// `DriveInput` wires it to DOM events and the Gamepad API.
import type { VehicleInput } from '../physics/messages';

export interface RawControls {
  throttle: number; // 0 … 1 (the "forward" pedal: W / ↑ / right trigger)
  brake: number; // 0 … 1 (the "back" pedal: S / ↓ / left trigger)
  steer: number; // −1 … 1 target (positive = left)
  handbrake: number;
  analogSteer: boolean; // gamepad: steer is used as given; keyboard: rate-limited and speed-limited
}

const REVERSE_ENGAGE_S = 0.35; // hold the back pedal this long at a standstill to select reverse (and vice versa)
const STANDSTILL = 0.6; // [m/s]
// Auto hold (§9 경사로 밀림 방지): stopped with neither pedal pressed, the brakes stay on (the car does not roll back
// on a slope or creep); the throttle releases them.
const HOLD_SPEED = 0.3; // [m/s]
const HOLD_BRAKE = 0.5;
const KEY_STEER_RATE = 2.6; // [1/s] towards the target
const KEY_STEER_RETURN = 4.5; // [1/s] back to centre
const ANALOG_STEER_RATE = 5; // [1/s] a thumb or stick may move this fast (full lock in 0.2 s)
const ANALOG_SMOOTH = 0.05; // [s] low-pass of a thumb or stick (finger tremor, stick noise)
// Pedal travel: a foot takes about 0.2 s to floor a pedal, so a key or a button squeezes it on like one instead of a
// step (a step of full engine torque rocks the body on its springs and shakes the driveline); lifting is quicker.
const THROTTLE_RISE = 5; // [1/s]
const THROTTLE_FALL = 10;
const BRAKE_RISE = 7;
const BRAKE_FALL = 12;

function slew(from: number, to: number, rise: number, fall: number, dt: number): number {
  const d = to - from;
  return from + (d > 0 ? Math.min(d, rise * dt) : Math.max(d, -fall * dt));
}

/** Driving aids preset (§15.2): 입문 (every aid, gentle steering), 표준, 시뮬레이션 (no aids, the raw steering). */
export type AssistLevel = 'beginner' | 'standard' | 'sim';

/** What a car's steering needs for the limit below (defaults: a mid-size car). */
export interface SteerGeometry {
  wheelbase: number; // [m]
  lock: number; // road wheel angle at full lock [rad]
}
export const DEFAULT_GEOMETRY: SteerGeometry = { wheelbase: 2.8, lock: 0.5 };

/**
 * Speed-sensitive steering limit (§15.2 속도 감응 조향), as a share of full lock. The road wheel angle that reaches
 * the tyres' grip: the kinematic angle for the cornering limit, L·a/v², plus the tyres' peak slip angle — with more no
 * car corners harder, it only slides. A tapped key or a thumb then cannot throw a fast car sideways, while parking
 * keeps full lock. Countersteer (steering against the car's rotation) gets the whole lock: catching a slide needs it.
 * Simulation: no limit.
 */
export function steerLimit(speed: number, assist: AssistLevel = 'standard', geometry: SteerGeometry = DEFAULT_GEOMETRY): number {
  if (assist === 'sim') return 1;
  const v = Math.max(Math.abs(speed), 1);
  const lateral = assist === 'beginner' ? 8.5 : 10.5; // [m/s²] at the limit
  const slip = assist === 'beginner' ? 0.05 : 0.08; // [rad] tyre slip angle allowance
  return Math.min(1, Math.max(0.1, (geometry.wheelbase * lateral / (v * v) + slip) / geometry.lock));
}

export class DriveLogic {
  manual = false;
  abs = true;
  tcs = true;
  esc = true;
  /** Holds the car at a standstill without pedals (auto hold). */
  autoHold = true;
  /** §9 electronic chassis setting (cars that have one): 0 comfort, 1 normal, 2 sport. */
  chassisMode: 0 | 1 | 2 = 1;
  /** Ride-height lift requested (cars with a lift system; it drops back at speed, the car does that). */
  lift = false;
  assist: AssistLevel = 'standard';
  geometry: SteerGeometry = DEFAULT_GEOMETRY;
  /** 0 drive, 1 reverse (the automatic's selector; manual mode keeps its own gear but reverses the same way). */
  private reverse = false;
  private hold = 0;
  private steer = 0;
  private smooth = 0;
  private pedal = 0; // the "go" pedal after travel (throttle, or the brake key in reverse)
  private stop = 0;
  private shift: -1 | 0 | 1 = 0;
  private flip = false;
  private holding = true; // a car put down holds still until the driver moves it

  requestShift(dir: -1 | 1): void {
    this.shift = dir;
  }

  /** The D / R selector (a touch button): switches at a standstill on the next update. */
  requestReverse(): void {
    this.flip = true;
  }

  get reversing(): boolean {
    return this.reverse;
  }

  reset(): void {
    this.reverse = false;
    this.hold = 0;
    this.steer = 0;
    this.smooth = 0;
    this.pedal = 0;
    this.stop = 0;
    this.shift = 0;
    this.flip = false;
    this.holding = true;
  }

  /** Sets the aids of a preset (the driver may still switch each one after). */
  setAssist(level: AssistLevel): void {
    this.assist = level;
    const on = level !== 'sim';
    this.abs = on;
    this.tcs = on;
    this.esc = on;
    if (level === 'beginner') this.manual = false;
  }

  /** Advances by `dt` seconds at forward speed `speed` [m/s]; `yawRate` [rad/s] (positive: turning left). */
  update(dt: number, speed: number, c: RawControls, yawRate = 0): VehicleInput {
    // Reverse selection at a standstill: in reverse the pedals swap (back = go, forward = brake), as in most games.
    if (this.flip) {
      this.flip = false;
      if (Math.abs(speed) < STANDSTILL) {
        this.reverse = !this.reverse;
        this.hold = 0;
      }
    }
    const back = this.reverse ? c.throttle : c.brake;
    const go = this.reverse ? c.brake : c.throttle;
    if (Math.abs(speed) < STANDSTILL && back > 0.5 && go < 0.1) {
      this.hold += dt;
      if (this.hold >= REVERSE_ENGAGE_S) {
        this.reverse = !this.reverse;
        this.hold = 0;
      }
    } else {
      this.hold = 0;
    }
    this.pedal = slew(this.pedal, Math.max(0, Math.min(1, this.reverse ? c.brake : c.throttle)), THROTTLE_RISE, THROTTLE_FALL, dt);
    this.stop = slew(this.stop, Math.max(0, Math.min(1, this.reverse ? c.throttle : c.brake)), BRAKE_RISE, BRAKE_FALL, dt);
    const throttle = this.pedal;
    let brake = this.stop;
    // Auto hold: engages once stopped, then stays until a pedal is pressed (a bounce or a slope's first roll does not
    // let go of it); it never engages while coasting.
    const pedals = c.throttle >= 0.05 || c.brake >= 0.05 || c.handbrake >= 0.5;
    if (!this.autoHold || pedals || Math.abs(speed) > 3) this.holding = false;
    else if (Math.abs(speed) < HOLD_SPEED) this.holding = true;
    if (this.holding) brake = Math.max(brake, HOLD_BRAKE);

    const raw = Math.max(-1, Math.min(1, c.steer));
    // Countersteer — against the rotation while the car yaws faster than the steering asks — may use the whole lock.
    const counter = speed > 3 && raw * yawRate < 0 && Math.abs(yawRate) > 0.15;
    const limit = counter ? 1 : steerLimit(speed, this.assist, this.geometry);
    const target = raw * limit;
    if (c.analogSteer) {
      // A thumb or stick: smoothed (tremor) and rate-limited, never a jump.
      this.smooth += (target - this.smooth) * Math.min(1, dt / ANALOG_SMOOTH);
      const d = this.smooth - this.steer;
      this.steer += Math.sign(d) * Math.min(Math.abs(d), ANALOG_STEER_RATE * dt);
    } else {
      const rate = Math.abs(target) < Math.abs(this.steer) || target * this.steer < 0 ? KEY_STEER_RETURN : KEY_STEER_RATE;
      const d = target - this.steer;
      this.steer += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
      this.smooth = this.steer;
    }

    const shift = this.shift;
    this.shift = 0;
    return {
      throttle: Math.max(0, Math.min(1, throttle)),
      brake: Math.max(0, Math.min(1, brake)),
      steer: this.steer,
      handbrake: c.handbrake,
      mode: this.reverse ? 1 : this.manual ? 3 : 0,
      shift,
      abs: this.abs,
      tcs: this.tcs,
      esc: this.esc,
      chassisMode: this.chassisMode,
      lift: this.lift,
    };
  }

  /** Next electronic chassis setting: comfort → normal → sport → comfort. */
  cycleChassis(): void {
    this.chassisMode = ((this.chassisMode + 1) % 3) as 0 | 1 | 2;
  }
}

export type Action = 'shiftUp' | 'shiftDown' | 'toggleManual' | 'toggleTcs' | 'toggleAbs' | 'toggleEsc' | 'camera' | 'reset' | 'xray' | 'reverse'
  | 'chassisMode' | 'toggleLift';

/** An analog control surface next to keyboard and gamepad (§15.4 touch controls): read once per frame. */
export interface AnalogSource {
  readonly state: { throttle: number; brake: number; steer: number; handbrake: number; analog: boolean };
  /** What the car made of it (applied pedals after the aids, rack position, gear), to show on the controls. */
  feedback?(f: { throttle: number; brake: number; steer: number; gear: number; reversing: boolean; manual: boolean; tcs: boolean; abs: boolean; speed: number }): void;
}

const KEY_ACTIONS: Record<string, Action> = {
  KeyE: 'shiftUp',
  KeyQ: 'shiftDown',
  KeyM: 'toggleManual',
  KeyT: 'toggleTcs',
  KeyB: 'toggleAbs',
  KeyY: 'toggleEsc',
  KeyC: 'camera',
  KeyR: 'reset',
  KeyV: 'xray',
  KeyK: 'chassisMode',
  KeyH: 'toggleLift',
};

// Standard gamepad mapping (W3C): 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start.
const PAD_ACTIONS: [number, Action][] = [
  [5, 'shiftUp'],
  [4, 'shiftDown'],
  [2, 'camera'],
  [3, 'reset'],
  [8, 'toggleManual'],
];

export class DriveInput {
  readonly logic = new DriveLogic();
  enabled = false;
  /** Touch controls (or any other analog source), merged with the keys and the gamepad. */
  touch: AnalogSource | null = null;
  onAction: (a: Action) => void = () => {};
  private keys = new Set<string>();
  private padPrev = new Map<number, boolean>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      this.keys.add(e.code);
      const action = KEY_ACTIONS[e.code];
      if (action && !e.repeat) this.act(action);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Performs an action as if its key had been pressed (touch buttons, menus). */
  trigger(a: Action): void {
    this.act(a);
  }

  private act(a: Action): void {
    if (a === 'shiftUp') this.logic.requestShift(1);
    else if (a === 'shiftDown') this.logic.requestShift(-1);
    else if (a === 'toggleManual') this.logic.manual = !this.logic.manual;
    else if (a === 'toggleTcs') this.logic.tcs = !this.logic.tcs;
    else if (a === 'toggleAbs') this.logic.abs = !this.logic.abs;
    else if (a === 'toggleEsc') this.logic.esc = !this.logic.esc;
    else if (a === 'reverse') this.logic.requestReverse();
    else if (a === 'chassisMode') this.logic.cycleChassis();
    else if (a === 'toggleLift') this.logic.lift = !this.logic.lift;
    this.onAction(a);
  }

  private key(...codes: string[]): number {
    return codes.some((c) => this.keys.has(c)) ? 1 : 0;
  }

  /** Reads keyboard + first connected gamepad (the larger of the two per channel). */
  controls(): RawControls {
    const c: RawControls = {
      throttle: this.key('KeyW', 'ArrowUp'),
      brake: this.key('KeyS', 'ArrowDown'),
      steer: this.key('KeyA', 'ArrowLeft') - this.key('KeyD', 'ArrowRight'),
      handbrake: this.key('Space'),
      analogSteer: false,
    };
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const pad = [...pads].find((p) => p && p.connected && p.mapping === 'standard');
    if (pad) {
      const x = pad.axes[0] ?? 0;
      const dead = 0.06;
      const shaped = Math.abs(x) < dead ? 0 : Math.sign(x) * ((Math.abs(x) - dead) / (1 - dead)) ** 1.5;
      if (shaped !== 0 && c.steer === 0) {
        c.steer = -shaped; // stick right = steer right (negative)
        c.analogSteer = true;
      }
      c.throttle = Math.max(c.throttle, pad.buttons[7]?.value ?? 0);
      c.brake = Math.max(c.brake, pad.buttons[6]?.value ?? 0);
      c.handbrake = Math.max(c.handbrake, pad.buttons[1]?.pressed ? 1 : 0);
      for (const [button, action] of PAD_ACTIONS) {
        const down = !!pad.buttons[button]?.pressed;
        if (down && !this.padPrev.get(button)) this.act(action);
        this.padPrev.set(button, down);
      }
    }
    const touch = this.touch?.state;
    if (touch) {
      c.throttle = Math.max(c.throttle, touch.throttle);
      c.brake = Math.max(c.brake, touch.brake);
      c.handbrake = Math.max(c.handbrake, touch.handbrake);
      if (touch.steer !== 0 && c.steer === 0) {
        c.steer = touch.steer;
        c.analogSteer = touch.analog;
      }
    }
    return c;
  }

  update(dt: number, speed: number, yawRate = 0): VehicleInput {
    return this.logic.update(dt, speed, this.controls(), yawRate);
  }
}

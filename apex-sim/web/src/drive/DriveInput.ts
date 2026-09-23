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
const KEY_STEER_RATE = 2.6; // [1/s] towards the target
const KEY_STEER_RETURN = 4.5; // [1/s] back to centre

/** Keyboard steering limit: full lock when parking, ≈ 0.3 at 100 km/h, ≈ 0.18 at 200 km/h (a tapped key must not
 *  throw a fast car sideways). Analog steering keeps a milder limit. */
export function steerLimit(speed: number, analog: boolean): number {
  const v = Math.abs(speed);
  return analog ? Math.max(0.35, 1 / (1 + v / 40)) : Math.min(1, Math.max(0.12, 1 / (1 + v / 12)));
}

export class DriveLogic {
  manual = false;
  abs = true;
  tcs = true;
  /** 0 drive, 1 reverse (the automatic's selector; manual mode keeps its own gear but reverses the same way). */
  private reverse = false;
  private hold = 0;
  private steer = 0;
  private shift: -1 | 0 | 1 = 0;

  requestShift(dir: -1 | 1): void {
    this.shift = dir;
  }

  get reversing(): boolean {
    return this.reverse;
  }

  reset(): void {
    this.reverse = false;
    this.hold = 0;
    this.steer = 0;
    this.shift = 0;
  }

  /** Advances by `dt` seconds at forward speed `speed` [m/s]. */
  update(dt: number, speed: number, c: RawControls): VehicleInput {
    // Reverse selection at a standstill: in reverse the pedals swap (back = go, forward = brake), as in most games.
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
    const throttle = this.reverse ? c.brake : c.throttle;
    const brake = this.reverse ? c.throttle : c.brake;

    const limit = steerLimit(speed, c.analogSteer);
    const target = Math.max(-1, Math.min(1, c.steer)) * limit;
    if (c.analogSteer) {
      this.steer = target;
    } else {
      const rate = Math.abs(target) < Math.abs(this.steer) || target * this.steer < 0 ? KEY_STEER_RETURN : KEY_STEER_RATE;
      const d = target - this.steer;
      this.steer += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
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
    };
  }
}

type Action = 'shiftUp' | 'shiftDown' | 'toggleManual' | 'toggleTcs' | 'toggleAbs' | 'camera' | 'reset' | 'xray';

const KEY_ACTIONS: Record<string, Action> = {
  KeyE: 'shiftUp',
  KeyQ: 'shiftDown',
  KeyM: 'toggleManual',
  KeyT: 'toggleTcs',
  KeyB: 'toggleAbs',
  KeyC: 'camera',
  KeyR: 'reset',
  KeyV: 'xray',
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

  private act(a: Action): void {
    if (a === 'shiftUp') this.logic.requestShift(1);
    else if (a === 'shiftDown') this.logic.requestShift(-1);
    else if (a === 'toggleManual') this.logic.manual = !this.logic.manual;
    else if (a === 'toggleTcs') this.logic.tcs = !this.logic.tcs;
    else if (a === 'toggleAbs') this.logic.abs = !this.logic.abs;
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
    return c;
  }

  update(dt: number, speed: number): VehicleInput {
    return this.logic.update(dt, speed, this.controls());
  }
}

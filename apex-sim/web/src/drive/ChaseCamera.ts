// Driving cameras. Chase: trails the car's heading at a distance that grows a little with speed; the field of view
// widens with speed and the camera lags the car's accelerations (braking pulls it closer, a corner swings it wide) —
// the cues that make speed readable. Roof: low over the windscreen, looking down the road (the strongest sense of
// speed). Orbit: the pivot rides along with the car. In every mode a drag on the screen (mouse or finger) looks
// around the car and the wheel / a pinch zooms; the view springs back a moment after it is let go.
import * as THREE from 'three/webgpu';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { VehicleState } from '../physics/telemetry';

export type CameraMode = 'chase' | 'roof' | 'orbit';
const MODES: CameraMode[] = ['chase', 'roof', 'orbit'];

const DISTANCE = 5.6; // [m] behind the reference point at rest
const DISTANCE_PER_MS = 0.012; // [m per m/s] pulls back a little with speed
const HEIGHT = 1.75; // [m] above the reference point
const LOOK_AHEAD = 3.0; // [m]
const LOOK_HEIGHT = 0.7; // [m]
const POSITION_RATE = 9; // [1/s] exponential follow
const HEADING_RATE = 4; // [1/s] heading lag (lets the car's yaw show)
const FOV_BASE = 58; // [°] at rest
const FOV_GAIN = 16; // [°] added towards very high speed
const G_LAG = 0.05; // [m per m/s²] the camera trails the car's acceleration
const RETURN_DELAY = 1.4; // [s] after a drag, before the view swings back

export class ChaseCamera {
  mode: CameraMode = 'chase';
  private heading = new THREE.Vector3(0, 0, 1);
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private lastCar = new THREE.Vector3();
  private initialized = false;
  private lag = new THREE.Vector2(); // smoothed [longitudinal, lateral] acceleration [m/s²]
  // Look-around from a drag: yaw and pitch offsets [rad], zoom factor, and the time since the last drag.
  private yawOff = 0;
  private pitchOff = 0;
  private zoom = 1;
  private idle = 99;
  private drag: { id: number; x: number; y: number } | null = null;
  private pinch: { a: number; b: number; d: number } | null = null;
  private touches = new Map<number, { x: number; y: number }>();
  /** Frames the car higher (a fraction of the view height) where the gauge covers the bottom of the view. */
  lift = 0;

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly controls: OrbitControls) {
    const canvas = controls.domElement as HTMLElement | null;
    if (!canvas) return;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    for (const t of ['pointerup', 'pointercancel'] as const) canvas.addEventListener(t, (e) => this.up(e));
    canvas.addEventListener('wheel', (e) => {
      if (this.mode === 'orbit') return;
      this.zoom = Math.min(Math.max(this.zoom * Math.exp(e.deltaY * 0.001), 0.55), 2.2);
      this.idle = 0;
    }, { passive: true });
  }

  /** Cycles chase → roof → orbit. */
  toggle(): CameraMode {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    this.controls.enabled = this.mode === 'orbit';
    this.yawOff = this.pitchOff = 0;
    this.initialized = false;
    return this.mode;
  }

  reset(): void {
    this.initialized = false;
    this.yawOff = this.pitchOff = 0;
  }

  private down(e: PointerEvent): void {
    if (this.mode === 'orbit') return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.touches.size === 2) {
      const [a, b] = [...this.touches.entries()];
      this.pinch = { a: a[0], b: b[0], d: Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y) };
      this.drag = null;
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }

  private move(e: PointerEvent): void {
    if (!this.touches.has(e.pointerId) && !this.drag) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch) {
      const a = this.touches.get(this.pinch.a), b = this.touches.get(this.pinch.b);
      if (a && b) {
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoom = Math.min(Math.max(this.zoom * (this.pinch.d / Math.max(d, 1)), 0.55), 2.2);
        this.pinch.d = d;
        this.idle = 0;
      }
      return;
    }
    if (!this.drag || this.drag.id !== e.pointerId) return;
    const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    this.yawOff -= dx * 0.006;
    this.pitchOff = Math.min(Math.max(this.pitchOff + dy * 0.004, -0.35), 0.9);
    this.idle = 0;
  }

  private up(e: PointerEvent): void {
    this.touches.delete(e.pointerId);
    if (this.pinch && (e.pointerId === this.pinch.a || e.pointerId === this.pinch.b)) this.pinch = null;
    if (this.drag?.id === e.pointerId) this.drag = null;
  }

  /** Call once per rendered frame after the vehicle pose has been updated. */
  update(dt: number, v: VehicleState): void {
    const car = new THREE.Vector3(...v.position);
    const up = new THREE.Vector3(0, 1, 0);
    const fwd = new THREE.Vector3(...v.forward).setY(0);
    if (fwd.lengthSq() > 1e-6) fwd.normalize();
    else fwd.copy(this.heading);
    if (!this.initialized) {
      this.heading.copy(fwd);
      this.lastCar.copy(car);
    }
    this.frame();
    if (this.mode === 'orbit') {
      this.controls.enabled = true;
      this.setFov(FOV_BASE, dt);
      const delta = car.clone().sub(this.lastCar);
      this.controls.target.add(delta);
      this.camera.position.add(delta);
      if (!this.initialized) {
        this.controls.target.copy(car).addScaledVector(up, LOOK_HEIGHT);
        this.camera.position.copy(car).addScaledVector(fwd, -DISTANCE).addScaledVector(up, HEIGHT);
      }
      this.lastCar.copy(car);
      this.initialized = true;
      return;
    }
    this.controls.enabled = false;
    // The look-around swings back once the finger or mouse has been still for a moment.
    this.idle += dt;
    if (!this.drag && this.idle > RETURN_DELAY) {
      const r = 1 - Math.exp(-3 * dt);
      this.yawOff -= this.yawOff * r;
      this.pitchOff -= this.pitchOff * r;
    }
    const speed = Math.abs(v.speed);
    // Speed: the view widens (≈ +10° at 150 km/h, towards +16°).
    this.setFov(FOV_BASE + FOV_GAIN * (1 - Math.exp(-speed / 45)), dt);
    // Accelerations felt through the camera (low-passed): the car pulls away under power, closes in under braking,
    // swings out in a corner.
    const lk = 1 - Math.exp(-4 * dt);
    this.lag.x += (Math.max(-12, Math.min(12, v.accelLong)) - this.lag.x) * lk;
    this.lag.y += (Math.max(-12, Math.min(12, v.accelLat)) - this.lag.y) * lk;
    const k = 1 - Math.exp(-HEADING_RATE * dt);
    this.heading.lerp(fwd, k).normalize();
    const side = new THREE.Vector3().crossVectors(this.heading, up).normalize(); // right of the heading
    if (this.mode === 'roof') {
      // Low over the windscreen, following the body's own motion (pitch and roll show).
      const bodyUp = new THREE.Vector3(...v.up);
      const bodyFwd = new THREE.Vector3(...v.forward);
      const eye = car.clone().addScaledVector(bodyUp, 0.78).addScaledVector(bodyFwd, -0.25);
      const dir = bodyFwd.clone().applyAxisAngle(bodyUp, this.yawOff);
      const target = eye.clone().addScaledVector(dir, 20).addScaledVector(bodyUp, -0.6 - this.pitchOff * 8);
      this.camera.position.copy(eye);
      this.camera.up.copy(bodyUp.lerp(up, 0.6).normalize());
      this.camera.lookAt(target);
      this.camera.up.set(0, 1, 0);
      this.controls.target.copy(target);
      this.lastCar.copy(car);
      this.initialized = true;
      return;
    }
    const distance = (DISTANCE + DISTANCE_PER_MS * speed) * this.zoom;
    const back = this.heading.clone().applyAxisAngle(up, this.yawOff);
    const height = HEIGHT * this.zoom + Math.sin(this.pitchOff) * distance;
    const wantPos = car.clone().addScaledVector(back, -distance * Math.cos(this.pitchOff * 0.8)).addScaledVector(up, height)
      .addScaledVector(this.heading, -this.lag.x * G_LAG).addScaledVector(side, this.lag.y * G_LAG);
    const wantLook = car.clone().addScaledVector(this.heading, LOOK_AHEAD * Math.cos(this.yawOff)).addScaledVector(up, LOOK_HEIGHT);
    if (!this.initialized) {
      this.pos.copy(wantPos);
      this.look.copy(wantLook);
    } else {
      // Follow in the car's moving frame so a fast car does not outrun the camera.
      const moved = car.clone().sub(this.lastCar);
      this.pos.add(moved);
      this.look.add(moved);
      const p = 1 - Math.exp(-POSITION_RATE * dt);
      this.pos.lerp(wantPos, p);
      this.look.lerp(wantLook, p);
    }
    this.pos.y = Math.max(this.pos.y, car.y - 0.2, 0.3);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    this.controls.target.copy(this.look); // switching to orbit starts from here
    this.lastCar.copy(car);
    this.initialized = true;
  }

  private setFov(target: number, dt: number): void {
    const f = this.camera.fov + (target - this.camera.fov) * (1 - Math.exp(-3 * dt));
    if (Math.abs(f - this.camera.fov) > 0.01) {
      this.camera.fov = f;
      this.camera.updateProjectionMatrix();
    }
  }

  /** The view window moves down by `lift` of the height so the car sits above the gauge. */
  private frame(): void {
    const lift = this.mode === 'roof' ? 0 : this.lift;
    const cam = this.camera;
    const w = innerWidth, h = innerHeight;
    if (lift > 0) {
      const v = cam.view;
      const y = Math.round(h * lift);
      if (!v || !v.enabled || v.offsetY !== y || v.fullWidth !== w || v.fullHeight !== h) cam.setViewOffset(w, h, 0, y, w, h);
    } else if (cam.view?.enabled) cam.clearViewOffset();
  }

  /** Leaves the camera as the other views expect it (no framing offset). */
  release(): void {
    if (this.camera.view?.enabled) this.camera.clearViewOffset();
  }
}

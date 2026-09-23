// Driving cameras: a chase camera that trails the car's heading, and an orbit mode whose pivot rides along with the
// car (the user keeps orbiting/zooming with the mouse).
import * as THREE from 'three/webgpu';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { VehicleState } from '../physics/telemetry';

export type CameraMode = 'chase' | 'orbit';

const DISTANCE = 6.2; // [m] behind the reference point at rest
const DISTANCE_PER_MS = 0.03; // [m per m/s] pulls back with speed
const HEIGHT = 1.9; // [m] above the reference point
const LOOK_AHEAD = 2.0; // [m]
const LOOK_HEIGHT = 0.7; // [m]
const POSITION_RATE = 7; // [1/s] exponential follow
const HEADING_RATE = 3.5; // [1/s] heading lag (lets the car's yaw show)

export class ChaseCamera {
  mode: CameraMode = 'chase';
  private heading = new THREE.Vector3(0, 0, 1);
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private lastCar = new THREE.Vector3();
  private initialized = false;

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly controls: OrbitControls) {}

  toggle(): CameraMode {
    this.mode = this.mode === 'chase' ? 'orbit' : 'chase';
    this.controls.enabled = this.mode === 'orbit';
    return this.mode;
  }

  reset(): void {
    this.initialized = false;
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
    if (this.mode === 'orbit') {
      this.controls.enabled = true;
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
    const k = 1 - Math.exp(-HEADING_RATE * dt);
    this.heading.lerp(fwd, k).normalize();
    const distance = DISTANCE + DISTANCE_PER_MS * Math.abs(v.speed);
    const wantPos = car.clone().addScaledVector(this.heading, -distance).addScaledVector(up, HEIGHT);
    const wantLook = car.clone().addScaledVector(this.heading, LOOK_AHEAD).addScaledVector(up, LOOK_HEIGHT);
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
    this.pos.y = Math.max(this.pos.y, 0.3);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    this.controls.target.copy(this.look); // switching to orbit starts from here
    this.lastCar.copy(car);
    this.initialized = true;
  }
}

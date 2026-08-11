import * as THREE from 'three';
import {
  BASE_SPEED,
  CAMERA_BACK,
  CAMERA_FOLLOW_LERP,
  CAMERA_FOV_BASE,
  CAMERA_FOV_MAX,
  CAMERA_HEIGHT,
  CAMERA_LOOK_AHEAD,
  MAX_SPEED,
} from '../config/constants';
import { PLAYER_Z } from '../player/Player';

/** Aspect the field of view was tuned against (a 16:9 landscape window). */
const DESIGN_ASPECT = 16 / 9;
/** How far a narrow screen is allowed to widen the lens. */
const MAX_PORTRAIT_WIDEN = 1.3;

/**
 * Three.js measures field of view **vertically**, so a portrait phone shows
 * strictly less of the yard's width than a landscape window — which is why the
 * runner, the inspector and the carriages all ballooned on a phone. Widen the
 * lens as the viewport narrows (capped, since matching horizontal FOV outright
 * would give an unusable ~120° vertical) so the three rails and the traffic
 * ahead read at the same scale everywhere.
 */
function adaptFov(designVFov: number, aspect: number): number {
  const narrow = DESIGN_ASPECT / Math.max(0.35, aspect);
  const widen = Math.min(MAX_PORTRAIT_WIDEN, 1 + Math.max(0, narrow - 1) * 0.22);
  return designVFov * widen;
}

/**
 * Drives the engine camera as a chase cam: parked behind and above the player,
 * easing laterally to follow lane changes, and gently widening its FOV as the
 * run speeds up to sell the sensation of acceleration.
 */
export class CameraRig {
  private readonly lookTarget = new THREE.Vector3(0, 1, PLAYER_Z - CAMERA_LOOK_AHEAD);
  private targetX = 0;
  private camX = 0;
  /** Smoothed "rocket lift" amount, 0 = normal chase, 1 = soaring overhead. */
  private lift = 0;
  /** Smoothed feet height of the player (so the camera rises with flight). */
  private followY = 0;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    camera.position.set(0, CAMERA_HEIGHT, PLAYER_Z + CAMERA_BACK);
    camera.fov = CAMERA_FOV_BASE;
    camera.updateProjectionMatrix();
  }

  /**
   * @param liftAmount 0..1 — pushes the camera up and back into a dramatic
   *        bird's-eye chase (used while the Rocket is active).
   * @param playerY    the player's current height, so the camera tracks flight.
   */
  update(dt: number, playerX: number, speed: number, liftAmount = 0, playerY = CAMERA_HEIGHT): void {
    const t = 1 - Math.exp(-CAMERA_FOLLOW_LERP * dt);
    this.targetX = playerX * 0.35;
    this.camX += (this.targetX - this.camX) * t;
    this.lift += (liftAmount - this.lift) * (1 - Math.exp(-4 * dt));
    this.followY += (playerY - this.followY) * t;

    // Rocket lift: rise high and pull back for a soaring, top-down-ish view.
    const height = CAMERA_HEIGHT + this.lift * 9 + this.followY * 0.55;
    const back = CAMERA_BACK + this.lift * 4;

    this.camera.position.x = this.camX;
    this.camera.position.y = height;
    this.camera.position.z = PLAYER_Z + back;

    // Aim further down/ahead as we climb so the player stays framed below.
    const aimY = 1 + this.followY * 0.5 - this.lift * 1.5;
    this.lookTarget.set(this.camX * 0.5, aimY, PLAYER_Z - CAMERA_LOOK_AHEAD);
    this.camera.lookAt(this.lookTarget);

    // Subtle roll into lane changes — the camera "banks" with the player.
    this.camera.rotateZ((this.camX - this.targetX) * 0.06);

    // Map current speed (BASE..MAX) onto the FOV range and ease toward it.
    const speedT = THREE.MathUtils.clamp(
      (speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED),
      0,
      1,
    );
    const targetFov = adaptFov(
      THREE.MathUtils.lerp(CAMERA_FOV_BASE, CAMERA_FOV_MAX, speedT) + this.lift * 6,
      this.camera.aspect,
    );
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov += (targetFov - this.camera.fov) * t;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Menu "hero" camera: frames the character up close and slightly to the side,
   * slowly orbiting so it reads as a showcased, popped-out model rather than a
   * far-away runner. `elapsed` drives the gentle orbit.
   */
  menu(dt: number, elapsed: number): void {
    const t = 1 - Math.exp(-5 * dt);
    const orbit = Math.sin(elapsed * 0.35) * 1.9; // gentle side-to-side
    const tx = orbit;
    // Framed so head and torso clear the bottom controls at any aspect.
    const tz = PLAYER_Z + 7.2;
    const ty = 2.3;
    this.camera.position.x += (tx - this.camera.position.x) * t;
    this.camera.position.y += (ty - this.camera.position.y) * t;
    this.camera.position.z += (tz - this.camera.position.z) * t;
    // Look at the upper body so the character feels prominent.
    this.lookTarget.set(0, 1.46, PLAYER_Z);
    this.camera.lookAt(this.lookTarget);
    const targetFov = adaptFov(42, this.camera.aspect);
    this.camera.fov += (targetFov - this.camera.fov) * t;
    this.camera.updateProjectionMatrix();
  }

  reset(): void {
    this.camX = 0;
    this.targetX = 0;
    this.lift = 0;
    this.followY = 0;
  }
}

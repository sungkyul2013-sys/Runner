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

/**
 * Drives the engine camera as a chase cam: parked behind and above the player,
 * easing laterally to follow lane changes, and gently widening its FOV as the
 * run speeds up to sell the sensation of acceleration.
 */
export class CameraRig {
  private readonly lookTarget = new THREE.Vector3(0, 1, PLAYER_Z - CAMERA_LOOK_AHEAD);
  private targetX = 0;
  private camX = 0;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    camera.position.set(0, CAMERA_HEIGHT, PLAYER_Z + CAMERA_BACK);
    camera.fov = CAMERA_FOV_BASE;
    camera.updateProjectionMatrix();
  }

  update(dt: number, playerX: number, speed: number): void {
    // Ease horizontally toward the player (damped, ~30% of the player's offset
    // so the camera lags slightly and the lane change reads as motion).
    this.targetX = playerX * 0.35;
    const t = 1 - Math.exp(-CAMERA_FOLLOW_LERP * dt);
    this.camX += (this.targetX - this.camX) * t;

    this.camera.position.x = this.camX;
    this.camera.position.y = CAMERA_HEIGHT;
    this.camera.position.z = PLAYER_Z + CAMERA_BACK;

    this.lookTarget.set(this.camX * 0.5, 1, PLAYER_Z - CAMERA_LOOK_AHEAD);
    this.camera.lookAt(this.lookTarget);

    // Subtle roll into lane changes — the camera "banks" with the player.
    this.camera.rotateZ((this.camX - this.targetX) * 0.06);

    // Map current speed (BASE..MAX) onto the FOV range and ease toward it.
    const speedT = THREE.MathUtils.clamp(
      (speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED),
      0,
      1,
    );
    const targetFov = THREE.MathUtils.lerp(CAMERA_FOV_BASE, CAMERA_FOV_MAX, speedT);
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov += (targetFov - this.camera.fov) * t;
      this.camera.updateProjectionMatrix();
    }
  }

  reset(): void {
    this.camX = 0;
    this.targetX = 0;
  }
}

import * as THREE from 'three';
import {
  COLORS,
  GRAVITY,
  JUMP_VELOCITY,
  LANE_LERP,
  laneToX,
  PLAYER_HALF_SLIDING,
  PLAYER_HALF_STANDING,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  SLIDE_DURATION,
} from '../config/constants';

/** Z position the player is anchored at; the world scrolls past in +Z. */
export const PLAYER_Z = 0;

/** Standing capsule centre height (feet on ground at y=0). */
const STAND_CENTER_Y = PLAYER_HALF_STANDING.y;

/**
 * The runner. Holds a capsule mesh and three independent motion channels:
 * lateral lane movement (smooth lerp), vertical jump (gravity parabola) and a
 * timed slide (visually squashes + shrinks the collision box). Exposes a live
 * AABB ({@link aabb}) that the collision system reads each frame.
 */
export class Player {
  readonly group = new THREE.Group();
  readonly aabb = new THREE.Box3();

  private readonly mesh: THREE.Mesh;

  private currentLane = 0;
  private x = 0; // smoothed lateral position
  private jumpY = 0; // vertical offset above the run height
  private vy = 0; // vertical velocity
  private grounded = true;
  private sliding = false;
  private slideTimer = 0;

  private readonly center = new THREE.Vector3();
  private readonly size = new THREE.Vector3();

  constructor() {
    const cylLength = PLAYER_HEIGHT - PLAYER_RADIUS * 2;
    const geo = new THREE.CapsuleGeometry(PLAYER_RADIUS, cylLength, 6, 12);
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.player,
      emissive: COLORS.player,
      emissiveIntensity: 0.35,
      roughness: 0.4,
      metalness: 0.1,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.group.add(this.mesh);

    // A subtle glowing core sphere for character flavour.
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(PLAYER_RADIUS * 0.55, 12, 12),
      new THREE.MeshBasicMaterial({ color: COLORS.playerGlow }),
    );
    core.position.y = 0.2;
    this.mesh.add(core);

    this.reset();
  }

  /** Restore the player to the start-of-run state. */
  reset(): void {
    this.currentLane = 0;
    this.x = 0;
    this.jumpY = 0;
    this.vy = 0;
    this.grounded = true;
    this.sliding = false;
    this.slideTimer = 0;
    this.mesh.scale.set(1, 1, 1);
    this.group.position.set(0, STAND_CENTER_Y, PLAYER_Z);
    this.updateAABB();
  }

  moveLeft(): void {
    this.currentLane = Math.max(-1, this.currentLane - 1);
  }

  moveRight(): void {
    this.currentLane = Math.min(1, this.currentLane + 1);
  }

  jump(): void {
    if (!this.grounded) return; // single jump only
    this.vy = JUMP_VELOCITY;
    this.grounded = false;
    this.endSlide(); // jumping cancels a slide
  }

  slide(): void {
    if (this.sliding) return;
    // Sliding from mid-air slams down for a fast duck.
    if (!this.grounded) {
      this.jumpY = 0;
      this.vy = 0;
      this.grounded = true;
    }
    this.sliding = true;
    this.slideTimer = SLIDE_DURATION;
    this.mesh.scale.set(1, 0.5, 1);
  }

  private endSlide(): void {
    if (!this.sliding) return;
    this.sliding = false;
    this.slideTimer = 0;
    this.mesh.scale.set(1, 1, 1);
  }

  update(dt: number): void {
    // Lateral lerp toward the active lane (frame-rate independent).
    const targetX = laneToX(this.currentLane);
    const t = 1 - Math.exp(-LANE_LERP * dt);
    this.x += (targetX - this.x) * t;

    // Vertical jump physics.
    if (!this.grounded) {
      this.vy -= GRAVITY * dt;
      this.jumpY += this.vy * dt;
      if (this.jumpY <= 0) {
        this.jumpY = 0;
        this.vy = 0;
        this.grounded = true;
      }
    }

    // Slide timeout.
    if (this.sliding) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) this.endSlide();
    }

    // Place the group. While sliding the capsule squashes toward the ground.
    const half = this.sliding ? PLAYER_HALF_SLIDING : PLAYER_HALF_STANDING;
    this.group.position.x = this.x;
    this.group.position.y = half.y + this.jumpY;
    this.group.position.z = PLAYER_Z;

    this.updateAABB();
  }

  private updateAABB(): void {
    const half = this.sliding ? PLAYER_HALF_SLIDING : PLAYER_HALF_STANDING;
    this.center.set(this.x, half.y + this.jumpY, PLAYER_Z);
    this.size.set(half.x * 2, half.y * 2, half.z * 2);
    this.aabb.setFromCenterAndSize(this.center, this.size);
  }

  get lane(): number {
    return this.currentLane;
  }

  get isSliding(): boolean {
    return this.sliding;
  }

  get isAirborne(): boolean {
    return !this.grounded;
  }
}

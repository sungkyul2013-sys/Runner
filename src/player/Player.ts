import * as THREE from 'three';
import {
  GRAVITY,
  JUMP_VELOCITY,
  LANE_LERP,
  laneToX,
  PLAYER_HALF_SLIDING,
  PLAYER_HALF_STANDING,
  SLIDE_DURATION,
} from '../config/constants';
import { CHARACTERS, getCharacter, type CharacterDef } from '../data/characters';
import type { EquippedCosmetics } from '../data/cosmetics';
import { Character, type Pose } from './Character';

/** Z position the player is anchored at; the world scrolls past in +Z. */
export const PLAYER_Z = 0;

/**
 * The runner. Three motion channels: lateral lane lerp, vertical motion
 * (gravity parabola resolving to a settable {@link groundY} so the player can
 * stand on top of rideable obstacles), and a timed slide that shrinks the
 * collision box. Exposes a live AABB plus `feetY`/`vy` so the collision system
 * can tell "landed on a roof" from "slammed into a wall".
 *
 * The visual is a capsule placeholder; Phase 6 swaps in the animated Character
 * rig via {@link setVisual} without touching this physics.
 */
export class Player {
  readonly group = new THREE.Group();
  readonly aabb = new THREE.Box3();

  private rig: Character;
  /** Stride cadence (~1 at base speed); set by the game each frame. */
  private animSpeed = 1;

  private currentLane = 0;
  private x = 0; // smoothed lateral position
  private feetY = 0; // absolute height of the player's feet
  private vy = 0; // vertical velocity
  private grounded = true;
  /** Current support height under the player (0 = track, >0 = on an obstacle). */
  private groundY = 0;
  /** Jump strength multiplier (Super Sneakers raises this). */
  private jumpMult = 1;
  /** When flying (jetpack/rocket) gravity is suspended and Y is driven outside. */
  private flying = false;

  private sliding = false;
  private slideTimer = 0;

  private readonly center = new THREE.Vector3();
  private readonly size = new THREE.Vector3();

  constructor() {
    this.rig = new Character(CHARACTERS[0], { hair: 'hair-none', outfit: 'outfit-classic' });
    this.group.add(this.rig.group);
    this.reset();
  }

  /** Swap in a different character/cosmetics without touching the physics. */
  applyCharacter(def: CharacterDef, equipped: EquippedCosmetics): void {
    this.group.remove(this.rig.group);
    this.rig.dispose();
    this.rig = new Character(def, equipped);
    this.group.add(this.rig.group);
  }

  /** Convenience: apply by character id. */
  applyCharacterId(id: string, equipped: EquippedCosmetics): void {
    this.applyCharacter(getCharacter(id), equipped);
  }

  setAnimSpeed(s: number): void {
    this.animSpeed = s;
  }

  /** Restore the player to the start-of-run state. */
  reset(): void {
    this.currentLane = 0;
    this.x = 0;
    this.feetY = 0;
    this.vy = 0;
    this.grounded = true;
    this.groundY = 0;
    this.jumpMult = 1;
    this.flying = false;
    this.sliding = false;
    this.slideTimer = 0;
    this.rig.group.scale.set(1, 1, 1);
    this.group.position.set(0, PLAYER_HALF_STANDING.y, PLAYER_Z);
    this.updateAABB();
  }

  moveLeft(): void {
    this.currentLane = Math.max(-1, this.currentLane - 1);
  }

  moveRight(): void {
    this.currentLane = Math.min(1, this.currentLane + 1);
  }

  jump(): void {
    if (this.flying || !this.grounded) return; // single jump only
    this.vy = JUMP_VELOCITY * this.jumpMult;
    this.grounded = false;
    this.endSlide(); // jumping cancels a slide
  }

  slide(): void {
    if (this.flying || this.sliding) return;
    // Sliding from mid-air slams down for a fast duck.
    if (!this.grounded) {
      this.vy = -JUMP_VELOCITY; // accelerate the descent
    }
    this.sliding = true;
    this.slideTimer = SLIDE_DURATION;
    this.rig.group.scale.set(1, 0.5, 1);
  }

  private endSlide(): void {
    if (!this.sliding) return;
    this.sliding = false;
    this.slideTimer = 0;
    this.rig.group.scale.set(1, 1, 1);
  }

  // ── State pushed in by systems (collision / power-ups) ───────────────────
  /** Support height under the player this frame (set by the collision pass). */
  setGroundY(y: number): void {
    this.groundY = y;
  }
  setJumpMult(m: number): void {
    this.jumpMult = m;
  }
  setFlying(on: boolean): void {
    this.flying = on;
    if (on) {
      this.endSlide();
      this.grounded = false;
    }
  }

  update(dt: number): void {
    // Lateral lerp toward the active lane (frame-rate independent).
    const targetX = laneToX(this.currentLane);
    const t = 1 - Math.exp(-LANE_LERP * dt);
    this.x += (targetX - this.x) * t;

    if (!this.flying) {
      // Vertical gravity integration resolving to the current support height.
      this.vy -= GRAVITY * dt;
      this.feetY += this.vy * dt;
      if (this.feetY <= this.groundY) {
        this.feetY = this.groundY;
        this.vy = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
    }

    // Slide timeout.
    if (this.sliding) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) this.endSlide();
    }

    const half = this.sliding ? PLAYER_HALF_SLIDING : PLAYER_HALF_STANDING;
    this.group.position.set(this.x, this.feetY + half.y, PLAYER_Z);
    this.updateAABB();

    // Drive the character animation from the current motion state.
    const pose: Pose =
      this.flying || !this.grounded ? 'air' : this.sliding ? 'slide' : 'run';
    this.rig.update(dt, pose, this.animSpeed);
  }

  /** Directly set the player's feet height (jetpack/rocket flight control). */
  setFeetY(y: number): void {
    this.feetY = y;
    this.vy = 0;
  }

  private updateAABB(): void {
    const half = this.sliding ? PLAYER_HALF_SLIDING : PLAYER_HALF_STANDING;
    this.center.set(this.x, this.feetY + half.y, PLAYER_Z);
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
  get isFlying(): boolean {
    return this.flying;
  }
  get feet(): number {
    return this.feetY;
  }
  get verticalVelocity(): number {
    return this.vy;
  }
  get posX(): number {
    return this.x;
  }
}

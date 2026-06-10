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
import { CHARACTERS, getCharacter } from '../data/characters';
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
  /** Lane-change speed multiplier (섀도우 닌자 ability). */
  private laneSpeedMult = 1;
  /** Reduced-gravity flag (우주인 ability): higher, floatier jumps. */
  private lowGravity = false;
  /** When flying (jetpack/rocket) gravity is suspended and Y is driven outside. */
  private flying = false;

  private squashTimer = 0;
  private shieldOn = false;
  private readonly magnetAura: THREE.Mesh;
  private readonly shieldBubble: THREE.Mesh;
  private readonly starAura: THREE.Mesh;
  private starOn = false;
  private surfOn = false;
  private surfPhase = 0;
  private readonly hoverboard: THREE.Group;
  private surfboard!: THREE.Group;

  private sliding = false;
  private slideTimer = 0;

  private readonly center = new THREE.Vector3();
  private readonly size = new THREE.Vector3();

  constructor() {
    this.rig = new Character(CHARACTERS[0].colors);
    this.group.add(this.rig.group);

    // Magnet aura — translucent blue field, spins while active.
    this.magnetAura = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 18, 12),
      new THREE.MeshBasicMaterial({
        color: 0x55aaff, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.magnetAura.visible = false;
    this.group.add(this.magnetAura);

    // Shield bubble — green protective sphere (hoverboard active).
    this.shieldBubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 18, 12),
      new THREE.MeshBasicMaterial({
        color: 0x6bffb0, transparent: true, opacity: 0.18,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.shieldBubble.visible = false;
    this.group.add(this.shieldBubble);

    // Star aura — golden invincibility glow.
    this.starAura = new THREE.Mesh(
      new THREE.SphereGeometry(1.3, 18, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffe06b, transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.starAura.visible = false;
    this.group.add(this.starAura);

    // Hoverboard under the feet while the shield is deployed.
    this.hoverboard = new THREE.Group();
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.08, 1.9),
      new THREE.MeshStandardMaterial({
        color: 0x55c8ff, emissive: 0x2a88cc, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.4,
      }),
    );
    this.hoverboard.add(deck);
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.04, 1.5),
      new THREE.MeshBasicMaterial({
        color: 0x9adfff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    glow.position.y = -0.08;
    this.hoverboard.add(glow);
    this.hoverboard.position.y = -PLAYER_HALF_STANDING.y + 0.06;
    this.hoverboard.visible = false;
    this.group.add(this.hoverboard);

    // Surfboard — a curvy deck the player rides while gently hovering & swaying.
    this.surfboard = new THREE.Group();
    const board = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.34, 1.5, 4, 10),
      new THREE.MeshStandardMaterial({
        color: 0x3ad1ff, emissive: 0x1a7fb0, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.2,
      }),
    );
    board.rotation.x = Math.PI / 2;
    board.scale.set(1, 1, 0.45); // flatten into a board
    this.surfboard.add(board);
    const fin = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.3, 4),
      new THREE.MeshStandardMaterial({ color: 0xffd0a0, roughness: 0.5 }),
    );
    fin.position.set(0, -0.16, -0.7);
    this.surfboard.add(fin);
    this.surfboard.position.y = -PLAYER_HALF_STANDING.y + 0.12;
    this.surfboard.visible = false;
    this.group.add(this.surfboard);

    this.reset();
  }

  /** Toggle power-up visuals (called each frame from the game). */
  setEffects(magnet: boolean, shield: boolean, star = false, surf = false): void {
    this.magnetAura.visible = magnet;
    this.shieldOn = shield;
    this.starOn = star;
    this.starAura.visible = star;
    this.surfOn = surf;
    this.surfboard.visible = surf;
  }

  /** Swap in a different character look without touching the physics. */
  applyCharacterId(id: string): void {
    this.group.remove(this.rig.group);
    this.rig.dispose();
    this.rig = new Character(getCharacter(id).colors);
    this.group.add(this.rig.group);
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
    this.squashTimer = 0;
    this.shieldOn = false;
    this.starOn = false;
    this.surfOn = false;
    this.magnetAura.visible = false;
    this.shieldBubble.visible = false;
    this.starAura.visible = false;
    this.hoverboard.visible = false;
    this.surfboard.visible = false;
    this.rig.group.scale.set(1, 1, 1);
    this.rig.group.rotation.set(0, 0, 0);
    this.rig.group.position.y = 0;
    this.rig.group.visible = true; // un-hide after a death explosion
    this.group.position.set(0, PLAYER_HALF_STANDING.y, PLAYER_Z);
    this.updateAABB();
  }

  /** Hide the rig for the death explosion (debris carries the moment). */
  explode(): void {
    this.rig.group.visible = false;
    this.magnetAura.visible = false;
    this.shieldBubble.visible = false;
    this.starAura.visible = false;
    this.hoverboard.visible = false;
    this.surfboard.visible = false;
  }

  moveLeft(): void {
    this.currentLane = Math.max(-1, this.currentLane - 1);
  }

  moveRight(): void {
    this.currentLane = Math.min(1, this.currentLane + 1);
  }

  jump(): void {
    if (this.flying || !this.grounded) return; // single jump only
    const low = this.lowGravity ? 1.18 : 1;
    this.vy = JUMP_VELOCITY * this.jumpMult * low;
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
    // Light vertical squash; the Character's baseball-slide lean does the rest.
    this.rig.group.scale.set(1.05, 0.78, 1.05);
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
  setLaneSpeedMult(m: number): void {
    this.laneSpeedMult = m;
  }
  setLowGravity(on: boolean): void {
    this.lowGravity = on;
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
    const t = 1 - Math.exp(-LANE_LERP * this.laneSpeedMult * dt);
    this.x += (targetX - this.x) * t;

    const wasAirborne = !this.grounded;
    if (!this.flying) {
      // Vertical gravity integration resolving to the current support height.
      this.vy -= GRAVITY * (this.lowGravity ? 0.72 : 1) * dt;
      this.feetY += this.vy * dt;
      if (this.feetY <= this.groundY) {
        this.feetY = this.groundY;
        this.vy = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
    }
    // Landing → brief squash for impact feel.
    if (wasAirborne && this.grounded && !this.sliding) this.squashTimer = 0.18;

    // Slide timeout.
    if (this.sliding) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) this.endSlide();
    }

    const half = this.sliding ? PLAYER_HALF_SLIDING : PLAYER_HALF_STANDING;
    this.group.position.set(this.x, this.feetY + half.y, PLAYER_Z);
    this.updateAABB();

    // Juice: landing squash & lean into lane changes (visual only).
    if (!this.sliding) {
      if (this.squashTimer > 0) {
        this.squashTimer -= dt;
        const k = Math.max(0, this.squashTimer / 0.18);
        this.rig.group.scale.set(1 + 0.18 * k, 1 - 0.24 * k, 1 + 0.18 * k);
      } else {
        this.rig.group.scale.set(1, 1, 1);
      }
    }
    this.rig.group.rotation.z = (this.x - targetX) * 0.14;

    // Power-up visuals follow their states.
    if (this.magnetAura.visible) this.magnetAura.rotation.y += dt * 2.2;
    this.hoverboard.visible = this.shieldOn;
    this.shieldBubble.visible = this.shieldOn;
    if (this.starOn) {
      this.starAura.rotation.y += dt * 4;
      const pulse = 1 + Math.sin(this.starAura.rotation.y * 3) * 0.08;
      this.starAura.scale.setScalar(pulse);
    }

    // Surfboard: float the rig up a touch and sway it side-to-side gently.
    if (this.surfOn) {
      this.surfPhase += dt * 2.2;
      const lift = 0.18 + Math.sin(this.surfPhase) * 0.07;
      const sway = Math.sin(this.surfPhase * 0.8) * 0.12;
      this.rig.group.position.y = lift;
      this.rig.group.rotation.z = (this.x - targetX) * 0.14 + sway;
      this.surfboard.position.y = -PLAYER_HALF_STANDING.y + 0.12 + Math.sin(this.surfPhase) * 0.05;
      this.surfboard.rotation.z = sway;
    } else if (this.rig.group.position.y !== 0) {
      this.rig.group.position.y = 0;
    }

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

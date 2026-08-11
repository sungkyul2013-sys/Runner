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
import type { BoardColors } from '../data/boards';
import { CHARACTERS, type CharColors } from '../data/characters';
import { Character, type Pose } from './Character';

/** Z position the player is anchored at; the world scrolls past in +Z. */
export const PLAYER_Z = 0;

/**
 * The runner. Three motion channels: a lateral lane lerp, vertical motion under
 * gravity that resolves onto a settable {@link setGroundY support height} (so
 * carriage roofs and ramp slopes just work), and a timed roll that shrinks the
 * collision box. Exposes a live AABB plus feet height and vertical velocity so
 * the collision pass can tell "landed on a roof" from "slammed into a cab".
 *
 * On top of the physics it owns the visual state machine: the character rig,
 * the hoverboard deck with its thruster glow, the jetpack with twin flames, the
 * magnet field, and the stumble / caught animations.
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
  private groundY = 0;
  private jumpMult = 1;
  private laneSpeedMult = 1;
  private lowGravity = false;
  private flying = false;

  private squashTimer = 0;
  private stumbleTimer = 0;
  private caughtTime = 0;

  /** World-space blob shadow — parented to the scene, not to the runner. */
  readonly shadow: THREE.Mesh;
  private readonly magnetField: THREE.Mesh;
  private readonly board: THREE.Group;
  private readonly boardDeck: THREE.Mesh;
  private readonly boardGlow: THREE.Mesh;
  private readonly jetpack: THREE.Group;
  private readonly flames: THREE.Mesh[] = [];
  private boarding = false;
  private jetOn = false;
  private boardPhase = 0;

  private sliding = false;
  private slideTimer = 0;

  private readonly center = new THREE.Vector3();
  private readonly size = new THREE.Vector3();

  constructor() {
    this.rig = new Character(CHARACTERS[0].colors);
    this.group.add(this.rig.group);

    // ── Contact shadow: lives in world space under the runner, shrinking and
    //    fading with altitude so a jump reads as height, not just a rise. ──
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 22),
      new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 1;

    // ── Coin-magnet field: a soft additive shell that spins while active ──
    this.magnetField = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 20, 14),
      new THREE.MeshBasicMaterial({
        color: 0x3fa9f5, transparent: true, opacity: 0.14,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.magnetField.visible = false;
    this.group.add(this.magnetField);

    // ── Hoverboard: deck, kicked nose/tail, underglow, four thruster pods ──
    this.board = new THREE.Group();
    this.boardDeck = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 0.11, 2.2),
      new THREE.MeshStandardMaterial({
        color: 0x3fa9f5, emissive: 0x1c6fa8, emissiveIntensity: 0.5,
        roughness: 0.28, metalness: 0.5,
      }),
    );
    this.board.add(this.boardDeck);
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xf0f3f7, emissive: 0xf0f3f7, emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.4,
    });
    for (const sz of [-1.06, 1.06]) {
      const kick = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.34), trimMat);
      kick.position.set(0, 0.06, sz);
      kick.rotation.x = sz > 0 ? -0.5 : 0.5;
      this.board.add(kick);
    }
    this.boardGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 2.3),
      new THREE.MeshBasicMaterial({
        color: 0x9adfff, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.boardGlow.rotation.x = -Math.PI / 2;
    this.boardGlow.position.y = -0.16;
    this.board.add(this.boardGlow);
    const podMat = new THREE.MeshBasicMaterial({ color: 0x9adfff });
    for (const sx of [-0.34, 0.34]) {
      for (const sz of [-0.78, 0.78]) {
        const pod = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), podMat);
        pod.position.set(sx, -0.08, sz);
        this.board.add(pod);
      }
    }
    this.board.position.y = -PLAYER_HALF_STANDING.y + 0.1;
    this.board.visible = false;
    this.group.add(this.board);

    // ── Jetpack: twin tanks on the back with animated flames ──
    this.jetpack = new THREE.Group();
    const tankMat = new THREE.MeshStandardMaterial({
      color: 0xd8dde4, roughness: 0.35, metalness: 0.7,
    });
    for (const sx of [-0.24, 0.24]) {
      const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.5, 4, 10), tankMat);
      tank.position.set(sx, 0.35, -0.36);
      this.jetpack.add(tank);
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.14, 0.7, 10),
        new THREE.MeshBasicMaterial({
          color: 0xffb03a, transparent: true, opacity: 0.92,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      flame.rotation.x = Math.PI;
      flame.position.set(sx, -0.2, -0.36);
      this.jetpack.add(flame);
      this.flames.push(flame);
    }
    this.jetpack.visible = false;
    this.group.add(this.jetpack);

    this.reset();
  }

  // ── Visual state pushed in by systems ────────────────────────────────────
  /** Toggle the magnet field and jetpack visuals (called each frame). */
  setEffects(magnet: boolean, jetpack: boolean): void {
    this.magnetField.visible = magnet;
    this.jetOn = jetpack;
    this.jetpack.visible = jetpack;
  }

  setBoarding(on: boolean): void {
    this.boarding = on;
    this.board.visible = on;
  }

  /** Re-skin the hoverboard to the equipped deck. */
  setBoardColors(c: BoardColors): void {
    const deck = this.boardDeck.material as THREE.MeshStandardMaterial;
    deck.color.setHex(c.deck);
    deck.emissive.setHex(c.deck);
    (this.boardGlow.material as THREE.MeshBasicMaterial).color.setHex(c.glow);
  }

  /** Swap in a different look (character + outfit) without touching physics. */
  applyLook(colors: CharColors): void {
    this.group.remove(this.rig.group);
    this.rig.dispose();
    this.rig = new Character(colors);
    this.group.add(this.rig.group);
  }

  setAnimSpeed(s: number): void {
    this.animSpeed = s;
  }

  /** Seconds of the menu walk-out entrance before the pose cycle begins. */
  private static readonly ENTRANCE = 2.0;

  /** Menu hero: the runner jogs in from down the yard, then poses. */
  menuShowcase(dt: number, elapsed: number): void {
    this.rig.group.visible = true;
    this.rig.group.scale.set(1, 1, 1);
    this.rig.group.rotation.z = 0;
    this.board.visible = false;
    this.jetpack.visible = false;
    this.magnetField.visible = false;
    const E = Player.ENTRANCE;
    if (elapsed < E) {
      const k = elapsed / E;
      const z = -18 * (1 - k) * (1 - k);
      this.group.position.set(0, PLAYER_HALF_STANDING.y, z);
      this.rig.update(dt, 'run', 1.4);
    } else {
      this.group.position.set(0, PLAYER_HALF_STANDING.y, PLAYER_Z);
      this.rig.showcase(dt, elapsed - E);
    }
    this.shadow.visible = true;
    this.shadow.position.set(this.group.position.x, 0.035, this.group.position.z);
    this.shadow.scale.setScalar(1);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.34;
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
    this.stumbleTimer = 0;
    this.caughtTime = 0;
    this.boarding = false;
    this.jetOn = false;
    this.magnetField.visible = false;
    this.board.visible = false;
    this.jetpack.visible = false;
    this.rig.group.scale.set(1, 1, 1);
    this.rig.group.rotation.set(0, 0, 0);
    this.rig.group.position.y = 0;
    this.rig.group.visible = true;
    this.group.position.set(0, PLAYER_HALF_STANDING.y, PLAYER_Z);
    this.updateAABB();
  }

  /** Hide the rig (the crash debris carries the moment). */
  hide(): void {
    this.rig.group.visible = false;
    this.shadow.visible = false;
    this.magnetField.visible = false;
    this.board.visible = false;
    this.jetpack.visible = false;
  }

  /** Caught by the inspector — flail while being lifted off the ballast. */
  caughtStep(dt: number): void {
    this.caughtTime += dt;
    this.rig.group.visible = true;
    this.rig.caught(dt, this.caughtTime);
    const lift = Math.min(0.55, this.caughtTime * 1.1);
    this.group.position.set(this.x, PLAYER_HALF_STANDING.y + lift, PLAYER_Z + this.caughtTime * 1.4);
    this.rig.group.rotation.z = Math.sin(this.caughtTime * 9) * 0.08;
  }

  /** Begin the new-record celebration: stand the rig up, centred and visible. */
  celebrate(): void {
    this.rig.group.visible = true;
    this.rig.group.scale.set(1, 1, 1);
    this.rig.group.rotation.set(0, 0, 0);
    this.currentLane = 0;
    this.x = 0;
    this.feetY = 0;
    this.vy = 0;
    this.grounded = true;
    this.celebrateZ = PLAYER_Z;
    this.celebratePhase = 0;
  }

  /** Per-frame victory dash toward the camera exit. */
  celebrateStep(dt: number): void {
    this.celebratePhase += dt;
    this.celebrateZ -= dt * 10;
    const hop = Math.abs(Math.sin(this.celebratePhase * 6)) * 0.38;
    this.group.position.set(0, PLAYER_HALF_STANDING.y + hop, this.celebrateZ);
    this.rig.update(dt, 'run', 2.4);
    this.rig.cheerArms(dt);
  }

  private celebrateZ = 0;
  private celebratePhase = 0;

  // ── Input ────────────────────────────────────────────────────────────────
  moveLeft(): boolean {
    if (this.currentLane <= -1) return false;
    this.currentLane--;
    return true;
  }

  moveRight(): boolean {
    if (this.currentLane >= 1) return false;
    this.currentLane++;
    return true;
  }

  jump(): boolean {
    if (this.flying || !this.grounded) return false;
    const low = this.lowGravity ? 1.16 : 1;
    this.vy = JUMP_VELOCITY * this.jumpMult * low;
    this.grounded = false;
    this.endSlide();
    return true;
  }

  slide(): boolean {
    if (this.flying || this.sliding) return false;
    // Rolling from mid-air slams you down for a fast duck.
    if (!this.grounded) this.vy = -JUMP_VELOCITY * 1.1;
    this.sliding = true;
    this.slideTimer = SLIDE_DURATION;
    return true;
  }

  private endSlide(): void {
    if (!this.sliding) return;
    this.sliding = false;
    this.slideTimer = 0;
  }

  /** Trip over something: pitch forward and lose composure for a moment. */
  stumble(seconds: number): void {
    this.stumbleTimer = seconds;
    this.endSlide();
    this.squashTimer = 0;
  }

  get isStumbling(): boolean {
    return this.stumbleTimer > 0;
  }

  // ── State pushed in by systems ───────────────────────────────────────────
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
    if (this.stumbleTimer > 0) this.stumbleTimer -= dt;

    // Lateral lerp toward the active lane (frame-rate independent).
    const targetX = laneToX(this.currentLane);
    const t = 1 - Math.exp(-LANE_LERP * this.laneSpeedMult * dt);
    this.x += (targetX - this.x) * t;

    const wasAirborne = !this.grounded;
    if (!this.flying) {
      this.vy -= GRAVITY * (this.lowGravity ? 0.74 : 1) * dt;
      this.feetY += this.vy * dt;
      if (this.feetY <= this.groundY) {
        this.feetY = this.groundY;
        this.vy = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
    }
    if (wasAirborne && this.grounded && !this.sliding) this.squashTimer = 0.18;

    if (this.sliding) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) this.endSlide();
    }

    const half = this.sliding ? PLAYER_HALF_SLIDING : PLAYER_HALF_STANDING;
    this.group.position.set(this.x, this.feetY + half.y, PLAYER_Z);
    this.updateAABB();
    this.updateShadow();

    // Landing squash + lean into lane changes (visual only).
    if (!this.sliding) {
      if (this.squashTimer > 0) {
        this.squashTimer -= dt;
        const k = Math.max(0, this.squashTimer / 0.18);
        this.rig.group.scale.set(1 + 0.16 * k, 1 - 0.22 * k, 1 + 0.16 * k);
      } else {
        this.rig.group.scale.set(1, 1, 1);
      }
    } else {
      this.rig.group.scale.set(1, 1, 1);
    }
    const bank = (this.x - targetX) * 0.16;
    this.rig.group.rotation.z = bank;

    // Effect visuals.
    if (this.magnetField.visible) {
      this.magnetField.rotation.y += dt * 2.4;
      this.magnetField.scale.setScalar(1 + Math.sin(performance.now() * 0.004) * 0.05);
    }
    if (this.jetOn) {
      for (let i = 0; i < this.flames.length; i++) {
        const f = this.flames[i];
        const k = 0.7 + Math.random() * 0.7;
        f.scale.set(1, k, 1);
        (f.material as THREE.MeshBasicMaterial).opacity = 0.75 + Math.random() * 0.25;
      }
    }
    if (this.boarding) {
      this.boardPhase += dt * 2.6;
      const lift = 0.16 + Math.sin(this.boardPhase) * 0.05;
      this.rig.group.position.y = lift;
      this.board.position.y = -PLAYER_HALF_STANDING.y + 0.1 + Math.sin(this.boardPhase) * 0.04;
      this.board.rotation.z = bank * 1.6;
      this.board.rotation.x = Math.sin(this.boardPhase * 0.6) * 0.05;
    } else if (this.rig.group.position.y !== 0) {
      this.rig.group.position.y = 0;
    }

    // Drive the character animation from the current motion state.
    const pose: Pose =
      this.stumbleTimer > 0 ? 'stumble'
        : this.flying ? 'fly'
          : !this.grounded ? 'air'
            : this.sliding ? 'slide'
              : this.boarding ? 'surf'
                : 'run';
    this.rig.update(dt, pose, this.animSpeed);
  }

  /**
   * Park the blob shadow on whatever surface is under the runner and shrink /
   * fade it with altitude. Capped so a jetpack high above the yard still leaves
   * a faint mark rather than vanishing outright.
   */
  private updateShadow(): void {
    const air = Math.max(0, this.feetY - this.groundY);
    const k = Math.max(0.28, 1 - air / 5);
    this.shadow.position.set(this.x, this.groundY + 0.035, PLAYER_Z);
    this.shadow.scale.setScalar(k);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.34 * k;
    this.shadow.visible = this.rig.group.visible;
  }

  /** Directly set the player's feet height (jetpack flight control). */
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

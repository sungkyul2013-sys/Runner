import * as THREE from 'three';
import { RECYCLE_BEHIND } from '../config/constants';
import {
  BOARD_INVULN,
  DOUBLE_MULT,
  FLIGHT_MAGNET_RADIUS,
  JETPACK_ALTITUDE,
  JETPACK_SPEED_BOOST,
  MAGNET_RADIUS,
  POWERUPS,
  PowerupType,
  SNEAKERS_JUMP_MULT,
} from '../config/powerups';
import type { BoardAbility } from '../data/boards';
import { Player, PLAYER_Z } from '../player/Player';
import { ObjectPool } from '../world/ObjectPool';
import { Pickup } from '../world/Pickup';

const PICKUP_RADIUS = 1.25;
/** Radius the token-magnet perk drags letters and boxes in from. */
const TOKEN_MAGNET_RADIUS = 6.5;

interface ActiveEffect {
  remaining: number;
  total: number;
}

/** A live timed effect, for the HUD to draw a countdown ring. */
export interface EffectView {
  type: PowerupType;
  frac: number;
  remaining: number;
}

/**
 * Owns everything you can pick up and everything it does to you: the four timed
 * power-ups, spare hoverboard charges, keys, coin bags, mystery boxes and word
 * letters. It also runs the **hoverboard** itself — a timed ride that shrugs off
 * a crash (twice, on the Phantom deck) — and jetpack flight. The game reads its
 * query methods every frame for magnet radius, score multiplier, jump height,
 * world speed and invulnerability.
 */
export class PickupSystem {
  readonly group = new THREE.Group();

  private readonly pool: ObjectPool<Pickup>;
  private active: Pickup[] = [];

  private readonly effects = new Map<PowerupType, ActiveEffect>();

  // ── Hoverboard state ──
  private boardCharges = 0;
  private boardTimer = 0;
  private boardTotal = 0;
  private absorbsLeft = 0;
  private board: BoardAbility = {};
  private boardSeconds = 30;

  private invulnTimer = 0;
  private flightY = 0;
  private wasFlying = false;

  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly onCollect: (type: PowerupType, letter?: string) => void,
    /** Shop-upgraded duration for a timed power-up. */
    private readonly durationFor: (t: PowerupType) => number = (t) => POWERUPS[t].duration,
  ) {
    this.pool = new ObjectPool<Pickup>(
      () => {
        const p = new Pickup();
        this.group.add(p.mesh);
        return p;
      },
      (p) => p.reset(),
    );
  }

  /** Equip the selected board's perks and total ride time for this run. */
  setBoard(ability: BoardAbility, seconds: number): void {
    this.board = ability;
    this.boardSeconds = seconds;
  }

  /** Drop a token onto the rails (the game routes these along the coin line). */
  place(type: PowerupType, x: number, y: number, z: number, letter?: string): void {
    const p = this.pool.acquire();
    p.configure(type, x, y, z, letter);
    this.active.push(p);
  }

  /** Perk: letters and boxes drift toward the player. */
  tokenMagnet = false;

  // ── Per-frame ─────────────────────────────────────────────────────────────
  update(scroll: number, dt: number, player: Player): void {
    this.moveAndCollect(scroll, dt, player);
    this.tickEffects(dt);
    this.applyToPlayer(player, dt);
  }

  private moveAndCollect(scroll: number, dt: number, player: Player): void {
    const recycleZ = PLAYER_Z + RECYCLE_BEHIND;
    const py = player.feet + 0.9;
    this.tmp.set(player.posX, py, PLAYER_Z);

    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.update(scroll, dt);
      if (this.tokenMagnet && !p.collected) {
        const d = p.position.distanceTo(this.tmp);
        if (d < TOKEN_MAGNET_RADIUS) p.pull(player.posX, py, PLAYER_Z, 1 - Math.exp(-6 * dt));
      }
      if (!p.collected && p.position.distanceTo(this.tmp) < PICKUP_RADIUS) {
        p.collected = true;
        const { type, letter } = p;
        this.release(i);
        this.activate(type);
        this.onCollect(type, letter);
        continue;
      }
      if (p.z > recycleZ) this.release(i);
    }
  }

  private tickEffects(dt: number): void {
    for (const [type, e] of this.effects) {
      e.remaining -= dt;
      if (e.remaining <= 0) this.effects.delete(type);
    }
    if (this.boardTimer > 0) {
      this.boardTimer -= dt;
      if (this.boardTimer <= 0) {
        this.boardTimer = 0;
        this.absorbsLeft = 0;
      }
    }
    if (this.invulnTimer > 0) this.invulnTimer -= dt;
  }

  private applyToPlayer(player: Player, dt: number): void {
    player.setJumpMult(this.jumpMult());
    player.setBoarding(this.isBoarding());

    const flying = this.isFlying();
    if (flying) {
      const t = 1 - Math.exp(-5.5 * dt);
      this.flightY += (JETPACK_ALTITUDE - this.flightY) * t;
      player.setFlying(true);
      player.setFeetY(this.flightY);
    } else if (this.wasFlying) {
      player.setFlying(false);
      this.flightY = 0;
    }
    this.wasFlying = flying;
  }

  // ── Activation ──────────────────────────────────────────────────────────
  private activate(type: PowerupType): void {
    switch (type) {
      case PowerupType.BOARD:
        this.boardCharges++;
        break;
      case PowerupType.COINBAG:
      case PowerupType.KEY:
      case PowerupType.MYSTERY:
      case PowerupType.LETTER:
        break; // instant rewards resolved by the game
      default: {
        const total = this.durationFor(type);
        this.effects.set(type, { remaining: total, total });
      }
    }
  }

  /** Trigger an effect directly (mystery-box rewards, consumables). */
  trigger(type: PowerupType): void {
    this.activate(type);
  }

  /** Grant hoverboard charges (shop consumable / character perk). */
  addBoards(n: number): void {
    this.boardCharges += n;
  }

  /** Double-tap → ride a hoverboard if one is charged and none is active. */
  deployBoard(): boolean {
    if (this.boardTimer > 0 || this.boardCharges <= 0) return false;
    this.boardCharges--;
    this.boardTotal = this.boardSeconds + (this.board.extraTime ?? 0);
    this.boardTimer = this.boardTotal;
    this.absorbsLeft = this.board.doubleAbsorb ? 2 : 1;
    return true;
  }

  /** Grant a window of invulnerability (revive, board save). */
  grantInvuln(seconds: number): void {
    this.invulnTimer = Math.max(this.invulnTimer, seconds);
  }

  /**
   * Consume a board absorb to survive a hit. Returns true when the board ate
   * it — the board shatters unless it is a double-absorb deck with charge left.
   */
  tryAbsorb(): boolean {
    if (this.boardTimer <= 0 || this.absorbsLeft <= 0) return false;
    this.absorbsLeft--;
    this.invulnTimer = BOARD_INVULN;
    if (this.absorbsLeft <= 0) this.boardTimer = 0;
    return true;
  }

  // ── Queries the game reads each frame ─────────────────────────────────────
  isFlying(): boolean {
    return this.effects.has(PowerupType.JETPACK);
  }
  /** 0..1 progress of the active jetpack burn (camera lift easing). */
  jetpackProgress(): number {
    const e = this.effects.get(PowerupType.JETPACK);
    return e ? 1 - e.remaining / e.total : 0;
  }
  isInvulnerable(): boolean {
    return this.isFlying() || this.invulnTimer > 0;
  }
  isBoarding(): boolean {
    return this.boardTimer > 0;
  }
  boardFraction(): number {
    return this.boardTotal > 0 ? Math.max(0, this.boardTimer / this.boardTotal) : 0;
  }
  get charges(): number {
    return this.boardCharges;
  }
  /** The board's auto-hop perk is live (small hurdles are shrugged off). */
  autoHops(): boolean {
    return this.isBoarding() && this.board.autoHop === true;
  }
  magnetRadius(): number {
    if (this.isFlying()) return FLIGHT_MAGNET_RADIUS;
    if (this.effects.has(PowerupType.MAGNET)) return MAGNET_RADIUS;
    if (this.isBoarding() && this.board.magnet) return MAGNET_RADIUS * 0.85;
    return 0;
  }
  scoreMultiplier(): number {
    return this.effects.has(PowerupType.DOUBLE) ? DOUBLE_MULT : 1;
  }
  coinMultiplier(): number {
    return this.isBoarding() ? (this.board.coinMult ?? 1) : 1;
  }
  jumpMult(): number {
    let m = 1;
    if (this.effects.has(PowerupType.SNEAKERS)) m *= SNEAKERS_JUMP_MULT;
    if (this.isBoarding() && this.board.jumpMult) m *= this.board.jumpMult;
    return m;
  }
  speedBoost(): number {
    let m = 1;
    if (this.effects.has(PowerupType.JETPACK)) m *= JETPACK_SPEED_BOOST;
    if (this.isBoarding() && this.board.speedMult) m *= this.board.speedMult;
    return m;
  }
  /** Live timed effects for the HUD. */
  effectViews(): EffectView[] {
    const out: EffectView[] = [];
    for (const [type, e] of this.effects) {
      out.push({ type, frac: e.remaining / e.total, remaining: e.remaining });
    }
    return out;
  }

  private release(i: number): void {
    this.pool.release(this.active[i]);
    const last = this.active.length - 1;
    this.active[i] = this.active[last];
    this.active.pop();
  }

  reset(): void {
    for (const p of this.active) this.pool.release(p);
    this.active = [];
    this.effects.clear();
    this.boardCharges = 0;
    this.boardTimer = 0;
    this.boardTotal = 0;
    this.absorbsLeft = 0;
    this.invulnTimer = 0;
    this.flightY = 0;
    this.wasFlying = false;
  }
}

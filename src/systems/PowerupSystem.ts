import * as THREE from 'three';
import {
  laneToX,
  LANES,
  RECYCLE_BEHIND,
  SEGMENT_LENGTH,
} from '../config/constants';
import {
  BOMB_RANGE,
  FLIGHT_MAGNET_RADIUS,
  JETPACK_ALTITUDE,
  MAGNET_RADIUS,
  POWERUPS,
  PowerupType,
  ROCKET_ALTITUDE,
  ROCKET_SPEED_BOOST,
  SHIELD_INVULN,
  SNEAKERS_JUMP_MULT,
  SPAWNABLE,
} from '../config/powerups';
import { Player, PLAYER_Z } from '../player/Player';
import { ObjectPool } from '../world/ObjectPool';
import { Pickup } from '../world/Pickup';

const PICKUP_RADIUS = 1.1;
const TOKEN_Y = 1.3;
/** Z travelled between power-up token spawns (sparse). */
const SPAWN_GAP = SEGMENT_LENGTH * 2.4;

interface ActiveEffect {
  remaining: number;
  total: number;
}

/**
 * Owns every power-up: spawns collectible tokens, tracks active timed effects,
 * the deployable hoverboard shield, flight (jetpack/rocket) and the instant
 * bomb. Exposes query methods the game reads each frame (magnet radius, score
 * multiplier, jump multiplier, speed boost, invulnerability) and renders the
 * HUD timer rings.
 */
export class PowerupSystem {
  readonly group = new THREE.Group();

  private readonly pool: ObjectPool<Pickup>;
  private active: Pickup[] = [];
  private nextSpawnZ = -SEGMENT_LENGTH * 3;

  private readonly effects = new Map<PowerupType, ActiveEffect>();
  private hoverCharges = 0;
  private shieldActive = false;
  private invulnTimer = 0;
  private flightY = 0;
  private wasFlying = false;

  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly hudContainer: HTMLElement,
    private readonly onBomb: (range: number) => void,
    private readonly onActivate: (type: PowerupType) => void = () => {},
    /** Phase 6 shop hook: scale a power-up's duration. */
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
    this.fillAhead();
  }

  // ── Per-frame ─────────────────────────────────────────────────────────────
  update(scroll: number, dt: number, player: Player): void {
    this.moveAndCollect(scroll, dt, player);
    this.tickEffects(dt);
    this.applyToPlayer(player, dt);
    this.renderRings();
  }

  private moveAndCollect(scroll: number, dt: number, player: Player): void {
    this.nextSpawnZ += scroll;
    const recycleZ = PLAYER_Z + RECYCLE_BEHIND;
    this.tmp.set(player.posX, player.feet + 0.85, PLAYER_Z);

    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.update(scroll, dt);
      if (!p.collected && p.position.distanceTo(this.tmp) < PICKUP_RADIUS) {
        p.collected = true;
        this.activate(p.type);
        this.release(i);
        continue;
      }
      if (p.z > recycleZ) this.release(i);
    }
    this.fillAhead();
  }

  private tickEffects(dt: number): void {
    for (const [type, e] of this.effects) {
      e.remaining -= dt;
      if (e.remaining <= 0) this.effects.delete(type);
    }
    if (this.shieldActive) {
      const e = this.effects.get(PowerupType.HOVERBOARD);
      if (!e) this.shieldActive = false; // duration ran out
    }
    if (this.invulnTimer > 0) this.invulnTimer -= dt;
  }

  private applyToPlayer(player: Player, dt: number): void {
    player.setJumpMult(this.jumpMult());

    const flying = this.isFlying();
    if (flying) {
      const target = this.effects.has(PowerupType.ROCKET)
        ? ROCKET_ALTITUDE
        : JETPACK_ALTITUDE;
      const t = 1 - Math.exp(-6 * dt);
      this.flightY += (target - this.flightY) * t;
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
      case PowerupType.BOMB:
        this.onBomb(BOMB_RANGE);
        break;
      case PowerupType.HOVERBOARD:
        this.hoverCharges++;
        break;
      default: {
        const total = this.durationFor(type);
        this.effects.set(type, { remaining: total, total });
        if (type === PowerupType.ROCKET || type === PowerupType.JETPACK) {
          // start flight from the player's current height handled by lerp
        }
      }
    }
    this.onActivate(type);
  }

  /** Trigger a power-up directly (consumable items: rocket, bomb). */
  trigger(type: PowerupType): void {
    this.activate(type);
  }

  /** Double-tap → deploy a hoverboard shield if one is owned and none active. */
  deploy(): void {
    if (this.shieldActive || this.hoverCharges <= 0) return;
    this.hoverCharges--;
    this.shieldActive = true;
    const total = this.durationFor(PowerupType.HOVERBOARD);
    this.effects.set(PowerupType.HOVERBOARD, { remaining: total, total });
    this.onActivate(PowerupType.HOVERBOARD);
  }

  /** Grant a window of invulnerability (used by Revive). */
  grantInvuln(seconds: number): void {
    this.invulnTimer = Math.max(this.invulnTimer, seconds);
  }

  /** Consume the shield to survive a hit. Returns true if a hit was absorbed. */
  tryAbsorb(): boolean {
    if (!this.shieldActive) return false;
    this.shieldActive = false;
    this.effects.delete(PowerupType.HOVERBOARD);
    this.invulnTimer = SHIELD_INVULN;
    return true;
  }

  // ── Queries the game reads each frame ─────────────────────────────────────
  isFlying(): boolean {
    return this.effects.has(PowerupType.JETPACK) || this.effects.has(PowerupType.ROCKET);
  }
  isInvulnerable(): boolean {
    return this.isFlying() || this.invulnTimer > 0;
  }
  magnetRadius(): number {
    if (this.isFlying()) return FLIGHT_MAGNET_RADIUS;
    return this.effects.has(PowerupType.MAGNET) ? MAGNET_RADIUS : 0;
  }
  scoreMultiplier(): number {
    return this.effects.has(PowerupType.DOUBLE) ? 2 : 1;
  }
  jumpMult(): number {
    return this.effects.has(PowerupType.SNEAKERS) ? SNEAKERS_JUMP_MULT : 1;
  }
  speedBoost(): number {
    return this.effects.has(PowerupType.ROCKET) ? ROCKET_SPEED_BOOST : 1;
  }

  // ── Spawning ──────────────────────────────────────────────────────────────
  private fillAhead(): void {
    while (this.nextSpawnZ > -SEGMENT_LENGTH * 7) {
      this.spawnOne(this.nextSpawnZ);
      this.nextSpawnZ -= SPAWN_GAP;
    }
  }

  private spawnOne(z: number): void {
    const type = this.weightedType();
    const lane = LANES[(Math.random() * LANES.length) | 0];
    const p = this.pool.acquire();
    p.configure(type, laneToX(lane), TOKEN_Y, z);
    this.active.push(p);
  }

  private weightedType(): PowerupType {
    let total = 0;
    for (const t of SPAWNABLE) total += POWERUPS[t].weight;
    let r = Math.random() * total;
    for (const t of SPAWNABLE) {
      r -= POWERUPS[t].weight;
      if (r <= 0) return t;
    }
    return SPAWNABLE[0];
  }

  private release(i: number): void {
    this.pool.release(this.active[i]);
    const last = this.active.length - 1;
    this.active[i] = this.active[last];
    this.active.pop();
  }

  // ── HUD rings ─────────────────────────────────────────────────────────────
  private renderRings(): void {
    let html = '';
    for (const [type, e] of this.effects) {
      html += this.ring(type, e.remaining / e.total);
    }
    if (this.hoverCharges > 0 && !this.shieldActive) {
      html += this.badge(PowerupType.HOVERBOARD, this.hoverCharges);
    }
    this.hudContainer.innerHTML = html;
  }

  private ring(type: PowerupType, frac: number): string {
    const def = POWERUPS[type];
    const col = `#${def.color.toString(16).padStart(6, '0')}`;
    const deg = Math.max(0, Math.min(1, frac)) * 360;
    return `<div style="width:42px;height:42px;border-radius:50%;
      background:conic-gradient(${col} ${deg}deg, rgba(255,255,255,0.12) 0);
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 0 10px ${col}99">
      <div style="width:32px;height:32px;border-radius:50%;background:#05060c;
        display:flex;align-items:center;justify-content:center;font-size:16px">${def.icon}</div></div>`;
  }

  private badge(type: PowerupType, count: number): string {
    const def = POWERUPS[type];
    const col = `#${def.color.toString(16).padStart(6, '0')}`;
    return `<div style="width:42px;height:42px;border-radius:50%;border:2px solid ${col};
      display:flex;align-items:center;justify-content:center;position:relative;
      box-shadow:0 0 10px ${col}99;background:#05060c;font-size:16px">${def.icon}
      <span style="position:absolute;bottom:-4px;right:-4px;background:${col};color:#05060c;
        font:700 11px/1 monospace;border-radius:8px;padding:1px 4px">${count}</span></div>`;
  }

  reset(): void {
    for (const p of this.active) this.pool.release(p);
    this.active = [];
    this.nextSpawnZ = -SEGMENT_LENGTH * 3;
    this.effects.clear();
    this.hoverCharges = 0;
    this.shieldActive = false;
    this.invulnTimer = 0;
    this.flightY = 0;
    this.wasFlying = false;
    this.hudContainer.innerHTML = '';
  }
}

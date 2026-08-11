import * as THREE from 'three';
import {
  COLORS,
  DISTRICT_DIST,
  DISTRICTS,
  MAX_SPEED,
  MULTIPLIER_MAX,
  MULTIPLIER_STEP,
  STUMBLE_TIME,
} from '../config/constants';
import {
  COINBAG_AMOUNT,
  HUNT_WORD,
  POWERUPS,
  PowerupType,
  REVIVE_INVULN,
  SPAWNABLE,
} from '../config/powerups';
import { AudioManager } from '../audio/AudioManager';
import { BOARD_BASE_SECONDS, getBoard } from '../data/boards';
import { getCharacter } from '../data/characters';
import { getMission, type MissionMetric } from '../data/missions';
import { CHECKPOINT_DIST, getMode, type ModeDef } from '../data/modes';
import { SaveManager, type GameMode } from '../data/SaveManager';
import { UPGRADE_SECONDS } from '../data/upgrades';
import { ParticleSystem } from '../fx/ParticleSystem';
import { CoinSystem } from '../systems/CoinSystem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { PickupSystem } from '../systems/PickupSystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { HUD } from '../ui/HUD';
import { SegmentManager, type SegmentLayout } from '../world/SegmentManager';
import { tracePath } from '../world/pathing';
import { Engine } from './Engine';
import { Game } from './Game';
import { GameState } from './GameStateManager';

/** Speed multiplier while a headstart is burning. */
const HEADSTART_SPEED = 1.7;
/** Coin-combo window in seconds. */
const COMBO_WINDOW = 1.5;
/** Coins granted at a checkpoint. */
const CHECKPOINT_COINS = 40;
/** How long the catch cinematic plays before the results screen. */
const CAUGHT_TIME = 1.5;
/** One token roughly every N segments. */
const TOKEN_CHANCE = 0.55;

/** Result of the last finished run, surfaced to the results screen. */
export interface RunResult {
  mode: GameMode;
  score: number;
  coins: number;
  keys: number;
  distance: number;
  multiplier: number;
  letters: number;
  isBest: boolean;
  /** Position on the top-run board, or −1. */
  rank: number;
  /** Missions completed during this run. */
  missionsDone: string[];
  /** Mission sets cleared during this run. */
  setsCleared: number;
}

/**
 * The complete METRO SURF run: a procedurally laid train yard with rideable
 * carriage roofs, coin trails traced along the survivable line, the four timed
 * power-ups, hoverboards, word-hunt letters, keys and mystery boxes, an
 * inspector and dog closing in whenever you stumble, a distance-driven score
 * multiplier stacked with mission bonuses, checkpoints, five modes, character
 * and board perks, and the juice that ties it together (particles, shake,
 * hit-stop, combos, banners, audio).
 */
export class RunnerGame extends Game {
  private readonly segments = new SegmentManager();
  private readonly collision = new CollisionSystem();
  private readonly score = new ScoreSystem();
  private readonly coins: CoinSystem;
  private readonly pickups: PickupSystem;
  private readonly particles = new ParticleSystem();
  private readonly hud = new HUD();

  private save: SaveManager;
  private audio: AudioManager;

  // ── Loadout (character + board + upgrades) ──
  private magnetMult = 1;
  private jetpackMult = 1;
  private lowGravity = false;
  private baseStumbles = 1;
  private headstartMetres = 0;

  // ── Run state ──
  mode: GameMode = 'endless';
  private rules: ModeDef = getMode('endless');
  private district = 0;
  private nextCheckpoint = CHECKPOINT_DIST;
  private timeLeft = 0;
  private comboCount = 0;
  private comboTimer = 0;
  private wasNearMiss = false;
  private stumblesLeft = 1;
  private boosterActive = false;
  private headstartLeft = 0;
  private roofMetres = 0;
  private keysThisRun = 0;
  private lettersThisRun = 0;
  private missionsDone: string[] = [];
  private setsCleared = 0;
  private trailColor = 0xff6a4d;
  private trailTimer = 0;
  private readonly trailPos = new THREE.Vector3();
  private lastPathLane = 0;
  private metricTick = 0;

  /** While true (resume countdown) the world holds still and input is ignored. */
  private frozenStart = false;
  /** While true the catch cinematic is playing. */
  private caught = false;
  private caughtTimer = 0;
  /** While true the runner is sprinting off-screen after a new record. */
  private celebrating = false;
  private celebrateTimer = 0;
  private pendingResult: RunResult | null = null;

  private lastResult: RunResult = {
    mode: 'endless', score: 0, coins: 0, keys: 0, distance: 0, multiplier: 1,
    letters: 0, isBest: false, rank: -1, missionsDone: [], setsCleared: 0,
  };

  constructor(engine: Engine, save?: SaveManager, audio?: AudioManager) {
    super(engine, GameState.MENU);
    this.save = save ?? new SaveManager();
    this.audio = audio ?? new AudioManager(this.save.data.settings.muted);

    this.coins = new CoinSystem((pos) => this.onCoin(pos));
    this.pickups = new PickupSystem(
      (type, letter) => this.onPickup(type, letter),
      (t) => this.powerupDuration(t),
    );

    this.segments.onLayout = (layout) => this.routeSegment(layout);
    this.segments.onExpress = (lane) => this.hud.warn(lane);

    engine.add(this.segments.group);
    engine.add(this.coins.group);
    engine.add(this.pickups.group);
    engine.add(this.particles.group);
    engine.onUpdate((dt) => this.particles.update(dt)); // animate even when frozen

    this.hud.bindControls(() => this.pause(), () => this.deployBoard());

    this.state.onChange((next) => this.applyVisibility(next === GameState.PLAYING));
    this.applyVisibility(false);
    this.refreshLoadout();
    this.applySettings();
  }

  // ── Loadout ───────────────────────────────────────────────────────────────
  /** Shop-upgraded duration for a timed power-up. */
  private powerupDuration(t: PowerupType): number {
    const base = POWERUPS[t].duration;
    const id = { [PowerupType.MAGNET]: 'magnet', [PowerupType.DOUBLE]: 'double',
      [PowerupType.SNEAKERS]: 'sneakers', [PowerupType.JETPACK]: 'jetpack' } as Partial<Record<PowerupType, string>>;
    const key = id[t];
    let d = base + (key ? this.save.upgradeLevel(key) * UPGRADE_SECONDS : 0);
    if (t === PowerupType.MAGNET) d *= this.magnetMult;
    if (t === PowerupType.JETPACK) d *= this.jetpackMult;
    return d;
  }

  /** Apply the equipped character and board plus permanent upgrades. */
  refreshLoadout(): void {
    const c = getCharacter(this.save.data.selectedChar);
    const a = c.ability;
    this.magnetMult = a.magnetMult ?? 1;
    this.jetpackMult = a.jetpackMult ?? 1;
    this.lowGravity = a.lowGravity ?? false;
    this.baseStumbles = 1 + (a.extraStumble ? 1 : 0);
    this.score.scoreBonus = (a.scoreMult ?? 1) - 1;
    this.score.coinMult = a.coinMult ?? 1;
    this.headstartMetres = 200 + this.save.upgradeLevel('headstart') * 150;
    this.trailColor = c.colors.trail;
    this.player.setLaneSpeedMult(a.laneSpeedMult ?? 1);
    this.player.setLowGravity(this.lowGravity);
    this.player.applyCharacterId(c.id);
    this.pickups.tokenMagnet = a.tokenMagnet ?? false;

    const b = getBoard(this.save.data.selectedBoard);
    this.player.setBoardColors(b.colors);
    this.pickups.setBoard(b.ability, BOARD_BASE_SECONDS + this.save.upgradeLevel('boardtime') * 5);
  }

  setMode(mode: GameMode): void {
    this.mode = mode;
    this.rules = getMode(mode);
  }

  private applyVisibility(playing: boolean): void {
    this.hud.setVisible(playing);
    this.segments.group.visible = playing;
    this.coins.group.visible = playing;
    this.pickups.group.visible = playing;
  }

  // ── Queries the screen layer reads ────────────────────────────────────────
  getRunResult(): RunResult {
    return this.lastResult;
  }
  get currentScore(): number {
    return this.score.score;
  }
  get currentCoins(): number {
    return this.score.coins;
  }
  get modeRules(): ModeDef {
    return this.rules;
  }

  // ── Segment routing: coins + tokens along the survivable line ─────────────
  private routeSegment(layout: SegmentLayout): void {
    const { points, endLane } = tracePath(layout, this.lastPathLane);
    this.lastPathLane = endLane;
    const skip = this.rules.coinDensity >= 2 ? 0 : 1;
    this.coins.density = Math.min(1, this.rules.coinDensity);
    this.coins.layPath(points, layout.nearZ, skip);

    // Occasionally drop a token on the same line so it is always reachable.
    if (points.length > 4 && Math.random() < TOKEN_CHANCE) {
      const p = points[(points.length * (0.3 + Math.random() * 0.4)) | 0];
      const type = this.weightedToken();
      this.pickups.place(type, p.x, Math.max(1.2, p.y + 0.25), layout.nearZ - p.dz);
    }
    // Word-hunt letters are rarer and only appear while a letter is missing.
    const need = this.save.nextHuntLetter();
    if (need && points.length > 6 && Math.random() < 0.14) {
      const p = points[(points.length * (0.5 + Math.random() * 0.3)) | 0];
      this.pickups.place(PowerupType.LETTER, p.x, Math.max(1.3, p.y + 0.3), layout.nearZ - p.dz, need);
    }
  }

  private weightedToken(): PowerupType {
    let total = 0;
    for (const t of SPAWNABLE) total += POWERUPS[t].weight;
    let r = Math.random() * total;
    for (const t of SPAWNABLE) {
      r -= POWERUPS[t].weight;
      if (r <= 0) return t;
    }
    return SPAWNABLE[0];
  }

  // ── Pickup / coin hooks ───────────────────────────────────────────────────
  private onCoin(pos: THREE.Vector3): void {
    this.score.addCoins(1);
    this.particles.burst(pos, COLORS.coin, { count: 4, speed: 3, life: 0.45, size: 0.55 });
    this.audio.coin();
    this.comboTimer = COMBO_WINDOW;
    this.comboCount++;
    if (this.comboCount >= 8) this.hud.setCombo(this.comboCount);
    if (this.comboCount > 0 && this.comboCount % 15 === 0) {
      this.score.addBonus(this.comboCount * 2);
      this.hud.popup(`콤보 ×${this.comboCount}`, '#ffd23f');
    }
    this.bump('coins', 1);
  }

  private onPickup(type: PowerupType, letter?: string): void {
    const p = this.player.group.position;
    this.audio.power();
    this.particles.burst(p, POWERUPS[type].color, { count: 16, speed: 5, life: 0.7 });

    switch (type) {
      case PowerupType.LETTER: {
        if (!letter) break;
        this.lettersThisRun++;
        this.bump('letter', 1);
        const complete = this.save.collectLetter(letter);
        this.hud.setHunt(this.save.data.huntLetters);
        if (complete) {
          this.hud.banner(`🔤 ${HUNT_WORD} 완성!`, '🗝️ +1 · 🪙 +500', '#00e0ff');
          this.keysThisRun++;
        } else {
          this.hud.toast('🔤', `글자 <b>${letter}</b> 획득`, '#00e0ff');
        }
        break;
      }
      case PowerupType.KEY:
        this.save.addKeys(1);
        this.keysThisRun++;
        this.hud.toast('🗝️', '열쇠 +1', '#ffe066');
        break;
      case PowerupType.COINBAG: {
        const got = this.score.addCoins(COINBAG_AMOUNT);
        this.particles.burst(p, COLORS.coin, { count: 26, speed: 7, life: 0.9 });
        this.hud.popup(`🪙 +${got}`, '#ffcf3a');
        this.bump('coins', got);
        break;
      }
      case PowerupType.MYSTERY:
        this.bump('mystery', 1);
        this.openMystery();
        break;
      case PowerupType.BOARD:
        this.hud.toast('🛹', '호버보드 +1', '#8a7bff');
        break;
      case PowerupType.JETPACK:
        this.engine.shake(0.4);
        this.particles.burst(p, 0xffae5a, { count: 26, speed: 9, life: 0.8, size: 1.0 });
        this.hud.banner('🚀 제트팩', '하늘로!', '#ff7a2a');
        this.bump('jetpack', 1);
        this.bump('powerup', 1);
        break;
      default:
        this.hud.toast(POWERUPS[type].icon, POWERUPS[type].label, `#${POWERUPS[type].color.toString(16).padStart(6, '0')}`);
        this.bump('powerup', 1);
        if (type === PowerupType.MAGNET) this.bump('magnet', 1);
        if (type === PowerupType.SNEAKERS) this.bump('sneakers', 1);
        break;
    }
  }

  /** Mystery box: coins, a key, boards or a power-up, weighted toward coins. */
  private openMystery(): void {
    const roll = Math.random();
    if (roll < 0.42) {
      const got = this.score.addCoins(120 + ((Math.random() * 180) | 0));
      this.hud.banner('❓ 미스터리 박스', `🪙 +${got}`, '#ff4fd8');
      this.bump('coins', got);
    } else if (roll < 0.62) {
      this.pickups.addBoards(2);
      this.hud.banner('❓ 미스터리 박스', '🛹 호버보드 ×2', '#ff4fd8');
    } else if (roll < 0.78) {
      this.save.addKeys(1);
      this.keysThisRun++;
      this.hud.banner('❓ 미스터리 박스', '🗝️ 열쇠 +1', '#ff4fd8');
    } else {
      const t = [PowerupType.MAGNET, PowerupType.DOUBLE, PowerupType.SNEAKERS, PowerupType.JETPACK][(Math.random() * 4) | 0];
      this.pickups.trigger(t);
      this.hud.banner('❓ 미스터리 박스', `${POWERUPS[t].icon} ${POWERUPS[t].label}`, '#ff4fd8');
      this.bump('powerup', 1);
    }
  }

  // ── Missions ──────────────────────────────────────────────────────────────
  private bump(metric: MissionMetric, delta: number): void {
    this.save.addStat(metric, delta);
    this.reportMissions(this.save.bumpMission(metric, delta));
  }
  private setRunMetric(metric: MissionMetric, value: number): void {
    this.reportMissions(this.save.setRunMission(metric, value));
  }
  private reportMissions(done: string[]): void {
    for (const id of done) {
      this.missionsDone.push(id);
      const def = getMission(id);
      const slot = this.save.data.missions.find((m) => m.id === id);
      this.hud.toast(def.icon, `미션 완료! <b>${def.text(slot?.goal ?? 0)}</b>`, '#6bff9a');
      this.audio.power();
    }
    if (done.length && this.save.missionsComplete) {
      const r = this.save.completeMissionSet();
      if (r) {
        this.setsCleared++;
        this.hud.banner(`📋 미션 세트 ${r.set} 완료!`, `🪙 +${r.coins} · 상시 배율 +1`, '#6bff9a');
      }
    }
  }

  // ── Input hooks ───────────────────────────────────────────────────────────
  protected override onJump(): void {
    this.audio.jump();
    this.bump('jump', 1);
  }
  protected override onSlide(): void {
    this.audio.slide();
    this.particles.burst(this.player.group.position, 0xd8d0c4, { count: 7, speed: 2.4, life: 0.4, size: 0.5 });
    this.bump('roll', 1);
  }
  protected override onLane(): void {
    this.audio.whoosh();
    this.bump('lane', 1);
  }
  protected override onDeploy(): void {
    this.deployBoard();
  }

  private deployBoard(): void {
    if (!this.state.is(GameState.PLAYING)) return;
    if (!this.pickups.deployBoard()) return;
    this.audio.power();
    this.bump('board', 1);
    this.particles.burst(this.player.group.position, 0x8a7bff, { count: 20, speed: 5, life: 0.7 });
    this.hud.toast('🛹', '호버보드 출발!', '#8a7bff');
  }

  // ── Flow ──────────────────────────────────────────────────────────────────
  /** Begin a fresh run immediately (no countdown — that is only for resume). */
  beginRun(): void {
    this.frozenStart = false;
    this.startRun();
  }

  override resume(): void {
    if (!this.state.is(GameState.PAUSED)) return;
    this.frozenStart = true;
    super.resume();
    this.hud.countdown(() => {
      this.frozenStart = false;
      this.audio.power();
    });
  }

  protected override speedMultiplier(): number {
    if (this.frozenStart || this.caught || this.celebrating) return 0; // hold the world
    const headstart = this.headstartLeft > 0 ? HEADSTART_SPEED : 1;
    const stumble = this.player.isStumbling ? 0.72 : 1;
    return this.pickups.speedBoost() * headstart * stumble * this.rules.speedMult;
  }

  protected override inputEnabled(): boolean {
    return !this.frozenStart && !this.caught;
  }

  protected override chasePressure(): number {
    if (this.player.isStumbling) return 1;
    if (this.stumblesLeft <= 0) return 0.45;
    return 0;
  }

  protected override cameraLift(): number {
    if (!this.pickups.isFlying()) return 0;
    const p = this.pickups.jetpackProgress();
    return Math.min(1, Math.min(p * 5, (1 - p) * 5 + 0.35));
  }

  // ── Per-frame world step ──────────────────────────────────────────────────
  protected override stepWorld(dt: number, scroll: number): void {
    if (this.celebrating) {
      this.stepCelebration(dt);
      return;
    }
    if (this.caught) {
      this.caughtTimer -= dt;
      this.chase.lunge(dt);
      this.player.caughtStep(dt);
      if (this.caughtTimer <= 0) this.endRun();
      return;
    }
    if (this.frozenStart) return;

    if (this.headstartLeft > 0) {
      this.headstartLeft -= scroll;
      if (this.headstartLeft <= 0) this.hud.toast('⚡', '헤드스타트 종료', '#ffd23f');
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
        this.hud.setCombo(0);
      }
    }

    // Timed modes count down to the finish.
    if (this.rules.timer > 0) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.endRun();
        return;
      }
    }

    // World tour: swap districts every DISTRICT_DIST metres.
    const nextDistrict = Math.floor(this.distance / DISTRICT_DIST) % DISTRICTS.length;
    if (nextDistrict !== this.district) {
      this.district = nextDistrict;
      const d = DISTRICTS[this.district];
      this.hud.banner(`✈️ ${d.name}`, d.sub, `#${d.accent.toString(16).padStart(6, '0')}`);
      this.audio.power();
    }
    this.environment.applyDistrict(this.district, this.engine.scene.fog!.color, dt);
    this.track.applyDistrict(DISTRICTS[this.district].ground, dt);

    // Checkpoints.
    if (this.distance >= this.nextCheckpoint) {
      this.nextCheckpoint += CHECKPOINT_DIST;
      this.particles.burst(this.player.group.position, COLORS.coin, { count: 20, speed: 6, life: 0.8 });
      if (this.rules.timer > 0) {
        this.timeLeft += this.rules.timeBonus;
        this.hud.popup(`+${this.rules.timeBonus}초`, '#ffd23f');
      } else {
        this.score.addCoins(CHECKPOINT_COINS);
        this.hud.popup('체크포인트!', '#6bff9a');
      }
      this.audio.power();
    }

    this.segments.update(scroll, dt, this.distance);
    this.pickups.update(scroll, dt, this.player);

    // Credit surviving an express once it is safely behind.
    for (const o of this.segments.obstacles) {
      if (o.isExpress && !o.passed && o.z > 6) {
        o.passed = true;
        this.bump('express', 1);
        this.score.addBonus(60);
      }
    }

    const result = this.collision.resolve(this.player, this.segments.obstacles);
    this.player.setGroundY(result.supportY);
    if (result.onRoof && !this.player.isAirborne) {
      this.roofMetres += scroll;
      this.bump('roof', scroll);
    }

    if (result.hit) this.onHit(result.hit.kind !== undefined && result.trip);

    // Near-miss bonus.
    if (result.nearMiss && !this.wasNearMiss) {
      this.hud.popup('아슬아슬!', '#6bff9a');
      this.score.addBonus(30);
      this.bump('nearmiss', 1);
      this.audio.ui();
    }
    this.wasNearMiss = result.nearMiss;

    const magnet = this.pickups.magnetRadius();
    this.coins.update(scroll, dt, this.player, magnet);
    this.score.coinMult = (getCharacter(this.save.data.selectedChar).ability.coinMult ?? 1)
      * this.pickups.coinMultiplier();
    this.score.multiplier = this.liveMultiplier();
    this.score.addDistance(scroll);

    // Effect visuals + the character-coloured speed trail.
    this.player.setEffects(magnet > 0, this.pickups.isFlying());
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.06;
      const p = this.player.group.position;
      this.trailPos.set(p.x, p.y - 0.55, p.z + 0.6);
      this.particles.burst(this.trailPos, this.trailColor, {
        count: 1, speed: 0.5, life: 0.32, size: 0.5, gravity: 0,
      });
    }

    // Per-run mission metrics, sampled a few times a second.
    this.metricTick -= dt;
    if (this.metricTick <= 0) {
      this.metricTick = 0.5;
      this.setRunMetric('distance', Math.floor(this.distance));
      this.setRunMetric('coins', this.score.coins);
      this.setRunMetric('score', this.score.score);
      this.setRunMetric('roof', Math.floor(this.roofMetres));
      this.setRunMetric('multiplier', this.liveMultiplier());
    }

    this.hud.setRun({
      score: this.score.score,
      coins: this.score.coins,
      keys: this.save.data.keys,
      distance: this.distance,
      multiplier: this.liveMultiplier(),
      time: this.rules.timer > 0 ? Math.max(0, Math.ceil(this.timeLeft)) : undefined,
    });
    this.hud.setEffects(this.pickups.effectViews());
    this.hud.setBoard(this.pickups.charges, this.pickups.boardFraction());
  }

  /** Distance ramp × mission bonus × mode × booster × 2× power-up. */
  private liveMultiplier(): number {
    const ramp = Math.min(MULTIPLIER_MAX, 1 + Math.floor(this.distance / MULTIPLIER_STEP));
    const booster = this.boosterActive ? 2 : 1;
    return Math.round(
      (ramp + this.save.data.multiplierBonus) * this.rules.scoreMult * booster * this.pickups.scoreMultiplier(),
    );
  }

  // ── Damage ────────────────────────────────────────────────────────────────
  private onHit(trip: boolean): void {
    if (this.headstartLeft > 0 || this.pickups.isInvulnerable()) return;
    if (this.pickups.autoHops() && trip) return; // Bouncer deck shrugs it off

    if (this.pickups.tryAbsorb()) {
      this.engine.shake(0.55);
      this.engine.hitstop(0.1);
      this.audio.crash();
      this.particles.burst(this.player.group.position, 0x8a7bff, { count: 26, speed: 8, life: 0.8, size: 0.9 });
      this.hud.popup('보드 파손!', '#8a7bff');
      return;
    }

    if (trip && !this.player.isStumbling && this.stumblesLeft > 0) {
      this.stumblesLeft--;
      this.player.stumble(STUMBLE_TIME);
      this.engine.shake(0.4);
      this.engine.hitstop(0.07);
      this.audio.crash();
      this.comboCount = 0;
      this.hud.setCombo(0);
      this.hud.popup('휘청!', '#ff8a4d');
      this.audio.whistle();
      this.hud.toast('🏃', '검표원이 따라붙었다 — 한 번 더 부딪히면 끝!', '#ff8a4d');
      if (this.save.data.settings.vibrate && navigator.vibrate) navigator.vibrate(40);
      return;
    }

    this.startCaught();
  }

  /** The catch: freeze the yard, throw debris, and let the inspector close in. */
  private startCaught(): void {
    this.caught = true;
    this.caughtTimer = CAUGHT_TIME;
    const p = this.player.group.position;
    this.particles.burst(p, 0xffae3a, { count: 26, speed: 9, life: 0.9, size: 1.1 });
    this.particles.burst(p, 0xe23c3c, { count: 20, speed: 7, life: 0.8 });
    this.engine.shake(0.85);
    this.engine.hitstop(0.15);
    this.audio.crash();
    this.hud.banner('잡혔다!', '검표원에게 붙잡혔습니다', '#ff6a5a');
    if (this.save.data.settings.vibrate && navigator.vibrate) navigator.vibrate(110);
  }

  /** Re-apply user settings to live systems (called by the settings screen). */
  applySettings(): void {
    const s = this.save.data.settings;
    this.engine.shakeScale = s.shake === 'off' ? 0 : s.shake === 'low' ? 0.45 : 1;
    this.engine.setShowFps(s.showFps);
    this.hud.comboEnabled = s.showCombo;
    this.hud.setHandedness(s.leftHanded);
  }

  // ── Run end ───────────────────────────────────────────────────────────────
  private endRun(): void {
    this.caught = false;
    const distance = Math.floor(this.distance);
    const multiplier = this.liveMultiplier();

    // Final per-run mission samples before the set is evaluated.
    this.setRunMetric('distance', distance);
    this.setRunMetric('coins', this.score.coins);
    this.setRunMetric('score', this.score.score);
    this.setRunMetric('roof', Math.floor(this.roofMetres));
    this.setRunMetric('multiplier', multiplier);

    const { isBest, rank } = this.save.recordRun(
      this.mode, this.score.score, this.score.coins, this.distance,
      this.runTime, this.save.data.selectedChar,
    );
    this.save.flush();

    const result: RunResult = {
      mode: this.mode,
      score: this.score.score,
      coins: this.score.coins,
      keys: this.keysThisRun,
      distance,
      multiplier,
      letters: this.lettersThisRun,
      isBest,
      rank,
      missionsDone: [...this.missionsDone],
      setsCleared: this.setsCleared,
    };

    if (isBest && result.score > 0) this.startCelebration(result);
    else {
      this.lastResult = result;
      this.state.set(GameState.GAMEOVER);
    }
  }

  private startCelebration(result: RunResult): void {
    this.pendingResult = result;
    this.caught = false;
    this.celebrating = true;
    this.celebrateTimer = 1.9;
    this.player.reset();
    this.player.celebrate();
    this.chase.setVisible(false);
    this.hud.banner('🏆 신기록!', 'NEW RECORD', '#ffd23f');
    this.audio.power();
    const p = this.player.group.position;
    this.particles.burst(p, COLORS.coin, { count: 30, speed: 7, life: 1.1, size: 0.9 });
    this.particles.burst(p, 0x3fa9f5, { count: 22, speed: 6, life: 1.0 });
  }

  private stepCelebration(dt: number): void {
    this.celebrateTimer -= dt;
    this.player.celebrateStep(dt);
    const scroll = MAX_SPEED * 1.3 * dt;
    this.track.update(scroll);
    this.environment.update(scroll);
    this.segments.update(scroll, dt, this.distance);
    if (Math.random() < 0.4) {
      this.particles.burst(
        new THREE.Vector3((Math.random() - 0.5) * 5, 3.4 + Math.random() * 2, -2),
        [0xffd23f, 0xff4fd8, 0x3fa9f5, 0x6bff9a][(Math.random() * 4) | 0],
        { count: 4, speed: 5, life: 1.0, size: 0.7 },
      );
    }
    if (this.celebrateTimer <= 0) {
      this.celebrating = false;
      if (this.pendingResult) this.lastResult = this.pendingResult;
      this.state.set(GameState.GAMEOVER);
    }
  }

  /** Continue the run after being caught (costs a key). */
  revive(): void {
    this.segments.destroyAhead(50);
    this.pickups.grantInvuln(REVIVE_INVULN);
    this.stumblesLeft = Math.max(1, this.baseStumbles);
    this.player.reset();
    this.chase.reset();
    this.chase.setVisible(true);
    this.audio.power();
    this.hud.banner('🗝️ 계속!', '검표원을 따돌렸다', '#6bff9a');
    this.state.set(GameState.PLAYING);
  }

  /** Open a carried mystery box on the results screen. */
  openCarriedMystery(): { icon: string; text: string } | null {
    if (!this.save.useItem('mystery')) return null;
    const roll = Math.random();
    if (roll < 0.45) {
      const n = 400 + ((Math.random() * 900) | 0);
      this.save.addCoins(n);
      return { icon: '🪙', text: `코인 +${n}` };
    }
    if (roll < 0.7) {
      this.save.addItem('board', 3);
      return { icon: '🛹', text: '예비 호버보드 ×3' };
    }
    if (roll < 0.88) {
      this.save.addKeys(2);
      return { icon: '🗝️', text: '열쇠 +2' };
    }
    this.save.addItem('headstart', 2);
    return { icon: '⚡', text: '헤드스타트 ×2' };
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  protected override resetRun(): void {
    this.caught = false;
    this.caughtTimer = 0;
    this.celebrating = false;
    this.pendingResult = null;
    this.frozenStart = false;
    // Clear the collectible layers *before* the yard, so the coin trails the
    // fresh segments publish on spawn survive the reset.
    this.coins.reset();
    this.pickups.reset();
    this.particles.reset();
    this.segments.reset();
    this.district = 0;
    this.nextCheckpoint = CHECKPOINT_DIST;
    this.timeLeft = this.rules.timer;
    this.segments.difficultyCap = this.rules.difficultyCap;
    this.segments.favourTag = this.rules.expressRush ? 'express' : undefined;
    this.segments.favourWeight = 6;
    this.coins.density = Math.min(1, this.rules.coinDensity);
    this.environment.setDistrict(0, this.engine.scene.fog!.color);
    this.track.setDistrict(DISTRICTS[0].ground);
    this.score.reset();
    this.comboCount = 0;
    this.comboTimer = 0;
    this.wasNearMiss = false;
    this.roofMetres = 0;
    this.keysThisRun = 0;
    this.lettersThisRun = 0;
    this.missionsDone = [];
    this.setsCleared = 0;
    this.lastPathLane = 0;
    this.metricTick = 0;
    this.refreshLoadout();
    this.stumblesLeft = this.rules.reviveAllowed ? this.baseStumbles : 0;

    // Consume the pre-run items the player bought.
    const inv = this.save.data.inventory;
    this.boosterActive = inv.booster > 0 && this.save.useItem('booster');
    this.headstartLeft = inv.headstart > 0 && this.save.useItem('headstart')
      ? 1000 : this.headstartMetres;
    const spare = inv.board;
    if (spare > 0) {
      this.save.data.inventory.board = 0;
      this.pickups.addBoards(spare);
    }
    if (getCharacter(this.save.data.selectedChar).ability.freeBoard) this.pickups.addBoards(1);
    this.save.resetRunMissions();
    this.save.flush();

    this.hud.setHunt(this.save.data.huntLetters);
    this.hud.setBoard(this.pickups.charges, 0);
    this.hud.setCombo(0);
    this.hud.setEffects([]);
    if (this.boosterActive) this.hud.toast('✖️', '스코어 부스터 발동 — 점수 2배!', '#ff8a1f');
    this.showHints();
    super.resetRun();
  }

  /**
   * The first few runs get a short, staggered control primer. It switches
   * itself off once the player has clearly found their feet (or from settings).
   */
  private showHints(): void {
    if (!this.save.data.settings.showHints || this.save.data.runs >= 4) return;
    const lines: Array<[number, string, string]> = [
      [0.8, '↔️', '← → 또는 좌우 스와이프로 선로를 바꾸세요'],
      [3.2, '⬆️', '↑ 또는 위로 스와이프 — 장애물과 열차 지붕으로 점프'],
      [5.8, '⬇️', '↓ 또는 아래로 스와이프 — 게이트 아래로 구르기'],
      [8.4, '🛹', '더블 탭으로 호버보드 — 충돌 한 번을 막아줍니다'],
    ];
    for (const [delay, icon, text] of lines) {
      window.setTimeout(() => {
        if (this.state.is(GameState.PLAYING)) this.hud.toast(icon, text, '#3fa9f5');
      }, delay * 1000);
    }
  }
}

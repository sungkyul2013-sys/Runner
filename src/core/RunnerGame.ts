import * as THREE from 'three';
import { BIOMES, CHECKPOINT_DIST, COLORS, LEVEL_DIST, MAX_SPEED, TIME_ATTACK_SECONDS } from '../config/constants';
import { COINBURST_AMOUNT, POWERUPS, PowerupType, TREASURE_COINS, TREASURE_MILEAGE } from '../config/powerups';
import { AudioManager } from '../audio/AudioManager';
import { getCharacter } from '../data/characters';
import { getMode, LAVA_HOT, LAVA_SAFE, LAVA_WARN, type ModeDef } from '../data/modes';
import { SaveManager, type GameMode } from '../data/SaveManager';
import { ParticleSystem } from '../fx/ParticleSystem';
import { CoinSystem } from '../systems/CoinSystem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { PowerupSystem } from '../systems/PowerupSystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { HUD } from '../ui/HUD';
import { SegmentManager } from '../world/SegmentManager';
import { Engine } from './Engine';
import { Game } from './Game';
import { GameState } from './GameStateManager';

const HEADSTART_SPEED = 1.45;
const REVIVE_INVULN = 2.2;
const COMBO_WINDOW = 1.6;
const CHECKPOINT_COINS = 25;
const CHECKPOINT_TIME = 6;

/** Result of the last finished run, surfaced to the game-over screen. */
export interface RunResult {
  mode: GameMode;
  score: number;
  coins: number;
  distance: number;
  mileage: number;
  isBest: boolean;
}

/**
 * The complete Sunset Runner in-run game: procedural track with rideable roofs,
 * coins & scoring, the power-up suite, level/biome progression, checkpoints,
 * two modes (Endless + Challenge time-attack), character abilities, consumable
 * items (bomb/rocket), and juice (particles, shake, hit-stop, combos, audio).
 */
export class RunnerGame extends Game {
  private readonly segments = new SegmentManager();
  private readonly collision = new CollisionSystem();
  private readonly score = new ScoreSystem();
  private readonly coins: CoinSystem;
  private readonly powerups: PowerupSystem;
  private readonly particles = new ParticleSystem();
  private readonly hud = new HUD();

  private save!: SaveManager;
  private audio!: AudioManager;

  // Loadout (from selected character + upgrades).
  private magnetMult = 1;
  private lowGravity = false;
  private hasReviveAbility = false;
  private headstartDur = 0;
  private headstartTimer = 0;

  // Run state.
  mode: GameMode = 'endless';
  /** Active mode rules (timer/speed/score/lava…). */
  private rules: ModeDef = getMode('endless');
  /** Lava cycle clock (lava mode only). */
  private lavaClock = 0;
  private lavaWasHot = false;
  private trailColor = 0xff7eb3;
  private trailTimer = 0;
  private readonly trailPos = new THREE.Vector3();
  /** Bonus mileage earned from treasure chests this run. */
  private treasureMileage = 0;
  private level = 1;
  private nextCheckpoint = CHECKPOINT_DIST;
  private timeLeft = TIME_ATTACK_SECONDS;
  private comboCount = 0;
  private comboTimer = 0;
  private wasNearMiss = false;
  private usedAbilityRevive = false;
  /** While true (resume countdown) the world is held still and input ignored. */
  private frozenStart = false;
  /** While true (death explosion playing) the world is frozen before game-over. */
  private dying = false;
  private dyingTimer = 0;
  /** While true the character runs off-screen to celebrate a new record. */
  private celebrating = false;
  private celebrateTimer = 0;
  private pendingResult: RunResult | null = null;

  // Consumable inventory carried into the run.
  private bombs = 0;
  private rockets = 0;

  private lastResult: RunResult = { mode: 'endless', score: 0, coins: 0, distance: 0, mileage: 0, isBest: false };

  constructor(engine: Engine, save?: SaveManager, audio?: AudioManager) {
    super(engine, GameState.MENU);
    this.save = save ?? new SaveManager();
    this.audio = audio ?? new AudioManager(this.save.data.settings.muted);

    this.coins = new CoinSystem((pos) => this.onCoin(pos));
    this.powerups = new PowerupSystem(
      this.hud.powerupContainer,
      (range) => this.detonateBomb(range),
      (type) => this.onPowerup(type),
      (t) => this.powerupDuration(t),
    );

    engine.add(this.segments.group);
    engine.add(this.coins.group);
    engine.add(this.powerups.group);
    engine.add(this.particles.group);
    engine.onUpdate((dt) => this.particles.update(dt)); // animate even when frozen

    this.hud.bindControls(
      () => this.pause(),
      () => this.useBomb(),
      () => this.useRocket(),
    );

    this.state.onChange((next) => this.applyVisibility(next === GameState.PLAYING));
    this.applyVisibility(false);
    this.refreshLoadout();
    this.applySettings();
  }

  /** Reference duration formula: magnet/boots = 5 + lvl*1.2, x2 = 6 + lvl*1.5. */
  private powerupDuration(t: PowerupType): number {
    const u = this.save.data.upgrades;
    if (t === PowerupType.MAGNET) return (5 + (u.magnet ?? 0) * 1.2) * this.magnetMult;
    if (t === PowerupType.SNEAKERS) return 5 + (u.boots ?? 0) * 1.2;
    if (t === PowerupType.DOUBLE) return 6 + (u.x2 ?? 0) * 1.5;
    return POWERUPS[t].duration;
  }

  setMode(mode: GameMode): void {
    this.mode = mode;
    this.rules = getMode(mode);
  }

  private applyVisibility(playing: boolean): void {
    this.hud.setVisible(playing);
    this.segments.group.visible = playing;
    this.coins.group.visible = playing;
    this.powerups.group.visible = playing;
  }

  /** Apply the selected character's look + abilities and the coin-value upgrade. */
  refreshLoadout(): void {
    const c = getCharacter(this.save.data.selected);
    const a = c.ability;
    this.magnetMult = a.magnetMult ?? 1;
    this.lowGravity = a.lowGravity ?? false;
    this.hasReviveAbility = a.revive ?? false;
    this.score.scoreBonus = (a.scoreMult ?? 1) - 1;
    this.score.coinMult = a.coinMult ?? 1;
    this.score.coinValueBonus = (this.save.upgradeLevel('multiplier')) * 1;
    this.headstartDur = 1.5 + this.save.upgradeLevel('headstart') * 1.0;
    this.trailColor = c.colors.trail;
    this.player.setLaneSpeedMult(a.laneSpeedMult ?? 1);
    this.player.setLowGravity(this.lowGravity);
    this.player.applyCharacterId(c.id);
  }

  getRunResult(): RunResult {
    return this.lastResult;
  }
  get currentScore(): number {
    return this.score.score;
  }
  get currentCoins(): number {
    return this.score.coins;
  }
  get challengeTime(): number {
    return Math.max(0, Math.ceil(this.timeLeft));
  }
  /** Active mode rules (UI reads reviveAllowed etc.). */
  get modeRules(): ModeDef {
    return this.rules;
  }

  // ── FX hooks ────────────────────────────────────────────────────────────
  private onCoin(pos: THREE.Vector3): void {
    this.score.addCoins(1);
    this.particles.burst(pos, COLORS.coin, { count: 5, speed: 3, life: 0.5, size: 0.6 });
    this.audio.coin();
    this.comboTimer = COMBO_WINDOW;
    this.comboCount++;
    if (this.comboCount >= 5) this.hud.setCombo(this.comboCount);
    if (this.comboCount > 0 && this.comboCount % 10 === 0) this.score.addBonus(this.comboCount);
  }

  private onPowerup(type: PowerupType): void {
    this.audio.power();
    this.particles.burst(this.player.group.position, POWERUPS[type].color, { count: 14, speed: 4, life: 0.7 });
    if (type === PowerupType.ROCKET) {
      // Lift-off: a kick of shake + a downward thrust plume + banner.
      this.engine.shake(0.45);
      this.particles.burst(this.player.group.position, 0xffae5a, { count: 26, speed: 9, life: 0.8, size: 1.0 });
      this.hud.banner('🚀 ROCKET', '하늘로!');
    } else if (type === PowerupType.COINBURST) {
      const got = this.score.addCoins(COINBURST_AMOUNT);
      this.particles.burst(this.player.group.position, COLORS.coin, { count: 24, speed: 6, life: 0.9 });
      this.hud.popup(`💰 +${got}`, '#ffd86b');
    } else if (type === PowerupType.TREASURE) {
      const got = this.score.addCoins(TREASURE_COINS);
      this.treasureMileage += TREASURE_MILEAGE;
      this.particles.burst(this.player.group.position, 0xffcf3a, { count: 30, speed: 7, life: 1.0, size: 0.9 });
      this.hud.banner('🎁 보물상자', `+${got} 🪙 · +${TREASURE_MILEAGE} 💎`);
    } else if (type === PowerupType.STAR) {
      this.hud.banner('⭐ INVINCIBLE', '무적!');
    } else if (type === PowerupType.SLOWMO) {
      this.hud.popup('⏳ SLOW-MO', '#9ad8ff');
    } else if (type !== PowerupType.HOVERBOARD && type !== PowerupType.BOMB) {
      this.hud.popup(`${POWERUPS[type].icon} ${POWERUPS[type].label}`, '#ffd86b');
    }
  }

  protected override onJump(): void {
    this.audio.jump();
  }
  protected override onSlide(): void {
    this.audio.slide();
    this.particles.burst(this.player.group.position, 0xffe0c0, { count: 6, speed: 2, life: 0.4, size: 0.5 });
  }
  protected override onLane(): void {
    this.audio.whoosh();
  }
  protected override onDeploy(): void {
    this.powerups.deploy();
  }

  // ── Consumable items (HUD buttons) ────────────────────────────────────────
  useBomb(): void {
    if (this.bombs <= 0 || !this.state.is(GameState.PLAYING)) return;
    this.bombs--;
    this.powerups.trigger(PowerupType.BOMB);
    this.powerups.grantInvuln(1.5);
    this.hud.setItems(this.bombs, this.rockets);
  }
  useRocket(): void {
    if (this.rockets <= 0 || !this.state.is(GameState.PLAYING)) return;
    this.rockets--;
    this.powerups.trigger(PowerupType.ROCKET);
    this.hud.setItems(this.bombs, this.rockets);
  }

  /** Begin a fresh run immediately (no countdown — that's only for resume). */
  beginRun(): void {
    this.frozenStart = false;
    this.startRun();
  }

  /** Resume from pause with a 3·2·1·GO countdown so the player can re-orient. */
  override resume(): void {
    if (!this.state.is(GameState.PAUSED)) return;
    this.frozenStart = true;
    super.resume(); // back to PLAYING, but speed/input gated until GO
    this.hud.countdown(() => {
      this.frozenStart = false;
      this.audio.power();
    });
  }

  protected override speedMultiplier(): number {
    if (this.frozenStart || this.dying || this.celebrating) return 0; // hold the world
    const headstart = this.headstartTimer > 0 ? HEADSTART_SPEED : 1;
    return this.powerups.speedBoost() * headstart * this.rules.speedMult;
  }

  protected override inputEnabled(): boolean {
    return !this.frozenStart && !this.dying;
  }

  protected override cameraLift(): number {
    // Ease the dramatic lift in/out over the rocket's lifetime so the camera
    // soars up at launch and settles back as it expires.
    if (!this.powerups.isRocketing()) return 0;
    const p = this.powerups.rocketProgress(); // 0..1
    return Math.min(1, Math.min(p * 5, (1 - p) * 5 + 0.4));
  }

  private detonateBomb(range: number): void {
    const cleared = this.segments.destroyAhead(range);
    for (const p of cleared) {
      this.particles.burst(p, 0xff5630, { count: 16, speed: 7, life: 0.7, size: 1.1 });
    }
    this.engine.shake(0.5);
    this.engine.hitstop(0.1);
    this.audio.crash();
  }

  protected override stepWorld(dt: number, scroll: number): void {
    // New-record victory dash — the character runs off-screen.
    if (this.celebrating) {
      this.stepCelebration(dt);
      return;
    }
    // Death explosion: world frozen, debris flies, then drop to game-over.
    if (this.dying) {
      this.dyingTimer -= dt;
      if (this.dyingTimer <= 0) this.finishDeath();
      return;
    }
    // During the resume countdown the world is frozen — skip all gameplay.
    if (this.frozenStart) return;
    if (this.headstartTimer > 0) this.headstartTimer -= dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
        this.hud.setCombo(0);
      }
    }

    // Timed modes (challenge / coin rush) count down to the finish.
    if (this.rules.timer > 0) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.endRun();
        return;
      }
    }

    // 🌋 Floor-is-lava cycle: safe → warning glow → molten (deadly on ground).
    if (this.rules.lava) {
      this.lavaClock += dt;
      const cycle = LAVA_SAFE + LAVA_WARN + LAVA_HOT;
      const t = this.lavaClock % cycle;
      let heat = 0;
      let hot = false;
      if (t < LAVA_SAFE) {
        heat = 0;
      } else if (t < LAVA_SAFE + LAVA_WARN) {
        heat = (t - LAVA_SAFE) / LAVA_WARN * 0.6; // rising warning glow
        if (!this.lavaWasHot && heat > 0.1 && t - LAVA_SAFE < dt * 2) {
          this.hud.banner('🌋 용암 경보!', '점프하거나 지붕으로!');
          this.audio.ui();
        }
      } else {
        heat = 0.6 + 0.4 * Math.abs(Math.sin(this.lavaClock * 6)); // molten shimmer
        hot = true;
      }
      this.track.setLava(heat);
      // Standing on the bare floor while molten → burn.
      if (hot && !this.lavaWasHot) this.audio.power();
      this.lavaWasHot = hot;
      if (hot && !this.player.isAirborne && !this.player.isFlying && this.player.feet <= 0.05
        && !this.powerups.isInvulnerable() && !this.powerups.tryAbsorb()) {
        this.startDeath();
        return;
      }
    }

    // Level / biome progression every LEVEL_DIST metres.
    const newLevel = Math.floor(this.distance / LEVEL_DIST) + 1;
    if (newLevel > this.level) {
      this.level = newLevel;
      const biome = BIOMES[(this.level - 1) % BIOMES.length];
      this.hud.banner(`LEVEL ${this.level}`, `${biome.name} 진입`);
      this.audio.power();
    }
    this.environment.applyBiome(this.level - 1, this.engine.scene.fog!.color, dt);

    // Checkpoint rewards.
    if (this.distance >= this.nextCheckpoint) {
      this.nextCheckpoint += CHECKPOINT_DIST;
      this.particles.burst(this.player.group.position, COLORS.coin, { count: 18, speed: 6, life: 0.8 });
      if (this.rules.timer > 0) {
        this.timeLeft += CHECKPOINT_TIME;
        this.hud.popup(`+${CHECKPOINT_TIME}s`, '#ffd86b');
      } else {
        this.score.addCoins(CHECKPOINT_COINS);
        this.hud.popup('CHECKPOINT', '#ffd86b');
      }
      this.audio.power();
    }

    this.segments.update(scroll, dt, this.distance);
    this.powerups.update(scroll, dt, this.player);

    const result = this.collision.resolve(this.player, this.segments.obstacles);
    this.player.setGroundY(result.supportY);

    if (result.fatal && !this.powerups.isInvulnerable() && !this.powerups.tryAbsorb()) {
      // 피닉스 ability: one free revive per run.
      if (this.hasReviveAbility && !this.usedAbilityRevive) {
        this.usedAbilityRevive = true;
        this.segments.destroyAhead(40);
        this.powerups.grantInvuln(REVIVE_INVULN);
        this.player.reset();
        this.hud.popup('REVIVE!', '#ff6a2a');
        this.audio.power();
      } else {
        this.startDeath();
        return;
      }
    }

    // Near-miss bonus.
    if (result.nearMiss && !this.wasNearMiss) {
      this.hud.popup('CLOSE!', '#6bffb0');
      this.score.addBonus(25);
      this.audio.ui();
    }
    this.wasNearMiss = result.nearMiss;

    const magnet = this.powerups.magnetRadius();
    this.coins.update(scroll, dt, this.player, magnet);
    this.score.multiplier = this.powerups.scoreMultiplier() * this.rules.scoreMult;
    this.score.addDistance(scroll);

    // Power-up visuals + character-coloured run trail.
    this.player.setEffects(magnet > 0, this.powerups.isShielded(), this.powerups.isStar(), this.powerups.isSurfing());
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.07;
      const p = this.player.group.position;
      this.trailPos.set(p.x, p.y - 0.5, p.z + 0.5);
      this.particles.burst(this.trailPos, this.trailColor, {
        count: 1, speed: 0.6, life: 0.35, size: 0.55, gravity: 0,
      });
    }
    this.hud.setRun({
      score: this.score.score,
      coins: this.score.coins,
      distance: this.distance,
      level: this.level,
      time: this.rules.timer > 0 ? this.challengeTime : undefined,
    });
  }

  /** Crash death: a big explosion, then game-over after a short beat. */
  private startDeath(): void {
    this.dying = true;
    this.dyingTimer = 0.85;
    const p = this.player.group.position;
    // Multi-burst explosion in warm + character colours.
    this.particles.burst(p, 0xffae3a, { count: 34, speed: 12, life: 1.0, size: 1.3 });
    this.particles.burst(p, 0xff5630, { count: 26, speed: 8, life: 0.9, size: 1.1 });
    this.particles.burst(p, COLORS.player, { count: 20, speed: 6, life: 0.8 });
    this.player.explode(); // hide the rig + fling a debris poof
    this.engine.shake(0.9);
    this.engine.hitstop(0.16);
    this.audio.crash();
    // Haptic thump on supported devices (settings toggle).
    if (this.save.data.settings.vibrate && navigator.vibrate) navigator.vibrate(90);
  }

  /** Re-apply user settings to live systems (called by the settings screen). */
  applySettings(): void {
    const s = this.save.data.settings;
    this.engine.shakeScale = s.shake === 'off' ? 0 : s.shake === 'low' ? 0.45 : 1;
    this.engine.setShowFps(s.showFps);
    this.hud.comboEnabled = s.showCombo;
  }

  /** Record the run and switch to the game-over screen. */
  private finishDeath(): void {
    this.dying = false;
    this.endRun();
  }

  private endRun(): void {
    const { mileage, isBest } = this.save.recordRun(
      this.mode,
      this.score.score,
      this.score.coins,
      this.distance,
      this.treasureMileage,
      this.runTime,
    );
    const result: RunResult = {
      mode: this.mode,
      score: this.score.score,
      coins: this.score.coins,
      distance: this.distance,
      mileage,
      isBest,
    };
    // New record → the character springs back up and runs off-screen to
    // celebrate before the game-over screen appears.
    if (isBest && result.score > 0) {
      this.startCelebration(result);
    } else {
      this.lastResult = result;
      this.state.set(GameState.GAMEOVER);
    }
  }

  /** New-record celebration: revive the rig and sprint it off-screen. */
  private startCelebration(result: RunResult): void {
    this.pendingResult = result;
    this.dying = false;
    this.celebrating = true;
    this.celebrateTimer = 1.9;
    this.player.reset();
    this.player.celebrate();
    this.hud.banner('🏆 신기록!', 'NEW RECORD');
    this.audio.power();
    const p = this.player.group.position;
    this.particles.burst(p, COLORS.coin, { count: 30, speed: 7, life: 1.1, size: 0.9 });
    this.particles.burst(p, 0xff7eb3, { count: 22, speed: 6, life: 1.0 });
  }

  private stepCelebration(dt: number): void {
    this.celebrateTimer -= dt;
    // Drive the runner forward and the world fast underneath for a victory dash.
    this.player.celebrateStep(dt);
    const scroll = MAX_SPEED * 1.4 * dt;
    this.track.update(scroll);
    this.environment.update(scroll);
    this.segments.update(scroll, dt, this.distance);
    // Occasional confetti burst.
    if (Math.random() < 0.4) {
      this.particles.burst(
        new THREE.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 2, -2),
        [0xffd86b, 0xff7eb3, 0x9ad8ff, 0x6bffb0][(Math.random() * 4) | 0],
        { count: 4, speed: 5, life: 1.0, size: 0.7 },
      );
    }
    if (this.celebrateTimer <= 0) {
      this.celebrating = false;
      if (this.pendingResult) this.lastResult = this.pendingResult;
      this.state.set(GameState.GAMEOVER);
    }
  }

  /** Continue the current run after a crash (paid revive). */
  revive(): void {
    this.segments.destroyAhead(40);
    this.powerups.grantInvuln(REVIVE_INVULN);
    this.player.reset();
    this.audio.power();
    this.state.set(GameState.PLAYING);
  }

  protected override resetRun(): void {
    this.dying = false;
    this.dyingTimer = 0;
    this.celebrating = false;
    this.pendingResult = null;
    this.frozenStart = false;
    this.hud.hideGameOver();
    this.segments.reset();
    this.coins.reset();
    this.powerups.reset();
    this.particles.reset();
    this.level = 1;
    this.nextCheckpoint = CHECKPOINT_DIST;
    // Apply the active mode's rules to all subsystems.
    this.timeLeft = this.rules.timer > 0 ? this.rules.timer : TIME_ATTACK_SECONDS;
    this.coins.density = this.rules.coinDensity;
    this.segments.difficultyCap = this.rules.difficultyCap;
    this.lavaClock = 0;
    this.lavaWasHot = false;
    this.track.setLava(0);
    this.environment.setBiome(0, this.engine.scene.fog!.color);
    this.score.reset();
    this.score.multiplier = this.rules.scoreMult;
    this.treasureMileage = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.wasNearMiss = false;
    this.usedAbilityRevive = false;
    this.refreshLoadout();
    this.headstartTimer = this.headstartDur;
    // Pull consumables from inventory into the run.
    this.bombs = this.save.data.inventory.bomb;
    this.rockets = this.save.data.inventory.rocket;
    this.save.data.inventory.bomb = 0;
    this.save.data.inventory.rocket = 0;
    this.save.save();
    this.hud.setItems(this.bombs, this.rockets);
    super.resetRun();
  }
}

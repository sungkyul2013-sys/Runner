import * as THREE from 'three';
import { COLORS } from '../config/constants';
import { POWERUPS, PowerupType } from '../config/powerups';
import { AudioManager } from '../audio/AudioManager';
import { abilityMagnitude, getCharacter } from '../data/characters';
import type { Mission } from '../data/missions';
import { powerupDurationMult } from '../data/potions';
import { SaveManager } from '../data/SaveManager';
import { Biome } from '../fx/Biome';
import { ParticleSystem } from '../fx/ParticleSystem';
import { CoinSystem } from '../systems/CoinSystem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { MissionSystem } from '../systems/MissionSystem';
import { PowerupSystem } from '../systems/PowerupSystem';
import { RankSystem, type RankResult } from '../systems/RankSystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import type { RunStats } from '../ui/HUD';
import { HUD } from '../ui/HUD';
import { SegmentManager } from '../world/SegmentManager';
import { Engine } from './Engine';
import { Game } from './Game';
import { GameState } from './GameStateManager';

const HEADSTART_SPEED = 1.4;
const REVIVE_INVULN = 2.2;
const COMBO_WINDOW = 1.6;

export interface RunSummary {
  completed: Mission[];
  rank: RankResult;
}

/**
 * The complete in-run game: procedural track with rideable roofs, coins &
 * scoring, the power-up suite, the meta layer (save/characters/abilities/
 * cosmetics/upgrades) and Phase-7 juice — particles, screen shake, hit-stop,
 * biome shifts, combos, near-miss bonuses and synthesised audio.
 */
export class RunnerGame extends Game {
  private readonly segments = new SegmentManager();
  private readonly collision = new CollisionSystem();
  private readonly score = new ScoreSystem();
  private readonly coins: CoinSystem;
  private readonly powerups: PowerupSystem;
  private readonly particles = new ParticleSystem();
  private readonly hud = new HUD();
  private readonly biome: Biome;

  private save!: SaveManager;
  private audio!: AudioManager;
  private missionSys!: MissionSystem;
  private rankSys!: RankSystem;
  private lastSummary: RunSummary = { completed: [], rank: { reward: 0 } };

  private abilityMagnet = 0;
  private headstartDur = 0;
  private headstartTimer = 0;
  jetpackUses = 0;

  private comboCount = 0;
  private comboTimer = 0;
  private wasNearMiss = false;

  constructor(engine: Engine, save?: SaveManager, audio?: AudioManager) {
    super(engine, GameState.MENU);
    this.save = save ?? new SaveManager();
    this.audio = audio ?? new AudioManager(this.save.data.settings.muted);

    this.coins = new CoinSystem((pos) => this.onCoin(pos));
    this.powerups = new PowerupSystem(
      this.hud.powerupContainer,
      (range) => this.detonateBomb(range),
      (type) => this.onPowerup(type),
      (t) => POWERUPS[t].duration * powerupDurationMult(this.save.powerupLevel(t)),
    );
    this.missionSys = new MissionSystem(this.save);
    this.rankSys = new RankSystem(this.save);
    this.biome = new Biome(engine.scene);

    engine.add(this.segments.group);
    engine.add(this.coins.group);
    engine.add(this.powerups.group);
    engine.add(this.particles.group);
    engine.onUpdate((dt) => this.particles.update(dt)); // animate even when frozen

    this.state.onChange((next) => this.applyVisibility(next === GameState.PLAYING));
    this.applyVisibility(false);
    this.refreshLoadout();
    this.headstartTimer = this.headstartDur;
  }

  private applyVisibility(playing: boolean): void {
    this.hud.setVisible(playing);
    this.segments.group.visible = playing;
    this.coins.group.visible = playing;
    this.powerups.group.visible = playing;
  }

  /** Apply equipped character, cosmetics and passive ability (public so the
   * shop / character select can refresh the live attract preview). */
  refreshLoadout(): void {
    const def = getCharacter(this.save.data.selectedCharacter);
    const lvl = this.save.abilityLevel(def.id);
    const mag = abilityMagnitude(def.ability, lvl);
    this.abilityMagnet = def.ability.id === 'magnet' ? mag : 0;
    this.headstartDur = def.ability.id === 'headstart' ? mag : 0;
    this.score.coinBonus = def.ability.id === 'coinBonus' ? mag : 0;
    this.player.applyCharacterId(def.id, this.save.data.equipped);
  }

  getRunStats(): RunStats {
    return {
      score: this.score.score,
      coins: this.score.coins,
      distance: this.distance,
      best: this.save.data.bestScore,
    };
  }
  getRunSummary(): RunSummary {
    return this.lastSummary;
  }

  // ── FX hooks ────────────────────────────────────────────────────────────
  private onCoin(pos: THREE.Vector3): void {
    this.score.addCoins(1);
    this.particles.burst(pos, COLORS.coin, { count: 6, speed: 3, life: 0.5, size: 0.6 });
    this.audio.coin();
    this.comboTimer = COMBO_WINDOW;
    this.comboCount++;
    if (this.comboCount > 0 && this.comboCount % 10 === 0) {
      this.hud.popup(`${this.comboCount} COMBO`, '#ffd23f');
      this.score.addDistance(this.comboCount); // small combo bonus
    }
  }

  private onPowerup(type: PowerupType): void {
    if (type === PowerupType.JETPACK) this.jetpackUses++;
    this.audio.power();
    this.particles.burst(this.player.group.position, POWERUPS[type].color, {
      count: 14, speed: 4, life: 0.7,
    });
    if (type !== PowerupType.HOVERBOARD && type !== PowerupType.BOMB) {
      this.hud.popup(POWERUPS[type].label, '#2de2e6');
    }
  }

  protected override onJump(): void {
    this.audio.jump();
  }
  protected override onSlide(): void {
    this.audio.slide();
    this.particles.burst(this.player.group.position, 0xbfd8ff, { count: 6, speed: 2, life: 0.4, size: 0.5 });
  }
  protected override onDeploy(): void {
    this.powerups.deploy();
  }

  protected override speedMultiplier(): number {
    const headstart = this.headstartTimer > 0 ? HEADSTART_SPEED : 1;
    return this.powerups.speedBoost() * headstart;
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
    if (this.headstartTimer > 0) this.headstartTimer -= dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboCount = 0;
    }

    this.biome.update(dt, this.distance);
    this.segments.update(scroll, dt, this.distance);
    this.powerups.update(scroll, dt, this.player);

    const result = this.collision.resolve(this.player, this.segments.obstacles);
    this.player.setGroundY(result.supportY);

    if (result.fatal && !this.powerups.isInvulnerable() && !this.powerups.tryAbsorb()) {
      this.endRun();
      return;
    }

    // Near-miss bonus (debounced on the rising edge).
    if (result.nearMiss && !this.wasNearMiss) {
      this.hud.popup('CLOSE!', '#2de2e6');
      this.score.addDistance(25);
      this.audio.ui();
    }
    this.wasNearMiss = result.nearMiss;

    const magnet = Math.max(this.powerups.magnetRadius(), this.abilityMagnet);
    this.coins.update(scroll, dt, this.player, magnet);
    this.score.multiplier = this.powerups.scoreMultiplier();
    this.score.addDistance(scroll);
    this.hud.setRun({ score: this.score.score, coins: this.score.coins, distance: this.distance });
  }

  private endRun(): void {
    this.particles.burst(this.player.group.position, COLORS.player, { count: 24, speed: 8, life: 0.9 });
    this.engine.shake(0.6);
    this.engine.hitstop(0.12);
    this.audio.crash();

    this.save.addCoins(this.score.coins);
    this.save.recordRun(this.score.score);
    const rank = this.rankSys.applyRun(this.distance, this.score.coins);
    const completed = this.missionSys.applyRun(this.score.coins, this.distance, this.jetpackUses);
    this.lastSummary = { completed, rank };
    this.state.set(GameState.GAMEOVER);
  }

  /** Continue the current run after a crash (revive). Keeps score/distance. */
  revive(): void {
    this.segments.destroyAhead(40);
    this.powerups.grantInvuln(REVIVE_INVULN);
    this.player.reset();
    this.audio.power();
    this.state.set(GameState.PLAYING);
  }

  protected override resetRun(): void {
    this.hud.hideGameOver();
    this.segments.reset();
    this.coins.reset();
    this.powerups.reset();
    this.particles.reset();
    this.biome.reset();
    this.score.reset();
    this.jetpackUses = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.wasNearMiss = false;
    this.refreshLoadout();
    this.headstartTimer = this.headstartDur;
    super.resetRun();
  }
}

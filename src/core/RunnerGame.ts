import { POWERUPS, PowerupType } from '../config/powerups';
import { abilityMagnitude, getCharacter } from '../data/characters';
import { powerupDurationMult } from '../data/potions';
import { SaveManager } from '../data/SaveManager';
import type { RunStats } from '../ui/HUD';
import { CoinSystem } from '../systems/CoinSystem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { PowerupSystem } from '../systems/PowerupSystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { HUD } from '../ui/HUD';
import { SegmentManager } from '../world/SegmentManager';
import { Engine } from './Engine';
import { Game } from './Game';
import { GameState } from './GameStateManager';

const HEADSTART_SPEED = 1.4;
const REVIVE_INVULN = 2.2;

/**
 * Full in-run game: procedural track with rideable roofs, coins & scoring, the
 * power-up suite, and the meta layer (save, character + passive ability,
 * cosmetics, duration upgrades). The screen layer drives flow via the base
 * Game (startRun/toMenu/pause/resume) and reads {@link getRunStats}.
 */
export class RunnerGame extends Game {
  private readonly segments = new SegmentManager();
  private readonly collision = new CollisionSystem();
  private readonly score = new ScoreSystem();
  private readonly coins: CoinSystem;
  private readonly powerups: PowerupSystem;
  private readonly hud = new HUD();

  private abilityMagnet = 0;
  private headstartDur = 0;
  private headstartTimer = 0;
  jetpackUses = 0;

  constructor(engine: Engine, save?: SaveManager) {
    super(engine, GameState.MENU);
    this.save = save ?? new SaveManager();
    this.coins = new CoinSystem(() => this.score.addCoins(1));
    this.powerups = new PowerupSystem(
      this.hud.powerupContainer,
      (range) => this.detonateBomb(range),
      (type) => {
        if (type === PowerupType.JETPACK) this.jetpackUses++;
      },
      (t) => POWERUPS[t].duration * powerupDurationMult(this.save.powerupLevel(t)),
    );
    engine.add(this.segments.group);
    engine.add(this.coins.group);
    engine.add(this.powerups.group);

    // Gameplay objects only show while PLAYING; the menu shows an empty track.
    this.state.onChange((next) => this.applyVisibility(next === GameState.PLAYING));
    this.applyVisibility(false);

    this.refreshLoadout();
  }

  // assigned in constructor before first use
  private save!: SaveManager;

  private applyVisibility(playing: boolean): void {
    this.hud.setVisible(playing);
    this.segments.group.visible = playing;
    this.coins.group.visible = playing;
    this.powerups.group.visible = playing;
  }

  /** Apply the equipped character, cosmetics and passive ability (public so the
   * shop / character select can refresh the attract-mode preview live). */
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

  protected override onDeploy(): void {
    this.powerups.deploy();
  }

  protected override speedMultiplier(): number {
    const headstart = this.headstartTimer > 0 ? HEADSTART_SPEED : 1;
    return this.powerups.speedBoost() * headstart;
  }

  private detonateBomb(range: number): void {
    this.segments.destroyAhead(range); // explosion FX wired in Phase 7
  }

  protected override stepWorld(dt: number, scroll: number): void {
    if (this.headstartTimer > 0) this.headstartTimer -= dt;

    this.segments.update(scroll, dt, this.distance);
    this.powerups.update(scroll, dt, this.player);

    const result = this.collision.resolve(this.player, this.segments.obstacles);
    this.player.setGroundY(result.supportY);

    if (result.fatal && !this.powerups.isInvulnerable() && !this.powerups.tryAbsorb()) {
      this.endRun();
      return;
    }

    const magnet = Math.max(this.powerups.magnetRadius(), this.abilityMagnet);
    this.coins.update(scroll, dt, this.player, magnet);
    this.score.multiplier = this.powerups.scoreMultiplier();
    this.score.addDistance(scroll);
    this.hud.setRun({
      score: this.score.score,
      coins: this.score.coins,
      distance: this.distance,
    });
  }

  private endRun(): void {
    this.save.addCoins(this.score.coins);
    this.save.recordRun(this.score.score);
    this.save.addXp(Math.floor(this.distance / 10) + this.score.coins);
    this.state.set(GameState.GAMEOVER);
  }

  /** Continue the current run after a crash (revive). Keeps score/distance. */
  revive(): void {
    this.segments.destroyAhead(40);
    this.powerups.grantInvuln(REVIVE_INVULN);
    this.player.reset();
    this.state.set(GameState.PLAYING);
  }

  protected override resetRun(): void {
    this.hud.hideGameOver();
    this.segments.reset();
    this.coins.reset();
    this.powerups.reset();
    this.score.reset();
    this.jetpackUses = 0;
    this.refreshLoadout();
    this.headstartTimer = this.headstartDur;
    super.resetRun();
  }
}

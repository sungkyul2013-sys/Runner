import { POWERUPS, PowerupType } from '../config/powerups';
import { abilityMagnitude, getCharacter } from '../data/characters';
import { powerupDurationMult } from '../data/potions';
import { SaveManager } from '../data/SaveManager';
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

/**
 * Full in-run game: procedural track with rideable roofs, coins & scoring,
 * the power-up suite, and the meta layer (save, selected character + passive
 * ability, cosmetics, power-up duration upgrades). Screens/missions/rank are
 * layered on in Phases 5–6b.
 */
export class RunnerGame extends Game {
  private readonly segments = new SegmentManager();
  private readonly collision = new CollisionSystem();
  private readonly score = new ScoreSystem();
  private readonly coins: CoinSystem;
  private readonly powerups: PowerupSystem;
  private readonly hud = new HUD();

  // Ability-derived run modifiers (set from the equipped character).
  private abilityMagnet = 0;
  private headstartDur = 0;
  private headstartTimer = 0;
  /** Jetpack activations this run (for missions in Phase 6b). */
  jetpackUses = 0;

  constructor(
    engine: Engine,
    private readonly save: SaveManager = new SaveManager(),
  ) {
    super(engine);
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
    this.applyLoadout();
    this.headstartTimer = this.headstartDur;
  }

  /** Apply the equipped character, cosmetics and passive ability to this run. */
  private applyLoadout(): void {
    const def = getCharacter(this.save.data.selectedCharacter);
    const lvl = this.save.abilityLevel(def.id);
    const mag = abilityMagnitude(def.ability, lvl);
    this.abilityMagnet = def.ability.id === 'magnet' ? mag : 0;
    this.headstartDur = def.ability.id === 'headstart' ? mag : 0;
    this.score.coinBonus = def.ability.id === 'coinBonus' ? mag : 0;
    this.player.applyCharacterId(def.id, this.save.data.equipped);
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
    const isBest = this.save.recordRun(this.score.score);
    this.save.addXp(Math.floor(this.distance / 10) + this.score.coins);
    this.state.set(GameState.GAMEOVER);
    this.hud.showGameOver({
      score: this.score.score,
      coins: this.score.coins,
      distance: this.distance,
      best: this.save.data.bestScore,
    });
    void isBest;
  }

  protected override restart(): void {
    this.hud.hideGameOver();
    this.segments.reset();
    this.coins.reset();
    this.powerups.reset();
    this.score.reset();
    this.jetpackUses = 0;
    this.applyLoadout();
    this.headstartTimer = this.headstartDur;
    super.restart();
  }
}

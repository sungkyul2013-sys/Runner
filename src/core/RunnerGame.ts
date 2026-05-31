import { CoinSystem } from '../systems/CoinSystem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { PowerupSystem } from '../systems/PowerupSystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { HUD } from '../ui/HUD';
import { SegmentManager } from '../world/SegmentManager';
import { Engine } from './Engine';
import { Game } from './Game';
import { GameState } from './GameStateManager';

/**
 * Phase 2–4 game: procedural obstacle track + rideable-roof collision, coins
 * & scoring, and the full power-up suite (magnet, 2×, sneakers, jetpack, rocket
 * boost, deployable hoverboard shield, and bomb). Screens/meta land later.
 */
export class RunnerGame extends Game {
  private readonly segments = new SegmentManager();
  private readonly collision = new CollisionSystem();
  private readonly score = new ScoreSystem();
  private readonly coins: CoinSystem;
  private readonly powerups: PowerupSystem;
  private readonly hud = new HUD();

  private bestScore = 0;

  constructor(engine: Engine) {
    super(engine);
    this.coins = new CoinSystem(() => this.score.addCoins(1));
    this.powerups = new PowerupSystem(this.hud.powerupContainer, (range) =>
      this.detonateBomb(range),
    );
    engine.add(this.segments.group);
    engine.add(this.coins.group);
    engine.add(this.powerups.group);
  }

  protected override onDeploy(): void {
    this.powerups.deploy();
  }

  protected override speedMultiplier(): number {
    return this.powerups.speedBoost();
  }

  private detonateBomb(range: number): void {
    this.segments.destroyAhead(range); // explosion FX wired in Phase 7
  }

  protected override stepWorld(dt: number, scroll: number): void {
    this.segments.update(scroll, dt, this.distance);
    this.powerups.update(scroll, dt, this.player);

    const result = this.collision.resolve(this.player, this.segments.obstacles);
    this.player.setGroundY(result.supportY);

    if (result.fatal && !this.powerups.isInvulnerable() && !this.powerups.tryAbsorb()) {
      this.bestScore = Math.max(this.bestScore, this.score.score);
      this.state.set(GameState.GAMEOVER);
      this.hud.showGameOver({
        score: this.score.score,
        coins: this.score.coins,
        distance: this.distance,
        best: this.bestScore,
      });
      return;
    }

    this.coins.update(scroll, dt, this.player, this.powerups.magnetRadius());
    this.score.multiplier = this.powerups.scoreMultiplier();
    this.score.addDistance(scroll);
    this.hud.setRun({
      score: this.score.score,
      coins: this.score.coins,
      distance: this.distance,
    });
  }

  protected override restart(): void {
    this.hud.hideGameOver();
    this.segments.reset();
    this.coins.reset();
    this.powerups.reset();
    this.score.reset();
    super.restart();
  }
}

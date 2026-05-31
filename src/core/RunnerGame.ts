import { CoinSystem } from '../systems/CoinSystem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { HUD } from '../ui/HUD';
import { SegmentManager } from '../world/SegmentManager';
import { Engine } from './Engine';
import { Game } from './Game';
import { GameState } from './GameStateManager';

/**
 * Phase 2–3 game: procedural obstacle track + AABB collision (with rideable
 * roofs), coin collection, scoring and a HUD. Hooks into the base {@link Game}
 * via `stepWorld` and `restart`. Power-ups, screens and meta land in later phases.
 */
export class RunnerGame extends Game {
  private readonly segments = new SegmentManager();
  private readonly collision = new CollisionSystem();
  private readonly score = new ScoreSystem();
  private readonly coins: CoinSystem;
  private readonly hud = new HUD();

  private bestScore = 0;

  constructor(engine: Engine) {
    super(engine);
    this.coins = new CoinSystem(() => this.score.addCoins(1));
    engine.add(this.segments.group);
    engine.add(this.coins.group);
  }

  protected override stepWorld(dt: number, scroll: number): void {
    this.segments.update(scroll, dt, this.distance);

    // Resolve support (rideable roofs) + fatal hits in one pass.
    const result = this.collision.resolve(this.player, this.segments.obstacles);
    this.player.setGroundY(result.supportY);

    if (result.fatal) {
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

    this.coins.update(scroll, dt, this.player);
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
    this.score.reset();
    super.restart();
  }
}

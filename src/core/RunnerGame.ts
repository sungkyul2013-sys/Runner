import { CollisionSystem } from '../systems/CollisionSystem';
import { HUD } from '../ui/HUD';
import { SegmentManager } from '../world/SegmentManager';
import { Engine } from './Engine';
import { Game } from './Game';
import { GameState } from './GameStateManager';

/**
 * Phase 2 game: extends the core runner with a procedural obstacle track,
 * AABB collision detection (→ game over) and a minimal HUD. Hooks into the
 * base {@link Game} via `stepWorld` (per-frame world advance) and `restart`.
 */
export class RunnerGame extends Game {
  private readonly segments = new SegmentManager();
  private readonly collision = new CollisionSystem();
  private readonly hud = new HUD();

  constructor(engine: Engine) {
    super(engine);
    engine.add(this.segments.group);
  }

  protected override stepWorld(dt: number, scroll: number): void {
    this.segments.update(scroll, dt, this.distance);

    const hit = this.collision.check(this.player.aabb, this.segments.obstacles);
    if (hit) {
      this.state.set(GameState.GAMEOVER);
      this.hud.showGameOver(this.distance);
      return;
    }

    this.hud.setDistance(this.distance);
  }

  protected override restart(): void {
    this.hud.hideGameOver();
    this.segments.reset();
    super.restart();
  }
}

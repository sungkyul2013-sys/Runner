import {
  BASE_SPEED,
  MAX_SPEED,
  SPEED_RAMP_PER_SEC,
} from '../config/constants';
import { InputController, type Intent } from '../player/InputController';
import { Player } from '../player/Player';
import { Track } from '../world/Track';
import { CameraRig } from './CameraRig';
import { Engine } from './Engine';
import { GameState, GameStateManager } from './GameStateManager';

/**
 * Top-level gameplay orchestrator. Owns the run state (speed, distance), the
 * player, the scrolling track and the camera rig, and routes input intents
 * according to the current {@link GameState}. Phase 2 extends this with the
 * segment/obstacle manager and collision system.
 */
export class Game {
  readonly state = new GameStateManager(GameState.PLAYING);

  protected readonly player = new Player();
  protected readonly track = new Track();
  protected readonly input = new InputController(document.body);
  private readonly cameraRig: CameraRig;

  /** Current world scroll speed (units/sec). */
  protected speed = BASE_SPEED;
  /** Distance travelled this run (world units ≈ metres). */
  protected distance = 0;
  /** Time elapsed in the current run (seconds). */
  protected runTime = 0;

  constructor(protected readonly engine: Engine) {
    this.cameraRig = new CameraRig(engine.camera);

    engine.add(this.track.group);
    engine.add(this.player.group);

    this.input.onIntent(this.handleIntent);
    engine.onUpdate(this.update);
  }

  private handleIntent = (intent: Intent): void => {
    if (this.state.is(GameState.PLAYING)) {
      switch (intent) {
        case 'left':
          this.player.moveLeft();
          break;
        case 'right':
          this.player.moveRight();
          break;
        case 'jump':
          this.player.jump();
          break;
        case 'slide':
          this.player.slide();
          break;
      }
    } else if (this.state.is(GameState.GAMEOVER) && intent === 'confirm') {
      this.restart();
    }
  };

  /** Reset run state for a fresh run. Subclasses extend to clear obstacles. */
  protected restart(): void {
    this.speed = BASE_SPEED;
    this.distance = 0;
    this.runTime = 0;
    this.player.reset();
    this.cameraRig.reset();
    this.state.set(GameState.PLAYING);
  }

  private update = (dt: number): void => {
    if (!this.state.is(GameState.PLAYING)) return;

    this.runTime += dt;
    // Gentle, capped speed ramp over time.
    this.speed = Math.min(MAX_SPEED, BASE_SPEED + SPEED_RAMP_PER_SEC * this.runTime);

    const scroll = this.speed * dt;
    this.distance += scroll;

    this.player.update(dt);
    this.track.update(scroll);
    this.stepWorld(dt, scroll); // Phase 2 hook
    this.cameraRig.update(dt, this.player.group.position.x, this.speed);
  };

  /** Extension point for Phase 2 (segment spawning + collision). No-op here. */
  protected stepWorld(_dt: number, _scroll: number): void {}
}

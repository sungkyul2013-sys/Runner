import { BASE_SPEED, MAX_SPEED, SPEED_RAMP_PER_SEC } from '../config/constants';
import { InputController, type Intent } from '../player/InputController';
import { Player } from '../player/Player';
import { Environment } from '../world/Environment';
import { Track } from '../world/Track';
import { CameraRig } from './CameraRig';
import { Engine } from './Engine';
import { GameState, GameStateManager } from './GameStateManager';

/** Attract-mode (menu background) scroll fraction of base speed. */
const ATTRACT_SPEED = BASE_SPEED * 0.55;

/**
 * Top-level gameplay orchestrator + flow controller. Owns the run state, the
 * player, scrolling track and camera, and dispatches per-frame work by
 * {@link GameState}: full simulation while PLAYING, a gentle "attract" scroll
 * in the MENU (the character jogs on an empty track behind the home screen),
 * and a frozen frame while PAUSED / GAMEOVER. Phase 2+ systems hook in via
 * `stepWorld`.
 */
export class Game {
  readonly state: GameStateManager;

  protected readonly player = new Player();
  protected readonly track = new Track();
  protected readonly environment = new Environment();
  protected readonly input = new InputController(document.body);
  private readonly cameraRig: CameraRig;

  protected speed = BASE_SPEED;
  protected distance = 0;
  protected runTime = 0;

  constructor(
    protected readonly engine: Engine,
    initial: GameState = GameState.MENU,
  ) {
    this.state = new GameStateManager(initial);
    this.cameraRig = new CameraRig(engine.camera);

    engine.add(this.track.group);
    engine.add(this.environment.group);
    engine.add(this.player.group);

    this.input.onIntent(this.handleIntent);
    engine.onUpdate(this.update);

    // Restart the results-screen entrance every time GAMEOVER is entered.
    this.state.onChange((next) => {
      if (next === GameState.GAMEOVER) this.goTime = 0;
    });
  }

  // ── Flow control (driven by the screen layer) ─────────────────────────────
  startRun(): void {
    this.resetRun();
    this.state.set(GameState.PLAYING);
  }
  toMenu(): void {
    this.resetRun();
    this.menuTime = 0; // restart the walk-out entrance + pose cycle
    this.state.set(GameState.MENU);
  }
  pause(): void {
    if (this.state.is(GameState.PLAYING)) this.state.set(GameState.PAUSED);
  }
  resume(): void {
    if (this.state.is(GameState.PAUSED)) this.state.set(GameState.PLAYING);
  }

  /** Gameplay input gate (RunnerGame blocks it during the start countdown). */
  protected inputEnabled(): boolean {
    return true;
  }

  private handleIntent = (intent: Intent): void => {
    if (!this.state.is(GameState.PLAYING) || !this.inputEnabled()) return;
    switch (intent) {
      case 'left':
        this.player.moveLeft();
        this.onLane();
        break;
      case 'right':
        this.player.moveRight();
        this.onLane();
        break;
      case 'jump':
        if (!this.player.isAirborne) this.onJump();
        this.player.jump();
        break;
      case 'slide':
        if (!this.player.isSliding) this.onSlide();
        this.player.slide();
        break;
      case 'deploy':
        this.onDeploy();
        break;
    }
  };

  /** Extension points for SFX / FX. Overridden by RunnerGame. */
  protected onDeploy(): void {}
  protected onJump(): void {}
  protected onSlide(): void {}
  protected onLane(): void {}

  /** Multiplier applied to the world speed (Phase 4 Rocket / headstart). */
  protected speedMultiplier(): number {
    return 1;
  }

  /** Reset run state. Subclasses extend to clear obstacles/coins/score. */
  protected resetRun(): void {
    this.speed = BASE_SPEED;
    this.distance = 0;
    this.runTime = 0;
    this.player.reset();
    this.cameraRig.reset();
  }

  private update = (dt: number): void => {
    switch (this.state.state) {
      case GameState.PLAYING:
        this.stepPlaying(dt);
        break;
      case GameState.MENU:
        this.stepAttract(dt);
        break;
      case GameState.GAMEOVER:
        this.stepGameOver(dt);
        break;
      default:
        break; // PAUSED → frozen
    }
  };

  /** Results screen: the character jogs in from down the track and poses for
   *  the camera in front of the fresh gradient backdrop. */
  private goTime = 0;
  private stepGameOver(dt: number): void {
    this.goTime += dt;
    this.player.menuShowcase(dt, this.goTime);
    this.cameraRig.menu(dt, this.goTime);
  }

  private stepPlaying(dt: number): void {
    this.runTime += dt;
    this.speed = Math.min(MAX_SPEED, BASE_SPEED + SPEED_RAMP_PER_SEC * this.runTime);

    const effectiveSpeed = this.speed * this.speedMultiplier();
    const scroll = effectiveSpeed * dt;
    this.distance += scroll;

    this.player.setAnimSpeed(effectiveSpeed / BASE_SPEED);
    this.player.update(dt);
    this.track.update(scroll);
    this.environment.update(scroll);
    this.stepWorld(dt, scroll);
    this.cameraRig.update(
      dt,
      this.player.group.position.x,
      effectiveSpeed,
      this.cameraLift(),
      this.player.feet,
    );
  }

  /** 0..1 camera lift (RunnerGame raises it while the Rocket flies). */
  protected cameraLift(): number {
    return 0;
  }

  /** Menu background: the character jogs in place while the world streams past
   *  and a dedicated "hero" camera shows it off up close (popped out). */
  private menuTime = 0;
  private stepAttract(dt: number): void {
    this.menuTime += dt;
    const scroll = ATTRACT_SPEED * dt;
    this.player.menuShowcase(dt, this.menuTime);
    this.track.update(scroll);
    this.environment.update(scroll);
    this.cameraRig.menu(dt, this.menuTime);
  }

  /** Per-frame world advance while PLAYING (Phase 2+ systems). No-op here. */
  protected stepWorld(_dt: number, _scroll: number): void {}
}

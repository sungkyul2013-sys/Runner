import { BASE_SPEED, MAX_SPEED, SPEED_RAMP_PER_SEC } from '../config/constants';
import { Chase } from '../player/Chase';
import { InputController, type Intent } from '../player/InputController';
import { Player } from '../player/Player';
import { Environment } from '../world/Environment';
import { Track } from '../world/Track';
import { CameraRig } from './CameraRig';
import { Engine } from './Engine';
import { GameState, GameStateManager } from './GameStateManager';

/** Attract-mode (menu background) scroll fraction of base speed. */
const ATTRACT_SPEED = BASE_SPEED * 0.5;

/**
 * Top-level gameplay orchestrator and flow controller. It owns the run state,
 * the player, the inspector chase, the scrolling yard and the camera, and
 * dispatches per-frame work by {@link GameState}: a full simulation while
 * PLAYING, a gentle attract scroll in the MENU (the runner jogs the empty yard
 * behind the home screen), and a frozen frame while PAUSED. Gameplay systems
 * hook in through `stepWorld`.
 */
export class Game {
  readonly state: GameStateManager;

  protected readonly player = new Player();
  protected readonly chase = new Chase();
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
    engine.add(this.chase.group);

    this.input.onIntent(this.handleIntent);
    engine.onUpdate(this.update);

    this.state.onChange((next) => {
      if (next === GameState.GAMEOVER) this.goTime = 0;
      this.chase.setVisible(next === GameState.PLAYING);
    });
    this.chase.setVisible(false);
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

  /** Gameplay input gate (RunnerGame blocks it during countdowns / deaths). */
  protected inputEnabled(): boolean {
    return true;
  }

  private handleIntent = (intent: Intent): void => {
    if (!this.state.is(GameState.PLAYING) || !this.inputEnabled()) return;
    switch (intent) {
      case 'left':
        if (this.player.moveLeft()) this.onLane();
        break;
      case 'right':
        if (this.player.moveRight()) this.onLane();
        break;
      case 'jump':
        if (this.player.jump()) this.onJump();
        break;
      case 'slide':
        if (this.player.slide()) this.onSlide();
        break;
      case 'deploy':
        this.onDeploy();
        break;
    }
  };

  /** Extension points for SFX / scoring. Overridden by RunnerGame. */
  protected onDeploy(): void {}
  protected onJump(): void {}
  protected onSlide(): void {}
  protected onLane(): void {}

  /** Multiplier applied to the world speed (jetpack / headstart / board). */
  protected speedMultiplier(): number {
    return 1;
  }

  /** 0..1 how hard the inspector is pressing (drives the chase distance). */
  protected chasePressure(): number {
    return 0;
  }

  /** Reset run state. Subclasses extend to clear obstacles/coins/score. */
  protected resetRun(): void {
    this.speed = BASE_SPEED;
    this.distance = 0;
    this.runTime = 0;
    this.player.reset();
    this.chase.reset();
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

  /** Results screen: the runner jogs in and poses in front of the backdrop. */
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

    const cadence = effectiveSpeed / BASE_SPEED;
    this.player.setAnimSpeed(cadence);
    this.player.update(dt);
    this.track.update(scroll);
    this.environment.update(scroll);
    this.stepWorld(dt, scroll);
    this.chase.update(dt, this.player.posX, cadence, this.chasePressure());
    this.cameraRig.update(
      dt,
      this.player.group.position.x,
      effectiveSpeed,
      this.cameraLift(),
      this.player.feet,
    );
  }

  /** 0..1 camera lift (RunnerGame raises it while the jetpack burns). */
  protected cameraLift(): number {
    return 0;
  }

  /** Menu background: the runner jogs the empty yard under a hero camera. */
  private menuTime = 0;
  private stepAttract(dt: number): void {
    this.menuTime += dt;
    const scroll = ATTRACT_SPEED * dt;
    this.player.menuShowcase(dt, this.menuTime);
    this.track.update(scroll);
    this.environment.update(scroll);
    this.cameraRig.menu(dt, this.menuTime);
  }

  /** Per-frame world advance while PLAYING. No-op here. */
  protected stepWorld(_dt: number, _scroll: number): void {}
}

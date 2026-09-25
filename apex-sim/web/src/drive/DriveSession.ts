// A driving session (M1e): the "drive" test ground, one vehicle from the catalogue, its GLB bound to the physics body,
// driver input, chase camera and dashboard.
import type { DriveVehicle } from './types';
import type { PhysicsClient, RenderFrame, SpawnedVehicle } from '../physics/PhysicsClient';
import type { VehiclePose } from '../physics/messages';
import type { VehicleState } from '../physics/telemetry';
import type { DebugBodies } from '../render/DebugBodies';
import type { Viewer } from '../render/Viewer';
import { Dashboard } from '../ui/Dashboard';
import { t } from '../ui/i18n';
import { Debris, glassDebris, lampDebris } from '../vehicles/Debris';
import { Sparks } from '../vehicles/Sparks';
import type { Leaks } from '../vehicles/Leaks';
import type { Airbags } from '../vehicles/Airbags';
import { VehicleActor } from '../vehicles/VehicleActor';
import { spawnPoseOf, type VehicleView } from './VehicleView';
import { ChaseCamera } from './ChaseCamera';
import { DriveInput } from './DriveInput';
import { sound } from '../audio/Sound';

export const DRIVE_SCENE = 'drive';

export class DriveSession {
  readonly dashboard: Dashboard;
  readonly input = new DriveInput();
  private chase: ChaseCamera;
  private actor: VehicleActor;

  private xray = false;
  private starting: Promise<void> | null = null;
  // Glass granules and lamp shards (§4.3 side-effect particles).
  readonly glassDebris: Debris = glassDebris();
  readonly lampDebris: Debris = lampDebris();
  readonly sparks = new Sparks();

  private active = true;
  /** The session owns the debug view (test ground, free roam); in the sandbox the lattices keep theirs and the car
   *  is only left out of it. */
  manageDebug = true;
  /** Runs after the scene is loaded and before the car is placed (a map adds its roads and terrain). */
  beforeSpawn: (() => Promise<void> | void) | null = null;
  /** The car's state at the last rendered frame (null until it is on the road). */
  state: VehicleState | null = null;

  /** `sceneId`: the scene the session loads on start and restart (null: the caller's world as it is — the sandbox). */
  constructor(
    private readonly physics: PhysicsClient,
    private readonly viewer: Viewer,
    private readonly debug: DebugBodies,
    public vehicle: DriveVehicle,
    private readonly onError: (message: string) => void,
    private readonly onPauseToggle: () => void,
    public pose: VehiclePose = { position: [0, 0, 0], yaw: 0, speed: 0 },
    readonly sceneId: string | null = DRIVE_SCENE,
  ) {
    this.dashboard = new Dashboard(vehicle.redlineRpm);
    this.chase = new ChaseCamera(viewer.camera, viewer.controls);
    this.actor = this.makeActor(vehicle);
    this.input.onAction = (a) => {
      if (a === 'camera') this.toggleCamera();
      else if (a === 'reset') void this.resetCar().then(() => this.onReset?.());
      else if (a === 'xray') this.setXray(!this.xray);
    };
    window.addEventListener('keydown', (e) => {
      if (this.input.enabled && e.code === 'KeyP' && !e.repeat) this.onPauseToggle();
    });
    viewer.scene.add(this.glassDebris.group, this.lampDebris.group, this.sparks.group);
  }

  private makeActor(v: DriveVehicle): VehicleActor {
    return new VehicleActor(this.physics, this.viewer, v, { glass: this.glassDebris, lamp: this.lampDebris, sparks: this.sparks }, this.onError);
  }

  /** Latest (interpolated) vehicle state — for tests and tools. */
  get latest(): VehicleState | null {
    return this.actor.state;
  }

  get spawned(): SpawnedVehicle | null {
    return this.actor.spawned;
  }

  get view(): VehicleView | null {
    return this.actor.view;
  }

  get leaks(): Leaks | null {
    return this.actor.leaks;
  }

  get airbags(): Airbags | null {
    return this.actor.airbags;
  }

  get flags() {
    return this.input.logic;
  }

  async start(): Promise<void> {
    this.starting ??= this.spawn();
    return this.starting;
  }

  private async spawn(): Promise<void> {
    this.viewer.freeMove = false;
    this.input.enabled = this.active;
    this.input.logic.reset();
    this.chase.reset();
    this.dashboard.root.hidden = !this.active;
    if (this.sceneId) this.physics.loadScene(this.sceneId);
    await this.beforeSpawn?.();
    this.glassDebris.clear();
    this.lampDebris.clear();
    this.sparks.clear();
    await this.placeCar(this.pose);
  }

  private async placeCar(pose: VehiclePose): Promise<void> {
    sound?.setEngine(this.vehicle.engineSound ?? {});
    await this.actor.spawn(pose);
    this.setXray(this.xray);
  }

  /** The car where it stands as a spawn pose (upright, on the ground, lifted by `lift`); null before it is out. */
  currentPose(lift = 0.3): VehiclePose | null {
    return this.state ? spawnPoseOf(this.state, lift) : null;
  }

  /** Replaces the car by a fresh one at `pose` without rebuilding the world: the old one (and every part that broke
   *  off it) is retired below the world. `vehicle` changes the car. */
  async respawn(pose: VehiclePose, vehicle: DriveVehicle = this.vehicle): Promise<void> {
    if (!this.actor.spawned) {
      this.pose = pose;
      if (vehicle !== this.vehicle) this.swapActor(vehicle);
      return this.restart();
    }
    await this.starting;
    this.physics.retireFamily(this.actor.spawned.body);
    if (vehicle !== this.vehicle) this.swapActor(vehicle);
    this.glassDebris.clear();
    this.lampDebris.clear();
    this.sparks.clear();
    this.input.logic.reset();
    this.chase.reset();
    await this.placeCar(pose);
  }

  private swapActor(vehicle: DriveVehicle): void {
    this.actor.dispose();
    this.vehicle = vehicle;
    this.actor = this.makeActor(vehicle);
    this.dashboard.setRedline(vehicle.redlineRpm);
  }

  /** A new car where this one stands (the map and every other object stay as they are). */
  async repair(): Promise<void> {
    const pose = this.currentPose();
    await this.respawn(pose ?? this.pose);
  }

  /** A new car at the start point (the world is not rebuilt). */
  async resetCar(): Promise<void> {
    await this.respawn(this.pose);
  }

  /** Another car, carrying on from where this one stands. */
  async swapVehicle(vehicle: DriveVehicle): Promise<void> {
    await this.respawn(this.currentPose(0.45) ?? this.pose, vehicle);
  }

  async restart(): Promise<void> {
    this.starting = null;
    await this.start();
  }

  get isActive(): boolean {
    return this.active;
  }

  get xrayOn(): boolean {
    return this.xray;
  }

  /** Called after the reset key put the car back (the shell announces it). */
  onReset: (() => void) | null = null;

  /** Another view owns the camera (the free-roam overview map): the chase camera stands by. */
  holdCamera = false;

  get cameraMode(): string {
    return this.chase.mode;
  }

  /** In the car (input, chase camera, dashboard) or out of it (the car parks; the camera is free — the sandbox). */
  setActive(on: boolean): void {
    this.active = on;
    this.input.enabled = on;
    this.dashboard.root.hidden = !on;
    this.viewer.freeMove = !on;
    if (!on) {
      this.viewer.controls.enabled = true;
      this.chase.release();
    }
    else this.chase.reset();
  }

  /** The camera's name for the HUD and toasts. */
  get cameraLabel(): string {
    return this.chase.mode === 'chase' ? t('cameraChase') : this.chase.mode === 'roof' ? t('cameraRoof') : t('cameraOrbit');
  }

  toggleCamera(): void {
    this.chase.toggle();
    this.onCamera?.(this.cameraLabel);
  }

  /** Called when the camera changes (the shell announces it). */
  onCamera: ((label: string) => void) | null = null;

  setXray(on: boolean): void {
    this.xray = on;
    const hasModel = this.actor.hasModel;
    if (this.manageDebug) {
      this.debug.showBeams = on || !hasModel;
      this.debug.showNodes = on || !hasModel;
    } else {
      this.debug.xray = on;
      if (this.actor.spawned && hasModel) this.debug.hidden.add(this.actor.spawned.body);
    }
    this.actor.setXray(on);
  }

  /** Per rendered frame: pose the model, follow with the camera, send the driver's input. */
  update(dt: number, frame: RenderFrame | null): void {
    const v = this.actor.update(dt, frame);
    this.state = v ?? null;
    if (!v || !this.actor.spawned) return;
    this.glassDebris.update(dt);
    this.lampDebris.update(dt);
    this.sparks.update(dt);
    const stats = this.physics.latestStats();
    sound?.update(this.active ? v : null, stats?.timeScale ?? 1, stats?.paused ?? false);
    if (!this.active) {
      // Parked: handbrake on, foot on the brake.
      this.physics.setVehicleInput(this.actor.spawned.vehicle, { throttle: 0, brake: 1, steer: 0, handbrake: 1, mode: 0, shift: 0, abs: true, tcs: true });
      return;
    }
    if (!this.holdCamera) {
      const short = innerHeight < 520 && innerWidth > innerHeight;
      this.chase.lift = this.dashboard.root.hidden || this.dashboard.root.classList.contains('hud-off') ? 0 : short ? 0.15 : innerHeight > innerWidth ? 0.07 : 0.1;
      this.chase.update(dt, v);
    } else this.chase.release();
    this.physics.setVehicleInput(this.actor.spawned.vehicle, this.input.update(dt, v.speed));
    const logic = this.input.logic;
    this.dashboard.update(v, {
      manual: logic.manual,
      abs: logic.abs,
      tcs: logic.tcs,
      camera: this.cameraLabel,
    });
  }
}

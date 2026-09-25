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
import type { VehicleView } from './VehicleView';
import { ChaseCamera } from './ChaseCamera';
import { DriveInput } from './DriveInput';

export const DRIVE_SCENE = 'drive';

export class DriveSession {
  readonly dashboard: Dashboard;
  readonly input = new DriveInput();
  private chase: ChaseCamera;
  private readonly actor: VehicleActor;
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
    readonly vehicle: DriveVehicle,
    onError: (message: string) => void,
    private readonly onPauseToggle: () => void,
    public pose: VehiclePose = { position: [0, 0, 0], yaw: 0, speed: 0 },
    readonly sceneId: string | null = DRIVE_SCENE,
  ) {
    this.dashboard = new Dashboard(vehicle.redlineRpm);
    this.chase = new ChaseCamera(viewer.camera, viewer.controls);
    this.actor = new VehicleActor(physics, viewer, vehicle, { glass: this.glassDebris, lamp: this.lampDebris, sparks: this.sparks }, onError);
    this.input.onAction = (a) => {
      if (a === 'camera') this.chase.toggle();
      else if (a === 'reset') void this.restart();
      else if (a === 'xray') this.setXray(!this.xray);
    };
    window.addEventListener('keydown', (e) => {
      if (this.input.enabled && e.code === 'KeyP' && !e.repeat) this.onPauseToggle();
    });
    viewer.scene.add(this.glassDebris.group, this.lampDebris.group, this.sparks.group);
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
    await this.actor.spawn(this.pose);
    this.setXray(this.xray);
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
    if (!on) this.viewer.controls.enabled = true;
    else this.chase.reset();
  }

  toggleCamera(): void {
    this.chase.toggle();
  }

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
    if (!this.active) {
      // Parked: handbrake on, foot on the brake.
      this.physics.setVehicleInput(this.actor.spawned.vehicle, { throttle: 0, brake: 1, steer: 0, handbrake: 1, mode: 0, shift: 0, abs: true, tcs: true });
      return;
    }
    if (!this.holdCamera) this.chase.update(dt, v);
    this.physics.setVehicleInput(this.actor.spawned.vehicle, this.input.update(dt, v.speed));
    const logic = this.input.logic;
    this.dashboard.update(v, {
      manual: logic.manual,
      abs: logic.abs,
      tcs: logic.tcs,
      camera: this.chase.mode === 'chase' ? t('cameraChase') : t('cameraOrbit'),
    });
  }
}

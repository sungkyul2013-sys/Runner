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

  constructor(
    private readonly physics: PhysicsClient,
    private readonly viewer: Viewer,
    private readonly debug: DebugBodies,
    readonly vehicle: DriveVehicle,
    onError: (message: string) => void,
    private readonly onPauseToggle: () => void,
    private readonly pose: VehiclePose = { position: [0, 0, 0], yaw: 0, speed: 0 },
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
    this.input.enabled = true;
    this.input.logic.reset();
    this.chase.reset();
    this.dashboard.root.hidden = false;
    this.physics.loadScene(DRIVE_SCENE);
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

  setXray(on: boolean): void {
    this.xray = on;
    const hasModel = this.actor.hasModel;
    this.debug.showBeams = on || !hasModel;
    this.debug.showNodes = on || !hasModel;
    this.actor.setXray(on);
  }

  /** Per rendered frame: pose the model, follow with the camera, send the driver's input. */
  update(dt: number, frame: RenderFrame | null): void {
    const v = this.actor.update(dt, frame);
    if (!v || !this.actor.spawned) return;
    this.glassDebris.update(dt);
    this.lampDebris.update(dt);
    this.sparks.update(dt);
    this.chase.update(dt, v);
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

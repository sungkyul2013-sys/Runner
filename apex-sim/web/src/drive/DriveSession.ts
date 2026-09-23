// A driving session (M1e): the "drive" test ground, one vehicle from the catalogue, its GLB bound to the physics body,
// driver input, chase camera and dashboard.
import type { DriveVehicle } from './types';
import type { PhysicsClient, RenderFrame, SpawnedVehicle } from '../physics/PhysicsClient';
import type { VehicleState } from '../physics/telemetry';
import type { DebugBodies } from '../render/DebugBodies';
import type { Viewer } from '../render/Viewer';
import { Dashboard } from '../ui/Dashboard';
import { t } from '../ui/i18n';
import { loadVehicleModel } from '../vehicles/VehicleModel';
import { ChaseCamera } from './ChaseCamera';
import { DriveInput } from './DriveInput';
import { VehicleView } from './VehicleView';

export const DRIVE_SCENE = 'drive';

export class DriveSession {
  readonly dashboard: Dashboard;
  readonly input = new DriveInput();
  private chase: ChaseCamera;
  private view: VehicleView | null = null;
  private spawned: SpawnedVehicle | null = null;
  private state: VehicleState | null = null;
  private xray = false;
  private starting: Promise<void> | null = null;

  constructor(
    private readonly physics: PhysicsClient,
    private readonly viewer: Viewer,
    private readonly debug: DebugBodies,
    readonly vehicle: DriveVehicle,
    private readonly onError: (message: string) => void,
    private readonly onPauseToggle: () => void,
  ) {
    this.dashboard = new Dashboard(vehicle.redlineRpm);
    this.chase = new ChaseCamera(viewer.camera, viewer.controls);
    this.input.onAction = (a) => {
      if (a === 'camera') this.chase.toggle();
      else if (a === 'reset') void this.restart();
      else if (a === 'xray') this.setXray(!this.xray);
    };
    window.addEventListener('keydown', (e) => {
      if (this.input.enabled && e.code === 'KeyP' && !e.repeat) this.onPauseToggle();
    });
  }

  /** Latest (interpolated) vehicle state — for tests and tools. */
  get latest(): VehicleState | null {
    return this.state;
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
    const modelPromise = this.vehicle.model && !this.view ? loadVehicleModel(this.vehicle.model) : null;
    try {
      // Worker URLs resolve against the worker script, not the page: send an absolute one.
      const src = this.vehicle.source;
      const source = src.kind === 'json' ? { kind: 'json' as const, url: new URL(src.url, document.baseURI).href } : src;
      this.spawned = await this.physics.spawnVehicle(source, { position: [0, 0, 0], yaw: 0, speed: 0 }, this.vehicle.id);
    } catch (err) {
      this.onError(`${t('vehicleFailed')}: ${(err as Error).message}`);
      return;
    }
    if (modelPromise) {
      try {
        const model = await modelPromise;
        this.view = new VehicleView(model);
        this.viewer.scene.add(this.view.group);
      } catch (err) {
        this.onError(`${t('vehicleFailed')}: ${(err as Error).message}`);
      }
    }
    this.setXray(this.xray);
  }

  async restart(): Promise<void> {
    this.starting = null;
    this.spawned = null;
    this.state = null;
    await this.start();
  }

  setXray(on: boolean): void {
    this.xray = on;
    const hasModel = !!this.view;
    this.debug.showBeams = on || !hasModel;
    this.debug.showNodes = on || !hasModel;
    if (this.view) this.view.visible = !on;
  }

  /** Per rendered frame: pose the model, follow with the camera, send the driver's input. */
  update(dt: number, frame: RenderFrame | null): void {
    if (!this.spawned || !frame) return;
    const v = frame.vehicles.find((x) => x.body === this.spawned!.body) ?? null;
    if (!v) return;
    this.state = v;
    this.view?.update(v);
    this.chase.update(dt, v);
    this.physics.setVehicleInput(this.spawned.vehicle, this.input.update(dt, v.speed));
    const logic = this.input.logic;
    this.dashboard.update(v, {
      manual: logic.manual,
      abs: logic.abs,
      tcs: logic.tcs,
      camera: this.chase.mode === 'chase' ? t('cameraChase') : t('cameraOrbit'),
    });
  }
}

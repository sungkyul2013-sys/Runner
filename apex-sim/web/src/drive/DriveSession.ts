// A driving session (M1e): the "drive" test ground, one vehicle from the catalogue, its GLB bound to the physics body,
// driver input, chase camera and dashboard.
import type { DriveVehicle } from './types';
import type { PhysicsClient, RenderFrame, SpawnedVehicle } from '../physics/PhysicsClient';
import type { VehiclePose } from '../physics/messages';
import { CHASSIS, type VehicleState } from '../physics/telemetry';
import type { DebugBodies } from '../render/DebugBodies';
import type { Viewer } from '../render/Viewer';
import { Dashboard } from '../ui/Dashboard';
import { t } from '../ui/i18n';
import { Debris, glassDebris, lampDebris } from '../vehicles/Debris';
import { Sparks } from '../vehicles/Sparks';
import type { Leaks } from '../vehicles/Leaks';
import type { Airbags } from '../vehicles/Airbags';
import { VehicleActor } from '../vehicles/VehicleActor';
import { spawnPoseOf, type VehicleView, type XrayMode } from './VehicleView';
import { SuspensionHud } from '../ui/SuspensionHud';
import { ChaseCamera } from './ChaseCamera';
import { DriveInput } from './DriveInput';
import { sound } from '../audio/Sound';

export const DRIVE_SCENE = 'drive';

export class DriveSession {
  readonly dashboard: Dashboard;
  readonly input = new DriveInput();
  private chase: ChaseCamera;
  private actor: VehicleActor;

  private xray: XrayMode = 'off';
  private readonly suspensionHud = new SuspensionHud();
  /** The x-ray mode changed (the shell's button shows it). */
  onXray: ((mode: XrayMode) => void) | null = null;
  private starting: Promise<void> | null = null;
  // Glass granules and lamp shards (§4.3 side-effect particles).
  readonly glassDebris: Debris = glassDebris();
  readonly lampDebris: Debris = lampDebris();
  readonly sparks = new Sparks();

  private active = true;
  /** The car's wheelbase has been measured (the steering limit's geometry). */
  private geometryKnown = false;
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
      else if (a === 'xray') this.cycleXray();
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

  /** The car where it stands as a spawn pose (on the ground — along the slope it stands on — lifted by `lift`); null
   *  before it is out. */
  currentPose(lift = 0.3): VehiclePose | null {
    return this.state ? spawnPoseOf(this.state, lift, true) : null;
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
    this.geometryKnown = false;
    this.chase.viewpoints = null; // measured again on the new car
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
    return this.xray !== 'off';
  }

  get xrayMode(): XrayMode {
    return this.xray;
  }

  /** X-ray, one step on: off → suspension → lattice → off. */
  cycleXray(): void {
    const order: XrayMode[] = ['off', 'suspension', 'lattice'];
    this.setXray(order[(order.indexOf(this.xray) + 1) % order.length]);
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
    this.suspensionHud.visible = on && this.xray === 'suspension';
    this.viewer.freeMove = !on;
    if (!on) {
      this.viewer.controls.enabled = true;
      this.chase.release();
    }
    else this.chase.reset();
  }

  /** The camera's name for the HUD and toasts. */
  get cameraLabel(): string {
    const m = this.chase.mode;
    return m === 'chase' ? t('cameraChase') : m === 'roof' ? t('cameraRoof') : m === 'hood' ? t('cameraHood') : m === 'bumper' ? t('cameraBumper') : t('cameraOrbit');
  }

  toggleCamera(): void {
    this.chase.toggle();
    this.onCamera?.(this.cameraLabel);
  }

  /** Called when the camera changes (the shell announces it). */
  onCamera: ((label: string) => void) | null = null;
  /** §9 electronic chassis notices (the lift dropped at speed, or the car has none). */
  onChassis: (event: 'liftDropped' | 'liftMissing') => void = () => {};

  /** `true` is the lattice view (the sandbox's x-ray toggle). */
  setXray(mode: XrayMode | boolean): void {
    const m: XrayMode = mode === true ? 'lattice' : mode === false ? 'off' : mode;
    const changed = m !== this.xray;
    this.xray = m;
    const hasModel = this.actor.hasModel;
    const lattice = m === 'lattice';
    if (this.manageDebug) {
      this.debug.showBeams = lattice || !hasModel;
      this.debug.showNodes = lattice || !hasModel;
    } else {
      this.debug.xray = lattice;
      if (this.actor.spawned && hasModel) this.debug.hidden.add(this.actor.spawned.body);
    }
    this.actor.setXray(m);
    this.suspensionHud.visible = m === 'suspension' && this.active;
    if (changed) this.onXray?.(m);
  }

  /** Per rendered frame: pose the model, follow with the camera, send the driver's input. */
  update(dt: number, frame: RenderFrame | null): void {
    const v = this.actor.update(dt, frame);
    this.state = v ?? null;
    if (!v || !this.actor.spawned) return;
    this.glassDebris.update(dt);
    this.lampDebris.update(dt);
    this.sparks.update(dt);
    const suspension = this.actor.view?.suspension;
    if (suspension) this.suspensionHud.update(suspension.travel);
    const stats = this.physics.latestStats();
    sound?.update(this.active ? v : null, stats?.timeScale ?? 1, stats?.paused ?? false);
    if (!this.active) {
      // Parked: handbrake on, foot on the brake.
      this.physics.setVehicleInput(this.actor.spawned.vehicle, { throttle: 0, brake: 1, steer: 0, handbrake: 1, mode: 0, shift: 0, abs: true, tcs: true, esc: true });
      return;
    }
    if (!this.holdCamera) {
      const short = innerHeight < 520 && innerWidth > innerHeight;
      if (!this.chase.viewpoints && this.actor.view) this.chase.viewpoints = this.actor.view.viewpoints();
      const portrait = innerHeight > innerWidth;
      // The car framed above the centred gauge (PC: the dial takes ≈ 23 % of the height at the bottom centre).
      const desktop = document.documentElement.dataset.ui === 'desktop';
      this.chase.lift = this.dashboard.root.hidden || this.dashboard.root.classList.contains('hud-off') ? 0 : short ? 0.15 : portrait ? 0.12 : desktop ? 0.17 : 0.1;
      this.chase.distanceScale = portrait ? 1.22 : 1;
      this.chase.update(dt, v);
    } else this.chase.release();
    const logic0 = this.input.logic;
    if (!this.geometryKnown && v.wheels.length >= 4) {
      // Wheelbase from the wheel centres along the chassis forward (the speed-sensitive steering limit uses it).
      const along = v.wheels.map((w) => w.center[0] * v.forward[0] + w.center[1] * v.forward[1] + w.center[2] * v.forward[2]);
      const mid = (Math.max(...along) + Math.min(...along)) / 2;
      const front = along.filter((a) => a > mid), rear = along.filter((a) => a <= mid);
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
      const wheelbase = mean(front) - mean(rear);
      if (wheelbase > 1.5 && wheelbase < 5) logic0.geometry = { wheelbase, lock: logic0.geometry.lock };
      this.geometryKnown = true;
    }
    // §9 lift: the car lowers it at speed (or has none): the request lapses, as the button's light goes out.
    if (logic0.lift && (!(v.chassisFlags & CHASSIS.lift) || (v.rideLevel !== 1 && Math.abs(v.speed) > 3))) {
      logic0.lift = false;
      this.onChassis(v.chassisFlags & CHASSIS.lift ? 'liftDropped' : 'liftMissing');
    }
    this.physics.setVehicleInput(this.actor.spawned.vehicle, this.input.update(dt, v.speed, v.yawRate));
    const logic = this.input.logic;
    this.input.touch?.feedback?.({
      throttle: v.throttle, brake: v.brake, steer: v.steer, gear: v.gear, reversing: logic.reversing, manual: logic.manual,
      tcs: v.tcs, abs: v.wheels.some((w) => w.abs), speed: v.speed,
    });
    this.dashboard.update(v, {
      manual: logic.manual,
      abs: logic.abs,
      tcs: logic.tcs,
      esc: logic.esc,
      chassisMode: logic.chassisMode,
      rtf: this.physics.latestStats()?.rtf ?? 1,
      camera: this.cameraLabel,
    });
  }
}

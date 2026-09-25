// Crash lab (M2 launch tool): scene "crash", one or two cars launched at set speeds into the barrier or into each
// other (scenario.ts), no driver (neutral, no brakes). Shows the collision event log (events.ts) and real-time
// energy and momentum graphs (§5.3), with slow motion from the time controls.
import * as THREE from 'three/webgpu';
import type { VehiclePreset } from '../app/presets';
import type { PhysicsClient, RenderFrame } from '../physics/PhysicsClient';
import type { VehicleInput } from '../physics/messages';
import type { DebugBodies } from '../render/DebugBodies';
import type { Viewer } from '../render/Viewer';
import { tl } from '../ui/i18n';
import { TimeGraph } from '../ui/TimeGraph';
import { Debris, glassDebris, lampDebris } from '../vehicles/Debris';
import { Sparks } from '../vehicles/Sparks';
import { VehicleActor } from '../vehicles/VehicleActor';
import { EventLog, type CollisionRow } from './events';
import { crashLaunch, type CrashSpec } from './scenario';
import { sound } from '../audio/Sound';
import { DumpTrucks, cameraPreset, type CameraPreset } from './CrashExtras';
import { spawnPoseOf } from '../drive/VehicleView';

export const CRASH_SCENE = 'crash';

/** One wheel's alignment and tyre state (§4.4 bent suspension, §6 tyre damage) for the crash lab's table. */
export interface WheelRow {
  car: string;
  wheel: string;
  camber: number; // [°] relative to the chassis, negative = top inward
  toe: number; // [°] positive = toe-in
  pressure: number; // [bar]
  flags: number; // TYRE bits
  bent: boolean; // camber or toe more than 1° off the vehicle's design alignment
}

const WHEEL_NAMES = ['FL', 'FR', 'RL', 'RR'];
const DEG = 180 / Math.PI;

const NEUTRAL: VehicleInput = { throttle: 0, brake: 0, steer: 0, handbrake: 0, mode: 2, shift: 0, abs: true, tcs: true };

export class CrashLab {
  readonly log = new EventLog();
  readonly glassDebris: Debris = glassDebris();
  readonly lampDebris: Debris = lampDebris();
  readonly sparks = new Sparks();
  readonly energyGraph = new TimeGraph('에너지 · Energy', [
    { label: '운동', color: '#3d8bff' },
    { label: '탄성·접촉', color: '#fbbf24' },
    { label: '소성·파단', color: '#ff6b2c' },
    { label: '감쇠·마찰·CCD', color: '#a78bfa' },
    { label: '수지 오차', color: '#f4475c' },
  ], 'kJ');
  readonly momentumGraph = new TimeGraph('운동량 · Momentum', [
    { label: 'pₓ', color: '#34d399' },
    { label: 'p_z', color: '#3d8bff' },
    { label: '|p|', color: '#f2f4f7' },
  ], 'kN·s');
  private actors: VehicleActor[] = [];
  private labels: string[] = [];
  private launching: Promise<void> | null = null;
  /** Follow camera: eases its orbit centre toward the cars' centre and backs off to keep them all in view. */
  follow = true;
  /** Camera locked: it stays exactly where it is (no following, no framing on launch, no orbiting). */
  private camLocked = false;
  private readonly trucks: DumpTrucks;
  private focus = new THREE.Vector3(0, 0.8, -4);
  private logChanged = false;
  onLog: ((rows: CollisionRow[]) => void) | null = null;
  onWheels: ((rows: WheelRow[]) => void) | null = null;
  private wheelTimer = 0;
  lastSpec: CrashSpec | null = null;

  constructor(
    private readonly physics: PhysicsClient,
    private readonly viewer: Viewer,
    private readonly debug: DebugBodies,
    private readonly onError: (message: string) => void,
  ) {
    viewer.scene.add(this.glassDebris.group, this.lampDebris.group, this.sparks.group);
    this.trucks = new DumpTrucks(physics, viewer.scene);
  }

  get cameraLocked(): boolean {
    return this.camLocked;
  }

  /** Locks or frees the camera (locked: the view stays put; nothing moves it, not even a drag). */
  setCameraLock(on: boolean): void {
    this.camLocked = on;
    this.viewer.controls.enabled = !on;
  }

  /** Moves the camera to a preset angle around the test's point of impact. */
  viewFrom(p: CameraPreset): void {
    const { position, target } = cameraPreset(p, this.focus);
    this.viewer.controls.target.copy(target);
    this.viewer.camera.position.copy(position);
    this.viewer.controls.update();
  }

  /** Repairs the cars where they stand (fresh cars in the same world; the old ones are retired below it). */
  async repair(): Promise<void> {
    for (const a of this.actors) {
      const s = a.state;
      if (!a.spawned || !s) continue;
      this.physics.retireFamily(a.spawned.body);
      const ok = await a.spawn(spawnPoseOf(s, 0.2), a.vehicle.id);
      if (ok) this.physics.setVehicleInput(a.spawned!.vehicle, NEUTRAL);
    }
    this.glassDebris.clear();
    this.lampDebris.clear();
    this.setXray(this.xray);
  }

  /** Camber, toe and tyre pressure of every wheel of the current run. */
  wheelRows(): WheelRow[] {
    const rows: WheelRow[] = [];
    this.actors.forEach((a, i) => {
      const v = a.state;
      if (!v) return;
      v.wheels.forEach((w, k) => rows.push({
        car: this.labels[i]?.split(' · ')[0] ?? String(i),
        wheel: WHEEL_NAMES[k] ?? String(k),
        camber: w.camber * DEG,
        toe: w.toe * DEG,
        pressure: w.pressure,
        flags: w.tyreFlags,
        bent: Math.abs(w.camber - w.camber0) * DEG > 1 || Math.abs(w.toe - w.toe0) * DEG > 1,
      }));
    });
    return rows;
  }

  /** Vehicles of the current run (tests). */
  get cars(): VehicleActor[] {
    return this.actors;
  }

  /** Launches a test; `staged`: the cars wait at their start marks at rest (the lab's opening view, a new pick). */
  launch(spec: CrashSpec, vehicleA: VehiclePreset, vehicleB: VehiclePreset, staged = false): Promise<void> {
    this.launching = this.run(spec, vehicleA, vehicleB, staged);
    return this.launching;
  }

  private runId = 0;

  private async run(spec: CrashSpec, vehicleA: VehiclePreset, vehicleB: VehiclePreset, staged: boolean): Promise<void> {
    const id = ++this.runId; // a newer launch supersedes this one (its spawns are dropped by the worker)
    this.lastSpec = spec;
    this.trucks.clear();
    // Hold the clock until every car is in place: the first car must not set off while the second one loads.
    this.physics.setPaused(true);
    this.physics.loadScene(CRASH_SCENE);
    this.log.clear();
    this.onLog?.([]);
    this.onWheels?.([]);
    this.energyGraph.clear();
    this.momentumGraph.clear();
    this.glassDebris.clear();
    this.lampDebris.clear();
    this.sparks.clear();
    const wanted = spec.kind === 'carToCar' ? [vehicleA, vehicleB] : [vehicleA];
    // Reuse a slot's actor (and its bound model) while its vehicle stays the same.
    for (let i = 0; i < Math.max(wanted.length, this.actors.length); i++) {
      const keep = i < wanted.length && this.actors[i]?.vehicle.id === wanted[i].id;
      if (!keep && this.actors[i]) this.actors[i].dispose();
      if (i < wanted.length && !keep) this.actors[i] = new VehicleActor(this.physics, this.viewer, wanted[i], { glass: this.glassDebris, lamp: this.lampDebris, sparks: this.sparks }, this.onError);
    }
    this.actors.length = wanted.length;
    const plan = crashLaunch(spec, vehicleA.crash, vehicleB.crash);
    this.labels = wanted.map((v, i) => `${i === 0 ? 'A' : 'B'} · ${tl(v.label)}`);
    // Staged: the same marks, standing still (a drop test's car waits on the ground under its drop point).
    const still = (p: typeof plan.a | null) => p && { ...p, speed: 0, velocity: undefined, position: [p.position[0], spec.kind === 'drop' ? 0 : p.position[1], p.position[2]] as typeof p.position };
    const poses = staged ? [still(plan.a), still(plan.b)] : [plan.a, plan.b];
    for (let i = 0; i < this.actors.length; i++) {
      const ok = await this.actors[i].spawn(poses[i]!, `${i === 0 ? 'A' : 'B'}:${wanted[i].id}`);
      if (id !== this.runId) return;
      if (ok) this.physics.setVehicleInput(this.actors[i].spawned!.vehicle, NEUTRAL);
    }
    if (id !== this.runId) return;
    if (spec.kind === 'crush' && !staged) this.trucks.start(0);
    this.physics.setPaused(false);
    this.focus.set(plan.focus[0], plan.focus[1], plan.focus[2]);
    // X-ray survives a launch: the reused and the new cars both follow it (the models see-through, beams shown).
    this.setXray(this.xray);
    this.viewer.freeMove = true;
    if (this.camLocked) return; // the camera stays where the player put it
    if (staged) {
      // The ready shot: behind and to the right of car A, the barrier (or the other car) beyond it.
      const a = poses[0]!.position;
      this.viewer.controls.target.set(a[0], 0.7, a[2]);
      const far = THREE.MathUtils.clamp(1.25 / (innerWidth / Math.max(innerHeight, 1)), 1, 2.2); // back off on narrow screens
      this.viewer.camera.position.set(a[0] + 3.8 * far, 1.9 * Math.sqrt(far), a[2] - 5.6 * far);
      this.viewer.controls.update();
      return;
    }
    // Start half way between the cars and the point of impact, looking across the run from the front right.
    const f = plan.focus;
    const starts = poses.slice(0, this.actors.length).map((p) => p!.position);
    const target = new THREE.Vector3(f[0], f[1], f[2]);
    for (const p of starts) target.add(new THREE.Vector3(p[0], 0.5, p[2]).multiplyScalar(1 / starts.length));
    target.multiplyScalar(0.5);
    this.viewer.controls.target.copy(target);
    this.viewer.camera.position.set(target.x + 7, target.y + 3.5, target.z - 5);
    this.viewer.controls.update();
  }

  /** Waits for the current launch to finish spawning (tests). */
  async ready(): Promise<void> {
    await this.launching;
  }

  private xray = false;

  setXray(on: boolean): void {
    this.xray = on;
    const hasModels = this.actors.length > 0 && this.actors.every((a) => a.hasModel);
    this.debug.showBeams = on || !hasModels;
    this.debug.showNodes = on || !hasModels;
    for (const a of this.actors) a.setXray(on);
  }

  private followCars(dt: number): void {
    const cars = this.actors.filter((a) => a.state).map((a) => a.state!.position);
    if (!this.follow || this.camLocked || cars.length === 0) return;
    const centre = new THREE.Vector3();
    for (const p of cars) centre.add(new THREE.Vector3(p[0], 0.5, p[2]));
    centre.divideScalar(cars.length);
    const { camera, controls } = this.viewer;
    const step = centre.sub(controls.target).multiplyScalar(1 - Math.exp(-dt / 0.6));
    controls.target.add(step);
    camera.position.add(step);
    let spread = 0;
    const c = controls.target;
    for (const p of cars) spread = Math.max(spread, Math.hypot(p[0] - c.x, p[2] - c.z));
    const offset = camera.position.clone().sub(controls.target);
    const want = 7 + 1.6 * spread;
    const dist = offset.length();
    if (dist < want) camera.position.copy(controls.target).addScaledVector(offset, Math.min(want, dist + 20 * dt) / dist);
  }

  update(dt: number, frame: RenderFrame | null): void {
    this.actors.forEach((a, i) => {
      const v = a.update(dt, frame);
      if (v && this.log.observe(this.labels[i], v)) this.logChanged = true;
    });
    this.glassDebris.update(dt);
    this.lampDebris.update(dt);
    this.sparks.update(dt);
    this.followCars(dt);
    const s = this.physics.latestStats();
    this.trucks.update(s?.simTime ?? 0, frame);
    sound?.update(this.actors[0]?.state ?? null, s?.timeScale ?? 1, s?.paused ?? false);
    if (s && this.actors.some((a) => a.state)) {
      const e = s.energy;
      this.energyGraph.push(s.simTime, [
        e.kinetic / 1e3,
        (e.beam + e.contact) / 1e3,
        (e.plastic + e.fracture) / 1e3,
        (e.beamDamping + e.contactDamping + e.friction + e.ccd) / 1e3,
        e.balance / 1e3,
      ]);
      const p = s.momentum.linear;
      this.momentumGraph.push(s.simTime, [p[0] / 1e3, p[2] / 1e3, Math.hypot(p[0], p[1], p[2]) / 1e3]);
    }
    this.energyGraph.draw();
    this.momentumGraph.draw();
    if (this.logChanged) {
      this.logChanged = false;
      this.onLog?.(this.log.rows());
    }
    this.wheelTimer += dt;
    if (this.wheelTimer >= 0.25) {
      this.wheelTimer = 0;
      this.onWheels?.(this.wheelRows());
    }
  }
}

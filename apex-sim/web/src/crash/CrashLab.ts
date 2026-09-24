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

export const CRASH_SCENE = 'crash';

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
  private logChanged = false;
  onLog: ((rows: CollisionRow[]) => void) | null = null;
  lastSpec: CrashSpec | null = null;

  constructor(
    private readonly physics: PhysicsClient,
    private readonly viewer: Viewer,
    private readonly debug: DebugBodies,
    private readonly onError: (message: string) => void,
  ) {
    viewer.scene.add(this.glassDebris.group, this.lampDebris.group, this.sparks.group);
  }

  /** Vehicles of the current run (tests). */
  get cars(): VehicleActor[] {
    return this.actors;
  }

  launch(spec: CrashSpec, vehicleA: VehiclePreset, vehicleB: VehiclePreset): Promise<void> {
    this.launching = this.run(spec, vehicleA, vehicleB);
    return this.launching;
  }

  private async run(spec: CrashSpec, vehicleA: VehiclePreset, vehicleB: VehiclePreset): Promise<void> {
    this.lastSpec = spec;
    // Hold the clock until every car is in place: the first car must not set off while the second one loads.
    this.physics.setPaused(true);
    this.physics.loadScene(CRASH_SCENE);
    this.log.clear();
    this.onLog?.([]);
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
    const poses = [plan.a, plan.b];
    for (let i = 0; i < this.actors.length; i++) {
      const ok = await this.actors[i].spawn(poses[i]!, `${i === 0 ? 'A' : 'B'}:${wanted[i].id}`);
      if (ok) this.physics.setVehicleInput(this.actors[i].spawned!.vehicle, NEUTRAL);
    }
    this.physics.setPaused(false);
    const hasModels = this.actors.every((a) => a.hasModel);
    this.debug.showBeams = !hasModels;
    this.debug.showNodes = !hasModels;
    this.viewer.freeMove = true;
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

  setXray(on: boolean): void {
    const hasModels = this.actors.length > 0 && this.actors.every((a) => a.hasModel);
    this.debug.showBeams = on || !hasModels;
    this.debug.showNodes = on || !hasModels;
    for (const a of this.actors) a.setXray(on);
  }

  private followCars(dt: number): void {
    const cars = this.actors.filter((a) => a.state).map((a) => a.state!.position);
    if (!this.follow || cars.length === 0) return;
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
  }
}

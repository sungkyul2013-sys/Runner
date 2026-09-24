// One vehicle in a session (driving, crash tests): its physics vehicle, its GLB bound to the node cage (flexbody),
// and the damage it shows — glass and lamp debris, fluid leaks, airbags, dark lamps on failed electrics (§4.3, §4.4).
import type { PhysicsClient, RenderFrame, SpawnedVehicle } from '../physics/PhysicsClient';
import type { VehiclePose } from '../physics/messages';
import { FAULT, type VehicleState } from '../physics/telemetry';
import type { Viewer } from '../render/Viewer';
import type { VehiclePreset } from '../app/presets';
import { t } from '../ui/i18n';
import { VehicleView } from '../drive/VehicleView';
import { Airbags, type AirbagDef } from './Airbags';
import { decodeDamage, type DamageGroupDef } from './Damage';
import type { Debris } from './Debris';
import { vehicleCage, type CageNode, type VehicleJsonNode, type VehiclePartDef } from './Flexbody';
import { Leaks } from './Leaks';
import { LooseParts } from './LooseParts';
import type { Sparks } from './Sparks';
import { loadVehicleModel } from './VehicleModel';

export class VehicleActor {
  view: VehicleView | null = null;
  spawned: SpawnedVehicle | null = null;
  state: VehicleState | null = null;
  leaks: Leaks | null = null; // coolant, oil and fuel drips and stains (§4.4)
  airbags: Airbags | null = null;
  readonly loose = new LooseParts(); // torn-off parts the model does not cover (a shredded tyre's carcass)
  private looseVersion = -1;
  private xray = false;

  constructor(
    private readonly physics: PhysicsClient,
    private readonly viewer: Viewer,
    readonly vehicle: VehiclePreset,
    private readonly debris: { glass: Debris; lamp: Debris; sparks?: Sparks },
    private readonly onError: (message: string) => void,
  ) {
    physics.onDamage(({ body, status }) => {
      if (this.spawned && body === this.spawned.body) this.view?.flexbody?.setDamage(decodeDamage(status));
    });
  }

  get hasModel(): boolean {
    return !!this.view;
  }

  /** Spawns the vehicle in the current world (after a scene load). The model is loaded and bound once; a respawn
   *  rebinds it to the new body with every pane and lamp intact. */
  async spawn(pose: VehiclePose, label = this.vehicle.id): Promise<boolean> {
    this.spawned = null;
    this.state = null;
    this.leaks?.clear();
    this.airbags?.reset();
    const modelPromise = this.vehicle.model && !this.view ? loadVehicleModel(this.vehicle.model) : null;
    // Worker URLs resolve against the worker script, not the page: send an absolute one.
    const src = this.vehicle.source;
    const source = src.kind === 'json' ? { kind: 'json' as const, url: new URL(src.url, document.baseURI).href } : src;
    const docPromise = modelPromise && source.kind === 'json' ? loadVehicleDoc(source.url) : Promise.resolve(null);
    try {
      this.spawned = await this.physics.spawnVehicle(source, pose, label);
    } catch (err) {
      this.onError(`${t('vehicleFailed')}: ${(err as Error).message}`);
      return false;
    }
    if (modelPromise) {
      try {
        const [model, doc] = await Promise.all([modelPromise, docPromise]);
        this.view = new VehicleView(model, doc?.cage ?? null, this.spawned.body,
          doc ? { defs: doc.damageGroups, nodeRest: doc.nodeRest, parts: doc.parts } : null);
        this.viewer.scene.add(this.view.group, this.loose.group);
        if (doc) {
          this.leaks = new Leaks(doc.damageGroups);
          this.viewer.scene.add(this.leaks.group);
          this.airbags = new Airbags(doc.airbags);
          model.root.add(this.airbags.group); // rides on the chassis frame
        }
        const known = this.physics.damage.get(this.spawned.body);
        if (known) this.view.flexbody?.setDamage(decodeDamage(known.status));
        if (this.view.flexbody) {
          this.view.flexbody.onBreak = (kind, points, velocities, colors) =>
            (kind === 'glass' ? this.debris.glass : this.debris.lamp).spawn(points, velocities, kind === 'glass' ? 1.2 : 1.8, kind === 'lamp' ? colors : undefined);
        }
      } catch (err) {
        this.onError(`${t('vehicleFailed')}: ${(err as Error).message}`);
      }
    } else {
      this.view?.flexbody?.rebind(this.spawned.body); // respawned into a fresh world (same vehicle, same node order)
      this.view?.flexbody?.setDamage([]);             // a new car: every pane and lamp intact
    }
    this.setXray(this.xray);
    return true;
  }

  /** Removes the model and its effects from the scene (the physics world is replaced by the next scene load). */
  dispose(): void {
    this.view?.group.removeFromParent();
    this.leaks?.dispose();
    this.loose.dispose();
    this.view = null;
    this.spawned = null;
    this.state = null;
  }

  setXray(on: boolean): void {
    this.xray = on;
    if (this.view) this.view.visible = !on;
    this.loose.group.visible = !on; // x-ray shows every node anyway
  }

  /** Per rendered frame: the vehicle's latest state, its model posed and its damage shown. Null before it exists. */
  update(dt: number, frame: RenderFrame | null): VehicleState | null {
    if (!this.spawned || !frame) return null;
    const v = frame.vehicles.find((x) => x.body === this.spawned!.body) ?? null;
    if (!v) return null;
    this.state = v;
    this.view?.update(v, frame, (b, n) => this.physics.locate(b, n), this.physics.islandVersion);
    const known = this.physics.damage.get(this.spawned.body);
    this.leaks?.update(dt, v, known ? decodeDamage(known.status) : null);
    this.airbags?.update(v.airbags, dt);
    if (this.view?.flexbody) this.view.flexbody.lights = (v.faults & FAULT.electrical) === 0;
    // §6 rim sparks: from each scraping rim, thrown back along the road at about half the car's speed.
    const sparks = this.debris.sparks;
    if (sparks) {
      const base: [number, number, number] = [v.forward[0] * v.speed * 0.5, v.forward[1] * v.speed * 0.5, v.forward[2] * v.speed * 0.5];
      for (const w of v.wheels) if (w.sparks > 0.01) sparks.emit(w.sparkPoint, base, w.sparks, dt);
    }
    // Loose parts: re-found when the islands change (the flexbody has located its cage by now).
    if (this.view && this.physics.islandVersion !== this.looseVersion) {
      this.looseVersion = this.physics.islandVersion;
      this.loose.setBodies(LooseParts.find(this.physics.topology, this.spawned.body, this.view.flexbody?.bodies ?? new Set([this.spawned.body])));
    }
    this.loose.update(frame, this.physics.topology);
    return v;
  }
}

/** What the renderer needs from an apex-vehicle JSON document: the flexbody cage (chassis lattice and hinged panels),
 *  the damage groups (glass, lamps, components), the hinged panels, the airbags and the nodes' rest positions (model
 *  frame). */
export async function loadVehicleDoc(url: string): Promise<{
  cage: CageNode[];
  parts: VehiclePartDef[];
  damageGroups: DamageGroupDef[];
  airbags: AirbagDef[];
  nodeRest: (i: number) => [number, number, number];
} | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const doc = (await response.json()) as {
    nodes?: VehicleJsonNode[];
    damageGroups?: DamageGroupDef[];
    visual?: { airbags?: AirbagDef[]; parts?: VehiclePartDef[] };
  };
  if (!doc.nodes) return null;
  const nodes = doc.nodes;
  const parts = doc.visual?.parts ?? [];
  return {
    cage: vehicleCage(nodes, parts),
    parts,
    damageGroups: doc.damageGroups ?? [],
    airbags: doc.visual?.airbags ?? [],
    nodeRest: (i) => (nodes[i] ? [nodes[i][1], nodes[i][2], nodes[i][3]] : [0, 0, 0]),
  };
}

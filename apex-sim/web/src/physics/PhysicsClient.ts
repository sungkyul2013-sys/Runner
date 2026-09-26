// Main-thread side of the physics worker: commands out, interpolated frames in (A§2).
import type { MapPhysics } from '../world/types';
import {
  B,
  BODY_STRIDE_F64,
  createControl,
  ENERGY_FIELDS,
  H,
  SLOT_BYTES,
  slotViews,
  TripleBufferReader,
  VT_STRIDE,
  type EnergyField,
  type SlotViews,
} from './layout';
import type { BodyTopology, FromWorker, TetherDesc, TetherState, ToWorker, Transport, VehicleInput, VehiclePose, VehicleSource } from './messages';
import { packLattice, type LatticeParams } from './sbc';
import { blendVehicle, decodeVehicle, VT, type VehicleState } from './telemetry';

export interface SpawnedVehicle {
  vehicle: number;
  body: number;
  wheels: number;
}

export interface FrameStats {
  simTime: number;
  stepIndex: number;
  rtf: number;
  stepMs: number;
  paused: boolean;
  timeScale: number;
  overloaded: boolean;
  bodies: number;
  nodes: number;
  beams: number;
  staticContacts: number;
  bodyContacts: number;
  ccdClamps: number;
  wasmMemoryMB: number;
  energy: Record<EnergyField, number>;
  momentum: { linear: [number, number, number]; angular: [number, number, number] };
  hash: string;
}

/** One physics frame copied out of a published slot (world positions relative to the render origin). */
interface Frame {
  arrival: number; // performance.now() when the main thread received it
  simTime: number;
  bodyCount: number;
  nodeOffset: Int32Array;
  nodeCount: Int32Array;
  beamOffset: Int32Array;
  beamCount: Int32Array;
  positions: Float32Array; // world − renderOrigin, xyz
  strain: Float32Array;
  vehicles: VehicleState[];
}

export interface RenderFrame {
  bodyCount: number;
  nodeOffset: Int32Array;
  nodeCount: Int32Array;
  beamOffset: Int32Array;
  beamCount: Int32Array;
  positions: Float32Array; // interpolated
  strain: Float32Array;
  vehicles: VehicleState[]; // interpolated poses
}

type Listener<T> = (value: T) => void;

export class PhysicsClient {
  readonly topology: BodyTopology[] = [];
  /** Bumped whenever nodes move to a split-off body (consumers of `locate` re-resolve). */
  islandVersion = 0;
  private moved = new Map<number, Map<number, [number, number]>>(); // body → node → [part body, part node]
  staticTriangles: Float32Array = new Float32Array(0);
  staticMaterials: Uint8Array = new Uint8Array(0); // core material id per static triangle
  threads = 1;
  /** Rendering is done relative to this world point (floating origin for large maps, M6). */
  renderOrigin: [number, number, number] = [0, 0, 0];

  readonly transport: Transport;
  private worker: Worker;
  private reader: TripleBufferReader | null = null;
  private slots: SlotViews[] = [];
  private arrived: ArrayBuffer | null = null; // message transport: newest frame not yet consumed
  /** Recent frames, oldest first (the playback clock blends the two that bracket it). */
  private history: Frame[] = [];
  private spare: Frame[] = [];
  /** Playback clock in sim time, its rate (sim s per wall s, measured) and the wall time of the last update. */
  private playTime = -1;
  private playRate = 1;
  private lastUpdate = 0;
  private render: RenderFrame | null = null;
  private stats: FrameStats | null = null;
  /** Latest damage-group state per body (§4.3, §4.4): group ids and 8 floats per group (sbc_body_damage_groups). */
  readonly damage = new Map<number, { ids: string[]; status: Float32Array }>();
  private listeners = {
    damage: [] as Listener<{ body: number; ids: string[]; status: Float32Array }>[],
    topology: [] as Listener<{ reset: boolean; added: BodyTopology[] }>[],
    stability: [] as Listener<Extract<FromWorker, { type: 'stability' }>>[],
    error: [] as Listener<string>[],
  };
  private pending = new Map<string, (msg: FromWorker) => void>();
  private vehicleRequests = new Map<number, { resolve: (v: SpawnedVehicle) => void; reject: (e: Error) => void }>();
  private tetherRequests = new Map<number, (id: number) => void>();
  /** Active tethers (§20 grab, crane / winch), render space; refreshed with the published frames. */
  tethers: TetherState[] = [];
  private nextRequest = 1;

  /** True when the page may share memory with the worker (cross-origin isolated): threaded WASM + SAB frames. */
  static isSupported(): boolean {
    return typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true;
  }

  static defaultTransport(): Transport {
    return PhysicsClient.isSupported() ? 'shared' : 'message';
  }

  /** `wasmUrl` must match the transport: the threaded module for 'shared', the single-thread one for 'message'. */
  constructor(private readonly wasmUrl: string, threads: number, transport: Transport = PhysicsClient.defaultTransport()) {
    this.transport = transport;
    this.worker = new Worker(new URL('./physics.worker.ts', import.meta.url), { type: 'module', name: 'physics' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(e.data);
    this.worker.onerror = (e) => this.listeners.error.forEach((l) => l(e.message));
    if (transport === 'shared') {
      const ctrl = createControl(true);
      const slotBuffers = [0, 1, 2].map(() => new SharedArrayBuffer(SLOT_BYTES));
      this.slots = slotBuffers.map((b) => slotViews(b));
      this.reader = new TripleBufferReader(ctrl);
      this.send({ type: 'init', transport, ctrl: ctrl.buffer as SharedArrayBuffer, slots: slotBuffers, wasmUrl: this.wasmUrl, threads });
    } else {
      // Slots travel by transfer; the worker allocates more (up to a small cap) while these are in flight.
      const slotBuffers = [0, 1].map(() => new ArrayBuffer(SLOT_BYTES));
      this.send({ type: 'init', transport, ctrl: null, slots: slotBuffers, wasmUrl: this.wasmUrl, threads: 1 }, slotBuffers);
    }
  }

  onTopology(l: Listener<{ reset: boolean; added: BodyTopology[] }>) { this.listeners.topology.push(l); }
  onDamage(l: Listener<{ body: number; ids: string[]; status: Float32Array }>) { this.listeners.damage.push(l); }

  /** Where a node is now: [body, node]. Parts that broke loose took their nodes into new bodies (§4.3 island split). */
  locate(body: number, node: number): [number, number] {
    for (let hop = 0; hop < 64; hop++) {
      const next = this.moved.get(body)?.get(node);
      if (!next) break;
      [body, node] = next;
    }
    return [body, node];
  }
  onStability(l: Listener<Extract<FromWorker, { type: 'stability' }>>) { this.listeners.stability.push(l); }
  onError(l: Listener<string>) { this.listeners.error.push(l); }

  ready(): Promise<void> {
    return new Promise((resolve) => this.pending.set('ready', () => resolve()));
  }

  /** Retires a body and the parts that broke off it: they park below the world and stop (a car replaced by a fresh
   *  one without rebuilding the world — repair, reset, car change). */
  retireFamily(body: number): void {
    this.send({ type: 'retire', body });
  }

  /** Sends a spawned car, with the damage it has, into another run from `pose` (see messages.ts 'relaunch'). */
  relaunchVehicle(vehicle: number, pose: VehiclePose, floorY = 0): void {
    this.resetPlayback(); // no frame blended between the wreck's last place and its start mark
    this.send({ type: 'relaunch', vehicle, pose, floorY });
  }

  loadScene(name: string, bodies?: number): void {
    this.resetPlayback();
    this.send({ type: 'scene', name, bodies });
  }
  /** Stores an open-world map (§13) in the worker: every loadScene('map') builds a world from it (start, resets,
   *  teleports). */
  loadMap(physics: MapPhysics, lattices: LatticeParams[] = []): void {
    this.send({ type: 'map', physics, lattices: lattices.map(packLattice) });
  }
  /** Weather: static surfaces of the first material act as the second (asphalt → wet asphalt …). */
  setMaterialRemap(pairs: Array<[number, number]>): void {
    this.send({ type: 'remap', pairs });
  }
  setWind(x: number, y: number, z: number): void {
    this.send({ type: 'wind', wind: [x, y, z] });
  }
  spawnLattice(params: LatticeParams, label: string): void {
    this.send({ type: 'spawnLattice', params: packLattice(params), label });
  }
  /** Spawns a vehicle; resolves once the core accepted it (its body arrives through the topology listener). */
  spawnVehicle(source: VehicleSource, pose: VehiclePose, label: string): Promise<SpawnedVehicle> {
    const request = this.nextRequest++;
    return new Promise((resolve, reject) => {
      this.vehicleRequests.set(request, { resolve, reject });
      this.send({ type: 'spawnVehicle', request, source, pose, label });
    });
  }
  setVehicleInput(vehicle: number, input: VehicleInput): void {
    this.send({ type: 'vehicleInput', vehicle, input });
  }
  /** Ties a node to an anchor (§20); `desc.anchor` in render space. Resolves to the tether id (−1: rejected). */
  addTether(desc: TetherDesc): Promise<number> {
    const request = this.nextRequest++;
    const [rx, ry, rz] = this.renderOrigin;
    const anchor: [number, number, number] = [desc.anchor[0] + rx, desc.anchor[1] + ry, desc.anchor[2] + rz];
    return new Promise((resolve) => {
      this.tetherRequests.set(request, resolve);
      this.send({ type: 'tether', request, desc: { ...desc, anchor } });
    });
  }
  /** Moves a tether's world-point anchor (render space). */
  moveTether(id: number, anchor: [number, number, number]): void {
    const [rx, ry, rz] = this.renderOrigin;
    this.send({ type: 'tetherAnchor', id, anchor: [anchor[0] + rx, anchor[1] + ry, anchor[2] + rz] });
  }
  setTetherLength(id: number, length: number): void { this.send({ type: 'tetherLength', id, length }); }
  removeTether(id: number): void { this.send({ type: 'tetherRemove', id }); }
  setPaused(paused: boolean): void { this.send({ type: 'setPaused', paused }); }
  setTimeScale(scale: number): void { this.send({ type: 'setTimeScale', scale }); }

  step(steps: number): Promise<number> {
    return new Promise((resolve) => {
      this.pending.set('stepped', (m) => resolve((m as Extract<FromWorker, { type: 'stepped' }>).stepIndex));
      this.send({ type: 'step', steps });
    });
  }

  hash(): Promise<{ stepIndex: number; hex: string }> {
    return new Promise((resolve) => {
      this.pending.set('hash', (m) => resolve(m as Extract<FromWorker, { type: 'hash' }>));
      this.send({ type: 'hash' });
    });
  }

  private resetPlayback(): void {
    this.spare.push(...this.history);
    this.history = [];
    this.playTime = -1;
  }

  /**
   * Pulls the newest physics frame (if any) and returns positions for `now`. Frames arrive unevenly (the worker
   * publishes every few ms, the display samples at its own rate), so they are not shown as they come: a playback
   * clock runs in sim time at the measured sim rate, a little behind the newest frame, and the two frames around it
   * are blended. Every displayed pose is then a blend of two real states taken at an even pace (no extrapolation, no
   * judder from the publish cadence).
   */
  update(now: number): RenderFrame | null {
    const wallDt = this.lastUpdate > 0 ? Math.min((now - this.lastUpdate) / 1000, 0.25) : 0;
    this.lastUpdate = now;
    const fresh = this.acquire();
    if (fresh) {
      const last = this.history[this.history.length - 1];
      const frame = this.copyFrame(fresh, now, this.spare.pop() ?? null);
      this.stats = this.readStats(fresh);
      this.release();
      if (last && (frame.simTime < last.simTime || frame.bodyCount < last.bodyCount)) this.resetPlayback(); // new scene / reset
      else if (last && frame.simTime > last.simTime && frame.arrival > last.arrival) {
        const rate = (frame.simTime - last.simTime) / ((frame.arrival - last.arrival) / 1000);
        this.playRate += (Math.min(rate, 4) - this.playRate) * 0.15;
      }
      if (last && frame.simTime === last.simTime) this.spare.push(this.history.pop()!); // paused: keep the newest only
      this.history.push(frame);
      while (this.history.length > 5) this.spare.push(this.history.shift()!);
    }
    const hist = this.history;
    const cur = hist[hist.length - 1];
    if (!cur) return null;
    if (this.stats?.paused) this.playRate = 0;
    // Aim a bit more than one publish interval behind the newest frame, in sim time at the current rate.
    const target = cur.simTime - 0.022 * Math.max(this.playRate, 0.05);
    if (this.playTime < 0 || Math.abs(target - this.playTime) > 0.25 * Math.max(this.playRate, 0.05)) this.playTime = target;
    else this.playTime += wallDt * this.playRate + (target - this.playTime) * Math.min(1, wallDt * 4);
    this.playTime = Math.min(Math.max(this.playTime, hist[0].simTime), cur.simTime);
    let i = hist.length - 1;
    while (i > 0 && hist[i - 1].simTime > this.playTime) i--;
    const b = hist[i];
    const a = i > 0 ? hist[i - 1] : null;
    if (!this.render || this.render.positions.length < b.positions.length) {
      this.render = { ...b, positions: new Float32Array(b.positions.length) };
    }
    const r = this.render;
    r.bodyCount = b.bodyCount;
    r.nodeOffset = b.nodeOffset;
    r.nodeCount = b.nodeCount;
    r.beamOffset = b.beamOffset;
    r.beamCount = b.beamCount;
    r.strain = b.strain;
    r.vehicles = b.vehicles;
    const n = b.positions.length;
    const alpha = a && b.simTime > a.simTime ? Math.min(Math.max((this.playTime - a.simTime) / (b.simTime - a.simTime), 0), 1) : 1;
    if (!a || alpha >= 1 || a.positions.length !== n) {
      r.positions.set(b.positions.subarray(0, n));
    } else {
      const pa = a.positions, pb = b.positions, out = r.positions;
      for (let k = 0; k < n; k++) out[k] = pa[k] + (pb[k] - pa[k]) * alpha;
      r.vehicles = b.vehicles.map((v, k) => (k < a.vehicles.length && a.vehicles[k].body === v.body ? blendVehicle(a.vehicles[k], v, alpha) : v));
    }
    return r;
  }

  /** The newest published slot, if one arrived since the last call. */
  private acquire(): SlotViews | null {
    if (this.reader) return this.reader.acquire() ? this.slots[this.reader.slot] : null;
    return this.arrived ? slotViews(this.arrived) : null;
  }

  /** Message transport: hands the consumed slot back to the worker (shared slots need nothing). */
  private release(): void {
    if (!this.arrived) return;
    const buffer = this.arrived;
    this.arrived = null;
    this.send({ type: 'returnSlot', buffer }, [buffer]);
  }

  latestStats(): FrameStats | null {
    return this.stats;
  }

  private copyFrame(s: SlotViews, now: number, recycle: Frame | null): Frame {
    const count = s.header[H.bodyCount];
    const totalNodes = s.header[H.totalNodes];
    const totalBeams = s.header[H.totalBeams];
    const f: Frame =
      recycle && recycle.positions.length === totalNodes * 3 && recycle.strain.length === totalBeams && recycle.bodyCount === count
        ? recycle
        : {
            arrival: 0,
            simTime: 0,
            bodyCount: count,
            nodeOffset: new Int32Array(count),
            nodeCount: new Int32Array(count),
            beamOffset: new Int32Array(count),
            beamCount: new Int32Array(count),
            positions: new Float32Array(totalNodes * 3),
            strain: new Float32Array(totalBeams),
            vehicles: [],
          };
    f.arrival = now;
    f.simTime = s.header[H.simTime];
    const [rx, ry, rz] = this.renderOrigin;
    for (let b = 0; b < count; b++) {
      const row = b * BODY_STRIDE_F64;
      const nodeOffset = s.bodies[row + B.nodeOffset];
      const nodeCount = s.bodies[row + B.nodeCount];
      f.nodeOffset[b] = nodeOffset;
      f.nodeCount[b] = nodeCount;
      f.beamOffset[b] = s.bodies[row + B.beamOffset];
      f.beamCount[b] = s.bodies[row + B.beamCount];
      // Body origin (double) − render origin, then add the float local coordinates.
      const ox = s.bodies[row + B.originX] - rx;
      const oy = s.bodies[row + B.originY] - ry;
      const oz = s.bodies[row + B.originZ] - rz;
      const src = s.positions, dst = f.positions;
      for (let i = nodeOffset * 3, end = (nodeOffset + nodeCount) * 3; i < end; i += 3) {
        dst[i] = ox + src[i];
        dst[i + 1] = oy + src[i + 1];
        dst[i + 2] = oz + src[i + 2];
      }
    }
    f.strain.set(s.strain.subarray(0, totalBeams));
    f.vehicles = [];
    for (let v = 0, n = s.header[H.vehicleCount] || 0; v < n; v++) {
      const record = s.vehicles.subarray(v * VT_STRIDE, (v + 1) * VT_STRIDE);
      const body = Math.round(record[VT.body]);
      if (body < 0 || body >= count) continue;
      const row = body * BODY_STRIDE_F64;
      f.vehicles.push(decodeVehicle(record, [s.bodies[row + B.originX] - rx, s.bodies[row + B.originY] - ry, s.bodies[row + B.originZ] - rz], [rx, ry, rz]));
    }
    return f;
  }

  private readStats(s: SlotViews): FrameStats {
    const h = s.header;
    const energy = {} as Record<EnergyField, number>;
    ENERGY_FIELDS.forEach((k, i) => (energy[k] = h[H.energy + i]));
    return {
      simTime: h[H.simTime],
      stepIndex: h[H.stepIndex],
      rtf: h[H.rtf],
      stepMs: h[H.stepMs],
      paused: h[H.paused] === 1,
      timeScale: h[H.timeScale],
      overloaded: h[H.overloaded] === 1,
      bodies: h[H.bodyCount],
      nodes: h[H.totalNodes],
      beams: h[H.totalBeams],
      staticContacts: h[H.staticContacts],
      bodyContacts: h[H.bodyContacts],
      ccdClamps: h[H.ccdClamps],
      wasmMemoryMB: h[H.wasmMemoryMB],
      energy,
      momentum: {
        linear: [h[H.momentum], h[H.momentum + 1], h[H.momentum + 2]],
        angular: [h[H.momentum + 3], h[H.momentum + 4], h[H.momentum + 5]],
      },
      hash: (h[H.hashHi] >>> 0).toString(16).padStart(8, '0') + (h[H.hashLo] >>> 0).toString(16).padStart(8, '0'),
    };
  }

  private onMessage(msg: FromWorker): void {
    switch (msg.type) {
      case 'ready':
        this.threads = msg.threads;
        break;
      case 'frame':
        // A newer frame supersedes an unconsumed one: that slot goes straight back.
        if (this.arrived) this.release();
        this.arrived = msg.buffer;
        break;
      case 'topology':
        if (msg.reset) {
          this.topology.length = 0;
          this.damage.clear();
          this.moved.clear();
          this.tethers = [];
          this.islandVersion++;
        }
        for (const t of msg.bodies) {
          this.topology[t.index] = t;
          if (t.source < 0 || !t.sourceNodes) continue;
          let m = this.moved.get(t.source);
          if (!m) this.moved.set(t.source, (m = new Map()));
          t.sourceNodes.forEach((from, k) => m!.set(from, [t.index, k]));
          this.islandVersion++;
        }
        this.staticTriangles = msg.staticTriangles;
        this.staticMaterials = msg.staticMaterials;
        this.listeners.topology.forEach((l) => l({ reset: msg.reset, added: msg.bodies }));
        break;
      case 'stability':
        this.listeners.stability.forEach((l) => l(msg));
        break;
      case 'error':
        this.listeners.error.forEach((l) => l(msg.message));
        break;
      case 'vehicle': {
        const r = this.vehicleRequests.get(msg.request);
        this.vehicleRequests.delete(msg.request);
        r?.resolve({ vehicle: msg.vehicle, body: msg.body, wheels: msg.wheels });
        break;
      }
      case 'vehicleFailed': {
        const r = this.vehicleRequests.get(msg.request);
        this.vehicleRequests.delete(msg.request);
        r?.reject(new Error(msg.message));
        break;
      }
      case 'tether': {
        const r = this.tetherRequests.get(msg.request);
        this.tetherRequests.delete(msg.request);
        r?.(msg.id);
        break;
      }
      case 'tethers': {
        const [rx, ry, rz] = this.renderOrigin;
        const local = (p: [number, number, number]): [number, number, number] => [p[0] - rx, p[1] - ry, p[2] - rz];
        this.tethers = msg.states.map((t) => ({ ...t, nodePosition: local(t.nodePosition), anchorPosition: local(t.anchorPosition) }));
        break;
      }
      case 'damage':
        this.damage.set(msg.body, { ids: msg.ids, status: msg.status });
        this.listeners.damage.forEach((l) => l(msg));
        break;
      default:
        break;
    }
    const waiter = this.pending.get(msg.type);
    if (waiter) {
      this.pending.delete(msg.type);
      waiter(msg);
    }
  }

  private send(msg: ToWorker, transfer: Transferable[] = []): void {
    this.worker.postMessage(msg, transfer);
  }
}

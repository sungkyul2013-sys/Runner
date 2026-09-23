// Main-thread side of the physics worker: commands out, interpolated frames in (A§2).
import {
  B,
  BODY_STRIDE_F64,
  createControl,
  ENERGY_FIELDS,
  H,
  SLOT_BYTES,
  slotViews,
  TripleBufferReader,
  type EnergyField,
  type SlotViews,
} from './layout';
import type { BodyTopology, FromWorker, ToWorker } from './messages';
import { packLattice, type LatticeParams } from './sbc';

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
  hash: string;
}

/** One physics frame copied out of shared memory (world positions relative to the render origin). */
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
}

export interface RenderFrame {
  bodyCount: number;
  nodeOffset: Int32Array;
  nodeCount: Int32Array;
  beamOffset: Int32Array;
  beamCount: Int32Array;
  positions: Float32Array; // interpolated
  strain: Float32Array;
}

type Listener<T> = (value: T) => void;

export class PhysicsClient {
  readonly topology: BodyTopology[] = [];
  staticTriangles: Float32Array = new Float32Array(0);
  threads = 1;
  /** Rendering is done relative to this world point (floating origin for large maps, M6). */
  renderOrigin: [number, number, number] = [0, 0, 0];

  private worker: Worker;
  private reader: TripleBufferReader;
  private slots: SlotViews[];
  private prev: Frame | null = null;
  private cur: Frame | null = null;
  private render: RenderFrame | null = null;
  private stats: FrameStats | null = null;
  private listeners = {
    topology: [] as Listener<{ reset: boolean; added: BodyTopology[] }>[],
    stability: [] as Listener<Extract<FromWorker, { type: 'stability' }>>[],
    error: [] as Listener<string>[],
  };
  private pending = new Map<string, (msg: FromWorker) => void>();

  static isSupported(): boolean {
    return typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true;
  }

  constructor(private readonly wasmUrl: string, threads: number) {
    const ctrl = createControl(true);
    const slotBuffers = [0, 1, 2].map(() => new SharedArrayBuffer(SLOT_BYTES));
    this.slots = slotBuffers.map((b) => slotViews(b));
    this.reader = new TripleBufferReader(ctrl);
    this.worker = new Worker(new URL('./physics.worker.ts', import.meta.url), { type: 'module', name: 'physics' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(e.data);
    this.worker.onerror = (e) => this.listeners.error.forEach((l) => l(e.message));
    this.send({ type: 'init', ctrl: ctrl.buffer as SharedArrayBuffer, slots: slotBuffers, wasmUrl: this.wasmUrl, threads });
  }

  onTopology(l: Listener<{ reset: boolean; added: BodyTopology[] }>) { this.listeners.topology.push(l); }
  onStability(l: Listener<Extract<FromWorker, { type: 'stability' }>>) { this.listeners.stability.push(l); }
  onError(l: Listener<string>) { this.listeners.error.push(l); }

  ready(): Promise<void> {
    return new Promise((resolve) => this.pending.set('ready', () => resolve()));
  }

  loadScene(name: string, bodies?: number): void {
    this.prev = this.cur = null;
    this.send({ type: 'scene', name, bodies });
  }
  spawnLattice(params: LatticeParams, label: string): void {
    this.send({ type: 'spawnLattice', params: packLattice(params), label });
  }
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

  /** Pulls the newest physics frame (if any) and returns positions interpolated for `now`. */
  update(now: number): RenderFrame | null {
    if (this.reader.acquire()) {
      const frame = this.copyFrame(this.slots[this.reader.slot], now, this.prev);
      this.prev = this.cur;
      this.cur = frame;
      this.stats = this.readStats(this.slots[this.reader.slot]);
    }
    const cur = this.cur;
    if (!cur) return null;
    const prev = this.prev && this.prev.bodyCount <= cur.bodyCount ? this.prev : null;
    if (!this.render || this.render.positions.length < cur.positions.length) {
      this.render = { ...cur, positions: new Float32Array(cur.positions.length) };
    }
    const r = this.render;
    r.bodyCount = cur.bodyCount;
    r.nodeOffset = cur.nodeOffset;
    r.nodeCount = cur.nodeCount;
    r.beamOffset = cur.beamOffset;
    r.beamCount = cur.beamCount;
    r.strain = cur.strain;
    // Present the physics state one frame interval late so every displayed position is a blend of two real
    // simulation states (no extrapolation → no overshoot through walls).
    let alpha = 1;
    if (prev && cur.simTime > prev.simTime) {
      const interval = cur.arrival - prev.arrival;
      alpha = interval > 0 ? Math.min(Math.max((now - cur.arrival) / interval, 0), 1) : 1;
    }
    const n = cur.positions.length;
    if (!prev || alpha >= 1) {
      r.positions.set(cur.positions.subarray(0, n));
    } else {
      const a = prev.positions, c = cur.positions, out = r.positions;
      const prevLen = prev.nodeOffset.length ? prev.positions.length : 0;
      for (let i = 0; i < n; i++) out[i] = i < prevLen ? a[i] + (c[i] - a[i]) * alpha : c[i];
    }
    return r;
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
      hash: (h[H.hashHi] >>> 0).toString(16).padStart(8, '0') + (h[H.hashLo] >>> 0).toString(16).padStart(8, '0'),
    };
  }

  private onMessage(msg: FromWorker): void {
    switch (msg.type) {
      case 'ready':
        this.threads = msg.threads;
        break;
      case 'topology':
        if (msg.reset) this.topology.length = 0;
        for (const t of msg.bodies) this.topology[t.index] = t;
        this.staticTriangles = msg.staticTriangles;
        this.listeners.topology.forEach((l) => l({ reset: msg.reset, added: msg.bodies }));
        break;
      case 'stability':
        this.listeners.stability.forEach((l) => l(msg));
        break;
      case 'error':
        this.listeners.error.forEach((l) => l(msg.message));
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

  private send(msg: ToWorker): void {
    this.worker.postMessage(msg);
  }
}

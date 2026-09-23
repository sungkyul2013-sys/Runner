/// <reference lib="webworker" />
// Physics worker: owns the SoftBodyCore WASM instance, runs the fixed 2000 Hz loop and publishes frames through the
// triple buffer (A§2), or by transferring slot buffers when the page has no SharedArrayBuffer (message transport). Overload policy (§21.2, §25): never skip a step — let simulated time fall behind wall time
// and report the real-time factor instead.
import {
  B, BODY_STRIDE_F64, ENERGY_FIELDS, H, MAX_BEAMS, MAX_BODIES, MAX_NODES, MAX_VEHICLES, SLOT_BYTES, slotViews, TripleBufferWriter,
  VT_HEADER, VT_MAX_WHEELS, VT_STRIDE, VT_WHEEL, type SlotViews,
} from './layout';
import type { BodyTopology, FromWorker, ToWorker, Transport, VehicleInput } from './messages';
import { LATTICE_PARAM_COUNT, readCString, type Ptr, type SbcFactory, type SbcModule } from './sbc';

const ITERATION_PERIOD_MS = 4; // target loop period (≈ 250 Hz publishing)
const STEP_BUDGET_MS = 10; // wall time we may spend stepping per iteration before slowing sim time down
const STEP_CHUNK = 8; // steps per WASM call between budget checks (8 × 0.5 ms = 4 ms of sim time)
const MAX_WALL_GAP_S = 0.1; // a stalled tab must not make the sim try to catch up seconds of debt
const EMA = 0.1; // smoothing of the published timing figures

let sbc: SbcModule;
let world: Ptr = 0;
let threads = 1;
let dt = 0.0005;
let transport: Transport = 'shared';
let writer: TripleBufferWriter;
let slots: SlotViews[] = [];
// Message transport: the slot being filled, and returned slots ready for reuse (at most MESSAGE_SLOTS exist).
const MESSAGE_SLOTS = 4;
let back: SlotViews | null = null;
const spare: ArrayBuffer[] = [];
let allocatedSlots = 0;

/** The slot to fill now, or null when every message slot is still in flight (that publish is skipped). */
function backSlot(): SlotViews | null {
  if (transport === 'shared') return slots[writer.slot];
  if (!back) {
    const buffer = spare.pop() ?? (allocatedSlots < MESSAGE_SLOTS ? (allocatedSlots++, new ArrayBuffer(SLOT_BYTES)) : null);
    back = buffer ? slotViews(buffer) : null;
  }
  return back;
}

function commit(): void {
  if (transport === 'shared') return writer.publish();
  const buffer = back!.header.buffer as ArrayBuffer;
  back = null;
  post({ type: 'frame', buffer }, [buffer]);
}

let paused = false;
let timeScale = 1;
let simDebt = 0; // [s] simulated time owed to wall time
let lastWall = 0;
let stepMs = 0;
let rtf = 1;
let overloaded = false;
let publishSeq = 0;
let knownBodies = 0;

// scratch buffers inside WASM memory
let scratch: Ptr = 0;
let scratchBytes = 0;

const post = (msg: FromWorker, transfer: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(msg, transfer);

function heap(): ArrayBuffer {
  return sbc.wasmMemory.buffer as ArrayBuffer;
}

function ensureScratch(bytes: number): Ptr {
  if (bytes > scratchBytes) {
    if (scratch) sbc._free(scratch);
    scratchBytes = Math.max(bytes, 1 << 16);
    scratch = sbc._malloc(scratchBytes);
  }
  return scratch;
}

function cString(text: string): Ptr {
  const bytes = new TextEncoder().encode(text);
  const ptr = sbc._malloc(bytes.length + 1);
  new Uint8Array(heap(), ptr, bytes.length + 1).set([...bytes, 0]);
  return ptr;
}

function topologyOf(b: number): BodyTopology {
  const n = sbc._sbc_body_node_count(world, b);
  const m = sbc._sbc_body_beam_count(world, b);
  return {
    index: b,
    name: `body ${b}`,
    nodeCount: n,
    beamCount: m,
    beamA: new Int32Array(heap(), sbc._sbc_body_beam_a(world, b), m).slice(),
    beamB: new Int32Array(heap(), sbc._sbc_body_beam_b(world, b), m).slice(),
    radius: new Float32Array(heap(), sbc._sbc_body_radius(world, b), n).slice(),
  };
}

function staticTriangles(): Float32Array {
  const count = sbc._sbc_world_static_triangle_count(world);
  if (count === 0) return new Float32Array(0);
  const ptr = ensureScratch(count * 9 * 4);
  sbc._sbc_world_static_triangles(world, 0, count, ptr);
  return new Float32Array(heap(), ptr, count * 9).slice();
}

function reportStability(b: number, label: string): void {
  const out = ensureScratch(3 * 8);
  sbc._sbc_body_check_stability(world, b, 0.8, out);
  const r = new Float64Array(heap(), out, 3);
  post({ type: 'stability', body: b, label, minCriticalDtMs: r[0] * 1e3, beamViolations: r[1], nodeViolations: r[2] });
}

function announceNewBodies(reset: boolean, label: string): void {
  const count = sbc._sbc_world_body_count(world);
  const bodies: BodyTopology[] = [];
  for (let b = reset ? 0 : knownBodies; b < count; b++) {
    bodies.push(topologyOf(b));
    reportStability(b, label);
  }
  knownBodies = count;
  const tris = staticTriangles();
  post({ type: 'topology', reset, bodies, staticTriangles: tris }, [tris.buffer]);
}

function loadScene(name: string, bodies = 16): void {
  if (world) sbc._sbc_world_destroy(world);
  const namePtr = cString(name);
  world = sbc._sbc_world_create_scene(namePtr, threads, 1, bodies);
  sbc._free(namePtr);
  if (!world) {
    post({ type: 'error', message: `unknown scene "${name}"` });
    return;
  }
  dt = sbc._sbc_world_dt(world);
  simDebt = 0;
  knownBodies = 0;
  announceNewBodies(true, name);
  publish();
}

async function spawnVehicle(msg: Extract<ToWorker, { type: 'spawnVehicle' }>): Promise<void> {
  const fail = (message: string) => post({ type: 'vehicleFailed', request: msg.request, message });
  if (!world) return fail('no world');
  const { position: [x, y, z], yaw, speed } = msg.pose;
  let vehicle: number;
  if (msg.source.kind === 'proto') {
    vehicle = sbc._sbc_world_spawn_proto_car(world, x, y, z, yaw, speed);
  } else {
    const response = await fetch(msg.source.url);
    if (!response.ok) return fail(`${msg.source.url}: HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!world) return fail('no world');
    const ptr = sbc._malloc(bytes.length + 1);
    new Uint8Array(heap(), ptr, bytes.length).set(bytes);
    vehicle = sbc._sbc_world_spawn_vehicle_json(world, ptr, bytes.length, x, y, z, yaw, speed);
    sbc._free(ptr);
  }
  if (vehicle < 0) return fail(readCString(heap(), sbc._sbc_last_error()) || 'vehicle rejected by the core');
  post({
    type: 'vehicle',
    request: msg.request,
    vehicle,
    body: sbc._sbc_vehicle_body(world, vehicle),
    wheels: sbc._sbc_vehicle_wheel_count(world, vehicle),
    label: msg.label,
  });
  announceNewBodies(false, msg.label);
}

function setVehicleInput(vehicle: number, i: VehicleInput): void {
  if (!world || vehicle < 0 || vehicle >= sbc._sbc_world_vehicle_count(world)) return;
  sbc._sbc_vehicle_set_input(world, vehicle, i.throttle, i.brake, i.steer, i.handbrake, i.mode, i.shift, (i.abs ? 1 : 0) | (i.tcs ? 2 : 0));
}

/** Copies every vehicle's packed telemetry into the slot (body index in the header's reserved field 30). */
function publishVehicles(s: SlotViews): number {
  const count = Math.min(sbc._sbc_world_vehicle_count(world), MAX_VEHICLES);
  const capacity = VT_HEADER + VT_WHEEL * VT_MAX_WHEELS;
  const ptr = ensureScratch(capacity * 4);
  for (let v = 0; v < count; v++) {
    const written = sbc._sbc_vehicle_telemetry(world, v, ptr, capacity);
    const record = s.vehicles.subarray(v * VT_STRIDE, (v + 1) * VT_STRIDE);
    if (written <= 0) {
      record.fill(0);
      continue;
    }
    record.set(new Float32Array(heap(), ptr, written));
    record[30] = sbc._sbc_vehicle_body(world, v);
  }
  return count;
}

function publish(): void {
  const s = backSlot();
  if (!s) return;
  const h = s.header;
  const count = Math.min(sbc._sbc_world_body_count(world), MAX_BODIES);
  let nodeOffset = 0;
  let beamOffset = 0;
  const originPtr = ensureScratch(Math.max(3 * 8, MAX_BEAMS * 4));
  for (let b = 0; b < count; b++) {
    const n = sbc._sbc_body_node_count(world, b);
    const m = sbc._sbc_body_beam_count(world, b);
    if (nodeOffset + n > MAX_NODES || beamOffset + m > MAX_BEAMS) break;
    sbc._sbc_body_origin(world, b, originPtr);
    const origin = new Float64Array(heap(), originPtr, 3);
    const row = b * BODY_STRIDE_F64;
    s.bodies[row + B.originX] = origin[0];
    s.bodies[row + B.originY] = origin[1];
    s.bodies[row + B.originZ] = origin[2];
    s.bodies[row + B.nodeOffset] = nodeOffset;
    s.bodies[row + B.nodeCount] = n;
    s.bodies[row + B.beamOffset] = beamOffset;
    s.bodies[row + B.beamCount] = m;
    s.bodies[row + B.topologyVersion] = sbc._sbc_body_topology_version(world, b);
    const px = new Float32Array(heap(), sbc._sbc_body_px(world, b), n);
    const py = new Float32Array(heap(), sbc._sbc_body_py(world, b), n);
    const pz = new Float32Array(heap(), sbc._sbc_body_pz(world, b), n);
    const dst = s.positions;
    for (let i = 0, o = nodeOffset * 3; i < n; i++, o += 3) {
      dst[o] = px[i];
      dst[o + 1] = py[i];
      dst[o + 2] = pz[i];
    }
    sbc._sbc_body_beam_strain(world, b, originPtr);
    s.strain.set(new Float32Array(heap(), originPtr, m), beamOffset);
    nodeOffset += n;
    beamOffset += m;
  }
  const stats = ensureScratch(Math.max(4 * 4, MAX_BEAMS * 4));
  sbc._sbc_world_last_stats(world, stats);
  const st = new Int32Array(heap(), stats, 4);
  h[H.staticContacts] = st[0];
  h[H.bodyContacts] = st[1];
  h[H.ccdClamps] = st[2];
  sbc._sbc_world_measure_energy(world, stats);
  h.set(new Float64Array(heap(), stats, ENERGY_FIELDS.length), H.energy);
  h[H.simTime] = sbc._sbc_world_time(world);
  h[H.stepIndex] = sbc._sbc_world_step_index(world);
  h[H.rtf] = rtf;
  h[H.bodyCount] = count;
  h[H.stepMs] = stepMs;
  h[H.stepsPerSecond] = stepMs > 0 ? 1000 / stepMs : 0;
  h[H.totalNodes] = nodeOffset;
  h[H.totalBeams] = beamOffset;
  h[H.paused] = paused ? 1 : 0;
  h[H.timeScale] = timeScale;
  h[H.overloaded] = overloaded ? 1 : 0;
  h[H.wasmMemoryMB] = heap().byteLength / (1024 * 1024);
  h[H.hashHi] = sbc._sbc_world_state_hash_hi(world);
  h[H.hashLo] = sbc._sbc_world_state_hash_lo(world);
  h[H.vehicleCount] = publishVehicles(s);
  h[H.publishSeq] = ++publishSeq;
  commit();
}

function stepTimed(steps: number): number {
  const t0 = performance.now();
  sbc._sbc_world_step(world, steps);
  const ms = performance.now() - t0;
  stepMs = stepMs === 0 ? ms / steps : stepMs * (1 - EMA) + (ms / steps) * EMA;
  return ms;
}

function iterate(): void {
  const start = performance.now();
  const wallDt = Math.min((start - lastWall) / 1000, MAX_WALL_GAP_S);
  lastWall = start;
  if (world && !paused) {
    simDebt += wallDt * timeScale;
    const wanted = Math.floor(simDebt / dt);
    let done = 0;
    while (done < wanted && performance.now() - start < STEP_BUDGET_MS) {
      const n = Math.min(STEP_CHUNK, wanted - done);
      stepTimed(n);
      done += n;
    }
    overloaded = done < wanted;
    // Slow-down instead of skipping: unpaid debt is forgiven, so sim time runs slower than wall time.
    simDebt = overloaded ? 0 : simDebt - done * dt;
    const instant = wallDt > 0 ? (done * dt) / wallDt : 0;
    rtf = rtf * (1 - EMA) + instant * EMA;
    publish();
  } else if (world) {
    rtf = 0;
    publish();
  }
  const elapsed = performance.now() - start;
  setTimeout(iterate, Math.max(0, ITERATION_PERIOD_MS - elapsed));
}

async function init(msg: Extract<ToWorker, { type: 'init' }>): Promise<void> {
  const factory = (await import(/* @vite-ignore */ msg.wasmUrl)).default as SbcFactory;
  const base = msg.wasmUrl.slice(0, msg.wasmUrl.lastIndexOf('/') + 1);
  sbc = await factory({ locateFile: (p) => base + p });
  transport = msg.transport;
  threads = transport === 'shared' ? Math.max(1, msg.threads) : 1;
  if (transport === 'shared') {
    writer = new TripleBufferWriter(new Int32Array(msg.ctrl!));
    slots = msg.slots.map((b) => slotViews(b));
  } else {
    spare.push(...(msg.slots as ArrayBuffer[]));
    allocatedSlots = spare.length;
  }
  post({ type: 'ready', threads });
  lastWall = performance.now();
  iterate();
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'init':
        init(msg).catch((err) => post({ type: 'error', message: String(err?.stack ?? err) }));
        return;
      case 'scene':
        loadScene(msg.name, msg.bodies);
        return;
      case 'returnSlot':
        if (msg.buffer.byteLength === SLOT_BYTES) spare.push(msg.buffer);
        return;
      case 'spawnLattice': {
        if (!world) return;
        const ptr = ensureScratch(LATTICE_PARAM_COUNT * 8);
        new Float64Array(heap(), ptr, LATTICE_PARAM_COUNT).set(msg.params);
        const body = sbc._sbc_world_spawn_lattice(world, ptr, LATTICE_PARAM_COUNT);
        if (body < 0) post({ type: 'error', message: `spawn "${msg.label}" rejected by the core` });
        else announceNewBodies(false, msg.label);
        return;
      }
      case 'setPaused':
        paused = msg.paused;
        simDebt = 0;
        return;
      case 'setTimeScale':
        timeScale = Math.min(Math.max(msg.scale, 0.001), 1);
        return;
      case 'step':
        if (!world) return;
        for (let left = msg.steps; left > 0; left -= 1000) stepTimed(Math.min(1000, left));
        publish();
        post({ type: 'stepped', stepIndex: sbc._sbc_world_step_index(world) });
        return;
      case 'spawnVehicle':
        spawnVehicle(msg).catch((err) => post({ type: 'vehicleFailed', request: msg.request, message: String(err?.stack ?? err) }));
        return;
      case 'vehicleInput':
        setVehicleInput(msg.vehicle, msg.input);
        return;
      case 'hash': {
        const hi = sbc._sbc_world_state_hash_hi(world) >>> 0;
        const lo = sbc._sbc_world_state_hash_lo(world) >>> 0;
        const hex = hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
        post({ type: 'hash', stepIndex: sbc._sbc_world_step_index(world), hex });
        return;
      }
    }
  } catch (err) {
    post({ type: 'error', message: String((err as Error)?.stack ?? err) });
  }
};

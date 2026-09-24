// Shared-memory layout between the physics worker (writer) and the main thread (reader).
// Lock-free triple buffer over SharedArrayBuffers (§3, A§2 ①): the writer fills its private "back" slot and
// atomically swaps it with the "middle" slot; the reader swaps its "front" slot with the middle one only when the
// FRESH bit says a newer frame is waiting. Neither side ever blocks or sees a half-written frame.

export const MAX_BODIES = 256;
export const MAX_NODES = 1 << 17; // 131,072 nodes across all bodies
export const MAX_BEAMS = 1 << 19; // 524,288 beams across all bodies

export const HEADER_F64 = 40;
export const BODY_STRIDE_F64 = 8;

/** Header field indices (Float64). */
export const H = {
  simTime: 0,
  stepIndex: 1,
  rtf: 2, // real-time factor: simulated seconds per wall second (§21.2)
  bodyCount: 3,
  stepMs: 4, // wall milliseconds per physics step (EMA)
  stepsPerSecond: 5,
  staticContacts: 6,
  bodyContacts: 7,
  ccdClamps: 8,
  brokenBeams: 9,
  totalNodes: 10,
  totalBeams: 11,
  paused: 12,
  timeScale: 13,
  overloaded: 14, // 1 when the last iteration could not keep up (sim time slowed, no steps skipped)
  wasmMemoryMB: 15,
  energy: 16, // 12 fields, see ENERGY_FIELDS
  hashHi: 28,
  hashLo: 29,
  publishSeq: 30,
  vehicleCount: 31,
  momentum: 32, // linear xyz [kg·m/s], angular xyz about the world origin [kg·m²/s] (§5.3)
} as const;

export const ENERGY_FIELDS = [
  'kinetic',
  'gravity',
  'beam',
  'contact',
  'beamDamping',
  'contactDamping',
  'friction',
  'plastic',
  'fracture',
  'ccd',
  'external',
  'balance',
] as const;
export type EnergyField = (typeof ENERGY_FIELDS)[number];

/** Body table field indices (Float64, BODY_STRIDE_F64 per body). */
export const B = {
  originX: 0,
  originY: 1,
  originZ: 2,
  nodeOffset: 3,
  nodeCount: 4,
  beamOffset: 5,
  beamCount: 6,
  topologyVersion: 7,
} as const;

/** Vehicle telemetry records (core sbc.h SBC_VT_HEADER / SBC_VT_WHEEL), one per vehicle, fixed stride. */
export const MAX_VEHICLES = 16;
export const VT_HEADER = 62;
export const VT_WHEEL = 26;
export const VT_MAX_WHEELS = 8;
export const VT_STRIDE = VT_HEADER + VT_WHEEL * VT_MAX_WHEELS;

const HEADER_BYTES = HEADER_F64 * 8;
const BODY_TABLE_BYTES = MAX_BODIES * BODY_STRIDE_F64 * 8;
const POSITIONS_BYTES = MAX_NODES * 3 * 4;
const STRAIN_BYTES = MAX_BEAMS * 4;
const VEHICLE_BYTES = MAX_VEHICLES * VT_STRIDE * 4;
export const SLOT_BYTES = HEADER_BYTES + BODY_TABLE_BYTES + POSITIONS_BYTES + STRAIN_BYTES + VEHICLE_BYTES;

export interface SlotViews {
  header: Float64Array;
  bodies: Float64Array;
  positions: Float32Array; // local xyz per node, bodies packed back to back
  strain: Float32Array; // (L − L0)/L0 per beam, NaN = broken
  vehicles: Float32Array; // VT_STRIDE floats per vehicle (telemetry.ts)
}

export function slotViews(buffer: ArrayBufferLike): SlotViews {
  let offset = 0;
  const header = new Float64Array(buffer, offset, HEADER_F64);
  offset += HEADER_BYTES;
  const bodies = new Float64Array(buffer, offset, MAX_BODIES * BODY_STRIDE_F64);
  offset += BODY_TABLE_BYTES;
  const positions = new Float32Array(buffer, offset, MAX_NODES * 3);
  offset += POSITIONS_BYTES;
  const strain = new Float32Array(buffer, offset, MAX_BEAMS);
  offset += STRAIN_BYTES;
  const vehicles = new Float32Array(buffer, offset, MAX_VEHICLES * VT_STRIDE);
  return { header, bodies, positions, strain, vehicles };
}

// ---- triple-buffer control word ------------------------------------------------------------------------------
// ctrl[0] = middle slot index | FRESH_BIT when the middle slot holds a frame the reader has not taken yet.
const FRESH_BIT = 4;
const INDEX_MASK = 3;

export class TripleBufferWriter {
  private back = 0;
  constructor(private readonly ctrl: Int32Array) {}
  /** Slot the writer may fill now. */
  get slot(): number {
    return this.back;
  }
  /** Publishes the back slot and takes the previous middle slot as the new back slot. */
  publish(): void {
    this.back = Atomics.exchange(this.ctrl, 0, this.back | FRESH_BIT) & INDEX_MASK;
  }
}

export class TripleBufferReader {
  private front = 2;
  constructor(private readonly ctrl: Int32Array) {}
  get slot(): number {
    return this.front;
  }
  /** Takes the newest published slot if there is one. Returns true when `slot` changed to fresher data. */
  acquire(): boolean {
    if ((Atomics.load(this.ctrl, 0) & FRESH_BIT) === 0) return false;
    this.front = Atomics.exchange(this.ctrl, 0, this.front) & INDEX_MASK;
    return true;
  }
}

/** Initial control state: writer owns 0, middle is 1 (not fresh), reader owns 2. */
export function createControl(shared: boolean): Int32Array {
  const buffer = shared ? new SharedArrayBuffer(16) : new ArrayBuffer(16);
  const ctrl = new Int32Array(buffer);
  ctrl[0] = 1;
  return ctrl;
}

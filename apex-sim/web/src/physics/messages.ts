// Non-real-time messages between the main thread and the physics worker. Real-time data (node positions, strain,
// stats) travels through the SharedArrayBuffer triple buffer instead (layout.ts) — or, on a page without
// cross-origin isolation, as transferred slot buffers ('frame' out, 'returnSlot' back: the message transport).

/** 'shared': SAB triple buffer + threaded WASM. 'message': transferred slots + single-thread WASM (KNOWN_ISSUES W8). */
export type Transport = 'shared' | 'message';

export type ToWorker =
  | { type: 'init'; transport: Transport; ctrl: SharedArrayBuffer | null; slots: ArrayBufferLike[]; wasmUrl: string; threads: number }
  | { type: 'returnSlot'; buffer: ArrayBuffer }
  | { type: 'scene'; name: string; bodies?: number }
  | { type: 'spawnLattice'; params: Float64Array; label: string }
  | { type: 'setPaused'; paused: boolean }
  | { type: 'setTimeScale'; scale: number }
  | { type: 'step'; steps: number }
  | { type: 'hash' }
  | { type: 'spawnVehicle'; request: number; source: VehicleSource; pose: VehiclePose; label: string }
  | { type: 'vehicleInput'; vehicle: number; input: VehicleInput }
  | { type: 'tether'; request: number; desc: TetherDesc }
  | { type: 'tetherAnchor'; id: number; anchor: [number, number, number] }
  | { type: 'tetherLength'; id: number; length: number }
  | { type: 'tetherRemove'; id: number };

/** §20 tether (core TetherDesc): a grab (pulls its node toward `anchor`, saturating at maxForce) or a rope/winch
 *  (pulls only, above its length). anchorBody −1: the anchor is the world point. */
export interface TetherDesc {
  body: number;
  node: number;
  anchorBody: number;
  anchorNode: number;
  anchor: [number, number, number]; // world [m]
  length: number;
  rope: boolean;
  maxForce: number; // [N] 0: unlimited, < 0: −maxForce × the tied body's weight
  reelSpeed: number; // [m/s]
}

/** Published tether state (world frame). */
export interface TetherState {
  id: number;
  body: number;
  node: number;
  length: number;
  targetLength: number;
  tension: number; // [N]
  nodePosition: [number, number, number];
  anchorPosition: [number, number, number];
}

/** A vehicle's physics definition: an "apex-vehicle" JSON document (fetched by the worker) or the built-in Proto. */
export type VehicleSource = { kind: 'json'; url: string } | { kind: 'proto' };

export interface VehiclePose {
  position: [number, number, number]; // model origin (ground level, mid-wheelbase) [m]
  yaw: number; // [rad] about +Y (0 = facing +Z)
  speed: number; // [m/s] forward
}

/** Driver input (core VehicleInput). mode: 0 drive, 1 reverse, 2 neutral, 3 manual. */
export interface VehicleInput {
  throttle: number;
  brake: number;
  steer: number; // −1 … 1, positive = left
  handbrake: number;
  mode: 0 | 1 | 2 | 3;
  shift: -1 | 0 | 1; // one-shot manual shift request
  abs: boolean;
  tcs: boolean;
}

export interface BodyTopology {
  index: number;
  name: string;
  nodeCount: number;
  beamCount: number;
  beamA: Int32Array;
  beamB: Int32Array;
  radius: Float32Array;
  /** Island split (§4.3): the body this part broke off from (−1: spawned) and each node's index there. */
  source: number;
  sourceNodes: Int32Array | null;
}

export type FromWorker =
  | { type: 'ready'; threads: number }
  | { type: 'frame'; buffer: ArrayBuffer }
  | { type: 'topology'; reset: boolean; bodies: BodyTopology[]; staticTriangles: Float32Array; staticMaterials: Uint8Array }
  | { type: 'stability'; body: number; label: string; minCriticalDtMs: number; beamViolations: number; nodeViolations: number }
  | { type: 'stepped'; stepIndex: number }
  | { type: 'hash'; stepIndex: number; hex: string }
  | { type: 'vehicle'; request: number; vehicle: number; body: number; wheels: number; label: string }
  | { type: 'vehicleFailed'; request: number; message: string }
  | { type: 'damage'; body: number; ids: string[]; status: Float32Array } // damage groups changed (8 floats per group)
  | { type: 'tether'; request: number; id: number } // −1: rejected (not a free node)
  | { type: 'tethers'; states: TetherState[] } // the active tethers, with each published frame while any exist
  | { type: 'error'; message: string };

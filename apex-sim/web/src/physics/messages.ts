// Non-real-time messages between the main thread and the physics worker. Real-time data (node positions, strain,
// stats) travels through the SharedArrayBuffer triple buffer instead (layout.ts).

export type ToWorker =
  | { type: 'init'; ctrl: SharedArrayBuffer; slots: SharedArrayBuffer[]; wasmUrl: string; threads: number }
  | { type: 'scene'; name: string; bodies?: number }
  | { type: 'spawnLattice'; params: Float64Array; label: string }
  | { type: 'setPaused'; paused: boolean }
  | { type: 'setTimeScale'; scale: number }
  | { type: 'step'; steps: number }
  | { type: 'hash' };

export interface BodyTopology {
  index: number;
  name: string;
  nodeCount: number;
  beamCount: number;
  beamA: Int32Array;
  beamB: Int32Array;
  radius: Float32Array;
}

export type FromWorker =
  | { type: 'ready'; threads: number }
  | { type: 'topology'; reset: boolean; bodies: BodyTopology[]; staticTriangles: Float32Array }
  | { type: 'stability'; body: number; label: string; minCriticalDtMs: number; beamViolations: number; nodeViolations: number }
  | { type: 'stepped'; stepIndex: number }
  | { type: 'hash'; stepIndex: number; hex: string }
  | { type: 'error'; message: string };

// Builds a map off the main thread (the UI keeps drawing the loading screen) and hands its arrays over.
import { mapInfo } from './maps';

self.onmessage = (e: MessageEvent<{ id: string }>) => {
  try {
    const info = mapInfo(e.data.id);
    const data = info.build((stage) => (self as DedicatedWorkerGlobalScope).postMessage({ type: 'stage', stage }));
    const out = { ...data, roads: [] };
    const transfer: Transferable[] = [data.terrain.heights.buffer, data.terrain.materials.buffer, data.terrain.locked.buffer];
    for (const m of data.physics.meshes) transfer.push(m.vertices.buffer, m.indices.buffer);
    (self as DedicatedWorkerGlobalScope).postMessage({ type: 'done', data: out }, transfer);
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({ type: 'error', message: String((err as Error)?.stack ?? err) });
  }
};

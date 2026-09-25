// Map generation off the main thread, with a fallback on it (no module workers).
import type { MapData } from './builder';
import { mapInfo } from './maps';
import { Terrain } from './terrain';

export function generateMap(id: string, onStage: (stage: string) => void): Promise<MapData> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./mapgen.worker.ts', import.meta.url), { type: 'module', name: 'mapgen' });
    } catch {
      resolve(mapInfo(id).build(onStage));
      return;
    }
    worker.onmessage = (e: MessageEvent<{ type: 'stage'; stage: string } | { type: 'done'; data: MapData } | { type: 'error'; message: string }>) => {
      const msg = e.data;
      if (msg.type === 'stage') onStage(msg.stage);
      else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.message));
      } else {
        worker.terminate();
        // Structured cloning dropped the terrain's methods: restore its class.
        Object.setPrototypeOf(msg.data.terrain, Terrain.prototype);
        resolve(msg.data);
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      // Module workers unsupported or the script failed to load: build here instead.
      try {
        resolve(mapInfo(id).build(onStage));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(e.message)));
      }
    };
    worker.postMessage({ id });
  });
}

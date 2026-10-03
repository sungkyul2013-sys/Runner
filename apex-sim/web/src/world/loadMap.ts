// Map generation off the main thread, with a fallback on it (no module workers).
import type { StringKey } from '../ui/i18n';
import type { MapData } from './builder';
import { loadDem, type MapAssets } from './dem';
import { mapInfo } from './maps';
import { Terrain } from './terrain';

/** Build stages as reported by the generator: progress (0…1 of a whole load) and a label. */
export const MAP_STAGES: Record<string, [number, StringKey]> = {
  dem: [0.05, 'loadTerrain'],
  route: [0.12, 'loadRoads'],
  junctions: [0.3, 'loadRoads'],
  embankments: [0.38, 'loadTerrain'],
  sections: [0.44, 'loadRoads'],
  lowering: [0.5, 'loadTerrain'],
  materials: [0.56, 'loadTerrain'],
  decorate: [0.6, 'loadProps'],
  roads: [0.66, 'loadRoads'],
  props: [0.7, 'loadProps'],
};

export async function generateMap(id: string, onStage: (stage: string) => void): Promise<MapData> {
  // A real-terrain map's DEM is fetched here and handed to the worker.
  const info = mapInfo(id);
  const assets: MapAssets = {};
  if (info.assets?.dem) {
    onStage('dem');
    const json = (path: string | undefined) =>
      path ? fetch(new URL(path, document.baseURI).href).then((r) => (r.ok ? r.json() : undefined)).catch(() => undefined) : Promise.resolve(undefined);
    const [dem, alignments, osm] = await Promise.all([
      loadDem(info.assets.dem),
      // Real map data, and precomputed alignments (the fallback without it); the map works without either.
      json(info.assets.osm ? undefined : info.assets.roads),
      json(info.assets.osm),
    ]);
    assets.dem = dem;
    if (alignments) assets.roads = alignments as MapAssets['roads'];
    if (osm) assets.osm = osm as MapAssets['osm'];
    else if (info.assets.roads && !alignments) assets.roads = (await json(info.assets.roads)) as MapAssets['roads'];
  }
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./mapgen.worker.ts', import.meta.url), { type: 'module', name: 'mapgen' });
    } catch {
      resolve(info.build(onStage, assets));
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
        resolve(info.build(onStage, assets));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(e.message)));
      }
    };
    // The heights are copied, not transferred: the fallback above may still need them.
    worker.postMessage({ id, assets });
  });
}

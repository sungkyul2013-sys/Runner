// Real terrain from a public DEM (§13.1, §13.4): the height grid written by tools/dem/fetch-dem.mjs — a lossless RGB
// PNG (height = min + (R·256 + G) / 10 m) and its JSON header — decoded here (fflate inflates; no canvas, so the map
// worker and the tests decode it the same way), sampled with a Catmull–Rom bicubic between the grid points.
import { unzlibSync } from 'fflate';

export interface DemMeta {
  lat: number;
  lon: number;
  size: number; // [m] side of the square grid, centred on (lat, lon)
  cell: number; // [m]
  n: number; // cells per side: (n + 1)² samples
  min: number; // [m] height of a zero sample
  zoom: number;
  source: string;
  attribution: string;
}

/** Data a map loads before it is built (fetched on the main thread, handed to the map worker). */
export interface MapAssets {
  dem?: Dem;
  /** Real map data (roads, buildings, water) in the map's frame: tools/overture/fetch-overture.py. */
  osm?: import('./osm').OsmMap;
  /** Precomputed road alignments (a map's `<dem>.roads.json`): id → control points. */
  roads?: Record<string, Array<[number, number]>>;
}

/** Heights (n + 1)², x (east) fastest, rows from north (z = −size / 2) to south. */
export interface Dem {
  meta: DemMeta;
  heights: Float32Array;
}

/** Decodes the 8-bit RGB / RGBA, non-interlaced PNG the DEM tool writes. */
export function decodeDemPng(png: Uint8Array, meta: DemMeta): Dem {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  if (view.getUint32(0) !== 0x89504e47) throw new Error('DEM: not a PNG');
  let pos = 8, width = 0, height = 0, bpp = 3;
  const idat: Uint8Array[] = [];
  while (pos < png.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
    const data = png.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      if (data[8] !== 8 || (data[9] !== 2 && data[9] !== 6) || data[12] !== 0) throw new Error('DEM: unsupported PNG format');
      bpp = data[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const side = meta.n + 1;
  if (width !== side || height !== side) throw new Error(`DEM: ${width}×${height} pixels, header says ${side}²`);
  let total = 0;
  for (const d of idat) total += d.length;
  const joined = new Uint8Array(total);
  total = 0;
  for (const d of idat) {
    joined.set(d, total);
    total += d.length;
  }
  const raw = unzlibSync(joined);
  const stride = width * bpp;
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride, up = row - stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[row + i - bpp] : 0, b = y > 0 ? px[up + i] : 0, c = y > 0 && i >= bpp ? px[up + i - bpp] : 0;
      let v = raw[src + i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[row + i] = v & 255;
    }
  }
  const heights = new Float32Array(side * side);
  for (let k = 0; k < heights.length; k++) heights[k] = meta.min + (px[k * bpp] * 256 + px[k * bpp + 1]) / 10;
  return { meta, heights };
}

/** Fetches `<base>.json` and `<base>.png` (relative to the page). */
export async function loadDem(base: string): Promise<Dem> {
  const url = (ext: string) => new URL(`${base}.${ext}`, document.baseURI).href;
  const [meta, png] = await Promise.all([
    fetch(url('json')).then((r) => {
      if (!r.ok) throw new Error(`${base}.json: HTTP ${r.status}`);
      return r.json() as Promise<DemMeta>;
    }),
    fetch(url('png')).then(async (r) => {
      if (!r.ok) throw new Error(`${base}.png: HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    }),
  ]);
  return decodeDemPng(png, meta);
}

/** Height at (x, z) [m] in the map frame (origin at the grid centre), bicubic (Catmull–Rom); clamped at the edges. */
export function demHeight(dem: Dem, x: number, z: number): number {
  const { n, cell, size } = dem.meta;
  const side = n + 1;
  const gx = Math.min(Math.max((x + size / 2) / cell, 0), n), gz = Math.min(Math.max((z + size / 2) / cell, 0), n);
  const i = Math.min(Math.floor(gx), n - 1), j = Math.min(Math.floor(gz), n - 1);
  const fx = gx - i, fz = gz - j;
  const h = dem.heights;
  const at = (a: number, b: number) => h[Math.min(Math.max(b, 0), n) * side + Math.min(Math.max(a, 0), n)];
  const cubic = (p0: number, p1: number, p2: number, p3: number, t: number) =>
    p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  const row = (b: number) => cubic(at(i - 1, b), at(i, b), at(i + 1, b), at(i + 2, b), fx);
  return cubic(row(j - 1), row(j), row(j + 1), row(j + 2), fz);
}

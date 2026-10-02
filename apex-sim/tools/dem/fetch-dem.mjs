#!/usr/bin/env node
// Public DEM → map height grid (§13.1, §13.4 실제 지형 DEM). Downloads Terrarium terrain tiles (Mapzen / AWS Open Data
// "Terrain Tiles", https://registry.opendata.aws/terrain-tiles/; height = R·256 + G + B/256 − 32768 m), resamples them
// onto a local square grid around a point (x east, z south: the maps' frame, north = −z) and writes
//   <out>.png   (n + 1)² RGB pixels, x across, z down: height = min + (R·256 + G) / 10 [m] (lossless; a PNG because
//               the artifact host serves only standard media types — web/src/world/dem.ts decodes it)
//   <out>.json  { lat, lon, size, cell, n, min, zoom, source, attribution }
//
//   node tools/dem/fetch-dem.mjs --lat 38.09 --lon 128.43 --size 8000 --cell 16 --zoom 13 --out web/public/data/dem/seorak
//
// Tiles are cached in .cache/dem (ignored by git). Uses curl (it follows the environment's proxy settings).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const lat0 = Number(args.lat), lon0 = Number(args.lon);
const size = Number(args.size ?? 8000), cell = Number(args.cell ?? 16), zoom = Number(args.zoom ?? 13);
const out = path.resolve(root, args.out ?? 'web/public/data/dem/dem');
if (!Number.isFinite(lat0) || !Number.isFinite(lon0)) throw new Error('--lat and --lon are required');
const URL_OF = (z, x, y) => `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${z}/${x}/${y}.png`;
const cacheDir = path.join(root, '.cache/dem');
fs.mkdirSync(cacheDir, { recursive: true });

// ---- minimal PNG decoder (8-bit RGB / RGBA, non-interlaced: what the tile service serves) ----
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8, width = 0, height = 0, colorType = 0, depth = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; colorType = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || (colorType !== 2 && colorType !== 6)) throw new Error(`PNG depth ${depth} colour type ${colorType}`);
  const bpp = colorType === 6 ? 4 : 3, stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = px.subarray(y * stride, (y + 1) * stride), up = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0, b = up ? up[i] : 0, c = up && i >= bpp ? up[i - bpp] : 0;
      let v = src[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[i] = v & 255;
    }
  }
  return { width, height, bpp, px };
}

// ---- minimal PNG encoder (8-bit RGB; `rows`: filter byte 0 + pixels per row) ----
const CRC = new Int32Array(256).map((_, c) => {
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(b) {
  let c = -1;
  for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function encodePng(width, height, rows) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4), crc = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    len.writeUInt32BE(data.length);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---- tiles ----
const tileCache = new Map();
function tile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key);
  const file = path.join(cacheDir, `${z}_${x}_${y}.png`);
  if (!fs.existsSync(file)) {
    execFileSync('curl', ['-sSf', '--retry', '3', '-o', file, URL_OF(z, x, y)], { stdio: 'inherit' });
  }
  const png = decodePng(fs.readFileSync(file));
  const h = new Float32Array(png.width * png.height);
  for (let i = 0; i < h.length; i++) {
    const r = png.px[i * png.bpp], g = png.px[i * png.bpp + 1], b = png.px[i * png.bpp + 2];
    h[i] = r * 256 + g + b / 256 - 32768;
  }
  const t = { w: png.width, h: png.height, data: h };
  tileCache.set(key, t);
  return t;
}

// Global pixel coordinates (Web Mercator) at `zoom`, and the height there (bilinear across tile edges).
const N = 2 ** zoom, TILE = 256;
const pixelOf = (lat, lon) => {
  const x = ((lon + 180) / 360) * N * TILE;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * N * TILE;
  return [x, y];
};
function sample(px, py) {
  const x0 = Math.floor(px - 0.5), y0 = Math.floor(py - 0.5), fx = px - 0.5 - x0, fy = py - 0.5 - y0;
  const at = (x, y) => {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const t = tile(zoom, tx, ty);
    return t.data[(y - ty * TILE) * t.w + (x - tx * TILE)];
  };
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
}

// Local frame: x east, z south [m] from (lat0, lon0) on a sphere (an 8 km square: the error is far below a cell).
const R_EARTH = 6371008.8;
const n = Math.round(size / cell);
const half = (n * cell) / 2;
const heights = new Float32Array((n + 1) * (n + 1));
let min = Infinity, max = -Infinity;
for (let j = 0; j <= n; j++) {
  const z = -half + j * cell;
  const lat = lat0 - (z / R_EARTH) * (180 / Math.PI);
  for (let i = 0; i <= n; i++) {
    const x = -half + i * cell;
    const lon = lon0 + (x / (R_EARTH * Math.cos((lat0 * Math.PI) / 180))) * (180 / Math.PI);
    const [px, py] = pixelOf(lat, lon);
    const h = sample(px, py);
    heights[j * (n + 1) + i] = h;
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
}
const base = Math.floor(min);
if ((max - base) * 10 > 65535) throw new Error(`relief ${max - base} m does not fit decimetres in 16 bits`);
const side = n + 1;
const rows = Buffer.alloc(side * (side * 3 + 1));
for (let j = 0; j < side; j++) {
  for (let i = 0; i < side; i++) {
    const v = Math.round((heights[j * side + i] - base) * 10), k = j * (side * 3 + 1) + 1 + i * 3;
    rows[k] = v >> 8;
    rows[k + 1] = v & 255;
  }
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(`${out}.png`, encodePng(side, side, rows));
const meta = {
  lat: lat0, lon: lon0, size: n * cell, cell, n, min: base, zoom,
  source: 'Terrain Tiles (Terrarium), AWS Open Data — https://registry.opendata.aws/terrain-tiles/',
  attribution: 'Terrain Tiles: Mapzen / Linux Foundation; source data SRTM (NASA), and others (see the registry page)',
};
fs.writeFileSync(`${out}.json`, JSON.stringify(meta, null, 2) + '\n');
console.log(`${path.relative(root, out)}: ${n + 1}² samples at ${cell} m, ${min.toFixed(0)} … ${max.toFixed(0)} m, ${tileCache.size} tiles (z${zoom})`);

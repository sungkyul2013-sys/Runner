// Imports the user's earlier car models (KICKOFF 결정 사항 Q6) from the Crash Lab bake
// (Runner branch claude/game-development-ba0ut4, crashlab/src/15_baked.js) into APEX_SIM vehicle assets.
//
//   node tools/vehicle-import/import-crashlab.mjs <path/to/15_baked.js> [outDir=web/public/vehicles]
//
// For each configured car it writes <outDir>/<id>/<id>.glb:
//   • body mesh split into material groups by the bake's vertex mask (1 = paint, 2 = glass, 4 = lamp, 0 = trim)
//   • wheel mesh (tyre + rim, rotates) and caliper mesh (does not rotate) for one side of the car — which one is
//     detected from the rim face and stored as extras.apex.wheel.meshSide; the other side mirrors it
//   • scene.extras.apex: dimensions, wheel positions, source and licence
// Frame (VEHICLE_FORMAT.md): +Z forward, +Y up, +X left; y = 0 at the tyre contact plane, z = 0 midway between the
// axles, x = 0 on the centre line. The model is scaled uniformly so its length matches the real car.
// Attributes use KHR_mesh_quantization (int16 positions, int8 normals, uint8 colours).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';

const CARS = [
  {
    key: 'porsche',
    id: 'porsche_911_turbo_991',
    name: { ko: '포르쉐 911 터보 (991, 2014)', en: 'Porsche 911 Turbo (991, 2014)' },
    realLength: 4.506, // [m] manufacturer data
    source: 'User-provided FBX (Porsche 911 Turbo 2014), baked in Crash Lab v2.9 — original source/licence not recorded',
    license: 'unknown (user-provided)',
  },
  {
    key: 'rrghost',
    id: 'rolls_royce_ghost',
    name: { ko: '롤스로이스 고스트', en: 'Rolls-Royce Ghost' },
    realLength: 5.399, // [m] 1st-generation Ghost
    source: '"Rolls-Royce Ghost" by Black Snow — https://sketchfab.com/3d-models/rolls-royce-ghost-4a590f4afa094fa8b407a14db77a63a8',
    license: 'CC-BY-4.0',
    // The body carries its own (static) wheels, tyres and brakes: they are cut out and replaced by a spinning
    // procedural 20" twin-spoke wheel sized and placed from the wheel arches (fitWheels).
    fitWheels: {
      gap: 0.03, // [m] tyre top → arch lip at design ride height
      style: 'ghost',
      front: { radius: 0.369, width: 0.255, rimRadius: 0.254 }, // 255/45 R20
      rear: { radius: 0.368, width: 0.285, rimRadius: 0.254 },  // 285/40 R20
      maxScale: 1.06,
    },
    // The bake's own tyres sit 3 cm ahead of and 5 cm outboard of the fitted wheels, so their front arc stuck out
    // ahead of the spinning wheel: cut the dark tyre fragments around the bake's wheel centres.
    cutBakeWheels: { radius: 0.46, role: 'trim', maxLum: 0.05, minAbsX: 0.58 },
  },
  {
    key: 'maybach',
    id: 'maybach_gls',
    name: { ko: '마이바흐 GLS', en: 'Maybach GLS' },
    realLength: 5.205, // [m] Mercedes-Maybach GLS 600
    source: 'User-provided FBX (Mercedes-Benz GLS 580), baked in Crash Lab — original source/licence not recorded',
    license: 'unknown (user-provided)',
    // The bake has no separate wheel mesh; rim fragments are baked into the body. They are cut out and replaced by a
    // procedural 23" multi-spoke wheel (the GLS 580's, as the user's design spec has it), placed in the wheel arches;
    // the body comes down onto the wheels until the arch gap is an SUV's (the user's Crash Lab spec also lowered this
    // model: its stance was too high on 23" wheels).
    fitWheels: {
      gap: 0.055,
      style: 'maybach',
      front: { radius: 0.406, width: 0.285, rimRadius: 0.292 }, // 285/40 R23
      rear: { radius: 0.406, width: 0.285, rimRadius: 0.292 },
      maxScale: 1.0,
    },
    // Wheel centres detected in the bake before fitting (the fit below replaces them). The baked rim fragments sit
    // there, off the arch centres: cut them out around those centres too.
    bakeWheelRadius: 0.402,
    cutBakeWheels: { radius: 0.335 },
    // The bake marks no lamps: head- and tail-lamp lenses came through as dark glass over empty housings. Glass at
    // lamp height near either end becomes a self-lit lamp (white front, red rear), keeping its shading.
    // The bake lost the windscreen, the panoramic roof panes and the rear window, and has nothing behind the grille
    // and intakes: fill them (boxes relative to the body: x/z about its centre, y above its bottom).
    fill: [
      { view: 'top', box: { x: [-0.75, 0.75], z: [-1.3, 1.38] }, threshold: 0.15, role: 'tint', color: [20, 26, 32] },
      { view: 'rear', box: { x: [-0.62, 0.62], y: [1.22, 1.56] }, threshold: 0.15, role: 'tint', color: [20, 26, 32], enclosed: false },
      // The tail-lamp lenses are missing too (one looked through the lamp openings into the dark body). Seen
      // square-on from behind and outside, each opening is framed by tailgate, quarter and body: close it with lens
      // glass, relit as the lamp below. Both sides (mirror).
      { dir: [0.62, 0.12, -0.78], mirror: true, box: { ax: [0.26, 1.2], y: [0.9, 1.13], z: [-2.9, -2.0] }, threshold: 0.05, role: 'glass', color: [40, 6, 6], grow: false, detect: 'valley', enclosed: false, reach: 0.3 },
      { view: 'front', box: { x: [-0.92, 0.92], y: [0.16, 0.92] }, threshold: 0.3, role: 'trim', color: [2, 2, 3], inset: 0.05, grow: false },
      // The headlamp lenses are missing as well (only the lower lens band survived): seen square-on from the front
      // and outside, close each opening flush with lens glass, relit as the lamp.
      { dir: [0.55, 0.18, 0.82], mirror: true, box: { ax: [0.42, 1.2], y: [0.58, 1.02], z: [1.8, 2.9] }, threshold: 0.05, role: 'glass', color: [60, 70, 80], grow: false, detect: 'valley', enclosed: false, reach: 0.3 },
      // The headlamps are open on top: through the slot between the bonnet and the lens one sees into the empty
      // housing and down to the ground. Close it flush with lens glass (only see-through cells: threshold ∞); in the
      // lamp zone it is relit with the rest of the lens.
      { view: 'top', box: { ax: [0.42, 1.0], z: [1.9, 2.62] }, threshold: Infinity, role: 'glass', color: [60, 70, 80], grow: false },
    ],
    // The bake's own fragments of the windscreen, roof panes and rear window take the same tinted glass as the
    // filled-in parts, so each pane reads as one sheet (the side windows stay clear).
    // Trim lying on the outer surface of those panes (seen first from `view`: bake leftovers such as the sensor
    // housing and the header band) turns to the same glass; trim inside the cabin stays.
    tintGlass: [
      { x: [-0.72, 0.72], y: [1.02, 2.0], z: [-2.2, 1.38], view: 'top' },
      { x: [-0.64, 0.64], y: [1.18, 1.6], z: [-2.7, -2.15], view: 'rear' },
    ],
    // Lamp zones (the bake marks no lamps). Colours are linear (glTF vertex colours); maxLum is linear too
    // (0.2 ≈ sRGB 0.48: every dark-to-mid trim piece in the band). `gradient`: brighter toward the zone's bottom
    // edge (LED strip).
    lamps: [
      // Headlamps: the lower lens band is the daytime-running strip; the dark upper part (an open housing in the
      // bake) becomes the lit silver reflector interior.
      { end: 'front', depth: 0.5, minHeight: 0.6, maxHeight: 0.79, minAbsX: 0.46, glass: { color: [200, 225, 255] },
        trim: { maxLum: 0.2, color: [120, 135, 158], gradient: 0.35 } },
      { end: 'front', depth: 0.5, minHeight: 0.79, maxHeight: 1.0, minAbsX: 0.46, glass: { color: [150, 170, 205], gradient: 0.55 },
        trim: { maxLum: 0.2, color: [120, 135, 158], gradient: 0.35 } },
      // Tail lamps: the dark band across tailgate and quarters is the lamp (≈ sRGB 205,24,32, brighter along its
      // lower edge). The glass band under it is not a lamp: it is closed with the body colour.
      { end: 'rear', depth: 0.5, minHeight: 0.94, maxHeight: 1.09, minAbsX: 0.3, trim: { maxLum: 0.2, color: [150, 3, 6], gradient: 0.3 },
        glass: { color: [150, 3, 6] } },
      { end: 'rear', depth: 0.45, minHeight: 0.74, maxHeight: 0.98, minAbsX: 0.28, glass: { role: 'paint' } },
    ],
  },
];

// ---- decode -----------------------------------------------------------------------------------------------------

function b64(s, T) {
  const buf = Buffer.from(s, 'base64');
  return new T(buf.buffer, buf.byteOffset, buf.byteLength / T.BYTES_PER_ELEMENT);
}

// The bake's vertex colours are sRGB (Crash Lab displayed them as stored); glTF COLOR_0 is linear.
const SRGB_TO_LINEAR = Uint8Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return Math.round(255 * (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
});

function decode(e) {
  const P = b64(e.p, Int16Array), N = b64(e.n, Int8Array);
  const C = Uint8Array.from(b64(e.c, Uint8Array), (c) => SRGB_TO_LINEAR[c]);
  const M = e.m ? b64(e.m, Uint8Array) : null;
  const n = e.v, bb = e.bb;
  const pos = new Float64Array(n * 3), nor = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      pos[i * 3 + a] = bb[a] + (P[i * 3 + a] / 32767) * (bb[3 + a] - bb[a]);
      nor[i * 3 + a] = N[i * 3 + a] / 127;
    }
  }
  let idx;
  if (e.i) idx = Uint32Array.from(b64(e.i, e.i16 ? Uint16Array : Uint32Array));
  else idx = Uint32Array.from({ length: n }, (_, i) => i);
  return { n, pos, nor, col: C, mask: M, idx };
}

// Bake frame → APEX frame: rotate 180° about Y (model front is −Z in the bake), scale, translate.
function transform(g, s, t) {
  for (let i = 0; i < g.n; i++) {
    g.pos[i * 3] = -g.pos[i * 3] * s + t[0];
    g.pos[i * 3 + 1] = g.pos[i * 3 + 1] * s + t[1];
    g.pos[i * 3 + 2] = -g.pos[i * 3 + 2] * s + t[2];
    g.nor[i * 3] = -g.nor[i * 3];
    g.nor[i * 3 + 2] = -g.nor[i * 3 + 2];
  }
}

function bounds(pos, count) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], pos[i * 3 + a]);
      hi[a] = Math.max(hi[a], pos[i * 3 + a]);
    }
  }
  return { lo, hi };
}

/** Splits an indexed mesh into primitives by triangle class; each gets its own compact vertex set. */
function split(g, classify) {
  const groups = new Map();
  for (let t = 0; t < g.idx.length; t += 3) {
    const k = classify(t);
    if (k === null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(g.idx[t], g.idx[t + 1], g.idx[t + 2]);
  }
  const out = [];
  for (const [key, list] of groups) {
    const remap = new Map();
    const vs = [];
    const ii = new Uint32Array(list.length);
    for (let k = 0; k < list.length; k++) {
      let r = remap.get(list[k]);
      if (r === undefined) {
        r = vs.length;
        remap.set(list[k], r);
        vs.push(list[k]);
      }
      ii[k] = r;
    }
    const pos = new Float64Array(vs.length * 3), nor = new Float64Array(vs.length * 3), col = new Uint8Array(vs.length * 3);
    vs.forEach((v, j) => {
      for (let a = 0; a < 3; a++) {
        pos[j * 3 + a] = g.pos[v * 3 + a];
        nor[j * 3 + a] = g.nor[v * 3 + a];
        col[j * 3 + a] = g.col[v * 3 + a];
      }
    });
    out.push({ key, n: vs.length, pos, nor, col, idx: ii });
  }
  return out;
}

/** Concatenates two split parts of the same role. */
function mergeParts(a, b) {
  const n = a.n + b.n;
  const pos = new Float64Array(n * 3), nor = new Float64Array(n * 3), col = new Uint8Array(n * 3);
  pos.set(a.pos); pos.set(b.pos, a.n * 3);
  nor.set(a.nor); nor.set(b.nor, a.n * 3);
  col.set(a.col); col.set(b.col, a.n * 3);
  const idx = new Uint32Array(a.idx.length + b.idx.length);
  idx.set(a.idx);
  for (let k = 0; k < b.idx.length; k++) idx[a.idx.length + k] = b.idx[k] + a.n;
  return { key: a.key, n, pos, nor, col, idx };
}

// ---- GLB writer (KHR_mesh_quantization) --------------------------------------------------------------------------

class Glb {
  constructor() {
    this.json = {
      asset: { version: '2.0', generator: 'apex-sim tools/vehicle-import' },
      extensionsUsed: ['KHR_mesh_quantization'],
      extensionsRequired: ['KHR_mesh_quantization'],
      buffers: [{ byteLength: 0 }],
      bufferViews: [],
      accessors: [],
      materials: [],
      meshes: [],
      nodes: [],
      scenes: [{ nodes: [] }],
      scene: 0,
    };
    this.chunks = [];
    this.length = 0;
    this.materialIndex = new Map();
  }
  view(bytes, stride, target) {
    const pad = (4 - (this.length % 4)) % 4;
    if (pad) { this.chunks.push(Buffer.alloc(pad)); this.length += pad; }
    const v = { buffer: 0, byteOffset: this.length, byteLength: bytes.byteLength };
    if (stride) v.byteStride = stride;
    if (target) v.target = target;
    this.chunks.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    this.length += bytes.byteLength;
    this.json.bufferViews.push(v);
    return this.json.bufferViews.length - 1;
  }
  accessor(a) {
    this.json.accessors.push(a);
    return this.json.accessors.length - 1;
  }
  material(name, def) {
    if (this.materialIndex.has(name)) return this.materialIndex.get(name);
    this.json.materials.push({ name, ...def });
    this.materialIndex.set(name, this.json.materials.length - 1);
    return this.json.materials.length - 1;
  }
  /** Adds a quantized primitive; returns { primitive, center, half } (node transform for de-quantization). */
  primitive(p, center, half, materialName, materialDef) {
    const n = p.n;
    const pos = new Int16Array(n * 4); // stride 8 bytes (VEC3 + pad)
    const nor = new Int8Array(n * 4);
    const col = new Uint8Array(n * 4);
    const qlo = [32767, 32767, 32767], qhi = [-32767, -32767, -32767];
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < 3; a++) {
        const q = Math.max(-32767, Math.min(32767, Math.round(((p.pos[i * 3 + a] - center[a]) / half[a]) * 32767)));
        pos[i * 4 + a] = q;
        qlo[a] = Math.min(qlo[a], q);
        qhi[a] = Math.max(qhi[a], q);
        nor[i * 4 + a] = Math.max(-127, Math.min(127, Math.round(p.nor[i * 3 + a] * 127)));
        col[i * 4 + a] = p.col[i * 3 + a];
      }
      col[i * 4 + 3] = 255;
    }
    const posView = this.view(pos, 8, 34962);
    const norView = this.view(nor, 4, 34962);
    const colView = this.view(col, 4, 34962);
    const wide = n > 65535;
    const idx = wide ? Uint32Array.from(p.idx) : Uint16Array.from(p.idx);
    const idxView = this.view(idx, 0, 34963);
    return {
      attributes: {
        POSITION: this.accessor({ bufferView: posView, componentType: 5122, normalized: true, count: n, type: 'VEC3', min: qlo, max: qhi }),
        NORMAL: this.accessor({ bufferView: norView, componentType: 5120, normalized: true, count: n, type: 'VEC3' }),
        COLOR_0: this.accessor({ bufferView: colView, componentType: 5121, normalized: true, count: n, type: 'VEC4' }),
      },
      indices: this.accessor({ bufferView: idxView, componentType: wide ? 5125 : 5123, count: idx.length, type: 'SCALAR' }),
      material: this.material(materialName, materialDef),
    };
  }
  mesh(name, primitives, center, half, extras) {
    this.json.meshes.push({ name, primitives });
    this.json.nodes.push({ name, mesh: this.json.meshes.length - 1, translation: center, scale: half.map((h) => h), extras });
    this.json.scenes[0].nodes.push(this.json.nodes.length - 1);
  }
  write(path, sceneExtras) {
    this.json.scenes[0].extras = sceneExtras;
    this.json.buffers[0].byteLength = this.length;
    const bin = Buffer.concat(this.chunks, this.length);
    const binPad = Buffer.alloc((4 - (bin.length % 4)) % 4);
    let json = Buffer.from(JSON.stringify(this.json));
    json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
    const total = 12 + 8 + json.length + 8 + bin.length + binPad.length;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(total, 8);
    const jh = Buffer.alloc(8);
    jh.writeUInt32LE(json.length, 0);
    jh.writeUInt32LE(0x4e4f534a, 4);
    const bh = Buffer.alloc(8);
    bh.writeUInt32LE(bin.length + binPad.length, 0);
    bh.writeUInt32LE(0x004e4942, 4);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, Buffer.concat([header, jh, json, bh, bin, binPad]));
    return total;
  }
}

// PBR starting points; the multi-layer car-paint shader replaces "paint" in M4.
const MATERIALS = {
  paint: { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.55, roughnessFactor: 0.28 }, extras: { apexRole: 'paint' } },
  glass: { pbrMetallicRoughness: { baseColorFactor: [0.75, 0.8, 0.85, 0.35], metallicFactor: 0, roughnessFactor: 0.05 }, alphaMode: 'BLEND', doubleSided: true, extras: { apexRole: 'glass' } },
  lamp: { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 0.9], metallicFactor: 0, roughnessFactor: 0.15 }, alphaMode: 'BLEND', extras: { apexRole: 'lamp' } },
  trim: { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.1, roughnessFactor: 0.6 }, extras: { apexRole: 'trim' } },
  tint: { pbrMetallicRoughness: { baseColorFactor: [0.05, 0.06, 0.08, 0.9], metallicFactor: 0, roughnessFactor: 0.05 }, alphaMode: 'BLEND', doubleSided: true, extras: { apexRole: 'tint' } },
  chrome: { pbrMetallicRoughness: { baseColorFactor: [0.026, 0.031, 0.037, 1], metallicFactor: 0.7, roughnessFactor: 0.2 }, extras: { apexRole: 'chrome' } },
  tire: { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 }, extras: { apexRole: 'tire' } },
  rim: { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.8, roughnessFactor: 0.3 }, extras: { apexRole: 'rim' } },
  caliper: { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.3, roughnessFactor: 0.5 }, extras: { apexRole: 'caliper' } },
};
const MASK_ROLE = (m) => (m & 8 ? 'tint' : m & 4 ? 'lamp' : m & 2 ? 'glass' : m & 1 ? 'paint' : 'trim');
const MASK = { paint: 1, glass: 2, lamp: 4, tint: 8, trim: 0 };
// Roles the importer assigns itself (not from the bake's mask): 'chrome' (dark-chrome headlamp housings).

function quantFrame(parts) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const b = bounds(p.pos, p.n);
    for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], b.lo[a]); hi[a] = Math.max(hi[a], b.hi[a]); }
  }
  const center = lo.map((l, a) => (l + hi[a]) / 2);
  const half = lo.map((l, a) => Math.max((hi[a] - l) / 2, 1e-6));
  return { center, half, lo, hi };
}

// ---- hole fill ----------------------------------------------------------------------------------------------------
// Some bakes lost parts of their shell (the Maybach's windscreen, panoramic roof panes and rear window are missing, and
// nothing sits behind its grille), so one looks straight into — or through — an empty body. Seen along one axis
// (from above, the front or the rear), a hole is a cell whose first surface lies far behind the surfaces around it (or
// that has none). Holes that are enclosed by the body (not reachable from the raster border through other holes) and lie
// in the configured box get a new surface: a membrane (harmonic interpolation) through the surrounding surfaces, so a
// windscreen runs from the cowl to the roof header and a roof pane from rail to rail. Cells that were not holes but lie
// below the membrane (a dashboard seen through the missing windscreen) are covered too.
const FILL_CELL = 0.03; // [m]
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
// A view is an orthonormal frame: U, V span the raster, T points from the car toward the viewer (depth = p·T, the
// first surface seen is the one with the largest depth).
const FILL_VIEWS = {
  top: { U: [1, 0, 0], V: [0, 0, 1], T: [0, 1, 0] }, // looking down
  front: { U: [1, 0, 0], V: [0, 1, 0], T: [0, 0, 1] }, // looking back from the front
  rear: { U: [1, 0, 0], V: [0, 1, 0], T: [0, 0, -1] }, // looking forward from the rear
  left: { U: [0, 0, 1], V: [0, 1, 0], T: [1, 0, 0] }, // looking at the left side (+X)
  right: { U: [0, 0, 1], V: [0, 1, 0], T: [-1, 0, 0] }, // looking at the right side
};
/** Oblique view from direction `toward` (car → viewer), e.g. straight at a lamp that faces forward and outward. */
function viewFrom(toward) {
  const T = unit3(toward);
  const U = unit3(cross3(Math.abs(T[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0], T));
  return { U, V: cross3(T, U), T };
}

function fillRaster(g, V) {
  const C = FILL_CELL;
  const pu = new Float64Array(g.n), pv = new Float64Array(g.n), pd = new Float64Array(g.n);
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (let i = 0; i < g.n; i++) {
    const p = [g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]];
    pu[i] = dot3(p, V.U); pv[i] = dot3(p, V.V); pd[i] = dot3(p, V.T);
    u0 = Math.min(u0, pu[i]); u1 = Math.max(u1, pu[i]); v0 = Math.min(v0, pv[i]); v1 = Math.max(v1, pv[i]);
  }
  const nu = Math.ceil((u1 - u0) / C) + 1, nv = Math.ceil((v1 - v0) / C) + 1;
  const depth = new Float64Array(nu * nv).fill(-Infinity);
  for (let t = 0; t < g.idx.length; t += 3) {
    const a = g.idx[t], b = g.idx[t + 1], c = g.idx[t + 2];
    const edge = Math.max(Math.hypot(pu[a] - pu[b], pv[a] - pv[b]), Math.hypot(pu[b] - pu[c], pv[b] - pv[c]), Math.hypot(pu[c] - pu[a], pv[c] - pv[a]));
    const n = Math.min(64, Math.max(2, Math.ceil(edge / (C * 0.5))));
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) {
        const wa = i / n, wb = j / n, wc = 1 - wa - wb;
        const u = wa * pu[a] + wb * pu[b] + wc * pu[c];
        const v = wa * pv[a] + wb * pv[b] + wc * pv[c];
        const d = wa * pd[a] + wb * pd[b] + wc * pd[c];
        const k = Math.floor((v - v0) / C) * nu + Math.floor((u - u0) / C);
        if (d > depth[k]) depth[k] = d;
      }
    }
  }
  return { nu, nv, u0, v0, depth };
}

function fillHoles(g, fills) {
  const box = bounds(g.pos, g.n);
  const mid = box.lo.map((l, a) => (l + box.hi[a]) / 2);
  const add = { pos: [], nor: [], col: [], mask: [], idx: [] };
  const jobs = [];
  for (const f of fills) {
    if (f.view) jobs.push({ f, V: FILL_VIEWS[f.view], label: f.view });
    else {
      jobs.push({ f, V: viewFrom(f.dir), label: `dir ${f.dir}` });
      if (f.mirror) jobs.push({ f, V: viewFrom([-f.dir[0], f.dir[1], f.dir[2]]), label: `dir ${f.dir} mirrored` });
    }
  }
  for (const { f, V, label } of jobs) {
    const { nu, nv, u0, v0, depth } = fillRaster(g, V);
    const C = FILL_CELL, N = nu * nv, R = Math.round(0.16 / C);
    // Envelope: the nearest surface within ±16 cm.
    const env = new Float64Array(N).fill(-Infinity);
    for (let v = 0; v < nv; v++) {
      for (let u = 0; u < nu; u++) {
        let m = -Infinity;
        for (let dv = -R; dv <= R; dv++) {
          const vv = v + dv;
          if (vv < 0 || vv >= nv) continue;
          for (let du = -R; du <= R; du++) {
            const uu = u + du;
            if (uu >= 0 && uu < nu) m = Math.max(m, depth[vv * nu + uu]);
          }
        }
        env[v * nu + u] = m;
      }
    }
    const hole = new Uint8Array(N);
    if (f.detect === 'valley') {
      // A valley: across the opening (either raster axis), surface stands above this cell by `threshold` on both
      // sides within `reach`, and along it the opening is closed on both sides within `span` — a lamp opening in the
      // skin, however elongated. A sloped surface (higher on one side only) or the silhouette (nothing on one side)
      // is not a valley, whatever the view angle.
      const reach = Math.round((f.reach ?? 0.3) / C), span = Math.round((f.span ?? 1.2) / C);
      const rim = (u, v, du, dv, n) => {
        let m = -Infinity;
        for (let r = 1; r <= n; r++) {
          const uu = u + du * r, vv = v + dv * r;
          if (uu < 0 || vv < 0 || uu >= nu || vv >= nv) break;
          m = Math.max(m, depth[vv * nu + uu]);
        }
        return m;
      };
      const valley = (u, v, d, du, dv, n) => Math.min(rim(u, v, du, dv, n), rim(u, v, -du, -dv, n)) - d > f.threshold;
      for (let k = 0; k < N; k++) {
        const u = k % nu, v = (k / nu) | 0, d = depth[k] === -Infinity ? -1e9 : depth[k];
        hole[k] = (valley(u, v, d, 1, 0, reach) && valley(u, v, d, 0, 1, span)) ||
          (valley(u, v, d, 0, 1, reach) && valley(u, v, d, 1, 0, span)) ? 1 : 0;
      }
    } else {
      for (let k = 0; k < N; k++) hole[k] = depth[k] === -Infinity || env[k] - depth[k] > f.threshold ? 1 : 0;
    }
    // Exterior holes: reachable from the raster border through holes.
    const outside = new Uint8Array(N);
    const stack = [];
    for (let k = 0; k < N; k++) {
      const u = k % nu, v = (k / nu) | 0;
      if ((u === 0 || v === 0 || u === nu - 1 || v === nv - 1) && hole[k]) { outside[k] = 1; stack.push(k); }
    }
    const nbr = (k) => {
      const u = k % nu, v = (k / nu) | 0, out = [];
      if (u > 0) out.push(k - 1);
      if (u < nu - 1) out.push(k + 1);
      if (v > 0) out.push(k - nu);
      if (v < nv - 1) out.push(k + nu);
      return out;
    };
    while (stack.length) {
      for (const q of nbr(stack.pop())) if (hole[q] && !outside[q]) { outside[q] = 1; stack.push(q); }
    }
    // The box, relative to the body: x (or |x|: `ax`, both sides) and z about its centre, y above its bottom. A
    // cell is tested at the surface around it (the envelope depth); a box key the view does not constrain is free.
    const cellPoint = (k, d) => {
      const u = u0 + (k % nu + 0.5) * C, v = v0 + (((k / nu) | 0) + 0.5) * C;
      return [0, 1, 2].map((a) => u * V.U[a] + v * V.V[a] + d * V.T[a]);
    };
    const inBox = (k) => {
      if (env[k] === -Infinity) return false;
      const p = cellPoint(k, env[k]);
      const r = [p[0] - mid[0], p[1] - box.lo[1], p[2] - mid[2]];
      const B = f.box;
      if (B.ax && (Math.abs(r[0]) < B.ax[0] || Math.abs(r[0]) > B.ax[1])) return false;
      if (B.x && (r[0] < B.x[0] || r[0] > B.x[1])) return false;
      if (B.y && (r[1] < B.y[0] || r[1] > B.y[1])) return false;
      if (B.z && (r[2] < B.z[0] || r[2] > B.z[1])) return false;
      return true;
    };
    // `enclosed: false` (a frame with a gap in it): every hole in the box is filled; holes outside it are free edges.
    // `enclosed: 'local'`: a hole in the box is filled only when real surface bounds it within `reach` [m] in all
    // four directions (a lamp opening in the skin), so the silhouette, where the body curves away from this view
    // and every cell looks deep, is left alone.
    if (f.enclosed === false || f.enclosed === 'local') {
      const reach = Math.round((f.reach ?? 0.36) / C);
      const bounded = (k) => {
        const u = k % nu, v = (k / nu) | 0;
        for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          let hit = false;
          for (let r = 1; r <= reach && !hit; r++) {
            const uu = u + du * r, vv = v + dv * r;
            if (uu < 0 || vv < 0 || uu >= nu || vv >= nv) break;
            const q = vv * nu + uu;
            if (!hole[q]) hit = true;
          }
          if (!hit) return false;
        }
        return true;
      };
      for (let k = 0; k < N; k++) outside[k] = hole[k] && !(inBox(k) && (f.enclosed === false || bounded(k))) ? 1 : 0;
    }
    const unknown = new Uint8Array(N);
    for (let k = 0; k < N; k++) unknown[k] = hole[k] && !outside[k] ? 1 : 0;
    // Membrane: SOR on the unknown cells; exterior holes are free edges (not averaged in).
    const surf = Float64Array.from(depth, (d, k) => (unknown[k] ? NaN : d));
    const solve = () => {
      for (let k = 0; k < N; k++) {
        if (!unknown[k] || !Number.isNaN(surf[k])) continue;
        let sum = 0, n = 0;
        for (let r = 1; r < Math.max(nu, nv) && !n; r++) {
          for (const q of [k - r, k + r, k - r * nu, k + r * nu]) {
            if (q < 0 || q >= N || unknown[q] || outside[q] || depth[q] === -Infinity) continue;
            sum += depth[q]; n++;
          }
        }
        surf[k] = n ? sum / n : env[k];
      }
      const cells = [], links = [];
      for (let k = 0; k < N; k++) {
        if (!unknown[k]) continue;
        const q = nbr(k).filter((j) => !outside[j] && (unknown[j] || depth[j] !== -Infinity));
        if (q.length) { cells.push(k); links.push(q); }
      }
      for (let it = 0; it < 6000; it++) {
        let change = 0;
        for (let c = 0; c < cells.length; c++) {
          const k = cells[c], q = links[c];
          let sum = 0;
          for (let j = 0; j < q.length; j++) sum += surf[q[j]];
          const d = 1.9 * (sum / q.length - surf[k]);
          surf[k] += d;
          if (Math.abs(d) > change) change = Math.abs(d);
        }
        if (change < 1e-5) break;
      }
    };
    solve();
    // Known cells in the box sunk below the membrane (interior seen through the hole) are covered too.
    for (let pass = 0; pass < (f.grow === false ? 0 : 6); pass++) {
      let grew = 0;
      for (let k = 0; k < N; k++) {
        if (unknown[k] || outside[k] || depth[k] === -Infinity || !inBox(k)) continue;
        const around = nbr(k).filter((q) => unknown[q]);
        if (around.length < 2) continue;
        const m = around.reduce((a, q) => a + surf[q], 0) / around.length;
        if (depth[k] < m - 0.04) { unknown[k] = 1; surf[k] = m; grew++; }
      }
      if (!grew) break;
      solve();
    }
    // Emit one quad per filled cell in the box; corners average the surrounding surface values.
    // A recessed backing reaches one cell under its frame, so no sliver of the hole shows at the stepped edge.
    const edge = new Uint8Array(N);
    if (f.inset) {
      for (let k = 0; k < N; k++) {
        if (!unknown[k] || !inBox(k)) continue;
        for (const q of nbr(k)) if (!unknown[q] && !outside[q] && depth[q] !== -Infinity) edge[q] = 1;
      }
    }
    const emit = (k) => (unknown[k] || edge[k]) && inBox(k);
    if (process.env.APEX_FILL_DEBUG && label.startsWith(process.env.APEX_FILL_DEBUG)) {
      for (let v = nv - 1; v >= 0; v--) {
        let row = '';
        for (let u = 0; u < nu; u++) {
          const k = v * nu + u;
          row += emit(k) ? '@' : unknown[k] ? 'u' : outside[k] ? (depth[k] === -Infinity ? ' ' : 'o') : inBox(k) ? ':' : '.';
        }
        console.log((v0 + (v + 0.5) * C).toFixed(2).padStart(6), row);
      }
    }
    const corner = new Map();
    const inset = f.inset ?? 0;
    const vertex = (cu, cv) => {
      const key = cv * (nu + 1) + cu;
      if (corner.has(key)) return corner.get(key);
      let sum = 0, n = 0;
      for (const [du, dv] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const u = cu + du, v = cv + dv;
        if (u < 0 || v < 0 || u >= nu || v >= nv) continue;
        const k = v * nu + u;
        if (outside[k] || (!unknown[k] && depth[k] === -Infinity)) continue;
        if (!unknown[k] && !emit(k) && f.inset) continue; // a recessed backing does not climb onto its frame
        if (!unknown[k] && !f.inset) continue; // a pane meets its frame at the frame's own depth (below)
        sum += unknown[k] ? surf[k] : depth[k]; n++;
      }
      if (!n) {
        for (const [du, dv] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
          const u = cu + du, v = cv + dv;
          if (u < 0 || v < 0 || u >= nu || v >= nv) continue;
          const k = v * nu + u;
          if (!outside[k] && depth[k] !== -Infinity) { sum += depth[k]; n++; }
        }
      }
      const u = u0 + cu * C, v = v0 + cv * C, d = sum / n - inset;
      const p = [0, 1, 2].map((a) => u * V.U[a] + v * V.V[a] + d * V.T[a]);
      const id = g.n + add.pos.length / 3;
      add.pos.push(...p);
      add.nor.push(0, 0, 0);
      add.col.push(...f.color);
      add.mask.push(MASK[f.role]);
      corner.set(key, id);
      return id;
    };
    let cells = 0, tinted = 0;
    for (let k = 0; k < N; k++) {
      if (!emit(k)) continue;
      const u = k % nu, v = (k / nu) | 0;
      const a = vertex(u, v), b = vertex(u + 1, v), c = vertex(u + 1, v + 1), d = vertex(u, v + 1);
      add.idx.push(a, b, c, a, c, d);
      cells++;
    }
    // Winding and normals face the viewer of this raster (outward): a double-sided material flips the normal of a
    // back-facing triangle, and a normal that disagrees with the winding lights the pane from behind. Flat roof panes
    // become tinted glass.
    const base = g.n;
    const at = (i, a) => add.pos[(i - base) * 3 + a];
    for (let t = add.idx.length - cells * 6; t < add.idx.length; t += 3) {
      let [a, b, c] = [add.idx[t], add.idx[t + 1], add.idx[t + 2]];
      const e1 = [0, 1, 2].map((q) => at(b, q) - at(a, q)), e2 = [0, 1, 2].map((q) => at(c, q) - at(a, q));
      const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const l = Math.hypot(...nrm) || 1;
      if (dot3(nrm, V.T) < 0) {
        [b, c] = [c, b];
        add.idx[t + 1] = b;
        add.idx[t + 2] = c;
        for (let q = 0; q < 3; q++) nrm[q] = -nrm[q];
      }
      for (const i of [a, b, c]) for (let q = 0; q < 3; q++) add.nor[(i - base) * 3 + q] += nrm[q] / l;
      if (f.flatRole && Math.abs(nrm[1]) / l > Math.cos((f.flatBelowDeg * Math.PI) / 180)) {
        for (const i of [a, b, c]) add.mask[i - base] = MASK[f.flatRole];
      }
    }
    for (let t = add.idx.length - cells * 6; t < add.idx.length; t++) if (add.mask[add.idx[t] - base] === MASK[f.flatRole]) tinted++;
    console.log(`  fill ${label}: ${cells} cells (${(cells * C * C).toFixed(2)} m²)${f.flatRole ? `, ${Math.round(tinted / 3)} tris ${f.flatRole}` : ''}`);
  }
  // A shared corner can end up with both roles; the split classifies a triangle by OR-ing its vertex masks, so resolve
  // each fill triangle to the role of its first vertex by giving vertices one role only (already the case per corner).
  const n = add.pos.length / 3;
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(add.nor[i * 3], add.nor[i * 3 + 1], add.nor[i * 3 + 2]) || 1;
    for (let q = 0; q < 3; q++) add.nor[i * 3 + q] /= l;
  }
  const grow = (A, extra, T) => { const o = new T(A.length + extra.length); o.set(A); o.set(extra, A.length); return o; };
  g.pos = grow(g.pos, add.pos, Float64Array);
  g.nor = grow(g.nor, add.nor, Float64Array);
  g.col = grow(g.col, add.col, Uint8Array);
  g.mask = grow(g.mask, add.mask, Uint8Array);
  g.idx = grow(g.idx, add.idx, Uint32Array);
  g.n += n;
}

// ---- wheel arches → wheels ----------------------------------------------------------------------------------------
// A wheel is fitted to the body it sits in: seen from the side, the arch lip is where the body's outer skin ends above
// the wheel (the depth of the outermost surface drops into the wheel well in one step; bumper corners curve inward
// smoothly and show no such step). The arch centre gives the wheel's longitudinal position, the lip height its size
// (tyre top one `gap` below the lip), the skin's outer |x| its track (tyre face 15 mm inboard of the fender).

const ARCH_CELL = 0.01; // [m] side-view raster

/** Side-view depth raster of one side of the body: max |x| of the surface per (z, y) cell. */
function sideRaster(g, side, z0, z1, y0, y1) {
  const nz = Math.ceil((z1 - z0) / ARCH_CELL), ny = Math.ceil((y1 - y0) / ARCH_CELL);
  const depth = new Float32Array(nz * ny).fill(-1);
  const P = g.pos;
  for (let t = 0; t < g.idx.length; t += 3) {
    const a = g.idx[t] * 3, b = g.idx[t + 1] * 3, c = g.idx[t + 2] * 3;
    const xs = [P[a] * side, P[b] * side, P[c] * side];
    if (xs[0] < 0 && xs[1] < 0 && xs[2] < 0) continue;
    const zs = [P[a + 2], P[b + 2], P[c + 2]], ys = [P[a + 1], P[b + 1], P[c + 1]];
    const zmin = Math.min(...zs), zmax = Math.max(...zs), ymin = Math.min(...ys), ymax = Math.max(...ys);
    if (zmax < z0 || zmin > z1 || ymax < y0 || ymin > y1) continue;
    const i0 = Math.max(0, Math.floor((zmin - z0) / ARCH_CELL)), i1 = Math.min(nz - 1, Math.floor((zmax - z0) / ARCH_CELL));
    const j0 = Math.max(0, Math.floor((ymin - y0) / ARCH_CELL)), j1 = Math.min(ny - 1, Math.floor((ymax - y0) / ARCH_CELL));
    const d = (zs[1] - zs[0]) * (ys[2] - ys[0]) - (zs[2] - zs[0]) * (ys[1] - ys[0]);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const pz = z0 + (i + 0.5) * ARCH_CELL, py = y0 + (j + 0.5) * ARCH_CELL;
        let x;
        if (Math.abs(d) < 1e-12) {
          x = Math.max(...xs); // edge-on in the side view
        } else {
          const u = ((pz - zs[0]) * (ys[2] - ys[0]) - (zs[2] - zs[0]) * (py - ys[0])) / d;
          const v = ((zs[1] - zs[0]) * (py - ys[0]) - (pz - zs[0]) * (ys[1] - ys[0])) / d;
          if (u < -0.02 || v < -0.02 || u + v > 1.02) continue;
          x = xs[0] + u * (xs[1] - xs[0]) + v * (xs[2] - xs[0]);
        }
        const k = i * ny + j;
        if (x > depth[k]) depth[k] = x;
      }
    }
  }
  return { depth, nz, ny, z0, y0 };
}

/** Arch lip around a nominal wheel centre (x0, y0, z0): { zc, top, skin, points }. */
function findArch(g, [x0, y0, z0], nominalRadius) {
  const side = Math.sign(x0);
  const yMax = 2 * nominalRadius + 0.3; // above: shoulders, beltlines, spoilers
  const r = sideRaster(g, side, z0 - 0.9, z0 + 0.9, 0, yMax);
  const at = (i, j) => r.depth[i * r.ny + j];
  const points = [];
  let skin = 0;
  for (let i = 0; i < r.nz; i++) {
    const z = r.z0 + (i + 0.5) * ARCH_CELL;
    if (Math.abs(z - z0) > 0.75) continue;
    for (let j = r.ny - 1; j >= 3; j--) {
      if (at(i, j) < 0) continue;
      let up = -1;
      for (let k = j; k < Math.min(r.ny, j + 5); k++) up = Math.max(up, at(i, k));
      const down = Math.max(at(i, j - 1), at(i, j - 2), at(i, j - 3));
      const y = r.y0 + j * ARCH_CELL;
      if (y < y0 - 0.05) break;
      if (up > 0.7 * Math.abs(x0) && up - down > 0.04) {
        points.push([z, y]);
        skin = Math.max(skin, up);
        break;
      }
    }
  }
  // Keep the contiguous lip through the wheel (the arch), not stray steps on bumpers or door shut lines.
  points.sort((a, b) => a[0] - b[0]);
  let seed = 0;
  points.forEach(([z], k) => { if (Math.abs(z - z0) < Math.abs(points[seed][0] - z0)) seed = k; });
  const connected = (a, b) => Math.abs(b[0] - a[0]) <= 0.035 && Math.abs(b[1] - a[1]) <= 0.06;
  let lo = seed, hi = seed;
  while (lo > 0 && connected(points[lo - 1], points[lo])) lo--;
  while (hi < points.length - 1 && connected(points[hi], points[hi + 1])) hi++;
  points.splice(hi + 1);
  points.splice(0, lo);
  if (points.length < 10) throw new Error(`no wheel arch found around z = ${z0.toFixed(2)}`);
  // Centre: middle of the arch's upper part (it is symmetric there); top: lip height at the centre.
  let zc = z0, top = 0;
  for (let it = 0; it < 3; it++) {
    const near = points.filter(([z]) => Math.abs(z - zc) < 0.12).map(([, y]) => y).sort((a, b) => a - b);
    top = near[Math.floor(near.length * 0.5)];
    const upper = points.filter(([, y]) => y > top - 0.22);
    zc = (Math.min(...upper.map(([z]) => z)) + Math.max(...upper.map(([z]) => z))) / 2;
  }
  if (process.env.APEX_ARCH_PNG) archPng(r, points, { zc, top }, [x0, y0, z0]);
  return { zc, top, skin, points };
}

/** Debug view (APEX_ARCH_PNG=dir): side depth raster, lip points (green), arch centre/top (red). */
function archPng(r, points, arch, [x0, , z0]) {
  const W = r.nz, H = r.ny, img = Buffer.alloc(W * H * 3);
  const put = (i, j, c) => {
    if (i < 0 || j < 0 || i >= W || j >= H) return;
    const o = ((H - 1 - j) * W + i) * 3;
    img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
  };
  for (let i = 0; i < W; i++) {
    for (let j = 0; j < H; j++) {
      const d = r.depth[i * H + j];
      const g = d < 0 ? 0 : Math.max(0, Math.min(255, Math.round(((d - 0.3) / (Math.abs(x0) + 0.25 - 0.3)) * 255)));
      put(i, j, [g, g, g]);
    }
  }
  for (const [z, y] of points) put(Math.floor((z - r.z0) / ARCH_CELL), Math.floor((y - r.y0) / ARCH_CELL), [60, 255, 60]);
  const ci = Math.floor((arch.zc - r.z0) / ARCH_CELL);
  for (let j = 0; j < H; j++) put(ci, j, [255, 80, 40]);
  for (let i = 0; i < W; i++) put(i, Math.floor((arch.top - r.y0) / ARCH_CELL), [255, 80, 40]);
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (tag, d) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(tag), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) img.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  mkdirSync(process.env.APEX_ARCH_PNG, { recursive: true });
  writeFileSync(join(process.env.APEX_ARCH_PNG, `arch_${x0 > 0 ? 'L' : 'R'}${z0 > 0 ? 'F' : 'R'}_${archPng.car}.png`),
    Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

/** Removes body triangles inside the fitted wheels (wheels, tyres, brakes baked into the body). */
function insideWheel(g, tri, wheels) {
  let cx = 0, cy = 0, cz = 0;
  for (let k = 0; k < 3; k++) {
    const v = g.idx[tri + k];
    cx += g.pos[v * 3] / 3;
    cy += g.pos[v * 3 + 1] / 3;
    cz += g.pos[v * 3 + 2] / 3;
  }
  return wheels.some(({ position: [wx, wy, wz], radius, width }) =>
    Math.abs(cx - wx) < width / 2 + 0.06 && (cy - wy) ** 2 + (cz - wz) ** 2 < (radius + 0.012) ** 2);
}

// ---- main -------------------------------------------------------------------------------------------------------

const [, , bakedPath, outDirArg] = process.argv;
if (!bakedPath) {
  console.error('usage: node tools/vehicle-import/import-crashlab.mjs <15_baked.js> [outDir]');
  process.exit(2);
}
const outDir = outDirArg ?? 'web/public/vehicles';
const BAKED = new Function(readFileSync(bakedPath, 'utf8') + '\nreturn BAKED;')();

for (const car of CARS) {
  const e = BAKED[car.key];
  if (!e) throw new Error(`bake has no entry ${car.key}`);
  const body = decode(e);
  const rawBox = bounds(body.pos, body.n);
  const s = car.realLength / (rawBox.hi[2] - rawBox.lo[2]);
  // Wheel centres in bake coords → axle midpoint and ground plane.
  const w = e.wheels.map(([x, y, z]) => [-x * s, y * s, -z * s]);
  const front = w.filter((p) => p[2] > 0), rear = w.filter((p) => p[2] <= 0);
  const midZ = (front.reduce((a, p) => a + p[2], 0) / front.length + rear.reduce((a, p) => a + p[2], 0) / rear.length) / 2;
  const midX = w.reduce((a, p) => a + p[0], 0) / w.length;
  const wheelBox = e.wheel && e.wheel.v > 0 ? e.wheel.bb : null;
  const radius = car.bakeWheelRadius ?? (wheelBox ? Math.max(wheelBox[4] - wheelBox[1], wheelBox[5] - wheelBox[2]) / 2 * s : null);
  const axleY = w.reduce((a, p) => a + p[1], 0) / w.length;
  const groundY = radius ? axleY - radius : rawBox.lo[1] * s;
  const t = [-midX, -groundY, -midZ];
  transform(body, s, t);
  if (car.fill) {
    console.log(`${car.id}: filling holes`);
    fillHoles(body, car.fill);
  }
  let wheels = w.map(([x, y, z]) => ({
    position: [x + t[0], y + t[1], z + t[2]],
    side: x + t[0] > 0 ? 'left' : 'right',
    axle: z + t[2] > 0 ? 'front' : 'rear',
  }));

  const bakeWheels = wheels.map((wh) => wh.position);
  let lowered = 0;
  let skins = wheels.map(() => Infinity);
  if (car.fitWheels) {
    archPng.car = car.id;
    // Fit every wheel to its arch; one tyre size per axle, one body height for the car.
    const fw = car.fitWheels;
    const arches = wheels.map((wh) => findArch(body, wh.position, radius));
    skins = arches.map((a) => a.skin);
    const tyreFor = (axle) => fw[axle];
    // Tyre radius from the lip (average per axle), capped at maxScale × spec; the rest of the gap lowers the body.
    const radiusOf = {};
    let lower = 0;
    for (const axle of ['front', 'rear']) {
      const idx = wheels.map((wh, k) => (wh.axle === axle ? k : -1)).filter((k) => k >= 0);
      const top = idx.reduce((a, k) => a + arches[k].top, 0) / idx.length;
      const spec = tyreFor(axle).radius;
      const wanted = (top - fw.gap) / 2;
      radiusOf[axle] = Math.min(Math.max(wanted, spec), spec * fw.maxScale);
      lower = Math.max(lower, top - fw.gap - 2 * radiusOf[axle]);
    }
    for (let i = 0; i < body.n; i++) body.pos[i * 3 + 1] -= lower;
    lowered = lower;
    wheels = wheels.map((wh, k) => {
      const tyre = tyreFor(wh.axle);
      const R = radiusOf[wh.axle];
      const sign = wh.side === 'left' ? 1 : -1;
      const x = sign * (arches[k].skin - tyre.width / 2 - 0.015);
      return {
        position: [x, R, arches[k].zc],
        side: wh.side,
        axle: wh.axle,
        radius: R,
        width: tyre.width,
        rimRadius: tyre.rimRadius + (R - tyre.radius), // a bigger arch gets a bigger rim, same sidewall
      };
    });
    console.log(`${car.id}: body lowered ${(lower * 1000).toFixed(0)} mm; wheels`, wheels.map((wh) =>
      `${wh.axle[0]}${wh.side[0]} x ${wh.position[0].toFixed(3)} z ${wh.position[2].toFixed(3)} R ${wh.radius.toFixed(3)} W ${wh.width}`).join(' | '));
  }

  const glb = new Glb();
  // Triangles to drop: wheels, tyres and brakes baked into the body (fitted-wheel cars only).
  const cut = (tri) => {
    if (!car.fitWheels) return false;
    if (insideWheel(body, tri, wheels)) return true;
    // Rim fragments around the bake's wheel centres: inside the rim radius and behind the outer skin (the fender
    // and bumper around the arch stay).
    const cb = car.cutBakeWheels;
    if (!cb) return false;
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) {
      const v = body.idx[tri + k];
      cx += body.pos[v * 3] / 3; cy += body.pos[v * 3 + 1] / 3; cz += body.pos[v * 3 + 2] / 3;
    }
    const near = (p) => Math.sign(cx) === Math.sign(p[0]) && (cy - (p[1] - lowered)) ** 2 + (cz - p[2]) ** 2 < cb.radius ** 2;
    if (cb.role) {
      // Tyre fragments: dark triangles of the given role, outboard of the wheel well.
      let m = 0, lum = 0;
      for (let k = 0; k < 3; k++) {
        const v = body.idx[tri + k];
        m |= body.mask ? body.mask[v] : 0;
        lum += (body.col[v * 3] + body.col[v * 3 + 1] + body.col[v * 3 + 2]) / (9 * 255);
      }
      return MASK_ROLE(m) === cb.role && lum < cb.maxLum && Math.abs(cx) > cb.minAbsX && bakeWheels.some(near);
    }
    return bakeWheels.some((p, k) => Math.abs(cx) < skins[k] - 0.04 && near(p));
  };
  let removed = 0;
  const lampBox = bounds(body.pos, body.n);
  // Lamp zones (car.lamps): near an end, within a height band and outboard of the grille / number plate. Glass there
  // is the lens; dark trim (below `trim.maxLum`) is the housing or smoked lens. Each spec relights it as a lamp
  // (or recolours it with another role).
  const centroid = (tri) => {
    let cx = 0, cy = 0, cz = 0, lum = 0;
    for (let k = 0; k < 3; k++) {
      const v = body.idx[tri + k];
      cx += body.pos[v * 3] / 3; cy += body.pos[v * 3 + 1] / 3; cz += body.pos[v * 3 + 2] / 3;
      lum += (body.col[v * 3] + body.col[v * 3 + 1] + body.col[v * 3 + 2]) / (9 * 255);
    }
    return { cx, cy, cz, lum };
  };
  const boxMidX = (lampBox.lo[0] + lampBox.hi[0]) / 2, boxMidZ = (lampBox.lo[2] + lampBox.hi[2]) / 2;
  const lampSpec = (tri, role) => {
    if (!car.lamps || (role !== 'glass' && role !== 'trim')) return null;
    const { cx, cy, cz, lum } = centroid(tri);
    const h = cy - lampBox.lo[1], ax = Math.abs(cx - boxMidX);
    for (let i = 0; i < car.lamps.length; i++) {
      const Z = car.lamps[i];
      const near = Z.end === 'front' ? cz > lampBox.hi[2] - Z.depth : cz < lampBox.lo[2] + Z.depth;
      if (!near || h > Z.maxHeight || h < (Z.minHeight ?? 0) || ax < (Z.minAbsX ?? 0)) continue;
      if (role === 'glass' && Z.glass) return `lamp_${i}_glass`;
      if (role === 'trim' && Z.trim && lum < Z.trim.maxLum) return `lamp_${i}_trim`;
    }
    return null;
  };
  const tintRasters = (car.tintGlass ?? []).map((b) => (b.view ? { V: FILL_VIEWS[b.view], ...fillRaster(body, FILL_VIEWS[b.view]) } : null));
  const inTintBox = (tri, role) => {
    if (!car.tintGlass) return false;
    const { cx, cy, cz } = centroid(tri);
    const r = [cx - boxMidX, cy - lampBox.lo[1], cz - boxMidZ];
    return car.tintGlass.some((b, i) => {
      if (r[0] < b.x[0] || r[0] > b.x[1] || r[1] < b.y[0] || r[1] > b.y[1] || r[2] < b.z[0] || r[2] > b.z[1]) return false;
      if (role === 'glass') return true;
      const R = tintRasters[i];
      if (!R) return false;
      const p = [cx, cy, cz];
      const u = Math.floor((dot3(p, R.V.U) - R.u0) / FILL_CELL), v = Math.floor((dot3(p, R.V.V) - R.v0) / FILL_CELL);
      if (u < 0 || v < 0 || u >= R.nu || v >= R.nv) return false;
      return dot3(p, R.V.T) > R.depth[v * R.nu + u] - 0.03; // on the outer surface
    });
  };
  // The body colour, for glass closed with paint: the median paint vertex colour.
  const paintColour = (() => {
    if (!body.mask) return [200, 200, 200];
    const ch = [[], [], []];
    for (let v = 0; v < body.n; v++) if (body.mask[v] & MASK.paint) for (let a = 0; a < 3; a++) ch[a].push(body.col[v * 3 + a]);
    return ch.map((c) => (c.sort((x, y) => x - y), c[c.length >> 1] ?? 200));
  })();
  let relit = 0, tinted = 0;
  const parts = split(body, (tri) => {
    if (cut(tri)) { removed++; return null; }
    const role = body.mask ? MASK_ROLE(body.mask[body.idx[tri]] | body.mask[body.idx[tri + 1]] | body.mask[body.idx[tri + 2]]) : 'trim';
    const lamp = lampSpec(tri, role);
    if (lamp) { relit++; return lamp; }
    if ((role === 'glass' || role === 'trim') && inTintBox(tri, role)) { tinted++; return 'tint'; }
    return role;
  });
  // Relit zones: the spec's colour, shaded by the lens's own brightness (glass) or graded toward the zone's lower
  // edge (trim); `role` other than lamp recolours instead (paint: the body colour). Colours are linear.
  for (const p of parts) {
    if (!p.key.startsWith('lamp_')) continue;
    const [, zi, kind] = p.key.split('_');
    const Z = car.lamps[Number(zi)], spec = Z[kind];
    const colour = spec.role === 'paint' ? paintColour : spec.color;
    const lo = lampBox.lo[1] + (Z.minHeight ?? 0), span = Math.max(1e-3, (Z.maxHeight ?? 1) - (Z.minHeight ?? 0));
    for (let i = 0; i < p.n; i++) {
      let f = 1;
      if (spec.role !== 'paint') {
        if (kind === 'glass' && !spec.gradient) {
          const lum = (p.col[i * 3] + p.col[i * 3 + 1] + p.col[i * 3 + 2]) / (3 * 255);
          f = 0.72 + 0.28 * Math.min(1, lum * 2.5);
        } else if (spec.gradient) {
          const t = Math.min(1, Math.max(0, (p.pos[i * 3 + 1] - lo) / span)); // 0 bottom … 1 top
          f = 1 - spec.gradient * t;
        }
      }
      for (let a = 0; a < 3; a++) p.col[i * 3 + a] = Math.round(colour[a] * f);
    }
    p.key = spec.role ?? 'lamp';
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const first = parts.findIndex((q) => q.key === parts[i].key);
    if (first === i) continue;
    parts[first] = mergeParts(parts[first], parts[i]);
    parts.splice(i, 1);
  }
  if (relit || tinted) console.log(`${car.id}: ${relit} lamp-zone triangles relit, ${tinted} pane triangles tinted`);
  if (removed) console.log(`${car.id}: removed ${removed} body triangles inside the wheels`);
  const bodyFrame = quantFrame(parts);
  glb.mesh('body', parts.map((p) => glb.primitive(p, bodyFrame.center, bodyFrame.half, p.key, MATERIALS[p.key])), bodyFrame.center, bodyFrame.half);

  let wheelInfo = null;
  if (!car.fitWheels && e.wheel && e.wheel.v > 0 && e.wheel.p) {
    const wg = decode(e.wheel);
    transform(wg, s, [0, 0, 0]);
    const total = wg.idx.length;
    const tireEnd = Math.min(e.wheel.tire | 0, total);
    const calStart = e.wheel.cal === undefined ? total : Math.min(e.wheel.cal, total);
    const roleOf = (tri) => (tri < tireEnd ? 'tire' : tri < calStart ? 'rim' : 'caliper');
    const all = split(wg, roleOf);
    const rotating = all.filter((p) => p.key !== 'caliper');
    const wf = quantFrame(rotating);
    // Which side is the rim face on? The rim's vertex centroid sits toward the outer face.
    const rim = all.find((p) => p.key === 'rim') ?? rotating[0];
    let cx = 0;
    for (let i = 0; i < rim.n; i++) cx += rim.pos[i * 3];
    cx /= rim.n;
    glb.mesh('wheel', rotating.map((p) => glb.primitive(p, wf.center, wf.half, p.key, MATERIALS[p.key])), wf.center, wf.half);
    const cal = all.find((p) => p.key === 'caliper');
    if (cal) {
      const cf = quantFrame([cal]);
      glb.mesh('caliper', [glb.primitive(cal, cf.center, cf.half, 'caliper', MATERIALS.caliper)], cf.center, cf.half);
    }
    wheelInfo = {
      radius: Math.max(wf.hi[1] - wf.lo[1], wf.hi[2] - wf.lo[2]) / 2,
      width: wf.hi[0] - wf.lo[0],
      // Rim face toward −x ⇒ the mesh is a right-side (−X) wheel; mirror across x for the left side.
      meshSide: cx < 0 ? 'right' : 'left',
    };
  }

  const box = quantFrame(parts);
  const extras = {
    apex: {
      id: car.id,
      name: car.name,
      frame: '+Z forward, +Y up, +X left; y=0 tyre contact plane, z=0 axle midpoint',
      scaleFromBake: s,
      dimensions: { length: box.hi[2] - box.lo[2], width: box.hi[0] - box.lo[0], height: box.hi[1] - box.lo[1] },
      bounds: { min: box.lo, max: box.hi },
      wheelbase: (wheels.filter((wh) => wh.axle === 'front').reduce((a, wh) => a + wh.position[2], 0) -
        wheels.filter((wh) => wh.axle === 'rear').reduce((a, wh) => a + wh.position[2], 0)) / (wheels.length / 2),
      wheels,
      wheel: car.fitWheels
        ? { ...wheels[0], position: undefined, side: undefined, axle: undefined, meshSide: null, procedural: true, style: car.fitWheels.style }
        : wheelInfo,
      source: car.source,
      license: car.license,
    },
  };
  const path = join(outDir, car.id, `${car.id}.glb`);
  const size = glb.write(path, extras);
  console.log(`${car.id}: ${(size / 1048576).toFixed(2)} MB, ${body.n} verts, ${body.idx.length / 3} tris, scale ${s.toFixed(4)}`,
    JSON.stringify({ dims: extras.apex.dimensions, wheelbase: extras.apex.wheelbase, wheel: wheelInfo }));
}

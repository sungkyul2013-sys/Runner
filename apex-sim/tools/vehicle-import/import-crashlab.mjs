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
  },
  {
    key: 'maybach',
    id: 'maybach_gls',
    name: { ko: '마이바흐 GLS', en: 'Maybach GLS' },
    realLength: 5.205, // [m] Mercedes-Maybach GLS 600
    source: 'User-provided FBX (Mercedes-Benz GLS 580), baked in Crash Lab — original source/licence not recorded',
    license: 'unknown (user-provided)',
    // The bake has no separate wheel mesh; rim fragments are baked into the body at the detected wheel centres.
    // They are cut out and replaced by a procedural 23" wheel: 275/40 R23 → outer radius 0.402 m, rim 0.292 m.
    proceduralWheel: { outerRadius: 0.402, width: 0.275, rimRadius: 0.292, cutRadius: 0.43, cutHalfWidth: 0.2 },
  },
];

// ---- decode -----------------------------------------------------------------------------------------------------

function b64(s, T) {
  const buf = Buffer.from(s, 'base64');
  return new T(buf.buffer, buf.byteOffset, buf.byteLength / T.BYTES_PER_ELEMENT);
}

function decode(e) {
  const P = b64(e.p, Int16Array), N = b64(e.n, Int8Array), C = b64(e.c, Uint8Array);
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
  tire: { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 }, extras: { apexRole: 'tire' } },
  rim: { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.8, roughnessFactor: 0.3 }, extras: { apexRole: 'rim' } },
  caliper: { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.3, roughnessFactor: 0.5 }, extras: { apexRole: 'caliper' } },
};
const MASK_ROLE = (m) => (m & 4 ? 'lamp' : m & 2 ? 'glass' : m & 1 ? 'paint' : 'trim');

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
  const radius = car.proceduralWheel
    ? car.proceduralWheel.outerRadius
    : wheelBox ? Math.max(wheelBox[4] - wheelBox[1], wheelBox[5] - wheelBox[2]) / 2 * s : null;
  const axleY = w.reduce((a, p) => a + p[1], 0) / w.length;
  const groundY = radius ? axleY - radius : rawBox.lo[1] * s;
  const t = [-midX, -groundY, -midZ];
  transform(body, s, t);
  const wheels = w.map(([x, y, z]) => ({
    position: [x + t[0], y + t[1], z + t[2]],
    side: x + t[0] > 0 ? 'left' : 'right',
    axle: z + t[2] > 0 ? 'front' : 'rear',
  }));

  const glb = new Glb();
  // Triangles to drop: rim fragments baked into the body (procedural-wheel cars only).
  const cut = (tri) => {
    const pw = car.proceduralWheel;
    if (!pw) return false;
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) {
      const v = body.idx[tri + k];
      cx += body.pos[v * 3] / 3; cy += body.pos[v * 3 + 1] / 3; cz += body.pos[v * 3 + 2] / 3;
    }
    return wheels.some(({ position: [wx, wy, wz] }) =>
      Math.abs(cx - wx) < pw.cutHalfWidth && (cy - wy) ** 2 + (cz - wz) ** 2 < pw.cutRadius ** 2);
  };
  let removed = 0;
  const parts = split(body, (tri) => {
    if (cut(tri)) { removed++; return null; }
    return body.mask ? MASK_ROLE(body.mask[body.idx[tri]] | body.mask[body.idx[tri + 1]] | body.mask[body.idx[tri + 2]]) : 'trim';
  });
  if (removed) console.log(`${car.id}: removed ${removed} baked rim triangles`);
  const bodyFrame = quantFrame(parts);
  glb.mesh('body', parts.map((p) => glb.primitive(p, bodyFrame.center, bodyFrame.half, p.key, MATERIALS[p.key])), bodyFrame.center, bodyFrame.half);

  let wheelInfo = null;
  if (e.wheel && e.wheel.v > 0 && e.wheel.p) {
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
      wheelbase: front[0][2] - rear[0][2],
      wheels,
      wheel: car.proceduralWheel
        ? { radius: car.proceduralWheel.outerRadius, width: car.proceduralWheel.width, rimRadius: car.proceduralWheel.rimRadius, meshSide: null, procedural: true }
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

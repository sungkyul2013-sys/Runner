// Minimal GLB reader for the generator: world-space (model-frame) positions and triangles of one mesh, decoding the
// KHR_mesh_quantization int16/uint16 normalized attributes written by tools/vehicle-import.
import fs from 'node:fs';

const COMPONENT = { 5120: [Int8Array, 1, 127], 5121: [Uint8Array, 1, 255], 5122: [Int16Array, 2, 32767],
  5123: [Uint16Array, 2, 65535], 5125: [Uint32Array, 4, 1], 5126: [Float32Array, 4, 1] };

export function readGlb(path) {
  const buf = fs.readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB`);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLen));
  return { json, bin };
}

function readAccessor({ json, bin }, index) {
  const acc = json.accessors[index];
  const view = json.bufferViews[acc.bufferView];
  const [Type, size, max] = COMPONENT[acc.componentType];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const stride = view.byteStride || size * comps;
  const base = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Float64Array(acc.count * comps);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const read = { 1: (o) => (Type === Int8Array ? dv.getInt8(o) : dv.getUint8(o)),
    2: (o) => (Type === Int16Array ? dv.getInt16(o, true) : dv.getUint16(o, true)),
    4: (o) => (Type === Float32Array ? dv.getFloat32(o, true) : dv.getUint32(o, true)) }[size];
  for (let i = 0; i < acc.count; ++i) {
    for (let c = 0; c < comps; ++c) {
      let v = read(base + i * stride + c * size);
      if (acc.normalized) v = Math.max(v / max, -1);
      out[i * comps + c] = v;
    }
  }
  return out;
}

// Positions (flat xyz, model frame) and triangle indices of every primitive of the named mesh node.
export function meshGeometry(glb, nodeName) {
  const node = glb.json.nodes.find((n) => n.name === nodeName);
  if (!node) throw new Error(`GLB has no node '${nodeName}'`);
  if (node.rotation && Math.abs(node.rotation[3] - 1) > 1e-9) throw new Error('node rotation not supported');
  const t = node.translation || [0, 0, 0], s = node.scale || [1, 1, 1];
  const positions = [], triangles = [];
  for (const prim of glb.json.meshes[node.mesh].primitives) {
    const p = readAccessor(glb, prim.attributes.POSITION);
    const base = positions.length / 3;
    for (let i = 0; i < p.length; i += 3) positions.push(p[i] * s[0] + t[0], p[i + 1] * s[1] + t[1], p[i + 2] * s[2] + t[2]);
    const idx = readAccessor(glb, prim.indices);
    for (const k of idx) triangles.push(base + k);
  }
  return { positions, triangles, extras: glb.json.scenes[0].extras };
}

// Positions (model frame) and triangles of the primitive of mesh node `nodeName` whose material has apexRole `role`.
export function primitiveGeometry(glb, nodeName, role) {
  const node = glb.json.nodes.find((n) => n.name === nodeName);
  if (!node) throw new Error(`GLB has no node '${nodeName}'`);
  const t = node.translation || [0, 0, 0], s = node.scale || [1, 1, 1];
  const prim = glb.json.meshes[node.mesh].primitives.find((p) => glb.json.materials[p.material]?.extras?.apexRole === role);
  if (!prim) return { positions: [], triangles: [] };
  const p = readAccessor(glb, prim.attributes.POSITION);
  const positions = [];
  for (let i = 0; i < p.length; i += 3) positions.push(p[i] * s[0] + t[0], p[i + 1] * s[1] + t[1], p[i + 2] * s[2] + t[2]);
  return { positions, triangles: [...readAccessor(glb, prim.indices)] };
}

// Connected pieces of a primitive (triangles sharing a vertex, or a vertex position to 1 mm): the separate panes of a
// glass primitive, the separate lamp units of a lamp primitive. Each piece: area-weighted centroid (the key the web
// matches its own split of the same primitive against, web/src/vehicles/Flexbody.ts), mean normal, area, box and
// sample points (vertices and triangle centroids). Sorted by area, largest first.
export function connectedPieces({ positions, triangles }) {
  const n = positions.length / 3;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const at = new Map();
  for (let i = 0; i < n; i++) {
    const key = [0, 1, 2].map((c) => Math.round(positions[3 * i + c] * 1000)).join(',');
    if (at.has(key)) join(i, at.get(key)); else at.set(key, i);
  }
  for (let t = 0; t < triangles.length; t += 3) { join(triangles[t], triangles[t + 1]); join(triangles[t], triangles[t + 2]); }
  const P = (i) => [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]];
  const pieces = new Map();
  for (let t = 0; t < triangles.length; t += 3) {
    const r = find(triangles[t]);
    if (!pieces.has(r)) pieces.set(r, { area: 0, c: [0, 0, 0], n: [0, 0, 0], lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity], samples: [] });
    const piece = pieces.get(r);
    const [a, b, c] = [P(triangles[t]), P(triangles[t + 1]), P(triangles[t + 2])];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const area = Math.hypot(...cr) / 2;
    piece.area += area;
    const centre = [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3);
    for (let k = 0; k < 3; k++) {
      piece.c[k] += centre[k] * area;
      piece.n[k] += cr[k] / 2;
      for (const q of [a, b, c]) { piece.lo[k] = Math.min(piece.lo[k], q[k]); piece.hi[k] = Math.max(piece.hi[k], q[k]); }
    }
    piece.samples.push(a, centre);
  }
  return [...pieces.values()]
    .filter((p) => p.area > 0)
    .map((p) => ({ ...p, c: p.c.map((x) => x / p.area), n: p.n.map((x) => x / (Math.hypot(...p.n) || 1)) }))
    .sort((a, b) => b.area - a.area);
}

// Surface samples: vertices, triangle centroids and edge midpoints (dense enough for 0.2 m voxel columns).
export function surfaceSamples({ positions, triangles }) {
  const pts = [];
  const P = (i) => [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]];
  for (let i = 0; i < positions.length; i += 3) pts.push([positions[i], positions[i + 1], positions[i + 2]]);
  for (let t = 0; t < triangles.length; t += 3) {
    const a = P(triangles[t]), b = P(triangles[t + 1]), c = P(triangles[t + 2]);
    pts.push([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]);
    pts.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
    pts.push([(b[0] + c[0]) / 2, (b[1] + c[1]) / 2, (b[2] + c[2]) / 2]);
  }
  return pts;
}

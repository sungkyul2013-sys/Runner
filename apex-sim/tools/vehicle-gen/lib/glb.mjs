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

// Map dump for the core's drive probe (core/tests/test_mapdrive.cpp): a map's physics (heightfield, static meshes)
// and drive routes along its roads (right-hand lane, spawn pose on the ground), in one binary file per map.
//   MAPDUMP=build/mapdump npx vitest run web/src/world/mapdump.test.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import type { MapData, Road } from './builder';
import { decodeDemPng, type DemMeta } from './dem';
import { spawnPose } from './ground';
import { buildHanbit } from './maps/hanbit';
import { buildProving } from './maps/proving';
import { buildSeorak } from './maps/seorak';
import type { OsmMap } from './osm';
import { STATION } from './road';

class Writer {
  private parts: Buffer[] = [];
  f64(...v: number[]) { const b = Buffer.alloc(8 * v.length); v.forEach((x, i) => b.writeDoubleLE(x, 8 * i)); this.parts.push(b); }
  f32(v: number) { const b = Buffer.alloc(4); b.writeFloatLE(v); this.parts.push(b); }
  i32(...v: number[]) { const b = Buffer.alloc(4 * v.length); v.forEach((x, i) => b.writeInt32LE(x, 4 * i)); this.parts.push(b); }
  bytes(a: ArrayBufferView) { this.parts.push(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); }
  str(s: string) { const b = Buffer.from(s, 'utf8'); this.i32(b.length); this.parts.push(b); }
  done() { return Buffer.concat(this.parts); }
}

/** The right-hand lane's centre line of a road, every 2 m from `s0` (the car drives it up to the road's end). */
function lane(r: Road, s0: number): Array<[number, number]> {
  const st = r.style;
  const u = st.oneWay ? Math.max(0, r.w.cw - st.laneWidth / 2) : r.w.median / 2 + st.laneWidth * (st.lanes - 0.5);
  const out: Array<[number, number]> = [];
  for (let s = s0; s <= r.length; s += 2) {
    const p = r.at(s);
    out.push([p.x - p.tz * u, p.z + p.tx * u]);
  }
  return out;
}

function dump(m: MapData, dir: string, pick: (r: Road) => boolean) {
  const w = new Writer();
  w.bytes(Buffer.from('APXM'));
  w.i32(1);
  const hf = m.physics.heightfield;
  w.f64(hf.originX, hf.originZ, hf.cell);
  w.i32(hf.nx, hf.nz);
  w.bytes(new Float32Array(hf.heights));
  w.bytes(new Uint8Array(hf.materials));
  w.i32(m.physics.meshes.length);
  for (const mesh of m.physics.meshes) {
    w.f64(...mesh.origin);
    w.i32(mesh.material, mesh.vertices.length / 3, mesh.indices.length);
    w.bytes(new Float32Array(mesh.vertices));
    w.bytes(new Int32Array(mesh.indices));
  }
  const routes = m.roads.filter((r) => !r.spec.noRoute && r.length > 120 && pick(r));
  w.i32(routes.length);
  for (const r of routes) {
    const pts = lane(r, 10);
    const yaw = Math.atan2(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
    const pose = spawnPose(m, { x: pts[0][0], z: pts[0][1], yaw }, r.surfaceAt(pts[0][0], pts[0][1]));
    const flags = r.st.reduce((f, p) => f | p.flags, 0);
    w.str(`${r.spec.id}${flags & STATION.bridge ? '+bridge' : ''}${flags & STATION.tunnel ? '+tunnel' : ''}`);
    w.f32(Math.min(r.style.designSpeed, 110));
    w.f64(...pose.position, pose.yaw, pose.pitch ?? 0, pose.roll ?? 0);
    w.i32(pts.length);
    w.bytes(new Float64Array(pts.flat()));
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${m.id}.bin`, w.done());
  console.log(`${m.id}: ${routes.length} routes → ${dir}/${m.id}.bin`);
}

describe.skipIf(!process.env.MAPDUMP)('map dump for the core drive probe', () => {
  const dir = process.env.MAPDUMP ?? '';
  it('proving', () => dump(buildProving(), dir, () => true), 120000);
  it('hanbit', () => dump(buildHanbit(), dir, () => true), 120000);
  it('seorak', () => {
    const meta = JSON.parse(readFileSync('web/public/data/dem/seorak.json', 'utf8')) as DemMeta;
    const dem = decodeDemPng(new Uint8Array(readFileSync('web/public/data/dem/seorak.png')), meta);
    const osm = JSON.parse(readFileSync('web/public/data/dem/seorak.osm.json', 'utf8')) as OsmMap;
    dump(buildSeorak(undefined, { dem, osm }), dir, () => true);
  }, 120000);
});

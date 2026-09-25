import { describe, expect, it } from 'vitest';
import { buildHanbit, timings } from './maps/hanbit';
import { STATION } from './road';

describe('Hanbit open-world map (§13)', () => {
  it('builds a ≥ 25 km² map with roads, bridges, tunnels and consistent physics data', () => {
    const t0 = performance.now();
    const m = buildHanbit();
    const ms = performance.now() - t0;
    const hf = m.physics.heightfield;
    const area = (hf.nx * hf.cell) * (hf.nz * hf.cell) / 1e6;
    let tris = 0;
    for (const mesh of m.physics.meshes) tris += mesh.indices.length / 3;
    let bridges = 0, tunnels = 0, len = 0;
    for (const r of m.roads) {
      len += r.length;
      for (let i = 0; i + 1 < r.st.length; i++) {
        const ds = r.st[i + 1].s - r.st[i].s;
        if (r.st[i].flags & STATION.bridge) bridges += ds;
        if (r.st[i].flags & STATION.tunnel) tunnels += ds;
      }
    }
    let nan = 0;
    for (const v of hf.heights) if (!Number.isFinite(v)) nan++;
    for (const mesh of m.physics.meshes) for (const v of mesh.vertices) if (!Number.isFinite(v)) nan++;
    console.log(`build ${ms.toFixed(0)} ms, ${area.toFixed(1)} km², roads ${(len / 1000).toFixed(1)} km (bridges ${(bridges / 1000).toFixed(2)} km, tunnels ${(tunnels / 1000).toFixed(2)} km), physics tris ${tris}, meshes ${m.physics.meshes.length}, buildings ${m.render.buildings.length}, trees ${m.render.trees.length / 5}, lamps ${m.render.lamps.length / 6}, signals ${m.render.signals.length}, graph ${m.graph.nodes.size} nodes / ${m.graph.edges.length} edges`);
    for (const r of m.roads) {
      let cut = 0, fill = 0, at = '';
      for (const p of r.st) {
        if (p.flags & (STATION.bridge | STATION.tunnel)) continue;
        if (p.ground - p.y > cut) {
          cut = p.ground - p.y;
          at = `(${p.x.toFixed(0)}, ${p.z.toFixed(0)}) s ${p.s.toFixed(0)}`;
        }
        fill = Math.max(fill, p.y - p.ground);
      }
      if (cut > 12 || fill > 8) console.log(`  ${r.spec.id}: max cut ${cut.toFixed(1)} m at ${at}, max fill ${fill.toFixed(1)} m, length ${r.length.toFixed(0)} m`);
    }
    console.log(JSON.stringify(timings.last, (_k, v) => (typeof v === "number" ? Math.round(v) : v)));
    expect(area).toBeGreaterThanOrEqual(25);
    expect(nan).toBe(0);
    expect(bridges).toBeGreaterThan(500);
    expect(tunnels).toBeGreaterThan(500);
  }, 120000);
});

// The ground a car is placed on (§13.1 지도에서 텔레포트, 스폰 포인트): every drivable surface of a map's physics —
// the terrain heightfield and each upward-facing static triangle (road decks, bridges, tunnels, slabs, pads, kerbs)
// — over a plan point. The terrain alone is not the ground: city streets stand on slabs about a metre over it,
// bridges and elevated roads far higher, and a tunnel runs under it. A car placed over the terrain there was buried
// in the deck (thrown out of it, its tyres caught under the surface) or put on the hill over the tunnel.
import type { MapGraph } from './builder';
import type { MapPhysics } from './types';
import { MAT } from './types';

interface Heights {
  heightAt(x: number, z: number): number;
}

/** For each plan point, the heights of every surface over it, ascending. One pass over the map's triangles. */
export function surfacesAt(physics: MapPhysics, terrain: Heights, points: ReadonlyArray<readonly [number, number]>): number[][] {
  const hf = physics.heightfield;
  const out = points.map(([x, z]) => {
    const ix = Math.floor((x - hf.originX) / hf.cell), iz = Math.floor((z - hf.originZ) / hf.cell);
    const inside = ix >= 0 && iz >= 0 && ix < hf.nx && iz < hf.nz;
    return inside && hf.materials[iz * hf.nx + ix] === MAT.hole ? [] : [terrain.heightAt(x, z)];
  });
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of points) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  for (const mesh of physics.meshes) {
    const v = mesh.vertices, ix = mesh.indices, [ox, oy, oz] = mesh.origin;
    for (let t = 0; t + 2 < ix.length; t += 3) {
      const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
      const ax = v[a] + ox, bx = v[b] + ox, cx = v[c] + ox;
      if (Math.max(ax, bx, cx) < x0 || Math.min(ax, bx, cx) > x1) continue;
      const az = v[a + 2] + oz, bz = v[b + 2] + oz, cz = v[c + 2] + oz;
      if (Math.max(az, bz, cz) < z0 || Math.min(az, bz, cz) > z1) continue;
      // Upward-facing only (walls and ceilings are not ground): the normal's y over its length.
      const e1x = bx - ax, e1y = v[b + 1] - v[a + 1], e1z = bz - az, e2x = cx - ax, e2y = v[c + 1] - v[a + 1], e2z = cz - az;
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      if (Math.abs(ny) < 0.3 * Math.hypot(nx, ny, nz)) continue;
      const det = e1x * e2z - e1z * e2x;
      if (Math.abs(det) < 1e-9) continue;
      points.forEach(([x, z], k) => {
        // Barycentric coordinates in plan.
        const px = x - ax, pz = z - az;
        const u = (px * e2z - pz * e2x) / det, w = (e1x * pz - e1z * px) / det;
        if (u < -1e-6 || w < -1e-6 || u + w > 1 + 1e-6) return;
        out[k].push(v[a + 1] + oy + u * e1y + w * e2y);
      });
    }
  }
  for (const list of out) list.sort((p, q) => p - q);
  return out;
}

/** The surface a car stands on near height `ref`: the highest one at most `above` over it (a deck under a bridge
 *  that passes over is not taken), else the lowest one; `ref` when there is none. */
export function pickSurface(heights: number[], ref: number, above: number): number {
  let best: number | null = null;
  for (const h of heights) if (h <= ref + above) best = h;
  return best ?? heights[0] ?? ref;
}

/** Where a car is put: plan position and heading (0 = +z); a point of interest also knows its road surface's
 *  height and slope. */
export interface SpawnSpot {
  x: number;
  z: number;
  yaw: number;
  y?: number;
  pitch?: number;
  roll?: number;
}

export interface SpawnPose {
  position: [number, number, number];
  yaw: number;
  speed: number;
  pitch?: number;
  roll?: number;
}

// Footprint samples (along, left) [m]: centre, 2 m ahead / behind, 1 m to the sides, the four corners.
const FOOTPRINT: Array<[number, number]> = [[0, 0], [2, 0], [-2, 0], [0, 1], [0, -1], [2.3, 0.9], [2.3, -0.9], [-2.3, 0.9], [-2.3, -0.9]];

/**
 * Spawn pose: 12 cm over the ground under the car's footprint — the surfaces nearest the reference height: a point of
 * interest's road surface, `road` (the carriageway a teleport snapped to), else the terrain or what stands on it
 * within 2.5 m (a street slab, a pad). On a slope the car is laid along it, pitch and roll from the ground 2 m ahead /
 * behind and 1 m to the sides, and lifted by what the fit leaves over (level, a 21 % lane buried the uphill bumper
 * half a metre deep and the drop onto its wheels damaged the car). The ground is the physics' own, not a road's
 * profile: a point of interest's height and slope came from the profile, and on a lane draped across a hillside the
 * uphill wheels started 25 cm inside the cobbles and burst.
 */
export function spawnPose(map: { physics: MapPhysics; terrain: Heights }, p: SpawnSpot, road?: number): SpawnPose {
  return placeOnGround(map, p, road).pose;
}

function placeOnGround(map: { physics: MapPhysics; terrain: Heights }, p: SpawnSpot, road?: number): { pose: SpawnPose; levels: number[][] } {
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  const ref = p.y ?? road ?? map.terrain.heightAt(p.x, p.z);
  const known = p.y !== undefined || road !== undefined;
  const levels = surfacesAt(map.physics, map.terrain, FOOTPRINT.map(([a, l]) => [p.x + a * fx + l * fz, p.z + a * fz - l * fx] as [number, number]));
  const g = levels.map((list) => pickSurface(list, ref, known ? 0.6 : 2.5));
  const h0 = g[0];
  const pitch = Math.atan2(g[1] - g[2], 4);
  const roll = Math.atan2(g[3] - g[4], 2);
  const tilted = Math.abs(pitch) > 0.03 || Math.abs(roll) > 0.03;
  let rest = 0; // the ground above the tilted plane under the car's footprint
  for (let k = 5; k < FOOTPRINT.length; k++) rest = Math.max(rest, g[k] - (h0 + FOOTPRINT[k][0] * Math.tan(pitch) + FOOTPRINT[k][1] * Math.tan(roll)));
  const pose: SpawnPose = {
    position: [p.x, h0 + 0.12 + Math.min(rest, 1), p.z],
    yaw: p.yaw,
    speed: 0,
    ...(tilted ? { pitch: Math.max(-0.5, Math.min(0.5, pitch)), roll: Math.max(-0.4, Math.min(0.4, roll)) } : {}),
  };
  return { pose, levels };
}

/** Whether something of the world stands in a car at `pose` (its footprint `levels` from surfacesAt): a surface
 *  between 10 cm over its wheels' line and its roof anywhere under the footprint (an obstacle in the lane, a building
 *  over a lane's end). A speed hump passes under the floor. */
function obstructed(pose: SpawnPose, levels: number[][]): boolean {
  const tp = Math.tan(pose.pitch ?? 0), tr = Math.tan(pose.roll ?? 0);
  return levels.some((list, k) => {
    const y = pose.position[1] + FOOTPRINT[k][0] * tp + FOOTPRINT[k][1] * tr;
    return list.some((h) => h > y + 0.1 && h < y + 1.2);
  });
}

/** A point `d` metres along a graph edge's polyline from (seg, t); null past its ends. */
function alongEdge(e: { xs: Float32Array; zs: Float32Array }, seg: number, t: number, d: number): { seg: number; t: number; x: number; z: number } | null {
  const len = (k: number) => Math.hypot(e.xs[k + 1] - e.xs[k], e.zs[k + 1] - e.zs[k]);
  let k = seg, rest = t * len(seg) + d;
  while (rest < 0 && k > 0) rest += len(--k);
  while (rest > len(k) && k + 2 < e.xs.length) rest -= len(k++);
  if (rest < 0 || rest > len(k)) return null;
  const u = len(k) > 0 ? rest / len(k) : 0;
  return { seg: k, t: u, x: e.xs[k] + (e.xs[k + 1] - e.xs[k]) * u, z: e.zs[k] + (e.zs[k + 1] - e.zs[k]) * u };
}

/** A teleport onto a road (the point of the route graph nearest the picked spot): the right-hand lane's centre there,
 *  facing along the road, and the carriageway's height (a deck over the terrain, a bridge, a tunnel under a hill). */
export function laneSpot(graph: MapGraph, snap: { edge: number; seg: number; t: number; x: number; z: number }): SpawnSpot & { road: number } {
  const e = graph.edges[snap.edge];
  const k = Math.min(snap.seg, e.xs.length - 2);
  const yaw = Math.atan2(e.xs[k + 1] - e.xs[k], e.zs[k + 1] - e.zs[k]);
  const rx = -Math.cos(yaw), rz = Math.sin(yaw); // right of the heading
  const road = e.ys[k] + (e.ys[k + 1] - e.ys[k]) * (k === snap.seg ? snap.t : 1);
  return { x: snap.x + rx * e.lane, z: snap.z + rz * e.lane, yaw, road };
}

/** The spawn pose of a teleport onto a road: in the lane at the snapped point, or the nearest clear stretch of the
 *  same road within 50 m when something stands in the lane there. */
export function roadSpawn(map: { physics: MapPhysics; terrain: Heights; graph: MapGraph }, snap: { edge: number; seg: number; t: number; x: number; z: number }): SpawnPose {
  let first: SpawnPose | null = null;
  for (const d of [0, 6, -6, 12, -12, 18, -18, 25, -25, 35, -35, 50, -50]) {
    const at = alongEdge(map.graph.edges[snap.edge], Math.min(snap.seg, map.graph.edges[snap.edge].xs.length - 2), snap.t, d);
    if (!at) continue;
    const spot = laneSpot(map.graph, { edge: snap.edge, ...at });
    const { pose, levels } = placeOnGround(map, spot, spot.road);
    first ??= pose;
    if (!obstructed(pose, levels)) return pose;
  }
  return first!;
}

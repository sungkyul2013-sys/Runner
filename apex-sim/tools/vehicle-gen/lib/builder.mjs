// Emits "apex-vehicle" JSON (docs/VEHICLE_FORMAT.md): explicit nodes / beams / sliders / torsion bars, pressure-wheel
// blocks expanded by the core, and the vehicle section. Holds the construction helpers learned on the APEX Proto
// car (core/src/proto_car.cpp): hardpoints tied into the lattice on all sides, stiff triangulated uprights, tie rods
// placed for zero bump steer.
import { add, sub, scale, dot, len, dist, circleThrough, rotateAbout, norm, cross as cross3 } from './v3.mjs';
import { knucklePose } from './kinematics.mjs';

const round = (x, d = 5) => Math.round(x * 10 ** d) / 10 ** d;

export class VehicleBuilder {
  constructor() {
    this.nodes = [];           // { id, p, mass, radius, material, flags }
    this.byId = new Map();
    this.groups = {};
    this.beams = [];           // [a, b, group, overrides?]
    this.sliders = [];
    this.torsionBars = [];
    this.pressureWheels = [];
    this.triangles = [];       // collision surface: [a, b, c, group]
    this.lattice = [];         // ids of chassis lattice nodes
  }

  node(id, p, mass, { radius = 0.03, material = 'steel', flags } = {}) {
    if (this.byId.has(id)) throw new Error(`duplicate node ${id}`);
    const n = { id, p: [...p], mass, radius, material, flags };
    this.nodes.push(n);
    this.byId.set(id, n);
    return id;
  }
  pos(id) { return this.byId.get(id).p; }
  mass(id) { return this.byId.get(id).mass; }
  group(name, props) { this.groups[name] = props; }
  beam(a, b, group, overrides) {
    if (!this.byId.has(a) || !this.byId.has(b)) throw new Error(`beam ${a}-${b}: unknown node`);
    this.beams.push(overrides ? [a, b, group, overrides] : [a, b, group]);
  }

  // Box lattice clipped to a hull: node (x_i, y_j, z_k) exists when `inside(p)`; 13 forward neighbour directions.
  // Beam stiffness k = EA / L (uniform axial rigidity, like core makeLattice) when `axialStiffness` is given.
  buildLattice({ xs, ys, zs, inside, group = 'chassis', radius = 0.05, axialStiffness }) {
    const grid = new Map();
    const key = (i, j, k) => `${i},${j},${k}`;
    xs.forEach((x, i) => ys.forEach((y, j) => zs.forEach((z, k) => {
      if (!inside([x, y, z])) return;
      const id = this.node(`c${i}_${j}_${k}`, [x, y, z], 1, { radius });
      grid.set(key(i, j, k), id);
      this.lattice.push(id);
    })));
    const dirs = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1],
      [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1]];
    for (const [k0, id] of grid) {
      const [i, j, k] = k0.split(',').map(Number);
      for (const [di, dj, dk] of dirs) {
        const other = grid.get(key(i + di, j + dj, k + dk));
        if (!other) continue;
        if (axialStiffness) this.beam(id, other, group, { k: Math.round(axialStiffness / dist(this.pos(id), this.pos(other))) });
        else this.beam(id, other, group);
      }
    }
    return grid;
  }

  // Collision surface of a lattice (§5.2): every lattice cube is split into the six Kuhn tetrahedra around its main
  // diagonal (all of whose edges are lattice beams); a tetrahedron exists when its four nodes do, so the clipped
  // fringe of the lattice (partial cubes under a sloping bonnet or bumper) is covered too. The surface is the set of
  // tetrahedron faces not shared by two tetrahedra, wound counter-clockwise seen from outside.
  latticeSurface(grid, group = 0) {
    const key = (i, j, k) => `${i},${j},${k}`;
    // Kuhn decomposition of the unit cube: paths 0 → 7 through the corners (bit 0 = +i, 1 = +j, 2 = +k).
    const tets = [[0, 1, 3, 7], [0, 1, 5, 7], [0, 2, 3, 7], [0, 2, 6, 7], [0, 4, 5, 7], [0, 4, 6, 7]];
    const faces = new Map();  // sorted ids → { tri, opposite, count }
    for (const k0 of grid.keys()) {
      const [i, j, k] = k0.split(',').map(Number);
      const corner = (c) => grid.get(key(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1)));
      for (const tet of tets) {
        const ids = tet.map(corner);
        if (ids.some((id) => !id)) continue;
        for (let f = 0; f < 4; ++f) {
          const tri = ids.filter((_, q) => q !== f);
          const fk = [...tri].sort().join('|');
          const entry = faces.get(fk);
          if (entry) entry.count++;
          else faces.set(fk, { tri, opposite: ids[f], count: 1 });
        }
      }
    }
    let count = 0;
    for (const { tri, opposite, count: c } of faces.values()) {
      if (c !== 1) continue;
      const [pa, pb, pc] = tri.map((id) => this.pos(id));
      const nrm = cross3(sub(pb, pa), sub(pc, pa));
      const outward = dot(nrm, sub(pa, this.pos(opposite))) >= 0;  // away from the tetrahedron's fourth node
      this.triangles.push(outward ? [...tri, group] : [tri[0], tri[2], tri[1], group]);
      ++count;
    }
    return count;
  }

  // Hardpoint tied into the lattice through the nearest lattice node in each of the 8 octants around it, so it is
  // held in every direction (nearest nodes alone often lie in one lattice plane).
  // Near a hull boundary (under the bonnet, next to a wheel arch) some octants are empty; the nearest remaining nodes
  // then top the set up to six, and the beam directions must still span all three axes.
  hardpoint(id, p, mass, { reach = 0.6 } = {}) {
    this.node(id, p, mass);
    const chosen = new Set();
    for (let o = 0; o < 8; ++o) {
      const sgn = [o & 1 ? 1 : -1, o & 2 ? 1 : -1, o & 4 ? 1 : -1];
      let best = null, bestD = reach;
      for (const lid of this.lattice) {
        const d = sub(this.pos(lid), p);
        if (d[0] * sgn[0] < 0 || d[1] * sgn[1] < 0 || d[2] * sgn[2] < 0) continue;
        const l = len(d);
        if (l < bestD) { bestD = l; best = lid; }
      }
      if (best) chosen.add(best);
    }
    const byDistance = [...this.lattice].sort((a, c) => dist(this.pos(a), p) - dist(this.pos(c), p));
    for (const lid of byDistance) {
      if (chosen.size >= 6) break;
      chosen.add(lid);
    }
    // conditioning: det of Σ u·uᵀ over unit beam directions (1 for an ideal isotropic spread of 3 axes)
    const M = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const lid of chosen) {
      const u = sub(this.pos(lid), p), l = len(u);
      for (let i = 0; i < 3; ++i) for (let j = 0; j < 3; ++j) M[3 * i + j] += (u[i] / l) * (u[j] / l);
    }
    const det = M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6]);
    if (det < 0.05) throw new Error(`hardpoint ${id} at ${p.map((x) => x.toFixed(3))}: attachment spread too flat (det ${det.toFixed(3)})`);
    for (const lid of chosen) this.beam(id, lid, 'hardpoint');
    return id;
  }

  // Tie rod / toe link inner point with zero bump steer: the knuckle's steering-arm point sweeps a circle as the
  // wheel moves ±50 mm with the steering held; every point on that circle's axis is equidistant from it. Takes the
  // axis point nearest the desired rack location.
  zeroBumpSteerPoint(knuckle, steerPoint, near) {
    const pts = [-0.05, 0.0, 0.05].map((h) => knucklePose(knuckle, h)(steerPoint));
    const { center, normal } = circleThrough(...pts);
    return add(center, scale(normal, dot(sub(near, center), normal)));
  }

  toJSON(meta) {
    const r = (v) => v.map((x) => round(x));
    return {
      format: 'apex-vehicle',
      version: 1,
      ...meta.header,
      hydroChannels: meta.hydroChannels ?? 0,
      nodes: this.nodes.map((n) => {
        const row = [n.id, ...r(n.p), round(n.mass, 4), round(n.radius, 4)];
        if (n.material !== 'steel' || n.flags) row.push(n.material);
        if (n.flags) row.push(n.flags);
        return row;
      }),
      beamGroups: this.groups,
      beams: this.beams,
      sliders: this.sliders,
      torsionBars: this.torsionBars,
      triangles: this.triangles,
      pressureWheels: this.pressureWheels,
      vehicle: meta.vehicle,
      targets: meta.targets,
    };
  }
}

// Front-view helpers shared by the suspension builders.
export function steeringFactor(b, { steerPoint, rack, axisA, axisB, lock }) {
  const k = norm(sub(axisB, axisA));
  const turned = rotateAbout(steerPoint, axisA, k, lock);
  return dist(turned, rack) / dist(steerPoint, rack) - 1;
}

export { dist };

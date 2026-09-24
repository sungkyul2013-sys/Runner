#!/usr/bin/env node
// Generates web/public/vehicles/porsche_911_turbo_991/vehicle.json — the user's Porsche 911 Turbo (991, 2014) model as
// a node-beam vehicle (KICKOFF decision: the user's own models, §1.7 exception).
//
//   chassis:    lattice clipped to the GLB body hull (0.225 × 0.22 × 0.30 m), wheel arches carved out
//   front:      MacPherson strut (strut tube = part of the upright, top mount on a slider, coilover, bump stop)
//   rear:       five-link (split upper and lower arms + toe link), coilover to the lower ball joint
//   both:       anti-roll bars, tie rod / toe link at the zero-bump-steer point, pressure wheels 245/35 R20 · 305/30 R20
//   powertrain: 3.8 L twin-turbo flat six, 7-speed PDK, AWD (fixed 30/70 split), rear clutch LSD
//
// Data: Porsche AG press kit "911 Turbo / Turbo S" (2013): 1,595 kg (DIN), 383 kW, 660 N·m 1,950–5,000 rpm,
// 0–100 km/h 3.4 s (3.2 s with Sport Chrono), 315 km/h, wheelbase 2,450 mm; weight split and PDK ratios from
// period road tests. Values the sources do not give (spring rates, bushings, tyre shape factors) are engineering
// estimates and marked as such in the output's "sources".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, meshGeometry, surfaceSamples, primitiveGeometry, connectedPieces } from './lib/glb.mjs';
import { VehicleBuilder, steeringFactor } from './lib/builder.mjs';
import { add, sub, scale, norm, dist, dot, cross } from './lib/v3.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const id = 'porsche_911_turbo_991';
const glbPath = path.join(root, 'web/public/vehicles', id, `${id}.glb`);
const outPath = path.join(root, 'web/public/vehicles', id, 'vehicle.json');

// ---- model data -----------------------------------------------------------------------------------------------
const glb = readGlb(glbPath);
const body = meshGeometry(glb, 'body');
const meta = body.extras.apex;
const R = meta.wheel.radius;                               // 0.3446 m (both axles in the model)
const wheelsModel = meta.wheels;                           // FL, FR, RL, RR wheel centres
const zF = wheelsModel[0].position[2], zR = wheelsModel[2].position[2];
const samples = surfaceSamples(body);

// Hull queries from surface samples: roof height per (x, z) column and half width per (y, z) band.
function maxOver(filter, value) {
  let m = -Infinity;
  for (const p of samples) if (filter(p)) m = Math.max(m, value(p));
  return m;
}
const roofAt = (x, z) => maxOver((p) => Math.abs(p[0] - x) < 0.12 && Math.abs(p[2] - z) < 0.15, (p) => p[1]);
const halfWidthAt = (y, z) => maxOver((p) => Math.abs(p[1] - y) < 0.15 && Math.abs(p[2] - z) < 0.15, (p) => Math.abs(p[0]));
const zMin = samples.reduce((m, p) => Math.min(m, p[2]), Infinity), zMax = samples.reduce((m, p) => Math.max(m, p[2]), -Infinity);

// ---- targets and parameters -------------------------------------------------------------------------------------
const TARGET_MASS = 1595, TARGET_FRONT = 0.39;
const tyreFront = { width: 0.20, rimWidth: 0.19, treadMass: 0.20, rimMass: 0.30 };   // 245/35 ZR20 on 8.5J
const tyreRear = { width: 0.26, rimWidth: 0.25, treadMass: 0.24, rimMass: 0.30 };    // 305/30 ZR20 on 11J
// Stiff spokes hold the rim against centrifugal growth up to top speed (1e5 N/m let it grow 2.6 cm at 300 km/h and
// the tread ran into the road). They load the axle nodes (48 spokes each), hence the heavier hub nodes below.
// (Diametral chords across the rim or tread instead couple the patch to the far side of the ring and start a 10 Hz
// wheel hop above ≈ 210 km/h.)
// Tread contact spheres of 5 cm: static deflection (≈ 1.2 cm) + centrifugal growth (≈ 2.5 cm at 280 km/h) must stay
// inside the sphere, or CCD clamps the node.
const wheelSpokes = { spokeStiffness: 2.5e5, treadNodeRadius: 0.05 };
const hubNodeMass = 4.8;  // [kg] axle nodes: Σk ≈ 48 spokes + the knuckle beams
const segments = 24;

const b = new VehicleBuilder();
b.group('chassis', { k: 6e5, zeta: 0.1 });                // per beam: k = EA / L, EA = 1.8e5 N
b.group('hardpoint', { k: 8e5, zeta: 0.2 });
b.group('knuckle', { k: 2e6, zeta: 0.1 });
b.group('link', { k: 1.5e6, zeta: 0.1 });
b.group('tierod', { type: 'hydro', k: 1.5e6, zeta: 0.1 });
b.group('toelink', { k: 1.5e6, zeta: 0.1 });
b.group('bumpstop', { type: 'bounded', k: 1.5e5, zeta: 0.05 });
b.group('subframe', { k: 1.2e6, zeta: 0.1 });

// ---- chassis lattice -------------------------------------------------------------------------------------------
const xs = [-0.9, -0.675, -0.45, -0.225, 0, 0.225, 0.45, 0.675, 0.9];
const ys = [0.14, 0.36, 0.58, 0.80, 1.02];
const zs = [];
for (let z = -2.1; z <= 2.1001; z += 0.3) zs.push(Math.round(z * 1000) / 1000);
const wheelEnvelope = (p) => wheelsModel.some((w) => {
  const width = w.axle === 'front' ? tyreFront.width : tyreRear.width;
  return Math.abs(p[0] - w.position[0]) < width / 2 + 0.14 &&
         Math.hypot(p[1] - w.position[1], p[2] - w.position[2]) < R + 0.12;
});
const inside = (p) => {
  const [x, y, z] = p;
  if (z < zMin + 0.08 || z > zMax - 0.08) return false;
  if (y > roofAt(x, z) - 0.05) return false;
  if (Math.abs(x) > halfWidthAt(Math.max(y, 0.3), z) - 0.06) return false;
  return !wheelEnvelope(p);
};
const latticeGrid = b.buildLattice({ xs, ys, zs, inside, axialStiffness: 1.8e5 });
// Collision surface: the lattice hull is self-collision group 0, each tyre its own group (1 … 4), so a wheel driven
// into its arch in a crash hits the body (§5.1 self-collision) while nodes of one group never collide among themselves.
const hullTriangles = b.latticeSurface(latticeGrid, 0);
const latticeId = (x, y, z) => `c${xs.indexOf(x)}_${ys.indexOf(y)}_${zs.indexOf(z)}`;

// ---- crash structure (§4.3): yield, densification and tearing of the lattice ------------------------------------
// Each lattice beam yields at the force that makes its cross-section (plane z = const) crush at the section force
// below: F_beam = F_section(z) / Σ|cos θ| over the beams crossing that plane. Crumple zones ahead of the front axle
// (luggage bay, fuel tank) and behind the rear axle (engine bay) are soft; the passenger cell between the axles is
// ≈ 3× stronger, so a frontal crash crushes the nose and leaves the cell intact. Engineering estimates for a
// 1.6 t sports car: 64 km/h into a rigid wall (262 kJ) at an average crush force of ≈ 400 kN gives ≈ 0.6 m of crush
// and ≈ 25 g mean deceleration, in line with published full-width rigid-barrier pulses (NHTSA NCAP, 56 km/h: 20–30 g).
const crash = {
  front: 3.0e5,    // [N] section yield force of the front crumple zone
  cabin: 9.0e5,    // [N] passenger cell
  rear: 4.0e5,     // [N] engine bay
  blend: 0.15,     // [m] linear blend between zones
  hardening: 0.05, // [-] post-yield slope (fraction of k): progressive crush, no snap-through
  crushLimit: 0.7, // [-] crushed sheet metal densifies at ≈ 30 % of its length
  tearLimit: 0.35, // [-] ductile tearing at 35 % net elongation (deep-drawing steel: 30–40 % elongation at break)
};
const zoneForce = (z) => {
  const ramp = (a, b0, t) => a + (b0 - a) * Math.min(1, Math.max(0, t));
  const fFront = zF - 0.15, fRear = zR + 0.15;  // zone boundaries: just inside each axle
  if (z > fFront) return ramp(crash.cabin, crash.front, (z - fFront) / crash.blend);
  if (z < fRear) return ramp(crash.cabin, crash.rear, (fRear - z) / crash.blend);
  return crash.cabin;
};
{
  const latticeBeams = b.beams.filter(([, , g]) => g === 'chassis');
  const sectionCos = (z) => {
    let s = 0;
    for (const [a, c] of latticeBeams) {
      const pa = b.pos(a), pc = b.pos(c);
      if ((pa[2] - z) * (pc[2] - z) < 0) s += Math.abs(pc[2] - pa[2]) / dist(pa, pc);
    }
    return s;
  };
  const cosCache = new Map();
  for (const beam of latticeBeams) {
    const pa = b.pos(beam[0]), pc = b.pos(beam[1]);
    // Section through the beam's midpoint, nudged off node layers (a plane through a layer crosses no beam).
    const zm = Math.round(((pa[2] + pc[2]) / 2) * 1000) / 1000;
    const zc = zs.includes(zm) ? zm + 0.15 * Math.sign(-zm || 1) : zm;
    if (!cosCache.has(zc)) cosCache.set(zc, sectionCos(zc));
    const yieldForce = zoneForce((pa[2] + pc[2]) / 2) / cosCache.get(zc);
    Object.assign(beam[3], {
      plasticForce: Math.round(yieldForce), hardening: crash.hardening, crushLimit: crash.crushLimit, tearLimit: crash.tearLimit,
    });
  }
}

// ---- hinged panels (§4.4 latches): front luggage lid, engine lid, doors ------------------------------------------
// Each is its own GLB paint piece and its own node-beam panel (builder.panelPart), hung on two hinge points — a
// panel node tied to the three nearest lattice nodes by stiff beams is a ball joint, two of them make the hinge line —
// and held shut by a latch (beams in one break group). A crash that tears the latch lets the panel swing on its
// hinges; open at speed, the air catches it (aero panels) until it slams against the body or its hinges tear
// (another break group each). Strengths: door latches ≈ 11 kN (FMVSS 206), lid latches ≈ 6 kN, hinges 10–20 kN.
// Hinges are pressed steel: they yield (a lid's at 2.5 kN per tie, a door's at 5 kN) and tear when stretched 30 % — a
// lid thrown open at 280 km/h slams into the windscreen that hard (250 km/h: 19 %), a 100 km/h wall crash bends them
// ≈ 19 %, a 64 km/h one ≈ 1 %. (Flapping against the windscreen loads them ≈ 0.2 kN, far below yield: no fatigue.)
// The flow over a closed lid pulls it outward (suction C_S ≈ −C_p over a bonnet's leading part ≈ 0.3, a door's side
// ≈ 0.2): a latched panel passes it to the body — it is part of the car's lift, taken out of liftAreaFront/Rear
// below so the closed car's lift is unchanged — and an unlatched one is lifted by it into the stream.
b.group('panel', { k: 1e5, zeta: 0.1 });
b.group('hinge', { k: 1e6, zeta: 0.2 });
b.group('latch', { k: 3e5, zeta: 0.2 });
// Seals and stops (§4.1 support beams, compression only): each inner panel node rests on the two nearest lattice
// nodes, so a crash cannot push a door or lid into the body through its frame, while it opens freely.
b.group('seal', { type: 'support', k: 5e4, zeta: 0.1 });
const paintPieces = connectedPieces(primitiveGeometry(glb, 'body', 'paint'));
const unit = (x) => norm(x);
const panelParts = [];
const panelLift = { front: 0, rear: 0 };  // Σ C_S·A·n_y of the panels [m²]
function hingedPanel({ id, piece, ref, hingeSide, pitch, mass, group, latchBreak, hingeBreak, hingeYield, suction }) {
  const n = unit(piece.n);
  const u = unit(sub(ref, scale(n, dot(ref, n))));
  const v = cross(n, u);
  const aeroBefore = b.aeroPanels?.length ?? 0;
  const panel = b.panelPart({ id, samples: piece.samples, n, u, v, pitch, mass, collisionGroup: group, suction });
  for (const [a, c, d] of b.aeroPanels.slice(aeroBefore)) {
    const area2 = cross(sub(b.pos(c), b.pos(a)), sub(b.pos(d), b.pos(a)));
    panelLift[piece.c[2] > 0 ? 'front' : 'rear'] += suction * 0.5 * area2[1];
  }
  const outers = panel.nodes.filter((x) => x.endsWith('_0'));
  const along = (x) => dot(b.pos(x), hingeSide);
  const edge = (sign) => {
    const ext = sign > 0 ? Math.max(...outers.map(along)) : Math.min(...outers.map(along));
    return outers.filter((x) => Math.abs(along(x) - ext) < 0.6 * pitch);
  };
  const tie = (node, count, beamGroup, breakForce, breakGroup, yieldForce) => {
    const p = b.pos(node);
    const near = [...b.lattice].sort((a, c) => dist(b.pos(a), p) - dist(b.pos(c), p)).slice(0, count);
    const plastic = yieldForce ? { plasticForce: yieldForce, hardening: 0, tearLimit: 0.3 } : {};
    for (const l of near) b.beam(node, l, beamGroup, { breakForce, breakGroup, ...plastic });
  };
  // Hinges: the two ends of the hinge-side row (along the row's longest spread), each a ball joint.
  const row = edge(+1);
  const spread = sub(b.pos(row[row.length - 1]), b.pos(row[0]));
  const byAxis = [...row].sort((a, c) => dot(b.pos(a), spread) - dot(b.pos(c), spread));
  [byAxis[0], byAxis[byAxis.length - 1]].forEach((h, k) => {
    b.byId.get(h).mass += 0.5;  // hinge hardware
    tie(h, 3, 'hinge', hingeBreak, `${id}_hinge${k}`, hingeYield);
  });
  for (const inner of panel.nodes.filter((x) => x.endsWith('_1'))) tie(inner, 2, 'seal');
  // Latch: the middle of the opposite row (outer and inner node).
  const latchRow = edge(-1);
  const mid = latchRow.map((x) => b.pos(x)).reduce((a, p) => add(a, scale(p, 1 / latchRow.length)), [0, 0, 0]);
  const latch = [...latchRow].sort((a, c) => dist(b.pos(a), mid) - dist(b.pos(c), mid))[0];
  tie(latch, 2, 'latch', latchBreak, `${id}_latch`);
  tie(latch.replace(/_0$/, '_1'), 2, 'latch', latchBreak, `${id}_latch`);
  panelParts.push({ id, pieces: [piece.c.map((x) => +x.toFixed(4))], nodePrefix: `p_${id}_` });
}
const frontLid = paintPieces.find((p) => p.c[2] > 1.0 && Math.abs(p.c[0]) < 0.1 && p.area > 0.8);
const engineLid = paintPieces.find((p) => p.c[2] < -1.6 && p.c[2] > -1.9 && Math.abs(p.c[0]) < 0.1 && p.area > 0.4);
const doors = paintPieces.filter((p) => Math.abs(p.c[0]) > 0.8 && Math.abs(p.c[2]) < 0.3 && p.area > 0.5);
if (!frontLid || !engineLid || doors.length !== 2) throw new Error('GLB paint pieces for the lids and doors not found');
hingedPanel({ id: 'frontLid', piece: frontLid, ref: [1, 0, 0], hingeSide: [0, 0, -1], pitch: 0.42, mass: 9, group: 5, latchBreak: 6e3, hingeBreak: 1e4, hingeYield: 2.5e3, suction: 0.3 });
hingedPanel({ id: 'engineLid', piece: engineLid, ref: [1, 0, 0], hingeSide: [0, 0, 1], pitch: 0.38, mass: 8, group: 6, latchBreak: 6e3, hingeBreak: 1e4, hingeYield: 2.5e3, suction: 0.2 });
for (const door of doors) {
  const left = door.c[0] > 0;
  hingedPanel({ id: left ? 'doorLeft' : 'doorRight', piece: door, ref: [0, 0, 1], hingeSide: [0, 0, 1], pitch: 0.4, mass: 16,
    group: left ? 7 : 8, latchBreak: 1.1e4, hingeBreak: 2e4, hingeYield: 5e3, suction: 0.2 });
}

// ---- suspension ------------------------------------------------------------------------------------------------
const hydroChannel = 0, steeringLock = 0.49;  // [rad] ≈ 10.6 m turning circle
const ride = { front: { freq: 1.8, zeta: 0.3 }, rear: { freq: 2.0, zeta: 0.3 } };
const unsprung = { front: 21.5 + 20.6, rear: 25.4 + 17.3 };  // wheel+tyre, upright [kg]
// Extra spring preload [m of spring length] that cancels the static sag of the links, hardpoint ties and lattice
// (measured with `sbc-cli vehicle`: the car then settles at the model's design ride height minus tyre deflection).
const preloadTrim = { front: 0.0116, rear: -0.0055 };  // spring rest-length trims [m] (measured with sbc-cli vehicle)
const sprungCorner = {
  front: (TARGET_FRONT * TARGET_MASS - 2 * unsprung.front) / 2,
  rear: ((1 - TARGET_FRONT) * TARGET_MASS - 2 * unsprung.rear) / 2,
};

function springFor(axle, motionRatio) {
  const m = sprungCorner[axle], w = 2 * Math.PI * ride[axle].freq;
  const wheelRate = m * w * w, wheelDamping = 2 * ride[axle].zeta * Math.sqrt(wheelRate * m);
  return { k: wheelRate / motionRatio ** 2, c: wheelDamping / motionRatio ** 2, load: m * 9.81 / motionRatio };
}

function pressureWheel(name, W, s, axleRight, axleLeft, t) {
  b.pressureWheels.push({
    id: name, axleRight, axleLeft, center: W, segments,
    tyreRadius: R, treadWidth: t.width, rimRadius: 0.26, rimWidth: t.rimWidth,
    treadNodeMass: t.treadMass, rimNodeMass: t.rimMass, ...wheelSpokes,
    treadMaterial: 'rubber', rimMaterial: 'steel', collisionGroup: b.pressureWheels.length + 1,
  });
}

// P(dx, y, dz): point dx inboard of the wheel centre (s = +1 left, −1 right), at height y, dz ahead.
const at = (W, s) => (dx, y, dz) => [W[0] - s * dx, y, W[2] + dz];

function macpherson(name, W, s) {
  const P = at(W, s);
  const n = (id, p, m) => b.node(`${name}_${id}`, p, m);
  const Ai = n('ai', P(0.10, R, 0), hubNodeMass), Ao = n('ao', P(-0.06, R, 0), hubNodeMass);
  // Lower ball joint deep in the wheel dish, top mount ≈ 11° KPI: kingpin offset ≈ 7 cm at the wheel centre (the
  // drive force's lever about the steering axis), ≈ 0 scrub radius at the ground.
  const KL = n('kl', P(0.03, 0.13, 0.01), 3.5);
  const K5 = n('k5', P(0.13, R + 0.16, -0.01), 2.6);
  const T = P(0.16, 0.82, -0.05);                               // top mount (steering axis KL–T: ≈ 11° KPI, 5° caster)
  const K6 = n('k6', add(b.pos(K5), scale(norm(sub(T, b.pos(K5))), 0.26)), 2.6);
  const KS = n('ks', P(0.12, 0.26, -0.14), 2.8);
  const KT = n('kt', P(-0.04, 0.20, -0.10), 2.5);
  const upright = [Ai, Ao, KL, K5, K6, KS, KT];
  upright.forEach((a, i) => upright.slice(i + 1).forEach((c) => b.beam(a, c, 'knuckle')));
  // Lower arm level with the ball joint at ride height. An arm drooping outward turns every lateral ball-joint load
  // into a vertical one: the drive force's steering moment (reacted laterally at KL and the tie rod) then jacks the
  // body up (≈ 0.5 N per N at 12° droop), and the unsteady front drive pumps a pitch/heave limit cycle at speed.
  const laF = b.hardpoint(`${name}_laf`, P(0.44, 0.14, 0.03), 2.0);
  const laR = b.hardpoint(`${name}_lar`, P(0.40, 0.14, -0.30), 2.0);
  const top = b.hardpoint(`${name}_top`, T, 5.0);
  b.beam(laF, KL, 'link');
  b.beam(laR, KL, 'link');
  b.sliders.push({ node: top, railA: K5, railB: K6, k: 1.0e6, zeta: 0.3 });
  const spring = springFor('front', 0.93);
  b.beam(top, K5, 'springFront', { k: +spring.k.toFixed(0), c: +spring.c.toFixed(1), restOffset: +(spring.load / spring.k + preloadTrim.front).toFixed(5) });
  b.beam(top, K5, 'bumpstop', { minOffset: -0.07, maxOffset: 0.09 });
  const knuckle = {
    links: [{ chassis: b.pos(laF), point: b.pos(KL) }, { chassis: b.pos(laR), point: b.pos(KL) }],
    slider: { chassis: T, railA: b.pos(K5), railB: b.pos(K6) }, wheelCenter: W, axis: sub(b.pos(Ao), b.pos(Ai)),
  };
  const rackPoint = b.zeroBumpSteerPoint(knuckle, b.pos(KS), P(0.50, 0.26, -0.14));
  const rack = b.hardpoint(`${name}_rack`, rackPoint, 2.0);
  const factor = steeringFactor(b, { steerPoint: b.pos(KS), rack: rackPoint, axisA: b.pos(KL), axisB: T, lock: steeringLock });
  b.beam(rack, KS, 'tierod', { hydro: { channel: hydroChannel, factor: +factor.toFixed(6), speed: 0 } });
  const [axleRight, axleLeft] = s > 0 ? [Ai, Ao] : [Ao, Ai];
  pressureWheel(name, W, s, axleRight, axleLeft, tyreFront);
  return { name, upright, KL, laF, laR, axleRight, axleLeft, rackPoint, spring };
}

function fiveLink(name, W, s) {
  const P = at(W, s);
  const n = (id, p, m) => b.node(`${name}_${id}`, p, m);
  const Ai = n('ai', P(0.10, R, 0), hubNodeMass), Ao = n('ao', P(-0.06, R, 0), hubNodeMass);
  // Ball joints 3 cm ahead of the axle: the virtual steering axis then leads the contact patch (positive trail), so
  // tyre side force steers the wheel towards less slip (understeer compliance) instead of more — with the compliance
  // of a node-beam suspension, zero or negative trail lets the rear toe flutter at speed.
  const KU = n('ku', P(0.12, 0.58, 0.03), 2.6);
  const KL = n('kl', P(0.08, 0.13, 0.03), 3.5);
  // Toe link *behind* the axle: under side force the heavily loaded lower ball joint gives more than the lightly
  // loaded toe link, so the outer wheel toes in (stable understeer compliance). A toe link ahead of the axle turns
  // the same compliance into toe-out, and the rear axle flutters at speed.
  const KS = n('ks', P(0.10, 0.25, -0.20), 2.8);
  const KT = n('kt', P(-0.04, 0.20, 0.10), 2.2);
  const upright = [Ai, Ao, KU, KL, KS, KT];
  upright.forEach((a, i) => upright.slice(i + 1).forEach((c) => b.beam(a, c, 'knuckle')));
  const uaF = b.hardpoint(`${name}_uaf`, P(0.42, 0.58, 0.16), 2.0);
  const uaR = b.hardpoint(`${name}_uar`, P(0.42, 0.58, -0.16), 2.0);
  const laF = b.hardpoint(`${name}_laf`, P(0.46, 0.20, 0.25), 2.0);
  const laR = b.hardpoint(`${name}_lar`, P(0.46, 0.20, -0.19), 2.0);
  const top = b.hardpoint(`${name}_top`, P(0.25, 0.74, 0.0), 5.0);
  b.beam(uaF, KU, 'link');
  b.beam(uaR, KU, 'link');
  b.beam(laF, KL, 'link');
  b.beam(laR, KL, 'link');
  const mr = (b.pos(KL)[0] - b.pos(laF)[0]) / (W[0] - b.pos(laF)[0]) * 0.97;  // lever ratio × spring angle
  const spring = springFor('rear', mr);
  b.beam(top, KL, 'springRear', { k: +spring.k.toFixed(0), c: +spring.c.toFixed(1), restOffset: +(spring.load / spring.k + preloadTrim.rear).toFixed(5) });
  b.beam(top, KL, 'bumpstop', { minOffset: -0.07, maxOffset: 0.09 });
  const knuckle = {
    links: [{ chassis: b.pos(uaF), point: b.pos(KU) }, { chassis: b.pos(uaR), point: b.pos(KU) },
      { chassis: b.pos(laF), point: b.pos(KL) }, { chassis: b.pos(laR), point: b.pos(KL) }],
    wheelCenter: W, axis: sub(b.pos(Ao), b.pos(Ai)),
  };
  const toePoint = b.zeroBumpSteerPoint(knuckle, b.pos(KS), P(0.46, 0.25, -0.20));
  const toe = b.hardpoint(`${name}_toe`, toePoint, 2.0);
  b.beam(toe, KS, 'toelink');
  const [axleRight, axleLeft] = s > 0 ? [Ai, Ao] : [Ao, Ai];
  pressureWheel(name, W, s, axleRight, axleLeft, tyreRear);
  return { name, upright, KL, laF, laR, axleRight, axleLeft, toePoint, spring };
}

b.group('springFront', { k: 1, c: 0 });
b.group('springRear', { k: 1, c: 0 });
const corners = {
  FL: macpherson('FL', wheelsModel[0].position, +1),
  FR: macpherson('FR', wheelsModel[1].position, -1),
  RL: fiveLink('RL', wheelsModel[2].position, +1),
  RR: fiveLink('RR', wheelsModel[3].position, -1),
};

// Subframes: every suspension pivot of an axle (both sides) is braced to every other one with stiff beams, like the
// real cast/welded crossmember. The lattice alone is soft at this scale (a few 1e5 N/m between neighbouring pivots),
// and relative pivot motion would turn into large compliance steer through the flat lower-arm triangles.
function subframe(ids) {
  ids.forEach((a, i) => ids.slice(i + 1).forEach((c) => b.beam(a, c, 'subframe')));
  for (const id of ids) b.byId.get(id).mass = Math.max(b.byId.get(id).mass, 4.0);
}
subframe(['FL', 'FR'].flatMap((c) => [corners[c].laF, corners[c].laR, `${c}_rack`]));
subframe(['RL', 'RR'].flatMap((c) => [`${c}_uaf`, `${c}_uar`, corners[c].laF, corners[c].laR, `${c}_toe`]));
b.beam('FL_top', 'FR_top', 'subframe');  // strut brace

// Anti-roll bars: levers are the lower ball joints, pivots on the chassis 0.3 m ahead of / behind the axle.
function antiRollBar(l, r, dz, k) {
  const pl = b.hardpoint(`${l.name}_arb`, [b.pos(l.KL)[0] * 0.55, 0.20, b.pos(l.KL)[2] + dz], 2.0);
  const pr = b.hardpoint(`${r.name}_arb`, [b.pos(r.KL)[0] * 0.55, 0.20, b.pos(r.KL)[2] + dz], 2.0);
  b.torsionBars.push({ arm1: l.KL, pivot1: pl, pivot2: pr, arm2: r.KL, k, c: 8 });
}
antiRollBar(corners.FL, corners.FR, 0.30, 2600);   // [N·m/rad] ≈ 25 kN/m per wheel in roll (estimate)
antiRollBar(corners.RL, corners.RR, -0.30, 1800);

// ---- masses: lattice + engine placed to hit 1,595 kg with 39 % on the front axle -----------------------------------
const wheelMass = (t) => segments * 2 * (t.treadMass + t.rimMass);
const fixedParts = [];  // [mass, z]
for (const n of b.nodes) if (!b.lattice.includes(n.id)) fixedParts.push([n.mass, n.p[2]]);
fixedParts.push([2 * wheelMass(tyreFront), zF], [2 * wheelMass(tyreRear), zR]);
const fixedMass = fixedParts.reduce((s, [m]) => s + m, 0);
// Mass per lattice layer (floor pan and sills heaviest; the roof layer still needs ≈ 1.5 kg per node for the 2 kHz step).
const layerWeight = { 0.14: 1.0, 0.36: 1.0, 0.58: 0.9, 0.8: 0.8, 1.02: 0.68 };
const latticeNodes = b.lattice.map((lid) => b.byId.get(lid));
const engineNodes = latticeNodes.filter((n) => n.p[2] < zR - 0.05 && n.p[1] < 0.7 && Math.abs(n.p[0]) < 0.6);
function distribute(engineMass) {
  const rest = TARGET_MASS - fixedMass - engineMass;
  const wsum = latticeNodes.reduce((s, n) => s + layerWeight[n.p[1]], 0);
  for (const n of latticeNodes) n.mass = rest * layerWeight[n.p[1]] / wsum;
  for (const n of engineNodes) n.mass += engineMass / engineNodes.length;
  let m = fixedMass, mz = fixedParts.reduce((s, [mm, z]) => s + mm * z, 0);
  for (const n of latticeNodes) { m += n.mass; mz += n.mass * n.p[2]; }
  return (mz / m - zR) / (zF - zR);
}
let lo = 0, hi = 800;
for (let it = 0; it < 60; ++it) {
  const mid = (lo + hi) / 2;
  if (distribute(mid) > TARGET_FRONT) lo = mid; else hi = mid;
}
const engineMass = (lo + hi) / 2;
const frontFraction = distribute(engineMass);
let cgY = 0, total = 0;
for (const n of b.nodes) { total += n.mass; cgY += n.mass * n.p[1]; }
total += 2 * wheelMass(tyreFront) + 2 * wheelMass(tyreRear);
cgY += (2 * wheelMass(tyreFront) + 2 * wheelMass(tyreRear)) * R;
cgY /= total;

// ---- vehicle section -------------------------------------------------------------------------------------------
const tyre = (nominalLoad, verticalStiffness) => ({ radius: R, mu: 1.18, nominalLoad, verticalStiffness, relaxationX: 0.10, relaxationY: 0.28 });
const wheel = (c, driveShare, brakeTorque, handbrakeTorque, nominalLoad, verticalStiffness) => ({
  name: c.name, pressureWheel: c.name, carrier: c.upright, tyre: tyre(nominalLoad, verticalStiffness), brakeTorque, handbrakeTorque, driveShare,
});
const ref = latticeId(0, 0.36, 0);
const vehicle = {
  refCenter: ref, refFront: latticeId(0, 0.36, 1.5), refLeft: latticeId(0.45, 0.36, 0),
  steering: { channel: hydroChannel, rate: 2.5 },
  wheels: [
    wheel(corners.FL, 0.15, 3000, 0, 3300, 2.8e5), wheel(corners.FR, 0.15, 3000, 0, 3300, 2.8e5),     // 245/35 ZR20
    wheel(corners.RL, 0.35, 1800, 1500, 4600, 3.2e5), wheel(corners.RR, 0.35, 1800, 1500, 4600, 3.2e5), // 305/30 ZR20
  ],
  axles: [
    { left: 'FL', right: 'FR' },
    { left: 'RL', right: 'RR', lsdPreload: 80, lsdLockDrive: 0.3, lsdLockCoast: 0.25 },
  ],
  driveReaction: ['FL', 'FR', 'RL', 'RR'].flatMap((c) => [corners[c].laF, corners[c].laR]),
  // PTM (Porsche Traction Management): electronically controlled multi-plate front coupling, 0 … ≈ 50 % to the front
  centreCoupling: { active: true, frontAxle: 0, rearAxle: 1, minFront: 0.1, maxFront: 0.45, rate: 4 },
  engine: {
    torqueCurve: [[1000, 380], [1500, 520], [1950, 660], [5000, 660], [5500, 640], [6000, 610], [6500, 562], [7000, 500], [7200, 470]],
    idleRpm: 850, redlineRpm: 7200, limiterRpm: 7300, stallRpm: 400, inertia: 0.25, frictionTorque: 15, frictionPerRpm: 0.009,
  },
  transmission: {
    ratios: [3.91, 2.29, 1.58, 1.18, 0.94, 0.79, 0.62], reverseRatio: 3.55, finalDrive: 3.44, efficiency: 0.92,
    shiftTime: 0.08, clutchMaxTorque: 1000, upshiftRpm: 7000, downshiftRpm: 4000, launchRpm: 4500,
  },
  brakes: { stiffness: 1.0e5, damping: 40 },
  electronics: { abs: true, absSlip: 0.13, tcs: true, tcsSlip: 0.10 },
  aero: {
    dragArea: 0.65, liftAreaFront: +(0.03 - panelLift.front).toFixed(4), liftAreaRear: +(0.06 - panelLift.rear).toFixed(4),
    frontNodes: b.lattice.filter((lid) => b.pos(lid)[2] > zF + 0.2 && b.pos(lid)[1] < 0.6),
    rearNodes: b.lattice.filter((lid) => b.pos(lid)[2] < zR - 0.3 && b.pos(lid)[1] < 0.9),
  },
};

// ---- glass and lamps (§4.3): damage groups over the lattice around each pane and lamp unit ----------------------
// The GLB's glass and lamp primitives split into connected pieces (a pane is two shells, a lamp unit several pieces);
// each piece is assigned to a panel by where it sits. A group watches the lattice beams within 0.2 m of its pieces for
// permanent (plastic) strain — its frame bent — and the lattice nodes within 0.15 m for impacts (contact force in one
// step). Laminated glass cracks from the first damage and sags when much of its frame is bent, tempered glass
// shatters, a lamp's lens breaks and it goes dark (web/src/vehicles/Flexbody.ts). A lamp breaks only when struck (or
// torn off): the lattice around the tail lamps also yields under the rear overhang's inertia in a frontal crash and on
// hard landings (KNOWN_ISSUES), which does not break a lens. Thresholds: core/tests/test_damage.cpp.
const sideOf = (c) => (c[0] > 0 ? 'left' : 'right'); // +X = left
const glassPanel = ({ c, area }) => {
  if (Math.abs(c[0]) < 0.3 && area < 0.02) return null;         // interior mirror
  if (Math.abs(c[0]) < 0.3) return c[2] > 0 ? 'glass_windscreen' : 'glass_rear';
  if (Math.abs(c[0]) > 0.8) return `glass_mirror_${sideOf(c)}`;
  return c[2] < -0.5 ? `glass_quarter_${sideOf(c)}` : `glass_side_${sideOf(c)}`;
};
const lampUnit = ({ c }) => {
  if (c[2] > 1.5) return `lamp_front_${sideOf(c)}`;
  if (c[2] < -1.9) return Math.abs(c[0]) > 0.3 ? `lamp_rear_${sideOf(c)}` : 'lamp_rear_centre';
  return null;                                                   // interior and trim parts sharing the lamp material
};
// Trigger values measured on this car (core/tests/test_damage.cpp): hard driving bends nothing permanently; the peak
// plastic strain of the windscreen frame is 0.75 % in a 64 km/h frontal wall crash (1.2 % on a 60 km/h landing off
// the 1.2 m ramp), of the side-window frames 1.1 % at 64 and 66 % at 100 km/h, of the rear-window frame 2.0 % at
// 64 km/h; a 15 km/h wall hit puts 20 kN on a headlamp node, a traffic cone at 50 km/h 1 kN.
const damage = {
  windscreen: { strain: 0.006, impact: 3.0e4 },   // laminated [-] plastic strain of the frame, [N] contact force
  side: { strain: 0.02, impact: 2.0e4 },          // tempered
  quarter: { strain: 0.02, impact: 2.0e4 },
  rear: { strain: 0.025, impact: 2.0e4 },
  mirror: { strain: 0.05, impact: 8.0e3 },
  lamp: { strain: 1e9, impact: 8.0e3 },           // struck (or torn off) only
};
const damageGroups = new Map();
const addPiece = (id, piece, props, visual) => {
  if (!damageGroups.has(id)) damageGroups.set(id, { id, ...props, visual: { ...visual, pieces: [] }, samples: [] });
  const g = damageGroups.get(id);
  g.visual.pieces.push(piece.c.map((x) => +x.toFixed(4)));
  g.samples.push(...piece.samples);
};
for (const piece of connectedPieces(primitiveGeometry(glb, 'body', 'glass'))) {
  const id = glassPanel(piece);
  if (!id) continue;
  const type = id === 'glass_windscreen' ? 'laminated' : 'tempered';
  addPiece(id, piece, damage[id.split('_')[1]], { kind: 'glass', glass: type });
}
for (const piece of connectedPieces(primitiveGeometry(glb, 'body', 'lamp'))) {
  const id = lampUnit(piece);
  if (id) addPiece(id, piece, damage.lamp, { kind: 'lamp' });
}
// ---- components (§4.4 damage → function): damage groups at the parts' places, wired to what they do ------------
// 991 Turbo layout (engineering estimates of positions): three coolant radiators behind the front intakes, coolant
// lines along the floor to the rear engine, the sump under the engine behind the rear axle, the PDK ahead of it, the
// fuel tank under the front luggage bay, the battery beside it, the steering rack on the front axle, a half shaft and
// a brake line at every wheel. Each group: the lattice beams near its box (crushed: plastic strain past 4 %) and the
// lattice nodes near it (struck harder than 25 kN). Hard driving, 50 km/h over the speed bumps and a traffic cone
// damage nothing; a 15 km/h wall hit cracks the radiators; big jumps and crashes damage what they reach.
const box = (lo, hi, step = 0.06) => {
  const pts = [];
  for (let x = lo[0]; x <= hi[0] + 1e-9; x += step) for (let y = lo[1]; y <= hi[1] + 1e-9; y += step)
    for (let z = lo[2]; z <= hi[2] + 1e-9; z += step) pts.push([x, y, z]);
  return pts;
};
const component = { strain: 0.04, impact: 2.5e4 };
const hubX = (w) => (w.position[0] > 0 ? 1 : -1);
const components = [
  { id: 'radiator_left', samples: box([0.45, 0.2, 1.85], [0.75, 0.5, 2.1]) },
  { id: 'radiator_right', samples: box([-0.75, 0.2, 1.85], [-0.45, 0.5, 2.1]) },
  { id: 'radiator_centre', samples: box([-0.3, 0.2, 1.95], [0.3, 0.45, 2.15]) },
  { id: 'coolant_lines', samples: box([-0.15, 0.12, -0.9], [0.15, 0.2, 1.8], 0.1) },
  { id: 'oil_sump', samples: box([-0.35, 0.12, -1.95], [0.35, 0.3, -1.35]) },
  { id: 'gearbox', samples: box([-0.3, 0.15, -1.15], [0.3, 0.45, -0.6]) },
  { id: 'fuel_tank', samples: box([-0.5, 0.2, 0.65], [0.5, 0.5, 1.1]) },
  { id: 'battery', samples: box([0.1, 0.25, 1.3], [0.45, 0.45, 1.6]) },
  { id: 'steering_rack', samples: box([-0.45, 0.2, zF - 0.25], [0.45, 0.35, zF - 0.05]) },
  ...wheelsModel.flatMap((w, i) => {
    const name = ['FL', 'FR', 'RL', 'RR'][i], sx = hubX(w), z = w.position[2];
    return [
      { id: `halfshaft_${name}`, samples: box([Math.min(0.1 * sx, 0.6 * sx), 0.25, z - 0.08], [Math.max(0.1 * sx, 0.6 * sx), 0.42, z + 0.08]) },
      { id: `brakeline_${name}`, samples: box([Math.min(0.5 * sx, 0.72 * sx), 0.3, z - 0.25], [Math.max(0.5 * sx, 0.72 * sx), 0.6, z + 0.25]) },
    ];
  }),
].map((c) => {
  // Leak drips come from the component's place (web: coolant, oil and fuel drips and stains, §4.4).
  const fluid = c.id.startsWith('radiator') || c.id === 'coolant_lines' ? 'coolant' : c.id === 'oil_sump' ? 'oil' : c.id === 'fuel_tank' ? 'fuel' : null;
  const at = [0, 1, 2].map((k) => +(c.samples.reduce((sum, p) => sum + p[k], 0) / c.samples.length).toFixed(3));
  return { ...c, ...component, ...(fluid ? { visual: { kind: 'component', fluid, at } } : {}) };
});
b.tagDamageGroups([...damageGroups.values()]);
b.tagDamageGroups(components);  // from the beams the glass and lamps left
// Leak rates [L/s] at full severity: a crushed radiator empties the 20 L circuit (three radiators) in under a minute.
const damageLinks = [
  ...['radiator_left', 'radiator_right', 'radiator_centre'].map((group) => ({ group, effect: 'coolantLeak', rate: 0.35 })),
  { group: 'coolant_lines', effect: 'coolantLeak', rate: 0.2 },
  { group: 'oil_sump', effect: 'oilLeak', rate: 0.25 },
  { group: 'gearbox', effect: 'gearbox' },
  { group: 'fuel_tank', effect: 'fuelLeak', rate: 0.4 },
  { group: 'battery', effect: 'electrical' },
  { group: 'steering_rack', effect: 'steering' },
  ...['FL', 'FR', 'RL', 'RR'].flatMap((wheel) => [
    { group: `halfshaft_${wheel}`, effect: 'driveLoss', wheel },
    { group: `brakeline_${wheel}`, effect: 'brakeLoss', wheel },
  ]),
];

// 991 Turbo: 67.5 L tank; dry-sump 3.8 L flat six with ≈ 9 L of oil; ≈ 20 L of coolant (three front radiators).
vehicle.fluids = { coolantL: 20, oilL: 9, fuelL: 67.5, radiatorUA: 6000, heatCapacity: 1.6e5 };
vehicle.damageLinks = damageLinks;
// Render-only data (the core ignores it): the airbags' inflated shapes in the model frame — left-hand drive, the
// driver on +X (left); bag centres and half sizes are estimates for the 991 cabin.
const visual = {
  parts: panelParts,  // hinged panels: their GLB paint pieces bind to their own nodes (web flexbody)
  airbags: [
    { bag: 'driver', at: [0.37, 0.82, 0.16], size: [0.28, 0.27, 0.17] },
    { bag: 'passenger', at: [-0.37, 0.86, 0.28], size: [0.31, 0.29, 0.22] },
    { bag: 'sideLeft', at: [0.6, 0.86, -0.25], size: [0.05, 0.2, 0.5] },
    { bag: 'sideRight', at: [-0.6, 0.86, -0.25], size: [0.05, 0.2, 0.5] },
  ],
};

const json = b.toJSON({
  header: {
    id, name: 'Porsche 911 Turbo (991, 2014)',
    model: { glb: `vehicles/${id}/${id}.glb` },
    generator: 'tools/vehicle-gen/porsche_911_turbo_991.mjs',
  },
  hydroChannels: 1,
  vehicle,
  targets: {
    mass: TARGET_MASS, frontWeightFraction: TARGET_FRONT, zeroTo100: 3.4, topSpeed: 315 / 3.6, braking100: 35.0, skidpadG: 1.0,
  },
});
json.sources = {
  mass: 'Porsche AG press kit 2013 (DIN kerb weight)',
  frontWeightFraction: 'period road tests (≈ 39/61)',
  zeroTo100: 'Porsche AG press kit 2013 (PDK, without Sport Chrono)',
  topSpeed: 'Porsche AG press kit 2013',
  braking100: 'estimate from magazine tests (33–36 m); §23.2 band 35–42 m',
  skidpadG: 'estimate from magazine tests (≈ 1.0 g)',
  springs: 'estimate from 1.8 / 2.0 Hz ride frequencies',
};
json.visual = visual;
fs.writeFileSync(outPath, JSON.stringify(json) + '\n');

console.log(`${id}: ${b.nodes.length} explicit nodes (${b.lattice.length} lattice) + ${4 * 4 * segments} wheel nodes, ` +
  `${b.beams.length} beams → ${path.relative(root, outPath)} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KiB)`);
console.log(`mass ${total.toFixed(1)} kg, front ${(frontFraction * 100).toFixed(1)} %, engine block ${engineMass.toFixed(0)} kg ` +
  `on ${engineNodes.length} nodes, CG height ${cgY.toFixed(3)} m`);
for (const c of Object.values(corners)) {
  const p = c.rackPoint || c.toePoint;
  console.log(`${c.name}: spring ${c.spring.k.toFixed(0)} N/m c ${c.spring.c.toFixed(0)} preload ${c.spring.load.toFixed(0)} N; ` +
    `${c.rackPoint ? 'rack' : 'toe'} point (${p.map((x) => x.toFixed(3)).join(', ')})`);
}
console.log(`collision hull: ${hullTriangles} triangles`);
console.log('damage groups: ' + b.damageGroups.map((g) => `${g.id} (${g.visual?.pieces?.length ?? 0} pieces, ` +
  `${b.beams.filter((beam) => beam[3]?.damage === g.id).length} beams, ${g.nodes?.length ?? 0} nodes)`).join(', '));
console.log(`hull z ${zMin.toFixed(2)}…${zMax.toFixed(2)}, refs ${vehicle.refCenter} ${vehicle.refFront} ${vehicle.refLeft}, dist ${dist(b.pos(vehicle.refCenter), b.pos(vehicle.refFront)).toFixed(2)}`);

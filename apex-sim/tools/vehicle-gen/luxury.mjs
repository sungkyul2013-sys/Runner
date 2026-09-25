#!/usr/bin/env node
// Generates web/public/vehicles/<id>/vehicle.json for the user's two front-engined luxury cars, the Rolls-Royce Ghost
// and the Mercedes-Maybach GLS 600 (KICKOFF decision: the user's own models, §1.7 exception), as node-beam vehicles
// built the same way as the 911 (tools/vehicle-gen/porsche_911_turbo_991.mjs), from the GLB's body hull and wheel
// metadata:
//
//   chassis:    lattice clipped to the GLB body hull, wheel arches carved out; crumple zones ahead of the front axle
//               and behind the rear one, a passenger cell ≈ 3× stronger between them
//   front:      double wishbone (upper and lower arm pairs, tie rod at the zero-bump-steer point), air spring
//   rear:       five-link (split upper and lower arms, toe link), air spring
//   both:       anti-roll bars, pressure wheels on the models' wheel sizes
//   powertrain: front engine and gearbox as node blocks of their own on rubber mounts, permanent all-wheel drive
//
//   node tools/vehicle-gen/luxury.mjs [rolls_royce_ghost|maybach_gls]   (no argument: both)
//
// The GLB paint is one merged shell (no separate doors or lids), so these cars have no opening panels. Data: maker
// figures as cited in each car's `sources`; values the sources do not give (spring rates, bushings, masses of the
// units, crash-zone strengths) are engineering estimates, marked as such.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, meshGeometry, surfaceSamples, primitiveGeometry, connectedPieces } from './lib/glb.mjs';
import { VehicleBuilder, steeringFactor } from './lib/builder.mjs';
import { add, sub, scale, norm, dist } from './lib/v3.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Per-car data. Heights are in the model frame (y = 0 on the ground, +Z forward, +X left). */
const CARS = {
  rolls_royce_ghost: {
    name: 'Rolls-Royce Ghost (2021)',
    mass: 2490, front: 0.50,
    // 6.75 L twin-turbo V12, 420 kW at 5,000 rpm, 850 N·m from 1,600 rpm; ZF 8-speed automatic; permanent AWD.
    engine: {
      torqueCurve: [[800, 520], [1200, 700], [1600, 850], [4250, 850], [5000, 802], [5500, 720], [5800, 660], [6000, 600]],
      idleRpm: 650, redlineRpm: 5800, limiterRpm: 6000, stallRpm: 350, inertia: 0.38, frictionTorque: 22, frictionPerRpm: 0.012,
    },
    transmission: {
      ratios: [5.0, 3.2, 2.143, 1.72, 1.314, 1.0, 0.822, 0.64], reverseRatio: 3.456, finalDrive: 2.81, efficiency: 0.9,
      shiftTime: 0.14, clutchMaxTorque: 1600, upshiftRpm: 5500, downshiftRpm: 2300, launchRpm: 2200,
    },
    centreCoupling: { active: true, frontAxle: 0, rearAxle: 1, minFront: 0.4, maxFront: 0.5, rate: 3 },
    driveShare: { front: 0.25, rear: 0.25 },
    powertrain: {
      // The blocks are collision proxies of the dense parts, set above the two lowest lattice layers (the front
      // suspension's pivots anchor in them, as on the subframe of the real car).
      engine: { lo: [-0.32, 0.56, 1.1], hi: [0.32, 0.98, 1.95], n: [3, 3, 3], mass: 300 },   // V12 behind the front axle line
      gearbox: { lo: [-0.2, 0.56, 0.45], hi: [0.2, 0.84, 0.9], n: [2, 2, 3], mass: 95 },
    },
    tyreFront: { width: 0.21, rimWidth: 0.21, treadMass: 0.24, rimMass: 0.36 },  // 255/45 R20
    tyreRear: { width: 0.235, rimWidth: 0.235, treadMass: 0.26, rimMass: 0.37 },  // 285/40 R20
    ride: { front: { freq: 1.2, zeta: 0.34 }, rear: { freq: 1.3, zeta: 0.34 } },  // air springs: a soft, damped ride
    crash: { front: 4.8e5, cabin: 1.5e6, rear: 5.2e5 },
    chassisEA: 2.2e5, // the stiffest the node masses allow within the kerb weight (m ≥ ½·Σk·t²)
    brakes: { front: 4600, rear: 2800, handbrake: 1800 },
    arb: { front: 4200, rear: 2600 },
    aero: { dragArea: 0.75, liftFront: 0.05, liftRear: 0.06 },
    fluids: { coolantL: 22, oilL: 11, fuelL: 82.5, radiatorUA: 7500, heatCapacity: 2.4e5 },
    targets: { zeroTo100: 4.8, topSpeed: 250 / 3.6, braking100: 37.0, skidpadG: 0.85 },
    sources: {
      mass: 'Rolls-Royce Motor Cars press information 2020 (EU kerb weight 2,490 kg)',
      frontWeightFraction: 'estimate (front-mid V12, ≈ 50/50)',
      zeroTo100: 'Rolls-Royce Motor Cars press information 2020 (4.8 s)',
      topSpeed: 'Rolls-Royce Motor Cars press information 2020 (limited, 250 km/h)',
      engine: 'Rolls-Royce Motor Cars press information 2020 (420 kW / 850 N·m); curve shape estimate',
      springs: 'estimate from 1.2 / 1.3 Hz ride frequencies (air suspension)',
    },
    airbags: { driver: [0.4, 0.98, 0.45], passenger: [-0.4, 1.02, 0.6], side: [0.72, 1.0, 0.0] },
    sound: { cylinders: 12, turbo: true },
  },
  maybach_gls: {
    name: 'Mercedes-Maybach GLS 600 4MATIC (2021)',
    mass: 2785, front: 0.52,
    // 4.0 L twin-turbo V8 (EQ Boost), 410 kW at 6,000–6,500 rpm, 730 N·m at 2,500–5,000 rpm; 9G-TRONIC; 4MATIC.
    engine: {
      torqueCurve: [[800, 380], [1500, 560], [2500, 730], [5000, 730], [5500, 700], [6000, 652], [6500, 602], [6700, 560]],
      idleRpm: 650, redlineRpm: 6500, limiterRpm: 6600, stallRpm: 350, inertia: 0.3, frictionTorque: 18, frictionPerRpm: 0.011,
    },
    transmission: {
      ratios: [5.35, 3.24, 2.25, 1.64, 1.21, 1.0, 0.865, 0.72, 0.6], reverseRatio: 4.8, finalDrive: 3.27, efficiency: 0.9,
      shiftTime: 0.12, clutchMaxTorque: 1500, upshiftRpm: 6200, downshiftRpm: 2400, launchRpm: 2400,
    },
    centreCoupling: { active: true, frontAxle: 0, rearAxle: 1, minFront: 0.31, maxFront: 0.5, rate: 3 },
    driveShare: { front: 0.155, rear: 0.345 },
    powertrain: {
      engine: { lo: [-0.3, 0.62, 1.25], hi: [0.3, 1.02, 2.0], n: [3, 3, 3], mass: 225 },
      gearbox: { lo: [-0.2, 0.62, 0.6], hi: [0.2, 0.9, 1.05], n: [2, 2, 3], mass: 100 },
    },
    tyreFront: { width: 0.235, rimWidth: 0.24, treadMass: 0.3, rimMass: 0.42 },   // 285/45 R22
    tyreRear: { width: 0.235, rimWidth: 0.24, treadMass: 0.3, rimMass: 0.42 },
    ride: { front: { freq: 1.25, zeta: 0.35 }, rear: { freq: 1.35, zeta: 0.35 } }, // AIRMATIC
    crash: { front: 5.2e5, cabin: 1.6e6, rear: 5.6e5 },
    chassisEA: 2.0e5,
    brakes: { front: 5200, rear: 3000, handbrake: 1900 },
    arb: { front: 5200, rear: 3200 },
    aero: { dragArea: 1.08, liftFront: 0.08, liftRear: 0.08 },
    fluids: { coolantL: 16, oilL: 9, fuelL: 90, radiatorUA: 7000, heatCapacity: 2.2e5 },
    targets: { zeroTo100: 4.9, topSpeed: 250 / 3.6, braking100: 38.0, skidpadG: 0.8 },
    sources: {
      mass: 'Mercedes-Benz press information 2020 (EU kerb weight 2,785 kg)',
      frontWeightFraction: 'estimate (front-engined SUV, ≈ 52/48)',
      zeroTo100: 'Mercedes-Benz press information 2020 (4.9 s)',
      topSpeed: 'Mercedes-Benz press information 2020 (limited, 250 km/h)',
      engine: 'Mercedes-Benz press information 2020 (410 kW / 730 N·m); curve shape estimate',
      springs: 'estimate from 1.25 / 1.35 Hz ride frequencies (air suspension)',
    },
    airbags: { driver: [0.42, 1.18, 0.45], passenger: [-0.42, 1.22, 0.6], side: [0.74, 1.2, 0.0] },
    sound: { cylinders: 8, turbo: true },
  },
};

const wanted = process.argv[2] ? [process.argv[2]] : Object.keys(CARS);
for (const id of wanted) {
  if (!CARS[id]) throw new Error(`unknown car ${id} (${Object.keys(CARS).join(', ')})`);
  generate(id, CARS[id]);
}

function generate(id, car) {
  const glbPath = path.join(root, 'web/public/vehicles', id, `${id}.glb`);
  const outPath = path.join(root, 'web/public/vehicles', id, 'vehicle.json');
  const glb = readGlb(glbPath);
  const body = meshGeometry(glb, 'body');
  const meta = body.extras.apex;
  const R = +meta.wheel.radius.toFixed(4);
  const rimRadius = +(meta.wheel.rimRadius ?? R * 0.72).toFixed(4);
  // The imported models' wheel positions differ by up to a few centimetres (Maybach front: 16 cm) side to side:
  // each axle gets the mean track and position.
  const axleOf = (a) => meta.wheels.filter((w) => w.axle === a);
  const mean = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length;
  const halfTrack = (a) => +mean(axleOf(a).map((w) => Math.abs(w.position[0]))).toFixed(3);
  const zF = +mean(axleOf('front').map((w) => w.position[2])).toFixed(3);
  const zR = +mean(axleOf('rear').map((w) => w.position[2])).toFixed(3);
  const wheelsModel = [
    { position: [halfTrack('front'), R, zF], axle: 'front' }, { position: [-halfTrack('front'), R, zF], axle: 'front' },
    { position: [halfTrack('rear'), R, zR], axle: 'rear' }, { position: [-halfTrack('rear'), R, zR], axle: 'rear' },
  ];
  const samples = surfaceSamples(body);
  const maxOver = (filter, value) => {
    let m = -Infinity;
    for (const p of samples) if (filter(p)) m = Math.max(m, value(p));
    return m;
  };
  const roofAt = (x, z) => maxOver((p) => Math.abs(p[0] - x) < 0.14 && Math.abs(p[2] - z) < 0.16, (p) => p[1]);
  const halfWidthAt = (y, z) => maxOver((p) => Math.abs(p[1] - y) < 0.16 && Math.abs(p[2] - z) < 0.16, (p) => Math.abs(p[0]));
  const zMin = samples.reduce((m, p) => Math.min(m, p[2]), Infinity), zMax = samples.reduce((m, p) => Math.max(m, p[2]), -Infinity);
  const floorY = meta.bounds.min[1];

  const b = new VehicleBuilder();
  const dy = R - 0.3446; // suspension heights: the 911's geometry about the wheel centre
  const suspensionYield = (plasticForce) => ({ plasticForce, hardening: 0.05, deformLimit: 0.25 });
  const heavy = car.mass / 1595; // link and hardpoint strengths scale with the car's weight
  b.group('chassis', { k: 1e6, zeta: 0.25 });
  b.group('hardpoint', { k: 1.0e6, zeta: 0.2, plasticForce: +(3.0e4 * heavy).toFixed(0), hardening: 0.05 });
  b.group('knuckle', { k: 2e6, zeta: 0.1 });
  b.group('link', { k: 1.5e6, zeta: 0.1, ...suspensionYield(+(2.4e4 * heavy).toFixed(0)) });
  b.group('tierod', { type: 'hydro', k: 1.5e6, zeta: 0.1, ...suspensionYield(+(1.4e4 * heavy).toFixed(0)) });
  b.group('toelink', { k: 1.5e6, zeta: 0.1, ...suspensionYield(+(1.2e4 * heavy).toFixed(0)) });
  b.group('bumpstop', { type: 'bounded', k: 2.0e5, zeta: 0.05 });
  b.group('subframe', { k: 1.2e6, zeta: 0.1, plasticForce: +(3.0e4 * heavy).toFixed(0), hardening: 0.05 });

  // ---- powertrain cavity ----
  const pt = car.powertrain;
  const cavityClearance = 0.115;
  const inCavity = (p) => Object.values(pt).some(({ lo, hi }) => [0, 1, 2].every((k) => p[k] > lo[k] - cavityClearance && p[k] < hi[k] + cavityClearance));

  // ---- chassis lattice: 9 columns across, 6 layers up, a node every ≈ 0.3 m along ----
  const half = +(Math.min(halfWidthAt(0.7, 0), 1.2) - 0.07).toFixed(3);
  const xs = Array.from({ length: 9 }, (_, i) => +(-half + (i * 2 * half) / 8).toFixed(3));
  const top = roofAt(0, (zF + zR) / 2 - 0.3);
  const ys = Array.from({ length: 6 }, (_, j) => +(floorY + 0.04 + (j * (top - floorY - 0.16)) / 5).toFixed(3));
  const zs = [];
  const nz = Math.round((zMax - zMin - 0.24) / 0.3);
  for (let k = 0; k <= nz; k++) zs.push(+(zMin + 0.12 + (k * (zMax - zMin - 0.24)) / nz).toFixed(3));
  const wheelEnvelope = (p) => wheelsModel.some((w) => {
    const width = w.axle === 'front' ? car.tyreFront.width : car.tyreRear.width;
    return Math.abs(p[0] - w.position[0]) < width / 2 + 0.16 && Math.hypot(p[1] - w.position[1], p[2] - w.position[2]) < R + 0.14;
  });
  const insideHull = ([x, y, z]) => {
    if (z < zMin + 0.08 || z > zMax - 0.08) return false;
    if (y > roofAt(x, z) - 0.06) return false;
    if (Math.abs(x) > halfWidthAt(Math.max(y, floorY + 0.2), z) - 0.06) return false;
    return !wheelEnvelope([x, y, z]);
  };
  const inside = (p) => insideHull(p) && !inCavity(p);
  const latticeGrid = b.buildLattice({ xs, ys, zs, inside, axialStiffness: car.chassisEA });
  const carved = (i, j, k) => xs[i] !== undefined && ys[j] !== undefined && zs[k] !== undefined &&
    insideHull([xs[i], ys[j], zs[k]]) && inCavity([xs[i], ys[j], zs[k]]);
  const hullTriangles = b.latticeSurface(latticeGrid, 0, {
    skipCell: (i, j, k) => [0, 1, 2, 3, 4, 5, 6, 7].some((c) => carved(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))),
  });
  const nearestLattice = (p) => b.lattice.reduce((best, lid) => (dist(b.pos(lid), p) < dist(b.pos(best), p) ? lid : best), b.lattice[0]);

  // ---- crash structure: section yield forces by zone (as the 911) ----
  const crash = { ...car.crash, blend: 0.2, hardening: 0.05, crushLimit: 0.7, tearLimit: 0.35 };
  const zoneForce = (z) => {
    const ramp = (a, c, t) => a + (c - a) * Math.min(1, Math.max(0, t));
    const fFront = zF - 0.15, fRear = zR + 0.15;
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
      const zm = Math.round(((pa[2] + pc[2]) / 2) * 1000) / 1000;
      const zc = zs.includes(zm) ? zm + 0.05 * Math.sign(-zm || 1) : zm;
      if (!cosCache.has(zc)) cosCache.set(zc, sectionCos(zc));
      Object.assign(beam[3], {
        plasticForce: Math.round(zoneForce((pa[2] + pc[2]) / 2) / cosCache.get(zc)), hardening: crash.hardening, crushLimit: crash.crushLimit, tearLimit: crash.tearLimit,
      });
    }
  }

  // ---- powertrain blocks on mounts ----
  b.group('powertrain', { k: 1.5e6, zeta: 0.1 });
  b.group('engineMount', { k: 3.0e5, zeta: 0.3 });
  b.group('mountStop', { type: 'bounded', k: 2.5e6, zeta: 0.1 });
  const engine = b.block({ id: 'engine', ...pt.engine, beamGroup: 'powertrain', collisionGroup: 9 });
  const gearbox = b.block({ id: 'gearbox', ...pt.gearbox, beamGroup: 'powertrain', collisionGroup: 9 });
  // Bell housing: the gearbox's front face to the engine's rear face.
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    for (let ei = 0; ei < 3; ei++) for (let ej = 0; ej < 3; ej++) b.beam(gearbox.at(i, j, 2), engine.at(ei, ej, 0), 'powertrain');
  }
  const mountBreak = +(2.5e4 * heavy).toFixed(0);
  const mounts = [
    ['engineMountLeft', engine.at(2, 1, 1)], ['engineMountRight', engine.at(0, 1, 1)],
    ['gearboxMountLeft', gearbox.at(1, 1, 0)], ['gearboxMountRight', gearbox.at(0, 1, 0)],
  ];
  for (const [mount, node] of mounts) {
    for (const l of b.anchors(node, b.pos(node))) {
      b.beam(node, l, 'engineMount', { breakForce: mountBreak, breakGroup: mount, damage: 'engine_mounts' });
      b.beam(node, l, 'mountStop', { minOffset: -0.015, maxOffset: 0.015, breakForce: mountBreak, breakGroup: mount });
    }
  }
  b.damageGroups.push({ id: 'engine_mounts', strain: 0.1 });
  const cavity = b.clearance(0, 9);
  if (cavity.gap < 0.015) throw new Error(`${id}: powertrain cavity: ${cavity.node} only ${(cavity.gap * 100).toFixed(1)} cm from the other side`);

  // ---- suspension ----
  const hubNodeMass = 5.4, segments = 24, hydroChannel = 0, steeringLock = 0.52;
  const unsprung = { front: 26 + 24, rear: 27 + 22 };
  const sprungCorner = {
    front: (car.front * car.mass - 2 * unsprung.front) / 2,
    rear: ((1 - car.front) * car.mass - 2 * unsprung.rear) / 2,
  };
  const springFor = (axle, motionRatio) => {
    const m = sprungCorner[axle], w = 2 * Math.PI * car.ride[axle].freq;
    const wheelRate = m * w * w, wheelDamping = 2 * car.ride[axle].zeta * Math.sqrt(wheelRate * m);
    return { k: wheelRate / motionRatio ** 2, c: wheelDamping / motionRatio ** 2, load: (m * 9.81) / motionRatio };
  };
  const wheelSpokes = { spokeStiffness: 2.5e5, treadNodeRadius: 0.05 };
  const rimYield = { rimYieldForce: +(2200 * Math.sqrt(heavy)).toFixed(0), rimHardening: 0.1 };
  const pressureWheel = (name, W, axleRight, axleLeft, t) => b.pressureWheels.push({
    id: name, axleRight, axleLeft, center: W, segments,
    tyreRadius: R, treadWidth: t.width, rimRadius, rimWidth: t.rimWidth,
    treadNodeMass: t.treadMass, rimNodeMass: t.rimMass, ...wheelSpokes, ...rimYield,
    treadMaterial: 'rubber', rimMaterial: 'steel', collisionGroup: b.pressureWheels.length + 1,
  });
  const at = (W, s) => (dxIn, y, dz) => [W[0] - s * dxIn, y + dy, W[2] + dz];

  // Front double wishbone: upper and lower arm pairs, the steering axis through the two ball joints, tie rod.
  function doubleWishbone(name, W, s) {
    const P = at(W, s);
    const n = (tag, p, m) => b.node(`${name}_${tag}`, p, m);
    const Ai = n('ai', [W[0] - s * 0.1, R, W[2]], hubNodeMass), Ao = n('ao', [W[0] + s * 0.06, R, W[2]], hubNodeMass);
    const KU = n('ku', P(0.14, 0.60, -0.02), 2.8);
    const KL = n('kl', P(0.04, 0.13, 0.01), 3.8);
    const KS = n('ks', P(0.12, 0.26, -0.15), 2.8);
    const KT = n('kt', P(-0.04, 0.20, -0.10), 2.5);
    const upright = [Ai, Ao, KU, KL, KS, KT];
    upright.forEach((a, i) => upright.slice(i + 1).forEach((c) => b.beam(a, c, 'knuckle')));
    const uaF = b.hardpoint(`${name}_uaf`, P(0.42, 0.62, 0.14), 2.2);
    const uaR = b.hardpoint(`${name}_uar`, P(0.42, 0.62, -0.18), 2.2);
    const laF = b.hardpoint(`${name}_laf`, P(0.46, 0.15, 0.06), 2.2);
    const laR = b.hardpoint(`${name}_lar`, P(0.44, 0.15, -0.32), 2.2);
    const topMount = b.hardpoint(`${name}_top`, P(0.24, 0.80, -0.04), 5.0);
    b.beam(uaF, KU, 'link');
    b.beam(uaR, KU, 'link');
    b.beam(laF, KL, 'link');
    b.beam(laR, KL, 'link');
    const mr = ((b.pos(KL)[0] - b.pos(laF)[0]) / (W[0] - b.pos(laF)[0])) * 0.97;
    const spring = springFor('front', Math.abs(mr));
    b.beam(topMount, KL, 'springFront', { k: +spring.k.toFixed(0), c: +spring.c.toFixed(1), restOffset: +(spring.load / spring.k).toFixed(5) });
    b.beam(topMount, KL, 'bumpstop', { minOffset: -0.09, maxOffset: 0.11 });
    const knuckle = {
      links: [{ chassis: b.pos(uaF), point: b.pos(KU) }, { chassis: b.pos(uaR), point: b.pos(KU) },
        { chassis: b.pos(laF), point: b.pos(KL) }, { chassis: b.pos(laR), point: b.pos(KL) }],
      wheelCenter: W, axis: sub(b.pos(Ao), b.pos(Ai)),
    };
    const rackPoint = b.zeroBumpSteerPoint(knuckle, b.pos(KS), P(0.50, 0.26, -0.15));
    const rack = b.hardpoint(`${name}_rack`, rackPoint, 2.2);
    const factor = steeringFactor(b, { steerPoint: b.pos(KS), rack: rackPoint, axisA: b.pos(KL), axisB: b.pos(KU), lock: steeringLock });
    b.beam(rack, KS, 'tierod', { hydro: { channel: hydroChannel, factor: +factor.toFixed(6), speed: 0 } });
    const [axleRight, axleLeft] = s > 0 ? [Ai, Ao] : [Ao, Ai];
    pressureWheel(name, W, axleRight, axleLeft, car.tyreFront);
    return { name, upright, KL, laF, laR, axleRight, axleLeft, rackPoint, spring };
  }

  // Rear five-link (as the 911's): ball joints ahead of the axle, toe link behind it (stable toe compliance).
  function fiveLink(name, W, s) {
    const P = at(W, s);
    const n = (tag, p, m) => b.node(`${name}_${tag}`, p, m);
    const Ai = n('ai', [W[0] - s * 0.1, R, W[2]], hubNodeMass), Ao = n('ao', [W[0] + s * 0.06, R, W[2]], hubNodeMass);
    const KU = n('ku', P(0.12, 0.58, 0.03), 2.8);
    const KL = n('kl', P(0.08, 0.13, 0.03), 3.8);
    const KS = n('ks', P(0.10, 0.25, -0.20), 2.8);
    const KT = n('kt', P(-0.04, 0.20, 0.10), 2.3);
    const upright = [Ai, Ao, KU, KL, KS, KT];
    upright.forEach((a, i) => upright.slice(i + 1).forEach((c) => b.beam(a, c, 'knuckle')));
    const uaF = b.hardpoint(`${name}_uaf`, P(0.42, 0.58, 0.16), 2.2);
    const uaR = b.hardpoint(`${name}_uar`, P(0.42, 0.58, -0.16), 2.2);
    const laF = b.hardpoint(`${name}_laf`, P(0.46, 0.20, 0.25), 2.2);
    const laR = b.hardpoint(`${name}_lar`, P(0.46, 0.20, -0.19), 2.2);
    const topMount = b.hardpoint(`${name}_top`, P(0.25, 0.76, 0.0), 5.0);
    b.beam(uaF, KU, 'link');
    b.beam(uaR, KU, 'link');
    b.beam(laF, KL, 'link');
    b.beam(laR, KL, 'link');
    const mr = ((b.pos(KL)[0] - b.pos(laF)[0]) / (W[0] - b.pos(laF)[0])) * 0.97;
    const spring = springFor('rear', Math.abs(mr));
    b.beam(topMount, KL, 'springRear', { k: +spring.k.toFixed(0), c: +spring.c.toFixed(1), restOffset: +(spring.load / spring.k).toFixed(5) });
    b.beam(topMount, KL, 'bumpstop', { minOffset: -0.09, maxOffset: 0.11 });
    const knuckle = {
      links: [{ chassis: b.pos(uaF), point: b.pos(KU) }, { chassis: b.pos(uaR), point: b.pos(KU) },
        { chassis: b.pos(laF), point: b.pos(KL) }, { chassis: b.pos(laR), point: b.pos(KL) }],
      wheelCenter: W, axis: sub(b.pos(Ao), b.pos(Ai)),
    };
    const toePoint = b.zeroBumpSteerPoint(knuckle, b.pos(KS), P(0.46, 0.25, -0.20));
    const toe = b.hardpoint(`${name}_toe`, toePoint, 2.2);
    b.beam(toe, KS, 'toelink');
    const [axleRight, axleLeft] = s > 0 ? [Ai, Ao] : [Ao, Ai];
    pressureWheel(name, W, axleRight, axleLeft, car.tyreRear);
    return { name, upright, KL, laF, laR, axleRight, axleLeft, toePoint, spring };
  }

  b.group('springFront', { k: 1, c: 0 });
  b.group('springRear', { k: 1, c: 0 });
  const corners = {
    FL: doubleWishbone('FL', wheelsModel[0].position, +1),
    FR: doubleWishbone('FR', wheelsModel[1].position, -1),
    RL: fiveLink('RL', wheelsModel[2].position, +1),
    RR: fiveLink('RR', wheelsModel[3].position, -1),
  };
  const subframe = (ids) => {
    ids.forEach((a, i) => ids.slice(i + 1).forEach((c) => b.beam(a, c, 'subframe')));
    for (const nid of ids) b.byId.get(nid).mass = Math.max(b.byId.get(nid).mass, 4.5);
  };
  subframe(['FL', 'FR'].flatMap((c) => [`${c}_uaf`, `${c}_uar`, corners[c].laF, corners[c].laR, `${c}_rack`]));
  subframe(['RL', 'RR'].flatMap((c) => [`${c}_uaf`, `${c}_uar`, corners[c].laF, corners[c].laR, `${c}_toe`]));
  b.beam('FL_top', 'FR_top', 'subframe');
  const antiRollBar = (l, r, dz, k) => {
    const pl = b.hardpoint(`${l.name}_arb`, [b.pos(l.KL)[0] * 0.55, 0.2 + dy, b.pos(l.KL)[2] + dz], 2.2);
    const pr = b.hardpoint(`${r.name}_arb`, [b.pos(r.KL)[0] * 0.55, 0.2 + dy, b.pos(r.KL)[2] + dz], 2.2);
    b.torsionBars.push({ arm1: l.KL, pivot1: pl, pivot2: pr, arm2: r.KL, k, c: 10 });
  };
  antiRollBar(corners.FL, corners.FR, 0.3, car.arb.front);
  antiRollBar(corners.RL, corners.RR, -0.3, car.arb.rear);

  // ---- masses: lattice + ancillaries to hit the kerb weight and the axle split ----
  const beamK = (beam) => beam[3]?.k ?? b.groups[beam[2]]?.k ?? 0;
  const stiffnessSum = new Map();
  for (const beam of b.beams) for (const nid of beam.slice(0, 2)) stiffnessSum.set(nid, (stiffnessSum.get(nid) ?? 0) + beamK(beam));
  const minNodeMass = (nd) => 0.5 * (stiffnessSum.get(nd.id) ?? 0) * 0.00063 ** 2;
  for (const nd of b.nodes) nd.mass = Math.max(nd.mass, minNodeMass(nd));
  const wheelMass = (t) => segments * 2 * (t.treadMass + t.rimMass);
  const fixedParts = [];
  for (const nd of b.nodes) if (!b.lattice.includes(nd.id)) fixedParts.push([nd.mass, nd.p[2]]);
  fixedParts.push([2 * wheelMass(car.tyreFront), zF], [2 * wheelMass(car.tyreRear), zR]);
  const fixedMass = fixedParts.reduce((s, [m]) => s + m, 0);
  const layerWeight = Object.fromEntries(ys.map((y, j) => [y, j < 2 ? 1.0 : 1.0 - 0.07 * j]));
  const latticeNodes = b.lattice.map((lid) => b.byId.get(lid));
  const rearBay = latticeNodes.filter((nd) => nd.p[2] < zR - 0.1 && nd.p[1] < ys[3]);
  const frontBay = latticeNodes.filter((nd) => nd.p[2] > zF - 0.2 && nd.p[1] < ys[3]);
  function spread(nodes, total, weight) {
    const floor = new Set();
    for (let pass = 0; pass < 20; ++pass) {
      const free = nodes.filter((nd) => !floor.has(nd));
      const left = total - [...floor].reduce((s, nd) => s + minNodeMass(nd), 0);
      const wsum = free.reduce((s, nd) => s + weight(nd), 0);
      let changed = false;
      for (const nd of free) {
        nd.mass = (left * weight(nd)) / wsum;
        if (nd.mass < minNodeMass(nd)) { floor.add(nd); changed = true; }
      }
      for (const nd of floor) nd.mass = minNodeMass(nd);
      if (!changed) return;
    }
  }
  function distribute(ancillaryMass) {
    const rest = car.mass - fixedMass - Math.abs(ancillaryMass);
    spread(latticeNodes, rest, (nd) => layerWeight[nd.p[1]] ?? 0.7);
    const bay = ancillaryMass >= 0 ? rearBay : frontBay;
    for (const nd of bay) nd.mass += Math.abs(ancillaryMass) / bay.length;
    let m = fixedMass, mz = fixedParts.reduce((s, [mm, z]) => s + mm * z, 0);
    for (const nd of latticeNodes) { m += nd.mass; mz += nd.mass * nd.p[2]; }
    return (mz / m - zR) / (zF - zR);
  }
  let lo = -600, hi = 900;
  for (let it = 0; it < 60; ++it) {
    const mid = (lo + hi) / 2;
    if (distribute(mid) > car.front) lo = mid; else hi = mid;
  }
  const ancillaryMass = (lo + hi) / 2;
  const frontFraction = distribute(ancillaryMass);
  let cgY = 0, total = 0;
  for (const nd of b.nodes) { total += nd.mass; cgY += nd.mass * nd.p[1]; }
  const wheelsTotal = 2 * wheelMass(car.tyreFront) + 2 * wheelMass(car.tyreRear);
  total += wheelsTotal;
  cgY = (cgY + wheelsTotal * R) / total;

  // ---- vehicle section ----
  const cornerLoad = (axle) => ((axle === 'front' ? car.front : 1 - car.front) * car.mass * 9.81) / 2;
  const tyre = (nominalLoad, verticalStiffness) => ({ radius: R, mu: 1.1, nominalLoad, verticalStiffness, relaxationX: 0.11, relaxationY: 0.3 });
  const wheel = (c, driveShare, brakeTorque, handbrakeTorque, axle) => ({
    name: c.name, pressureWheel: c.name, carrier: c.upright, tyre: tyre(+cornerLoad(axle).toFixed(0), 3.2e5), brakeTorque, handbrakeTorque, driveShare,
  });
  const refY = ys[1];
  const ref = nearestLattice([0, refY, (zF + zR) / 2]);
  const refFront = nearestLattice(add(b.pos(ref), [0, 0, 0.9]));
  const refLeft = nearestLattice(add(b.pos(ref), [0.45, 0, 0]));
  const vehicle = {
    refCenter: ref, refFront, refLeft,
    steering: { channel: hydroChannel, rate: 2.2 },
    wheels: [
      wheel(corners.FL, car.driveShare.front, car.brakes.front, 0, 'front'), wheel(corners.FR, car.driveShare.front, car.brakes.front, 0, 'front'),
      wheel(corners.RL, car.driveShare.rear, car.brakes.rear, car.brakes.handbrake, 'rear'), wheel(corners.RR, car.driveShare.rear, car.brakes.rear, car.brakes.handbrake, 'rear'),
    ],
    axles: [
      { left: 'FL', right: 'FR' },
      { left: 'RL', right: 'RR', lsdPreload: 60, lsdLockDrive: 0.25, lsdLockCoast: 0.15 },
    ],
    driveReaction: gearbox.nodes,
    centreCoupling: car.centreCoupling,
    engine: car.engine,
    transmission: car.transmission,
    brakes: { stiffness: 1.2e5, damping: 50 },
    electronics: { abs: true, absSlip: 0.13, tcs: true, tcsSlip: 0.1 },
    aero: {
      dragArea: car.aero.dragArea, liftAreaFront: car.aero.liftFront, liftAreaRear: car.aero.liftRear,
      frontNodes: b.lattice.filter((lid) => b.pos(lid)[2] > zF + 0.2 && b.pos(lid)[1] < ys[3]),
      rearNodes: b.lattice.filter((lid) => b.pos(lid)[2] < zR - 0.3 && b.pos(lid)[1] < ys[4]),
      surfaceGroups: [0],
    },
  };

  // ---- glass and lamps ----
  const w2 = meta.dimensions.width / 2;
  const sideOf = (c) => (c[0] > 0 ? 'left' : 'right');
  const glassPanel = ({ c, area }) => {
    if (Math.abs(c[0]) < 0.35 && area < 0.012 && c[1] > ys[4]) return null; // interior mirror
    if (Math.abs(c[0]) < 0.35) return c[2] > (zF + zR) / 2 ? 'glass_windscreen' : 'glass_rear';
    if (Math.abs(c[0]) > w2 - 0.12) return `glass_mirror_${sideOf(c)}`;
    return c[2] < (zF + zR) / 2 - 0.6 ? `glass_quarter_${sideOf(c)}` : `glass_side_${sideOf(c)}`;
  };
  const lampUnit = ({ c }) => {
    if (c[2] > zF + 0.4) return `lamp_front_${sideOf(c)}`;
    if (c[2] < zR - 0.5) return Math.abs(c[0]) > 0.3 ? `lamp_rear_${sideOf(c)}` : 'lamp_rear_centre';
    return null;
  };
  const damage = {
    windscreen: { strain: 0.0015, impact: 3.5e4 },
    side: { strain: 0.015, impact: 2.5e4 },
    quarter: { strain: 0.015, impact: 2.5e4 },
    rear: { strain: 0.02, impact: 2.5e4 },
    mirror: { strain: 0.05, impact: 1.5e4 },
    lamp: { strain: 1e9, impact: 8.0e3 },
  };
  const damageGroups = new Map();
  const addPiece = (gid, piece, props, visual) => {
    if (!damageGroups.has(gid)) damageGroups.set(gid, { id: gid, ...props, visual: { ...visual, pieces: [] }, samples: [] });
    const g = damageGroups.get(gid);
    g.visual.pieces.push(piece.c.map((x) => +x.toFixed(4)));
    g.samples.push(...piece.samples);
  };
  for (const piece of connectedPieces(primitiveGeometry(glb, 'body', 'glass'))) {
    const gid = glassPanel(piece);
    if (gid) addPiece(gid, piece, damage[gid.split('_')[1]], { kind: 'glass', glass: gid === 'glass_windscreen' ? 'laminated' : 'tempered' });
  }
  for (const piece of connectedPieces(primitiveGeometry(glb, 'body', 'lamp'))) {
    const gid = lampUnit(piece);
    if (gid) addPiece(gid, piece, damage.lamp, { kind: 'lamp' });
  }

  // ---- components: front engine layout ----
  const box = (bl, bh, step = 0.07) => {
    const pts = [];
    for (let x = bl[0]; x <= bh[0] + 1e-9; x += step) for (let y = bl[1]; y <= bh[1] + 1e-9; y += step)
      for (let z = bl[2]; z <= bh[2] + 1e-9; z += step) pts.push([x, y, z]);
    return pts;
  };
  const component = { strain: 0.04, impact: +(2.5e4 * heavy).toFixed(0) };
  const Y = (y) => y + dy;
  const front = zMax - 0.35;
  const components = [
    { id: 'radiator_centre', samples: box([-0.5, Y(0.25), front - 0.2], [0.5, Y(0.65), front]) },
    { id: 'coolant_lines', samples: box([-0.15, Y(0.2), zF - 0.3], [0.15, Y(0.35), front - 0.2], 0.1) },
    { id: 'oil_sump', samples: box([-0.3, Y(0.15), pt.engine.lo[2]], [0.3, Y(0.3), pt.engine.hi[2]]), nodes: engine.nodes.filter((x) => /_\d_0_\d$/.test(x)) },
    { id: 'gearbox', samples: box([-0.25, Y(0.2), pt.gearbox.lo[2] - 0.1], [0.25, Y(0.5), pt.gearbox.hi[2]]), nodes: gearbox.nodes },
    { id: 'fuel_tank', samples: box([-0.55, Y(0.2), zR + 0.2], [0.55, Y(0.45), zR + 0.75]) },
    { id: 'battery', samples: box([0.2, Y(0.35), zMin + 0.4], [0.55, Y(0.55), zMin + 0.75]) },
    { id: 'steering_rack', samples: box([-0.45, Y(0.2), zF - 0.3], [0.45, Y(0.35), zF - 0.08]) },
    ...wheelsModel.flatMap((w, i) => {
      const nm = ['FL', 'FR', 'RL', 'RR'][i], sx = w.position[0] > 0 ? 1 : -1, z = w.position[2];
      return [
        { id: `halfshaft_${nm}`, samples: box([Math.min(0.1 * sx, 0.6 * sx), Y(0.25), z - 0.08], [Math.max(0.1 * sx, 0.6 * sx), Y(0.42), z + 0.08]) },
        { id: `brakeline_${nm}`, samples: box([Math.min(0.5 * sx, (w2 - 0.25) * sx), Y(0.3), z - 0.25], [Math.max(0.5 * sx, (w2 - 0.25) * sx), Y(0.6), z + 0.25]) },
      ];
    }),
  ].map((c) => {
    const fluid = c.id.startsWith('radiator') || c.id === 'coolant_lines' ? 'coolant' : c.id === 'oil_sump' ? 'oil' : c.id === 'fuel_tank' ? 'fuel' : null;
    const centre = [0, 1, 2].map((k) => +(c.samples.reduce((sum, p) => sum + p[k], 0) / c.samples.length).toFixed(3));
    return { ...c, ...component, ...(fluid ? { visual: { kind: 'component', fluid, at: centre } } : {}) };
  });
  b.tagDamageGroups([...damageGroups.values()]);
  b.tagDamageGroups(components);
  const damageLinks = [
    { group: 'radiator_centre', effect: 'coolantLeak', rate: 0.4 },
    { group: 'coolant_lines', effect: 'coolantLeak', rate: 0.2 },
    { group: 'oil_sump', effect: 'oilLeak', rate: 0.25 },
    { group: 'gearbox', effect: 'gearbox' },
    { group: 'engine_mounts', effect: 'driveLoss', wheel: 'FL' },
    { group: 'engine_mounts', effect: 'driveLoss', wheel: 'FR' },
    { group: 'fuel_tank', effect: 'fuelLeak', rate: 0.4 },
    { group: 'battery', effect: 'electrical' },
    { group: 'steering_rack', effect: 'steering' },
    ...['FL', 'FR', 'RL', 'RR'].flatMap((wh) => [
      { group: `halfshaft_${wh}`, effect: 'driveLoss', wheel: wh },
      { group: `brakeline_${wh}`, effect: 'brakeLoss', wheel: wh },
    ]),
  ];
  vehicle.fluids = car.fluids;
  vehicle.damageLinks = damageLinks;
  const ab = car.airbags;
  const visual = {
    parts: [],
    internals: [['engine', engine, pt.engine.n], ['gearbox', gearbox, pt.gearbox.n]].map(([kind, blk, n]) => ({
      kind, corners: [0, 1, 2, 3, 4, 5, 6, 7].map((c) => blk.at(c & 1 ? n[0] - 1 : 0, c & 2 ? n[1] - 1 : 0, c & 4 ? n[2] - 1 : 0)),
    })),
    airbags: [
      { bag: 'driver', at: ab.driver, size: [0.3, 0.28, 0.18] },
      { bag: 'passenger', at: ab.passenger, size: [0.33, 0.3, 0.24] },
      { bag: 'sideLeft', at: ab.side, size: [0.05, 0.22, 0.6] },
      { bag: 'sideRight', at: [-ab.side[0], ab.side[1], ab.side[2]], size: [0.05, 0.22, 0.6] },
    ],
  };
  const json = b.toJSON({
    header: { id, name: car.name, model: { glb: `vehicles/${id}/${id}.glb` }, generator: 'tools/vehicle-gen/luxury.mjs' },
    hydroChannels: 1,
    vehicle,
    targets: { mass: car.mass, frontWeightFraction: car.front, ...car.targets },
  });
  json.sources = car.sources;
  json.visual = visual;
  fs.writeFileSync(outPath, JSON.stringify(json) + '\n');
  console.log(`${id}: ${b.nodes.length} explicit nodes (${b.lattice.length} lattice) + ${4 * 4 * segments} wheel nodes, ${b.beams.length} beams → ` +
    `${path.relative(root, outPath)} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KiB)`);
  console.log(`  mass ${total.toFixed(1)} kg, front ${(frontFraction * 100).toFixed(1)} %, ancillaries ${ancillaryMass.toFixed(0)} kg, CG height ${cgY.toFixed(3)} m, ` +
    `cavity ${(cavity.gap * 100).toFixed(1)} cm, hull ${hullTriangles} triangles, R ${R}, zF ${zF} zR ${zR}`);
  console.log(`  lattice xs ±${half} ys ${ys.join('/')} zs ${zs[0]}…${zs[zs.length - 1]} (${zs.length}), refs ${ref} ${refFront} ${refLeft}`);
  for (const c of Object.values(corners)) console.log(`  ${c.name}: spring ${c.spring.k.toFixed(0)} N/m c ${c.spring.c.toFixed(0)} preload ${c.spring.load.toFixed(0)} N`);
  console.log(`  damage groups: ${b.damageGroups.map((g) => g.id).join(', ')}`);
}

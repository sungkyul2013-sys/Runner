// Drop tests: release each aircraft just above the runway at landing speed with a given sink rate and pitch.
import * as THREE from 'three';
import { AIRCRAFT } from '../src/aircraft/specs';
import { FlightModel, Controls, Env } from '../src/aircraft/FlightModel';
import { Assist } from '../src/aircraft/Assist';
import { RUNWAYS } from '../src/world/WorldDef';

const env: Env = { wind: new THREE.Vector3(), turbulence: 0, time: 0, carrierWires: [], catapult: false };
const DT = 1 / 240;
const X = new THREE.Vector3(1, 0, 0);
for (const spec of AIRCRAFT) {
  const row: string[] = [];
  for (const [vs, pitchDeg, stickP] of [[1.5, 4, 0], [3, 3, 0], [4.5, 2, 0], [6, 0, 0], [3, -1, 0], [3, 6, -0.6], [2, 5, 1]] as const) {
    const fm = new FlightModel(spec); const as = new Assist(); as.level = 'standard';
    const rw = RUNWAYS[0];
    const gy = Math.min(...spec.gear.map((g) => g.p[1]));
    fm.reset(new THREE.Vector3(rw.cx, rw.elev - gy + 0.35, rw.cz + rw.length / 2 - 300), 0, spec.vRef, false);
    fm.quat.multiply(new THREE.Quaternion().setFromAxisAngle(X, pitchDeg * Math.PI / 180));
    fm.vel.set(0, -vs, -spec.vRef);
    fm.gear = 1;
    const c: Controls = { throttle: 0.1, ab: false, brake: 0, flaps: spec.flapNotches[spec.flapNotches.length - 1], gearDown: true, airbrake: false, hook: false, steer: 0 };
    fm.flaps = c.flaps; fm.thr = 0.1;
    let collapse = 0, maxComp = 0; fm.onGearCollapse = (i) => { collapse++; if (process.env.DBG) console.log('  collapse gear', i, 't', t.toFixed(2), 'vy', fm.vel.y.toFixed(2), 'om', fm.omega.x.toFixed(2), fm.omega.y.toFixed(2), fm.omega.z.toFixed(2)); };
    let t = 0;
    while (t < 25 && !fm.crashed) {
      const out = as.update(1 / 60, fm, { pitch: t < 1.5 ? stickP : 0, roll: 0, yaw: 0 }, c.throttle, 0);
      if (out.throttle !== null) c.throttle = out.throttle;
      c.brake = t > 3 ? 1 : 0; c.steer = out.steer;
      for (let i = 0; i < 4; i++) { fm.step(DT, out.cmd, c, env); }
      for (const g of fm.gearState) maxComp = Math.max(maxComp, g.compression);
      t += 1 / 60;
    }
    row.push(`vs${vs} p${pitchDeg} s${stickP}: ${fm.crashed ? 'CRASH ' + fm.crashReason : 'ok'}${collapse ? ' collapse' + collapse : ''} hp=${Math.round(fm.hp.fuselage)}`);
  }
  console.log(spec.id.padEnd(9), '\n  ' + row.join('\n  '));
}
if (process.env.TRACE) for (const id of ['kestrel', 'meridian']) {
  const spec = AIRCRAFT.find((a) => a.id === id)!;
  const fm = new FlightModel(spec); const as = new Assist(); as.level = 'standard';
  const rw = RUNWAYS[0]; const gy = Math.min(...spec.gear.map((g) => g.p[1]));
  fm.reset(new THREE.Vector3(rw.cx, rw.elev - gy + 0.35, rw.cz + rw.length / 2 - 300), 0, spec.vRef, false);
  fm.quat.multiply(new THREE.Quaternion().setFromAxisAngle(X, 5 * Math.PI / 180)); fm.vel.set(0, -2, -spec.vRef); fm.gear = 1;
  const c: Controls = { throttle: 0.1, ab: false, brake: 0, flaps: spec.flapNotches[spec.flapNotches.length - 1], gearDown: true, airbrake: false, hook: false, steer: 0 };
  fm.flaps = c.flaps; fm.thr = 0.1; let t = 0, k = 0;
  while (t < 12 && !fm.crashed) {
    const out = as.update(1 / 60, fm, { pitch: t < 1.5 ? 1 : 0, roll: 0, yaw: 0 }, c.throttle, 0);
    if (out.throttle !== null) c.throttle = out.throttle; c.steer = out.steer;
    for (let i = 0; i < 4; i++) fm.step(DT, out.cmd, c, env);
    t += 1 / 60;
    if (k++ % 15 === 0) console.log(id, t.toFixed(2), 'agl', fm.agl.toFixed(1), 'vy', fm.vel.y.toFixed(1), 'ias', fm.ias.toFixed(0), 'pitch', (fm.attitude().pitch * 57.3).toFixed(1), 'cmd', JSON.stringify(out.cmd).slice(0,60), 'thr', c.throttle.toFixed(2), 'gnd', fm.onGround);
  }
  console.log(id, fm.crashed ? fm.crashReason : 'ok');
}

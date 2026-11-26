import * as THREE from 'three';
import { getSpec } from '../src/aircraft/specs';
import { FlightModel, Env } from '../src/aircraft/FlightModel';
import { Assist, ilsDeviation } from '../src/aircraft/Assist';
import { RUNWAYS, terrainHeight } from '../src/world/WorldDef';
import { RAD, MS_TO_KT } from '../src/core/math';
const [id, wdir, wspd, turb, dist] = [process.argv[2] || 'meridian', +(process.argv[3] ?? 20), +(process.argv[4] ?? 8), +(process.argv[5] ?? 0.55), +(process.argv[6] ?? 13000)];
const spec = getSpec(id);
const d = wdir * Math.PI / 180;
const env: Env = { wind: new THREE.Vector3(-Math.sin(d), 0, Math.cos(d)).multiplyScalar(wspd), turbulence: turb, time: 0, carrierWires: [], catapult: false };
const fm = new FlightModel(spec); const as = new Assist(); as.level = 'beginner';
const rw = RUNWAYS[0];
fm.reset(new THREE.Vector3(0, rw.elev + 900, rw.cz + rw.length / 2 + dist), 0, 85, false);
const c = { throttle: 0.45, ab: false, brake: 0, flaps: spec.flapNotches[2] ?? 0, gearDown: true, airbrake: false, hook: false, steer: 0 };
fm.flaps = c.flaps; fm.thr = 0.45;
as.engageApproach(fm);
let t = 0;
for (let k = 0; k < 60 * 400 && !fm.crashed; k++) {
  const out = as.update(1 / 60, fm, { pitch: 0, roll: 0, yaw: 0 }, c.throttle, 0);
  if (out.throttle !== null) c.throttle = out.throttle;
  if (out.brake !== null) c.brake = out.brake;
  c.steer = out.steer;
  for (let i = 0; i < 4; i++) { env.time += 1/240; fm.step(1 / 240, out.cmd, c, env); }
  t += 1 / 60;
  if (k % 300 === 0) { const a = fm.attitude(); const dv = ilsDeviation(fm, (as as any).appTarget); console.log(`t${t.toFixed(0)} x${fm.pos.x.toFixed(0)} z${fm.pos.z.toFixed(0)} y${fm.pos.y.toFixed(0)} terr${terrainHeight(fm.pos.x, fm.pos.z).toFixed(0)} ias${(fm.ias*MS_TO_KT).toFixed(0)} vs${fm.vs.toFixed(1)} roll${(a.roll*RAD).toFixed(0)} pitch${(a.pitch*RAD).toFixed(0)} loc${dv.loc.toFixed(0)} gs${dv.gs.toFixed(0)} thr${c.throttle.toFixed(2)} ap${as.ap.on}`); }
  if (fm.onGround && fm.vel.length() < 1) break;
}
console.log('end', fm.crashed, fm.crashReason, fm.pos.toArray().map(v=>v.toFixed(0)), 'terr', terrainHeight(fm.pos.x, fm.pos.z).toFixed(0));

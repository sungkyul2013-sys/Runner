import * as THREE from 'three';
import { getSpec } from '../src/aircraft/specs';
import { FlightModel, Env } from '../src/aircraft/FlightModel';
import { Assist, ilsDeviation } from '../src/aircraft/Assist';
import { RUNWAYS } from '../src/world/WorldDef';
import { RAD, MS_TO_KT } from '../src/core/math';
const id = process.argv[2] || 'kestrel';
const spec = getSpec(id);
const env: Env = { wind: new THREE.Vector3(), turbulence: 0, time: 0, carrierWires: [], catapult: false };
const fm = new FlightModel(spec); const as = new Assist(); as.level = 'standard';
const rw = RUNWAYS[0];
fm.reset(new THREE.Vector3(rw.cx + 40, rw.elev + 6000 * Math.tan(3 * Math.PI / 180) + 30, rw.cz + rw.length / 2 + 6000 - 320), 0, spec.vRef * 1.05, false);
const c = { throttle: 0.5, ab: false, brake: 0, flaps: spec.flapNotches[spec.flapNotches.length - 1], gearDown: true, airbrake: false, hook: false, steer: 0 };
fm.flaps = c.flaps; fm.thr = 0.5;
as.engageApproach(fm);
console.log('target', (as as any).appTarget);
let t = 0;
for (let k = 0; k < 60 * 200 && !fm.crashed; k++) {
  const out = as.update(1 / 60, fm, { pitch: 0, roll: 0, yaw: 0 }, c.throttle, 0);
  if (out.throttle !== null) c.throttle = out.throttle;
  if (out.brake !== null) c.brake = out.brake;
  c.steer = out.steer;
  for (let i = 0; i < 4; i++) fm.step(1 / 240, out.cmd, c, env);
  t += 1 / 60;
  if (k % 120 === 0) { const a = fm.attitude(); const d = ilsDeviation(fm, (as as any).appTarget); console.log(`t${t.toFixed(0)} x${fm.pos.x.toFixed(0)} z${fm.pos.z.toFixed(0)} y${fm.pos.y.toFixed(0)} ias${(fm.ias*MS_TO_KT).toFixed(0)} vs${fm.vs.toFixed(1)} roll${(a.roll*RAD).toFixed(0)} pitch${(a.pitch*RAD).toFixed(0)} hdg${(a.hdg*RAD).toFixed(0)} loc${d.loc.toFixed(0)} gs${d.gs.toFixed(0)} thr${c.throttle.toFixed(2)} n${fm.gLoad.toFixed(2)} de${out.cmd.de.toFixed(2)} da${out.cmd.da.toFixed(2)} ap${as.ap.on}`); }
  if (fm.onGround && fm.tas < 1) break;
}
console.log('end', fm.crashed, fm.crashReason);

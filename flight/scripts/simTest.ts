// Headless physics regression: takeoff, cruise stability, roll/pitch authority, ILS autoland for every aircraft.
import * as THREE from 'three';
import { AIRCRAFT } from '../src/aircraft/specs';
import { FlightModel, Controls, Env } from '../src/aircraft/FlightModel';
import { Assist } from '../src/aircraft/Assist';
import { RUNWAYS } from '../src/world/WorldDef';
import { MS_TO_KT, RAD } from '../src/core/math';

const env: Env = { wind: new THREE.Vector3(), turbulence: 0, time: 0, carrierWires: [], catapult: false };
const DT = 1 / 240;
function ctl(): Controls { return { throttle: 0, ab: false, brake: 0, flaps: 0, gearDown: true, airbrake: false, hook: false, steer: 0 }; }

function run(fm: FlightModel, as: Assist, c: Controls, secs: number, stick: (t: number) => { pitch: number; roll: number; yaw: number }, each?: (t: number) => boolean | void) {
  let t = 0;
  while (t < secs && !fm.crashed) {
    const frame = 1 / 60;
    const st = stick(t);
    const out = as.update(frame, fm, st, c.throttle, 0);
    if (out.throttle !== null) c.throttle = out.throttle;
    if (out.brake !== null) c.brake = out.brake;
    c.steer = out.steer;
    for (let i = 0; i < 4; i++) { env.time += DT; fm.step(DT, out.cmd, c, env); }
    t += frame;
    if (each && each(t)) break;
  }
  return t;
}

for (const spec of AIRCRAFT) {
  const res: string[] = [];
  // ---- takeoff (beginner) ----
  {
    const fm = new FlightModel(spec); const as = new Assist(); as.level = 'beginner';
    const rw = RUNWAYS[0];
    const gy = Math.min(...spec.gear.map((g) => g.p[1]));
    fm.reset(new THREE.Vector3(rw.cx, rw.elev - gy + 0.02, rw.cz + rw.length / 2 - 70), 0, 0, true);
    const c = ctl(); c.throttle = 1; c.ab = !!spec.engine.ab; c.flaps = spec.flapNotches[Math.min(1, spec.flapNotches.length - 1)];
    let lift = -1, liftX = 0; const z0 = fm.pos.z;
    const t = run(fm, as, c, 90, (tt) => ({ pitch: fm.ias > spec.vR ? 0.6 : 0, roll: 0, yaw: 0 }), (tt) => {
      if (lift < 0 && tt > 2 && fm.gearState.every((g) => !g.contact) && fm.agl > 6) { lift = tt; liftX = z0 - fm.pos.z; }
      if (lift > 0 && tt - lift > 20) return true;
    });
    res.push(`TO: lift ${lift.toFixed(1)}s @${Math.round(liftX)}m, +20s agl=${fm.agl.toFixed(0)} ias=${(fm.ias * MS_TO_KT).toFixed(0)}kt ${fm.crashed ? 'CRASH ' + fm.crashReason : ''} drift=${fm.pos.x.toFixed(1)}`);
  }
  // ---- cruise stability: each assist level, hands off ----
  for (const lvl of ['beginner', 'standard', 'realistic'] as const) {
    const fm = new FlightModel(spec); const as = new Assist(); as.level = lvl;
    const v = spec.vRef * 1.7;
    fm.reset(new THREE.Vector3(0, 1500, 5000), 0, v, false); fm.gear = spec.retract ? 0 : 1;
    const c = ctl(); c.gearDown = !spec.retract; c.throttle = 0.6;
    // simple autothrottle-less test
    run(fm, as, c, 40, () => ({ pitch: 0, roll: 0, yaw: 0 }));
    const at = fm.attitude();
    res.push(`${lvl.padEnd(9)} 40s: alt ${fm.pos.y.toFixed(0)} ias ${(fm.ias * MS_TO_KT).toFixed(0)}kt pitch ${(at.pitch * RAD).toFixed(1)} roll ${(at.roll * RAD).toFixed(1)} ${fm.crashed ? 'CRASH ' + fm.crashReason : ''}`);
  }
  // ---- authority: full roll 3s, full pull 3s (standard) ----
  {
    const fm = new FlightModel(spec); const as = new Assist(); as.level = 'realistic';
    fm.reset(new THREE.Vector3(0, 3000, 5000), 0, spec.vRef * 2.2, false); fm.gear = spec.retract ? 0 : 1;
    const c = ctl(); c.gearDown = !spec.retract; c.throttle = 0.9;
    let maxP = 0;
    run(fm, as, c, 1.5, () => ({ pitch: 0, roll: 1, yaw: 0 }), () => { maxP = Math.max(maxP, -fm.omega.z); });
    const fm2 = new FlightModel(spec); const as2 = new Assist(); as2.level = 'standard';
    fm2.reset(new THREE.Vector3(0, 3000, 5000), 0, spec.vRef * 2.2, false); fm2.gear = spec.retract ? 0 : 1;
    let maxG = 0;
    run(fm2, as2, c, 3, () => ({ pitch: 1, roll: 0, yaw: 0 }), () => { maxG = Math.max(maxG, fm2.gLoad); });
    res.push(`roll rate ${(maxP * RAD).toFixed(0)}°/s  pull maxG ${maxG.toFixed(1)} (lim ${spec.gMax})  alpha ${(fm2.alpha * RAD).toFixed(1)}`);
  }
  // ---- ILS autoland from 6 km ----
  {
    const fm = new FlightModel(spec); const as = new Assist(); as.level = 'standard';
    const rw = RUNWAYS[0];
    fm.reset(new THREE.Vector3(rw.cx + 40, rw.elev + 6000 * Math.tan(3 * Math.PI / 180) + 30, rw.cz + rw.length / 2 + 6000 - 320), 0, spec.vRef * 1.05, false);
    const c = ctl(); c.gearDown = true; c.flaps = spec.flapNotches[spec.flapNotches.length - 1]; c.throttle = 0.5; fm.flaps = c.flaps; fm.thr = 0.5;
    as.engageApproach(fm);
    let td: string = 'none';
    fm.onTouchdown = (vn, i) => { if (td === 'none' && !spec.gear[i].nose) td = `${Math.round(-vn * 196.85)}fpm @z=${fm.pos.z.toFixed(0)} x=${fm.pos.x.toFixed(1)} ias=${(fm.ias * MS_TO_KT).toFixed(0)}kt`; };
    run(fm, as, c, 260, () => ({ pitch: 0, roll: 0, yaw: 0 }), () => fm.onGround && fm.tas < 1);
    res.push(`AUTOLAND td ${td} stop z=${fm.pos.z.toFixed(0)} x=${fm.pos.x.toFixed(1)} ${fm.crashed ? 'CRASH ' + fm.crashReason : ''}`);
  }
  console.log(`\n== ${spec.name}\n  ` + res.join('\n  '));
}

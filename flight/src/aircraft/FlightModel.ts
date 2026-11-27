import * as THREE from 'three';
import type { AircraftSpec } from './specs';
import { atmosphere, clamp, smoothstep, G0, lerp, vnoise } from '../core/math';
import { surfaceHeight, terrainNormal } from '../world/WorldDef';

export interface SurfaceCmd { de: number; da: number; dr: number }
export interface Controls {
  throttle: number; ab: boolean; brake: number; flaps: number; gearDown: boolean; airbrake: boolean; hook: boolean; steer: number; reverse?: number;
}
export type Part = 'engine' | 'wingL' | 'wingR' | 'tail' | 'gear' | 'fuselage';

export interface Env {
  wind: THREE.Vector3; turbulence: number; time: number;
  carrierWires: number[]; catapult: boolean;
}

export interface GearState { compression: number; contact: boolean; wheelAngle: number; steer: number; skid: number; hp: number; worldPos: THREE.Vector3; water: boolean }

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);

export class FlightModel {
  readonly spec: AircraftSpec;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  quat = new THREE.Quaternion();
  omega = new THREE.Vector3(); // body: x pitch-up, y yaw-left, z roll-left
  fuel: number;
  ammoMass = 0;
  // actuator states
  thr = 0; abOn = 0; flaps = 0; gear = 1; airbrake = 0; hook = 0;
  de = 0; da = 0; dr = 0;
  // outputs
  alpha = 0; beta = 0; tas = 0; ias = 0; mach = 0; qbar = 0; gLoad = 1; gLat = 0; stall = 0; rho = 1.225;
  thrust = 0; onGround = false; agl = 0; groundH = 0; vs = 0;
  gearState: GearState[];
  hp: Record<Part, number> = { engine: 100, wingL: 100, wingR: 100, tail: 100, gear: 100, fuselage: 100 };
  crashed = false; crashReason = ''; ditched = false;
  crashSpeed = 0; crashVs = 0;
  hooked = false; catapultDist = 0; catapulting = false;
  engineRunning = true;
  rpm = 0;
  bodyPts: THREE.Vector3[] = [];
  private gearK: number[] = []; private gearC: number[] = [];
  private I: THREE.Vector3;
  private prevContact: boolean[] = [];
  onTouchdown: (vy: number, gearIdx: number, speed: number) => void = () => {};
  onScrape: (p: THREE.Vector3, sev: number) => void = () => {};
  onDamage: (part: Part, amt: number) => void = () => {};
  onCrash: (reason: string) => void = () => {};
  onGearCollapse: (idx: number) => void = () => {};
  onHook: () => void = () => {};
  invincible = false;
  infiniteFuel = false;
  private groundT = 0;
  /** pitch (rad) at which the tail touches with the mains compressed */
  tailStrike = 0.25;

  constructor(spec: AircraftSpec) {
    this.spec = spec;
    this.fuel = spec.fuel;
    this.I = new THREE.Vector3(...spec.I);
    this.gearState = spec.gear.map(() => ({ compression: 0, contact: false, wheelAngle: 0, steer: 0, skid: 0, hp: 100, worldPos: new THREE.Vector3(), water: false }));
    this.prevContact = spec.gear.map(() => false);
    // static load sharing → spring rates
    const centre = spec.gear.findIndex((g) => Math.abs(g.p[0]) < 0.1);
    const mains = spec.gear.filter((g) => Math.abs(g.p[0]) >= 0.1);
    const zm = mains.reduce((a, g) => a + g.p[2], 0) / Math.max(1, mains.length);
    const zc = centre >= 0 ? spec.gear[centre].p[2] : 0;
    const sc = centre >= 0 ? clamp(zm / (zm - zc), 0.06, 0.5) : 0;
    const m = spec.mass + spec.fuel;
    spec.gear.forEach((g, i) => {
      const share = i === centre ? sc : (1 - sc) / Math.max(1, mains.length);
      const k = (m * G0 * share) / (g.travel * 0.38);
      this.gearK.push(k);
      this.gearC.push(2 * 0.65 * Math.sqrt(k * m * share));
    });
    const G = spec.geom;
    const zN = -G.length * 0.52, zT = zN + G.length;
    const half = G.wing.span / 2;
    const tipZ = G.wing.z + half * Math.tan((G.wing.sweep * Math.PI) / 180) + G.wing.tip * 0.5;
    const tipY = G.wing.y + half * Math.tan((G.wing.dihedral * Math.PI) / 180);
    this.bodyPts = [
      new THREE.Vector3(0, 0, zN), new THREE.Vector3(0, G.radius * 0.4 + G.tailUp * G.radius, zT),
      new THREE.Vector3(-half, tipY, tipZ), new THREE.Vector3(half, tipY, tipZ),
      new THREE.Vector3(0, -G.radius * G.heightScale * 0.95, 0), new THREE.Vector3(0, -G.radius * G.heightScale * 0.9, zN * 0.6),
      new THREE.Vector3(0, -G.radius * G.heightScale * 0.6, zT * 0.55),
      new THREE.Vector3(0, G.radius * 0.75 + G.vstab.h, G.vstab.z + G.vstab.root), new THREE.Vector3(0, G.radius * G.heightScale, 0),
    ];
    {
      const main = spec.gear.filter((g) => Math.abs(g.p[0]) >= 0.1);
      const my = Math.min(...main.map((g) => g.p[1])) + Math.max(...main.map((g) => g.travel)) * 0.7, mz = main.reduce((a, g) => a + g.p[2], 0) / Math.max(1, main.length);
      const t = this.bodyPts[1];
      if (t.z > mz) this.tailStrike = Math.atan2(t.y - my, t.z - mz);
    }
    for (const e of G.engines) if ('x' in e && Math.abs(e.x) > 0.5 && (e.kind !== 'jet' || e.pod)) this.bodyPts.push(new THREE.Vector3(e.x, e.y - e.r, e.z));
  }

  get mass() { return this.spec.mass + this.fuel + this.ammoMass; }
  get forward() { return _v3.set(0, 0, -1).applyQuaternion(this.quat); }

  /** Body-axis attitude: pitch, roll, heading (rad). */
  attitude() {
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quat);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quat);
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quat);
    const pitch = Math.asin(clamp(f.y, -1, 1));
    const roll = Math.atan2(-r.y, u.y);
    let hdg = Math.atan2(f.x, -f.z);
    if (hdg < 0) hdg += Math.PI * 2;
    return { pitch, roll, hdg, f, u, r };
  }

  reset(pos: THREE.Vector3, heading: number, speed: number, onGround: boolean) {
    this.pos.copy(pos);
    this.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -heading);
    if (onGround) {
      // settle pitch to gear geometry
      const g = this.spec.gear;
      const centre = g.find((x) => Math.abs(x.p[0]) < 0.1), main = g.find((x) => Math.abs(x.p[0]) >= 0.1);
      if (centre && main) {
        const th = Math.atan((centre.p[1] - main.p[1]) / (centre.p[2] - main.p[2]));
        this.quat.multiply(new THREE.Quaternion().setFromAxisAngle(X, th));
      }
    }
    this.vel.set(0, 0, -speed).applyQuaternion(this.quat);
    this.omega.set(0, 0, 0);
    this.thr = onGround ? 0 : 0.7;
    this.gear = onGround || !this.spec.retract ? 1 : 0;
    this.flaps = 0; this.airbrake = 0; this.abOn = 0;
    this.de = this.da = this.dr = 0;
    this.fuel = this.spec.fuel;
    this.crashed = false; this.ditched = false; this.crashReason = '';
    this.hooked = false; this.catapulting = false; this.catapultDist = 0;
    this.engineRunning = true;
    for (const k of Object.keys(this.hp) as Part[]) this.hp[k] = 100;
    this.gearState.forEach((g) => { g.hp = 100; g.contact = false; g.compression = 0; });
    this.prevContact = this.prevContact.map(() => onGround);
    this.rpm = onGround ? 0.25 : 0.8;
  }

  damage(part: Part, amt: number) {
    if (this.invincible || this.crashed) return;
    const before = this.hp[part];
    this.hp[part] = Math.max(0, this.hp[part] - amt);
    if (part !== 'fuselage') this.hp.fuselage = Math.max(0, this.hp.fuselage - amt * 0.25);
    this.onDamage(part, amt);
    if (part === 'engine' && this.hp.engine <= 0 && before > 0) this.engineRunning = false;
    if (this.hp.fuselage <= 0) this.crash('기체 파괴');
  }

  crash(reason: string) {
    if (this.crashed) return;
    if (this.invincible && reason !== '추락') { /* invincible still crashes into terrain */ }
    this.crashed = true;
    this.crashReason = reason;
    this.crashSpeed = this.vel.length(); this.crashVs = this.vel.y;
    this.onCrash(reason);
  }

  step(dt: number, cmd: SurfaceCmd, c: Controls, env: Env) {
    if (this.crashed) return;
    const s = this.spec;
    // ---------- actuators ----------
    const rate = s.engine.type === 'jet' ? 4.5 : 3;
    this.de += clamp(cmd.de - this.de, -rate * dt, rate * dt);
    this.da += clamp(cmd.da - this.da, -rate * 1.3 * dt, rate * 1.3 * dt);
    this.dr += clamp(cmd.dr - this.dr, -rate * dt, rate * dt);
    const fuelOk = this.fuel > 0 || this.infiniteFuel;
    const run = this.engineRunning && fuelOk;
    const thrTarget = run ? clamp(c.throttle, 0, 1) : 0;
    const spoolRate = 1 / s.engine.spool * (thrTarget > this.thr ? 1 : 1.6);
    this.thr += clamp(thrTarget - this.thr, -spoolRate * dt, spoolRate * dt);
    this.abOn = lerp(this.abOn, c.ab && s.engine.ab && run && this.thr > 0.9 ? 1 : 0, 1 - Math.exp(-dt * 4));
    this.rpm = lerp(this.rpm, run ? 0.22 + this.thr * 0.78 : Math.max(0, this.rpm - dt * 0.15) * (this.tas > 20 ? 1 : 0.98), 1 - Math.exp(-dt * 2));
    const flapT = c.flaps;
    this.flaps += clamp(flapT - this.flaps, -0.22 * dt, 0.22 * dt);
    if (s.retract && this.hp.gear > 0) this.gear += clamp((c.gearDown ? 1 : 0) - this.gear, -0.25 * dt, 0.25 * dt);
    this.airbrake += clamp((c.airbrake ? 1 : 0) - this.airbrake, -1.2 * dt, 1.2 * dt);
    this.hook += clamp((c.hook ? 1 : 0) - this.hook, -1 * dt, 1 * dt);

    // ---------- air data ----------
    const atm = atmosphere(this.pos.y);
    this.rho = atm.rho;
    // turbulence: smooth noise gusts
    const tb = env.turbulence;
    const gust = _v2.set(
      vnoise(env.time * 0.7, 1.3) * 3,
      vnoise(env.time * 0.9, 7.1) * 2.2 + vnoise(env.time * 3.1, 4.4) * 0.8,
      vnoise(env.time * 0.6, 9.9) * 3,
    ).multiplyScalar(tb * smoothstep(0, 60, this.agl + 5) * 2.5);
    const va = _v.copy(this.vel).sub(env.wind).sub(gust);
    _qi.copy(this.quat).invert();
    const vb = va.applyQuaternion(_qi); // body-frame air velocity
    const V = Math.max(vb.length(), 0.01);
    this.tas = V;
    this.alpha = Math.atan2(-vb.y, -vb.z);
    this.beta = Math.asin(clamp(vb.x / V, -1, 1));
    this.mach = V / atm.a;
    this.qbar = 0.5 * atm.rho * V * V;
    this.ias = V * Math.sqrt(atm.sigma);
    const qb = this.qbar;

    // ---------- coefficients ----------
    const M = this.mach;
    const pg = M < 0.95 ? Math.min(1.35, 1 / Math.sqrt(1 - Math.min(M, 0.9) ** 2)) : M > 1.05 ? 0.78 : 1.1;
    const CLa = s.CLa * pg;
    const aStall = s.alphaStall - this.flaps * 0.025;
    const a = this.alpha;
    const aa = Math.abs(a);
    const stallF = smoothstep(aStall, aStall + 0.12, aa);
    this.stall = stallF;
    const flapCL = s.flapCL * this.flaps;
    const CLlin = s.CL0 + CLa * clamp(a, -aStall, aStall) + flapCL;
    const CLfp = 1.15 * Math.sin(2 * a);
    // wing damage reduces lift
    const fL = this.hp.wingL > 0 ? 0.55 + 0.45 * (this.hp.wingL / 100) : 0.12;
    const fR = this.hp.wingR > 0 ? 0.55 + 0.45 * (this.hp.wingR / 100) : 0.12;
    let CL = lerp(CLlin, CLfp, stallF) * (fL + fR) * 0.5;
    const CLspoil = this.spec.geom.style === 'airliner' ? this.airbrake * 0.35 : 0;
    CL -= CLspoil * Math.sign(CL);
    const wave = 0.065 * smoothstep(s.Mcrit, 1.03, M) * (M > 1.3 ? 0.75 : 1);
    const CD = s.CD0 + s.k * CL * CL * (1 - stallF * 0.6) + stallF * 1.1 * Math.sin(a) ** 2 + s.gearCD * this.gear + s.flapCD * this.flaps + s.brakeCD * this.airbrake + wave + 0.6 * Math.sin(this.beta) ** 2 + (200 - this.hp.wingL - this.hp.wingR) * 0.0002;
    const CY = s.CYb * this.beta;

    // ---------- forces (body) ----------
    const F = _f.set(0, 0, 0);
    const d = _v2.copy(vb).divideScalar(V);
    const liftDir = _v3.crossVectors(X, d);
    const ll = liftDir.length();
    if (ll > 1e-4) liftDir.divideScalar(ll);
    F.addScaledVector(liftDir, qb * s.S * CL);
    F.addScaledVector(d, -qb * s.S * CD);
    F.x += qb * s.S * CY;

    // thrust
    let T = 0;
    const sigma = atm.sigma;
    const engHealth = this.hp.engine > 0 ? 0.35 + 0.65 * (this.hp.engine / 100) : 0;
    if (s.engine.type === 'prop') {
      const P = (s.engine.power ?? 0) * this.thr;
      T = Math.min((s.engine.staticT ?? 0) * this.thr, (0.8 * P) / Math.max(V, 1)) * Math.pow(sigma, 0.85);
    } else {
      const dry = s.engine.thrust * this.thr * Math.pow(sigma, 0.75) * (1 + 0.22 * M);
      const ab = (s.engine.ab ?? s.engine.thrust) * Math.pow(sigma, 0.7) * (1 + 0.35 * M);
      T = lerp(dry, ab, this.abOn);
    }
    T *= engHealth;
    // thrust reversers / reverse pitch — ground only
    if ((c.reverse ?? 0) > 0.02 && this.onGround && run) T = -(s.engine.type === 'jet' ? s.engine.thrust : (s.engine.staticT ?? 0)) * 0.42 * (c.reverse ?? 0) * engHealth;
    this.thrust = T;
    F.z -= T;

    // ---------- moments ----------
    const Vm = Math.max(V, 8);
    const p = -this.omega.z, q = this.omega.x, r = -this.omega.y;
    const ph = (p * s.b) / (2 * Vm), qh = (q * s.c) / (2 * Vm), rh = (r * s.b) / (2 * Vm);
    // propwash over the tail (low-speed authority for props) + thrust vectoring for jets
    const slip = s.engine.type === 'prop' ? (T / (s.S * 0.5)) * 0.7 : 0;
    const qTail = qb + slip;
    const tailEff = this.hp.tail > 0 ? 0.35 + 0.65 * (this.hp.tail / 100) : 0.1;
    const ctrlStall = 1 - stallF * 0.5;
    const aC = clamp(a, -0.9, 0.9);
    const Cma = s.Cma * (this.hp.tail > 0 ? 1 : -0.4);
    let Cm = s.Cm0 + Cma * Math.sin(aC) * (1 + stallF * 0.6) + s.Cmq * qh - this.flaps * 0.03;
    let Cl = s.Clb * this.beta + s.Clp * ph + s.Clr * rh;
    let Cn = s.Cnb * (this.hp.tail > 0 ? 1 : 0.2) * this.beta + s.Cnr * rh + s.Cnda * this.da;
    // wing drop / spin autorotation when stalled
    Cl += stallF * (0.05 * Math.sign(r || 1e-3) + vnoise(env.time * 1.7, 3.3) * 0.03);
    Cl += (fR - fL) * 0.22 * clamp(CL, -1.2, 1.5);
    // control surfaces
    const momScale = qTail / Math.max(qb, 1);
    Cm += s.Cmde * this.de * tailEff * momScale;
    Cn += s.Cndr * this.dr * tailEff * momScale;
    Cl += s.Clda * this.da * ctrlStall * Math.min(fL, fR) * (1 / ((fL + fR) * 0.5)) * 0.95 + s.Clda * this.da * 0.05;
    const tau = _t.set(qb * s.S * s.c * Cm, -(qb * s.S * s.b * Cn), -(qb * s.S * s.b * Cl));
    if (s.id === 'specter') {
      // 2D thrust vectoring: ±20° nozzles, 5.5 m behind CG
      tau.x += T * Math.sin(0.35 * this.de) * 5.5;
      tau.y += -T * Math.sin(0.12 * this.dr) * 5.5;
    }

    // ---------- to world ----------
    F.applyQuaternion(this.quat);
    const m = this.mass;
    F.y -= m * G0;

    // ---------- ground contact ----------
    this.onGround = false;
    const sh = surfaceHeight(this.pos.x, this.pos.z);
    this.groundH = sh.h;
    this.agl = this.pos.y - sh.h;
    const tauW = _v.set(0, 0, 0); // world torque from contacts
    const gearUsable = this.gear > 0.98;
    for (let i = 0; i < s.gear.length; i++) {
      const g = s.gear[i];
      const gs = this.gearState[i];
      gs.contact = false;
      if (!gearUsable || gs.hp <= 0) { gs.compression = 0; continue; }
      const rb = new THREE.Vector3(...g.p);
      const rw = rb.clone().applyQuaternion(this.quat);
      const P = rw.clone().add(this.pos);
      gs.worldPos.copy(P);
      const sf = surfaceHeight(P.x, P.z);
      const pen = sf.h - P.y;
      gs.water = sf.water;
      if (pen <= 0) { gs.compression = Math.max(0, gs.compression - dt * 2); continue; }
      const n = sf.water || sf.deck ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(...terrainNormal(P.x, P.z, 1.5));
      const vc = this.omega.clone().cross(rb).applyQuaternion(this.quat).add(this.vel);
      const vn = vc.dot(n);
      if (sf.water) {
        // ditching: water drag, no spring
        F.addScaledVector(vc, -m * 0.8);
        F.addScaledVector(n, m * G0 * 0.4);
        if (this.tas > 14 && !this.invincible) this.crash('바다에 추락');
        else this.ditched = true;
        continue;
      }
      gs.contact = true;
      this.onGround = true;
      const comp = Math.min(pen, g.travel);
      gs.compression = comp;
      if (!this.prevContact[i]) this.onTouchdown(vn, i, this.tas);
      // structural overload
      const limit = s.hook ? 7.5 : s.mass > 20000 ? 4 : 3.6;
      if (-vn > limit && !this.invincible) {
        gs.hp = 0;
        this.damage('gear', 40);
        this.onGearCollapse(i);
        continue;
      }
      // oleo strut: soft compression damping, much stronger rebound damping; bottoming-out is inelastic
      let N = this.gearK[i] * comp - this.gearC[i] * vn * (vn < 0 ? 1 : 2.4);
      if (pen > g.travel) { N += this.gearK[i] * 6 * (pen - g.travel); if (vn < 0) N -= this.gearC[i] * 3 * vn; }
      N = Math.max(0, N);
      // tyre frame
      const steerSign = g.p[2] > 0 ? -1 : 1;
      const steerAng = g.steer ? clamp(c.steer, -1, 1) * (g.nose ? 0.6 : 0.3) * steerSign * clamp(1 - this.tas / 60, 0.08, 1) : 0;
      gs.steer = steerAng;
      const fw = new THREE.Vector3(Math.sin(steerAng), 0, -Math.cos(steerAng)).applyQuaternion(this.quat);
      fw.addScaledVector(n, -fw.dot(n)).normalize();
      const lat = new THREE.Vector3().crossVectors(n, fw).normalize();
      const vLong = vc.dot(fw), vLat = vc.dot(lat);
      const brake = g.brake ? c.brake : 0;
      const mu = 0.02 + brake * 0.62;
      const Flong = -clamp(vLong / 0.4, -1, 1) * mu * N;
      const Flat = -clamp(vLat / 0.25, -1, 1) * 0.85 * N;
      gs.skid = Math.abs(vLat) > 1.2 || (brake > 0.8 && Math.abs(vLong) > 5) ? 1 : 0;
      gs.wheelAngle += (vLong / g.wheelR) * dt;
      const Fg = n.clone().multiplyScalar(N).addScaledVector(fw, Flong).addScaledVector(lat, Flat);
      F.add(Fg);
      tauW.add(rw.clone().cross(Fg));
    }
    for (let i = 0; i < this.prevContact.length; i++) this.prevContact[i] = this.gearState[i].contact;

    // body points (belly landing, wingtip strikes, crashes)
    for (let i = 0; i < this.bodyPts.length; i++) {
      const rb = this.bodyPts[i];
      const rw = rb.clone().applyQuaternion(this.quat);
      const P = rw.clone().add(this.pos);
      const sf = surfaceHeight(P.x, P.z);
      const pen = sf.h - P.y;
      if (pen <= 0) continue;
      const vc = this.omega.clone().cross(rb).applyQuaternion(this.quat).add(this.vel);
      if (sf.water) {
        if (this.tas > 14) { this.crash('바다에 추락'); return; }
        this.ditched = true;
        F.addScaledVector(vc, -m * 1.2); F.y += m * G0 * 0.6;
        continue;
      }
      const n = new THREE.Vector3(0, 1, 0);
      const vn = vc.dot(n);
      const impact = Math.max(-vn, 0);
      const speed = vc.length();
      // tail / aft-belly scrapes (over-rotation) are survivable unless the whole aircraft is sinking hard
      const fatal = i === 1 || i === 6 ? -this.vel.y > 6 : i === 0 || i === 7 || i === 8 ? impact > 4 || speed > 45 : impact > 7 || (speed > 80 && impact > 4.5);
      if (fatal) { this.crash(i === 2 || i === 3 ? '날개 충돌' : '지면 충돌'); return; }
      const N = Math.max(0, m * 60 * pen - m * 6 * vn);
      const vt = vc.clone().addScaledVector(n, -vn);
      const Ff = vt.lengthSq() > 0.01 ? vt.normalize().multiplyScalar(-0.45 * N) : new THREE.Vector3();
      const Fg = n.multiplyScalar(N).add(Ff);
      F.add(Fg);
      tauW.add(rw.clone().cross(Fg));
      this.onGround = true;
      if (speed > 3) {
        this.onScrape(P, Math.min(1, speed / 40));
        this.damage(i === 2 ? 'wingL' : i === 3 ? 'wingR' : i === 1 || i === 7 ? 'tail' : i >= 9 ? 'engine' : 'fuselage', dt * speed * (i === 1 || i === 6 ? 0.25 : 0.6));
      }
    }

    // arresting gear & catapult
    if (s.hook && this.hook > 0.9 && !this.hooked && this.onGround && Math.abs(this.pos.x - (-5200)) < 30) {
      for (const wz of env.carrierWires) if (Math.abs(this.pos.z - wz) < 6 && this.tas > 15) { this.hooked = true; this.onHook(); break; }
    }
    if (this.hooked) {
      const sp = this.vel.length();
      if (sp > 0.5) F.addScaledVector(this.vel.clone().normalize(), -m * Math.min(45, (sp * sp) / (2 * 85) + 4));
      if (sp < 1 && c.hook === false) this.hooked = false;
    }
    if (env.catapult && this.catapulting) {
      const fw = this.forward.clone(); fw.y = 0; fw.normalize();
      F.addScaledVector(fw, m * 32);
      this.catapultDist += this.vel.length() * dt;
      if (this.catapultDist > 95) this.catapulting = false;
    }

    // ---------- integrate ----------
    const acc = F.divideScalar(m);
    // load factor (specific force in body Y)
    const spec = acc.clone(); spec.y += G0;
    _q.copy(this.quat).invert();
    spec.applyQuaternion(_q);
    this.gLoad = lerp(this.gLoad, spec.y / G0, 1 - Math.exp(-dt * 20));
    this.gLat = spec.x / G0;
    this.vel.addScaledVector(acc, dt);
    this.pos.addScaledVector(this.vel, dt);
    this.vs = this.vel.y;
    // angular
    tauW.applyQuaternion(_q); // world → body
    tau.add(tauW);
    const Iw = new THREE.Vector3(this.I.x * this.omega.x, this.I.y * this.omega.y, this.I.z * this.omega.z);
    const gyro = this.omega.clone().cross(Iw);
    tau.sub(gyro);
    this.omega.x += (tau.x / this.I.x) * dt;
    this.omega.y += (tau.y / this.I.y) * dt;
    this.omega.z += (tau.z / this.I.z) * dt;
    // gentle damping for numeric stability on the ground
    if (this.onGround) this.omega.multiplyScalar(Math.exp(-dt * 1.5));
    const w = this.omega;
    // q' = q + 0.5 * q * w  (body rates)
    const qq = this.quat;
    const nx = qq.x + (qq.w * w.x * 0.5 + qq.y * w.z * 0.5 - qq.z * w.y * 0.5) * dt;
    const ny = qq.y + (qq.w * w.y * 0.5 + qq.z * w.x * 0.5 - qq.x * w.z * 0.5) * dt;
    const nz = qq.z + (qq.w * w.z * 0.5 + qq.x * w.y * 0.5 - qq.y * w.x * 0.5) * dt;
    const nw = qq.w + (-qq.x * w.x * 0.5 - qq.y * w.y * 0.5 - qq.z * w.z * 0.5) * dt;
    qq.set(nx, ny, nz, nw).normalize();

    // ---------- fuel & structural limits ----------
    if (!this.infiniteFuel) {
      const burn = s.burn * (0.15 + 0.85 * this.thr) + (s.burnAB ?? 0) * this.abOn;
      this.fuel = Math.max(0, this.fuel - burn * dt * (run ? 1 : 0));
    }
    if (!this.invincible) {
      if (this.onGround) this.groundT = 0.6; else this.groundT = Math.max(0, this.groundT - dt);
      if (this.groundT <= 0 && (this.gLoad > s.gMax * 1.45 || this.gLoad < s.gMin * 1.5)) { this.damage(Math.random() < 0.5 ? 'wingL' : 'wingR', dt * 60); }
      if (this.ias > s.vMax * 1.12 && s.vMax < 400) this.damage('tail', dt * 25);
      if (this.hp.wingL <= 0 && this.hp.wingR <= 0) this.crash('양 날개 손실');
    }
    if (this.pos.y < sh.h - 3 && !sh.water) this.crash('지면 충돌');
  }
}

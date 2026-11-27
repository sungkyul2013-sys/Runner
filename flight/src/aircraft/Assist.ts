import * as THREE from 'three';
import type { FlightModel, SurfaceCmd } from './FlightModel';
import { clamp, G0, wrapAngle, DEG, lerp } from '../core/math';
import { runwayAt, RunwayDef, terrainHeight, RUNWAYS, CARRIER } from '../world/WorldDef';
import type { AssistLevel } from '../core/Save';

export interface Stick { pitch: number; roll: number; yaw: number }
export interface APState { on: boolean; alt: boolean; hdg: boolean; spd: boolean; app: boolean; altT: number; hdgT: number; spdT: number }
export interface AssistOut { cmd: SurfaceCmd; throttle: number | null; brake: number | null; steer: number; gcas: boolean; protect: string }

export interface ApproachTarget { rw: RunwayDef | null; carrier: boolean; tdx: number; tdz: number; elev: number; hdg: number; gs: number }

export function nearestApproach(pos: THREE.Vector3): ApproachTarget {
  // score = distance with a heavy penalty for being off the extended centreline
  let best: ApproachTarget | null = null, bs = Infinity;
  const consider = (t: ApproachTarget) => {
    const dirZ = Math.cos(t.hdg * DEG) > 0 ? -1 : 1;
    const along = (pos.z - t.tdz) * -dirZ;
    const lateral = Math.abs(pos.x - t.tdx);
    if (along < -300) return;
    const score = Math.hypot(Math.max(along, 0), lateral * 3.5);
    if (score < bs) { bs = score; best = t; }
  };
  for (const rw of RUNWAYS) {
    for (const end of [1, -1]) {
      const hdg = end === 1 ? rw.heading : (rw.heading + 180) % 360;
      const dirZ = Math.cos(hdg * DEG) > 0 ? -1 : 1;
      const thrZ = rw.cz - dirZ * (rw.length / 2);
      consider({ rw, carrier: false, tdx: rw.cx, tdz: thrZ + dirZ * (rw.length > 1500 ? 320 : 160), elev: rw.elev, hdg, gs: rw.length > 1500 ? 3 : 4 });
    }
  }
  consider({ rw: null, carrier: true, tdx: CARRIER.cx, tdz: CARRIER.cz + CARRIER.length / 2 - 60, elev: CARRIER.deck, hdg: 0, gs: 3.5 });
  return best ?? { rw: RUNWAYS[0], carrier: false, tdx: 0, tdz: 1180, elev: RUNWAYS[0].elev, hdg: 0, gs: 3 };
}

/** ILS-style deviations: loc (m, + = right of centreline), gs (m, + = above path), dist (m to touchdown). */
export function ilsDeviation(fm: FlightModel, ap: ApproachTarget) {
  const dirZ = Math.cos(ap.hdg * DEG) > 0 ? -1 : 1;
  const dist = (fm.pos.z - ap.tdz) * -dirZ; // positive before touchdown
  const loc = (fm.pos.x - ap.tdx) * -dirZ;
  const cgH = -Math.min(...fm.spec.gear.map((g) => g.p[1])) + (ap.carrier ? 1.2 : 0.3); // wheels, not the CG, ride the glide path
  const pathAlt = ap.elev + cgH + Math.max(dist, 0) * Math.tan(ap.gs * DEG);
  return { dist, loc, gs: fm.pos.y - pathAlt, pathAlt };
}

export class Assist {
  ap: APState = { on: false, alt: false, hdg: false, spd: false, app: false, altT: 1000, hdgT: 0, spdT: 100 };
  private nI = 0; private pI = 0; private spdI = 0;
  private rotateHold = false;
  private appTarget: ApproachTarget | null = null;
  private thrCmd = 0.5;
  trim = 0;
  gcasActive = false;
  levelT = 0; // seconds of automatic wings-level + pitch-level
  pitchHold = false; private holdVs = 0;
  setPitchHold(on: boolean, fm: FlightModel) { this.pitchHold = on; this.holdVs = fm.vs; }
  level: AssistLevel = 'beginner';
  autoRudder = true;
  groundAssist = true;

  engageAP(fm: FlightModel) {
    const at = fm.attitude();
    this.ap = { on: true, alt: true, hdg: true, spd: true, app: false, altT: Math.round(fm.pos.y / 30) * 30, hdgT: Math.round(at.hdg / DEG), spdT: Math.max(fm.spec.vRef * 1.4, Math.round(fm.ias)) };
    this.thrCmd = fm.thr; this.spdI = fm.thr;
  }
  engageApproach(fm: FlightModel) {
    this.appTarget = nearestApproach(fm.pos);
    this.ap.on = true; this.ap.app = true; this.ap.alt = false; this.ap.hdg = false; this.ap.spd = true;
    this.ap.spdT = fm.spec.vRef;
    this.thrCmd = fm.thr; this.spdI = fm.thr;
  }
  disengage() { this.ap.on = false; this.ap.app = false; }

  update(dt: number, fm: FlightModel, stick: Stick, throttleIn: number, steerIn: number): AssistOut {
    const s = fm.spec;
    const at = fm.attitude();
    const V = Math.max(fm.tas, 1);
    const p = -fm.omega.z, q = fm.omega.x, r = -fm.omega.y;
    let throttle: number | null = null, brake: number | null = null;
    let steer = steerIn;
    let protect = '';
    const ground = fm.onGround;

    // ---------- Autopilot overrides stick ----------
    let nCmd: number | null = null, phiCmd: number | null = null;
    if (this.ap.on && (Math.abs(stick.pitch) > 0.35 || Math.abs(stick.roll) > 0.35)) this.disengage();
    if (this.ap.on && !ground) {
      if (this.ap.app && this.appTarget) {
        const dev = ilsDeviation(fm, this.appTarget);
        const rwHdg = this.appTarget.hdg * DEG;
        const intercept = clamp(-dev.loc * 0.004, -0.5, 0.5);
        const trk = Math.atan2(fm.vel.x, -fm.vel.z);
        const hErr = wrapAngle(rwHdg + intercept - trk);
        phiCmd = clamp(hErr * 2.2, -25 * DEG, 25 * DEG);
        const radio = fm.pos.y - Math.max(terrainHeight(fm.pos.x, fm.pos.z), this.appTarget.carrier ? CARRIER.deck : 0);
        let vsT = -V * Math.tan(this.appTarget.gs * DEG) - dev.gs * 0.12;
        const flareH = clamp(-fm.vs * (s.mass > 15000 ? 5 : 3.4), 8, 32);
        if (radio < flareH && !this.appTarget.carrier) { vsT = lerp(-0.5, vsT, clamp((radio - 1.5) / (flareH - 1.5), 0, 1)); this.ap.spdT = s.vRef - 5; }
        nCmd = 1 / Math.cos(at.roll) + clamp((vsT - fm.vs) * (radio < 30 ? 0.12 : 0.06), -0.5, 0.6);
        if (radio < 6 && !this.appTarget.carrier) throttle = 0;
      } else {
        if (this.ap.hdg) {
          const hErr = wrapAngle(this.ap.hdgT * DEG - at.hdg);
          phiCmd = clamp(hErr * 1.6, -25 * DEG, 25 * DEG);
        } else phiCmd = 0;
        if (this.ap.alt) {
          const vsT = clamp((this.ap.altT - fm.pos.y) * 0.08, -12, 12);
          nCmd = 1 / Math.cos(at.roll) + clamp((vsT - fm.vs) * 0.05, -0.6, 0.8);
        }
      }
      if (this.ap.spd && throttle === null) {
        const e = this.ap.spdT - fm.ias;
        const accel = new THREE.Vector3().copy(fm.vel).normalize().dot(new THREE.Vector3(0, 0, -1).applyQuaternion(fm.quat)) * 0;
        // total-energy autothrottle: speed error + (on approach) glide-path height error
        let hErr = 0;
        if (this.ap.app && this.appTarget) hErr = clamp(-ilsDeviation(fm, this.appTarget).gs, -60, 60);
        const eTot = e + hErr * 0.15;
        this.spdI = clamp(this.spdI + eTot * dt * 0.01, 0, 1);
        this.thrCmd = clamp(this.spdI + eTot * 0.03 + accel, 0, 1);
        throttle = this.thrCmd;
      }
    } else if (this.ap.on && ground && this.ap.app) {
      // rollout
      const gs = fm.vel.length();
      brake = gs > 3 ? 0.55 : 1;
      throttle = 0;
      steer = clamp(-(fm.pos.x - (this.appTarget?.tdx ?? 0)) * 0.04 - wrapAngle(at.hdg - (this.appTarget?.hdg ?? 0) * DEG) * 2.5, -1, 1);
      if (gs < 1) this.disengage();
    }

    // ---------- one-touch level / pitch hold ----------
    if (!ground && nCmd === null && phiCmd === null) {
      if (this.levelT > 0) {
        this.levelT -= dt;
        phiCmd = 0;
        nCmd = 1 / Math.max(Math.cos(at.roll), 0.5) + clamp(-at.pitch * 1.6 - fm.vs * 0.02, -0.6, 0.9);
        protect = 'LEVEL';
      } else if (this.pitchHold && Math.abs(stick.pitch) < 0.12) {
        nCmd = 1 / Math.max(Math.cos(at.roll), 0.5) + clamp((this.holdVs - fm.vs) * 0.06, -0.5, 0.6);
        if (Math.abs(stick.roll) < 0.05 && this.level === 'beginner') phiCmd = null;
      } else if (this.pitchHold) this.holdVs = fm.vs;
    }
    // ---------- GCAS (beginner/standard) ----------
    this.gcasActive = false;
    const apr = nearestApproach(fm.pos), adv = ilsDeviation(fm, apr);
    const onApproach = adv.dist > -400 && adv.dist < 9000 && Math.abs(adv.loc) < 800;
    if (this.level !== 'realistic' && !ground && fm.gear < 0.5 && !onApproach && !this.ap.app && fm.vs < -5 && stick.pitch < 0.3) {
      const tth = fm.agl / -fm.vs;
      const look = new THREE.Vector3().copy(fm.vel).multiplyScalar(4).add(fm.pos);
      const ahead = look.y - Math.max(terrainHeight(look.x, look.z), 0);
      if (tth < 4.5 || ahead < 30) {
        this.gcasActive = true;
        phiCmd = 0;
        nCmd = Math.min(s.gMax * 0.85, 5);
        protect = 'AUTO GCAS';
      }
    }

    let de: number, da: number, dr: number;
    const gMax = s.gMax, gMin = s.gMin;
    const lvl = this.level;
    if (lvl === 'realistic' && nCmd === null && phiCmd === null) {
      // auto-trim: when the stick is neutral, trim towards the elevator that holds the current AoA
      const want = -(s.Cm0 + s.Cma * Math.sin(clamp(fm.alpha, -0.3, 0.3)) - s.Cmq * 0) / s.Cmde;
      if (Math.abs(stick.pitch) < 0.08 && !ground) this.trim += (clamp(want, -0.6, 0.6) - this.trim) * Math.min(1, dt * 0.8) - q * dt * 0.6;
      de = clamp(stick.pitch + this.trim, -1, 1); da = stick.roll; dr = stick.yaw;
      if (this.autoRudder) dr += clamp(fm.beta * 3 - r * 0.3, -0.5, 0.5) * (ground ? 0 : 1);
    } else {
      // ---- pitch: load-factor command law ----
      let n: number;
      if (nCmd !== null) n = nCmd;
      else if (lvl === 'beginner') {
        n = 1 / Math.max(Math.cos(at.roll), 0.4) * Math.cos(at.pitch) + (stick.pitch > 0 ? stick.pitch * (Math.min(gMax, 6) - 1) * 0.95 : stick.pitch * (1 - Math.max(gMin, -1)) * 0.95);
      } else {
        n = stick.pitch >= 0 ? 1 + stick.pitch * (gMax - 1) : 1 + stick.pitch * (1 - gMin);
        if (Math.abs(stick.pitch) < 0.05) n = Math.cos(at.pitch) / Math.max(Math.cos(at.roll), 0.3);
      }
      // envelope protection
      const landingCfg = fm.gear > 0.9 && fm.agl < 60 && fm.vs < -0.5 && fm.thr < 0.6;
      const aMax = s.alphaStall * (landingCfg ? 0.97 : lvl === 'beginner' ? 0.82 : 0.95);
      if (fm.alpha > aMax * 0.85) { n = Math.min(n, fm.gLoad - (fm.alpha - aMax * 0.85) * 25); protect = protect || 'AOA LIMIT'; }
      if (lvl === 'beginner') {
        if (at.pitch > 30 * DEG && n > 1) n = Math.min(n, 1 + (35 * DEG - at.pitch) * 5);
        if (at.pitch < -30 * DEG && n < 1) n = Math.max(n, 1 - (at.pitch + 35 * DEG) * 5);
        const clMax = s.CL0 + s.CLa * s.alphaStall;
        const vsEff = s.vStall * Math.sqrt(clMax / (clMax + s.flapCL * fm.flaps));
        const landingFlare = fm.gear > 0.9 && fm.vs < -0.3 && fm.thr < 0.6 && fm.agl < 250;
        if (fm.ias < vsEff * 1.08 && !ground && fm.agl > 8 && !landingFlare) { n = Math.min(n, 0.75); if (fm.agl > 30 || fm.vs > -0.3) throttle = 1; protect = protect || 'STALL PROT'; }
      }
      n = clamp(n, gMin, gMax);
      const qCmd = ((n - Math.cos(at.pitch) * Math.cos(at.roll)) * G0) / V;
      const eN = n - fm.gLoad;
      this.nI = clamp(this.nI + eN * dt * 0.4, -0.4, 0.4);
      const kq = s.engine.type === 'jet' ? 1.4 : 2.2;
      de = clamp(eN * 0.18 + this.nI + (qCmd - q) * kq * Math.min(1, 60 / V) + qCmd * 0.6, -1, 1);
      if (ground) de = stick.pitch;

      // ---- roll ----
      const pMax = s.id === 'vortex' ? 6 : s.engine.type === 'jet' && s.mass < 25000 ? 4.4 : s.mass > 25000 ? 0.45 : 1.3;
      if (phiCmd !== null || lvl === 'beginner') {
        const maxBank = s.mass > 25000 ? 33 * DEG : 67 * DEG;
        const target = phiCmd ?? stick.roll * maxBank;
        const err = wrapAngle(target - at.roll);
        const pCmd = clamp(-err * 2.2, -pMax, pMax) * -1;
        this.pI = 0;
        da = clamp((pCmd - p) * (s.mass > 25000 ? 2.5 : 0.8) * Math.min(1, 80 / V) + pCmd / pMax * 0.4, -1, 1);
        if (Math.abs(at.pitch) > 70 * DEG) da = stick.roll;
      } else {
        const pCmd = stick.roll * pMax;
        this.pI = clamp(this.pI + (pCmd - p) * dt * 0.2, -0.3, 0.3);
        da = clamp((pCmd - p) * 0.35 * Math.min(1, 120 / V) + pCmd / pMax * 0.55 + this.pI, -1, 1);
      }
      // ---- yaw: coordination + damper ----
      dr = stick.yaw;
      if (this.autoRudder && !ground) dr += clamp(fm.beta * 4 - r * 0.6, -0.6, 0.6);
    }

    // ---------- Ground handling assists ----------
    if (ground) {
      const rwy = runwayAt(fm.pos.x, fm.pos.z);
      steer = clamp(steerIn + (this.level === 'beginner' ? stick.roll : 0) + stick.yaw, -1, 1);
      dr = clamp(stick.yaw + (this.level === 'beginner' ? stick.roll * 0.6 : 0), -1, 1);
      if (this.groundAssist && rwy && fm.tas > 6 && Math.abs(stick.yaw) < 0.2 && Math.abs(steerIn) < 0.2) {
        // keep straight on the runway: align with runway heading + drift back to centreline
        const rwHdg = Math.cos(at.hdg) > 0 ? 0 : Math.PI;
        const dirZ = Math.cos(at.hdg) > 0 ? -1 : 1;
        const hErr = wrapAngle(at.hdg - rwHdg);
        const xErr = rwy.across * -dirZ;
        const corr = clamp(-hErr * 4 - xErr * 0.05 - r * 1.5, -0.8, 0.8);
        if (this.level === 'beginner' || Math.abs(stick.roll) < 0.2) { steer = clamp(steer + corr, -1, 1); dr = clamp(dr + corr * 0.8, -1, 1); }
      }
      // takeoff rotation assist
      if (this.level !== 'realistic' && fm.ias > s.vR * 0.97 && stick.pitch > 0.15) this.rotateHold = true;
      if (fm.ias < s.vR * 0.8) this.rotateHold = false;
      if (this.rotateHold) {
        const tgt = Math.min((s.engine.type === 'jet' ? 11 : 9) * DEG, fm.tailStrike - 2.5 * DEG);
        de = clamp((tgt - at.pitch) * 3 - q * 1.5 + 0.15, -1, 1);
      }
      da = clamp(stick.roll * (this.level === 'beginner' ? 0.3 : 1) - at.roll * 2, -1, 1);
    } else this.rotateHold = false;

    return { cmd: { de, da, dr }, throttle, brake, steer, gcas: this.gcasActive, protect };
  }
}

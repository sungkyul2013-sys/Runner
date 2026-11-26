import type { FlightModel } from '../aircraft/FlightModel';
import { nearestApproach, ilsDeviation, ApproachTarget } from '../aircraft/Assist';
import { runwayAt, onCarrierDeck, CARRIER } from '../world/WorldDef';
import { DEG, RAD, MS_TO_KT, clamp, wrapAngle } from '../core/math';

export interface LandingReport {
  score: number; grade: string; title: string;
  fpm: number; g: number; centerline: number; tdDist: number; speedDev: number; bank: number; crab: number; pitch: number;
  stability: number; bounced: boolean; onRunway: boolean; carrier: boolean; wire: number; stopped: boolean;
  items: { label: string; value: string; pts: number; max: number }[];
}

export class LandingEval {
  private samples: { gs: number; loc: number; spd: number }[] = [];
  private target: ApproachTarget | null = null;
  touchdown: { fpm: number; g: number; centerline: number; tdDist: number; speed: number; bank: number; crab: number; pitch: number; onRunway: boolean; carrier: boolean; t: number } | null = null;
  private peakG = 1;
  private airAfter = 0;
  bounced = false;
  wire = 0;
  report: LandingReport | null = null;
  private time = 0;

  reset() { this.samples = []; this.target = null; this.touchdown = null; this.peakG = 1; this.bounced = false; this.wire = 0; this.report = null; this.airAfter = 0; }

  onWire(fm: FlightModel, wiresZ: number[]) {
    let best = 0, bd = Infinity;
    wiresZ.forEach((z, i) => { const d = Math.abs(fm.pos.z - z); if (d < bd) { bd = d; best = 4 - i; } });
    this.wire = best;
  }

  update(dt: number, fm: FlightModel) {
    this.time += dt;
    if (!fm.onGround) {
      const ap = nearestApproach(fm.pos);
      const dev = ilsDeviation(fm, ap);
      if (dev.dist > 0 && dev.dist < 7000 && fm.agl < 700 && fm.vs < 1) {
        this.target = ap;
        const angDev = Math.atan2(dev.gs, Math.max(dev.dist, 50)) * RAD;
        this.samples.push({ gs: angDev, loc: dev.loc, spd: fm.ias - fm.spec.vRef });
        if (this.samples.length > 4000) this.samples.shift();
      }
      if (this.touchdown && fm.agl > 1.5 && this.time - this.touchdown.t < 4) this.bounced = true;
    }
    if (this.touchdown && this.time - this.touchdown.t < 0.6) this.peakG = Math.max(this.peakG, fm.gLoad);
  }

  /** Called by FlightModel.onTouchdown for the first main-gear contact. */
  touch(fm: FlightModel, vn: number) {
    if (this.touchdown) return;
    const at = fm.attitude();
    const trk = Math.atan2(fm.vel.x, -fm.vel.z);
    const rw = runwayAt(fm.pos.x, fm.pos.z);
    const carrier = onCarrierDeck(fm.pos.x, fm.pos.z);
    let tdDist = 0, centerline = 0;
    if (rw) {
      const dirZ = Math.cos(at.hdg) > 0 ? -1 : 1;
      const thrZ = rw.rw.cz - dirZ * (rw.rw.length / 2);
      tdDist = (fm.pos.z - thrZ) * dirZ;
      centerline = Math.abs(rw.across);
    } else if (carrier) {
      tdDist = CARRIER.cz + CARRIER.length / 2 - fm.pos.z;
      centerline = Math.abs(fm.pos.x - CARRIER.cx);
    }
    this.touchdown = {
      fpm: -vn * 196.85, g: fm.gLoad, centerline, tdDist, speed: fm.ias, bank: Math.abs(at.roll) * RAD, crab: Math.abs(wrapAngle(at.hdg - trk)) * RAD, pitch: at.pitch * RAD,
      onRunway: !!rw, carrier, t: this.time,
    };
    this.peakG = fm.gLoad;
  }

  finalize(fm: FlightModel): LandingReport | null {
    const td = this.touchdown;
    if (!td) return null;
    const items: LandingReport['items'] = [];
    const add = (label: string, value: string, pts: number, max: number) => { items.push({ label, value, pts: Math.round(clamp(pts, 0, max)), max }); return clamp(pts, 0, max); };
    let score = 0;
    const fpm = td.fpm;
    const vsPts = fpm < 40 ? 24 : fpm <= 200 ? 30 : fpm <= 400 ? 30 - ((fpm - 200) / 200) * 15 : fpm <= 700 ? 15 - ((fpm - 400) / 300) * 15 : 0;
    score += add('접지 강하율', `${Math.round(fpm)} fpm`, td.carrier ? Math.min(30, vsPts + 12) : vsPts, 30);
    const g = Math.max(td.g, this.peakG);
    score += add('접지 G', `${g.toFixed(2)} G`, g < 1.25 ? 10 : g < 1.6 ? 10 - (g - 1.25) * 20 : 0, 10);
    score += add('중심선 편차', `${td.centerline.toFixed(1)} m`, td.onRunway || td.carrier ? 15 - td.centerline * 1.2 : 0, 15);
    if (td.carrier) score += add('어레스팅 와이어', this.wire ? `#${this.wire}` : '실패 (볼터)', this.wire === 3 ? 15 : this.wire === 2 || this.wire === 4 ? 11 : this.wire === 1 ? 6 : 0, 15);
    else {
      const tz = td.tdDist;
      score += add('접지 지점', `${Math.round(tz)} m`, tz >= 150 && tz <= 650 ? 15 : tz > 0 && tz < 150 ? 8 : tz > 650 && tz < 1000 ? 15 - (tz - 650) / 30 : 0, 15);
    }
    const sd = (td.speed - fm.spec.vRef) * MS_TO_KT;
    score += add('접지 속도', `${sd >= 0 ? '+' : ''}${sd.toFixed(0)} kt (Vref)`, 10 - Math.max(0, Math.abs(sd) - 5) * 0.8, 10);
    score += add('뱅크 / 크랩', `${td.bank.toFixed(1)}° / ${td.crab.toFixed(1)}°`, 10 - Math.max(0, td.bank - 2) * 1.5 - Math.max(0, td.crab - 3) * 1.2, 10);
    let stab = 10;
    if (this.samples.length > 30) {
      const n = this.samples.length;
      const gsRms = Math.sqrt(this.samples.reduce((a, s) => a + s.gs * s.gs, 0) / n);
      const spdRms = Math.sqrt(this.samples.reduce((a, s) => a + s.spd * s.spd, 0) / n);
      stab = 10 - gsRms * 6 - Math.max(0, spdRms - 3) * 0.6;
      score += add('접근 안정성', `GS ±${gsRms.toFixed(2)}°`, stab, 10);
    } else score += add('접근 안정성', '데이터 없음', 5, 10);
    if (this.bounced) score -= 15;
    if (!td.onRunway && !td.carrier) score *= 0.4;
    score = Math.round(clamp(score, 0, 100));
    const grade = score >= 95 ? 'S' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
    const title = !td.onRunway && !td.carrier ? '활주로 이탈 착륙' : this.bounced ? '바운스 착륙' : fpm < 110 ? '버터 랜딩!' : fpm < 260 ? '부드러운 착륙' : fpm < 500 ? '확실한 착륙' : '하드 랜딩';
    this.report = {
      score, grade, title, fpm, g, centerline: td.centerline, tdDist: td.tdDist, speedDev: sd, bank: td.bank, crab: td.crab, pitch: td.pitch,
      stability: stab, bounced: this.bounced, onRunway: td.onRunway, carrier: td.carrier, wire: this.wire, stopped: fm.vel.length() < 3, items,
    };
    void DEG;
    return this.report;
  }
}

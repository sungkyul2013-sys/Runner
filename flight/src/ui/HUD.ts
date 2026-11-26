import * as THREE from 'three';
import { settings } from '../core/Save';
import { clamp, RAD, MS_TO_KT, M_TO_FT, DEG } from '../core/math';

export interface HudTarget { pos: THREE.Vector3; kind: 'air' | 'ground' | 'building' | 'ring' | 'wp' | 'friend'; label: string; locked?: boolean; locking?: number; dist: number }
export interface HudData {
  cockpit: boolean; ias: number; tas: number; alt: number; agl: number; vs: number; hdg: number; pitch: number; roll: number; g: number; mach: number; aoa: number;
  thr: number; ab: number; fuel: number; fuelMax: number; gear: number; flaps: number; brake: boolean; airbrake: number; hook: number; retract: boolean;
  fpm: THREE.Vector3 | null; vel: THREE.Vector3; pos: THREE.Vector3; fwd: THREE.Vector3;
  warnings: string[]; cautions: string[]; protect: string;
  ap: { on: boolean; alt: boolean; hdg: boolean; spd: boolean; app: boolean; altT: number; hdgT: number; spdT: number };
  ils: { dist: number; loc: number; gs: number; carrier: boolean; pathAlt: number; tdx: number; tdz: number; elev: number; hdgDeg: number; gsDeg: number } | null;
  targets: HudTarget[]; objective: string; timer: number | null; score: string;
  gun: number; missiles: number; flares: number; hasWeapons: boolean; lockState: number; leadPip: THREE.Vector3 | null;
  hp: Record<string, number>; mode: string; units: string; vref: number; vstall: number; wind: THREE.Vector3; paused: boolean; camName: string;
}

const COLORS = { green: '#5dff8a', cyan: '#62e6ff', amber: '#ffc35c' };

export class HUD {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private dpr = 1;
  private t = 0;
  visible = true;
  private w = 0; private h = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:4';
    document.body.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d')!;
    addEventListener('resize', () => this.resize());
    this.resize();
  }
  resize() {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = innerWidth; this.h = innerHeight;
    this.canvas.width = this.w * this.dpr; this.canvas.height = this.h * this.dpr;
  }
  clear() { this.g.setTransform(1, 0, 0, 1, 0, 0); this.g.clearRect(0, 0, this.canvas.width, this.canvas.height); }

  private project(p: THREE.Vector3, cam: THREE.Camera): { x: number; y: number; behind: boolean } {
    const v = p.clone().project(cam);
    const behind = v.z > 1;
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h, behind };
  }

  draw(d: HudData, cam: THREE.PerspectiveCamera, dt: number) {
    this.t += dt;
    this.clear();
    if (!this.visible) return;
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;
    const col = COLORS[settings.hudColor];
    const aviation = settings.units === 'aviation';
    const spdU = aviation ? d.ias * MS_TO_KT : d.ias * 3.6;
    const altU = aviation ? d.alt * M_TO_FT : d.alt;
    const vsU = aviation ? d.vs * 196.85 : d.vs;
    const small = Math.min(W, H) < 500;
    const S = small ? 0.8 : 1;
    g.lineWidth = 1.6 * S;
    g.strokeStyle = col; g.fillStyle = col;
    g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 4;
    g.font = `600 ${13 * S}px Rajdhani, 'Noto Sans KR', sans-serif`;
    g.textBaseline = 'middle';
    const cx = W / 2, cy = H * 0.46;

    // ---------- pitch ladder (cockpit) ----------
    if (d.cockpit) {
      const pxPerDeg = (H / cam.fov) * 1;
      g.save();
      g.beginPath(); g.rect(cx - W * 0.22, cy - H * 0.3, W * 0.44, H * 0.6); g.clip();
      g.translate(cx, cy);
      g.rotate(-d.roll);
      for (let a = -90; a <= 90; a += 5) {
        const y = (d.pitch * RAD - a) * pxPerDeg;
        if (Math.abs(y) > H * 0.45) continue;
        const wl = a === 0 ? W * 0.18 : 46 * S;
        g.setLineDash(a < 0 ? [6, 5] : []);
        g.beginPath();
        g.moveTo(-wl, y); g.lineTo(-18 * S, y); g.moveTo(18 * S, y); g.lineTo(wl, y);
        if (a !== 0) { g.moveTo(-wl, y); g.lineTo(-wl, y + (a > 0 ? 7 : -7)); g.moveTo(wl, y); g.lineTo(wl, y + (a > 0 ? 7 : -7)); }
        g.stroke();
        g.setLineDash([]);
        if (a !== 0) { g.textAlign = 'right'; g.fillText(String(Math.abs(a)), -wl - 5, y); g.textAlign = 'left'; g.fillText(String(Math.abs(a)), wl + 5, y); }
      }
      g.restore();
      // waterline
      g.beginPath(); g.moveTo(cx - 26, cy); g.lineTo(cx - 12, cy); g.lineTo(cx - 6, cy + 8); g.lineTo(cx, cy); g.lineTo(cx + 6, cy + 8); g.lineTo(cx + 12, cy); g.lineTo(cx + 26, cy); g.stroke();
      // bank scale
      g.beginPath(); g.arc(cx, cy, H * 0.3, Math.PI * 0.3 + Math.PI / 2 - Math.PI * 0.6, Math.PI / 2 + Math.PI * 0.3 - 0.0); g.stroke();
      for (const b of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
        const a = Math.PI / 2 + b * DEG, r0 = H * 0.3, r1 = r0 + (b % 30 === 0 ? 12 : 7);
        g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
      }
      const ba = Math.PI / 2 - d.roll;
      g.beginPath(); const br = H * 0.3 - 3;
      g.moveTo(cx + Math.cos(ba) * br, cy + Math.sin(ba) * br);
      g.lineTo(cx + Math.cos(ba - 0.04) * (br - 12), cy + Math.sin(ba - 0.04) * (br - 12));
      g.lineTo(cx + Math.cos(ba + 0.04) * (br - 12), cy + Math.sin(ba + 0.04) * (br - 12)); g.closePath(); g.fill();
    }
    // ---------- flight path marker ----------
    if (d.tas > 5) {
      const fp = this.project(d.pos.clone().addScaledVector(d.vel, 200), cam);
      if (!fp.behind && fp.x > 0 && fp.x < W && fp.y > 0 && fp.y < H) {
        g.beginPath(); g.arc(fp.x, fp.y, 7 * S, 0, Math.PI * 2);
        g.moveTo(fp.x - 7 * S, fp.y); g.lineTo(fp.x - 18 * S, fp.y); g.moveTo(fp.x + 7 * S, fp.y); g.lineTo(fp.x + 18 * S, fp.y); g.moveTo(fp.x, fp.y - 7 * S); g.lineTo(fp.x, fp.y - 14 * S);
        g.stroke();
      }
    }
    // gun cross + lead pip
    if (d.hasWeapons && d.cockpit) {
      g.beginPath(); g.moveTo(cx - 8, cy - 30); g.lineTo(cx + 8, cy - 30); g.moveTo(cx, cy - 38); g.lineTo(cx, cy - 22); g.stroke();
    }
    if (d.leadPip) {
      const lp = this.project(d.leadPip, cam);
      if (!lp.behind) { g.beginPath(); g.arc(lp.x, lp.y, 14 * S, 0, Math.PI * 2); g.moveTo(lp.x + 2, lp.y); g.arc(lp.x, lp.y, 2, 0, Math.PI * 2); g.stroke(); }
    }

    // ---------- speed & altitude tapes ----------
    const tapeH = Math.min(H * 0.42, 300 * S), tx = Math.max(70, W * 0.2), ax = W - Math.max(70, W * 0.2);
    this.tape(spdU, tx, cy, tapeH, 10, aviation ? 'KT' : 'KM/H', 'left', col, aviation ? d.vref * MS_TO_KT : d.vref * 3.6, aviation ? d.vstall * MS_TO_KT : d.vstall * 3.6);
    this.tape(altU, ax, cy, tapeH, aviation ? 100 : 50, aviation ? 'FT' : 'M', 'right', col);
    g.textAlign = 'left';
    g.font = `600 ${12 * S}px Rajdhani, sans-serif`;
    const lx = tx - 56 * S, ly = cy + tapeH / 2 + 18;
    g.fillText(`G ${d.g.toFixed(1)}`, lx, ly);
    g.fillText(`M ${d.mach.toFixed(2)}`, lx, ly + 15 * S);
    g.fillText(`α ${(d.aoa * RAD).toFixed(1)}°`, lx, ly + 30 * S);
    g.textAlign = 'right';
    g.fillText(`VS ${vsU >= 0 ? '+' : ''}${Math.round(vsU)}`, ax + 56 * S, ly);
    g.fillText(`R ${Math.round(aviation ? d.agl * M_TO_FT : d.agl)}`, ax + 56 * S, ly + 15 * S);
    const wkt = d.wind.length() * (aviation ? MS_TO_KT : 3.6);
    if (wkt > 1) {
      const wfrom = (Math.atan2(-d.wind.x, d.wind.z) * RAD + 360) % 360;
      g.fillText(`W ${String(Math.round(wfrom)).padStart(3, '0')}°/${Math.round(wkt)}`, ax + 56 * S, ly + 30 * S);
    }

    // ---------- heading tape ----------
    {
      const hy = 46 * S + (small ? 30 : 34), hw = Math.min(W * 0.4, 380);
      g.save(); g.beginPath(); g.rect(cx - hw / 2, hy - 20, hw, 40); g.clip();
      const hdg = d.hdg * RAD;
      for (let a = Math.floor(hdg / 5) * 5 - 40; a <= hdg + 40; a += 5) {
        const x = cx + (a - hdg) * (hw / 80);
        const big = a % 10 === 0;
        g.beginPath(); g.moveTo(x, hy + 10); g.lineTo(x, hy + (big ? 2 : 6)); g.stroke();
        if (a % 30 === 0) {
          const v = ((a % 360) + 360) % 360;
          const lab = v === 0 ? 'N' : v === 90 ? 'E' : v === 180 ? 'S' : v === 270 ? 'W' : String(v / 10).padStart(2, '0');
          g.textAlign = 'center'; g.fillText(lab, x, hy - 8);
        }
      }
      g.restore();
      g.beginPath(); g.moveTo(cx, hy + 12); g.lineTo(cx - 5, hy + 20); g.lineTo(cx + 5, hy + 20); g.closePath(); g.fill();
      g.textAlign = 'center';
      g.strokeRect(cx - 22, hy - 34, 44, 18);
      g.fillText(String(Math.round(((hdg % 360) + 360) % 360)).padStart(3, '0'), cx, hy - 25);
      if (d.ap.on && d.ap.hdg && !d.ap.app) {
        const x = cx + clamp(((d.ap.hdgT - hdg + 540) % 360) - 180, -40, 40) * (hw / 80);
        g.fillStyle = '#ff6af0'; g.fillRect(x - 4, hy + 11, 8, 5); g.fillStyle = col;
      }
    }

    // ---------- attitude indicator (external views) ----------
    if (!d.cockpit) {
      const r = 34 * S, ix = cx, iy = H - (small ? 64 : 80) - 8;
      g.save();
      g.beginPath(); g.arc(ix, iy, r, 0, Math.PI * 2); g.clip();
      g.translate(ix, iy); g.rotate(-d.roll);
      const off = clamp(d.pitch * RAD, -60, 60) * (r / 40);
      g.fillStyle = 'rgba(40,110,190,0.55)'; g.fillRect(-r * 2, -r * 2 + off, r * 4, r * 2);
      g.fillStyle = 'rgba(120,80,40,0.55)'; g.fillRect(-r * 2, off, r * 4, r * 2);
      g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(-r * 2, off); g.lineTo(r * 2, off); g.stroke();
      g.restore();
      g.strokeStyle = col; g.beginPath(); g.arc(ix, iy, r, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = '#ffd36a'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(ix - 18 * S, iy); g.lineTo(ix - 6 * S, iy); g.lineTo(ix, iy + 5 * S); g.lineTo(ix + 6 * S, iy); g.lineTo(ix + 18 * S, iy); g.stroke();
      g.lineWidth = 1.6 * S; g.strokeStyle = col;
    }

    // ---------- systems block (bottom-left) ----------
    {
      const bx = small ? 96 : 110, by = H - (small ? 22 : 30);
      g.textAlign = 'left'; g.font = `600 ${12 * S}px Rajdhani, sans-serif`;
      const thrTxt = d.ab > 0.5 ? 'AB' : `${Math.round(d.thr * 100)}%`;
      const items: [string, string, boolean?][] = [
        ['THR', thrTxt, d.ab > 0.5],
        ['FUEL', `${Math.round((d.fuel / d.fuelMax) * 100)}%`, d.fuel / d.fuelMax < 0.15],
        ['FLAP', d.flaps > 0.01 ? `${Math.round(d.flaps * 100)}%` : 'UP'],
        ['GEAR', !d.retract ? 'FIXED' : d.gear > 0.99 ? 'DOWN' : d.gear < 0.01 ? 'UP' : 'TRANSIT', d.gear > 0.01 && d.gear < 0.99],
      ];
      if (d.brake) items.push(['BRK', 'ON', true]);
      if (d.airbrake > 0.1) items.push(['SPD BRK', 'EXT', true]);
      if (d.hook > 0.5) items.push(['HOOK', 'DOWN', true]);
      items.forEach(([k, v, hl], i) => {
        const x = bx + (i % 4) * 66 * S, y = by - Math.floor(i / 4) * 16 * S - 14 * S;
        g.fillStyle = hl ? '#ffc35c' : col;
        g.globalAlpha = 0.65; g.fillText(k, x, y - 8 * S); g.globalAlpha = 1;
        g.fillText(v, x, y + 4 * S);
      });
      g.fillStyle = col;
      if (d.hasWeapons) {
        g.textAlign = 'right';
        g.fillText(`GUN ${d.gun}   MSL ${d.missiles}   FLR ${d.flares}`, W - (small ? 96 : 110), H - (small ? 34 : 44));
      }
    }

    // ---------- ILS / landing guidance ----------
    if (d.ils && d.ils.dist > -200 && d.ils.dist < 18000 && (d.gear > 0.5 || d.ils.dist < 9000)) {
      const il = d.ils;
      const sc = 70 * S;
      const locDots = clamp(il.loc / Math.max(il.dist * Math.tan(1.25 * DEG), 18), -2.5, 2.5);
      const gsDots = clamp(il.gs / Math.max(il.dist * Math.tan(0.35 * DEG), 4), -2.5, 2.5);
      g.strokeStyle = '#ff5af0'; g.fillStyle = '#ff5af0';
      // localizer (vertical bar moves L/R), glideslope (horizontal bar moves U/D)
      g.globalAlpha = 0.9;
      const lx2 = cx - locDots * sc * 0.4, gy = cy + gsDots * sc * 0.4;
      g.beginPath(); g.moveTo(lx2, cy - sc); g.lineTo(lx2, cy + sc); g.moveTo(cx - sc, gy); g.lineTo(cx + sc, gy); g.stroke();
      g.globalAlpha = 0.5;
      for (let i = -2; i <= 2; i++) { if (!i) continue; g.beginPath(); g.arc(cx + i * sc * 0.4, cy + sc + 10, 2.5, 0, Math.PI * 2); g.arc(cx + sc + 10, cy + i * sc * 0.4, 2.5, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
      g.textAlign = 'center';
      g.fillText(`${il.carrier ? 'CVN' : 'ILS'}  ${(il.dist / 1852).toFixed(1)} NM`, cx, cy + sc + 26);
      // highway-in-the-sky boxes along the glide path
      if (settings.landingAssist && il.dist > 150) {
        const dirZ = Math.cos(il.hdgDeg * DEG) > 0 ? -1 : 1;
        for (let k = 1; k <= 6; k++) {
          const dd = il.dist - k * Math.max(220, d.tas * 3.5);
          if (dd < 0) break;
          const p = new THREE.Vector3(il.tdx, il.elev + dd * Math.tan(il.gsDeg * DEG), il.tdz - dirZ * dd);
          const sp = this.project(p, cam);
          if (sp.behind) continue;
          const dist = p.distanceTo(d.pos);
          const half = clamp((20 / dist) * (H / (2 * Math.tan((cam.fov * DEG) / 2))), 3, 160);
          g.globalAlpha = 0.75 - k * 0.09;
          g.strokeRect(sp.x - half * 1.4, sp.y - half, half * 2.8, half * 2);
        }
        g.globalAlpha = 1;
      }
      g.strokeStyle = col; g.fillStyle = col;
    }

    // ---------- targets / objectives ----------
    for (const t of d.targets) {
      const sp = this.project(t.pos, cam);
      const onScreen = !sp.behind && sp.x > 20 && sp.x < W - 20 && sp.y > 60 && sp.y < H - 40;
      const c = t.kind === 'ring' || t.kind === 'wp' ? '#62e6ff' : t.kind === 'friend' ? '#9cf' : t.kind === 'building' ? '#ff9a3c' : '#ff4d5e';
      g.strokeStyle = c; g.fillStyle = c;
      const dtxt = t.dist > 1000 ? `${(t.dist / 1000).toFixed(1)}km` : `${Math.round(t.dist)}m`;
      if (onScreen) {
        const s = t.kind === 'ring' || t.kind === 'wp' ? 12 : 16;
        if (t.kind === 'air') { g.strokeRect(sp.x - s, sp.y - s, s * 2, s * 2); }
        else if (t.kind === 'ring' || t.kind === 'wp') { g.beginPath(); g.moveTo(sp.x, sp.y - s); g.lineTo(sp.x + s, sp.y); g.lineTo(sp.x, sp.y + s); g.lineTo(sp.x - s, sp.y); g.closePath(); g.stroke(); }
        else { g.beginPath(); g.moveTo(sp.x - s, sp.y + s); g.lineTo(sp.x, sp.y - s); g.lineTo(sp.x + s, sp.y + s); g.closePath(); g.stroke(); }
        if (t.locked) { g.lineWidth = 2.5; g.beginPath(); g.arc(sp.x, sp.y, 26, 0, Math.PI * 2); g.stroke(); g.fillText('LOCK', sp.x, sp.y - 34); g.lineWidth = 1.6 * S; }
        else if (t.locking) { g.beginPath(); g.arc(sp.x, sp.y, 40 - t.locking * 14, 0, Math.PI * 2 * t.locking); g.stroke(); }
        g.textAlign = 'center'; g.font = `600 ${11 * S}px Rajdhani, 'Noto Sans KR', sans-serif`;
        g.fillText(`${t.label} ${dtxt}`, sp.x, sp.y + s + 10);
      } else {
        // edge arrow
        let dx = sp.x - cx, dy = sp.y - cy;
        if (sp.behind) { dx = -dx; dy = -dy; if (Math.abs(dx) + Math.abs(dy) < 1) dy = 1; }
        const a = Math.atan2(dy, dx);
        const ex = cx + Math.cos(a) * Math.min(W * 0.42, H * 0.42 * 1.4), ey = cy + Math.sin(a) * H * 0.38;
        g.save(); g.translate(ex, ey); g.rotate(a);
        g.beginPath(); g.moveTo(14, 0); g.lineTo(-6, -9); g.lineTo(-2, 0); g.lineTo(-6, 9); g.closePath(); g.fill();
        g.restore();
        if (t.kind === 'ring' || t.kind === 'wp') { g.textAlign = 'center'; g.fillText(dtxt, ex, ey + 18); }
      }
    }
    g.strokeStyle = col; g.fillStyle = col;

    // ---------- radar ----------
    this.radar(d, col, S);

    // ---------- objective / timer ----------
    g.textAlign = 'left'; g.font = `600 ${13 * S}px 'Noto Sans KR', sans-serif`;
    const ox = (small ? 10 : 16), oy = small ? 52 : 60;
    if (d.objective) {
      g.fillStyle = 'rgba(5,10,16,0.45)'; const tw = g.measureText(d.objective).width;
      g.fillRect(ox - 6, oy - 12, tw + 20, 24); g.fillStyle = '#e9f1f8';
      g.fillText('▸ ' + d.objective, ox, oy);
    }
    g.fillStyle = col;
    if (d.timer !== null) { g.font = `700 ${18 * S}px Rajdhani, sans-serif`; const m = Math.floor(d.timer / 60), s = (d.timer % 60).toFixed(1); g.fillText(`${m}:${s.padStart(4, '0')}`, ox, oy + 24); }
    if (d.score) { g.font = `600 ${13 * S}px 'Noto Sans KR', sans-serif`; g.fillText(d.score, ox, oy + (d.timer !== null ? 46 : 24)); }
    // autopilot annunciator
    if (d.ap.on) {
      g.font = `700 ${13 * S}px Rajdhani, sans-serif`; g.fillStyle = '#5dff8a'; g.textAlign = 'center';
      const modes = [d.ap.app ? 'APP' : '', d.ap.alt ? `ALT ${Math.round(aviation ? d.ap.altT * M_TO_FT : d.ap.altT)}` : '', d.ap.hdg ? `HDG ${Math.round(d.ap.hdgT)}` : '', d.ap.spd ? `SPD ${Math.round(aviation ? d.ap.spdT * MS_TO_KT : d.ap.spdT * 3.6)}` : ''].filter(Boolean).join('  ');
      g.fillText(`AP  ${modes}`, cx, (small ? 46 : 52) + 52 * S);
      g.fillStyle = col;
    }
    // ---------- warnings ----------
    const flash = Math.sin(this.t * 10) > -0.2;
    g.textAlign = 'center';
    d.warnings.forEach((w, i) => {
      if (!flash) return;
      g.font = `700 ${22 * S}px Rajdhani, 'Noto Sans KR', sans-serif`;
      const y = cy + H * 0.13 + i * 28 * S;
      const tw = g.measureText(w).width + 24;
      g.fillStyle = 'rgba(80,0,0,0.55)'; g.fillRect(cx - tw / 2, y - 14 * S, tw, 28 * S);
      g.strokeStyle = '#ff4d5e'; g.strokeRect(cx - tw / 2, y - 14 * S, tw, 28 * S);
      g.fillStyle = '#ff6b78'; g.fillText(w, cx, y);
    });
    d.cautions.forEach((w, i) => {
      g.font = `700 ${15 * S}px Rajdhani, 'Noto Sans KR', sans-serif`;
      g.fillStyle = '#ffc35c'; g.fillText(w, cx, cy - H * 0.17 - i * 20 * S);
    });
    if (d.protect) { g.font = `700 ${14 * S}px Rajdhani, sans-serif`; g.fillStyle = '#62e6ff'; g.fillText(d.protect, cx, cy + H * 0.09); }
    g.fillStyle = col;
    if (d.lockState === 3 && flash) { g.font = `700 ${24 * S}px Rajdhani, sans-serif`; g.fillStyle = '#ff4d5e'; g.fillText('⚠ MISSILE', cx, cy - H * 0.24); }
    // camera name (brief)
    if (d.camName) { g.font = `600 ${12 * S}px 'Noto Sans KR', sans-serif`; g.fillStyle = 'rgba(233,241,248,0.75)'; g.textAlign = 'right'; g.fillText(d.camName, W - 16, small ? 52 : 60); }
  }

  private tape(v: number, x: number, y: number, h: number, step: number, unit: string, side: 'left' | 'right', col: string, vref = 0, vstall = 0) {
    const g = this.g;
    const pxPer = h / (step * 12);
    g.save();
    g.beginPath(); g.rect(x - 40, y - h / 2, 80, h); g.clip();
    const s = side === 'left' ? -1 : 1;
    for (let k = Math.floor((v - step * 7) / step) * step; k <= v + step * 7; k += step) {
      const yy = y - (k - v) * pxPer;
      const big = k % (step * 5) === 0;
      g.beginPath(); g.moveTo(x, yy); g.lineTo(x + s * (big ? 12 : 6), yy); g.stroke();
      if (big) { g.textAlign = side === 'left' ? 'right' : 'left'; g.fillText(String(k), x - s * 4 + (side === 'left' ? -2 : 2), yy); }
    }
    if (vstall > 0) {
      const ys = y - (vstall - v) * pxPer;
      g.fillStyle = 'rgba(255,77,94,0.55)'; g.fillRect(x, ys, s * 4, h);
      const yr = y - (vref - v) * pxPer;
      g.fillStyle = '#5dff8a'; g.fillRect(x + s * 2, yr - 1, s * 12, 3);
      g.fillStyle = col;
    }
    g.restore();
    g.beginPath(); g.moveTo(x, y - h / 2); g.lineTo(x, y + h / 2); g.stroke();
    // readout box
    const bw = 62, bh = 24;
    const bx = side === 'left' ? x - bw - 8 : x + 8;
    g.fillStyle = 'rgba(0,10,6,0.55)'; g.fillRect(bx, y - bh / 2, bw, bh); g.fillStyle = col;
    g.strokeRect(bx, y - bh / 2, bw, bh);
    g.font = `700 16px Rajdhani, sans-serif`; g.textAlign = 'center';
    g.fillText(String(Math.round(v)), bx + bw / 2, y + 1);
    g.font = `600 11px Rajdhani, sans-serif`;
    g.fillText(unit, bx + bw / 2, y - bh / 2 - 9);
    g.font = `600 13px Rajdhani, sans-serif`;
  }

  private radar(d: HudData, col: string, S: number) {
    const g = this.g;
    const R = 58 * S;
    const x = this.w - R - (this.w < 700 ? 12 : 22), y = this.h * 0.5 + (this.w < 700 ? 0 : 0) - R * 2.4;
    const rx = x, ry = Math.max(R + 70, y);
    g.save();
    g.fillStyle = 'rgba(2,12,8,0.45)'; g.beginPath(); g.arc(rx, ry, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = col; g.globalAlpha = 0.5;
    g.beginPath(); g.arc(rx, ry, R, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(rx, ry, R / 2, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
    const range = 12000;
    const hdg = d.hdg;
    const map = (p: THREE.Vector3) => {
      const dx = p.x - d.pos.x, dz = p.z - d.pos.z;
      const rxx = dx * Math.cos(hdg) + dz * Math.sin(hdg);
      const rzz = -dx * Math.sin(hdg) + dz * Math.cos(hdg);
      return [rxx / range * R, rzz / range * R] as const;
    };
    g.beginPath(); g.arc(rx, ry, R, 0, Math.PI * 2); g.clip();
    // runways
    g.strokeStyle = 'rgba(220,230,240,0.8)'; g.lineWidth = 2;
    for (const rw of [[0, 1500, 0, -1500], [-1800, -7820, -1800, -8580]]) {
      const a = map(new THREE.Vector3(rw[0], 0, rw[1])), b = map(new THREE.Vector3(rw[2], 0, rw[3]));
      g.beginPath(); g.moveTo(rx + a[0], ry + a[1]); g.lineTo(rx + b[0], ry + b[1]); g.stroke();
    }
    g.lineWidth = 1.5;
    for (const t of d.targets) {
      const [px, py] = map(t.pos);
      g.fillStyle = t.kind === 'ring' || t.kind === 'wp' ? '#62e6ff' : t.kind === 'friend' ? '#9cf' : '#ff4d5e';
      if (Math.hypot(px, py) > R) continue;
      g.fillRect(rx + px - 2.5, ry + py - 2.5, 5, 5);
    }
    g.restore();
    g.fillStyle = col;
    g.beginPath(); g.moveTo(rx, ry - 6); g.lineTo(rx - 4, ry + 4); g.lineTo(rx + 4, ry + 4); g.closePath(); g.fill();
    g.font = `600 ${10 * S}px Rajdhani, sans-serif`; g.textAlign = 'center';
    g.fillText('12 km', rx, ry + R + 10);
  }
}

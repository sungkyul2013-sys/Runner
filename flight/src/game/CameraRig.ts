import * as THREE from 'three';
import type { Aircraft } from '../aircraft/Aircraft';
import { clamp, damp, vnoise, smoothstep } from '../core/math';
import { terrainHeight, AIRPORT, CARRIER, RUNWAYS } from '../world/WorldDef';

export type CamMode = 'chase' | 'close' | 'cockpit' | 'orbit' | 'flyby' | 'tower' | 'padlock' | 'cinematic';
export const CAM_MODES: CamMode[] = ['chase', 'cockpit', 'close', 'orbit', 'flyby', 'tower', 'padlock', 'cinematic'];
export const CAM_NAMES: Record<CamMode, string> = { chase: '추적 시점', close: '근접 추적', cockpit: '조종석', orbit: '자유 궤도', flyby: '플라이바이', tower: '관제탑', padlock: '목표 고정', cinematic: '시네마틱' };

function gaugeTexture(style: string) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#1a1d22'); grd.addColorStop(1, '#0d0f12');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 256);
  const gauge = (x: number, y: number, r: number, label: string) => {
    g.fillStyle = '#050608'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#555c66'; g.lineWidth = 4; g.stroke();
    g.strokeStyle = '#e8e8e8'; g.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8); g.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); g.stroke(); }
    g.fillStyle = '#9aa'; g.font = `${r * 0.25}px Arial`; g.textAlign = 'center'; g.fillText(label, x, y + r * 0.5);
  };
  if (style === 'glass') {
    for (const x of [160, 400, 624, 864]) { g.fillStyle = '#04070a'; g.fillRect(x - 100, 30, 200, 190); g.strokeStyle = '#333a44'; g.lineWidth = 6; g.strokeRect(x - 100, 30, 200, 190); }
    g.fillStyle = '#1b4b8a'; g.fillRect(310, 40, 180, 85); g.fillStyle = '#6b4a2a'; g.fillRect(310, 125, 180, 85);
    g.fillStyle = '#0a2a14'; g.fillRect(534, 40, 180, 170);
  } else {
    const xs = [110, 250, 390, 634, 774, 914];
    const ls = ['ASI', 'ATT', 'ALT', 'TC', 'HDG', 'VSI'];
    xs.forEach((x, i) => gauge(x, 128, 62, ls[i]));
    g.fillStyle = '#0a0c10'; g.fillRect(470, 40, 84, 176);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class CameraRig {
  mode: CamMode = 'chase';
  readonly cockpit = new THREE.Group();
  private qs = new THREE.Quaternion();
  private pos = new THREE.Vector3();
  private look = { yaw: 0, pitch: 0, zoom: 1 };
  private shakeAmt = 0;
  private flyby = new THREE.Vector3();
  private cineT = 0; private cineShot = 0;
  private t = 0;
  private fov = 62;
  private headG = 0;
  private lastAc: Aircraft | null = null;
  target: THREE.Vector3 | null = null;
  inCockpit = false;

  constructor(private cam: THREE.PerspectiveCamera) {}

  buildCockpit(ac: Aircraft) {
    this.cockpit.clear();
    const s = ac.spec;
    const eye = new THREE.Vector3(...s.eye);
    const big = s.mass > 20000;
    const mat = new THREE.MeshStandardMaterial({ color: 0x1d2126, roughness: 0.75, metalness: 0.3 });
    const panelMat = new THREE.MeshStandardMaterial({ map: gaugeTexture(big || s.engine.type === 'jet' ? 'glass' : 'steam'), roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.04 });
    const w = big ? 1.6 : s.engine.type === 'jet' ? 0.62 : 0.95;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, w * 0.25, 0.08), [mat, mat, mat, mat, panelMat, mat]);
    panel.position.set(0, eye.y - (s.engine.type === 'jet' && !big ? 0.5 : 0.42), eye.z - 0.75);
    panel.position.x = big ? eye.x + 0.55 : eye.x * 0;
    panel.rotation.x = -0.25;
    const glare = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.05, 0.35), mat);
    glare.position.set(panel.position.x, panel.position.y + w * 0.14, panel.position.z - 0.1);
    this.cockpit.add(panel, glare);
    // canopy / windshield frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6, metalness: 0.5 });
    if (s.engine.type === 'jet' && !big) {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.014, 6, 30, Math.PI), frameMat);
      bow.position.set(0, eye.y - 0.3, eye.z - 1.05); bow.rotation.x = -0.95;
      const hudGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.2), new THREE.MeshBasicMaterial({ color: 0x88ffaa, transparent: true, opacity: 0.06, depthWrite: false }));
      hudGlass.position.set(0, eye.y - 0.08, eye.z - 0.62); hudGlass.rotation.x = -0.35;
      const hudFrame = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.12), frameMat); hudFrame.position.set(0, eye.y - 0.19, eye.z - 0.6);
      this.cockpit.add(bow, hudGlass, hudFrame);
    } else {
      const pillarH = big ? 0.9 : 0.75;
      for (const sx of big ? [-0.75, 0.2, 1.2] : [-0.55, 0.55]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, pillarH, 0.05), frameMat);
        p.position.set(eye.x + sx + (big ? 0.3 : 0.3), eye.y - 0.05, eye.z - 0.85); p.rotation.x = -0.45; p.rotation.z = sx * 0.2;
        this.cockpit.add(p);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(big ? 2.4 : 1.4, 0.06, 0.4), frameMat);
      top.position.set(eye.x + 0.3, eye.y + 0.32, eye.z - 0.55);
      this.cockpit.add(top);
      if (!big) {
        const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 6, 20, Math.PI), frameMat);
        yoke.position.set(eye.x, eye.y - 0.42, eye.z - 0.45); yoke.rotation.z = Math.PI; yoke.name = 'yoke';
        this.cockpit.add(yoke);
      }
    }
    this.cockpit.traverse((o) => { o.renderOrder = 20; });
  }

  shake(a: number) { this.shakeAmt = Math.min(2.5, this.shakeAmt + a); }
  setMode(m: CamMode) { this.mode = m; this.look.yaw = 0; this.look.pitch = 0; this.cineT = 99; this.flyby.set(0, -1e6, 0); }
  next(dir = 1) { const i = CAM_MODES.indexOf(this.mode); this.setMode(CAM_MODES[(i + dir + CAM_MODES.length) % CAM_MODES.length]); }

  update(dt: number, ac: Aircraft, lookDX: number, lookDY: number, zoom: number, looking: boolean) {
    this.t += dt;
    const fm = ac.fm;
    if (this.lastAc !== ac) { this.qs.copy(fm.quat); this.lastAc = ac; this.pos.copy(fm.pos).add(new THREE.Vector3(0, 5, 30).applyQuaternion(fm.quat)); }
    this.look.yaw -= lookDX; this.look.pitch -= lookDY;
    this.look.pitch = clamp(this.look.pitch, -1.4, 1.4);
    this.look.zoom = clamp(this.look.zoom * (1 + zoom * 0.08), 0.35, 4);
    if (!looking && this.mode !== 'orbit') { this.look.yaw = damp(this.look.yaw, 0, 1.6, dt); this.look.pitch = damp(this.look.pitch, 0, 1.6, dt); }
    const cam = this.cam;
    const spd = fm.tas;
    let fov = 60 + clamp(spd / 340, 0, 1) * 8 + fm.abOn * 4;
    this.inCockpit = false;
    this.cockpit.visible = false;
    const L = ac.spec.chase;
    // smoothed orientation (lags behind the aircraft)
    this.qs.slerp(fm.quat, 1 - Math.exp(-dt * (this.mode === 'close' ? 7 : 4.5)));
    const lookQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.look.pitch, this.look.yaw, 0, 'YXZ'));
    const up = new THREE.Vector3(0, 1, 0);

    switch (this.mode) {
      case 'chase': case 'close': case 'padlock': {
        const dist = (this.mode === 'close' ? L * 0.55 : L) * this.look.zoom;
        let q = this.qs.clone();
        // keep horizon level-ish: blend roll out partially
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
        const levelQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), fwd, up));
        q = levelQ.slerp(q, this.mode === 'close' ? 0.75 : 0.55);
        if (this.mode === 'padlock' && this.target) {
          const toT = this.target.clone().sub(fm.pos).normalize();
          const pq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), toT, up));
          q = pq;
        }
        q.multiply(lookQ);
        const off = new THREE.Vector3(0, dist * 0.22 + ac.spec.geom.radius, dist).applyQuaternion(q);
        const desired = fm.pos.clone().add(off);
        this.pos.copy(desired);
        cam.position.copy(this.pos);
        const tgt = fm.pos.clone().add(new THREE.Vector3(0, ac.spec.geom.radius * 0.6, -dist * 0.4).applyQuaternion(q));
        cam.up.copy(new THREE.Vector3(0, 1, 0).applyQuaternion(q).lerp(up, 0.3).normalize());
        cam.lookAt(tgt);
        break;
      }
      case 'cockpit': {
        this.inCockpit = true;
        this.cockpit.visible = true;
        this.cockpit.position.copy(fm.pos); this.cockpit.quaternion.copy(fm.quat);
        const yoke = this.cockpit.getObjectByName('yoke');
        if (yoke) { yoke.rotation.z = Math.PI - fm.da * 0.6; yoke.position.z = ac.spec.eye[2] - 0.45 + fm.de * 0.06; }
        this.headG = damp(this.headG, clamp(fm.gLoad - 1, -2, 8), 6, dt);
        const eye = new THREE.Vector3(ac.spec.eye[0], ac.spec.eye[1] - this.headG * 0.012, ac.spec.eye[2]);
        cam.position.copy(eye.applyQuaternion(fm.quat).add(fm.pos));
        const q = fm.quat.clone().multiply(lookQ);
        cam.quaternion.copy(q);
        cam.up.set(0, 1, 0).applyQuaternion(fm.quat);
        fov = 70 * clamp(1 / this.look.zoom, 0.4, 1.3);
        break;
      }
      case 'orbit': {
        const dist = L * 1.4 * this.look.zoom;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(clamp(0.3 - this.look.pitch, -0.2, 1.45), this.look.yaw + Math.PI, 0, 'YXZ'));
        cam.position.copy(fm.pos).add(new THREE.Vector3(0, 0, -dist).applyQuaternion(q));
        cam.up.set(0, 1, 0);
        cam.lookAt(fm.pos);
        break;
      }
      case 'flyby': {
        const d = this.flyby.distanceTo(fm.pos);
        const behind = this.flyby.clone().sub(fm.pos).dot(fm.vel) < 0;
        if (d > 3000 || (behind && d > 250 + spd * 1.2)) {
          const ahead = fm.vel.clone().normalize().multiplyScalar(Math.max(250, spd * 4));
          const side = new THREE.Vector3(-fm.vel.z, 0, fm.vel.x).normalize().multiplyScalar(25 + Math.random() * 30 * (Math.random() < 0.5 ? -1 : 1));
          this.flyby.copy(fm.pos).add(ahead).add(side);
          this.flyby.y = Math.max(this.flyby.y + (Math.random() - 0.6) * 15, Math.max(terrainHeight(this.flyby.x, this.flyby.z), 0) + 3);
        }
        cam.position.copy(this.flyby);
        cam.up.set(0, 1, 0);
        cam.lookAt(fm.pos);
        fov = clamp((2 * Math.atan((ac.spec.geom.wing.span * 3) / Math.max(d, 1)) * 180) / Math.PI, 8, 60);
        break;
      }
      case 'tower': {
        const towers = [new THREE.Vector3(AIRPORT.cx + 540, AIRPORT.elev + 52, AIRPORT.cz + 420), new THREE.Vector3(CARRIER.cx + 30, CARRIER.deck + 22, CARRIER.cz + 10), new THREE.Vector3(RUNWAYS[1].cx + 80, RUNWAYS[1].elev + 12, RUNWAYS[1].cz)];
        let tp = towers[0];
        for (const t of towers) if (t.distanceTo(fm.pos) < tp.distanceTo(fm.pos)) tp = t;
        if (tp.distanceTo(fm.pos) > 9000) tp = fm.pos.clone().add(new THREE.Vector3(600, 120, 600));
        cam.position.copy(tp);
        cam.up.set(0, 1, 0);
        cam.lookAt(fm.pos);
        const d = tp.distanceTo(fm.pos);
        fov = clamp((2 * Math.atan((ac.spec.geom.wing.span * 2.2 * this.look.zoom) / d) * 180) / Math.PI, 3, 60);
        break;
      }
      case 'cinematic': {
        this.cineT += dt;
        if (this.cineT > 6.5) { this.cineT = 0; this.cineShot = (this.cineShot + 1) % 6; }
        const G = ac.spec.geom;
        const shots: [THREE.Vector3, THREE.Vector3][] = [
          [new THREE.Vector3(G.wing.span * 0.55, G.radius * 0.6, G.length * 0.15), new THREE.Vector3(0, 0, -G.length * 0.4)],
          [new THREE.Vector3(0, G.radius * 1.6, G.length * 0.8), new THREE.Vector3(0, 0, -G.length)],
          [new THREE.Vector3(-G.wing.span * 0.7, -G.radius * 1.5, -G.length * 0.9), new THREE.Vector3(0, 0, G.length * 0.2)],
          [new THREE.Vector3(0, -G.radius * 2.5, -G.length * 0.2), new THREE.Vector3(0, 0, -G.length * 0.2)],
          [new THREE.Vector3(G.wing.span * 1.6, G.radius * 4, -G.length * 1.6), new THREE.Vector3(0, 0, 0)],
          [new THREE.Vector3(-G.wing.span * 0.4, G.radius * 0.9, G.length * 0.4), new THREE.Vector3(-G.wing.span * 0.3, 0, -G.length * 2)],
        ];
        const [p, l] = shots[this.cineShot];
        const drift = new THREE.Vector3(Math.sin(this.cineT * 0.3) * 2, Math.cos(this.cineT * 0.25), this.cineT * 0.4);
        cam.position.copy(p.clone().add(drift).applyQuaternion(fm.quat).add(fm.pos));
        cam.up.set(0, 1, 0).applyQuaternion(fm.quat).lerp(up, 0.4);
        cam.lookAt(l.applyQuaternion(fm.quat).add(fm.pos));
        fov = 50;
        break;
      }
    }
    // camera shake: turbulence, gun, impacts, high-speed buffet
    const buffet = fm.stall * 0.4 + smoothstep(0.85, 1.05, fm.mach) * (1 - smoothstep(1.05, 1.2, fm.mach)) * 0.5 + (fm.onGround ? clamp(spd / 80, 0, 0.15) : 0);
    this.shakeAmt = damp(this.shakeAmt, 0, 3, dt);
    const sh = (this.shakeAmt + buffet) * (this.inCockpit ? 0.012 : 0.06);
    if (sh > 0) {
      cam.rotateX(vnoise(this.t * 25, 1.1) * sh);
      cam.rotateY(vnoise(this.t * 25, 7.7) * sh);
      cam.rotateZ(vnoise(this.t * 20, 3.3) * sh * 0.5);
    }
    // never below ground
    const gh = Math.max(terrainHeight(cam.position.x, cam.position.z), 0) + 1.2;
    if (cam.position.y < gh && !this.inCockpit) cam.position.y = gh;
    // keep the horizontal field of view in portrait so the world doesn't feel cramped
    const aspect = cam.aspect;
    if (aspect < 1.3) {
      const hf = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * 1.6);
      fov = Math.min(105, (2 * Math.atan(Math.tan(hf / 2) / aspect) * 180) / Math.PI);
    }
    this.fov = damp(this.fov, fov, 4, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}

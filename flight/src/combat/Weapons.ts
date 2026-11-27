import * as THREE from 'three';
import type { Effects } from './Effects';
import type { City } from '../world/City';
import { terrainHeight } from '../world/WorldDef';
import { clamp } from '../core/math';

export interface Target {
  id: number;
  name: string;
  kind: 'air' | 'ground' | 'building';
  team: 'player' | 'enemy' | 'neutral';
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  alive: boolean;
  heat: number;
  hit(dmg: number, at: THREE.Vector3, by: 'gun' | 'missile'): void;
  flare?: () => boolean;
}

interface Bullet { p: THREE.Vector3; v: THREE.Vector3; life: number; team: string }
interface Missile {
  p: THREE.Vector3; v: THREE.Vector3; target: Target | null; decoy: THREE.Vector3 | null; life: number; burn: number;
  team: string; mesh: THREE.Object3D; armed: number;
}
interface Flare { p: THREE.Vector3; v: THREE.Vector3; life: number }
interface Bomb { p: THREE.Vector3; v: THREE.Vector3; mesh: THREE.Object3D; team: string }

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

export class Weapons {
  readonly group = new THREE.Group();
  bullets: Bullet[] = [];
  missiles: Missile[] = [];
  flares: Flare[] = [];
  bombs: Bomb[] = [];
  private heads: THREE.Points;
  private headPos: Float32Array;
  private bombProto: THREE.Object3D;
  onBomb: (p: THREE.Vector3) => void = () => {};
  targets: Target[] = [];
  private tracer: THREE.LineSegments;
  private tracerPos: Float32Array;
  private missileProto: THREE.Object3D;
  onKill: (t: Target, by: string) => void = () => {};
  onHitPlayer: (dmg: number, at: THREE.Vector3) => void = () => {};
  onMissileLaunchAtPlayer: () => void = () => {};
  onGunSound: (p: THREE.Vector3) => void = () => {};
  onHitMarker: () => void = () => {};
  playerPos = new THREE.Vector3();

  constructor(private fx: Effects, private city: City) {
    this.tracerPos = new Float32Array(600 * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracer = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(3, 2.2, 0.8), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.tracer.frustumCulled = false;
    this.group.add(this.tracer);
    this.headPos = new Float32Array(600 * 3);
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(this.headPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.heads = new THREE.Points(hg, new THREE.PointsMaterial({ color: new THREE.Color(4, 3, 1.4), size: 4.5, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.heads.frustumCulled = false;
    this.group.add(this.heads);
    const bm = new THREE.Group();
    const bBody = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.2, 10), new THREE.MeshStandardMaterial({ color: 0x4b5236, roughness: 0.6, metalness: 0.3 }));
    bBody.rotation.x = Math.PI / 2;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6), bBody.material); nose.position.z = -1.1;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.35), new THREE.MeshStandardMaterial({ color: 0x333333 })); fin.position.z = 1.05;
    const fin2 = fin.clone(); fin2.rotation.z = Math.PI / 2;
    bm.add(bBody, nose, fin, fin2);
    this.bombProto = bm;
    const m = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 8), new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.3, roughness: 0.4 }));
    body.rotation.x = Math.PI / 2;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.5, 1), toneMapped: false }));
    glow.position.z = 1.6;
    m.add(body, glow);
    this.missileProto = m;
  }

  fireGun(pos: THREE.Vector3, dir: THREE.Vector3, vel: THREE.Vector3, team: string, spread = 0.004) {
    const v = dir.clone().multiplyScalar(1030).add(vel);
    v.x += (Math.random() - 0.5) * spread * 1000; v.y += (Math.random() - 0.5) * spread * 1000; v.z += (Math.random() - 0.5) * spread * 1000;
    this.bullets.push({ p: pos.clone(), v, life: 2.2, team });
    if (this.bullets.length > 600) this.bullets.shift();
    if (team === 'player' || pos.distanceToSquared(this.playerPos) < 4e6) this.onGunSound(pos);
  }

  fireMissile(pos: THREE.Vector3, vel: THREE.Vector3, dir: THREE.Vector3, target: Target | null, team: string) {
    const mesh = this.missileProto.clone();
    mesh.position.copy(pos);
    this.group.add(mesh);
    this.missiles.push({ p: pos.clone(), v: vel.clone().addScaledVector(dir, 20), target, decoy: null, life: 18, burn: 3.2, team, mesh, armed: 0.4 });
    for (let k = 0; k < 10; k++) this.fx.trailSmoke(pos.clone().addScaledVector(dir, -k * 0.6), vel.clone().multiplyScalar(0.8), 0, 1.6);
    this.fx.fire.emit(pos, vel, 0.15, 4, 1, 1, 0.8, 0.4, 1, 0);
    if (target && target.team === 'player') this.onMissileLaunchAtPlayer();
  }

  dropBomb(pos: THREE.Vector3, vel: THREE.Vector3, team: string) {
    const mesh = this.bombProto.clone();
    mesh.position.copy(pos);
    this.group.add(mesh);
    this.bombs.push({ p: pos.clone(), v: vel.clone().add(new THREE.Vector3(0, -2, 0)), mesh, team });
  }

  /** Ballistic impact prediction for the CCIP pipper. */
  static predictImpact(pos: THREE.Vector3, vel: THREE.Vector3): THREE.Vector3 | null {
    const p = pos.clone(), v = vel.clone().add(new THREE.Vector3(0, -2, 0));
    for (let i = 0; i < 400; i++) {
      const dt = 0.05;
      v.y -= 9.8 * dt; v.multiplyScalar(1 - 0.00004 * v.length() * dt * 20);
      p.addScaledVector(v, dt);
      if (p.y < Math.max(terrainHeight(p.x, p.z), 0)) return p;
    }
    return null;
  }

  dropFlares(pos: THREE.Vector3, vel: THREE.Vector3) {
    for (let i = 0; i < 4; i++) {
      const v = vel.clone().multiplyScalar(0.7).add(new THREE.Vector3((Math.random() - 0.5) * 40, -10 - Math.random() * 15, (Math.random() - 0.5) * 40));
      this.flares.push({ p: pos.clone(), v, life: 3.5 });
    }
    // decoy incoming missiles
    for (const m of this.missiles) {
      if (m.target && m.target.team !== m.team && m.p.distanceTo(pos) < 3500 && Math.random() < 0.7) m.decoy = this.flares[this.flares.length - 1].p;
    }
  }

  /** Best lock candidate inside a cone in front of the shooter. */
  findLock(pos: THREE.Vector3, fwd: THREE.Vector3, team: string, cone = 0.42, range = 6500): Target | null {
    let best: Target | null = null, bs = Infinity;
    for (const t of this.targets) {
      if (!t.alive || t.team === team || t.team === 'neutral') continue;
      _a.copy(t.pos).sub(pos);
      const d = _a.length();
      if (d > range || d < 150) continue;
      const ang = Math.acos(clamp(_a.dot(fwd) / d, -1, 1));
      if (ang > cone) continue;
      const score = ang * 3000 + d;
      if (score < bs) { bs = score; best = t; }
    }
    return best;
  }

  update(dt: number) {
    // bullets
    let n = 0;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      const p0 = _a.copy(b.p);
      b.v.y -= 9.8 * dt;
      b.p.addScaledVector(b.v, dt);
      let dead = b.life <= 0;
      if (!dead) {
        // targets (segment–sphere)
        const seg = _b.copy(b.p).sub(p0);
        const L = seg.length();
        for (const t of this.targets) {
          if (!t.alive || t.team === b.team) continue;
          _c.copy(t.pos).sub(p0);
          const proj = clamp(_c.dot(seg) / (L * L), 0, 1);
          const closest = p0.clone().addScaledVector(seg, proj);
          if (closest.distanceToSquared(t.pos) < t.radius * t.radius) {
            t.hit(b.team === 'player' ? 9 : 5, closest, 'gun');
            this.fx.hitSparks(closest, 5);
            if (b.team === 'player') this.onHitMarker();
            if (!t.alive) this.onKill(t, b.team);
            dead = true;
            break;
          }
        }
        if (!dead && b.team !== 'player' && b.p.distanceToSquared(this.playerPos) < 64) { this.onHitPlayer(4, b.p); dead = true; }
        if (!dead) {
          const bd = this.city.hit(b.p);
          if (bd) {
            this.fx.hitSparks(b.p, 3);
            if (b.team === 'player') { if (this.city.damage(bd, 6, b.p, this.fx)) this.onKill({ id: -1, name: '건물', kind: 'building', team: 'neutral', pos: b.p.clone(), vel: new THREE.Vector3(), radius: 0, alive: false, heat: 0, hit: () => {} }, b.team); }
            dead = true;
          } else if (b.p.y < Math.max(terrainHeight(b.p.x, b.p.z), 0)) {
            if (b.p.y > -1 && b.p.distanceToSquared(this.playerPos) < 1.6e7) { const w = terrainHeight(b.p.x, b.p.z) < 0; this.fx.dust(b.p, new THREE.Vector3(), 1, w); this.fx.dust(b.p, new THREE.Vector3(), 1, w); if (!w) this.fx.hitSparks(b.p, 2); }
            dead = true;
          }
        }
      }
      if (dead) { this.bullets.splice(i, 1); continue; }
      if (n < 600) {
        const tail = b.p.clone().addScaledVector(b.v, -0.03);
        this.tracerPos.set([b.p.x, b.p.y, b.p.z, tail.x, tail.y, tail.z], n * 6);
        this.headPos.set([b.p.x, b.p.y, b.p.z], n * 3);
        n++;
      }
    }
    this.tracer.geometry.setDrawRange(0, n * 2);
    this.heads.geometry.setDrawRange(0, n);
    this.heads.geometry.getAttribute('position').needsUpdate = true;
    // bombs
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const bo = this.bombs[i];
      bo.v.y -= 9.8 * dt; bo.v.multiplyScalar(1 - 0.00004 * bo.v.length() * dt * 20);
      bo.p.addScaledVector(bo.v, dt);
      bo.mesh.position.copy(bo.p);
      bo.mesh.lookAt(bo.p.clone().add(bo.v));
      const gh = Math.max(terrainHeight(bo.p.x, bo.p.z), 0);
      const bd = this.city.hit(bo.p);
      if (bo.p.y <= gh || bd) {
        this.group.remove(bo.mesh); this.bombs.splice(i, 1);
        const at = bo.p.clone(); at.y = Math.max(at.y, gh);
        this.fx.explosion(at, 3.2);
        this.fx.scorch(at, 22);
        this.fx.addFire(at, 2, 25);
        if (bo.p.y <= 0.5 && terrainHeight(bo.p.x, bo.p.z) < 0) for (let k = 0; k < 30; k++) this.fx.dust(at, new THREE.Vector3(0, 30, 0), 1, true);
        // blast damage: buildings + targets in radius
        const R = 55;
        for (const b of this.city.buildings) {
          if (!b.alive || Math.abs(b.x - at.x) > R + b.w || Math.abs(b.z - at.z) > R + b.d) continue;
          const d = Math.max(0, Math.hypot(b.x - at.x, b.z - at.z) - Math.max(b.w, b.d) * 0.4);
          if (d < R && this.city.damage(b, 900 * (1 - d / R), at, this.fx) && bo.team === 'player') this.onKill({ id: -1, name: '건물', kind: 'building', team: 'neutral', pos: at.clone(), vel: new THREE.Vector3(), radius: 0, alive: false, heat: 0, hit: () => {} }, bo.team);
        }
        for (const t of this.targets) {
          if (!t.alive || t.team === bo.team) continue;
          const d = t.pos.distanceTo(at);
          if (d < R + t.radius) { t.hit(600 * (1 - d / (R + t.radius)), at, 'missile'); if (!t.alive) this.onKill(t, bo.team); }
        }
        if (bo.team !== 'player' && this.playerPos.distanceTo(at) < R) this.onHitPlayer(120, at);
        this.onBomb(at);
      }
    }
    this.tracer.geometry.getAttribute('position').needsUpdate = true;

    // missiles
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life -= dt; m.armed -= dt;
      const speed = m.v.length();
      const dir = m.v.clone().divideScalar(Math.max(speed, 1));
      if (m.burn > 0) { m.burn -= dt; m.v.addScaledVector(dir, 260 * dt); }
      m.v.addScaledVector(m.v, -0.00012 * speed * dt * (m.burn > 0 ? 0.3 : 1));
      m.v.y -= 9.8 * dt * 0.3;
      const aim = m.decoy ?? (m.target && m.target.alive ? m.target.pos : null);
      if (aim) {
        // proportional navigation (N=4) with lead
        const rel = _a.copy(aim).sub(m.p);
        const dist = rel.length();
        const tv = m.decoy ? new THREE.Vector3() : m.target!.vel;
        const tgo = dist / Math.max(speed, 100);
        const lead = rel.clone().addScaledVector(tv, tgo * 0.9).normalize();
        const desired = lead.multiplyScalar(speed);
        const steer = desired.sub(m.v);
        const maxA = 35 * 9.8;
        if (steer.length() > maxA * dt) steer.setLength(maxA * dt);
        m.v.add(steer);
        if (m.target && !m.decoy && dist < 14 && m.armed <= 0) { this.detonate(m, i, m.target); continue; }
        if (m.decoy && dist < 20) { this.detonate(m, i, null); continue; }
      }
      m.p.addScaledVector(m.v, dt);
      m.mesh.position.copy(m.p);
      m.mesh.lookAt(m.p.clone().sub(m.v));
      if (m.burn > 0) { this.fx.trailSmoke(m.p, m.v.clone().multiplyScalar(0.02), 0, 1.1); this.fx.trailSmoke(m.p.clone().addScaledVector(m.v, -dt * 0.5), m.v.clone().multiplyScalar(0.02), 0, 1.1); this.fx.flame(m.p, m.v.clone().multiplyScalar(-0.05), 1.2); }
      const gh = Math.max(terrainHeight(m.p.x, m.p.z), 0);
      const bd = this.city.hit(m.p);
      if (m.life <= 0 || m.p.y < gh || bd) {
        if (bd && m.team === 'player') { if (this.city.damage(bd, 400, m.p, this.fx)) this.onKill({ id: -1, name: '건물', kind: 'building', team: 'neutral', pos: m.p.clone(), vel: new THREE.Vector3(), radius: 0, alive: false, heat: 0, hit: () => {} }, m.team); }
        this.detonate(m, i, null);
        continue;
      }
      // proximity with any hostile target
      for (const t of this.targets) {
        if (!t.alive || t.team === m.team || t === m.target) continue;
        if (m.armed <= 0 && t.pos.distanceToSquared(m.p) < (t.radius + 8) ** 2) { this.detonate(m, i, t); break; }
      }
    }

    // flares
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i];
      f.life -= dt;
      f.v.y -= 9.8 * dt; f.v.multiplyScalar(Math.exp(-dt * 0.8));
      f.p.addScaledVector(f.v, dt);
      this.fx.fire.emit(f.p, _a.set(0, 0, 0), 0.25, 3, 1.5, 1, 0.85, 0.6, 1, 1);
      if (Math.random() < 0.5) this.fx.smoke.emit(f.p, _a.set(0, 1, 0), 2.5, 1, 4, 0.9, 0.9, 0.9, 0.4, 1);
      if (f.life <= 0) this.flares.splice(i, 1);
    }
  }

  private detonate(m: Missile, i: number, hitT: Target | null) {
    this.fx.explosion(m.p, 1.1, m.v);
    this.group.remove(m.mesh);
    this.missiles.splice(i, 1);
    for (const t of this.targets) {
      if (!t.alive || t.team === m.team) continue;
      const d = t.pos.distanceTo(m.p);
      if (t === hitT || d < 25 + t.radius) {
        t.hit(t === hitT ? 260 : 260 * (1 - d / (25 + t.radius)), m.p, 'missile');
        if (!t.alive) this.onKill(t, m.team);
      }
    }
    if (m.team !== 'player') {
      const d = this.playerPos.distanceTo(m.p);
      if (d < 30) this.onHitPlayer(110 * (1 - d / 30), m.p);
    }
  }

  incomingToPlayer(): number {
    let best = Infinity;
    for (const m of this.missiles) if (m.target?.team === 'player' && !m.decoy) best = Math.min(best, m.p.distanceTo(this.playerPos));
    return best;
  }

  clear() {
    for (const b of this.bombs) this.group.remove(b.mesh);
    this.bombs.length = 0;
    for (const m of this.missiles) this.group.remove(m.mesh);
    this.missiles.length = 0; this.bullets.length = 0; this.flares.length = 0;
    this.targets.length = 0;
  }
}

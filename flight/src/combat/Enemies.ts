import * as THREE from 'three';
import { Aircraft } from '../aircraft/Aircraft';
import { getSpec } from '../aircraft/specs';
import type { Weapons, Target } from './Weapons';
import type { Effects } from './Effects';
import { terrainHeight } from '../world/WorldDef';
import { clamp, DEG } from '../core/math';
import type { Env, Part } from '../aircraft/FlightModel';

let NEXT_ID = 1;

export type AIRole = 'fighter' | 'bomber' | 'drone' | 'traffic';

export class EnemyAir implements Target {
  id = NEXT_ID++;
  kind = 'air' as const;
  team: 'enemy' | 'neutral';
  radius: number;
  alive = true;
  heat = 1;
  ac: Aircraft;
  role: AIRole;
  name: string;
  private gunCd = 0; private msCd = 6 + Math.random() * 6; private flareCd = 0;
  private wp: THREE.Vector3;
  private orbit = Math.random() * 6.28;
  skill: number;
  dest: THREE.Vector3 | null = null;
  falling = 0;

  constructor(role: AIRole, pos: THREE.Vector3, hdg: number, private weapons: Weapons, private fx: Effects, skill = 0.6) {
    this.role = role;
    this.skill = skill;
    const spec = getSpec(role === 'bomber' ? 'atlas' : role === 'drone' ? 'vortex' : role === 'traffic' ? 'meridian' : Math.random() < 0.5 ? 'strix' : 'specter');
    this.team = role === 'traffic' ? 'neutral' : 'enemy';
    this.ac = new Aircraft(spec, role === 'fighter' ? 3 % spec.liveries.length : 1, this.team);
    if (role === 'fighter') this.ac.vis.paint.color.setRGB(0.55, 0.5, 0.5);
    this.ac.assist.level = 'standard';
    this.ac.reset(pos, hdg, role === 'bomber' ? 110 : role === 'drone' ? 60 : role === 'traffic' ? 120 : 200, false);
    this.ac.controls.gearDown = false;
    this.ac.fm.gear = 0;
    this.radius = Math.max(8, spec.geom.wing.span * 0.5);
    this.name = role === 'bomber' ? '적 폭격기' : role === 'drone' ? '표적 드론' : role === 'traffic' ? '민항기' : '적 전투기';
    this.wp = pos.clone();
  }
  get pos() { return this.ac.fm.pos; }
  get vel() { return this.ac.fm.vel; }

  hit(dmg: number, at: THREE.Vector3) {
    if (!this.alive) return;
    const parts: Part[] = ['engine', 'wingL', 'wingR', 'tail', 'fuselage'];
    const fm = this.ac.fm;
    fm.damage(parts[Math.floor(Math.random() * parts.length)], dmg * (this.role === 'bomber' ? 0.45 : 1));
    if (fm.hp.fuselage <= 0 || fm.crashed || fm.hp.wingL <= 0 || fm.hp.wingR <= 0) this.kill(at);
  }
  kill(at: THREE.Vector3) {
    if (!this.alive) return;
    this.alive = false;
    this.falling = 6;
    this.fx.explosion(at.clone(), 1.6, this.vel);
  }
  flare() {
    if (this.flareCd > 0) return false;
    this.flareCd = 6;
    this.weapons.dropFlares(this.pos, this.vel);
    return true;
  }

  update(dt: number, player: Aircraft | null, env: Env) {
    const fm = this.ac.fm;
    if (!this.alive) {
      // tumbling wreck falling with fire
      this.falling -= dt;
      fm.vel.y -= 9.8 * dt;
      fm.pos.addScaledVector(fm.vel, dt);
      fm.quat.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(dt * 0.8, dt * 0.3, dt * 2.2)));
      this.fx.flame(fm.pos, fm.vel, 2.2);
      this.fx.trailSmoke(fm.pos, fm.vel, 1, 2.5);
      if (fm.pos.y < Math.max(terrainHeight(fm.pos.x, fm.pos.z), 0)) { this.fx.explosion(fm.pos.clone(), 2, undefined); this.ac.vis.root.visible = false; this.falling = 0; }
      this.ac.sync();
      return;
    }
    this.gunCd -= dt; this.msCd -= dt; this.flareCd -= dt;
    const at = fm.attitude();
    let desired = new THREE.Vector3();
    let throttle = 0.85, ab = false;
    const pPos = player?.fm.pos;
    const toP = pPos ? pPos.clone().sub(fm.pos) : null;
    const dist = toP ? toP.length() : Infinity;
    const playerAlive = player && !player.fm.crashed;

    if (this.role === 'fighter' && playerAlive && toP) {
      // incoming-missile reaction: break turn + flares
      const threat = this.weapons.missiles.find((m) => m.target === this && m.p.distanceTo(fm.pos) < 2500);
      if (threat) {
        if (Math.random() < this.skill * dt * 3) this.flare();
        const away = fm.pos.clone().sub(threat.p).normalize();
        desired = new THREE.Vector3().crossVectors(away, new THREE.Vector3(0, 1, 0)).normalize().add(new THREE.Vector3(0, -0.2, 0));
        ab = true; throttle = 1;
      } else {
        // lead pursuit
        const tgo = dist / 900;
        const lead = pPos!.clone().addScaledVector(player!.fm.vel, tgo * this.skill);
        desired = lead.sub(fm.pos).normalize();
        ab = dist > 2500; throttle = 1;
        const fwd = at.f;
        const off = Math.acos(clamp(fwd.dot(toP.clone().normalize()), -1, 1));
        if (off < 4 * DEG && dist < 1100 && this.gunCd <= 0) {
          this.gunCd = 0.06;
          this.weapons.fireGun(this.ac.worldPoint(new THREE.Vector3(0.5, 0, -6)), fwd, fm.vel, 'enemy', 0.012 * (1.2 - this.skill));
        }
        if (off < 15 * DEG && dist < 3500 && dist > 600 && this.msCd <= 0 && this.ac.missiles > 0) {
          this.msCd = 14 + Math.random() * 10;
          this.ac.missiles--;
          const pt: Target = { id: 0, name: 'player', kind: 'air', team: 'player', pos: player!.fm.pos, vel: player!.fm.vel, radius: 10, alive: true, heat: 1, hit: () => {} };
          this.weapons.fireMissile(this.ac.worldPoint(new THREE.Vector3(3, -0.5, 0)), fm.vel, fwd, pt, 'enemy');
        }
      }
    } else if (this.role === 'bomber' && this.dest) {
      desired = this.dest.clone().sub(fm.pos); desired.y = 0; desired.normalize();
      const alt = 1400 - fm.pos.y; desired.y = clamp(alt * 0.002, -0.2, 0.2);
      throttle = 0.9;
    } else {
      // racetrack orbit around waypoint
      this.orbit += dt * 0.05;
      const tgt = this.wp.clone().add(new THREE.Vector3(Math.cos(this.orbit) * 1500, 0, Math.sin(this.orbit) * 1500));
      desired = tgt.sub(fm.pos).normalize();
      throttle = this.role === 'drone' ? 0.6 : 0.7;
    }
    // terrain avoidance
    const look = fm.pos.clone().addScaledVector(fm.vel, 5);
    const clr = look.y - Math.max(terrainHeight(look.x, look.z), 0);
    if (clr < 250 || fm.agl < 200) desired.y = Math.max(desired.y, 0.6);

    // convert desired direction → stick
    const qi = fm.quat.clone().invert();
    const db = desired.clone().normalize().applyQuaternion(qi);
    const bank = Math.atan2(db.x, Math.max(db.y, -0.2) + 0.25);
    const off = Math.acos(clamp(-db.z, -1, 1));
    let roll = clamp(bank * 2.2, -1, 1);
    let pitch = clamp(off * 3 * Math.max(0, Math.cos(bank)) + (db.y > 0 ? 0.1 : 0), -0.4, 1) * (0.5 + this.skill * 0.5);
    if (this.role !== 'fighter') { pitch *= 0.4; roll = clamp(-at.roll * 1.5 + clamp(Math.atan2(db.x, -db.z) * 2, -0.6, 0.6), -0.6, 0.6); }
    const c = this.ac.controls;
    c.throttle = throttle; c.ab = ab;
    const out = this.ac.assist.update(dt, fm, { pitch, roll, yaw: 0 }, throttle, 0);
    const sub = 2;
    for (let i = 0; i < sub; i++) fm.step(dt / sub, out.cmd, c, env);
    if (fm.crashed) this.kill(fm.pos);
  }
}

type GKind = 'sam' | 'aaa' | 'tank' | 'radar' | 'fuel' | 'hangar' | 'truck';

export class GroundTarget implements Target {
  id = NEXT_ID++;
  kind = 'ground' as const;
  team = 'enemy' as const;
  alive = true;
  heat = 0.4;
  radius: number;
  hp: number;
  name: string;
  vel = new THREE.Vector3();
  readonly group = new THREE.Group();
  private cd = 3 + Math.random() * 4;
  private turret: THREE.Object3D | null = null;
  pos: THREE.Vector3;

  constructor(public gk: GKind, x: number, z: number, private weapons: Weapons, private fx: Effects) {
    const y = Math.max(terrainHeight(x, z), 0);
    this.pos = new THREE.Vector3(x, y + 2, z);
    this.group.position.set(x, y, z);
    const olive = new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.8, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2e26, roughness: 0.7, metalness: 0.4 });
    const add = (g: THREE.BufferGeometry, m: THREE.Material, px = 0, py = 0, pz = 0, parent: THREE.Object3D = this.group) => { const o = new THREE.Mesh(g, m); o.position.set(px, py, pz); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
    const names: Record<GKind, string> = { sam: 'SAM 발사대', aaa: '대공포', tank: '전차', radar: '레이더', fuel: '연료 저장소', hangar: '격납고', truck: '보급 트럭' };
    this.name = names[gk];
    switch (gk) {
      case 'sam': {
        add(new THREE.BoxGeometry(4, 1.5, 7), olive, 0, 0.75);
        const t = new THREE.Group(); t.position.y = 1.5; this.group.add(t); this.turret = t;
        for (let i = 0; i < 4; i++) { const tube = add(new THREE.BoxGeometry(0.7, 0.7, 6), dark, -1.2 + i * 0.8, 1.2, 0, t); tube.rotation.x = -0.5; }
        this.radius = 6; this.hp = 120; break;
      }
      case 'aaa': {
        add(new THREE.CylinderGeometry(2.5, 3, 1.4, 12), olive, 0, 0.7);
        const t = new THREE.Group(); t.position.y = 1.6; this.group.add(t); this.turret = t;
        add(new THREE.BoxGeometry(2, 1.2, 2), olive, 0, 0, 0, t);
        for (const s of [-0.4, 0.4]) { const b = add(new THREE.CylinderGeometry(0.1, 0.1, 4, 6), dark, s, 0.6, -1.8, t); b.rotation.x = Math.PI / 2 - 0.6; }
        this.radius = 5; this.hp = 80; break;
      }
      case 'tank': {
        add(new THREE.BoxGeometry(3.4, 1.4, 6.5), olive, 0, 0.9);
        const t = new THREE.Group(); t.position.y = 1.9; this.group.add(t); this.turret = t;
        add(new THREE.BoxGeometry(2.4, 0.9, 3), olive, 0, 0, 0, t);
        const b = add(new THREE.CylinderGeometry(0.12, 0.12, 4.5, 6), dark, 0, 0.1, -3.4, t); b.rotation.x = Math.PI / 2;
        for (const s of [-1.6, 1.6]) add(new THREE.BoxGeometry(0.8, 1, 6.8), dark, s, 0.5);
        this.radius = 5; this.hp = 90; break;
      }
      case 'radar': {
        add(new THREE.BoxGeometry(4, 3, 4), olive, 0, 1.5);
        const t = new THREE.Group(); t.position.y = 5; this.group.add(t); this.turret = t;
        const dish = add(new THREE.SphereGeometry(3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide, metalness: 0.6 }), 0, 0, 0, t);
        dish.rotation.x = Math.PI / 2;
        this.radius = 6; this.hp = 70; break;
      }
      case 'fuel': {
        for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(6, 6, 9, 20), new THREE.MeshStandardMaterial({ color: 0xbfb9a8, roughness: 0.5, metalness: 0.4 }), (i - 1) * 14, 4.5);
        this.radius = 22; this.hp = 160; break;
      }
      case 'hangar': {
        const h = add(new THREE.CylinderGeometry(14, 14, 30, 16, 1, false, 0, Math.PI), olive, 0, 0);
        h.rotation.z = Math.PI / 2; h.rotation.y = Math.PI / 2;
        this.radius = 16; this.hp = 220; break;
      }
      default: {
        add(new THREE.BoxGeometry(2.4, 2.2, 7), olive, 0, 1.6);
        this.radius = 4; this.hp = 40;
      }
    }
  }

  hit(dmg: number, at: THREE.Vector3) {
    if (!this.alive) return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.alive = false;
      this.fx.explosion(this.pos.clone().add(new THREE.Vector3(0, 3, 0)), this.gk === 'fuel' ? 4 : 1.8);
      this.fx.addFire(this.pos, this.gk === 'fuel' ? 4 : 1.5, 90);
      this.group.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial; if (m && m.color) { (o as THREE.Mesh).material = m.clone(); ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).color.multiplyScalar(0.18); } });
      if (this.turret) this.turret.rotation.z = 0.6;
    }
    void at;
  }

  update(dt: number, player: Aircraft | null, t: number) {
    if (!this.alive) return;
    if (this.gk === 'radar' && this.turret) this.turret.rotation.y += dt * 1.5;
    if (this.gk === 'tank') { this.group.position.x += Math.sin(t * 0.05 + this.id) * dt * 3; this.pos.x = this.group.position.x; }
    if (!player || player.fm.crashed) return;
    const to = player.fm.pos.clone().sub(this.pos);
    const d = to.length();
    if (this.turret && (this.gk === 'sam' || this.gk === 'aaa' || this.gk === 'tank')) this.turret.rotation.y = Math.atan2(-to.x, -to.z);
    this.cd -= dt;
    if (this.gk === 'aaa' && d < 2600 && this.cd <= 0) {
      this.cd = 0.09;
      const lead = player.fm.pos.clone().addScaledVector(player.fm.vel, d / 1000);
      const dir = lead.sub(this.pos).normalize();
      this.weapons.fireGun(this.pos.clone().add(new THREE.Vector3(0, 3, 0)), dir, new THREE.Vector3(), 'enemy', 0.02);
      if (Math.random() < 0.02) this.cd = 2.5;
    }
    if (this.gk === 'sam' && d < 7000 && d > 500 && this.cd <= 0) {
      this.cd = 13 + Math.random() * 6;
      const pt: Target = { id: 0, name: 'player', kind: 'air', team: 'player', pos: player.fm.pos, vel: player.fm.vel, radius: 10, alive: true, heat: 1, hit: () => {} };
      this.weapons.fireMissile(this.pos.clone().add(new THREE.Vector3(0, 4, 0)), new THREE.Vector3(0, 60, 0), new THREE.Vector3(0, 1, 0), pt, 'enemy');
    }
  }
}

/** Building marked as a mission target — wraps City building. */
export class BuildingTarget implements Target {
  id = NEXT_ID++;
  kind = 'building' as const;
  team = 'enemy' as const;
  heat = 0.1;
  vel = new THREE.Vector3();
  name = '목표 건물';
  pos: THREE.Vector3;
  radius: number;
  constructor(public b: import('../world/City').Building, private city: import('../world/City').City, private fx: Effects) {
    this.pos = new THREE.Vector3(b.x, b.y0 + b.h * 0.5, b.z);
    this.radius = Math.max(b.w, b.d) * 0.6;
    b.target = true;
  }
  get alive() { return this.b.alive && this.b.collapse === 0; }
  hit(dmg: number, at: THREE.Vector3) { this.city.damage(this.b, dmg * 1.5, at, this.fx); }
}

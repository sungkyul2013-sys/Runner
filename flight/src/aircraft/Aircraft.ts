import * as THREE from 'three';
import { AircraftSpec } from './specs';
import { buildAircraft, AircraftVisual } from './Builder';
import { FlightModel, Controls } from './FlightModel';
import { Assist } from './Assist';
import type { Effects } from '../combat/Effects';
import { clamp, smoothstep } from '../core/math';

class Ribbon {
  readonly mesh: THREE.Mesh;
  private n: number;
  private pts: { p: THREE.Vector3; side: THREE.Vector3; age: number; a: number }[] = [];
  private pos: Float32Array; private col: Float32Array;
  constructor(n: number, private life: number, private width: number, private grow: number, color: THREE.Color) {
    this.n = n;
    this.pos = new Float32Array(n * 2 * 3);
    this.col = new Float32Array(n * 2 * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }
  push(p: THREE.Vector3, side: THREE.Vector3, alpha: number) {
    const last = this.pts[0];
    if (last && last.p.distanceToSquared(p) < 4 && alpha > 0) { last.p.copy(p); last.a = alpha; return; }
    this.pts.unshift({ p: p.clone(), side: side.clone(), age: 0, a: alpha });
    if (this.pts.length > this.n) this.pts.pop();
  }
  update(dt: number) {
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      const q = this.pts[Math.min(i, this.pts.length - 1)];
      if (!q) { this.mesh.visible = false; return; }
      this.mesh.visible = true;
      const age = i < this.pts.length ? q.age : this.life;
      const t = clamp(age / this.life, 0, 1);
      const w = this.width * (1 + t * this.grow);
      const a = i < this.pts.length ? q.a * (1 - t) * smoothstep(0, 2, i) : 0;
      this.pos.set([q.p.x - q.side.x * w, q.p.y - q.side.y * w, q.p.z - q.side.z * w, q.p.x + q.side.x * w, q.p.y + q.side.y * w, q.p.z + q.side.z * w], k * 6);
      this.col.set([1, 1, 1, a, 1, 1, 1, a], k * 8);
      k++;
    }
    for (const q of this.pts) q.age += dt;
    this.mesh.geometry.getAttribute('position').needsUpdate = true;
    this.mesh.geometry.getAttribute('color').needsUpdate = true;
  }
}

export class Aircraft {
  readonly spec: AircraftSpec;
  readonly fm: FlightModel;
  readonly vis: AircraftVisual;
  readonly assist = new Assist();
  readonly controls: Controls = { throttle: 0, ab: false, brake: 0, flaps: 0, gearDown: true, airbrake: false, hook: false, steer: 0 };
  flapIdx = 0;
  gunAmmo: number; missiles: number; flares: number; bombs: number;
  lightsOn = true;
  readonly group = new THREE.Group();
  private vortices: Ribbon[];
  private contrails: Ribbon[];
  private t = 0;
  private smokeAcc = 0;
  private lostL = false; private lostR = false; private lostTail = false;
  missileMeshes: THREE.Object3D[] = [];
  smokeOn = false; // airshow smoke
  smokeColor = new THREE.Color(1, 1, 1);
  team: 'player' | 'enemy' | 'neutral';

  constructor(spec: AircraftSpec, livery = 0, team: 'player' | 'enemy' | 'neutral' = 'player') {
    this.spec = spec;
    this.team = team;
    this.fm = new FlightModel(spec);
    this.vis = buildAircraft(spec, livery, team === 'player');
    this.group.add(this.vis.root);
    this.gunAmmo = spec.gun; this.missiles = spec.missiles; this.flares = spec.flares; this.bombs = spec.bombs ?? 0;
    this.vortices = [new Ribbon(60, 1.6, 0.18, 2, new THREE.Color(0.95, 0.97, 1)), new Ribbon(60, 1.6, 0.18, 2, new THREE.Color(0.95, 0.97, 1))];
    this.contrails = [new Ribbon(90, 9, 1.2, 4, new THREE.Color(1, 1, 1)), new Ribbon(90, 9, 1.2, 4, new THREE.Color(1, 1, 1))];
    this.vis.root.traverse((o) => { if (o.name === 'missile') this.missileMeshes.push(o); });
    this.missileMeshes.sort((a, b) => a.userData.slot - b.userData.slot);
  }

  addTrailsTo(scene: THREE.Object3D) { for (const r of [...this.vortices, ...this.contrails]) scene.add(r.mesh); }
  removeTrails() { for (const r of [...this.vortices, ...this.contrails]) r.mesh.parent?.remove(r.mesh); }

  reset(pos: THREE.Vector3, heading: number, speed: number, onGround: boolean) {
    this.fm.reset(pos, heading, speed, onGround);
    this.controls.throttle = onGround ? 0 : 0.75;
    this.controls.gearDown = onGround || !this.spec.retract;
    this.controls.flaps = 0; this.flapIdx = 0;
    this.controls.brake = onGround ? 1 : 0;
    this.controls.airbrake = false;
    this.controls.hook = false;
    this.gunAmmo = this.spec.gun; this.missiles = this.spec.missiles; this.flares = this.spec.flares; this.bombs = this.spec.bombs ?? 0;
    this.missileMeshes.forEach((m) => (m.visible = true));
    this.vis.wingL.visible = this.vis.wingR.visible = this.vis.tail.visible = true;
    this.lostL = this.lostR = this.lostTail = false;
    this.vis.root.visible = true;
    this.assist.disengage();
    this.sync();
  }

  sync() {
    this.vis.root.position.copy(this.fm.pos);
    this.vis.root.quaternion.copy(this.fm.quat);
  }

  cycleFlaps(dir: number) {
    const n = this.spec.flapNotches;
    this.flapIdx = clamp(this.flapIdx + dir, 0, n.length - 1);
    this.controls.flaps = n[this.flapIdx];
  }

  /** Visual animation + secondary effects (call once per render frame). */
  animate(dt: number, fx: Effects | null, night: number, cameraNear: boolean) {
    this.t += dt;
    const fm = this.fm, v = this.vis;
    this.sync();
    for (const a of v.ailerons) a.flap.rotation.x = -fm.da * a.max;
    for (const f of v.flaps) f.flap.rotation.x = fm.flaps * f.max * (f.sign < 0 ? -1 : 1);
    for (const e of v.elevators) e.flap.rotation.x = -fm.de * e.max * (e.sign < 0 ? -1 : 1);
    for (const r of v.rudders) r.flap.rotation.x = fm.dr * r.max;
    for (const b of v.airbrakes) b.flap.rotation.x = -fm.airbrake * b.max * (b.sign < 0 ? -1 : 1);
    // propellers
    for (const p of v.props) {
      p.hub.rotation.z += dt * fm.rpm * 160;
      const blur = smoothstep(0.25, 0.5, fm.rpm);
      p.blades.visible = blur < 0.98 || !cameraNear;
      (p.disc.material as THREE.MeshBasicMaterial).opacity = blur * (cameraNear ? 0.3 : 1);
    }
    // jet flames & nozzle glow
    v.flameUniforms.uThr.value = fm.thr;
    v.flameUniforms.uAB.value = fm.abOn;
    v.flameUniforms.uTime.value = this.t;
    for (const f of v.flames) { f.visible = fm.thr > 0.05; f.scale.set(1, 0.4 + fm.thr * 0.3 + fm.abOn * 0.9, 1); }
    v.body.traverse((o) => { if (o.name === 'nozzleGlow') ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = fm.thr * 0.4 + fm.abOn * 0.6; });
    // landing gear: retraction + suspension compression + wheel spin + steering
    v.gear.forEach((g, i) => {
      const gs = fm.gearState[i];
      const fold = 1 - fm.gear;
      g.root.quaternion.setFromAxisAngle(g.foldAxis, g.foldAngle * fold);
      g.root.visible = fm.gear > 0.02 && gs.hp > 0;
      const len = Math.abs(g.piston.position.y);
      void len;
      g.piston.position.y = -(g.root.position.y - (g.def.p[1] + g.def.wheelR)) + gs.compression;
      g.wheel.rotation.x = -gs.wheelAngle;
      if (g.def.steer) g.piston.rotation.y = -gs.steer;
    });
    // nav lights + strobes
    const navCol = v.nav.geometry.getAttribute('color') as THREE.BufferAttribute;
    const strobe = this.lightsOn && (this.t % 1.2 < 0.06 || (this.t % 1.2 > 0.16 && this.t % 1.2 < 0.22));
    const on = this.lightsOn ? 1 : 0;
    navCol.setXYZ(0, on, 0.05 * on, 0.05 * on); navCol.setXYZ(1, 0.05 * on, on, 0.2 * on); navCol.setXYZ(2, on, on, on);
    navCol.setXYZ(3, strobe ? 3 : 0, strobe ? 3 : 0, strobe ? 3 : 0); navCol.setXYZ(4, strobe ? 3 : 0, strobe ? 3 : 0, strobe ? 3 : 0);
    const beacon = this.lightsOn && Math.sin(this.t * 7) > 0.7;
    navCol.setXYZ(5, beacon ? 2 : 0, 0, 0);
    navCol.needsUpdate = true;
    if (v.landingLight) v.landingLight.intensity = this.lightsOn && fm.gear > 0.9 ? 400 * (0.15 + night) : 0;

    // part loss visuals
    if (fm.hp.wingL <= 0 && !this.lostL) { this.lostL = true; v.wingL.visible = false; fx?.explosion(this.worldPoint(v.tipL.clone().multiplyScalar(0.5)), 0.7, fm.vel); }
    if (fm.hp.wingR <= 0 && !this.lostR) { this.lostR = true; v.wingR.visible = false; fx?.explosion(this.worldPoint(v.tipR.clone().multiplyScalar(0.5)), 0.7, fm.vel); }
    if (fm.hp.tail <= 0 && !this.lostTail) { this.lostTail = true; v.tail.visible = false; fx?.explosion(this.worldPoint(new THREE.Vector3(0, 1, this.spec.geom.length * 0.4)), 0.7, fm.vel); }

    if (!fx) return;
    // damage smoke / fire
    this.smokeAcc += dt;
    const engDmg = 1 - fm.hp.engine / 100;
    if (this.smokeAcc > 0.03) {
      this.smokeAcc = 0;
      const tail = this.worldPoint(v.nozzles[0] ?? new THREE.Vector3(0, 0, this.spec.geom.length * 0.45));
      if (engDmg > 0.35 || fm.hp.fuselage < 50) fx.trailSmoke(tail, fm.vel, Math.min(1, engDmg * 1.2), 1 + engDmg);
      if (fm.hp.engine <= 0 || fm.hp.fuselage < 25) fx.flame(tail, fm.vel, 1.6);
      if (this.lostL) fx.trailSmoke(this.worldPoint(v.tipL.clone().multiplyScalar(0.45)), fm.vel, 0.9, 1);
      if (this.lostR) fx.trailSmoke(this.worldPoint(v.tipR.clone().multiplyScalar(0.45)), fm.vel, 0.9, 1);
      if (this.smokeOn) fx.smoke.emit(this.worldPoint(new THREE.Vector3(0, 0, this.spec.geom.length * 0.5)), fm.vel.clone().multiplyScalar(0.1), 6, 1.5, 9, this.smokeColor.r, this.smokeColor.g, this.smokeColor.b, 0.8, 0.4, 0.3);
      // ground effects: dust / spray when low and fast
      if (fm.agl < 25 && fm.tas > 25) {
        const below = fm.pos.clone(); below.y = fm.groundH + 0.5;
        fx.dust(below, fm.vel, (1 - fm.agl / 25) * 0.8, fm.groundH <= 0.01);
      }
      fm.gearState.forEach((gs) => { if (gs.skid && gs.contact) fx.tireSmoke(gs.worldPos, 2); });
    }
    // wingtip vortices at high G / high alpha, contrails at altitude
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(fm.quat);
    const vortex = smoothstep(3, 6, Math.abs(fm.gLoad)) * smoothstep(40, 90, fm.tas) + smoothstep(0.25, 0.45, fm.alpha) * 0.6;
    const humid = smoothstep(0, 1, 1);
    [v.tipL, v.tipR].forEach((tip, i) => this.vortices[i].push(this.worldPoint(tip), right, Math.min(0.55, vortex * 0.55 * humid)));
    const contrail = smoothstep(7500, 9000, fm.pos.y) * smoothstep(0.2, 0.5, fm.thr);
    const nz = v.nozzles.length ? v.nozzles : [new THREE.Vector3(0, 0, this.spec.geom.length * 0.5)];
    for (let i = 0; i < 2; i++) this.contrails[i].push(this.worldPoint(nz[Math.min(i, nz.length - 1)].clone().add(new THREE.Vector3(0, 0, 8))), right, contrail * 0.7);
    for (const r of [...this.vortices, ...this.contrails]) r.update(dt);
  }

  worldPoint(local: THREE.Vector3) { return local.clone().applyQuaternion(this.fm.quat).add(this.fm.pos); }
}

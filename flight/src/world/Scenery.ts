import * as THREE from 'three';
import { terrainHeight, isFlatZone, CITY, climate } from './WorldDef';
import { hash01, fbm, mulberry32 } from '../core/math';
import { LightField } from './Airport';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Obstacle { x: number; z: number; y0: number; h: number; r: number; name: string }

function colorize(g: THREE.BufferGeometry, c: THREE.Color) {
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

function conifer() {
  const parts = [colorize(new THREE.CylinderGeometry(0.25, 0.35, 3, 5).translate(0, 1.5, 0), new THREE.Color(0.25, 0.17, 0.1))];
  for (let i = 0; i < 3; i++) parts.push(colorize(new THREE.ConeGeometry(2.6 - i * 0.6, 4.2, 7).translate(0, 3.2 + i * 2.4, 0), new THREE.Color(0.11, 0.2 - i * 0.01, 0.09)));
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
}
function broadleaf() {
  const crown = new THREE.IcosahedronGeometry(3, 1);
  const p = crown.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const n = hash01(Math.round(p.getX(i) * 10), Math.round(p.getY(i) * 10 + p.getZ(i) * 7));
    p.setXYZ(i, p.getX(i) * (0.85 + n * 0.3), p.getY(i) * 0.8 * (0.85 + n * 0.3), p.getZ(i) * (0.85 + n * 0.3));
  }
  crown.computeVertexNormals();
  return mergeGeometries([
    colorize(new THREE.CylinderGeometry(0.3, 0.45, 3.5, 5).translate(0, 1.75, 0), new THREE.Color(0.28, 0.2, 0.12)).toNonIndexed(),
    colorize(crown.translate(0, 5.2, 0), new THREE.Color(0.16, 0.26, 0.09)).toNonIndexed(),
  ])!;
}

export class Scenery {
  readonly group = new THREE.Group();
  readonly obstacles: Obstacle[] = [];
  readonly lights = new LightField();
  private trees: THREE.InstancedMesh[];
  private treeCenter = new THREE.Vector2(1e9, 1e9);
  private gen: Generator<void, void, unknown> | null = null;
  private rotors: THREE.Object3D[] = [];
  private balloons: { o: THREE.Object3D; base: THREE.Vector3; ph: number }[] = [];
  private boats: { o: THREE.Object3D; r: number; c: THREE.Vector2; ph: number; sp: number }[] = [];
  private towerLights: number[] = [];
  maxTrees = 6000;
  radius = 2600;
  private t = 0;

  constructor(maxTrees: number) {
    this.maxTrees = maxTrees;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    this.trees = [conifer(), broadleaf()].map((g) => {
      const m = new THREE.InstancedMesh(g, mat, Math.ceil(maxTrees / 2));
      m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      this.group.add(m);
      return m;
    });
    this.buildTurbines();
    this.buildTowers();
    this.buildBalloons();
    this.buildLighthouse();
    this.buildBoats();
    this.lights.finish();
    this.group.add(this.lights.points);
  }

  private *treeGen(cx: number, cz: number): Generator<void, void, unknown> {
    const CELL = 34, R = this.radius;
    const mats: THREE.Matrix4[][] = [[], []];
    const cols: THREE.Color[][] = [[], []];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const i0 = Math.floor((cx - R) / CELL), i1 = Math.floor((cx + R) / CELL);
    const j0 = Math.floor((cz - R) / CELL), j1 = Math.floor((cz + R) / CELL);
    let t0 = performance.now();
    const per = this.maxTrees / 2;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = (i + hash01(i, j * 7 + 3)) * CELL, z = (j + hash01(i * 5 + 1, j)) * CELL;
        const dx = x - cx, dz = z - cz;
        if (dx * dx + dz * dz > R * R) continue;
        const forest = fbm(x * 0.0011 + 4, z * 0.0011 - 2, 2) * 0.5 + 0.5;
        const pick = hash01(i * 13 + 7, j * 17 + 1);
        if (pick > (forest - 0.38) * 2.6) continue;
        if (isFlatZone(x, z)) continue;
        const h = terrainHeight(x, z);
        if (h < 4 || h > 1500) continue;
        if (Math.abs(x) > 25000 || Math.abs(z) > 25000) { const cl = climate(x, z); if (cl.dry > 0.35 || pick > 1 - cl.cold * 0.8) continue; }
        const hx = terrainHeight(x + 4, z) - h, hz = terrainHeight(x, z + 4) - h;
        if (Math.hypot(hx, hz) > 3.4) continue;
        const type = h > 380 || forest > 0.72 ? 0 : hash01(i, j) < 0.35 ? 0 : 1;
        if (mats[type].length >= per) continue;
        const sc = 0.8 + hash01(i * 3, j * 3) * 1.1;
        q.setFromAxisAngle(up, hash01(i * 9, j) * 6.28);
        s.set(sc, sc * (0.85 + hash01(i, j * 11) * 0.4), sc);
        p.set(x, h - 0.3, z);
        mats[type].push(m.compose(p, q, s).clone());
        const tint = 0.75 + hash01(i * 2, j * 5) * 0.5;
        cols[type].push(new THREE.Color(tint, tint * (0.95 + hash01(i, j * 2) * 0.1), tint * 0.9));
      }
      if (performance.now() - t0 > 3) { yield; t0 = performance.now(); }
    }
    this.trees.forEach((tm, k) => {
      tm.count = mats[k].length;
      mats[k].forEach((mm, n) => { tm.setMatrixAt(n, mm); tm.setColorAt(n, cols[k][n]); });
      tm.instanceMatrix.needsUpdate = true;
      if (tm.instanceColor) tm.instanceColor.needsUpdate = true;
    });
  }

  private buildTurbines() {
    const white = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.45, metalness: 0.2 });
    const r = mulberry32(5);
    for (let i = 0; i < 14; i++) {
      const x = -1200 + i * 330 + (r() - 0.5) * 100, z = -3600 - (i % 2) * 260 + (r() - 0.5) * 120;
      const h = terrainHeight(x, z);
      if (h < 5) continue;
      const g = new THREE.Group();
      g.position.set(x, h, z);
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, 80, 12), white); tower.position.y = 40; tower.castShadow = true;
      const nac = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 9), white); nac.position.set(0, 81, 0);
      const rotor = new THREE.Group(); rotor.position.set(0, 81, -4.8);
      for (let b = 0; b < 3; b++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(1.6, 38, 0.4).translate(0, 19, 0), white);
        blade.rotation.z = (b * Math.PI * 2) / 3; blade.castShadow = true;
        rotor.add(blade);
      }
      rotor.add(new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), white));
      g.add(tower, nac, rotor);
      g.rotation.y = 0.35;
      this.rotors.push(rotor);
      this.group.add(g);
      this.obstacles.push({ x, z, y0: h, h: 120, r: 22, name: '풍력 발전기' });
      this.towerLights.push(this.lights.add(x, h + 84, z, 1, 0.05, 0.03));
    }
  }

  private buildTowers() {
    const red = new THREE.MeshStandardMaterial({ color: 0xc83a2a, roughness: 0.6, metalness: 0.4 });
    const wht = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.6, metalness: 0.4 });
    for (const [x, z, hh] of [[-3200, -1200, 180], [6400, -5200, 220], [1500, -6800, 160]] as const) {
      const h = terrainHeight(x, z);
      const segs = 8;
      for (let s = 0; s < segs; s++) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(1.4 - s * 0.12, 1.5 - s * 0.12, hh / segs, 4), s % 2 ? wht : red);
        m.position.set(x, h + (s + 0.5) * (hh / segs), z);
        m.castShadow = true;
        this.group.add(m);
      }
      this.obstacles.push({ x, z, y0: h, h: hh, r: 4, name: '송신탑' });
      this.towerLights.push(this.lights.add(x, h + hh + 1, z, 1, 0.05, 0.03));
      this.towerLights.push(this.lights.add(x, h + hh * 0.5, z, 1, 0.05, 0.03));
    }
  }

  private buildBalloons() {
    const r = mulberry32(42);
    const cols = [0xe63946, 0xf4a261, 0x2a9d8f, 0xffd166, 0x7b2cbf, 0x118ab2];
    for (let i = 0; i < 6; i++) {
      const o = new THREE.Group();
      const env = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 14), new THREE.MeshStandardMaterial({ color: cols[i], roughness: 0.6 }));
      env.scale.y = 1.15;
      const stripe = new THREE.Mesh(new THREE.SphereGeometry(9.05, 20, 14, 0, Math.PI * 2, 1.2, 0.5), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
      stripe.scale.y = 1.15;
      const basket = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 2), new THREE.MeshStandardMaterial({ color: 0x6b4a2b }));
      basket.position.y = -14;
      env.castShadow = true;
      o.add(env, stripe, basket);
      const base = new THREE.Vector3(-3000 + r() * 2400, 0, -4200 + r() * 2000);
      base.y = Math.max(terrainHeight(base.x, base.z), 0) + 160 + r() * 260;
      o.position.copy(base);
      this.group.add(o);
      this.balloons.push({ o, base, ph: r() * 6 });
    }
  }

  private buildLighthouse() {
    let x = -1400, z = 3000, last = z;
    for (; z < 12000; z += 20) { if (terrainHeight(x, z) < 1) break; last = z; }
    z = last;
    const h = terrainHeight(x, z);
    const g = new THREE.Group(); g.position.set(x, h, z);
    for (let s = 0; s < 6; s++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(3.4 - s * 0.3, 3.7 - s * 0.3, 6, 16), new THREE.MeshStandardMaterial({ color: s % 2 ? 0xffffff : 0xc0262d, roughness: 0.6 }));
      m.position.y = 3 + s * 6; m.castShadow = true; g.add(m);
    }
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3, 12), new THREE.MeshStandardMaterial({ color: 0x223, metalness: 0.9, roughness: 0.1 }));
    lamp.position.y = 37.5; g.add(lamp);
    this.group.add(g);
    this.towerLights.push(this.lights.add(x, h + 38, z, 1.5, 1.4, 1.0));
    this.obstacles.push({ x, z, y0: h, h: 40, r: 5, name: '등대' });
  }

  private buildBoats() {
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x2d3e50, roughness: 0.6, metalness: 0.3 });
    const topMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 });
    const r = mulberry32(9);
    for (let i = 0; i < 5; i++) {
      const o = new THREE.Group();
      const L = 40 + r() * 80;
      const hull = new THREE.Mesh(new THREE.BoxGeometry(L * 0.18, 5, L), hullMat); hull.position.y = 1.5;
      const top = new THREE.Mesh(new THREE.BoxGeometry(L * 0.15, 6, L * 0.25), topMat); top.position.set(0, 6, L * 0.25);
      hull.castShadow = top.castShadow = true;
      o.add(hull, top);
      this.group.add(o);
      this.boats.push({ o, r: 2500 + r() * 6000, c: new THREE.Vector2(-2000 + r() * 4000, 12000 + r() * 4000), ph: r() * 6.28, sp: 0.004 + r() * 0.004 });
    }
  }

  update(dt: number, focus: THREE.Vector3, night: number, density: number) {
    this.t += dt;
    if (density > 0) {
      if (!this.gen && this.treeCenter.distanceTo(new THREE.Vector2(focus.x, focus.z)) > this.radius * 0.3) {
        this.treeCenter.set(focus.x, focus.z);
        this.gen = this.treeGen(focus.x, focus.z);
      }
      if (this.gen) { if (this.gen.next().done) this.gen = null; }
    }
    this.trees.forEach((t) => (t.visible = density > 0));
    for (const r of this.rotors) r.rotation.z += dt * 1.4;
    for (const b of this.balloons) {
      b.o.position.set(b.base.x + Math.sin(this.t * 0.02 + b.ph) * 300, b.base.y + Math.sin(this.t * 0.15 + b.ph) * 10, b.base.z + Math.cos(this.t * 0.017 + b.ph) * 260);
    }
    for (const b of this.boats) {
      b.ph += b.sp * dt;
      b.o.position.set(b.c.x + Math.cos(b.ph) * b.r, 0, b.c.y + Math.sin(b.ph) * b.r);
      b.o.rotation.y = -b.ph;
    }
    const blink = Math.sin(this.t * 2.5) > 0.2;
    this.lights.apply(0.3 + night, () => (blink ? 1.5 : 0.1));
    void CITY;
  }
}

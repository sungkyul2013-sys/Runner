import * as THREE from 'three';
import { CITY } from './WorldDef';
import { mulberry32, smoothstep } from '../core/math';
import { LightField } from './Airport';
import type { Effects } from '../combat/Effects';

export interface Building {
  id: number; x: number; z: number; w: number; d: number; h: number; y0: number;
  hp: number; maxHp: number; alive: boolean; collapse: number; target: boolean; color: THREE.Color;
}

function facadeTextures() {
  const W = 256, H = 512;
  const c = document.createElement('canvas'), e = document.createElement('canvas');
  c.width = e.width = W; c.height = e.height = H;
  const g = c.getContext('2d')!, ge = e.getContext('2d')!;
  const r = mulberry32(11);
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, W, H);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  const cols = 8, rows = 16, cw = W / cols, rh = H / rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const v = 25 + r() * 30;
    g.fillStyle = `rgb(${v},${v + 8},${v + 18})`;
    g.fillRect(x * cw + 4, y * rh + 6, cw - 8, rh - 11);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(x * cw + 4, y * rh + 6, cw - 8, 3);
    if (r() < 0.38) {
      const warm = r();
      ge.fillStyle = warm < 0.7 ? `rgb(255,${190 + r() * 40},${110 + r() * 50})` : `rgb(${170 + r() * 40},${200 + r() * 30},255)`;
      ge.fillRect(x * cw + 4, y * rh + 6, cw - 8, rh - 11);
    }
  }
  const t = new THREE.CanvasTexture(c), te = new THREE.CanvasTexture(e);
  for (const k of [t, te]) { k.wrapS = k.wrapT = THREE.RepeatWrapping; k.colorSpace = THREE.SRGBColorSpace; k.anisotropy = 8; }
  return { t, te };
}

export class City {
  readonly group = new THREE.Group();
  readonly buildings: Building[] = [];
  readonly lights = new LightField();
  private mesh: THREE.InstancedMesh;
  private grid = new Map<string, number[]>();
  private nightU = { value: 0 };
  private _m = new THREE.Matrix4();
  private spireLight = 0;
  private t = 0;

  constructor() {
    const r = mulberry32(2024);
    const { t, te } = facadeTextures();
    const mat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: te, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.55, metalness: 0.35 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = this.nightU;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBPos; varying vec3 vBN;')
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vec4 bw = modelMatrix * instanceMatrix * vec4(transformed,1.0); vBPos = bw.xyz; vBN = normalize(mat3(instanceMatrix)*normal);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBPos; varying vec3 vBN; uniform float uNight;')
        .replace('#include <map_fragment>', `
          vec2 fuv = abs(vBN.x) > 0.5 ? vec2(vBPos.z, vBPos.y) : vec2(vBPos.x, vBPos.y);
          fuv = fuv / vec2(32.0, 56.0);
          float roof = step(0.5, vBN.y);
          vec4 fac = texture2D(map, fuv);
          diffuseColor.rgb *= mix(fac.rgb*1.6, vec3(0.32), roof);`)
        .replace('#include <emissivemap_fragment>', `
          vec3 em = texture2D(emissiveMap, fuv + vec2(floor(vBPos.x*0.013+vBPos.z*0.007)*0.37, 0.0)).rgb;
          totalEmissiveRadiance = em * uNight * 2.2 * (1.0-roof);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.12, (1.0-roof)*step(fac.r, 0.25)*0.85);`);
    };

    // generate blocks
    const block = 140, road = 22;
    const nx = Math.floor((CITY.hx * 2) / block), nz = Math.floor((CITY.hz * 2) / block);
    const x0 = CITY.cx - CITY.hx, z0 = CITY.cz - CITY.hz;
    const roads = new THREE.Group();
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x2b2c2e, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
    const roadGeo = new THREE.PlaneGeometry(1, 1); roadGeo.rotateX(-Math.PI / 2);
    const rn = new THREE.InstancedMesh(roadGeo, roadMat, nx + nz + 2);
    let ri = 0;
    for (let i = 0; i <= nx; i++) { this._m.compose(new THREE.Vector3(x0 + i * block, CITY.elev + 0.35, CITY.cz), new THREE.Quaternion(), new THREE.Vector3(road, 1, CITY.hz * 2)); rn.setMatrixAt(ri++, this._m); }
    for (let j = 0; j <= nz; j++) { this._m.compose(new THREE.Vector3(CITY.cx, CITY.elev + 0.36, z0 + j * block), new THREE.Quaternion(), new THREE.Vector3(CITY.hx * 2, 1, road)); rn.setMatrixAt(ri++, this._m); }
    rn.receiveShadow = true;
    roads.add(rn);
    for (let i = 0; i <= nx; i++) for (let z = z0; z < z0 + CITY.hz * 2; z += 45) this.lights.add(x0 + i * block + road / 2 - 1, CITY.elev + 9, z, 1, 0.62, 0.25);
    for (let j = 0; j <= nz; j++) for (let x = x0; x < x0 + CITY.hx * 2; x += 45) this.lights.add(x, CITY.elev + 9, z0 + j * block + road / 2 - 1, 1, 0.62, 0.25);
    this.group.add(roads);

    const palette = [new THREE.Color(0.75, 0.75, 0.78), new THREE.Color(0.55, 0.62, 0.72), new THREE.Color(0.8, 0.72, 0.62), new THREE.Color(0.42, 0.46, 0.5), new THREE.Color(0.68, 0.6, 0.55), new THREE.Color(0.35, 0.45, 0.55)];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const bx = x0 + i * block + road / 2, bz = z0 + j * block + road / 2, bs = block - road;
      const dcen = Math.hypot(bx + bs / 2 - CITY.cx, (bz + bs / 2 - CITY.cz) * 0.8) / Math.max(CITY.hx, CITY.hz);
      const tall = smoothstep(1.0, 0.0, dcen);
      if (r() < 0.06) continue; // park
      const split = r() < 0.55 ? 2 : 1;
      const cs = bs / split;
      for (let a = 0; a < split; a++) for (let b = 0; b < split; b++) {
        const w = cs * (0.62 + r() * 0.3), d = cs * (0.62 + r() * 0.3);
        const h = Math.max(12, (14 + r() * 30 + Math.pow(r(), 2.2) * 230 * tall + tall * 40) * (split === 2 ? 0.75 : 1));
        const cx = bx + a * cs + cs / 2, cz = bz + b * cs + cs / 2;
        this.addBuilding(cx, cz, w, d, h, palette[Math.floor(r() * palette.length)].clone().multiplyScalar(0.8 + r() * 0.3));
      }
    }
    // landmark spire
    this.addBuilding(CITY.cx, CITY.cz, 46, 46, 320, new THREE.Color(0.45, 0.55, 0.65));
    this.spireLight = this.lights.add(CITY.cx, CITY.elev + 410, CITY.cz, 1, 0.08, 0.05);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 3, 90, 8), new THREE.MeshStandardMaterial({ color: 0xb8c4cc, metalness: 0.9, roughness: 0.2 }));
    spire.position.set(CITY.cx, CITY.elev + 365, CITY.cz);
    this.group.add(spire);

    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    this.mesh = new THREE.InstancedMesh(geo, mat, this.buildings.length);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    for (const b of this.buildings) { this.writeMatrix(b); this.mesh.setColorAt(b.id, b.color); }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.mesh);
    this.lights.finish();
    this.group.add(this.lights.points);
  }

  private addBuilding(x: number, z: number, w: number, d: number, h: number, color: THREE.Color) {
    const b: Building = { id: this.buildings.length, x, z, w, d, h, y0: CITY.elev, hp: 60 + h * 2.2, maxHp: 60 + h * 2.2, alive: true, collapse: 0, target: false, color };
    this.buildings.push(b);
    const k0x = Math.floor((x - w / 2) / 200), k1x = Math.floor((x + w / 2) / 200), k0z = Math.floor((z - d / 2) / 200), k1z = Math.floor((z + d / 2) / 200);
    for (let i = k0x; i <= k1x; i++) for (let j = k0z; j <= k1z; j++) {
      const k = `${i},${j}`;
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k)!.push(b.id);
    }
  }

  private writeMatrix(b: Building) {
    const h = b.alive ? b.h * (1 - b.collapse) : Math.min(b.h, 6) ;
    this._m.makeScale(b.w, Math.max(h, 2), b.d).setPosition(b.x, b.y0 - (b.alive ? 0 : 0), b.z);
    this.mesh.setMatrixAt(b.id, this._m);
  }

  /** Returns the building whose volume contains the point (with margin). */
  hit(p: THREE.Vector3, margin = 0): Building | null {
    const list = this.grid.get(`${Math.floor(p.x / 200)},${Math.floor(p.z / 200)}`);
    if (!list) return null;
    for (const id of list) {
      const b = this.buildings[id];
      const top = b.y0 + (b.alive ? b.h * (1 - b.collapse) : 6);
      if (Math.abs(p.x - b.x) < b.w / 2 + margin && Math.abs(p.z - b.z) < b.d / 2 + margin && p.y < top + margin && p.y > b.y0 - 5) return b;
    }
    return null;
  }

  damage(b: Building, amount: number, at: THREE.Vector3, fx: Effects): boolean {
    if (!b.alive || b.collapse > 0) return false;
    b.hp -= amount;
    if (b.hp <= 0) {
      b.collapse = 0.0001;
      fx.explosion(at, 2.2);
      fx.addFire(new THREE.Vector3(b.x, b.y0 + 2, b.z), Math.min(4, b.w / 10), 60);
      return true;
    }
    return false;
  }

  update(dt: number, night: number, fx: Effects) {
    this.t += dt;
    this.nightU.value = night;
    let dirty = false;
    for (const b of this.buildings) {
      if (b.collapse > 0 && b.alive) {
        b.collapse = Math.min(1, b.collapse + dt * 0.28);
        if (Math.random() < 0.6) fx.dust(new THREE.Vector3(b.x + (Math.random() - 0.5) * b.w, b.y0 + b.h * (1 - b.collapse), b.z + (Math.random() - 0.5) * b.d), new THREE.Vector3(), 1);
        if (Math.random() < 0.15) fx.hitSparks(new THREE.Vector3(b.x, b.y0 + b.h * (1 - b.collapse), b.z), 4);
        if (b.collapse >= 1) { b.alive = false; b.color.multiplyScalar(0.3); this.mesh.setColorAt(b.id, b.color); if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
        this.writeMatrix(b);
        dirty = true;
      }
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
    const blink = Math.sin(this.t * 3) > 0.3;
    this.lights.apply(night * 1.3, (i) => (i === this.spireLight ? (blink ? 2.5 / Math.max(night * 1.3, 0.3) : 0) : 1));
    (this.lights.points.material as THREE.PointsMaterial).size = 3 + night * 3;
  }

  reset() {
    for (const b of this.buildings) {
      if (b.collapse > 0 || !b.alive || b.hp < b.maxHp) {
        if (!b.alive) b.color.multiplyScalar(1 / 0.3);
        b.alive = true; b.collapse = 0; b.hp = b.maxHp;
        this.writeMatrix(b);
        this.mesh.setColorAt(b.id, b.color);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

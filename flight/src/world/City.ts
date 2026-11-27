// Real-world downtown: Gangnam/Songpa (Seoul) from OpenStreetMap — © OpenStreetMap contributors (ODbL).
// All buildings live in ONE merged geometry; a per-building state texture drives collapse in the vertex shader.
import * as THREE from 'three';
import { CITY } from './WorldDef';
import { mulberry32, hash01 } from '../core/math';
import { LightField, asphaltTexture } from './Airport';
import { seoul, polyArea } from './SeoulData';
import waterUrl from '../assets/waternormals.jpg';
import type { Effects } from '../combat/Effects';

export interface Building {
  id: number; x: number; z: number; w: number; d: number; h: number; y0: number; base: number;
  hp: number; maxHp: number; alive: boolean; collapse: number; target: boolean; color: THREE.Color;
}

const STATE_W = 128;
const FLOOR = 3.4;

/** 4-style facade atlas (256px columns): 0 glass office · 1 Korean apartment · 2 commercial ribbon · 3 low-rise brick. */
function facadeTextures() {
  const T = 256, W = T * 4, H = 512, rows = 16, rh = H / rows;
  const c = document.createElement('canvas'), e = document.createElement('canvas');
  c.width = e.width = W; c.height = e.height = H;
  const g = c.getContext('2d')!, ge = e.getContext('2d')!;
  const r = mulberry32(11);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  const lit = (x: number, y: number, w: number, h: number, p: number) => {
    if (r() > p) return;
    const warm = r();
    ge.fillStyle = warm < 0.7 ? `rgb(255,${185 + r() * 45},${105 + r() * 55})` : `rgb(${165 + r() * 40},${205 + r() * 30},255)`;
    ge.fillRect(x, y, w, h);
  };
  // 0 — curtain-wall office: continuous glass, slim mullions, sky reflection gradient
  {
    const x0 = 0;
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#2c3d4e'); grd.addColorStop(0.5, '#1d2a37'); grd.addColorStop(1, '#2a3a48');
    g.fillStyle = grd; g.fillRect(x0, 0, T, H);
    for (let y = 0; y < rows; y++) {
      g.fillStyle = 'rgba(160,190,215,0.10)'; g.fillRect(x0, y * rh, T, 3);
      for (let x = 0; x < 8; x++) { g.fillStyle = `rgba(120,150,180,${0.04 + r() * 0.08})`; g.fillRect(x0 + x * 32 + 2, y * rh + 4, 28, rh - 6); lit(x0 + x * 32 + 2, y * rh + 4, 28, rh - 6, 0.45); }
    }
    g.fillStyle = 'rgba(200,215,230,0.35)';
    for (let x = 0; x <= 8; x++) g.fillRect(x0 + x * 32 - 1, 0, 2, H);
  }
  // 1 — Korean apartment block: white walls, balcony bands, stair-core stripe
  {
    const x0 = T;
    g.fillStyle = '#e8e4dc'; g.fillRect(x0, 0, T, H);
    for (let y = 0; y < rows; y++) {
      const yy = y * rh;
      g.fillStyle = '#d4cfc6'; g.fillRect(x0, yy + rh - 5, T, 5); // slab edge
      for (let x = 0; x < 4; x++) {
        const bx = x0 + x * 64 + 6;
        g.fillStyle = '#3a4550'; g.fillRect(bx, yy + 6, 44, rh - 14); // balcony glazing
        g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(bx, yy + 6, 44, 2); g.fillRect(bx + 21, yy + 6, 2, rh - 14);
        g.fillStyle = '#f3f1ec'; g.fillRect(bx - 2, yy + rh - 13, 48, 4); // railing
        lit(bx, yy + 6, 44, rh - 14, 0.55);
      }
      g.fillStyle = '#c9c3b8'; g.fillRect(x0 + 54, yy, 8, rh); // stair core
    }
    g.fillStyle = 'rgba(70,120,160,0.35)'; g.fillRect(x0 + 120, 0, 6, H); // painted accent stripe
  }
  // 2 — commercial: tan cladding, long ribbon windows
  {
    const x0 = T * 2;
    g.fillStyle = '#b7aa98'; g.fillRect(x0, 0, T, H);
    for (let y = 0; y < rows; y++) {
      const yy = y * rh;
      g.fillStyle = '#263039'; g.fillRect(x0, yy + 8, T, rh - 16);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x0, yy + 8, T, 2);
      for (let x = 0; x < 6; x++) { g.fillStyle = '#9d907e'; g.fillRect(x0 + x * 43, yy + 8, 3, rh - 16); }
      for (let x = 0; x < 6; x++) lit(x0 + x * 43 + 3, yy + 8, 40, rh - 16, 0.4);
    }
  }
  // 3 — low-rise brick with small windows and AC units
  {
    const x0 = T * 3;
    g.fillStyle = '#8a5a45'; g.fillRect(x0, 0, T, H);
    for (let y = 0; y < H; y += 4) { g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.05})`; g.fillRect(x0, y, T, 1); }
    for (let y = 0; y < rows; y++) {
      const yy = y * rh;
      for (let x = 0; x < 5; x++) {
        const bx = x0 + x * 51 + 10;
        g.fillStyle = '#e9e2d6'; g.fillRect(bx - 2, yy + 7, 30, rh - 12);
        g.fillStyle = '#2f353b'; g.fillRect(bx, yy + 9, 26, rh - 16);
        lit(bx, yy + 9, 26, rh - 16, 0.45);
        if (r() < 0.3) { g.fillStyle = '#d8d8d4'; g.fillRect(bx + 4, yy + rh - 9, 16, 6); }
      }
    }
  }
  const t = new THREE.CanvasTexture(c), te = new THREE.CanvasTexture(e);
  for (const k of [t, te]) { k.wrapS = k.wrapT = THREE.ClampToEdgeWrapping; k.colorSpace = THREE.SRGBColorSpace; k.anisotropy = 8; }
  return { t, te };
}

function triangulate(ring: [number, number][], holes: [number, number][][] = []) {
  const c = ring.map(([x, z]) => new THREE.Vector2(x, z));
  const hs = holes.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
  return { tris: THREE.ShapeUtils.triangulateShape(c, hs), pts: [...c, ...hs.flat()] };
}

export class City {
  readonly group = new THREE.Group();
  readonly buildings: Building[] = [];
  readonly lights = new LightField();
  private grid = new Map<string, number[]>();
  private nightU = { value: 0 };
  private timeU = { value: 0 };
  private stateTex: THREE.DataTexture;
  private state: Uint8Array<ArrayBuffer>;
  private stateDirty = false;
  private beacons: number[] = [];
  private t = 0;
  private waterMat: THREE.MeshStandardMaterial | null = null;
  private bmesh: THREE.Mesh | null = null;

  constructor() {
    const data = seoul();
    const nB = data.buildings.length;
    const rows = Math.ceil(nB / STATE_W);
    this.state = new Uint8Array(STATE_W * rows * 4);
    this.stateTex = new THREE.DataTexture(this.state, STATE_W, rows, THREE.RGBAFormat);
    this.stateTex.needsUpdate = true;

    this.buildGround(data);
    this.buildRoads(data);
    this.buildBuildings(data);
    this.lights.finish();
    this.group.add(this.lights.points);
  }

  /* ---------------- ground layers: parks, water ---------------- */
  private buildGround(data: ReturnType<typeof seoul>) {
    const layer = (polys: typeof data.parks, y: number, mat: THREE.Material, minArea: number) => {
      const pos: number[] = [], idx: number[] = [];
      for (const p of polys) {
        if (Math.abs(polyArea(p.ring)) < minArea) continue;
        const { tris, pts } = triangulate(p.ring, p.holes);
        const b = pos.length / 3;
        for (const v of pts) pos.push(v.x, y, v.y);
        for (const t of tris) idx.push(b + t[0], b + t[2], b + t[1]);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      // force up-facing normals
      const n = g.getAttribute('normal');
      for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
      const uv = new Float32Array((pos.length / 3) * 2);
      for (let i = 0; i < pos.length / 3; i++) { uv[i * 2] = pos[i * 3] / 40; uv[i * 2 + 1] = pos[i * 3 + 2] / 40; }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    const parkMat = new THREE.MeshStandardMaterial({ color: 0x3f5a2a, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    layer(data.parks, CITY.elev + 0.25, parkMat, 200);
    const nrm = new THREE.TextureLoader().load(waterUrl);
    nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping;
    nrm.repeat.set(1, 1);
    this.waterMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, color: 0x0f3a46, roughness: 0.05, metalness: 0, normalMap: nrm, normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 1.2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    layer(data.water, CITY.elev + 0.35, this.waterMat, 400);
  }

  /* ---------------- roads + street lights ---------------- */
  private buildRoads(data: ReturnType<typeof seoul>) {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const lane: number[] = [], lidx: number[] = [];
    const y = CITY.elev + 0.42;
    for (const r of data.roads) {
      let acc = 0;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [x0, z0] = r.pts[i], [x1, z1] = r.pts[i + 1];
        const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
        if (L < 0.5) continue;
        const nx = (-dz / L) * r.w * 0.5, nz = (dx / L) * r.w * 0.5;
        const b = pos.length / 3;
        // extend a little to hide joints
        const ex = (dx / L) * r.w * 0.3, ez = (dz / L) * r.w * 0.3;
        pos.push(x0 + nx - ex, y, z0 + nz - ez, x0 - nx - ex, y, z0 - nz - ez, x1 - nx + ex, y, z1 - nz + ez, x1 + nx + ex, y, z1 + nz + ez);
        uv.push(0, acc / 20, 1, acc / 20, 1, (acc + L) / 20, 0, (acc + L) / 20);
        idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
        if (r.w >= 14) {
          // dashed centre line
          for (let s = 0; s < L; s += 12) {
            const s1 = Math.min(L, s + 6);
            const ax = x0 + (dx * s) / L, az = z0 + (dz * s) / L, bx = x0 + (dx * s1) / L, bz = z0 + (dz * s1) / L;
            const lx = (-dz / L) * 0.18, lz = (dx / L) * 0.18;
            const lb = lane.length / 3;
            lane.push(ax + lx, y + 0.03, az + lz, ax - lx, y + 0.03, az - lz, bx - lx, y + 0.03, bz - lz, bx + lx, y + 0.03, bz + lz);
            lidx.push(lb, lb + 2, lb + 1, lb, lb + 3, lb + 2);
          }
          // street lights on both sides
          for (let s = acc % 42; s < L; s += 42) {
            const px = x0 + (dx * s) / L, pz = z0 + (dz * s) / L;
            const ox = (-dz / L) * (r.w * 0.5 + 1), oz = (dx / L) * (r.w * 0.5 + 1);
            this.lights.add(px + ox, CITY.elev + 9, pz + oz, 1, 0.66, 0.3);
            this.lights.add(px - ox, CITY.elev + 9, pz - oz, 1, 0.66, 0.3);
          }
        }
        acc += L;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const tex = asphaltTexture(52);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, color: 0xc4c4ca, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    m.receiveShadow = true;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lane, 3));
    lg.setIndex(lidx);
    lg.computeVertexNormals();
    const lm = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ color: 0xd8c27a, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
    this.group.add(m, lm);
  }

  /* ---------------- buildings (merged) ---------------- */
  private buildBuildings(data: ReturnType<typeof seoul>) {
    const pos: number[] = [], nor: number[] = [], col: number[] = [], bid: number[] = [], base: number[] = [], glass: number[] = [], sty: number[] = [];
    const palette = {
      apt: [new THREE.Color(0.88, 0.86, 0.82), new THREE.Color(0.82, 0.8, 0.76), new THREE.Color(0.9, 0.88, 0.85)],
      office: [new THREE.Color(0.45, 0.55, 0.66), new THREE.Color(0.38, 0.47, 0.56), new THREE.Color(0.6, 0.65, 0.7), new THREE.Color(0.32, 0.38, 0.44)],
      other: [new THREE.Color(0.72, 0.68, 0.62), new THREE.Color(0.62, 0.6, 0.58), new THREE.Color(0.78, 0.74, 0.7), new THREE.Color(0.55, 0.52, 0.5)],
    };
    const y0 = CITY.elev;
    data.buildings.forEach((ob, id) => {
      let r = ob.ring;
      if (r.length < 3) return;
      // ensure counter-clockwise (in x/z, viewed from above with +z down → outward normals consistent)
      if (polyArea(r) < 0) r = [...r].reverse();
      const yb = y0 + ob.minH, yt = y0 + ob.h;
      const tall = ob.h > 80;
      const k = hash01(id * 7, id * 13);
      const pal = ob.kind === 1 ? palette.apt : tall || ob.kind === 3 ? palette.office : palette.other;
      const style = tall ? 0 : ob.kind === 1 ? 1 : ob.kind === 3 ? (k < 0.5 ? 0 : 2) : ob.h < 14 ? (k < 0.6 ? 3 : 2) : k < 0.35 ? 1 : k < 0.7 ? 2 : 3;
      const c = (style === 1 || style === 3 ? new THREE.Color(1, 1, 1) : pal[Math.floor(k * pal.length)].clone()).multiplyScalar(0.9 + hash01(id, 3) * 0.16);
      let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
      for (const [x, z] of r) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
      const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number, roof: number) => {
        pos.push(x, y, z); nor.push(nx, ny, nz);
        const cc = roof ? 0.55 : 1;
        col.push(c.r * cc, c.g * cc, c.b * cc);
        bid.push(id); base.push(yb); glass.push(style === 0 ? 1 : 0); sty.push(style);
      };
      // walls
      for (let i = 0; i < r.length; i++) {
        const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length];
        const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
        // outward normal for CCW ring in x/z: (dz, -dx)
        const nx = dz / L, nz = -dx / L;
        push(ax, yb, az, nx, 0, nz, 0); push(bx, yt, bz, nx, 0, nz, 0); push(bx, yb, bz, nx, 0, nz, 0);
        push(ax, yb, az, nx, 0, nz, 0); push(ax, yt, az, nx, 0, nz, 0); push(bx, yt, bz, nx, 0, nz, 0);
      }
      // roof
      const { tris, pts } = triangulate(r);
      for (const t of tris) {
        const a = pts[t[0]], b = pts[t[1]], cc = pts[t[2]];
        push(a.x, yt, a.y, 0, 1, 0, 1); push(cc.x, yt, cc.y, 0, 1, 0, 1); push(b.x, yt, b.y, 0, 1, 0, 1);
      }
      const area = Math.abs(polyArea(r));
      const b: Building = {
        id, x: (minx + maxx) / 2, z: (minz + maxz) / 2, w: maxx - minx, d: maxz - minz, h: ob.h, y0: y0 + ob.minH, base: yb,
        hp: 60 + ob.h * 2.2 + Math.sqrt(area), maxHp: 60 + ob.h * 2.2 + Math.sqrt(area), alive: true, collapse: 0, target: false, color: c,
      };
      this.buildings.push(b);
      this.index(b);
      if (ob.h > 150) this.beacons.push(this.lights.add(b.x, yt + 3, b.z, 1, 0.08, 0.05));
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aBid', new THREE.Float32BufferAttribute(bid, 1));
    g.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 1));
    g.setAttribute('aGlass', new THREE.Float32BufferAttribute(glass, 1));
    g.setAttribute('aStyle', new THREE.Float32BufferAttribute(sty, 1));
    g.computeBoundingSphere();

    const { t, te } = facadeTextures();
    const mat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: te, emissive: 0xffffff, emissiveIntensity: 1, vertexColors: true, roughness: 0.6, metalness: 0.2 });
    const st = this.stateTex;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = this.nightU;
      sh.uniforms.uState = { value: st };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float aBid; attribute float aBase; attribute float aGlass; attribute float aStyle; varying float vStyle;
          uniform sampler2D uState;
          varying vec3 vBPos; varying vec3 vBN; varying float vGlass; varying float vH; varying float vDead; varying float vSeed;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          ivec2 sc = ivec2(int(mod(aBid, ${STATE_W}.0)), int(floor(aBid / ${STATE_W}.0)));
          vec4 stt = texelFetch(uState, sc, 0);
          float col = stt.r;
          vDead = stt.g;
          transformed.y = aBase + (transformed.y - aBase) * (1.0 - col * 0.96);
          transformed.x += sin(aBid * 12.7 + transformed.y * 0.05) * col * 2.0;
          vGlass = aGlass; vH = transformed.y - aBase; vSeed = aBid; vStyle = aStyle;`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vBPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vBN = normal;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uNight; varying vec3 vBPos; varying vec3 vBN; varying float vGlass; varying float vH; varying float vDead; varying float vSeed; varying float vStyle;
          float bh(float n){ return fract(sin(n)*43758.5453); }`)
        .replace('#include <map_fragment>', `
          float roof = step(0.5, vBN.y);
          float u = dot(vBPos.xz, vec2(-vBN.z, vBN.x));
          vec2 gg = vec2(u / 32.0 + bh(vSeed), vH / 54.4);
          vec2 fuv = vec2((fract(gg.x) + floor(vStyle + 0.5)) * 0.25, fract(gg.y));
          vec2 gdx = dFdx(gg) * vec2(0.25, 1.0), gdy = dFdy(gg) * vec2(0.25, 1.0);
          vec4 fac = textureGrad(map, fuv, gdx, gdy);
          float glassy = vGlass;
          vec3 wall = mix(fac.rgb * 1.15, fac.rgb * 1.05, glassy);
          // ground floor shopfronts
          wall = mix(wall, vec3(0.08,0.09,0.1), step(vH, 4.2) * (1.0-roof) * 0.7);
          diffuseColor.rgb *= mix(wall, vec3(0.42,0.42,0.43), roof);
          diffuseColor.rgb *= mix(1.0, 0.18, vDead);`)
        .replace('#include <emissivemap_fragment>', `
          vec3 em = textureGrad(emissiveMap, vec2(fuv.x, fract(fuv.y + floor(bh(vSeed*1.3)*8.0)/16.0)), gdx, gdy).rgb;
          float on = step(0.25, bh(vSeed * 3.1));
          totalEmissiveRadiance = em * uNight * 2.4 * (1.0 - roof) * step(4.2, vH) * on * (1.0 - vDead);
          totalEmissiveRadiance += vec3(1.0,0.45,0.15) * vDead * 0.25 * step(vH, 8.0) * (0.6 + 0.4*sin(vBPos.x*3.0 + vBPos.y));`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          float win = step(fac.r, 0.28) * step(fac.b, 0.4);
          roughnessFactor = mix(roughnessFactor, 0.06, (1.0 - roof) * max(win * 0.8, glassy * 0.9));`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
          metalnessFactor = mix(metalnessFactor, 0.85, (1.0 - roof) * glassy * 0.8);`);
    };
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    this.bmesh = mesh;
    this.group.add(mesh);
  }

  private index(b: Building) {
    const k0x = Math.floor((b.x - b.w / 2) / 200), k1x = Math.floor((b.x + b.w / 2) / 200), k0z = Math.floor((b.z - b.d / 2) / 200), k1z = Math.floor((b.z + b.d / 2) / 200);
    for (let i = k0x; i <= k1x; i++) for (let j = k0z; j <= k1z; j++) {
      const k = `${i},${j}`;
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k)!.push(b.id);
    }
  }

  /** Returns the building whose volume contains the point (with margin). */
  hit(p: THREE.Vector3, margin = 0): Building | null {
    const list = this.grid.get(`${Math.floor(p.x / 200)},${Math.floor(p.z / 200)}`);
    if (!list) return null;
    for (const id of list) {
      const b = this.buildings[id];
      const top = b.y0 + (b.alive ? (b.h - (b.y0 - CITY.elev)) * (1 - b.collapse * 0.96) : 4);
      if (Math.abs(p.x - b.x) < b.w / 2 * 0.85 + margin && Math.abs(p.z - b.z) < b.d / 2 * 0.85 + margin && p.y < top + margin && p.y > b.y0 - 3) return b;
    }
    return null;
  }

  damage(b: Building, amount: number, at: THREE.Vector3, fx: Effects): boolean {
    if (!b.alive || b.collapse > 0) return false;
    b.hp -= amount;
    if (b.hp <= 0) {
      b.collapse = 0.0001;
      fx.explosion(at, 2.2);
      fx.addFire(new THREE.Vector3(b.x, CITY.elev + 2, b.z), Math.min(4, Math.max(b.w, b.d) / 12), 60);
      return true;
    }
    return false;
  }

  private writeState(b: Building) {
    const i = b.id * 4;
    this.state[i] = Math.round(Math.min(1, b.collapse) * 255);
    this.state[i + 1] = b.alive ? (b.collapse > 0 ? Math.round(b.collapse * 255) : 0) : 255;
    this.stateDirty = true;
  }

  update(dt: number, night: number, fx: Effects, cam?: THREE.Vector3) {
    if (cam) this.group.visible = Math.hypot(cam.x - CITY.cx, cam.z - CITY.cz) < 42000;
    this.t += dt;
    this.nightU.value = night;
    this.timeU.value = this.t;
    if (this.waterMat?.normalMap) this.waterMat.normalMap.offset.set(this.t * 0.004, this.t * 0.0025);
    for (const b of this.buildings) {
      if (b.collapse > 0 && b.alive) {
        b.collapse = Math.min(1, b.collapse + dt * (0.22 + 8 / (b.h + 20)));
        const topY = CITY.elev + b.h * (1 - b.collapse);
        if (Math.random() < 0.7) fx.dust(new THREE.Vector3(b.x + (Math.random() - 0.5) * b.w, topY, b.z + (Math.random() - 0.5) * b.d), new THREE.Vector3(), 1);
        if (Math.random() < 0.5) fx.dust(new THREE.Vector3(b.x + (Math.random() - 0.5) * b.w * 1.5, CITY.elev + 2, b.z + (Math.random() - 0.5) * b.d * 1.5), new THREE.Vector3((Math.random() - 0.5) * 20, 0, (Math.random() - 0.5) * 20), 1);
        if (Math.random() < 0.15) fx.hitSparks(new THREE.Vector3(b.x, topY, b.z), 4);
        if (b.collapse >= 1) b.alive = false;
        this.writeState(b);
      }
    }
    if (this.stateDirty) { this.stateTex.needsUpdate = true; this.stateDirty = false; }
    const blink = Math.sin(this.t * 3) > 0.3;
    const bset = new Set(this.beacons);
    this.lights.apply(0.05 + night * 1.25, (i) => (bset.has(i) ? (blink ? 2.5 / Math.max(0.05 + night * 1.25, 0.3) : 0) : 1));
    (this.lights.points.material as THREE.PointsMaterial).size = 3 + night * 3;
  }

  reset() {
    for (const b of this.buildings) {
      if (b.collapse > 0 || !b.alive || b.hp < b.maxHp || b.target) {
        b.alive = true; b.collapse = 0; b.hp = b.maxHp; b.target = false;
        this.writeState(b);
      }
    }
    this.stateTex.needsUpdate = true;
  }
}

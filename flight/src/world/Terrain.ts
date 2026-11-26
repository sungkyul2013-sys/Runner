import * as THREE from 'three';
import { terrainHeight, WORLD_HALF, CITY, AIRPORT, RUNWAYS } from './WorldDef';
import { smoothstep, clamp, vnoise, fbm } from '../core/math';
import grassUrl from '../assets/grass.jpg';

const N = 32; // segments per chunk side

interface Node {
  key: string; x: number; z: number; size: number; level: number;
  mesh: THREE.Mesh | null; minH: number; maxH: number; lastUsed: number; queued: boolean;
}

const _c = new THREE.Color();
function shade(x: number, z: number, h: number, ny: number, out: Float32Array, o: number, gOut: Float32Array, go: number) {
  const slope = 1 - ny;
  const n1 = fbm(x * 0.0009, z * 0.0009, 2);
  const n2 = vnoise(x * 0.013, z * 0.013);
  let grass = 1;
  if (h < 0.5) {
    // seabed / lake bed
    _c.setRGB(0.36, 0.33, 0.25).multiplyScalar(0.7 + n2 * 0.1);
    grass = 0;
  } else {
    // base grass: lush ↔ dry
    const dry = smoothstep(-0.2, 0.6, n1);
    _c.setRGB(0.12 + dry * 0.16, 0.2 + dry * 0.08, 0.06 + dry * 0.02);
    _c.multiplyScalar(0.85 + n2 * 0.15);
    // alpine meadows darker
    const alp = smoothstep(500, 1100, h);
    _c.lerp(new THREE.Color(0.16, 0.17, 0.1), alp * 0.6);
    // sand beaches
    const beach = (1 - smoothstep(2.5, 9, h)) * (1 - smoothstep(0.15, 0.35, slope));
    if (beach > 0) { _c.lerp(new THREE.Color(0.62, 0.55, 0.4), beach); grass *= 1 - beach; }
    // rock on steep slopes
    const rock = smoothstep(0.18, 0.42, slope + n2 * 0.06);
    if (rock > 0) {
      const strata = 0.88 + 0.12 * Math.sin(h * 0.05 + n1 * 4);
      _c.lerp(new THREE.Color(0.3 * strata, 0.29 * strata, 0.28 * strata), rock);
      grass *= 1 - rock;
    }
    // snow line
    const snowLine = 1350 + n1 * 260;
    const snow = smoothstep(snowLine, snowLine + 220, h) * (1 - smoothstep(0.45, 0.7, slope));
    if (snow > 0) { _c.lerp(new THREE.Color(0.86, 0.88, 0.92), snow); grass *= 1 - snow; }
    // canyon floor reddish
    if (x > 7000 && h > 40) {
      const red = smoothstep(7000, 8200, x) * smoothstep(0.1, 0.4, slope) * (1 - snow);
      _c.lerp(new THREE.Color(0.48, 0.27, 0.16), red * 0.7);
    }
    // mowed airfield + city ground
    const ax = Math.abs(x - AIRPORT.cx - 160) - 560, az = Math.abs(z - AIRPORT.cz) - 2250;
    if (ax < 0 && az < 0) _c.lerp(new THREE.Color(0.17, 0.24, 0.08), 0.6);
    const cx = Math.abs(x - CITY.cx) - CITY.hx, cz = Math.abs(z - CITY.cz) - CITY.hz;
    if (cx < 0 && cz < 0) { _c.lerp(new THREE.Color(0.24, 0.24, 0.22), 0.85); grass *= 0.2; }
    const al = RUNWAYS[1];
    if (Math.abs(x - al.cx) < 60 && Math.abs(z - al.cz) < al.length / 2 + 50) _c.lerp(new THREE.Color(0.2, 0.24, 0.1), 0.5);
  }
  out[o] = _c.r; out[o + 1] = _c.g; out[o + 2] = _c.b;
  gOut[go] = grass;
}

export class Terrain {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  private nodes = new Map<string, Node>();
  private queue: Node[] = [];
  private frame = 0;
  splitFactor = 2.2;
  leafSize = 256;
  private rootSize = WORLD_HALF * 2;

  constructor() {
    const tex = new THREE.TextureLoader().load(grassUrl);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
    this.material.onBeforeCompile = (sh) => {
      sh.uniforms.uGrass = { value: tex };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aGrass; varying float vGrass; varying vec3 vWPos; varying vec3 vWN;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGrass=aGrass; vWPos=(modelMatrix*vec4(transformed,1.0)).xyz; vWN=normal;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uGrass; varying float vGrass; varying vec3 vWPos; varying vec3 vWN;
          float th(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
          float tn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
            return mix(mix(th(i),th(i+vec2(1,0)),f.x), mix(th(i+vec2(0,1)),th(i+vec2(1,1)),f.x), f.y); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float dist = length(vWPos - cameraPosition);
          vec3 g1 = texture2D(uGrass, vWPos.xz/28.0).rgb;
          vec3 g2 = texture2D(uGrass, vWPos.xz/190.0 + 0.37).rgb;
          vec3 gd = mix(g1, g2, smoothstep(80.0, 900.0, dist));
          float gl = dot(gd, vec3(0.3,0.59,0.11)) / 0.36;
          float near = 1.0 - smoothstep(2500.0, 9000.0, dist);
          diffuseColor.rgb *= mix(1.0, mix(1.0, gl, 0.85), vGrass*near);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*gd/vec3(0.32,0.4,0.18), vGrass*near*0.25*(1.0-smoothstep(60.0,400.0,dist)));
          // rock / snow micro detail
          vec3 bw = abs(normalize(vWN)); bw = pow(bw, vec3(4.0)); bw /= (bw.x+bw.y+bw.z);
          float rn = (tn(vWPos.zy*0.11)*0.6 + tn(vWPos.zy*0.55)*0.4)*bw.x + (tn(vWPos.xz*0.11)*0.6 + tn(vWPos.xz*0.6)*0.4)*bw.y + (tn(vWPos.xy*0.11)*0.6 + tn(vWPos.xy*0.55)*0.4)*bw.z;
          rn = mix(rn, 0.5 + 0.5*sin(vWPos.y*0.35 + tn(vWPos.xz*0.02)*6.0), 0.1*(1.0-bw.y));
          diffuseColor.rgb *= mix(1.0, 0.78 + rn*0.4, (1.0-vGrass)*(1.0-smoothstep(1500.0,7000.0,dist)));
          // macro variation to kill repetition at distance
          float mv = tn(vWPos.xz*0.0012)*0.5 + tn(vWPos.xz*0.0047)*0.5;
          diffuseColor.rgb *= 0.86 + mv*0.28;`);
    };
    this.group.name = 'terrain';
  }

  setQuality(split: number, leaf: number) {
    this.splitFactor = split;
    this.leafSize = leaf;
  }

  private getNode(x: number, z: number, size: number, level: number): Node {
    const key = `${level}:${x}:${z}`;
    let n = this.nodes.get(key);
    if (!n) {
      n = { key, x, z, size, level, mesh: null, minH: 0, maxH: 0, lastUsed: 0, queued: false };
      this.nodes.set(key, n);
    }
    return n;
  }

  private build(n: Node) {
    const S = N + 3;
    const cell = n.size / N;
    const pos = new Float32Array(S * S * 3);
    const nor = new Float32Array(S * S * 3);
    const col = new Float32Array(S * S * 3);
    const gra = new Float32Array(S * S);
    // heights grid with a 1-cell apron for normals: indices -1..N+1
    const G = N + 3;
    const hs = new Float32Array(G * G);
    const x0 = n.x - n.size / 2, z0 = n.z - n.size / 2;
    let minH = 1e9, maxH = -1e9;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const h = terrainHeight(x0 + (i - 1) * cell, z0 + (j - 1) * cell);
      hs[j * G + i] = h;
    }
    const skirt = Math.max(8, n.size * 0.02);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const gi = clamp(i - 1, 0, N), gj = clamp(j - 1, 0, N);
      const isSkirt = i === 0 || j === 0 || i === S - 1 || j === S - 1;
      const x = x0 + gi * cell, z = z0 + gj * cell;
      const hc = hs[(gj + 1) * G + gi + 1];
      const hl = hs[(gj + 1) * G + gi], hr = hs[(gj + 1) * G + gi + 2];
      const hd = hs[gj * G + gi + 1], hu = hs[(gj + 2) * G + gi + 1];
      let nx = hl - hr, ny = 2 * cell, nz = hd - hu;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const k = (j * S + i) * 3;
      pos[k] = x - n.x; pos[k + 1] = isSkirt ? hc - skirt : hc; pos[k + 2] = z - n.z;
      nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz;
      shade(x, z, hc, ny, col, k, gra, j * S + i);
      if (hc < minH) minH = hc;
      if (hc > maxH) maxH = hc;
    }
    const idx: number[] = [];
    for (let j = 0; j < S - 1; j++) for (let i = 0; i < S - 1; i++) {
      const a = j * S + i, b = a + 1, c = a + S, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aGrass', new THREE.BufferAttribute(gra, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.material);
    m.position.set(n.x, 0, n.z);
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    m.visible = false;
    this.group.add(m);
    n.mesh = m; n.minH = minH; n.maxH = maxH; n.queued = false;
  }

  private dist(n: Node, p: THREE.Vector3) {
    const dx = Math.max(Math.abs(p.x - n.x) - n.size / 2, 0);
    const dz = Math.max(Math.abs(p.z - n.z) - n.size / 2, 0);
    const dy = n.mesh ? Math.max(p.y - n.maxH, n.minH - p.y, 0) : Math.max(p.y, 0);
    return Math.sqrt(dx * dx + dz * dz + dy * dy);
  }

  private visit(n: Node, foci: THREE.Vector3[], vis: Node[]) {
    n.lastUsed = this.frame;
    let d = Infinity;
    for (const f of foci) d = Math.min(d, this.dist(n, f));
    const split = n.size > this.leafSize && d < n.size * this.splitFactor;
    if (split) {
      const h = n.size / 4, cs = n.size / 2, L = n.level + 1;
      const kids = [this.getNode(n.x - h, n.z - h, cs, L), this.getNode(n.x + h, n.z - h, cs, L), this.getNode(n.x - h, n.z + h, cs, L), this.getNode(n.x + h, n.z + h, cs, L)];
      let ready = true;
      for (const k of kids) {
        k.lastUsed = this.frame;
        if (!k.mesh) { ready = false; if (!k.queued) { k.queued = true; this.queue.push(k); } }
      }
      if (ready) { for (const k of kids) this.visit(k, foci, vis); return; }
    }
    vis.push(n);
  }

  /** Build the whole tree around a point synchronously (loading screen). */
  prewarm(p: THREE.Vector3, onStep?: (f: number) => void) {
    for (let i = 0; i < 40; i++) {
      this.update([p], 0, 999);
      if (this.queue.length === 0) break;
      onStep?.(i / 40);
    }
  }

  update(foci: THREE.Vector3[], camY: number, budgetMs = 5) {
    this.frame++;
    const root = this.getNode(0, 0, this.rootSize, 0);
    if (!root.mesh) this.build(root);
    const vis: Node[] = [];
    this.visit(root, foci, vis);
    for (const c of this.group.children) c.visible = false;
    for (const n of vis) if (n.mesh) n.mesh.visible = true;

    // generate queued chunks, nearest first, within a time budget
    if (this.queue.length) {
      const f = foci[0];
      this.queue.sort((a, b) => this.dist(a, f) - this.dist(b, f));
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < budgetMs) {
        const n = this.queue.shift()!;
        if (this.frame - n.lastUsed > 2) { n.queued = false; continue; }
        this.build(n);
      }
    }
    // evict stale chunks
    if (this.frame % 120 === 0 && this.nodes.size > 900) {
      for (const [k, n] of this.nodes) {
        if (n.level > 2 && this.frame - n.lastUsed > 600 && n.mesh) {
          this.group.remove(n.mesh);
          n.mesh.geometry.dispose();
          this.nodes.delete(k);
        }
      }
    }
    void camY;
  }

  get pending() { return this.queue.length; }
}

import * as THREE from 'three';
import { RUNWAYS, RunwayDef, CARRIER, terrainHeight } from './WorldDef';
import { mulberry32 } from '../core/math';

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function asphaltTexture(base = 58) {
  return canvasTex(256, 256, (g) => {
    const img = g.createImageData(256, 256);
    const r = mulberry32(3);
    for (let i = 0; i < 256 * 256; i++) {
      const v = base + (r() - 0.5) * 26 + (r() < 0.02 ? 30 : 0);
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v + 2; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.globalAlpha = 0.08;
    for (let i = 0; i < 40; i++) { g.fillStyle = r() < 0.5 ? '#000' : '#fff'; g.fillRect(r() * 256, r() * 256, 2 + r() * 60, 1 + r() * 4); }
  }, true);
}

function glowTex() {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.15)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
}
export const GLOW = glowTex();

class QuadBatch {
  pos: number[] = []; uv: number[] = []; idx: number[] = [];
  add(x0: number, z0: number, x1: number, z1: number, y: number) {
    const b = this.pos.length / 3;
    this.pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
    this.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

export class LightField {
  readonly points: THREE.Points;
  private col: Float32Array;
  private base: Float32Array;
  private pos: number[] = [];
  private cols: number[] = [];
  constructor() {
    this.points = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, map: GLOW, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
    this.col = new Float32Array(0); this.base = new Float32Array(0);
    this.points.frustumCulled = false;
  }
  add(x: number, y: number, z: number, r: number, g: number, b: number) { this.pos.push(x, y, z); this.cols.push(r, g, b); return this.pos.length / 3 - 1; }
  finish() {
    const g = this.points.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    this.base = new Float32Array(this.cols);
    this.col = new Float32Array(this.cols);
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
  }
  set(i: number, r: number, g: number, b: number) { this.base[i * 3] = r; this.base[i * 3 + 1] = g; this.base[i * 3 + 2] = b; }
  apply(intensity: number, mod?: (i: number) => number) {
    const n = this.col.length / 3;
    for (let i = 0; i < n; i++) {
      const k = intensity * (mod ? mod(i) : 1);
      this.col[i * 3] = this.base[i * 3] * k; this.col[i * 3 + 1] = this.base[i * 3 + 1] * k; this.col[i * 3 + 2] = this.base[i * 3 + 2] * k;
    }
    (this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}

export interface PapiInfo { rw: RunwayDef; lights: number[]; x: number; y: number; z: number; dirZ: number }

export class Airport {
  readonly group = new THREE.Group();
  readonly lights = new LightField();
  private papis: PapiInfo[] = [];
  private rabbit: { idx: number; order: number }[] = [];
  private beacons: number[] = [];
  private windsock: THREE.Object3D;
  private meatball: THREE.Mesh;
  readonly wiresZ: number[] = [];
  private asphalt = asphaltTexture();
  private t = 0;

  constructor() {
    const asphaltMat = new THREE.MeshStandardMaterial({ map: this.asphalt, roughness: 0.88, metalness: 0, color: 0xb8b8b8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const markMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const yellowMat = new THREE.MeshStandardMaterial({ color: 0xe8b800, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });

    for (const rw of RUNWAYS) this.buildRunway(rw, asphaltMat, markMat);

    // Main airport taxiway / apron
    const main = RUNWAYS[0];
    const tw = new QuadBatch(), tl = new QuadBatch();
    const y = main.elev + 0.04;
    tw.add(main.cx + 168, main.cz - 1500, main.cx + 192, main.cz + 1500, y);
    for (const zz of [-1480, -500, 500, 1480]) {
      tw.add(main.cx + 22, main.cz + zz - 12, main.cx + 192, main.cz + zz + 12, y);
      tl.add(main.cx + 30, main.cz + zz - 0.3, main.cx + 180, main.cz + zz + 0.3, y + 0.03);
    }
    tl.add(main.cx + 179.7, main.cz - 1490, main.cx + 180.3, main.cz + 1490, y + 0.03);
    tw.add(main.cx + 192, main.cz - 900, main.cx + 520, main.cz + 320, y);
    const twGeo = tw.geo();
    // world-scale UVs for asphalt
    const p = twGeo.getAttribute('position'), uv = twGeo.getAttribute('uv');
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 30, p.getZ(i) / 30);
    const twm = new THREE.Mesh(twGeo, asphaltMat); twm.receiveShadow = true;
    this.group.add(twm, new THREE.Mesh(tl.geo(), yellowMat));
    // taxiway blue edge lights
    for (let z = -1500; z <= 1500; z += 50) { this.lights.add(main.cx + 166, y + 0.4, main.cz + z, 0.1, 0.3, 1); this.lights.add(main.cx + 194, y + 0.4, main.cz + z, 0.1, 0.3, 1); }

    this.buildings(main.cx, main.cz, main.elev);
    this.windsock = this.makeWindsock(main.cx - 60, main.elev, main.cz + 1150);
    this.meatball = this.buildCarrier();
    this.lights.finish();
    this.group.add(this.lights.points);
  }

  private buildRunway(rw: RunwayDef, asphaltMat: THREE.Material, markMat: THREE.Material) {
    const { cx, cz, elev, length: L, width: W } = rw;
    const y = elev + 0.05;
    const g = new THREE.PlaneGeometry(W + 6, L + 60, 1, 1);
    g.rotateX(-Math.PI / 2);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (W + 6) / 30, uv.getY(i) * (L + 60) / 30);
    const m = new THREE.Mesh(g, asphaltMat);
    m.position.set(cx, y, cz);
    m.receiveShadow = true;
    this.group.add(m);

    // tyre marks (darker)
    const tm = new THREE.MeshStandardMaterial({ color: 0x151515, transparent: true, opacity: 0.35, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, depthWrite: false });
    const marks = new QuadBatch();
    const q = new QuadBatch();
    const my = y + 0.02;
    for (const end of [1, -1]) {
      const thrZ = cz + end * (L / 2); // threshold z
      const dir = -end; // direction pointing down the runway from this threshold
      const at = (d: number) => thrZ + dir * d;
      const quad = (x0: number, d0: number, x1: number, d1: number) => {
        const z0 = at(d0), z1 = at(d1);
        q.add(cx + x0, Math.min(z0, z1), cx + x1, Math.max(z0, z1), my);
      };
      // piano keys
      const keys = W >= 40 ? 8 : 4;
      for (let k = 0; k < keys; k++) {
        const off = 3 + k * 2.4;
        quad(off, 6, off + 1.6, 36); quad(-off - 1.6, 6, -off, 36);
      }
      // number
      const hdg = end === 1 ? rw.heading : (rw.heading + 180) % 360;
      const num = String(Math.round(hdg / 10) || 36).padStart(2, '0');
      const tex = canvasTex(256, 512, (gg) => {
        gg.fillStyle = '#fff'; gg.font = 'bold 200px Arial'; gg.textAlign = 'center'; gg.textBaseline = 'middle';
        gg.save(); gg.translate(128, 256); gg.scale(0.62, 2.1); gg.fillText(num, 0, 0); gg.restore();
      });
      const nm = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.35, W * 0.55), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false }));
      nm.rotation.x = -Math.PI / 2;
      if (dir > 0) nm.rotation.z = Math.PI;
      nm.position.set(cx, my, at(36 + 6 + W * 0.3));
      this.group.add(nm);
      // touchdown zone + aiming point
      if (L > 1500) {
        for (let d = 150; d <= 900; d += 150) {
          if (d === 300) continue;
          const bars = d <= 300 ? 3 : d <= 600 ? 2 : 1;
          for (let b = 0; b < bars; b++) { const o = 5 + b * 2.5; quad(o, d, o + 1.8, d + 22); quad(-o - 1.8, d, -o, d + 22); }
        }
        quad(5, 300, 15, 345); quad(-15, 300, -5, 345);
      } else {
        quad(3, 150, 6, 180); quad(-6, 150, -3, 180);
      }
      for (let d = 60; d < 400; d += 7) for (const s of [-1.6, 1.6]) marks.add(cx + s - 0.5 + Math.sin(d) * 0.4, at(d), cx + s + 0.5 + Math.sin(d) * 0.4, at(d + 5), my - 0.005);

      if (rw.lights) {
        // threshold green / end red
        for (let x = -W / 2; x <= W / 2; x += 3) {
          this.lights.add(cx + x, y + 0.3, thrZ + end * 1, 0.1, 1, 0.2);
          this.lights.add(cx + x, y + 0.3, thrZ + end * 2.5, 1, 0.1, 0.05);
        }
        // approach lighting system with sequenced "rabbit"
        if (L > 1500) {
          let order = 0;
          for (let d = 900; d >= 30; d -= 30) {
            const zz = thrZ + end * d;
            const ty = Math.max(terrainHeight(cx, zz), 0) + 1.5;
            for (let x = -2; x <= 2; x += 1) this.lights.add(cx + x * 1.2, ty, zz, 1, 0.95, 0.8);
            if (d === 300) for (let x = -15; x <= 15; x += 1.5) this.lights.add(cx + x, ty, zz, 1, 0.95, 0.8);
            const idx = this.lights.add(cx, ty + 0.4, zz, 1.4, 1.4, 1.6);
            this.rabbit.push({ idx, order: order++ });
          }
        }
        // PAPI on the left side (observer's left when landing)
        const left = dir < 0 ? -1 : 1; // landing northbound (dir -1 => -z) the left side is -x
        const papi: PapiInfo = { rw, lights: [], x: cx + left * (W / 2 + 12), y: y + 0.8, z: at(L > 1500 ? 320 : 160), dirZ: dir };
        for (let i = 0; i < 4; i++) {
          const px = papi.x + left * i * 9;
          papi.lights.push(this.lights.add(px, papi.y, papi.z, 1, 1, 1));
          const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x333333 }));
          box.position.set(px, papi.y - 0.4, papi.z);
          this.group.add(box);
        }
        if (end === 1 || rw.length < 1500) this.papis.push(papi);
      }
    }
    // centerline dashes
    for (let z = cz - L / 2 + 100; z < cz + L / 2 - 100; z += 60) q.add(cx - 0.45, z, cx + 0.45, z + 36, my);
    // edge lines
    q.add(cx - W / 2 + 0.5, cz - L / 2, cx - W / 2 + 1.4, cz + L / 2, my);
    q.add(cx + W / 2 - 1.4, cz - L / 2, cx + W / 2 - 0.5, cz + L / 2, my);
    const qm = new THREE.Mesh(q.geo(), markMat); qm.receiveShadow = true;
    this.group.add(qm, new THREE.Mesh(marks.geo(), tm));
    if (rw.lights) {
      for (let z = cz - L / 2; z <= cz + L / 2; z += 60) {
        const amber = Math.abs(z - (cz - L / 2)) < 600 || Math.abs(z - (cz + L / 2)) < 600;
        this.lights.add(cx - W / 2 - 1, y + 0.4, z, 1, amber ? 0.75 : 0.95, amber ? 0.3 : 0.85);
        this.lights.add(cx + W / 2 + 1, y + 0.4, z, 1, amber ? 0.75 : 0.95, amber ? 0.3 : 0.85);
      }
    }
  }

  private buildings(cx: number, cz: number, elev: number) {
    const concrete = new THREE.MeshStandardMaterial({ color: 0xc9c6bf, roughness: 0.85 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1b2a38, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.4 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.45, metalness: 0.7 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; this.group.add(m); return m;
    };
    // terminal: concrete base + glass curtain + roof
    add(new THREE.BoxGeometry(70, 6, 300), concrete, cx + 570, elev + 3, cz - 250);
    add(new THREE.BoxGeometry(62, 12, 290), glass, cx + 566, elev + 12, cz - 250);
    const roof = add(new THREE.CylinderGeometry(40, 40, 304, 24, 1, false, -0.7, 1.4), metal, cx + 566, elev + 1, cz - 250);
    roof.rotation.x = Math.PI / 2; roof.rotation.y = Math.PI / 2; roof.rotation.z = Math.PI / 2; roof.scale.set(1, 1, 0.55); roof.position.y = elev + 18 - 40 * 0.55 * Math.cos(0.7) + 2;
    // jet bridges
    for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(28, 3.5, 3.5), metal, cx + 523, elev + 6, cz - 360 + i * 55);
    // control tower
    add(new THREE.CylinderGeometry(4, 5.5, 46, 16), concrete, cx + 540, elev + 23, cz + 420);
    add(new THREE.CylinderGeometry(9, 7, 7, 16), glass, cx + 540, elev + 49.5, cz + 420);
    add(new THREE.CylinderGeometry(10, 10, 1.2, 16), metal, cx + 540, elev + 53.6, cz + 420);
    add(new THREE.CylinderGeometry(0.3, 0.3, 8, 6), metal, cx + 540, elev + 58, cz + 420);
    this.beacons.push(this.lights.add(cx + 540, elev + 62, cz + 420, 1, 0.1, 0.05));
    // hangars (arched)
    const hangarMat = new THREE.MeshStandardMaterial({ color: 0x8b95a0, roughness: 0.55, metalness: 0.6 });
    for (let i = 0; i < 4; i++) {
      const h = add(new THREE.CylinderGeometry(24, 24, 60, 24, 1, true, 0, Math.PI), hangarMat, cx + 470, elev, cz - 900 - i * 80);
      h.rotation.z = Math.PI / 2; h.rotation.y = Math.PI / 2;
      const back = add(new THREE.CircleGeometry(24, 24, 0, Math.PI), hangarMat, cx + 500, elev, cz - 900 - i * 80);
      back.rotation.y = -Math.PI / 2;
    }
    // fuel farm
    for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(9, 9, 12, 20), new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.5, metalness: 0.3 }), cx + 680 + (i % 2) * 24, elev + 6, cz + 700 + Math.floor(i / 2) * 24);
    // radar dome
    add(new THREE.SphereGeometry(7, 20, 12), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 }), cx - 220, elev + 14, cz + 250);
    add(new THREE.CylinderGeometry(3, 4, 8, 12), concrete, cx - 220, elev + 4, cz + 250);
    // apron flood light masts
    for (let i = 0; i < 5; i++) {
      add(new THREE.CylinderGeometry(0.3, 0.45, 26, 8), metal, cx + 330, elev + 13, cz - 800 + i * 260);
      this.lights.add(cx + 330, elev + 26.5, cz - 800 + i * 260, 1, 0.85, 0.6);
    }
  }

  private makeWindsock(x: number, elev: number, z: number) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 8, 8), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.5, roughness: 0.4 }));
    pole.position.set(x, elev + 4, z);
    this.group.add(pole);
    const holder = new THREE.Object3D();
    holder.position.set(x, elev + 7.6, z);
    holder.rotation.order = 'YXZ';
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 3.6, 12, 4, true), new THREE.MeshStandardMaterial({ color: 0xff5a1a, roughness: 0.8, side: THREE.DoubleSide }));
    cone.rotation.x = Math.PI / 2;
    cone.position.z = 1.8;
    holder.add(cone);
    this.group.add(holder);
    return holder;
  }

  private buildCarrier(): THREE.Mesh {
    const C = CARRIER;
    const grp = new THREE.Group();
    grp.position.set(C.cx, 0, C.cz);
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x5d646b, roughness: 0.7, metalness: 0.35 });
    // hull: extruded tapered shape
    const s = new THREE.Shape();
    const hw = 20, L = C.length;
    s.moveTo(-hw, L / 2); s.lineTo(hw, L / 2); s.lineTo(hw, -L / 2 + 70); s.quadraticCurveTo(hw * 0.5, -L / 2 - 5, 0, -L / 2 - 15); s.quadraticCurveTo(-hw * 0.5, -L / 2 - 5, -hw, -L / 2 + 70); s.closePath();
    const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: C.deck - 2 + 10, bevelEnabled: false }), hullMat);
    hull.rotation.x = Math.PI / 2; hull.position.y = C.deck - 2;
    hull.castShadow = true; hull.receiveShadow = true;
    grp.add(hull);
    // flight deck (wider, overhang)
    const dk = new THREE.Shape();
    const dw = C.width / 2;
    dk.moveTo(-dw, L / 2); dk.lineTo(dw, L / 2); dk.lineTo(dw - 6, -L / 2 + 40); dk.lineTo(10, -L / 2 - 8); dk.lineTo(-14, -L / 2 - 6); dk.lineTo(-dw + 8, -L / 2 + 60); dk.closePath();
    const deckMat = new THREE.MeshStandardMaterial({ map: asphaltTexture(70), color: 0xb0b2b8, roughness: 0.8 });
    const deck = new THREE.Mesh(new THREE.ExtrudeGeometry(dk, { depth: 2, bevelEnabled: false }), [deckMat, hullMat]);
    const duv = deck.geometry.getAttribute('uv');
    for (let i = 0; i < duv.count; i++) duv.setXY(i, duv.getX(i) / 20, duv.getY(i) / 20);
    deck.rotation.x = -Math.PI / 2; deck.position.y = C.deck - 2;
    deck.scale.z = 1; deck.castShadow = true; deck.receiveShadow = true;
    deck.rotation.x = Math.PI / 2; deck.position.y = C.deck;
    grp.add(deck);
    // deck markings
    const q = new QuadBatch(), y = C.deck + 0.03;
    for (let z = -L / 2 + 10; z < L / 2 - 10; z += 14) q.add(-0.4, z, 0.4, z + 7, y);
    q.add(-dw + 6, -L / 2 + 40, -dw + 6.6, L / 2 - 2, y); q.add(dw - 6.6, -L / 2 + 40, dw - 6, L / 2 - 2, y);
    q.add(-12, L / 2 - 18, 12, L / 2 - 17, y);
    const lm = new THREE.Mesh(q.geo(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4 }));
    grp.add(lm);
    // catapult tracks
    const cat = new QuadBatch();
    for (const x of [-8, 8]) cat.add(x - 0.3, -L / 2 - 2, x + 0.3, -L / 2 + 95, y);
    grp.add(new THREE.Mesh(cat.geo(), new THREE.MeshStandardMaterial({ color: 0x222222, polygonOffset: true, polygonOffsetFactor: -4 })));
    // arresting wires
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 });
    for (let i = 0; i < 4; i++) {
      const wz = L / 2 - 48 - i * 12;
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 32, 6), wireMat);
      w.rotation.z = Math.PI / 2; w.position.set(0, C.deck + 0.15, wz);
      grp.add(w);
      this.wiresZ.push(C.cz + wz);
    }
    // island superstructure
    const isl = new THREE.Mesh(new THREE.BoxGeometry(10, 18, 40), hullMat); isl.position.set(dw - 9, C.deck + 9, 10); isl.castShadow = true; grp.add(isl);
    const isl2 = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 22), hullMat); isl2.position.set(dw - 9, C.deck + 22, 6); isl2.castShadow = true; grp.add(isl2);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(10.2, 2, 16), new THREE.MeshStandardMaterial({ color: 0x0d1820, metalness: 0.9, roughness: 0.1 })); bridge.position.set(dw - 9, C.deck + 15, 14); grp.add(bridge);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 16, 8), hullMat); mast.position.set(dw - 9, C.deck + 34, 4); grp.add(mast);
    const radar = new THREE.Mesh(new THREE.BoxGeometry(6, 2.5, 0.3), hullMat); radar.position.set(dw - 9, C.deck + 30, 4); radar.name = 'radar'; grp.add(radar);
    const num = canvasTex(256, 256, (g) => { g.fillStyle = '#fff'; g.font = 'bold 180px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('77', 128, 128); });
    const nm = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: num, transparent: true, polygonOffset: true, polygonOffsetFactor: -4 }));
    nm.rotation.x = -Math.PI / 2; nm.position.set(0, y + 0.01, -L / 2 + 30); grp.add(nm);
    // Optical landing system ("meatball")
    const olsBase = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3, 8), hullMat); olsBase.position.set(-dw + 4, C.deck + 2, L / 2 - 90); grp.add(olsBase);
    const datum = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 14), new THREE.MeshBasicMaterial({ color: 0x00ff40, toneMapped: false }));
    datum.position.set(-dw + 3.6, C.deck + 2, L / 2 - 90); grp.add(datum);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb000, toneMapped: false }));
    ball.position.set(-dw + 3.4, C.deck + 2, L / 2 - 90); grp.add(ball);
    // deck edge lights
    for (let z = -L / 2 + 50; z < L / 2; z += 15) {
      this.lights.add(C.cx - dw + 1, C.deck + 0.3, C.cz + z, 1, 0.9, 0.6);
      this.lights.add(C.cx + dw - 1, C.deck + 0.3, C.cz + z, 1, 0.9, 0.6);
    }
    for (let x = -dw + 6; x <= dw - 6; x += 3) this.lights.add(C.cx + x, C.deck + 0.3, C.cz + L / 2 - 2, 0.1, 1, 0.2);
    this.group.add(grp);
    return ball;
  }

  /** PAPI colours depend on the viewer's elevation angle — physically correct. */
  update(dt: number, viewer: THREE.Vector3, night: number, windFrom: number, windSpeed: number) {
    this.t += dt;
    for (const p of this.papis) {
      const dx = viewer.x - p.x, dz = (viewer.z - p.z) * -p.dirZ, dy = viewer.y - p.y;
      const horiz = Math.max(1, Math.hypot(dx, dz));
      const ang = (Math.atan2(dy, horiz) * 180) / Math.PI;
      const thresholds = [3.5, 3.17, 2.83, 2.5];
      p.lights.forEach((li, i) => {
        const white = ang > thresholds[i];
        this.lights.set(li, white ? 1.2 : 1.3, white ? 1.2 : 0.06, white ? 1.15 : 0.04);
      });
    }
    // carrier meatball (glide slope 3.5°)
    {
      const C = CARRIER;
      const tdz = C.cz + C.length / 2 - 60;
      const dz = viewer.z - tdz, dy = viewer.y - C.deck;
      const ang = (Math.atan2(dy, Math.max(1, dz)) * 180) / Math.PI;
      const off = Math.max(-1, Math.min(1, (ang - 3.5) / 1.2));
      this.meatball.position.y = C.deck + 2 + off * 1.6;
      (this.meatball.material as THREE.MeshBasicMaterial).color.setHex(off < -0.85 ? 0xff1010 : 0xffb000);
    }
    const rabbitN = this.rabbit.length / 1;
    const phase = (this.t * 2) % 1;
    const rset = new Set<number>();
    for (const r of this.rabbit) {
      const k = (r.order % 30) / 30;
      if (Math.abs(k - phase) < 0.04) rset.add(r.idx);
    }
    const beaconOn = Math.sin(this.t * 6) > 0.6;
    const bset = new Set(this.beacons);
    const lightLevel = 0.25 + night * 1.2;
    this.lights.apply(lightLevel, (i) => (bset.has(i) ? (beaconOn ? 2 : 0.05) : rset.size && this.rabbit.some((r) => r.idx === i) ? (rset.has(i) ? 3 : 0.0) : 1));
    void rabbitN;
    (this.lights.points.material as THREE.PointsMaterial).size = 5 + night * 4;
    // windsock points downwind, inflates with wind speed
    const to = ((windFrom + 180) * Math.PI) / 180;
    this.windsock.rotation.y = -to + Math.PI;
    this.windsock.rotation.x = -Math.min(1, windSpeed / 12) * 1.2 + 1.2 - 0.05 + Math.sin(this.t * 5) * 0.03;
  }
}

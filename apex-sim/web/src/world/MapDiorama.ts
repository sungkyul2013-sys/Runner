// 3D model of a map (§18.3-6 맵 선택 — 3D 미리보기): the terrain at about 1:1000 with the road map painted on it,
// the buildings, water, forests and the raised roads (bridges, viaducts), on a dark base with a lit edge, like an
// architect's model. Pins mark the start points; night lights the roads and the facades, rain darkens and wets the
// ground, snow whitens the flat parts.
import * as THREE from 'three/webgpu';
import { abs, color, mix, normalWorld, smoothstep, texture, uniform, vec3 } from 'three/tsl';
import type { MapData } from './builder';
import { mapCanvas } from './MapUI';
import type { Localized as Label } from '../ui/i18n';

export interface DioramaPin {
  id: string;
  label: Label;
  /** Model-space foot of the pin (on the road). */
  foot: THREE.Vector3;
  /** Model-space head (label anchor), follows the pin's animation. */
  head: THREE.Vector3;
  root: THREE.Group;
  stem: THREE.Mesh;
  ball: THREE.Mesh;
  ring: THREE.Mesh;
  lift: number;
}

const V_EX = 1.5; // terrain vertical exaggeration
const B_EX = 1.6; // building height exaggeration
const BASE = 0.42; // base block height [model m]
const LIFT = 0.07; // earth kept under the lowest point
const BUILDING_COLORS = [0x9fb2c6, 0xe8e3da, 0xd9d3c8, 0xb9bdc3, 0xd8b89a, 0xe2d6c6];

export class MapDiorama {
  readonly group = new THREE.Group();
  /** 0 day … 1 night; rain wetness 0…1; snow cover 0…1. */
  readonly night = uniform(0);
  readonly wet = uniform(0);
  readonly snow = uniform(0);
  readonly pins: DioramaPin[] = [];
  /** Top of the base block (the model's ground floor) [model m]. */
  readonly base = BASE;
  private selected = '';
  private readonly pinMat = new THREE.MeshStandardNodeMaterial({ color: 0xf2f4f7, roughness: 0.3, emissive: 0x9aa4b4, emissiveIntensity: 0.25 });
  private readonly pinActive = new THREE.MeshStandardNodeMaterial({ color: 0xff6b2c, roughness: 0.3, emissive: 0xff6b2c, emissiveIntensity: 1.4 });
  private readonly disposables: Array<{ dispose(): void }> = [this.pinMat, this.pinActive];
  private t = 0;

  /**
   * @param side model width [m]
   * @param toModel world (x, y, z) → model space (and back-mapping of heights for pins)
   */
  constructor(readonly side: number, private readonly toModel: (x: number, y: number, z: number, out: THREE.Vector3) => THREE.Vector3) {
    this.group.name = 'diorama';
  }

  /** Model-space position of a world point. */
  model(x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    return this.toModel(x, y, z, out);
  }

  track<T extends { dispose(): void }>(d: T): T {
    this.disposables.push(d);
    return d;
  }

  addPin(id: string, label: Label, foot: THREE.Vector3): void {
    const root = new THREE.Group();
    root.position.copy(foot);
    const stem = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.005, 0.005, 1, 8).translate(0, 0.5, 0)), this.pinMat);
    const ball = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.032, 20, 12)), this.pinMat);
    const ring = new THREE.Mesh(this.track(new THREE.RingGeometry(0.03, 0.045, 40).rotateX(-Math.PI / 2)), this.pinMat);
    ring.position.y = 0.004;
    stem.castShadow = ball.castShadow = true;
    root.add(stem, ball, ring);
    this.group.add(root);
    this.pins.push({ id, label, foot: foot.clone(), head: foot.clone(), root, stem, ball, ring, lift: 0.22 });
  }

  select(id: string): void {
    this.selected = id;
    for (const p of this.pins) {
      const m = p.id === id ? this.pinActive : this.pinMat;
      p.stem.material = p.ball.material = p.ring.material = m;
    }
  }

  pin(id: string): DioramaPin | undefined {
    return this.pins.find((p) => p.id === id);
  }

  /** Pin animation: the chosen one stands taller, bobs and sends out a ring. */
  update(dt: number): void {
    this.t += dt;
    for (const p of this.pins) {
      const on = p.id === this.selected;
      const goal = on ? 0.42 : 0.2;
      p.lift += (goal - p.lift) * Math.min(1, dt * 6);
      const bob = on ? Math.sin(this.t * 3) * 0.012 : 0;
      p.stem.scale.y = p.lift + bob;
      p.ball.position.y = p.lift + bob;
      p.ball.scale.setScalar(on ? 1.25 : 1);
      const pulse = on ? (this.t * 0.8) % 1 : 0;
      p.ring.scale.setScalar(on ? 1 + pulse * 2.2 : 1);
      p.head.copy(p.foot).setY(p.foot.y + p.lift + bob + 0.05);
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}

/** Builds the model of a generated map, `side` metres wide. */
export function buildDiorama(map: MapData, side: number, pinIds: string[], lowEnd = false): MapDiorama {
  const t = map.terrain;
  const W = t.nx * t.cell, D = t.nz * t.cell;
  const s = side / Math.max(W, D);
  const cx = t.originX + W / 2, cz = t.originZ + D / 2;
  // Height range (for the base of the relief).
  let hmin = Infinity;
  for (let i = 0; i < t.heights.length; i += 7) hmin = Math.min(hmin, t.heights[i]);
  for (const w of map.render.water) hmin = Math.min(hmin, w.level - 2);
  const yOf = (y: number) => BASE + LIFT + (y - hmin) * s * V_EX;
  const d = new MapDiorama(side, (x, y, z, out) => out.set((x - cx) * s, yOf(y), (z - cz) * s));
  const g = d.group;

  // ---- relief with the painted map ----
  const N = lowEnd ? 160 : 224;
  const pos = new Float32Array((N + 1) * (N + 1) * 3);
  const uvs = new Float32Array((N + 1) * (N + 1) * 2);
  for (let iz = 0; iz <= N; iz++) {
    for (let ix = 0; ix <= N; ix++) {
      const x = t.originX + (ix / N) * W, z = t.originZ + (iz / N) * D;
      const k = iz * (N + 1) + ix;
      pos[k * 3] = (x - cx) * s;
      pos[k * 3 + 1] = yOf(t.heightAt(x, z));
      pos[k * 3 + 2] = (z - cz) * s;
      uvs[k * 2] = ix / N;
      uvs[k * 2 + 1] = iz / N;
    }
  }
  const idx: number[] = [];
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const a = iz * (N + 1) + ix, b = a + 1, c = a + N + 1, e = c + 1;
      idx.push(a, c, e, a, e, b);
    }
  }
  const relief = new THREE.BufferGeometry();
  relief.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  relief.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  relief.setIndex(idx);
  relief.computeVertexNormals();
  d.track(relief);
  const px = lowEnd ? 1536 : 2048;
  const dayTex = d.track(new THREE.CanvasTexture(mapCanvas(map, px)));
  const nightTex = d.track(new THREE.CanvasTexture(mapCanvas(map, lowEnd ? 1024 : 1536, true)));
  for (const tx of [dayTex, nightTex]) {
    tx.flipY = false;
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.anisotropy = 8;
    tx.generateMipmaps = true;
    tx.minFilter = THREE.LinearMipmapLinearFilter;
  }
  const ground = d.track(new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 }));
  const flat = smoothstep(0.55, 0.92, normalWorld.y);
  const dayCol = texture(dayTex).rgb;
  const lights = texture(nightTex).rgb;
  // The night map doubles as the road mask: snow stays off the (ploughed) roads.
  const road = smoothstep(0.05, 0.3, lights.r);
  ground.colorNode = mix(mix(dayCol, dayCol.mul(0.62), d.wet), vec3(0.93, 0.95, 0.98), d.snow.mul(flat).mul(road.oneMinus()).mul(0.9));
  ground.roughnessNode = mix(0.9, 0.35, d.wet);
  ground.emissiveNode = lights.mul(d.night.mul(1.6));
  const top = new THREE.Mesh(relief, ground);
  top.receiveShadow = true;
  top.castShadow = true;
  g.add(top);

  // ---- earth skirt down to the base block ----
  const sk: number[] = [], skc: number[] = [], ski: number[] = [];
  const edge = (ix0: number, iz0: number, dx: number, dz: number) => {
    const start = sk.length / 3;
    for (let k = 0; k <= N; k++) {
      const ix = ix0 + dx * k, iz = iz0 + dz * k;
      const i = (iz * (N + 1) + ix) * 3;
      sk.push(pos[i], pos[i + 1], pos[i + 2], pos[i], BASE, pos[i + 2]);
      skc.push(0.36, 0.27, 0.19, 0.12, 0.09, 0.07);
    }
    for (let k = 0; k < N; k++) {
      const a = start + k * 2;
      ski.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  };
  edge(0, 0, 1, 0);
  edge(N, 0, 0, 1);
  edge(N, N, -1, 0);
  edge(0, N, 0, -1);
  const skirt = new THREE.BufferGeometry();
  skirt.setAttribute('position', new THREE.Float32BufferAttribute(sk, 3));
  skirt.setAttribute('color', new THREE.Float32BufferAttribute(skc, 3));
  skirt.setIndex(ski);
  skirt.computeVertexNormals();
  g.add(new THREE.Mesh(d.track(skirt), d.track(new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }))));

  addBase(d, side);

  // ---- water ----
  const water = d.track(new THREE.MeshStandardNodeMaterial({ color: 0x1f5d7c, roughness: 0.06, metalness: 0.25, transparent: true, opacity: 0.9 }));
  water.colorNode = mix(color(0x1f5d7c), color(0x0b1a26), d.night.mul(0.7));
  const v = new THREE.Vector3();
  for (const wb of map.render.water) {
    let geo: THREE.BufferGeometry;
    if (wb.kind === 'lake') {
      const shape = new THREE.Shape(wb.points.map(([x, z]) => new THREE.Vector2((x - cx) * s, -(z - cz) * s)));
      geo = new THREE.ShapeGeometry(shape, 4).rotateX(-Math.PI / 2);
    } else {
      const p = wb.points, hw = ((wb.width ?? 100) / 2) * s;
      const rp: number[] = [], ri: number[] = [];
      for (let i = 0; i < p.length; i++) {
        const a = p[Math.max(i - 1, 0)], b = p[Math.min(i + 1, p.length - 1)];
        const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
        const nx = -tz / l, nz = tx / l;
        const x = (p[i][0] - cx) * s, z = (p[i][1] - cz) * s;
        rp.push(x + nx * hw, 0, z + nz * hw, x - nx * hw, 0, z - nz * hw);
        if (i) ri.push(i * 2 - 2, i * 2 - 1, i * 2 + 1, i * 2 - 2, i * 2 + 1, i * 2);
      }
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
      geo.setIndex(ri);
      geo.computeVertexNormals();
    }
    const m = new THREE.Mesh(d.track(geo), water);
    m.material.side = THREE.DoubleSide;
    m.position.y = yOf(wb.level) + 0.002;
    m.receiveShadow = true;
    g.add(m);
  }

  // ---- raised roads (bridges, viaducts, ramps): the road triangles well above the ground ----
  const rp: number[] = [];
  for (const tile of map.render.tiles) {
    for (const acc of [tile.roads, tile.concrete]) {
      const P = acc.pos, I = acc.idx;
      for (let i = 0; i < I.length; i += 3) {
        const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
        const x = (P[a] + P[b] + P[c]) / 3, y = (P[a + 1] + P[b + 1] + P[c + 1]) / 3, z = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
        if (y - t.heightAt(x, z) < 3) continue;
        for (const q of [a, b, c]) {
          d.model(P[q], P[q + 1], P[q + 2], v);
          rp.push(v.x, v.y + 0.002, v.z);
        }
      }
    }
  }
  if (rp.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    geo.computeVertexNormals();
    const mat = d.track(new THREE.MeshStandardNodeMaterial({ color: 0x5b5f66, roughness: 0.7, side: THREE.DoubleSide }));
    mat.emissiveNode = color(0xffb46a).mul(d.night.mul(0.9));
    const deck = new THREE.Mesh(d.track(geo), mat);
    deck.castShadow = deck.receiveShadow = true;
    g.add(deck);
  }

  // ---- buildings ----
  const bs = map.render.buildings;
  if (bs.length) {
    const box = d.track(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
    const mat = d.track(new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.05 }));
    // Lit windows at night: the walls glow, the roofs stay dark.
    mat.colorNode = vec3(1, 1, 1).mul(d.night.mul(-0.6).add(1));
    mat.emissiveNode = color(0xffc27a).mul(d.night.mul(0.55)).mul(smoothstep(0.6, 0.15, abs(normalWorld.y)));
    const inst = new THREE.InstancedMesh(box, mat, bs.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    bs.forEach((b, i) => {
      d.model(b.x, b.y, b.z, v);
      q.setFromAxisAngle(up, b.yaw);
      sc.set(Math.max(b.w * s, 0.005), Math.max(b.h * s * B_EX, 0.004), Math.max(b.d * s, 0.005));
      m.compose(v, q, sc);
      inst.setMatrixAt(i, m);
      c.setHex(BUILDING_COLORS[b.type] ?? 0xdddddd).offsetHSL(0, 0, ((b.seed % 7) - 3) * 0.012);
      inst.setColorAt(i, c);
    });
    inst.castShadow = inst.receiveShadow = true;
    g.add(inst);
  }

  // ---- forests (a thinned sample, trees drawn larger so the woods read at this scale) ----
  const tr = map.render.trees;
  const n = tr.length / 5;
  if (n) {
    const cap = lowEnd ? 3500 : 7000;
    const step = Math.max(1, Math.ceil(n / cap));
    const cone = d.track(new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0));
    const mat = d.track(new THREE.MeshStandardNodeMaterial({ roughness: 0.85 }));
    mat.colorNode = mix(vec3(1, 1, 1), vec3(0.8, 0.84, 0.86), d.snow);
    const count = Math.ceil(n / step);
    const inst = new THREE.InstancedMesh(cone, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), c = new THREE.Color();
    const greens = [0x2f5a2a, 0x3b6b30, 0x28502e, 0x46703a];
    const grow = Math.sqrt(step);
    let k = 0;
    for (let i = 0; i < n; i += step, k++) {
      const x = tr[i * 5], y = tr[i * 5 + 1], z = tr[i * 5 + 2], scale = tr[i * 5 + 3];
      d.model(x, y, z, v);
      const r = 4.5 * scale * s * Math.min(grow, 3);
      sc.set(r, 13 * scale * s * V_EX * 1.4, r);
      m.compose(v, q, sc);
      inst.setMatrixAt(k, m);
      inst.setColorAt(k, c.setHex(greens[i % greens.length]));
    }
    inst.count = k;
    inst.castShadow = true;
    g.add(inst);
  }

  // ---- start pins ----
  for (const id of pinIds) {
    const p = map.pois.find((q) => q.id === id);
    if (!p) continue;
    const y = Math.max(t.heightAt(p.x, p.z), p.y ?? -Infinity);
    d.addPin(p.id, p.label, d.model(p.x, y, p.z, new THREE.Vector3()));
  }
  return d;
}

/** The infinite grid ground (not a generated map): a gridded plate with its test features. */
export function gridDiorama(side: number, pinLabel: Label): MapDiorama {
  const s = side / 400;
  const d = new MapDiorama(side, (x, y, z, out) => out.set(x * s, BASE + 0.02 + y * s * 4, z * s));
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2a2e35';
  g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i <= 64; i++) {
    g.strokeStyle = i % 8 === 0 ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.08)';
    g.lineWidth = i % 8 === 0 ? 2 : 1;
    g.beginPath();
    g.moveTo(i * 16, 0);
    g.lineTo(i * 16, 1024);
    g.moveTo(0, i * 16);
    g.lineTo(1024, i * 16);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,107,44,0.9)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(512, 0);
  g.lineTo(512, 1024);
  g.moveTo(0, 512);
  g.lineTo(1024, 512);
  g.stroke();
  const tex = d.track(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = d.track(new THREE.MeshStandardNodeMaterial({ roughness: 0.8 }));
  mat.colorNode = mix(texture(tex).rgb, texture(tex).rgb.mul(0.6), d.wet);
  mat.emissiveNode = texture(tex).rgb.mul(d.night.mul(0.35));
  const plate = new THREE.Mesh(d.track(new THREE.BoxGeometry(side, 0.04, side)), [mat, mat, mat, mat, mat, mat]);
  plate.position.y = BASE;
  plate.receiveShadow = true;
  d.group.add(plate);
  addBase(d, side);
  // The ground's features: bumps, a jump, a slalom (as small blocks).
  const feat = d.track(new THREE.MeshStandardNodeMaterial({ color: 0xd8d4cc, roughness: 0.6 }));
  const v = new THREE.Vector3();
  const block = (x: number, z: number, w: number, h: number, dd: number) => {
    const m = new THREE.Mesh(d.track(new THREE.BoxGeometry(w * s, h * s * 4, dd * s)), feat);
    d.model(x, h / 2, z, v);
    m.position.copy(v);
    m.castShadow = true;
    d.group.add(m);
  };
  for (let i = 0; i < 6; i++) block(-40 + i * 12, 60, 8, 0.4, 1.2);
  block(40, -40, 10, 2.2, 14);
  for (let i = 0; i < 8; i++) block(-60, -80 + i * 18, 1.2, 1.2, 1.2);
  d.addPin('start', pinLabel, d.model(0, 0, 0, new THREE.Vector3()));
  return d;
}

/** The dark base block with its lit accent edge. */
function addBase(d: MapDiorama, side: number): void {
  const m = d.track(new THREE.MeshStandardNodeMaterial({ color: 0x101318, roughness: 0.32, metalness: 0.55 }));
  const block = new THREE.Mesh(d.track(new THREE.BoxGeometry(side + 0.24, BASE, side + 0.24)), m);
  block.position.y = BASE / 2;
  block.receiveShadow = true;
  d.group.add(block);
  const glow = d.track(new THREE.MeshBasicNodeMaterial({ color: 0xff6b2c }));
  glow.colorNode = color(0xff6b2c).mul(1.6);
  const L = side + 0.26;
  for (const [x, z, w, dd] of [[0, L / 2, L, 0.012], [0, -L / 2, L, 0.012], [L / 2, 0, 0.012, L], [-L / 2, 0, 0.012, L]] as const) {
    const e = new THREE.Mesh(d.track(new THREE.BoxGeometry(w, 0.012, dd)), glow);
    e.position.set(x, BASE - 0.004, z);
    d.group.add(e);
  }
}

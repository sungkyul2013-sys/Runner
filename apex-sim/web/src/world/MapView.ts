// Map renderer (§13, §14.2): the terrain heightfield in LOD chunks (the same triangles the physics collides with, at
// full resolution near the camera), road ribbons with their markings drawn by the shader (lanes, centre and edge
// lines, crosswalks and stop lines, wet sheen, street-lamp pools at night), buildings with lit windows at night,
// trees swaying in the wind, street lamps, traffic signals cycling, signs, bridges, tunnels, water and the distant
// mountains. Far tiles and props are hidden by distance (quality setting).
import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  abs, atan, attribute, clamp, color, exp, float, floor, fract, fwidth, max, mix, mod, mx_noise_float, normalWorld, positionLocal,
  positionWorld, sin, smoothstep, step, texture, time, uniform, vec2, vec3, cameraPosition, length, select,
} from 'three/tsl';
import type { MapData, MeshAccum, Sign } from './builder';
import { MAT } from './types';
import type { Terrain } from './terrain';

type Quality = 'low' | 'medium' | 'high';

const CHUNK = 128; // cells per terrain chunk
const LOD_STEPS = [1, 2, 4, 8, 16];

/** Shared weather / time uniforms (Environment drives them). */
export class MapUniforms {
  readonly night = uniform(0); // 0 day … 1 night (lamps, windows)
  readonly wet = uniform(0); // road wetness 0 … 1
  readonly snow = uniform(0); // snow cover 0 … 1
  readonly wind = uniform(0.3); // tree sway 0 … 1
  readonly signalClock = uniform(0); // [s] traffic signal cycle
}

function palette(): THREE.DataTexture {
  const data = new Uint8Array(256 * 4);
  const set = (id: number, hex: number) => {
    data[id * 4] = (hex >> 16) & 255;
    data[id * 4 + 1] = (hex >> 8) & 255;
    data[id * 4 + 2] = hex & 255;
    data[id * 4 + 3] = 255;
  };
  for (let i = 0; i < 256; i++) set(i, 0x5d7a3c);
  set(MAT.grass, 0x5d7a3c);
  set(MAT.grassWet, 0x4e6a33);
  set(MAT.dirt, 0x7b6246);
  set(MAT.mud, 0x54412f);
  set(MAT.sand, 0xc9b48b);
  set(MAT.gravel, 0x8a8275);
  set(MAT.gravelTrap, 0x9a8f7c);
  set(MAT.concrete, 0x9a9893);
  set(MAT.asphalt, 0x3b3c3e);
  set(MAT.asphaltOld, 0x4a4a48);
  set(MAT.snowPacked, 0xe9eef3);
  set(MAT.snowFresh, 0xf4f7fa);
  set(MAT.ice, 0xcfe0ec);
  set(MAT.cobble, 0x77716a);
  const tex = new THREE.DataTexture(data, 256, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Terrain / verge material: surface material texture + palette, slope rock, noise variation, snow and wetness. */
function terrainMaterial(t: Terrain, u: MapUniforms): THREE.MeshStandardNodeMaterial {
  const matTex = new THREE.DataTexture(t.materials, t.nx, t.nz, THREE.RedFormat, THREE.UnsignedByteType);
  matTex.magFilter = matTex.minFilter = THREE.NearestFilter;
  matTex.needsUpdate = true;
  const pal = palette();
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
  const uvw = vec2(positionWorld.x.sub(t.originX).div(t.nx * t.cell), positionWorld.z.sub(t.originZ).div(t.nz * t.cell));
  const id = texture(matTex, uvw).r.mul(255);
  const base = texture(pal, vec2(id.add(0.5).div(256), 0.5)).rgb;
  const n1 = mx_noise_float(positionWorld.xz.mul(0.035));
  const n2 = mx_noise_float(positionWorld.xz.mul(0.4));
  const slope = float(1).sub(normalWorld.y);
  const rock = mix(color(0x7a746b), color(0x8f887e), n2.mul(0.5).add(0.5));
  // Steep ground shows rock whatever its material says (grass does not hold on 45°).
  let c = mix(base.mul(n1.mul(0.18).add(0.95)).mul(n2.mul(0.06).add(1)), rock, smoothstep(0.34, 0.62, slope));
  // Paved city ground: a faint slab pattern.
  const isPaved = step(0.5, abs(id.sub(MAT.concrete)).oneMinus()).mul(step(slope, 0.15));
  const slab = step(0.94, max(fract(positionWorld.x.div(3)), fract(positionWorld.z.div(3))));
  c = mix(c, c.mul(0.85), isPaved.mul(slab));
  // Snow lies on the flatter ground.
  c = mix(c, color(0xf1f4f8), u.snow.mul(smoothstep(0.55, 0.2, slope)).mul(n1.mul(0.2).add(0.9)).clamp(0, 1));
  m.colorNode = c.mul(float(1).sub(u.wet.mul(0.25)));
  m.roughnessNode = mix(float(0.95), float(0.55), u.wet.mul(isPaved.mul(0.6).add(0.3)));
  return m;
}

/** Asphalt with markings from the per-vertex road attributes (see MapBuilder.emitRoad). */
function roadMaterial(u: MapUniforms, pads = false): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
  const road = attribute('road', 'vec4');
  const st = attribute('style', 'vec4');
  const lamp = attribute('lamp', 'vec2');
  const lu = road.x, s = road.y, toEnd = road.z, fromStart = road.w;
  const lw = st.x, lanes = st.y, medianHalf = st.z, code = st.w;
  const pattern = mod(code, 8);
  const junction = mod(floor(code.div(8)), 2);
  const oneWay = floor(code.div(16));
  const au = abs(lu);
  const aa = fwidth(lu).mul(1.2).add(0.004);
  const line = (d: Node<'float'>, w: number): Node<'float'> => float(1).sub(smoothstep(float(w / 2).sub(aa), float(w / 2).add(aa), d));
  const cwTwo = medianHalf.add(lanes.mul(lw));
  const cwOne = lanes.mul(lw).mul(0.5);
  const cw = mix(cwTwo, cwOne, oneWay);
  const has = (p: number) => step(abs(pattern.sub(p)), 0.5);
  const anyMarking = step(0.5, pattern);
  // Edge lines (white) just inside the carriageway edge.
  const edge = line(abs(au.sub(cw.sub(0.12))), 0.15).mul(anyMarking);
  // Centre: double yellow (arterial), single yellow (two-lane, street), yellow inner edge (highway).
  const dbl = line(abs(au.sub(0.17)), 0.12).mul(has(2));
  const single = line(au, 0.15).mul(has(3).add(has(6)));
  const inner = line(abs(au.sub(medianHalf.add(0.25))), 0.15).mul(has(1));
  const yellow = max(max(dbl, single), inner).mul(float(1).sub(oneWay));
  // Lane dividers, dashed (8 m line, 12 m gap on highways; 5 / 8 elsewhere).
  const dashPeriod = select(has(1).greaterThan(0.5), float(20), float(13));
  const dashOn = step(fract(s.div(dashPeriod)), select(has(1).greaterThan(0.5), float(0.4), float(0.38)));
  let lanesMask: Node<'float'> = float(0);
  for (let k = 1; k <= 3; k++) {
    const twoWay = line(abs(au.sub(medianHalf.add(lw.mul(k)))), 0.13);
    const oneWayLine = line(abs(lu.add(cwOne).sub(lw.mul(k))), 0.13);
    lanesMask = max(lanesMask, mix(twoWay, oneWayLine, oneWay).mul(step(float(k), lanes.sub(0.5))));
  }
  const dividers = lanesMask.mul(dashOn).mul(has(1).add(has(2)).add(has(4)).add(has(5))).mul(float(1).sub(has(6)));
  // Crosswalks and stop lines near junctions (city patterns).
  const zebraBand = smoothstep(1.2, 1.4, toEnd).mul(smoothstep(5.8, 5.6, toEnd)).add(smoothstep(1.2, 1.4, fromStart).mul(smoothstep(5.8, 5.6, fromStart)));
  const zebra = zebraBand.mul(step(0.5, fract(lu.div(1.0).add(0.25)))).mul(step(au, cw.sub(0.3)));
  const stopA = smoothstep(6.4, 6.5, toEnd).mul(smoothstep(7.0, 6.9, toEnd)).mul(step(lu, 0));
  const stopB = smoothstep(6.4, 6.5, fromStart).mul(smoothstep(7.0, 6.9, fromStart)).mul(step(0, lu));
  const cross = max(zebra, max(stopA, stopB).mul(step(au, cw))).mul(junction).mul(has(2).add(has(6)));
  // Lane arrows (straight on) before the stop lines, one per lane, pointing at the junction.
  const laneIdx = floor(au.sub(medianHalf).div(lw.max(0.1)));
  const lx = au.sub(medianHalf.add(lw.mul(laneIdx.add(0.5))));
  const inLane = step(0, laneIdx).mul(step(laneIdx, lanes.sub(0.5)));
  const arrowAt = (d: Node<'float'>): Node<'float'> => {
    const y = float(17).sub(d);
    const shaft = float(1).sub(smoothstep(0.08, 0.1, abs(lx))).mul(step(-2.6, y)).mul(step(y, 1.0));
    const head = float(1).sub(smoothstep(float(2.6).sub(y).div(1.6).mul(0.46), float(2.6).sub(y).div(1.6).mul(0.46).add(0.02), abs(lx))).mul(step(1.0, y)).mul(step(y, 2.6));
    return max(shaft, head);
  };
  const arrows = max(arrowAt(toEnd).mul(step(lu, 0)), arrowAt(fromStart).mul(step(0, lu)))
    .mul(inLane).mul(junction).mul(has(2).add(has(6))).mul(float(1).sub(oneWay));
  const white = max(max(max(edge.mul(step(0.5, pattern)), dividers), cross), arrows);
  // Manhole covers on city streets: one in a lane every 45 m cell, placed by a hash of the cell.
  const cellS = floor(s.div(45));
  const hA = fract(sin(cellS.mul(91.37).add(code)).mul(43758.5453));
  const hB = fract(sin(cellS.mul(17.13).add(3.7)).mul(24634.6345));
  const mhS = cellS.mul(45).add(8).add(hA.mul(29));
  const mhU = medianHalf.add(lw.mul(floor(hB.mul(lanes)).add(0.5))).mul(select(hB.greaterThan(0.5), float(1), float(-1)));
  const mhD = vec2(s.sub(mhS), lu.sub(mhU)).length();
  const manhole = float(1).sub(smoothstep(0.34, 0.37, mhD)).mul(has(2).add(has(6)).add(has(3))).mul(smoothstep(8, 10, toEnd)).mul(smoothstep(8, 10, fromStart));
  const manholeRim = smoothstep(0.26, 0.29, mhD).mul(manhole);
  // Asphalt: grain, patch variation, darker and glossier when wet.
  const grain = mx_noise_float(positionWorld.xz.mul(2.7)).mul(0.04);
  const patches = mx_noise_float(positionWorld.xz.mul(0.06)).mul(0.05);
  const asphalt = color(0x3d3e40).mul(grain.add(patches).add(1)).mul(float(1).sub(u.wet.mul(0.35)));
  let c = mix(asphalt, color(0xe8e8e2), white.mul(0.92));
  c = mix(c, color(0xe0b52c), yellow.mul(0.95));
  // Cast-iron cover: dark, a lighter rim, a cross-hatch.
  const hatch = step(0.5, fract(positionWorld.x.mul(9))).mul(step(0.5, fract(positionWorld.z.mul(9)))).mul(0.25);
  c = mix(c, mix(color(0x2e3033).mul(hatch.add(1)), color(0x55585d), manholeRim), manhole.mul(0.96));
  if (pads) c = asphalt;
  m.colorNode = c;
  const paint = max(white, yellow);
  m.roughnessNode = mix(mix(mix(float(0.88), float(0.6), paint), float(0.35), manhole), float(0.22), u.wet.mul(0.85));
  m.metalnessNode = manhole.mul(0.5);
  // Street-lamp pools at night: staggered lamps on both sides (see emitRoadProps).
  const L = lamp.x, off = lamp.y;
  const sr = fract(s.sub(L.mul(0.5)).div(L.max(1)).add(0.5)).sub(0.5).mul(L);
  const sl = fract(s.div(L.max(1)).add(0.5)).sub(0.5).mul(L);
  const dr = sr.mul(sr).add(lu.add(off).mul(lu.add(off)));
  const dl = sl.mul(sl).add(lu.sub(off).mul(lu.sub(off)));
  const pool = exp(dr.div(-38)).add(exp(dl.div(-38))).mul(step(1, L));
  m.emissiveNode = color(0xffd29a).mul(pool.mul(u.night).mul(0.09));
  return m;
}

function plainMaterial(hex: number, rough = 0.9, metal = 0): THREE.MeshStandardNodeMaterial {
  return new THREE.MeshStandardNodeMaterial({ color: hex, roughness: rough, metalness: metal });
}

/** Buildings: one instanced unit box; the facade (windows, floors, roofs) comes from world position and the
 *  instance attributes (type, seed, base height). */
function buildingMaterial(u: MapUniforms): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0 });
  const info = attribute('bInfo', 'vec4'); // type, seed, base y, part top above the base
  const type = info.x, seed = info.y, baseY = info.z, top = info.w;
  const isType = (k: number) => step(abs(type.sub(k)), 0.5);
  const n = normalWorld;
  const onX = step(0.5, abs(n.x));
  const fu = mix(positionWorld.x, positionWorld.z, onX);
  const fv = positionWorld.y.sub(baseY);
  const floorH = mix(float(3.1), float(4.0), isType(0));
  const bay = mix(mix(float(3.0), float(1.6), isType(0)), float(4.5), isType(3));
  const fx = fract(fu.div(bay)), fy = fract(fv.div(floorH));
  const win = step(0.18, fx).mul(step(fx, 0.82)).mul(step(0.28, fy)).mul(step(fy, 0.86)).mul(step(1.6, fv));
  const roof = step(0.6, n.y).max(isType(7));
  // Wall colours per type, varied by the seed.
  const h1 = fract(sin(seed.mul(12.9898)).mul(43758.5453));
  const h2 = fract(sin(seed.mul(78.233)).mul(12345.678));
  const glassWall = mix(color(0x2c4a63), color(0x6d8aa3), h1);
  const apartWall = mix(color(0xe8e2d6), color(0xd5d9de), h1);
  const lowWall = mix(mix(color(0xa0785a), color(0xcfc4b0), h1), color(0x8c8f96), h2.mul(0.5));
  const indWall = mix(color(0x8d949b), color(0x6f7f8f), h1);
  const houseWall = mix(color(0xe6d7bf), color(0xc9b8a0), h1);
  const shopWall = mix(color(0xf0ede6), color(0xd8c9b3), h1);
  const plantWall = mix(color(0x8f959b), color(0xa9adb1), h1); // rooftop plant, lift cores, masts
  let wall = glassWall.mul(isType(0));
  wall = wall.add(apartWall.mul(isType(1))).add(lowWall.mul(isType(2))).add(indWall.mul(isType(3))).add(houseWall.mul(isType(4))).add(shopWall.mul(isType(5))).add(plantWall.mul(isType(6)));
  const glass = mix(color(0x1d2733), color(0x39516b), h2);
  const industrialNoWin = isType(3).mul(step(fv, 6));
  // Far away the window grid would shimmer: its contrast fades with the distance.
  const far = smoothstep(180, 700, length(positionWorld.sub(cameraPosition)));
  const winMask = win.mul(float(1).sub(roof)).mul(float(1).sub(industrialNoWin)).mul(float(1).sub(isType(6)));
  const roofCol = mix(color(0x5b5e63), mix(color(0x6b3b2e), color(0x3a4750), h1), isType(4).max(isType(7)));
  let c = mix(wall, glass, winMask.mul(float(1).sub(isType(0).mul(0.3))).mul(far.mul(-0.65).add(1)));
  // Apartment slabs: a pale balcony band along every floor.
  c = mix(c, color(0xf3f1ec), isType(1).mul(step(fy, 0.14)).mul(float(1).sub(roof)).mul(step(3, fv)));
  // Plant: louvre stripes.
  c = mix(c, c.mul(0.72), isType(6).mul(step(0.5, fract(fv.mul(2.2)))).mul(float(1).sub(roof)));
  c = mix(c, roofCol, roof);
  // Shops (and tower podiums): a coloured ground-floor band.
  const band = isType(5).mul(step(fv, 3.2)).mul(float(1).sub(roof));
  c = mix(c, mix(color(0xc0392b), color(0x2e86c1), h2), band.mul(0.8));
  m.colorNode = c;
  m.roughnessNode = mix(float(0.85), float(0.12), winMask.add(isType(0).mul(0.6)).clamp(0, 1));
  m.metalnessNode = isType(0).mul(0.4).mul(float(1).sub(roof));
  // Night: a share of the windows lit (warm or cool), by floor and bay; tower crowns lit; shop fronts glow.
  const cellId = floor(fu.div(bay)).mul(17.3).add(floor(fv.div(floorH)).mul(91.7)).add(seed);
  const lit = step(0.62, fract(sin(cellId).mul(43758.5453)));
  const tint = mix(color(0xffd9a0), color(0xcfe4ff), step(0.7, fract(sin(cellId.mul(3.1)).mul(9631.7))));
  const crown = isType(0).mul(step(top.sub(2.2), fv)).mul(float(1).sub(roof));
  const shopGlow = band.mul(step(0.3, fy)).mul(0.9);
  m.emissiveNode = tint.mul(winMask.mul(lit).mul(0.75)).add(color(0xdfeaff).mul(crown.mul(1.4))).add(mix(color(0xffc27a), color(0xa8d8ff), h2).mul(shopGlow)).mul(u.night);
  return m;
}

/** Deterministic 0…1 from a building's seed. */
function hash01(seed: number, k: number): number {
  const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** A gable roof (ridge along local x), unit size, base at y 0. */
function gableGeometry(): THREE.BufferGeometry {
  const v = [
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 1, 0, // slope facing −z
    0.5, 0, 0.5, -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 1, 0, // slope facing +z
    -0.5, 0, 0.5, -0.5, 0, -0.5, -0.5, 1, 0, // gable −x
    0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 1, 0, // gable +x
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([0, 3, 2, 0, 2, 1, 4, 7, 6, 4, 6, 5, 8, 10, 9, 11, 13, 12]);
  g.computeVertexNormals();
  return g;
}

function treeGeometry(kind: number): THREE.BufferGeometry {
  // 0: broadleaf, 1: conifer, 2: street tree (smaller, rounder). Parts with a colour each, merged.
  const parts: Array<[THREE.BufferGeometry, number]> = [];
  const trunkH = kind === 1 ? 2.2 : kind === 2 ? 2.4 : 3;
  parts.push([new THREE.CylinderGeometry(0.12, 0.18, trunkH, 5).translate(0, trunkH / 2, 0), 0x6e5440]);
  if (kind === 1) {
    parts.push([new THREE.ConeGeometry(2.0, 4.2, 7).translate(0, trunkH + 1.8, 0), 0x4a7a4c]);
    parts.push([new THREE.ConeGeometry(1.45, 3.4, 7).translate(0, trunkH + 4.0, 0), 0x558a56]);
  } else {
    const r = kind === 2 ? 1.6 : 2.4;
    parts.push([new THREE.IcosahedronGeometry(r, 0).translate(0, trunkH + r * 0.8, 0), kind === 2 ? 0x74a653 : 0x6b9c4e]);
    parts.push([new THREE.IcosahedronGeometry(r * 0.75, 0).translate(r * 0.45, trunkH + r * 1.25, r * 0.2), kind === 2 ? 0x86b862 : 0x7aab58]);
  }
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (const [g, hex] of parts) {
    const flat = g.index ? g.toNonIndexed() : g;
    const a = flat.getAttribute('position');
    c.setHex(hex).convertSRGBToLinear();
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      col.push(c.r, c.g, c.b);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeVertexNormals();
  return out;
}

function treeMaterial(u: MapUniforms): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.9 });
  // Sway: the top moves most, phase from the instance position.
  const h = positionLocal.y.max(0);
  const phase = positionWorld.x.mul(0.13).add(positionWorld.z.mul(0.17));
  const sway = sin(time.mul(1.6).add(phase)).mul(u.wind).mul(h.mul(h).mul(0.004));
  m.positionNode = positionLocal.add(vec3(sway, 0, sway.mul(0.6)));
  // (Colours: the vertex colours as they are — a colour node over them rendered black on the WebGL2 backend.)
  return m;
}

function accumGeometry(a: MeshAccum, origin: THREE.Vector3, withRoad: boolean): THREE.BufferGeometry | null {
  if (a.idx.length === 0) return null;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(a.pos.length);
  for (let i = 0; i < a.pos.length; i += 3) {
    pos[i] = a.pos[i] - origin.x;
    pos[i + 1] = a.pos[i + 1];
    pos[i + 2] = a.pos[i + 2] - origin.z;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(a.idx.length > 65535 ? new THREE.Uint32BufferAttribute(a.idx, 1) : new THREE.Uint16BufferAttribute(a.idx, 1));
  if (a.col) g.setAttribute('color', new THREE.Float32BufferAttribute(a.col, 3));
  if (withRoad && a.road) {
    g.setAttribute('road', new THREE.Float32BufferAttribute(a.road, 4));
    g.setAttribute('style', new THREE.Float32BufferAttribute(a.style!, 4));
    g.setAttribute('lamp', new THREE.Float32BufferAttribute(a.lamp!, 2));
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

interface Chunk {
  cx: number; // world centre
  cz: number;
  ix0: number;
  iz0: number;
  nx: number;
  nz: number;
  lods: Array<THREE.Mesh | null>;
  current: number;
}

interface PropTile {
  cx: number;
  cz: number;
  group: THREE.Group;
}

export class MapView {
  readonly group = new THREE.Group();
  readonly uniforms = new MapUniforms();
  private readonly terrainMat: THREE.MeshStandardNodeMaterial;
  private readonly chunks: Chunk[] = [];
  private readonly tiles: PropTile[] = [];
  private readonly propTiles: PropTile[] = [];
  private lodScale = 1;
  private drawDistance = 2600;
  /** Overview map: every tile drawn, props farther out. */
  overview = false;
  private propDistance = 1100;
  private readonly signalHeads: THREE.InstancedMesh[] = [];

  constructor(readonly map: MapData, quality: Quality) {
    this.group.name = `map:${map.id}`;
    this.terrainMat = terrainMaterial(map.terrain, this.uniforms);
    this.setQuality(quality);
    this.buildTerrain();
    this.buildTiles();
    this.buildBuildings();
    this.buildProps();
    this.buildWater();
    this.buildDistant();
  }

  setQuality(q: Quality): void {
    this.lodScale = q === 'low' ? 0.55 : q === 'medium' ? 0.8 : 1.15;
    this.drawDistance = q === 'low' ? 1600 : q === 'medium' ? 2400 : 3400;
    this.propDistance = q === 'low' ? 600 : q === 'medium' ? 900 : 1400;
  }

  // ---- terrain ----
  private buildTerrain(): void {
    const t = this.map.terrain;
    for (let iz = 0; iz < t.nz; iz += CHUNK) {
      for (let ix = 0; ix < t.nx; ix += CHUNK) {
        const nx = Math.min(CHUNK, t.nx - ix), nz = Math.min(CHUNK, t.nz - iz);
        this.chunks.push({ cx: t.originX + (ix + nx / 2) * t.cell, cz: t.originZ + (iz + nz / 2) * t.cell, ix0: ix, iz0: iz, nx, nz, lods: LOD_STEPS.map(() => null), current: -1 });
      }
    }
  }

  private chunkMesh(c: Chunk, lod: number): THREE.Mesh {
    const cached = c.lods[lod];
    if (cached) return cached;
    const t = this.map.terrain;
    const step = LOD_STEPS[lod];
    const vx = Math.floor(c.nx / step) + 1, vz = Math.floor(c.nz / step) + 1;
    const row = t.nx + 1;
    const ox = t.originX + c.ix0 * t.cell, oz = t.originZ + c.iz0 * t.cell;
    const skirt = 2 * (vx + vz);
    const pos = new Float32Array((vx * vz + skirt * 2) * 3);
    const nor = new Float32Array((vx * vz + skirt * 2) * 3);
    const h = (ix: number, iz: number) => t.heights[Math.min(iz, t.nz) * row + Math.min(ix, t.nx)];
    let k = 0;
    for (let j = 0; j < vz; j++) {
      for (let i = 0; i < vx; i++) {
        const gx = c.ix0 + i * step, gz = c.iz0 + j * step;
        pos[k * 3] = gx * t.cell + t.originX - c.cx;
        pos[k * 3 + 1] = h(gx, gz);
        pos[k * 3 + 2] = gz * t.cell + t.originZ - c.cz;
        const dx = (h(Math.min(gx + 1, t.nx), gz) - h(Math.max(gx - 1, 0), gz)) / (2 * t.cell);
        const dz = (h(gx, Math.min(gz + 1, t.nz)) - h(gx, Math.max(gz - 1, 0))) / (2 * t.cell);
        const l = Math.hypot(dx, 1, dz);
        nor[k * 3] = -dx / l;
        nor[k * 3 + 1] = 1 / l;
        nor[k * 3 + 2] = -dz / l;
        k++;
      }
    }
    void ox;
    void oz;
    const idx: number[] = [];
    const holeIn = (i: number, j: number) => {
      // Any fine cell under this coarse cell is a hole (tunnel portals).
      if (step > 2) return false;
      for (let b = 0; b < step; b++) {
        for (let a = 0; a < step; a++) {
          const cx = c.ix0 + i * step + a, cz = c.iz0 + j * step + b;
          if (cx < t.nx && cz < t.nz && t.materials[cz * t.nx + cx] === MAT.hole) return true;
        }
      }
      return false;
    };
    for (let j = 0; j + 1 < vz; j++) {
      for (let i = 0; i + 1 < vx; i++) {
        if (holeIn(i, j)) continue;
        const a = j * vx + i, b = a + 1, cc = a + vx, d = cc + 1;
        idx.push(a, cc, d, a, d, b);
      }
    }
    // Skirts: each border vertex copied 6 m down, both windings (seen from either side).
    const border: number[] = [];
    for (let i = 0; i < vx; i++) border.push(i);
    for (let j = 1; j < vz; j++) border.push(j * vx + vx - 1);
    for (let i = vx - 2; i >= 0; i--) border.push((vz - 1) * vx + i);
    for (let j = vz - 2; j >= 1; j--) border.push(j * vx);
    const first = k;
    for (const v of border) {
      pos[k * 3] = pos[v * 3];
      pos[k * 3 + 1] = pos[v * 3 + 1] - 6 * step;
      pos[k * 3 + 2] = pos[v * 3 + 2];
      nor[k * 3] = nor[v * 3];
      nor[k * 3 + 1] = nor[v * 3 + 1];
      nor[k * 3 + 2] = nor[v * 3 + 2];
      k++;
    }
    for (let e = 0; e < border.length; e++) {
      const a = border[e], b = border[(e + 1) % border.length];
      const a2 = first + e, b2 = first + ((e + 1) % border.length);
      idx.push(a, b, b2, a, b2, a2, a, b2, b, a, a2, b2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, k * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, k * 3), 3));
    g.setIndex(k > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.terrainMat);
    mesh.position.set(c.cx, 0, c.cz);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    c.lods[lod] = mesh;
    return mesh;
  }

  // ---- roads, bridges, tunnels (per 512 m tile) ----
  private buildTiles(): void {
    const road = roadMaterial(this.uniforms);
    const pad = roadMaterial(this.uniforms, true);
    const concrete = plainMaterial(0xa7a8a4, 0.85);
    const rail = plainMaterial(0xb9bec4, 0.35, 0.8);
    const tunnel = plainMaterial(0xc9c6bd, 0.6);
    const paint = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, vertexColors: true });
    paint.roughnessNode = mix(float(0.6), float(0.2), this.uniforms.wet);
    for (const tile of this.map.render.tiles) {
      const group = new THREE.Group();
      const origin = new THREE.Vector3(tile.cx, 0, tile.cz);
      group.position.copy(origin);
      const add = (a: MeshAccum, mat: THREE.Material, withRoad = false, shadow = true) => {
        const g = accumGeometry(a, origin, withRoad);
        if (!g) return;
        const mesh = new THREE.Mesh(g, mat);
        mesh.receiveShadow = true;
        mesh.castShadow = shadow;
        group.add(mesh);
      };
      add(tile.roads, road, true, false);
      add(tile.pads, pad, true, false);
      add(tile.concrete, concrete);
      add(tile.rails, rail);
      add(tile.verges, this.terrainMat, false, false);
      add(tile.tunnels, tunnel, false, false);
      add(tile.paint, paint, false, false);
      this.group.add(group);
      this.tiles.push({ cx: tile.cx, cz: tile.cz, group });
    }
  }

  // ---- buildings ----
  /** Buildings (§13.4 건물): each spec becomes a few boxes inside its footprint (which is also its collision box) —
   *  towers stand on a retail podium with a setback top, plant and a mast; apartment slabs carry lift and stair
   *  cores; houses get gable roofs; warehouses a lower annex. */
  private buildBuildings(): void {
    const list = this.map.render.buildings;
    if (!list.length) return;
    type Part = { x: number; z: number; y: number; w: number; d: number; h: number; yaw: number; type: number; seed: number; base: number; top: number };
    const boxes: Part[] = [], roofs: Part[] = [];
    for (const b of list) {
      const r = (k: number) => hash01(b.seed % 100000, k);
      const c = Math.cos(b.yaw), sn = Math.sin(b.yaw);
      // A part of this building: local offset (ox along w, oz along d), size, from y0 to y1 above the base.
      const part = (ox: number, oz: number, w: number, d: number, y0: number, y1: number, type: number, into = boxes) =>
        into.push({ x: b.x + ox * c + oz * sn, z: b.z - ox * sn + oz * c, y: b.y + y0, w, d, h: y1 - y0, yaw: b.yaw, type, seed: b.seed % 1000, base: b.y, top: y1 });
      if (b.type === 0 && b.h > 40) {
        const pod = Math.min(b.h * 0.18, 9 + r(1) * 7);
        part(0, 0, b.w, b.d, -1, pod, 5);
        const tw = b.w * (0.74 + r(2) * 0.12), td = b.d * (0.74 + r(3) * 0.12);
        const setAt = b.h * (0.6 + r(4) * 0.22);
        part(0, 0, tw, td, pod, setAt, 0);
        const sw = tw * (0.72 + r(5) * 0.14), sd = td * (0.72 + r(6) * 0.14);
        part(0, 0, sw, sd, setAt, b.h, 0);
        part(0, 0, sw * 0.46, sd * 0.46, b.h, b.h + 4 + r(7) * 4, 6);
        if (b.h > 180 || r(8) > 0.8) part(0, 0, 1.1, 1.1, b.h + 6, b.h + 18 + r(9) * 30, 6);
      } else if (b.type === 1) {
        part(0, 0, b.w, b.d, -1, b.h, 1);
        for (const f of [-0.28, 0.28]) part(f * b.w, 0, 5, Math.min(b.d * 0.7, 8), b.h, b.h + 4.5, 6);
      } else if (b.type === 2) {
        const setback = r(1) > 0.65 && b.h > 14;
        part(0, 0, b.w, b.d, -1, setback ? b.h - 3.5 : b.h, 2);
        if (setback) part(0, -b.d * 0.12, b.w * 0.86, b.d * 0.72, b.h - 3.5, b.h, 2);
        if (r(2) > 0.5) part(b.w * (r(3) - 0.5) * 0.4, 0, Math.min(6, b.w * 0.3), Math.min(5, b.d * 0.3), b.h, b.h + 3, 6);
      } else if (b.type === 3) {
        const split = 0.62 + r(1) * 0.15;
        part(-b.w * (1 - split) / 2, 0, b.w * split, b.d, -1, b.h, 3);
        part(b.w * split / 2, 0, b.w * (1 - split), b.d, -1, b.h * (0.5 + r(2) * 0.2), 3);
      } else if (b.type === 4) {
        part(0, 0, b.w, b.d, -1, b.h, 4);
        const along = b.w >= b.d;
        part(0, 0, (along ? b.w : b.d) + 0.6, (along ? b.d : b.w) + 0.6, b.h, b.h + Math.min(b.w, b.d) * (0.3 + r(1) * 0.12), 7, roofs);
        if (!along) roofs[roofs.length - 1].yaw += Math.PI / 2;
      } else {
        part(0, 0, b.w, b.d, -1, b.h, b.type);
      }
    }
    const instanced = (geo: THREE.BufferGeometry, parts: Part[]) => {
      const info = new Float32Array(parts.length * 4);
      const mesh = new THREE.InstancedMesh(geo, this.buildingMat ??= buildingMaterial(this.uniforms), parts.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      parts.forEach((b, i) => {
        q.setFromAxisAngle(up, b.yaw);
        s.set(b.w, b.h, b.d);
        p.set(b.x, b.y, b.z);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
        info[i * 4] = b.type;
        info[i * 4 + 1] = b.seed;
        info[i * 4 + 2] = b.base;
        info[i * 4 + 3] = b.top;
      });
      geo.setAttribute('bInfo', new THREE.InstancedBufferAttribute(info, 4));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    };
    instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), boxes);
    if (roofs.length) instanced(gableGeometry(), roofs);
  }
  private buildingMat: THREE.MeshStandardNodeMaterial | null = null;

  // ---- trees, lamps, signals, signs, boxes, posts ----
  private buildProps(): void {
    const r = this.map.render;
    const TILE = 512;
    const tileOf = new Map<string, { trees: number[][]; lamps: number[]; posts: number[] }>();
    const get = (x: number, z: number) => {
      const key = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
      let t = tileOf.get(key);
      if (!t) {
        t = { trees: [[], [], []], lamps: [], posts: [] };
        tileOf.set(key, t);
      }
      return t;
    };
    for (let i = 0; i < r.trees.length; i += 5) get(r.trees[i], r.trees[i + 2]).trees[r.trees[i + 4] | 0].push(r.trees[i], r.trees[i + 1], r.trees[i + 2], r.trees[i + 3]);
    for (let i = 0; i < r.lamps.length; i += 6) get(r.lamps[i], r.lamps[i + 2]).lamps.push(...Array.from(r.lamps.subarray(i, i + 6)));
    for (let i = 0; i < r.posts.length; i += 4) get(r.posts[i], r.posts[i + 2]).posts.push(...Array.from(r.posts.subarray(i, i + 4)));
    const treeGeos = [treeGeometry(0), treeGeometry(1), treeGeometry(2)];
    const treeMat = treeMaterial(this.uniforms);
    const pole = new THREE.CylinderGeometry(0.08, 0.11, 1, 6).translate(0, 0.5, 0);
    const arm = new THREE.BoxGeometry(0.08, 0.08, 1).translate(0, 0, 0.5);
    const head = new THREE.BoxGeometry(0.35, 0.12, 0.7);
    const poleMat = plainMaterial(0x6f757c, 0.5, 0.6);
    const headMat = new THREE.MeshStandardNodeMaterial({ color: 0x222222, roughness: 0.4 });
    headMat.emissiveNode = color(0xffd8a0).mul(this.uniforms.night.mul(3.0));
    const postGeo = new THREE.BoxGeometry(0.12, 0.9, 0.12).translate(0, 0.45, 0);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [key, t] of tileOf) {
      const [tx, tz] = key.split(',').map(Number);
      const group = new THREE.Group();
      t.trees.forEach((list, kind) => {
        const n = list.length / 4;
        if (!n) return;
        const inst = new THREE.InstancedMesh(treeGeos[kind], treeMat, n);
        for (let i = 0; i < n; i++) {
          q.setFromAxisAngle(up, (list[i * 4] * 7.13 + list[i * 4 + 2] * 3.7) % 6.28);
          const sc = list[i * 4 + 3];
          s.set(sc, sc * (0.9 + ((list[i * 4] * 13.1) % 1) * 0.3), sc);
          p.set(list[i * 4], list[i * 4 + 1] - 0.1, list[i * 4 + 2]);
          m.compose(p, q, s);
          inst.setMatrixAt(i, m);
        }
        inst.castShadow = true;
        inst.computeBoundingSphere();
        group.add(inst);
      });
      const nl = t.lamps.length / 6;
      if (nl) {
        const poles = new THREE.InstancedMesh(pole, poleMat, nl);
        const arms = new THREE.InstancedMesh(arm, poleMat, nl);
        const heads = new THREE.InstancedMesh(head, headMat, nl);
        for (let i = 0; i < nl; i++) {
          const [x, y, z, yaw, height, kind] = t.lamps.slice(i * 6, i * 6 + 6);
          q.setFromAxisAngle(up, yaw);
          p.set(x, y, z);
          s.set(1, height, 1);
          m.compose(p, q, s);
          poles.setMatrixAt(i, m);
          const reach = kind === 1 ? 0.01 : 1.8;
          s.set(1, 1, reach);
          p.set(x, y + height - 0.1, z);
          m.compose(p, q, s);
          arms.setMatrixAt(i, m);
          const dx = Math.sin(yaw) * (kind === 1 ? 0 : 1.9), dz = Math.cos(yaw) * (kind === 1 ? 0 : 1.9);
          p.set(x + dx, y + height - 0.2, z + dz);
          s.set(1, 1, 1);
          m.compose(p, q, s);
          heads.setMatrixAt(i, m);
        }
        for (const x of [poles, arms, heads]) {
          x.computeBoundingSphere();
          group.add(x);
        }
      }
      const np = t.posts.length / 4;
      if (np) {
        const posts = new THREE.InstancedMesh(postGeo, poleMat, np);
        for (let i = 0; i < np; i++) {
          q.setFromAxisAngle(up, t.posts[i * 4 + 3]);
          p.set(t.posts[i * 4], t.posts[i * 4 + 1], t.posts[i * 4 + 2]);
          s.set(1, 1, 1);
          m.compose(p, q, s);
          posts.setMatrixAt(i, m);
        }
        posts.computeBoundingSphere();
        group.add(posts);
      }
      this.group.add(group);
      this.propTiles.push({ cx: (tx + 0.5) * TILE, cz: (tz + 0.5) * TILE, group });
    }
    this.buildBoxes();
    this.buildSignals();
    for (const sign of r.signs) this.group.add(signMesh(sign));
    if (r.cables.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(r.cables, 3));
      this.group.add(new THREE.LineSegments(g, new THREE.LineBasicNodeMaterial({ color: 0xe6e9ee })));
    }
    this.buildRopes();
    this.buildCylinders();
    this.buildFountains();
    if (r.tunnelLights.length) {
      const n = r.tunnelLights.length / 4;
      const lightMat = new THREE.MeshBasicNodeMaterial({ color: 0xfff1d0 });
      const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.08, 2.4), lightMat, n);
      for (let i = 0; i < n; i++) {
        q.setFromAxisAngle(up, r.tunnelLights[i * 4 + 3]);
        p.set(r.tunnelLights[i * 4], r.tunnelLights[i * 4 + 1], r.tunnelLights[i * 4 + 2]);
        s.set(1, 1, 1);
        m.compose(p, q, s);
        inst.setMatrixAt(i, m);
      }
      inst.computeBoundingSphere();
      this.group.add(inst);
    }
  }

  private buildBoxes(): void {
    const looks = new Map<string, typeof this.map.render.boxes>();
    for (const b of this.map.render.boxes) {
      if (b.look === 'none' && b.color === undefined) continue;
      const key = b.look;
      if (!looks.has(key)) looks.set(key, []);
      looks.get(key)!.push(b);
    }
    const mats: Record<string, THREE.Material> = {
      concrete: plainMaterial(0xb3b3ad, 0.85),
      steel: plainMaterial(0x9aa3ad, 0.35, 0.7),
      container: plainMaterial(0xb44b2e, 0.6, 0.3),
      rock: plainMaterial(0x857d72, 0.95),
      wood: plainMaterial(0x8a6a48, 0.8),
      glass: plainMaterial(0x6c8aa3, 0.1, 0.5),
      dark: plainMaterial(0x2b2e33, 0.6),
      stripe: plainMaterial(0xf0f0ea, 0.6),
      none: plainMaterial(0xd9dde3, 0.6),
    };
    const box = new THREE.BoxGeometry(1, 1, 1);
    const rockGeo = new THREE.DodecahedronGeometry(0.62, 0);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [look, list] of looks) {
      const inst = new THREE.InstancedMesh(look === 'rock' ? rockGeo : box, mats[look] ?? mats.concrete, list.length);
      const col = new THREE.Color();
      list.forEach((b, i) => {
        q.setFromAxisAngle(up, b.yaw);
        p.set(b.cx, b.cy, b.cz);
        s.set(b.hx * 2, b.hy * 2, b.hz * 2);
        m.compose(p, q, s);
        inst.setMatrixAt(i, m);
        if (b.color !== undefined) inst.setColorAt(i, col.setHex(b.color));
        else inst.setColorAt(i, col.setHex(0xffffff));
      });
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      this.group.add(inst);
    }
  }

  /** Suspension main cables: thick steel tubes, one instance per segment. */
  private buildRopes(): void {
    const r = this.map.render.ropes;
    const n = r.length / 7;
    if (!n) return;
    const inst = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0), plainMaterial(0xd8473c, 0.45, 0.5), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), d = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const o = i * 7;
      p.set(r[o], r[o + 1], r[o + 2]);
      d.set(r[o + 3] - r[o], r[o + 4] - r[o + 1], r[o + 5] - r[o + 2]);
      const len = d.length();
      q.setFromUnitVectors(up, d.divideScalar(len || 1));
      s.set(r[o + 6], len, r[o + 6]);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    }
    inst.castShadow = true;
    inst.computeBoundingSphere();
    this.group.add(inst);
  }

  /** Upright cylinders and cones, instanced per look and taper. */
  private buildCylinders(): void {
    const mats: Record<string, THREE.MeshStandardNodeMaterial> = {
      concrete: plainMaterial(0xb3b3ad, 0.85),
      steel: plainMaterial(0xa7b0ba, 0.3, 0.8),
      glass: plainMaterial(0x7d9bb3, 0.08, 0.6),
      white: plainMaterial(0xeef0f2, 0.5),
      stone: plainMaterial(0xc6bca9, 0.8),
      dark: plainMaterial(0x2b2e33, 0.6),
    };
    // Stone: a little noise so a plaza's granite does not read as plastic.
    mats.stone.colorNode = mix(color(0xb9ae98), color(0xd4ccbb), mx_noise_float(positionWorld.mul(1.7)).mul(0.5).add(0.5));
    mats.grass = plainMaterial(0x5d8a3e, 0.95);
    mats.grass.colorNode = mix(color(0x4f7d35), color(0x6f9c48), mx_noise_float(positionWorld.xz.mul(0.35)).mul(0.5).add(0.5));
    // Curtain-wall tower: glass with spandrel bands every floor and mullions round the drum; a share of the windows
    // lit at night (by floor and bay).
    const tower = new THREE.MeshStandardNodeMaterial({ roughness: 0.12, metalness: 0.65 });
    const floorF = fract(positionWorld.y.div(3.8));
    const bay = atan(positionLocal.z, positionLocal.x).div(Math.PI * 2).mul(96);
    const spandrel = step(floorF, 0.2);
    const mullion = step(fract(bay), 0.07);
    const frame = max(spandrel, mullion);
    tower.colorNode = mix(mix(color(0x4d6a82), color(0x7c9ab2), mx_noise_float(positionWorld.mul(0.02)).mul(0.5).add(0.5)), color(0xc9ced4), frame);
    tower.roughnessNode = mix(float(0.08), float(0.6), frame);
    const cell = floor(positionWorld.y.div(3.8)).mul(131.7).add(floor(bay).mul(17.3));
    const on = step(0.58, fract(sin(cell).mul(43758.5453)));
    tower.emissiveNode = color(0xffd9a0).mul(on.mul(float(1).sub(frame)).mul(this.uniforms.night).mul(0.8));
    mats.tower = tower;
    const groups = new Map<string, typeof this.map.render.cylinders>();
    for (const c of this.map.render.cylinders) {
      if (c.look === 'none') continue;
      const taper = Math.round(((c.r1 ?? c.r0) / c.r0) * 20) / 20;
      const key = `${c.look}|${taper}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    for (const [key, list] of groups) {
      const [look, taper] = [key.split('|')[0], Number(key.split('|')[1])];
      const geo = new THREE.CylinderGeometry(taper, 1, 1, 28).translate(0, 0.5, 0);
      const inst = new THREE.InstancedMesh(geo, mats[look] ?? mats.concrete, list.length);
      list.forEach((c, i) => {
        p.set(c.x, c.y0, c.z);
        s.set(c.r0, c.y1 - c.y0, c.r0);
        m.compose(p, q, s);
        inst.setMatrixAt(i, m);
        inst.setColorAt(i, col.setHex(c.color ?? 0xffffff));
      });
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      this.group.add(inst);
    }
  }

  /**
   * Fountains: the pool's water surface, a tall central jet and a ring of arcing jets. The jets are open tubes of
   * translucent water whose surface streams upward (noise scrolled with time), brighter where they catch the light;
   * a spray cloud of soft particles hangs at the top. Visual only.
   */
  private buildFountains(): void {
    const list = this.map.render.fountains;
    if (!list.length) return;
    const water = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.04, metalness: 0, transparent: true });
    const ripple = mx_noise_float(vec3(positionWorld.xz.mul(1.4), time.mul(1.6)));
    water.colorNode = mix(color(0x2d6f86), color(0x6fb3c8), ripple.mul(0.5).add(0.5));
    water.opacityNode = float(0.86);
    const jet = new THREE.MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0, transparent: true, depthWrite: false });
    const flow = mx_noise_float(vec3(positionLocal.x.mul(3), positionLocal.y.mul(2.5).sub(time.mul(5)), positionLocal.z.mul(3)));
    jet.colorNode = mix(color(0xcfe9f2), color(0xffffff), flow.mul(0.5).add(0.5));
    jet.opacityNode = flow.mul(0.2).add(0.72);
    jet.emissiveNode = color(0x9fd7ff).mul(this.uniforms.night.mul(0.8)); // lit from below at night
    jet.side = THREE.DoubleSide;
    const rimMat = plainMaterial(0xcfc6b4, 0.75);
    rimMat.colorNode = mix(color(0xbdb29c), color(0xdcd4c3), mx_noise_float(positionWorld.mul(2.1)).mul(0.5).add(0.5));
    for (const f of list) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(f.r - 0.3, 48).rotateX(-Math.PI / 2), water);
      pool.position.set(f.x, f.y, f.z);
      pool.renderOrder = 2;
      this.group.add(pool);
      // The rim: a stone band standing 35 cm over the water, rounded on top.
      const band = new THREE.Mesh(new THREE.CylinderGeometry(f.r, f.r, 1.55, 48, 1, true), rimMat);
      band.position.set(f.x, f.y - 0.42, f.z);
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(f.r - 0.55, f.r - 0.55, 0.6, 48, 1, true), rimMat);
      inner.position.set(f.x, f.y + 0.05, f.z);
      inner.material.side = THREE.DoubleSide;
      const cap = new THREE.Mesh(new THREE.TorusGeometry(f.r - 0.28, 0.3, 8, 64).rotateX(Math.PI / 2), rimMat);
      cap.position.set(f.x, f.y + 0.35, f.z);
      for (const m of [band, inner, cap]) {
        m.castShadow = m.receiveShadow = true;
        this.group.add(m);
      }
      // Central jet: a column rising from the upper bowl that flares into a falling crown, and a curtain of water
      // spilling from the lower bowl.
      const h = f.height;
      const prof = [
        new THREE.Vector2(0.32, 0), new THREE.Vector2(0.26, h * 0.45), new THREE.Vector2(0.2, h * 0.8), new THREE.Vector2(0.5, h * 0.96),
        new THREE.Vector2(1.1, h * 0.93), new THREE.Vector2(1.7, h * 0.78), new THREE.Vector2(2.1, h * 0.55), new THREE.Vector2(2.3, h * 0.35),
      ];
      const centre = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), jet);
      centre.position.set(f.x, f.y + 2.9, f.z);
      const curtain = new THREE.Mesh(new THREE.CylinderGeometry(f.r * 0.36, f.r * 0.42, 1.3, 32, 1, true), jet);
      curtain.position.set(f.x, f.y + 0.65, f.z);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(f.r * 0.2, f.r * 0.24, 1.6, 24, 1, true), jet);
      upper.position.set(f.x, f.y + 2.1, f.z);
      for (const m of [centre, curtain, upper]) {
        m.renderOrder = 3;
        this.group.add(m);
      }
      // Ring jets: parabolic arcs from the rim toward the centrepiece.
      for (let k = 0; k < f.jets; k++) {
        const a = (k / f.jets) * Math.PI * 2;
        const x0 = Math.cos(a) * (f.r - 0.5), z0 = Math.sin(a) * (f.r - 0.5);
        const pts: THREE.Vector3[] = [];
        for (let t = 0; t <= 1.0001; t += 0.1) pts.push(new THREE.Vector3(x0 * (1 - t * 0.72), 4 * t * (1 - t) * (h * 0.42) + 0.3, z0 * (1 - t * 0.72)));
        const arc = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.13, 6, false), jet);
        arc.position.set(f.x, f.y, f.z);
        arc.renderOrder = 3;
        this.group.add(arc);
      }
    }
  }

  private buildSignals(): void {
    const list = this.map.render.signals;
    if (!list.length) return;
    const poleMat = plainMaterial(0x3b3f45, 0.5, 0.5);
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.12, 1, 6).translate(0, 0.5, 0), poleMat, list.length);
    const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 1).translate(0, 0, 0.5), poleMat, list.length);
    const housings = new THREE.InstancedMesh(new THREE.BoxGeometry(1.25, 0.42, 0.3), plainMaterial(0x202226, 0.5), list.length);
    const group = new THREE.InstancedBufferAttribute(new Float32Array(list.map((s) => s.group)), 1);
    const colors = [0xff3b30, 0xffc400, 0x2ee66b];
    const lamps = colors.map((hex, k) => {
      const mat = new THREE.MeshBasicNodeMaterial();
      // Cycle: group 0 green 0–30 s, yellow 30–34, red 34–68; group 1 shifted by 34 s.
      const g = attribute('sGroup', 'float');
      const t = mod(this.uniforms.signalClock.add(g.mul(34)), 68);
      const on = k === 2 ? step(t, 30) : k === 1 ? step(30, t).mul(step(t, 34)) : step(34, t);
      mat.colorNode = mix(color(hex).mul(0.12), color(hex).mul(2.2), on);
      const geo = new THREE.SphereGeometry(0.13, 10, 6);
      geo.setAttribute('sGroup', group);
      return new THREE.InstancedMesh(geo, mat, list.length);
    });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    list.forEach((sig, i) => {
      // The arm reaches over the lanes (toward the road centre, perpendicular to the facing direction).
      const fx = Math.sin(sig.yaw), fz = Math.cos(sig.yaw);
      const ax = -fz, az = fx; // left of the facing direction = toward the road centre (the pole stands on the right kerb)
      q.setFromAxisAngle(up, sig.yaw);
      p.set(sig.x, sig.y, sig.z);
      s.set(1, 5.6, 1);
      m.compose(p, q, s);
      poles.setMatrixAt(i, m);
      const armYaw = Math.atan2(ax, az);
      q.setFromAxisAngle(up, armYaw);
      p.set(sig.x, sig.y + 5.5, sig.z);
      s.set(1, 1, sig.arm);
      m.compose(p, q, s);
      arms.setMatrixAt(i, m);
      const hx = sig.x + ax * sig.arm * 0.75, hz = sig.z + az * sig.arm * 0.75;
      q.setFromAxisAngle(up, armYaw);
      p.set(hx, sig.y + 5.2, hz);
      s.set(1, 1, 1);
      m.compose(p, q, s);
      housings.setMatrixAt(i, m);
      lamps.forEach((l, k) => {
        p.set(hx + ax * (k - 1) * 0.38 + fx * 0.16, sig.y + 5.2, hz + az * (k - 1) * 0.38 + fz * 0.16);
        m.compose(p, q, s);
        l.setMatrixAt(i, m);
      });
    });
    for (const x of [poles, arms, housings, ...lamps]) {
      x.computeBoundingSphere();
      this.group.add(x);
    }
    this.signalHeads.push(...lamps);
  }

  // ---- water ----
  private buildWater(): void {
    const mat = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.06, metalness: 0, transparent: true });
    const ripple = mx_noise_float(vec3(positionWorld.xz.mul(0.08), time.mul(0.25))).mul(0.5).add(mx_noise_float(vec3(positionWorld.xz.mul(0.5), time.mul(0.6))).mul(0.2));
    const view = length(positionWorld.sub(cameraPosition));
    mat.colorNode = mix(color(0x1f4a5a), color(0x3d6f7c), ripple.add(0.5).clamp(0, 1));
    mat.opacityNode = clamp(float(0.82).add(view.div(4000)), 0.82, 0.97);
    mat.roughnessNode = float(0.05).add(this.uniforms.wet.mul(0.1)).add(abs(ripple).mul(0.05));
    for (const w of this.map.render.water) {
      let g: THREE.BufferGeometry;
      if (w.kind === 'river') {
        const pts = w.points;
        const hw = (w.width ?? 100) / 2 + 40;
        const pos: number[] = [];
        const idx: number[] = [];
        const dense: Array<[number, number]> = [];
        for (let i = 0; i + 1 < pts.length; i++) {
          const n = Math.ceil(Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) / 50);
          for (let k = 0; k < n; k++) dense.push([pts[i][0] + ((pts[i + 1][0] - pts[i][0]) * k) / n, pts[i][1] + ((pts[i + 1][1] - pts[i][1]) * k) / n]);
        }
        dense.push(pts[pts.length - 1]);
        dense.forEach(([x, z], i) => {
          const a = dense[Math.max(i - 1, 0)], b = dense[Math.min(i + 1, dense.length - 1)];
          const tx = b[0] - a[0], tz = b[1] - a[1];
          const l = Math.hypot(tx, tz) || 1;
          const nx = -tz / l, nz = tx / l;
          pos.push(x - nx * hw, w.level, z - nz * hw, x + nx * hw, w.level, z + nz * hw);
          if (i > 0) {
            const k = i * 2;
            idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
          }
        });
        g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
      } else {
        const shape = new THREE.Shape(w.points.map(([x, z]) => new THREE.Vector2(x, -z)));
        g = new THREE.ShapeGeometry(shape, 4).rotateX(-Math.PI / 2).translate(0, w.level, 0);
      }
      g.computeVertexNormals();
      // Make normals point up whatever the winding came out as.
      const nrm = g.getAttribute('normal');
      for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
      const mesh = new THREE.Mesh(g, mat);
      mesh.material.side = THREE.DoubleSide;
      mesh.renderOrder = 2;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  /** Distant mountains around the map (visual only): a ring out to 14 km. */
  private buildDistant(): void {
    const half = this.map.size / 2;
    const rings = 24, segs = 128;
    const pos: number[] = [];
    const idx: number[] = [];
    const t = this.map.terrain;
    for (let r = 0; r <= rings; r++) {
      const f = r / rings;
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const dx = Math.cos(a), dz = Math.sin(a);
        // Start just inside the map edge (the square's boundary along this direction).
        const edge = half / Math.max(Math.abs(dx), Math.abs(dz));
        const d = edge * 0.985 + f * f * 12000;
        const x = dx * d, z = dz * d;
        const edgeH = t.heightAt(dx * edge * 0.985, dz * edge * 0.985);
        const mountains = 180 + 520 * Math.pow(Math.abs(Math.sin(a * 3.7 + 1.3) * Math.cos(a * 7.1)), 0.6) * Math.sin(Math.PI * Math.min(f * 1.4, 1)) + 90 * Math.sin(a * 23 + f * 5);
        const y = r === 0 ? edgeH - 2 : edgeH * (1 - f) + mountains * Math.min(f * 3, 1) - f * f * 600;
        pos.push(x, y, z);
      }
    }
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < segs; s++) {
        const a = r * segs + s, b = r * segs + ((s + 1) % segs), c = a + segs, d = b + segs;
        idx.push(a, d, c, a, b, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
    const slope = float(1).sub(normalWorld.y);
    const hgt = positionWorld.y;
    mat.colorNode = mix(mix(color(0x55703f), color(0x6c665d), smoothstep(0.25, 0.5, slope)), color(0xeef2f6), smoothstep(420, 620, hgt).max(this.uniforms.snow.mul(0.8)));
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = false;
    this.group.add(mesh);
  }

  /** Per frame: terrain LOD, tile and prop visibility by distance. */
  update(camera: THREE.Camera, dt: number): void {
    this.uniforms.signalClock.value += dt;
    const cx = camera.position.x, cz = camera.position.z;
    const cy = camera.position.y;
    // A chunk switches LOD only once clear of the boundary (no flicker back and forth), and at most one mesh that is
    // not built yet is built per frame (a burst of builds was a visible hitch); the others keep their LOD meanwhile.
    const lodAt = (d: number) => (d < 420 ? 0 : d < 900 ? 1 : d < 1800 ? 2 : d < 3600 ? 3 : 4);
    let builds = 0;
    for (const c of this.chunks) {
      const d = Math.hypot(c.cx - cx, c.cz - cz, (cy - this.map.terrain.heightAt(c.cx, c.cz)) * 0.5) / this.lodScale;
      const lod = lodAt(d);
      if (lod !== c.current) {
        if (c.current >= 0 && lodAt(d * (lod > c.current ? 0.93 : 1.07)) === c.current) continue;
        if (c.current >= 0 && !c.lods[lod] && builds++ > 0) continue;
        if (c.current >= 0) this.group.remove(c.lods[c.current]!);
        this.group.add(this.chunkMesh(c, lod));
        c.current = lod;
      }
    }
    const draw = this.overview ? Infinity : this.drawDistance, props = this.overview ? this.propDistance * 2 : this.propDistance;
    for (const t of this.tiles) t.group.visible = Math.hypot(t.cx - cx, t.cz - cz) < draw;
    for (const t of this.propTiles) t.group.visible = Math.hypot(t.cx - cx, t.cz - cz) < props;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
    });
    for (const c of this.chunks) for (const m of c.lods) m?.geometry.dispose();
    this.group.removeFromParent();
  }
}

function signMesh(sign: Sign): THREE.Object3D {
  const canvas = document.createElement('canvas');
  const big = sign.kind === 'highway';
  canvas.width = 1024;
  canvas.height = sign.sub ? 384 : 256;
  const g = canvas.getContext('2d')!;
  const bg = sign.kind === 'highway' ? '#1f6b3a' : sign.kind === 'street' ? '#1d4f9a' : sign.kind === 'place' ? '#6b4a2b' : '#f4f4f2';
  const fg = sign.kind === 'info' ? '#1b1d21' : '#ffffff';
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 28);
  g.fill();
  g.strokeStyle = fg;
  g.lineWidth = 8;
  g.beginPath();
  g.roundRect(24, 24, canvas.width - 48, canvas.height - 48, 20);
  g.stroke();
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${big ? 104 : 96}px Pretendard, Inter, sans-serif`;
  g.fillText(sign.text.ko, canvas.width / 2, sign.sub ? 118 : canvas.height / 2 - 18);
  g.font = '500 56px Inter, Pretendard, sans-serif';
  g.fillText(sign.sub ? sign.sub.ko : sign.text.en, canvas.width / 2, sign.sub ? 250 : canvas.height / 2 + 62);
  if (sign.sub) {
    g.font = '500 40px Inter, sans-serif';
    g.fillText(sign.text.en, canvas.width / 2, 322);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const w = big ? 7.5 : 3.2;
  const h = (w * canvas.height) / canvas.width;
  const mat = new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.5 });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), plainMaterial(0x9aa0a6, 0.6, 0.5));
  back.rotation.y = Math.PI;
  const group = new THREE.Group();
  group.add(board, back);
  if (!big) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4 + h, 6), plainMaterial(0x7d838a, 0.5, 0.6));
    post.position.y = -(2.4 + h) / 2 + h / 2 - 0.02;
    post.position.z = -0.05;
    group.add(post);
    board.position.y = back.position.y = 0;
  }
  group.position.set(sign.x, sign.y + (big ? 0 : 2.4 + h / 2), sign.z);
  group.rotation.y = sign.yaw;
  return group;
}


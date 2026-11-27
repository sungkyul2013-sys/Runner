import * as THREE from 'three';
import type { AircraftSpec, Livery, WingGeom, GearDef } from './specs';
import { GLOW } from '../world/Airport';

const DEG = Math.PI / 180;

export interface Hinged { pivot: THREE.Object3D; flap: THREE.Object3D; sign: number; max: number }
export interface GearVis { def: GearDef; root: THREE.Object3D; piston: THREE.Object3D; wheel: THREE.Object3D; foldAxis: THREE.Vector3; foldAngle: number }
export interface AircraftVisual {
  root: THREE.Group;
  body: THREE.Group;
  ailerons: Hinged[]; flaps: Hinged[]; elevators: Hinged[]; rudders: Hinged[]; airbrakes: Hinged[];
  props: { hub: THREE.Object3D; blades: THREE.Object3D; disc: THREE.Mesh }[];
  flames: THREE.Mesh[];
  nozzles: THREE.Vector3[];
  gear: GearVis[];
  nav: THREE.Points;
  landingLight: THREE.SpotLight | null;
  wingL: THREE.Group; wingR: THREE.Group; tail: THREE.Group;
  tipL: THREE.Vector3; tipR: THREE.Vector3;
  paint: THREE.MeshPhysicalMaterial;
  canopy: THREE.Mesh | null;
  radius: number;
  flameUniforms: { uThr: { value: number }; uAB: { value: number }; uTime: { value: number } };
}

/* ---------- textures ---------- */
function liveryTexture(spec: AircraftSpec, lv: Livery): THREE.Texture {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  g.fillStyle = hex(lv.base); g.fillRect(0, 0, W, H);
  const style = spec.geom.style;
  // v (y on canvas) = along fuselage nose(0)->tail(H); u (x) = around from top
  if (style === 'airliner' || style === 'turboprop') {
    // belly
    g.fillStyle = style === 'airliner' ? '#c8ccd2' : hex(lv.accent);
    g.fillRect(W * 0.36, 0, W * 0.28, H);
    // cheat lines
    for (const u of [0.25, 0.75]) {
      g.fillStyle = hex(lv.accent); g.fillRect(W * u - 26, H * 0.08, 52, H * 0.9);
      g.fillStyle = hex(lv.stripe); g.fillRect(W * u + (u < 0.5 ? 28 : -36), H * 0.12, 8, H * 0.86);
    }
    // cabin windows
    if (style === 'airliner') {
      g.fillStyle = '#10161d';
      for (const u of [0.205, 0.795]) for (let v = 0.2; v < 0.78; v += 0.0145) g.fillRect(W * u - 4, H * v, 8, 4);
      // doors
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
      for (const v of [0.17, 0.5, 0.8]) for (const u of [0.2, 0.8]) g.strokeRect(W * u - 12, H * v, 24, 11);
    }
    // cockpit windscreen
    g.fillStyle = '#0c1218';
    const vn = spec.geom.noseLen / spec.geom.length;
    g.beginPath(); g.moveTo(W * 0.38, H * vn * 0.68); g.lineTo(W * 0.62, H * vn * 0.68); g.lineTo(W * 0.66, H * vn * 0.86); g.lineTo(W * 0.34, H * vn * 0.86); g.fill();
    g.fillRect(W * 0.1, H * vn * 0.7, W * 0.07, H * vn * 0.14); g.fillRect(W * 0.83, H * vn * 0.7, W * 0.07, H * vn * 0.14);
    // remap: cockpit is on top (u=0/1); draw again at wrapped location
    g.fillRect(0, H * vn * 0.7, W * 0.05, H * vn * 0.14); g.fillRect(W * 0.95, H * vn * 0.7, W * 0.05, H * vn * 0.14);
  } else if (style === 'prop') {
    for (const u of [0.25, 0.75]) {
      g.fillStyle = hex(lv.accent); g.fillRect(W * u - 34, 0, 68, H);
      g.fillStyle = hex(lv.stripe); g.fillRect(W * u - 34, H * 0.15, 68, 14);
    }
    g.fillStyle = hex(lv.accent); g.fillRect(0, 0, W, H * 0.12);
  } else {
    // military: subtle two-tone + stripe on spine
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, hex(lv.base)); grd.addColorStop(0.5, hex(lv.accent)); grd.addColorStop(1, hex(lv.base));
    g.fillStyle = grd; g.globalAlpha = 0.45; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    g.fillStyle = hex(lv.stripe); g.fillRect(W * 0.49, H * 0.25, W * 0.02, H * 0.5);
    // radome
    g.fillStyle = 'rgba(40,44,50,0.55)'; g.fillRect(0, 0, W, H * 0.07);
  }
  // markings: insignia / titles / registration
  const along = (u: number, v: number, text: string, size: number, color: string, flip: boolean) => {
    g.save(); g.translate(W * u, H * v); g.rotate(flip ? -Math.PI / 2 : Math.PI / 2);
    g.fillStyle = color; g.font = `bold ${size}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 0, 0); g.restore();
  };
  if (style === 'airliner' || style === 'turboprop') {
    along(0.27, 0.42, style === 'airliner' ? 'HORIZON AIR' : 'HORIZON CARGO', 30, hex(lv.accent), false);
    along(0.73, 0.42, style === 'airliner' ? 'HORIZON AIR' : 'HORIZON CARGO', 30, hex(lv.accent), true);
    along(0.3, 0.86, 'HL7320', 14, '#333', false); along(0.7, 0.86, 'HL7320', 14, '#333', true);
  } else if (style === 'jet' || style === 'stealth') {
    for (const u of [0.3, 0.7]) {
      const x = W * u, y = H * 0.62;
      g.fillStyle = 'rgba(30,34,40,0.75)'; g.beginPath(); g.arc(x, y, 18, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(200,205,210,0.8)'; g.beginPath(); g.moveTo(x - 11, y + 6); g.lineTo(x, y - 10); g.lineTo(x + 11, y + 6); g.lineTo(x, y); g.closePath(); g.fill();
    }
    along(0.27, 0.32, spec.id === 'specter' ? '07' : '214', 26, 'rgba(30,34,40,0.6)', false);
    along(0.73, 0.32, spec.id === 'specter' ? '07' : '214', 26, 'rgba(30,34,40,0.6)', true);
    g.fillStyle = 'rgba(200,40,30,0.7)'; g.fillRect(W * 0.2, H * 0.08, 10, 18); g.fillRect(W * 0.8 - 10, H * 0.08, 10, 18); // ejection warning
  } else {
    along(0.25, 0.55, 'HL-1172', 24, hex(lv.accent), false); along(0.75, 0.55, 'HL-1172', 24, hex(lv.accent), true);
  }
  // panel lines & rivets (also baked into a height map → normal map)
  const pc = document.createElement('canvas'); pc.width = W; pc.height = H;
  const pg = pc.getContext('2d')!;
  pg.fillStyle = '#808080'; pg.fillRect(0, 0, W, H);
  pg.strokeStyle = '#3a3a3a'; pg.lineWidth = 2;
  g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 1.2;
  const vs: number[] = []; for (let v = 0.06; v < 1; v += 0.055 + Math.random() * 0.03) vs.push(v);
  for (const v of vs) { g.beginPath(); g.moveTo(0, H * v); g.lineTo(W, H * v); g.stroke(); pg.beginPath(); pg.moveTo(0, H * v); pg.lineTo(W, H * v); pg.stroke(); }
  for (let u = 0; u < 1; u += 0.0625) { const seg = Math.random(); g.beginPath(); g.moveTo(W * u, H * seg * 0.3); g.lineTo(W * u, H * (0.5 + seg * 0.5)); g.stroke(); pg.beginPath(); pg.moveTo(W * u, H * seg * 0.3); pg.lineTo(W * u, H * (0.5 + seg * 0.5)); pg.stroke(); }
  pg.fillStyle = '#5a5a5a';
  for (const v of vs) for (let x = 4; x < W; x += 9) pg.fillRect(x, H * v + 4, 1.5, 1.5);
  for (let i = 0; i < 26; i++) { pg.strokeStyle = '#404040'; pg.strokeRect(Math.random() * W, Math.random() * H, 20 + Math.random() * 60, 14 + Math.random() * 40); }
  normalCache.set(c, heightToNormal(pc));
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < 1600; i++) g.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
  // grime / weathering
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * W, y = Math.random() * H, r = 20 + Math.random() * 80;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(0,0,0,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.normal = normalCache.get(c);
  return t;
}

const normalCache = new WeakMap<HTMLCanvasElement, THREE.Texture>();
/** Sobel height → tangent-space normal map. */
function heightToNormal(src: HTMLCanvasElement): THREE.Texture {
  const W = src.width, H = src.height;
  const d = src.getContext('2d')!.getImageData(0, 0, W, H).data;
  const out = new ImageData(W, H);
  const hgt = (x: number, y: number) => d[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (hgt(x + 1, y) - hgt(x - 1, y)) * 3, dy = (hgt(x, y + 1) - hgt(x, y - 1)) * 3;
    const l = Math.hypot(dx, dy, 1);
    const k = (y * W + x) * 4;
    out.data[k] = (-dx / l * 0.5 + 0.5) * 255; out.data[k + 1] = (dy / l * 0.5 + 0.5) * 255; out.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[k + 3] = 255;
  }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d')!.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  return t;
}

function finTexture(spec: AircraftSpec, lv: Livery): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  g.fillStyle = hex(spec.geom.style === 'airliner' || spec.geom.style === 'turboprop' ? lv.accent : lv.base); g.fillRect(0, 0, 256, 256);
  g.fillStyle = hex(lv.stripe);
  if (spec.geom.style === 'airliner') { g.beginPath(); g.arc(150, 120, 48, 0, Math.PI * 2); g.fill(); g.fillStyle = hex(lv.base); g.beginPath(); g.arc(150, 120, 30, 0, Math.PI * 2); g.fill(); }
  else if (spec.geom.style === 'prop') { g.fillRect(0, 160, 256, 18); g.fillRect(0, 186, 256, 6); }
  else { g.font = 'bold 54px Arial'; g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillText(spec.id === 'specter' ? 'SF' : 'F9', 120, 120); g.fillStyle = hex(lv.stripe); g.fillRect(0, 200, 256, 10); }
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 256; i += 40) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- geometry primitives ---------- */
function naca(x: number, t: number) {
  return 5 * t * (0.2969 * Math.sqrt(Math.max(x, 0)) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x);
}

/** Lofted airfoil surface. map(s, c, t) returns a point for span s∈[0,1], chord frac c, signed half-thickness t (fraction of chord). */
function surface(s0: number, s1: number, c0: number, c1: number, ns: number, nc: number, thick: number, camber: number, map: (s: number, c: number, t: number) => THREE.Vector3, caps = true): THREE.BufferGeometry {
  const prof: [number, number][] = [];
  for (let i = 0; i <= nc; i++) { const k = 0.5 - 0.5 * Math.cos((i / nc) * Math.PI); const c = c0 + (c1 - c0) * k; prof.push([c, naca(c, thick) + camber * 4 * c * (1 - c)]); }
  for (let i = nc - 1; i >= 1; i--) { const k = 0.5 - 0.5 * Math.cos((i / nc) * Math.PI); const c = c0 + (c1 - c0) * k; prof.push([c, -naca(c, thick) + camber * 4 * c * (1 - c)]); }
  const P = prof.length;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= ns; j++) {
    const s = s0 + ((s1 - s0) * j) / ns;
    for (let i = 0; i < P; i++) {
      const v = map(s, prof[i][0], prof[i][1]);
      pos.push(v.x, v.y, v.z);
      uv.push(v.x / 8, v.z / 8);
    }
  }
  for (let j = 0; j < ns; j++) for (let i = 0; i < P; i++) {
    const a = j * P + i, b = j * P + ((i + 1) % P), c = (j + 1) * P + i, d = (j + 1) * P + ((i + 1) % P);
    idx.push(a, b, c, b, d, c);
  }
  if (caps) {
    for (const j of [0, ns]) {
      const base = pos.length / 3;
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < P; i++) { cx += pos[(j * P + i) * 3]; cy += pos[(j * P + i) * 3 + 1]; cz += pos[(j * P + i) * 3 + 2]; }
      pos.push(cx / P, cy / P, cz / P); uv.push(0, 0);
      for (let i = 0; i < P; i++) {
        const a = j * P + i, b = j * P + ((i + 1) % P);
        if (j === 0) idx.push(base, b, a); else idx.push(base, a, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function wingMap(w: WingGeom, side: number) {
  const half = w.span / 2;
  const tanS = Math.tan(w.sweep * DEG), tanD = Math.tan(w.dihedral * DEG);
  return (s: number, c: number, t: number) => {
    const chord = w.root + (w.tip - w.root) * s;
    const x = side * s * half;
    return new THREE.Vector3(x, w.y + Math.abs(x) * tanD + t * chord, w.z + s * half * tanS + c * chord);
  };
}

function hinge(geo: THREE.BufferGeometry, a: THREE.Vector3, b: THREE.Vector3, mat: THREE.Material, sign: number, max: number, parent: THREE.Object3D): Hinged {
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
  geo.translate(-a.x, -a.y, -a.z);
  geo.applyQuaternion(q.clone().invert());
  const pivot = new THREE.Object3D();
  pivot.position.copy(a);
  pivot.quaternion.copy(q);
  const flap = new THREE.Object3D();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  flap.add(m);
  pivot.add(flap);
  parent.add(pivot);
  return { pivot, flap, sign, max };
}

function loftFuselage(spec: AircraftSpec): THREE.BufferGeometry {
  const G = spec.geom;
  const NA = 72, NL = 140;
  const zN = -G.length * 0.52, R = G.radius;
  const tn = G.noseLen / G.length, tt = G.tailLen / G.length;
  const n = G.style === 'stealth' ? 3.2 : G.style === 'turboprop' ? 2.6 : 2.15;
  const endR = G.style === 'jet' ? 0.72 : G.style === 'stealth' ? 0.62 : G.style === 'prop' ? 0.1 : 0.18;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= NL; j++) {
    const t = j / NL;
    let r: number, yc = 0, ry = G.heightScale, rx = 1;
    if (t < tn) {
      const u = t / tn;
      const sharp = G.style === 'jet' || G.style === 'stealth' ? 0.62 : G.style === 'prop' ? 0.35 : 0.5;
      r = Math.pow(1 - Math.pow(1 - u, 2), sharp);
      if (G.style === 'prop') r = 0.55 + 0.45 * r;
      if (G.style === 'airliner' || G.style === 'turboprop') yc = -(1 - u) * (1 - u) * R * 0.35;
      if (G.style === 'stealth') { rx = 1 + (1 - u) * 0.15; }
    } else if (t > 1 - tt) {
      const u = (t - (1 - tt)) / tt;
      const sm = u * u * (3 - 2 * u);
      r = 1 + (endR - 1) * sm;
      yc = G.tailUp * Math.pow(u, 1.6) * R;
    } else r = 1;
    if (G.style === 'stealth') { rx *= 1.45; ry *= 0.75; }
    const z = zN + t * G.length;
    for (let i = 0; i <= NA; i++) {
      const th = (i / NA) * Math.PI * 2;
      const s = Math.sin(th), c = Math.cos(th);
      const sx = Math.sign(s) * Math.pow(Math.abs(s), 2 / n), sy = Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      // flatter belly for airliners/transports
      let yy = sy * R * r * ry;
      if ((G.style === 'airliner' || G.style === 'turboprop') && c < 0) yy *= 0.92;
      pos.push(sx * R * r * rx, yc + yy, z);
      uv.push(i / NA, t);
    }
  }
  for (let j = 0; j < NL; j++) for (let i = 0; i < NA; i++) {
    const a = j * (NA + 1) + i, b = a + 1, c = a + NA + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const flameVS = `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
  #include <logdepthbuf_vertex>
  }`;
const flameFS = `
  #include <logdepthbuf_pars_fragment>
  uniform float uThr, uAB, uTime; varying vec2 vUv;
  void main(){
    #include <logdepthbuf_fragment>
    float v = 1.0 - vUv.y; // 0 at nozzle
    float len = mix(0.25, 1.0, uAB);
    float body = smoothstep(len, 0.0, v);
    float diamonds = 0.6 + 0.4*sin(v*48.0 - uTime*30.0);
    vec3 core = mix(vec3(1.0,0.55,0.25), vec3(0.45,0.6,1.0), smoothstep(0.0, 0.5, v*(1.0-uAB*0.5)));
    float a = body * (uThr*0.35 + uAB*0.9) * mix(1.0, diamonds, uAB);
    a *= 0.85 + 0.15*sin(uTime*90.0 + v*10.0);
    gl_FragColor = vec4(core*a*2.2, a);
  }`;

export function buildAircraft(spec: AircraftSpec, liveryIdx = 0, withLights = false): AircraftVisual {
  const G = spec.geom;
  const lv = spec.liveries[liveryIdx % spec.liveries.length];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const liv = liveryTexture(spec, lv);
  const paint = new THREE.MeshPhysicalMaterial({ map: liv, normalMap: liv.userData.normal ?? null, normalScale: new THREE.Vector2(0.6, 0.6), metalness: lv.metal, roughness: lv.rough, clearcoat: G.style === 'airliner' || G.style === 'prop' ? 0.8 : 0.2, clearcoatRoughness: 0.18, sheen: 0 });
  const wingMat = new THREE.MeshPhysicalMaterial({ color: G.style === 'airliner' ? 0xd5d8dc : lv.base, metalness: lv.metal, roughness: lv.rough + 0.05, clearcoat: paint.clearcoat * 0.6 });
  const surfMat = wingMat.clone();
  surfMat.color.multiplyScalar(0.93);
  const finMat = new THREE.MeshPhysicalMaterial({ map: finTexture(spec, lv), metalness: lv.metal, roughness: lv.rough, clearcoat: paint.clearcoat });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.85, roughness: 0.35 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.15 });
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = body) => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };

  // Fuselage
  mesh(loftFuselage(spec), paint);

  // Wings
  const W = G.wing;
  const wingL = new THREE.Group(), wingR = new THREE.Group();
  body.add(wingL, wingR);
  const ailerons: Hinged[] = [], flaps: Hinged[] = [], elevators: Hinged[] = [], rudders: Hinged[] = [], airbrakes: Hinged[] = [];
  const camber = G.style === 'prop' || G.style === 'turboprop' || G.style === 'airliner' ? 0.02 : 0;
  const hc = 0.74, ff = W.flapFrac ?? 0.4;
  for (const side of [-1, 1]) {
    const grp = side < 0 ? wingL : wingR;
    const map = wingMap(W, side);
    mesh(surface(0, 1, 0, hc, 24, 22, W.thick, camber, map), wingMat, grp);
    const tipS = 0.94;
    mesh(surface(tipS, 1, hc, 1, 1, 6, W.thick, camber, map), wingMat, grp);
    const ail0 = Math.max(ff, 0.5);
    const a = map(ail0, hc, 0), b = map(tipS, hc, 0);
    ailerons.push(hinge(surface(ail0, tipS, hc, 1, 4, 6, W.thick, camber, map), a, b, surfMat, side, 20 * DEG, grp));
    if (ff > 0.05) {
      const f0 = 0.08;
      flaps.push(hinge(surface(f0, ff, hc, 1, 4, 6, W.thick, camber, map), map(f0, hc, 0), map(ff, hc, 0), surfMat, side, 38 * DEG, grp));
      if (ail0 > ff + 0.01) mesh(surface(ff, ail0, hc, 1, 2, 6, W.thick, camber, map), wingMat, grp);
      mesh(surface(0, f0, hc, 1, 1, 6, W.thick, camber, map), wingMat, grp);
    } else mesh(surface(0, ail0, hc, 1, 4, 6, W.thick, camber, map), wingMat, grp);
    // wing struts (high-wing light aircraft)
    if (G.struts) {
      const p0 = new THREE.Vector3(side * G.radius * 0.9, -G.radius * 0.8, W.z + W.root * 0.4);
      const p1 = map(0.55, 0.35, -0.05);
      const len = p0.distanceTo(p1);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 6), wingMat);
      st.position.copy(p0).add(p1).multiplyScalar(0.5);
      st.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
      grp.add(st);
    }
    // missiles on rails for fighters
    if (spec.missiles > 0) {
      const per = spec.missiles / 2;
      for (let k = 0; k < per; k++) {
        const s = 0.35 + (k / Math.max(1, per - 1)) * 0.6;
        const p = map(Math.min(s, 0.97), 0.45, -0.6);
        const ms = new THREE.Group();
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.9, 10), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4, metalness: 0.3 }));
        tube.rotation.x = Math.PI / 2;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.35, 10), darkMetal);
        tip.rotation.x = -Math.PI / 2; tip.position.z = -1.6;
        const fins = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.3), darkMetal); fins.position.z = 1.2;
        const fins2 = fins.clone(); fins2.rotation.z = Math.PI / 2;
        ms.add(tube, tip, fins, fins2);
        ms.position.copy(p); ms.position.y -= 0.18;
        ms.name = 'missile';
        ms.userData.slot = k * 2 + (side > 0 ? 1 : 0);
        grp.add(ms);
      }
    }
  }

  // Tail
  const tail = new THREE.Group();
  body.add(tail);
  const H = G.hstab;
  for (const side of [-1, 1]) {
    const map = wingMap(H, side);
    const allMoving = G.style === 'jet' || G.style === 'stealth';
    if (allMoving) {
      const a = map(0, 0.35, 0), b = map(1, 0.35, 0);
      elevators.push(hinge(surface(0.12, 1, 0, 1, 6, 10, H.thick, 0, map), a, b, surfMat, side, 22 * DEG, tail));
    } else {
      mesh(surface(0, 1, 0, 0.65, 6, 10, H.thick, 0, map), wingMat, tail);
      elevators.push(hinge(surface(0.04, 0.98, 0.65, 1, 4, 6, H.thick, 0, map), map(0.04, 0.65, 0), map(0.98, 0.65, 0), surfMat, side, 25 * DEG, tail));
    }
  }
  const V = G.vstab;
  const fins = V.twin ? [-1, 1] : [0];
  for (const f of fins) {
    const cant = (V.cant ?? 0) * DEG * f;
    const yb = G.radius * (G.style === 'stealth' ? 0.5 : 0.75) + (G.tailUp * G.radius) * 0.9;
    const vmap = (s: number, c: number, t: number) => {
      const chord = V.root + (V.tip - V.root) * s;
      const h = s * V.h;
      const v = new THREE.Vector3(t * chord, yb + h, V.z + h * Math.tan(V.sweep * DEG) + c * chord);
      v.applyAxisAngle(new THREE.Vector3(0, 0, 1), -cant);
      v.x += f * (V.twin ?? 0);
      return v;
    };
    mesh(surface(0, 1, 0, 0.68, 6, 10, 0.08, 0, vmap), finMat, tail);
    rudders.push(hinge(surface(0.06, 0.96, 0.68, 1, 4, 6, 0.08, 0, vmap), vmap(0.06, 0.68, 0), vmap(0.96, 0.68, 0), surfMat, 1, 25 * DEG, tail));
  }

  // Canopy
  let canopy: THREE.Mesh | null = null;
  const C = G.canopy;
  const glass = new THREE.MeshPhysicalMaterial({ color: G.style === 'stealth' || G.style === 'jet' ? 0xc9a24a : 0x8fb3c9, metalness: 0.1, roughness: 0.02, transparent: true, opacity: 0.38, envMapIntensity: 2.2, clearcoat: 1 });
  if (C.bubble || G.style === 'prop') {
    const cg = new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    canopy = new THREE.Mesh(cg, glass);
    canopy.scale.set(C.r * 0.95, C.r * (C.bubble ? 1.05 : 0.8), C.len / 2);
    canopy.position.set(0, C.y, C.z);
    body.add(canopy);
    // pilot
    if (G.style !== 'airliner') {
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), new THREE.MeshStandardMaterial({ color: G.style === 'prop' ? 0x3b2f2a : 0xdedede, roughness: 0.5 }));
      helmet.position.set(G.style === 'prop' && G.highWing ? -0.3 : 0, C.y + 0.32, C.z + 0.15);
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.5, 10), new THREE.MeshStandardMaterial({ color: 0x4b5a3a, roughness: 0.8 }));
      torso.position.set(helmet.position.x, C.y, C.z + 0.25);
      body.add(helmet, torso);
    }
    // canopy frame
    const frame = new THREE.Mesh(new THREE.TorusGeometry(C.r * 0.95, 0.03, 6, 24, Math.PI), darkMetal);
    frame.position.set(0, C.y, C.z + C.len * 0.1);
    body.add(frame);
  }

  // Engines
  const props: AircraftVisual['props'] = [];
  const flames: THREE.Mesh[] = [];
  const nozzles: THREE.Vector3[] = [];
  const flameUniforms = { uThr: { value: 0 }, uAB: { value: 0 }, uTime: { value: 0 } };
  const flameMat = new THREE.ShaderMaterial({ uniforms: flameUniforms, vertexShader: flameVS, fragmentShader: flameFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const discTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    gr.addColorStop(0, 'rgba(30,30,30,0.0)'); gr.addColorStop(0.3, 'rgba(40,40,40,0.25)'); gr.addColorStop(0.92, 'rgba(60,60,60,0.3)'); gr.addColorStop(0.97, 'rgba(240,200,40,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const makeProp = (x: number, y: number, z: number, r: number, blades: number, parent: THREE.Object3D) => {
    const hub = new THREE.Group(); hub.position.set(x, y, z);
    const spin = new THREE.Mesh(new THREE.ConeGeometry(r * 0.22, r * 0.5, 16), chrome); spin.rotation.x = -Math.PI / 2; spin.position.z = -r * 0.15;
    hub.add(spin);
    const bl = new THREE.Group();
    for (let i = 0; i < blades; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(r * 0.13, r, 0.035).translate(0, r / 2, 0), darkMetal);
      b.rotation.z = (i / blades) * Math.PI * 2; b.rotation.y = 0.35;
      const tipM = new THREE.Mesh(new THREE.BoxGeometry(r * 0.13, r * 0.08, 0.04).translate(0, r * 0.96, 0), new THREE.MeshStandardMaterial({ color: 0xf2c200 }));
      tipM.rotation.copy(b.rotation);
      bl.add(b, tipM);
    }
    hub.add(bl);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 1.02, 32), new THREE.MeshBasicMaterial({ map: discTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    hub.add(disc);
    parent.add(hub);
    props.push({ hub, blades: bl, disc });
  };
  for (const e of G.engines) {
    if (e.kind === 'prop') makeProp(0, 0, e.z, e.r, e.blades, body);
    else if (e.kind === 'turboprop') {
      const side = e.x < 0 ? wingL : wingR;
      const nac = mesh(new THREE.CylinderGeometry(0.75, 0.55, 6.5, 16), paint, side);
      nac.rotation.x = Math.PI / 2; nac.position.set(e.x, e.y - 0.4, e.z + 2.6);
      makeProp(e.x, e.y - 0.3, e.z - 0.8, e.r, e.blades, side);
    } else if (e.kind === 'jet') {
      const parent = e.pod ? (e.x < 0 ? wingL : wingR) : body;
      if (e.pod) {
        const pts: THREE.Vector2[] = [];
        for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector2(e.r * (1 - 0.25 * Math.pow(t, 2)) * (i === 0 ? 0.92 : 1), -e.len / 2 + t * e.len)); }
        const nac = mesh(new THREE.LatheGeometry(pts, 28), paint, parent);
        nac.rotation.x = Math.PI / 2; nac.position.set(e.x, e.y, e.z);
        const fan = new THREE.Mesh(new THREE.CircleGeometry(e.r * 0.9, 28), new THREE.MeshStandardMaterial({ color: 0x18191b, metalness: 0.8, roughness: 0.4 }));
        fan.position.set(e.x, e.y, e.z - e.len / 2 + 0.25); fan.rotation.y = Math.PI; parent.add(fan);
        const sp = new THREE.Mesh(new THREE.ConeGeometry(e.r * 0.28, 0.6, 16), chrome); sp.rotation.x = -Math.PI / 2; sp.position.set(e.x, e.y, e.z - e.len / 2 + 0.05); parent.add(sp);
        const pylon = mesh(new THREE.BoxGeometry(0.3, 1.3, e.len * 0.8), paint, parent); pylon.position.set(e.x, e.y + e.r * 0.95, e.z + 0.6);
        const noz = mesh(new THREE.CylinderGeometry(e.r * 0.5, e.r * 0.65, 1.1, 20), darkMetal, parent); noz.rotation.x = Math.PI / 2; noz.position.set(e.x, e.y, e.z + e.len / 2 + 0.4);
        nozzles.push(new THREE.Vector3(e.x, e.y, e.z + e.len / 2 + 1));
      } else {
        const noz = mesh(new THREE.CylinderGeometry(e.r * 0.82, e.r, e.len, 20, 1, true), darkMetal, parent);
        noz.rotation.x = Math.PI / 2; noz.position.set(e.x, e.y, e.z);
        const inner = new THREE.Mesh(new THREE.CircleGeometry(e.r * 0.8, 20), new THREE.MeshBasicMaterial({ color: 0x0a0605 }));
        inner.position.set(e.x, e.y, e.z - e.len * 0.3); parent.add(inner);
        const glow = new THREE.Mesh(new THREE.CircleGeometry(e.r * 0.7, 20), new THREE.MeshBasicMaterial({ color: 0xff6a20, transparent: true, opacity: 0.0, toneMapped: false }));
        glow.position.set(e.x, e.y, e.z - e.len * 0.28); glow.name = 'nozzleGlow'; parent.add(glow);
        const fl = new THREE.Mesh(new THREE.CylinderGeometry(e.r * 0.25, e.r * 0.75, 9, 18, 8, true).translate(0, -4.5, 0), flameMat);
        fl.rotation.x = -Math.PI / 2; fl.position.set(e.x, e.y, e.z + e.len / 2);
        fl.frustumCulled = false;
        parent.add(fl);
        flames.push(fl);
        nozzles.push(new THREE.Vector3(e.x, e.y, e.z + e.len / 2 + 0.5));
        // intakes
        if (e.intake === 'chin') {
          const it = mesh(new THREE.BoxGeometry(G.radius * 1.2, G.radius * 0.7, 4), paint); it.position.set(0, -G.radius * 0.85, -1.2);
          const mouth = new THREE.Mesh(new THREE.PlaneGeometry(G.radius * 1.1, G.radius * 0.6), new THREE.MeshBasicMaterial({ color: 0x050505 })); mouth.position.set(0, -G.radius * 0.85, -3.21); mouth.rotation.y = Math.PI; body.add(mouth);
        } else if (e.intake === 'side') {
          const it = mesh(new THREE.BoxGeometry(0.9, 1.0, 6), paint); it.position.set(Math.sign(e.x) * G.radius * 1.35, -0.1, -1.0);
          it.rotation.z = Math.sign(e.x) * 0.25;
        }
      }
    }
  }

  // Airbrake (fighters) — spine panel
  if (spec.brakeCD > 0 && G.style !== 'airliner') {
    const g = new THREE.BoxGeometry(G.radius * 1.1, 0.05, 1.6);
    const a = new THREE.Vector3(-G.radius * 0.55, G.radius * G.heightScale * 0.95, 1.0), b = new THREE.Vector3(G.radius * 0.55, G.radius * G.heightScale * 0.95, 1.0);
    g.translate(0, 0, 0.8 + 1.0);
    g.translate(0, G.radius * G.heightScale * 0.95, 0);
    airbrakes.push(hinge(g, a, b, paint, 1, 55 * DEG, body));
  } else if (G.style === 'airliner') {
    // spoilers on the wing upper surface
    for (const side of [-1, 1]) {
      const map = wingMap(W, side);
      airbrakes.push(hinge(surface(0.25, 0.6, 0.55, hc, 3, 4, W.thick * 0.6, 0, map), map(0.25, 0.55, 0.05), map(0.6, 0.55, 0.05), surfMat, side, 45 * DEG, side < 0 ? wingL : wingR));
    }
  }

  // ---- detail parts ----
  const R0 = G.radius, zNose = -G.length * 0.52;
  // wing-root fairings blend the wing into the fuselage
  for (const side of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), paint);
    f.scale.set(R0 * 0.55, R0 * 0.32 * G.heightScale, W.root * 0.62);
    f.position.set(side * R0 * 0.72, W.y, W.z + W.root * 0.5);
    f.castShadow = true; body.add(f);
  }
  if (G.style === 'jet' || G.style === 'stealth') {
    // pitot boom
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 1.4, 8), chrome);
    pit.rotation.x = Math.PI / 2; pit.position.set(0, 0, zNose - 0.6); body.add(pit);
    // nozzle petals
    for (const e of G.engines) if (e.kind === 'jet' && !e.pod) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const pet = new THREE.Mesh(new THREE.BoxGeometry(e.r * 0.36, 0.03, 0.75), darkMetal);
        pet.position.set(e.x + Math.cos(a) * e.r * 0.86, e.y + Math.sin(a) * e.r * 0.86, e.z + e.len / 2 + 0.2);
        pet.rotation.z = a + Math.PI / 2; pet.rotation.x = Math.sin(a) * 0.1; body.add(pet);
      }
    }
    // centreline + wing fuel tanks and wingtip rails
    if (G.style === 'jet') {
      const tankMat = new THREE.MeshStandardMaterial({ color: (paint.color.getHex() & 0xfefefe) || 0x8d99a6, map: null, roughness: 0.45, metalness: 0.4 });
      tankMat.color.copy(new THREE.Color(lv.base));
      const tank = (x: number, y: number, z: number, r: number, l: number) => {
        const pts: THREE.Vector2[] = [];
        for (let i = 0; i <= 18; i++) { const t = i / 18; pts.push(new THREE.Vector2(r * Math.sin(Math.PI * Math.pow(t, 0.8)) ** 0.7, -l / 2 + t * l)); }
        const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), tankMat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); m.castShadow = true; body.add(m);
        const py = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, l * 0.4), darkMetal); py.position.set(x, y + r + 0.12, z); body.add(py);
      };
      tank(0, -R0 * G.heightScale - 0.55, 0.3, 0.38, 4.2);
      const half = W.span / 2;
      for (const sd of [-1, 1]) tank(sd * half * 0.42, W.y - 0.65, W.z + W.root * 0.45 + half * 0.42 * Math.tan((W.sweep * Math.PI) / 180) * 0.6, 0.42, 4.6);
    }
    // antennas
    const ant = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.35, 0.25), darkMetal); ant.position.set(0, R0 * G.heightScale + 0.15, 1.5); body.add(ant);
  }
  if (G.style === 'airliner') {
    // winglets
    const half = W.span / 2;
    const tip = new THREE.Vector3(half, W.y + half * Math.tan((W.dihedral * Math.PI) / 180), W.z + half * Math.tan((W.sweep * Math.PI) / 180));
    for (const sd of [-1, 1]) {
      const wl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 1.4), wingMat);
      wl.position.set(sd * (tip.x + 0.05), tip.y + 1.1, tip.z + 0.9); wl.rotation.z = -sd * 0.18; wl.rotation.x = -0.35;
      (sd < 0 ? wingL : wingR).add(wl);
    }
    // belly anti-collision light housing + APU exhaust
    const apu = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.4, 12), darkMetal); apu.rotation.x = Math.PI / 2; apu.position.set(0, G.tailUp * R0, -zNose + 0.1); body.add(apu);
  }
  if (G.style === 'prop') {
    // cowling exhaust stubs + whip antenna
    for (const sd of [-1, 1]) { const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.3, 8), darkMetal); ex.rotation.z = Math.PI / 2; ex.position.set(sd * R0 * 0.85, -R0 * 0.4, zNose + G.noseLen * 0.7); body.add(ex); }
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.015, 0.9, 5), darkMetal); wh.position.set(0, R0 * G.heightScale + 0.4, 0.6); wh.rotation.x = -0.25; body.add(wh);
  }

  // Landing gear
  const gear: GearVis[] = [];
  for (const gd of spec.gear) {
    const r = gd.wheelR;
    const top = gd.p[1] + r + gd.travel + Math.max(0.35, r * 1.6);
    const rootO = new THREE.Group();
    rootO.position.set(gd.p[0], top, gd.p[2]);
    const len = top - (gd.p[1] + r);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.22, len * 0.6, 8).translate(0, -len * 0.3, 0), chrome);
    rootO.add(strut);
    const piston = new THREE.Group();
    const pist = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.15, r * 0.15, len * 0.7, 8).translate(0, len * 0.35, 0), chrome);
    piston.add(pist);
    const wheel = new THREE.Group();
    const nW = spec.mass > 30000 && !gd.nose ? 2 : 1;
    for (let k = 0; k < nW; k++) {
      const tyreM = new THREE.Mesh(new THREE.TorusGeometry(r * 0.7, r * 0.3, 10, 20), tyre);
      tyreM.rotation.y = Math.PI / 2;
      tyreM.position.x = nW > 1 ? (k - 0.5) * r * 1.3 : 0;
      const hubM = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, r * 0.5, 12), darkMetal);
      hubM.rotation.z = Math.PI / 2; hubM.position.x = tyreM.position.x;
      tyreM.castShadow = true;
      wheel.add(tyreM, hubM);
    }
    piston.add(wheel);
    if (!spec.retract) {
      const pant = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), paint);
      pant.scale.set(r * 0.55, r * 1.05, r * 2.1); pant.position.y = 0.04; pant.castShadow = true;
      piston.add(pant);
    }
    piston.position.y = -len;
    rootO.add(piston);
    body.add(rootO);
    const foldAxis = gd.nose ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, -(Math.sign(gd.p[0]) || 1));
    gear.push({ def: gd, root: rootO, piston, wheel, foldAxis, foldAngle: gd.nose ? -Math.PI / 2 : Math.PI / 2 });
  }

  // Nav lights (points) + optional landing light
  const navG = new THREE.BufferGeometry();
  const tipL = wingMap(W, -1)(1, 0.5, 0), tipR = wingMap(W, 1)(1, 0.5, 0);
  const tailP = new THREE.Vector3(0, G.radius * 0.5, -G.length * 0.52 + G.length + 0.1);
  navG.setAttribute('position', new THREE.Float32BufferAttribute([tipL.x, tipL.y, tipL.z, tipR.x, tipR.y, tipR.z, tailP.x, tailP.y, tailP.z, tipL.x, tipL.y, tipL.z + 0.2, tipR.x, tipR.y, tipR.z + 0.2, 0, -G.radius, 0], 3));
  navG.setAttribute('color', new THREE.Float32BufferAttribute([1, 0.05, 0.05, 0.05, 1, 0.2, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  const nav = new THREE.Points(navG, new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, map: GLOW, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  nav.frustumCulled = false;
  body.add(nav);
  let landingLight: THREE.SpotLight | null = null;
  if (withLights) {
    landingLight = new THREE.SpotLight(0xfff4e0, 0, 900, 0.32, 0.5, 1.2);
    landingLight.position.set(0, -G.radius * 0.6, -G.length * 0.3);
    landingLight.target.position.set(0, -G.length * 0.6, -G.length * 3);
    body.add(landingLight, landingLight.target);
  }

  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = o.castShadow || false; });
  return {
    root, body, ailerons, flaps, elevators, rudders, airbrakes, props, flames, nozzles, gear, nav, landingLight,
    wingL, wingR, tail, tipL, tipR, paint, canopy, radius: Math.max(G.length, W.span) / 2, flameUniforms,
  };
}

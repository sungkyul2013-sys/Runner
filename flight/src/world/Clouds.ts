import * as THREE from 'three';
import { mulberry32, clamp } from '../core/math';

const SPAN = 30000;

function puffTexture(): THREE.Texture {
  const s = 128, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const img = g.createImageData(s, s);
  const rnd = mulberry32(7);
  const blobs = Array.from({ length: 14 }, () => [0.3 + rnd() * 0.4, 0.3 + rnd() * 0.4, 0.12 + rnd() * 0.2]);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const u = x / s, v = y / s;
    let d = 0;
    for (const [bx, by, br] of blobs) {
      const q = Math.hypot(u - bx, v - by) / br;
      d += Math.max(0, 1 - q * q);
    }
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const a = clamp(d * 0.55, 0, 1) * clamp(1 - r * r, 0, 1);
    const k = (y * s + x) * 4;
    img.data[k] = 255; img.data[k + 1] = 255; img.data[k + 2] = 255; img.data[k + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export class Clouds {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private clusters: { x: number; y: number; z: number; r: number; seed: number }[] = [];
  cover = 0.3;

  constructor(clusterCount: number) {
    const rnd = mulberry32(1234);
    const offs: number[] = [], data: number[] = [];
    for (let c = 0; c < clusterCount; c++) {
      const cx = (rnd() - 0.5) * SPAN, cz = (rnd() - 0.5) * SPAN;
      const strat = rnd() < 0.18; // some flat stratus sheets
      const cy = strat ? 2600 + rnd() * 600 : 1250 + rnd() * 500;
      const seed = rnd();
      const R = strat ? 900 + rnd() * 700 : 280 + rnd() * 420;
      this.clusters.push({ x: cx, y: cy + R * 0.3, z: cz, r: R, seed });
      const puffs = strat ? 10 : 9 + Math.floor(rnd() * 9);
      for (let p = 0; p < puffs; p++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * R;
        const up = strat ? rnd() * 60 : Math.pow(rnd(), 1.4) * R * 0.75 * (1 - rr / R * 0.6);
        offs.push(cx + Math.cos(a) * rr, cy + up, cz + Math.sin(a) * rr * (strat ? 1 : 0.8));
        const size = strat ? 650 + rnd() * 500 : (R * 0.55 + rnd() * R * 0.5) * (1 - up / (R * 1.6));
        data.push(size, strat ? 0.7 : clamp(up / (R * 0.75), 0, 1), seed, rnd() * Math.PI * 2);
      }
    }
    const count = offs.length / 3;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(offs), 3));
    g.setAttribute('aData', new THREE.InstancedBufferAttribute(new Float32Array(data), 4));
    g.instanceCount = count;

    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTex: { value: puffTexture() },
        uCam: { value: new THREE.Vector3() },
        uSun: { value: new THREE.Vector3(0, 1, 0) },
        uSunCol: { value: new THREE.Color(1, 1, 1) },
        uAmb: { value: new THREE.Color(0.6, 0.65, 0.75) },
        uFogCol: { value: new THREE.Color() },
        uFogD: { value: 0.00003 },
        uCover: { value: 0.3 },
        uDark: { value: 0 },
        uSpan: { value: SPAN },
        uFlash: { value: 0 },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute vec3 aOff; attribute vec4 aData;
        uniform vec3 uCam; uniform float uSpan; uniform float uCover;
        varying vec2 vUv; varying float vShade; varying float vDist; varying vec3 vDir; varying float vNear;
        void main(){
          vUv = uv; vShade = aData.y;
          vec3 c = aOff;
          c.xz = mod(c.xz - uCam.xz + uSpan*0.5, uSpan) - uSpan*0.5 + uCam.xz;
          float on = step(aData.z, uCover);
          float sz = aData.x * on * (0.7 + uCover*0.45);
          vec4 mv = viewMatrix * vec4(c,1.0);
          float r = aData.w;
          vec2 p = vec2(position.x*cos(r)-position.y*sin(r), position.x*sin(r)+position.y*cos(r));
          mv.xy += p * sz;
          vDist = -mv.z;
          vDir = normalize(c - uCam);
          vNear = smoothstep(sz*0.25, sz*0.9, length(c-uCam));
          float edge = length(vec2(c.x,c.z)-vec2(uCam.x,uCam.z));
          vNear *= 1.0 - smoothstep(uSpan*0.38, uSpan*0.5, edge);
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        uniform sampler2D uTex; uniform vec3 uSun, uSunCol, uAmb, uFogCol; uniform float uFogD, uDark, uFlash;
        varying vec2 vUv; varying float vShade; varying float vDist; varying vec3 vDir; varying float vNear;
        void main(){
          #include <logdepthbuf_fragment>
          vec4 t = texture2D(uTex, vUv);
          float a = t.a * vNear;
          if(a < 0.01) discard;
          float lit = mix(0.45, 1.0, vShade) * mix(1.0, 0.55, uDark);
          float fwd = pow(max(dot(vDir, uSun), 0.0), 6.0);
          vec3 col = uAmb * mix(0.55, 0.9, vShade) + uSunCol * lit * max(uSun.y+0.15, 0.0) * 0.95;
          col += uSunCol * fwd * (1.0 - t.a) * 1.6;
          col = mix(col, col*0.55, uDark);
          col += vec3(0.8,0.85,1.0) * uFlash * 1.5;
          float f = 1.0 - exp(-uFogD*uFogD*vDist*vDist*0.6);
          col = mix(col, uFogCol, f);
          gl_FragColor = vec4(col, a * (0.82 + uDark*0.15));
        }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  update(cam: THREE.Vector3, sunDir: THREE.Vector3, sunCol: THREE.Color, horizon: THREE.Color, fog: THREE.FogExp2, cover: number, overcast: number, night: number, flash: number) {
    const u = this.mat.uniforms;
    this.cover = cover;
    u.uCam.value.copy(cam);
    u.uSun.value.copy(sunDir);
    u.uSunCol.value.copy(sunCol).multiplyScalar(1 - night * 0.97);
    u.uAmb.value.copy(horizon).multiplyScalar(1.1).lerp(new THREE.Color(0.7, 0.75, 0.82), 0.4 * (1 - night));
    u.uFogCol.value.copy(fog.color);
    u.uFogD.value = fog.density;
    u.uCover.value = cover;
    u.uDark.value = overcast;
    u.uFlash.value = flash;
  }

  /** 0..1 — how deep inside a cloud the point is (used for whiteout + turbulence). */
  densityAt(p: THREE.Vector3): number {
    let best = 0;
    for (const c of this.clusters) {
      if (c.seed > this.cover) continue;
      let dx = ((p.x - c.x + SPAN * 0.5) % SPAN + SPAN) % SPAN - SPAN * 0.5;
      let dz = ((p.z - c.z + SPAN * 0.5) % SPAN + SPAN) % SPAN - SPAN * 0.5;
      const dy = (p.y - c.y) * 1.8;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / (c.r * 0.9);
      if (d < 1) best = Math.max(best, 1 - d);
    }
    return best;
  }
}

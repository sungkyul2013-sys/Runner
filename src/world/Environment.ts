import * as THREE from 'three';
import { BIOMES, LANE_COUNT, LANE_WIDTH } from '../config/constants';

/** Half-width of the runnable road (matches Track). */
const ROAD_HALF = (LANE_COUNT * LANE_WIDTH + 1.4) / 2;

const N_PER_LINE = 14;
const SPACING = 16;
const TOTAL_Z = N_PER_LINE * SPACING;
const WRAP_BEHIND = 28;

interface Prop {
  group: THREE.Group;
  z: number;
  side: number;
  kind: 'palm' | 'building';
}

/**
 * The sunset world that frames the track: a big gradient **sky dome** (top→mid→
 * bottom colours per biome), a glowing **sun** with halo, scattered **stars**,
 * distant **mountain** silhouettes, and side **scenery** (alternating palm trees
 * and lit-window buildings) that scroll toward the camera and recycle. The sky
 * shader colours are lerped on biome changes via {@link applyBiome}, giving the
 * signature sunset→twilight→night→… transitions.
 */
export class Environment {
  readonly group = new THREE.Group();

  private readonly skyMat: THREE.ShaderMaterial;
  private readonly sun: THREE.Mesh;
  private readonly sunMat: THREE.MeshBasicMaterial;
  private readonly sunHalo: THREE.Mesh;
  private readonly haloMat: THREE.MeshBasicMaterial;
  private readonly mountainMat: THREE.MeshBasicMaterial;

  private readonly props: Prop[] = [];
  private readonly disposables: { dispose(): void }[] = [];

  // Working colours for smooth biome lerping.
  private readonly cTop = new THREE.Color(BIOMES[0].top);
  private readonly cMid = new THREE.Color(BIOMES[0].mid);
  private readonly cBottom = new THREE.Color(BIOMES[0].bottom);
  private readonly cSun = new THREE.Color(BIOMES[0].sun);

  constructor() {
    // ── Sky dome ──
    const skyGeo = new THREE.SphereGeometry(320, 32, 20);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: this.cTop },
        mid: { value: this.cMid },
        bottom: { value: this.cBottom },
      },
      vertexShader: `varying float vY;
        void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vY; uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
        void main(){
          float t = clamp(vY,-1.0,1.0);
          vec3 col = t > 0.0 ? mix(mid, top, t) : mix(mid, bottom, -t);
          gl_FragColor = vec4(col,1.0);
        }`,
    });
    this.disposables.push(skyGeo, this.skyMat);
    this.group.add(new THREE.Mesh(skyGeo, this.skyMat));

    // ── Sun + halo ──
    const sunGeo = new THREE.CircleGeometry(22, 48);
    this.sunMat = new THREE.MeshBasicMaterial({ color: this.cSun, fog: false, transparent: true });
    this.sun = new THREE.Mesh(sunGeo, this.sunMat);
    this.sun.position.set(-22, 16, -150);
    const haloGeo = new THREE.CircleGeometry(40, 48);
    this.haloMat = new THREE.MeshBasicMaterial({
      color: this.cSun, fog: false, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending,
    });
    this.sunHalo = new THREE.Mesh(haloGeo, this.haloMat);
    this.sunHalo.position.copy(this.sun.position).add(new THREE.Vector3(0, 0, -2));
    this.disposables.push(sunGeo, this.sunMat, haloGeo, this.haloMat);
    this.group.add(this.sunHalo, this.sun);

    // ── Stars ──
    this.addStars();

    // ── Mountains ──
    this.mountainMat = new THREE.MeshBasicMaterial({ color: 0x3a2155, fog: true });
    this.disposables.push(this.mountainMat);
    this.addMountains();

    // ── Side scenery ──
    this.buildScenery();
  }

  private addStars(): void {
    const N = 320;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 200 + Math.random() * 90;
      const y = 30 + Math.random() * 160;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = -Math.abs(Math.sin(a) * r) - 60;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xfff4d6, size: 1.4, fog: false, transparent: true, opacity: 0.9 });
    this.disposables.push(geo, mat);
    this.group.add(new THREE.Points(geo, mat));
  }

  private addMountains(): void {
    const geo = new THREE.ConeGeometry(34, 30, 4);
    this.disposables.push(geo);
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(geo, this.mountainMat);
      m.position.set(-120 + i * 30 + Math.random() * 10, 6, -170 - Math.random() * 30);
      m.rotation.y = Math.random();
      m.scale.setScalar(0.7 + Math.random() * 0.8);
      this.group.add(m);
    }
  }

  // ── Side palms / buildings (instanced-free; few groups, pooled by recycle) ──
  private buildScenery(): void {
    for (const side of [-1, 1]) {
      for (let i = 0; i < N_PER_LINE; i++) {
        const kind: Prop['kind'] = (i + (side < 0 ? 0 : 1)) % 2 === 0 ? 'palm' : 'building';
        const g = kind === 'palm' ? this.makePalm() : this.makeBuilding();
        const z = WRAP_BEHIND - i * SPACING;
        g.position.set(side * (ROAD_HALF + 3 + Math.random() * 4), 0, z);
        this.group.add(g);
        this.props.push({ group: g, z, side, kind });
      }
    }
  }

  private makePalm(): THREE.Group {
    const g = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 4.5, 6);
    const trunkMat = new THREE.MeshBasicMaterial({ color: 0x4a2d3a });
    this.disposables.push(trunkGeo, trunkMat);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.25;
    g.add(trunk);
    const leafGeo = new THREE.ConeGeometry(1.1, 1.6, 5);
    const leafMat = new THREE.MeshBasicMaterial({ color: 0x53324f });
    this.disposables.push(leafGeo, leafMat);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 0.7, 4.4, Math.sin(a) * 0.7);
      leaf.rotation.z = Math.cos(a) * 0.9;
      leaf.rotation.x = Math.sin(a) * 0.9;
      g.add(leaf);
    }
    g.scale.setScalar(0.8 + Math.random() * 0.6);
    return g;
  }

  private makeBuilding(): THREE.Group {
    const g = new THREE.Group();
    const h = 6 + Math.random() * 16;
    const w = 2.5 + Math.random() * 2.5;
    const bodyGeo = new THREE.BoxGeometry(w, h, w);
    const tint = [0x3a2155, 0x4a2550, 0x5a2a54, 0x6e2e54][(Math.random() * 4) | 0];
    const bodyMat = new THREE.MeshBasicMaterial({ color: tint });
    this.disposables.push(bodyGeo, bodyMat);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = h / 2;
    g.add(body);
    // Lit windows: a thin emissive strip plane on the road-facing side.
    const winGeo = new THREE.PlaneGeometry(w * 0.7, h * 0.8);
    const winMat = new THREE.MeshBasicMaterial({
      color: 0xffd36b, transparent: true, opacity: 0.55, map: this.windowTex(),
    });
    this.disposables.push(winGeo, winMat);
    const win = new THREE.Mesh(winGeo, winMat);
    win.position.set(0, h / 2, w / 2 + 0.02);
    g.add(win);
    return g;
  }

  private sharedWindowTex?: THREE.CanvasTexture;
  private windowTex(): THREE.CanvasTexture {
    if (this.sharedWindowTex) return this.sharedWindowTex;
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, 32, 64);
    for (let y = 2; y < 62; y += 6) {
      for (let x = 2; x < 30; x += 6) {
        ctx.fillStyle = Math.random() > 0.45 ? 'rgba(255,230,150,0.9)' : 'rgba(40,20,40,0.2)';
        ctx.fillRect(x, y, 4, 4);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.sharedWindowTex = tex;
    this.disposables.push(tex);
    return tex;
  }

  /** Scroll scenery; recycle props that pass behind the camera. */
  update(scroll: number): void {
    for (const p of this.props) {
      p.z += scroll;
      if (p.z > WRAP_BEHIND) p.z -= TOTAL_Z;
      p.group.position.z = p.z;
    }
    // Slowly rotate the halo for a subtle shimmer.
    this.sunHalo.rotation.z += 0.0008 * scroll;
  }

  /** Smoothly lerp the sky/sun/fog colours toward a biome (call each frame). */
  applyBiome(index: number, fog: THREE.Color, dt: number): void {
    const b = BIOMES[index % BIOMES.length];
    const t = 1 - Math.exp(-1.2 * dt);
    this.cTop.lerp(new THREE.Color(b.top), t);
    this.cMid.lerp(new THREE.Color(b.mid), t);
    this.cBottom.lerp(new THREE.Color(b.bottom), t);
    this.cSun.lerp(new THREE.Color(b.sun), t);
    this.sunMat.color.copy(this.cSun);
    this.haloMat.color.copy(this.cSun);
    fog.lerp(new THREE.Color(b.fog), t);
  }

  /** Snap instantly to a biome (used on reset). */
  setBiome(index: number, fog: THREE.Color): void {
    const b = BIOMES[index % BIOMES.length];
    this.cTop.setHex(b.top);
    this.cMid.setHex(b.mid);
    this.cBottom.setHex(b.bottom);
    this.cSun.setHex(b.sun);
    this.sunMat.color.copy(this.cSun);
    this.haloMat.color.copy(this.cSun);
    fog.setHex(b.fog);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}

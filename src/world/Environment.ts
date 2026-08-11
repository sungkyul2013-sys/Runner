import * as THREE from 'three';
import { DISTRICTS, LANE_COUNT, LANE_WIDTH } from '../config/constants';

/** Half-width of the running ground (matches Track). */
const YARD_HALF = (LANE_COUNT * LANE_WIDTH + 2.2) / 2;

/** Trackside furniture: masts, gantries, lamps, huts. */
const NEAR_COUNT = 11;
const NEAR_SPACING = 26;
const NEAR_SPAN = NEAR_COUNT * NEAR_SPACING;

/** Distant skyline blocks. */
const CITY_COUNT = 16;
const CITY_SPACING = 34;
const CITY_SPAN = CITY_COUNT * CITY_SPACING;

const WRAP_BEHIND = 40;

interface Prop {
  group: THREE.Group;
  z: number;
  /** Per-prop parallax factor (distant blocks drift slower). */
  parallax: number;
  /** Meshes whose colour follows the district palette. */
  tinted?: THREE.MeshBasicMaterial[];
}

/**
 * Everything around the running ground: a gradient sky dome, sun/moon with a
 * halo, a star field that fades in for night districts, drifting cloud banks, a
 * parallax city skyline, and the trackside furniture that sells the yard —
 * catenary masts strung with wire, signal gantries spanning the rails, arc
 * lamps, relay huts, graffitied boundary walls and water towers. Everything
 * recycles as it passes the camera, and {@link applyDistrict} lerps the whole
 * palette when the world tour moves on.
 */
export class Environment {
  readonly group = new THREE.Group();

  private readonly skyMat: THREE.ShaderMaterial;
  private readonly sunMat: THREE.MeshBasicMaterial;
  private readonly haloMat: THREE.MeshBasicMaterial;
  private readonly starMat: THREE.PointsMaterial;
  private readonly cloudMat: THREE.MeshBasicMaterial;

  private readonly nearProps: Prop[] = [];
  private readonly cityProps: Prop[] = [];
  private readonly clouds: THREE.Mesh[] = [];
  private readonly disposables: { dispose(): void }[] = [];

  private readonly cTop = new THREE.Color(DISTRICTS[0].top);
  private readonly cMid = new THREE.Color(DISTRICTS[0].mid);
  private readonly cBottom = new THREE.Color(DISTRICTS[0].bottom);
  private readonly cSun = new THREE.Color(DISTRICTS[0].sun);
  private nightMix = 0;

  constructor() {
    this.skyMat = this.buildSky();
    const { sunMat, haloMat } = this.buildSun();
    this.sunMat = sunMat;
    this.haloMat = haloMat;
    this.starMat = this.buildStars();
    this.cloudMat = this.buildClouds();
    this.buildCity();
    this.buildTrackside();
  }

  // ── Sky ──────────────────────────────────────────────────────────────────
  private buildSky(): THREE.ShaderMaterial {
    const geo = new THREE.SphereGeometry(360, 32, 22);
    const mat = new THREE.ShaderMaterial({
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
          // Tighten the horizon band so the gradient reads like real sky.
          float k = t > 0.0 ? pow(t, 0.72) : -pow(-t, 0.6);
          vec3 col = k > 0.0 ? mix(mid, top, k) : mix(mid, bottom, -k);
          gl_FragColor = vec4(col,1.0);
        }`,
    });
    this.disposables.push(geo, mat);
    this.group.add(new THREE.Mesh(geo, mat));
    return mat;
  }

  private buildSun(): { sunMat: THREE.MeshBasicMaterial; haloMat: THREE.MeshBasicMaterial } {
    const sunGeo = new THREE.CircleGeometry(17, 40);
    const sunMat = new THREE.MeshBasicMaterial({ color: this.cSun, fog: false, transparent: true });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.position.set(-52, 42, -235);
    const haloGeo = new THREE.CircleGeometry(46, 40);
    const haloMat = new THREE.MeshBasicMaterial({
      color: this.cSun, fog: false, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.copy(sun.position).setZ(sun.position.z - 2);
    this.disposables.push(sunGeo, sunMat, haloGeo, haloMat);
    this.group.add(halo, sun);
    return { sunMat, haloMat };
  }

  private buildStars(): THREE.PointsMaterial {
    const N = 420;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 240 + Math.random() * 90;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 40 + Math.random() * 200;
      pos[i * 3 + 2] = -Math.abs(Math.sin(a) * r) - 80;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 1.5, fog: false, transparent: true, opacity: 0,
    });
    this.disposables.push(geo, mat);
    this.group.add(new THREE.Points(geo, mat));
    return mat;
  }

  private buildClouds(): THREE.MeshBasicMaterial {
    const geo = new THREE.SphereGeometry(1, 10, 7);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.26, fog: false, depthWrite: false,
    });
    this.disposables.push(geo, mat);
    for (let i = 0; i < 9; i++) {
      const puff = new THREE.Mesh(geo, mat);
      puff.position.set(-160 + i * 42 + Math.random() * 20, 46 + Math.random() * 34, -190 - Math.random() * 70);
      puff.scale.set(14 + Math.random() * 12, 3 + Math.random() * 2, 5);
      this.clouds.push(puff);
      this.group.add(puff);
    }
    return mat;
  }

  // ── Parallax skyline ─────────────────────────────────────────────────────
  private windowTexCache?: THREE.CanvasTexture;
  private windowTex(): THREE.CanvasTexture {
    if (this.windowTexCache) return this.windowTexCache;
    const c = document.createElement('canvas');
    c.width = 48;
    c.height = 96;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, 48, 96);
    for (let y = 3; y < 92; y += 8) {
      for (let x = 3; x < 44; x += 8) {
        ctx.fillStyle = Math.random() > 0.42 ? 'rgba(255,232,168,0.95)' : 'rgba(30,32,48,0.45)';
        ctx.fillRect(x, y, 5, 5);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.windowTexCache = tex;
    this.disposables.push(tex);
    return tex;
  }

  private buildCity(): void {
    for (const side of [-1, 1]) {
      for (let i = 0; i < CITY_COUNT; i++) {
        const g = new THREE.Group();
        const tinted: THREE.MeshBasicMaterial[] = [];
        // Two or three stacked blocks make a more interesting silhouette.
        const blocks = 1 + ((Math.random() * 2.4) | 0);
        let base = 0;
        for (let b = 0; b < blocks; b++) {
          const h = (b === 0 ? 14 : 8) + Math.random() * (b === 0 ? 30 : 14);
          const w = (b === 0 ? 9 : 6) + Math.random() * 6;
          const bodyGeo = new THREE.BoxGeometry(w, h, w);
          const bodyMat = new THREE.MeshBasicMaterial({ color: 0x6e849f, fog: true });
          this.disposables.push(bodyGeo, bodyMat);
          tinted.push(bodyMat);
          const body = new THREE.Mesh(bodyGeo, bodyMat);
          body.position.y = base + h / 2;
          g.add(body);
          // Window grid facing the yard.
          const winGeo = new THREE.PlaneGeometry(w * 0.78, h * 0.82);
          const winMat = new THREE.MeshBasicMaterial({
            map: this.windowTex(), transparent: true, opacity: 0.5, fog: true,
          });
          this.disposables.push(winGeo, winMat);
          const win = new THREE.Mesh(winGeo, winMat);
          win.position.set(0, base + h / 2, w / 2 + 0.05);
          win.rotation.y = side < 0 ? 0 : Math.PI;
          win.position.z = (side < 0 ? 1 : -1) * (w / 2 + 0.05);
          g.add(win);
          base += h * 0.72;
        }
        // Rooftop mast for taller blocks.
        if (Math.random() > 0.55) {
          const mastGeo = new THREE.BoxGeometry(0.5, 8, 0.5);
          const mastMat = new THREE.MeshBasicMaterial({ color: 0x2a2f3a, fog: true });
          this.disposables.push(mastGeo, mastMat);
          const mast = new THREE.Mesh(mastGeo, mastMat);
          mast.position.y = base + 4;
          g.add(mast);
        }
        const z = WRAP_BEHIND - i * CITY_SPACING;
        g.position.set(side * (32 + Math.random() * 26), 0, z);
        g.rotation.y = Math.random() * 0.4 - 0.2;
        this.group.add(g);
        this.cityProps.push({ group: g, z, parallax: 0.42, tinted });
      }
    }
  }

  // ── Trackside furniture ──────────────────────────────────────────────────
  private buildTrackside(): void {
    const makers = [
      () => this.makeCatenary(),
      () => this.makeGantry(),
      () => this.makeLamp(),
      () => this.makeHut(),
      () => this.makeWall(),
      () => this.makeWaterTower(),
    ];
    for (let i = 0; i < NEAR_COUNT; i++) {
      const g = makers[i % makers.length]();
      const z = WRAP_BEHIND - i * NEAR_SPACING;
      g.position.z = z;
      this.group.add(g);
      this.nearProps.push({ group: g, z, parallax: 1 });
    }
  }

  private steel(color = 0x596069): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.55 });
    this.disposables.push(m);
    return m;
  }

  /** Catenary mast pair with the contact wire strung between them. */
  private makeCatenary(): THREE.Group {
    const g = new THREE.Group();
    const mat = this.steel(0x4e555e);
    const mastGeo = new THREE.BoxGeometry(0.34, 8.4, 0.34);
    const armGeo = new THREE.BoxGeometry(YARD_HALF * 2 + 3.4, 0.2, 0.24);
    const wireGeo = new THREE.BoxGeometry(YARD_HALF * 2 + 2, 0.05, 0.05);
    this.disposables.push(mastGeo, armGeo, wireGeo);
    for (const side of [-1, 1]) {
      const mast = new THREE.Mesh(mastGeo, mat);
      mast.position.set(side * (YARD_HALF + 1.7), 4.2, 0);
      g.add(mast);
      const stay = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 0.16), mat);
      stay.position.set(side * (YARD_HALF + 1.7) - side * 0.7, 6.4, 0);
      stay.rotation.z = side * 0.5;
      g.add(stay);
    }
    const arm = new THREE.Mesh(armGeo, mat);
    arm.position.y = 8.1;
    g.add(arm);
    const wire = new THREE.Mesh(wireGeo, mat);
    wire.position.y = 7.3;
    g.add(wire);
    // Insulator droppers.
    const dropGeo = new THREE.BoxGeometry(0.07, 0.8, 0.07);
    this.disposables.push(dropGeo);
    for (const x of [-4.5, -1.5, 1.5, 4.5]) {
      const d = new THREE.Mesh(dropGeo, mat);
      d.position.set(x, 7.7, 0);
      g.add(d);
    }
    return g;
  }

  /** Signal gantry spanning the rails with per-lane heads. */
  private makeGantry(): THREE.Group {
    const g = new THREE.Group();
    const mat = this.steel(0x50565e);
    const legGeo = new THREE.BoxGeometry(0.4, 6.4, 0.4);
    const beamGeo = new THREE.BoxGeometry(YARD_HALF * 2 + 3, 0.4, 0.5);
    const walkGeo = new THREE.BoxGeometry(YARD_HALF * 2 + 3, 0.08, 1.0);
    this.disposables.push(legGeo, beamGeo, walkGeo);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, mat);
      leg.position.set(side * (YARD_HALF + 1.4), 3.2, 0);
      g.add(leg);
    }
    const beam = new THREE.Mesh(beamGeo, mat);
    beam.position.y = 6.4;
    g.add(beam);
    const walk = new THREE.Mesh(walkGeo, mat);
    walk.position.set(0, 6.7, 0.55);
    g.add(walk);
    const headGeo = new THREE.BoxGeometry(0.6, 1.5, 0.4);
    const headMat = this.steel(0x24282e);
    const lampGeo = new THREE.CircleGeometry(0.15, 10);
    this.disposables.push(headGeo, lampGeo);
    for (const lane of [-1, 0, 1]) {
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.set(lane * LANE_WIDTH, 5.4, 0.24);
      g.add(head);
      const cols = [0xff3b30, 0xffd23f, 0x3ad17a];
      const on = (Math.random() * 3) | 0;
      cols.forEach((c, i) => {
        const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: i === on ? 1 : 0.25 });
        this.disposables.push(m);
        const lamp = new THREE.Mesh(lampGeo, m);
        lamp.position.set(lane * LANE_WIDTH, 5.85 - i * 0.42, 0.45);
        g.add(lamp);
      });
    }
    return g;
  }

  /** Arc lamp on a curved column. */
  private makeLamp(): THREE.Group {
    const g = new THREE.Group();
    const mat = this.steel(0x3f454d);
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.18, 7.4, 8);
    const armGeo = new THREE.BoxGeometry(1.8, 0.14, 0.14);
    const headGeo = new THREE.BoxGeometry(1.0, 0.24, 0.6);
    const glowGeo = new THREE.PlaneGeometry(1.0, 0.6);
    this.disposables.push(poleGeo, armGeo, headGeo, glowGeo);
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(poleGeo, mat);
      pole.position.set(side * (YARD_HALF + 2.4), 3.7, 0);
      g.add(pole);
      const arm = new THREE.Mesh(armGeo, mat);
      arm.position.set(side * (YARD_HALF + 1.6), 7.3, 0);
      g.add(arm);
      const head = new THREE.Mesh(headGeo, mat);
      head.position.set(side * (YARD_HALF + 0.9), 7.15, 0);
      g.add(head);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xfff0c0, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      this.disposables.push(glowMat);
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(side * (YARD_HALF + 0.9), 6.98, 0);
      g.add(glow);
    }
    return g;
  }

  /** Brick relay hut with a corrugated roof. */
  private makeHut(): THREE.Group {
    const g = new THREE.Group();
    const side = Math.random() > 0.5 ? 1 : -1;
    const bodyGeo = new THREE.BoxGeometry(4.4, 3.2, 5);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x9c6a52, roughness: 0.95 });
    const roofGeo = new THREE.BoxGeometry(4.9, 0.3, 5.5);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x59606a, roughness: 0.7, metalness: 0.4 });
    const doorGeo = new THREE.BoxGeometry(1.1, 2.1, 0.12);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2f5c8a, roughness: 0.7 });
    this.disposables.push(bodyGeo, bodyMat, roofGeo, roofMat, doorGeo, doorMat);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(side * (YARD_HALF + 4.4), 1.6, 0);
    g.add(body);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(side * (YARD_HALF + 4.4), 3.35, 0);
    g.add(roof);
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(side * (YARD_HALF + 2.18), 1.05, 0);
    door.rotation.y = Math.PI / 2;
    g.add(door);
    return g;
  }

  /** Graffitied boundary wall panel. */
  private makeWall(): THREE.Group {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(0.4, 3.4, 22);
    this.disposables.push(geo);
    for (const side of [-1, 1]) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x8d857c, roughness: 0.96 });
      this.disposables.push(mat);
      const wall = new THREE.Mesh(geo, mat);
      wall.position.set(side * (YARD_HALF + 3.2), 1.7, 0);
      g.add(wall);
      // A splash of colour so the wall reads as tagged, not blank.
      const tagGeo = new THREE.PlaneGeometry(4.5, 1.1);
      const tagMat = new THREE.MeshBasicMaterial({
        color: [0xff4fd8, 0x3ad1ff, 0xffd23f, 0x6bff9a][(Math.random() * 4) | 0],
        transparent: true, opacity: 0.42,
      });
      this.disposables.push(tagGeo, tagMat);
      const tag = new THREE.Mesh(tagGeo, tagMat);
      tag.position.set(side * (YARD_HALF + 2.99), 1.7, (Math.random() - 0.5) * 12);
      tag.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(tag);
    }
    return g;
  }

  /** Yard water tower on a lattice frame. */
  private makeWaterTower(): THREE.Group {
    const g = new THREE.Group();
    const side = Math.random() > 0.5 ? 1 : -1;
    const mat = this.steel(0x6a5a52);
    const tankGeo = new THREE.CylinderGeometry(2.4, 2.4, 3.4, 12);
    const coneGeo = new THREE.ConeGeometry(2.6, 1.4, 12);
    const legGeo = new THREE.BoxGeometry(0.24, 8, 0.24);
    this.disposables.push(tankGeo, coneGeo, legGeo);
    const x = side * (YARD_HALF + 8);
    const tank = new THREE.Mesh(tankGeo, mat);
    tank.position.set(x, 9.6, 0);
    g.add(tank);
    const cone = new THREE.Mesh(coneGeo, mat);
    cone.position.set(x, 12, 0);
    g.add(cone);
    for (const dx of [-1.5, 1.5]) {
      for (const dz of [-1.5, 1.5]) {
        const leg = new THREE.Mesh(legGeo, mat);
        leg.position.set(x + dx, 4, dz);
        leg.rotation.z = -dx * 0.03;
        g.add(leg);
      }
    }
    return g;
  }

  // ── Per-frame ────────────────────────────────────────────────────────────
  update(scroll: number): void {
    for (const p of this.nearProps) {
      p.z += scroll * p.parallax;
      if (p.z > WRAP_BEHIND) p.z -= NEAR_SPAN;
      p.group.position.z = p.z;
    }
    for (const p of this.cityProps) {
      p.z += scroll * p.parallax;
      if (p.z > WRAP_BEHIND) p.z -= CITY_SPAN;
      p.group.position.z = p.z;
    }
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.position.x += (0.1 + i * 0.02) * scroll * 0.08;
      if (c.position.x > 200) c.position.x = -200;
    }
  }

  /** Smoothly lerp sky / sun / fog / skyline toward a district. */
  applyDistrict(index: number, fog: THREE.Color, dt: number): void {
    const d = DISTRICTS[index % DISTRICTS.length];
    const t = 1 - Math.exp(-1.3 * dt);
    this.cTop.lerp(new THREE.Color(d.top), t);
    this.cMid.lerp(new THREE.Color(d.mid), t);
    this.cBottom.lerp(new THREE.Color(d.bottom), t);
    this.cSun.lerp(new THREE.Color(d.sun), t);
    this.sunMat.color.copy(this.cSun);
    this.haloMat.color.copy(this.cSun);
    fog.lerp(new THREE.Color(d.fog), t);
    this.nightMix += ((d.night ? 1 : 0) - this.nightMix) * t;
    this.starMat.opacity = this.nightMix * 0.95;
    this.cloudMat.opacity = 0.28 * (1 - this.nightMix * 0.7);
    this.tintCity(d.build, t);
  }

  /** Snap instantly to a district (used on reset). */
  setDistrict(index: number, fog: THREE.Color): void {
    const d = DISTRICTS[index % DISTRICTS.length];
    this.cTop.setHex(d.top);
    this.cMid.setHex(d.mid);
    this.cBottom.setHex(d.bottom);
    this.cSun.setHex(d.sun);
    this.sunMat.color.copy(this.cSun);
    this.haloMat.color.copy(this.cSun);
    fog.setHex(d.fog);
    this.nightMix = d.night ? 1 : 0;
    this.starMat.opacity = this.nightMix * 0.95;
    this.cloudMat.opacity = 0.28 * (1 - this.nightMix * 0.7);
    this.tintCity(d.build, 1);
  }

  private tintCity(palette: number[], t: number): void {
    for (let i = 0; i < this.cityProps.length; i++) {
      const p = this.cityProps[i];
      if (!p.tinted) continue;
      for (let j = 0; j < p.tinted.length; j++) {
        p.tinted[j].color.lerp(new THREE.Color(palette[(i + j) % palette.length]), t);
      }
    }
  }

  /** The sky shader material, so callers can share its uniforms if needed. */
  get sky(): THREE.ShaderMaterial {
    return this.skyMat;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}

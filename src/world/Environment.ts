import * as THREE from 'three';
import { LANE_COUNT, LANE_WIDTH } from '../config/constants';

/** Half-width of the runnable road (matches Track). */
const ROAD_HALF = (LANE_COUNT * LANE_WIDTH + 1.4) / 2;

/** Building lines: each side of the road, near + far depth layers. */
const N_PER_LINE = 22;
const SPACING = 12;
const TOTAL_Z = N_PER_LINE * SPACING;
const WRAP_BEHIND = 24; // recycle once a building passes this far behind

interface Building {
  inst: number; // instance index
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

/** Facade tints for variety (multiplied with the window texture). */
const TINTS = [0x2a3354, 0x232a45, 0x303a5e, 0x1e2640];

/**
 * Scrolling cityscape + sky + ground that frames the track and gives the world
 * real depth. All buildings are one {@link THREE.InstancedMesh} (one draw call)
 * recycled like the track; the sky is a soft gradient dome and a large ground
 * plane fills the void. Static parts live at the group origin; buildings scroll
 * via per-instance matrices.
 */
export class Environment {
  readonly group = new THREE.Group();

  private readonly mesh: THREE.InstancedMesh;
  private readonly buildings: Building[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly disposables: { dispose(): void }[] = [];

  constructor() {
    this.addSky();
    this.addGround();

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const tex = this.makeWindowTexture();
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: 0x6f86c9,
      emissiveIntensity: 0.45,
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.0,
    });
    this.disposables.push(geo, mat, tex);

    const lines: Array<{ side: number; layer: number }> = [
      { side: -1, layer: 0 }, { side: 1, layer: 0 },
      { side: -1, layer: 1 }, { side: 1, layer: 1 },
    ];
    const count = lines.length * N_PER_LINE;
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    let inst = 0;
    for (const { side, layer } of lines) {
      const baseX = ROAD_HALF + 2.5 + layer * 9;
      for (let i = 0; i < N_PER_LINE; i++) {
        const b: Building = {
          inst,
          x: side * (baseX + Math.random() * 3),
          z: WRAP_BEHIND - i * SPACING,
          w: 0,
          h: 0,
          d: 0,
        };
        this.randomize(b, layer);
        this.buildings.push(b);
        this.writeMatrix(b);
        this.mesh.setColorAt(inst, this.color.setHex(TINTS[(Math.random() * TINTS.length) | 0]));
        inst++;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.group.add(this.mesh);
  }

  private randomize(b: Building, layer: number): void {
    b.w = 2.2 + Math.random() * 3;
    b.d = 2.2 + Math.random() * 3.5;
    b.h = layer === 0 ? 4 + Math.random() * 9 : 12 + Math.random() * 22;
  }

  private writeMatrix(b: Building): void {
    this.dummy.position.set(b.x, b.h / 2, b.z);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.set(b.w, b.h, b.d);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(b.inst, this.dummy.matrix);
  }

  /** Scroll the city toward the camera and recycle buildings that pass behind. */
  update(scroll: number): void {
    let recolor = false;
    for (const b of this.buildings) {
      b.z += scroll;
      if (b.z > WRAP_BEHIND) {
        b.z -= TOTAL_Z;
        const layer = Math.abs(b.x) > ROAD_HALF + 8 ? 1 : 0;
        this.randomize(b, layer);
        this.mesh.setColorAt(b.inst, this.color.setHex(TINTS[(Math.random() * TINTS.length) | 0]));
        recolor = true;
      }
      this.writeMatrix(b);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (recolor && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  // ── Static scenery ─────────────────────────────────────────────────────────
  private addSky(): void {
    const geo = new THREE.SphereGeometry(300, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x05070f) },
        bottom: { value: new THREE.Color(0x141d38) },
      },
      vertexShader: `varying float vY;
        void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vY; uniform vec3 top; uniform vec3 bottom;
        void main(){ float t = clamp(vY*0.5+0.5,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, t),1.0); }`,
    });
    this.disposables.push(geo, mat);
    this.group.add(new THREE.Mesh(geo, mat));
  }

  private addGround(): void {
    const geo = new THREE.PlaneGeometry(600, 700);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x0a0e1c, roughness: 1 });
    this.disposables.push(geo, mat);
    const ground = new THREE.Mesh(geo, mat);
    ground.position.set(0, -0.05, -180);
    this.group.add(ground);
  }

  private makeWindowTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#0c1124';
    ctx.fillRect(0, 0, 64, 128);
    const cols = 4;
    const rows = 10;
    const pad = 4;
    const cw = (64 - pad * (cols + 1)) / cols;
    const rh = (128 - pad * (rows + 1)) / rows;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const lit = Math.random();
        ctx.fillStyle = lit > 0.6 ? '#cfe3ff' : lit > 0.32 ? '#4a5f93' : '#10162c';
        ctx.fillRect(pad + col * (cw + pad), pad + r * (rh + pad), cw, rh);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 2;
    return tex;
  }

  dispose(): void {
    this.mesh.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

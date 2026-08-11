import * as THREE from 'three';
import {
  COLORS,
  GATE_BOTTOM,
  LIVERIES,
  LOW_ROOF,
  laneToX,
  ROOF_GATE_BOTTOM,
  SLOT_LEN,
  TALL_ROOF,
  type Livery,
} from '../config/constants';

/**
 * Everything that can stand in the player's way inside the train yard.
 *
 * The vocabulary mirrors Subway Surfers: carriages you leap onto and sprint
 * along, tall carriages that can only be boarded from another roof or a ramp,
 * an oncoming express that screams down the rails at you, plus the classic
 * jump / roll / dodge street furniture.
 */
export enum ObstacleKind {
  /** Short carriage — roof at {@link LOW_ROOF}, boardable with a plain jump. */
  TRAIN_LOW = 'TRAIN_LOW',
  /** Three-car rake at low height — a long roof sprint. */
  TRAIN_LOW_LONG = 'TRAIN_LOW_LONG',
  /** Full-height carriage — board it from a ramp or another roof. */
  TRAIN_TALL = 'TRAIN_TALL',
  /** Long full-height rake. */
  TRAIN_TALL_LONG = 'TRAIN_TALL_LONG',
  /** Oncoming express — rushes toward the player far faster than the world. */
  TRAIN_EXPRESS = 'TRAIN_EXPRESS',
  /** Wedge that lifts you from the ballast up to low-roof height. */
  RAMP = 'RAMP',
  /** Waist-high hurdle — jump it. */
  BARRIER = 'BARRIER',
  /** Overhead gate — roll under it. */
  GATE = 'GATE',
  /** Overhead gate mounted on a low carriage roof — roll while up there. */
  ROOF_GATE = 'ROOF_GATE',
  /** Signal pylon — solid, full height. Change lane. */
  PYLON = 'PYLON',
  /** Stack of yard crates — small enough to hop onto. */
  CRATE = 'CRATE',
  /** Buffer stop / concrete block — solid, waist-to-head. Change lane. */
  BUFFER = 'BUFFER',
  /** Tunnel bore spanning every lane — roll if you are up on a low roof. */
  TUNNEL = 'TUNNEL',
}

export interface KindSpec {
  /** Length in authoring slots (× SLOT_LEN world units). */
  slots: number;
  /** Collision half-width. */
  halfX: number;
  /** Bottom of the collision box. */
  bottom: number;
  /** Top of the collision box (and the walkable roof height when rideable). */
  top: number;
  /** The roof can be stood on. */
  rideable?: boolean;
  /** World-Z length of a boarding slope on the near (+Z) face. */
  rampLen?: number;
  /** Drifts/rushes along Z. */
  moving?: boolean;
  /** Extra approach speed for the oncoming express (world units / s). */
  rushSpeed?: number;
  /** Can be cleared by a blast. */
  destructible?: boolean;
  /** A blast can never remove it. */
  unbreakable?: boolean;
  /** Only meaningful while the player is up on a roof. */
  elevated?: boolean;
}

const S = SLOT_LEN;

export const SPECS: Record<ObstacleKind, KindSpec> = {
  [ObstacleKind.TRAIN_LOW]: {
    slots: 4, halfX: 1.15, bottom: 0, top: LOW_ROOF, rideable: true, unbreakable: true,
  },
  [ObstacleKind.TRAIN_LOW_LONG]: {
    slots: 7, halfX: 1.15, bottom: 0, top: LOW_ROOF, rideable: true, unbreakable: true,
  },
  [ObstacleKind.TRAIN_TALL]: {
    slots: 4, halfX: 1.15, bottom: 0, top: TALL_ROOF, rideable: true, unbreakable: true,
  },
  [ObstacleKind.TRAIN_TALL_LONG]: {
    slots: 7, halfX: 1.15, bottom: 0, top: TALL_ROOF, rideable: true, unbreakable: true,
  },
  [ObstacleKind.TRAIN_EXPRESS]: {
    slots: 5, halfX: 1.15, bottom: 0, top: TALL_ROOF, moving: true, rushSpeed: 26, unbreakable: true,
  },
  [ObstacleKind.RAMP]: {
    slots: 1, halfX: 1.15, bottom: 0, top: LOW_ROOF, rideable: true, rampLen: S, unbreakable: true,
  },
  [ObstacleKind.BARRIER]: {
    slots: 1, halfX: 1.15, bottom: 0, top: 1.0, destructible: true,
  },
  [ObstacleKind.GATE]: {
    slots: 1, halfX: 1.15, bottom: GATE_BOTTOM, top: 2.75, destructible: true,
  },
  [ObstacleKind.ROOF_GATE]: {
    slots: 1, halfX: 1.15, bottom: ROOF_GATE_BOTTOM, top: ROOF_GATE_BOTTOM + 0.9,
    elevated: true, unbreakable: true,
  },
  [ObstacleKind.PYLON]: {
    slots: 1, halfX: 0.8, bottom: 0, top: 3.0, unbreakable: true,
  },
  [ObstacleKind.CRATE]: {
    slots: 1, halfX: 0.8, bottom: 0, top: 1.15, rideable: true, destructible: true,
  },
  [ObstacleKind.BUFFER]: {
    slots: 1, halfX: 1.15, bottom: 0, top: 1.9, unbreakable: true,
  },
  [ObstacleKind.TUNNEL]: {
    slots: 4, halfX: 4.6, bottom: ROOF_GATE_BOTTOM, top: ROOF_GATE_BOTTOM + 3.2,
    elevated: true, unbreakable: true,
  },
};

/** World-Z length of one obstacle kind. */
export function kindLength(kind: ObstacleKind): number {
  return SPECS[kind].slots * S;
}

// ── Shared geometry / material caches (built once, reused by every instance) ──
const geos = new Map<string, THREE.BufferGeometry>();
const mats = new Map<string, THREE.Material>();
const texes = new Map<string, THREE.CanvasTexture>();

function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geos.get(key);
  if (!g) {
    g = make();
    geos.set(key, g);
  }
  return g;
}

function mat(key: string, make: () => THREE.Material): THREE.Material {
  let m = mats.get(key);
  if (!m) {
    m = make();
    mats.set(key, m);
  }
  return m;
}

function std(color: number, o: { e?: number; rough?: number; metal?: number } = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: o.e ?? 0.06,
    roughness: o.rough ?? 0.62,
    metalness: o.metal ?? 0.12,
  });
}

function tex(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  let t = texes.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    texes.set(key, t);
  }
  return t;
}

/** Diagonal hazard stripes used on hurdles and buffer stops. */
function stripeTexture(): THREE.CanvasTexture {
  return tex('stripe', 128, 64, (ctx) => {
    ctx.fillStyle = '#ff8a1f';
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = '#20242c';
    for (let i = -64; i < 192; i += 34) {
      ctx.beginPath();
      ctx.moveTo(i, 64);
      ctx.lineTo(i + 17, 64);
      ctx.lineTo(i + 17 + 40, 0);
      ctx.lineTo(i + 40, 0);
      ctx.fill();
    }
  });
}

/** Long lit window band down the side of a carriage. */
function windowTexture(): THREE.CanvasTexture {
  return tex('carwin', 512, 64, (ctx) => {
    ctx.clearRect(0, 0, 512, 64);
    for (let x = 10; x < 500; x += 64) {
      // Window pane.
      ctx.fillStyle = '#2b3646';
      roundRect(ctx, x, 8, 48, 44, 8);
      ctx.fill();
      // Interior glow + a passenger silhouette on some panes.
      ctx.fillStyle = 'rgba(255,236,190,0.85)';
      roundRect(ctx, x + 4, 12, 40, 36, 6);
      ctx.fill();
      if ((x / 64) % 2 === 0) {
        ctx.fillStyle = 'rgba(60,50,70,0.65)';
        ctx.beginPath();
        ctx.arc(x + 24, 34, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x + 13, 40, 22, 12);
      }
    }
  });
}

/** Sliding-door decal repeated along a carriage flank. */
function doorTexture(): THREE.CanvasTexture {
  return tex('cardoor', 128, 128, (ctx) => {
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(20,26,34,0.55)';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 6, 108, 116);
    ctx.beginPath();
    ctx.moveTo(64, 6);
    ctx.lineTo(64, 122);
    ctx.stroke();
  });
}

/** Up-chevron plate: "jump this". */
function upArrowTexture(): THREE.CanvasTexture {
  return tex('arrow-up', 128, 128, (ctx) => arrow(ctx, 'up', '#ffe9a8'));
}
/** Down-chevron plate: "roll under this". */
function downArrowTexture(): THREE.CanvasTexture {
  return tex('arrow-down', 128, 128, (ctx) => arrow(ctx, 'down', '#ffffff'));
}

/**
 * Draw a stacked pair of chevrons. Canvas Y grows downward while the texture is
 * applied with three.js' default flipY, so canvas-up is world-up: an "up"
 * chevron needs its apex at the *smaller* canvas Y.
 */
function arrow(ctx: CanvasRenderingContext2D, way: 'up' | 'down', color: string): void {
  const dir = way === 'up' ? 1 : -1;
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = color;
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < 2; i++) {
    const y = 46 + i * 34;
    ctx.globalAlpha = i === 0 ? 1 : 0.55;
    ctx.beginPath();
    ctx.moveTo(28, y + dir * 18);
    ctx.lineTo(64, y - dir * 18);
    ctx.lineTo(100, y + dir * 18);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function disposeObstacleResources(): void {
  for (const g of geos.values()) g.dispose();
  for (const m of mats.values()) m.dispose();
  for (const t of texes.values()) t.dispose();
  geos.clear();
  mats.clear();
  texes.clear();
}

/**
 * A pooled hazard. The composite visual is assembled once per pooled instance
 * from shared geometry (livery colours live on per-instance materials so every
 * carriage on screen can wear a different line colour), while collision uses an
 * exact analytic AABB from {@link SPECS} — so the hitbox never drifts from the
 * art. `configure` only repositions; the model is never rebuilt.
 */
export class Obstacle {
  readonly group = new THREE.Group();
  readonly aabb = new THREE.Box3();

  readonly kind: ObstacleKind;
  readonly spec: KindSpec;

  /** Per-instance livery materials (carriages only). */
  private bodyMat?: THREE.MeshStandardMaterial;
  private roofMat?: THREE.MeshStandardMaterial;
  private trimMat?: THREE.MeshStandardMaterial;
  private headlights: THREE.Mesh[] = [];

  private driftCenter = 0;
  private driftPhase = 0;
  /** Extra Z travelled per second by an oncoming express. */
  private rush = 0;
  /** True once the express has been announced to the player this pass. */
  warned = false;
  /** True once the player has been credited with surviving this piece. */
  passed = false;

  private readonly center = new THREE.Vector3();
  private readonly size = new THREE.Vector3();

  constructor(kind: ObstacleKind) {
    this.kind = kind;
    this.spec = SPECS[kind];
    this.buildVisual();
    this.group.visible = false;
  }

  // ── Placement ────────────────────────────────────────────────────────────
  /** Aim this obstacle at a lane and world-Z (centre). */
  configure(lane: number, z: number, livery?: Livery): void {
    this.group.position.set(laneToX(lane), 0, z);
    this.group.visible = true;
    this.warned = false;
    this.passed = false;
    if (this.spec.moving) {
      this.driftCenter = z;
      this.driftPhase = Math.random() * Math.PI * 2;
      this.rush = this.spec.rushSpeed ?? 0;
    }
    if (this.bodyMat) this.applyLivery(livery ?? LIVERIES[(Math.random() * LIVERIES.length) | 0]);
    this.refreshAABB();
  }

  private applyLivery(l: Livery): void {
    this.bodyMat?.color.setHex(l.body);
    this.bodyMat?.emissive.setHex(l.body);
    this.roofMat?.color.setHex(l.roof);
    this.roofMat?.emissive.setHex(l.roof);
    this.trimMat?.color.setHex(l.trim);
    this.trimMat?.emissive.setHex(l.trim);
  }

  /** Scroll toward the camera; the express adds its own approach speed. */
  update(scroll: number, dt: number): void {
    if (this.spec.rushSpeed) {
      this.group.position.z += scroll + this.rush * dt;
    } else if (this.spec.moving) {
      this.driftCenter += scroll;
      this.driftPhase += dt * 1.9;
      this.group.position.z = this.driftCenter + Math.sin(this.driftPhase) * 3.4;
    } else {
      this.group.position.z += scroll;
    }
    if (this.headlights.length) {
      const f = 0.75 + Math.sin(performance.now() * 0.006) * 0.25;
      for (const h of this.headlights) h.scale.setScalar(f);
    }
    this.refreshAABB();
  }

  private refreshAABB(): void {
    const p = this.group.position;
    const s = this.spec;
    const halfY = (s.top - s.bottom) / 2;
    this.center.set(p.x, s.bottom + halfY, p.z);
    this.size.set(s.halfX * 2, halfY * 2, this.halfZ * 2);
    this.aabb.setFromCenterAndSize(this.center, this.size);
  }

  // ── Queries ──────────────────────────────────────────────────────────────
  get z(): number {
    return this.group.position.z;
  }
  get position(): THREE.Vector3 {
    return this.group.position;
  }
  get halfZ(): number {
    return (this.spec.slots * S) / 2;
  }
  get halfX(): number {
    return this.spec.halfX;
  }
  get topY(): number {
    return this.spec.top;
  }
  get bottomY(): number {
    return this.spec.bottom;
  }
  get rideable(): boolean {
    return this.spec.rideable === true;
  }
  get destructible(): boolean {
    return this.spec.destructible === true;
  }
  get unbreakable(): boolean {
    return this.spec.unbreakable === true;
  }
  get rampLen(): number {
    return this.spec.rampLen ?? 0;
  }
  get isExpress(): boolean {
    return this.spec.rushSpeed !== undefined;
  }
  /** Near (+Z) edge — the face the player meets first. */
  get nearZ(): number {
    return this.group.position.z + this.halfZ;
  }
  /** Far (−Z) edge. */
  get farZ(): number {
    return this.group.position.z - this.halfZ;
  }

  /**
   * Walkable surface height at a world-Z, or −1 when that Z is off the body.
   * Ramps interpolate from the ballast up to their top over {@link rampLen}.
   */
  surfaceAt(worldZ: number): number {
    if (!this.rideable) return -1;
    const d = this.nearZ - worldZ; // 0 at the near face, grows toward the far end
    if (d < 0 || d > this.halfZ * 2) return -1;
    const ramp = this.rampLen;
    if (ramp > 0 && d < ramp) return this.spec.top * (d / ramp);
    return this.spec.top;
  }

  reset(): void {
    this.group.visible = false;
  }

  // ── Visual assembly (once per instance, shared geometry) ─────────────────
  private add(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    this.group.add(mesh);
    return mesh;
  }

  private buildVisual(): void {
    const len = this.spec.slots * S;
    switch (this.kind) {
      case ObstacleKind.TRAIN_LOW:
      case ObstacleKind.TRAIN_LOW_LONG:
        this.buildCarriage(len, LOW_ROOF, false);
        break;
      case ObstacleKind.TRAIN_TALL:
      case ObstacleKind.TRAIN_TALL_LONG:
        this.buildCarriage(len, TALL_ROOF, false);
        break;
      case ObstacleKind.TRAIN_EXPRESS:
        this.buildCarriage(len, TALL_ROOF, true);
        break;
      case ObstacleKind.RAMP:
        this.buildRamp(len);
        break;
      case ObstacleKind.BARRIER:
        this.buildBarrier();
        break;
      case ObstacleKind.GATE:
        this.buildGate(GATE_BOTTOM, 2.75);
        break;
      case ObstacleKind.ROOF_GATE:
        this.buildGate(ROOF_GATE_BOTTOM, ROOF_GATE_BOTTOM + 0.9, true);
        break;
      case ObstacleKind.PYLON:
        this.buildPylon();
        break;
      case ObstacleKind.CRATE:
        this.buildCrates();
        break;
      case ObstacleKind.BUFFER:
        this.buildBuffer();
        break;
      case ObstacleKind.TUNNEL:
        this.buildTunnel(len);
        break;
    }
  }

  /**
   * A subway rake: `len / CAR` articulated cars sharing one silhouette, with a
   * lit window band, sliding-door decals, roof ribs + air-con pods, bogies and
   * (on the leading car) a windscreen, destination blind and headlights.
   */
  private buildCarriage(len: number, roofY: number, express: boolean): void {
    const CAR = 14;
    const cars = Math.max(1, Math.round(len / CAR));
    const carLen = len / cars;
    const w = 2.16;
    const skirt = 0.34; // undercarriage height
    const bodyH = roofY - skirt - 0.14;

    this.bodyMat = std(0xf0f3f7, { rough: 0.42, metal: 0.28 });
    this.roofMat = std(0xd7dde5, { rough: 0.55, metal: 0.2 });
    this.trimMat = std(0xe23c3c, { e: 0.22, rough: 0.4 });

    const bodyG = geo(`car:body:${carLen.toFixed(2)}:${bodyH.toFixed(2)}`,
      () => new THREE.BoxGeometry(w, bodyH, carLen - 0.5));
    const roofG = geo(`car:roof:${carLen.toFixed(2)}`,
      () => new THREE.BoxGeometry(w + 0.06, 0.16, carLen - 0.3));
    const underG = geo(`car:under:${carLen.toFixed(2)}`,
      () => new THREE.BoxGeometry(w - 0.24, skirt, carLen - 0.6));
    const underM = mat('car:under', () => std(0x2a2f38, { rough: 0.9, metal: 0.1 }));
    const stripeG = geo(`car:stripe:${carLen.toFixed(2)}`,
      () => new THREE.BoxGeometry(w + 0.04, 0.16, carLen - 0.45));

    const winG = geo(`car:win:${carLen.toFixed(2)}`, () => new THREE.PlaneGeometry(carLen * 0.86, 0.62));
    const winM = mat('car:winmat', () => {
      const t = windowTexture();
      return new THREE.MeshBasicMaterial({ map: t, transparent: true });
    });
    const doorG = geo('car:door', () => new THREE.PlaneGeometry(1.5, bodyH * 0.78));
    const doorM = mat('car:doormat', () => new THREE.MeshBasicMaterial({
      map: doorTexture(), transparent: true, opacity: 0.75,
    }));

    for (let i = 0; i < cars; i++) {
      const cz = -len / 2 + carLen * (i + 0.5);
      this.add(bodyG, this.bodyMat, 0, skirt + bodyH / 2, cz);
      this.add(roofG, this.roofMat, 0, roofY - 0.08, cz);
      this.add(underG, underM, 0, skirt / 2, cz);
      // Livery stripe along the waist.
      this.add(stripeG, this.trimMat, 0, skirt + bodyH * 0.62, cz);
      // Window band on both flanks.
      for (const sx of [-1, 1]) {
        const win = this.add(winG, winM, sx * (w / 2 + 0.012), skirt + bodyH * 0.66, cz);
        win.rotation.y = (sx * Math.PI) / 2;
        const door = this.add(doorG, doorM, sx * (w / 2 + 0.014), skirt + bodyH * 0.5, cz - carLen * 0.28);
        door.rotation.y = (sx * Math.PI) / 2;
      }
      // Roof ribs + an air-con pod per car.
      const ribG = geo('car:rib', () => new THREE.BoxGeometry(w - 0.5, 0.1, 0.22));
      for (let r = -1; r <= 1; r++) this.add(ribG, this.roofMat, 0, roofY + 0.03, cz + r * carLen * 0.28);
      const acG = geo('car:ac', () => new THREE.BoxGeometry(1.1, 0.22, 1.5));
      this.add(acG, mat('car:acmat', () => std(0x9aa4b0, { rough: 0.7, metal: 0.3 })), 0, roofY + 0.1, cz);
      // Bogies.
      const bogieG = geo('car:bogie', () => new THREE.BoxGeometry(w - 0.5, 0.2, 1.9));
      const wheelG = geo('car:wheel', () => {
        const g = new THREE.CylinderGeometry(0.26, 0.26, 0.14, 12);
        g.rotateZ(Math.PI / 2);
        return g;
      });
      const wheelM = mat('car:wheelmat', () => std(0x15181e, { rough: 0.85 }));
      for (const bz of [cz - carLen * 0.32, cz + carLen * 0.32]) {
        this.add(bogieG, underM, 0, 0.34, bz);
        for (const sx of [-1, 1]) {
          this.add(wheelG, wheelM, sx * (w / 2 - 0.26), 0.26, bz - 0.55);
          this.add(wheelG, wheelM, sx * (w / 2 - 0.26), 0.26, bz + 0.55);
        }
      }
    }

    // Leading (+Z) cab: windscreen, destination blind, headlights, coupler.
    const faceZ = len / 2 - 0.24;
    const glassG = geo('car:glass', () => new THREE.PlaneGeometry(1.62, 0.72));
    this.add(glassG, mat('car:glassmat', () => std(0x1d2733, { e: 0.16, rough: 0.15, metal: 0.7 })),
      0, roofY - 0.62, faceZ + 0.02);
    const blindG = geo('car:blind', () => new THREE.PlaneGeometry(1.1, 0.24));
    this.add(blindG, mat('car:blindmat', () => new THREE.MeshBasicMaterial({ color: express ? 0xff4a2a : 0xffd24a })),
      0, roofY - 0.2, faceZ + 0.02);
    const lampG = geo('car:lamp', () => new THREE.CircleGeometry(0.19, 14));
    const lampM = mat('car:lampmat', () => new THREE.MeshBasicMaterial({ color: 0xfff8d8 }));
    for (const sx of [-0.66, 0.66]) {
      const l = this.add(lampG, lampM, sx, 0.86, faceZ + 0.03);
      this.headlights.push(l);
    }
    // Warning chevrons on the cab front of the express.
    if (express) {
      const chevG = geo('car:chev', () => new THREE.PlaneGeometry(1.9, 0.5));
      this.add(chevG, mat('car:chevmat', () => new THREE.MeshBasicMaterial({
        map: stripeTexture(), transparent: true,
      })), 0, 1.5, faceZ + 0.03);
    }
  }

  /** A boarding wedge: sloped deck, side cheeks, hazard nosing. */
  private buildRamp(len: number): void {
    const top = LOW_ROOF;
    const w = 2.2;
    // Sloped deck built from a rotated box so the visual matches surfaceAt().
    const slope = Math.atan2(top, len);
    const deckLen = Math.hypot(len, top);
    const deckG = geo('ramp:deck', () => new THREE.BoxGeometry(w, 0.18, deckLen));
    const deck = this.add(deckG, mat('ramp:deckmat', () => std(COLORS.ramp, { e: 0.2, rough: 0.55 })),
      0, top / 2, 0);
    deck.rotation.x = slope; // tall edge toward −Z, matching surfaceAt()
    // Solid cheeks so the wedge reads as a ramp, not a floating plank.
    const cheek = new THREE.Shape();
    cheek.moveTo(len / 2, 0);
    cheek.lineTo(-len / 2, 0);
    cheek.lineTo(-len / 2, top);
    cheek.closePath();
    const cheekG = geo('ramp:cheek', () => new THREE.ExtrudeGeometry(cheek, { depth: 0.12, bevelEnabled: false }));
    const cheekM = mat('ramp:cheekmat', () => std(0x5a5f68, { rough: 0.85 }));
    // The cheek is authored in the X/Y plane; −90° about Y stands it up along Z
    // with the tall edge at −Z, matching the rising direction of surfaceAt().
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(cheekG, cheekM);
      c.rotation.y = -Math.PI / 2;
      c.position.set(sx * (w / 2), 0, 0);
      this.group.add(c);
    }
    // Hazard nosing at the foot.
    const noseG = geo('ramp:nose', () => new THREE.BoxGeometry(w + 0.06, 0.14, 0.4));
    this.add(noseG, mat('ramp:nosemat', () => new THREE.MeshStandardMaterial({
      map: stripeTexture(), roughness: 0.6,
    })), 0, 0.08, len / 2 - 0.2);
  }

  /** Waist-high hurdle: hazard-striped board, posts, and an up-chevron plate. */
  private buildBarrier(): void {
    const boardG = geo('bar:board', () => new THREE.BoxGeometry(2.24, 0.56, 0.14));
    this.add(boardG, mat('bar:boardmat', () => new THREE.MeshStandardMaterial({
      map: stripeTexture(), roughness: 0.6, metalness: 0.1,
    })), 0, 0.66, 0);
    const postG = geo('bar:post', () => new THREE.BoxGeometry(0.18, 1.0, 0.18));
    const postM = mat('bar:postmat', () => std(0x2b3038, { rough: 0.8 }));
    for (const sx of [-1.05, 1.05]) this.add(postG, postM, sx, 0.5, 0);
    const footG = geo('bar:foot', () => new THREE.BoxGeometry(0.5, 0.1, 0.6));
    for (const sx of [-1.05, 1.05]) this.add(footG, postM, sx, 0.05, 0);
    const plateG = geo('bar:plate', () => new THREE.PlaneGeometry(0.9, 0.9));
    const plate = this.add(plateG, mat('bar:platemat', () => new THREE.MeshBasicMaterial({
      map: upArrowTexture(), transparent: true, depthWrite: false,
    })), 0, 1.5, 0.1);
    plate.renderOrder = 3;
  }

  /** Overhead gantry you roll under: header beam, legs, chevrons, lamp bar. */
  private buildGate(bottom: number, top: number, elevated = false): void {
    const h = top - bottom;
    const beamG = geo(`gate:beam:${h.toFixed(2)}`, () => new THREE.BoxGeometry(2.46, h, 0.34));
    const beamM = mat('gate:beammat', () => std(COLORS.gate, { e: 0.18, rough: 0.5 }));
    this.add(beamG, beamM, 0, bottom + h / 2, 0);
    // Legs only make sense for the ground gate; the roof gate clamps to the roof.
    const legTop = elevated ? bottom - LOW_ROOF : bottom;
    const legG = geo(`gate:leg:${legTop.toFixed(2)}`, () => new THREE.BoxGeometry(0.24, Math.max(0.2, legTop), 0.28));
    const legM = mat('gate:legmat', () => std(0x3a4049, { rough: 0.8 }));
    const legBase = elevated ? LOW_ROOF : 0;
    for (const sx of [-1.22, 1.22]) this.add(legG, legM, sx, legBase + Math.max(0.2, legTop) / 2, 0);
    // Warning lamps on the header.
    const lampG = geo('gate:lamp', () => new THREE.SphereGeometry(0.1, 8, 6));
    const lampM = mat('gate:lampmat', () => new THREE.MeshBasicMaterial({ color: 0xffe066 }));
    for (const sx of [-0.7, 0, 0.7]) this.add(lampG, lampM, sx, bottom - 0.06, 0.2);
    const plateG = geo('gate:plate', () => new THREE.PlaneGeometry(1.0, 1.0));
    const plate = this.add(plateG, mat('gate:platemat', () => new THREE.MeshBasicMaterial({
      map: downArrowTexture(), transparent: true, depthWrite: false,
    })), 0, bottom + h / 2, 0.2);
    plate.renderOrder = 3;
  }

  /** Signal pylon: mast, signal head with three lamps, base plinth. */
  private buildPylon(): void {
    const mastG = geo('pyl:mast', () => new THREE.BoxGeometry(0.34, 3.0, 0.34));
    this.add(mastG, mat('pyl:mastmat', () => std(COLORS.pylon, { rough: 0.7, metal: 0.4 })), 0, 1.5, 0);
    const headG = geo('pyl:head', () => new THREE.BoxGeometry(0.62, 1.16, 0.42));
    this.add(headG, mat('pyl:headmat', () => std(0x22262d, { rough: 0.75 })), 0, 2.42, 0.14);
    const lampG = geo('pyl:lamp', () => new THREE.CircleGeometry(0.15, 12));
    const cols = [0xff3b30, 0xffd23f, 0x3ad17a];
    cols.forEach((c, i) => {
      this.add(lampG, mat(`pyl:lamp${i}`, () => new THREE.MeshBasicMaterial({ color: c })),
        0, 2.82 - i * 0.38, 0.36);
    });
    const baseG = geo('pyl:base', () => new THREE.BoxGeometry(0.9, 0.3, 0.9));
    this.add(baseG, mat('pyl:basemat', () => std(0x4a4f57, { rough: 0.9 })), 0, 0.15, 0);
  }

  /** Yard crates: a hoppable stack with plank trim. */
  private buildCrates(): void {
    const boxG = geo('crate:box', () => new THREE.BoxGeometry(1.5, 1.0, 1.5));
    const boxM = mat('crate:boxmat', () => std(COLORS.crate, { rough: 0.9 }));
    this.add(boxG, boxM, 0, 0.52, 0);
    const capG = geo('crate:cap', () => new THREE.BoxGeometry(1.58, 0.14, 1.58));
    const capM = mat('crate:capmat', () => std(0x8a5f2f, { rough: 0.9 }));
    this.add(capG, capM, 0, 1.08, 0);
    this.add(capG, capM, 0, 0.06, 0);
    const bandG = geo('crate:band', () => new THREE.BoxGeometry(1.56, 0.1, 0.12));
    for (const sz of [-0.62, 0.62]) this.add(bandG, capM, 0, 0.62, sz);
  }

  /**
   * A tunnel bore across the whole yard: brick haunches, a barrel-vault soffit
   * low enough to scrape anyone standing on a carriage roof, a portal ring with
   * hazard nosing, and sodium lamps receding into the dark.
   */
  private buildTunnel(len: number): void {
    const soffit = ROOF_GATE_BOTTOM;          // underside of the vault
    const halfW = 5.6;
    const brick = mat('tun:brick', () => std(0x6f6259, { rough: 0.96 }));
    const dark = mat('tun:dark', () => std(0x1a1c22, { rough: 1 }));

    // Barrel vault: an open-ended half cylinder laid along Z.
    const vaultG = geo(`tun:vault:${len}`, () => {
      const g = new THREE.CylinderGeometry(halfW, halfW, len, 22, 1, true, 0, Math.PI);
      g.rotateZ(Math.PI / 2); // axis along X → then swing it to lie along Z
      g.rotateY(Math.PI / 2);
      return g;
    });
    const vault = new THREE.Mesh(vaultG, brick);
    vault.material = brick;
    (vault.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    vault.position.y = soffit;
    this.group.add(vault);

    // Side haunches down to the ballast so the bore reads as solid.
    const haunchG = geo(`tun:haunch:${len}`, () => new THREE.BoxGeometry(0.9, soffit + 0.4, len));
    for (const sx of [-1, 1]) this.add(haunchG, brick, sx * (halfW - 0.2), (soffit + 0.4) / 2, 0);

    // Portal ring on the near (+Z) face + hazard nosing.
    const ringG = geo('tun:ring', () => new THREE.TorusGeometry(halfW - 0.1, 0.34, 8, 26, Math.PI));
    const ring = this.add(ringG, mat('tun:ring', () => std(0x3d444e, { rough: 0.7, metal: 0.4 })),
      0, soffit, len / 2);
    ring.rotation.z = 0;
    const noseG = geo('tun:nose', () => new THREE.BoxGeometry(halfW * 2, 0.42, 0.3));
    this.add(noseG, mat('tun:nose', () => new THREE.MeshStandardMaterial({
      map: stripeTexture(), roughness: 0.65,
    })), 0, soffit - 0.2, len / 2 + 0.2);

    // The dark throat behind the portal, plus receding sodium lamps.
    const backG = geo(`tun:back:${len}`, () => new THREE.PlaneGeometry(halfW * 2, soffit + halfW));
    this.add(backG, dark, 0, (soffit + halfW) / 2 - 0.4, -len / 2 + 0.05);
    const lampG = geo('tun:lamp', () => new THREE.PlaneGeometry(0.7, 0.22));
    const lampM = mat('tun:lampmat', () => new THREE.MeshBasicMaterial({ color: 0xffca6a }));
    for (let i = 0; i < 3; i++) {
      const l = this.add(lampG, lampM, 0, soffit + halfW * 0.55, len / 2 - 2.6 - i * 4.2);
      l.rotation.x = Math.PI / 2;
    }
  }

  /** Buffer stop: concrete block with a striped impact face. */
  private buildBuffer(): void {
    const blockG = geo('buf:block', () => new THREE.BoxGeometry(2.2, 1.5, 1.5));
    this.add(blockG, mat('buf:blockmat', () => std(0x8d8f92, { rough: 0.95 })), 0, 0.75, 0);
    const faceG = geo('buf:face', () => new THREE.PlaneGeometry(2.1, 1.0));
    this.add(faceG, mat('buf:facemat', () => new THREE.MeshStandardMaterial({
      map: stripeTexture(), roughness: 0.7,
    })), 0, 0.85, 0.76);
    const capG = geo('buf:cap', () => new THREE.BoxGeometry(2.3, 0.2, 1.6));
    this.add(capG, mat('buf:capmat', () => std(0x5a5f66, { rough: 0.85 })), 0, 1.6, 0);
    const bumpG = geo('buf:bump', () => {
      const g = new THREE.CylinderGeometry(0.16, 0.16, 0.3, 10);
      g.rotateX(Math.PI / 2);
      return g;
    });
    const bumpM = mat('buf:bumpmat', () => std(0x2b3038, { rough: 0.7, metal: 0.5 }));
    for (const sx of [-0.62, 0.62]) this.add(bumpG, bumpM, sx, 0.55, 0.86);
  }
}

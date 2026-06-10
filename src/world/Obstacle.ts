import * as THREE from 'three';
import { COLORS, laneToX } from '../config/constants';

/** The kinds of hazard the runner must survive. */
export enum ObstacleKind {
  /** Tall train — dodge by switching lanes. */
  TRAIN = 'TRAIN',
  /** Like TRAIN but drifts along Z — dodge by switching lanes. */
  TRAIN_MOVING = 'TRAIN_MOVING',
  /** Low striped barrier — clear by jumping. */
  BARRIER = 'BARRIER',
  /** Overhead gate — clear by sliding under. */
  TUNNEL = 'TUNNEL',
  /** Tall fence wall blocking a lane — dodge by switching lanes. */
  WALL = 'WALL',
  /** Low train — jump ONTO its roof and ride, or dodge. */
  LOW_TRAIN = 'LOW_TRAIN',
  /** Stacked crate — jump onto it / ride, or dodge. */
  CRATE = 'CRATE',
  /** Overhead sign/gantry — clear by sliding under (duck). */
  SIGN = 'SIGN',
}

interface Half {
  x: number;
  y: number;
  z: number;
}

interface KindSpec {
  half: Half; // collision half-extents
  yCenter: number; // collider centre height
  moving: boolean;
  rideable?: boolean;
  destructible?: boolean;
}

/**
 * Analytic collider sizes per kind (independent of the visual, so the hitbox
 * is always exact). Heights are tuned so BARRIER clears with a jump, TUNNEL/
 * SIGN clear with a slide, LOW_TRAIN/CRATE roofs are landable, and TRAIN/WALL
 * force a lane change.
 */
const SPECS: Record<ObstacleKind, KindSpec> = {
  [ObstacleKind.TRAIN]: { half: { x: 1.0, y: 1.3, z: 3.0 }, yCenter: 1.3, moving: false, destructible: true },
  [ObstacleKind.TRAIN_MOVING]: { half: { x: 1.0, y: 1.3, z: 3.0 }, yCenter: 1.3, moving: true, destructible: true },
  [ObstacleKind.BARRIER]: { half: { x: 1.0, y: 0.45, z: 0.18 }, yCenter: 0.45, moving: false, destructible: true },
  [ObstacleKind.TUNNEL]: { half: { x: 1.0, y: 0.5, z: 0.3 }, yCenter: 1.5, moving: false }, // spans 1.0–2.0
  [ObstacleKind.WALL]: { half: { x: 1.0, y: 1.2, z: 0.25 }, yCenter: 1.2, moving: false },
  [ObstacleKind.LOW_TRAIN]: { half: { x: 1.0, y: 0.7, z: 2.5 }, yCenter: 0.7, moving: false, rideable: true, destructible: true },
  [ObstacleKind.CRATE]: { half: { x: 0.7, y: 0.45, z: 0.7 }, yCenter: 0.45, moving: false, rideable: true, destructible: true },
  [ObstacleKind.SIGN]: { half: { x: 1.0, y: 0.45, z: 0.15 }, yCenter: 1.65, moving: false }, // spans 1.2–2.1
};

// ── Shared geometry / material caches (built once, reused by every instance) ──
const geos = new Map<string, THREE.BufferGeometry>();
const mats = new Map<string, THREE.Material>();

function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geos.get(key);
  if (!g) {
    g = make();
    geos.set(key, g);
  }
  return g;
}

function mat(key: string, color: number, opts: { e?: number; rough?: number; metal?: number; basic?: boolean } = {}): THREE.Material {
  let m = mats.get(key);
  if (!m) {
    m = opts.basic
      ? new THREE.MeshBasicMaterial({ color })
      : new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: opts.e ?? 0.12,
          roughness: opts.rough ?? 0.6,
          metalness: opts.metal ?? 0.1,
        });
    mats.set(key, m);
  }
  return m;
}

/** Striped hazard texture (orange/white diagonal) for barriers. */
function stripeTexture(): THREE.CanvasTexture {
  const key = 'tex:stripe';
  const cached = mats.get(key) as unknown as THREE.CanvasTexture | undefined;
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffb13a';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#fff2d0';
  for (let i = -64; i < 128; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 64);
    ctx.lineTo(i + 16, 64);
    ctx.lineTo(i + 16 + 64, 0);
    ctx.lineTo(i + 64, 0);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  mats.set(key, tex as unknown as THREE.Material);
  return tex;
}

/** Lit train-window strip texture. */
function windowTexture(): THREE.CanvasTexture {
  const key = 'tex:windows';
  const cached = mats.get(key) as unknown as THREE.CanvasTexture | undefined;
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 32);
  for (let x = 6; x < 122; x += 22) {
    ctx.fillStyle = Math.random() > 0.25 ? '#ffe9a8' : '#5a3a50';
    ctx.beginPath();
    (ctx as CanvasRenderingContext2D & { roundRect: (x: number, y: number, w: number, h: number, r: number) => void })
      .roundRect(x, 7, 14, 18, 3);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  mats.set(key, tex as unknown as THREE.Material);
  return tex;
}

/** Action hint emoji per obstacle kind (floats above the model). Obstacles you
 *  must simply dodge (trains/walls) carry no label — only actionable ones do. */
const LABELS: Partial<Record<ObstacleKind, string>> = {
  [ObstacleKind.BARRIER]: '⬆️',
  [ObstacleKind.TUNNEL]: '⬇️',
  [ObstacleKind.SIGN]: '⬇️',
  [ObstacleKind.LOW_TRAIN]: '🪜',
  [ObstacleKind.CRATE]: '🪜',
};

const spriteCache = new Map<string, THREE.Sprite>();
/** Build (once per emoji) a camera-facing sprite from a canvas-drawn glyph. */
function labelSprite(emoji: string): THREE.Sprite {
  let cached = spriteCache.get(emoji);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.font = '70px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 48, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  mats.set(`sprite:${emoji}`, tex as unknown as THREE.Material);
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  mats.set(`spritemat:${emoji}`, m);
  cached = new THREE.Sprite(m);
  spriteCache.set(emoji, cached);
  return cached;
}

export function disposeObstacleResources(): void {
  for (const g of geos.values()) g.dispose();
  for (const m of mats.values()) m.dispose();
  geos.clear();
  mats.clear();
  spriteCache.clear();
}


/**
 * A pooled hazard with a **composite visual** (built once per pooled instance
 * from shared geometries/materials — zero steady-state allocation) and an
 * analytic AABB from {@link SPECS}. Pools are per kind, so `configure` only
 * repositions; the model never rebuilds.
 */
export class Obstacle {
  readonly group = new THREE.Group();
  readonly aabb = new THREE.Box3();

  readonly kind: ObstacleKind;
  private readonly spec: KindSpec;
  private patrolCenter = 0;
  private patrolPhase = 0;

  private readonly center = new THREE.Vector3();
  private readonly size = new THREE.Vector3();

  constructor(kind: ObstacleKind) {
    this.kind = kind;
    this.spec = SPECS[kind];
    this.buildVisual();
    this.group.visible = false;
  }

  /** Aim this obstacle at a lane and world-Z. */
  configure(lane: number, z: number): void {
    this.group.position.set(laneToX(lane), 0, z);
    this.group.visible = true;
    if (this.spec.moving) {
      // A patrolling train: bobs forward/back about its slot centre (lane stays
      // fixed, so it's still cleared by a lane change — but the timing shifts).
      this.patrolCenter = z;
      this.patrolPhase = Math.random() * Math.PI * 2;
    }
    this.refreshAABB();
  }

  /** Scroll toward the camera; patrolling trains also bob along Z in place. */
  update(scroll: number, dt: number): void {
    this.group.position.z += scroll;
    if (this.spec.moving) {
      this.patrolCenter += scroll;
      this.patrolPhase += dt * 2.2;
      this.group.position.z = this.patrolCenter + Math.sin(this.patrolPhase) * 3.2;
    }
    this.refreshAABB();
  }

  private refreshAABB(): void {
    const p = this.group.position;
    this.center.set(p.x, this.spec.yCenter, p.z);
    this.size.set(this.spec.half.x * 2, this.spec.half.y * 2, this.spec.half.z * 2);
    this.aabb.setFromCenterAndSize(this.center, this.size);
  }

  get z(): number {
    return this.group.position.z;
  }
  get position(): THREE.Vector3 {
    return this.group.position;
  }
  get topY(): number {
    return this.spec.yCenter + this.spec.half.y;
  }
  get rideable(): boolean {
    return this.spec.rideable === true;
  }
  get destructible(): boolean {
    return this.spec.destructible === true;
  }

  reset(): void {
    this.group.visible = false;
  }

  // ── Visual assembly (once per instance, shared resources) ─────────────────
  private add(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    this.group.add(mesh);
    return mesh;
  }

  private buildVisual(): void {
    switch (this.kind) {
      case ObstacleKind.TRAIN:
        this.buildTrain(COLORS.trainBody, 2.6, 6);
        break;
      case ObstacleKind.TRAIN_MOVING:
        this.buildTrain(0xff5cf0, 2.6, 6);
        break;
      case ObstacleKind.LOW_TRAIN:
        this.buildTrain(COLORS.lowTrain, 1.4, 5, true);
        break;
      case ObstacleKind.BARRIER:
        this.buildBarrier();
        break;
      case ObstacleKind.TUNNEL:
        this.buildOverhead(1.0, 2.0, COLORS.tunnel, 'tunnel');
        break;
      case ObstacleKind.SIGN:
        this.buildOverhead(1.2, 2.1, COLORS.sign, 'sign');
        break;
      case ObstacleKind.WALL:
        this.buildWall();
        break;
      case ObstacleKind.CRATE:
        this.buildCrate();
        break;
    }
    this.addLabel();
  }

  /**
   * A floating emoji label above the obstacle that tells the player, at a
   * glance, what to do: ⬆️ jump, ⬇️ slide under, 🏃 ride the roof, 🚫 dodge.
   */
  private addLabel(): void {
    const emoji = LABELS[this.kind];
    if (!emoji) return;
    const sprite = labelSprite(emoji);
    const s = sprite.clone(); // share the material/texture, own transform
    s.scale.set(1.1, 1.1, 1);
    s.position.set(0, this.topY + 0.7, 0);
    this.group.add(s);
  }

  /** Train: body, golden roof, window strips, wheels, headlight. */
  private buildTrain(bodyColor: number, height: number, length: number, low = false): void {
    const tag = `${this.kind}`;
    const bodyG = geo(`train:body:${height}:${length}`, () => new THREE.BoxGeometry(1.9, height - 0.36, length));
    const bodyM = mat(`train:body:${tag}`, bodyColor, { e: 0.1, rough: 0.5 });
    this.add(bodyG, bodyM, 0, 0.3 + (height - 0.36) / 2, 0);

    // Rounded golden roof slab.
    const roofG = geo(`train:roof:${length}`, () => new THREE.BoxGeometry(2.0, 0.14, length + 0.1));
    const roofM = mat('train:roof', COLORS.trainRoof, { e: 0.18, rough: 0.4 });
    this.add(roofG, roofM, 0, height - 0.07, 0);

    // Window strips on both sides (lit).
    if (!low) {
      const winG = geo(`train:win:${length}`, () => new THREE.PlaneGeometry(length * 0.9, 0.55));
      const winKey = 'train:winmat';
      let winM = mats.get(winKey);
      if (!winM) {
        winM = new THREE.MeshBasicMaterial({ map: windowTexture(), transparent: true });
        mats.set(winKey, winM);
      }
      const l = this.add(winG, winM, -0.96, height * 0.62, 0);
      l.rotation.y = -Math.PI / 2;
      const r = this.add(winG, winM, 0.96, height * 0.62, 0);
      r.rotation.y = Math.PI / 2;
    }

    // Headlight on the face the player sees (+Z) + dark windshield.
    const lampG = geo('train:lamp', () => new THREE.CircleGeometry(0.16, 12));
    const lampM = mat('train:lamp', 0xfff6d0, { basic: true });
    this.add(lampG, lampM, 0, low ? 0.7 : 0.9, length / 2 + 0.01);
    const shieldG = geo('train:shield', () => new THREE.PlaneGeometry(1.5, 0.5));
    const shieldM = mat('train:shield', 0x2a1830, { e: 0.05, rough: 0.2, metal: 0.6 });
    this.add(shieldG, shieldM, 0, height * 0.72, length / 2 + 0.01);

    // Undercarriage + wheels.
    const underG = geo(`train:under:${length}`, () => new THREE.BoxGeometry(1.7, 0.3, length * 0.92));
    const underM = mat('train:under', 0x241a2e, { rough: 0.9 });
    this.add(underG, underM, 0, 0.15, 0);
    const wheelG = geo('train:wheel', () => {
      const g = new THREE.CylinderGeometry(0.18, 0.18, 0.1, 10);
      g.rotateZ(Math.PI / 2);
      return g;
    });
    const wheelM = mat('train:wheel', 0x171020, { rough: 0.8 });
    for (const zw of [-length * 0.32, length * 0.32]) {
      this.add(wheelG, wheelM, -0.85, 0.18, zw);
      this.add(wheelG, wheelM, 0.85, 0.18, zw);
    }
  }

  /** Jump barrier: striped bar on two posts + warning cone tip. */
  private buildBarrier(): void {
    const barG = geo('barrier:bar', () => new THREE.BoxGeometry(2.0, 0.3, 0.16));
    const stripeKey = 'barrier:stripe';
    let stripeM = mats.get(stripeKey);
    if (!stripeM) {
      stripeM = new THREE.MeshStandardMaterial({
        map: stripeTexture(),
        emissive: 0xff8a3a,
        emissiveIntensity: 0.12,
        roughness: 0.6,
      });
      mats.set(stripeKey, stripeM);
    }
    this.add(barG, stripeM, 0, 0.72, 0);
    // Thicker, bright warning posts so the barrier reads clearly.
    const postG = geo('barrier:post', () => new THREE.BoxGeometry(0.2, 0.74, 0.2));
    const postM = mat('barrier:post', 0xffb13a, { e: 0.4, rough: 0.5 });
    this.add(postG, postM, -0.9, 0.37, 0);
    this.add(postG, postM, 0.9, 0.37, 0);
    // Gold cone tip — the "jump!" signal.
    const tipG = geo('barrier:tip', () => new THREE.ConeGeometry(0.12, 0.26, 8));
    const tipM = mat('barrier:tip', COLORS.trainRoof, { e: 0.5 });
    this.add(tipG, tipM, 0, 1.0, 0);
  }

  /** Overhead bar (slide under) with side support legs. */
  private buildOverhead(bottom: number, top: number, color: number, tag: string): void {
    const h = top - bottom;
    const barG = geo(`over:bar:${tag}`, () => new THREE.BoxGeometry(2.1, h, 0.26));
    const barM = mat(`over:bar:${tag}`, color, { e: 0.2, rough: 0.5 });
    this.add(barG, barM, 0, bottom + h / 2, 0);
    // Thicker, brighter support legs + base plates → much more visible pillars.
    const legG = geo(`over:leg:${top}`, () => new THREE.BoxGeometry(0.26, top, 0.26));
    const legM = mat(`over:leg:${tag}`, color, { e: 0.28, rough: 0.5 });
    this.add(legG, legM, -1.06, top / 2, 0);
    this.add(legG, legM, 1.06, top / 2, 0);
    const baseG = geo('over:base', () => new THREE.BoxGeometry(0.42, 0.12, 0.42));
    const baseM = mat('over:base', 0xffd0a0, { e: 0.25, rough: 0.5 });
    this.add(baseG, baseM, -1.06, 0.06, 0);
    this.add(baseG, baseM, 1.06, 0.06, 0);
    // Down-arrow plate hinting "slide".
    const plateG = geo('over:plate', () => new THREE.PlaneGeometry(0.5, 0.3));
    const plateM = mat('over:plate', 0xfff2d0, { basic: true });
    const p = this.add(plateG, plateM, 0, bottom + h / 2, 0.14);
    p.scale.set(0.7, 0.7, 1);
  }

  /** Lane-blocking fence wall with posts. */
  private buildWall(): void {
    const panelG = geo('wall:panel', () => new THREE.BoxGeometry(2.0, 2.2, 0.14));
    const panelM = mat('wall:panel', COLORS.wall, { rough: 0.85, e: 0.06 });
    this.add(panelG, panelM, 0, 1.2, 0);
    const capG = geo('wall:cap', () => new THREE.BoxGeometry(2.1, 0.12, 0.24));
    const capM = mat('wall:cap', 0xffd0a0, { e: 0.2 });
    this.add(capG, capM, 0, 2.36, 0);
    const postG = geo('wall:post', () => new THREE.BoxGeometry(0.16, 2.4, 0.2));
    const postM = mat('wall:post', 0x3a2a44, { rough: 0.9 });
    this.add(postG, postM, -0.95, 1.2, 0);
    this.add(postG, postM, 0.95, 1.2, 0);
  }

  /** Wooden crate with cross planks (landable). */
  private buildCrate(): void {
    const boxG = geo('crate:box', () => new THREE.BoxGeometry(1.3, 0.9, 1.3));
    const boxM = mat('crate:box', COLORS.crate, { rough: 0.9, e: 0.05 });
    this.add(boxG, boxM, 0, 0.45, 0);
    const plankG = geo('crate:plank', () => new THREE.BoxGeometry(1.36, 0.12, 1.36));
    const plankM = mat('crate:plank', 0x8a5a2a, { rough: 0.9 });
    this.add(plankG, plankM, 0, 0.06, 0);
    this.add(plankG, plankM, 0, 0.84, 0);
  }
}

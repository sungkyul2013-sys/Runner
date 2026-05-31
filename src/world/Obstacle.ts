import * as THREE from 'three';
import { COLORS, laneToX } from '../config/constants';

/** The kinds of hazard the runner must survive. */
export enum ObstacleKind {
  /** Tall static block — dodge by switching lanes. */
  TRAIN = 'TRAIN',
  /** Like TRAIN but drifts along Z — dodge by switching lanes. */
  TRAIN_MOVING = 'TRAIN_MOVING',
  /** Low barrier — clear by jumping. */
  BARRIER = 'BARRIER',
  /** Overhead — clear by sliding under. */
  TUNNEL = 'TUNNEL',
  /** Tall side wall blocking a lane — dodge by switching lanes. */
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
  yCenter: number; // collider/mesh centre height
  color: number;
  emissive: number;
  moving: boolean;
  opacity?: number;
  /** Player can land on its roof instead of dying (top hit = safe). */
  rideable?: boolean;
  /** Can be cleared by a Bomb power-up. */
  destructible?: boolean;
}

/**
 * Per-kind dimensions. The collider is analytic (derived from `half`/`yCenter`),
 * so it always matches regardless of the mesh. Heights are tuned so:
 * BARRIER is cleared by jumping, TUNNEL only by sliding under, and TRAIN/WALL
 * force a lane change (too tall to jump, too low to slide under).
 */
const SPECS: Record<ObstacleKind, KindSpec> = {
  [ObstacleKind.TRAIN]: {
    half: { x: 1.0, y: 1.0, z: 3.0 },
    yCenter: 1.0,
    color: COLORS.trainBody,
    emissive: 0x2a1f6b,
    moving: false,
    destructible: true,
  },
  [ObstacleKind.TRAIN_MOVING]: {
    half: { x: 1.0, y: 1.0, z: 3.0 },
    yCenter: 1.0,
    color: 0xff5cf0,
    emissive: 0x7a1f6b,
    moving: true,
    destructible: true,
  },
  [ObstacleKind.BARRIER]: {
    half: { x: 1.0, y: 0.35, z: 0.5 },
    yCenter: 0.35,
    color: COLORS.barrier,
    emissive: 0x803012,
    moving: false,
    destructible: true,
  },
  [ObstacleKind.TUNNEL]: {
    half: { x: 1.0, y: 0.6, z: 0.5 },
    yCenter: 1.6, // spans 1.0–2.2: stand=collide, slide(top 0.9)=pass
    color: COLORS.tunnel,
    emissive: 0x12808a,
    moving: false,
    opacity: 0.6,
  },
  [ObstacleKind.WALL]: {
    half: { x: 1.0, y: 1.2, z: 1.0 },
    yCenter: 1.2,
    color: COLORS.wall,
    emissive: 0x1a1f2b,
    moving: false,
  },
  [ObstacleKind.LOW_TRAIN]: {
    half: { x: 1.0, y: 0.7, z: 2.5 },
    yCenter: 0.7, // roof at y=1.4 — reachable by a normal jump
    color: COLORS.lowTrain,
    emissive: 0x10704f,
    moving: false,
    rideable: true,
    destructible: true,
  },
  [ObstacleKind.CRATE]: {
    half: { x: 0.7, y: 0.45, z: 0.7 },
    yCenter: 0.45, // roof at y=0.9
    color: COLORS.crate,
    emissive: 0x6b4218,
    moving: false,
    rideable: true,
    destructible: true,
  },
  [ObstacleKind.SIGN]: {
    half: { x: 1.0, y: 0.5, z: 0.3 },
    yCenter: 1.7, // spans 1.2–2.2: stand=collide, slide=pass
    color: COLORS.sign,
    emissive: 0x806010,
    moving: false,
  },
};

/** Shared geometry/material per kind — built once, disposed on teardown. */
const geoCache = new Map<ObstacleKind, THREE.BoxGeometry>();
const matCache = new Map<ObstacleKind, THREE.MeshStandardMaterial>();

function resourcesFor(kind: ObstacleKind): {
  geo: THREE.BoxGeometry;
  mat: THREE.MeshStandardMaterial;
} {
  let geo = geoCache.get(kind);
  let mat = matCache.get(kind);
  if (!geo || !mat) {
    const s = SPECS[kind];
    geo = new THREE.BoxGeometry(s.half.x * 2, s.half.y * 2, s.half.z * 2);
    mat = new THREE.MeshStandardMaterial({
      color: s.color,
      emissive: s.emissive,
      emissiveIntensity: 0.45,
      roughness: 0.5,
      metalness: 0.1,
      transparent: s.opacity !== undefined,
      opacity: s.opacity ?? 1,
    });
    geoCache.set(kind, geo);
    matCache.set(kind, mat);
  }
  return { geo, mat };
}

/** Dispose all shared obstacle resources (call on full teardown only). */
export function disposeObstacleResources(): void {
  for (const g of geoCache.values()) g.dispose();
  for (const m of matCache.values()) m.dispose();
  geoCache.clear();
  matCache.clear();
}

/** Drift speed (units/sec) applied to moving trains, sign chosen per spawn. */
const MOVING_DRIFT = 5;

/**
 * A single pooled hazard. Wraps one mesh and a live AABB. `configure` aims it
 * at a lane/Z and swaps in the right shared geometry+material for its kind;
 * `update` scrolls it toward the camera and refreshes the collider.
 */
export class Obstacle {
  readonly mesh = new THREE.Mesh();
  readonly aabb = new THREE.Box3();

  kind: ObstacleKind = ObstacleKind.TRAIN;
  private spec: KindSpec = SPECS[ObstacleKind.TRAIN];
  private drift = 0;

  private readonly center = new THREE.Vector3();
  private readonly size = new THREE.Vector3();

  /** Aim this obstacle at a lane and world-Z, applying its kind's appearance. */
  configure(kind: ObstacleKind, lane: number, z: number): void {
    this.kind = kind;
    this.spec = SPECS[kind];
    const { geo, mat } = resourcesFor(kind);
    this.mesh.geometry = geo;
    this.mesh.material = mat;
    this.mesh.position.set(laneToX(lane), this.spec.yCenter, z);
    this.mesh.visible = true;
    // Moving trains drift along Z; randomise the direction for variety.
    this.drift = this.spec.moving ? (Math.random() < 0.5 ? -1 : 1) * MOVING_DRIFT : 0;
    this.refreshAABB();
  }

  /** Scroll toward the camera by `scroll`, plus any self-drift. */
  update(scroll: number, dt: number): void {
    this.mesh.position.z += scroll + this.drift * dt;
    this.refreshAABB();
  }

  private refreshAABB(): void {
    const p = this.mesh.position;
    this.center.set(p.x, p.y, p.z);
    this.size.set(this.spec.half.x * 2, this.spec.half.y * 2, this.spec.half.z * 2);
    this.aabb.setFromCenterAndSize(this.center, this.size);
  }

  get z(): number {
    return this.mesh.position.z;
  }

  /** Height of this obstacle's roof (top surface). */
  get topY(): number {
    return this.mesh.position.y + this.spec.half.y;
  }

  /** Whether the player can land on top instead of dying. */
  get rideable(): boolean {
    return this.spec.rideable === true;
  }

  /** Whether a Bomb power-up can clear this obstacle. */
  get destructible(): boolean {
    return this.spec.destructible === true;
  }

  /** Hide when released to the pool. */
  reset(): void {
    this.mesh.visible = false;
  }
}

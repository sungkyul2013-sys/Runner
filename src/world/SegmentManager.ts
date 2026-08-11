import * as THREE from 'three';
import {
  LANE_WIDTH,
  LIVERIES,
  RECYCLE_BEHIND,
  SLOT_LEN,
  SPAWN_AHEAD,
} from '../config/constants';
import { PLAYER_Z } from '../player/Player';
import { kindLength, Obstacle, ObstacleKind, SPECS } from './Obstacle';
import { ObjectPool } from './ObjectPool';
import { TEMPLATES, type SegmentTemplate } from './segments/templates';

/** Empty warm-up segments at run start so the player gets a clear runway. */
const WARMUP_SEGMENTS = 2;
/** Distance travelled before each successive difficulty tier unlocks. */
const DIFFICULTY_STEP = 170;
const MAX_DIFFICULTY = 4;
/** Past this distance denser, higher-difficulty layouts are favoured. */
const DENSE_DISTANCE = 450;

/** What the player can do in one authoring cell. */
export type CellAction = 'none' | 'jump' | 'roll';

export interface Cell {
  /** Walkable surface height (0 = ballast, >0 = a carriage roof). */
  surface: number;
  /** Solid on the ground — cannot be run through at ballast level. */
  blocked: boolean;
  /** Action needed to survive this cell at ballast level. */
  action: CellAction;
  /** Height of the lowest obstruction overhead (Infinity = open sky). */
  ceiling: number;
}

/** One spawned segment's grid, handed to the coin layer to trace a line. */
export interface SegmentLayout {
  /** World-Z of the segment's near (+Z) edge at spawn time. */
  nearZ: number;
  slots: number;
  /** `grid[slot][laneIndex]` where laneIndex is 0..2 for lanes −1,0,+1. */
  grid: Cell[][];
}

function emptyCell(): Cell {
  return { surface: 0, blocked: false, action: 'none', ceiling: Infinity };
}

/** Build the occupancy grid for a template (pure — also used by the checker). */
export function buildGrid(t: SegmentTemplate): Cell[][] {
  const grid: Cell[][] = [];
  for (let s = 0; s < t.slots; s++) grid.push([emptyCell(), emptyCell(), emptyCell()]);

  for (const p of t.placements) {
    const spec = SPECS[p.kind];
    // A tunnel bore spans the whole yard; everything else sits in one lane.
    const lanes = p.kind === ObstacleKind.TUNNEL ? [0, 1, 2] : [p.lane + 1];
    for (let s = p.slot; s < Math.min(t.slots, p.slot + spec.slots); s++) {
      for (const li of lanes) {
        const cell = grid[s][li];
        switch (p.kind) {
          case ObstacleKind.RAMP:
            cell.surface = spec.top;
            break;
          case ObstacleKind.ROOF_GATE:
          case ObstacleKind.TUNNEL:
            cell.ceiling = Math.min(cell.ceiling, spec.bottom);
            break;
          case ObstacleKind.BARRIER:
          case ObstacleKind.CRATE:
            cell.action = 'jump';
            break;
          case ObstacleKind.GATE:
            cell.action = 'roll';
            break;
          default:
            // Carriages, pylons, buffer stops: solid at ballast level.
            cell.blocked = true;
            if (spec.rideable) cell.surface = spec.top;
            break;
        }
      }
    }
  }
  return grid;
}

/**
 * Procedurally fills the yard with layout templates ahead of the player and
 * recycles them once they pass behind. Obstacles are pooled **per kind** (each
 * pooled instance builds its composite visual exactly once and only re-tints its
 * livery), so steady-state play allocates nothing. Difficulty rises with
 * distance by widening the pool of eligible templates and biasing toward denser
 * ones. Every spawned segment publishes its occupancy grid so the coin layer can
 * trace a survivable line through it — the coins literally show you the way.
 */
export class SegmentManager {
  readonly group = new THREE.Group();

  private readonly pools = new Map<ObstacleKind, ObjectPool<Obstacle>>();
  private active: Obstacle[] = [];

  /** Near-edge Z of the next segment to spawn (more negative = further ahead). */
  private nextSpawnZ = PLAYER_Z;
  private segmentsSpawned = 0;
  private lastTag?: string;

  /** Notified for every segment spawned (coin routing hooks in here). */
  onLayout: (layout: SegmentLayout) => void = () => {};
  /** Notified when an oncoming express first appears (HUD warning). */
  onExpress: (lane: number) => void = () => {};

  constructor() {
    this.fillAhead(0);
  }

  private poolFor(kind: ObstacleKind): ObjectPool<Obstacle> {
    let pool = this.pools.get(kind);
    if (!pool) {
      pool = new ObjectPool<Obstacle>(
        () => {
          const o = new Obstacle(kind);
          this.group.add(o.group); // stays parented; visibility toggles
          return o;
        },
        (o) => o.reset(),
      );
      this.pools.set(kind, pool);
    }
    return pool;
  }

  /** Live obstacle list for the collision system to test against. */
  get obstacles(): readonly Obstacle[] {
    return this.active;
  }

  /** Advance the world: scroll, recycle behind, and spawn new content ahead. */
  update(scroll: number, dt: number, distance: number): void {
    this.nextSpawnZ += scroll;

    const recycleZ = PLAYER_Z + RECYCLE_BEHIND;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const o = this.active[i];
      o.update(scroll, dt);
      // Announce an oncoming express once it is close enough to matter.
      if (o.isExpress && !o.warned && o.z > PLAYER_Z - 90) {
        o.warned = true;
        this.onExpress(SegmentManager.laneOf(o.position.x));
      }
      if (o.z - o.halfZ > recycleZ) this.releaseAt(i);
    }

    this.fillAhead(distance);
  }

  private releaseAt(i: number): void {
    const o = this.active[i];
    this.poolFor(o.kind).release(o);
    const last = this.active.length - 1;
    this.active[i] = this.active[last];
    this.active.pop();
  }

  /** Spawn segments until the yard is populated out to SPAWN_AHEAD. */
  private fillAhead(distance: number): void {
    while (this.nextSpawnZ > -SPAWN_AHEAD) {
      const template =
        this.segmentsSpawned < WARMUP_SEGMENTS ? TEMPLATES[0] : this.pickTemplate(distance);
      this.spawnSegment(this.nextSpawnZ, template);
      this.nextSpawnZ -= template.slots * SLOT_LEN;
      this.segmentsSpawned++;
    }
  }

  /** Optional cap on template difficulty (e.g. the easy Coin Rush mode). */
  difficultyCap = MAX_DIFFICULTY;
  /** Weight multiplier applied to templates carrying this tag (Express Rush). */
  favourTag?: string;
  favourWeight = 1;

  private pickTemplate(distance: number): SegmentTemplate {
    const maxDiff = Math.min(
      MAX_DIFFICULTY,
      this.difficultyCap,
      Math.floor(distance / DIFFICULTY_STEP),
    );
    const eligible = TEMPLATES.filter(
      (t) => t.difficulty <= maxDiff && !(t.tag && t.tag === this.lastTag),
    );
    if (!eligible.length) return TEMPLATES[0];
    const dense = distance > DENSE_DISTANCE;
    let total = 0;
    const weights = eligible.map((t) => {
      let w = dense ? 1 + t.difficulty * 1.6 + t.placements.length * 0.35 : 1 + t.difficulty * 0.2;
      if (this.favourTag && t.tag === this.favourTag) w *= this.favourWeight;
      total += w;
      return w;
    });
    let r = Math.random() * total;
    for (let i = 0; i < eligible.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        this.lastTag = eligible[i].tag;
        return eligible[i];
      }
    }
    this.lastTag = eligible[eligible.length - 1].tag;
    return eligible[eligible.length - 1];
  }

  /** Instantiate one template's obstacles at the given near-edge Z. */
  private spawnSegment(nearZ: number, template: SegmentTemplate): void {
    // One line colour per segment reads like a real rake sitting in the yard.
    const livery = LIVERIES[(Math.random() * LIVERIES.length) | 0];
    for (const p of template.placements) {
      const centreOffset = p.slot * SLOT_LEN + kindLength(p.kind) / 2;
      const o = this.poolFor(p.kind).acquire();
      o.configure(p.lane, nearZ - centreOffset, livery);
      this.active.push(o);
    }
    this.onLayout({ nearZ, slots: template.slots, grid: buildGrid(template) });
  }

  /**
   * Destroy (recycle) every destructible obstacle within `range` ahead of the
   * player — used by the blast item. Returns cleared positions for FX.
   */
  destroyAhead(range: number): THREE.Vector3[] {
    const cleared: THREE.Vector3[] = [];
    const minZ = PLAYER_Z - range;
    const maxZ = PLAYER_Z + 3;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const o = this.active[i];
      if (o.destructible && o.z >= minZ && o.z <= maxZ) {
        cleared.push(o.position.clone());
        this.releaseAt(i);
      }
    }
    return cleared;
  }

  /** Clear all obstacles and reset the spawn cursor for a fresh run. */
  reset(): void {
    for (let i = this.active.length - 1; i >= 0; i--) this.releaseAt(i);
    this.nextSpawnZ = PLAYER_Z;
    this.segmentsSpawned = 0;
    this.lastTag = undefined;
    this.fillAhead(0);
  }

  /** Lane index (−1/0/1) helper for callers that only know a world X. */
  static laneOf(x: number): number {
    return Math.max(-1, Math.min(1, Math.round(x / LANE_WIDTH)));
  }
}

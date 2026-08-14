import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * The solid layer: real geometry, real lighting.
 *
 * The particle field gives atmosphere but nothing to hold onto. This is the
 * opposite — a single InstancedMesh of rounded blocks that assembles into
 * the 수 mark, a 원고지 lattice, a stack of books, a pencil, a tower. Blocks
 * because they read as built rather than sprinkled, and because one
 * instanced draw call keeps a thousand of them cheap enough for a phone.
 *
 * Every shape is generated with exactly `count` blocks (sampled or padded)
 * so morphing is a per-instance lerp with no reallocation.
 */

export type SolidShape = 'glyph' | 'grid' | 'books' | 'pencil' | 'tower' | 'scatter';

interface Block {
  /** target position */
  x: number;
  y: number;
  z: number;
  /** target scale, in block units */
  s: number;
  /** 0 = ink block, 1 = accent block */
  accent: number;
}

const TAU = Math.PI * 2;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/* ─────────────────────── shape generators ──────────────────────────── */

/**
 * Samples `text` on a coarse grid and returns one block per filled cell —
 * a blocky, solid 수 rather than a cloud of dust.
 */
function glyphBlocks(text: string, count: number, cells = 20): Block[] {
  const out: Block[] = [];
  const canvas = document.createElement('canvas');
  const S = cells * 8;
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return towerBlocks(count);

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${S * 0.82}px "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`;
  ctx.fillText(text, S / 2, S / 2 + S * 0.03);

  const data = ctx.getImageData(0, 0, S, S).data;
  const step = S / cells;
  const unit = 6.2 / cells;
  const r = rng(11);

  for (let gy = 0; gy < cells; gy += 1) {
    for (let gx = 0; gx < cells; gx += 1) {
      // Coverage of this cell decides whether a block sits here.
      let hit = 0;
      let total = 0;
      for (let sy = 2; sy < step; sy += 3) {
        for (let sx = 2; sx < step; sx += 3) {
          const px = Math.floor(gx * step + sx);
          const py = Math.floor(gy * step + sy);
          total += 1;
          if (data[(py * S + px) * 4 + 3] > 110) hit += 1;
        }
      }
      if (total === 0 || hit / total < 0.34) continue;

      const x = (gx - (cells - 1) / 2) * unit;
      const y = -(gy - (cells - 1) / 2) * unit;
      // Two plates of depth so the mark has real thickness when it turns.
      const layers = hit / total > 0.75 ? 2 : 1;
      for (let l = 0; l < layers; l += 1) {
        out.push({
          x,
          y,
          z: (l - (layers - 1) / 2) * unit * 0.92,
          // Nearly touching: gaps between blocks break the strokes up and
          // the mark stops reading as 수 at all.
          s: unit * 0.98,
          accent: r() < 0.06 ? 1 : 0,
        });
      }
    }
  }

  return fit(out, count, 13);
}

/** 원고지 as a solid lattice: cell walls, with a few cells written in. */
function gridBlocks(count: number): Block[] {
  const out: Block[] = [];
  const cols = 9;
  const rows = 7;
  const unit = 0.62;
  const r = rng(23);

  const written = new Set<number>();
  for (let n = 0; n < 4; n += 1) {
    const row = (r() * rows) | 0;
    const from = (r() * (cols - 4)) | 0;
    for (let c = from; c < Math.min(cols, from + 3 + ((r() * 3) | 0)); c += 1) {
      written.add(row * cols + c);
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = (col - (cols - 1) / 2) * unit;
      const y = -(row - (rows - 1) / 2) * unit;
      const filled = written.has(row * cols + col);

      // The cell itself: a thin tile, taller where a character was written.
      out.push({
        x,
        y,
        z: filled ? unit * 0.34 : 0,
        s: unit * (filled ? 0.8 : 0.86),
        accent: filled ? 1 : 0,
      });
    }
  }

  return fit(out, count, 29);
}

/** A stack of books, each a wide slab, slightly askew. */
function booksBlocks(count: number): Block[] {
  const out: Block[] = [];
  const r = rng(31);
  const books = 7;

  for (let b = 0; b < books; b += 1) {
    const w = 8 + ((r() * 4) | 0);
    const y = -1.9 + b * 0.58;
    const lean = (r() - 0.5) * 0.55;
    const depth = 3;

    for (let i = 0; i < w; i += 1) {
      for (let d = 0; d < depth; d += 1) {
        out.push({
          x: (i - (w - 1) / 2) * 0.46 + lean,
          y,
          z: (d - (depth - 1) / 2) * 0.5,
          s: 0.44,
          accent: b === books - 2 ? 1 : 0,
        });
      }
    }
  }

  return fit(out, count, 37);
}

/** A pencil standing up: shaft, then a tapering tip. */
function pencilBlocks(count: number): Block[] {
  const out: Block[] = [];
  const r = rng(43);
  const h = 22;

  for (let i = 0; i < h; i += 1) {
    const t = i / (h - 1);
    // Taper over the top fifth.
    const ring = t > 0.8 ? Math.max(1, Math.round((1 - (t - 0.8) / 0.2) * 2)) : 2;
    const y = -2.6 + t * 5.4;

    for (let a = 0; a < ring * 4; a += 1) {
      const ang = (a / (ring * 4)) * TAU;
      const rad = ring * 0.19;
      out.push({
        x: Math.cos(ang) * rad,
        y,
        z: Math.sin(ang) * rad,
        s: 0.3,
        accent: t > 0.86 ? 1 : r() < 0.04 ? 1 : 0,
      });
    }
  }

  return fit(out, count, 51);
}

/** A stepped tower — the progression board's own silhouette. */
function towerBlocks(count: number): Block[] {
  const out: Block[] = [];
  const r = rng(57);
  const tiers = 6;

  for (let t = 0; t < tiers; t += 1) {
    const side = tiers - t;
    const y = -2.2 + t * 0.72;
    for (let x = 0; x < side; x += 1) {
      for (let z = 0; z < side; z += 1) {
        // Hollow: only the ring of each tier, so it reads as built.
        if (x > 0 && x < side - 1 && z > 0 && z < side - 1 && t < tiers - 1) continue;
        out.push({
          x: (x - (side - 1) / 2) * 0.66,
          y,
          z: (z - (side - 1) / 2) * 0.66,
          s: 0.6,
          accent: t === tiers - 1 ? 1 : r() < 0.05 ? 1 : 0,
        });
      }
    }
  }

  return fit(out, count, 61);
}

/** Where blocks fly in from. */
function scatterBlocks(count: number): Block[] {
  const out: Block[] = [];
  const r = rng(71);
  for (let i = 0; i < count; i += 1) {
    const a = r() * TAU;
    const rad = 11 + r() * 9;
    out.push({
      x: Math.cos(a) * rad,
      y: (r() - 0.5) * 16,
      z: Math.sin(a) * rad - 4,
      s: 0.3 + r() * 0.4,
      accent: r() < 0.06 ? 1 : 0,
    });
  }
  return out;
}

/**
 * Normalises any shape to exactly `count` blocks.
 *
 * Spare instances are parked at zero scale rather than tucked inside the
 * form: an earlier version padded with real blocks and they filled in the
 * character's counters, so 수 came out as a solid slab. Zero-scale blocks
 * grow in and out across a morph, which reads as the form gaining parts.
 */
function fit(blocks: Block[], count: number, seed: number): Block[] {
  if (blocks.length === 0) return scatterBlocks(count);
  const r = rng(seed);
  const out: Block[] = [];

  if (blocks.length > count) {
    // Too many: keep an even sample so the silhouette survives the trim.
    const stride = blocks.length / count;
    for (let i = 0; i < count; i += 1) out.push(blocks[Math.floor(i * stride)]);
    return out;
  }

  for (const b of blocks) out.push(b);
  for (let i = blocks.length; i < count; i += 1) {
    const src = blocks[i % blocks.length];
    out.push({ x: src.x, y: src.y, z: src.z, s: 0, accent: 0 });
  }

  // A stable shuffle keeps the spare instances spread across the stagger
  // instead of all trailing at the end of the assembly.
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const BUILDERS: Record<SolidShape, (count: number) => Block[]> = {
  glyph: (n) => glyphBlocks('수', n),
  grid: gridBlocks,
  books: booksBlocks,
  pencil: pencilBlocks,
  tower: towerBlocks,
  scatter: scatterBlocks,
};

/** `y` lifts a form clear of the copy that shares its screen. */
export const SOLID_POSE: Record<
  SolidShape,
  { rx: number; ry: number; scale: number; y: number }
> = {
  // Sized and lifted to sit *on top of* the particle wordmark below it:
  // the block 수 and the light 국어논술 read as one lockup, not two objects.
  glyph: { rx: 0.02, ry: -0.13, scale: 0.68, y: 2.5 },
  grid: { rx: 0.5, ry: -0.4, scale: 1.02, y: 0.45 },
  books: { rx: 0.16, ry: -0.5, scale: 1, y: 0.5 },
  pencil: { rx: 0.06, ry: -0.6, scale: 0.98, y: 0.4 },
  tower: { rx: 0.22, ry: -0.62, scale: 1, y: 0.5 },
  scatter: { rx: 0, ry: 0, scale: 1, y: 0 },
};

/* ───────────────────────────── the layer ───────────────────────────── */

export class Solids {
  readonly object = new THREE.Group();

  private readonly mesh: THREE.InstancedMesh;
  private readonly count: number;
  private readonly cache = new Map<SolidShape, Block[]>();

  private from: Block[];
  private to: Block[];
  private progress = 1;
  private current: SolidShape;

  /** Per-instance jitter so the assembly staggers instead of snapping. */
  private readonly seeds: Float32Array;
  private readonly spin: Float32Array;

  private readonly dummy = new THREE.Object3D();
  private readonly qFrom = new THREE.Quaternion();
  private readonly pose = { rx: 0, ry: 0, scale: 1, y: 0 };
  private readonly target = { rx: 0, ry: 0, scale: 1, y: 0 };
  private turbulence = 0;

  constructor(count: number, initial: SolidShape) {
    this.count = count;
    this.current = initial;

    const geo = new RoundedBoxGeometry(1, 1, 1, 2, 0.16);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#cfd4e2'),
      roughness: 0.42,
      metalness: 0.08,
      envMapIntensity: 0.6,
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    // Per-instance colour: ink blocks, with a minority in correction red.
    const colors = new Float32Array(count * 3);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

    this.seeds = new Float32Array(count);
    this.spin = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      this.seeds[i] = Math.random();
      this.spin[i * 3] = (Math.random() - 0.5) * 2;
      this.spin[i * 3 + 1] = (Math.random() - 0.5) * 2;
      this.spin[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }

    this.from = this.shape(initial);
    this.to = this.shape(initial);
    this.paintColors();

    this.object.add(this.mesh);
    this.object.add(...this.lights());

    const pose = SOLID_POSE[initial];
    Object.assign(this.pose, pose);
    Object.assign(this.target, pose);
  }

  /** A three-point setup: cool key, warm fill, tight rim. */
  private lights(): THREE.Light[] {
    const key = new THREE.DirectionalLight('#eaf1ff', 2.5);
    key.position.set(4, 6, 5);

    const fill = new THREE.DirectionalLight('#ffb98a', 0.85);
    fill.position.set(-6, -2, 3);

    const rim = new THREE.PointLight('#ff6a58', 9, 26, 2);
    rim.position.set(-3, 2.5, -5);

    return [new THREE.AmbientLight('#20263a', 1.4), key, fill, rim];
  }

  private shape(name: SolidShape): Block[] {
    let blocks = this.cache.get(name);
    if (!blocks) {
      blocks = BUILDERS[name](this.count);
      this.cache.set(name, blocks);
    }
    return blocks;
  }

  private paintColors(): void {
    const attr = this.mesh.instanceColor;
    if (!attr) return;

    const ink = new THREE.Color('#b9c2d8');
    const accent = new THREE.Color('#ff5f50');
    const warm = new THREE.Color('#e8c79a');

    for (let i = 0; i < this.count; i += 1) {
      const target = this.to[i];
      const c = target.accent === 1 ? accent : this.seeds[i] > 0.93 ? warm : ink;
      attr.setXYZ(i, c.r, c.g, c.b);
    }
    attr.needsUpdate = true;
  }

  get shapeName(): SolidShape {
    return this.current;
  }

  morphTo(name: SolidShape): void {
    if (name === this.current) return;

    // Freeze the live silhouette, then fly to the new one.
    const eased = this.easedAll();
    this.from = eased;
    this.to = this.shape(name);
    this.current = name;
    this.progress = 0;
    this.paintColors();

    Object.assign(this.target, SOLID_POSE[name]);
  }

  /** Current interpolated blocks, so an interrupted morph never pops. */
  private easedAll(): Block[] {
    const out: Block[] = [];
    for (let i = 0; i < this.count; i += 1) {
      const p = this.instanceProgress(i);
      const a = this.from[i];
      const b = this.to[i];
      out.push({
        x: a.x + (b.x - a.x) * p,
        y: a.y + (b.y - a.y) * p,
        z: a.z + (b.z - a.z) * p,
        s: a.s + (b.s - a.s) * p,
        accent: p > 0.5 ? b.accent : a.accent,
      });
    }
    return out;
  }

  private instanceProgress(i: number): number {
    const stagger = 0.45;
    const p = Math.min(1, Math.max(0, this.progress * (1 + stagger) - this.seeds[i] * stagger));
    return p * p * (3 - 2 * p);
  }

  /** Fly in from far out on first paint. */
  intro(): void {
    this.from = scatterBlocks(this.count);
    this.progress = 0;
  }

  setTurbulence(v: number): void {
    this.turbulence += (v - this.turbulence) * 0.12;
  }

  setDrive(scroll: number, px: number, py: number, anchor: number): void {
    const pose = SOLID_POSE[this.current];
    const local = scroll - anchor;
    this.target.rx = pose.rx + py * 0.2 + local * 0.7;
    this.target.ry = pose.ry + local * 3.6 + px * 0.4;
    this.target.scale = pose.scale;
    this.target.y = pose.y;
  }

  update(dt: number, time: number): void {
    if (this.progress < 1) this.progress = Math.min(1, this.progress + dt / 1.35);

    const k = 1 - Math.pow(0.0016, dt);
    this.pose.rx += (this.target.rx - this.pose.rx) * k;
    this.pose.ry += (this.target.ry - this.pose.ry) * k;
    this.pose.scale += (this.target.scale - this.pose.scale) * k;
    this.pose.y += (this.target.y - this.pose.y) * k;

    this.object.rotation.set(this.pose.rx, this.pose.ry, 0);
    this.object.scale.setScalar(this.pose.scale);
    this.object.position.y = this.pose.y;

    const turb = this.turbulence;

    for (let i = 0; i < this.count; i += 1) {
      const p = this.instanceProgress(i);
      const a = this.from[i];
      const b = this.to[i];
      const i3 = i * 3;

      let x = a.x + (b.x - a.x) * p;
      let y = a.y + (b.y - a.y) * p;
      let z = a.z + (b.z - a.z) * p;
      const s = (a.s + (b.s - a.s) * p) * (0.9 + 0.1 * Math.sin(time * 0.7 + this.seeds[i] * 9));

      // A block in flight tumbles; a settled one breathes.
      const flight = 1 - p;
      const drift = 0.05 + turb * 0.6;
      x += Math.sin(time * 0.6 + this.seeds[i] * 6.3) * drift;
      y += Math.cos(time * 0.53 + this.seeds[i] * 6.3) * drift;
      z += Math.sin(time * 0.47 + this.seeds[i] * 6.3) * drift;

      this.dummy.position.set(x, y, z);
      this.dummy.scale.setScalar(Math.max(0.02, s));

      const tumble = flight * 3.4 + turb * 1.6;
      this.qFrom.setFromEuler(
        new THREE.Euler(
          this.spin[i3] * tumble,
          this.spin[i3 + 1] * tumble,
          this.spin[i3 + 2] * tumble,
        ),
      );
      this.dummy.quaternion.copy(this.qFrom);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

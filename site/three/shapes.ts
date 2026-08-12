/**
 * Point-cloud generators.
 *
 * Every generator returns a flat Float32Array of `count * 3` positions that
 * roughly fills the same volume (|p| ≲ 3), so the particle field can morph
 * between any two of them without the silhouette jumping in scale.
 */

export type ShapeName = 'glyph' | 'sphere' | 'book' | 'wave' | 'plane' | 'helix';

const TAU = Math.PI * 2;

/** Deterministic PRNG so a reload produces the same constellation. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/* ─────────────────────────── 글자 (canvas sampled) ────────────────────── */

/**
 * Rasterises `text` to an offscreen canvas and samples the filled pixels.
 * This is what turns "수" into a cloud of light without shipping a font mesh.
 */
export function glyphPoints(text: string, count: number, seed = 7): Float32Array {
  const rng = makeRng(seed);
  const out = new Float32Array(count * 3);

  const W = 320;
  const H = 320;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) return spherePoints(count, seed);

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${text.length > 1 ? 150 : 250}px "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`;
  ctx.fillText(text, W / 2, H / 2 + 8);

  const data = ctx.getImageData(0, 0, W, H).data;

  // Collect lit pixels once, then draw `count` samples from them.
  const hits: number[] = [];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (data[(y * W + x) * 4 + 3] > 128) hits.push(x, y);
    }
  }

  if (hits.length === 0) return spherePoints(count, seed);

  const pairs = hits.length / 2;
  const scale = 6.4 / W; // glyph spans ~6.4 world units wide

  for (let i = 0; i < count; i += 1) {
    const h = ((rng() * pairs) | 0) * 2;
    const px = hits[h] + rng() - 0.5;
    const py = hits[h + 1] + rng() - 0.5;

    out[i * 3] = (px - W / 2) * scale;
    out[i * 3 + 1] = -(py - H / 2) * scale;
    // Give the flat glyph a little thickness so rotation reads as 3D.
    out[i * 3 + 2] = (rng() - 0.5) * 0.55 + Math.sin(px * 0.06) * 0.18;
  }

  return out;
}

/* ──────────────────────────────── 구 ──────────────────────────────────── */

/** Fibonacci sphere — an even shell with no polar clustering. */
export function spherePoints(count: number, seed = 11): Float32Array {
  const rng = makeRng(seed);
  const out = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    // A tenth of the points float just inside the shell for depth.
    const rad = 2.7 * (rng() < 0.12 ? 0.55 + rng() * 0.4 : 1 + (rng() - 0.5) * 0.05);

    out[i * 3] = Math.cos(th) * r * rad;
    out[i * 3 + 1] = y * rad;
    out[i * 3 + 2] = Math.sin(th) * r * rad;
  }

  return out;
}

/* ────────────────────────────── 펼친 책 ───────────────────────────────── */

/** An open book: two curled pages, a spine, and a few stacked page edges. */
export function bookPoints(count: number, seed = 23): Float32Array {
  const rng = makeRng(seed);
  const out = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const roll = rng();
    let x: number;
    let y: number;
    let z: number;

    if (roll < 0.86) {
      // Page surface. u runs spine → outer edge, v runs top → bottom.
      const side = rng() < 0.5 ? -1 : 1;
      const u = Math.sqrt(rng()); // bias samples toward the outer edge
      const v = rng() * 2 - 1;
      const layer = (rng() * 4) | 0;

      x = side * u * 2.75;
      y = -0.55 + u * u * 0.95 + layer * 0.045 - Math.abs(v) * 0.12;
      z = v * 1.85;
      // Slight ripple so the paper doesn't look like a flat ramp.
      y += Math.sin(v * 2.4 + side) * 0.09 * u;
    } else if (roll < 0.94) {
      // Spine.
      x = (rng() - 0.5) * 0.16;
      y = -0.62 + rng() * 0.2;
      z = (rng() * 2 - 1) * 1.85;
    } else {
      // Loose pages lifting off the book.
      const a = rng() * TAU;
      const rad = 2.9 + rng() * 1.1;
      x = Math.cos(a) * rad;
      y = 0.9 + rng() * 1.7;
      z = Math.sin(a) * rad * 0.55;
    }

    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }

  return out;
}

/* ─────────────────────────────── 물결 ─────────────────────────────────── */

/** A rippling grid — reads as "data" under the numbers section. */
export function wavePoints(count: number, seed = 31): Float32Array {
  const rng = makeRng(seed);
  const out = new Float32Array(count * 3);
  const side = Math.ceil(Math.sqrt(count));
  const span = 7.4;

  for (let i = 0; i < count; i += 1) {
    const gx = i % side;
    const gz = (i / side) | 0;
    const x = (gx / (side - 1) - 0.5) * span + (rng() - 0.5) * 0.06;
    const z = (gz / (side - 1) - 0.5) * span + (rng() - 0.5) * 0.06;
    const d = Math.sqrt(x * x + z * z);

    out[i * 3] = x;
    out[i * 3 + 1] = Math.sin(d * 1.25) * 0.75 - d * 0.09 + Math.sin(x * 0.9) * 0.18;
    out[i * 3 + 2] = z;
  }

  return out;
}

/* ───────────────────────────── 종이비행기 ─────────────────────────────── */

/** Paper plane, sampled across four folded triangles. */
export function planePoints(count: number, seed = 43): Float32Array {
  const rng = makeRng(seed);
  const out = new Float32Array(count * 3);

  // nose, tail-top, tail-bottom, keel — a classic dart in local space.
  const tris: [number[], number[], number[]][] = [
    // left wing
    [
      [3.2, 0, 0],
      [-2.2, 0.15, -2.3],
      [-1.1, -0.15, -0.15],
    ],
    // right wing
    [
      [3.2, 0, 0],
      [-2.2, 0.15, 2.3],
      [-1.1, -0.15, 0.15],
    ],
    // keel (the fold under the body)
    [
      [3.2, 0, 0],
      [-1.1, -0.15, -0.15],
      [-1.9, -1.05, 0],
    ],
    [
      [3.2, 0, 0],
      [-1.1, -0.15, 0.15],
      [-1.9, -1.05, 0],
    ],
  ];

  for (let i = 0; i < count; i += 1) {
    const t = tris[(rng() * tris.length) | 0];
    // Uniform barycentric sample.
    let a = rng();
    let b = rng();
    if (a + b > 1) {
      a = 1 - a;
      b = 1 - b;
    }
    const c = 1 - a - b;

    for (let k = 0; k < 3; k += 1) {
      out[i * 3 + k] = t[0][k] * a + t[1][k] * b + t[2][k] * c + (rng() - 0.5) * 0.05;
    }
  }

  return out;
}

/* ─────────────────────────────── 나선 ─────────────────────────────────── */

/** Double helix — used as the transitional "in between chapters" form. */
export function helixPoints(count: number, seed = 57): Float32Array {
  const rng = makeRng(seed);
  const out = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const t = i / count;
    const onRung = rng() < 0.18;
    const strand = i % 2 === 0 ? 0 : Math.PI;
    const a = t * TAU * 3 + strand;
    const rad = onRung ? rng() * 1.6 : 1.6 + (rng() - 0.5) * 0.12;

    out[i * 3] = Math.cos(a) * rad;
    out[i * 3 + 1] = (t - 0.5) * 6.2;
    out[i * 3 + 2] = Math.sin(a) * rad;
  }

  return out;
}

/* ─────────────────────────────── registry ─────────────────────────────── */

export function buildShape(name: ShapeName, count: number): Float32Array {
  switch (name) {
    case 'glyph':
      return glyphPoints('수', count);
    case 'sphere':
      return spherePoints(count);
    case 'book':
      return bookPoints(count);
    case 'wave':
      return wavePoints(count);
    case 'plane':
      return planePoints(count);
    case 'helix':
      return helixPoints(count);
  }
}

/** Per-shape presentation tweaks: base scale + resting tilt of the field. */
export const SHAPE_POSE: Record<ShapeName, { scale: number; rx: number; ry: number }> = {
  glyph: { scale: 1, rx: 0, ry: 0 },
  sphere: { scale: 0.95, rx: 0.1, ry: 0 },
  book: { scale: 0.94, rx: 0.34, ry: -0.25 },
  wave: { scale: 0.98, rx: 0.82, ry: 0.2 },
  plane: { scale: 0.92, rx: 0.16, ry: -0.5 },
  helix: { scale: 0.96, rx: 0.05, ry: 0 },
};

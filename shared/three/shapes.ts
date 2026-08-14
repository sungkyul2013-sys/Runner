/**
 * Point-cloud generators.
 *
 * Every generator returns a flat Float32Array of `count * 3` positions that
 * roughly fills the same volume (|p| ≲ 3), so the particle field can morph
 * between any two of them without the silhouette jumping in scale.
 */

export type ShapeName =
  | 'glyph'
  | 'wordmark'
  | 'sphere'
  | 'book'
  | 'wave'
  | 'plane'
  | 'helix'
  | 'grid';

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

/* ──────────────────────── 국어논술 (the wordmark) ─────────────────────── */

/**
 * The academy's name, in light.
 *
 * The solid layer builds the 수 mark out of blocks; this builds the word
 * that follows it out of points, wide and low, so the two layers together
 * read as the lockup — 수 국어논술 — standing in space rather than as two
 * unrelated objects sharing a screen.
 *
 * The band is curved on Z: the ends bend away from the viewer, so turning
 * it a few degrees reads as a cylinder rather than a flat billboard.
 */
export function wordmarkPoints(count: number, seed = 31, text = '국어논술'): Float32Array {
  const rng = makeRng(seed);
  const out = new Float32Array(count * 3);

  const W = 900;
  const H = 240;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) return glyphPoints(text, count, seed);

  // Drawn character by character: canvas letter-spacing is not universally
  // supported, and even spacing is the whole point of a wordmark.
  const size = 168;
  const gap = size * 0.16;
  const step = size + gap;
  const startX = W / 2 - ((text.length - 1) * step) / 2;

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${size}px "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`;
  for (let i = 0; i < text.length; i += 1) {
    ctx.fillText(text[i], startX + i * step, H / 2 + 4);
  }

  const data = ctx.getImageData(0, 0, W, H).data;

  const hits: number[] = [];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (data[(y * W + x) * 4 + 3] > 128) hits.push(x, y);
    }
  }

  if (hits.length === 0) return glyphPoints(text, count, seed);

  const pairs = hits.length / 2;
  const scale = 9.6 / W; // the band spans ~9.6 world units
  // Sits just under the solid 수 and still inside the hero's clear band —
  // any lower and the copy's scrim swallows the name it is there to say.
  const drop = 0.45;

  for (let i = 0; i < count; i += 1) {
    const hi = ((rng() * pairs) | 0) * 2;
    const px = hits[hi] + rng() - 0.5;
    const py = hits[hi + 1] + rng() - 0.5;

    const x = (px - W / 2) * scale;
    const u = x / 4.8; // −1 … 1 across the band

    out[i * 3] = x;
    out[i * 3 + 1] = -(py - H / 2) * scale + drop;
    out[i * 3 + 2] = -u * u * 1.9 + (rng() - 0.5) * 0.42;
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

/* ────────────────────────────── 원고지 ────────────────────────────────── */

/**
 * The manuscript grid, in three dimensions: ruled cells with a scatter of
 * filled ones, as though someone had started writing in the corner.
 */
export function gridPoints(count: number, seed = 71): Float32Array {
  const rng = makeRng(seed);
  const out = new Float32Array(count * 3);

  const cols = 11;
  const rows = 8;
  const cell = 0.66;
  const w = cols * cell;
  const h = rows * cell;

  // A handful of cells hold "characters" — small dense blocks of points.
  const written = new Set<number>();
  for (let r = 0; r < 5; r += 1) {
    const row = (rng() * rows) | 0;
    const start = (rng() * (cols - 5)) | 0;
    const len = 3 + ((rng() * 4) | 0);
    for (let c = start; c < Math.min(cols, start + len); c += 1) written.add(row * cols + c);
  }
  const writtenCells = [...written];

  for (let i = 0; i < count; i += 1) {
    const roll = rng();
    let x: number;
    let y: number;

    if (roll < 0.3 && writtenCells.length > 0) {
      // Ink inside a written cell.
      const idx = writtenCells[(rng() * writtenCells.length) | 0];
      const c = idx % cols;
      const r = (idx / cols) | 0;
      x = (c + 0.18 + rng() * 0.64) * cell - w / 2;
      y = h / 2 - (r + 0.18 + rng() * 0.64) * cell;
    } else if (rng() < 0.5) {
      // A horizontal rule.
      const r = (rng() * (rows + 1)) | 0;
      x = rng() * w - w / 2;
      y = h / 2 - r * cell;
    } else {
      // A vertical rule.
      const c = (rng() * (cols + 1)) | 0;
      x = c * cell - w / 2;
      y = rng() * h - h / 2;
    }

    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = (rng() - 0.5) * 0.16;
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
    case 'wordmark':
      return wordmarkPoints(count);
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
    case 'grid':
      return gridPoints(count);
  }
}

/** A far shell the field flies in from on first paint. */
export function scatterPoints(count: number, seed = 97): Float32Array {
  const rng = makeRng(seed);
  const out = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const a = rng() * TAU;
    const z = rng() * 2 - 1;
    const r = Math.sqrt(Math.max(0, 1 - z * z)) * (10 + rng() * 9);

    out[i * 3] = Math.cos(a) * r;
    out[i * 3 + 1] = Math.sin(a) * r * 0.8;
    out[i * 3 + 2] = z * (10 + rng() * 9);
  }

  return out;
}

/** Per-shape presentation tweaks: base scale + resting tilt of the field. */
/**
 * `spin` scales how much the scroll turns a shape. Forms that carry meaning
 * face-on — the glyph, the wordmark — turn far less than the abstract ones,
 * or they read as a smear at exactly the moment they should read as a name.
 */
export const SHAPE_POSE: Record<
  ShapeName,
  { scale: number; rx: number; ry: number; spin?: number; wide?: true }
> = {
  glyph: { scale: 1, rx: 0, ry: 0, spin: 0.5 },
  // Nearly face-on: a wordmark you cannot read is not a wordmark.
  // `wide`: the band is 9.6 units across — wider than a phone's frustum —
  // so it takes an extra viewport-driven scale the other shapes don't need.
  wordmark: { scale: 1, rx: 0.03, ry: -0.06, spin: 0.22, wide: true },
  sphere: { scale: 0.95, rx: 0.1, ry: 0 },
  book: { scale: 0.94, rx: 0.34, ry: -0.25 },
  wave: { scale: 0.98, rx: 0.82, ry: 0.2 },
  plane: { scale: 0.92, rx: 0.16, ry: -0.5 },
  helix: { scale: 0.96, rx: 0.05, ry: 0 },
  grid: { scale: 0.92, rx: 0.26, ry: -0.34 },
};

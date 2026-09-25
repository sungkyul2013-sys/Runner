// Deterministic randomness for the map generator (§13.4): a seeded PRNG and 2D gradient noise with fBm / ridged
// variants. The same seed always builds the same map (physics and rendering agree, reloads match).

/** mulberry32: small, fast, 32-bit state. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash of (x, z, seed) → [0, 1). */
export function hash2(x: number, z: number, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const GRAD = new Float32Array(512);
{
  const r = rng(1337);
  for (let i = 0; i < 256; i++) {
    const a = r() * Math.PI * 2;
    GRAD[i * 2] = Math.cos(a);
    GRAD[i * 2 + 1] = Math.sin(a);
  }
}
const PERM = new Uint8Array(512);
{
  const r = rng(4242);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}

function grad(ix: number, iz: number, dx: number, dz: number): number {
  const g = PERM[(PERM[ix & 255] + iz) & 511] * 2;
  return GRAD[g] * dx + GRAD[g + 1] * dz;
}

/** 2D gradient (Perlin) noise, about [−0.7, 0.7]. */
export function noise2(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = grad(ix, iz, fx, fz), b = grad(ix + 1, iz, fx - 1, fz);
  const c = grad(ix, iz + 1, fx, fz - 1), d = grad(ix + 1, iz + 1, fx - 1, fz - 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal Brownian motion: `octaves` of noise2, each at twice the frequency and `gain` times the amplitude. */
export function fbm(x: number, z: number, octaves = 5, gain = 0.5, lacunarity = 2.03): number {
  let sum = 0, amp = 1, f = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x * f + o * 17.3, z * f - o * 9.1);
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}

/** Ridged multifractal: sharp crests (mountain ridges), [0, 1]. */
export function ridged(x: number, z: number, octaves = 5): number {
  let sum = 0, amp = 0.5, f = 1, weight = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(noise2(x * f + o * 31.7, z * f + o * 11.3) * 1.4);
    n *= n * weight;
    weight = Math.min(Math.max(n * 1.6, 0), 1);
    sum += n * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return sum / norm;
}

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (x: number, a: number, b: number): number => Math.min(Math.max(x, a), b);

/** A function sampled on a coarse grid and read back with Catmull–Rom (bicubic) interpolation: the expensive large
 *  scale shape of a terrain evaluated once per `step` metres, smooth (C¹) between the samples. */
export class CoarseField {
  private readonly data: Float32Array;
  private readonly n: number;

  constructor(private readonly x0: number, private readonly z0: number, size: number, private readonly step: number, f: (x: number, z: number) => number) {
    this.n = Math.ceil(size / step) + 4;
    this.data = new Float32Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) this.data[j * this.n + i] = f(x0 + (i - 1) * step, z0 + (j - 1) * step);
    }
  }

  at(x: number, z: number): number {
    const fx = (x - this.x0) / this.step + 1, fz = (z - this.z0) / this.step + 1;
    const n = this.n;
    const ix = Math.min(Math.max(Math.floor(fx), 1), n - 3), iz = Math.min(Math.max(Math.floor(fz), 1), n - 3);
    const tx = Math.min(Math.max(fx - ix, 0), 1), tz = Math.min(Math.max(fz - iz, 0), 1);
    const x2 = tx * tx, x3 = x2 * tx, z2 = tz * tz, z3 = z2 * tz;
    const a0 = -0.5 * x3 + x2 - 0.5 * tx, a1 = 1.5 * x3 - 2.5 * x2 + 1, a2 = -1.5 * x3 + 2 * x2 + 0.5 * tx, a3 = 0.5 * x3 - 0.5 * x2;
    const b0 = -0.5 * z3 + z2 - 0.5 * tz, b1 = 1.5 * z3 - 2.5 * z2 + 1, b2 = -1.5 * z3 + 2 * z2 + 0.5 * tz, b3 = 0.5 * z3 - 0.5 * z2;
    const d = this.data;
    const row = (r: number) => {
      const k = (iz - 1 + r) * n + ix - 1;
      return a0 * d[k] + a1 * d[k + 1] + a2 * d[k + 2] + a3 * d[k + 3];
    };
    return b0 * row(0) + b1 * row(1) + b2 * row(2) + b3 * row(3);
  }
}

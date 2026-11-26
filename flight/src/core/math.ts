// Shared math helpers + deterministic noise used by terrain, physics and scenery.
export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const G0 = 9.80665;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential approach. */
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const wrap360 = (d: number) => ((d % 360) + 360) % 360;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix: number, iz: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h & 0xffffff) / 0x7fffff - 1; // [-1, 1]
}
export const hash01 = (ix: number, iz: number) => hash2(ix, iz) * 0.5 + 0.5;

/** Smooth value noise in [-1,1]. */
export function vnoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm(x: number, z: number, oct: number, lac = 2.03, gain = 0.5): number {
  let sum = 0, amp = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += vnoise(x, z) * amp;
    norm += amp;
    amp *= gain;
    // rotate domain each octave to kill grid artifacts
    const nx = x * 1.6 - z * 1.2, nz = x * 1.2 + z * 1.6;
    x = nx * (lac / 2) + 17.3;
    z = nz * (lac / 2) - 9.1;
  }
  return sum / norm;
}

/** Ridged multifractal in [0,1] — sharp mountain crests. */
export function ridged(x: number, z: number, oct: number): number {
  let sum = 0, amp = 0.5, w = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(vnoise(x, z));
    n *= n;
    n *= w;
    w = clamp(n * 2, 0, 1);
    sum += n * amp;
    norm += amp;
    amp *= 0.5;
    const nx = x * 1.6 - z * 1.2, nz = x * 1.2 + z * 1.6;
    x = nx * 1.02 + 31.7;
    z = nz * 1.02 - 5.3;
  }
  return sum / norm;
}

/** International Standard Atmosphere. */
export function atmosphere(alt: number) {
  const h = clamp(alt, -500, 20000);
  let T: number, rho: number;
  if (h < 11000) {
    T = 288.15 - 0.0065 * h;
    rho = 1.225 * Math.pow(T / 288.15, 4.2559);
  } else {
    T = 216.65;
    rho = 0.3639 * Math.exp(-(h - 11000) / 6341.6);
  }
  return { T, rho, a: Math.sqrt(1.4 * 287.05 * T), sigma: rho / 1.225 };
}

export const MS_TO_KT = 1.943844;
export const M_TO_FT = 3.28084;

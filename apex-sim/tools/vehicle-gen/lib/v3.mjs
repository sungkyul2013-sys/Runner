// Tiny 3-vector / 3×3 helpers for the vehicle generator (double precision, plain arrays).
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.sqrt(dot(a, a));
export const norm = (a) => scale(a, 1 / len(a));
export const dist = (a, b) => len(sub(a, b));
export const lerp = (a, b, t) => add(a, scale(sub(b, a), t));
export const mirrorX = (p) => [-p[0], p[1], p[2]];

// Rotation matrix (row-major 3×3) from a rotation vector r (axis · angle), Rodrigues.
export function rotation(r) {
  const th = len(r);
  if (th < 1e-15) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const [x, y, z] = scale(r, 1 / th);
  const c = Math.cos(th), s = Math.sin(th), C = 1 - c;
  return [c + x * x * C, x * y * C - z * s, x * z * C + y * s,
          y * x * C + z * s, c + y * y * C, y * z * C - x * s,
          z * x * C - y * s, z * y * C + x * s, c + z * z * C];
}
export const mulMat = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];

// Rotates p about the axis through o with unit direction k by angle.
export function rotateAbout(p, o, k, angle) {
  return add(o, mulMat(rotation(scale(k, angle)), sub(p, o)));
}

// Solves A x = b (n×n, row-major array of arrays) by Gaussian elimination with partial pivoting.
export function solve(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; ++c) {
    let p = c;
    for (let r = c + 1; r < n; ++r) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-18) throw new Error('singular system');
    for (let r = c + 1; r < n; ++r) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; ++k) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; --r) {
    let s = M[r][n];
    for (let k = r + 1; k < n; ++k) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

// Circle through three points: centre and unit normal of its plane.
export function circleThrough(a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), n = cross(ab, ac);
  const n2 = dot(n, n);
  const center = add(a, scale(add(scale(cross(n, ab), dot(ac, ac)), scale(cross(ac, n), dot(ab, ab))), 1 / (2 * n2)));
  return { center, normal: norm(n) };
}

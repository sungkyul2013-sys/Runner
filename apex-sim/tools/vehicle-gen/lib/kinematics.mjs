// Rigid knuckle kinematics for suspension design: solves the knuckle pose for a given wheel heave with the steering
// held (wheel-axis heading fixed), so the tie-rod / toe-link inner point can be placed for zero bump steer.
import { add, sub, dot, cross, len, mulMat, rotation, solve, scale } from './v3.mjs';

// knuckle: { links: [{ chassis, point }], slider?: { chassis, railA, railB }, wheelCenter, axis }
// Points are knuckle points at the design pose. Returns (heave) → (point) → moved point.
export function knucklePose(knuckle, heave) {
  const links = knuckle.links.map((l) => ({ ...l, length: len(sub(l.point, l.chassis)) }));
  let p = [0, 0, 0, 0, 0, 0];
  const place = (params, q) => add(mulMat(rotation(params.slice(0, 3)), q), params.slice(3));
  const residual = (params) => {
    const r = [];
    for (const l of links) r.push(len(sub(place(params, l.point), l.chassis)) - l.length);
    if (knuckle.slider) {
      const a = place(params, knuckle.slider.railA), b = place(params, knuckle.slider.railB);
      const d = sub(b, a), dn = scale(d, 1 / len(d));
      const off = sub(knuckle.slider.chassis, a);
      const perp = sub(off, scale(dn, dot(off, dn)));
      r.push(perp[0], perp[1], perp[2]);
    }
    r.push(place(params, knuckle.wheelCenter)[1] - (knuckle.wheelCenter[1] + heave));
    const ax = mulMat(rotation(params.slice(0, 3)), knuckle.axis);
    r.push(ax[2] - knuckle.axis[2]);  // toe held
    return r;
  };
  for (let it = 0; it < 50; ++it) {
    const r0 = residual(p);
    if (Math.sqrt(r0.reduce((s, x) => s + x * x, 0)) < 1e-13) break;
    const J = r0.map(() => new Array(6).fill(0));
    for (let k = 0; k < 6; ++k) {
      const h = 1e-7, pp = [...p], pm = [...p];
      pp[k] += h; pm[k] -= h;
      const rp = residual(pp), rm = residual(pm);
      for (let i = 0; i < r0.length; ++i) J[i][k] = (rp[i] - rm[i]) / (2 * h);
    }
    const JtJ = [...Array(6)].map((_, a) => [...Array(6)].map((__, b) => J.reduce((s, row) => s + row[a] * row[b], 0)));
    const Jtr = [...Array(6)].map((_, a) => -J.reduce((s, row, i) => s + row[a] * r0[i], 0));
    for (let d = 0; d < 6; ++d) JtJ[d][d] += 1e-12;
    const dp = solve(JtJ, Jtr);
    p = p.map((x, k) => x + dp[k]);
  }
  const res = residual(p);
  const err = Math.sqrt(res.reduce((s, x) => s + x * x, 0));
  if (err > 1e-6) throw new Error(`knuckle pose did not converge (heave ${heave}, residual ${err})`);
  return (q) => place(p, q);
}

export { cross };

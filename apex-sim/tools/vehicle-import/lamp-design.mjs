// Rear lamp design for an imported body whose bake has no usable tail lamps (the Maybach's: a dark band and patched
// cells in the lamp recesses, relit, read as ragged red blotches). The recess itself is clean in the body, so it is
// found and closed with a new lamp:
//
//   1. scan  — rays at the lamp heights against the body's paint and trim (the bake's lamp band left out, so a ray
//              through the recess goes deep or hits nothing): straight from behind across the tailgate, then fanned
//              round the rear corner onto the quarter panel;
//   2. fit   — per ray column, the surrounding skin as a line t(y) (robust: deep samples rejected), and the recess as
//              the longest run of deep samples; its top and bottom edges smoothed along the lamp, its ends rounded;
//   3. build — the lens flush with the skin over the recess (a few millimetres proud): a dark rim, a smoked red body
//              and two LED light blades (the upper one full length, the lower one on the outer part), on a black
//              backing (the lens is a little translucent); and a bright chrome strip across the tailgate between
//              the two lamps.
//
// Everything is in the model frame (+Z forward, +X left, y up). Colours are linear (glTF vertex colours, 0–255).

/** Triangles of `parts` with the given keys whose centroid passes `keep`, as flat [ax ay az bx … cz] arrays. */
function triangles(parts, keys, keep) {
  const out = [];
  for (const p of parts) {
    if (!keys.includes(p.key)) continue;
    for (let t = 0; t < p.idx.length; t += 3) {
      const a = p.idx[t] * 3, b = p.idx[t + 1] * 3, c = p.idx[t + 2] * 3;
      const cx = (p.pos[a] + p.pos[b] + p.pos[c]) / 3, cy = (p.pos[a + 1] + p.pos[b + 1] + p.pos[c + 1]) / 3, cz = (p.pos[a + 2] + p.pos[b + 2] + p.pos[c + 2]) / 3;
      if (keep(cx, cy, cz)) out.push([p.pos[a], p.pos[a + 1], p.pos[a + 2], p.pos[b], p.pos[b + 1], p.pos[b + 2], p.pos[c], p.pos[c + 1], p.pos[c + 2]]);
    }
  }
  return out;
}

/** Nearest hit distance of the ray o + t·d (t > 0) on `tris` (Möller–Trumbore), NaN for none. */
function cast(tris, o, d) {
  let best = Infinity;
  for (const T of tris) {
    const e1x = T[3] - T[0], e1y = T[4] - T[1], e1z = T[5] - T[2];
    const e2x = T[6] - T[0], e2y = T[7] - T[1], e2z = T[8] - T[2];
    const hx = d[1] * e2z - d[2] * e2y, hy = d[2] * e2x - d[0] * e2z, hz = d[0] * e2y - d[1] * e2x;
    const a = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(a) < 1e-12) continue;
    const f = 1 / a;
    const sx = o[0] - T[0], sy = o[1] - T[1], sz = o[2] - T[2];
    const u = f * (sx * hx + sy * hy + sz * hz);
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = f * (d[0] * qx + d[1] * qy + d[2] * qz);
    if (v < 0 || u + v > 1) continue;
    const t = f * (e2x * qx + e2y * qy + e2z * qz);
    if (t > 1e-6 && t < best) best = t;
  }
  return best === Infinity ? NaN : best;
}

/** Least-squares line t = a + b·y through the samples, refitted without the ones lying deeper than `tol`. */
function skinLine(ys, ts, tol = 0.006) {
  let pts = ys.map((y, i) => [y, ts[i]]).filter(([, t]) => Number.isFinite(t));
  let a = NaN, b = 0;
  for (let it = 0; it < 5 && pts.length >= 6; it++) {
    const n = pts.length, sy = pts.reduce((s, p) => s + p[0], 0), st = pts.reduce((s, p) => s + p[1], 0);
    const syy = pts.reduce((s, p) => s + p[0] * p[0], 0), syt = pts.reduce((s, p) => s + p[0] * p[1], 0);
    const den = n * syy - sy * sy;
    b = Math.abs(den) > 1e-12 ? (n * syt - sy * st) / den : 0;
    a = (st - b * sy) / n;
    const keep = pts.filter(([y, t]) => t - (a + b * y) < tol);
    if (keep.length === pts.length) break;
    pts = keep;
  }
  return { a, b };
}

const median = (arr, i, r) => {
  const w = arr.slice(Math.max(0, i - r), i + r + 1).filter(Number.isFinite).sort((x, y) => x - y);
  return w.length ? w[w.length >> 1] : arr[i];
};
const mean = (arr, i, r) => {
  const w = arr.slice(Math.max(0, i - r), i + r + 1).filter(Number.isFinite);
  return w.length ? w.reduce((s, x) => s + x, 0) / w.length : arr[i];
};
const smooth = (arr, r1, r2) => {
  const m = arr.map((_, i) => median(arr, i, r1));
  return m.map((_, i) => mean(m, i, r2));
};

/** A grid mesh part (rows × cols vertices, `at(i, j)` → { p, c }), normals facing `toward(i, j)`. */
function gridPart(key, rows, cols, at, toward) {
  const n = rows * cols;
  const pos = new Float64Array(n * 3), nor = new Float64Array(n * 3), col = new Uint8Array(n * 3);
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const { p, c } = at(i, j), k = (i * cols + j) * 3;
    pos.set(p, k);
    for (let a = 0; a < 3; a++) col[k + a] = Math.max(0, Math.min(255, Math.round(c[a])));
  }
  const idx = [];
  for (let i = 0; i + 1 < rows; i++) for (let j = 0; j + 1 < cols; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // Area-weighted vertex normals, turned to face the viewer side.
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { nor[v] += nx; nor[v + 1] += ny; nor[v + 2] += nz; }
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const k = (i * cols + j) * 3, w = toward(i, j);
    let nx = nor[k], ny = nor[k + 1], nz = nor[k + 2];
    const l = Math.hypot(nx, ny, nz) || 1;
    const s = nx * w[0] + ny * w[1] + nz * w[2] < 0 ? -1 : 1;
    nor[k] = (s * nx) / l; nor[k + 1] = (s * ny) / l; nor[k + 2] = (s * nz) / l;
  }
  return { key, n, pos, nor, col, idx: Uint32Array.from(idx) };
}

/**
 * Designs both tail lamps (and the strip between them). `parts`: the body's role parts (paint and trim are the skin);
 * `spec`: the car's `rearLamps`. Returns the new parts (lamp lenses, chrome strip) and a summary for the log.
 */
export function designRearLamps(parts, spec) {
  let zmin = Infinity;
  for (const p of parts) for (let i = 2; i < p.pos.length; i += 3) zmin = Math.min(zmin, p.pos[i]);
  const { x0, cx, cz, y: [y0, y1], step = 0.004 } = spec.scan;
  const ys = [];
  for (let y = y0; y <= y1 + 1e-9; y += step) ys.push(y);
  const lift = spec.lift ?? 0.0025, margin = spec.margin ?? 0.003;
  const out = [];
  const lamps = [];
  for (const side of [1, -1]) {
    const near = (x, y, z) => z < zmin + 1.0 && y > y0 - 0.15 && y < y1 + 0.15 && x * side > 0.1;
    const skin = triangles(parts, ['paint', 'trim'], near);
    // The bake's old lamp band (`well`): left out of the skin, but the lens must stay in front of it.
    const well = triangles(parts, [spec.well ?? 'lampwell'], near);
    // Ray columns: parallel across the tailgate, then fanned about the corner centre; every ray starts 0.9 m out
    // from the centre's line, so the distances along neighbouring columns compare (they are smoothed together).
    const columns = [];
    const C = [side * cx, 0, zmin + cz];
    for (let x = x0; x < cx - 1e-9; x += 0.01) columns.push({ o: [side * x, 0, C[2] - 0.9], d: [0, 0, 1] });
    for (let deg = 0; deg <= (spec.scan.maxDeg ?? 88); deg += 1) {
      const th = (deg * Math.PI) / 180, out3 = [side * Math.sin(th), 0, -Math.cos(th)];
      columns.push({ o: [C[0] + out3[0] * 0.9, 0, C[2] + out3[2] * 0.9], d: [-out3[0], 0, -out3[2]] });
    }
    for (const c of columns) {
      c.t = ys.map((y) => cast(skin, [c.o[0], y, c.o[2]], c.d));
      Object.assign(c, skinLine(ys, c.t));
      // The recess: the longest run of rows with no skin or skin more than 1 cm behind the line.
      let best = null, run = null;
      ys.forEach((y, i) => {
        const deep = !Number.isFinite(c.t[i]) || c.t[i] - (c.a + c.b * y) > 0.01;
        if (deep) {
          run = run ?? { i0: i, i1: i };
          run.i1 = i;
          if (!best || run.i1 - run.i0 > best.i1 - best.i0) best = { ...run };
        } else run = null;
      });
      c.open = best && Number.isFinite(c.a) && best.i1 - best.i0 >= 4 && best.i0 > 0 && best.i1 < ys.length - 1
        ? { bot: ys[best.i0] - step / 2, top: ys[best.i1] + step / 2 } : null;
      // How far the old band stands proud of the lens in the recess (the lens moves out by as much).
      c.push = 0;
      if (c.open) ys.forEach((y, i) => {
        if (y < c.open.bot - 0.006 || y > c.open.top + 0.006) return;
        const w = cast(well, [c.o[0], y, c.o[2]], c.d);
        if (Number.isFinite(w)) c.push = Math.max(c.push, c.a + c.b * y - lift - (w - 0.0015));
      });
      c.push = Math.min(c.push, 0.012);
    }
    // The lamp: the longest stretch of columns with a recess.
    let J0 = -1, J1 = -1;
    for (let j = 0, s = -1; j <= columns.length; j++) {
      if (j < columns.length && columns[j].open) { if (s < 0) s = j; continue; }
      if (s >= 0 && j - 1 - s > J1 - J0) { J0 = s; J1 = j - 1; }
      s = -1;
    }
    if (J0 < 0) throw new Error('designRearLamps: no lamp recess found');
    const cs = columns.slice(J0, J1 + 1);
    const top = smooth(cs.map((c) => c.open.top), 3, 3), bot = smooth(cs.map((c) => c.open.bot), 3, 3);
    const B = smooth(cs.map((c) => c.b), 1, 2);
    const pushes = cs.map((c) => c.push), wide = pushes.map((_, j) => Math.max(...pushes.slice(Math.max(0, j - 2), j + 3)));
    const A = smooth(cs.map((c) => c.a), 1, 2).map((a, j) => a - mean(wide, j, 2));
    const point = (j, y, back = 0) => {
      const c = cs[j], t = A[j] + B[j] * y - lift + back;
      return [c.o[0] + c.d[0] * t, y, c.o[2] + c.d[2] * t];
    };
    // Arc length along the lamp at mid-height, for the rounded ends and the blades.
    const s = [0];
    for (let j = 1; j < cs.length; j++) {
      const ym = (top[j] + bot[j]) / 2, p = point(j, ym), q = point(j - 1, ym);
      s.push(s[j - 1] + Math.hypot(p[0] - q[0], p[2] - q[2]));
    }
    const L = s[s.length - 1];
    // Rounded ends: within `rc` of an end the edges pull in on a quarter circle.
    const rc = spec.cornerRadius ?? 0.022;
    const pull = (j) => {
      const e = Math.min(s[j], L - s[j]) + 0.004;
      return e >= rc ? 0 : rc - Math.sqrt(Math.max(0, rc * rc - (rc - e) ** 2));
    };
    // Rows across the lamp (0 bottom … 1 top), doubled at the colour edges so they stay crisp.
    const V = spec.rows ?? [0, 0.045, 0.06, 0.2, 0.22, 0.34, 0.36, 0.5, 0.64, 0.66, 0.8, 0.82, 0.94, 0.955, 1];
    const blade = (lo, hi, v) => v > lo + 1e-6 && v < hi - 1e-6;
    const colourAt = (v, w, sj) => {
      const C = spec.colours;
      if (v < 0.05 || v > 0.95) return C.rim;
      const endFade = Math.min(1, Math.min(sj, L - sj) / 0.03);
      const [ulo, uhi] = spec.upperBlade, [llo, lhi] = spec.lowerBlade;
      if (blade(ulo, uhi, v) && endFade > 0.5) return C.blade;
      if (blade(llo, lhi, v) && w > spec.lowerFrom && endFade > 0.5) return C.blade;
      // Smoked lens, a touch lighter toward the top (the housing's reflector behind it).
      return C.lens.map((x, k) => x * (0.8 + 0.4 * v) + (k === 0 ? 6 * (1 - v) : 0));
    };
    const toward = (j) => [-cs[j].d[0], 0, -cs[j].d[2]];
    const yAt = (i, j) => {
      const pin = pull(j), b = bot[j] - margin + pin, t = top[j] + margin - pin;
      return b + V[i] * Math.max(0, t - b);
    };
    out.push(gridPart('lamp', V.length, cs.length, (i, j) => ({ p: point(j, yAt(i, j)), c: colourAt(V[i], s[j] / L, s[j]) }), (i, j) => toward(j)));
    // A black backing just behind the lens: the lens is a little translucent, and the body behind it must not show.
    out.push(gridPart('trim', V.length, cs.length, (i, j) => ({ p: point(j, yAt(i, j), 0.0015), c: [3, 3, 3] }), (i, j) => toward(j)));
    lamps.push({ side, inner: point(0, (top[0] + bot[0]) / 2), top: top[0], bot: bot[0], length: L, height: [Math.min(...top.map((t, j) => t - bot[j])), Math.max(...top.map((t, j) => t - bot[j]))] });
  }
  // Chrome strip across the tailgate between the lamps' inner ends, on the skin (straight from behind).
  if (spec.strip) {
    const L = lamps.find((l) => l.side === 1), R = lamps.find((l) => l.side === -1);
    const xa = Math.min(L.inner[0], -R.inner[0]) - 0.006;
    const yb = (L.bot + R.bot) / 2, h = ((L.top - L.bot) + (R.top - R.bot)) / 2;
    const yc = yb + h * spec.strip.at, half = spec.strip.height / 2;
    const skin = triangles(parts, ['paint', 'trim'], (x, y, z) => z < zmin + 0.6 && Math.abs(y - yc) < 0.1 && Math.abs(x) < xa + 0.1);
    const rowsY = [yc - half, yc - half * 0.4, yc + half * 0.3, yc + half];
    const xs = [];
    for (let x = -xa; x <= xa + 1e-9; x += 0.01) xs.push(x);
    xs[xs.length - 1] = xa;
    const hits = rowsY.map((y) => xs.map((x) => cast(skin, [x, y, zmin - 0.4], [0, 0, 1])));
    // A missed ray (a seam in the skin) takes its neighbours' distance; many misses mean the strip is off the tailgate.
    const missed = hits.flat().filter((t) => !Number.isFinite(t)).length;
    if (missed > hits.flat().length * 0.05) throw new Error(`designRearLamps: the strip leaves the tailgate (${missed} rays missed)`);
    for (const row of hits) row.forEach((t, j) => {
      if (Number.isFinite(t)) return;
      let a = j - 1, b = j + 1;
      while (a >= 0 && !Number.isFinite(row[a])) a--;
      while (b < row.length && !Number.isFinite(row[b])) b++;
      row[j] = a < 0 ? row[b] : b >= row.length ? row[a] : row[a] + ((row[b] - row[a]) * (j - a)) / (b - a);
    });
    out.push(gridPart('brightwork', rowsY.length, xs.length, (i, j) => ({
      p: [xs[j], rowsY[i], zmin - 0.4 + hits[i][j] - (spec.strip.lift ?? 0.004)],
      c: spec.colours.strip,
    }), () => [0, 0, -1]));
    lamps.push({ strip: { y: [rowsY[0], rowsY[3]], x: [-xa, xa] } });
  }
  return { parts: out, lamps };
}

/**
 * Rear window (the Maybach's: the bake lost it, and the cells patched into the opening and the bake's own fragments
 * shade as a blocky mosaic). Rays straight from behind against the skin (paint, trim, lamps, chrome; the old panes
 * left out) find the opening — rows that hit nothing or only the cabin deep inside (more than `deepZ` forward of the
 * tail) — and each column's exterior just below and above it (tailgate top, spoiler). One pane spans them, straight
 * between the two in each column, a few millimetres proud (and in front of any old fragment), its corners rounded.
 */
export function designRearWindow(parts, spec) {
  let zmin = Infinity;
  for (const p of parts) for (let i = 2; i < p.pos.length; i += 3) zmin = Math.min(zmin, p.pos[i]);
  const { x: [x0, x1], y: [y0, y1], step = 0.004, deepZ = 0.6, lift = 0.003, margin = 0.004, cornerRadius = 0.05 } = spec;
  const near = (x, y, z) => z < zmin + 1.4 && y > y0 - 0.1 && y < y1 + 0.1 && x > x0 - 0.1 && x < x1 + 0.1;
  const skin = triangles(parts, ['paint', 'trim', 'lamp', 'brightwork'], near);
  const old = triangles(parts, ['tint', 'glass'], near);
  const oz = zmin - 0.4, d = [0, 0, 1];
  const ys = [];
  for (let y = y0; y <= y1 + 1e-9; y += step) ys.push(y);
  const cols = [];
  for (let x = x0; x <= x1 + 1e-9; x += 0.01) {
    const t = ys.map((y) => cast(skin, [x, y, oz], d));
    const open = t.map((v) => !Number.isFinite(v) || oz + v > zmin + deepZ);
    // The longest run of open rows; its edges and the exterior just below and above it. A run reaching the scan's
    // edge (the spoiler has a gap over the middle) takes that edge from its neighbours.
    let best = null;
    for (let i = 0; i < ys.length; ) {
      if (!open[i]) { i++; continue; }
      let j = i;
      while (j + 1 < ys.length && open[j + 1]) j++;
      if (!best || j - i > best.i1 - best.i0) best = { i0: i, i1: j };
      i = j + 1;
    }
    // (Below the window there is always the tailgate: a run open at the bottom is beside the car, not a window.)
    if (!best || best.i1 - best.i0 < 10 || best.i0 === 0) { cols.push({ x, open: false }); continue; }
    const lowOk = true, highOk = best.i1 < ys.length - 1;
    cols.push({
      x, open: true,
      bot: lowOk ? ys[best.i0] - step / 2 : NaN, top: highOk ? ys[best.i1] + step / 2 : NaN,
      tb: lowOk ? t[best.i0 - 1] : NaN, tt: highOk ? t[best.i1 + 1] : NaN,
    });
  }
  // Fill the gaps (NaN) of a column series by linear interpolation between its neighbours.
  const fill = (arr) => arr.map((v, j) => {
    if (Number.isFinite(v)) return v;
    let a = j - 1, b = j + 1;
    while (a >= 0 && !Number.isFinite(arr[a])) a--;
    while (b < arr.length && !Number.isFinite(arr[b])) b++;
    if (a < 0) return arr[b];
    if (b >= arr.length) return arr[a];
    return arr[a] + ((arr[b] - arr[a]) * (j - a)) / (b - a);
  });
  // The window: the longest stretch of columns with an opening.
  let J0 = -1, J1 = -1;
  for (let j = 0, s = -1; j <= cols.length; j++) {
    if (j < cols.length && cols[j].open) { if (s < 0) s = j; continue; }
    if (s >= 0 && j - 1 - s > J1 - J0) { J0 = s; J1 = j - 1; }
    s = -1;
  }
  if (J0 < 0) throw new Error('designRearWindow: no opening found');
  const cs = cols.slice(J0, J1 + 1);
  const bot = smooth(fill(cs.map((c) => c.bot)), 3, 4), top = smooth(fill(cs.map((c) => c.top)), 3, 4);
  const tb = smooth(fill(cs.map((c) => c.tb)), 2, 3), tt = smooth(fill(cs.map((c) => c.tt)), 2, 3);
  const depth = (j, y) => tb[j] + ((tt[j] - tb[j]) * (y - bot[j])) / Math.max(1e-6, top[j] - bot[j]);
  // Old fragments standing proud of the pane push it out (smoothly, along the window).
  const push = cs.map((c, j) => {
    let p = 0;
    for (let y = bot[j]; y <= top[j]; y += 0.01) {
      const w = cast(old, [c.x, y, oz], d);
      if (Number.isFinite(w)) p = Math.max(p, depth(j, y) - lift - (w - 0.0015));
    }
    return Math.min(p, 0.012);
  });
  const wide = push.map((_, j) => Math.max(...push.slice(Math.max(0, j - 3), j + 4)));
  const shift = wide.map((_, j) => mean(wide, j, 3));
  const L = cs[cs.length - 1].x - cs[0].x, rc = cornerRadius;
  const pull = (j) => {
    const e = Math.min(cs[j].x - cs[0].x, cs[cs.length - 1].x - cs[j].x) + 0.005;
    return e >= rc ? 0 : rc - Math.sqrt(Math.max(0, rc * rc - (rc - e) ** 2));
  };
  const V = 14;
  const part = gridPart('tint', V + 1, cs.length, (i, j) => {
    const pin = pull(j), b = bot[j] - margin + pin, t = top[j] + margin - pin;
    const y = b + ((t - b) * i) / V;
    return { p: [cs[j].x, y, oz + depth(j, y) - lift - shift[j]], c: [0, 0, 0] };
  }, () => [0, 0, -1]);
  return { parts: [part], window: { x: [cs[0].x, cs[cs.length - 1].x], width: L, height: [Math.min(...top.map((t, j) => t - bot[j])), Math.max(...top.map((t, j) => t - bot[j]))], pushed: Math.max(...shift) } };
}

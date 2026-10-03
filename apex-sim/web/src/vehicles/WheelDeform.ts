// Wheel and tyre deformation (§6 bent rims, crushed tyres; §1.2 what is seen is the physics): the physics wheel is a
// ring of tread nodes and a ring of rim nodes on each side (core addPressureWheel: per segment tread A (−axis),
// tread B (+axis), rim A, rim B). Every frame each ring is resampled into WHEEL_BINS angular bins around the hub —
// its nodes' distance from the axis over the rest distance, and their axial offset — and the wheel's meshes are
// bent by them in the vertex stage: a vertex between rim and tread radius follows the two rings' profiles at its
// angle, one inside the rim scales toward the hub (spokes bend with the rim), and its side (±axis) picks between
// the A and B rings. A kerb-bent rim, a tyre crushed in a crash or a flat one then look the way the nodes are.
import * as THREE from 'three/webgpu';
import { atan, clamp, float, floor, fract, int, length, mix, positionLocal, select, uniform, uniformArray, vec2, vec3, vec4 } from 'three/tsl';

export const WHEEL_BINS = 32;
const TWO_PI = Math.PI * 2;

type V3 = [number, number, number];
type Vec4Node = ReturnType<typeof vec4>;
type Vec3Node = ReturnType<typeof vec3>;

/** Rest geometry of one physics wheel (vehicle JSON pressureWheels entry). */
export interface WheelRest {
  segments: number;
  tyreRadius: number;
  rimRadius: number;
  treadWidth: number;
  rimWidth: number;
  treadNodeRadius: number;
}

/** A ring's nodes seen from the hub: angle about the axis (mount frame, 0 = up, +π/2 = forward), radial distance
 *  and axial position. */
export interface RingSample {
  angle: number;
  radius: number;
  axial: number;
}

/**
 * Resamples a ring into `bins` angular bins (bin m at 2π·m/bins): radius / restRadius and axial − restAxial,
 * interpolated between the two nodes around each bin's angle. Missing or degenerate rings give the rest profile.
 */
export function ringProfile(samples: RingSample[], restRadius: number, restAxial: number, bins = WHEEL_BINS): { ratio: number[]; offset: number[] } {
  const ratio = new Array<number>(bins).fill(1), offset = new Array<number>(bins).fill(0);
  if (samples.length < 3 || restRadius <= 0) return { ratio, offset };
  const s = samples.map((x) => ({ ...x, angle: ((x.angle % TWO_PI) + TWO_PI) % TWO_PI })).sort((a, b) => a.angle - b.angle);
  const n = s.length;
  let k = 0; // s[k - 1].angle ≤ target < s[k].angle (cyclic)
  for (let m = 0; m < bins; m++) {
    const target = (TWO_PI * m) / bins;
    while (k < n && s[k].angle <= target) k++;
    const a = s[(k - 1 + n) % n], b = s[k % n];
    let span = b.angle - a.angle;
    if (span <= 0) span += TWO_PI;
    let t = target - a.angle;
    if (t < 0) t += TWO_PI;
    const f = span > 1e-6 ? Math.min(1, Math.max(0, t / span)) : 0;
    ratio[m] = (a.radius + (b.radius - a.radius) * f) / restRadius;
    offset[m] = a.axial + (b.axial - a.axial) * f - restAxial;
  }
  return { ratio, offset };
}

/** Per-wheel deformation state and its vertex-stage nodes. */
export class WheelDeform {
  // Bin m: (tread A, tread B, rim A, rim B) radius ratio, and their axial offsets [m].
  readonly ratio: THREE.Vector4[] = Array.from({ length: WHEEL_BINS }, () => new THREE.Vector4(1, 1, 1, 1));
  readonly offset: THREE.Vector4[] = Array.from({ length: WHEEL_BINS }, () => new THREE.Vector4(0, 0, 0, 0));
  private readonly ratioArr = uniformArray(this.ratio, 'vec4');
  private readonly offsetArr = uniformArray(this.offset, 'vec4');
  readonly spin = uniform(0);        // the spinning meshes' angle about the axis [rad]
  readonly mirror = uniform(1);      // −1: the mesh is the other side's, mirrored (local +x = −axis)
  private readonly tyreR = uniform(0.33);
  private readonly rimR = uniform(0.25);
  private readonly halfWidth = uniform(0.1);
  active = false;

  constructor(rest?: Partial<WheelRest>) {
    if (rest) this.setRest(rest);
  }

  setRest(rest: Partial<WheelRest>): void {
    if (rest.tyreRadius) this.tyreR.value = rest.tyreRadius;
    if (rest.rimRadius) this.rimR.value = rest.rimRadius;
    if (rest.treadWidth) this.halfWidth.value = rest.treadWidth / 2;
  }

  /** Deformed local position of `p` (the mesh's local frame: x = axle, y/z the wheel plane; `spinning`: the mesh
   *  turns with the wheel, so its angle in the hub frame is its own plus `spin`). */
  position(p: Vec3Node = positionLocal as unknown as Vec3Node, spinning = false): Vec3Node {
    const rho = length(vec2(p.y, p.z));
    const angle = atan(p.z, p.y).add(spinning ? this.spin : float(0));
    const t = fract(angle.div(TWO_PI)).mul(WHEEL_BINS);
    const i0 = int(floor(t)), f = fract(t);
    const i1 = i0.add(1).mod(WHEEL_BINS);
    const r = mix(this.ratioArr.element(i0) as unknown as Vec4Node, this.ratioArr.element(i1) as unknown as Vec4Node, f);
    const o = mix(this.offsetArr.element(i0) as unknown as Vec4Node, this.offsetArr.element(i1) as unknown as Vec4Node, f);
    // Side: 0 at the A rings (−axis), 1 at the B rings (+axis); the mesh's local x is the axle times `mirror`.
    const side = clamp(p.x.mul(this.mirror).div(this.halfWidth.mul(2)).add(0.5), 0, 1);
    const treadRatio = mix(r.x, r.y, side), rimRatio = mix(r.z, r.w, side);
    const treadOffset = mix(o.x, o.y, side), rimOffset = mix(o.z, o.w, side);
    const u = clamp(rho.sub(this.rimR).div(this.tyreR.sub(this.rimR)), 0, 1);
    const inside = rho.lessThan(this.rimR);
    const hub = clamp(rho.div(this.rimR), 0, 1);
    const k = select(inside, mix(float(1), rimRatio, hub), mix(rimRatio, treadRatio, u));
    const dx = select(inside, rimOffset.mul(hub), mix(rimOffset, treadOffset, u));
    return vec3(p.x.add(dx.mul(this.mirror)), p.y.mul(k), p.z.mul(k));
  }

  /** Sets the profiles from the four rings' samples (tread A, tread B, rim A, rim B) and the rest geometry. */
  setRings(rings: [RingSample[], RingSample[], RingSample[], RingSample[]], rest: WheelRest): void {
    const treadR = rest.tyreRadius - rest.treadNodeRadius;
    const profiles = [
      ringProfile(rings[0], treadR, -rest.treadWidth / 2), ringProfile(rings[1], treadR, rest.treadWidth / 2),
      ringProfile(rings[2], rest.rimRadius, -rest.rimWidth / 2), ringProfile(rings[3], rest.rimRadius, rest.rimWidth / 2),
    ];
    // The mesh's tread is the tyre's outer surface: its radial change is the tread nodes' (their centres sit one
    // node radius inside it).
    for (let m = 0; m < WHEEL_BINS; m++) {
      const tread = (p: { ratio: number[] }) => (treadR * p.ratio[m] + rest.treadNodeRadius) / rest.tyreRadius;
      this.ratio[m].set(tread(profiles[0]), tread(profiles[1]), profiles[2].ratio[m], profiles[3].ratio[m]);
      this.offset[m].set(profiles[0].offset[m], profiles[1].offset[m], profiles[2].offset[m], profiles[3].offset[m]);
    }
    this.active = true;
  }

  reset(): void {
    for (let m = 0; m < WHEEL_BINS; m++) {
      this.ratio[m].set(1, 1, 1, 1);
      this.offset[m].set(0, 0, 0, 0);
    }
    this.active = false;
  }
}

/** Samples a ring in the hub frame: centre `c`, unit axle `axis` (points left), `up` and `fwd` span the wheel plane. */
export function sampleRing(points: V3[], c: V3, axis: V3, up: V3, fwd: V3): RingSample[] {
  return points.map((p) => {
    const d: V3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    const axial = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
    const r: V3 = [d[0] - axis[0] * axial, d[1] - axis[1] * axial, d[2] - axis[2] * axial];
    const y = r[0] * up[0] + r[1] * up[1] + r[2] * up[2], z = r[0] * fwd[0] + r[1] * fwd[1] + r[2] * fwd[2];
    return { angle: Math.atan2(z, y), radius: Math.hypot(y, z), axial };
  });
}

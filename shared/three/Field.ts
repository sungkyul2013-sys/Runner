import * as THREE from 'three';
import {
  DEFAULT_BRAND,
  SHAPE_POSE,
  buildShape,
  scatterPoints,
  type Brand,
  type ShapeName,
} from './shapes';

/**
 * The hero object: a cloud of glowing points that morphs between shapes.
 *
 * Morphing happens entirely on the GPU — every point carries its start
 * (`position`) and destination (`aTo`) plus a per-point seed that staggers the
 * flight so the cloud unravels and re-forms instead of sliding as one block.
 * When a new shape is requested mid-flight we snapshot the *exact* current
 * positions on the CPU (same formula as the shader, minus the time-based
 * drift, which stays continuous) so an interrupted morph never pops.
 */

const STAGGER = 0.55;
const BULGE = 0.85;

const VERT = /* glsl */ `
  attribute vec3 aTo;
  attribute vec3 aRnd;
  attribute float aSeed;

  uniform float uProgress;
  uniform float uTime;
  uniform float uSize;
  uniform float uDpr;
  uniform float uStagger;
  uniform float uBulge;
  uniform float uTurb;

  varying vec3 vColor;
  varying float vFade;

  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;

  void main() {
    // Staggered, eased per-point progress.
    float p = clamp((uProgress * (1.0 + uStagger) - aSeed * uStagger), 0.0, 1.0);
    p = p * p * (3.0 - 2.0 * p);

    vec3 pos = mix(position, aTo, p);

    // Push outward at the midpoint so points arc rather than slide.
    float arc = sin(p * 3.141592);
    pos += normalize(pos + vec3(0.0001)) * arc * uBulge * (0.35 + aRnd.x);

    // Never-still idle drift.
    pos.x += sin(uTime * 0.42 + aRnd.y * 6.2831) * 0.055;
    pos.y += cos(uTime * 0.37 + aRnd.z * 6.2831) * 0.055;
    pos.z += sin(uTime * 0.31 + aRnd.x * 6.2831) * 0.055;

    // Scroll shakes the ink loose: the faster the page moves, the more the
    // cloud unsettles, then it re-forms as soon as you stop.
    pos += vec3(
      sin(uTime * 2.3 + aRnd.x * 24.0),
      cos(uTime * 1.9 + aRnd.y * 24.0),
      sin(uTime * 1.5 + aRnd.z * 24.0)
    ) * uTurb * (0.35 + aRnd.z);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float dist = -mv.z;
    gl_PointSize = uSize * uDpr * (0.55 + aRnd.z) * (14.0 / max(dist, 0.6));

    // Colour by seed, with a warm minority for sparkle.
    vec3 base = mix(uColorA, uColorB, aSeed);
    base = mix(base, uColorC, step(0.93, aRnd.y) * 0.85);
    vColor = base;

    // Fade the far side out, and twinkle gently.
    float depthFade = smoothstep(24.0, 6.0, dist);
    float twinkle = 0.72 + 0.28 * sin(uTime * 1.7 + aSeed * 42.0);
    vFade = depthFade * twinkle * (0.55 + arc * 0.45) * (1.0 + uTurb * 1.4);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;

  uniform float uOpacity;
  uniform float uCore;
  varying vec3 vColor;
  varying float vFade;

  void main() {
    // Soft round sprite — cheaper and crisper than a texture lookup.
    float d = length(gl_PointCoord - vec2(0.5));
    float a = smoothstep(0.5, 0.05, d);
    if (a < 0.01) discard;

    // The hot centre only makes sense where points add light; on paper it
    // would just wash the ink out, so it is switched off with uCore.
    float core = smoothstep(0.28, 0.0, d) * 0.5 * uCore;
    gl_FragColor = vec4(vColor + core, a * vFade * uOpacity);
  }
`;

export class Field {
  readonly object: THREE.Points;

  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly count: number;
  private readonly cache = new Map<ShapeName, Float32Array>();
  private readonly brand: Brand;

  private progress = 1;
  private morphing = false;
  private current: ShapeName;
  private queued: ShapeName | null = null;

  /** Scroll position when the current shape took over, and the latest seen. */
  private anchor = 0;
  private scroll = 0;
  private targetOpacity = 1;
  private fit = 1;

  /** Pose the field lerps toward (set per shape, nudged by scroll/pointer). */
  private targetPose = { scale: 1, rx: 0, ry: 0 };
  private pose = { scale: 1, rx: 0, ry: 0 };

  constructor(count: number, initial: ShapeName, brand: Brand = DEFAULT_BRAND) {
    this.count = count;
    this.current = initial;
    this.brand = brand;

    const from = this.shape(initial);
    const seeds = new Float32Array(count);
    const rnd = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      seeds[i] = Math.random();
      rnd[i * 3] = Math.random();
      rnd[i * 3 + 1] = Math.random();
      rnd[i * 3 + 2] = Math.random();
    }

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(from.slice(), 3));
    this.geo.setAttribute('aTo', new THREE.BufferAttribute(from.slice(), 3));
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 3));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uProgress: { value: 1 },
        uTime: { value: 0 },
        uSize: { value: 4.2 },
        uDpr: { value: 1 },
        uStagger: { value: STAGGER },
        uBulge: { value: BULGE },
        uTurb: { value: 0 },
        uOpacity: { value: 1 },
        uCore: { value: 1 },
        // Ink on paper, with the correction pen showing through in a small
        // minority of points — the same three colours the page uses.
        uColorA: { value: new THREE.Color('#e6e3da') },
        uColorB: { value: new THREE.Color('#5aa9ff') },
        uColorC: { value: new THREE.Color('#ff4d3d') },
      },
    });

    this.object = new THREE.Points(this.geo, this.mat);
    this.object.frustumCulled = false;

    const pose = SHAPE_POSE[initial];
    this.pose = { ...pose };
    this.targetPose = { ...pose };
    this.applyPose();
  }

  private shape(name: ShapeName): Float32Array {
    let pts = this.cache.get(name);
    if (!pts) {
      pts = buildShape(name, this.count, this.brand);
      this.cache.set(name, pts);
    }
    return pts;
  }

  get shapeName(): ShapeName {
    return this.current;
  }

  /** Morph to `name`. Safe to call at any time, including mid-morph. */
  morphTo(name: ShapeName): void {
    // Never restart a flight to the shape already in hand. Sections assert
    // their shape every frame, and re-entering here at progress ≥ 0.9 used
    // to relaunch the same morph forever — the cloud never landed, so most
    // points sat out in the scatter shell where the depth fade hides them.
    if (name === this.current) return;
    if (this.morphing && this.progress < 0.9) {
      // Let the current flight land first; remember the newest request.
      this.queued = name === this.current ? null : name;
      return;
    }

    const posAttr = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const toAttr = this.geo.getAttribute('aTo') as THREE.BufferAttribute;
    const seeds = (this.geo.getAttribute('aSeed') as THREE.BufferAttribute).array as Float32Array;
    const rnd = (this.geo.getAttribute('aRnd') as THREE.BufferAttribute).array as Float32Array;

    const from = posAttr.array as Float32Array;
    const to = toAttr.array as Float32Array;
    const g = this.progress;

    // Freeze the live silhouette into `position` (shader formula, sans drift).
    for (let i = 0; i < this.count; i += 1) {
      let p = Math.min(1, Math.max(0, g * (1 + STAGGER) - seeds[i] * STAGGER));
      p = p * p * (3 - 2 * p);

      const i3 = i * 3;
      const x = from[i3] + (to[i3] - from[i3]) * p;
      const y = from[i3 + 1] + (to[i3 + 1] - from[i3 + 1]) * p;
      const z = from[i3 + 2] + (to[i3 + 2] - from[i3 + 2]) * p;

      const arc = Math.sin(p * Math.PI) * BULGE * (0.35 + rnd[i3]);
      const len = Math.hypot(x + 0.0001, y + 0.0001, z + 0.0001) || 1;

      from[i3] = x + ((x + 0.0001) / len) * arc;
      from[i3 + 1] = y + ((y + 0.0001) / len) * arc;
      from[i3 + 2] = z + ((z + 0.0001) / len) * arc;
    }

    toAttr.array.set(this.shape(name));
    posAttr.needsUpdate = true;
    toAttr.needsUpdate = true;

    this.current = name;
    this.progress = 0;
    this.morphing = true;
    this.queued = null;
    // Each shape starts from its intended pose and only turns as you scroll
    // through its own chapter — otherwise the flat forms (the glyph, the
    // manuscript grid) end up edge-on and read as a smear.
    this.anchor = this.scroll;

    const pose = SHAPE_POSE[name];
    this.targetPose = { ...pose };
  }

  /** Scroll-driven turn + pointer parallax, both in normalised units. */
  setDrive(scroll: number, px: number, py: number): void {
    this.scroll = scroll;
    const pose = SHAPE_POSE[this.current];
    const local = scroll - this.anchor;
    const spin = pose.spin ?? 1;

    this.targetPose.rx = pose.rx + py * 0.22 + local * 0.6 * spin;
    this.targetPose.ry = pose.ry + local * 4.2 * spin + px * 0.34 * spin;
    this.targetPose.scale = pose.scale * (pose.wide ? this.fit : 1);
  }

  /**
   * Ink for paper, light for ink.
   *
   * Additive white points are the right answer on a dark page and the wrong
   * one on a light page — they add light to something already near white and
   * disappear. On paper the field switches to normal blending and dark ink,
   * so the wordmark reads as writing rather than as glare.
   */
  setInk(dark: boolean): void {
    const u = this.mat.uniforms;
    u.uColorA.value.set(dark ? '#e6e3da' : '#232733');
    u.uColorB.value.set(dark ? '#5aa9ff' : '#2f6ad0');
    u.uColorC.value.set(dark ? '#ff4d3d' : '#d8382a');

    u.uCore.value = dark ? 1 : 0;
    this.mat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.mat.needsUpdate = true;
  }

  /** Extra scale for shapes too wide for a narrow viewport. */
  setFit(v: number): void {
    this.fit = v;
    const pose = SHAPE_POSE[this.current];
    this.targetPose.scale = pose.scale * (pose.wide ? v : 1);
  }

  private applyPose(): void {
    this.object.rotation.set(this.pose.rx, this.pose.ry, 0);
    this.object.scale.setScalar(this.pose.scale);
  }

  /** Eased: the field brightens into a wordmark rather than snapping to it. */
  setOpacity(v: number): void {
    this.targetOpacity = v;
  }

  /** Sets the level with no transition — used once, at construction. */
  setOpacityNow(v: number): void {
    this.targetOpacity = v;
    this.mat.uniforms.uOpacity.value = v;
  }

  /** 0 = settled, ~1 = shaken loose. Driven by scroll speed. */
  setTurbulence(v: number): void {
    const u = this.mat.uniforms.uTurb;
    u.value += (v - u.value) * 0.12;
  }

  /**
   * First paint: drop the current silhouette far out into a shell and let it
   * fly in, so the page assembles itself instead of appearing finished.
   */
  intro(): void {
    const posAttr = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const toAttr = this.geo.getAttribute('aTo') as THREE.BufferAttribute;

    (posAttr.array as Float32Array).set(scatterPoints(this.count));
    toAttr.array.set(this.shape(this.current));
    posAttr.needsUpdate = true;
    toAttr.needsUpdate = true;

    this.progress = 0;
    this.morphing = true;
  }

  setDpr(dpr: number): void {
    this.mat.uniforms.uDpr.value = dpr;
  }

  update(dt: number, time: number): void {
    if (this.morphing) {
      this.progress = Math.min(1, this.progress + dt / 1.5);
      this.mat.uniforms.uProgress.value = this.progress;
      if (this.progress >= 1) {
        this.morphing = false;
        if (this.queued) {
          const next = this.queued;
          this.queued = null;
          this.morphTo(next);
        }
      }
    }

    this.mat.uniforms.uTime.value = time;

    const o = this.mat.uniforms.uOpacity;
    o.value += (this.targetOpacity - o.value) * (1 - Math.pow(0.02, dt));

    // Critically-damped-ish easing toward the target pose.
    const k = 1 - Math.pow(0.0016, dt);
    this.pose.rx += (this.targetPose.rx - this.pose.rx) * k;
    this.pose.ry += (this.targetPose.ry - this.pose.ry) * k;
    this.pose.scale += (this.targetPose.scale - this.pose.scale) * k;
    this.applyPose();
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

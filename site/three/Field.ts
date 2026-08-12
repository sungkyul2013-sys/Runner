import * as THREE from 'three';
import { SHAPE_POSE, buildShape, type ShapeName } from './shapes';

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
    vFade = depthFade * twinkle * (0.55 + arc * 0.45);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;

  uniform float uOpacity;
  varying vec3 vColor;
  varying float vFade;

  void main() {
    // Soft round sprite — cheaper and crisper than a texture lookup.
    float d = length(gl_PointCoord - vec2(0.5));
    float a = smoothstep(0.5, 0.05, d);
    if (a < 0.01) discard;

    float core = smoothstep(0.28, 0.0, d) * 0.5;
    gl_FragColor = vec4(vColor + core, a * vFade * uOpacity);
  }
`;

export class Field {
  readonly object: THREE.Points;

  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly count: number;
  private readonly cache = new Map<ShapeName, Float32Array>();

  private progress = 1;
  private morphing = false;
  private current: ShapeName;
  private queued: ShapeName | null = null;

  /** Pose the field lerps toward (set per shape, nudged by scroll/pointer). */
  private targetPose = { scale: 1, rx: 0, ry: 0 };
  private pose = { scale: 1, rx: 0, ry: 0 };

  constructor(count: number, initial: ShapeName) {
    this.count = count;
    this.current = initial;

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
        uSize: { value: 3.4 },
        uDpr: { value: 1 },
        uStagger: { value: STAGGER },
        uBulge: { value: BULGE },
        uOpacity: { value: 1 },
        uColorA: { value: new THREE.Color('#7d8cff') },
        uColorB: { value: new THREE.Color('#5fe3ff') },
        uColorC: { value: new THREE.Color('#ffc48a') },
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
      pts = buildShape(name, this.count);
      this.cache.set(name, pts);
    }
    return pts;
  }

  get shapeName(): ShapeName {
    return this.current;
  }

  /** Morph to `name`. Safe to call at any time, including mid-morph. */
  morphTo(name: ShapeName): void {
    if (name === this.current && !this.morphing) return;
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

    const pose = SHAPE_POSE[name];
    this.targetPose = { ...pose };
  }

  /** Scroll-driven spin + pointer parallax, both in normalised units. */
  setDrive(scroll: number, px: number, py: number): void {
    const pose = SHAPE_POSE[this.current];
    this.targetPose.rx = pose.rx + py * 0.22;
    this.targetPose.ry = pose.ry + scroll * Math.PI * 1.15 + px * 0.34;
    this.targetPose.scale = pose.scale;
  }

  private applyPose(): void {
    this.object.rotation.set(this.pose.rx, this.pose.ry, 0);
    this.object.scale.setScalar(this.pose.scale);
  }

  setOpacity(v: number): void {
    this.mat.uniforms.uOpacity.value = v;
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

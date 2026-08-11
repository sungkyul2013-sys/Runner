import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CAMERA_FOV_BASE, DEV, DISTRICTS } from '../config/constants';
import { Stats } from './Stats';

/** Per-frame update callback. `dt` is delta seconds, `elapsed` total seconds. */
export type UpdateFn = (dt: number, elapsed: number) => void;

/**
 * Low-level engine: owns the Scene, Camera, Renderer and the rAF loop, plus an
 * UnrealBloom post-processing chain (neon glow), a decaying camera shake and a
 * brief hit-stop time-scale for juice. Game-agnostic — gameplay runs through
 * update callbacks. Handles DPR clamping, resize, quality toggle and a dev FPS
 * overlay.
 */
export class Engine {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private bloomEnabled = true;

  private readonly clock = new THREE.Clock();
  private readonly updaters = new Set<UpdateFn>();
  private stats?: Stats;
  private rafId = 0;
  private running = false;
  private elapsed = 0;

  private shakeAmt = 0;
  private slowTimer = 0;
  private readonly shakeOffset = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.clampedDpr());
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    // Background is the Environment sky dome; fog colour is biome-driven.
    this.scene.fog = new THREE.Fog(DISTRICTS[0].fog, 60, 300);

    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV_BASE,
      window.innerWidth / window.innerHeight,
      0.1,
      400,
    );
    this.camera.position.set(0, 4.2, 7.5);
    this.camera.lookAt(0, 1, -6);

    this.setupLights();

    // Post-processing: scene → bloom → output.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.42, // strength — a restrained glow on lamps, coins and the sky
      0.7, // radius
      0.72, // threshold — only the brightest highlights bloom
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.setPixelRatio(this.clampedDpr());
    this.composer.setSize(window.innerWidth, window.innerHeight);

    window.addEventListener('resize', this.onResize);
    if (DEV) this.stats = new Stats();
  }

  private setupLights(): void {
    // Daylight-neutral rig: sky/ground hemisphere fill, a key from the sun's
    // side of the yard, and a cool rim that separates carriages from the sky.
    this.scene.add(new THREE.HemisphereLight(0xdce8ff, 0x4a4640, 1.0));
    const key = new THREE.DirectionalLight(0xfff2d8, 1.25);
    key.position.set(-16, 18, -12);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ec4ff, 0.5);
    rim.position.set(10, 8, 12);
    this.scene.add(rim);
    // A soft bounce off the ballast keeps undersides from going pure black.
    const bounce = new THREE.DirectionalLight(0xffd9b0, 0.28);
    bounce.position.set(0, -6, 4);
    this.scene.add(bounce);
  }

  private clampedDpr(): number {
    return Math.min(window.devicePixelRatio || 1, 2);
  }

  onUpdate(fn: UpdateFn): () => void {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }
  add(obj: THREE.Object3D): void {
    this.scene.add(obj);
  }
  remove(obj: THREE.Object3D): void {
    this.scene.remove(obj);
  }

  /** Global shake intensity multiplier (settings: off/low/high). */
  shakeScale = 1;

  /** Kick a decaying camera shake (used on crashes / bombs). */
  shake(amount: number): void {
    this.shakeAmt = Math.max(this.shakeAmt, amount * this.shakeScale);
  }

  /** Show/hide the FPS counter at runtime (settings toggle). */
  setShowFps(on: boolean): void {
    if (on && !this.stats) this.stats = new Stats();
    else if (!on && this.stats) {
      this.stats.dispose();
      this.stats = undefined;
    }
  }
  /** Brief slow-motion hit-stop. */
  hitstop(seconds: number): void {
    this.slowTimer = Math.max(this.slowTimer, seconds);
  }
  /** Quality toggle: bloom + DPR. */
  setQuality(q: 'high' | 'low'): void {
    this.bloomEnabled = q === 'high';
    const dpr = q === 'low' ? Math.min(this.clampedDpr(), 1.25) : this.clampedDpr();
    this.renderer.setPixelRatio(dpr);
    this.composer.setPixelRatio(dpr);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.loop();
  }
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private loop = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);

    const rdt = Math.min(this.clock.getDelta(), 0.05);
    // Hit-stop scales gameplay time but not the shake decay.
    const scale = this.slowTimer > 0 ? 0.12 : 1;
    if (this.slowTimer > 0) this.slowTimer -= rdt;
    const gdt = rdt * scale;
    this.elapsed += gdt;

    for (const fn of this.updaters) fn(gdt, this.elapsed);

    // Apply decaying camera shake on top of whatever positioned the camera.
    if (this.shakeAmt > 0.0001) {
      this.shakeOffset.set(
        (Math.random() - 0.5) * this.shakeAmt,
        (Math.random() - 0.5) * this.shakeAmt,
        0,
      );
      this.camera.position.add(this.shakeOffset);
      this.shakeAmt = Math.max(0, this.shakeAmt - rdt * 1.6);
    }

    if (this.bloomEnabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.stats?.update(rdt);
  };

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.clampedDpr());
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.clampedDpr());
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  };

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    this.stats?.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}

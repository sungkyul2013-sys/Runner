import * as THREE from 'three';
import {
  CAMERA_FOV_BASE,
  COLORS,
  DEV,
} from '../config/constants';
import { Stats } from './Stats';

/** Per-frame update callback. `dt` is delta seconds, `elapsed` total seconds. */
export type UpdateFn = (dt: number, elapsed: number) => void;

/**
 * Low-level rendering engine: owns the Scene, Camera, Renderer and the
 * requestAnimationFrame loop. It is intentionally game-agnostic — gameplay is
 * driven through update callbacks registered via {@link onUpdate}. Handles DPR
 * clamping, window resize and an optional dev FPS overlay.
 */
export class Engine {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  private readonly clock = new THREE.Clock();
  private readonly updaters = new Set<UpdateFn>();
  private readonly stats?: Stats;
  private rafId = 0;
  private running = false;
  private elapsed = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(this.clampedDpr());
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.background);
    // Distance fog hides the spawn horizon and reinforces the neon mood.
    this.scene.fog = new THREE.Fog(COLORS.fog, 40, 160);

    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV_BASE,
      window.innerWidth / window.innerHeight,
      0.1,
      400,
    );
    this.camera.position.set(0, 4.2, 7.5);
    this.camera.lookAt(0, 1, -6);

    this.setupLights();

    window.addEventListener('resize', this.onResize);

    if (DEV) this.stats = new Stats();
  }

  /** Hemisphere fill + a key directional light with soft shadows disabled (perf). */
  private setupLights(): void {
    const hemi = new THREE.HemisphereLight(0x9fd0ff, 0x202842, 1.1);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(6, 18, 8);
    this.scene.add(key);

    // A cool rim light from behind for the neon silhouette feel.
    const rim = new THREE.DirectionalLight(0x2de2e6, 0.6);
    rim.position.set(-6, 6, -10);
    this.scene.add(rim);
  }

  private clampedDpr(): number {
    // Clamp DPR so high-density mobile screens don't tank the fill rate.
    return Math.min(window.devicePixelRatio || 1, 2);
  }

  /** Register a per-frame update callback. Returns an unsubscribe function. */
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

    // Clamp dt to avoid huge jumps after a tab regains focus.
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;

    for (const fn of this.updaters) fn(dt, this.elapsed);

    this.renderer.render(this.scene, this.camera);
    this.stats?.update(dt);
  };

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.clampedDpr());
    this.renderer.setSize(w, h);
  };

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    this.stats?.dispose();
    this.renderer.dispose();
  }
}

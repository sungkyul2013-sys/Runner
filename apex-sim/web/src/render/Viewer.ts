// WebGPU renderer (WebGL2 fallback), camera, lights and orbit/fly controls for the M0 sandbox.
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TOKENS } from './palette';
import { installWebGPUCompat } from './webgpuCompat';

const PAN_SPEED = 12; // [m/s] WASD target panning at 1× (Shift: ×4)
const SUN_SHADOW_HALF = 30; // [m] half size of the sun's shadow frustum around the camera target

export class Viewer {
  readonly renderer: THREE.WebGPURenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.05, 5000);
  readonly controls: OrbitControls;
  backend = 'unknown';
  /** WASD/QE pan the orbit target (off while driving: the keys belong to the car). */
  freeMove = true;
  private sun = new THREE.DirectionalLight(0xfff4e6, 2.6);
  private keys = new Set<string>();

  /** `forceWebGL`: use three's WebGL2 backend (A§5 fallback; also the only backend headless SwiftShader can
   *  present with — see KNOWN_ISSUES). */
  constructor(private readonly canvas: HTMLCanvasElement, forceWebGL = false) {
    this.renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color(TOKENS.background);
    this.scene.fog = new THREE.Fog(TOKENS.background, 120, 900);
    this.scene.add(new THREE.HemisphereLight(0xc9d6ff, 0x1a1c20, 0.9));
    this.sun.position.set(-18, 30, 14);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -SUN_SHADOW_HALF;
    sc.right = sc.top = SUN_SHADOW_HALF;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun, this.sun.target);

    this.camera.position.set(-9, 6, 11);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 1, 0);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 600;

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => {
      if (!(e.target instanceof HTMLInputElement)) this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.resize();
  }

  async init(onDeviceLost: (message: string) => void): Promise<void> {
    installWebGPUCompat();
    await this.renderer.init();
    const backend = this.renderer.backend as { isWebGPUBackend?: boolean };
    this.backend = backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
    this.renderer.onDeviceLost = (info: { message?: string }) => onDeviceLost(info?.message ?? 'device lost');
  }

  focus(point: THREE.Vector3, distance = 9): void {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(point);
    this.camera.position.copy(point).addScaledVector(dir, distance);
  }

  /** Per-frame camera movement (WASD/QE pans the orbit target) and shadow follow. */
  update(dtSeconds: number): void {
    const speed = PAN_SPEED * (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 4 : 1) * dtSeconds;
    const forward = new THREE.Vector3().subVectors(this.controls.target, this.camera.position).setY(0);
    if (forward.lengthSq() > 1e-6) forward.normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const move = new THREE.Vector3();
    if (this.keys.has('KeyW')) move.add(forward);
    if (this.keys.has('KeyS')) move.sub(forward);
    if (this.keys.has('KeyD')) move.add(right);
    if (this.keys.has('KeyA')) move.sub(right);
    if (this.keys.has('KeyE')) move.y += 1;
    if (this.keys.has('KeyQ')) move.y -= 1;
    if (move.lengthSq() > 0 && this.freeMove) {
      move.normalize().multiplyScalar(speed);
      this.controls.target.add(move);
      this.camera.position.add(move);
    }
    if (this.controls.enabled) this.controls.update();
    const t = this.controls.target;
    this.sun.target.position.set(t.x, 0, t.z);
    this.sun.position.set(t.x - 18, 30, t.z + 14);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  drawCalls(): number {
    const info = this.renderer.info as unknown as { render?: { drawCalls?: number; calls?: number } };
    return info.render?.drawCalls ?? info.render?.calls ?? 0;
  }

  private resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

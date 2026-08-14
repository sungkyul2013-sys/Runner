import * as THREE from 'three';
import { Field } from './Field';
import { Sheets } from './Sheets';
import { Solids, type SolidShape } from './Solids';
import type { ShapeName } from './shapes';

/**
 * Each named scene maps to a solid form and a particle form. The solid is
 * the subject; the particles are the air around it.
 */
const SOLID_FOR: Record<ShapeName, SolidShape> = {
  glyph: 'glyph',
  grid: 'grid',
  book: 'books',
  wave: 'tower',
  helix: 'pencil',
  plane: 'pencil',
  sphere: 'tower',
};

/** Soft additive halo standing in for a bloom pass — a fraction of the cost. */
function glowSprite(): THREE.Mesh {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');

  if (ctx) {
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(120, 160, 255, 0.55)');
    g.addColorStop(0.35, 'rgba(90, 140, 255, 0.18)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 26),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  mesh.position.z = -7;
  return mesh;
}

export class Scene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly root = new THREE.Group();
  private readonly field: Field;
  private readonly solids: Solids;
  private readonly sheets: Sheets;
  private readonly glow: THREE.Mesh;
  private anchor = 0;

  private raf = 0;
  private clock = new THREE.Clock();
  private running = false;

  /** Normalised pointer, damped. */
  private pointer = { x: 0, y: 0 };
  private pointerTarget = { x: 0, y: 0 };
  private scroll = 0;
  private scrollEased = 0;
  private turbulence = 0;
  private readonly reduced: boolean;

  constructor(canvas: HTMLCanvasElement, initial: ShapeName) {
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const mobile = w < 820;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !mobile,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearAlpha(0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Lit geometry needs tone mapping or the key light clips to flat white.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 120);
    this.camera.position.set(0, 0, 10.5);

    // Solids carry the scene now, so the field drops to atmosphere.
    this.solids = new Solids(mobile ? 240 : 340, SOLID_FOR[initial]);
    this.field = new Field(mobile ? 1600 : 3400, initial);
    this.sheets = new Sheets(mobile ? 5 : 10);
    this.glow = glowSprite();

    this.root.add(this.glow, this.sheets.object, this.field.object, this.solids.object);
    this.scene.add(this.root);

    this.field.setOpacity(mobile ? 0.45 : 0.55);

    this.resize();
    this.bind();
  }

  private bind(): void {
    window.addEventListener('resize', this.resize, { passive: true });
    window.addEventListener('orientationchange', this.resize, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);

    if (!this.reduced && window.matchMedia('(pointer: fine)').matches) {
      window.addEventListener('pointermove', this.onPointer, { passive: true });
    }
  }

  private onVisibility = (): void => {
    if (document.hidden) this.stop();
    else this.start();
  };

  private onPointer = (e: PointerEvent): void => {
    this.pointerTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointerTarget.y = (e.clientY / window.innerHeight) * 2 - 1;
  };

  private resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    // Shrink the whole scene on narrow screens: a 6.4-unit-wide glyph is wider
    // than a phone's visible frustum, and the field would swallow the copy.
    const fit = Math.min(1, Math.max(0.58, w / 1150));
    this.root.scale.setScalar(fit);

    this.field.setDpr(dpr);
  };

  /** 0 → 1 across the whole document. */
  setScroll(p: number): void {
    this.scroll = p;
  }

  /** Scroll speed in px/s — shakes the field loose while the page moves. */
  setVelocity(v: number): void {
    this.turbulence = Math.min(0.34, Math.abs(v) * 0.00016);
  }

  /** Assemble both layers from far out on first paint. */
  intro(): void {
    if (this.reduced) return;
    this.field.intro();
    this.solids.intro();
  }

  morphTo(name: ShapeName): void {
    this.field.morphTo(name);
    this.solids.morphTo(SOLID_FOR[name]);
    // Each form starts from its own pose and turns only through its chapter.
    this.anchor = this.scrollEased;
  }

  start(): void {
    if (this.running || document.hidden) return;
    this.running = true;
    this.clock.getDelta();
    this.loop();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private loop = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    const k = 1 - Math.pow(0.002, dt);
    this.pointer.x += (this.pointerTarget.x - this.pointer.x) * k;
    this.pointer.y += (this.pointerTarget.y - this.pointer.y) * k;
    this.scrollEased += (this.scroll - this.scrollEased) * (1 - Math.pow(0.004, dt));

    this.field.setDrive(this.scrollEased, this.pointer.x, this.pointer.y);
    this.field.setTurbulence(this.reduced ? 0 : this.turbulence);
    this.field.update(dt, t);

    this.solids.setDrive(this.scrollEased, this.pointer.x, this.pointer.y, this.anchor);
    this.solids.setTurbulence(this.reduced ? 0 : this.turbulence);
    this.solids.update(dt, t);

    this.sheets.update(dt, t, this.scrollEased);

    // Camera parallax + a slow dolly across the whole page.
    this.camera.position.x = this.pointer.x * 0.85;
    this.camera.position.y = -this.pointer.y * 0.55;
    this.root.position.y = this.scrollEased * -1.1;
    this.glow.rotation.z = t * 0.03;
    this.camera.lookAt(0, this.root.position.y * 0.4, 0);

    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('orientationchange', this.resize);
    window.removeEventListener('pointermove', this.onPointer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.field.dispose();
    this.solids.dispose();
    this.sheets.dispose();
    this.renderer.dispose();
  }
}

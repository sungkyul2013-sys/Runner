import * as THREE from 'three';
import { Field } from './Field';
import { Sheets } from './Sheets';
import { Solids, type SolidShape } from './Solids';
import type { ShapeName } from './shapes';

/**
 * Each named scene pairs a solid form with a particle form.
 *
 * The two layers are cast, not stacked: on the opening scene the blocks
 * build the 수 mark while the points spell 국어논술 beneath it, so the 3D
 * says the academy's name outright. Elsewhere the solid takes the subject
 * and the points play the air around it, dimmer but never absent.
 */
interface Cast {
  solid: SolidShape;
  field: ShapeName;
  /** How loud the particle layer plays in this scene. */
  fieldLevel: number;
}

const CAST: Record<ShapeName, Cast> = {
  glyph: { solid: 'glyph', field: 'wordmark', fieldLevel: 1 },
  wordmark: { solid: 'glyph', field: 'wordmark', fieldLevel: 1 },
  grid: { solid: 'grid', field: 'grid', fieldLevel: 0.72 },
  book: { solid: 'books', field: 'book', fieldLevel: 0.72 },
  wave: { solid: 'tower', field: 'wave', fieldLevel: 0.78 },
  helix: { solid: 'pencil', field: 'helix', fieldLevel: 0.78 },
  plane: { solid: 'pencil', field: 'plane', fieldLevel: 0.72 },
  sphere: { solid: 'tower', field: 'sphere', fieldLevel: 0.78 },
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
  /** Ceiling for the particle layer on this device. */
  private readonly base: number;
  /** Fallback scale, used when no focus box is on screen. */
  private fit = 1;
  private focusEl: HTMLElement | null = null;
  /** Which cast is on stage, for the per-frame field level. */
  private castName: ShapeName;
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

    const cast = CAST[initial];
    this.castName = initial;

    // Both layers carry weight. The points are back up to a readable
    // density — they have to spell a word, not suggest one.
    this.solids = new Solids(mobile ? 240 : 340, cast.solid);
    this.field = new Field(mobile ? 3400 : 6000, cast.field);
    this.sheets = new Sheets(mobile ? 5 : 10);
    this.glow = glowSprite();

    this.root.add(this.glow, this.sheets.object, this.field.object, this.solids.object);
    this.scene.add(this.root);

    this.base = mobile ? 0.78 : 0.9;
    this.field.setOpacityNow(this.base * cast.fieldLevel);

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

  /**
   * Hands the 3D a box on the page to live inside — the hero's reserved
   * band. While that box is on screen the lockup is scaled and placed to sit
   * in it exactly, at any viewport, instead of being centred on the window
   * and hoping the layout leaves room. Pass null to go back to centred.
   */
  setFocusEl(el: HTMLElement | null): void {
    this.focusEl = el;
  }

  /** Half-extents of the z = 0 plane, in world units. */
  private frustum(): { halfW: number; halfH: number } {
    const halfH = Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.position.z;
    return { halfH, halfW: halfH * this.camera.aspect };
  }

  /** True when the focus box was applied this frame. */
  private applyFocus(): boolean {
    const el = this.focusEl;
    if (!el || !el.isConnected) return false;

    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.bottom <= 0 || r.top >= vh || r.width < 40) return false;

    const { halfW, halfH } = this.frustum();
    const w = window.innerWidth;

    // The lockup's own extents: the wordmark is the widest part, the block
    // 수 the tallest, and its centre sits above the origin.
    const SPAN_X = 8.6;
    const SPAN_Y = 5.6;
    const MID_Y = 2.115;

    const boxW = (r.width / w) * 2 * halfW;
    const boxH = (r.height / vh) * 2 * halfH;
    const s = Math.min(boxW / SPAN_X, boxH / SPAN_Y);

    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;

    this.root.scale.setScalar(s);
    this.root.position.x = ((cx / w) * 2 - 1) * halfW;
    this.root.position.y = -((cy / vh) * 2 - 1) * halfH - MID_Y * s;

    // The page paints a vignette over the canvas to keep type readable; move
    // its clear centre onto the lockup, or the lockup sits in the dark part.
    this.vignette((cx / w) * 100, (cy / vh) * 100);
    return true;
  }

  private vig = { x: -1, y: -1 };

  private vignette(x: number, y: number): void {
    // Only touch the stylesheet when it actually moved — this runs per frame.
    if (Math.abs(x - this.vig.x) < 0.4 && Math.abs(y - this.vig.y) < 0.4) return;
    this.vig = { x, y };
    const root = document.documentElement.style;
    root.setProperty('--vig-x', `${x.toFixed(1)}%`);
    root.setProperty('--vig-y', `${y.toFixed(1)}%`);
  }

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
    // Fallback sizing, used on every screen that does not hand the 3D a box
    // of its own (see setFocusEl).
    this.fit = Math.min(1, Math.max(0.58, w / 1150));
    this.root.scale.setScalar(this.fit);

    // The wordmark is wider than everything else, so it gets its own fit or
    // 국어논술 runs off both sides of a phone.
    this.field.setFit(Math.min(1, Math.max(0.6, w / 900)));
    this.field.setDpr(dpr);
  };

  /** Follows the page between its ink and paper themes. */
  setTheme(dark: boolean): void {
    this.field.setInk(dark);
  }

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
    const cast = CAST[name];
    this.castName = name;
    this.field.morphTo(cast.field);
    this.solids.morphTo(cast.solid);
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

    // Inside its box the lockup tracks the band as the page moves, so it
    // scrolls away with the hero rather than sliding against it.
    const focused = this.applyFocus();
    if (!focused) {
      this.root.scale.setScalar(this.fit);
      this.root.position.x = 0;
      this.root.position.y = this.scrollEased * -1.1;
      this.vignette(50, 30);
    }

    // Full strength while the lockup is being read; once the page has moved
    // past its band the points step back behind the cards.
    this.field.setOpacity(this.base * CAST[this.castName].fieldLevel * (focused ? 1 : 0.6));
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

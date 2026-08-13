/**
 * The hero's 3D layer: a slow-turning cloud of Korean glyph tiles that the
 * pointer steers and the scroll flies through.
 *
 * Design constraints:
 *  - No external assets. Glyph textures are drawn to a canvas at runtime.
 *  - Cheap enough for phones: tile count and DPR both scale down on small
 *    screens or when the learner picked "가볍게" quality.
 *  - Fully disposable — views are torn down on every route change.
 */

import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';

import { clamp } from '../core/dom';
import { isDark, reducedMotion, store } from '../core/store';

/** Characters that ride the tiles — words the app is actually about. */
const GLYPHS = [
  '수', '국', '어', '논', '술', '문', '학', '법', '독', '해',
  '시', '조', '가', '사', '비', '평', '요', '약', '개', '요',
  '근', '거', '추', '론', '맥', '락', '어', '휘', '표', '현',
  '읽', '쓰', '말', '뜻', '결', '構', '意', '文',
];

const PALETTE_LIGHT = ['#5b6cff', '#9b6cff', '#ff6f9c', '#17c3a2', '#f6a723'];
const PALETTE_DARK = ['#7b8bff', '#b489ff', '#ff85ad', '#2ee0ba', '#ffbe4d'];

interface Tile {
  mesh: Mesh;
  base: Vector3;
  spin: number;
  bob: number;
  phase: number;
}

function glyphTexture(ch: string, color: string, dark: boolean): CanvasTexture {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  if (g) {
    // Rounded plate.
    const r = 26;
    g.beginPath();
    g.moveTo(r, 0);
    g.arcTo(size, 0, size, size, r);
    g.arcTo(size, size, 0, size, r);
    g.arcTo(0, size, 0, 0, r);
    g.arcTo(0, 0, size, 0, r);
    g.closePath();
    const grad = g.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.92)');
    grad.addColorStop(1, dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.68)');
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = dark ? 'rgba(255,255,255,0.16)' : 'rgba(20,24,40,0.10)';
    g.stroke();

    g.fillStyle = color;
    g.font = `700 ${Math.round(size * 0.54)}px "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, size / 2, size / 2 + 3);
  }
  const tex = new CanvasTexture(cv);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  return tex;
}

function glowTexture(): CanvasTexture {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(cv);
}

export interface HeroSceneHandle {
  destroy: () => void;
  /** 0..1 hero scroll progress — dollies the camera through the cloud. */
  setProgress: (p: number) => void;
}

export function createHeroScene(canvas: HTMLCanvasElement): HeroSceneHandle | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null; // No WebGL — the hero still works, just without the 3D layer.
  }

  const lite = store.profile.settings.quality === 'lite';
  const small = window.innerWidth < 760;
  const dark = isDark();
  const palette = dark ? PALETTE_DARK : PALETTE_LIGHT;
  const tileCount = lite ? 26 : small ? 40 : 76;
  const starCount = lite ? 220 : small ? 420 : 900;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lite ? 1.25 : 2));
  renderer.setClearAlpha(0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(56, 1, 0.1, 220);
  camera.position.set(0, 0, 34);

  const world = new Group();
  scene.add(world);

  /* --------------------------- glyph tiles --------------------------- */
  const geo = new PlaneGeometry(3.1, 3.1);
  const tiles: Tile[] = [];
  const textures: CanvasTexture[] = [];

  for (let i = 0; i < tileCount; i += 1) {
    const ch = GLYPHS[i % GLYPHS.length];
    const color = palette[i % palette.length];
    const tex = glyphTexture(ch, color, dark);
    textures.push(tex);
    const mat = new MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: dark ? 0.82 : 0.7,
    });
    const mesh = new Mesh(geo, mat);

    // Golden-angle spiral on a wide cylinder so the camera can fly through it.
    // The inner radius is kept clear so the headline never sits on a tile.
    const t = i / tileCount;
    const angle = i * 2.39996;
    const radius = 13 + Math.pow(t, 0.6) * 17 + (i % 3) * 1.4;
    const base = new Vector3(
      Math.cos(angle) * radius,
      (t - 0.5) * 46 + Math.sin(i * 1.7) * 2.4,
      Math.sin(angle) * radius * 0.72 - t * 26,
    );
    mesh.position.copy(base);
    mesh.rotation.z = (Math.random() - 0.5) * 0.5;
    const scale = 0.6 + Math.random() * 0.85;
    mesh.scale.setScalar(scale);
    world.add(mesh);
    tiles.push({
      mesh,
      base,
      spin: (Math.random() - 0.5) * 0.22,
      bob: 0.5 + Math.random() * 1.3,
      phase: Math.random() * Math.PI * 2,
    });
  }

  /* ------------------------------ stars ------------------------------ */
  const starGeo = new BufferGeometry();
  const pos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    pos[i * 3] = (Math.random() - 0.5) * 130;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 90;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 130 - 20;
  }
  starGeo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  const stars = new Points(
    starGeo,
    new PointsMaterial({
      size: dark ? 0.34 : 0.26,
      color: new Color(dark ? 0xa9b4ff : 0x8f9bd8),
      transparent: true,
      opacity: dark ? 0.7 : 0.4,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  world.add(stars);

  /* ------------------------------ glow ------------------------------- */
  const glowTex = glowTexture();
  const glows: Sprite[] = [];
  const glowColors = [palette[0], palette[1], palette[2]];
  glowColors.forEach((c, i) => {
    const sprite = new Sprite(
      new SpriteMaterial({
        map: glowTex,
        color: new Color(c),
        transparent: true,
        opacity: dark ? 0.5 : 0.34,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    sprite.scale.setScalar(38 + i * 12);
    sprite.position.set((i - 1) * 17, 5 - i * 9, -26 - i * 8);
    world.add(sprite);
    glows.push(sprite);
  });

  /* ---------------------------- interaction --------------------------- */
  let px = 0;
  let py = 0;
  let cx = 0;
  let cy = 0;
  let progress = 0;
  let smoothProgress = 0;

  const onPointer = (e: PointerEvent) => {
    px = (e.clientX / window.innerWidth - 0.5) * 2;
    py = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  const onOrient = (e: DeviceOrientationEvent) => {
    if (e.gamma === null || e.beta === null) return;
    px = clamp(e.gamma / 40, -1, 1);
    py = clamp((e.beta - 45) / 45, -1, 1);
  };
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('deviceorientation', onOrient);

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  /* ------------------------------- loop ------------------------------- */
  const still = reducedMotion();
  let raf = 0;
  let t0 = performance.now();
  let running = true;

  const frame = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - t0) / 1000, 0.05);
    t0 = now;
    const time = now / 1000;

    cx += (px - cx) * 0.045;
    cy += (py - cy) * 0.045;
    smoothProgress += (progress - smoothProgress) * 0.08;

    if (!still) {
      world.rotation.y += dt * 0.045;
      for (const tile of tiles) {
        tile.mesh.position.y = tile.base.y + Math.sin(time * 0.55 + tile.phase) * tile.bob;
        tile.mesh.rotation.z += tile.spin * dt;
        // Always face the camera-ish, with a little lag for depth.
        tile.mesh.rotation.y = -world.rotation.y + cx * 0.5;
      }
      stars.rotation.y -= dt * 0.012;
      for (let i = 0; i < glows.length; i += 1) {
        glows[i].position.y = 5 - i * 9 + Math.sin(time * 0.3 + i) * 2.4;
      }
    }

    camera.position.x = cx * 4.2;
    camera.position.y = -cy * 3.0;
    camera.position.z = 34 - smoothProgress * 30;
    camera.lookAt(0, smoothProgress * -3, -8);

    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  // Pause when the tab is hidden so phones don't burn battery.
  const onVis = () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (!running) {
      running = true;
      t0 = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener('visibilitychange', onVis);

  return {
    setProgress(p: number) {
      progress = clamp(p, 0, 1);
    },
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('deviceorientation', onOrient);
      document.removeEventListener('visibilitychange', onVis);
      ro.disconnect();
      geo.dispose();
      starGeo.dispose();
      glowTex.dispose();
      for (const tex of textures) tex.dispose();
      for (const tile of tiles) (tile.mesh.material as MeshBasicMaterial).dispose();
      (stars.material as PointsMaterial).dispose();
      for (const g of glows) (g.material as SpriteMaterial).dispose();
      renderer.dispose();
    },
  };
}

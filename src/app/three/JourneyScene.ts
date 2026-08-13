/**
 * 학습 맵 — the journey rendered as a real 3D scene rather than a list.
 *
 * Stages sit as carved stones along a winding path through ink-space. The
 * learner drags to travel the path, taps a stone to enter a stage, and the
 * next unlocked stone pulses so there is always one obvious move.
 */

import {
  AdditiveBlending,
  BufferGeometry,
  CatmullRomCurve3,
  CanvasTexture,
  Color,
  CircleGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  AmbientLight,
} from 'three';

import { clamp } from '../core/dom';
import { reducedMotion, store } from '../core/store';
import { DOMAIN_HUE, type StageProgress } from '../core/types';
import { STAGES, isUnlocked, type Stage } from '../data/stages';

/* 단청 palette, matched to the stylesheet. */
const INK = 0x080b0f;
const GOLD = '#f0b429';
const JADE = '#3fa88a';
const STONE_LOCKED = 0x1b2530;

interface NodeHandle {
  stage: Stage;
  group: Group;
  disc: Mesh;
  ring: Mesh | null;
  glow: Sprite;
  unlocked: boolean;
  stars: number;
  position: Vector3;
}

function discTexture(label: string, stars: number, unlocked: boolean, hue: number): CanvasTexture {
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  if (g) {
    g.clearRect(0, 0, size, size);

    // Carved stone face.
    const grad = g.createLinearGradient(0, 0, 0, size);
    if (unlocked) {
      grad.addColorStop(0, `hsl(${hue} 62% 34%)`);
      grad.addColorStop(1, `hsl(${hue} 68% 17%)`);
    } else {
      grad.addColorStop(0, '#1e2833');
      grad.addColorStop(1, '#141c25');
    }
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = unlocked ? GOLD : '#2a3644';
    g.stroke();

    // Number, or a lock when the stage is still closed.
    g.fillStyle = unlocked ? '#f7f4ec' : '#4a5866';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (unlocked) {
      g.font = `800 ${Math.round(size * 0.42)}px "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`;
      g.fillText(label, size / 2, size / 2 - 14);
    } else {
      // Drawn, not an emoji: emoji render as a full-colour OS illustration.
      const cx2 = size / 2;
      const cy2 = size / 2 + 6;
      g.strokeStyle = '#55606d';
      g.lineWidth = 13;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(cx2, cy2 - 22, 24, Math.PI, 0);
      g.stroke();
      g.fillStyle = '#55606d';
      g.beginPath();
      g.roundRect(cx2 - 38, cy2 - 20, 76, 58, 10);
      g.fill();
    }

    // Star row.
    if (unlocked) {
      g.font = `${Math.round(size * 0.15)}px system-ui, sans-serif`;
      const row = '★★★';
      const y = size * 0.735;
      g.fillStyle = '#33404e';
      g.fillText(row, size / 2, y);
      if (stars > 0) {
        g.save();
        const w = g.measureText(row).width;
        g.beginPath();
        g.rect(size / 2 - w / 2, y - size * 0.12, (w * stars) / 3, size * 0.24);
        g.clip();
        g.fillStyle = GOLD;
        g.fillText(row, size / 2, y);
        g.restore();
      }
    }
  }
  const tex = new CanvasTexture(cv);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  return tex;
}

function labelTexture(text: string, sub: string): CanvasTexture {
  const w = 512;
  const hgt = 160;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = hgt;
  const g = cv.getContext('2d');
  if (g) {
    g.textAlign = 'center';
    g.fillStyle = '#f2efe6';
    g.font = `800 46px "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`;
    g.shadowColor = 'rgba(0,0,0,.8)';
    g.shadowBlur = 12;
    g.fillText(text, w / 2, 62);
    g.font = `600 28px "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`;
    g.fillStyle = '#9aa8b6';
    g.fillText(sub, w / 2, 108);
  }
  const tex = new CanvasTexture(cv);
  tex.minFilter = LinearFilter;
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
    grad.addColorStop(0, 'rgba(255,255,255,.9)');
    grad.addColorStop(0.4, 'rgba(255,255,255,.25)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(cv);
}

/**
 * Path position for stage index `i`. The horizontal amplitude is deliberately
 * small: the app is a narrow phone column, so a wide sine would swing stones
 * clean out of frame.
 */
function stagePosition(i: number): Vector3 {
  return new Vector3(Math.sin(i * 0.9) * 2.25, -i * 3.6, Math.cos(i * 0.6) * 1.1);
}

export interface JourneyHandle {
  destroy: () => void;
  /** Smoothly travel to a stage index. */
  focus: (index: number, instant?: boolean) => void;
  /** Repaint a single stone after its progress changed. */
  refresh: (stageId: string) => void;
}

export interface JourneyOptions {
  canvas: HTMLCanvasElement;
  onSelect: (stage: Stage, unlocked: boolean) => void;
  /** Fired while travelling so the view can update its caption. */
  onFocusChange?: (stage: Stage) => void;
}

export function createJourney(opts: JourneyOptions): JourneyHandle | null {
  const { canvas } = opts;
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch {
    return null;
  }

  const lite = store.profile.settings.quality === 'lite';
  const still = reducedMotion();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lite ? 1.25 : 2));
  renderer.setClearColor(INK, 1);

  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.1, 160);

  scene.add(new AmbientLight(0xffffff, 1.5));
  const key = new PointLight(0xffd98a, 160, 90);
  key.position.set(6, 6, 12);
  scene.add(key);

  const world = new Group();
  scene.add(world);

  const progress = store.profile.stages as Record<string, StageProgress>;
  const positions = STAGES.map((_, i) => stagePosition(i));

  /* ------------------------------- path ------------------------------- */
  const curve = new CatmullRomCurve3(positions, false, 'catmullrom', 0.3);
  const tube = new Mesh(
    new TubeGeometry(curve, lite ? 120 : 260, 0.16, 8, false),
    new MeshStandardMaterial({
      color: new Color(0x2a3a49),
      roughness: 0.8,
      metalness: 0.1,
      emissive: new Color(0x0d1620),
    }),
  );
  world.add(tube);

  // A second, brighter tube drawn only over the cleared part of the path.
  const clearedCount = STAGES.filter((s) => (progress[s.id]?.stars ?? 0) > 0).length;
  let litTube: Mesh | null = null;
  if (clearedCount >= 2) {
    const litCurve = new CatmullRomCurve3(positions.slice(0, clearedCount), false, 'catmullrom', 0.3);
    litTube = new Mesh(
      new TubeGeometry(litCurve, lite ? 60 : 140, 0.2, 8, false),
      new MeshBasicMaterial({ color: new Color(GOLD) }),
    );
    world.add(litTube);
  }

  /* ------------------------------ stones ------------------------------ */
  const glowTex = glowTexture();
  const discGeo = new CylinderGeometry(1.35, 1.35, 0.34, 40);
  const faceGeo = new CircleGeometry(1.35, 48);
  const ringGeo = new TorusGeometry(1.72, 0.07, 10, 44);
  const nodes: NodeHandle[] = [];
  const disposables: { dispose: () => void }[] = [glowTex, discGeo, faceGeo, ringGeo];

  STAGES.forEach((stage, i) => {
    const group = new Group();
    group.position.copy(positions[i]);

    const unlocked = isUnlocked(stage, progress);
    const stars = progress[stage.id]?.stars ?? 0;
    const hue = DOMAIN_HUE[stage.domain];

    const tex = discTexture(String(stage.no), stars, unlocked, hue);
    disposables.push(tex);
    const sideMat = new MeshStandardMaterial({
      color: new Color(unlocked ? `hsl(${hue} 52% 20%)` : `#${STONE_LOCKED.toString(16)}`),
      roughness: 0.72,
      metalness: 0.25,
    });
    // The stone body, laid flat so its faces point at the camera.
    const body = new Mesh(discGeo, sideMat);
    body.rotation.x = Math.PI / 2;

    // The artwork sits on a separate circle: a cylinder's cap UVs would rotate
    // the number, and a plain circle's UVs map the texture square predictably.
    const disc = new Mesh(faceGeo, new MeshBasicMaterial({ map: tex, transparent: true }));
    disc.position.z = 0.19;
    disc.userData.stageId = stage.id;

    const holder = new Group();
    holder.add(body, disc);
    holder.scale.setScalar(stage.boss ? 1.32 : 1);
    group.add(holder);

    let ring: Mesh | null = null;
    if (stage.boss) {
      ring = new Mesh(
        ringGeo,
        new MeshBasicMaterial({ color: new Color(stars > 0 ? GOLD : 0x3d4b5a) }),
      );
      ring.scale.setScalar(1.32);
      group.add(ring);
    }

    const glow = new Sprite(
      new SpriteMaterial({
        map: glowTex,
        color: new Color(stars > 0 ? GOLD : unlocked ? JADE : 0x223040),
        transparent: true,
        opacity: unlocked ? 0.55 : 0.15,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.scale.setScalar(stage.boss ? 9 : 6.4);
    glow.position.z = -0.4;
    group.add(glow);

    // Name plate under each stone.
    const lt = labelTexture(stage.name, unlocked ? `${stage.count}문항` : '잠김');
    disposables.push(lt);
    const plate = new Sprite(new SpriteMaterial({ map: lt, transparent: true, depthWrite: false }));
    plate.scale.set(4.3, 1.34, 1);
    plate.position.set(0, -2.05, 0.25);
    group.add(plate);

    world.add(group);
    nodes.push({ stage, group, disc, ring, glow, unlocked, stars, position: positions[i] });
  });

  /* ------------------------------ motes ------------------------------- */
  const moteCount = lite ? 120 : 420;
  const moteGeo = new BufferGeometry();
  const mp = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i += 1) {
    mp[i * 3] = (Math.random() - 0.5) * 44;
    mp[i * 3 + 1] = -Math.random() * STAGES.length * 3.35 - 4;
    mp[i * 3 + 2] = (Math.random() - 0.5) * 34 - 6;
  }
  moteGeo.setAttribute('position', new Float32BufferAttribute(mp, 3));
  const motes = new Points(
    moteGeo,
    new PointsMaterial({
      size: 0.16,
      color: new Color(0xc9b27a),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
  );
  world.add(motes);
  disposables.push(moteGeo);

  /* ---------------------------- camera rig ---------------------------- */
  let targetIndex = 0;
  let camY = 0;
  let wantY = 0;
  let camX = 0;
  let px = 0;
  let py = 0;
  let cx = 0;
  let cy = 0;

  const yFor = (i: number) => positions[clamp(i, 0, positions.length - 1)].y;
  const minY = yFor(positions.length - 1);
  const maxY = yFor(0);

  function focus(index: number, instant = false): void {
    targetIndex = clamp(index, 0, STAGES.length - 1);
    wantY = yFor(targetIndex);
    if (instant) camY = wantY;
    opts.onFocusChange?.(STAGES[targetIndex]);
  }

  /* --------------------------- interaction ---------------------------- */
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let dragging = false;
  let moved = 0;
  let lastY = 0;

  const onDown = (e: PointerEvent) => {
    dragging = true;
    moved = 0;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  };

  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    px = ((e.clientX - r.left) / r.width - 0.5) * 2;
    py = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (!dragging) return;
    const dy = e.clientY - lastY;
    lastY = e.clientY;
    moved += Math.abs(dy);
    // Dragging down travels back up the path.
    wantY = clamp(wantY + dy * 0.035, minY, maxY);
  };

  const onUp = (e: PointerEvent) => {
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    const wasDrag = moved > 6;
    dragging = false;
    if (wasDrag) {
      // Snap to the nearest stone.
      let best = 0;
      let bestD = Infinity;
      positions.forEach((p, i) => {
        const d = Math.abs(p.y - wantY);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      focus(best);
      return;
    }
    // A tap selects whatever stone is under the pointer.
    const r = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(nodes.map((n) => n.disc), false);
    if (hits.length) {
      const id = hits[0].object.userData.stageId as string;
      const node = nodes.find((n) => n.stage.id === id);
      if (node) {
        focus(STAGES.indexOf(node.stage));
        opts.onSelect(node.stage, node.unlocked);
      }
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    wantY = clamp(wantY - e.deltaY * 0.012, minY, maxY);
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const hh = canvas.clientHeight || 1;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  /* ------------------------------- loop ------------------------------- */
  let raf = 0;
  let running = true;
  let t0 = performance.now();

  const frame = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - t0) / 1000, 0.05);
    t0 = now;
    const time = now / 1000;

    camY += (wantY - camY) * 0.09;
    cx += (px - cx) * 0.06;
    cy += (py - cy) * 0.06;
    // Follow the focused stone's x so the winding path stays inside the column.
    const wantX = positions[targetIndex].x * 0.55;
    camX += (wantX - camX) * 0.07;

    // Framed so the focused stone sits in the upper third and the stones still
    // to come fill the space below it.
    camera.position.set(camX + cx * 2, camY + 5.2, 21 - cy * 1.6);
    camera.lookAt(camX * 0.8 + cx * 0.8, camY - 3.8, 0);
    key.position.set(camX + 6, camY + 8, 14);

    if (!still) {
      for (const n of nodes) {
        const isCurrent = STAGES.indexOf(n.stage) === targetIndex;
        n.group.rotation.z = Math.sin(time * 0.5 + n.position.y) * 0.05;
        const pulse = isCurrent && n.unlocked ? 1 + Math.sin(time * 3.2) * 0.045 : 1;
        n.group.scale.setScalar(pulse);
        const mat = n.glow.material as SpriteMaterial;
        mat.opacity = n.unlocked
          ? (isCurrent ? 0.75 : 0.45) + Math.sin(time * 2 + n.position.y) * 0.08
          : 0.14;
        if (n.ring) n.ring.rotation.z += dt * 0.5;
      }
      motes.rotation.y += dt * 0.02;
    }

    renderer.render(scene, camera);
  };

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

  raf = requestAnimationFrame(frame);

  return {
    focus,
    refresh(stageId: string) {
      const node = nodes.find((n) => n.stage.id === stageId);
      if (!node) return;
      const prog = store.profile.stages as Record<string, StageProgress>;
      node.stars = prog[stageId]?.stars ?? 0;
      node.unlocked = isUnlocked(node.stage, prog);
      const tex = discTexture(String(node.stage.no), node.stars, node.unlocked, DOMAIN_HUE[node.stage.domain]);
      disposables.push(tex);
      const mat = node.disc.material as MeshBasicMaterial;
      mat.map = tex;
      mat.needsUpdate = true;
      (node.glow.material as SpriteMaterial).color = new Color(
        node.stars > 0 ? GOLD : node.unlocked ? JADE : 0x223040,
      );
      // The next stone may have just unlocked.
      const next = nodes[STAGES.indexOf(node.stage) + 1];
      if (next && !next.unlocked && isUnlocked(next.stage, prog)) {
        next.unlocked = true;
        const t2 = discTexture(String(next.stage.no), 0, true, DOMAIN_HUE[next.stage.domain]);
        disposables.push(t2);
        const m2 = next.disc.material as MeshBasicMaterial;
        m2.map = t2;
        m2.needsUpdate = true;
        (next.glow.material as SpriteMaterial).color = new Color(JADE);
        (next.glow.material as SpriteMaterial).opacity = 0.5;
      }
    },
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      document.removeEventListener('visibilitychange', onVis);
      ro.disconnect();
      for (const d of disposables) d.dispose();
      tube.geometry.dispose();
      (tube.material as MeshStandardMaterial).dispose();
      litTube?.geometry.dispose();
      renderer.dispose();
    },
  };
}

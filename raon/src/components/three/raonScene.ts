// '라온' 다섯 자모(ㄹ·ㅏ·ㅇ·ㅗ·ㄴ)를 광택 있는 입체로 세운 장면.
// 흩어져 있던 자모가 제자리로 모여 글자가 되고, 포인터를 따라 살짝 고개를 돌린다.
import * as T from 'three';

const COLORS = ['#e5483b', '#f2a91e', '#2f6fde', '#1f9e6e', '#8a56e2'];

// 글자 한 칸(1×1) 안의 자모 윤곽. 라(왼쪽 칸)와 온(오른쪽 칸)
const OFF_RA = -1.05;
const OFF_ON = 0.05;
type Poly = { off: number; pts?: number[][]; ring?: { cx: number; cy: number; ro: number; ri: number } };
const POLYS: Poly[] = [
  { off: OFF_RA, pts: [[0.06, 0.88], [0.56, 0.88], [0.56, 0.44], [0.19, 0.44], [0.19, 0.25], [0.6, 0.25], [0.6, 0.12], [0.06, 0.12], [0.06, 0.56], [0.43, 0.56], [0.43, 0.75], [0.06, 0.75]] },
  { off: OFF_RA, pts: [[0.7, 0.95], [0.83, 0.95], [0.83, 0.56], [0.98, 0.56], [0.98, 0.44], [0.83, 0.44], [0.83, 0.05], [0.7, 0.05]] },
  { off: OFF_ON, ring: { cx: 0.5, cy: 0.815, ro: 0.168, ri: 0.066 } },
  { off: OFF_ON, pts: [[0.435, 0.615], [0.565, 0.615], [0.565, 0.51], [0.95, 0.51], [0.95, 0.4], [0.05, 0.4], [0.05, 0.51], [0.435, 0.51]] },
  { off: OFF_ON, pts: [[0.16, 0.32], [0.29, 0.32], [0.29, 0.14], [0.88, 0.14], [0.88, 0.02], [0.16, 0.02]] },
];

function roundedShape(pts: number[][], off: number, r: number) {
  const s = new T.Shape();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const ax = p0[0] - p1[0];
    const ay = p0[1] - p1[1];
    const bx = p2[0] - p1[0];
    const by = p2[1] - p1[1];
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    const rr = Math.min(r, la / 2.2, lb / 2.2);
    const sx = p1[0] + (ax / la) * rr + off;
    const sy = p1[1] + (ay / la) * rr - 0.5;
    const ex = p1[0] + (bx / lb) * rr + off;
    const ey = p1[1] + (by / lb) * rr - 0.5;
    if (i === 0) s.moveTo(sx, sy);
    else s.lineTo(sx, sy);
    s.quadraticCurveTo(p1[0] + off, p1[1] - 0.5, ex, ey);
  }
  s.closePath();
  return s;
}

function ringShape(g: NonNullable<Poly['ring']>, off: number) {
  const s = new T.Shape();
  s.absarc(g.cx + off, g.cy - 0.5, g.ro, 0, Math.PI * 2, false);
  const h = new T.Path();
  h.absarc(g.cx + off, g.cy - 0.5, g.ri, 0, Math.PI * 2, true);
  s.holes.push(h);
  return s;
}

/** 부드러운 조명 상자를 미리 구워 둔 반사 환경 */
function studioEnv(renderer: T.WebGLRenderer) {
  const pmrem = new T.PMREMGenerator(renderer);
  const scene = new T.Scene();
  scene.add(new T.Mesh(new T.BoxGeometry(10, 10, 10), new T.MeshBasicMaterial({ color: new T.Color(0.45, 0.45, 0.45), side: T.BackSide })));
  const panel = (w: number, h: number, x: number, y: number, z: number, k: number) => {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(k, k, k), side: T.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  panel(6, 2.2, 0, 4.9, 0.5, 6);
  panel(2, 4, -4.9, 1, 1.5, 2.6);
  panel(2, 4, 4.9, 0.6, -1, 2.3);
  panel(5, 1.2, 0, 0.8, 4.9, 2.1);
  const tex = pmrem.fromScene(scene, 0.035).texture;
  pmrem.dispose();
  return tex;
}

export interface RaonSceneOptions {
  reduced: boolean;
  onPick?(i: number): void;
  onHover?(i: number): void;
}

export function mountRaon(canvas: HTMLCanvasElement, opts: RaonSceneOptions) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(24, 1, 0.1, 100);
  const env = studioEnv(renderer);
  scene.add(new T.HemisphereLight(0xffffff, 0xf5f5f7, 0.9));
  const key = new T.DirectionalLight(0xffffff, 2.2);
  key.position.set(-3, 5, 6);
  scene.add(key);
  const rim = new T.DirectionalLight(0xffffff, 1.1);
  rim.position.set(3, 2.5, -5);
  scene.add(rim);

  const word = new T.Group();
  scene.add(word);
  const meshes: T.Mesh[] = [];
  const home: T.Vector3[] = [];
  POLYS.forEach((g, i) => {
    const shape = g.ring ? ringShape(g.ring, g.off) : roundedShape(g.pts!, g.off, 0.024);
    const geo = new T.ExtrudeGeometry(shape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.022,
      bevelOffset: -0.008,
      bevelSegments: 5,
      curveSegments: g.ring ? 72 : 8,
    });
    geo.computeBoundingBox();
    const c = new T.Vector3();
    geo.boundingBox!.getCenter(c);
    geo.translate(-c.x, -c.y, -c.z);
    geo.computeVertexNormals();
    const mat = new T.MeshPhysicalMaterial({
      color: new T.Color(COLORS[i]),
      roughness: 0.28,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      envMap: env,
      envMapIntensity: 0.8,
    });
    const m = new T.Mesh(geo, mat);
    m.userData.i = i;
    word.add(m);
    meshes.push(m);
    home.push(c.clone());
  });

  // 바닥에 드리우는 부드러운 그림자
  const sc = document.createElement('canvas');
  sc.width = sc.height = 256;
  const g2 = sc.getContext('2d')!;
  const grd = g2.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0.30)');
  grd.addColorStop(0.45, 'rgba(0,0,0,0.12)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g2.fillStyle = grd;
  g2.fillRect(0, 0, 256, 256);
  const stex = new T.CanvasTexture(sc);
  stex.colorSpace = T.SRGBColorSpace;
  const shadow = new T.Mesh(new T.PlaneGeometry(2.6, 0.9), new T.MeshBasicMaterial({ map: stex, transparent: true, depthWrite: false, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, -0.72, 0);
  scene.add(shadow);

  // 흩어진 출발점: 각 자모가 다른 방향에서 날아와 모인다
  const start = home.map((h, i) => {
    const a = (i / 5) * Math.PI * 2 + 0.6;
    return new T.Vector3(h.x + Math.cos(a) * 1.4, h.y + Math.sin(a) * 0.9 + 0.4, h.z + 1.6 - i * 0.3);
  });
  const spin = [
    [1.2, 2.1, 0.4],
    [-1.4, -1.6, 0.3],
    [1.6, 1.4, 0],
    [-1.1, -2.2, -0.3],
    [0.9, 1.8, -0.5],
  ];
  const pop = [0, 0, 0, 0, 0];
  const popV = [0, 0, 0, 0, 0];

  let W = 1;
  let H = 1;
  function resize() {
    const r = canvas.parentElement!.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    // 글자 폭(약 2.1)이 화면 폭의 72% 를 넘지 않게 거리 조절
    const fitW = 2.25 / (0.74 * 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    const fitH = 1.3 / (0.74 * 2 * Math.tan((camera.fov * Math.PI) / 360));
    const d = Math.max(fitW, fitH);
    camera.position.set(0, Math.sin(0.12) * d, Math.cos(0.12) * d);
    camera.lookAt(0, -0.04, 0);
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement!);

  // 포인터를 따라 고개 돌리기 + 자모 집기
  let tYaw = 0;
  let tPitch = 0;
  let yaw = 0;
  let pitch = 0;
  let hover = -1;
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  function pickAt(x: number, y: number) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(meshes, false)[0];
    return hit ? (hit.object.userData.i as number) : -1;
  }
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    tYaw = ((e.clientX - r.left) / r.width - 0.5) * 0.5;
    tPitch = ((e.clientY - r.top) / r.height - 0.5) * 0.22;
    const h = pickAt(e.clientX, e.clientY);
    if (h !== hover) {
      hover = h;
      canvas.style.cursor = h >= 0 ? 'pointer' : '';
      opts.onHover?.(h);
    }
    wake();
  };
  const onLeave = () => {
    tYaw = 0;
    tPitch = 0;
    if (hover !== -1) opts.onHover?.(-1);
    hover = -1;
    wake();
  };
  const onDown = (e: PointerEvent) => {
    const i = pickAt(e.clientX, e.clientY);
    if (i >= 0) popPiece(i);
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);

  function popPiece(i: number) {
    popV[i] += 7;
    opts.onPick?.(i);
    wake();
  }

  // 화면에 보일 때만 그린다
  let visible = true;
  const io = new IntersectionObserver((es) => {
    visible = es[0]?.isIntersecting ?? true;
    if (visible) wake();
  });
  io.observe(canvas);

  const t0 = performance.now();
  let raf = 0;
  let last = t0;
  const ASSEMBLE = opts.reduced ? 0 : 1.9;
  function frame(now: number) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;
    let busy = false;
    for (let i = 0; i < 5; i++) {
      const m = meshes[i];
      // 차례로 날아와 앉기 (조금 튕기며)
      const local = ASSEMBLE ? Math.min(1, Math.max(0, (t - 0.15 - i * 0.12) / (ASSEMBLE - 0.5))) : 1;
      const e = local < 1 ? 1 - Math.pow(1 - local, 3) * Math.cos(local * 4.2) : 1;
      if (local < 1) busy = true;
      m.position.lerpVectors(start[i], home[i], e);
      const k = 1 - e;
      m.rotation.set(spin[i][0] * k, spin[i][1] * k, spin[i][2] * k);
      // 집었을 때 튀어 오르는 스프링
      popV[i] += (-pop[i] * 160 - popV[i] * 14) * dt;
      pop[i] += popV[i] * dt;
      if (Math.abs(pop[i]) > 0.0005 || Math.abs(popV[i]) > 0.0005) busy = true;
      m.position.z += pop[i] * 0.35;
      m.scale.setScalar(1 + pop[i] * 0.5 + (hover === i ? 0.04 : 0));
      // 쉬는 동안 천천히 숨쉬듯 뜨기
      if (!opts.reduced && local >= 1) m.position.y += Math.sin(t * 1.3 + i * 1.1) * 0.012;
    }
    yaw += (tYaw - yaw) * Math.min(1, dt * 5);
    pitch += (tPitch - pitch) * Math.min(1, dt * 5);
    const sway = opts.reduced ? 0 : Math.sin(t * 0.45) * 0.08;
    word.rotation.y = yaw + sway;
    word.rotation.x = pitch;
    renderer.render(scene, camera);
    if (Math.abs(tYaw - yaw) > 0.001 || Math.abs(tPitch - pitch) > 0.001) busy = true;
    if (visible && (busy || !opts.reduced)) raf = requestAnimationFrame(frame);
  }
  function wake() {
    if (!raf && visible) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }
  wake();

  return {
    pop: popPiece,
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      meshes.forEach((m) => {
        m.geometry.dispose();
        (m.material as T.Material).dispose();
      });
      env.dispose();
      stex.dispose();
      renderer.dispose();
    },
  };
}

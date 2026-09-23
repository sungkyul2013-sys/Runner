// Garage viewer for the published Artifact: the app's own VehicleModel loader (same GLBs, materials and procedural
// wheels as APEX_SIM), a studio floor and orbit camera — no physics (an Artifact has no cross-origin isolation, so the
// SharedArrayBuffer physics worker cannot run there). Built as one ES module: vite build -c tools/artifact/vite.config.ts
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadVehicleModel, type VehicleMeta, type VehicleModel } from '../../web/src/vehicles/VehicleModel';

export type ViewId = 'three' | 'side' | 'front' | 'rear' | 'top';

const VIEWS: Record<ViewId, { pos: [number, number, number]; target: [number, number, number] }> = {
  three: { pos: [5.2, 2.0, 6.2], target: [0, 0.75, 0] },
  side: { pos: [8.4, 0.95, 0], target: [0, 0.75, 0] },
  front: { pos: [0, 1.05, 8.2], target: [0, 0.75, 0] },
  rear: { pos: [0, 1.25, -8.2], target: [0, 0.75, 0] },
  top: { pos: [0, 9.5, 0.01], target: [0, 0.6, 0] },
};

/** GLB bytes: `*.glb.txt` files hold the GLB as base64 (Artifacts serve no binary model type). */
async function fetchGlb(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  if (!url.endsWith('.txt')) return res.arrayBuffer();
  const bin = atob((await res.text()).trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export interface Garage {
  show(url: string): Promise<VehicleMeta>; // .glb, or .glb.txt (base64)
  view(id: ViewId): void;
  setSpin(on: boolean): void;
}

export async function createGarage(canvas: HTMLCanvasElement, background: string): Promise<Garage> {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  await renderer.init();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  scene.fog = new THREE.Fog(background, 16, 38);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xc9d6ff, 0x1a1c20, 0.9));
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.6);
  sun.position.set(-6, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // Studio floor: a matte disc with a faint turntable ring at the car's footprint.
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 96), new THREE.MeshStandardNodeMaterial({ color: 0x14171c, roughness: 0.9, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.35, 3.38, 160), new THREE.MeshBasicNodeMaterial({ color: 0x2a303a }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  scene.add(ring);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
  camera.position.set(...VIEWS.three.pos);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(...VIEWS.three.target);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 2.5;
  controls.maxDistance = 16;
  controls.autoRotateSpeed = 0.8;

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let fly: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number } | null = null;
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (fly) {
      fly.t = Math.min(1, fly.t + dt / 0.7);
      const e = 1 - (1 - fly.t) ** 3;
      camera.position.lerpVectors(fly.from, fly.to, e);
      controls.target.lerpVectors(fly.tFrom, fly.tTo, e);
      if (fly.t >= 1) fly = null;
    }
    controls.update();
    renderer.render(scene, camera);
  });

  const cache = new Map<string, Promise<VehicleModel>>();
  let current: VehicleModel | null = null;
  return {
    async show(url) {
      if (!cache.has(url)) cache.set(url, fetchGlb(url).then(loadVehicleModel));
      const model = await cache.get(url)!;
      if (current) scene.remove(current.root);
      current = model;
      scene.add(model.root);
      return model.meta;
    },
    view(id) {
      const v = VIEWS[id];
      const to = new THREE.Vector3(...v.pos), tTo = new THREE.Vector3(...v.target);
      if (reduced.matches) {
        camera.position.copy(to);
        controls.target.copy(tTo);
        fly = null;
        return;
      }
      fly = { from: camera.position.clone(), to, tFrom: controls.target.clone(), tTo, t: 0 };
    },
    setSpin(on) {
      controls.autoRotate = on && !reduced.matches;
    },
  };
}

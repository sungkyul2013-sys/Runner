// Loads an APEX_SIM vehicle visual (GLB from tools/vehicle-import) and assembles body + four wheels + calipers.
// The physics body drives these meshes from M1 (node binding) and M2 (GPU flexbody deformation).
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface VehicleWheelMeta {
  position: [number, number, number]; // [m] hub centre, vehicle frame (+Z forward, +Y up, +X left)
  side: 'left' | 'right';
  axle: 'front' | 'rear';
}

export interface VehicleMeta {
  id: string;
  name: { ko: string; en: string };
  dimensions: { length: number; width: number; height: number };
  wheelbase: number;
  wheels: VehicleWheelMeta[];
  // meshSide: which side the baked wheel mesh belongs to (the other side mirrors it); null for procedural wheels,
  // which are built for the left side (outer face +X).
  wheel: { radius: number; width: number; meshSide: 'left' | 'right' | null; procedural?: boolean; rimRadius?: number } | null;
  source: string;
  license: string;
}

export interface VehicleModel {
  root: THREE.Group; // vehicle frame
  body: THREE.Object3D;
  wheels: THREE.Object3D[]; // one pivot per wheel (rotate about local X to spin)
  meta: VehicleMeta;
}

/** Real tyre sizes where a bake only carries the rim (outer radius / section width, metres). */
const TYRE_OVERRIDES: Record<string, { outerRadius: number; width: number }> = {
  rolls_royce_ghost: { outerRadius: 0.369, width: 0.255 }, // 255/50 R19
};

function materialFor(role: string | undefined): THREE.Material {
  switch (role) {
    case 'paint':
      return new THREE.MeshPhysicalNodeMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 });
    case 'glass':
      return new THREE.MeshPhysicalNodeMaterial({ color: 0x151b22, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    case 'lamp':
      return new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.9 });
    case 'tire':
      return new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    case 'rim':
      return new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.85 });
    case 'caliper':
      return new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35 });
    default:
      return new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 });
  }
}

/** Torus-like tyre around the X axis (for bakes whose wheel mesh has no tyre). */
function tyreGeometry(innerRadius: number, outerRadius: number, width: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const h = width / 2, wall = outerRadius - innerRadius, shoulder = Math.min(wall * 0.45, h * 0.6);
  // profile in (radius, axial) — lathe revolves around Y, rotated to X afterwards
  pts.push(new THREE.Vector2(innerRadius, -h * 0.92));
  pts.push(new THREE.Vector2(outerRadius - shoulder, -h));
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(outerRadius - shoulder + Math.sin(a) * shoulder, -h + shoulder - Math.cos(a) * shoulder));
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(outerRadius - shoulder + Math.cos(a) * shoulder, h - shoulder + Math.sin(a) * shoulder));
  }
  pts.push(new THREE.Vector2(innerRadius, h * 0.92));
  const g = new THREE.LatheGeometry(pts, 48);
  g.rotateZ(Math.PI / 2); // lathe axis Y → X
  return g;
}

/** Multi-spoke alloy for cars whose bake carries no wheel mesh (outer face toward +X, i.e. a left wheel). */
function proceduralWheel(rimRadius: number, outerRadius: number, width: number): THREE.Group {
  const g = new THREE.Group();
  const alloy = new THREE.MeshStandardNodeMaterial({ color: 0xc9ced4, roughness: 0.22, metalness: 0.9 });
  const dark = new THREE.MeshStandardNodeMaterial({ color: 0x2a2e33, roughness: 0.5, metalness: 0.6 });
  const tyre = new THREE.Mesh(tyreGeometry(rimRadius, outerRadius, width), new THREE.MeshStandardNodeMaterial({ color: 0x141619, roughness: 0.93 }));
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rimRadius, rimRadius, width * 0.86, 40, 1, true).rotateZ(Math.PI / 2), dark);
  barrel.material.side = THREE.DoubleSide;
  const face = width * 0.36; // spoke plane, slightly inside the outer bead
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rimRadius * 0.985, rimRadius * 0.035, 8, 48).rotateY(Math.PI / 2), alloy);
  lip.position.x = width * 0.43;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(rimRadius * 0.24, rimRadius * 0.26, width * 0.2, 24).rotateZ(Math.PI / 2), alloy);
  hub.position.x = face;
  g.add(tyre, barrel, lip, hub);
  const SPOKES = 10;
  for (let i = 0; i < SPOKES; i++) {
    const len = rimRadius * 0.72;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(width * 0.14, len, rimRadius * 0.11), alloy);
    spoke.position.set(face, rimRadius * 0.24 + len / 2, 0);
    const pivot = new THREE.Group();
    pivot.rotation.x = (i / SPOKES) * Math.PI * 2;
    pivot.add(spoke);
    g.add(pivot);
  }
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : undefined));
  return g;
}

const loader = new GLTFLoader();

export async function loadVehicleModel(url: string): Promise<VehicleModel> {
  const gltf = await loader.loadAsync(url);
  const meta = gltf.scene.userData.apex as VehicleMeta;
  const root = new THREE.Group();
  root.name = meta.id;

  const bodyNode = gltf.scene.getObjectByName('body');
  if (!bodyNode) throw new Error(`${url}: no body node`);
  bodyNode.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.material = materialFor((m.material as THREE.Material).userData?.apexRole);
    m.castShadow = true;
    m.receiveShadow = true;
  });
  root.add(bodyNode);

  const wheelTemplate = gltf.scene.getObjectByName('wheel') ?? null;
  const caliperTemplate = gltf.scene.getObjectByName('caliper') ?? null;
  for (const t of [wheelTemplate, caliperTemplate]) {
    t?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = materialFor((m.material as THREE.Material).userData?.apexRole);
      m.castShadow = true;
    });
  }
  const override = TYRE_OVERRIDES[meta.id];
  const tyre = override && meta.wheel ? tyreGeometry(meta.wheel.radius * 0.97, override.outerRadius, override.width) : null;
  const tyreMaterial = tyre ? new THREE.MeshStandardNodeMaterial({ color: 0x15171a, roughness: 0.93, metalness: 0 }) : null;

  const wheels: THREE.Object3D[] = [];
  for (const w of meta.wheels) {
    const mount = new THREE.Group(); // steering pivot (M1: rotate about Y)
    mount.position.fromArray(w.position);
    const spin = new THREE.Group(); // rotates about X with the wheel
    mount.add(spin);
    const bakedSide = meta.wheel?.procedural ? 'left' : meta.wheel?.meshSide;
    const mirror = !!bakedSide && w.side !== bakedSide;
    if (wheelTemplate) spin.add(wheelTemplate.clone());
    if (meta.wheel?.procedural) spin.add(proceduralWheel(meta.wheel.rimRadius ?? meta.wheel.radius * 0.7, meta.wheel.radius, meta.wheel.width));
    if (tyre && tyreMaterial) {
      const t = new THREE.Mesh(tyre, tyreMaterial);
      t.castShadow = true;
      spin.add(t);
    }
    if (caliperTemplate) mount.add(caliperTemplate.clone()); // calipers steer but do not spin
    if (mirror) mount.scale.x = -1;
    root.add(mount);
    wheels.push(spin);
  }
  return { root, body: bodyNode, wheels, meta };
}

export const VEHICLES = [
  { id: 'porsche_911_turbo_991', url: 'vehicles/porsche_911_turbo_991/porsche_911_turbo_991.glb' },
  { id: 'rolls_royce_ghost', url: 'vehicles/rolls_royce_ghost/rolls_royce_ghost.glb' },
  { id: 'maybach_gls', url: 'vehicles/maybach_gls/maybach_gls.glb' },
] as const;

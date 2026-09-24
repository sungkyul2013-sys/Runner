// Loads an APEX_SIM vehicle visual (GLB from tools/vehicle-import) and assembles body + four wheels + calipers.
// The physics body drives these meshes from M1 (node binding) and M2 (GPU flexbody deformation).
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface VehicleWheelMeta {
  position: [number, number, number]; // [m] hub centre, vehicle frame (+Z forward, +Y up, +X left)
  side: 'left' | 'right';
  axle: 'front' | 'rear';
  // Fitted wheels (tools/vehicle-import: sized from the body's wheel arches) carry their own tyre size.
  radius?: number;
  width?: number;
  rimRadius?: number;
}

/** Procedural wheel designs (the user's cars whose bakes carry no usable wheel mesh). */
export type WheelStyleId = 'ghost' | 'maybach' | 'default';

export interface VehicleMeta {
  id: string;
  name: { ko: string; en: string };
  dimensions: { length: number; width: number; height: number };
  wheelbase: number;
  wheels: VehicleWheelMeta[];
  // meshSide: which side the baked wheel mesh belongs to (the other side mirrors it); null for procedural wheels,
  // which are built for the left side (outer face +X).
  wheel: {
    radius: number;
    width: number;
    meshSide: 'left' | 'right' | null;
    procedural?: boolean;
    rimRadius?: number;
    style?: WheelStyleId;
  } | null;
  source: string;
  license: string;
}

export interface VehicleModel {
  root: THREE.Group; // vehicle frame
  body: THREE.Object3D;
  wheels: THREE.Object3D[]; // one pivot per wheel (rotate about local X to spin)
  meta: VehicleMeta;
}

// Every car surface is double-sided (as in the user's Crash Lab renderer): scanned and converted models carry panels
// with inconsistent winding, and single-sided they show holes — lamp housings, grille surrounds, bumper returns.
function materialFor(role: string | undefined): THREE.Material {
  const m = baseMaterial(role);
  m.userData.apexRole = role; // the flexbody picks out glass and lamps by it
  return m;
}

function baseMaterial(role: string | undefined): THREE.Material {
  const side = THREE.DoubleSide;
  switch (role) {
    case 'paint':
      return new THREE.MeshPhysicalNodeMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06, side });
    case 'glass':
      return new THREE.MeshPhysicalNodeMaterial({ color: 0x151b22, metalness: 0, roughness: 0.06, specularIntensity: 0.6, transparent: true, opacity: 0.66, side });
    case 'tint':
      // Privacy/panoramic-roof glass: nearly opaque; a softer reflection than clear glass (a flat roof pane mirrors the
      // whole sky and would read as white).
      // (envMapIntensity does not scale scene.environment for node materials: the reflection is cut through the
      // specular level instead.)
      return new THREE.MeshPhysicalNodeMaterial({ color: 0x05070a, metalness: 0, roughness: 0.22, specularIntensity: 0.2, transparent: true, opacity: 0.97, side });
    case 'lamp':
      // Self-lit lens (unlit vertex colour, slightly translucent), not a clear window into an empty housing.
      return new THREE.MeshBasicNodeMaterial({ vertexColors: true, transparent: true, opacity: 0.92, side, toneMapped: false });
    case 'chrome':
      // Dark chrome lamp housing (the user's Crash Lab MAT_CHROME_DARK: 0x2d3238, low reflection, sharp highlight).
      return new THREE.MeshStandardNodeMaterial({ color: 0x2d3238, metalness: 0.7, roughness: 0.2, side });
    case 'tire':
      return new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side });
    case 'rim':
      return new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.85, side });
    case 'caliper':
      return new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35, side });
    default:
      return new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15, side });
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

interface WheelStyle {
  spokes: number; // spoke count (twin spokes count as one)
  twin: boolean; // each spoke split into a pair
  spokeWidth: number; // × rim radius
  face: number; // spoke / lip colour
  inner: number; // barrel and pocket colour
  cap: number; // centre cap
  capRing: number;
  caliper: number;
  dish: number; // [× width] how far the hub sits inboard of the spoke roots (concave face)
}

const WHEEL_STYLES: Record<WheelStyleId, WheelStyle> = {
  // Rolls-Royce Ghost: 7 polished twin spokes, deep dish, dark floating centre cap with a bright ring.
  ghost: { spokes: 7, twin: true, spokeWidth: 0.07, face: 0xd8dde3, inner: 0x3a3e44, cap: 0x15171b, capRing: 0xe8ecf0, caliper: 0x2c3036, dish: 0.12 },
  // Maybach: 20 slim spokes, bright silver face on dark pockets, silver cap.
  maybach: { spokes: 20, twin: false, spokeWidth: 0.045, face: 0xcfd4da, inner: 0x24272c, cap: 0xb9bec4, capRing: 0x2a2d31, caliper: 0x1c1e22, dish: 0.05 },
  default: { spokes: 10, twin: false, spokeWidth: 0.11, face: 0xc9ced4, inner: 0x2a2e33, cap: 0xc9ced4, capRing: 0x2a2e33, caliper: 0x3a3d42, dish: 0.06 },
};

/** Procedural wheel, outer face toward +X (a left wheel; the right side mirrors it). `spin` rotates about X with
 *  the wheel; `fixed` (the brake caliper) stays with the upright. */
function proceduralWheel(rimRadius: number, outerRadius: number, width: number, styleId: WheelStyleId = 'default'): { spin: THREE.Group; fixed: THREE.Group } {
  const st = WHEEL_STYLES[styleId] ?? WHEEL_STYLES.default;
  const spin = new THREE.Group();
  const fixed = new THREE.Group();
  const face = new THREE.MeshStandardNodeMaterial({ color: st.face, roughness: 0.18, metalness: 0.92 });
  const inner = new THREE.MeshStandardNodeMaterial({ color: st.inner, roughness: 0.55, metalness: 0.6, side: THREE.DoubleSide });
  const rubber = new THREE.MeshStandardNodeMaterial({ color: 0x141619, roughness: 0.93 });
  const tyre = new THREE.Mesh(tyreGeometry(rimRadius, outerRadius, width), rubber);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rimRadius, rimRadius, width * 0.86, 48, 1, true).rotateZ(Math.PI / 2), inner);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rimRadius * 0.99, rimRadius * 0.03, 8, 64).rotateY(Math.PI / 2), face);
  lip.position.x = width * 0.43;
  // Brake: ventilated disc (spins) inside the barrel, caliper at the trailing top (does not spin).
  const discR = rimRadius * 0.82;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(discR, discR, width * 0.12, 48).rotateZ(Math.PI / 2),
    new THREE.MeshStandardNodeMaterial({ color: 0x6b6f75, roughness: 0.45, metalness: 0.85 }));
  disc.position.x = -width * 0.05;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(rimRadius * 0.3, rimRadius * 0.3, width * 0.3, 32).rotateZ(Math.PI / 2), inner);
  hat.position.x = width * 0.08;
  spin.add(tyre, barrel, lip, disc, hat);

  const faceX = width * 0.36; // spoke roots at the rim, just inside the outer bead
  const hubX = faceX - width * st.dish;
  const hubR = rimRadius * 0.24;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(hubR, hubR * 1.08, width * 0.16, 32).rotateZ(Math.PI / 2), face);
  hub.position.x = hubX;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(hubR * 0.62, hubR * 0.62, width * 0.03, 32).rotateZ(Math.PI / 2),
    new THREE.MeshStandardNodeMaterial({ color: st.cap, roughness: 0.3, metalness: 0.7 }));
  cap.position.x = hubX + width * 0.085;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(hubR * 0.66, hubR * 0.06, 8, 32).rotateY(Math.PI / 2),
    new THREE.MeshStandardNodeMaterial({ color: st.capRing, roughness: 0.2, metalness: 0.9 }));
  ring.position.x = cap.position.x + width * 0.01;
  spin.add(hub, cap, ring);

  // Spokes: from the hub to the rim, rising outward by the dish (a concave face).
  const len = rimRadius * 0.98 - hubR;
  const thick = width * 0.1;
  const spokeGeom = (w: number) => {
    const g = new THREE.BoxGeometry(thick, len, w);
    g.translate(0, hubR + len / 2, 0);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = (y - hubR) / len; // 0 at the hub … 1 at the rim
      pos.setX(i, pos.getX(i) + hubX + (faceX - hubX) * t);
      pos.setZ(i, pos.getZ(i) * (1.25 - 0.45 * t)); // taper toward the rim
    }
    g.computeVertexNormals();
    return g;
  };
  const w = rimRadius * st.spokeWidth;
  const single = spokeGeom(w);
  for (let i = 0; i < st.spokes; i++) {
    const base = (i / st.spokes) * Math.PI * 2;
    const angles = st.twin ? [base - 0.07, base + 0.07] : [base];
    for (const a of angles) {
      const spoke = new THREE.Mesh(single, face);
      spoke.rotation.x = a;
      spin.add(spoke);
    }
  }
  // Pocket backing between the spokes (so the face does not look hollow from a distance).
  const back = new THREE.Mesh(new THREE.RingGeometry(hubR, rimRadius * 0.97, 48).rotateY(Math.PI / 2), inner);
  back.position.x = hubX - width * 0.12;
  spin.add(back);

  const caliper = new THREE.Mesh(new THREE.BoxGeometry(width * 0.26, rimRadius * 0.34, rimRadius * 0.5),
    new THREE.MeshStandardNodeMaterial({ color: st.caliper, roughness: 0.4, metalness: 0.4 }));
  caliper.position.set(width * 0.02, discR * 0.72, -discR * 0.45); // trailing top of the disc (−Z is rearward)
  caliper.rotation.x = -0.56;
  fixed.add(caliper);
  for (const g of [spin, fixed]) g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : undefined));
  return { spin, fixed };
}

const loader = new GLTFLoader();

// Builds for hosts that serve no .glb (Claude Artifacts): every model ships as `<name>.glb.txt`, base64.
const GLB_AS_BASE64 = import.meta.env.VITE_APEX_GLB_BASE64 === '1';

async function fetchBase64(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const text = atob((await res.text()).trim());
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes.buffer;
}

/** Loads from a URL, or parses GLB bytes already in memory (the garage Artifact, whose host serves no .glb). */
export async function loadVehicleModel(source: string | ArrayBuffer): Promise<VehicleModel> {
  const url = typeof source === 'string' ? source : 'GLB';
  if (typeof source === 'string' && GLB_AS_BASE64) source = await fetchBase64(`${source}.txt`);
  const gltf = typeof source === 'string' ? await loader.loadAsync(source) : await loader.parseAsync(source, '');
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

  const wheels: THREE.Object3D[] = [];
  for (const w of meta.wheels) {
    const mount = new THREE.Group(); // steering pivot (M1: rotate about Y)
    mount.position.fromArray(w.position);
    const spin = new THREE.Group(); // rotates about X with the wheel
    mount.add(spin);
    const bakedSide = meta.wheel?.procedural ? 'left' : meta.wheel?.meshSide;
    const mirror = !!bakedSide && w.side !== bakedSide;
    if (wheelTemplate) spin.add(wheelTemplate.clone());
    if (meta.wheel?.procedural) {
      const radius = w.radius ?? meta.wheel.radius;
      const pw = proceduralWheel(w.rimRadius ?? meta.wheel.rimRadius ?? radius * 0.7, radius, w.width ?? meta.wheel.width, meta.wheel.style);
      spin.add(pw.spin);
      mount.add(pw.fixed);
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

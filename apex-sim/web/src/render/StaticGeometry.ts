// Renders the static collision triangles exactly as the physics core sees them (§1.2 보이는 것 = 물리).
import * as THREE from 'three/webgpu';

/** Core material ids (sbc/scenes.h material::) → surface colour. */
export const MATERIAL_COLORS: Record<number, number> = {
  0: 0x8a9099, // steel
  1: 0x6d737c, // concrete
  2: 0x1a1c1f, // rubber
  3: 0x3b3f45, // asphalt
  4: 0xd9a520, // spike strip (warning yellow)
};

export class StaticGeometry {
  private mesh: THREE.Mesh | null = null;
  private readonly material = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });

  constructor(private readonly scene: THREE.Scene) {}

  /** `triangles`: 9 floats per triangle, world coordinates; `origin`: render origin; `materials`: core material id per
   *  triangle (coloured by MATERIAL_COLORS). */
  set(triangles: Float32Array, origin: [number, number, number], materials: Uint8Array = new Uint8Array(0)): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (triangles.length === 0) return;
    const positions = new Float32Array(triangles.length);
    for (let i = 0; i < triangles.length; i += 3) {
      positions[i] = triangles[i] - origin[0];
      positions[i + 1] = triangles[i + 1] - origin[1];
      positions[i + 2] = triangles[i + 2] - origin[2];
    }
    const colors = new Float32Array(triangles.length);
    const c = new THREE.Color();
    for (let t = 0; t < triangles.length / 9; t++) {
      c.setHex(MATERIAL_COLORS[materials[t] ?? 1] ?? MATERIAL_COLORS[1]).convertSRGBToLinear();
      for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], t * 9 + k * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals(); // non-indexed → flat faces
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'static-collision';
    this.scene.add(this.mesh);
  }
}

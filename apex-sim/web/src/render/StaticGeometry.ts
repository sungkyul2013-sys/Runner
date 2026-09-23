// Renders the static collision triangles exactly as the physics core sees them (§1.2 보이는 것 = 물리).
import * as THREE from 'three/webgpu';

export class StaticGeometry {
  private mesh: THREE.Mesh | null = null;
  private readonly material = new THREE.MeshStandardNodeMaterial({ color: 0x6d737c, roughness: 0.92, metalness: 0 });

  constructor(private readonly scene: THREE.Scene) {}

  /** `triangles`: 9 floats per triangle, world coordinates; `origin`: render origin. */
  set(triangles: Float32Array, origin: [number, number, number]): void {
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
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.computeVertexNormals(); // non-indexed → flat faces
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'static-collision';
    this.scene.add(this.mesh);
  }
}

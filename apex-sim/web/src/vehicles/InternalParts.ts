// Internal parts (§4.4): the engine and gearbox are node blocks of their own in the physics (vehicle generator:
// visual.internals). Each is drawn as a box through its block's eight corner nodes, wherever those nodes are — in the
// car on their mounts, or torn loose into a body of their own — so what the physics carries is what is seen (§1.2).
import * as THREE from 'three/webgpu';
import type { RenderFrame } from '../physics/PhysicsClient';

/** A block's corners by node id, bit 0: +x, bit 1: +y, bit 2: +z (the generator's order). */
export interface InternalPartDef {
  kind: string;
  corners: string[];
}

// Box faces as corner indices, counter-clockwise seen from outside.
const FACES = [
  [0, 2, 3, 1], // −z
  [4, 5, 7, 6], // +z
  [0, 1, 5, 4], // −y
  [2, 6, 7, 3], // +y
  [0, 4, 6, 2], // −x
  [1, 3, 7, 5], // +x
];

const COLORS: Record<string, number> = { engine: 0x3b3e44, gearbox: 0x5a5d63 };

export class InternalParts {
  readonly group = new THREE.Group();
  private readonly parts: Array<{ mesh: THREE.Mesh; corners: number[] }> = [];
  private readonly located = new Set<number>();

  /** `nodeIndex`: body node index of a node id (its position in the document's node list). */
  constructor(defs: InternalPartDef[], nodeIndex: (id: string) => number) {
    for (const def of defs) {
      const corners = def.corners.map(nodeIndex);
      if (corners.length !== 8 || corners.some((i) => i < 0)) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const index: number[] = [];
      for (let f = 0; f < 6; f++) index.push(4 * f, 4 * f + 1, 4 * f + 2, 4 * f, 4 * f + 2, 4 * f + 3);
      geometry.setIndex(index);
      const material = new THREE.MeshStandardNodeMaterial({ color: COLORS[def.kind] ?? 0x4a4d52, roughness: 0.5, metalness: 0.55 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.visible = false;
      this.group.add(mesh);
      this.parts.push({ mesh, corners });
    }
  }

  get count(): number {
    return this.parts.length;
  }

  /** Bodies that carry internal-part corners now (other than the vehicle's own): drawn here, not as loose nodes. */
  get bodies(): Set<number> {
    return this.located;
  }

  update(frame: RenderFrame | null, body: number, locate: (body: number, node: number) => [number, number]): void {
    this.located.clear();
    for (const part of this.parts) {
      const pos = part.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      let ok = !!frame;
      const p: number[][] = [];
      for (const c of part.corners) {
        if (!frame) break;
        const [b, n] = locate(body, c);
        if (b >= frame.bodyCount || n >= frame.nodeCount[b]) { ok = false; break; }
        if (b !== body) this.located.add(b);
        const o = (frame.nodeOffset[b] + n) * 3;
        p.push([frame.positions[o], frame.positions[o + 1], frame.positions[o + 2]]);
      }
      part.mesh.visible = ok;
      if (!ok) continue;
      FACES.forEach((face, f) => face.forEach((c, k) => pos.setXYZ(4 * f + k, p[c][0], p[c][1], p[c][2])));
      pos.needsUpdate = true;
      part.mesh.geometry.computeVertexNormals();
      part.mesh.geometry.computeBoundingSphere();
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const { mesh } of this.parts) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}

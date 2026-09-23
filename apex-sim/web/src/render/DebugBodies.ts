// Physics debug visualisation (§20): nodes as spheres at their true collision radius, beams as lines coloured by
// strain (tension red, compression blue), broken beams hidden. One instanced draw for all nodes and one line draw
// for all beams, whatever the number of bodies.
import * as THREE from 'three/webgpu';
import type { BodyTopology } from '../physics/messages';
import type { RenderFrame } from '../physics/PhysicsClient';
import { BODY_TINTS, strainColor } from './palette';

const INITIAL_NODES = 4096;
const INITIAL_BEAMS = 32768;

export class DebugBodies {
  showNodes = true;
  showBeams = true;
  private nodes: THREE.InstancedMesh;
  private beams: THREE.LineSegments;
  private nodeCapacity = 0;
  private beamCapacity = 0;
  private colorsDirty = true;
  private tint = new THREE.Color();

  constructor(private readonly scene: THREE.Scene, private readonly topology: BodyTopology[]) {
    this.nodes = this.makeNodes(INITIAL_NODES);
    this.beams = this.makeBeams(INITIAL_BEAMS);
  }

  /** Call when bodies were added or the scene was reset. */
  topologyChanged(): void {
    this.colorsDirty = true;
  }

  update(frame: RenderFrame | null): void {
    if (!frame) {
      this.nodes.count = 0;
      this.beams.geometry.setDrawRange(0, 0);
      return;
    }
    let totalNodes = 0, totalBeams = 0;
    for (let b = 0; b < frame.bodyCount; b++) {
      totalNodes += frame.nodeCount[b];
      totalBeams += frame.beamCount[b];
    }
    if (totalNodes > this.nodeCapacity) this.nodes = this.replace(this.nodes, this.makeNodes(grow(totalNodes)));
    if (totalBeams > this.beamCapacity) this.beams = this.replace(this.beams, this.makeBeams(grow(totalBeams)));
    this.updateNodes(frame, totalNodes);
    this.updateBeams(frame, totalBeams);
  }

  private updateNodes(frame: RenderFrame, total: number): void {
    const m = this.nodes.instanceMatrix.array as Float32Array;
    const pos = frame.positions;
    for (let b = 0; b < frame.bodyCount; b++) {
      const topo = this.topology[b];
      const start = frame.nodeOffset[b];
      for (let i = 0; i < frame.nodeCount[b]; i++) {
        const k = start + i, o = k * 16, p = k * 3;
        const r = topo ? topo.radius[i] : 0.05;
        m[o] = r; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
        m[o + 4] = 0; m[o + 5] = r; m[o + 6] = 0; m[o + 7] = 0;
        m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = r; m[o + 11] = 0;
        m[o + 12] = pos[p]; m[o + 13] = pos[p + 1]; m[o + 14] = pos[p + 2]; m[o + 15] = 1;
      }
    }
    this.nodes.count = this.showNodes ? total : 0;
    this.nodes.instanceMatrix.needsUpdate = true;
    if (this.colorsDirty && this.nodes.instanceColor) {
      for (let b = 0; b < frame.bodyCount; b++) {
        this.tint.setHex(BODY_TINTS[b % BODY_TINTS.length]);
        for (let i = 0; i < frame.nodeCount[b]; i++) this.nodes.setColorAt(frame.nodeOffset[b] + i, this.tint);
      }
      this.nodes.instanceColor.needsUpdate = true;
      this.colorsDirty = false;
    }
    this.nodes.computeBoundingSphere();
  }

  private updateBeams(frame: RenderFrame, total: number): void {
    const g = this.beams.geometry;
    const pa = g.getAttribute('position') as THREE.BufferAttribute;
    const ca = g.getAttribute('color') as THREE.BufferAttribute;
    const out = pa.array as Float32Array, col = ca.array as Float32Array;
    const pos = frame.positions;
    let v = 0;
    for (let b = 0; b < frame.bodyCount; b++) {
      const topo = this.topology[b];
      if (!topo) continue;
      const nodeBase = frame.nodeOffset[b] * 3;
      const beamBase = frame.beamOffset[b];
      for (let i = 0; i < frame.beamCount[b]; i++) {
        if (!strainColor(frame.strain[beamBase + i], col, v * 3)) continue; // broken beams are skipped
        col.copyWithin(v * 3 + 3, v * 3, v * 3 + 3);
        const a = nodeBase + topo.beamA[i] * 3, c = nodeBase + topo.beamB[i] * 3;
        out[v * 3] = pos[a]; out[v * 3 + 1] = pos[a + 1]; out[v * 3 + 2] = pos[a + 2];
        out[v * 3 + 3] = pos[c]; out[v * 3 + 4] = pos[c + 1]; out[v * 3 + 5] = pos[c + 2];
        v += 2;
      }
    }
    g.setDrawRange(0, this.showBeams ? Math.min(v, total * 2) : 0);
    pa.needsUpdate = true;
    ca.needsUpdate = true;
    g.computeBoundingSphere();
  }

  private makeNodes(capacity: number): THREE.InstancedMesh {
    const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0.1 });
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, this.tint.setHex(BODY_TINTS[0]));
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.name = 'debug-nodes';
    this.nodeCapacity = capacity;
    this.colorsDirty = true;
    this.scene.add(mesh);
    return mesh;
  }

  private makeBeams(capacity: number): THREE.LineSegments {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 6), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(capacity * 6), 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const lines = new THREE.LineSegments(g, new THREE.LineBasicNodeMaterial({ vertexColors: true }));
    lines.frustumCulled = false;
    lines.name = 'debug-beams';
    this.beamCapacity = capacity;
    this.scene.add(lines);
    return lines;
  }

  private replace<T extends THREE.Mesh | THREE.LineSegments>(old: T, next: T): T {
    this.scene.remove(old);
    old.geometry.dispose();
    (old.material as THREE.Material).dispose();
    return next;
  }
}

function grow(n: number): number {
  return 1 << Math.ceil(Math.log2(n * 1.5));
}

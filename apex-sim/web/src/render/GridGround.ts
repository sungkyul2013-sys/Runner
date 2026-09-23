// Infinite grid map (§13.3-6): an endless flat ground with 1 m / 10 m grid lines and distance markers.
// The plane follows the camera target (snapped to whole grid cells) so it never ends; lines are computed per pixel
// in world space, so they stay put while the mesh moves.
import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { abs, cameraPosition, clamp, color, float, fract, fwidth, length, min, mix, positionWorld } from 'three/tsl';
import { TOKENS } from './palette';

const PLANE_SIZE = 4000; // [m]
const SNAP = 100; // [m] plane recentre granularity (multiple of the 10 m major grid)
const LABEL_SPAN = 8; // labels at ±8 major cells along each axis
const MAJOR = 10; // [m]

function lineMask(coord: Node<'vec2'>, widthPx: number) {
  const g = abs(fract(coord.sub(0.5)).sub(0.5)).div(fwidth(coord));
  return float(1).sub(clamp(min(g.x, g.y).div(widthPx), 0, 1));
}

function axisMask(value: Node<'float'>, widthPx: number) {
  return float(1).sub(clamp(abs(value).div(fwidth(value)).div(widthPx), 0, 1));
}

export class GridGround {
  readonly mesh: THREE.Mesh;
  private labels: THREE.Sprite[] = [];
  private textures = new Map<string, THREE.CanvasTexture>();
  private labelGroup = new THREE.Group();
  private lastCenter = new THREE.Vector2(Number.NaN, Number.NaN);

  constructor(scene: THREE.Scene) {
    const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
    const p = positionWorld.xz;
    const dist = length(positionWorld.sub(cameraPosition));
    const nearFade = clamp(float(1).sub(dist.div(90)), 0, 1); // 1 m lines only near the camera
    const farFade = clamp(float(1).sub(dist.div(900)), 0, 1);
    let c = mix(color(0x15181e), color(0x2a303a), lineMask(p, 1.0).mul(nearFade).mul(0.8));
    c = mix(c, color(0x3c4452), lineMask(p.div(MAJOR), 1.3).mul(farFade));
    c = mix(c, color(0x8a4a33), axisMask(positionWorld.z, 1.6).mul(farFade)); // x axis (z = 0), accent-tinted
    c = mix(c, color(0x33517f), axisMask(positionWorld.x, 1.6).mul(farFade)); // z axis (x = 0), blue-tinted
    material.colorNode = c;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE).rotateX(-Math.PI / 2), material);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'infinite-grid';
    scene.add(this.mesh);
    scene.add(this.labelGroup);
    for (let i = 0; i < (2 * LABEL_SPAN + 1) * 2; i++) {
      // Constant on-screen size: distance markers must stay legible far away and not swamp the view up close.
      const sprite = new THREE.Sprite(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, sizeAttenuation: false }));
      sprite.scale.set(0.11, 0.038, 1);
      this.labels.push(sprite);
      this.labelGroup.add(sprite);
    }
  }

  /** Keeps the ground under `target` and places distance markers every 10 m along both axes near it. */
  update(target: THREE.Vector3): void {
    const cx = Math.round(target.x / SNAP) * SNAP;
    const cz = Math.round(target.z / SNAP) * SNAP;
    this.mesh.position.set(cx, 0, cz);
    const lx = Math.round(target.x / MAJOR), lz = Math.round(target.z / MAJOR);
    if (lx === this.lastCenter.x && lz === this.lastCenter.y) return;
    this.lastCenter.set(lx, lz);
    let k = 0;
    for (let i = -LABEL_SPAN; i <= LABEL_SPAN; i++) {
      // along x (on the z = 0 axis) and along z (on the x = 0 axis)
      for (const axis of ['x', 'z'] as const) {
        const cell = (axis === 'x' ? lx : lz) + i;
        const sprite = this.labels[k++];
        const metres = cell * MAJOR;
        sprite.visible = metres !== 0;
        if (!sprite.visible) continue;
        const material = sprite.material as THREE.SpriteNodeMaterial;
        const map = this.texture(`${metres} m`);
        if (material.map !== map) {
          material.map = map;
          material.needsUpdate = true; // node materials rebuild their graph when the map changes
        }
        if (axis === 'x') sprite.position.set(metres, 0.45, 0);
        else sprite.position.set(0, 0.45, metres);
      }
    }
  }

  private texture(text: string): THREE.CanvasTexture {
    let t = this.textures.get(text);
    if (t) return t;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 88;
    const g = canvas.getContext('2d')!;
    g.fillStyle = 'rgba(11,13,16,0.72)';
    g.beginPath();
    g.roundRect(8, 12, 240, 64, 20);
    g.fill();
    g.fillStyle = `#${TOKENS.text.toString(16)}`;
    g.font = '600 38px "JetBrains Mono", ui-monospace, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 46);
    t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(text, t);
    return t;
  }
}

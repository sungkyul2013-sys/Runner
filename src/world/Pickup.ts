import * as THREE from 'three';
import { POWERUPS, PowerupType } from '../config/powerups';

// One shared emoji sprite material per power-up type (canvas-drawn glyph).
const matCache = new Map<PowerupType, THREE.SpriteMaterial>();

function emojiTexture(emoji: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  // Soft glow disc behind the glyph for visibility against any biome.
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  g.addColorStop(0, 'rgba(255,240,200,0.55)');
  g.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.font = '88px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function materialFor(type: PowerupType): THREE.SpriteMaterial {
  let m = matCache.get(type);
  if (!m) {
    m = new THREE.SpriteMaterial({
      map: emojiTexture(POWERUPS[type].icon),
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    matCache.set(type, m);
  }
  return m;
}

export function disposePickupResources(): void {
  for (const m of matCache.values()) {
    m.map?.dispose();
    m.dispose();
  }
  matCache.clear();
}

/**
 * A floating power-up token rendered as the item's **emoji** (a camera-facing
 * billboard sprite, not a box) so players instantly recognise what it grants.
 * Pooled per the PowerupSystem. Bobs and gently scales to feel alive.
 */
export class Pickup {
  readonly mesh = new THREE.Sprite();
  type: PowerupType = PowerupType.MAGNET;
  collected = false;

  private baseY = 1.3;
  private bob = 0;

  constructor() {
    this.mesh.visible = false;
    this.mesh.scale.set(1.3, 1.3, 1);
  }

  configure(type: PowerupType, x: number, y: number, z: number): void {
    this.type = type;
    this.mesh.material = materialFor(type);
    this.baseY = y;
    this.bob = Math.random() * Math.PI * 2;
    this.mesh.position.set(x, y, z);
    this.mesh.visible = true;
    this.collected = false;
  }

  update(scroll: number, dt: number): void {
    this.mesh.position.z += scroll;
    this.bob += dt * 3;
    this.mesh.position.y = this.baseY + Math.sin(this.bob) * 0.18;
    const s = 1.3 + Math.sin(this.bob * 1.5) * 0.08;
    this.mesh.scale.set(s, s, 1);
  }

  get position(): THREE.Vector3 {
    return this.mesh.position;
  }
  get z(): number {
    return this.mesh.position.z;
  }

  reset(): void {
    this.mesh.visible = false;
    this.collected = false;
  }
}

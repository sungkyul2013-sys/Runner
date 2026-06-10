import * as THREE from 'three';
import { POWERUPS, PowerupType } from '../config/powerups';

// One shared emoji sprite material per power-up type (canvas-drawn glyph).
const matCache = new Map<PowerupType, THREE.SpriteMaterial>();

function emojiTexture(emoji: string, color: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 192;
  const ctx = c.getContext('2d')!;
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  // Coloured glow halo so each power-up reads by colour at a glance.
  const halo = ctx.createRadialGradient(96, 96, 10, 96, 96, 94);
  halo.addColorStop(0, hexA(color, 0.55));
  halo.addColorStop(0.7, hexA(color, 0.18));
  halo.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 192, 192);
  // Solid colour badge disc with a glossy rim.
  ctx.beginPath();
  ctx.arc(96, 96, 62, 0, Math.PI * 2);
  const disc = ctx.createLinearGradient(40, 40, 150, 150);
  disc.addColorStop(0, lighten(hex, 40));
  disc.addColorStop(1, hex);
  ctx.fillStyle = disc;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();
  // Big bright glyph on top.
  ctx.font = '96px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 6;
  ctx.fillText(emoji, 96, 104);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hexA(color: number, a: number): string {
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  return `rgba(${r},${g},${b},${a})`;
}
function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + amt);
  const g = Math.min(255, ((n >> 8) & 255) + amt);
  const b = Math.min(255, (n & 255) + amt);
  return `rgb(${r},${g},${b})`;
}

function materialFor(type: PowerupType): THREE.SpriteMaterial {
  let m = matCache.get(type);
  if (!m) {
    m = new THREE.SpriteMaterial({
      map: emojiTexture(POWERUPS[type].icon, POWERUPS[type].color),
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
    this.mesh.scale.set(1.7, 1.7, 1);
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
    const s = 1.7 + Math.sin(this.bob * 1.5) * 0.1;
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

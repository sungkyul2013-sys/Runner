import * as THREE from 'three';
import { POWERUPS, PowerupType } from '../config/powerups';

/** One shared sprite material per token face (canvas-drawn badge). */
const matCache = new Map<string, THREE.SpriteMaterial>();

function hexA(color: number, a: number): string {
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  return `rgba(${r},${g},${b},${a})`;
}
function lighten(color: number, amt: number): string {
  const r = Math.min(255, ((color >> 16) & 255) + amt);
  const g = Math.min(255, ((color >> 8) & 255) + amt);
  const b = Math.min(255, (color & 255) + amt);
  return `rgb(${r},${g},${b})`;
}

/**
 * Draws a token face: a coloured glow, a glossy disc with a bright rim, then
 * either the power-up glyph or — for word-hunt tokens — a big bold letter.
 */
function tokenTexture(color: number, glyph: string, isLetter: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 224;
  const ctx = c.getContext('2d')!;
  const cx = 112;

  const halo = ctx.createRadialGradient(cx, cx, 12, cx, cx, 110);
  halo.addColorStop(0, hexA(color, 0.6));
  halo.addColorStop(0.65, hexA(color, 0.18));
  halo.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 224, 224);

  ctx.beginPath();
  ctx.arc(cx, cx, 74, 0, Math.PI * 2);
  const disc = ctx.createLinearGradient(40, 40, 184, 184);
  disc.addColorStop(0, lighten(color, 60));
  disc.addColorStop(1, `#${color.toString(16).padStart(6, '0')}`);
  ctx.fillStyle = disc;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.stroke();

  // Glossy highlight across the top of the disc.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cx, 70, 0, Math.PI * 2);
  ctx.clip();
  const gloss = ctx.createLinearGradient(0, 40, 0, 130);
  gloss.addColorStop(0, 'rgba(255,255,255,0.42)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 34, 224, 100);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 8;
  if (isLetter) {
    ctx.font = `900 108px 'Trebuchet MS', system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(glyph, cx, cx + 6);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(20,24,34,0.55)';
    ctx.strokeText(glyph, cx, cx + 6);
  } else {
    ctx.font = '104px sans-serif';
    ctx.fillText(glyph, cx, cx + 8);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function materialFor(type: PowerupType, letter?: string): THREE.SpriteMaterial {
  const key = `${type}:${letter ?? ''}`;
  let m = matCache.get(key);
  if (!m) {
    const def = POWERUPS[type];
    m = new THREE.SpriteMaterial({
      map: tokenTexture(def.color, letter ?? def.icon, !!letter),
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    matCache.set(key, m);
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
 * A floating token — power-up, key, mystery box or word-hunt letter — drawn as
 * a camera-facing billboard so it reads instantly at any speed. Pooled by the
 * pickup system; bobs, breathes and (for letters) shimmers.
 */
export class Pickup {
  readonly mesh = new THREE.Sprite();
  type: PowerupType = PowerupType.MAGNET;
  letter?: string;
  collected = false;

  private baseY = 1.4;
  private bob = 0;

  constructor() {
    this.mesh.visible = false;
    this.mesh.scale.set(1.8, 1.8, 1);
  }

  configure(type: PowerupType, x: number, y: number, z: number, letter?: string): void {
    this.type = type;
    this.letter = letter;
    this.mesh.material = materialFor(type, letter);
    this.baseY = y;
    this.bob = Math.random() * Math.PI * 2;
    this.mesh.position.set(x, y, z);
    this.mesh.visible = true;
    this.collected = false;
  }

  update(scroll: number, dt: number): void {
    this.mesh.position.z += scroll;
    this.bob += dt * 3;
    this.mesh.position.y = this.baseY + Math.sin(this.bob) * 0.2;
    const s = 1.8 + Math.sin(this.bob * 1.6) * 0.11;
    this.mesh.scale.set(s, s, 1);
  }

  /** Drag the token toward a point (token magnet perk). */
  pull(x: number, y: number, z: number, k: number): void {
    this.mesh.position.x += (x - this.mesh.position.x) * k;
    this.baseY += (y - this.baseY) * k;
    this.mesh.position.z += (z - this.mesh.position.z) * k;
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
    this.letter = undefined;
  }
}

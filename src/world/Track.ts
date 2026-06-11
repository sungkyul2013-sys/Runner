import * as THREE from 'three';
import {
  COLORS,
  LANE_COUNT,
  LANE_WIDTH,
  laneToX,
  SEGMENT_LENGTH,
} from '../config/constants';
import { PLAYER_Z } from '../player/Player';

/** Width of the runnable floor plus a small margin on each side. */
const TRACK_WIDTH = LANE_COUNT * LANE_WIDTH + 1.4;

/** Procedural asphalt texture with sleeper bars + speckle grain. */
function asphaltTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#5d4070';
  ctx.fillRect(0, 0, 128, 256);
  // Grain speckles.
  for (let i = 0; i < 420; i++) {
    const v = Math.random();
    ctx.fillStyle = v > 0.5 ? 'rgba(255,220,200,0.06)' : 'rgba(20,10,30,0.10)';
    ctx.fillRect(Math.random() * 128, Math.random() * 256, 2, 2);
  }
  // Horizontal sleeper bars (metro ties) — repeat 4 per tile.
  ctx.fillStyle = 'rgba(30,16,40,0.45)';
  for (let y = 8; y < 256; y += 64) ctx.fillRect(0, y, 128, 10);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The endless scrolling floor: textured asphalt tiles recycled front-to-back,
 * per-lane metro rails (two silver strips each), glowing lane dividers and
 * warm edge rails. Zero allocation while scrolling — the same ring of meshes
 * wraps forever.
 */
export class Track {
  readonly group = new THREE.Group();

  private readonly tiles: THREE.Mesh[] = [];
  private readonly tileCount = 10;
  private readonly spanZ: number;
  private readonly matA: THREE.MeshStandardMaterial;
  private readonly matB: THREE.MeshStandardMaterial;
  private readonly baseA = new THREE.Color(0xc9b0d8);
  private readonly baseB = new THREE.Color(0xb39ac4);
  private readonly lavaCol = new THREE.Color(0xff5a1a);
  private readonly lavaEmissive = new THREE.Color(0xff3300);
  private readonly black = new THREE.Color(0x000000);

  constructor() {
    this.spanZ = this.tileCount * SEGMENT_LENGTH;

    const tex = asphaltTexture();
    const geo = new THREE.PlaneGeometry(TRACK_WIDTH, SEGMENT_LENGTH);
    geo.rotateX(-Math.PI / 2);
    this.matA = new THREE.MeshStandardMaterial({ map: tex, color: 0xc9b0d8, roughness: 0.95 });
    this.matB = new THREE.MeshStandardMaterial({ map: tex, color: 0xb39ac4, roughness: 0.95 });

    for (let i = 0; i < this.tileCount; i++) {
      const tile = new THREE.Mesh(geo, i % 2 === 0 ? this.matA : this.matB);
      tile.position.z = PLAYER_Z + SEGMENT_LENGTH / 2 - i * SEGMENT_LENGTH;
      this.tiles.push(tile);
      this.group.add(tile);
    }

    this.addLaneRails();
    this.addDividers();
    this.addEdgeRails();
  }

  /**
   * Floor-is-lava heat: 0 = normal asphalt, 1 = fully molten (bright glowing
   * red). The whole floor lerps colour + emissive so the danger reads clearly.
   */
  setLava(t: number): void {
    const k = Math.min(1, Math.max(0, t));
    this.matA.color.copy(this.baseA).lerp(this.lavaCol, k);
    this.matB.color.copy(this.baseB).lerp(this.lavaCol, k);
    this.matA.emissive.copy(this.black).lerp(this.lavaEmissive, k * 0.9);
    this.matB.emissive.copy(this.black).lerp(this.lavaEmissive, k * 0.9);
  }

  /** Two thin silver metro rails per lane. */
  private addLaneRails(): void {
    const railGeo = new THREE.BoxGeometry(0.07, 0.05, this.spanZ);
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xc9c2d8,
      emissive: 0x9a90b0,
      emissiveIntensity: 0.12,
      metalness: 0.8,
      roughness: 0.35,
    });
    const zCenter = PLAYER_Z - this.spanZ / 2 + SEGMENT_LENGTH;
    for (const lane of [-1, 0, 1]) {
      for (const off of [-0.7, 0.7]) {
        const rail = new THREE.Mesh(railGeo, railMat);
        rail.position.set(laneToX(lane) + off, 0.03, zCenter);
        this.group.add(rail);
      }
    }
  }

  /** Warm dashed dividers between lanes. */
  private addDividers(): void {
    const stripeMat = new THREE.MeshBasicMaterial({ color: COLORS.laneStripe, transparent: true, opacity: 0.5 });
    const stripeGeo = new THREE.BoxGeometry(0.06, 0.02, this.spanZ);
    const zCenter = PLAYER_Z - this.spanZ / 2 + SEGMENT_LENGTH;
    for (const lane of [-0.5, 0.5]) {
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.set(laneToX(lane), 0.011, zCenter);
      this.group.add(stripe);
    }
  }

  /** Glowing edge rails framing the track. */
  private addEdgeRails(): void {
    const railMat = new THREE.MeshStandardMaterial({
      color: COLORS.rail,
      emissive: COLORS.rail,
      emissiveIntensity: 0.35,
      roughness: 0.4,
    });
    const railGeo = new THREE.BoxGeometry(0.18, 0.34, this.spanZ);
    const zCenter = PLAYER_Z - this.spanZ / 2 + SEGMENT_LENGTH;
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(side * (TRACK_WIDTH / 2 + 0.12), 0.17, zCenter);
      this.group.add(rail);
      // Kerb below the rail.
      const kerb = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.1, this.spanZ),
        new THREE.MeshStandardMaterial({ color: 0x4a3358, roughness: 0.9 }),
      );
      kerb.position.set(side * (TRACK_WIDTH / 2 + 0.12), 0.05, zCenter);
      this.group.add(kerb);
    }
  }

  /** Scroll the floor toward the camera by `scroll` world units. */
  update(scroll: number): void {
    const recycleZ = PLAYER_Z + SEGMENT_LENGTH;
    for (const tile of this.tiles) {
      tile.position.z += scroll;
      if (tile.position.z > recycleZ) tile.position.z -= this.spanZ;
    }
  }
}

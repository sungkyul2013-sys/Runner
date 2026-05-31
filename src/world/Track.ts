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

/**
 * The endless scrolling floor. A fixed ring of ground tiles is moved toward the
 * camera (+Z) each frame; once a tile passes behind the player it is wrapped
 * back to the far end, giving a seamless infinite road with zero allocation.
 * Phase 2's obstacle segments ride on top of this same scroll model.
 */
export class Track {
  readonly group = new THREE.Group();

  private readonly tiles: THREE.Mesh[] = [];
  private readonly tileCount: number;
  private readonly spanZ: number;

  constructor() {
    // Enough tiles to cover from well behind the camera to the fog horizon.
    this.tileCount = 10;
    this.spanZ = this.tileCount * SEGMENT_LENGTH;

    const geo = new THREE.PlaneGeometry(TRACK_WIDTH, SEGMENT_LENGTH);
    geo.rotateX(-Math.PI / 2); // lay flat

    for (let i = 0; i < this.tileCount; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? COLORS.groundA : COLORS.groundB,
        roughness: 0.95,
        metalness: 0.0,
      });
      const tile = new THREE.Mesh(geo, mat);
      // Tile 0 sits just behind the player; the rest extend ahead into -Z.
      tile.position.z = PLAYER_Z + SEGMENT_LENGTH / 2 - i * SEGMENT_LENGTH;
      this.tiles.push(tile);
      this.group.add(tile);
    }

    this.addLaneStripes();
    this.addSideRails();
  }

  /** Glowing dashed lines marking the boundaries between the lanes. */
  private addLaneStripes(): void {
    const stripeMat = new THREE.MeshBasicMaterial({ color: COLORS.laneStripe });
    // Two divider lines: between lane -1/0 and lane 0/1.
    for (const lane of [-0.5, 0.5]) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.02, this.spanZ),
        stripeMat,
      );
      stripe.position.set(laneToX(lane), 0.011, PLAYER_Z - this.spanZ / 2 + SEGMENT_LENGTH);
      this.group.add(stripe);
    }
  }

  /** Low neon side rails to frame the track edges. */
  private addSideRails(): void {
    const railMat = new THREE.MeshStandardMaterial({
      color: COLORS.laneStripe,
      emissive: COLORS.laneStripe,
      emissiveIntensity: 0.5,
      roughness: 0.4,
    });
    const railGeo = new THREE.BoxGeometry(0.15, 0.4, this.spanZ);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(
        side * (TRACK_WIDTH / 2 + 0.1),
        0.2,
        PLAYER_Z - this.spanZ / 2 + SEGMENT_LENGTH,
      );
      this.group.add(rail);
    }
  }

  /** Scroll the floor toward the camera by `scroll` world units. */
  update(scroll: number): void {
    const recycleZ = PLAYER_Z + SEGMENT_LENGTH; // just behind the camera
    for (const tile of this.tiles) {
      tile.position.z += scroll;
      if (tile.position.z > recycleZ) {
        // Wrap to the far end to keep the road continuous.
        tile.position.z -= this.spanZ;
      }
    }
  }
}

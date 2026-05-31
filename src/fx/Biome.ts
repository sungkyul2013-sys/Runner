import * as THREE from 'three';

/** Distance (units) between biome / day-night transitions. */
const BIOME_LENGTH = 850;

interface Palette {
  bg: number;
  fog: number;
}

/** Original neon biome palettes, cycled as the run progresses. */
const PALETTES: Palette[] = [
  { bg: 0x05060c, fog: 0x0a0e1f }, // midnight
  { bg: 0x120a1e, fog: 0x241033 }, // dusk purple
  { bg: 0x1a0e16, fog: 0x3a1430 }, // neon dawn
  { bg: 0x081a1e, fog: 0x0e3038 }, // cyber teal
];

/**
 * Smoothly shifts the scene background + fog colour through a cycle of biome
 * palettes as distance grows, giving a day/night / changing-world feel without
 * any asset swaps.
 */
export class Biome {
  private readonly bg: THREE.Color;
  private readonly fog: THREE.Fog;
  private readonly targetBg = new THREE.Color();
  private readonly targetFog = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.bg = scene.background as THREE.Color;
    this.fog = scene.fog as THREE.Fog;
  }

  update(dt: number, distance: number): void {
    const idx = Math.floor(distance / BIOME_LENGTH) % PALETTES.length;
    const p = PALETTES[idx];
    this.targetBg.setHex(p.bg);
    this.targetFog.setHex(p.fog);
    const t = 1 - Math.exp(-0.6 * dt);
    this.bg.lerp(this.targetBg, t);
    this.fog.color.lerp(this.targetFog, t);
  }

  reset(): void {
    this.bg.setHex(PALETTES[0].bg);
    this.fog.color.setHex(PALETTES[0].fog);
  }
}

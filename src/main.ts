import * as THREE from 'three';
import { Engine } from './core/Engine';

/**
 * Phase 0 entry point. Boots the engine and renders a minimal neon-lit scene
 * (ground grid + a slowly spinning placeholder) to prove the render loop,
 * lighting, resize handling and FPS overlay all work. Phase 1 replaces the
 * placeholder with the actual Game (player, track, input, camera rig).
 */
const canvas = document.getElementById('game') as HTMLCanvasElement;
const engine = new Engine(canvas);

// Ground reference grid so the empty scene clearly renders in 3D.
const grid = new THREE.GridHelper(200, 100, 0x2de2e6, 0x16204a);
grid.position.z = -40;
engine.add(grid);

// Spinning neon placeholder — confirms the update loop is ticking.
const placeholder = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1.2, 0),
  new THREE.MeshStandardMaterial({
    color: 0xff3cac,
    emissive: 0xff3cac,
    emissiveIntensity: 0.4,
    flatShading: true,
  }),
);
placeholder.position.set(0, 1.4, -6);
engine.add(placeholder);

engine.onUpdate((dt) => {
  placeholder.rotation.x += dt * 0.6;
  placeholder.rotation.y += dt * 0.9;
});

engine.start();

import * as THREE from 'three';

/**
 * Sheets of paper drifting through the depth behind the particle field.
 * They exist purely for parallax — softly lit rounded quads, never in focus.
 */

function paperTexture(): THREE.Texture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');

  if (ctx) {
    const r = 34;
    const g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, 'rgba(190, 214, 255, 0.95)');
    g.addColorStop(0.5, 'rgba(126, 160, 255, 0.42)');
    g.addColorStop(1, 'rgba(90, 220, 255, 0.12)');

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(S, 0, S, S, r);
    ctx.arcTo(S, S, 0, S, r);
    ctx.arcTo(0, S, 0, 0, r);
    ctx.arcTo(0, 0, S, 0, r);
    ctx.closePath();
    ctx.fill();

    // Faint rule lines so it reads as a written page, not a plain card.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 3;
    for (let i = 1; i < 6; i += 1) {
      const y = 40 + i * 32;
      ctx.beginPath();
      ctx.moveTo(38, y);
      ctx.lineTo(S - 38 - (i % 2) * 46, y);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Sheet {
  mesh: THREE.Mesh;
  spin: THREE.Vector3;
  bob: number;
  baseY: number;
}

export class Sheets {
  readonly object = new THREE.Group();

  private readonly items: Sheet[] = [];
  private readonly geo: THREE.PlaneGeometry;
  private readonly mat: THREE.MeshBasicMaterial;

  constructor(count: number) {
    this.geo = new THREE.PlaneGeometry(1, 1.32);
    this.mat = new THREE.MeshBasicMaterial({
      map: paperTexture(),
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(this.geo, this.mat);
      const t = i / count;
      const a = t * Math.PI * 2 * 2.4 + Math.random();
      const rad = 5.5 + Math.random() * 5.5;

      mesh.position.set(
        Math.cos(a) * rad,
        (Math.random() - 0.5) * 9,
        -3 - Math.random() * 12,
      );
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);

      const s = 0.7 + Math.random() * 1.9;
      mesh.scale.setScalar(s);

      this.items.push({
        mesh,
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 0.12,
          (Math.random() - 0.5) * 0.16,
          (Math.random() - 0.5) * 0.08,
        ),
        bob: Math.random() * Math.PI * 2,
        baseY: mesh.position.y,
      });

      this.object.add(mesh);
    }
  }

  update(dt: number, time: number, scroll: number): void {
    for (const s of this.items) {
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;
      // Drift upward with the page, so scrolling feels like moving through them.
      s.mesh.position.y = s.baseY + Math.sin(time * 0.35 + s.bob) * 0.5 + scroll * 9;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.map?.dispose();
    this.mat.dispose();
  }
}

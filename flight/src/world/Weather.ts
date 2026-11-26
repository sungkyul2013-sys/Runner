import * as THREE from 'three';

const N = 3000, BOX = 90;

export class Weather {
  readonly rain: THREE.LineSegments;
  private p = new Float32Array(N * 3);
  private attr: THREE.BufferAttribute;
  private nextBolt = 5;
  onLightning: (distance: number) => void = () => {};

  constructor() {
    for (let i = 0; i < N * 3; i++) this.p[i] = (Math.random() - 0.5) * BOX * 2;
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(new Float32Array(N * 6), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attr);
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.35, depthWrite: false, fog: false }));
    this.rain.frustumCulled = false;
  }

  update(dt: number, cam: THREE.Vector3, vel: THREE.Vector3, rain: number, storm: boolean, sky: { lightning: number }) {
    this.rain.visible = rain > 0.01 && cam.y < 2600;
    if (this.rain.visible) {
      const fall = 9;
      const a = this.attr.array as Float32Array;
      const n = Math.floor(N * rain);
      const sx = -vel.x * 0.025, sy = (-vel.y - fall) * 0.025, sz = -vel.z * 0.025;
      for (let i = 0; i < N; i++) {
        let x = this.p[i * 3] - vel.x * dt, y = this.p[i * 3 + 1] - (vel.y + fall) * dt, z = this.p[i * 3 + 2] - vel.z * dt;
        if (x > BOX) x -= BOX * 2; else if (x < -BOX) x += BOX * 2;
        if (y > BOX) y -= BOX * 2; else if (y < -BOX) y += BOX * 2;
        if (z > BOX) z -= BOX * 2; else if (z < -BOX) z += BOX * 2;
        this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
        const k = i * 6;
        if (i < n) {
          a[k] = cam.x + x; a[k + 1] = cam.y + y; a[k + 2] = cam.z + z;
          a[k + 3] = cam.x + x + sx; a[k + 4] = cam.y + y + sy; a[k + 5] = cam.z + z + sz;
        } else { a[k] = a[k + 3] = cam.x; a[k + 1] = a[k + 4] = -9999; a[k + 2] = a[k + 5] = cam.z; }
      }
      this.attr.needsUpdate = true;
    }
    if (storm) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 4 + Math.random() * 10;
        sky.lightning = 0.6 + Math.random() * 0.4;
        this.onLightning(500 + Math.random() * 6000);
      }
    }
  }
}

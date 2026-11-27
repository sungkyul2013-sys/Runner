import * as THREE from 'three';
import { terrainHeight } from '../world/WorldDef';

/** GPU billboard particle system — one draw call per blend mode. */
class ParticleLayer {
  readonly mesh: THREE.Mesh;
  private max: number;
  private count = 0;
  private pos: Float32Array; private vel: Float32Array; private life: Float32Array; private maxLife: Float32Array;
  private size0: Float32Array; private size1: Float32Array; private col: Float32Array; private drag: Float32Array; private grav: Float32Array; private rot: Float32Array; private alpha0: Float32Array;
  private aPos: THREE.InstancedBufferAttribute; private aCol: THREE.InstancedBufferAttribute; private aExtra: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;

  constructor(max: number, additive: boolean, tex: THREE.Texture) {
    this.max = max;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max); this.size1 = new Float32Array(max);
    this.col = new Float32Array(max * 4); this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    this.rot = new Float32Array(max); this.alpha0 = new Float32Array(max);
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aExtra = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPos', this.aPos); g.setAttribute('aCol', this.aCol); g.setAttribute('aExtra', this.aExtra);
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uTex: { value: tex }, uFogCol: { value: new THREE.Color() }, uFogD: { value: 0 } },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute vec3 aPos; attribute vec4 aCol; attribute vec2 aExtra;
        varying vec2 vUv; varying vec4 vCol; varying float vDist;
        void main(){
          vUv=uv; vCol=aCol;
          vec4 mv = viewMatrix*vec4(aPos,1.0);
          float r=aExtra.y; vec2 p=vec2(position.x*cos(r)-position.y*sin(r), position.x*sin(r)+position.y*cos(r));
          mv.xy += p*aExtra.x; vDist=-mv.z;
          gl_Position=projectionMatrix*mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        uniform sampler2D uTex; uniform vec3 uFogCol; uniform float uFogD;
        varying vec2 vUv; varying vec4 vCol; varying float vDist;
        void main(){
          #include <logdepthbuf_fragment>
          vec4 t=texture2D(uTex,vUv);
          float f = 1.0-exp(-uFogD*uFogD*vDist*vDist);
          vec3 c = ${additive ? 'vCol.rgb*(1.0-f)' : 'mix(vCol.rgb, uFogCol, f)'};
          gl_FragColor=vec4(c, t.a*vCol.a);
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 8 : 7;
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, life: number, s0: number, s1: number, r: number, g: number, b: number, a: number, drag = 0.5, grav = 0) {
    let i = this.count;
    if (i >= this.max) { i = Math.floor(Math.random() * this.max); } else this.count++;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = life; this.maxLife[i] = life;
    this.size0[i] = s0; this.size1[i] = s1;
    this.col.set([r, g, b, a], i * 4);
    this.alpha0[i] = a;
    this.drag[i] = drag; this.grav[i] = grav;
    this.rot[i] = Math.random() * 6.28;
  }

  update(dt: number, fog: THREE.FogExp2) {
    const m = this.mesh.material as THREE.ShaderMaterial;
    m.uniforms.uFogCol.value.copy(fog.color);
    m.uniforms.uFogD.value = fog.density;
    const P = this.aPos.array as Float32Array, C = this.aCol.array as Float32Array, E = this.aExtra.array as Float32Array;
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        const j = --this.count;
        if (i !== j) {
          this.pos.copyWithin(i * 3, j * 3, j * 3 + 3); this.vel.copyWithin(i * 3, j * 3, j * 3 + 3);
          this.col.copyWithin(i * 4, j * 4, j * 4 + 4);
          this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.size0[i] = this.size0[j]; this.size1[i] = this.size1[j];
          this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j]; this.rot[i] = this.rot[j]; this.alpha0[i] = this.alpha0[j];
        }
        i--;
        continue;
      }
      const k = 1 - this.life[i] / this.maxLife[i];
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      P[n * 3] = this.pos[i * 3]; P[n * 3 + 1] = this.pos[i * 3 + 1]; P[n * 3 + 2] = this.pos[i * 3 + 2];
      C[n * 4] = this.col[i * 4]; C[n * 4 + 1] = this.col[i * 4 + 1]; C[n * 4 + 2] = this.col[i * 4 + 2];
      const fadeIn = Math.min(1, k * 12);
      C[n * 4 + 3] = this.alpha0[i] * (1 - k) * fadeIn;
      E[n * 2] = this.size0[i] + (this.size1[i] - this.size0[i]) * Math.sqrt(k);
      E[n * 2 + 1] = this.rot[i] + k * 0.6;
      n++;
    }
    this.geo.instanceCount = n;
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aExtra.needsUpdate = true;
  }
}

function softTex(kind: 'smoke' | 'glow'): THREE.Texture {
  const s = 64, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  if (kind === 'glow') {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  } else {
    for (let i = 0; i < 26; i++) {
      const x = s / 2 + (Math.random() - 0.5) * s * 0.4, y = s / 2 + (Math.random() - 0.5) * s * 0.4, r = s * (0.12 + Math.random() * 0.2);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }
  }
  return new THREE.CanvasTexture(c);
}

interface Debris { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; life: number; smoke: boolean; fire: boolean }
interface Flash { light: THREE.PointLight; t: number; max: number }
interface Ring { mesh: THREE.Mesh; t: number; max: number; size: number }

export class Effects {
  readonly group = new THREE.Group();
  readonly smoke: ParticleLayer;
  readonly fire: ParticleLayer;
  private debris: Debris[] = [];
  private flashes: Flash[] = [];
  private rings: Ring[] = [];
  private fires: { pos: THREE.Vector3; t: number; size: number }[] = [];
  private debrisGeo = [new THREE.BoxGeometry(1, 0.2, 0.7), new THREE.TetrahedronGeometry(0.7), new THREE.BoxGeometry(0.4, 0.4, 1.6)];
  private debrisMat = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.7, metalness: 0.5 });
  private ringMat: THREE.MeshBasicMaterial;
  private _v = new THREE.Vector3();
  private _p = new THREE.Vector3();
  private scorchMesh: THREE.InstancedMesh;
  private scorchN = 0;
  onShake: (amount: number, pos: THREE.Vector3) => void = () => {};
  onBoom: (pos: THREE.Vector3, size: number) => void = () => {};

  constructor() {
    this.smoke = new ParticleLayer(5000, false, softTex('smoke'));
    this.fire = new ParticleLayer(3500, true, softTex('glow'));
    this.group.add(this.smoke.mesh, this.fire.mesh);
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffa040, 0, 400, 1.6);
      this.group.add(l);
      this.flashes.push({ light: l, t: 0, max: 0 });
    }
    {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
      for (let i = 0; i < 14; i++) {
        const x = 64 + (Math.random() - 0.5) * 30, y = 64 + (Math.random() - 0.5) * 30, r = 26 + Math.random() * 36;
        const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(10,8,6,0.55)'); gr.addColorStop(1, 'rgba(10,8,6,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      }
      const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
      this.scorchMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, color: 0xffffff }), 160);
      this.scorchMesh.count = 0; this.scorchMesh.frustumCulled = false;
      this.group.add(this.scorchMesh);
    }
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  }

  /** Dark burn mark on the ground at an impact. */
  scorch(pos: THREE.Vector3, radius: number) {
    const gh = Math.max(terrainHeight(pos.x, pos.z), 0);
    if (pos.y - gh > radius * 1.5) return;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(pos.x, gh + 0.35, pos.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28), new THREE.Vector3(radius * 2, 1, radius * 2));
    this.scorchMesh.setMatrixAt(this.scorchN % 160, m);
    this.scorchN++;
    this.scorchMesh.count = Math.min(160, this.scorchN);
    this.scorchMesh.instanceMatrix.needsUpdate = true;
  }

  /** Gun muzzle flash: short, bright, additive. */
  muzzle(pos: THREE.Vector3, vel: THREE.Vector3, dir: THREE.Vector3) {
    this._v.copy(vel).addScaledVector(dir, 40);
    this.fire.emit(pos, this._v, 0.06, 2.4, 0.8, 1, 0.85, 0.45, 1, 0);
    this._v.copy(vel).multiplyScalar(0.9);
    this.smoke.emit(pos, this._v, 0.6, 0.6, 3, 0.7, 0.7, 0.7, 0.18, 2);
  }

  explosion(pos: THREE.Vector3, size = 1, vel?: THREE.Vector3) {
    this.scorch(pos, 6 * size);
    const v = this._v;
    const base = vel ? vel.clone().multiplyScalar(0.3) : new THREE.Vector3();
    const n = Math.floor(40 * Math.min(size, 3));
    for (let i = 0; i < n; i++) {
      v.randomDirection().multiplyScalar((8 + Math.random() * 30) * size).add(base);
      this.fire.emit(pos, v, 0.5 + Math.random() * 0.7, 6 * size, 22 * size, 1, 0.55 + Math.random() * 0.25, 0.18, 1, 2.5, 4);
    }
    for (let i = 0; i < n * 0.8; i++) {
      v.randomDirection().multiplyScalar((4 + Math.random() * 16) * size).add(base);
      v.y += 4 * size;
      this.smoke.emit(pos, v, 3 + Math.random() * 4, 6 * size, 34 * size, 0.12, 0.11, 0.1, 0.75, 1.2, 2.5);
    }
    // sparks
    for (let i = 0; i < 25 * size; i++) {
      v.randomDirection().multiplyScalar(40 + Math.random() * 90).add(base);
      this.fire.emit(pos, v, 0.6 + Math.random() * 0.8, 0.8, 0.3, 1, 0.8, 0.4, 1, 0.8, -9.8);
    }
    // debris
    for (let i = 0; i < Math.min(14, 5 * size); i++) {
      const m = new THREE.Mesh(this.debrisGeo[i % 3], this.debrisMat);
      m.position.copy(pos);
      m.scale.setScalar(0.6 + Math.random() * size);
      m.castShadow = true;
      this.group.add(m);
      this.debris.push({ mesh: m, vel: new THREE.Vector3().randomDirection().multiplyScalar(15 + Math.random() * 35).add(base).setY(10 + Math.random() * 30), spin: new THREE.Vector3().randomDirection().multiplyScalar(8), life: 6 + Math.random() * 4, smoke: Math.random() < 0.5, fire: Math.random() < 0.3 });
    }
    // flash light
    const f = this.flashes.reduce((a, b) => (a.t < b.t ? a : b));
    f.light.position.copy(pos); f.t = 0.35 * Math.sqrt(size); f.max = 900 * size; f.light.distance = 300 * size;
    // shockwave
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), this.ringMat.clone());
    ring.position.copy(pos);
    ring.lookAt(pos.x, pos.y + 1, pos.z);
    this.group.add(ring);
    this.rings.push({ mesh: ring, t: 0, max: 0.5, size: 60 * size });
    this.onShake(size, pos);
    this.onBoom(pos, size);
  }

  /** Persistent burning wreck / building fire. */
  addFire(pos: THREE.Vector3, size: number, duration = 40) { this.fires.push({ pos: pos.clone(), t: duration, size }); }

  hitSparks(pos: THREE.Vector3, n = 6) {
    for (let i = 0; i < n; i++) {
      this._v.randomDirection().multiplyScalar(10 + Math.random() * 25);
      this.fire.emit(pos, this._v, 0.25 + Math.random() * 0.2, 0.6, 0.2, 1, 0.85, 0.5, 1, 1, -9.8);
    }
    this._v.set(0, 2, 0);
    this.smoke.emit(pos, this._v, 1.6, 2, 8, 0.32, 0.3, 0.28, 0.6, 1);
    this.fire.emit(pos, this._v.set(0, 0, 0), 0.08, 3.5, 1, 1, 0.9, 0.6, 1, 0);
  }

  dust(pos: THREE.Vector3, vel: THREE.Vector3, strength: number, water = false) {
    if (Math.random() > strength) return;
    this._v.copy(vel).multiplyScalar(0.2);
    this._v.x += (Math.random() - 0.5) * 8; this._v.z += (Math.random() - 0.5) * 8; this._v.y = 2 + Math.random() * 4;
    if (water) this.smoke.emit(pos, this._v, 1.6, 2, 9, 0.85, 0.9, 0.95, 0.45, 1.5, -2);
    else this.smoke.emit(pos, this._v, 2.2, 2, 10, 0.55, 0.48, 0.38, 0.35, 1.2);
  }

  tireSmoke(pos: THREE.Vector3, amount: number) {
    for (let i = 0; i < amount; i++) {
      this._v.set((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3);
      this.smoke.emit(pos, this._v, 1.5 + Math.random(), 0.8, 5, 0.85, 0.85, 0.85, 0.55, 1.5);
    }
  }

  trailSmoke(pos: THREE.Vector3, vel: THREE.Vector3, dark: number, size = 1) {
    this._v.copy(vel).multiplyScalar(0.05);
    const c = 0.85 - dark * 0.7;
    this.smoke.emit(pos, this._v, 3.5 + Math.random() * 2.5, 1.5 * size, 9 * size, c, c, c, 0.6 + dark * 0.3, 0.5, 0.8);
  }

  flame(pos: THREE.Vector3, vel: THREE.Vector3, size = 1) {
    this._v.copy(vel).multiplyScalar(0.6);
    this._v.x += (Math.random() - 0.5) * 3; this._v.y += Math.random() * 3; this._v.z += (Math.random() - 0.5) * 3;
    this.fire.emit(pos, this._v, 0.35, 1.8 * size, 0.6 * size, 1, 0.5, 0.15, 0.9, 2);
  }

  update(dt: number, fog: THREE.FogExp2) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      d.vel.y -= 9.8 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt; d.mesh.rotation.y += d.spin.y * dt;
      const gh = Math.max(terrainHeight(d.mesh.position.x, d.mesh.position.z), 0);
      if (d.mesh.position.y < gh + 0.2) {
        d.mesh.position.y = gh + 0.2;
        d.vel.multiplyScalar(0.35); d.vel.y = Math.abs(d.vel.y) * 0.3; d.spin.multiplyScalar(0.5);
      }
      if (d.smoke && d.life > 2 && Math.random() < 0.5) this.trailSmoke(d.mesh.position, d.vel, 0.9, 0.7);
      if (d.fire && d.life > 3) this.flame(d.mesh.position, d.vel, 0.8);
      if (d.life <= 0) { this.group.remove(d.mesh); this.debris.splice(i, 1); }
    }
    for (const f of this.flashes) {
      if (f.t > 0) { f.t -= dt; f.light.intensity = Math.max(0, f.t) * f.max * 8; } else f.light.intensity = 0;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / r.max;
      r.mesh.scale.setScalar(1 + k * r.size);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k);
      if (k >= 1) { this.group.remove(r.mesh); (r.mesh.material as THREE.Material).dispose(); r.mesh.geometry.dispose(); this.rings.splice(i, 1); }
    }
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t -= dt;
      const p = this._p.copy(f.pos);
      p.x += (Math.random() - 0.5) * f.size * 3; p.z += (Math.random() - 0.5) * f.size * 3;
      if (Math.random() < 0.8) { this._v.set(0, 5 + Math.random() * 5, 0); this.fire.emit(p, this._v, 0.7, 3 * f.size, 1 * f.size, 1, 0.45, 0.12, 0.9, 1); }
      if (Math.random() < 0.5) { this._v.set(2, 8 + Math.random() * 6, 1); this.smoke.emit(p, this._v, 8, 4 * f.size, 30 * f.size, 0.08, 0.08, 0.08, 0.6, 0.15, 0.5); }
      if (f.t <= 0) this.fires.splice(i, 1);
    }
    this.smoke.update(dt, fog);
    this.fire.update(dt, fog);
  }

  clear() {
    this.scorchN = 0; this.scorchMesh.count = 0;
    for (const d of this.debris) this.group.remove(d.mesh);
    this.debris.length = 0;
    this.fires.length = 0;
  }
}

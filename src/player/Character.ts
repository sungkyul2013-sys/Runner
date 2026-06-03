import * as THREE from 'three';
import type { CharColors } from '../data/characters';

export type Pose = 'run' | 'air' | 'slide' | 'idle';

/**
 * A chunky, readable humanoid runner assembled from Three.js primitives — head,
 * brim hat, torso, two arms, two legs and two shoes — coloured from a
 * {@link CharColors} set (skin / shirt / pants / shoes / hat). Hip and shoulder
 * pivots are driven by procedural animation: a sinusoidal sprint, a tuck in the
 * air, and a forward lean while sliding. The {@link group} is centred on the
 * player's origin so it drops into the Player physics unchanged.
 */
export class Character {
  readonly group = new THREE.Group();

  private readonly inner = new THREE.Group();
  private readonly baseY = -0.85; // model spans ~0..1.85 → centre on origin
  private leftLeg!: THREE.Group;
  private rightLeg!: THREE.Group;
  private leftArm!: THREE.Group;
  private rightArm!: THREE.Group;

  private readonly disposables: { dispose(): void }[] = [];
  private phase = 0;

  constructor(colors: CharColors) {
    this.build(colors);
    this.inner.position.y = this.baseY;
    this.group.add(this.inner);
  }

  private mat(color: number, ei = 0.08): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: ei,
      roughness: 0.55,
      metalness: 0.05,
    });
    this.disposables.push(m);
    return m;
  }

  private box(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
    const g = new THREE.BoxGeometry(w, h, d);
    this.disposables.push(g);
    return new THREE.Mesh(g, mat);
  }

  /** A limb hanging from a pivot at `pivotY`, optionally with a shoe at the foot. */
  private limb(
    x: number,
    pivotY: number,
    w: number,
    len: number,
    mat: THREE.Material,
    shoeMat?: THREE.Material,
  ): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.set(x, pivotY, 0);
    const mesh = this.box(w, len, w, mat);
    mesh.position.y = -len / 2;
    pivot.add(mesh);
    if (shoeMat) {
      const shoe = this.box(w * 1.2, 0.16, w * 1.6, shoeMat);
      shoe.position.set(0, -len + 0.02, 0.06);
      pivot.add(shoe);
    }
    return pivot;
  }

  private build(c: CharColors): void {
    const skin = this.mat(c.skin);
    const shirt = this.mat(c.shirt, 0.12);
    const pants = this.mat(c.pants);
    const shoes = this.mat(c.shoes);
    const hat = this.mat(c.hat, 0.12);

    // Torso (shirt) + small hip block (pants).
    const torso = this.box(0.52, 0.62, 0.32, shirt);
    torso.position.y = 1.25;
    this.inner.add(torso);
    const hips = this.box(0.5, 0.22, 0.32, pants);
    hips.position.y = 0.92;
    this.inner.add(hips);

    // Head (skin) + brim hat.
    const head = this.box(0.4, 0.4, 0.4, skin);
    head.position.y = 1.78;
    this.inner.add(head);
    // Eyes (tiny dark blocks) for a face.
    const eyeMat = this.mat(0x201826);
    for (const sx of [-0.1, 0.1]) {
      const eye = this.box(0.06, 0.08, 0.04, eyeMat);
      eye.position.set(sx, 1.8, 0.21);
      this.inner.add(eye);
    }
    // Hat: crown + brim.
    const crown = this.box(0.44, 0.16, 0.44, hat);
    crown.position.y = 2.02;
    this.inner.add(crown);
    const brim = this.box(0.6, 0.05, 0.6, hat);
    brim.position.y = 1.95;
    this.inner.add(brim);

    // Limbs: arms (skin sleeves) + legs (pants) with shoes.
    this.leftArm = this.limb(-0.36, 1.5, 0.15, 0.58, skin);
    this.rightArm = this.limb(0.36, 1.5, 0.15, 0.58, skin);
    this.leftLeg = this.limb(-0.15, 0.9, 0.19, 0.78, pants, shoes);
    this.rightLeg = this.limb(0.15, 0.9, 0.19, 0.78, pants, shoes);
    this.inner.add(this.leftArm, this.rightArm, this.leftLeg, this.rightLeg);
  }

  /** @param cadence ~1 at base speed, higher when faster (drives stride rate). */
  update(dt: number, pose: Pose, cadence: number): void {
    if (pose === 'run') {
      this.phase += dt * (7 + cadence * 3);
      const s = Math.sin(this.phase);
      this.leftLeg.rotation.x = s * 0.75;
      this.rightLeg.rotation.x = -s * 0.75;
      this.leftArm.rotation.x = -s * 0.6;
      this.rightArm.rotation.x = s * 0.6;
      this.inner.position.y = this.baseY + Math.abs(s) * 0.05;
      this.inner.rotation.x = 0.08; // slight forward lean
    } else {
      const t = 1 - Math.exp(-12 * dt);
      const target =
        pose === 'air'
          ? { leg: -0.6, arm: -1.4, lean: 0.0 }
          : pose === 'slide'
            ? { leg: 1.1, arm: -0.5, lean: 0.5 }
            : { leg: 0.05, arm: 0.05, lean: 0.0 };
      this.leftLeg.rotation.x += (target.leg - this.leftLeg.rotation.x) * t;
      this.rightLeg.rotation.x += (target.leg - this.rightLeg.rotation.x) * t;
      this.leftArm.rotation.x += (target.arm - this.leftArm.rotation.x) * t;
      this.rightArm.rotation.x += (target.arm - this.rightArm.rotation.x) * t;
      this.inner.position.y += (this.baseY - this.inner.position.y) * t;
      this.inner.rotation.x += (target.lean - this.inner.rotation.x) * t;
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}

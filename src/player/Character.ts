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

    // Head (skin) — slightly oversized for a friendly, readable silhouette.
    const head = this.box(0.46, 0.44, 0.46, skin);
    head.position.y = 1.8;
    this.inner.add(head);
    // Eyes (tiny dark blocks) for a face.
    const eyeMat = this.mat(0x201826);
    for (const sx of [-0.11, 0.11]) {
      const eye = this.box(0.07, 0.09, 0.04, eyeMat);
      eye.position.set(sx, 1.82, 0.24);
      this.inner.add(eye);
    }
    // Hat: crown + brim.
    const crown = this.box(0.5, 0.16, 0.5, hat);
    crown.position.y = 2.07;
    this.inner.add(crown);
    const brim = this.box(0.66, 0.05, 0.66, hat);
    brim.position.y = 2.0;
    this.inner.add(brim);

    // Backpack — the runner's signature.
    const pack = this.box(0.4, 0.46, 0.18, shoes);
    pack.position.set(0, 1.3, -0.26);
    this.inner.add(pack);
    const strapMat = this.mat(c.pants);
    for (const sx of [-0.16, 0.16]) {
      const strap = this.box(0.07, 0.5, 0.34, strapMat);
      strap.position.set(sx, 1.32, -0.02);
      this.inner.add(strap);
    }

    // Limbs: arms (skin sleeves) + legs (pants) with shoes.
    this.leftArm = this.limb(-0.36, 1.5, 0.15, 0.58, skin);
    this.rightArm = this.limb(0.36, 1.5, 0.15, 0.58, skin);
    this.leftLeg = this.limb(-0.15, 0.9, 0.19, 0.78, pants, shoes);
    this.rightLeg = this.limb(0.15, 0.9, 0.19, 0.78, pants, shoes);
    this.inner.add(this.leftArm, this.rightArm, this.leftLeg, this.rightLeg);
  }

  /**
   * Menu showcase: cycle through a variety of lively poses (jog → cheer → wave
   * → hop → idle) so the character feels alive and shows personality on the
   * home / character screens. `elapsed` drives the cycle.
   */
  showcase(dt: number, elapsed: number): void {
    const cycle = 9; // seconds for a full set of poses
    const phase = (elapsed % cycle) / cycle; // 0..1
    const t = 1 - Math.exp(-10 * dt);
    if (phase < 0.34) {
      // Jog on the spot.
      this.update(dt, 'run', 1);
      return;
    }
    let arm = 0.05, armAsym = 0, leg = 0.05, lean = 0, yOff = 0, hop = 0;
    if (phase < 0.5) {
      // Cheer — both arms up.
      arm = -2.6;
    } else if (phase < 0.66) {
      // Wave — one arm up, swaying.
      armAsym = -2.4 + Math.sin(elapsed * 6) * 0.3;
      arm = 0.1;
    } else if (phase < 0.82) {
      // Little hops.
      hop = Math.max(0, Math.sin(elapsed * 7)) * 0.35;
      arm = -0.5;
      leg = -0.2;
    } else {
      // Relaxed idle bob.
      yOff = Math.sin(elapsed * 2) * 0.03;
    }
    this.leftLeg.rotation.x += (leg - this.leftLeg.rotation.x) * t;
    this.rightLeg.rotation.x += (leg - this.rightLeg.rotation.x) * t;
    this.leftArm.rotation.x += (arm - this.leftArm.rotation.x) * t;
    this.rightArm.rotation.x += ((arm + armAsym) - this.rightArm.rotation.x) * t;
    this.inner.position.y += (this.baseY + yOff + hop - this.inner.position.y) * t;
    this.inner.rotation.x += (lean - this.inner.rotation.x) * t;
    this.inner.rotation.y += (Math.sin(elapsed * 0.6) * 0.25 - this.inner.rotation.y) * t;
  }

  /** @param cadence ~1 at base speed, higher when faster (drives stride rate). */
  update(dt: number, pose: Pose, cadence: number): void {
    if (pose !== 'run') this.inner.rotation.y += (0 - this.inner.rotation.y) * (1 - Math.exp(-10 * dt));
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
      // Snappy easing so jump/slide poses read instantly.
      const t = 1 - Math.exp(-18 * dt);
      // `lean` rotates the whole body about X: negative leans back (baseball
      // slide), the legs kick forward and arms swing back for a dynamic duck.
      const target =
        pose === 'air'
          ? { leg: -0.7, arm: -1.5, lean: 0.0, yOff: 0 }
          : pose === 'slide'
            ? { leg: -1.15, arm: 0.9, lean: -0.95, yOff: -0.12 }
            : { leg: 0.05, arm: 0.05, lean: 0.0, yOff: 0 };
      this.leftLeg.rotation.x += (target.leg - this.leftLeg.rotation.x) * t;
      this.rightLeg.rotation.x += (target.leg - this.rightLeg.rotation.x) * t;
      this.leftArm.rotation.x += (target.arm - this.leftArm.rotation.x) * t;
      this.rightArm.rotation.x += (target.arm - this.rightArm.rotation.x) * t;
      this.inner.position.y += (this.baseY + target.yOff - this.inner.position.y) * t;
      this.inner.rotation.x += (target.lean - this.inner.rotation.x) * t;
    }
  }

  /** Raise both arms in a triumphant cheer (used by the record celebration). */
  cheerArms(dt: number): void {
    const t = 1 - Math.exp(-12 * dt);
    this.leftArm.rotation.x += (-2.7 - this.leftArm.rotation.x) * t;
    this.rightArm.rotation.x += (-2.7 - this.rightArm.rotation.x) * t;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}

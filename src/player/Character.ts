import * as THREE from 'three';
import type { CharColors } from '../data/characters';

export type Pose = 'run' | 'air' | 'slide' | 'idle' | 'stumble' | 'surf' | 'fly';

/**
 * The stylised runner rig: head with hair and a cap, a hooded top, cargo
 * bottoms, chunky sneakers, a spray-can backpack and a scarf that streams
 * behind at speed — all assembled from primitives and coloured from a
 * {@link CharColors} set. Hips, shoulders, elbows, knees, neck and torso are
 * separate pivots driven by procedural animation, so the sprint has real
 * counter-rotation, the jump tucks, the roll goes into a baseball slide, a
 * stumble pitches the body forward, and the hoverboard pose crouches into a
 * carve. The {@link group} is centred on the player's origin so it drops into
 * the Player physics untouched.
 */
export class Character {
  readonly group = new THREE.Group();

  private readonly inner = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly baseY = -0.85; // model spans ~0..1.9 → centred on the origin

  private hipL!: THREE.Group;
  private hipR!: THREE.Group;
  private kneeL!: THREE.Group;
  private kneeR!: THREE.Group;
  private shoulderL!: THREE.Group;
  private shoulderR!: THREE.Group;
  private elbowL!: THREE.Group;
  private elbowR!: THREE.Group;
  private head!: THREE.Group;
  private scarf!: THREE.Group;

  private readonly disposables: { dispose(): void }[] = [];
  private phase = 0;
  private scarfPhase = 0;

  constructor(colors: CharColors, scale = 1) {
    this.build(colors);
    this.inner.position.y = this.baseY;
    this.inner.scale.setScalar(scale);
    this.group.add(this.inner);
  }

  private mat(color: number, ei = 0.05, rough = 0.62): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: ei, roughness: rough, metalness: 0.05,
    });
    this.disposables.push(m);
    return m;
  }

  private box(w: number, h: number, d: number, mat: THREE.Material, r = 0): THREE.Mesh {
    const g = r > 0
      ? new THREE.CapsuleGeometry(Math.min(w, d) / 2, Math.max(0.01, h - Math.min(w, d)), 4, 8)
      : new THREE.BoxGeometry(w, h, d);
    this.disposables.push(g);
    return new THREE.Mesh(g, mat);
  }

  /** A two-segment limb: upper pivot → lower pivot (knee/elbow) → optional foot. */
  private limb(
    x: number, pivotY: number, w: number, upper: number, lower: number,
    upperMat: THREE.Material, lowerMat: THREE.Material, footMat?: THREE.Material,
  ): { root: THREE.Group; joint: THREE.Group } {
    const root = new THREE.Group();
    root.position.set(x, pivotY, 0);
    const up = this.box(w, upper, w, upperMat);
    up.position.y = -upper / 2;
    root.add(up);

    const joint = new THREE.Group();
    joint.position.y = -upper;
    root.add(joint);
    const lo = this.box(w * 0.92, lower, w * 0.92, lowerMat);
    lo.position.y = -lower / 2;
    joint.add(lo);
    if (footMat) {
      const foot = this.box(w * 1.25, 0.17, w * 1.85, footMat);
      foot.position.set(0, -lower + 0.03, 0.07);
      joint.add(foot);
      const sole = this.box(w * 1.3, 0.06, w * 1.95, this.mat(0xf2f2f2, 0.02));
      sole.position.set(0, -lower - 0.05, 0.07);
      joint.add(sole);
    }
    return { root, joint };
  }

  private build(c: CharColors): void {
    const skin = this.mat(c.skin);
    const hair = this.mat(c.hair, 0.03, 0.8);
    const top = this.mat(c.top, 0.1);
    const topDark = this.mat(shade(c.top, -0.22), 0.06);
    const bottom = this.mat(c.bottom);
    const shoes = this.mat(c.shoes, 0.08);
    const cap = this.mat(c.cap, 0.1);
    const accent = this.mat(c.accent, 0.22);

    // ── Torso (own pivot so the whole upper body can lean) ──
    this.torso.position.y = 0.94;
    this.inner.add(this.torso);

    const chest = this.box(0.56, 0.5, 0.34, top);
    chest.position.y = 0.3;
    this.torso.add(chest);
    const belly = this.box(0.5, 0.22, 0.3, topDark);
    belly.position.y = 0.02;
    this.torso.add(belly);
    // Hood bunched at the neck.
    const hood = this.box(0.44, 0.2, 0.26, topDark);
    hood.position.set(0, 0.56, -0.14);
    this.torso.add(hood);
    // Zip / print stripe.
    const zip = this.box(0.07, 0.46, 0.02, accent);
    zip.position.set(0, 0.3, 0.18);
    this.torso.add(zip);

    // Hips.
    const hips = this.box(0.5, 0.2, 0.32, bottom);
    hips.position.y = -0.08;
    this.torso.add(hips);

    // ── Head (own pivot for the look-ahead tilt) ──
    this.head = new THREE.Group();
    this.head.position.y = 0.62;
    this.torso.add(this.head);
    const skull = this.box(0.42, 0.42, 0.42, skin);
    skull.position.y = 0.2;
    this.head.add(skull);
    const hairBack = this.box(0.44, 0.3, 0.44, hair);
    hairBack.position.set(0, 0.3, -0.04);
    this.head.add(hairBack);
    // Eyes + brows.
    const eyeW = this.mat(0xffffff, 0.02);
    const pupil = this.mat(0x201826);
    for (const sx of [-0.1, 0.1]) {
      const e = this.box(0.11, 0.11, 0.03, eyeW);
      e.position.set(sx, 0.22, 0.215);
      this.head.add(e);
      const p = this.box(0.055, 0.07, 0.03, pupil);
      p.position.set(sx + (sx > 0 ? 0.01 : -0.01), 0.21, 0.23);
      this.head.add(p);
      const b = this.box(0.12, 0.03, 0.03, hair);
      b.position.set(sx, 0.31, 0.22);
      this.head.add(b);
    }
    // Cap: crown + peak, worn slightly back.
    const crown = this.box(0.46, 0.18, 0.46, cap);
    crown.position.y = 0.44;
    this.head.add(crown);
    const peak = this.box(0.44, 0.05, 0.3, cap);
    peak.position.set(0, 0.37, 0.3);
    this.head.add(peak);
    const button = this.box(0.08, 0.06, 0.08, accent);
    button.position.y = 0.54;
    this.head.add(button);

    // ── Backpack + spray cans ──
    const pack = this.box(0.42, 0.5, 0.2, this.mat(shade(c.accent, -0.15), 0.06));
    pack.position.set(0, 0.3, -0.29);
    this.torso.add(pack);
    for (const sx of [-0.11, 0.11]) {
      const can = this.box(0.11, 0.26, 0.11, accent);
      can.position.set(sx, 0.56, -0.3);
      this.torso.add(can);
    }
    for (const sx of [-0.17, 0.17]) {
      const strap = this.box(0.07, 0.5, 0.36, topDark);
      strap.position.set(sx, 0.3, -0.02);
      this.torso.add(strap);
    }

    // ── Scarf (streams behind at speed) ──
    this.scarf = new THREE.Group();
    this.scarf.position.set(0, 0.56, -0.16);
    this.torso.add(this.scarf);
    for (let i = 0; i < 3; i++) {
      const seg = this.box(0.2 - i * 0.03, 0.1, 0.34, accent);
      seg.position.set(0, -i * 0.06, -0.2 - i * 0.32);
      this.scarf.add(seg);
    }

    // ── Limbs ──
    // Shoulder caps hide the pivot seam and round the silhouette off.
    for (const sx of [-0.34, 0.34]) {
      const cap = this.box(0.2, 0.18, 0.24, top);
      cap.position.set(sx, 0.48, 0);
      this.torso.add(cap);
    }
    const armL = this.limb(-0.34, 0.44, 0.13, 0.32, 0.3, top, skin);
    const armR = this.limb(0.34, 0.44, 0.13, 0.32, 0.3, top, skin);
    this.shoulderL = armL.root;
    this.shoulderR = armR.root;
    this.elbowL = armL.joint;
    this.elbowR = armR.joint;
    this.torso.add(this.shoulderL, this.shoulderR);

    const legL = this.limb(-0.15, -0.06, 0.19, 0.42, 0.42, bottom, bottom, shoes);
    const legR = this.limb(0.15, -0.06, 0.19, 0.42, 0.42, bottom, bottom, shoes);
    this.hipL = legL.root;
    this.hipR = legR.root;
    this.kneeL = legL.joint;
    this.kneeR = legR.joint;
    this.torso.add(this.hipL, this.hipR);
  }

  /** Menu showcase: a lively pose cycle so the character has personality. */
  showcase(dt: number, elapsed: number): void {
    const cycle = 10;
    const phase = (elapsed % cycle) / cycle;
    const t = 1 - Math.exp(-9 * dt);
    if (phase < 0.3) {
      this.update(dt, 'run', 1);
      return;
    }
    let arm = 0.06, armAsym = 0, elbow = -0.25, leg = 0.05, knee = 0, lean = 0, yOff = 0, headTilt = 0;
    if (phase < 0.46) {
      arm = -2.7; elbow = -0.15; headTilt = -0.2;            // both arms up, cheering
    } else if (phase < 0.62) {
      armAsym = -2.5 + Math.sin(elapsed * 7) * 0.35;          // wave
      elbow = -0.5;
    } else if (phase < 0.78) {
      yOff = Math.max(0, Math.sin(elapsed * 7)) * 0.36;       // little hops
      arm = -0.45; elbow = -0.9; leg = -0.22; knee = -0.5;
    } else {
      yOff = Math.sin(elapsed * 2) * 0.03;                    // relaxed idle
      arm = 0.1; elbow = -0.45; headTilt = Math.sin(elapsed * 1.3) * 0.12;
    }
    this.ease(this.hipL, leg, t); this.ease(this.hipR, leg, t);
    this.ease(this.kneeL, knee, t); this.ease(this.kneeR, knee, t);
    this.ease(this.shoulderL, arm, t); this.ease(this.shoulderR, arm + armAsym, t);
    this.ease(this.elbowL, elbow, t); this.ease(this.elbowR, elbow, t);
    this.head.rotation.x += (headTilt - this.head.rotation.x) * t;
    this.inner.position.y += (this.baseY + yOff - this.inner.position.y) * t;
    this.torso.rotation.x += (lean - this.torso.rotation.x) * t;
    this.inner.rotation.y += (Math.sin(elapsed * 0.55) * 0.3 - this.inner.rotation.y) * t;
    this.scarfIdle(dt, 0.4);
  }

  private ease(g: THREE.Group, target: number, t: number): void {
    g.rotation.x += (target - g.rotation.x) * t;
  }

  /** @param cadence ~1 at base speed, higher when faster (drives stride rate). */
  update(dt: number, pose: Pose, cadence: number): void {
    if (pose !== 'run') {
      this.inner.rotation.y += (0 - this.inner.rotation.y) * (1 - Math.exp(-10 * dt));
    }
    if (pose === 'run') {
      this.phase += dt * (7.4 + cadence * 3.4);
      const s = Math.sin(this.phase);
      const c = Math.cos(this.phase);
      // Legs: hip swing with a knee that folds on the recovery stroke.
      this.hipL.rotation.x = s * 0.85;
      this.hipR.rotation.x = -s * 0.85;
      this.kneeL.rotation.x = -Math.max(0, -s) * 1.5 - 0.1;
      this.kneeR.rotation.x = -Math.max(0, s) * 1.5 - 0.1;
      // Arms counter-rotate with a locked-in elbow bend.
      this.shoulderL.rotation.x = -s * 0.8;
      this.shoulderR.rotation.x = s * 0.8;
      this.elbowL.rotation.x = -0.9 - Math.max(0, -s) * 0.5;
      this.elbowR.rotation.x = -0.9 - Math.max(0, s) * 0.5;
      // Body: bob, shoulder roll, forward drive, head steady on the horizon.
      this.inner.position.y = this.baseY + Math.abs(s) * 0.055;
      this.torso.rotation.x = 0.16;
      this.torso.rotation.y = c * 0.12;
      this.torso.rotation.z = 0;
      this.head.rotation.x = -0.14;
      this.scarfIdle(dt, 1 + cadence);
      return;
    }

    const t = 1 - Math.exp(-17 * dt);
    const target = POSES[pose];
    this.ease(this.hipL, target.hip + (target.hipSplit ?? 0), t);
    this.ease(this.hipR, target.hip - (target.hipSplit ?? 0), t);
    this.ease(this.kneeL, target.knee, t);
    this.ease(this.kneeR, target.knee, t);
    this.ease(this.shoulderL, target.arm, t);
    this.ease(this.shoulderR, target.arm, t);
    this.ease(this.elbowL, target.elbow, t);
    this.ease(this.elbowR, target.elbow, t);
    this.inner.position.y += (this.baseY + target.yOff - this.inner.position.y) * t;
    this.torso.rotation.x += (target.lean - this.torso.rotation.x) * t;
    this.torso.rotation.y += (0 - this.torso.rotation.y) * t;
    this.torso.rotation.z += ((target.roll ?? 0) - this.torso.rotation.z) * t;
    this.head.rotation.x += (target.head - this.head.rotation.x) * t;
    this.scarfIdle(dt, pose === 'fly' ? 2.4 : 1);
  }

  /** Gentle scarf flutter; `wind` scales the amplitude with speed. */
  private scarfIdle(dt: number, wind: number): void {
    this.scarfPhase += dt * (4 + wind * 2);
    const a = Math.sin(this.scarfPhase) * 0.16 * Math.min(2, wind);
    this.scarf.rotation.x = -0.35 - Math.min(0.5, wind * 0.16);
    this.scarf.rotation.z = a;
    this.scarf.rotation.y = Math.cos(this.scarfPhase * 0.7) * 0.1;
  }

  /** Raise both arms in a triumphant cheer (used by the record celebration). */
  cheerArms(dt: number): void {
    const t = 1 - Math.exp(-12 * dt);
    this.ease(this.shoulderL, -2.8, t);
    this.ease(this.shoulderR, -2.8, t);
    this.ease(this.elbowL, -0.2, t);
    this.ease(this.elbowR, -0.2, t);
  }

  /** Caught by the inspector: legs kicking, arms flailing overhead. */
  caught(dt: number, elapsed: number): void {
    const t = 1 - Math.exp(-12 * dt);
    const k = Math.sin(elapsed * 12);
    this.ease(this.shoulderL, -2.4 + k * 0.3, t);
    this.ease(this.shoulderR, -2.4 - k * 0.3, t);
    this.ease(this.elbowL, -0.4, t);
    this.ease(this.elbowR, -0.4, t);
    this.hipL.rotation.x = 0.5 + k * 0.5;
    this.hipR.rotation.x = 0.5 - k * 0.5;
    this.kneeL.rotation.x = -0.9;
    this.kneeR.rotation.x = -0.9;
    this.torso.rotation.x += (-0.25 - this.torso.rotation.x) * t;
    this.head.rotation.x += (0.3 - this.head.rotation.x) * t;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}

interface PoseTarget {
  hip: number;
  hipSplit?: number;
  knee: number;
  arm: number;
  elbow: number;
  lean: number;
  roll?: number;
  head: number;
  yOff: number;
}

/** Static pose targets the rig eases toward when it is not sprinting. */
const POSES: Record<Exclude<Pose, 'run'>, PoseTarget> = {
  air: { hip: -0.7, hipSplit: 0.4, knee: -1.25, arm: -1.15, elbow: -1.15, lean: 0.1, head: -0.2, yOff: 0 },
  slide: { hip: -1.25, knee: -0.35, arm: 1.0, elbow: -0.35, lean: -1.0, head: 0.55, yOff: -0.12 },
  idle: { hip: 0.05, knee: -0.08, arm: 0.08, elbow: -0.4, lean: 0, head: 0, yOff: 0 },
  stumble: { hip: 0.55, hipSplit: 0.5, knee: -0.6, arm: -2.1, elbow: -0.2, lean: 0.62, head: -0.45, yOff: -0.08 },
  surf: { hip: 0.42, hipSplit: 0.22, knee: -0.85, arm: -0.35, elbow: -1.0, lean: 0.12, roll: 0.1, head: -0.1, yOff: -0.05 },
  fly: { hip: -0.28, hipSplit: 0.2, knee: -0.4, arm: 0.7, elbow: -0.6, lean: -0.22, head: -0.3, yOff: 0 },
};

/** Darken (t<0) or lighten (t>0) a packed hex colour. */
function shade(hex: number, t: number): number {
  const c = new THREE.Color(hex);
  if (t < 0) c.multiplyScalar(1 + t);
  else c.lerp(new THREE.Color(0xffffff), t);
  return c.getHex();
}

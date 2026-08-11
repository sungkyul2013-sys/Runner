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

  private box(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
    const g = new THREE.BoxGeometry(w, h, d);
    this.disposables.push(g);
    return new THREE.Mesh(g, mat);
  }

  /** A rounded limb segment / soft volume. */
  private capsule(radius: number, length: number, mat: THREE.Material): THREE.Mesh {
    const g = new THREE.CapsuleGeometry(radius, Math.max(0.01, length), 5, 12);
    this.disposables.push(g);
    return new THREE.Mesh(g, mat);
  }

  /** A short cylinder — hat bands, discs. */
  private cyl(radius: number, height: number, mat: THREE.Material): THREE.Mesh {
    const g = new THREE.CylinderGeometry(radius, radius, height, 16);
    this.disposables.push(g);
    return new THREE.Mesh(g, mat);
  }

  private ball(radius: number, mat: THREE.Material): THREE.Mesh {
    const g = new THREE.SphereGeometry(radius, 14, 11);
    this.disposables.push(g);
    return new THREE.Mesh(g, mat);
  }

  /**
   * A two-segment limb built from capsules with a ball joint at the elbow/knee:
   * upper pivot → joint → lower segment → hand or shoe. The rounded segments
   * and the joint ball are what stop the rig reading as a stack of blocks when
   * it bends.
   */
  private limb(
    x: number, pivotY: number, w: number, upper: number, lower: number,
    upperMat: THREE.Material, lowerMat: THREE.Material, footMat?: THREE.Material,
  ): { root: THREE.Group; joint: THREE.Group } {
    const r = w / 2;
    const root = new THREE.Group();
    root.position.set(x, pivotY, 0);
    const up = this.capsule(r, upper - w, upperMat);
    up.position.y = -upper / 2;
    root.add(up);

    const joint = new THREE.Group();
    joint.position.y = -upper;
    root.add(joint);
    // Ball joint fills the crease so a bent limb stays one continuous form.
    const knuckle = this.ball(r * 0.98, lowerMat);
    joint.add(knuckle);
    const lo = this.capsule(r * 0.92, lower - w * 0.92, lowerMat);
    lo.position.y = -lower / 2;
    joint.add(lo);

    if (footMat) {
      // Chunky sneaker: sole slab, toe cap and a lace strap.
      const shoe = this.box(w * 1.22, 0.16, w * 1.7, footMat);
      shoe.position.set(0, -lower + 0.02, 0.08);
      joint.add(shoe);
      const toe = this.capsule(w * 0.55, w * 0.5, footMat);
      toe.rotation.x = Math.PI / 2;
      toe.position.set(0, -lower + 0.03, w * 0.86);
      joint.add(toe);
      const sole = this.box(w * 1.3, 0.07, w * 1.9, this.mat(0xf4f4f4, 0.02));
      sole.position.set(0, -lower - 0.07, 0.08);
      joint.add(sole);
      const lace = this.box(w * 1.05, 0.05, w * 0.3, this.mat(0xf4f4f4, 0.02));
      lace.position.set(0, -lower + 0.11, w * 0.28);
      joint.add(lace);
    } else {
      // Bare hand: a ball with a thumb nub so the arm ends in something.
      const hand = this.ball(r * 1.18, lowerMat);
      hand.scale.set(1, 1.12, 0.85);
      hand.position.y = -lower - r * 0.35;
      joint.add(hand);
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

    // Rounded chest: a capsule squashed into a barrel gives soft shoulders and
    // a tapered waist without any hard corners catching the key light.
    const chest = this.capsule(0.19, 0.2, top);
    chest.scale.set(1.5, 1.25, 1.0);
    chest.position.y = 0.3;
    this.torso.add(chest);
    const belly = this.capsule(0.16, 0.06, topDark);
    belly.scale.set(1.5, 1.1, 1.0);
    belly.position.y = 0.03;
    this.torso.add(belly);
    // Hood bunched at the neck.
    const hood = this.capsule(0.13, 0.16, topDark);
    hood.rotation.x = Math.PI / 2;
    hood.scale.set(1.5, 1, 0.8);
    hood.position.set(0, 0.55, -0.15);
    this.torso.add(hood);
    // Zip / print stripe.
    const zip = this.box(0.07, 0.44, 0.03, accent);
    zip.position.set(0, 0.3, 0.165);
    this.torso.add(zip);
    // Neck, so the head is joined to the body rather than floating above it.
    const neck = this.capsule(0.09, 0.08, skin);
    neck.position.y = 0.55;
    this.torso.add(neck);

    // Hips + belt.
    const hips = this.capsule(0.16, 0.06, bottom);
    hips.scale.set(1.5, 1, 1.0);
    hips.position.y = -0.07;
    this.torso.add(hips);
    const belt = this.box(0.5, 0.07, 0.33, this.mat(shade(c.bottom, -0.4)));
    belt.position.y = 0.05;
    this.torso.add(belt);
    const buckle = this.box(0.1, 0.09, 0.36, accent);
    buckle.position.y = 0.05;
    this.torso.add(buckle);

    // ── Head (own pivot for the look-ahead tilt) ──
    this.head = new THREE.Group();
    this.head.position.y = 0.62;
    this.torso.add(this.head);
    // Soft-cube skull: a sphere stretched square-ish keeps the blocky charm
    // while losing the hard corners.
    const skull = this.ball(0.23, skin);
    skull.scale.set(0.94, 0.98, 0.96);
    skull.position.y = 0.21;
    this.head.add(skull);
    const jaw = this.capsule(0.13, 0.12, skin);
    jaw.rotation.z = Math.PI / 2;
    jaw.scale.set(1, 1, 0.86);
    jaw.position.set(0, 0.1, 0.03);
    this.head.add(jaw);
    const hairBack = this.ball(0.235, hair);
    hairBack.scale.set(0.96, 0.72, 0.98);
    hairBack.position.set(0, 0.3, -0.03);
    this.head.add(hairBack);
    for (const sx of [-0.215, 0.215]) {
      const ear = this.ball(0.052, skin);
      ear.scale.set(0.6, 1.15, 1);
      ear.position.set(sx, 0.2, 0.01);
      this.head.add(ear);
    }
    // Eyes + brows. Positions hug the skull sphere so nothing floats off it.
    const eyeW = this.mat(0xffffff, 0.02);
    const pupil = this.mat(0x201826);
    for (const sx of [-0.095, 0.095]) {
      const e = this.ball(0.055, eyeW);
      e.scale.set(1, 1.05, 0.55);
      e.position.set(sx, 0.22, 0.185);
      this.head.add(e);
      const p = this.ball(0.03, pupil);
      p.scale.set(1, 1.15, 0.7);
      p.position.set(sx + (sx > 0 ? 0.006 : -0.006), 0.215, 0.212);
      this.head.add(p);
      // A catchlight is what makes the face feel alive rather than painted on.
      const glint = this.ball(0.012, eyeW);
      glint.position.set(sx + (sx > 0 ? 0.016 : 0.004), 0.238, 0.229);
      this.head.add(glint);
      const b = this.capsule(0.016, 0.08, hair);
      b.rotation.set(0, 0, Math.PI / 2 + (sx > 0 ? -0.12 : 0.12));
      b.position.set(sx, 0.298, 0.183);
      this.head.add(b);
    }
    // Cap: domed crown + curved peak, worn slightly back.
    const crown = this.ball(0.245, cap);
    crown.scale.set(1, 0.66, 1);
    crown.position.y = 0.36;
    this.head.add(crown);
    const band = this.cyl(0.248, 0.05, this.mat(shade(c.cap, -0.35), 0.06));
    band.position.y = 0.345;
    this.head.add(band);
    // Peak: a thin plate, tipped down at the front like a worn-in brim.
    const peak = this.box(0.4, 0.045, 0.26, cap);
    peak.rotation.x = -0.2;
    peak.position.set(0, 0.335, 0.27);
    this.head.add(peak);
    const peakTip = this.capsule(0.022, 0.36, cap);
    peakTip.rotation.z = Math.PI / 2;
    peakTip.position.set(0, 0.31, 0.39);
    this.head.add(peakTip);
    const button = this.ball(0.045, accent);
    button.position.y = 0.53;
    this.head.add(button);

    // ── Backpack + spray cans ──
    const packMat = this.mat(shade(c.accent, -0.15), 0.06);
    const pack = this.capsule(0.15, 0.24, packMat);
    pack.scale.set(1.35, 1.1, 0.7);
    pack.position.set(0, 0.3, -0.29);
    this.torso.add(pack);
    const flap = this.box(0.36, 0.1, 0.2, this.mat(shade(c.accent, -0.4), 0.04));
    flap.position.set(0, 0.42, -0.3);
    this.torso.add(flap);
    for (const sx of [-0.11, 0.11]) {
      const can = this.capsule(0.05, 0.16, accent);
      can.position.set(sx, 0.56, -0.3);
      this.torso.add(can);
      const nozzle = this.ball(0.032, this.mat(0xf4f4f4, 0.02));
      nozzle.position.set(sx, 0.67, -0.3);
      this.torso.add(nozzle);
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
      const seg = this.capsule(0.05, 0.26, accent);
      seg.rotation.x = Math.PI / 2;
      seg.scale.set(2 - i * 0.3, 1, 0.55);
      seg.position.set(0, -i * 0.06, -0.24 - i * 0.3);
      this.scarf.add(seg);
    }

    // ── Limbs ──
    // Deltoid balls hide the pivot seam and round the silhouette off.
    for (const sx of [-0.34, 0.34]) {
      const delt = this.ball(0.115, top);
      delt.position.set(sx, 0.45, 0);
      this.torso.add(delt);
    }
    const armL = this.limb(-0.34, 0.44, 0.13, 0.3, 0.26, top, skin);
    const armR = this.limb(0.34, 0.44, 0.13, 0.3, 0.26, top, skin);
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

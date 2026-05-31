import * as THREE from 'three';
import { getCosmetic, type EquippedCosmetics } from '../data/cosmetics';
import type { CharacterDef } from '../data/characters';

export type Pose = 'run' | 'air' | 'slide' | 'idle';

/**
 * An original character assembled entirely from Three.js primitives — no
 * external models. A humanoid with hip/shoulder pivots driven by procedural
 * animation (sinusoidal limb swing for running, a tuck in the air, a forward
 * lean while sliding). Archetype + palette + equipped cosmetics decide the
 * look. The {@link group} is centred on the player's origin so it drops into
 * the existing Player physics unchanged.
 */
export class Character {
  readonly group = new THREE.Group();

  private readonly inner = new THREE.Group();
  private readonly baseY: number;
  private leftLeg!: THREE.Group;
  private rightLeg!: THREE.Group;
  private leftArm!: THREE.Group;
  private rightArm!: THREE.Group;
  private head!: THREE.Object3D;

  private readonly disposables: { dispose(): void }[] = [];
  private phase = 0;

  constructor(def: CharacterDef, equipped: EquippedCosmetics) {
    this.build(def, equipped);
    // Model spans ~0..1.85 in feet-space; offset so it's centred on the origin.
    this.baseY = -0.85;
    this.inner.position.y = this.baseY;
    this.group.add(this.inner);
  }

  private mat(color: number, emissive: number, ei = 0.3): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: ei,
      roughness: 0.45,
      metalness: 0.2,
    });
    this.disposables.push(m);
    return m;
  }

  private box(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
    const g = new THREE.BoxGeometry(w, h, d);
    this.disposables.push(g);
    return new THREE.Mesh(g, mat);
  }

  private sphere(r: number, mat: THREE.Material): THREE.Mesh {
    const g = new THREE.SphereGeometry(r, 16, 12);
    this.disposables.push(g);
    return new THREE.Mesh(g, mat);
  }

  /** A limb hanging from a pivot at `pivotY` (so rotation.x swings it). */
  private limb(
    x: number,
    pivotY: number,
    w: number,
    len: number,
    mat: THREE.Material,
  ): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.set(x, pivotY, 0);
    const mesh = this.box(w, len, w, mat);
    mesh.position.y = -len / 2; // hang below the pivot
    pivot.add(mesh);
    return pivot;
  }

  private build(def: CharacterDef, equipped: EquippedCosmetics): void {
    const p = def.palette;
    const outfit = getCosmetic(equipped.outfit);
    const bodyColor = outfit?.color ?? p.primary;
    const bodyMat = this.mat(bodyColor, p.glow, 0.3);
    const limbMat = this.mat(p.secondary, p.glow, 0.25);
    const accentMat = this.mat(p.accent, p.glow, 0.4);

    const slim = def.archetype === 'sprite' ? 0.82 : 1;

    // Torso.
    const torso = this.box(0.5 * slim, 0.7, 0.3, bodyMat);
    torso.position.y = 1.2;
    this.inner.add(torso);

    // Outfit accents.
    if (outfit?.style === 'jacket') {
      const padL = this.box(0.22, 0.18, 0.34, accentMat);
      padL.position.set(-0.3 * slim, 1.5, 0);
      const padR = padL.clone();
      padR.position.x = 0.3 * slim;
      this.inner.add(padL, padR);
    }

    // Head (archetype-specific).
    if (def.archetype === 'mech') {
      this.head = this.box(0.42, 0.42, 0.42, bodyMat);
      const eye = this.box(0.3, 0.08, 0.05, accentMat);
      eye.position.set(0, 0.03, 0.21);
      this.head.add(eye);
      const antenna = this.box(0.04, 0.25, 0.04, accentMat);
      antenna.position.set(0.12, 0.32, 0);
      this.head.add(antenna);
    } else {
      this.head = this.sphere(def.archetype === 'sprite' ? 0.26 : 0.22, bodyMat);
    }
    this.head.position.y = 1.66;
    this.inner.add(this.head);

    // Chest light for the mech.
    if (def.archetype === 'mech') {
      const light = this.box(0.16, 0.16, 0.05, accentMat);
      light.position.set(0, 1.25, 0.16);
      this.inner.add(light);
    }

    // Sprite aura ring.
    if (def.archetype === 'sprite') {
      const ringGeo = new THREE.TorusGeometry(0.5, 0.03, 8, 24);
      this.disposables.push(ringGeo);
      const ring = new THREE.Mesh(
        ringGeo,
        this.mat(p.secondary, p.secondary, 0.8),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.1;
      this.inner.add(ring);
    }

    // Limbs.
    this.leftLeg = this.limb(-0.16 * slim, 0.85, 0.18, 0.8, limbMat);
    this.rightLeg = this.limb(0.16 * slim, 0.85, 0.18, 0.8, limbMat);
    this.leftArm = this.limb(-0.34 * slim, 1.45, 0.14, 0.6, bodyMat);
    this.rightArm = this.limb(0.34 * slim, 1.45, 0.14, 0.6, bodyMat);
    this.inner.add(this.leftLeg, this.rightLeg, this.leftArm, this.rightArm);

    this.buildHair(equipped, accentMat, p);
  }

  private buildHair(
    equipped: EquippedCosmetics,
    accentMat: THREE.Material,
    palette: CharacterDef['palette'],
  ): void {
    const hair = getCosmetic(equipped.hair);
    if (!hair || hair.style === 'none') return;
    const hairMat = this.mat(palette.secondary, palette.glow, 0.5);

    if (hair.style === 'spike') {
      for (let i = -1; i <= 1; i++) {
        const geo = new THREE.ConeGeometry(0.07, 0.22, 6);
        this.disposables.push(geo);
        const spike = new THREE.Mesh(geo, hairMat);
        spike.position.set(i * 0.12, 0.22, 0);
        this.head.add(spike);
      }
    } else if (hair.style === 'pony') {
      const tail = this.box(0.12, 0.4, 0.12, hairMat);
      tail.position.set(0, 0.0, -0.22);
      tail.rotation.x = -0.5;
      this.head.add(tail);
    } else if (hair.style === 'visor') {
      const visor = this.box(0.46, 0.12, 0.1, accentMat);
      visor.position.set(0, 0.04, 0.18);
      this.head.add(visor);
    }
  }

  /** @param cadence ~1 at base speed, higher when faster (drives stride rate). */
  update(dt: number, pose: Pose, cadence: number): void {
    if (pose === 'run') {
      this.phase += dt * (6 + cadence * 3);
      const s = Math.sin(this.phase);
      const legAmp = 0.7;
      const armAmp = 0.55;
      this.leftLeg.rotation.x = s * legAmp;
      this.rightLeg.rotation.x = -s * legAmp;
      this.leftArm.rotation.x = -s * armAmp;
      this.rightArm.rotation.x = s * armAmp;
      this.inner.position.y = this.baseY + Math.abs(s) * 0.04;
    } else {
      // Lerp limbs toward a static pose for air / slide / idle.
      const t = 1 - Math.exp(-12 * dt);
      const targets =
        pose === 'air'
          ? { leg: -0.6, arm: -1.3 }
          : pose === 'slide'
            ? { leg: 1.1, arm: -0.4 }
            : { leg: 0.05, arm: 0.05 }; // idle
      this.leftLeg.rotation.x += (targets.leg - this.leftLeg.rotation.x) * t;
      this.rightLeg.rotation.x += (targets.leg - this.rightLeg.rotation.x) * t;
      this.leftArm.rotation.x += (targets.arm - this.leftArm.rotation.x) * t;
      this.rightArm.rotation.x += (targets.arm - this.rightArm.rotation.x) * t;
      this.inner.position.y += (this.baseY - this.inner.position.y) * t;
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}

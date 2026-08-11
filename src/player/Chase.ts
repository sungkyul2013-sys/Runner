import * as THREE from 'three';
import { CHASE_NEAR_Z, CHASE_REST_Z, PLAYER_HALF_STANDING } from '../config/constants';
import { Character } from './Character';
import { PLAYER_Z } from './Player';

/** Colours for the yard inspector — peaked cap, uniform blue, heavy boots. */
const INSPECTOR = {
  skin: 0xe8b98f,
  hair: 0x4a3b30,
  top: 0x2f6fd0,
  bottom: 0x24314a,
  shoes: 0x2a2018,
  cap: 0x24314a,
  accent: 0xffd23f,
  trail: 0xffd23f,
};

/** Z the pair drifts back to when the run is clean (behind the camera). */
const RETREAT_Z = 15;
/** Past this Z they are fully out of frame and can stop drawing. */
const HIDE_Z = 11.5;

/**
 * The chase: a yard inspector and his dog.
 *
 * They are only on screen **when it matters** — right on your heels for the
 * opening beat of a run and any time you stumble, then falling away behind the
 * camera once you find clean speed, exactly the rhythm the arcade original
 * uses. Pass a negative pressure to send them off; anything ≥ 0 brings them
 * sprinting back, reaching {@link CHASE_NEAR_Z} at full pressure. On the catch
 * the inspector surges in and reaches for the collar.
 */
export class Chase {
  readonly group = new THREE.Group();

  private readonly inspector: Character;
  private readonly dog: THREE.Group;
  private readonly dogLegs: THREE.Group[] = [];
  private readonly dogTail: THREE.Group;
  private readonly arm: THREE.Group;

  private z = CHASE_REST_Z;
  private x = 0.85;
  private dogPhase = 0;
  private lungeTime = 0;
  /** Master visibility (game state), independent of the retreat. */
  private master = true;

  private readonly disposables: { dispose(): void }[] = [];

  constructor() {
    this.inspector = new Character(INSPECTOR, 0.94);
    // The rig is centred on its own origin, so lift it by the same hip height
    // the Player uses or the inspector walks around knee-deep in the ballast.
    this.inspector.group.position.y = PLAYER_HALF_STANDING.y * 0.94;
    this.group.add(this.inspector.group);

    // Soft contact shadows keep the pair planted on the ballast.
    const shadowGeo = new THREE.CircleGeometry(1, 18);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false,
    });
    this.disposables.push(shadowGeo, shadowMat);
    const inspShadow = new THREE.Mesh(shadowGeo, shadowMat);
    inspShadow.rotation.x = -Math.PI / 2;
    inspShadow.scale.setScalar(0.52);
    inspShadow.position.y = 0.03;
    this.group.add(inspShadow);

    // A grabbing arm that only appears during the catch.
    this.arm = new THREE.Group();
    const armMat = this.mat(INSPECTOR.top);
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.9, 4, 8), armMat);
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.z = -0.5;
    this.arm.add(sleeve);
    this.disposables.push(sleeve.geometry);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), this.mat(INSPECTOR.skin));
    hand.position.z = -1.0;
    this.arm.add(hand);
    this.disposables.push(hand.geometry);
    this.arm.position.set(0.2, 0.55, 0);
    this.arm.visible = false;
    this.inspector.group.add(this.arm);

    this.dog = this.buildDog();
    this.dogTail = this.dog.userData.tail as THREE.Group;
    const dogShadow = new THREE.Mesh(shadowGeo, shadowMat);
    dogShadow.rotation.x = -Math.PI / 2;
    dogShadow.scale.set(0.5, 0.34, 1);
    dogShadow.position.set(0, 0.03, 0.2);
    this.dog.add(dogShadow);
    this.group.add(this.dog);

    this.group.position.set(this.x, 0, CHASE_REST_Z);
    this.reset();
  }

  private mat(color: number, rough = 0.65): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 });
    this.disposables.push(m);
    return m;
  }

  private buildDog(): THREE.Group {
    const g = new THREE.Group();
    const fur = this.mat(0x6b4a2f);
    const furDark = this.mat(0x4a3220);
    const nose = this.mat(0x1a1512);

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.62, 4, 10), fur);
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.56;
    g.add(body);
    this.disposables.push(body.geometry);

    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), fur);
    chest.position.set(0, 0.58, 0.4);
    g.add(chest);
    this.disposables.push(chest.geometry);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.36), fur);
    head.position.set(0, 0.78, 0.62);
    g.add(head);
    this.disposables.push(head.geometry);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.24), furDark);
    snout.position.set(0, 0.72, 0.86);
    g.add(snout);
    this.disposables.push(snout.geometry);
    const snoutTip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), nose);
    snoutTip.position.set(0, 0.74, 0.98);
    g.add(snoutTip);
    this.disposables.push(snoutTip.geometry);
    for (const sx of [-0.11, 0.11]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 6), furDark);
      ear.position.set(sx, 0.98, 0.56);
      ear.rotation.z = sx > 0 ? -0.2 : 0.2;
      g.add(ear);
      this.disposables.push(ear.geometry);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), nose);
      eye.position.set(sx * 0.8, 0.83, 0.79);
      g.add(eye);
      this.disposables.push(eye.geometry);
    }

    // Four legs on pivots so they can gallop.
    for (const sx of [-0.16, 0.16]) {
      for (const sz of [-0.26, 0.34]) {
        const pivot = new THREE.Group();
        pivot.position.set(sx, 0.5, sz);
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, 0.11), furDark);
        leg.position.y = -0.22;
        pivot.add(leg);
        this.disposables.push(leg.geometry);
        const paw = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.17), nose);
        paw.position.set(0, -0.44, 0.02);
        pivot.add(paw);
        this.disposables.push(paw.geometry);
        g.add(pivot);
        this.dogLegs.push(pivot);
      }
    }

    const tail = new THREE.Group();
    tail.position.set(0, 0.66, -0.42);
    const tailMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.36, 4, 6), fur);
    tailMesh.rotation.x = 0.9;
    tailMesh.position.z = -0.16;
    tail.add(tailMesh);
    this.disposables.push(tailMesh.geometry);
    g.add(tail);
    g.userData.tail = tail;

    // Collar with a tag.
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 6, 14), this.mat(0xe23c3c, 0.5));
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.72, 0.5);
    g.add(collar);
    this.disposables.push(collar.geometry);

    g.position.set(-2.5, 0, -0.35);
    return g;
  }

  /**
   * Follow the runner.
   * @param pressure  < 0 → clean run: drift away behind the camera and hide.
   *                  0‥1 → engaged: 0 hangs back at rest, 1 is on your heels.
   */
  update(dt: number, playerX: number, cadence: number, pressure: number): void {
    const engaged = pressure >= 0;
    const targetZ = engaged
      ? CHASE_REST_Z + (CHASE_NEAR_Z - CHASE_REST_Z) * Math.min(1, pressure)
      : RETREAT_Z;
    // Charge in briskly, fall away lazily — the asymmetry is what sells it.
    const t = 1 - Math.exp(-(engaged ? 4.2 : 1.5) * dt);
    this.z += (targetZ - this.z) * t;
    // Sit a little to the runner's right so the inspector never masks the line.
    this.x += (playerX * 0.85 + 1.45 - this.x) * (1 - Math.exp(-5 * dt));
    this.group.position.set(this.x, 0, this.z);
    this.group.visible = this.master && this.z < HIDE_Z;
    if (!this.group.visible) return;

    this.inspector.update(dt, 'run', cadence * 1.05);
    this.stepDog(dt, cadence);
  }

  private stepDog(dt: number, cadence: number): void {
    this.dogPhase += dt * (9 + cadence * 3.6);
    const s = Math.sin(this.dogPhase);
    const c = Math.cos(this.dogPhase);
    // Diagonal gallop: front-left with rear-right, and vice versa.
    this.dogLegs[0].rotation.x = s * 0.95;
    this.dogLegs[1].rotation.x = -s * 0.95;
    this.dogLegs[2].rotation.x = -s * 0.95;
    this.dogLegs[3].rotation.x = s * 0.95;
    this.dog.position.y = Math.abs(s) * 0.09;
    this.dog.rotation.x = c * 0.07;
    this.dogTail.rotation.x = 0.3 + s * 0.35;
    this.dogTail.rotation.y = c * 0.4;
  }

  /** The catch: the inspector surges forward and reaches for the collar. */
  lunge(dt: number): void {
    this.lungeTime += dt;
    const k = Math.min(1, this.lungeTime * 1.6);
    this.z += (PLAYER_Z + 1.5 - this.z) * (1 - Math.exp(-6 * dt));
    this.group.position.set(this.x, 0, this.z);
    this.group.visible = this.master;
    this.arm.visible = true;
    this.arm.rotation.x = -0.4 - k * 0.5;
    this.inspector.update(dt, 'air', 2.2);
    this.stepDog(dt, 2.4);
    this.dog.position.z = -0.35 - k * 0.9;
  }

  /** Snap the pair to their on-your-heels start position (run begins). */
  chargeIn(): void {
    this.z = CHASE_NEAR_Z;
  }

  setVisible(on: boolean): void {
    this.master = on;
    this.group.visible = on && this.z < HIDE_Z;
  }

  reset(): void {
    this.z = CHASE_REST_Z;
    this.x = 1.15;
    this.lungeTime = 0;
    this.arm.visible = false;
    this.arm.rotation.x = 0;
    this.dog.position.set(-2.5, 0, -0.35);
    this.group.position.set(this.x, 0, CHASE_REST_Z);
  }

  dispose(): void {
    this.inspector.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

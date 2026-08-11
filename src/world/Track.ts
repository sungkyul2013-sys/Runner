import * as THREE from 'three';
import { COLORS, LANE_COUNT, LANE_WIDTH, laneToX } from '../config/constants';
import { PLAYER_Z } from '../player/Player';

/** Width of the runnable yard floor plus a margin on each side. */
const TRACK_WIDTH = LANE_COUNT * LANE_WIDTH + 2.2;
/** Length of the (static) floor strip; content scrolls via texture offsets. */
const TRACK_LENGTH = 480;
/** World length covered by one repeat of the ballast texture. */
const BALLAST_TILE = 8;
/** World length covered by one repeat of the sleeper texture. */
const SLEEPER_TILE = 4.8;

/** Crushed-stone ballast with mixed grain and a few dark oil patches. */
function ballastTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#7d766c';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 1 + Math.random() * 3.2;
    const v = Math.random();
    ctx.fillStyle =
      v > 0.72 ? 'rgba(210,205,196,0.85)'
        : v > 0.42 ? 'rgba(140,134,124,0.85)'
          : 'rgba(72,68,62,0.8)';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.72, Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = 'rgba(30,26,22,0.16)';
    ctx.beginPath();
    ctx.ellipse(Math.random() * 256, Math.random() * 256, 18 + Math.random() * 26, 12 + Math.random() * 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Creosoted timber sleepers with chairs, drawn transparent over the ballast. */
function sleeperTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 3; i++) {
    const y = 6 + i * 42;
    // Timber body with a grain wash.
    ctx.fillStyle = '#4a3b30';
    ctx.fillRect(4, y, 120, 22);
    ctx.fillStyle = 'rgba(28,20,15,0.45)';
    ctx.fillRect(4, y + 17, 120, 5);
    ctx.fillStyle = 'rgba(120,98,78,0.4)';
    for (let g = 0; g < 5; g++) ctx.fillRect(6, y + 3 + g * 3, 116, 1);
    // Cast rail chairs where the rails sit.
    ctx.fillStyle = '#2c3138';
    ctx.fillRect(20, y - 2, 18, 26);
    ctx.fillRect(90, y - 2, 18, 26);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Weathered concrete for the maintenance walkways either side of the yard. */
function concreteTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#9a9690';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  ctx.strokeStyle = 'rgba(60,58,54,0.55)';
  ctx.lineWidth = 2;
  for (let y = 0; y <= 128; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The endless yard floor. A single long ballast slab plus one sleeper strip per
 * lane scroll purely through **texture offsets** (zero geometry churn), with
 * continuous steel rails, maintenance walkways, painted safety lines and the
 * cess drains framing the running ground. Ballast and walkway tints lerp when
 * the world tour moves to a new district.
 */
export class Track {
  readonly group = new THREE.Group();

  private readonly ballastMat: THREE.MeshStandardMaterial;
  private readonly sleeperMat: THREE.MeshBasicMaterial;
  private readonly walkMat: THREE.MeshStandardMaterial;
  private readonly ballastTex: THREE.CanvasTexture;
  private readonly sleeperTex: THREE.CanvasTexture;
  private readonly walkTex: THREE.CanvasTexture;
  private readonly baseGround = new THREE.Color(0x8a8378);

  constructor() {
    const zCentre = PLAYER_Z - TRACK_LENGTH / 2 + 40;

    // ── Ballast slab ──
    this.ballastTex = ballastTexture();
    this.ballastTex.repeat.set(TRACK_WIDTH / 6, TRACK_LENGTH / BALLAST_TILE);
    this.ballastMat = new THREE.MeshStandardMaterial({
      map: this.ballastTex, color: 0x8a8378, roughness: 0.98, metalness: 0.02,
    });
    const floorGeo = new THREE.PlaneGeometry(TRACK_WIDTH, TRACK_LENGTH);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, this.ballastMat);
    floor.position.z = zCentre;
    this.group.add(floor);

    // ── Sleeper strips, one per lane ──
    this.sleeperTex = sleeperTexture();
    this.sleeperTex.repeat.set(1, TRACK_LENGTH / SLEEPER_TILE);
    this.sleeperMat = new THREE.MeshBasicMaterial({
      map: this.sleeperTex, transparent: true, depthWrite: false,
    });
    const stripGeo = new THREE.PlaneGeometry(2.3, TRACK_LENGTH);
    stripGeo.rotateX(-Math.PI / 2);
    for (const lane of [-1, 0, 1]) {
      const strip = new THREE.Mesh(stripGeo, this.sleeperMat);
      strip.position.set(laneToX(lane), 0.012, zCentre);
      strip.renderOrder = 1;
      this.group.add(strip);
    }

    // ── Continuous steel rails (two per lane) ──
    const railGeo = new THREE.BoxGeometry(0.11, 0.14, TRACK_LENGTH);
    const railMat = new THREE.MeshStandardMaterial({
      color: COLORS.rail, roughness: 0.28, metalness: 0.92,
      emissive: 0x6d757e, emissiveIntensity: 0.08,
    });
    const footGeo = new THREE.BoxGeometry(0.22, 0.05, TRACK_LENGTH);
    const footMat = new THREE.MeshStandardMaterial({ color: 0x54585e, roughness: 0.7, metalness: 0.5 });
    for (const lane of [-1, 0, 1]) {
      for (const off of [-0.72, 0.72]) {
        const rail = new THREE.Mesh(railGeo, railMat);
        rail.position.set(laneToX(lane) + off, 0.11, zCentre);
        this.group.add(rail);
        const foot = new THREE.Mesh(footGeo, footMat);
        foot.position.set(laneToX(lane) + off, 0.045, zCentre);
        this.group.add(foot);
      }
    }

    // ── Maintenance walkways + painted safety line ──
    this.walkTex = concreteTexture();
    this.walkTex.repeat.set(1, TRACK_LENGTH / 6);
    this.walkMat = new THREE.MeshStandardMaterial({
      map: this.walkTex, color: 0xa8a49c, roughness: 0.92,
    });
    const walkGeo = new THREE.BoxGeometry(1.8, 0.34, TRACK_LENGTH);
    const lineGeo = new THREE.BoxGeometry(0.22, 0.02, TRACK_LENGTH);
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xffd23f, emissive: 0xffd23f, emissiveIntensity: 0.35, roughness: 0.6,
    });
    const kerbGeo = new THREE.BoxGeometry(0.16, 0.4, TRACK_LENGTH);
    const kerbMat = new THREE.MeshStandardMaterial({ color: 0x6e6a64, roughness: 0.95 });
    for (const side of [-1, 1]) {
      const x = side * (TRACK_WIDTH / 2 + 0.9);
      const walk = new THREE.Mesh(walkGeo, this.walkMat);
      walk.position.set(x, 0.17, zCentre);
      this.group.add(walk);
      const line = new THREE.Mesh(lineGeo, lineMat);
      line.position.set(x - side * 0.72, 0.35, zCentre);
      this.group.add(line);
      const kerb = new THREE.Mesh(kerbGeo, kerbMat);
      kerb.position.set(side * (TRACK_WIDTH / 2 + 0.02), 0.2, zCentre);
      this.group.add(kerb);
    }
  }

  /** Scroll the yard toward the camera by `scroll` world units. */
  update(scroll: number): void {
    this.ballastTex.offset.y += (scroll * this.ballastTex.repeat.y) / TRACK_LENGTH;
    this.sleeperTex.offset.y += (scroll * this.sleeperTex.repeat.y) / TRACK_LENGTH;
    this.walkTex.offset.y += (scroll * this.walkTex.repeat.y) / TRACK_LENGTH;
  }

  /** Ease the ballast/walkway tint toward a district's ground colour. */
  applyDistrict(ground: number, dt: number): void {
    const t = 1 - Math.exp(-1.4 * dt);
    this.baseGround.lerp(new THREE.Color(ground), t);
    this.ballastMat.color.copy(this.baseGround);
    this.walkMat.color.copy(this.baseGround).offsetHSL(0, -0.04, 0.1);
  }

  /** Snap instantly to a district's ground colour (used on reset). */
  setDistrict(ground: number): void {
    this.baseGround.setHex(ground);
    this.ballastMat.color.copy(this.baseGround);
    this.walkMat.color.copy(this.baseGround).offsetHSL(0, -0.04, 0.1);
  }
}

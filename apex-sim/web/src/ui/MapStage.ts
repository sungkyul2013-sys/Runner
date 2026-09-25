// The map selection's 3D stage (§18.3-6 맵 선택): the chosen map as a model on the menu's studio floor. The map is
// generated in a worker (the same code the drive uses), then rises out of the floor; the camera flies to the chosen
// start pin; the light follows the chosen time of day and the weather (rain streaks, snow, fog) plays over the model.
import * as THREE from 'three/webgpu';
import { abs, color, fract, positionWorld, smoothstep, time } from 'three/tsl';
import type { Viewer } from '../render/Viewer';
import { generateMap } from '../world/loadMap';
import { buildDiorama, gridDiorama, type MapDiorama } from '../world/MapDiorama';
import type { Localized } from './i18n';
import { isTouchDevice } from './TouchControls';

const SIDE = 6; // model width [m]

export interface PinOnScreen {
  id: string;
  x: number;
  y: number;
  /** In front of the camera and inside the view. */
  visible: boolean;
}

export interface MapStageState {
  loading: boolean;
  stage?: string;
  error?: string;
}

/** Screen area the UI covers (the model centres in what is left). */
export interface StageInsets {
  right: number;
  bottom: number;
}

export class MapStage {
  readonly group = new THREE.Group();
  onState: (s: MapStageState) => void = () => {};
  onPick: (id: string) => void = () => {};
  onFrame: (pins: PinOnScreen[]) => void = () => {};
  /** Studio lights follow the preview's daylight (0 night … 1 day). */
  onDaylight: (day: number) => void = () => {};
  insets: StageInsets = { right: 0, bottom: 0 };
  private readonly cache = new Map<string, MapDiorama>();
  private current: MapDiorama | null = null;
  private leaving: MapDiorama[] = [];
  private rise = 1;
  private ticket = 0;
  private selected = '';
  private readonly scan: THREE.Group;
  private weather = 'clear';
  private hour = 13;
  private readonly fx: WeatherFx;
  private fly: { t: number; dur: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromR: number; toR: number; fromP: number; toP: number; az: number } | null = null;
  private readonly lowEnd = isTouchDevice();
  private readonly ray = new THREE.Raycaster();
  private down: { x: number; y: number } | null = null;
  private readonly off = { w: 0, h: 0, r: 0, b: 0 };

  constructor(private readonly viewer: Viewer, private readonly labelOf: (id: string) => Localized) {
    this.group.name = 'map-stage';
    viewer.scene.add(this.group);
    this.scan = scanPlate();
    this.group.add(this.scan);
    this.scan.visible = false;
    this.fx = new WeatherFx();
    this.group.add(this.fx.group);
    const c = viewer.controls;
    c.minDistance = 2.2;
    c.maxDistance = 22;
    c.maxPolarAngle = Math.PI * 0.46;
    c.autoRotate = false;
    viewer.shadowHalf = SIDE * 0.62;
    const el = viewer.renderer.domElement;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointerup', this.onUp);
    this.flyTo(new THREE.Vector3(0, 0.75, 0), this.overviewRadius(), 0.98, 1.6);
  }

  /** Shows a map (generating it on first use); `pins` are the start points offered. */
  async show(id: string, pins: string[]): Promise<void> {
    const ticket = ++this.ticket;
    let d = this.cache.get(id);
    if (!d) {
      this.swapOut();
      this.scan.visible = true;
      this.onState({ loading: true });
      try {
        if (id === 'grid') d = gridDiorama(SIDE, this.labelOf('start'));
        else {
          const map = await generateMap(id, (stage) => ticket === this.ticket && this.onState({ loading: true, stage }));
          d = buildDiorama(map, SIDE, pins, this.lowEnd);
        }
      } catch (err) {
        if (ticket === this.ticket) this.onState({ loading: false, error: String((err as Error)?.message ?? err) });
        return;
      }
      this.cache.set(id, d);
      if (ticket !== this.ticket) return;
    }
    this.scan.visible = false;
    if (this.current !== d) {
      this.swapOut();
      this.current = d;
      this.group.add(d.group);
      this.rise = 0;
      d.group.position.y = -0.8;
    }
    d.select(this.selected);
    this.applyLook();
    this.onState({ loading: false });
    // A new map opens on the whole model; picking a start point then flies to it.
    this.flyTo(new THREE.Vector3(0, 0.75, 0), this.overviewRadius(), 0.98, 1.2);
  }

  select(id: string): void {
    this.selected = id;
    if (!this.current) return;
    this.current.select(id);
    this.focusPin(id);
  }

  /** Back to the whole model. */
  overview(): void {
    this.flyTo(new THREE.Vector3(0, 0.75, 0), this.overviewRadius(), 0.98, 1.0);
  }

  setHour(h: number): void {
    this.hour = h;
    this.applyLook();
  }

  setWeather(w: string): void {
    this.weather = w;
    this.applyLook();
  }

  private focusPin(id: string): void {
    const p = this.current?.pin(id);
    if (!p) return;
    const to = p.foot.clone();
    to.y += 0.12;
    this.flyTo(to, this.lowEnd && innerWidth < innerHeight ? 5.2 : 3.6, 0.9, 1.1);
  }

  private overviewRadius(): number {
    const aspect = innerWidth / Math.max(innerHeight, 1);
    return 8.6 / Math.min(1, aspect / 1.25);
  }

  private flyTo(target: THREE.Vector3, radius: number, polar: number, dur: number): void {
    const cam = this.viewer.camera, c = this.viewer.controls;
    const rel = cam.position.clone().sub(c.target);
    const sph = new THREE.Spherical().setFromVector3(rel);
    this.fly = { t: 0, dur, fromT: c.target.clone(), toT: target, fromR: sph.radius, toR: radius, fromP: sph.phi, toP: polar, az: sph.theta };
    c.enabled = false;
  }

  private swapOut(): void {
    if (this.current) {
      this.leaving.push(this.current);
      this.current = null;
    }
  }

  /** Light and weather for the chosen hour and weather. */
  private applyLook(): void {
    const v = this.viewer;
    const h = this.hour;
    const elev = Math.sin((Math.PI * (h - 6)) / 12);
    const az = (Math.PI * (h - 6)) / 12;
    const day = THREE.MathUtils.smoothstep(elev, -0.1, 0.35);
    const night = 1 - THREE.MathUtils.smoothstep(elev, -0.14, 0.06);
    const cloud = { clear: 1, cloudy: 0.45, rain: 0.34, storm: 0.24, fog: 0.5, snow: 0.55, blizzard: 0.35 }[this.weather] ?? 1;
    if (elev > -0.05) v.sunDirection.set(-Math.cos(az), Math.max(elev, 0.12) * 1.3, 0.55).normalize();
    else v.sunDirection.set(0.35, 1, 0.45).normalize(); // moonlight from high up
    const warm = new THREE.Color(0xffa860), white = new THREE.Color(0xfff4e6), moon = new THREE.Color(0x8fb0ff);
    v.sun.color.copy(elev > -0.05 ? warm.lerp(white, THREE.MathUtils.smoothstep(elev, 0.05, 0.5)) : moon);
    v.sun.intensity = elev > -0.05 ? (0.3 + 2.5 * day) * cloud : 0.14;
    v.hemi.intensity = (0.05 + 0.7 * day) * (0.6 + 0.4 * cloud);
    this.onDaylight(day * cloud);
    const d = this.current;
    if (d) {
      d.night.value = night;
      d.wet.value = this.weather === 'rain' ? 0.8 : this.weather === 'storm' ? 1 : 0;
      d.snow.value = this.weather === 'snow' ? 0.85 : this.weather === 'blizzard' ? 1 : 0;
    }
    this.fx.set(this.weather);
    const fog = v.scene.fog as THREE.Fog | null;
    if (fog) {
      const thick = this.weather === 'fog' ? 1 : this.weather === 'blizzard' ? 0.7 : this.weather === 'storm' ? 0.35 : 0;
      fog.near = THREE.MathUtils.lerp(16, 3, thick);
      fog.far = THREE.MathUtils.lerp(40, 13, thick);
      fog.color.setHex(thick > 0 ? 0x2a3038 : 0x07090c);
    }
  }

  update(dt: number): void {
    const v = this.viewer;
    // Rise of the new model, sinking of the old ones.
    if (this.current && this.rise < 1) {
      this.rise = Math.min(1, this.rise + dt / 1.1);
      const e = 1 - Math.pow(1 - this.rise, 3);
      this.current.group.position.y = -0.8 * (1 - e);
      this.current.group.scale.setScalar(0.92 + 0.08 * e);
    }
    this.leaving = this.leaving.filter((d) => {
      d.group.position.y -= dt * 2.2;
      if (d.group.position.y < -1.2) {
        d.group.removeFromParent();
        return false;
      }
      return true;
    });
    this.current?.update(dt);
    this.fx.update(dt);
    // Camera flight.
    if (this.fly) {
      const f = this.fly;
      f.t = Math.min(1, f.t + dt / f.dur);
      const e = f.t < 0.5 ? 4 * f.t * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 3) / 2;
      const c = v.controls;
      c.target.lerpVectors(f.fromT, f.toT, e);
      const sph = new THREE.Spherical(THREE.MathUtils.lerp(f.fromR, f.toR, e), THREE.MathUtils.lerp(f.fromP, f.toP, e), f.az + e * 0.35);
      v.camera.position.setFromSpherical(sph).add(c.target);
      v.camera.lookAt(c.target);
      if (f.t >= 1) {
        this.fly = null;
        c.enabled = true;
        c.autoRotate = true;
        c.autoRotateSpeed = 0.35;
      }
    }
    this.applyOffset();
    // Pin labels.
    const d = this.current;
    if (!d || this.rise < 0.6) {
      this.onFrame([]);
      return;
    }
    const w = innerWidth, h = innerHeight, p = new THREE.Vector3();
    this.onFrame(d.pins.map((pin) => {
      d.group.localToWorld(p.copy(pin.head));
      p.project(v.camera);
      const x = (p.x * 0.5 + 0.5) * w, y = (0.5 - p.y * 0.5) * h;
      return { id: pin.id, x, y, visible: p.z < 1 && x > 0 && y > 0 && x < w - this.insets.right - 40 && y < h - this.insets.bottom - 8 };
    }));
  }

  /** Shifts the projection so the model centres in the screen area the panels leave free. */
  private applyOffset(): void {
    const cam = this.viewer.camera;
    const w = innerWidth, h = innerHeight, { right, bottom } = this.insets;
    if (this.off.w === w && this.off.h === h && this.off.r === right && this.off.b === bottom) return;
    Object.assign(this.off, { w, h, r: right, b: bottom });
    if (!right && !bottom) cam.clearViewOffset();
    else cam.setViewOffset(w, h, right / 2, bottom / 2, w, h);
    cam.updateProjectionMatrix();
  }

  private readonly onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY };
    if (this.fly) {
      // Grabbing the view ends a flight where it is.
      this.fly = null;
      this.viewer.controls.enabled = true;
    }
    this.viewer.controls.autoRotate = false;
  };

  private readonly onUp = (e: PointerEvent) => {
    const d0 = this.down;
    this.down = null;
    if (!d0 || Math.hypot(e.clientX - d0.x, e.clientY - d0.y) > 6 || !this.current) return;
    const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.viewer.camera);
    // Nearest pin head to the ray (generous: pins are thin).
    let best = '', bestD = 0.12;
    const p = new THREE.Vector3();
    for (const pin of this.current.pins) {
      this.current.group.localToWorld(p.copy(pin.head));
      const dist = this.ray.ray.distanceToPoint(p);
      if (dist < bestD) {
        bestD = dist;
        best = pin.id;
      }
    }
    if (best) this.onPick(best);
  };

  dispose(): void {
    const el = this.viewer.renderer.domElement;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointerup', this.onUp);
    this.ticket++;
    for (const d of this.cache.values()) d.dispose();
    this.cache.clear();
    this.fx.dispose();
    this.group.removeFromParent();
    this.viewer.camera.clearViewOffset();
    this.viewer.camera.updateProjectionMatrix();
    this.viewer.controls.enabled = true;
  }
}

/** Placeholder while the map generates: the base block with a scanning grid. */
function scanPlate(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(SIDE + 0.24, 0.42, SIDE + 0.24), new THREE.MeshStandardNodeMaterial({ color: 0x101318, roughness: 0.32, metalness: 0.55 }));
  base.position.y = 0.21;
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const line = (u: typeof positionWorld.x) => smoothstep(0.44, 0.5, abs(fract(u.mul(2.5)).sub(0.5)));
  const grid = line(positionWorld.x).max(line(positionWorld.z));
  const sweep = smoothstep(0.25, 0.0, abs(fract(positionWorld.x.div(SIDE).add(0.5).sub(time.mul(0.35))).sub(0.5)));
  mat.colorNode = color(0xff6b2c);
  mat.opacityNode = grid.mul(0.55).add(sweep.mul(0.3)).add(0.04);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(SIDE, SIDE).rotateX(-Math.PI / 2), mat);
  top.position.y = 0.425;
  g.add(base, top);
  return g;
}

/** Rain streaks and snowflakes over the model (a few hundred, moved on the CPU). */
class WeatherFx {
  readonly group = new THREE.Group();
  private readonly rain: THREE.LineSegments;
  private readonly snow: THREE.InstancedMesh;
  private readonly rp: Float32Array;
  private readonly sp: Float32Array;
  private mode = 'clear';
  private readonly N = 700;
  private readonly m = new THREE.Matrix4();

  constructor() {
    this.rp = new Float32Array(this.N * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.rp, 3));
    const rm = new THREE.LineBasicNodeMaterial({ color: 0xaecbe6, transparent: true, opacity: 0.45 });
    this.rain = new THREE.LineSegments(geo, rm);
    this.rain.frustumCulled = false;
    this.sp = new Float32Array(this.N * 3);
    this.snow = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.012, 0), new THREE.MeshBasicNodeMaterial({ color: 0xf4f7fb }), this.N);
    this.snow.frustumCulled = false;
    for (let i = 0; i < this.N; i++) this.respawn(i, true);
    this.group.add(this.rain, this.snow);
    this.set('clear');
  }

  private respawn(i: number, anyHeight: boolean): void {
    const x = (Math.random() - 0.5) * SIDE * 1.1, z = (Math.random() - 0.5) * SIDE * 1.1;
    const y = anyHeight ? 0.4 + Math.random() * 3.6 : 4;
    this.sp[i * 3] = x;
    this.sp[i * 3 + 1] = y;
    this.sp[i * 3 + 2] = z;
  }

  set(w: string): void {
    this.mode = w;
    this.rain.visible = w === 'rain' || w === 'storm';
    this.snow.visible = w === 'snow' || w === 'blizzard';
  }

  update(dt: number): void {
    if (!this.rain.visible && !this.snow.visible) return;
    const rain = this.rain.visible;
    const fall = rain ? (this.mode === 'storm' ? 5.5 : 4) : this.mode === 'blizzard' ? 0.9 : 0.45;
    const drift = this.mode === 'storm' ? 0.9 : this.mode === 'blizzard' ? 1.1 : 0.12;
    const t = performance.now() / 1000;
    for (let i = 0; i < this.N; i++) {
      const k = i * 3;
      this.sp[k + 1] -= fall * dt;
      this.sp[k] += drift * dt * (rain ? 1 : Math.sin(t + i));
      if (this.sp[k + 1] < 0.45 || Math.abs(this.sp[k]) > SIDE * 0.6) this.respawn(i, false);
      if (rain) {
        const j = i * 6;
        this.rp[j] = this.sp[k];
        this.rp[j + 1] = this.sp[k + 1];
        this.rp[j + 2] = this.sp[k + 2];
        this.rp[j + 3] = this.sp[k] - drift * 0.03;
        this.rp[j + 4] = this.sp[k + 1] + 0.1;
        this.rp[j + 5] = this.sp[k + 2];
      } else {
        this.m.makeTranslation(this.sp[k], this.sp[k + 1], this.sp[k + 2]);
        this.snow.setMatrixAt(i, this.m);
      }
    }
    if (rain) this.rain.geometry.attributes.position.needsUpdate = true;
    else this.snow.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.rain.geometry.dispose();
    (this.rain.material as THREE.Material).dispose();
    this.snow.geometry.dispose();
    (this.snow.material as THREE.Material).dispose();
  }
}

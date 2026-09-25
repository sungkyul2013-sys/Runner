// Title and main menu (§18.3-1 스플래시·타이틀 — 시네마틱 차량 쇼룸, 18.3-2 메인 메뉴): the selected car on a slowly
// turning plinth under showroom light, the brand, the car's figures, and one card per mode (free roam first, the
// primary action). "Continue" returns to the last mode played.
import * as THREE from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { abs, color, dot, float, fract, length, mix, normalWorld, positionWorld, sin, smoothstep, time, uniform, vec2 } from 'three/tsl';
import { SHOWROOM, showroomCar } from '../app/presets';
import type { Viewer } from '../render/Viewer';
import { loadVehicleModel, type VehicleModel } from '../vehicles/VehicleModel';
import { icon, type IconName } from './icons';
import { MapStage } from './MapStage';
import { t, tl, type Localized, type StringKey } from './i18n';
import { settings, accentHex } from './settings';

export type AppMode = 'freeroam' | 'drive' | 'crash' | 'sandbox' | 'garage';

export interface MenuActions {
  start(mode: AppMode, vehicleId: string): void;
  settings(): void;
}

const MODES: Array<[AppMode, IconName, StringKey, StringKey]> = [
  ['freeroam', 'map', 'modeFreeRoam', 'modeFreeRoamDesc'],
  ['drive', 'flag', 'modeTestGround', 'modeTestGroundDesc'],
  ['crash', 'crash', 'modeCrash', 'modeCrashDesc'],
  ['sandbox', 'cube', 'modeSandbox', 'modeSandboxDesc'],
  ['garage', 'garage', 'modeGarage', 'modeGarageDesc'],
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  e.append(...children);
  return e;
}

const DEFAULT_DRIVABLE = 'porsche_911_turbo_991';

export class MainMenu {
  readonly root = el('div', 'mainmenu');
  private readonly foot = el('div', 'mm-foot');
  private readonly stage = new THREE.Group();
  private model: VehicleModel | null = null;
  private index = 0;
  private loading = 0;
  private readonly carName = el('b');
  private readonly specs = el('div', 'mm-specs');
  private readonly note = el('div', 'mm-note');

  constructor(private readonly viewer: Viewer, private readonly actions: MenuActions) {
    const cars = SHOWROOM.map(showroomCar);
    const hero = el('div', 'mm-hero');
    const brand = el('h1', 'mm-brand', 'APEX', el('span', '', '_'), 'SIM');
    const prev = el('button', 'icon-btn', icon('back'));
    const next = el('button', 'icon-btn', icon('chevron'));
    prev.ariaLabel = next.ariaLabel = 'car';
    prev.onclick = () => this.select((this.index + cars.length - 1) % cars.length);
    next.onclick = () => this.select((this.index + 1) % cars.length);
    const car = el('div', 'mm-car', el('div', 'mm-car-row', this.carName, prev, next), this.specs, this.note);
    hero.append(brand, el('p', 'mm-tagline', t('appTagline')), car);

    const cards = el('nav', 'mm-cards');
    const last = settings.get().lastMode as AppMode | null;
    if (last && MODES.some(([m]) => m === last) && last !== 'freeroam') cards.append(this.card(last, 'restart', 'modeContinue', MODES.find(([m]) => m === last)![2], false));
    for (const [mode, name, title, desc] of MODES) cards.append(this.card(mode, name, title, desc, mode === 'freeroam'));

    const gear = el('button', 'icon-btn', icon('settings'));
    gear.ariaLabel = t('menuSettings');
    gear.onclick = () => this.actions.settings();
    this.foot.append(el('span', 'mm-hint', t('menuHint')), gear);
    this.root.append(hero, cards);
    document.body.append(this.root, this.foot);
    this.setupStage();
    // The car chosen last (here or in a mode) is on show again.
    this.select(Math.max(0, SHOWROOM.findIndex((c) => c.id === settings.get().car || c.drive === settings.get().car)));
    window.addEventListener('keydown', (e) => {
      if (!this.root.isConnected || this.maps || document.querySelector('.overlay-layer')) return;
      if (e.key === 'ArrowLeft') prev.click();
      else if (e.key === 'ArrowRight') next.click();
      else if (e.key === 'Enter') (cards.querySelector('.mm-card.primary') as HTMLButtonElement | null)?.click();
    });
  }

  private card(mode: AppMode, name: IconName, title: StringKey, desc: StringKey, primary: boolean): HTMLButtonElement {
    const b = el('button', primary ? 'mm-card primary' : 'mm-card', icon(name), el('div', '', el('b', '', t(title)), el('small', '', t(desc))), el('span', 'go', icon('chevron')));
    b.onclick = () => {
      const c = showroomCar(SHOWROOM[this.index]);
      this.actions.start(mode, c.drive ?? DEFAULT_DRIVABLE);
    };
    return b;
  }

  private select(i: number): void {
    this.index = i;
    const c = showroomCar(SHOWROOM[i]);
    if (settings.get().car !== c.id) settings.set({ car: c.id });
    this.carName.textContent = tl(c.label);
    const s = c.specs;
    this.specs.replaceChildren(...(s
      ? ([
        ['specPower', s.powerKw, (x: number) => `${Math.round(x)} kW · ${Math.round(x * 1.35962)} PS`, s.powerKw / 400],
        ['specTorque', s.torqueNm, (x: number) => `${Math.round(x)} N·m`, s.torqueNm / 900],
        ['specWeight', s.massKg, (x: number) => `${Math.round(x).toLocaleString('en-US')} kg`, s.massKg / 3000],
        ['specDrive', 0, () => s.drive, 1],
        ['specAccel', s.zeroTo100, (x: number) => `${x.toFixed(1)} s`, 3 / s.zeroTo100],
      ] as Array<[StringKey, number, (x: number) => string, number]>).map(([k, value, fmt, bar]) => {
        const out = el('span', '', fmt(value));
        const meter = el('i', 'mm-bar');
        meter.style.setProperty('--v', String(Math.min(Math.max(bar, 0.05), 1)));
        // Count up from zero (the Forza card feel).
        if (value > 0 && !settings.get().reduceMotion) {
          const t0 = performance.now();
          const tick = () => {
            const f = Math.min(1, (performance.now() - t0) / 700);
            out.textContent = fmt(value * (1 - Math.pow(1 - f, 3)));
            if (f < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
        return el('div', '', el('small', '', t(k)), out, meter);
      })
      : []));
    this.carName.classList.remove('swap');
    void this.carName.offsetWidth;
    this.carName.classList.add('swap');
    this.note.textContent = c.drive ? '' : t('visualOnly');
    void this.showModel(c.model ?? null);
  }

  private setupStage(): void {
    const v = this.viewer;
    const pmrem = new THREE.PMREMGenerator(v.renderer);
    v.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    v.scene.background = new THREE.Color(0x07090c);
    v.scene.fog = new THREE.Fog(0x07090c, 14, 34);
    // Studio: a haze backdrop (a warm-to-cold glow behind the car), a glossy floor that mirrors the car and the
    // lights, faint concentric rings on it, the plinth with its accent ring.
    const back = new THREE.Mesh(new THREE.SphereGeometry(30, 48, 24), new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, fog: false }));
    const dir = normalWorld.negate();
    (back.material as THREE.MeshBasicNodeMaterial).colorNode = mix(
      mix(color(0x07090c), color(0x151b26), smoothstep(-0.05, 0.25, dir.y).oneMinus()),
      color(0x2a1a14),
      smoothstep(0.55, 1.0, dot(dir.xz.normalize(), vec2(-0.7, -0.7))).mul(smoothstep(0.35, 0.0, abs(dir.y))).mul(0.6),
    );
    const floorMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.14, metalness: 0.65 });
    const r = length(positionWorld.xz);
    const rings = smoothstep(0.03, 0.0, abs(fract(r.div(1.2)).sub(0.5))).mul(smoothstep(4.2, 5.5, r)).mul(smoothstep(22, 8, r));
    floorMat.colorNode = mix(color(0x0b0d11), color(0x1d232d), rings.mul(0.8)).mul(this.floorDim);
    // Under the map preview's sun the mirror floor would flare: it turns matte.
    floorMat.roughnessNode = mix(float(0.9), float(0.14), this.floorDim.sub(0.25).div(0.75));
    floorMat.metalnessNode = mix(float(0.1), float(0.65), this.floorDim.sub(0.25).div(0.75));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 96).rotateX(-Math.PI / 2), floorMat);
    floor.position.y = -0.085;
    floor.receiveShadow = true;
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(3.4, 3.55, 0.08, 128),
      new THREE.MeshStandardNodeMaterial({ color: 0x14171c, roughness: 0.22, metalness: 0.5 }),
    );
    plinth.position.y = -0.04;
    plinth.receiveShadow = true;
    const ringMat = new THREE.MeshBasicNodeMaterial({ color: accentHex() });
    ringMat.colorNode = color(accentHex()).mul(sin(time.mul(1.6)).mul(0.25).add(1.35));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.47, 0.014, 8, 200), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.005;
    // Lights: a key light with shadows, orange and blue rim spots behind, a soft top light.
    const key = new THREE.SpotLight(0xffffff, 160, 30, 0.55, 0.6, 1.6);
    key.position.set(4, 7, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const rimA = new THREE.SpotLight(0xff7a3a, 240, 30, 0.5, 0.7, 1.4);
    rimA.position.set(-6, 3.2, -5);
    const rimB = new THREE.SpotLight(0x3d8bff, 200, 30, 0.5, 0.7, 1.4);
    rimB.position.set(6, 3.0, -5.5);
    for (const l of [key, rimA, rimB]) {
      l.target.position.set(0, 0.5, 0);
      this.stage.add(l, l.target);
    }
    // Overhead strip lights (seen in the paint and the floor).
    const stripMat = new THREE.MeshBasicNodeMaterial({ color: 0xffffff, fog: false });
    const strips: THREE.Object3D[] = [];
    for (const x of [-1.6, 0, 1.6]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 5.5), stripMat);
      strip.position.set(x, 5.2, 0);
      strips.push(strip);
      this.stage.add(strip);
    }
    this.stage.add(back, floor, plinth, ring);
    this.plinth = [plinth, ring, ...strips];
    this.spots = [key, rimA, rimB].map((l) => [l, l.intensity]);
    v.scene.add(this.stage);
    v.hemi.intensity = 0.25;
    v.sun.intensity = 0.4;
    v.freeMove = false;
    v.controls.target.set(0, 0.6, 0);
    v.controls.autoRotate = false;
    v.controls.autoRotateSpeed = 0.5;
    v.controls.minDistance = 3.5;
    v.controls.maxDistance = 12;
    v.controls.maxPolarAngle = Math.PI * 0.49;
    // Cinematic intro: a low sweep from the side up to the resting three-quarter view.
    this.intro = settings.get().reduceMotion ? 1 : 0;
    this.placeIntroCamera(this.intro);
    window.addEventListener('pointermove', (e) => {
      this.parallax.set(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
    });
  }

  private readonly parallax = new THREE.Vector2();
  private plinth: THREE.Object3D[] = [];
  private spots: Array<[THREE.Light, number]> = [];
  private maps: MapStage | null = null;
  /** 1 while the car is on show, 0 while a map model stands on the stage. */
  private carShow = 1;
  /** Floor brightness: the map preview's daylight would light it grey. */
  private readonly floorDim = uniform(1);

  /** Map selection: the car and its plinth leave, the map model takes the stage (see MapStage). */
  openMaps(labelOf: (id: string) => Localized): MapStage {
    this.maps?.dispose();
    this.maps = new MapStage(this.viewer, labelOf);
    this.intro = 1;
    document.body.classList.add('mm-maps');
    this.maps.onDaylight = (day) => {
      for (const [l, i] of this.spots) l.intensity = i * (0.05 + 0.2 * day);
    };
    return this.maps;
  }

  /** Back from the map selection to the car. */
  closeMaps(): void {
    if (!this.maps) return;
    this.maps.dispose();
    this.maps = null;
    document.body.classList.remove('mm-maps');
    for (const [l, i] of this.spots) l.intensity = i;
    const v = this.viewer;
    const fog = v.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = 14;
      fog.far = 34;
      fog.color.setHex(0x07090c);
    }
    v.sunDirection.set(-18, 30, 14).normalize();
    v.sun.color.setHex(0xfff4e6);
    v.hemi.intensity = 0.25;
    v.sun.intensity = 0.4;
    v.shadowHalf = 30;
    v.controls.minDistance = 3.5;
    v.controls.maxDistance = 12;
    v.controls.maxPolarAngle = Math.PI * 0.49;
    v.controls.autoRotateSpeed = 0.5;
    v.controls.autoRotate = !settings.get().reduceMotion;
    this.intro = 0.35;
  }
  private intro = 0;

  private placeIntroCamera(t: number): void {
    const e = 1 - Math.pow(1 - Math.min(t, 1), 3);
    const a = THREE.MathUtils.lerp(-0.2, 0.75, e);
    const d = THREE.MathUtils.lerp(4.6, 7.6, e);
    const y = THREE.MathUtils.lerp(0.35, 1.55, e);
    this.viewer.camera.position.set(Math.sin(a) * d, y, Math.cos(a) * d);
    this.viewer.controls.target.set(0, THREE.MathUtils.lerp(0.45, 0.6, e), 0);
  }

  /** Per frame: the intro sweep, the slow turntable and the car-change animation. */
  update(dt: number): void {
    // The car (and its plinth) give way to the map model and come back after.
    const goal = this.maps ? 0 : 1;
    if (this.carShow !== goal) {
      this.carShow = goal ? Math.min(1, this.carShow + dt / 0.6) : Math.max(0, this.carShow - dt / 0.35);
      const e = goal ? 1 - Math.pow(1 - this.carShow, 3) : this.carShow;
      for (const o of this.plinth) o.scale.setScalar(Math.max(e, 0.001));
      this.floorDim.value = 0.25 + 0.75 * e;
      if (this.model) this.model.root.visible = this.carShow > 0.01;
    }
    if (this.maps) {
      this.maps.update(dt);
      if (this.model) this.model.root.scale.setScalar(Math.max(this.carShow, 0.001));
      return;
    }
    if (this.intro < 1) {
      this.intro = Math.min(1, this.intro + dt / 2.4);
      this.placeIntroCamera(this.intro);
      if (this.intro >= 1) this.viewer.controls.autoRotate = !settings.get().reduceMotion;
    }
    // The car arrives spinning a quarter turn and settling; the old one leaves the same way.
    if (this.model) {
      this.swap = Math.min(1, this.swap + dt / 0.9);
      const e = 1 - Math.pow(1 - this.swap, 3);
      this.model.root.rotation.y = (1 - e) * -1.2;
      this.model.root.scale.setScalar((0.86 + 0.14 * e) * (1 - Math.pow(1 - this.carShow, 3)));
      this.model.root.position.y = (1 - e) * 0.25;
    }
    if (this.leaving) {
      this.leaveT += dt / 0.4;
      this.leaving.root.rotation.y += dt * 4;
      this.leaving.root.scale.setScalar(Math.max(0.01, 1 - this.leaveT));
      if (this.leaveT >= 1) {
        this.stage.remove(this.leaving.root);
        this.leaving = null;
      }
    }
    // Mouse parallax on the target (subtle).
    const tgt = this.viewer.controls.target;
    tgt.x += (this.parallax.x * 0.35 - tgt.x) * Math.min(1, dt * 2);
    tgt.y += (0.6 - this.parallax.y * 0.2 - tgt.y) * Math.min(1, dt * 2);
  }

  private swap = 1;
  private leaving: VehicleModel | null = null;
  private leaveT = 0;

  private async showModel(url: string | null): Promise<void> {
    const ticket = ++this.loading;
    if (!url) return;
    const model = await loadVehicleModel(url).catch(() => null);
    if (!model || ticket !== this.loading) return;
    if (this.model) {
      if (this.leaving) this.stage.remove(this.leaving.root);
      this.leaving = this.model;
      this.leaveT = 0;
    }
    this.model = model;
    model.root.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.swap = this.intro < 1 ? 1 : 0;
    this.stage.add(model.root);
  }

  dispose(): void {
    this.maps?.dispose();
    this.maps = null;
    document.body.classList.remove('mm-maps');
    this.viewer.scene.fog = null;
    this.root.remove();
    this.foot.remove();
    this.stage.removeFromParent();
    this.viewer.controls.autoRotate = false;
    this.viewer.controls.minDistance = 1;
    this.viewer.controls.maxDistance = 600;
  }
}

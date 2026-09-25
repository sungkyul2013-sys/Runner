// Title and main menu (§18.3-1 스플래시·타이틀 — 시네마틱 차량 쇼룸, 18.3-2 메인 메뉴): the selected car on a slowly
// turning plinth under showroom light, the brand, the car's figures, and one card per mode (free roam first, the
// primary action). "Continue" returns to the last mode played.
import * as THREE from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SHOWROOM, showroomCar } from '../app/presets';
import type { Viewer } from '../render/Viewer';
import { loadVehicleModel, type VehicleModel } from '../vehicles/VehicleModel';
import { icon, type IconName } from './icons';
import { t, tl, type StringKey } from './i18n';
import { settings } from './settings';

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
    this.foot.append(gear);
    this.root.append(hero, cards);
    document.body.append(this.root, this.foot);
    this.setupStage();
    this.select(0);
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
    this.carName.textContent = tl(c.label);
    const s = c.specs;
    this.specs.replaceChildren(...(s
      ? ([
        ['specPower', `${s.powerKw} kW · ${Math.round(s.powerKw * 1.35962)} PS`],
        ['specTorque', `${s.torqueNm} N·m`],
        ['specWeight', `${s.massKg.toLocaleString('en-US')} kg`],
        ['specDrive', s.drive],
        ['specAccel', `${s.zeroTo100.toFixed(1)} s`],
      ] as Array<[StringKey, string]>).map(([k, v]) => el('div', '', el('small', '', t(k)), el('span', '', v)))
      : []));
    this.note.textContent = c.drive ? '' : t('visualOnly');
    void this.showModel(c.model ?? null);
  }

  private setupStage(): void {
    const v = this.viewer;
    const pmrem = new THREE.PMREMGenerator(v.renderer);
    v.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    // Plinth: a dark disc with a soft rim light, the car turning on it.
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(3.4, 3.5, 0.08, 96),
      new THREE.MeshStandardNodeMaterial({ color: 0x15181d, roughness: 0.35, metalness: 0.2 }),
    );
    plinth.position.y = -0.04;
    plinth.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.45, 0.012, 8, 160), new THREE.MeshBasicNodeMaterial({ color: 0xff6b2c }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.005;
    this.stage.add(plinth, ring);
    v.scene.add(this.stage);
    v.freeMove = false;
    v.controls.target.set(0, 0.6, 0);
    v.camera.position.set(5.2, 1.6, 5.6);
    v.controls.autoRotate = !settings.get().reduceMotion;
    v.controls.autoRotateSpeed = 0.55;
    v.controls.minDistance = 3.5;
    v.controls.maxDistance = 12;
  }

  private async showModel(url: string | null): Promise<void> {
    const ticket = ++this.loading;
    if (!url) return;
    const model = await loadVehicleModel(url).catch(() => null);
    if (!model || ticket !== this.loading) return;
    if (this.model) this.stage.remove(this.model.root);
    this.model = model;
    this.stage.add(model.root);
  }

  dispose(): void {
    this.root.remove();
    this.foot.remove();
    this.stage.removeFromParent();
    this.viewer.controls.autoRotate = false;
    this.viewer.controls.minDistance = 1;
    this.viewer.controls.maxDistance = 600;
  }
}

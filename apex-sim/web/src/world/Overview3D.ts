// Free-roam 3D map (§18.3-7 월드맵, 3D): the camera leaves the car and rises over the live world until the whole map
// is in view — the same terrain, roads, buildings, water, time of day and weather the car drives in, with the haze
// thinned. Drag turns, two fingers (or the right button) pan, the wheel or a pinch zooms. Beacons mark the car and the
// destination, the route is drawn over the roads, labels name the places; a tap on the ground offers a teleport or a
// destination. The physics waits while the map is open.
import * as THREE from 'three/webgpu';
import { color, positionLocal, sin, time } from 'three/tsl';
import type { Viewer } from '../render/Viewer';
import { t, tl } from '../ui/i18n';
import { icon } from '../ui/icons';
import type { MapData } from './builder';
import type { Environment } from './Environment';
import { POI_COLOR } from './MapUI';
import type { MapView } from './MapView';
import type { RoutePlan } from './Route';
import { accentHex } from '../ui/settings';

export interface OverviewActions {
  car(): { x: number; y: number; z: number; heading: number };
  route(): RoutePlan | null;
  waypoint(): { x: number; z: number } | null;
  teleport(x: number, z: number, yaw: number | null): void;
  setWaypoint(x: number, z: number): void;
  /** The overview closed (the camera is back behind the car). */
  closed(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  e.append(...children);
  return e;
}

interface Label {
  el: HTMLElement;
  x: number;
  y: number;
  z: number;
  prio: number;
}

interface Flight {
  t: number;
  start: number;
  dur: number;
  fromT: THREE.Vector3;
  toT: THREE.Vector3;
  fromR: number;
  toR: number;
  fromP: number;
  toP: number;
  fromA: number;
  toA: number;
  done?: () => void;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function beacon(hex: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const beam = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  beam.colorNode = color(hex);
  const up = positionLocal.y.div(height).clamp(0, 1);
  beam.opacityNode = up.oneMinus().pow(1.6).mul(sin(time.mul(3)).mul(0.12).add(0.62));
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, height, 24, 1, true).translate(0, height / 2, 0), beam);
  const ringMat = new THREE.MeshBasicNodeMaterial({ color: hex, transparent: true, depthWrite: false, fog: false });
  ringMat.opacityNode = sin(time.mul(3)).mul(0.2).add(0.8);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.3, 48).rotateX(-Math.PI / 2), ringMat);
  ring.position.y = 0.6;
  g.add(cyl, ring);
  g.renderOrder = 5;
  return g;
}

export class Overview3D {
  readonly root = el('div', 'ov3');
  private open_ = false;
  private fly: Flight | null = null;
  private saved: { near: number; far: number; minD: number; maxD: number; maxP: number; pan: boolean; ssp: boolean; shadowHalf: number } | null = null;
  private readonly marks = new THREE.Group();
  private readonly carBeacon = beacon(accentHex(), 420);
  private readonly wpBeacon = beacon(0xf4475c, 420);
  private readonly spotBeacon = beacon(0x3d8bff, 260);
  private routeMesh: THREE.Mesh | null = null;
  private routeRef: RoutePlan | null = null;
  private routeW = 0;
  private readonly routeMat = new THREE.MeshBasicNodeMaterial({ color: accentHex(), transparent: true, opacity: 0.92, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  private readonly labels: Label[] = [];
  private readonly carLabel: Label;
  private readonly layer = el('div', 'ov3-labels');
  private readonly card = el('div', 'ov3-card');
  private spot: { x: number; z: number } | null = null;
  private down: { x: number; y: number; t: number } | null = null;
  private readonly ray = new THREE.Raycaster();
  private readonly v = new THREE.Vector3();

  constructor(private readonly viewer: Viewer, private readonly map: MapData, private readonly view: MapView, private readonly env: Environment, private readonly actions: OverviewActions) {
    // ---- overlay: title, buttons, labels, the spot card ----
    const coarse = matchMedia('(pointer: coarse)').matches;
    const title = el('div', 'ov3-title', el('b', '', `${t('map3d')} · ${tl(map.name)}`), el('small', '', t(coarse ? 'ov3Hint2' : 'ov3Hint')));
    const btn = (name: Parameters<typeof icon>[0], label: string, f: () => void, cls = '') => {
      const b = el('button', `ov3-btn ${cls}`, icon(name), el('span', '', label));
      b.onclick = f;
      return b;
    };
    const top = el('div', 'ov3-top', title,
      btn('car', t('ov3Car'), () => this.focusCar()),
      btn('orbit', t('ov3Whole'), () => this.whole()),
      btn('chevron', t('ov3Back'), () => this.close(), 'primary'));
    this.card.hidden = true;
    this.root.append(this.layer, top, this.card);
    this.root.hidden = true;
    document.body.append(this.root);
    // Places and districts.
    for (const a of map.areas) {
      const e = el('div', a.size >= 2 ? 'ov3-area big' : 'ov3-area', tl(a.label));
      this.layer.append(e);
      this.labels.push({ el: e, x: a.x, y: map.terrain.heightAt(a.x, a.z) + 60, z: a.z, prio: a.size >= 2 ? 3 : 1 });
    }
    for (const p of map.pois) {
      const dot = el('i');
      dot.style.background = POI_COLOR[p.kind];
      const e = el('button', 'ov3-poi', dot, el('span', '', tl(p.label)));
      e.onclick = () => this.pickSpot(p.x, p.z, tl(p.label), p.yaw);
      this.layer.append(e);
      this.labels.push({ el: e, x: p.x, y: Math.max(p.y ?? -Infinity, map.terrain.heightAt(p.x, p.z)) + 8, z: p.z, prio: 2 });
    }
    const carEl = el('div', 'ov3-car', icon('car'), el('span', '', t('ov3Car')));
    this.layer.append(carEl);
    this.carLabel = { el: carEl, x: 0, y: 0, z: 0, prio: 9 };
    this.marks.add(this.carBeacon, this.wpBeacon, this.spotBeacon);
    this.marks.visible = false;
    viewer.scene.add(this.marks);
  }

  get isOpen(): boolean {
    return this.open_;
  }

  open(): void {
    if (this.open_) return;
    this.open_ = true;
    const v = this.viewer, c = v.controls, cam = v.camera;
    this.saved = { near: cam.near, far: cam.far, minD: c.minDistance, maxD: c.maxDistance, maxP: c.maxPolarAngle, pan: c.enablePan, ssp: c.screenSpacePanning, shadowHalf: v.shadowHalf };
    cam.near = 0.5;
    cam.far = 40000;
    cam.updateProjectionMatrix();
    this.view.overview = true;
    this.env.minVisibility = 150000; // a light aerial haze across the whole map
    v.shadowHalf = 400;
    this.marks.visible = true;
    this.root.hidden = false;
    this.root.classList.remove('out');
    document.body.classList.add('ov3-on');
    const el = v.renderer.domElement;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointerup', this.onUp);
    // From behind the car up to the whole map, turning a little on the way.
    const car = this.actions.car();
    c.target.set(car.x, car.y + 1, car.z);
    this.flyTo(this.centre(), this.wholeRadius(), 0.82, undefined, 2.0);
  }

  close(): void {
    if (!this.open_ || !this.saved) return;
    this.card.hidden = true;
    this.spot = null;
    const car = this.actions.car();
    // Back down behind the car (the chase camera takes over from there).
    const behind = Math.atan2(-Math.sin(car.heading), Math.cos(car.heading));
    this.flyTo(new THREE.Vector3(car.x, car.y + 1, car.z), 8, 1.2, behind, 1.5, () => this.finishClose());
    this.root.classList.add('out');
  }

  private finishClose(): void {
    const v = this.viewer, c = v.controls, cam = v.camera, s = this.saved!;
    this.open_ = false;
    cam.near = s.near;
    cam.far = s.far;
    cam.updateProjectionMatrix();
    c.minDistance = s.minD;
    c.maxDistance = s.maxD;
    c.maxPolarAngle = s.maxP;
    c.enablePan = s.pan;
    c.screenSpacePanning = s.ssp;
    v.shadowHalf = s.shadowHalf;
    this.view.overview = false;
    this.env.minVisibility = 0;
    this.marks.visible = false;
    this.root.hidden = true;
    document.body.classList.remove('ov3-on');
    const el = v.renderer.domElement;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointerup', this.onUp);
    this.actions.closed();
  }

  private centre(): THREE.Vector3 {
    const t = this.map.terrain;
    const x = t.originX + t.width / 2, z = t.originZ + t.depth / 2;
    return new THREE.Vector3(x, t.heightAt(x, z), z);
  }

  private whole(): void {
    this.flyTo(this.centre(), this.wholeRadius(), 0.82, undefined, 1.4);
  }

  /** Far enough for the whole map across the narrower screen side. */
  private wholeRadius(): number {
    return (this.map.size * 0.78) / Math.min(1, innerWidth / innerHeight / 1.2);
  }

  private focusCar(): void {
    const car = this.actions.car();
    this.flyTo(new THREE.Vector3(car.x, car.y, car.z), 700, 0.9, undefined, 1.4);
  }

  private flyTo(target: THREE.Vector3, radius: number, polar: number, azimuth: number | undefined, dur: number, done?: () => void): void {
    const c = this.viewer.controls, cam = this.viewer.camera;
    const sph = new THREE.Spherical().setFromVector3(cam.position.clone().sub(c.target));
    let toA = azimuth ?? sph.theta + 0.5;
    // Turn the short way round.
    while (toA - sph.theta > Math.PI) toA -= Math.PI * 2;
    while (toA - sph.theta < -Math.PI) toA += Math.PI * 2;
    this.fly = { t: 0, start: performance.now(), dur, fromT: c.target.clone(), toT: target.clone(), fromR: sph.radius, toR: radius, fromP: sph.phi, toP: polar, fromA: sph.theta, toA, done };
    c.enabled = false;
  }

  /** Per frame while open: the flight, the controls, beacons, the route and the labels. */
  update(): void {
    if (!this.open_) return;
    const v = this.viewer, c = v.controls, cam = v.camera;
    if (this.fly) {
      const f = this.fly;
      f.t = Math.min(1, (performance.now() - f.start) / 1000 / f.dur); // wall clock: slow frames don't stretch it
      const e = ease(f.t);
      c.target.lerpVectors(f.fromT, f.toT, e);
      // The arc climbs above the straight blend on the way (a crane shot rather than a zoom).
      const r = THREE.MathUtils.lerp(f.fromR, f.toR, e) * (1 + Math.sin(Math.PI * e) * 0.08);
      cam.position.setFromSpherical(new THREE.Spherical(r, THREE.MathUtils.lerp(f.fromP, f.toP, e), THREE.MathUtils.lerp(f.fromA, f.toA, e))).add(c.target);
      cam.lookAt(c.target);
      if (f.t >= 1) {
        this.fly = null;
        if (f.done) f.done();
        else {
          c.enabled = true;
          c.minDistance = 60;
          c.maxDistance = this.wholeRadius() * 1.8;
          c.maxPolarAngle = Math.PI * 0.46;
          c.enablePan = true;
          c.screenSpacePanning = false;
        }
      }
    }
    if (!this.open_) return;
    // Never under the ground; the target stays on the map.
    const half = this.map.size * 0.55;
    c.target.x = THREE.MathUtils.clamp(c.target.x, -half, half);
    c.target.z = THREE.MathUtils.clamp(c.target.z, -half, half);
    const ground = this.map.terrain.heightAt(cam.position.x, cam.position.z) + 25;
    if (cam.position.y < ground) cam.position.y = ground;
    const dist = cam.position.distanceTo(c.target);
    const k = Math.max(1, dist / 260);
    // Beacons: the car, the destination, the picked spot (wider the farther away).
    const car = this.actions.car();
    this.carBeacon.position.set(car.x, car.y, car.z);
    this.carBeacon.scale.set(k * 3, 1 + k * 0.25, k * 3);
    const wp = this.actions.waypoint();
    this.wpBeacon.visible = !!wp;
    if (wp) {
      this.wpBeacon.position.set(wp.x, this.map.terrain.heightAt(wp.x, wp.z), wp.z);
      this.wpBeacon.scale.set(k * 3, 1 + k * 0.25, k * 3);
    }
    this.spotBeacon.visible = !!this.spot;
    if (this.spot) {
      this.spotBeacon.position.set(this.spot.x, this.map.terrain.heightAt(this.spot.x, this.spot.z), this.spot.z);
      this.spotBeacon.scale.set(k * 2.4, 1 + k * 0.2, k * 2.4);
    }
    this.syncRoute(k);
    this.placeLabels(car);
  }

  /** The route as a ribbon over the roads: rebuilt when the route changes or the view distance changes its width
   *  (it stays a few pixels wide). */
  private syncRoute(k: number): void {
    const r = this.actions.route();
    const w = Math.min(Math.max(k * 6, 8), 60);
    if (r === this.routeRef && (!r || Math.abs(w - this.routeW) < this.routeW * 0.2)) return;
    this.routeRef = r;
    this.routeW = w;
    if (this.routeMesh) {
      this.routeMesh.geometry.dispose();
      this.routeMesh.removeFromParent();
      this.routeMesh = null;
    }
    if (!r || r.points.length < 2) return;
    const pos: number[] = [], idx: number[] = [];
    const P = r.points;
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, P.length - 1)];
      const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
      const nx = (-tz / l) * (w / 2), nz = (tx / l) * (w / 2);
      const y = this.map.terrain.heightAt(P[i].x, P[i].z) + 6;
      pos.push(P[i].x + nx, y, P[i].z + nz, P[i].x - nx, y, P[i].z - nz);
      if (i) idx.push(i * 2 - 2, i * 2 - 1, i * 2 + 1, i * 2 - 2, i * 2 + 1, i * 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    this.routeMesh = new THREE.Mesh(g, this.routeMat);
    this.routeMesh.renderOrder = 4;
    this.routeMesh.frustumCulled = false;
    this.marks.add(this.routeMesh);
  }

  private readonly placed: Array<[number, number, number]> = [];

  private placeLabels(car: { x: number; y: number; z: number }): void {
    const cam = this.viewer.camera, W = innerWidth, H = innerHeight;
    this.carLabel.x = car.x;
    this.carLabel.y = car.y + 12;
    this.carLabel.z = car.z;
    const all = [this.carLabel, ...this.labels];
    const shown: Array<[Label, number, number]> = [];
    for (const l of all) {
      this.v.set(l.x, l.y, l.z).project(cam);
      const x = (this.v.x * 0.5 + 0.5) * W, y = (0.5 - this.v.y * 0.5) * H;
      const vis = this.v.z < 1 && x > -40 && x < W + 40 && y > 60 && y < H + 20;
      l.el.classList.toggle('hid', !vis);
      if (vis) shown.push([l, x, y]);
    }
    // Declutter: higher priority first; an overlapping place label shrinks to its dot, a district label hides.
    shown.sort((a, b) => b[0].prio - a[0].prio);
    this.placed.length = 0;
    for (const [l, x, y] of shown) {
      l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      const w = l.prio === 9 ? 90 : l.el.classList.contains('ov3-poi') ? 120 : 110;
      const hit = this.placed.some(([px, py, pw]) => Math.abs(px - x) < (pw + w) / 2 && Math.abs(py - y) < 24);
      if (l.el.classList.contains('ov3-poi')) l.el.classList.toggle('mini', hit);
      else if (l.prio !== 9) l.el.classList.toggle('hid', hit);
      if (!hit || l.prio === 9) this.placed.push([x, y, w]);
    }
  }

  // ---- picking a spot on the ground ----

  private readonly onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (this.fly && !this.fly.done) {
      this.fly = null;
      const c = this.viewer.controls;
      c.enabled = true;
      c.minDistance = 60;
      c.maxDistance = this.wholeRadius() * 1.8;
      c.maxPolarAngle = Math.PI * 0.46;
      c.enablePan = true;
      c.screenSpacePanning = false;
    }
  };

  private readonly onUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (!d || e.button !== 0 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 450) return;
    const hit = this.groundAt(e.clientX, e.clientY);
    if (hit) this.pickSpot(hit.x, hit.z, null, null);
  };

  /** Where a screen point's ray meets the terrain (marched, then bisected). */
  private groundAt(sx: number, sy: number): THREE.Vector3 | null {
    this.ray.setFromCamera(new THREE.Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1), this.viewer.camera);
    const o = this.ray.ray.origin, dir = this.ray.ray.direction, t = this.map.terrain;
    const p = new THREE.Vector3();
    let prev = 0;
    for (let s = 0; s < 40000; ) {
      const step = Math.max(4, s * 0.01);
      s += step;
      p.copy(o).addScaledVector(dir, s);
      if (p.y < t.heightAt(p.x, p.z)) {
        let lo = prev, hi = s;
        for (let i = 0; i < 14; i++) {
          const m = (lo + hi) / 2;
          p.copy(o).addScaledVector(dir, m);
          if (p.y < t.heightAt(p.x, p.z)) hi = m;
          else lo = m;
        }
        const half = this.map.size / 2;
        return Math.abs(p.x) <= half && Math.abs(p.z) <= half ? p : null;
      }
      prev = s;
    }
    return null;
  }

  private pickSpot(x: number, z: number, name: string | null, yaw: number | null): void {
    this.spot = { x, z };
    // A named place when one is near.
    let label = name;
    if (!label) {
      let best = 180;
      for (const p of this.map.pois) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < best) {
          best = d;
          label = tl(p.label);
        }
      }
    }
    const car = this.actions.car();
    const km = Math.hypot(x - car.x, z - car.z) / 1000;
    const go = el('button', 'primary', t('ov3Go'));
    go.onclick = () => {
      this.actions.teleport(x, z, yaw);
      this.card.hidden = true;
      this.spot = null;
      this.close();
    };
    const dest = el('button', '', t('ov3Route'));
    dest.onclick = () => {
      this.actions.setWaypoint(x, z);
      this.card.hidden = true;
      this.spot = null;
    };
    const x_ = el('button', 'icon-btn', icon('close'));
    x_.onclick = () => {
      this.card.hidden = true;
      this.spot = null;
    };
    this.card.replaceChildren(
      el('div', 'ov3-card-title', el('i'), el('b', '', label ?? t('ov3Here')), el('small', '', `${km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}`), x_),
      el('div', 'row', go, dest),
    );
    this.card.hidden = false;
    this.card.classList.remove('in');
    void this.card.offsetWidth;
    this.card.classList.add('in');
  }

  dispose(): void {
    this.root.remove();
    this.marks.removeFromParent();
  }
}

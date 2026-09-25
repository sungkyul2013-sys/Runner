// Map UI (§18.3-7 인게임 월드맵, §18.4 미니맵): a shaded relief of the terrain with water and paved areas, the road
// network by class, points of interest, the route and the car. The minimap turns with the car (or stays north-up);
// the world map pans and zooms (drag, wheel, pinch), teleports to a point of interest or any road and sets a
// waypoint for route guidance.
import type { MapData } from './builder';
import type { RoutePlan } from './Route';
import { MAT, type Poi } from './types';
import { t, tl } from '../ui/i18n';
import { icon } from '../ui/icons';

const ROAD_STYLE: Record<string, [string, number]> = {
  highway: ['#f0a04b', 5],
  ramp: ['#f0a04b', 2.5],
  connector: ['#f4d27a', 3.5],
  arterial: ['#f7f2e6', 3.5],
  street: ['#dcd8cf', 2.2],
  alley: ['#c9c4ba', 1.5],
  rural: ['#f4d27a', 2.6],
  mountain: ['#f4d27a', 2.2],
  gravel: ['#b9a88a', 1.6],
  farm: ['#c9c1ae', 1.2],
  trail: ['#a8906b', 1.2],
  track: ['#e8e8e8', 4],
};

const POI_COLOR: Record<Poi['kind'], string> = {
  spawn: '#FF6B2C',
  city: '#3D8BFF',
  landmark: '#A78BFA',
  test: '#2EE6A6',
  service: '#FBBF24',
  scenic: '#34D399',
};

/** Shaded relief of the map (one pixel per `res` metres), painted once. */
export function reliefImage(map: MapData, res = 8): HTMLCanvasElement {
  const t = map.terrain;
  const w = Math.round((t.nx * t.cell) / res), h = Math.round((t.nz * t.cell) / res);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(w, h);
  const water = map.render.water;
  const levelAt = (x: number, z: number): number | null => {
    for (const wb of water) {
      if (wb.kind === 'river') {
        const hw = (wb.width ?? 100) / 2;
        for (let i = 0; i + 1 < wb.points.length; i++) {
          const [ax, az] = wb.points[i], [bx, bz] = wb.points[i + 1];
          const dx = bx - ax, dz = bz - az;
          const u = Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0), 1);
          if (Math.hypot(x - ax - dx * u, z - az - dz * u) < hw) return wb.level;
        }
      } else {
        let inside = false;
        const p = wb.points;
        for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
          if (p[i][1] > z !== p[j][1] > z && x < ((p[j][0] - p[i][0]) * (z - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside;
        }
        if (inside) return wb.level;
      }
    }
    return null;
  };
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = t.originX + (px + 0.5) * res, z = t.originZ + (py + 0.5) * res;
      const y = t.heightAt(x, z);
      const n = t.normalAt(x, z);
      const shade = Math.max(0.35, Math.min(1.15, 0.75 + (-n[0] * 0.6 - n[2] * 0.5 + n[1] * 0.3) * 0.6));
      const mat = t.materialAt(x, z);
      let r: number, gg: number, b: number;
      const wl = levelAt(x, z);
      if (wl !== null && y < wl + 0.2) {
        [r, gg, b] = [58, 104, 128];
      } else if (mat === MAT.concrete && n[1] > 0.97) {
        [r, gg, b] = [70, 74, 80]; // paved city ground
      } else if (mat === MAT.snowPacked || mat === MAT.snowFresh) {
        [r, gg, b] = [226, 232, 238];
      } else if (mat === MAT.sand) {
        [r, gg, b] = [196, 178, 136];
      } else if (mat === MAT.dirt) {
        [r, gg, b] = [128, 110, 76];
      } else {
        const k = Math.min(Math.max((y - 5) / 300, 0), 1);
        [r, gg, b] = [58 + 70 * k, 84 + 38 * k, 50 + 40 * k];
      }
      const i = (py * w + px) * 4;
      img.data[i] = Math.min(255, r * shade);
      img.data[i + 1] = Math.min(255, gg * shade);
      img.data[i + 2] = Math.min(255, b * shade);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // Buildings as dark footprints.
  g.fillStyle = 'rgba(28,32,39,0.85)';
  for (const bd of map.render.buildings) {
    g.save();
    g.translate((bd.x - t.originX) / res, (bd.z - t.originZ) / res);
    g.rotate(-bd.yaw);
    g.fillRect(-bd.w / 2 / res, -bd.d / 2 / res, bd.w / res, bd.d / res);
    g.restore();
  }
  return canvas;
}

/** Draws roads, POIs, route and car on a 2D context whose transform maps world metres to pixels. */
function drawVectors(g: CanvasRenderingContext2D, map: MapData, pxPerM: number, opts: { route?: RoutePlan | null; waypoint?: { x: number; z: number } | null; pois?: boolean; labels?: boolean; carSize?: number }): void {
  const scale = Math.max(pxPerM, 0.05);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // Casing then fill, by class (highways on top).
  // Paved areas (pads, lots, test surfaces) and the test tracks the route graph leaves out.
  g.fillStyle = 'rgba(96,100,108,0.95)';
  for (const a of map.render.areas) {
    if (a.look === 'terrain') continue;
    g.beginPath();
    a.outline.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
    g.closePath();
    g.fill();
  }
  for (const pass of [0, 1]) {
    for (const l of map.render.lines) {
      const [col, width] = ROAD_STYLE[l.cls] ?? ['#ddd', 2];
      g.strokeStyle = pass === 0 ? 'rgba(10,12,16,0.75)' : col;
      g.lineWidth = Math.max((width * (pass === 0 ? 1.8 : 1)) / scale, (pass === 0 ? 1.6 : 1) * Math.min(width * 0.6, 2.6));
      g.beginPath();
      g.moveTo(l.xs[0], l.zs[0]);
      for (let i = 1; i < l.xs.length; i++) g.lineTo(l.xs[i], l.zs[i]);
      if (l.closed) g.closePath();
      g.stroke();
    }
  }
  const order = ['trail', 'farm', 'gravel', 'alley', 'street', 'rural', 'mountain', 'arterial', 'connector', 'track', 'ramp', 'highway'];
  for (const pass of [0, 1]) {
    for (const cls of order) {
      const [col, width] = ROAD_STYLE[cls] ?? ['#ddd', 2];
      g.strokeStyle = pass === 0 ? 'rgba(10,12,16,0.75)' : col;
      g.lineWidth = Math.max((width * (pass === 0 ? 1.8 : 1)) / scale, (pass === 0 ? 1.6 : 1) * Math.min(width * 0.6, 2.6)) ;
      g.beginPath();
      for (const e of map.graph.edges) {
        if (e.cls !== cls) continue;
        g.moveTo(e.xs[0], e.zs[0]);
        for (let i = 1; i < e.xs.length; i++) g.lineTo(e.xs[i], e.zs[i]);
      }
      // Test tracks and pads (not in the route graph) come from the road list when present.
      g.stroke();
    }
  }
  if (opts.route) {
    const p = opts.route.points;
    g.strokeStyle = 'rgba(11,13,16,0.9)';
    g.lineWidth = 9 / scale;
    g.beginPath();
    g.moveTo(p[0].x, p[0].z);
    for (const q of p) g.lineTo(q.x, q.z);
    g.stroke();
    g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#FF6B2C';
    g.lineWidth = 5 / scale;
    g.stroke();
  }
  if (opts.waypoint) {
    const { x, z } = opts.waypoint;
    g.fillStyle = '#F4475C';
    g.strokeStyle = '#fff';
    g.lineWidth = 2 / scale;
    g.beginPath();
    g.arc(x, z, 7 / scale, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  if (opts.pois) {
    for (const p of map.pois) {
      g.fillStyle = POI_COLOR[p.kind];
      g.strokeStyle = 'rgba(11,13,16,0.9)';
      g.lineWidth = 2 / scale;
      g.beginPath();
      g.arc(p.x, p.z, 6 / scale, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }
}

function drawLabels(g: CanvasRenderingContext2D, map: MapData, toPx: (x: number, z: number) => [number, number], zoom: number): void {
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const a of map.areas) {
    if (a.size < 2 && zoom < 0.12) continue;
    const [x, y] = toPx(a.x, a.z);
    g.font = `${a.size >= 2 ? 700 : 600} ${a.size >= 2 ? 16 : 13}px Pretendard, Inter, sans-serif`;
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(11,13,16,0.8)';
    g.fillStyle = 'rgba(242,244,247,0.92)';
    g.strokeText(tl(a.label), x, y);
    g.fillText(tl(a.label), x, y);
  }
  if (zoom < 0.2) return;
  g.font = '600 12px Pretendard, Inter, sans-serif';
  for (const p of map.pois) {
    const [x, y] = toPx(p.x, p.z);
    g.textAlign = 'left';
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(11,13,16,0.85)';
    g.fillStyle = '#F2F4F7';
    g.strokeText(tl(p.label), x + 10, y);
    g.fillText(tl(p.label), x + 10, y);
  }
}

function drawCar(g: CanvasRenderingContext2D, x: number, y: number, heading: number, size = 11): void {
  g.save();
  g.translate(x, y);
  g.rotate(heading);
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#FF6B2C';
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, -size);
  g.lineTo(size * 0.72, size * 0.8);
  g.lineTo(0, size * 0.4);
  g.lineTo(-size * 0.72, size * 0.8);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

/** HUD minimap (§18.4): turns with the car or stays north-up; the scale grows with speed. */
export class Minimap {
  readonly root = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly relief: HTMLCanvasElement;
  private readonly res = 8;
  rotate = true;
  private zoom = 1.6; // px per metre ×10 (smoothed)

  constructor(private readonly map: MapData, relief: HTMLCanvasElement, onOpen: () => void) {
    this.root.className = 'minimap';
    this.root.append(this.canvas);
    const north = document.createElement('span');
    north.className = 'mm-n';
    north.textContent = 'N';
    this.root.append(north);
    this.root.title = t('mapOpen');
    this.root.onclick = onOpen;
    this.g = this.canvas.getContext('2d')!;
    this.relief = relief;
  }

  draw(x: number, z: number, heading: number, speed: number, route: RoutePlan | null, waypoint: { x: number; z: number } | null): void {
    const size = this.root.clientWidth || 160;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(size * dpr)) {
      this.canvas.width = this.canvas.height = Math.round(size * dpr);
    }
    const g = this.g;
    const target = 1.5 - Math.min(speed / 60, 1) * 0.9; // px per metre
    this.zoom += (target - this.zoom) * 0.05;
    const s = this.zoom * dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0B0D10';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    g.translate(this.canvas.width / 2, this.canvas.height * (this.rotate ? 0.62 : 0.5));
    const rot = this.rotate ? -heading : 0;
    g.rotate(rot);
    g.scale(s, s);
    g.translate(-x, -z);
    const t = this.map.terrain;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.relief, t.originX, t.originZ, this.relief.width * this.res, this.relief.height * this.res);
    drawVectors(g, this.map, s, { route, waypoint, pois: true });
    g.setTransform(1, 0, 0, 1, 0, 0);
    drawCar(g, this.canvas.width / 2, this.canvas.height * (this.rotate ? 0.62 : 0.5), this.rotate ? 0 : heading, 9 * dpr);
    const n = this.root.querySelector<HTMLElement>('.mm-n')!;
    // The N marker sits on the rim in the direction of north (−z).
    const ang = rot - Math.PI / 2 + Math.PI; // screen angle of north (−z is up when rot = 0)
    void ang;
    const r = size / 2 - 10;
    const nx = Math.sin(rot) * -r, ny = -Math.cos(rot) * r;
    n.style.transform = `translate(${size / 2 + nx - 7}px, ${size * (this.rotate ? 0.62 : 0.5) + ny - 8}px)`;
    n.hidden = !this.rotate;
  }
}

export interface WorldMapActions {
  teleport(x: number, z: number, yaw: number | null): void;
  setWaypoint(x: number, z: number): void;
  clearWaypoint(): void;
  close(): void;
}

/** Full-screen world map (§18.3-7): pan, zoom, points of interest, teleport and waypoints. */
export class WorldMap {
  readonly root = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly card = document.createElement('div');
  private readonly list = document.createElement('div');
  private cx = 0;
  private cz = 0;
  private zoom = 0.18; // px per metre
  private car = { x: 0, z: 0, heading: 0 };
  private route: RoutePlan | null = null;
  private waypoint: { x: number; z: number } | null = null;
  private raf = 0;

  constructor(private readonly map: MapData, private readonly relief: HTMLCanvasElement, private readonly actions: WorldMapActions) {
    this.root.className = 'worldmap';
    this.g = this.canvas.getContext('2d')!;
    const top = document.createElement('div');
    top.className = 'wm-top';
    const title = document.createElement('div');
    title.className = 'wm-title';
    title.innerHTML = `<b>${tl(map.name)}</b><small>${t('mapHint')}</small>`;
    const btn = (name: Parameters<typeof icon>[0], label: string, f: () => void) => {
      const b = document.createElement('button');
      b.className = 'icon-btn';
      b.append(icon(name));
      b.ariaLabel = label;
      b.title = label;
      b.onclick = f;
      return b;
    };
    top.append(title, btn('plus', t('mapZoomIn'), () => this.zoomBy(1.5)), btn('back', t('mapZoomOut'), () => this.zoomBy(1 / 1.5)), btn('car', t('mapCenter'), () => this.center()), btn('close', t('close'), () => actions.close()));
    this.card.className = 'wm-card';
    this.card.hidden = true;
    this.list.className = 'wm-list';
    const head = document.createElement('div');
    head.className = 'wm-list-head';
    head.textContent = t('mapPlaces');
    this.list.append(head);
    for (const p of map.pois) {
      const b = document.createElement('button');
      b.className = 'wm-poi';
      b.innerHTML = `<i style="background:${POI_COLOR[p.kind]}"></i><span>${tl(p.label)}</span>`;
      b.onclick = () => {
        this.cx = p.x;
        this.cz = p.z;
        this.zoom = Math.max(this.zoom, 0.6);
        this.showPoi(p);
        this.draw();
      };
      this.list.append(b);
    }
    this.root.append(this.canvas, top, this.list, this.card);
    this.bindInput();
  }

  open(car: { x: number; z: number; heading: number }, route: RoutePlan | null, waypoint: { x: number; z: number } | null): void {
    this.car = car;
    this.route = route;
    this.waypoint = waypoint;
    this.cx = car.x;
    this.cz = car.z;
    this.card.hidden = true;
    document.body.append(this.root);
    this.draw();
  }

  close(): void {
    this.root.remove();
    cancelAnimationFrame(this.raf);
  }

  update(route: RoutePlan | null, waypoint: { x: number; z: number } | null): void {
    this.route = route;
    this.waypoint = waypoint;
    this.draw();
  }

  private zoomBy(f: number, px?: number, py?: number): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const ax = px ?? w / 2, ay = py ?? h / 2;
    const [wx, wz] = this.toWorld(ax, ay);
    this.zoom = Math.min(Math.max(this.zoom * f, 0.04), 4);
    // Keep the point under the cursor fixed.
    this.cx = wx - (ax - w / 2) / this.zoom;
    this.cz = wz - (ay - h / 2) / this.zoom;
    this.draw();
  }

  private center(): void {
    this.cx = this.car.x;
    this.cz = this.car.z;
    this.draw();
  }

  private toWorld(px: number, py: number): [number, number] {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return [this.cx + (px - w / 2) / this.zoom, this.cz + (py - h / 2) / this.zoom];
  }

  private toPx(x: number, z: number): [number, number] {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return [(x - this.cx) * this.zoom + w / 2, (z - this.cz) * this.zoom + h / 2];
  }

  private bindInput(): void {
    const c = this.canvas;
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch = 0;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    c.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      if (pointers.size === 2) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) this.zoomBy(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch = d;
        moved += 10;
        return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      moved += Math.abs(dx) + Math.abs(dy);
      this.cx -= dx / this.zoom;
      this.cz -= dy / this.zoom;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.draw();
    });
    const up = (e: PointerEvent) => {
      const was = pointers.has(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
      if (was && moved < 6 && pointers.size === 0) this.tap(e.clientX - c.getBoundingClientRect().left, e.clientY - c.getBoundingClientRect().top);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this.zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (!this.root.isConnected) return;
      if (e.key === 'Escape' || e.key === 'm' || e.key === 'M') {
        e.stopPropagation();
        this.actions.close();
      }
    });
  }

  private tap(px: number, py: number): void {
    // A point of interest under the finger, else the spot itself.
    for (const p of this.map.pois) {
      const [x, y] = this.toPx(p.x, p.z);
      if (Math.hypot(x - px, y - py) < 16) {
        this.showPoi(p);
        return;
      }
    }
    const [x, z] = this.toWorld(px, py);
    this.showSpot(x, z);
  }

  private showPoi(p: Poi): void {
    this.card.hidden = false;
    this.card.replaceChildren();
    const h = document.createElement('div');
    h.className = 'wm-card-title';
    h.innerHTML = `<i style="background:${POI_COLOR[p.kind]}"></i><b>${tl(p.label)}</b>`;
    const row = document.createElement('div');
    row.className = 'row';
    const tp = document.createElement('button');
    tp.className = 'primary';
    tp.textContent = t('mapTeleport');
    tp.onclick = () => this.actions.teleport(p.x, p.z, p.yaw);
    const wp = document.createElement('button');
    wp.textContent = t('mapRoute');
    wp.onclick = () => {
      this.actions.setWaypoint(p.x, p.z);
      this.card.hidden = true;
    };
    row.append(tp, wp);
    this.card.append(h, row);
    this.draw();
  }

  private showSpot(x: number, z: number): void {
    this.card.hidden = false;
    this.card.replaceChildren();
    const h = document.createElement('div');
    h.className = 'wm-card-title';
    h.innerHTML = `<b>${t('mapSpot')}</b><small>${x.toFixed(0)}, ${(-z).toFixed(0)}</small>`;
    const row = document.createElement('div');
    row.className = 'row';
    const wp = document.createElement('button');
    wp.className = 'primary';
    wp.textContent = t('mapWaypoint');
    wp.onclick = () => {
      this.actions.setWaypoint(x, z);
      this.card.hidden = true;
    };
    const tp = document.createElement('button');
    tp.textContent = t('mapTeleportRoad');
    tp.onclick = () => this.actions.teleport(x, z, null);
    row.append(wp, tp);
    if (this.waypoint) {
      const clear = document.createElement('button');
      clear.textContent = t('mapClear');
      clear.onclick = () => {
        this.actions.clearWaypoint();
        this.card.hidden = true;
      };
      row.append(clear);
    }
    this.card.append(h, row);
  }

  private draw(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.paint());
  }

  private paint(): void {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0B0D10';
    g.fillRect(0, 0, c.width, c.height);
    g.setTransform(dpr * this.zoom, 0, 0, dpr * this.zoom, dpr * (w / 2 - this.cx * this.zoom), dpr * (h / 2 - this.cz * this.zoom));
    const t = this.map.terrain;
    g.imageSmoothingEnabled = this.zoom < 0.5;
    g.drawImage(this.relief, t.originX, t.originZ, t.nx * t.cell, t.nz * t.cell);
    drawVectors(g, this.map, this.zoom * dpr, { route: this.route, waypoint: this.waypoint, pois: true });
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLabels(g, this.map, (x, z) => this.toPx(x, z), this.zoom);
    const [px, py] = this.toPx(this.car.x, this.car.z);
    drawCar(g, px, py, this.car.heading, 12);
    // Scale bar.
    const meters = [50, 100, 200, 500, 1000, 2000].find((m) => m * this.zoom > 70) ?? 2000;
    g.fillStyle = 'rgba(242,244,247,0.9)';
    g.fillRect(20, h - 28, meters * this.zoom, 3);
    g.font = '600 12px JetBrains Mono, monospace';
    g.textAlign = 'left';
    g.fillText(meters >= 1000 ? `${meters / 1000} km` : `${meters} m`, 20, h - 38);
  }
}

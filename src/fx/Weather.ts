import * as THREE from 'three';

/** Ambient precipitation styles, one per district mood. */
export type WeatherMode = 'none' | 'rain' | 'snow' | 'embers';

/** Which weather each world-tour district carries. */
const DISTRICT_WEATHER: WeatherMode[] = [
  'none',   // 서울 — clear morning
  'rain',   // 도쿄 야경 — neon drizzle
  'none',   // 뉴욕 — dry dusk
  'none',   // 리우 — blazing sun
  'snow',   // 아이슬란드 — aurora snowfall
  'embers', // 사막 협곡 — rising heat sparks
  'rain',   // 네온 지하 — dripping tunnels
  'snow',   // 설원 — heavy flakes
];

export function weatherFor(district: number): WeatherMode {
  return DISTRICT_WEATHER[district % DISTRICT_WEATHER.length];
}

const COUNT = 240;
const HALF_X = 13;
const TOP_Y = 15;
const NEAR_Z = 8;
const FAR_Z = -46;
const SPAN_Z = NEAR_Z - FAR_Z;

interface ModeSpec {
  color: number;
  size: number;
  /** Fall speed (negative = rises, for embers). */
  fall: number;
  /** Lateral sway amplitude. */
  sway: number;
  opacity: number;
}

const SPECS: Record<Exclude<WeatherMode, 'none'>, ModeSpec> = {
  rain: { color: 0xa9cdf2, size: 0.09, fall: 21, sway: 0.2, opacity: 0.6 },
  snow: { color: 0xffffff, size: 0.17, fall: 3.1, sway: 1.4, opacity: 0.9 },
  embers: { color: 0xffa03a, size: 0.13, fall: -2.4, sway: 0.9, opacity: 0.8 },
};

/**
 * A single recycled particle field that plays each district's weather — neon
 * drizzle, aurora snow, desert embers. Mode changes cross-fade: the field dims
 * out, swaps its colour/size/behaviour, then dims back in, so a district
 * transition never pops. One `THREE.Points`, zero steady-state allocation.
 */
export class Weather {
  readonly points: THREE.Points;

  private readonly mat: THREE.PointsMaterial;
  private readonly pos: Float32Array;
  private readonly phase: Float32Array;
  private live: Exclude<WeatherMode, 'none'> = 'snow';
  private target: WeatherMode = 'none';
  private opacity = 0;
  private time = 0;

  constructor() {
    this.pos = new Float32Array(COUNT * 3);
    this.phase = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      this.pos[i * 3] = (Math.random() * 2 - 1) * HALF_X;
      this.pos[i * 3 + 1] = Math.random() * TOP_Y;
      this.pos[i * 3 + 2] = NEAR_Z - Math.random() * SPAN_Z;
      this.phase[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.15, transparent: true, opacity: 0,
      depthWrite: false, fog: true,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  /** Ask for a district's weather; the swap cross-fades on its own. */
  setMode(mode: WeatherMode): void {
    this.target = mode;
  }

  /** Snap instantly (run reset). */
  snap(mode: WeatherMode): void {
    this.target = mode;
    if (mode !== 'none') this.live = mode;
    this.opacity = mode === 'none' ? 0 : SPECS[this.live].opacity;
    this.applySpec();
  }

  private applySpec(): void {
    const s = SPECS[this.live];
    this.mat.color.setHex(s.color);
    this.mat.size = s.size;
  }

  update(dt: number, scroll: number): void {
    // Cross-fade toward the requested mode.
    const wantLive = this.target !== 'none' ? this.target : null;
    const mismatched = wantLive !== null && wantLive !== this.live;
    const targetOpacity = this.target === 'none' || mismatched ? 0 : SPECS[this.live].opacity;
    const k = 1 - Math.exp(-2.2 * dt);
    this.opacity += (targetOpacity - this.opacity) * k;
    if (mismatched && this.opacity < 0.03 && wantLive) {
      this.live = wantLive;
      this.applySpec();
    }
    this.mat.opacity = this.opacity;
    this.points.visible = this.opacity > 0.015;
    if (!this.points.visible) return;

    this.time += dt;
    const s = SPECS[this.live];
    const p = this.pos;
    for (let i = 0; i < COUNT; i++) {
      const j = i * 3;
      p[j] += Math.sin(this.time * 1.4 + this.phase[i]) * s.sway * dt;
      p[j + 1] -= s.fall * dt;
      p[j + 2] += scroll * 0.85;
      if (p[j + 1] < 0) p[j + 1] += TOP_Y;
      if (p[j + 1] > TOP_Y) p[j + 1] -= TOP_Y;
      if (p[j + 2] > NEAR_Z) p[j + 2] -= SPAN_Z;
      if (p[j] > HALF_X) p[j] -= HALF_X * 2;
      if (p[j] < -HALF_X) p[j] += HALF_X * 2;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}

import * as THREE from 'three';
import { Sky as SkyMesh } from 'three/examples/jsm/objects/Sky.js';
import { clamp, smoothstep, lerp } from '../core/math';

export interface WeatherState {
  cloudCover: number; // 0..1
  overcast: number; // 0..1 darkening
  fog: number; // 0..1
  rain: number; // 0..1
  storm: boolean;
  windSpeed: number; // m/s
  windDir: number; // deg (direction wind blows FROM)
  turbulence: number; // 0..1
}

export const WEATHER_PRESETS: Record<string, { name: string; w: WeatherState }> = {
  clear: { name: '맑음', w: { cloudCover: 0.25, overcast: 0, fog: 0.1, rain: 0, storm: false, windSpeed: 3, windDir: 350, turbulence: 0.1 } },
  scattered: { name: '구름 조금', w: { cloudCover: 0.55, overcast: 0.1, fog: 0.2, rain: 0, storm: false, windSpeed: 6, windDir: 20, turbulence: 0.25 } },
  overcast: { name: '흐림', w: { cloudCover: 0.95, overcast: 0.55, fog: 0.45, rain: 0, storm: false, windSpeed: 9, windDir: 40, turbulence: 0.4 } },
  rain: { name: '비', w: { cloudCover: 1, overcast: 0.7, fog: 0.6, rain: 0.8, storm: false, windSpeed: 11, windDir: 70, turbulence: 0.55 } },
  storm: { name: '뇌우', w: { cloudCover: 1, overcast: 0.85, fog: 0.65, rain: 1, storm: true, windSpeed: 17, windDir: 100, turbulence: 0.9 } },
  fog: { name: '짙은 안개', w: { cloudCover: 0.6, overcast: 0.4, fog: 1, rain: 0, storm: false, windSpeed: 2, windDir: 0, turbulence: 0.05 } },
};

export class Sky {
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly moon = new THREE.DirectionalLight(0x9fb4ff, 0.0);
  readonly hemi = new THREE.HemisphereLight(0xbcd4ff, 0x4b4232, 0.25);
  readonly sunDir = new THREE.Vector3();
  readonly fog: THREE.FogExp2;
  readonly sky: SkyMesh;
  private stars: THREE.Points;
  private pmrem: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private envSky: SkyMesh;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private lastEnvKey = '';
  hour = 10;
  weather: WeatherState = { ...WEATHER_PRESETS.clear.w };
  night = 0; // 0 day .. 1 full night
  horizonColor = new THREE.Color();
  lightning = 0;

  constructor(private scene: THREE.Scene, private renderer: THREE.WebGLRenderer) {
    this.sky = new SkyMesh();
    this.sky.scale.setScalar(40000);
    (this.sky.material as THREE.ShaderMaterial).depthWrite = false;
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.envSky = new SkyMesh();
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);

    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 1200;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target, this.moon, this.moon.target, this.hemi);

    this.fog = new THREE.FogExp2(0xa8c0dc, 0.00004);
    scene.fog = this.fog;

    // stars
    const N = 2500, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pos.set([r * Math.cos(t) * 30000, Math.abs(u) * 30000 + 200, r * Math.sin(t) * 30000], i * 3);
      const b = 0.5 + Math.random() * 0.5, warm = Math.random();
      col.set([b * (0.85 + warm * 0.15), b * 0.9, b * (1.05 - warm * 0.2)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    scene.add(this.stars);

    this.setTime(this.hour);
  }

  setWeather(w: WeatherState) { this.weather = { ...w }; this.lastEnvKey = ''; }

  setTime(h: number) {
    this.hour = ((h % 24) + 24) % 24;
    const a = ((this.hour - 6) / 12) * Math.PI;
    const elev = Math.sin(a) * 62 * (Math.PI / 180) - 0.03;
    const az = a; // 6h east → 12h south → 18h west
    this.sunDir.set(Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az) * 0.85 + 0.35 * Math.cos(elev)).normalize();
    this.lastEnvKey = '';
  }

  update(camera: THREE.Camera, focus: THREE.Vector3, dt: number) {
    const w = this.weather;
    const sd = this.sunDir;
    const el = sd.y;
    const day = smoothstep(-0.12, 0.08, el);
    this.night = 1 - day;
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
    const setSky = (uu: Record<string, THREE.IUniform>) => {
      uu.turbidity.value = lerp(2.2, 14, w.overcast);
      uu.rayleigh.value = lerp(1.25, 3.2, smoothstep(0.35, -0.05, el)) * (1 - w.overcast * 0.6);
      uu.mieCoefficient.value = lerp(0.004, 0.03, w.overcast) + w.fog * 0.01;
      uu.mieDirectionalG.value = 0.82;
      uu.sunPosition.value.copy(sd).multiplyScalar(1000);
    };
    setSky(u);
    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    (this.stars.material as THREE.PointsMaterial).opacity = smoothstep(0.35, 0.95, this.night) * (1 - w.cloudCover * 0.8);

    // Sun light: colour shifts to orange near horizon, dims with overcast
    const low = smoothstep(0.35, 0.0, el);
    const sunCol = new THREE.Color(1, 0.97, 0.92).lerp(new THREE.Color(1, 0.55, 0.28), low);
    const sunI = day * (3.2 - low * 1.3) * (1 - w.overcast * 0.78);
    this.sun.color.copy(sunCol);
    this.sun.intensity = sunI + this.lightning * 6;
    this.sun.position.copy(focus).addScaledVector(sd, 600);
    this.sun.target.position.copy(focus);
    this.moon.position.copy(focus).addScaledVector(sd, -600);
    this.moon.target.position.copy(focus);
    this.moon.intensity = this.night * 0.35 * (1 - w.overcast * 0.6);
    this.hemi.intensity = 0.12 + day * 0.18 + w.overcast * 0.35 * day + this.night * 0.05 + this.lightning * 2;
    this.hemi.color.setRGB(lerp(0.75, 0.5, w.overcast), lerp(0.85, 0.55, w.overcast), 1);

    // Horizon / fog colour
    const dayFog = new THREE.Color(0.58, 0.7, 0.86).lerp(new THREE.Color(0.95, 0.6, 0.42), low * 0.75);
    dayFog.lerp(new THREE.Color(0.55, 0.58, 0.62), w.overcast);
    const nightFog = new THREE.Color(0.012, 0.018, 0.035);
    this.horizonColor.copy(dayFog).lerp(nightFog, this.night);
    // brighten fog towards the sun for in-scatter
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const towardSun = clamp(camDir.dot(sd), 0, 1);
    this.fog.color.copy(this.horizonColor).lerp(sunCol, towardSun * towardSun * 0.35 * day * (1 - w.overcast));
    if (this.lightning > 0) this.fog.color.lerp(new THREE.Color(0.8, 0.85, 1), this.lightning * 0.5);
    const alt = Math.max(0, camera.position.y);
    const base = 0.000028 + w.fog * 0.00022 + w.rain * 0.00006;
    this.fog.density = base * Math.exp(-alt / (2200 + (1 - w.fog) * 2500));
    this.renderer.toneMappingExposure = lerp(0.55, 0.85, this.night) * lerp(1, 1.35, w.overcast * day);


    this.lightning = Math.max(0, this.lightning - dt * 4);

    // Environment map (IBL) refresh when the sun/weather changes noticeably
    const key = `${sd.x.toFixed(2)},${sd.y.toFixed(2)},${w.overcast.toFixed(2)}`;
    if (key !== this.lastEnvKey) {
      this.lastEnvKey = key;
      setSky(this.envSky.material.uniforms);
      this.envSky.material.uniforms.sunPosition.value.copy(sd).multiplyScalar(1000);
      const old = this.envRT;
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 2000);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = lerp(1, 0.25, this.night) * lerp(1, 0.7, w.overcast);
      old?.dispose();
    }
  }
}

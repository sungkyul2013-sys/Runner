// Living world (§13.1): 24-hour day with the sun, moon and stars placed for the map's latitude, dynamic weather
// (clear, cloudy, rain, storm, fog, snow, blizzard) with gradual transitions, fog, falling rain and snow around the
// camera, wet and snowy surfaces (shaders and the physics materials), wind (trees and the aerodynamics), night
// lighting (street lamps, windows) and the car's headlights.
import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { attribute, cameraPosition, float, fract, mod, pmremTexture, positionLocal, time, uniform, vec3, vec4, sin } from 'three/tsl';
import type { Viewer } from '../render/Viewer';
import type { MapUniforms } from './MapView';
import { MAT } from './types';

export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow' | 'blizzard';
export const WEATHERS: Weather[] = ['clear', 'cloudy', 'rain', 'storm', 'fog', 'snow', 'blizzard'];

interface WeatherParams {
  cloud: number; // sky cloud coverage 0 … 1
  fog: number; // visibility [m]
  rain: number; // precipitation intensity 0 … 1
  snow: number;
  wind: number; // [m/s]
  light: number; // sunlight factor
  wet: number; // road wetness target
  cover: number; // snow cover target
}

const WEATHER: Record<Weather, WeatherParams> = {
  clear: { cloud: 0.12, fog: 9000, rain: 0, snow: 0, wind: 2, light: 1, wet: 0, cover: 0 },
  cloudy: { cloud: 0.75, fog: 5000, rain: 0, snow: 0, wind: 4, light: 0.55, wet: 0, cover: 0 },
  rain: { cloud: 0.95, fog: 900, rain: 0.55, snow: 0, wind: 5, light: 0.4, wet: 1, cover: 0 },
  storm: { cloud: 1, fog: 380, rain: 1, snow: 0, wind: 13, light: 0.25, wet: 1, cover: 0 },
  fog: { cloud: 0.6, fog: 160, rain: 0, snow: 0, wind: 1, light: 0.45, wet: 0.35, cover: 0 },
  snow: { cloud: 0.9, fog: 1100, rain: 0, snow: 0.6, wind: 3, light: 0.5, wet: 0.2, cover: 1 },
  blizzard: { cloud: 1, fog: 150, rain: 0, snow: 1, wind: 16, light: 0.3, wet: 0.2, cover: 1 },
};

export interface PhysicsWeatherLink {
  setMaterialRemap(pairs: Array<[number, number]>): void;
  setWind(x: number, y: number, z: number): void;
}

const DEG = Math.PI / 180;

export class Environment {
  /** Time of day [h] and the date (day of the year: 172 ≈ 21 June). */
  hour = 14;
  day = 200;
  /** Floor on the fog's visibility [m] (the overview map looks across the whole map). */
  minVisibility = 0;
  /** Game seconds per real second (0: time stands still). */
  timeScale = 30;
  weather: Weather = 'clear';
  readonly sky = new SkyMesh();
  private readonly stars: THREE.Points;
  private readonly moon: THREE.Mesh;
  private readonly rain: THREE.Mesh;
  private readonly snow: THREE.Mesh;
  private readonly rainAmount = uniform(0);
  private readonly snowAmount = uniform(0);
  private readonly windU = uniform(new THREE.Vector3(2, 0, 0));
  private readonly starAlpha = uniform(0);
  private readonly overcast = uniform(0);
  private readonly overcastShade = uniform(0.6);
  private readonly dome: THREE.Mesh;
  private readonly cur: WeatherParams = { ...WEATHER.clear };
  private wetness = 0;
  private cover = 0;
  private windAngle = 0.7;
  private remapKey = '';
  private windSent = -1;
  private readonly fog: THREE.FogExp2;
  private readonly headlight: THREE.SpotLight;
  night = 0;
  // Reflections (§12 차량 반사): the sky (with its sun, clouds and overcast) over a ground-toned floor, prefiltered
  // into an environment map the cars reflect (the world's materials keep their own tuned lighting), rebuilt when
  // the hour or the weather has moved enough to show.
  private readonly envScene = new THREE.Scene();
  private readonly envGround: THREE.Mesh;
  private readonly envGroundCol = uniform(new THREE.Color(0x3a3d38));
  private pmrem: THREE.PMREMGenerator | null = null;
  private envRT: THREE.RenderTarget | null = null;
  private envKey = '';
  private envAt = 0;
  private envNode: ReturnType<typeof pmremTexture> | null = null;

  private reflectAt = 0;

  constructor(private readonly viewer: Viewer, private readonly uniforms: MapUniforms, readonly latitude: number, private readonly physics: PhysicsWeatherLink | null) {
    const scene = viewer.scene;
    this.sky.scale.setScalar(30000);
    this.sky.frustumCulled = false;
    scene.add(this.sky);
    scene.background = null;
    // Only the cars use an environment map here (see updateReflections): at a little over half strength, as the
    // hemisphere light already stands in for the sky's diffuse share.
    scene.environment = null;
    scene.environmentIntensity = 0.55;
    this.fog = new THREE.FogExp2(0xbfcad6, 0.0002);
    scene.fog = this.fog;
    viewer.camera.far = 32000;
    viewer.camera.near = 0.1;
    viewer.camera.updateProjectionMatrix();
    // Stars: a few thousand points on a far sphere, fading in at night under a clear sky.
    const n = 2600;
    const pos = new Float32Array(n * 3);
    const bright = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos[i * 3] = r * Math.cos(a) * 20000;
      pos[i * 3 + 1] = Math.abs(u) * 20000 - 1500;
      pos[i * 3 + 2] = r * Math.sin(a) * 20000;
      bright[i] = Math.pow(Math.random(), 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('bright', new THREE.BufferAttribute(bright, 1));
    const sm = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, sizeAttenuation: false });
    sm.colorNode = vec4(vec3(1, 1, 1), attribute('bright', 'float').mul(0.8).add(0.2).mul(this.starAlpha));
    sm.sizeNode = attribute('bright', 'float').mul(2.2).add(1.2);
    sm.fog = false;
    this.stars = new THREE.Points(sg, sm);
    this.stars.frustumCulled = false;
    scene.add(this.stars);
    const mm = new THREE.MeshBasicNodeMaterial({ color: 0xf2efe6, fog: false });
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 12), mm);
    scene.add(this.moon);
    // Overcast: a grey dome inside the sky, fading in with the cloud cover (the analytic sky stays too blue).
    const dm = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, fog: false });
    dm.colorNode = vec3(this.overcastShade, this.overcastShade.mul(1.02), this.overcastShade.mul(1.06));
    dm.opacityNode = this.overcast;
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(14000, 32, 16), dm);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1;
    scene.add(this.dome);
    // Rain: streaks in a 60 m box around the camera, animated on the GPU; snow: slower flakes that drift.
    this.rain = this.precipitation(9000, 0.02, 0.9, 24, this.rainAmount, 0x9fb0c2);
    this.snow = this.precipitation(7000, 0.07, 0.07, 1.6, this.snowAmount, 0xffffff);
    scene.add(this.rain, this.snow);
    // Headlights of the player's car (placed by setHeadlight each frame).
    this.headlight = new THREE.SpotLight(0xfff3dc, 0, 90, 0.5, 0.45, 1.2);
    this.headlight.castShadow = false;
    scene.add(this.headlight, this.headlight.target);
    const gm = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: false });
    gm.colorNode = this.envGroundCol;
    this.envGround = new THREE.Mesh(new THREE.CircleGeometry(40000, 32).rotateX(-Math.PI / 2), gm);
    this.envGround.position.y = -30;
    this.envScene.add(this.envGround);
  }

  /** Rebuilds the reflection map when the sky has changed enough (a quarter hour, a weather step). */
  private updateReflections(day: number): void {
    // Half-hour steps: at the default day speed that is one rebuild a minute, into the same small target (the car
    // paint blurs the sky anyway), so the rebuild is short and allocates nothing.
    const key = `${Math.round(this.hour * 2)}|${Math.round(this.cur.cloud * 6)}|${Math.round(this.cur.fog / 800)}`;
    const now = performance.now();
    if (key === this.envKey || now - this.envAt < 1500) return;
    this.envKey = key;
    this.envAt = now;
    const v = this.viewer;
    this.pmrem ??= new THREE.PMREMGenerator(v.renderer);
    this.envGroundCol.value.setRGB(0.03 + 0.2 * day, 0.035 + 0.21 * day, 0.03 + 0.19 * day);
    // The sky and the overcast dome visit the reflection scene (centred on its origin) and come back.
    const domePos = this.dome.position.clone();
    this.dome.position.set(0, 0, 0);
    this.envScene.add(this.sky, this.dome);
    try {
      const rt = this.pmrem.fromScene(this.envScene, 0.02, 1, 60000, { size: 128, renderTarget: this.envRT });
      if (this.envNode) this.envNode.value = rt.texture;
      else this.envNode = pmremTexture(rt.texture);
      if (this.envRT && this.envRT !== rt) this.envRT.dispose();
      this.envRT = rt;
    } catch {
      // No reflection map on this backend: the lights alone.
    }
    v.scene.add(this.sky, this.dome);
    this.dome.position.copy(domePos);
  }

  private precipitation(count: number, width: number, length: number, speed: number, amount: Node<'float'>, hex: number): THREE.Mesh {
    const box = 60;
    const base = new THREE.PlaneGeometry(width, length);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    const offs = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      offs[i * 4] = Math.random() * box;
      offs[i * 4 + 1] = Math.random() * box;
      offs[i * 4 + 2] = Math.random() * box;
      offs[i * 4 + 3] = Math.random();
    }
    g.setAttribute('offs', new THREE.InstancedBufferAttribute(offs, 4));
    g.instanceCount = count;
    const m = new THREE.MeshBasicNodeMaterial({ color: hex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const o = attribute('offs', 'vec4');
    // Each particle falls through the box and wraps; the box follows the camera (positions wrap around it).
    const fall = mod(o.y.sub(time.mul(speed).mul(o.w.mul(0.4).add(0.8))), box);
    const drift = sin(time.mul(0.9).add(o.w.mul(40))).mul(speed < 5 ? 0.8 : 0.05);
    const wind = this.windU.mul(fall.mul(-0.03));
    const local = vec3(mod(o.x.sub(cameraPosition.x).add(drift), box), fall, mod(o.z.sub(cameraPosition.z), box)).sub(box / 2);
    const world = cameraPosition.add(local).add(wind);
    // Billboard around the vertical axis toward the camera.
    const toCam = cameraPosition.sub(world);
    const side = vec3(toCam.z, 0, toCam.x.negate()).normalize();
    m.positionNode = world.add(side.mul(positionLocal.x)).add(vec3(0, positionLocal.y, 0));
    m.opacityNode = amount.mul(float(speed < 5 ? 0.9 : 0.35)).mul(fract(o.w.mul(7.3)).mul(0.5).add(0.5));
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    return mesh;
  }

  setWeather(w: Weather): void {
    this.weather = w;
  }

  /** Jumps straight to the target weather (map load, teleport). */
  settle(): void {
    Object.assign(this.cur, WEATHER[this.weather]);
    this.wetness = this.cur.wet;
    this.cover = this.cur.cover;
  }

  /** Sun direction (unit, toward the sun) for the hour, date and latitude. */
  sunDirection(out = new THREE.Vector3(), hour = this.hour): THREE.Vector3 {
    const decl = 23.44 * DEG * Math.sin((2 * Math.PI * (284 + this.day)) / 365);
    const lat = this.latitude * DEG;
    const ha = (hour - 12) * 15 * DEG;
    const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
    const el = Math.asin(sinEl);
    let az = Math.acos(Math.min(Math.max((Math.sin(decl) - sinEl * Math.sin(lat)) / (Math.cos(el) * Math.cos(lat) + 1e-9), -1), 1));
    if (ha > 0) az = 2 * Math.PI - az;
    // Azimuth from north (−z) toward east (+x).
    return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  }

  /** Places the headlight spot at the car (world position and forward direction); off by day. */
  setHeadlight(pos: THREE.Vector3 | null, forward: THREE.Vector3 | null): void {
    if (!pos || !forward) {
      this.headlight.intensity = 0;
      return;
    }
    this.headlight.position.copy(pos).addScaledVector(forward, 2.2).setY(pos.y + 0.7);
    this.headlight.target.position.copy(pos).addScaledVector(forward, 30).setY(pos.y - 1.5);
    this.headlight.intensity = 60 * Math.max(this.night, 1 - this.cur.fog / 1500 > 0 ? 0.6 : 0);
  }

  update(dt: number): void {
    this.hour = (this.hour + (dt * this.timeScale) / 3600) % 24;
    // Weather eases toward its target over about 20 s (wetness builds and dries slower).
    const target = WEATHER[this.weather];
    const k = 1 - Math.exp(-dt / 8);
    for (const key of Object.keys(target) as Array<keyof WeatherParams>) this.cur[key] += (target[key] - this.cur[key]) * k;
    this.wetness += (target.wet - this.wetness) * (1 - Math.exp(-dt / (target.wet > this.wetness ? 25 : 90)));
    this.cover += (target.cover - this.cover) * (1 - Math.exp(-dt / (target.cover > this.cover ? 60 : 180)));
    const sun = this.sunDirection();
    const moonDir = this.sunDirection(new THREE.Vector3(), (this.hour + 12.4 + ((this.day % 29.5) / 29.5) * 24) % 24);
    const elev = sun.y;
    const day = THREE.MathUtils.smoothstep(elev, -0.08, 0.12);
    this.night = 1 - THREE.MathUtils.smoothstep(elev, -0.12, 0.04);
    // Sky.
    const sky = this.sky;
    sky.sunPosition.value.copy(elev > -0.05 ? sun : moonDir.clone().multiplyScalar(0.3).setY(Math.max(moonDir.y, -0.2)));
    sky.turbidity.value = 2 + this.cur.cloud * 8;
    sky.rayleigh.value = 1.2 + (1 - day) * 1.5 - this.cur.cloud * 0.6;
    sky.mieCoefficient.value = 0.004 + this.cur.cloud * 0.01;
    sky.cloudCoverage.value = this.cur.cloud;
    sky.cloudDensity.value = 0.3 + this.cur.cloud * 0.6;
    sky.showSunDisc.value = elev > -0.02 && this.cur.cloud < 0.85 ? 1 : 0;
    // Lights: sun (or moon) and sky.
    const v = this.viewer;
    const lightDir = elev > -0.05 ? sun : moonDir;
    v.sunDirection.copy(lightDir.y > 0.05 ? lightDir : lightDir.clone().setY(0.05).normalize());
    const warm = THREE.MathUtils.smoothstep(elev, 0.0, 0.35);
    v.sun.color.setRGB(1, 0.78 + 0.2 * warm, 0.6 + 0.35 * warm);
    const moonLight = 0.18 * Math.max(moonDir.y, 0) * (1 - this.cur.cloud);
    v.sun.intensity = elev > -0.05 ? 3.2 * day * this.cur.light : moonLight;
    if (elev <= -0.05) v.sun.color.setRGB(0.62, 0.72, 1.0);
    v.hemi.intensity = 0.12 + 0.9 * day * (0.6 + 0.4 * this.cur.light);
    v.hemi.color.setRGB(0.62 + 0.2 * day, 0.7 + 0.18 * day, 0.9);
    v.hemi.groundColor.setRGB(0.12 * day + 0.02, 0.12 * day + 0.02, 0.11 * day + 0.03);
    v.renderer.toneMappingExposure = 1.0 + this.night * 0.9;
    // Fog: visibility → density (e^(−density·d) = 2 % at the visibility distance), colour from the sky.
    this.fog.density = 3.9 / Math.max(this.cur.fog, 50, this.minVisibility);
    const fogDay = new THREE.Color().setRGB(0.72 - 0.2 * this.cur.cloud, 0.78 - 0.18 * this.cur.cloud, 0.85 - 0.15 * this.cur.cloud);
    const fogNight = new THREE.Color(0x0b1018);
    this.fog.color.copy(fogNight).lerp(fogDay, day);
    if (this.cur.snow > 0.3) this.fog.color.lerp(new THREE.Color(0xdfe5ec), this.cur.snow * 0.5 * day);
    // Overcast dome: opaque grey under heavy cloud, dark at night.
    this.overcast.value = THREE.MathUtils.smoothstep(this.cur.cloud, 0.6, 1.0) * 0.92;
    this.overcastShade.value = 0.08 + 0.55 * day * (this.cur.snow > 0.3 ? 1.15 : 1) * (this.cur.rain > 0.8 ? 0.75 : 1);
    this.dome.position.copy(v.camera.position);
    this.dome.visible = this.overcast.value > 0.01;
    // Stars and moon.
    this.starAlpha.value = this.night * (1 - this.cur.cloud) * (1 - Math.min(1, 300 / Math.max(this.cur.fog, 1) * 0.2));
    this.moon.position.copy(v.camera.position).addScaledVector(moonDir, 18000);
    this.moon.visible = moonDir.y > -0.05 && this.cur.cloud < 0.9;
    this.stars.position.copy(v.camera.position);
    this.updateReflections(day);
    // Car materials (models load and reload on reset) pick up the sky reflection; a scan once a second.
    const now = performance.now();
    if (this.envNode && now - this.reflectAt > 1000) {
      this.reflectAt = now;
      v.scene.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.MeshStandardNodeMaterial | THREE.MeshStandardNodeMaterial[] | undefined;
        if (!mat || !(o as THREE.Mesh).isMesh) return;
        for (const m of Array.isArray(mat) ? mat : [mat]) {
          // Lit (standard/physical) car materials only: the unlit lamp lenses take no prefiltered map.
          if (!m.userData || !('apexRole' in m.userData) || !(m as { isMeshStandardNodeMaterial?: boolean }).isMeshStandardNodeMaterial || m.envNode === this.envNode) continue;
          m.envNode = this.envNode;
          m.needsUpdate = true;
        }
      });
    }
    // Precipitation.
    this.rainAmount.value = this.cur.rain;
    this.snowAmount.value = this.cur.snow;
    this.rain.visible = this.cur.rain > 0.01;
    this.snow.visible = this.cur.snow > 0.01;
    // Wind: slowly veering; trees and precipitation.
    this.windAngle += dt * 0.01;
    const wx = Math.cos(this.windAngle) * this.cur.wind, wz = Math.sin(this.windAngle) * this.cur.wind;
    this.windU.value.set(wx, 0, wz);
    this.uniforms.wind.value = Math.min(0.15 + this.cur.wind / 12, 1.2);
    this.uniforms.night.value = this.night;
    this.uniforms.wet.value = this.wetness;
    this.uniforms.snow.value = this.cover;
    // Physics: wet or snowy surfaces, wind (only sent when they change noticeably).
    if (this.physics) {
      const pairs: Array<[number, number]> = [];
      if (this.cover > 0.55) {
        pairs.push([MAT.asphalt, MAT.snowPacked], [MAT.asphaltOld, MAT.snowPacked], [MAT.grass, MAT.snowFresh], [MAT.dirt, MAT.snowFresh], [MAT.gravel, MAT.snowPacked], [MAT.concrete, MAT.snowPacked], [MAT.paint, MAT.snowPacked]);
      } else if (this.wetness > 0.45) {
        pairs.push([MAT.asphalt, MAT.asphaltWet], [MAT.asphaltOld, MAT.asphaltWet], [MAT.grass, MAT.grassWet], [MAT.cobble, MAT.cobbleWet], [MAT.paint, MAT.paintWet], [MAT.steel, MAT.steelWet], [MAT.dirt, MAT.mud]);
      }
      const key = pairs.map((p) => p.join('>')).join(',');
      if (key !== this.remapKey) {
        this.remapKey = key;
        this.physics.setMaterialRemap(pairs);
      }
      const w = Math.round(this.cur.wind * 2) / 2;
      if (w !== this.windSent) {
        this.windSent = w;
        this.physics.setWind(wx, 0, wz);
      }
    }
  }

  /** Surface state for the HUD: "wet", "snow" or "". */
  surfaceState(): '' | 'wet' | 'snow' {
    return this.cover > 0.55 ? 'snow' : this.wetness > 0.45 ? 'wet' : '';
  }

  dispose(): void {
    for (const o of [this.sky, this.dome, this.stars, this.moon, this.rain, this.snow, this.headlight, this.headlight.target]) o.removeFromParent();
    this.viewer.scene.fog = null;
    this.envRT?.dispose();
    this.pmrem?.dispose();
    this.viewer.scene.environmentIntensity = 1;
  }
}

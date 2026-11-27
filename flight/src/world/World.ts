import * as THREE from 'three';
import { Sky, WeatherState } from './Sky';
import { Terrain } from './Terrain';
import { Ocean } from './Ocean';
import { Clouds } from './Clouds';
import { Airport } from './Airport';
import { City } from './City';
import { Scenery } from './Scenery';
import { Weather } from './Weather';
import { settings, IS_MOBILE } from '../core/Save';
import type { QualityProfile } from '../core/Renderer';
import type { Effects } from '../combat/Effects';

export class World {
  readonly sky: Sky;
  readonly terrain = new Terrain();
  readonly ocean = new Ocean();
  readonly clouds: Clouds;
  readonly airport = new Airport();
  readonly city = new City();
  readonly scenery: Scenery;
  readonly weather = new Weather();
  wind = new THREE.Vector3();
  time = 0;

  constructor(private scene: THREE.Scene, renderer: THREE.WebGLRenderer, profile: QualityProfile) {
    this.sky = new Sky(scene, renderer);
    this.clouds = new Clouds(profile.clouds);
    this.scenery = new Scenery(profile.trees);
    this.applyQuality(profile);
    scene.add(this.terrain.group, this.ocean.mesh, this.clouds.mesh, this.airport.group, this.city.group, this.scenery.group, this.weather.rain);
  }

  applyQuality(p: QualityProfile) {
    this.terrain.setQuality(p.terrainSplit, p.terrainSplit >= 2.5 ? 128 : 256);
    this.sky.sun.shadow.mapSize.set(p.shadow, p.shadow);
    this.sky.sun.shadow.map?.dispose();
    this.sky.sun.shadow.map = null;
    this.scenery.radius = 1800 + p.trees * 0.08;
  }

  setWeather(w: WeatherState) {
    this.sky.setWeather(w);
    const dir = (w.windDir * Math.PI) / 180;
    // wind blows FROM windDir → velocity points the opposite way
    this.wind.set(-Math.sin(dir), 0, Math.cos(dir)).multiplyScalar(w.windSpeed);
  }

  /** Is a point inside a static obstacle (tower, turbine, building)? */
  obstacleHit(p: THREE.Vector3, margin = 2): string | null {
    if (this.city.hit(p, margin)) return '건물 충돌';
    for (const o of this.scenery.obstacles) {
      if (p.y > o.y0 && p.y < o.y0 + o.h && Math.hypot(p.x - o.x, p.z - o.z) < o.r * 0.35 + margin) return `${o.name} 충돌`;
    }
    return null;
  }

  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3, viewerVel: THREE.Vector3, fx: Effects) {
    this.time += dt;
    const w = this.sky.weather;
    this.sky.update(camera, focus, dt);
    const camPos = (camera as THREE.PerspectiveCamera).position;
    this.terrain.update([camPos, focus], camPos.y, IS_MOBILE ? 2.5 : 4);
    this.ocean.update(camPos, this.time, Math.min(1, w.windSpeed / 15));
    this.clouds.mesh.visible = settings.clouds;
    this.clouds.update(camPos, this.sky.sunDir, this.sky.sun.color, this.sky.horizonColor, this.sky.fog, w.cloudCover, w.overcast, this.sky.night, this.sky.lightning);
    this.airport.update(dt, camPos, this.sky.night, w.windDir, w.windSpeed);
    this.city.update(dt, this.sky.night, fx, camPos);
    this.scenery.update(dt, focus, this.sky.night, settings.trees);
    this.weather.update(dt, camPos, viewerVel, w.rain, w.storm, this.sky);
  }
}

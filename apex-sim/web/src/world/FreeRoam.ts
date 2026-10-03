// Free roam (§19 프리롬, §13 맵): an open-world or test-ground map, the car on it, the living world (time and
// weather), the minimap and world map with teleport and waypoint guidance.
//   ?freeroam=<vehicle>&map=hanbit|proving&spawn=<poi>&hour=<0-24>&weather=<clear|…>
import * as THREE from 'three/webgpu';
import { drivingShell, type AppContext, type ModeRuntime } from '../app/modes';
import type { VehiclePreset } from '../app/presets';
import { DriveSession } from '../drive/DriveSession';
import type { LatticeParams } from '../physics/sbc';
import { t, tl, type StringKey } from '../ui/i18n';
import { LoadingScreen } from '../ui/Loading';
import { effectiveQuality, settings } from '../ui/settings';
import type { MapData } from './builder';
import { Environment, WEATHERS, type Weather } from './Environment';
import { roadSpawn, spawnPose, type SpawnSpot } from './ground';
import { generateMap, MAP_STAGES as STAGES } from './loadMap';
import { MapView } from './MapView';
import { ParkedCars } from './ParkedCars';
import { Minimap, reliefImage, WorldMap } from './MapUI';
import { mapInfo } from './maps';
import { Overview3D } from './Overview3D';
import { nextManeuver, Router, type RoutePlan } from './Route';
import type { Poi } from './types';


/** Parked car stand-in (KNOWN_ISSUES: a car-sized steel lattice, not a full vehicle): 1.35 t, crushable. */
function parkedLattice(x: number, y: number, z: number, yaw: number): LatticeParams {
  return {
    center: [x, y + 0.72, z], size: [1.8, 1.3, 4.4], nodes: [3, 3, 6], totalMass: 1350, nodeRadius: 0.06, axialStiffness: 6e5,
    dampingRatio: 0.25, yieldStrain: 0.006, hardening: 0.1, breakStrain: 0, deformLimit: 0.5, material: 0,
    velocity: [0, 0, 0], yawPitchRoll: [yaw, 0, 0],
  };
}

export async function startFreeRoam(ctx: AppContext, vehicle: VehiclePreset): Promise<ModeRuntime> {
  const { physics, viewer, params, debug } = ctx;
  const info = mapInfo(params.get('map') ?? settings.get().lastMap);
  const loading = new LoadingScreen(tl(info.label), tl(info.desc));
  loading.progress(0.04, t('loadTerrain'));
  let map: MapData;
  try {
    map = await generateMap(info.id, (stage) => {
      const s = STAGES[stage];
      if (s) loading.progress(s[0], t(s[1]));
    });
  } catch (err) {
    loading.done();
    ctx.fail(`map: ${String((err as Error)?.message ?? err)}`);
    throw err;
  }
  (window.__apex as unknown as { map?: unknown }).map = { id: map.id, pois: map.pois.map((p) => p.id), size: map.size };

  // ---- world: renderer side ----
  loading.progress(0.74, t('loadScene'));
  await new Promise((r) => setTimeout(r, 0));
  const view = new MapView(map, effectiveQuality());
  viewer.scene.add(view.group);
  viewer.shadowHalf = 60;
  const env = new Environment(viewer, view.uniforms, map.sky.latitude, physics);
  const s0 = settings.get();
  env.hour = params.has('hour') ? Number(params.get('hour')) : s0.worldHour;
  const w = params.get('weather') as Weather | null;
  env.weather = w && WEATHERS.includes(w) ? w : (WEATHERS.includes(s0.worldWeather as Weather) ? (s0.worldWeather as Weather) : 'clear');
  env.timeScale = s0.worldTimeScale;
  env.settle();
  // Very low draws the map out to 1.2 km only: the fog closes in before its edge.
  const fogFor = (q: string) => (env.maxVisibility = q === 'verylow' ? 1100 : Infinity);
  fogFor(effectiveQuality());
  settings.onChange((s) => {
    view.setQuality(effectiveQuality(s));
    fogFor(effectiveQuality(s));
  });

  // ---- physics: the map world, parked cars ----
  loading.progress(0.8, t('loadPhysics'));
  const parked = (map.parked ?? []).map((p) => parkedLattice(p.x, map.terrain.heightAt(p.x, p.z), p.z, p.yaw));
  physics.loadMap(map.physics, parked);
  const parkedView = new ParkedCars(viewer.scene, parked.length);

  // ---- the car ----
  const spawnPoi = map.pois.find((p) => p.id === params.get('spawn')) ?? map.pois.find((p) => p.kind === 'spawn') ?? map.pois[0];
  const poseAt = (p: SpawnSpot, road?: number) => spawnPose(map, p, road);
  const session = new DriveSession(physics, viewer, debug, vehicle, ctx.fail, () => ctx.setPaused(!ctx.isPaused()), poseAt(spawnPoi), 'map');
  window.__apex!.drive = session;
  // The first loadScene('map') came with loadMap; restarts (reset, teleport) rebuild it from the stored map.
  const shell = drivingShell(ctx, session, tl(map.name), () => void session.restart(), false);

  // ---- map UI ----
  const relief = reliefImage(map, map.size > 5500 ? 8 : 6);
  const router = new Router(map.graph);
  let route: RoutePlan | null = null;
  let waypoint: { x: number; z: number } | null = null;
  let lastPlan = 0;
  const carPos = () => {
    const v = session.state;
    return v ? { x: v.position[0], z: v.position[2], heading: Math.atan2(v.forward[0], -v.forward[2]) } : { x: spawnPoi.x, z: spawnPoi.z, heading: 0 };
  };
  const replan = () => {
    if (!waypoint) {
      route = null;
      return;
    }
    const c = carPos();
    route = router.plan(c.x, c.z, waypoint.x, waypoint.z);
    lastPlan = performance.now();
    worldMap.update(route, waypoint);
  };
  const teleport = (x: number, z: number, yaw: number | null) => {
    // A point of interest (the world map's, the 3D overview's, the places sheet's): its spot, its road surface the
    // reference height (it was dropped, and the car put over the terrain: on the hill over a tunnel, under a slab).
    const poi = yaw === null ? undefined : map.pois.find((p) => Math.abs(p.x - x) < 0.01 && Math.abs(p.z - z) < 0.01);
    // Onto the nearest road when the spot is off it: in its right-hand lane, facing along it, on its carriageway
    // (the graph knows the road's height: a deck over the terrain, a bridge, a tunnel under the hill).
    const snap = yaw === null ? router.snap(x, z) : null;
    session.pose = poi ? poseAt(poi) : snap ? roadSpawn(map, snap) : poseAt({ x, z, yaw: yaw ?? 0 });
    closeMap();
    ctx.toast(t('teleported'));
    // Only the car moves: the old one is retired and a fresh one placed (the map is not rebuilt).
    void session.respawn(session.pose).then(() => replan());
  };
  // Scripted checks (E2E) teleport the way the world map does.
  Object.assign((window.__apex as unknown as { map: object }).map, {
    teleport,
    teleportPoi: (id: string) => {
      const p = map.pois.find((q) => q.id === id);
      if (p) teleport(p.x, p.z, p.yaw);
    },
    setWaypoint: (x: number, z: number) => {
      waypoint = { x, z };
      replan();
      return route ? route.length : 0;
    },
  });
  const worldMap = new WorldMap(map, relief, {
    teleport,
    setWaypoint: (x, z) => {
      waypoint = { x, z };
      replan();
      ctx.toast(route ? `${t('routeSet')} · ${(route.length / 1000).toFixed(1)} km` : t('routeNone'));
    },
    clearWaypoint: () => {
      waypoint = null;
      route = null;
      worldMap.update(null, null);
    },
    close: () => closeMap(),
    open3d: () => {
      closeMap();
      openOverview();
    },
  });
  let mapOpen = false;
  const openMap = () => {
    mapOpen = true;
    ctx.setPaused(true);
    worldMap.open(carPos(), route, waypoint);
  };
  const closeMap = () => {
    if (!mapOpen) return;
    mapOpen = false;
    worldMap.close();
    ctx.setPaused(false);
  };
  const minimap = new Minimap(map, relief, openMap);
  minimap.rotate = settings.get().minimapRotate;
  settings.onChange((s) => (minimap.rotate = s.minimapRotate));
  document.body.append(minimap.root);
  const guide = document.createElement('div');
  guide.className = 'route-guide';
  guide.hidden = true;
  document.body.append(guide);
  // ---- 3D overview of the live world ----
  const overview = new Overview3D(viewer, map, view, env, {
    car: () => {
      const v = session.state;
      const c = carPos();
      return { x: c.x, y: v ? v.position[1] : map.terrain.heightAt(c.x, c.z), z: c.z, heading: c.heading };
    },
    route: () => route,
    waypoint: () => waypoint,
    teleport,
    setWaypoint: (x, z) => {
      waypoint = { x, z };
      replan();
      ctx.toast(route ? `${t('routeSet')} · ${(route.length / 1000).toFixed(1)} km` : t('routeNone'));
    },
    closed: () => {
      session.holdCamera = false;
      ctx.setPaused(false);
    },
  });
  const openOverview = () => {
    if (overview.isOpen) return;
    session.holdCamera = true;
    ctx.setPaused(true);
    overview.open();
  };
  shell.addAction('map', t('actMap'), openMap);
  shell.addAction('orbit', t('map3d'), openOverview);
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || shell.menuOpen) return;
    if (overview.isOpen) {
      if (e.key === 'Escape' || e.key === 'o' || e.key === 'O') overview.close();
      return;
    }
    if ((e.key === 'm' || e.key === 'M') && !mapOpen) openMap();
    else if ((e.key === 'o' || e.key === 'O') && !mapOpen) openOverview();
  });

  // ---- sheet: time and weather, places ----
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...kids: (Node | string)[]) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    e.append(...kids);
    return e;
  };
  const hourLabel = el('span', 'mono');
  const hour = el('input') as HTMLInputElement;
  hour.type = 'range';
  hour.min = '0';
  hour.max = '24';
  hour.step = '0.25';
  hour.value = String(env.hour);
  hour.oninput = () => {
    env.hour = Number(hour.value) % 24;
    settings.set({ worldHour: env.hour });
  };
  // Times of day at a tap: morning, noon, the golden hour, night.
  const presets: Array<[number, string]> = [[7.5, t('timeMorning')], [13, t('timeNoon')], [18.6, t('timeGolden')], [21.5, t('timeNight')]];
  const presetChips = el('div', 'chips', ...presets.map(([h, label]) => {
    const b = el('button', 'chip', label);
    b.onclick = () => {
      env.hour = h;
      hour.value = String(h);
      hour.dispatchEvent(new Event('input'));
    };
    return b;
  }));
  const speeds: Array<[number, string]> = [[0, t('timeStop')], [1, '1×'], [30, '30×'], [120, '120×']];
  const speedChips = el('div', 'chips', ...speeds.map(([v, label]) => {
    const b = el('button', env.timeScale === v ? 'chip active' : 'chip', label);
    b.onclick = () => {
      env.timeScale = v;
      settings.set({ worldTimeScale: v });
      speedChips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      b.classList.add('active');
    };
    return b;
  }));
  const weatherChips = el('div', 'chips', ...WEATHERS.map((wx) => {
    const b = el('button', env.weather === wx ? 'chip active' : 'chip', t(`weather_${wx}` as StringKey));
    b.onclick = () => {
      env.setWeather(wx);
      settings.set({ worldWeather: wx });
      weatherChips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      b.classList.add('active');
    };
    return b;
  }));
  shell.sheet.section(t('sheetWorld'), el('label', 'field', el('span', '', t('timeOfDay')), hourLabel), hour, presetChips, speedChips, el('label', 'field', el('span', '', t('weather'))), weatherChips);
  const places = el('div', 'grid2', ...map.pois.map((p: Poi) => {
    const b = el('button', 'tile', el('b', '', tl(p.label)), el('small', '', t(`poi_${p.kind}` as StringKey)));
    b.onclick = () => teleport(p.x, p.z, p.yaw);
    return b;
  }));
  shell.sheet.section(t('sheetPlaces'), el('div', 'row', (() => {
    const b = el('button', 'primary', t('actMap'));
    b.onclick = openMap;
    return b;
  })()), places);

  // ---- start: shaders compile while the loading screen is up ----
  loading.progress(0.86, t('loadShaders'));
  try {
    viewer.camera.position.set(spawnPoi.x - 8, map.terrain.heightAt(spawnPoi.x, spawnPoi.z) + 4, spawnPoi.z - 8);
    viewer.controls.target.set(spawnPoi.x, map.terrain.heightAt(spawnPoi.x, spawnPoi.z) + 1, spawnPoi.z);
    view.update(viewer.camera, 0);
    env.update(0);
    await viewer.renderer.compileAsync(viewer.scene, viewer.camera);
  } catch {
    // Some backends lack compileAsync: shaders compile on the first frames instead.
  }
  loading.progress(0.94, t('loadingVehicle'));
  await session.start();
  loading.progress(1, '');
  loading.done();

  // The destination in the world: a pin standing over it with the distance left, as a satnav draws it.
  const pinDist = el('b', 'mono');
  const pin = el('div', 'wp-pin', el('div', 'wp-in', pinDist, el('i')));
  pin.hidden = true;
  document.body.append(pin);
  const pinAt = new THREE.Vector3();
  const placePin = (cx: number, cz: number) => {
    if (!waypoint || mapOpen || overview.isOpen) {
      pin.hidden = true;
      return;
    }
    pinAt.set(waypoint.x, map.terrain.heightAt(waypoint.x, waypoint.z) + 5, waypoint.z).project(viewer.camera);
    const on = pinAt.z < 1 && Math.abs(pinAt.x) < 1.05 && Math.abs(pinAt.y) < 1.05;
    pin.hidden = !on;
    if (!on) return;
    const rect = viewer.renderer.domElement.getBoundingClientRect();
    const px = rect.left + (pinAt.x * 0.5 + 0.5) * rect.width;
    let py = rect.top + (0.5 - pinAt.y * 0.5) * rect.height;
    // A far destination sits on the horizon, under the turn guide: the pin stays just below it there.
    const pinH = (pin.firstElementChild as HTMLElement).offsetHeight;
    if (!guide.hidden) {
      const g = guide.getBoundingClientRect();
      if (px > g.left - 40 && px < g.right + 40) py = Math.max(py, g.bottom + 6 + pinH);
    }
    pin.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
    const d = Math.hypot(waypoint.x - cx, waypoint.z - cz);
    pinDist.textContent = d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;
  };

  const fwd = new THREE.Vector3(), pos = new THREE.Vector3();
  let clock = 0;
  return {
    drive: session,
    update(dt, frame) {
      session.update(dt, frame);
      overview.update();
      parkedView.update(frame);
      env.update(dt);
      view.update(viewer.camera, dt);
      hourLabel.textContent = `${String(Math.floor(env.hour)).padStart(2, '0')}:${String(Math.floor((env.hour % 1) * 60)).padStart(2, '0')}`;
      if (document.activeElement !== hour) hour.value = String(env.hour);
      const v = session.state;
      if (v) {
        pos.set(v.position[0], v.position[1], v.position[2]);
        fwd.set(v.forward[0], v.forward[1], v.forward[2]);
        env.setHeadlight(pos, fwd);
        const c = carPos();
        clock += dt;
        if (clock > 1 / 20) {
          clock = 0;
          minimap.draw(c.x, c.z, c.heading, Math.abs(v.speed), route, waypoint);
        }
        // Fell off the world: back to the last spawn.
        if (v.position[1] < -120) void session.restart();
        if (route && waypoint) {
          const m = nextManeuver(route, c.x, c.z);
          if (m.remaining < 25) {
            ctx.toast(t('routeArrived'), 'ok');
            waypoint = null;
            route = null;
            guide.hidden = true;
          } else {
            if (m.offRoute > 45 && performance.now() - lastPlan > 2500) replan();
            guide.hidden = false;
            const dist = m.distance < 1000 ? `${Math.round(m.distance / 10) * 10} m` : `${(m.distance / 1000).toFixed(1)} km`;
            guide.innerHTML = `<i class="rg-${m.turn}"></i><div><b>${dist}</b><span>${t(`turn_${m.turn}` as StringKey)}</span></div><small>${(m.remaining / 1000).toFixed(1)} km</small>`;
          }
        } else {
          guide.hidden = true;
        }
        placePin(c.x, c.z);
      }
    },
  };
}

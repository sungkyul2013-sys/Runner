// APEX_SIM web client (§18.3 screens): the main menu, then one mode per page load.
//   /                 main menu (title, showroom, mode cards)
//   /?freeroam=<id>   free roam on the open-world map (§13)
//   /?drive=<id>      test ground (drive scene): &at=x,z &yaw=deg &kmh= start pose
//   /?crash=<id>      crash lab: &preset= | &kind=fullWall|offsetWall|carToCar|pole|rollover|drop &kmh= &b=<id> &kmhb=
//                     &angle= &offset= &overlap= ; &go=1 launches at once
//   /?scene=<id>      sandbox (physics scenes, spawns, a car to drive, grab / crane)
//   /?view=garage     garage
//   /?bench=1         automated benchmark (§2.5): pile of cubes, frame/physics timing JSON
//   /?golden=1        determinism self-check: golden_m0 in the browser worker against the native hashes
import './ui/styles.css';
import './ui/app.css';
import * as THREE from 'three/webgpu';
import goldenText from '../../core/tests/golden/golden_m0.txt?raw';
import { DRIVE_VEHICLES } from './app/presets';
import { openSettingsOverlay, startCrashLab, startGarage, startSandbox, startTestGround, type AppContext, type ModeRuntime, type Route } from './app/modes';
import type { CrashLab } from './crash/CrashLab';
import type { DriveSession } from './drive/DriveSession';
import { PhysicsClient } from './physics/PhysicsClient';
import { DebugBodies } from './render/DebugBodies';
import { GridGround } from './render/GridGround';
import { StaticGeometry } from './render/StaticGeometry';
import { Viewer } from './render/Viewer';
import type { TetherTool } from './tools/TetherTool';
import { Hud } from './ui/Hud';
import { t } from './ui/i18n';
import { MainMenu, type AppMode } from './ui/MainMenu';
import { openMapSelect, type MapChoice } from './ui/MapSelect';
import { MAPS } from './world/maps';
import { applyDocumentSettings, effectiveQuality, settings } from './ui/settings';
import { startFreeRoam } from './world/FreeRoam';

declare global {
  interface Window {
    __apex?: { bench?: unknown; golden?: unknown; garage?: unknown; drive?: DriveSession | null; crash?: CrashLab; tools?: TetherTool; viewer?: Viewer; ready?: boolean; errors: string[]; route?: Route; map?: unknown };
  }
}
window.__apex = { errors: [] };

const params = new URLSearchParams(location.search);
// Artifact build (VITE_APEX_ARTIFACT=1): the host passes no query string, only a bare #token — #menu (default),
// #freeroam.<vehicle>, #drive.<vehicle>, #crash[.<vehicle>], #sandbox or #garage — so modes switch by hash + reload.
const HASH_ROUTES = import.meta.env.VITE_APEX_ARTIFACT === '1';
if (HASH_ROUTES) {
  const [route, arg, mapId, spawn] = (location.hash.slice(1) || 'menu').split('.');
  const car = arg || 'porsche_911_turbo_991';
  if (route === 'drive' || route === 'freeroam' || route === 'crash') params.set(route, car);
  if (route === 'freeroam' && mapId) params.set('map', mapId);
  if (route === 'freeroam' && spawn) params.set('spawn', spawn);
  else if (route === 'garage') params.set('view', 'garage');
  else if (route === 'sandbox') params.set('scene', arg || 'sandbox');
}

function routeOf(p: URLSearchParams): Route {
  if (p.has('golden')) return 'golden';
  if (p.has('bench')) return 'bench';
  if (p.has('freeroam')) return 'freeroam';
  if (p.has('drive')) return 'drive';
  if (p.has('crash')) return 'crash';
  if (p.get('view') === 'garage') return 'garage';
  if (p.has('scene')) return 'sandbox';
  return 'menu';
}

/** Reloads the page in another mode (query string, or hash route in the Artifact build). Keeps the backend choice. */
function go(route: Route, vehicle = 'porsche_911_turbo_991', extra: Record<string, string> = {}): void {
  if (route !== 'menu') settings.set({ lastMode: route });
  const next = new URLSearchParams();
  for (const keep of ['backend', 'lang']) if (params.has(keep)) next.set(keep, params.get(keep)!);
  if (route === 'freeroam' || route === 'drive' || route === 'crash') next.set(route, vehicle);
  else if (route === 'garage') next.set('view', 'garage');
  else if (route === 'sandbox') next.set('scene', 'sandbox');
  for (const [k, v] of Object.entries(extra)) next.set(k, v);
  if (!HASH_ROUTES) {
    location.search = next.toString();
    return;
  }
  location.hash = route === 'menu' ? 'menu' : route === 'sandbox' || route === 'garage' ? route : route === 'freeroam' ? ['freeroam', vehicle, extra.map ?? '', extra.spawn ?? ''].join('.') : `${route}.${vehicle}`;
  location.reload();
}

// Threaded module (SharedArrayBuffer, cross-origin isolated pages) and the single-thread fallback (KNOWN_ISSUES W8).
const WASM_URL = new URL('wasm/sbc.mjs', document.baseURI).href;
const WASM_ST_URL = new URL('wasm/sbc-st.mjs', document.baseURI).href;

function toast(text: string, kind: '' | 'error' | 'ok' = ''): void {
  let box = document.querySelector<HTMLElement>('.toasts');
  if (!box) {
    box = Object.assign(document.createElement('div'), { className: 'toasts' });
    document.body.append(box);
  }
  const item = Object.assign(document.createElement('div'), { className: `toast ${kind}`, textContent: text });
  box.append(item);
  setTimeout(() => item.remove(), kind === 'error' ? 12000 : 6000);
}

function fail(message: string): void {
  window.__apex!.errors.push(message);
  console.error(message);
  toast(message, 'error');
}

async function main(): Promise<void> {
  const route = routeOf(params);
  window.__apex!.route = route;
  applyDocumentSettings(settings.get());
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  // The Artifact build renders through WebGL2: an embedded frame may not get a WebGPU adapter, and a lost device
  // could not switch backends there (no query string to carry the choice).
  const viewer = new Viewer(canvas, HASH_ROUTES || params.get('backend') === 'webgl2', route === 'freeroam');
  window.__apex!.viewer = viewer; // scripted checks place the camera
  await viewer.init((message) => {
    // A lost WebGPU device cannot be recovered on the same canvas: reload once on the WebGL2 backend.
    fail(`WebGPU device lost (${message}) — switching to WebGL2`);
    if (params.get('backend') !== 'webgl2') {
      params.set('backend', 'webgl2');
      setTimeout(() => (HASH_ROUTES ? location.reload() : location.replace(`${location.pathname}?${params}`)), 1500);
    }
  });
  viewer.setQuality(effectiveQuality());
  let lang = settings.get().lang;
  settings.onChange((s) => {
    applyDocumentSettings(s);
    viewer.setQuality(effectiveQuality(s));
    if (s.lang !== lang) {
      lang = s.lang;
      location.reload(); // every label is built once: a new language is a fresh page
    }
  });

  // Leave one core for the main thread and one for the browser; cap at 8 (A§12). Without cross-origin isolation the
  // physics runs single-threaded and frames travel by message.
  const threads = Math.max(1, Math.min((navigator.hardwareConcurrency || 4) - 2, 8));
  const shared = PhysicsClient.isSupported();
  const physics = new PhysicsClient(shared ? WASM_URL : WASM_ST_URL, threads, shared ? 'shared' : 'message');
  physics.onError(fail);
  if (!shared && route !== 'menu') toast(t('singleThread'));
  const grid = new GridGround(viewer.scene);
  if (params.get('labels') === '0' || params.has('cam')) grid.labelsVisible = false;
  const statics = new StaticGeometry(viewer.scene);
  const debug = new DebugBodies(viewer.scene, physics.topology);
  physics.onTopology(() => {
    debug.topologyChanged();
    statics.set(physics.staticTriangles, physics.renderOrigin, physics.staticMaterials);
  });
  physics.onStability((s) => {
    if (s.beamViolations + s.nodeViolations > 0) {
      toast(`${t('stabilityWarn')}: ${s.label} — dt_crit ${s.minCriticalDtMs.toFixed(3)} ms (beams ${s.beamViolations}, nodes ${s.nodeViolations})`);
    }
  });
  await physics.ready();

  // Engineer stats (§18.4 엔지니어 HUD): hidden unless the preset or a toggle asks for them.
  const hud = new Hud();
  hud.root.classList.add('stats-panel');
  document.body.append(hud.root);
  let statsOn = route === 'bench' || route === 'golden';
  hud.root.hidden = !statsOn;
  let paused = false;
  const ctx: AppContext = {
    physics,
    viewer,
    debug,
    params,
    fail,
    toast,
    go,
    setPaused: (p) => {
      paused = p;
      physics.setPaused(p);
    },
    isPaused: () => paused,
    setStatsVisible: (on) => {
      statsOn = on;
      hud.root.hidden = !on;
    },
    statsVisible: () => statsOn,
  };
  const vehicleOf = (key: string) => DRIVE_VEHICLES.find((v) => v.id === params.get(key)) ?? DRIVE_VEHICLES[0];

  let mode: ModeRuntime | null = null;
  let menu: MainMenu | null = null;
  if (route === 'menu') {
    grid.visible = false;
    const choices: MapChoice[] = [
      ...MAPS.map((m) => ({ id: m.id, label: m.label, desc: m.desc, areaKm2: m.areaKm2, kind: m.kind, spawns: m.spawns })),
      { id: 'grid', label: { ko: '무한 그리드 주행장', en: 'Infinite grid ground' }, desc: { ko: '§13.3-6 튜닝·디버그용 평지: 방지턱, 점프대, 스파이크, 슬라럼', en: '§13.3-6 flat tuning ground: bumps, jump, spikes, slalom' }, areaKm2: 0, kind: 'grid' as const, spawns: [{ id: 'start', label: { ko: '출발점', en: 'Start' } }] },
    ];
    menu = new MainMenu(viewer, {
      start: (m: AppMode, vehicle: string) => {
        if (m !== 'freeroam' && m !== 'drive') return go(m, vehicle);
        const stage = menu!.openMaps((id) => choices.flatMap((c) => c.spawns).find((sp) => sp.id === id)?.label ?? { ko: id, en: id });
        openMapSelect(
          choices,
          m === 'drive' ? 'proving' : settings.get().lastMap,
          (mapId, spawn) => (mapId === 'grid' ? go('drive', vehicle) : go('freeroam', vehicle, { map: mapId, spawn })),
          stage,
          () => menu?.closeMaps(),
        );
      },
      settings: () => openSettingsOverlay(),
    });
  } else if (route === 'freeroam') {
    grid.visible = false;
    mode = await startFreeRoam(ctx, vehicleOf('freeroam'));
  } else if (route === 'drive') {
    mode = await startTestGround(ctx, vehicleOf('drive'));
  } else if (route === 'crash') {
    mode = startCrashLab(ctx, vehicleOf('crash'));
  } else if (route === 'sandbox') {
    mode = startSandbox(ctx, vehicleOf('car'));
  } else if (route === 'garage') {
    mode = await startGarage(ctx);
  } else {
    if (route === 'golden') ctx.setPaused(true); // must not advance before the hash comparison starts
    physics.loadScene(route === 'bench' ? 'pile' : 'golden_m0', route === 'bench' ? 16 : undefined);
  }

  // ---- frame loop ----
  let last = performance.now();
  let frameMs = 16.7;
  const frameTimes: number[] = [];
  const physicsSamples: { stepMs: number; rtf: number }[] = [];
  viewer.renderer.setAnimationLoop(() => {
    const now = performance.now();
    const frameStart = last;
    const dt = Math.min((now - last) / 1000, 0.1);
    frameMs = frameMs * 0.9 + (now - last) * 0.1;
    if (route === 'bench') frameTimes.push(now - last);
    last = now;
    viewer.update(dt);
    grid.update(viewer.controls.target);
    const frame = physics.update(now);
    mode?.update(dt, frame);
    menu?.update(Math.min((now - frameStart) / 1000, 0.5)); // menu animations finish even on very slow frames
    if (mode?.crash) mode.tools?.update(frame);
    debug.update(frame);
    viewer.render();
    const stats = physics.latestStats();
    if (route === 'bench' && stats && !stats.paused) physicsSamples.push({ stepMs: stats.stepMs, rtf: stats.rtf });
    if (statsOn) hud.update(stats, { frameMs, drawCalls: viewer.drawCalls(), backend: viewer.backend, threads: physics.threads });
  });
  window.__apex!.ready = true;

  if (route === 'golden') await runGolden(physics);
  if (route === 'bench') await runBench(physics, viewer, frameTimes, physicsSamples);
}

async function runGolden(physics: PhysicsClient): Promise<void> {
  const expected = goldenText
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => l.trim().split(/\s+/));
  // Wait for the scene to be loaded (first frame published).
  while (!physics.latestStats() || physics.latestStats()!.stepIndex !== 0) await new Promise((r) => setTimeout(r, 50));
  const results: { step: number; expected: string; actual: string }[] = [];
  let at = 0;
  for (const [stepText, hex] of expected) {
    const step = Number(stepText);
    await physics.step(step - at);
    at = step;
    const h = await physics.hash();
    results.push({ step, expected: hex, actual: h.hex });
  }
  const pass = results.every((r) => r.expected === r.actual);
  window.__apex!.golden = { pass, threads: physics.threads, results };
  toast(pass ? `golden_m0: 브라우저 WASM = 네이티브 해시 일치 (${results.length}/${results.length})` : 'golden_m0: 해시 불일치!', pass ? 'ok' : 'error');
}

async function runBench(
  physics: PhysicsClient,
  viewer: Viewer,
  frameTimes: number[],
  physicsSamples: { stepMs: number; rtf: number }[],
): Promise<void> {
  const warmup = Number(params.get('warmup') ?? 3) * 1000;
  const duration = Number(params.get('seconds') ?? 15) * 1000;
  viewer.focus(new THREE.Vector3(0, 1, 0), 14);
  await new Promise((r) => setTimeout(r, warmup));
  frameTimes.length = 0;
  physicsSamples.length = 0;
  await new Promise((r) => setTimeout(r, duration));
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
  const stats = physics.latestStats();
  const adapter = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ info?: Record<string, string> } | null> } }).gpu;
  const info = adapter ? (await adapter.requestAdapter())?.info : undefined;
  const result = {
    milestone: 'M2', // the build's milestone (docs/reports/); the scene is the M0 pile
    date: new Date().toISOString(),
    scene: 'pile',
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    backend: viewer.backend,
    gpu: info ? `${info.vendor ?? ''} ${info.architecture ?? ''} ${info.description ?? ''}`.trim() : 'n/a',
    physicsThreads: physics.threads,
    bodies: stats?.bodies,
    nodes: stats?.nodes,
    beams: stats?.beams,
    frames: frameTimes.length,
    fps: 1000 / mean(frameTimes),
    frameMs: { mean: mean(frameTimes), p50: pct(0.5), p95: pct(0.95), p99: pct(0.99) },
    physicsStepMs: { mean: mean(physicsSamples.map((s) => s.stepMs)), budget: 0.5 },
    rtf: { mean: mean(physicsSamples.map((s) => s.rtf)), min: Math.min(...physicsSamples.map((s) => s.rtf)) },
    wasmMemoryMB: stats?.wasmMemoryMB,
    jsHeapMB: ((performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 2 ** 20,
  };
  window.__apex!.bench = result;
  const json = JSON.stringify(result, null, 2);
  const card = Object.assign(document.createElement('div'), { className: 'card' });
  const pre = Object.assign(document.createElement('pre'), { textContent: json });
  const download = Object.assign(document.createElement('button'), { className: 'primary', textContent: 'JSON 저장' });
  download.onclick = () => {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: `apex-bench-M0-${Date.now()}.json` });
    a.click();
  };
  card.append(Object.assign(document.createElement('b'), { textContent: 'APEX_SIM 벤치마크 (M0)' }), pre, download);
  const overlay = Object.assign(document.createElement('div'), { className: 'overlay' });
  overlay.append(card);
  document.body.append(overlay);
}

main().catch((err) => fail(String((err as Error)?.stack ?? err)));

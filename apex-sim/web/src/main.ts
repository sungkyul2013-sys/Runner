// APEX_SIM web client — M0 sandbox bootstrap.
//   /             interactive sandbox
//   /?bench=1     automated benchmark (§2.5): pile of cubes, frame/physics timing JSON
//   /?golden=1    determinism self-check: runs golden_m0 in the browser worker and compares with the native hashes
//   /?drive=<id>  driving (see below)
//   /?crash=<id>  crash lab: &kind=fullWall|offsetWall|carToCar &kmh= &b=<id> &kmhb= &angle= &offset= &overlap=
//                 &go=1 launches at once
import './ui/styles.css';
import * as THREE from 'three/webgpu';
import goldenText from '../../core/tests/golden/golden_m0.txt?raw';
import { DRIVE_VEHICLES, resolveSpawn, SCENES, SPAWNS } from './app/presets';
import { CrashLab } from './crash/CrashLab';
import { CrashPanel } from './crash/CrashPanel';
import type { CrashKind, CrashSpec } from './crash/scenario';
import { DriveSession } from './drive/DriveSession';
import { PhysicsClient } from './physics/PhysicsClient';
import { DebugBodies } from './render/DebugBodies';
import { GridGround } from './render/GridGround';
import { StaticGeometry } from './render/StaticGeometry';
import { Viewer } from './render/Viewer';
import { tetherControls, TetherTool } from './tools/TetherTool';
import { Hud } from './ui/Hud';
import { t, tl } from './ui/i18n';
import { SandboxPanel, TIME_SCALES } from './ui/SandboxPanel';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadVehicleModel, VEHICLES } from './vehicles/VehicleModel';

declare global {
  interface Window {
    __apex?: { bench?: unknown; golden?: unknown; garage?: unknown; drive?: DriveSession; crash?: CrashLab; tools?: TetherTool; ready?: boolean; errors: string[] };
  }
}
window.__apex = { errors: [] };

const params = new URLSearchParams(location.search);
// Artifact build (VITE_APEX_ARTIFACT=1): the host passes no query string, only a bare #token — #drive (default,
// #drive.<vehicle id> for another car), #crash[.<vehicle id>], #garage or #sandbox — so modes switch by hash + reload.
const HASH_ROUTES = import.meta.env.VITE_APEX_ARTIFACT === '1';
if (HASH_ROUTES) {
  const [route, arg] = (location.hash.slice(1) || 'drive').split('.');
  if (route === 'drive') params.set('drive', arg || 'porsche_911_turbo_991');
  else if (route === 'crash') params.set('crash', arg || 'porsche_911_turbo_991');
  else if (route === 'garage') params.set('view', 'garage');
}
/** Reloads the page in the mode `next` describes (query string, or hash route in the Artifact build). */
function navigate(next: URLSearchParams): void {
  if (!HASH_ROUTES) {
    location.search = next.toString();
    return;
  }
  location.hash = next.has('drive') ? `drive.${next.get('drive')}` : next.has('crash') ? `crash.${next.get('crash')}` : next.get('view') === 'garage' ? 'garage' : 'sandbox';
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
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  // The Artifact build renders through WebGL2: an embedded frame may not get a WebGPU adapter, and a lost device
  // could not switch backends there (no query string to carry the choice).
  const viewer = new Viewer(canvas, HASH_ROUTES || params.get('backend') === 'webgl2');
  await viewer.init((message) => {
    // A lost WebGPU device cannot be recovered on the same canvas: reload once on the WebGL2 backend.
    fail(`WebGPU device lost (${message}) — switching to WebGL2`);
    if (params.get('backend') !== 'webgl2') {
      params.set('backend', 'webgl2');
      setTimeout(() => (HASH_ROUTES ? location.reload() : location.replace(`${location.pathname}?${params}`)), 1500);
    }
  });

  // Leave one core for the main thread and one for the browser; cap at 8 (A§12). Without cross-origin isolation the
  // physics runs single-threaded and frames travel by message.
  const threads = Math.max(1, Math.min((navigator.hardwareConcurrency || 4) - 2, 8));
  const shared = PhysicsClient.isSupported();
  const physics = new PhysicsClient(shared ? WASM_URL : WASM_ST_URL, threads, shared ? 'shared' : 'message');
  physics.onError(fail);
  if (!shared) toast(t('singleThread'));
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

  let paused = false;
  let timeScaleIndex = 0;
  const setPaused = (p: boolean) => {
    paused = p;
    physics.setPaused(p);
    panel.setPaused(p);
  };
  const loadScene = (id: string, bodies?: number) => {
    physics.loadScene(id, bodies);
    panel.setScene(id);
  };
  const target = (): [number, number, number] => [viewer.controls.target.x, 0, viewer.controls.target.z];
  const panel = new SandboxPanel({
    loadScene,
    spawn: (p) => physics.spawnLattice(resolveSpawn(p, target()), tl(p.label)),
    togglePause: () => setPaused(!paused),
    step: (n) => {
      setPaused(true);
      void physics.step(n);
    },
    setTimeScale: (s) => {
      timeScaleIndex = TIME_SCALES.indexOf(s as (typeof TIME_SCALES)[number]);
      physics.setTimeScale(s);
    },
    setShowNodes: (on) => (debug.showNodes = on),
    setShowBeams: (on) => (debug.showBeams = on),
    drive: (id) => {
      params.delete('scene');
      params.delete('view');
      params.set('drive', id);
      navigate(params);
    },
    crash: (id) => {
      params.delete('scene');
      params.delete('view');
      params.set('crash', id);
      navigate(params);
    },
  });
  const hud = new Hud();
  const hint = Object.assign(document.createElement('div'), { className: 'hint' });
  hint.append(Object.assign(document.createElement('span'), { textContent: t('hintOrbit') }), Object.assign(document.createElement('span'), { textContent: t('hintTime') }));
  document.body.append(panel.root, hud.root, hint);

  // ---- driving (?drive=<vehicle id>) ----
  const driveVehicle = params.has('drive') ? DRIVE_VEHICLES.find((v) => v.id === params.get('drive')) ?? DRIVE_VEHICLES[0] : null;
  // Optional start pose: &at=<x>,<z> [m] &yaw=<deg> &kmh=<forward speed> (a run-up into the end wall at z = 300 m).
  const at = (params.get('at') ?? '0,0').split(',').map(Number);
  const pose = {
    position: [at[0] || 0, 0, at[1] || 0] as [number, number, number],
    yaw: (Number(params.get('yaw')) || 0) * (Math.PI / 180),
    speed: (Number(params.get('kmh')) || 0) / 3.6,
  };
  const drive = driveVehicle ? new DriveSession(physics, viewer, debug, driveVehicle, fail, () => setPaused(!paused), pose) : null;
  if (drive) {
    window.__apex!.drive = drive;
    panel.root.hidden = true;
    hint.hidden = true;
    const bar = Object.assign(document.createElement('div'), { className: 'drivebar' });
    const title = Object.assign(document.createElement('b'), { textContent: 'APEX_SIM' });
    const name = Object.assign(document.createElement('span'), { textContent: tl(drive.vehicle.label) });
    const restart = Object.assign(document.createElement('button'), { textContent: t('restart') });
    restart.onclick = () => void drive.restart();
    const back = Object.assign(document.createElement('button'), { textContent: t('backToSandbox') });
    back.onclick = () => {
      params.delete('drive');
      navigate(params);
    };
    bar.append(title, name, restart, back);
    document.body.append(bar, drive.dashboard.root);
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyH' || e.repeat) return;
      const hide = !hud.root.hidden;
      hud.root.hidden = hide;
      bar.hidden = hide;
    });
  }

  // ---- crash lab (?crash=<vehicle id>) ----
  const crashVehicle = !drive && params.has('crash') ? DRIVE_VEHICLES.find((v) => v.id === params.get('crash')) ?? DRIVE_VEHICLES[0] : null;
  const crash = crashVehicle ? new CrashLab(physics, viewer, debug, fail) : null;
  let crashLaunch: (() => void) | null = null;
  if (crash && crashVehicle) {
    window.__apex!.crash = crash;
    panel.root.hidden = true;
    hint.hidden = true;
    const num = (key: string) => (params.has(key) ? Number(params.get(key)) : undefined);
    const initial: Partial<CrashSpec> = {};
    const kind = params.get('kind');
    if (kind === 'fullWall' || kind === 'offsetWall' || kind === 'carToCar') initial.kind = kind as CrashKind;
    for (const [key, field] of [['kmh', 'speedA'], ['kmhb', 'speedB'], ['angle', 'angle'], ['offset', 'offset']] as const) {
      const v = num(key);
      if (v !== undefined && Number.isFinite(v)) initial[field] = v;
    }
    const overlap = num('overlap');
    if (overlap !== undefined && overlap > 0 && overlap <= 1) initial.overlap = overlap;
    const vehicleB = DRIVE_VEHICLES.find((v) => v.id === params.get('b')) ?? crashVehicle;
    const crashPanel = new CrashPanel(
      {
        launch: (spec, a, b) => {
          setPaused(false);
          void crash.launch(spec, a, b);
        },
        setTimeScale: (s) => physics.setTimeScale(s),
        setXray: (on) => crash.setXray(on),
        setFollow: (on) => (crash.follow = on),
        back: () => {
          params.delete('crash');
          navigate(params);
        },
      },
      initial,
      [crash.energyGraph.root, crash.momentumGraph.root],
      crashVehicle.id,
      vehicleB.id,
    );
    crash.onLog = (rows) => crashPanel.setLog(rows);
    crashLaunch = () => crashPanel.launch();
    document.body.append(crashPanel.root, crashPanel.graphs);
  }

  // §20 tools: node grab and crane / winch (sandbox and crash lab).
  const tools = drive ? null : new TetherTool(physics, viewer, canvas);
  if (tools) {
    window.__apex!.tools = tools;
    const section = tetherControls(tools);
    (crash ? document.querySelector('.crashpanel') : panel.root)?.append(section);
  }

  window.addEventListener('keydown', (e) => {
    if (drive) return; // the keys belong to the car (DriveInput)
    if (crash) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); setPaused(!paused); }
      else if (e.key === 'r' || e.key === 'R') crashLaunch?.();
      else if (e.key === 'h' || e.key === 'H') for (const n of document.querySelectorAll<HTMLElement>('.crashpanel, .graphs, .hud')) n.hidden = !n.hidden;
      return;
    }
    if (e.target instanceof HTMLSelectElement || e.repeat && e.code === 'Space') return;
    const preset = SPAWNS.find((p) => p.key === e.key);
    if (preset) physics.spawnLattice(resolveSpawn(preset, target()), tl(preset.label));
    else if (e.code === 'Space') { e.preventDefault(); setPaused(!paused); }
    else if (e.key === '.') { setPaused(true); void physics.step(1); }
    else if (e.key === ',') { setPaused(true); void physics.step(100); }
    else if (e.key === 'r' || e.key === 'R') loadScene((document.querySelector('.panel select') as HTMLSelectElement).value);
    else if (e.key === '[' || e.key === ']') {
      timeScaleIndex = Math.min(Math.max(timeScaleIndex + (e.key === '[' ? 1 : -1), 0), TIME_SCALES.length - 1);
      physics.setTimeScale(TIME_SCALES[timeScaleIndex]);
      panel.setTimeScale(TIME_SCALES[timeScaleIndex]);
    } else if (e.key === 'f' || e.key === 'F') {
      const frame = physics.update(performance.now());
      if (frame && frame.bodyCount > 0) {
        const b = frame.bodyCount - 1, s = frame.nodeOffset[b], n = frame.nodeCount[b];
        const c = new THREE.Vector3();
        for (let i = s; i < s + n; i++) c.add(new THREE.Vector3(frame.positions[i * 3], frame.positions[i * 3 + 1], frame.positions[i * 3 + 2]));
        viewer.focus(c.divideScalar(n));
      }
    }
  });

  const mode = params.has('golden') ? 'golden' : params.has('bench') ? 'bench' : params.get('view') === 'garage' ? 'garage' : 'sandbox';
  const initialScene = mode === 'bench' ? 'pile' : mode === 'golden' ? 'golden_m0' : params.get('scene') ?? 'sandbox';
  const sceneInfo = SCENES.find((s) => s.id === initialScene);
  if (mode === 'golden') setPaused(true); // must not advance before the hash comparison starts
  if (drive) await drive.start();
  else if (crash) {
    physics.loadScene('crash');
    viewer.focus(new THREE.Vector3(0, 0.8, -4), 14);
    if (params.get('go') === '1') crashLaunch?.();
  } else if (mode !== 'garage') loadScene(initialScene, sceneInfo?.bodies);
  else await showGarage(viewer);
  if (mode === 'sandbox' && !drive && !crash && (initialScene === 'wall_crash' || initialScene === 'sandbox')) viewer.focus(new THREE.Vector3(6, 1, 0), 16);

  // ---- frame loop ----
  let last = performance.now();
  let frameMs = 16.7;
  const frameTimes: number[] = [];
  const physicsSamples: { stepMs: number; rtf: number }[] = [];
  viewer.renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    frameMs = frameMs * 0.9 + (now - last) * 0.1;
    if (mode === 'bench') frameTimes.push(now - last);
    last = now;
    viewer.update(dt);
    grid.update(viewer.controls.target);
    const frame = physics.update(now);
    drive?.update(dt, frame);
    crash?.update(dt, frame);
    tools?.update(frame);
    debug.update(frame);
    viewer.render();
    const stats = physics.latestStats();
    if (mode === 'bench' && stats && !stats.paused) physicsSamples.push({ stepMs: stats.stepMs, rtf: stats.rtf });
    hud.update(stats, { frameMs, drawCalls: viewer.drawCalls(), backend: viewer.backend, threads: physics.threads });
  });
  window.__apex!.ready = true;

  if (mode === 'golden') await runGolden(physics);
  if (mode === 'bench') await runBench(physics, viewer, frameTimes, physicsSamples);
}

/** Garage preview (§18.3-3 early look): the user's car models side by side, visual only (no physics yet — M1). */
async function showGarage(viewer: Viewer): Promise<void> {
  const pmrem = new THREE.PMREMGenerator(viewer.renderer);
  viewer.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const only = params.get('car');
  const models = await Promise.all(VEHICLES.filter((v) => !only || v.id === only).map((v) => loadVehicleModel(v.url)));
  let x = 0;
  const gap = 1.2; // [m] between cars
  const total = models.reduce((a, m) => a + m.meta.dimensions.width, 0) + gap * (models.length - 1);
  x = total / 2;
  for (const m of models) {
    x -= m.meta.dimensions.width / 2;
    m.root.position.set(x, 0, 0);
    m.root.rotation.y = 0.35; // three-quarter view
    viewer.scene.add(m.root);
    x -= m.meta.dimensions.width / 2 + gap;
  }
  const cam = params.get('cam');
  if ((cam === 'side' || cam === 'front') && models.length === 1) {
    // Near-orthographic checks (wheel/arch fit): a narrow lens far away on +X (left side) or +Z (front).
    models[0].root.rotation.y = 0;
    viewer.camera.fov = 7;
    viewer.camera.updateProjectionMatrix();
    const d = 52;
    viewer.camera.position.set(cam === 'side' ? d : 0, 0.75, cam === 'side' ? 0 : d);
    viewer.controls.target.set(0, 0.75, 0);
  } else if (cam && /^-?[\d.]+(:-?[\d.]+){2}$/.test(cam) && models.length === 1) {
    // Close-up check from a given point ("x:y:z", metres), looking at the car's centre.
    models[0].root.rotation.y = 0;
    const [cx, cy, cz] = cam.split(':').map(Number);
    viewer.camera.position.set(cx, cy, cz);
    viewer.controls.target.set(0, 0.8, 0);
  } else {
    viewer.focus(new THREE.Vector3(0, 0.8, 0), 11);
  }
  window.__apex!.garage = models.map((m) => m.meta);
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
    milestone: 'M0',
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

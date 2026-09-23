// APEX_SIM web client — M0 sandbox bootstrap.
//   /             interactive sandbox
//   /?bench=1     automated benchmark (§2.5): pile of cubes, frame/physics timing JSON
//   /?golden=1    determinism self-check: runs golden_m0 in the browser worker and compares with the native hashes
import './ui/styles.css';
import * as THREE from 'three/webgpu';
import goldenText from '../../core/tests/golden/golden_m0.txt?raw';
import { resolveSpawn, SCENES, SPAWNS } from './app/presets';
import { PhysicsClient } from './physics/PhysicsClient';
import { DebugBodies } from './render/DebugBodies';
import { GridGround } from './render/GridGround';
import { StaticGeometry } from './render/StaticGeometry';
import { Viewer } from './render/Viewer';
import { Hud } from './ui/Hud';
import { t, tl } from './ui/i18n';
import { SandboxPanel, TIME_SCALES } from './ui/SandboxPanel';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadVehicleModel, VEHICLES } from './vehicles/VehicleModel';

declare global {
  interface Window {
    __apex?: { bench?: unknown; golden?: unknown; garage?: unknown; ready?: boolean; errors: string[] };
  }
}
window.__apex = { errors: [] };

const params = new URLSearchParams(location.search);
const WASM_URL = new URL('wasm/sbc.mjs', document.baseURI).href;

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
  if (!PhysicsClient.isSupported()) {
    document.body.append(Object.assign(document.createElement('div'), { className: 'overlay', innerHTML: `<div class="card">${t('noIsolation')}</div>` }));
    return;
  }
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const viewer = new Viewer(canvas, params.get('backend') === 'webgl2');
  await viewer.init((message) => {
    // A lost WebGPU device cannot be recovered on the same canvas: reload once on the WebGL2 backend.
    fail(`WebGPU device lost (${message}) — switching to WebGL2`);
    if (params.get('backend') !== 'webgl2') {
      params.set('backend', 'webgl2');
      setTimeout(() => location.replace(`${location.pathname}?${params}`), 1500);
    }
  });

  // Leave one core for the main thread and one for the browser; cap at 8 (A§12).
  const threads = Math.max(1, Math.min((navigator.hardwareConcurrency || 4) - 2, 8));
  const physics = new PhysicsClient(WASM_URL, threads);
  physics.onError(fail);
  const grid = new GridGround(viewer.scene);
  const statics = new StaticGeometry(viewer.scene);
  const debug = new DebugBodies(viewer.scene, physics.topology);
  physics.onTopology(() => {
    debug.topologyChanged();
    statics.set(physics.staticTriangles, physics.renderOrigin);
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
  });
  const hud = new Hud();
  const hint = Object.assign(document.createElement('div'), { className: 'hint' });
  hint.append(Object.assign(document.createElement('span'), { textContent: t('hintOrbit') }), Object.assign(document.createElement('span'), { textContent: t('hintTime') }));
  document.body.append(panel.root, hud.root, hint);

  window.addEventListener('keydown', (e) => {
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
  if (mode !== 'garage') loadScene(initialScene, sceneInfo?.bodies);
  else await showGarage(viewer);
  if (mode === 'sandbox' && (initialScene === 'wall_crash' || initialScene === 'sandbox')) viewer.focus(new THREE.Vector3(6, 1, 0), 16);

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
  if (params.get('cam') === 'side' && models.length === 1) {
    // Orthogonal side check (wheel/arch alignment): camera on +X looking at the car's left side.
    models[0].root.rotation.y = 0;
    viewer.camera.position.set(7, 0.8, 0);
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

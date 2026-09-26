// The app's modes (§18.3): test ground and free roam driving, crash lab, sandbox and garage, each in the common
// shell (top bar, one control sheet, pause menu, settings). A mode returns the per-frame update the loop calls.
import * as THREE from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DRIVE_VEHICLES, resolveSpawn, SCENES, SPAWNS, type VehiclePreset } from './presets';
import { CrashLab } from '../crash/CrashLab';
import { CrashPanel } from '../crash/CrashPanel';
import { CRASH_PRESETS, type CrashKind, type CrashSpec } from '../crash/scenario';
import { CrashBackdrop, type Backdrop, type CameraPreset } from '../crash/CrashExtras';
import { DriveSession } from '../drive/DriveSession';
import type { PhysicsClient, RenderFrame } from '../physics/PhysicsClient';
import type { VehiclePose } from '../physics/messages';
import type { DebugBodies } from '../render/DebugBodies';
import type { Viewer } from '../render/Viewer';
import { tetherControls, TetherTool } from '../tools/TetherTool';
import { t, tl } from '../ui/i18n';
import { icon } from '../ui/icons';
import { settings, type HudPreset } from '../ui/settings';
import { SettingsView } from '../ui/SettingsView';
import type { ModeShell, ShellActions } from '../ui/Shell';
import { createShell } from '../ui/createShell';
import { isMobileUi } from '../ui/platform';
import { notify, tipOf } from '../ui/feedback';
import { DEFAULT_TOUCH_LAYOUT, normalizeLayout, TouchControls } from '../ui/TouchControls';
import { loadVehicleModel, VEHICLES } from '../vehicles/VehicleModel';

export type Route = 'menu' | 'freeroam' | 'drive' | 'crash' | 'sandbox' | 'garage' | 'bench' | 'golden';

/** What every mode gets from the app. */
export interface AppContext {
  physics: PhysicsClient;
  viewer: Viewer;
  debug: DebugBodies;
  params: URLSearchParams;
  fail(message: string): void;
  toast(text: string, kind?: '' | 'error' | 'ok'): void;
  go(route: Route, vehicle?: string, extra?: Record<string, string>): void;
  setPaused(p: boolean): void;
  isPaused(): boolean;
  setStatsVisible(on: boolean): void;
  statsVisible(): boolean;
  /** The debug grid (a mode may swap it for other scenery). */
  grid?: { visible: boolean };
  /** The driven car changed (in game): the app keeps the URL and the menu in step. */
  onVehicle?(v: VehiclePreset): void;
}

export interface ModeRuntime {
  update(dt: number, frame: RenderFrame | null): void;
  tools?: TetherTool | null;
  drive?: DriveSession | null;
  crash?: CrashLab | null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  e.append(...children);
  return e;
}

function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const b = el('button', className, label);
  b.onclick = onClick;
  return b;
}

const HUD_CYCLE: HudPreset[] = ['racing', 'minimal', 'none', 'engineer'];

/** The shell's time capsule on the physics world. */
export function timeHost(ctx: AppContext): NonNullable<ShellActions['time']> {
  return {
    isPaused: () => ctx.isPaused(),
    setPaused: (p) => ctx.setPaused(p),
    setTimeScale: (s) => ctx.physics.setTimeScale(s),
    step: (n) => void ctx.physics.step(n),
  };
}

/** The car list of the panel: every drivable car; the current one marked. */
function carPicker(session: DriveSession, onSwap: (v: VehiclePreset) => void): HTMLElement {
  const list = el('div', 'car-list');
  const render = () => list.replaceChildren(...DRIVE_VEHICLES.map((v) => {
    const on = v.id === session.vehicle.id;
    const b = el('button', on ? 'tile active' : 'tile', el('b', '', tl(v.label)), el('small', '', v.specs ? `${v.specs.powerKw} kW · ${v.specs.massKg.toLocaleString('en-US')} kg · ${v.specs.drive}` : t('carDrivable')));
    b.onclick = () => {
      if (on) return;
      onSwap(v);
      setTimeout(render, 0);
    };
    return b;
  }));
  render();
  return list;
}

/** Touch controls for the driving modes (§15.4): with the phone UI by default, or as set. */
function touchControls(session: DriveSession, shell: ModeShell): TouchControls | null {
  const pref = settings.get().touchControls;
  if (pref === 'off' || (pref === 'auto' && !isMobileUi())) return null;
  const tc = new TouchControls(normalizeLayout({ ...DEFAULT_TOUCH_LAYOUT, ...((settings.get().touchLayout as object | null) ?? {}) }));
  document.body.append(tc.root);
  document.body.classList.add('touch-on');
  tc.setVisible(true);
  session.input.touch = tc;
  tc.onAction = (a) => {
    if (a === 'pause') shell.openPause();
    else if (a === 'camera') session.input.trigger('camera');
    else if (a === 'reset') session.input.trigger('reset');
    else session.input.trigger(a);
  };
  tc.onLayoutChange = (l) => settings.set({ touchLayout: l });
  settings.onChange((s) => tc.setLayout(normalizeLayout({ ...DEFAULT_TOUCH_LAYOUT, ...((s.touchLayout as object | null) ?? {}) })));
  // Layout editor: the controls become draggable; a floating "done" button ends it.
  SettingsView.onEditTouchLayout = () => {
    shell.closePause();
    tc.setEditMode(true);
    const done = el('button', 'fab primary', t('editDone'));
    done.onclick = () => {
      tc.setEditMode(false);
      done.remove();
    };
    document.body.append(done);
  };
  return tc;
}

/** Common driving frame: shell, dashboard, touch controls, top-bar actions and the "car" sheet section. */
export function drivingShell(ctx: AppContext, session: DriveSession, title: string, restart: () => void, sheetOpen?: boolean): ModeShell {
  const shell = createShell(title, tl(session.vehicle.label), { mainMenu: () => ctx.go('menu'), restart, setPaused: (p) => ctx.setPaused(p), time: timeHost(ctx) }, sheetOpen);
  document.body.append(shell.root, session.dashboard.root);
  const repair = async () => {
    await session.repair();
    notify(t('carRepaired'), 'ok', { icon: 'wrench' });
  };
  const resetCar = async () => {
    await session.resetCar();
    notify(t('carWasReset'), 'ok', { icon: 'reset' });
  };
  const swap = async (v: VehiclePreset) => {
    await session.swapVehicle(v);
    shell.setTitle(title, tl(v.label));
    settings.set({ car: v.id });
    ctx.onVehicle?.(v);
    notify(`${t('carSwapped')} · ${tl(v.label)}`, 'ok', { icon: 'car' });
  };
  session.onReset = () => notify(t('carWasReset'), 'ok', { icon: 'reset' });
  shell.addAction('wrench', t('carRepair'), () => void repair(), undefined, t('carRepairTip'));
  shell.addAction('reset', t('carReset'), () => void resetCar(), undefined, t('carResetTip'), 'R');
  session.onCamera = (label) => notify(`${t('actCamera')} · ${label}`, '', { icon: 'camera', key: 'cam' });
  shell.addAction('camera', t('actCamera'), () => session.toggleCamera(), undefined, t('camOrbitHint'), 'C');
  shell.addAction('xray', t('actXray'), () => session.setXray(!session.xrayOn), false, t('actXrayTip'), 'V');
  shell.addAction('gauge', t('actHud'), () => {
    const i = HUD_CYCLE.indexOf(settings.get().hud);
    const next = HUD_CYCLE[(i + 1) % HUD_CYCLE.length];
    settings.set({ hud: next });
    notify(`${t('actHud')} · ${t(next === 'none' ? 'hudNone' : next === 'minimal' ? 'hudMinimal' : next === 'racing' ? 'hudRacing' : 'hudEngineer')}`, '', { icon: 'gauge', key: 'hud' });
  }, undefined, t('actHudTip'));
  const apply = () => {
    const s = settings.get();
    session.dashboard.setPreset(s.hud);
    session.dashboard.setUnit(s.speedUnit);
    ctx.setStatsVisible(s.hud === 'engineer');
  };
  settings.onChange(apply);
  apply();
  const logic = session.input.logic;
  const aid = (label: string, get: () => boolean, set: (on: boolean) => void) => {
    const b = el('button', get() ? 'chip active' : 'chip', label);
    b.onclick = () => {
      set(!get());
      b.classList.toggle('active', get());
      notify(`${label} · ${get() ? t('stateOn') : t('stateOff')}`, '', { key: `aid-${label}` });
    };
    return b;
  };
  const act = (name: Parameters<typeof icon>[0], label: string, tip: string, run: () => void) => {
    const b = el('button', 'act', icon(name), el('span', '', label));
    tipOf(b, `${label}\n${tip}`);
    b.onclick = run;
    return b;
  };
  shell.sheet.section(t('sheetCar'),
    el('div', 'grid3', act('wrench', t('carRepair'), t('carRepairTip'), () => void repair()), act('reset', t('carReset'), t('carResetTip'), () => void resetCar()),
      act('restart', t('restart'), t('restartTip'), restart)),
    el('div', 'chips', aid('TCS', () => logic.tcs, (on) => (logic.tcs = on)), aid('ABS', () => logic.abs, (on) => (logic.abs = on)),
      aid(t('aidManual'), () => logic.manual, (on) => (logic.manual = on))));
  shell.sheet.section(t('carSwap'), carPicker(session, (v) => void swap(v)));
  shell.sheet.section(t('sheetKeys'), el('p', 'muted', t('keysHelp')));
  touchControls(session, shell);
  return shell;
}

/** Start pose from the URL: &at=<x>,<z> [m] &yaw=<deg> &kmh= (a run-up, a test position). */
export function poseFromParams(params: URLSearchParams): VehiclePose {
  const at = (params.get('at') ?? '0,0').split(',').map(Number);
  return {
    position: [at[0] || 0, 0, at[1] || 0],
    yaw: (Number(params.get('yaw')) || 0) * (Math.PI / 180),
    speed: (Number(params.get('kmh')) || 0) / 3.6,
  };
}

/** Test ground (§13.3 in part): the "drive" scene — bumps, jump ramp, spikes, step, slalom cones, end wall. */
export async function startTestGround(ctx: AppContext, vehicle: VehiclePreset): Promise<ModeRuntime> {
  const session = new DriveSession(ctx.physics, ctx.viewer, ctx.debug, vehicle, ctx.fail, () => ctx.setPaused(!ctx.isPaused()), poseFromParams(ctx.params));
  window.__apex!.drive = session;
  drivingShell(ctx, session, t('modeTestGround'), () => void session.restart());
  await session.start();
  return { update: (dt, frame) => session.update(dt, frame), drive: session };
}

/** Crash lab (§18.3-9): scenario tiles → details → launch (the floating button) → report. */
export function startCrashLab(ctx: AppContext, vehicle: VehiclePreset): ModeRuntime {
  const { physics, viewer, params } = ctx;
  const crash = new CrashLab(physics, viewer, ctx.debug, ctx.fail);
  window.__apex!.crash = crash;
  const num = (key: string) => (params.has(key) ? Number(params.get(key)) : undefined);
  const initial: Partial<CrashSpec> = {};
  const kind = params.get('kind');
  if (kind && ['fullWall', 'offsetWall', 'carToCar', 'pole', 'rollover', 'drop', 'crush'].includes(kind)) initial.kind = kind as CrashKind;
  const preset = CRASH_PRESETS.find((p) => p.id === params.get('preset'));
  if (preset) Object.assign(initial, preset.spec);
  for (const [key, field] of [['kmh', 'speedA'], ['kmhb', 'speedB'], ['angle', 'angle'], ['offset', 'offset']] as const) {
    const v = num(key);
    if (v !== undefined && Number.isFinite(v)) initial[field] = v;
  }
  const overlap = num('overlap');
  if (overlap !== undefined && overlap > 0 && overlap <= 1) initial.overlap = overlap;
  const vehicleB = DRIVE_VEHICLES.find((v) => v.id === params.get('b')) ?? vehicle;
  const panel = new CrashPanel({
    launch: (spec, a, b, keep) => {
      ctx.setPaused(false);
      if (shell.mobile) shell.sheet.setOpen(false); // the phone's panel would hide the crash
      void crash.launch(spec, a, b, false, keep);
    },
    stage: (spec, a, b, keep) => {
      ctx.setPaused(false);
      void crash.launch(spec, a, b, true, keep);
    },
    pick: () => {
      tabs.select(0);
      shell.sheet.setOpen(true);
    },
    report: () => {
      tabs.select(2);
      shell.sheet.setOpen(true);
    },
  }, initial, [crash.energyGraph.root, crash.momentumGraph.root], vehicle.id, vehicleB.id);
  const shell = createShell(t('modeCrash'), tl(vehicle.label), { mainMenu: () => ctx.go('menu'), restart: () => panel.launch(), setPaused: (p) => ctx.setPaused(p), time: timeHost(ctx) });
  document.body.append(shell.root, shell.mobile ? mobileLaunchBar(panel, () => {
    tabs.select(0);
    shell.sheet.setOpen(true);
  }) : panel.fab, panel.result);
  shell.addAction('xray', t('actXray'), (b) => crash.setXray(b.ariaPressed === 'true'), false, t('actXrayTip'));
  const follow = shell.addAction('eye', t('crashFollow'), (b) => (crash.follow = b.ariaPressed === 'true'), true, t('crashFollowTip'));
  shell.addAction('lock', t('camLock'), (b) => {
    const on = b.ariaPressed === 'true';
    crash.setCameraLock(on);
    follow.disabled = on;
  }, false, t('camLockTip'));
  shell.addAction('wrench', t('carRepair'), () => void crash.repair().then(() => notify(t('carRepaired'), 'ok', { icon: 'wrench' })), undefined, t('crashRepairTip'));
  shell.addAction('info', t('actStats'), (b) => ctx.setStatsVisible(b.ariaPressed === 'true'), false, t('actStatsTip'));
  // View: camera angles and the backdrop (scenery only; the tested ground is the same flat concrete).
  const backdrop = new CrashBackdrop(viewer.scene, ctx.grid ?? null);
  const pick = <T extends string>(items: Array<[T, string, Parameters<typeof icon>[0]]>, current: T, set: (v: T) => void) => {
    const row = el('div', 'chips');
    const render = (v: T) => row.replaceChildren(...items.map(([id, label, ic]) => {
      const b = el('button', id === v ? 'chip active act' : 'chip act', icon(ic), el('span', '', label));
      b.onclick = () => {
        set(id);
        render(id);
        notify(label, '', { icon: ic, key: 'crash-view' });
      };
      return b;
    }));
    render(current);
    return row;
  };
  const views = pick<CameraPreset>([['side', t('camSide'), 'camera'], ['front', t('camFront'), 'camera'], ['top', t('camTop'), 'camera'], ['rear', t('camRear'), 'camera']], 'side', (p) => crash.viewFrom(p));
  const scenery = pick<Backdrop>([['grid', t('bgGrid'), 'grid'], ['road', t('bgRoad'), 'road'], ['terrain', t('bgTerrain'), 'mountain']], 'grid', (b) => backdrop.set(b));
  crash.onLog = (rows) => panel.setLog(rows);
  crash.onWheels = (rows) => panel.setWheels(rows);
  const tools = new TetherTool(physics, viewer, viewer.renderer.domElement as HTMLCanvasElement);
  window.__apex!.tools = tools;
  const section = (title: string, ...nodes: Node[]) => el('section', 'sheet-section', el('h3', '', title), ...nodes);
  const tabs = shell.sheet.tabs([
    { title: t('crashTabPresets'), icon: 'flag', nodes: [section(t('crashScenario'), panel.scenario)] },
    { title: t('crashTabDetails'), icon: 'sliders', nodes: [section(t('crashSetup'), panel.details), section(t('tools'), tetherControls(tools))] },
    { title: t('crashTabReport'), icon: 'info', nodes: [section(t('crashReport'), panel.report)] },
    { title: t('crashTabView'), icon: 'camera', nodes: [section(t('camAngles'), views), section(t('bgTitle'), scenery)] },
  ]);
  // A phone's panel covers the lower half: opened, it takes the result card's place.
  const sheetToggled = shell.sheet.onToggle;
  shell.sheet.onToggle = (open) => {
    sheetToggled(open);
    if (open && (shell.mobile || !matchMedia('(min-width: 761px)').matches)) panel.dismissResult();
  };
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || shell.menuOpen) return;
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      shell.time?.togglePause();
    } else if (e.key === 'r' || e.key === 'R') panel.launch();
  });
  physics.loadScene('crash');
  viewer.focus(new THREE.Vector3(0, 0.8, -4), 14);
  if (params.get('go') === '1') panel.launch();
  else panel.stage();
  return { update: (dt, frame) => crash.update(dt, frame), crash, tools };
}

/**
 * The crash lab's launch bar on a phone (§18.5 one core action, in thumb reach): the test as it stands — tap it to
 * choose another — and the launch button. It stays above the panel, so a pick in the tiles launches from the same
 * place.
 */
function mobileLaunchBar(panel: CrashPanel, choose: () => void): HTMLElement {
  const pic = el('span', 'm-launch-pic');
  const label = el('b');
  const detail = el('small');
  const pickBtn = el('button', 'm-launch-pick', pic, el('span', 'm-launch-text', label, detail), icon('expand'));
  pickBtn.ariaLabel = t('mScenario');
  pickBtn.onclick = choose;
  const render = () => {
    const s = panel.summary();
    pic.replaceChildren(s.pictogram);
    label.textContent = s.label;
    detail.textContent = `${s.detail} · ${t('mTapToChoose')}`;
  };
  panel.onSpecChange = render;
  render();
  document.body.classList.add('m-launchbar');
  return el('div', 'm-launch', pickBtn, panel.fab);
}

/** Sandbox (§19 프리롬·샌드박스, §20 도구): scenes, spawnable objects, a car to drive in and out of, grab / crane,
 *  time control. */
export function startSandbox(ctx: AppContext, vehicle: VehiclePreset): ModeRuntime {
  const { physics, viewer, params, debug } = ctx;
  let scene = params.get('scene') ?? 'sandbox';
  const info = () => SCENES.find((s) => s.id === scene);
  let session: DriveSession | null = null;
  const shell = createShell(t('modeSandbox'), tl(info()?.label ?? { ko: scene, en: scene }), { mainMenu: () => ctx.go('menu'), restart: () => load(scene), setPaused: (p) => ctx.setPaused(p), time: timeHost(ctx) });
  document.body.append(shell.root);
  const target = (): [number, number, number] => [viewer.controls.target.x, 0, viewer.controls.target.z];
  const load = (id: string) => {
    scene = id;
    physics.loadScene(id, info()?.bodies);
    shell.setTitle(t('modeSandbox'), tl(info()?.label ?? { ko: id, en: id }));
    if (session) void session.restart(); // the old car went with the old world
  };
  // ---- dock: nodes/beams, engineer stats (time: the shell's capsule)
  shell.addAction('xray', t('actXray'), (b) => {
    const on = b.ariaPressed === 'true';
    debug.xray = on;
    session?.setXray(on);
  }, false, t('actXrayTip'));
  shell.addAction('info', t('actStats'), (b) => ctx.setStatsVisible(b.ariaPressed === 'true'), false, t('actStatsTip'));

  // ---- sheet: scene, spawn, car, time, tools
  const sceneSelect = el('select');
  for (const s of SCENES.filter((x) => x.id !== 'golden_m0')) sceneSelect.append(Object.assign(el('option', '', tl(s.label)), { value: s.id }));
  sceneSelect.value = scene;
  sceneSelect.onchange = () => load(sceneSelect.value);
  shell.sheet.section(t('scene'), sceneSelect, el('div', 'row', button(t('reset'), () => load(scene))));
  const tiles = SPAWNS.map((p) => {
    const b = el('button', 'tile', el('b', '', tl(p.label)), el('small', '', `${t('keyHint')} ${p.key}`));
    b.onclick = () => physics.spawnLattice(resolveSpawn(p, target()), tl(p.label));
    return b;
  });
  shell.sheet.section(t('spawn'), el('div', 'grid2', ...tiles));
  const driveBtn = el('button', 'primary wide', t('sandboxDrive'));
  const carNote = el('p', 'muted', t('sandboxDriveNote'));
  const toggleCar = async () => {
    if (!session) {
      const c = viewer.controls.target;
      session = new DriveSession(physics, viewer, debug, vehicle, ctx.fail, () => ctx.setPaused(!ctx.isPaused()), { position: [c.x, 0.05, c.z], yaw: 0, speed: 0 }, null);
      session.manageDebug = false;
      window.__apex!.drive = session;
      document.body.append(session.dashboard.root);
      const apply = () => {
        session!.dashboard.setPreset(settings.get().hud);
        session!.dashboard.setUnit(settings.get().speedUnit);
      };
      settings.onChange(apply);
      apply();
      touchControls(session, shell);
      await session.start();
      driveBtn.textContent = t('sandboxExit');
      return;
    }
    session.setActive(!session.isActive);
    driveBtn.textContent = session.isActive ? t('sandboxExit') : t('sandboxEnter');
  };
  driveBtn.onclick = () => void toggleCar();
  shell.sheet.section(t('sheetCar'), driveBtn, carNote);
  const tools = new TetherTool(physics, viewer, viewer.renderer.domElement as HTMLCanvasElement);
  window.__apex!.tools = tools;
  shell.sheet.section(t('tools'), tetherControls(tools));
  shell.sheet.section(t('sheetKeys'), el('p', 'muted', `${t('hintOrbit')} · ${t('hintTime')}`));

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || shell.menuOpen) return;
    if (session?.isActive) return; // the keys belong to the car
    const preset = SPAWNS.find((p) => p.key === e.key);
    if (preset) physics.spawnLattice(resolveSpawn(preset, target()), tl(preset.label));
    else if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      shell.time?.togglePause();
    } else if (e.key === ',') {
      ctx.setPaused(true);
      void physics.step(100);
      shell.time?.sync();
    } else if (e.key === 'r' || e.key === 'R') load(scene);
  });
  debug.showNodes = debug.showBeams = true;
  load(scene);
  if (scene === 'wall_crash' || scene === 'sandbox') viewer.focus(new THREE.Vector3(6, 1, 0), 16);
  return {
    update: (dt, frame) => {
      session?.update(dt, frame);
      tools.update(frame);
    },
    tools,
    get drive() {
      return session;
    },
  };
}

/** Garage (§18.3-3 early look): the car models side by side under showroom light; the sheet focuses one. */
export async function startGarage(ctx: AppContext): Promise<ModeRuntime> {
  const { viewer, params } = ctx;
  const shell = createShell(t('modeGarage'), '', { mainMenu: () => ctx.go('menu'), setPaused: () => {} });
  document.body.append(shell.root);
  const pmrem = new THREE.PMREMGenerator(viewer.renderer);
  viewer.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const only = params.get('car');
  const list = VEHICLES.filter((v) => !only || v.id === only);
  const models = await Promise.all(list.map((v) => loadVehicleModel(v.url)));
  let x = 0;
  const gap = 1.2;
  const total = models.reduce((a, m) => a + m.meta.dimensions.width, 0) + gap * (models.length - 1);
  x = total / 2;
  const spots: THREE.Vector3[] = [];
  for (const m of models) {
    x -= m.meta.dimensions.width / 2;
    m.root.position.set(x, 0, 0);
    m.root.rotation.y = 0.35;
    viewer.scene.add(m.root);
    spots.push(new THREE.Vector3(x, 0.8, 0));
    x -= m.meta.dimensions.width / 2 + gap;
  }
  const cam = params.get('cam');
  if ((cam === 'side' || cam === 'front') && models.length === 1) {
    models[0].root.rotation.y = 0;
    viewer.camera.fov = 7;
    viewer.camera.updateProjectionMatrix();
    const d = 52;
    viewer.camera.position.set(cam === 'side' ? d : 0, 0.75, cam === 'side' ? 0 : d);
    viewer.controls.target.set(0, 0.75, 0);
    shell.root.hidden = true;
  } else if (cam && /^-?[\d.]+(:-?[\d.]+){2}$/.test(cam) && models.length === 1) {
    models[0].root.rotation.y = 0;
    const [cx, cy, cz] = cam.split(':').map(Number);
    viewer.camera.position.set(cx, cy, cz);
    viewer.controls.target.set(0, 0.8, 0);
    shell.root.hidden = true;
  } else {
    viewer.focus(new THREE.Vector3(0, 0.8, 0), 11);
  }
  shell.sheet.section(t('garageCars'), ...models.map((m, i) => {
    const b = el('button', 'tile', el('b', '', tl(m.meta.name)), el('small', '', `${m.meta.dimensions.length.toFixed(2)} × ${m.meta.dimensions.width.toFixed(2)} × ${m.meta.dimensions.height.toFixed(2)} m`));
    b.onclick = () => viewer.focus(spots[i], 6.5);
    return b;
  }));
  window.__apex!.garage = models.map((m) => m.meta);
  return { update: () => {} };
}

/** Settings as an overlay without a shell (the main menu). */
export function openSettingsOverlay(): void {
  const mobile = isMobileUi();
  const layer = el('div', mobile ? 'm-layer m-settings-layer' : 'overlay-layer');
  const view = new SettingsView(() => layer.remove(), mobile);
  layer.append(view.root);
  layer.addEventListener('pointerdown', (e) => {
    if (e.target === layer) layer.remove();
  });
  document.body.append(layer);
}

export { icon };

// End-to-end check in headless Chromium (§23.4, §2.2 screenshots):
//   1. golden_m0 in the browser worker must reproduce the native golden hashes (§23.1 결정론, native = WASM)
//   2. sandbox screenshots (docs/screenshots/)
//   2b. driving (§17, M1e): the Porsche launches, steers and brakes under keyboard input; drive screenshots
//   2c. crash (M2): the Porsche at 100 km/h into the end wall — the nose crushes, the books stay closed, and the GLB
//       follows the node cage (flexbody, §4.5); crash screenshots
//   3. short benchmark run → bench/results/ (GPU-less CI machines render on SwiftShader: frame times there are
//      NOT representative of real hardware; physics timings are)
//   2d. crash lab (M2): a car-to-car run and an offset wall run from the launcher; event log and graphs
//   2e. tools (§20): mouse grab lifts a cube, the crane reels it up
//   2f. tyres (§6): the spike strip punctures all four tyres, they deflate, the pressure warning comes on
//   2g. free roam (§13): proving-ground oval drive, world map; the open-world city at night in the rain
// Usage: npm run build && node tools/e2e.mjs [--no-bench] [--only <steps>] [--bench-tag M2] [--chromium /path/to/chrome]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const chromiumPath =
  args[args.indexOf('--chromium') + 1] && args.includes('--chromium')
    ? args[args.indexOf('--chromium') + 1]
    : process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const runBench = !args.includes('--no-bench');
// Milestone the benchmark result is filed under (bench/results/<tag>-web-headless-swiftshader.json).
const benchTag = args.includes('--bench-tag') ? args[args.indexOf('--bench-tag') + 1] : 'M2';
// --only golden,sandbox,drive,crash,crashlab,tyres,tools,freeroam,bench runs just those steps.
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const want = (step) => !only || only.includes(step);
const PORT = 4179;
const base = `http://localhost:${PORT}/`;
// Headless Chromium on SwiftShader loses every WebGPU canvas device within a second (reproduced with a bare
// WebGPU clear loop, no three.js involved — KNOWN_ISSUES), so the E2E pass renders through three's WebGL2
// backend. Physics, workers and WASM are identical either way.
const BACKEND = process.env.APEX_BACKEND ?? 'webgl2';

function startPreview() {
  // Run Vite's own binary (not `npx`) so that kill() stops the server itself.
  const proc = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('vite preview did not start')), 30000);
    proc.stdout.on('data', (d) => {
      if (String(d).includes(String(PORT))) {
        clearTimeout(timer);
        resolve(proc);
      }
    });
    proc.on('exit', (code) => reject(new Error(`vite preview exited with ${code}`)));
  });
}

async function openPage(browser, query) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  const sep = query.includes('?') ? '&' : '?';
  await page.goto(base + query + (BACKEND ? `${sep}backend=${BACKEND}` : ''));
  await page.waitForFunction(() => window.__apex?.ready === true, null, { timeout: 60000 });
  return { page, consoleErrors };
}

async function main() {
  const preview = await startPreview();
  const browser = await chromium.launch({ executablePath: chromiumPath, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
  const failures = [];
  try {
    // 1. determinism in the browser
    if (want('golden')) {
      const { page, consoleErrors } = await openPage(browser, '?golden=1');
      await page.waitForFunction(() => window.__apex?.golden !== undefined, null, { timeout: 240000 });
      const golden = await page.evaluate(() => window.__apex.golden);
      console.log('golden:', JSON.stringify(golden));
      if (!golden.pass) failures.push('browser golden hashes differ from native');
      if (consoleErrors.length) failures.push(`console errors (golden): ${consoleErrors.join(' | ')}`);
      await page.close();
    }
    // 2. screenshots
    if (want('sandbox')) {
      const dir = join(root, 'docs', 'screenshots');
      mkdirSync(dir, { recursive: true });
      const { page, consoleErrors } = await openPage(browser, '?scene=sandbox');
      await page.waitForTimeout(1500);
      await page.keyboard.press('3'); // crash block → wall
      await page.keyboard.press('1'); // cube drop
      await page.waitForTimeout(9000);
      await page.screenshot({ path: join(dir, 'M0-sandbox-crash.png') });
      await page.goto(`${base}?scene=pile&backend=${BACKEND}`);
      await page.waitForFunction(() => window.__apex?.ready === true);
      await page.waitForTimeout(9000);
      await page.screenshot({ path: join(dir, 'M0-pile.png') });
      await page.goto(`${base}?scene=tower&backend=${BACKEND}`);
      await page.waitForFunction(() => window.__apex?.ready === true);
      await page.waitForTimeout(7000);
      await page.screenshot({ path: join(dir, 'M0-tower.png') });
      await page.goto(`${base}?view=garage&backend=${BACKEND}`);
      await page.waitForFunction(() => window.__apex?.garage !== undefined, null, { timeout: 120000 });
      await page.waitForTimeout(4000);
      await page.screenshot({ path: join(dir, 'M1-garage-user-cars.png') });
      const errors = await page.evaluate(() => window.__apex.errors);
      if (errors.length || consoleErrors.length) failures.push(`errors (sandbox): ${[...errors, ...consoleErrors].join(' | ')}`);
      await page.close();
      console.log('screenshots → docs/screenshots/');
    }
    // 2b. driving: keyboard in, telemetry out (the car is the physics vehicle; the view is its GLB bound to it).
    // Headless SwiftShader renders about one frame per second and input travels once per frame, so each phase is
    // ended by telemetry (speed, heading) rather than by wall time — otherwise the car keeps its last input for
    // seconds of sim time and ends at the far wall.
    if (want('drive')) {
      const dir = join(root, 'docs', 'screenshots');
      const { page, consoleErrors } = await openPage(browser, '?drive=porsche_911_turbo_991');
      await page.waitForFunction(() => window.__apex?.drive?.latest != null, null, { timeout: 120000 });
      const tel = () =>
        page.evaluate(() => {
          const s = window.__apex.drive.latest;
          return { kmh: s.speed * 3.6, gear: s.gear, up: s.up[1], heading: Math.atan2(s.forward[0], s.forward[2]) };
        });
      const until = async (test, maxMs) => {
        const t0 = Date.now();
        let s = await tel();
        while (!test(s) && Date.now() - t0 < maxMs) {
          await page.waitForTimeout(100);
          s = await tel();
        }
        return s;
      };
      let minUp = 1;
      const track = (s) => ((minUp = Math.min(minUp, s.up)), s);
      await page.waitForTimeout(2000);
      const rest = track(await tel());
      await page.keyboard.down('KeyW');
      const launched = track(await until((s) => s.kmh > 80, 20000));
      await page.keyboard.up('KeyW');
      await page.screenshot({ path: join(dir, 'M1-drive-launch.png') });
      await page.keyboard.down('KeyA');
      const turned = track(await until((s) => Math.abs(s.heading - launched.heading) > 0.15, 10000));
      await page.keyboard.up('KeyA');
      await page.screenshot({ path: join(dir, 'M1-drive-turn.png') });
      await page.keyboard.down('KeyS');
      const braked = track(await until((s) => s.kmh < 5, 15000)); // release before the stop: held S at rest selects reverse
      await page.keyboard.up('KeyS');
      const turn = Math.abs(turned.heading - launched.heading);
      console.log('drive:', JSON.stringify({ rest: rest.kmh, launched: launched.kmh, gear: launched.gear, turnRad: turn, braked: braked.kmh, minUp }));
      if (Math.abs(rest.kmh) > 2) failures.push(`drive: the car creeps at rest (${rest.kmh.toFixed(1)} km/h)`);
      if (launched.kmh < 80) failures.push(`drive: only ${launched.kmh.toFixed(1)} km/h after 20 s of throttle`);
      if (launched.gear < 2) failures.push('drive: the automatic did not upshift');
      if (turn < 0.15) failures.push(`drive: steering left turned the car by only ${turn.toFixed(3)} rad`);
      if (braked.kmh > 5) failures.push(`drive: still ${braked.kmh.toFixed(1)} km/h after 15 s of braking`);
      if (minUp < 0.9) failures.push('drive: the car tipped over');
      const errors = await page.evaluate(() => window.__apex.errors);
      if (errors.length || consoleErrors.length) failures.push(`errors (drive): ${[...errors, ...consoleErrors].join(' | ')}`);
      await page.close();
    }
    // 2c. wall crash with flexbody deformation
    if (want('crash')) {
      const dir = join(root, 'docs', 'screenshots');
      const { page, consoleErrors } = await openPage(browser, '?drive=porsche_911_turbo_991&at=0,250&kmh=100');
      await page.waitForFunction(() => window.__apex?.drive?.latest != null && window.__apex.drive.view != null, null, { timeout: 120000 });
      const state = () =>
        page.evaluate(() => {
          const d = window.__apex.drive;
          const e = d.physics.latestStats()?.energy;
          const known = d.physics.damage.get(d.spawned.body);
          const states = d.view.flexbody ? [...d.view.flexbody.panelStates] : [];
          const look = (id) => (known ? states[known.ids.indexOf(id)] : -1);
          return {
            kmh: d.latest.speed * 3.6,
            z: d.latest.position[2],
            flexMeshes: d.view.flexbody ? d.view.flexbody.meshes.length : 0,
            partVertices: d.view.flexbody ? [...d.view.flexbody.partVertices] : [],
            windscreen: look('glass_windscreen'),
            headlamps: [look('lamp_front_left'), look('lamp_front_right')],
            tailLamps: [look('lamp_rear_left'), look('lamp_rear_right')],
            granules: d.glassDebris.alive,
            shards: d.lampDebris.alive,
            plasticKJ: e ? e.plastic / 1e3 : 0,
            balance: e ? Math.abs(e.balance) / Math.max(Math.abs(e.external), 1) : 1,
          };
        });
      const t0 = Date.now();
      let s = await state();
      while ((s.plasticKJ < 50 || Math.abs(s.kmh) > 1) && Date.now() - t0 < 90000) {
        await page.waitForTimeout(250);
        s = await state();
      }
      await page.keyboard.press('KeyC'); // orbit camera: look at the crushed nose from the front left
      await page.evaluate(() => {
        const d = window.__apex.drive, p = d.latest.position;
        d.viewer.controls.target.set(p[0], p[1], p[2] + 1.0);
        d.viewer.camera.position.set(p[0] + 3.2, p[1] + 1.6, p[2] + 3.4);
        d.viewer.controls.update();
      });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(dir, 'M2-crash-flexbody.png') });
      await page.keyboard.press('KeyV');
      await page.waitForTimeout(1200);
      await page.screenshot({ path: join(dir, 'M2-crash-cage.png') });
      console.log('crash:', JSON.stringify(s));
      if (s.flexMeshes === 0) failures.push('crash: the body mesh is not bound to the node cage (no flexbody)');
      // §4.4 hinged panels: the lids' and doors' GLB pieces follow their own node-beam panels.
      if (s.partVertices.length !== 4 || s.partVertices.some((n) => n === 0)) failures.push(`crash: hinged panel vertices ${s.partVertices}`);
      if (s.plasticKJ < 50) failures.push(`crash: only ${s.plasticKJ.toFixed(1)} kJ absorbed plastically`);
      if (Math.abs(s.kmh) > 1) failures.push(`crash: the wreck still moves at ${s.kmh.toFixed(1)} km/h`);
      if (s.balance > 0.05) failures.push(`crash: energy balance error ${(100 * s.balance).toFixed(2)} %`);
      // §4.3 glass and lamps: the windscreen cracks (1), the headlamps break (2) and shed shards, the tail lamps survive.
      if (s.windscreen !== 1) failures.push(`crash: windscreen state ${s.windscreen}, expected cracked`);
      if (s.headlamps.some((x) => x !== 2)) failures.push(`crash: headlamps ${s.headlamps}, expected broken`);
      if (s.tailLamps.some((x) => x !== 0)) failures.push(`crash: tail lamps ${s.tailLamps}, expected intact`);
      if (s.shards === 0) failures.push('crash: no lamp shards');
      const errors = await page.evaluate(() => window.__apex.errors);
      if (errors.length || consoleErrors.length) failures.push(`errors (crash): ${[...errors, ...consoleErrors].join(' | ')}`);
      await page.close();
    }
    // 2d. crash lab (§5.3 launcher, event log, energy / momentum graphs): a 64 km/h car into a parked car, then an
    //     offset wall run launched from the panel in the same page (scene reload, actor reuse).
    if (want('crashlab')) {
      const dir = join(root, 'docs', 'screenshots');
      const { page, consoleErrors } = await openPage(browser, '?crash=porsche_911_turbo_991&kind=carToCar&kmh=64&kmhb=0&go=1');
      const state = () =>
        page.evaluate(() => {
          const c = window.__apex.crash;
          const e = c.cars[0]?.physics.latestStats()?.energy;
          return {
            cars: c.cars.length,
            models: c.cars.filter((a) => a.hasModel).length,
            kmh: c.cars.map((a) => (a.state ? a.state.speed * 3.6 : NaN)),
            rows: c.log.rows().map((r) => ({ t: r.time, cars: r.cars.length, kmh: r.relativeSpeed * 3.6, kN: r.peakForce / 1e3, kJ: r.absorbed / 1e3, g: r.peakG, active: r.active })),
            energySamples: c.energyGraph.samples,
            momentumSamples: c.momentumGraph.samples,
            tableRows: document.querySelectorAll('.eventlog:not(.wheels) tbody tr:not(:has(.empty))').length,
            wheelRows: document.querySelectorAll('.eventlog.wheels tbody tr:not(:has(.empty))').length,
            wheels: c.wheelRows().map((w) => ({ car: w.car, wheel: w.wheel, camber: +w.camber.toFixed(2), toe: +w.toe.toFixed(2), bar: +w.pressure.toFixed(2), bent: w.bent })),
            balance: e ? Math.abs(e.balance) / Math.max(Math.abs(e.external), 1) : 1,
            simTime: c.cars[0]?.physics.latestStats()?.simTime ?? 0,
          };
        });
      // Until every event has closed and 1.5 s more has run (the cars roll on in neutral after a car-to-car hit).
      const settle = async (cars) => {
        const t0 = Date.now();
        let s = await state();
        const done = (s) => s.cars === cars && s.rows.length > 0 && !s.rows.some((r) => r.active) && s.simTime > Math.max(...s.rows.map((r) => r.t)) + 1.5;
        while (!done(s) && Date.now() - t0 < 120000) {
          await page.waitForTimeout(250);
          s = await state();
        }
        return s;
      };
      const pair = await settle(2);
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(dir, 'M2-crash-lab.png') });
      console.log('crash lab (car to car):', JSON.stringify(pair));
      const hit = pair.rows.find((r) => r.cars === 2);
      if (pair.models !== 2) failures.push(`crash lab: ${pair.models}/2 car models bound`);
      if (!hit) failures.push('crash lab: no car-to-car row in the event log');
      else {
        if (Math.abs(hit.kmh - 64) > 8) failures.push(`crash lab: relative speed ${hit.kmh.toFixed(1)} km/h, expected ≈ 64`);
        if (hit.kN < 50 || hit.kJ < 5) failures.push(`crash lab: implausible impact ${hit.kN.toFixed(0)} kN / ${hit.kJ.toFixed(1)} kJ`);
      }
      if (pair.tableRows !== pair.rows.length) failures.push(`crash lab: table shows ${pair.tableRows} of ${pair.rows.length} rows`);
      // §4.4 wheel alignment table: every wheel of both cars, with camber and toe.
      if (pair.wheelRows !== 8 || pair.wheels.some((w) => !Number.isFinite(w.camber) || !Number.isFinite(w.toe))) failures.push(`crash lab: wheel table shows ${pair.wheelRows}/8 wheels`);
      // One sample per rendered frame; headless SwiftShader renders only a few frames per simulated second.
      if (pair.energySamples < 5 || pair.momentumSamples < 5) failures.push('crash lab: the energy / momentum graphs have no samples');
      if (pair.balance > 0.05) failures.push(`crash lab: energy balance error ${(100 * pair.balance).toFixed(2)} %`);
      // Second run from the panel: 56 km/h, 40 % offset wall.
      // The scenario tiles (§18.3-9): the second is the 40 % offset wall; then the speed, then the launch button.
      await page.evaluate(() => {
        document.querySelectorAll('.sheet .grid2 .tile')[1].click();
        const speed = document.querySelector('.sheet input[type=number]');
        speed.value = '56';
        speed.dispatchEvent(new Event('change'));
        document.querySelector('button.fab').click();
      });
      await page.waitForFunction(() => window.__apex.crash.lastSpec?.kind === 'offsetWall', null, { timeout: 10000 });
      const wall = await settle(1);
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(dir, 'M2-crash-lab-offset.png') });
      console.log('crash lab (offset wall):', JSON.stringify(wall));
      const w = wall.rows[0];
      if (!w || w.cars !== 1) failures.push('crash lab: no wall row after the relaunch');
      else if (Math.abs(w.kmh - 56) > 6) failures.push(`crash lab: offset wall at ${w.kmh.toFixed(1)} km/h, expected ≈ 56`);
      if (wall.balance > 0.05) failures.push(`crash lab (offset): energy balance error ${(100 * wall.balance).toFixed(2)} %`);
      const errors = await page.evaluate(() => window.__apex.errors);
      if (errors.length || consoleErrors.length) failures.push(`errors (crash lab): ${[...errors, ...consoleErrors].join(' | ')}`);
      await page.close();
    }
    // 2f. §6 tyre damage: the Porsche coasts over the drive scene's spike strip (tyre lane, x = −24): all four tyres
    //     punctured, deflating, the pressure warning on; then a screenshot of the flat tyres.
    if (want('tyres')) {
      const dir = join(root, 'docs', 'screenshots');
      const { page, consoleErrors } = await openPage(browser, '?drive=porsche_911_turbo_991&at=-24,0&kmh=45');
      await page.waitForFunction(() => window.__apex?.drive?.latest != null && window.__apex.drive.view != null, null, { timeout: 120000 });
      const state = () =>
        page.evaluate(() => {
          const d = window.__apex.drive, v = d.latest;
          return {
            z: v.position[2],
            kmh: v.speed * 3.6,
            flags: v.wheels.map((w) => w.tyreFlags),
            bar: v.wheels.map((w) => w.pressure),
            lamp: [...document.querySelectorAll('.dash-warn .lamp')].filter((l) => !l.hidden).map((l) => l.textContent),
            tyresShown: d.view.model.tyres.map((t) => t.group.visible),
          };
        });
      let s = await state();
      for (let t0 = Date.now(); (s.bar.some((b) => b > 0.6) || s.kmh > 1) && Date.now() - t0 < 120000; ) {
        await page.waitForTimeout(500);
        s = await state();
      }
      await page.keyboard.press('KeyC'); // orbit camera, low at the front right wheel
      await page.evaluate(() => {
        const d = window.__apex.drive, p = d.latest.position, f = d.latest.forward, l = d.latest.left;
        d.viewer.controls.target.set(p[0] + f[0] * 1.2 - l[0] * 0.8, 0.3, p[2] + f[2] * 1.2 - l[2] * 0.8);
        d.viewer.camera.position.set(p[0] + f[0] * 3.2 - l[0] * 3.0, 0.9, p[2] + f[2] * 3.2 - l[2] * 3.0);
        d.viewer.controls.update();
      });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(dir, 'M2-tyres-flat.png') });
      console.log('tyres:', JSON.stringify(s));
      if (s.flags.some((f) => (f & 1) === 0)) failures.push(`tyres: not every tyre punctured by the spike strip (flags ${s.flags})`);
      if (s.bar.some((b) => b > 0.6)) failures.push(`tyres: still ${s.bar.map((b) => b.toFixed(2))} bar`);
      if (!s.lamp.some((l) => l.includes('타이어') || l.toLowerCase().includes('tyre'))) failures.push(`tyres: no pressure warning (${s.lamp})`);
      const errors = await page.evaluate(() => window.__apex.errors);
      if (errors.length || consoleErrors.length) failures.push(`errors (tyres): ${[...errors, ...consoleErrors].join(' | ')}`);
      await page.close();
    }
    // 2e. §20 tools: grab a settled cube's top node with the mouse and lift it, let go, then hook it to the crane and
    //     reel it up with PageUp.
    if (want('tools')) {
      const dir = join(root, 'docs', 'screenshots');
      const { page, consoleErrors } = await openPage(browser, '?scene=cube_drop');
      await page.waitForFunction(() => (window.__apex.tools?.physics.latestStats()?.simTime ?? 0) > 2.5, null, { timeout: 60000 });
      // Screen position and height of the cube's top node.
      const top = () =>
        page.evaluate(() => {
          const tools = window.__apex.tools, f = tools.frame, cam = tools.viewer.camera;
          const n = f.nodeCount[0], p = f.positions;
          let best = 0;
          for (let i = 1; i < n; i++) if (p[i * 3 + 1] > p[best * 3 + 1] + 1e-4) best = i;
          const v = cam.position.clone().set(p[best * 3], p[best * 3 + 1], p[best * 3 + 2]).project(cam);
          const r = tools.canvas.getBoundingClientRect();
          let low = Infinity;
          for (let i = 0; i < n; i++) low = Math.min(low, p[i * 3 + 1]);
          return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, height: p[best * 3 + 1], low };
        });
      const tethers = () => page.evaluate(() => window.__apex.tools.physics.tethers.map((t) => ({ length: t.length, tension: t.tension, y: t.nodePosition[1] })));
      await page.click('.sheet .tools .row:first-of-type button:nth-child(1)'); // grab
      const start = await top();
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x, start.y - 140, { steps: 4 });
      let held = [];
      for (let t0 = Date.now(); Date.now() - t0 < 30000; ) {
        held = await tethers();
        if (held.length === 1 && held[0].y > start.height + 0.8) break;
        await page.waitForTimeout(250);
      }
      const lifted = await top();
      await page.screenshot({ path: join(dir, 'M2-tools-grab.png') });
      await page.mouse.up();
      await page.waitForFunction(() => window.__apex.tools.physics.tethers.length === 0, null, { timeout: 20000 });
      console.log('grab:', JSON.stringify({ start, lifted, held }));
      if (held.length !== 1) failures.push('tools: the grab made no tether');
      else if (lifted.low < 0.3) failures.push(`tools: the grabbed cube did not leave the ground (lowest node ${lifted.low.toFixed(2)} m)`);
      // Crane: let the cube land, hook its top node, reel in for a while.
      await page.waitForTimeout(3000);
      await page.click('.sheet .tools .row:first-of-type button:nth-child(2)'); // crane
      const rest = await top();
      await page.mouse.click(rest.x, rest.y);
      await page.waitForFunction(() => window.__apex.tools.physics.tethers.length === 1, null, { timeout: 20000 });
      const hooked = (await tethers())[0];
      await page.keyboard.down('PageUp');
      let reeled = hooked;
      for (let t0 = Date.now(); Date.now() - t0 < 40000; ) {
        reeled = (await tethers())[0] ?? reeled;
        if (reeled.length < hooked.length - 1.5) break;
        await page.waitForTimeout(250);
      }
      await page.keyboard.up('PageUp');
      await page.waitForTimeout(1500);
      const hanging = await top();
      await page.screenshot({ path: join(dir, 'M2-tools-crane.png') });
      console.log('crane:', JSON.stringify({ hooked, reeled, hanging }));
      if (reeled.length > hooked.length - 1.5) failures.push(`tools: the winch reeled only ${(hooked.length - reeled.length).toFixed(2)} m`);
      if (hanging.low < 0.5) failures.push(`tools: the crane did not lift the cube (lowest node ${hanging.low.toFixed(2)} m)`);
      const errors = await page.evaluate(() => window.__apex.errors);
      if (errors.length || consoleErrors.length) failures.push(`errors (tools): ${[...errors, ...consoleErrors].join(' | ')}`);
      await page.close();
    }
    // 2g. free roam (§13): the proving ground's banked oval — the car drives on the map's road meshes and terrain
    //     heightfield, keeps its tyres, the world map opens; then the open-world city at night in the rain.
    if (want('freeroam')) {
      const dir = join(root, 'docs', 'screenshots');
      const { page, consoleErrors } = await openPage(browser, '?freeroam=porsche_911_turbo_991&map=proving&spawn=oval&hour=11&weather=clear');
      await page.waitForFunction(() => window.__apex?.drive?.state != null, null, { timeout: 300000 });
      await page.waitForTimeout(2000);
      const car = () => page.evaluate(() => {
        const v = window.__apex.drive.state;
        return { kmh: v.speed * 3.6, y: v.position[1], tyres: v.wheels.map((w) => w.tyreFlags), faults: v.faults };
      });
      const rest = await car();
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(5000);
      await page.keyboard.up('KeyW');
      const run = await car();
      await page.screenshot({ path: join(dir, 'B1-freeroam-oval.png') });
      console.log('free roam (oval):', JSON.stringify({ rest, run }));
      if (rest.tyres.some((f) => f !== 0)) failures.push(`free roam: tyre damage at rest ${rest.tyres}`);
      if (!(run.kmh > 25)) failures.push(`free roam: ${run.kmh.toFixed(1)} km/h after 5 s of throttle`);
      if (run.tyres.some((f) => f !== 0)) failures.push(`free roam: tyre damage while driving ${run.tyres}`);
      await page.keyboard.press('KeyM');
      await page.waitForSelector('.worldmap', { timeout: 10000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(dir, 'B1-worldmap.png') });
      await page.keyboard.press('Escape');
      const errors = await page.evaluate(() => window.__apex.errors);
      if (errors.length || consoleErrors.length) failures.push(`errors (free roam): ${[...errors, ...consoleErrors].join(' | ')}`);
      await page.close();
      const city = await openPage(browser, '?freeroam=porsche_911_turbo_991&map=hanbit&spawn=cityhall&hour=21&weather=rain');
      await city.page.waitForFunction(() => window.__apex?.drive?.state != null, null, { timeout: 300000 });
      await city.page.waitForTimeout(4000);
      await city.page.screenshot({ path: join(dir, 'B1-city-night-rain.png') });
      const cityErrors = await city.page.evaluate(() => window.__apex.errors);
      if (cityErrors.length || city.consoleErrors.length) failures.push(`errors (city): ${[...cityErrors, ...city.consoleErrors].join(' | ')}`);
      await city.page.close();
    }
    // 3. benchmark
    if (runBench && want('bench')) {
      const { page } = await openPage(browser, '?bench=1&warmup=3&seconds=12');
      await page.waitForFunction(() => window.__apex?.bench !== undefined, null, { timeout: 120000 });
      const bench = await page.evaluate(() => window.__apex.bench);
      const out = join(root, 'bench', 'results', `${benchTag}-web-headless-swiftshader.json`);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify({ note: 'Headless Chromium, SwiftShader CPU rendering (no GPU): frame times are not representative; physics timings are.', ...bench }, null, 2) + '\n');
      console.log('bench:', JSON.stringify(bench));
      await page.close();
    }
  } finally {
    await browser.close();
    preview.kill();
  }
  if (failures.length) {
    console.error('E2E FAILED:\n - ' + failures.join('\n - '));
    process.exit(1);
  }
  console.log('E2E passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

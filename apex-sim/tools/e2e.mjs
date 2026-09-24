// End-to-end check in headless Chromium (§23.4, §2.2 screenshots):
//   1. golden_m0 in the browser worker must reproduce the native golden hashes (§23.1 결정론, native = WASM)
//   2. sandbox screenshots (docs/screenshots/)
//   2b. driving (§17, M1e): the Porsche launches, steers and brakes under keyboard input; drive screenshots
//   2c. crash (M2): the Porsche at 100 km/h into the end wall — the nose crushes, the books stay closed, and the GLB
//       follows the node cage (flexbody, §4.5); crash screenshots
//   3. short benchmark run → bench/results/ (GPU-less CI machines render on SwiftShader: frame times there are
//      NOT representative of real hardware; physics timings are)
//   2d. crash lab (M2): a car-to-car run and an offset wall run from the launcher; event log and graphs
// Usage: npm run build && node tools/e2e.mjs [--no-bench] [--only <steps>] [--chromium /path/to/chrome]
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
// --only golden,sandbox,drive,crash,crashlab,bench runs just those steps.
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
            tableRows: document.querySelectorAll('.eventlog tbody tr:not(:has(.empty))').length,
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
      // One sample per rendered frame; headless SwiftShader renders only a few frames per simulated second.
      if (pair.energySamples < 5 || pair.momentumSamples < 5) failures.push('crash lab: the energy / momentum graphs have no samples');
      if (pair.balance > 0.05) failures.push(`crash lab: energy balance error ${(100 * pair.balance).toFixed(2)} %`);
      // Second run from the panel: 56 km/h, 40 % offset wall.
      await page.evaluate(() => {
        const kind = document.querySelector('.crashpanel select');
        kind.value = 'offsetWall';
        kind.dispatchEvent(new Event('change'));
        const speed = document.querySelector('.crashpanel input[type=number]');
        speed.value = '56';
        speed.dispatchEvent(new Event('change'));
        document.querySelector('.crashpanel button.primary').click();
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
    // 3. benchmark
    if (runBench && want('bench')) {
      const { page } = await openPage(browser, '?bench=1&warmup=3&seconds=12');
      await page.waitForFunction(() => window.__apex?.bench !== undefined, null, { timeout: 120000 });
      const bench = await page.evaluate(() => window.__apex.bench);
      const out = join(root, 'bench', 'results', 'M0-web-headless-swiftshader.json');
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

// End-to-end check in headless Chromium (§23.4, §2.2 screenshots):
//   1. golden_m0 in the browser worker must reproduce the native golden hashes (§23.1 결정론, native = WASM)
//   2. sandbox screenshots (docs/screenshots/)
//   2b. driving (§17, M1e): the Porsche launches, steers and brakes under keyboard input; drive screenshots
//   3. short benchmark run → bench/results/ (GPU-less CI machines render on SwiftShader: frame times there are
//      NOT representative of real hardware; physics timings are)
// Usage: npm run build && node tools/e2e.mjs [--no-bench] [--chromium /path/to/chrome]
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
    {
      const { page, consoleErrors } = await openPage(browser, '?golden=1');
      await page.waitForFunction(() => window.__apex?.golden !== undefined, null, { timeout: 240000 });
      const golden = await page.evaluate(() => window.__apex.golden);
      console.log('golden:', JSON.stringify(golden));
      if (!golden.pass) failures.push('browser golden hashes differ from native');
      if (consoleErrors.length) failures.push(`console errors (golden): ${consoleErrors.join(' | ')}`);
      await page.close();
    }
    // 2. screenshots
    {
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
    // 2b. driving: keyboard in, telemetry out (the car is the physics vehicle; the view is its GLB bound to it)
    {
      const dir = join(root, 'docs', 'screenshots');
      const { page, consoleErrors } = await openPage(browser, '?drive=porsche_911_turbo_991');
      await page.waitForFunction(() => window.__apex?.drive?.latest != null, null, { timeout: 120000 });
      const tel = () =>
        page.evaluate(() => {
          const s = window.__apex.drive.latest;
          return { kmh: s.speed * 3.6, gear: s.gear, up: s.up[1], fwd: [s.forward[0], s.forward[2]], pos: s.position };
        });
      await page.waitForTimeout(2000);
      const rest = await tel();
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(5000);
      const launched = await tel();
      await page.screenshot({ path: join(dir, 'M1-drive-launch.png') });
      await page.keyboard.down('KeyA');
      await page.waitForTimeout(1500);
      await page.keyboard.up('KeyA');
      await page.keyboard.up('KeyW');
      const turned = await tel();
      await page.screenshot({ path: join(dir, 'M1-drive-turn.png') });
      await page.keyboard.down('KeyS');
      await page.waitForTimeout(5000);
      await page.keyboard.up('KeyS');
      const stopped = await tel();
      const heading = (f) => Math.atan2(f[0], f[1]);
      const turn = Math.abs(heading(turned.fwd) - heading(launched.fwd));
      console.log('drive:', JSON.stringify({ rest: rest.kmh, launched: launched.kmh, gear: launched.gear, turnRad: turn, stopped: stopped.kmh }));
      if (Math.abs(rest.kmh) > 2) failures.push(`drive: the car creeps at rest (${rest.kmh.toFixed(1)} km/h)`);
      if (launched.kmh < 40) failures.push(`drive: only ${launched.kmh.toFixed(1)} km/h after 5 s of throttle`);
      if (launched.gear < 2) failures.push('drive: the automatic did not upshift');
      if (turn < 0.1) failures.push(`drive: steering left turned the car by only ${turn.toFixed(3)} rad`);
      if (Math.abs(stopped.kmh) > 3) failures.push(`drive: still ${stopped.kmh.toFixed(1)} km/h after 5 s of braking`);
      if (Math.min(rest.up, launched.up, turned.up, stopped.up) < 0.9) failures.push('drive: the car tipped over');
      const errors = await page.evaluate(() => window.__apex.errors);
      if (errors.length || consoleErrors.length) failures.push(`errors (drive): ${[...errors, ...consoleErrors].join(' | ')}`);
      await page.close();
    }
    // 3. benchmark
    if (runBench) {
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

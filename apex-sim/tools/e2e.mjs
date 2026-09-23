// End-to-end check in headless Chromium (§23.4, §2.2 screenshots):
//   1. golden_m0 in the browser worker must reproduce the native golden hashes (§23.1 결정론, native = WASM)
//   2. sandbox screenshots (docs/screenshots/)
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

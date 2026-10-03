// Scratch survey: crash-lab scenarios, a 3/4 shot of the result with the UI hidden.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const PORT = 4179, base = `http://localhost:${PORT}/`;
const dir = process.argv[2];
const cases = JSON.parse(process.argv[3]);
const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => proc.stdout.on('data', (d) => String(d).includes('localhost') && r()));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
try {
  for (const c of cases) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${base}?crash=porsche_911_turbo_991&${c.q}&go=1&backend=webgl2`);
    await page.waitForFunction(() => window.__apex?.ready === true, null, { timeout: 120000 });
    const t0 = Date.now();
    await page.waitForFunction(() => { const cs = window.__apex.crash?.cars ?? []; return cs.length && cs.every((a) => a.state && a.state.speed < 0.6) && cs[0].state.crashEvents > 0; }, null, { timeout: 900000, polling: 1000 });
    const info = await page.evaluate((view) => {
      const cars = window.__apex.crash.cars;
      window.__apex.crash.follow = false;
      document.querySelectorAll('body > div').forEach((e) => { if (!e.querySelector('canvas')) e.style.display = 'none'; });
      const p = cars[0].state.position;
      const v = window.__apex.viewer;
      v.camera.position.set(p[0] + view[0], p[1] + view[1], p[2] + view[2]);
      v.controls.target.set(p[0], p[1] + 0.4, p[2]);
      v.controls.update?.();
      return cars.map((a) => ({ speed: a.state.speed.toFixed(2), faults: a.state.faults, events: a.state.crashEvents, peakG: a.state.eventPeakG.toFixed(1), dv: (a.state.eventDeltaV * 3.6).toFixed(1), pos: a.state.position.map((x) => x.toFixed(2)) }));
    }, c.view ?? [4.5, 2.2, 5]);
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${dir}/${c.name}.png` });
    console.log(c.name, ((Date.now() - t0) / 1000).toFixed(0) + 's', JSON.stringify(info), errors.length ? 'ERRORS ' + errors.slice(0, 3).join(' | ') : '');
    await page.close();
  }
} finally {
  await browser.close();
  proc.kill();
}

// Packages the full web app for a Claude Artifact (KNOWN_ISSUES W8): single-thread WASM + message transport (the host
// gives no cross-origin isolation), hash routes (#drive default, #drive.<vehicle id>, #garage, #sandbox), GLBs as
// base64 text (the host serves no .glb), fonts from Google Fonts (the host's CSP admits no other font source).
//   node tools/artifact/package-app.mjs <outDir>
// Writes <outDir>/pub/ and <outDir>/files.json (published path → local file) for the Artifact publish call.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = process.argv[2];
if (!out) throw new Error('usage: package-app.mjs <outDir>');
const build = join(out, 'build'), pub = join(out, 'pub');
rmSync(out, { recursive: true, force: true });
execFileSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', build, '--emptyOutDir'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_APEX_ARTIFACT: '1', VITE_APEX_GLB_BASE64: '1' },
});

const files = {};
/** `from`: a local file path, or the content itself (Buffer). */
const put = (path, from) => {
  const dest = join(pub, path);
  mkdirSync(dirname(dest), { recursive: true });
  if (Buffer.isBuffer(from)) writeFileSync(dest, from);
  else copyFileSync(from, dest);
  files[path] = dest;
};
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

let entry = '', style = '';
for (const file of walk(build)) {
  const path = relative(build, file).split('\\').join('/');
  if (path.endsWith('.map') || /\.(woff2?|ttf)$/.test(path) || path === 'index.html' || path === '_headers') continue;
  if (path.startsWith('wasm/sbc.')) continue; // threaded module: unusable without SharedArrayBuffer
  if (path.endsWith('.glb')) {
    put(`${path}.txt`, Buffer.from(readFileSync(file).toString('base64')));
    continue;
  }
  if (/^assets\/index-.*\.js$/.test(path)) entry = path;
  if (/^assets\/index-.*\.css$/.test(path)) {
    style = path;
    // The bundled @font-face files are not published (see the header): drop their rules instead of 404ing.
    put(path, Buffer.from(readFileSync(file, 'utf8').replace(/@font-face\{[^}]*\}/g, '')));
    continue;
  }
  put(path, file);
}
if (!entry || !style) throw new Error('entry script or stylesheet not found in the build');

// The Artifact wraps this in its own <html>/<head>/<body>: page content only.
put('index.html', Buffer.from(`<title>APEX_SIM 주행</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=JetBrains+Mono:wght@400;600&family=Noto+Sans+KR:wght@400;600&display=swap">
<link rel="stylesheet" href="${style}">
<style>
  /* Pretendard ships with the app build but this host serves no fonts of its own: Inter + Noto Sans KR instead. */
  :root { --font-ui: Inter, 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', sans-serif; --font-num: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
  html, body { background: #0b0d10; }
</style>
<canvas id="view" tabindex="0" aria-label="3D 주행 화면"></canvas>
<script type="module" src="${entry}"></script>
`));
writeFileSync(join(out, 'files.json'), JSON.stringify(files, null, 2) + '\n');
const total = Object.values(files).reduce((a, f) => a + statSync(f).size, 0);
console.log(`artifact app → ${pub} (${Object.keys(files).length} files, ${(total / 1048576).toFixed(1)} MB)`);

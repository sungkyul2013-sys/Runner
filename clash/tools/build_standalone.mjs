#!/usr/bin/env node
// Builds a single self-contained play.html from index.html.
//   - <link rel="stylesheet" href="..."> (local)  -> inline <style>
//   - <script src="..."></script> (local)        -> inline <script>, original order kept
//   - every PNG in assets/cards and assets/portraits, every JPG in assets/arena, and
//     assets/guide_placement.jpg -> base64 data URI in window.RA_ASSETS,
//     plus a patch that rewrites HTMLImageElement#src assignments of those paths to the data URI.
// Missing referenced files are skipped with a warning (the browser would just 404 them).
// Usage: node tools/build_standalone.mjs   (Node 18+, no dependencies)

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'play.html');
const IMAGE_DIRS = ['assets/cards', 'assets/portraits'];          // *.png
const JPEG_DIRS = ['assets/arena'];                               // *.jpg
const JPEG_FILES = ['assets/guide_placement.jpg'];                // single files

const warnings = [];
const stats = { styles: 0, scripts: 0, images: 0 };

// Keep inline code from closing its own <script>/<style> element.
const escapeForInline = (s) => s.replace(/<\/(script|style)/gi, '<\\/$1');

function readLocal(rel) {
  const abs = path.resolve(ROOT, rel);
  if (!abs.startsWith(ROOT + path.sep)) throw new Error('path escapes project: ' + rel);
  try {
    return readFileSync(abs, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') { warnings.push('missing, skipped: ' + rel); return null; }
    throw e;
  }
}

function isLocal(url) {
  return !!url && !/^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(url);
}

function attr(tag, name) {
  const m = tag.match(new RegExp('\\s' + name + '\\s*=\\s*["\']?([^"\'\\s>]+)', 'i'));
  return m ? m[1] : null;
}

// ---- image map ----
function buildAssetBlock() {
  const map = {};
  for (const dir of IMAGE_DIRS) {
    const abs = path.join(ROOT, dir);
    let files = [];
    try { files = readdirSync(abs).filter((f) => /\.png$/i.test(f)).sort(); } catch (e) {
      if (e.code === 'ENOENT') { warnings.push('missing image dir, skipped: ' + dir); continue; }
      throw e;
    }
    for (const f of files) {
      const key = dir + '/' + f;
      const b64 = readFileSync(path.join(abs, f)).toString('base64');
      map[key] = 'data:image/png;base64,' + b64;
      stats.images++;
    }
  }
  for (const dir of JPEG_DIRS) {
    const abs = path.join(ROOT, dir);
    let files = [];
    try { files = readdirSync(abs).filter((f) => /\.jpe?g$/i.test(f)).sort(); } catch (e) {
      if (e.code === 'ENOENT') { warnings.push('missing image dir, skipped: ' + dir); continue; }
      throw e;
    }
    for (const f of files) {
      const key = dir + '/' + f;
      const b64 = readFileSync(path.join(abs, f)).toString('base64');
      map[key] = 'data:image/jpeg;base64,' + b64;
      stats.images++;
    }
  }
  for (const rel of JPEG_FILES) {
    let buf;
    try { buf = readFileSync(path.join(ROOT, rel)); } catch (e) {
      if (e.code === 'ENOENT') { warnings.push('missing, skipped: ' + rel); continue; }
      throw e;
    }
    map[rel] = 'data:image/jpeg;base64,' + buf.toString('base64');
    stats.images++;
  }
  const lines = Object.keys(map).map((k) => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(map[k]) + ',');
  const json = '{\n' + lines.join('\n') + '\n}';
  return [
    '<script>',
    '/* embedded card & portrait art */',
    'window.RA_ASSETS = ' + json.replace(/<\//g, '<\\/') + ';',
    '</script>',
    '<script>',
    '/* route image loads of embedded paths to their data URIs */',
    '(function () {',
    '  var A = window.RA_ASSETS || {};',
    '  var desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");',
    '  if (!desc || !desc.set) return;',
    '  Object.defineProperty(HTMLImageElement.prototype, "src", {',
    '    configurable: true, enumerable: desc.enumerable, get: desc.get,',
    '    set: function (v) {',
    '      var k = typeof v === "string" ? v : null;',
    '      if (k !== null && Object.prototype.hasOwnProperty.call(A, k)) v = A[k];',
    '      return desc.set.call(this, v);',
    '    }',
    '  });',
    '})();',
    '</script>',
  ].join('\n');
}

// ---- build ----
let html = readFileSync(SRC, 'utf8');
const assetBlock = buildAssetBlock();
let assetsInjected = false;

html = html.replace(/<link\b[^>]*>/gi, (tag) => {
  const rel = attr(tag, 'rel') || '';
  if (!/stylesheet/i.test(rel)) return tag;
  const href = attr(tag, 'href');
  if (!isLocal(href)) return tag;
  const css = readLocal(href);
  if (css === null) return '';
  stats.styles++;
  return '<style>/* ' + href + ' */\n' + escapeForInline(css) + '\n</style>';
});

html = html.replace(/<script\b[^>]*\bsrc\s*=[^>]*>\s*<\/script>/gi, (tag) => {
  const src = attr(tag, 'src');
  if (!isLocal(src)) return tag;
  const js = readLocal(src);
  const body = js === null ? '' : '<script>/* ' + src + ' */\n' + escapeForInline(js) + '\n</script>';
  if (js !== null) stats.scripts++;
  if (!assetsInjected) { assetsInjected = true; return assetBlock + '\n' + body; }
  return body;
});

if (!assetsInjected) {
  // no game scripts found: still inject the asset block before </head> or </body>
  html = html.replace(/<\/head>|<\/body>/i, (m) => assetBlock + '\n' + m);
}

writeFileSync(OUT, html, 'utf8');
const size = Buffer.byteLength(html, 'utf8');
console.log('wrote ' + path.relative(process.cwd(), OUT) + ' (' + size.toLocaleString('en-US') + ' bytes)');
console.log('inlined: ' + stats.styles + ' stylesheet(s), ' + stats.scripts + ' script(s), ' + stats.images + ' image(s)');
for (const w of warnings) console.warn('warning: ' + w);

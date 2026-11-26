/**
 * Builds a single self-contained flight.html (SKY ACE: Horizon) with Three.js and
 * all textures inlined, so it runs from any static host / raw link.
 * Run: `npm run build:flight`.
 */
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';

const result = await build({
  entryPoints: ['flight/src/main.ts'],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  loader: { '.jpg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl' },
  define: { 'import.meta.env': '{"DEV":false}' },
  write: false,
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<meta name="theme-color" content="#05080d" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<title>SKY ACE: Horizon</title>
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#05080d;touch-action:none;-webkit-user-select:none;user-select:none;overscroll-behavior:none}#game{display:block;width:100%;height:100%;position:fixed;inset:0}</style>
</head>
<body>
<canvas id="game"></canvas>
<script>${js}</script>
</body>
</html>
`;
writeFileSync('flight.html', html);
console.log(`Wrote flight.html (${(html.length / 1024).toFixed(0)} KB)`);

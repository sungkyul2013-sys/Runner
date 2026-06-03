/**
 * Builds a single self-contained, zero-dependency play.html from the current
 * source: bundles src/main.ts (Three.js included) into one inline <script> so
 * the file runs straight from a static host / githack raw link with no extra
 * requests. Run: `npm run build:standalone`.
 */
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';

const result = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  define: { 'import.meta.env': '{"DEV":false}' },
  write: false,
});

// Escape any stray "</script" so inlining can't terminate the script tag early.
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>Sunset Runner — 석양 러너</title>
    <style>
      :root { color-scheme: dark; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        width: 100%; height: 100%; overflow: hidden; background: #120a22;
        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        touch-action: none; -webkit-user-select: none; user-select: none;
        overscroll-behavior: none;
      }
      #game { display: block; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <script>${js}</script>
  </body>
</html>
`;

writeFileSync('play.html', html);
console.log(`Wrote play.html (${(html.length / 1024).toFixed(0)} KB)`);

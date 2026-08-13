/**
 * Builds the 수 국어논술 app into a single self-contained HTML file — every
 * byte of JS (Three.js included) and CSS inlined, zero network requests.
 *
 *   node scripts/buildAppStandalone.mjs            → soo-korean.html (full doc)
 *   node scripts/buildAppStandalone.mjs --fragment out.html
 *       → a <title>/<style>/markup/<script> fragment for hosts that supply
 *         their own <html>/<head>/<body> skeleton.
 *
 * Run: `npm run build:app`
 */
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const fragmentIndex = args.indexOf('--fragment');
const asFragment = fragmentIndex !== -1;
const outFile = asFragment ? (args[fragmentIndex + 1] ?? 'soo-korean.fragment.html') : 'soo-korean.html';

const result = await build({
  entryPoints: ['src/app/main.ts'],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  define: { 'import.meta.env': '{"DEV":false}' },
  loader: { '.css': 'css' },
  // esbuild needs a nominal output path before it will emit the CSS sibling;
  // nothing is actually written to disk because `write` is false.
  outfile: 'node_modules/.cache/soo-app.js',
  write: false,
});

const jsFile = result.outputFiles.find((f) => f.path.endsWith('.js'));
const cssFile = result.outputFiles.find((f) => f.path.endsWith('.css'));
if (!jsFile) throw new Error('esbuild produced no JS output');

// Escape any stray "</script" / "</style" so inlining cannot close the tag early.
const js = jsFile.text.replace(/<\/script/gi, '<\\/script');
const css = (cssFile?.text ?? '').replace(/<\/style/gi, '<\\/style');

const TITLE = '수 국어논술';
const BODY = `
    <div id="boot" class="boot">
      <div class="boot__mark">수</div>
      <div class="boot__bar"><i></i></div>
    </div>
    <div id="app"></div>`;

const fragment = `<title>${TITLE}</title>
<style>${css}</style>
${BODY}
<script>${js}</script>
`;

const fullDoc = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta
      name="description"
      content="수 국어논술 — 스무 개의 단계를 넘으며 문학·문법·비문학·어휘·논술을 익히는 3D 국어 학습 게임."
    />
    <meta name="theme-color" content="#080b0f" />
    <title>${TITLE}</title>
    <style>${css}</style>
  </head>
  <body>${BODY}
    <script>${js}</script>
  </body>
</html>
`;

const out = asFragment ? fragment : fullDoc;
writeFileSync(outFile, out);
console.log(`Wrote ${outFile} (${(out.length / 1024).toFixed(0)} KB, js ${(js.length / 1024).toFixed(0)} KB, css ${(css.length / 1024).toFixed(0)} KB)`);

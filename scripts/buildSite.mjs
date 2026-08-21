/**
 * Builds a single self-contained HTML file from one of the site entries:
 * bundles its TypeScript (Three.js and the stylesheets included) into one
 * inline <script> plus one inline <style>, so the page runs from any static
 * host — or straight off the filesystem — with zero extra requests.
 *
 *   node scripts/buildSite.mjs                     → su-academy.html (the app)
 *   node scripts/buildSite.mjs --entry story       → su-story.html
 *   node scripts/buildSite.mjs --entry raon        → su-raon.html (라온국어)
 *   node scripts/buildSite.mjs --artifact <path> [--title <name>]
 *       → also writes a wrapper-free copy (title + style + markup + script
 *         only) for hosts that supply their own <html>/<head>/<body>, with an
 *         optional shorter title for gallery-style listings.
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

const ENTRIES = {
  app: { source: 'index.html', script: 'app/main.ts', out: 'su-academy.html' },
  story: { source: 'story.html', script: 'story/main.ts', out: 'su-story.html' },
  raon: { source: 'raon.html', script: 'raon/main.ts', out: 'su-raon.html' },
};

const entry = ENTRIES[arg('--entry') ?? 'app'];
if (!entry) throw new Error(`unknown --entry; expected one of ${Object.keys(ENTRIES).join(', ')}`);

const result = await build({
  entryPoints: [entry.script],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  outdir: 'out',
  // No import.meta in an IIFE bundle: fold the dev-only branch away.
  define: { 'import.meta.env': '{"DEV":false}', 'import.meta.hot': 'undefined' },
  loader: { '.css': 'css' },
  write: false,
});

const pick = (ext) => {
  const file = result.outputFiles.find((f) => f.path.endsWith(ext));
  if (!file) throw new Error(`esbuild produced no ${ext} output`);
  return file.text;
};

// Escape any stray "</script" so inlining can't close the tag early.
const js = pick('.js').replace(/<\/script/gi, '<\\/script');
const css = pick('.css');

const source = readFileSync(entry.source, 'utf8');

const title = source.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '수 국어논술 학원';
const bodyInner = source
  .match(/<body>([\s\S]*)<\/body>/)?.[1]
  .replace(/\s*<script type="module"[\s\S]*?<\/script>/, '')
  .trimEnd();

if (!bodyInner) throw new Error('could not read <body> out of index.html');

const head = `<title>${title}</title>\n<style>\n${css}</style>`;

writeFileSync(
  entry.out,
  `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    ${head.replace(/\n/g, '\n    ')}
  </head>
  <body>
${bodyInner}
    <script>${js}</script>
  </body>
</html>
`,
);
console.log(`${entry.out} written`);

const artifactPath = arg('--artifact');
if (artifactPath) {
  const name = arg('--title') ?? title;
  writeFileSync(
    artifactPath,
    `<title>${name}</title>\n<style>\n${css}</style>\n${bodyInner}\n<script>${js}</script>\n`,
  );
  console.log(`${artifactPath} written`);
}

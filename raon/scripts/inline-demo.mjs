// dist-demo 의 HTML·JS·CSS 를 한 파일(dist-demo/raon-preview.html)로 합친다
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist-demo';
let html = readFileSync(join(dir, 'demo/index.html'), 'utf8');

html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, (_, src) => {
  const js = readFileSync(join(dir, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/, (_, href) => `<style>${readFileSync(join(dir, href), 'utf8')}</style>`);

// 게시할 때 문서 틀(<html>, <head>, <body>)이 씌워지므로 안쪽만 남긴다
const head = html.match(/<head>([\s\S]*)<\/head>/)[1].replace(/<meta charset="UTF-8" \/>|<meta name="viewport"[^>]*>/g, '');
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
const out = `${head.trim()}\n${body.trim()}\n`;
writeFileSync(join(dir, 'raon-preview.html'), out);
console.log(`raon-preview.html ${(out.length / 1024 / 1024).toFixed(2)} MB`);

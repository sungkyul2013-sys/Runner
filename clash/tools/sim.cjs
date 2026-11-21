// Headless engine smoke test: AI-vs-AI matches for every default deck pairing. Usage: node tools/sim.cjs [matches]
const fs = require('fs'), path = require('path'), vm = require('vm');
const mem = {}; global.window = global; global.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => (mem[k] = v), removeItem: (k) => delete mem[k] };
global.performance = performance; global.document = { hidden: false };
const load = (f) => vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
['data.js', 'cardtext.js', 'save.js', 'mods.js', 'engine.js', 'ai.js'].forEach(load);
const RA = global.RA; RA.Save.data.settings.damageNumbers = false;
const decks = RA.Save.defaults().decks, N = +process.argv[2] || 10; let w = [0, 0, 0], errs = 0, long = 0;
for (let m = 0; m < N; m++) {
  const D = process.argv[3] ? [decks[1], decks[1]] : [decks[m % 5], decks[(m * 3 + 1) % 5]]; const g = new RA.Game({ deck0: D[0], deck1: D[1], level0: 11, level1: 11, difficulty: 'hard' });
  g.ai0 = new RA.AI(g, 0, 'hard'); g.ai.elixirMul = 1; g.ai0.elixirMul = 1; const origUpdate = g.ai.update.bind(g.ai); g.ai.update = (dt) => { origUpdate(dt); g.ai0.update(dt); };
  try { for (let i = 0; i < 30 * 400 && g.phase !== 'ended'; i++) g.step(1 / 30); } catch (e) { errs++; console.error('ERR match', m, e.stack); continue; }
  if (g.phase !== 'ended') long++; const r = g.result || { winner: 9, crowns: g.crowns, reason: 'unfinished' };
  w[r.winner === 0 ? 0 : r.winner === 1 ? 1 : 2]++; console.log('match', m, 'deck', m % 5, 'vs', (m * 3 + 1) % 5, '->', r.winner, r.reason, r.crowns.join('-'), 'ents', g.ents.length, 't', g.t.toFixed(0));
}
console.log('wins P0/P1/draw', w.join('/'), 'errors', errs, 'unfinished', long);

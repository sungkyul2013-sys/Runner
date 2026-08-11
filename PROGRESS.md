# METRO SURF (메트로 서프) — Progress

A complete 3D subway endless runner built with Vite + TypeScript + Three.js.
Three rail lanes through a working train yard: leap onto carriage roofs, roll
under gantries, dodge the oncoming express and stay ahead of the inspector and
his dog. All original code and 100 % procedural assets — no downloads, no
external art, runs offline.

## Gameplay

- **Yard**: ballast, timber sleepers and continuous steel rails scrolling by
  texture offset, maintenance walkways with painted safety lines, catenary
  masts strung with contact wire, signal gantries, arc lamps, relay huts,
  tagged boundary walls and water towers.
- **Obstacle vocabulary** — carriages (short/long, low/full height), an
  **oncoming express** that rushes the player with a telegraphed warning,
  **tunnel bores** whose soffit scrapes anyone still up on a roof, boarding
  **ramps**, jump hurdles, roll-under gantries (including ones mounted on
  carriage roofs), signal pylons, buffer stops and crate stacks. Overhead
  clearance is modelled physically: standing vs rolling height against a
  per-cell ceiling, shared by collision, coin routing and the checker.
- **Roof running**: ramps lift you to low-roof height; from a roof you can hop
  to a full-height rake. Ramp slopes are interpolated analytically so support
  height always matches the art.
- **The chase**: a yard inspector and his dog run behind you, hang back on a
  clean run and surge onto your heels the moment you stumble. Crash while
  stumbling and the inspector lunges for the collar.
- **Stumble system**: clipping a hurdle, crate or gantry trips you instead of
  ending the run — a second mistake inside the recovery window is fatal.
  Hardcore mode grants none; 솔 grants an extra.
- **Power-ups**: Coin Magnet, 2× Multiplier, Super Sneakers and the Jetpack,
  all upgradeable, plus spare hoverboards, coin bags, keys and mystery boxes.
- **Hoverboard**: double-tap to deploy; absorbs a crash (twice on the Phantom
  deck). Eight decks with distinct perks (extra time, super jump + auto-hop,
  permanent magnet, double coins, speed).
- **Word hunt**: collect M‑E‑T‑R‑O across runs for a key and 500 coins.
- **Score**: distance × a multiplier that ramps every 500 m (cap ×30), stacked
  with mission bonuses, mode rules, the 2× power-up and the score booster.
- **Coin routing**: every spawned segment publishes its occupancy grid, and the
  coin trail is traced along a *survivable* line through it — the coins arc over
  hurdles, dip under gantries and climb ramps onto roofs, so they teach the line.
- **5 modes**: 엔들리스 · 타임 어택 (90 s + checkpoints) · 코인 러시 ·
  특급 러시 (express-biased) · 하드코어 (no revive, ×2 score).
- **8 districts** on a world tour (서울 → 도쿄 야경 → 뉴욕 → 리우 → 아이슬란드
  → 사막 협곡 → 네온 지하 → 설원), each swapping sky, sun, fog, stars, skyline
  tint and ballast colour.

## Meta

- **12 characters**, each with a hand-built look and a passive perk, plus
  **36 outfits** (two alternates each) that re-style the rig without touching
  the perk — previewed live on the gallery card and carried into the run.
- **8 hoverboards** with their own perks and liveries.
- **Missions**: three live at a time; clearing a set banks coins and raises the
  permanent score multiplier by one, then rolls a fresh, harder set. Any single
  mission can be re-rolled for a key.
- **6 upgrades**, **4 consumables** (headstart, score booster, spare board,
  mystery box), **14 achievements**, a 7-day daily streak, a 9-stop world-tour
  reward track and a top-8 run board with per-mode bests.
- **Keys** are the premium currency: revives (escalating cost), headline
  characters and boards, mission re-rolls.
- **Save**: guarded localStorage profile (wallet, bests, top runs, owned/equipped
  character and board, upgrades, inventory, missions, word hunt, daily streak,
  lifetime stats, settings).

## Presentation

- Chunky articulated character rig — shoulders, elbows, hips, knees, neck and
  torso pivots drive a real sprint with counter-rotation, an airborne tuck, a
  baseball-slide roll, a pitched-forward stumble and a hoverboard carve.
- HUD: score with a live multiplier, distance, wallet, power-up countdown rings,
  word-hunt strip, hoverboard button with its ride gauge, mission toasts,
  express warnings, combo meter, resume countdown.
- Menus: home with a live 3D runner and a compact mission strip, crew and board
  galleries with live previews and an inline outfit swatch row, shop, and a
  records hub (missions / top runs / daily / world tour / achievements), plus
  settings, help and a rich results screen.
- Juice: bloom, particle bursts, screen shake, hit-stop, coin combos,
  near-misses, district banners, new-record celebration; synthesised Web Audio
  SFX (including the inspector's whistle) and a looping BGM.
- Perf: instanced coins (one draw call), per-kind obstacle pooling with
  re-tinted liveries, texture-offset track scrolling, DPR clamp, quality toggle.

## Verification

- `npm run build` — strict `tsc --noEmit` + Vite bundle.
- `npm run check:templates` — walks every layout template with the real jump
  arc, roll window, roof heights, overhead clearance and ramp-boarding rules,
  proving all 35 are clearable, and checks no two pieces overlap.
- `npm run check:meta` — data integrity plus live save behaviour: economy,
  buying/equipping characters, boards and outfits, mission progress and set
  rollover, the word hunt, run recording and the top-run board, milestones,
  achievements and the daily streak.
- `npm run build:standalone` — regenerates the self-contained `play.html`.
- Browser pass (Playwright + Chromium): menus, galleries, a full run, pause and
  results verified error-free at both desktop and phone viewports.

## Controls

- Move: ← → / A D or swipe. Jump: ↑ / W / Space / swipe up.
  Roll: ↓ / S / swipe down. Hoverboard: double-tap / Shift / E.
  Pause: Esc / P.

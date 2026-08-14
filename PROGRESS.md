# Progress

This repo now holds three entry points, all built by one `npm run build`:

- **`index.html` → 수 국어논술 (app)** — a mobile-first learning app: a
  12-question Korean diagnostic with three answer mechanics, a lab where you
  mark up a student's paragraph yourself, a four-week plan generator, and a
  six-stage 24-session course you can run **by date** (a calendar timetable)
  or **by stage** (a curriculum ladder), with the writing sessions done in
  the app. Source in `app/`, documented in [`app/README.md`](app/README.md).
- **`story.html` → 수 국어논술 학원 (site)** — the scroll-driven brochure
  site. Source in `story/`, documented in [`story/README.md`](story/README.md).
- **`game.html` → Sunset Runner** — the original endless runner (was
  `index.html`). Source in `src/`, unchanged. `play.html` remains the
  self-contained standalone build.

The Three.js layer is shared by the app and the site in `shared/three/`, and
runs in two coats: `Solids.ts` builds the blocky 수 mark, and `Field.ts`
spells 국어논술 out of points below it, so the opening screen states the
academy's name in 3D. The pair is fitted into the hero's reserved band by
measurement rather than by guesswork, at every viewport. `npm run build:site` and `npm run build:story` emit
single-file, zero-request builds of the app and the site respectively.

---

## Sunset Runner (석양 러너)

A warm, sunset-themed 3-lane endless runner built with Vite + TypeScript +
Three.js. Reimplemented (original code) from the reference **Sunset Runner**
(github.com/sungkyul2013-sys/games) on a modular manager/system engine.

## Done
- **World**: gradient sky dome (top/mid/bottom per biome), glowing sun + halo,
  320 stars, mountain silhouettes, scrolling palms + lit buildings.
- **6 biomes** (석양/황혼/야간/새벽/창공/오로라) lerped on level-up every 320m.
- **Physics** matched to reference (gravity −38, jump 14, base 11 / max 25).
- **Modes**: Endless + Challenge (60s time-attack, +time at checkpoints).
- **Levels** every 320m (biome shift), **checkpoints** every 800m.
- **8 characters** with abilities (magnet/score/coin mult, lane speed, low-grav,
  revive), each a primitive humanoid (skin/shirt/pants/shoes/hat) + run anim.
- **Power-ups**: magnet, x2, boots, glide, rocket, hoverboard shield, bomb.
- **Consumables**: bomb + rocket (bought, carried, on-screen buttons).
- **5 upgrades** (durations + coin value + headstart), bought with coins.
- **Achievements** (9) + **daily rewards** (7-day cycle) + **gems/mileage**.
- **Save**: localStorage profile (wallet, bests, owned/selected, upgrades,
  inventory, achievements, daily, lifetime stats, settings). Guarded.
- **UI**: sunset glass theme — home (brand, char tag, mode select, play, tabs),
  shop (5 tabs), settings, pause, rich game-over; redesigned in-run HUD.
- **Juice**: bloom, particles, screen shake, hit-stop, combos, near-miss,
  level banners; synthesised Web Audio SFX + BGM + mute.
- **Perf**: instanced coins, pooling everywhere, DPR clamp, quality toggle,
  loading screen.

## Verification
- `npm run build` — strict tsc + vite bundle (green).
- `npm run check:templates` — all segment templates clearable.
- `npm run check:meta` — save/economy/upgrades/achievements/daily/run logic.
- `npm run build:standalone` — regenerates self-contained `play.html`.

## Controls
- Move: ← → / A D or swipe.  Jump: ↑ / W / Space / swipe up.  Slide: ↓ / S /
  swipe down.  Hoverboard: double-tap / Shift / E.  Items: on-screen 💣 / 🚀.
  Pause: Esc / P.

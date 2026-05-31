# NeonDash — Progress

A Subway-Surfers-style 3D endless runner built with Vite + TypeScript + Three.js.
All IP is original; assets are assembled from Three.js primitives.

## Phases

### ✅ Phase 0 — Scaffold
- [x] Vite + TypeScript + Three.js project setup
- [x] Scene / Camera / Renderer with neon lighting + fog
- [x] Window resize handling
- [x] requestAnimationFrame loop with clamped delta time
- [x] Dev FPS overlay (custom, no external dep)
- [x] Central tunable constants (`src/config/constants.ts`)

### ✅ Phase 1 — Core Runner
- [x] Infinite scrolling ground / track with lane stripes
- [x] Player capsule
- [x] 3-lane lateral movement (smooth lerp)
- [x] Jump (gravity parabola)
- [x] Slide (shrinks hitbox, timed)
- [x] Input: keyboard (Arrows / WASD) + touch swipe (diagonal-aware)
- [x] Follow camera (behind + above) with speed-based FOV easing
- [x] GameStateManager (MENU / PLAYING / PAUSED / GAMEOVER)

### ✅ Phase 2 — Procedural Track + Obstacles
- [x] Slot-based segment templates (always clearable)
- [x] Forward spawn + rear recycle (object pooling)
- [x] Obstacles: static & moving trains, low barriers, high tunnels, side walls
- [x] Custom AABB collision → game over
- [x] Difficulty ramp (density + speed scale with distance)
- [x] No memory growth (pool reuse + dispose on discard)

### ✅ Phase 3 — Coins & Score + mechanics expansion
- [x] Coin patterns (line / jump-arch), pooled, with magnet hook
- [x] Pickup + counter + score (particles/SFX hooked for Phase 7)
- [x] Score = distance + coins × value × multiplier
- [x] Rideable obstacles (low train / crate): jump onto the roof and ride
- [x] More duck hazards (overhead signs) + player ground-height physics
- [x] Collision resolves support (roof) vs fatal vs near-miss in one pass

### ✅ Phase 4 — Power-ups (+ Rocket & Bomb)
- [x] Magnet, 2× score, Super Sneakers, Jetpack (flight + coin vacuum)
- [x] Rocket = speed + altitude boost; Bomb = destroys obstacles ahead
- [x] Hoverboard = deployable (double-tap / Shift / E) 1-hit shield + invuln
- [x] HUD remaining-time rings + hoverboard charge badge
- [x] Pooled pickup tokens, weighted spawns

### ✅ Phase 5 — Screens & Flow
- [x] GameStateManager flow: MENU (attract) / PLAYING / PAUSED / GAMEOVER
- [x] Animated neon home menu (Play / Characters / Shop / Settings + stats)
- [x] Character carousel with live attract-mode preview
- [x] Pause sheet (Esc/P + button), Settings (mute/quality)
- [x] Rich game-over (score/coins/best/NEW, Revive, Restart, Menu)

### ✅ Phase 6 — Meta Systems
- [x] localStorage persistence (SaveManager) — verified with `npm run check:meta`
- [x] Shop: characters, cosmetics, ability potions, power-up duration upgrades
- [x] Character abilities (magnet / headstart / coin bonus) + potions to upgrade
- [x] Cosmetics: hair styles + outfits applied to the rig
- [x] Missions: rotating 3 (coins / distance / jetpack) with rewards + rotation
- [x] Rank: XP from runs → level-ups → coin rewards; XP bar on home

### ✅ Phase 7 — Polish & Effects
- [x] Pooled particles (coin sparkle, crash debris, bomb blast, slide puff, aura)
- [x] UnrealBloom neon glow (quality-toggleable)
- [x] Screen shake + hit-stop on crashes/bombs
- [x] Biome / day-night colour transitions over distance
- [x] Score/combo popups + near-miss "CLOSE!" bonus
- [x] Synthesised Web Audio SFX + BGM + mute toggle (no asset files)

### ✅ Phase 8 — Performance & Build
- [x] Coins rendered as a single InstancedMesh (one draw call)
- [x] Object pooling everywhere (obstacles, coins, pickups, particles) — bounded
- [x] Mobile DPR clamp + quality setting (bloom + DPR) in Settings
- [x] Loading screen with progress bar
- [x] Production build (`npm run build`) + standalone `play.html`

## Controls
- **Move lanes:** ← / → or A / D, or swipe left/right
- **Jump:** ↑ / W / Space, or swipe up
- **Slide:** ↓ / S, or swipe down
- **Restart (after game over):** Space / Enter / tap

## Run
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production bundle
npm run preview  # serve the production build
```

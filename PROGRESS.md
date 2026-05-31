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

### ⬜ Phase 4 — Power-ups
- [ ] Magnet, 2× score, Jetpack, Super Sneakers, Hoverboard
- [ ] HUD remaining-time rings

### ⬜ Phase 5 — Screens & Flow
- [ ] Home menu, character carousel, pause overlay, game-over screen

### ⬜ Phase 6 — Meta Systems
- [ ] localStorage persistence
- [ ] Shop (characters + power-up upgrades)
- [ ] Missions (rotating 3)
- [ ] Rank / level / XP unlocks

### ⬜ Phase 7 — Polish & Effects
- [ ] Particles, UnrealBloom glow, screen shake + hit-stop
- [ ] Biome / day-night transitions, score popups, near-miss bonus, combos
- [ ] Music + SFX + mute toggle

### ⬜ Phase 8 — Performance & Build
- [ ] InstancedMesh for coins / repeated props
- [ ] Frustum culling, dispose audit, pooling check
- [ ] Mobile DPR clamp + quality settings, loading screen
- [ ] Production build

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

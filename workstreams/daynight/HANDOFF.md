# WS-DN — Day/Night Cycle — HANDOFF

Implementer: Opus 5 sub-agent (`opus5-game-dev`). Session truncated by the 600s background ceiling after code landed; this handoff completed by the Fable 5 orchestrator from the verified on-disk state.

## What was built

A progression-paired day/night cycle, `js/daynight.js` (378 lines), loaded LAST (after `js/vfx.js`). It modulates — never replaces — the palette `applyBiome()` installs, so biome identity and the cycle compose cleanly.

### Public API — `window.Game.dayNight`
| Member | Meaning |
|---|---|
| `time01` | 0..1 normalized time of day (0 midnight, .25 sunrise, .5 noon, .75 sunset) |
| `phase` | `'dawn' \| 'day' \| 'dusk' \| 'night'` (bands: night <.20/≥.84, dawn <.32, day <.70, dusk rest) |
| `nightFactor` / `dayFactor` | 0..1 darkness factor — smoothstep of sun height (−0.18..0.28); consumed by vfx.js aurora gate + stars |
| `sunHeight` | −1..1 sine of sun above horizon |
| `starScale` | `nightFactor * 1.18`; vfx.js clamps `starGoal * starScale` at .85 |
| `update(dt)` | advance + apply; called once per frame from `vfx.js update()` |
| `setTime(t)` | debug jump to absolute time01 |
| `ANCHORS`, `CYCLE_DISTANCE`, `HEMI_MIN` | tuning constants exposed for audit |

### Cycle design (hybrid progression-paired, per research §A)
- While PLAYING: `time01 += speed·dt / 4200` (CYCLE_DISTANCE) — one full cycle ≈ one long run. Menu: slow wall-clock drift (300 s/cycle).
- On `biome:change`, `time01` eases toward the biome anchor via shortest-path pull that decays over ~10 s (ANCHOR_RATE 0.5, ANCHOR_TAU 9) — cinematic sky shift, then free-running.
- Anchor mapping: **TWILIGHT PINES = 0.27 (dawn)** · **AURORA GLACIER = 0.90 (deep night)** · **WHITEOUT STORM = 0.74 (burning dusk)**.
- `game:start` resets to the dawn anchor.

### What the cycle drives per frame
- **Sun disc + vfx sun-glow group** ride the arc `(-cosθ·175, 6 + sinθ·112, −280)`, tinted between biome sun color and time-of-day keyframe.
- **Key DirectionalLight**: position follows sun; color = biome sun lerped 0.62 toward keyframes (dawn/dusk 0xff9a5a, midday 0xffe0a0, night 0xaaccff); intensity `1.7·(0.30 + 0.70·h)`, h = sunHeight^0.7.
- **Hemisphere light**: color = biome accent lerped 0.5 toward ambient keyframes; intensity `max(0.8, 1.25·(0.72 + 0.28·h))` — hard readability floor.
- **Fill/rim light**: brightens up to +95% at night, lerped toward moonlight 0xbcd8ff — silhouettes guaranteed at deepest night.
- **Sky dome**: 10-keyframe top/horizon gradient, smoothstep-blended, tinted 0.42 back toward the biome pair, painted via `vfx.paintSky()` throttled to every 4 frames + epsilon 0.004.
- **Fog + scene.background**: lerp between day/night variants derived from the biome palette on each `biome:change`.
- **Stars**: `starScale` consumed in vfx.js — 0 by day, up to .85 deep night, per-biome character preserved.
- **Aurora**: vfx.js gate now `biomeIndex === 1 && nightFactor > .5`, opacity scaled by `smoothstep(nightFactor, .5, .85)` — never visible in daylight.
- **Glow elements** (shards/pads/spires/sun glow): additive sprites, untouched by dimming — readable at night by construction.

## Files touched
- `js/daynight.js` — NEW; all cycle logic.
- `index.html` — one line: `<script type="module" src="js/daynight.js"></script>` after vfx.js.
- `js/vfx.js` — surgical: `paintSky()` extracted from `applyDomeColors()`; aurora darkness gate; star `starScale` consumption; one-line `window.Game.dayNight?.update(dt)` in `update()`; handles exported (`paintSky`, `skyGradientFor`, `starMaterial`, `sunGlowGroup`, `sunGlowSprites`).
- `js/world.js` — surgical: `get lights()` / `get sunMesh()` getters appended to the export.
- HUD indicator: `#dnPhase` element built inside daynight.js with inline styles (vignette pattern) — no css/style.css collision.
- `workstreams/daynight/sim.mjs` — headless verification harness mirroring the cycle math (constants copied verbatim; no `three` import so plain node runs it).

## Performance
Zero per-frame allocations: all keyframe hexes pre-baked to `THREE.Color` at load; per-frame work mutates module-level scratch colors in place; dome repaint throttled (every 4 frames + movement epsilon); dt clamped to .05.

## Known limitations
- `sim.mjs` mirrors constants by copy — if daynight.js tuning changes, sim must be updated in step.
- HUD phase label is text-only (no ARIA live region — intentional, purely decorative).
- Fallback scene-graph walk in `resolveLights()`/`resolveSunMesh()` only runs if world.js getters disappear; untested path by design.

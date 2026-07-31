# WS-CG — Classic Snowboarding Graphics — HANDOFF

Implementer: Sonnet 5 sub-agent (`sonnet5-game-dev`), dispatched in parallel with WS-DN. Session truncated by the 600s background ceiling after code landed but before docs; this handoff completed by the Fable 5 orchestrator from the verified on-disk diff.

## What was built

SSX Tricky / 1080°-era arcade restyle: saturated high-contrast biome palettes, inverted-hull outlines on all obstacles/trees, punchier spray/trail/streaks, arcade HUD juice. Purely visual — zero gameplay-number changes.

### 1. Palette pass (js/world.js BIOMES) — old → new
| Biome | Field | Old | New |
|---|---|---|---|
| TWILIGHT PINES | sky | 0x1b1239 | 0x180a3d |
| | fog | 0x3d2b64 | 0x4a2c85 |
| | snow | 0xdde9ff | 0xe8f0ff |
| | terrain | 0xbdccea | 0xaec3f5 |
| | tree | 0x183e47 | 0x0f4a52 |
| | trunk | 0x4b3540 | 0x5c2f45 |
| | sun | 0xffd699 | 0xffc266 |
| | accent | 0x9ef7e5 | 0x6dffe0 |
| | rock | 0xbac5dd | 0x9fb3e0 |
| AURORA GLACIER | sky | 0x06253d | 0x042846 |
| | fog | 0x145a70 | 0x0f7a95 |
| | snow | 0xc5fcff | 0xd4feff |
| | terrain | 0x7fcfd6 | 0x4de0e8 |
| | tree | 0x11546a | 0x0a6480 |
| | trunk | 0x173a5a | 0x123f66 |
| | sun | 0x8fffdf | 0x6bffcf |
| | accent | 0x8dfff4 | 0x5dfff0 |
| | rock | 0xa4eaff | 0x7fe0ff |
| WHITEOUT STORM | sky | 0x27142f | 0x2e1040 |
| | fog | 0x7d6f9b | 0x8a6fc2 |
| | snow | 0xffffff | 0xfbfcff |
| | terrain | 0xdde1ef | 0xd8d4f5 |
| | tree | 0x4f5277 | 0x4a4a8f |
| | trunk | 0x263046 | 0x212952 |
| | sun | 0xff9fce | 0xff6fc0 |
| | accent | 0xffd0ef | 0xff9fe0 |
| | rock | 0xf0eaff | 0xece0ff |

Track readability: `computeTerrainShades` spread widened — low `.68→.56` multiplier, high `1.18→1.34` with accent lerp `.22→.3` — carve lane pops brighter than borders. Base colors intentionally bright so WS-DN night dimming still leaves the track readable.

### 2. Inverted-hull outlines (js/world.js)
- ONE shared `outlineMat = MeshBasicMaterial({ color: 0x0a0714, side: BackSide, fog: true })` — no per-mesh materials.
- Rocks: shell scale 1.065 (replaces the old white wireframe rim). Ice spires: 1.06. Tree trunks: 1.07, tree cones: 1.05.
- Instanced detail rocks: second `InstancedMesh` (`detailShellMesh`) sharing geometry, per-instance scale ×1.07, matrices updated alongside the base in `updateDetailRocks`.
- All convex primitives (dodecahedra/cones/cylinders) — uniform scale outlines correctly (research §B).
- Collision radii untouched: `r: s + .35` (rock), `r: .92` (spire).

### 3. Speed feel
- Spray (world.js `emitSpray` + material): wider fan (.5→.7 jitter), spread ×1.25, upward kick `up*.35 + rand*up`, forward 2.6–6.2, life .55–1.05; particle size .32→.42, opacity .9→.96, pure white. SPRAY_N/SNOW_N counts unchanged.
- Snow: size .16→.19, opacity .75→.86 (glacier shimmer rebased to .19).
- Board trail (rider.js): peak opacity .5→.72, speed-scaled fan width `1 + min(1.1, |vx|·.035)`. Carve decals opacity .3→.42. Pool sizes/timing unchanged.
- Speed streaks (vfx.js): brighter color 0xf3feff, longer (7–19), kick in earlier (speedFactor .45 vs .55), max opacity .78 vs .5.

### 4. Arcade HUD (js/ui.js + css/style.css)
- Pooled score popups: `#scorePopups` layer + 10 reusable `.scorePopup` divs, CSS-keyframe float animation restarted via class-toggle + reflow; `+<points>` on `trick:landed`, `✦ FLOW ×N` in biome accent on `shard:collected`. Zero per-frame allocation. New API: `window.Game.ui.spawnPopup(text, xPct, yPct, color)` (existing setters unchanged).
- `bump()` punch animation on zone banner + combo counter (scale-pop keyframes); zone pill glow (`box-shadow` currentColor), combo text glow. Mobile popup font clamp.

## Files touched
`js/world.js` (palettes, terrain shades, outlines, spray, snow), `js/rider.js` (trail/carve opacity+width), `js/vfx.js` (streak punch — coexists with WS-DN's edits in the same file), `js/ui.js` (popups, bumps), `css/style.css` (popup/bump/zone/combo styles). `index.html` NOT touched by this workstream (popup layer built in JS).

## Integration with WS-DN
Base palettes are the inputs WS-DN's `captureBiome()` snapshots on `biome:change`; night dimming multiplies down from these brighter bases, so the night-readability floor holds. Outline shell uses `fog: true` so outlines recede naturally into the fog rather than crushing to black at night.

## Known limitations
- Outline thickness is scale-proportional (thinner on small trees at distance) — acceptable at gameplay speeds.
- Popup x/y are viewport-percent, not world-projected (arcade convention, cheap).

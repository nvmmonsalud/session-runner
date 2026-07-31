# BUILD-LOG — WS-2 Graphics & VFX

Chronological log of this workstream's session.

1. Read `index.html`, `js/world.js`, `js/rider.js`, `js/core.js`, `css/style.css`,
   `workstreams/refactor/HANDOFF.md`, `js/audio.js`, `js/ui.js` to understand the current
   modular architecture, the shared `window.Game.*` / `window.GameEvents` coordination contract,
   and existing biome/terrain/rider systems before writing any code.

2. Designed `js/vfx.js` as a new module loaded last (after `js/core.js`), reading
   `scene`/`camera` from `window.Game.core.getScene()/getCamera()` at module top level (safe
   because module `<script>` tags execute synchronously in document order before the first
   `requestAnimationFrame` callback fires).

3. Wrote `js/vfx.js`:
   - Procedural radial-gradient canvas texture (`makeGlowTexture`) shared by all glow sprites
     (`makeGlowSprite`, `attachGlow` — exported for `world.js` to use on shards/pads/ice-spires).
   - Gradient sky dome: inverted `SphereGeometry` (r=540) with per-vertex color computed from a
     per-biome `{top, horizon}` palette, recomputed only on `biome:change` (cheap, ~500 verts,
     not per-frame).
   - Star field: 260 `Points` scattered on an upper hemisphere shell, opacity/size lerp toward a
     per-biome twinkle target every frame.
   - Sun glow: 3 layered additive sprites positioned at `world.sunPosition` (added a
     `sunPosition` getter to `world.js`'s exported API for this).
   - Aurora ribbons: 3 custom `BufferGeometry` strips (34 segments each) with sine-animated
     vertices, additive blending, fade in/out via lerped opacity gated on `world.biomeIndex === 1`.
   - Speed streak lines: `LineSegments` parented directly to `camera` (with a defensive
     `scene.add(camera)` since the renderer only traverses objects reachable from `scene`), radial
     positions recycled each frame, opacity ramps in above a speed threshold.
   - Camera FOV kick: `camera.fov` lerped from 61 to 70 based on normalized `state.speed`,
     `camera.updateProjectionMatrix()` called every frame from `update(dt)`.
   - CSS vignette: a `#vfxVignette` div created and inserted via JS (before `#hud` in the DOM so
     it renders above the canvas but below the HUD), styled in `css/style.css`; opacity driven by
     speed factor.
   - Shake polish: an additional smoothed multi-sine camera offset layered on top of (not
     replacing) `core.js`'s own raw `st.shake` jitter.
   - Single exported `update(dt)` orchestrator + `window.Game.vfx = { update, makeGlowSprite,
     attachGlow }`.

4. **Bug caught during self-review**: the first version of `applyShakePolish` read
   `window.Game.state.shake` unconditionally. `core.js` only decays `st.shake` inside its
   `PLAYING`-gated block, so after a wipeout `st.shake` freezes at `1.05` until the next
   `startGame()`. Because `vfx.update(dt)` is hooked *before* core's own `PLAYING` early-return
   (so ambient effects like the vignette/FOV/stars keep working on the menu/game-over screens),
   the shake polish would have jittered the intentionally-frozen death-screen camera forever.
   Fixed by gating `applyShakePolish` on `state.state === state.STATE.PLAYING`.

5. Edited `js/world.js` (owned file):
   - Added `terLowColor`/`terHighColor` + `computeTerrainShades()` (per-biome two-tone terrain
     gradient, blended with the biome accent color) and wired terrain vertex colors
     (`terGeo` gets a `color` attribute, `terrainMat` gets `vertexColors: true`).
   - Added a 40-instance `InstancedMesh` of small embedded ground rocks
     (`detailMesh`/`detailData`/`updateDetailRocks()`), fixed in local terrain space, height
     resampled every frame via the existing `groundH()` so they ride the scrolling heightfield
     exactly like the terrain mesh itself (no per-frame translation needed, matching the game's
     "world scrolls, rider stays put" illusion).
   - Both new systems fold into the existing `updateTerrain()` call site (already invoked every
     frame by `core.js`) — no new `core.js` call site required.
   - Upgraded `updateSnow(dt, isPlaying, speed)` with per-biome character: gentle sideways sway
     (TWILIGHT), shimmer/size-pulse (AURORA), dense fast diagonal wind-driven snow (STORM).
   - Wired `window.Game.vfx?.attachGlow(...)` (defensive optional-chain) into `makeIceSpire`,
     `spawnShard`, and `spawnPad` for glow billboards, and `computeTerrainShades()` /
     `detailMat.color.set(...)` into `applyBiome()`.
   - Exposed `get sunPosition()` on the `window.Game.world` export.

6. Edited `js/rider.js` (owned file) — re-read the file before every edit since it changed
   under me mid-session (the audio/juice workstream added a `window.GameEvents.emit('rider:land',
   { turns })` call inside `landTrick()` that isn't part of the originally-documented event list;
   preserved it untouched throughout all edits):
   - Helmet emissive stripe mesh, colored/updated via a new `biome:change` listener.
   - Replaced the 4 static scarf "bits" with a spring-chain (`scarfSegs`): each segment chases
     the previous one via a damped-spring integrator (`springK`/`springDamp`), driven by lateral
     speed (`vx`) and airtime (`airY`) — gives springy follow-through instead of fixed rotation
     offsets.
   - Board glow trail: a 22-entry pool of fading additive quads spawned behind the board while
     grounded, colored per biome (`trailColor`, updated on `biome:change`), scrolled forward each
     frame with the same `dz = speed * dt` convention used by obstacles/shards/pads so they trail
     correctly behind the (world-fixed) rider as the world scrolls.
   - Carve tracks: a 46-entry pool of fading dark decals spawned while carving
     (`|vx| > 1.5`, grounded), same scroll convention, longer life (2.2s) for continuous groove
     marks, height resampled via `world.groundH()` every frame like the trail quads.
   - Kept the `rider:land` emit and all existing trick/scoring logic behavior-identical.

7. Edited `js/core.js` (shared file) — re-read the full file first since the audio/juice
   workstream had already added `window.Game.juice` hitstop-gating logic to the render loop.
   Made exactly one surgical addition: `window.Game.vfx?.update(dt);` right after
   `window.Game.ui.update(dt);` and before the `if (st.state !== STATE.PLAYING) return;` guard
   (same tier as the always-on snow/spray/UI updates, so ambient VFX — vignette, FOV, stars —
   keep breathing on the menu/game-over screens too). `getScene()/getCamera()/getRenderer()` were
   already exposed on `window.Game.core`, so no further changes were needed there.

8. Edited `index.html` — added exactly one line, `<script type="module"
   src="js/vfx.js"></script>`, immediately after the `js/core.js` script tag. Left the storyline
   workstream's `#storycard`/`#epilogue` HUD additions untouched.

9. Appended vignette overlay styles (`#vfxVignette`) to the end of `css/style.css`, after the
   storyline workstream's already-appended `#storycard`/`#epilogue` block.

10. Ran `node --check --experimental-default-type=module` on all seven `js/*.js` files — all
    passed. Started a local static server on port 8341 (free at the time), curled `index.html`,
    `css/style.css`, and every `js/*.js` file (all 200), tore the server down. Wrote
    `VERIFICATION.md` with the verbatim output.

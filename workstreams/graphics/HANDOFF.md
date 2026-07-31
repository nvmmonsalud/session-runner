# HANDOFF — WS-2 Graphics & VFX

## What was built
A procedural, dependency-free visual/juice pass on top of the existing modular Three.js game.
Zero downloaded textures/images — every gradient, glow, and particle texture is generated in
code (canvas gradients, vertex colors, sine-animated geometry). No gameplay, collision, scoring,
or HUD behavior was changed; only visuals.

## Full file list touched
```
/Users/nvmmonsalud/session-runner/js/vfx.js        (NEW)
/Users/nvmmonsalud/session-runner/js/world.js       (edited)
/Users/nvmmonsalud/session-runner/js/rider.js       (edited)
/Users/nvmmonsalud/session-runner/js/core.js        (one-line surgical hook)
/Users/nvmmonsalud/session-runner/index.html        (one script tag added)
/Users/nvmmonsalud/session-runner/css/style.css     (vignette rule appended at end)
/Users/nvmmonsalud/session-runner/workstreams/graphics/HANDOFF.md      (new)
/Users/nvmmonsalud/session-runner/workstreams/graphics/BUILD-LOG.md    (new)
/Users/nvmmonsalud/session-runner/workstreams/graphics/VERIFICATION.md (new)
```
Nothing outside these paths was touched. `js/story.js`, `js/ui.js`, `js/audio.js`, and other
workstream directories were not modified (they were read-only inputs). No `git` commands were
run.

**Note on concurrency:** `js/rider.js`, `js/core.js`, `index.html`, and `css/style.css` were
independently modified by parallel workstreams (storyline added `#storycard`/`#epilogue` +
`js/story.js` narrative hooks; audio/juice added `window.Game.juice` hitstop gating in
`core.js`'s render loop and a `rider:land` event emit inside `js/rider.js`'s `landTrick()`). Every
file was re-read immediately before editing to pick up those changes, and all edits were applied
as targeted diffs (not full-file overwrites) specifically to avoid clobbering that work. All of
it is preserved and untouched in the final state.

## Feature checklist (from the brief)

1. **Sky: gradient dome + stars + sun glow** — DONE. `js/vfx.js`: `skyDome` (inverted
   `SphereGeometry`, r=540, per-vertex gradient recomputed on `biome:change`), `starPoints` (260
   points, twinkling opacity/size lerped per-biome), `sunGlowGroup` (3 layered additive sprites at
   `world.sunPosition`, color-synced on `biome:change`).
2. **Aurora ribbons (biome 1 only)** — DONE. `js/vfx.js`: `auroraRibbons` (3 custom
   `BufferGeometry` strips, sine-animated vertices every frame, additive teal/green/pink vertex
   colors, opacity lerps in/out based on `world.biomeIndex === 1`).
3. **Speed effects: streaks + FOV kick** — DONE. `js/vfx.js`: `streaks` (`LineSegments` parented
   to `camera`, radial converging lines that fade in above a speed threshold); FOV lerps 61→70 in
   `update(dt)` based on `state.speed`, `camera.updateProjectionMatrix()` called every frame. No
   conflict with audio/juice's hit-stop (they gate `update(dt)` calls entirely during hit-stop;
   VFX just doesn't get a `dt` tick during those frames either, which is the correct behavior).
4. **Rider upgrades** — DONE, in `js/rider.js`: helmet emissive stripe (biome-tinted via
   `biome:change` listener); springy scarf follow-through (4-segment damped-spring chain reacting
   to `vx`/`airY`, replacing the old fixed-rotation bits); board glow trail (22-entry pooled
   fading additive quad trail, biome-accent colored).
5. **Glow sprites** — DONE. `js/vfx.js` exports `makeGlowSprite`/`attachGlow` (shared procedural
   radial-gradient canvas texture, tinted per-instance via `SpriteMaterial.color`). Wired into
   `js/world.js`'s `spawnShard`, `spawnPad`, and `makeIceSpire` (the "terrain crest" glow — ice
   spires stand in for crest-like terrain features) via defensive `window.Game.vfx?.attachGlow`.
6. **Vignette** — DONE. `js/vfx.js` creates `#vfxVignette` (inserted before `#hud` in the DOM so
   it sits above the canvas but below HUD text), styled in `css/style.css`; opacity driven by
   speed factor every frame in `update(dt)`.
7. **Screen shake polish** — DONE (light touch, as scoped). Core's own raw `st.shake` jitter in
   `core.js` was left untouched. `js/vfx.js` adds a smoothed multi-sine *additional* offset
   (`applyShakePolish`) layered on top, gated to `state.state === PLAYING` (see bug note below).
8. **Richer terrain** — DONE, in `js/world.js`: per-biome two-tone vertex-color gradient on the
   terrain mesh (`computeTerrainShades`, wired into `updateTerrain()` and `applyBiome()`); 40
   embedded small ground rocks via `InstancedMesh` (`detailMesh`), height-synced to the scrolling
   heightfield every frame. Carve tracks were implemented in `js/rider.js` instead (co-located
   with the player-position/ground-height knowledge already used there every frame) — a 46-entry
   pool of fading dark decals spawned while carving, scrolled with the same `dz` convention as
   obstacles/shards/pads.
9. **Snowfall upgrades per biome** — DONE, in `js/world.js`'s `updateSnow`: TWILIGHT = gentle
   sideways sway; AURORA = shimmer/size-pulse (`snowMat.size` oscillates) plus reduced fall speed;
   STORM = denser fall speed, forward-speed multiplier, and constant horizontal wind offset for a
   dense fast diagonal look.

All 9 items are done. No TODO/FIXME/placeholder left in any shipped file.

## Where each piece lives
- `js/vfx.js` — sky dome, stars, sun glow, aurora ribbons, speed streaks, FOV kick, vignette,
  shake polish, shared glow-sprite factory. Single `window.Game.vfx = { update(dt), makeGlowSprite,
  attachGlow }` export.
- `js/world.js` — terrain vertex-color gradient + embedded detail rocks (both folded into the
  existing `updateTerrain()`), per-biome snow character (`updateSnow`), glow-sprite attachment
  calls on shard/pad/ice-spire spawn, `sunPosition` getter.
- `js/rider.js` — helmet stripe, springy scarf chain, board glow trail, carve track decals (all
  inside `update(dt)` / a new `updateTrailAndCarve` helper).
- `js/core.js` — exactly one added line: `window.Game.vfx?.update(dt);`.
- `index.html` — exactly one added line: the `js/vfx.js` module script tag, after `js/core.js`.
- `css/style.css` — one appended rule block: `#vfxVignette`.

## Performance notes
- No `EffectComposer`/postprocessing passes — every "bloom"/glow effect is faked with additive
  billboards using one shared canvas-generated texture (`glowTexture`), so there's exactly one
  extra texture upload for the whole game.
- All per-frame hot loops reuse pre-allocated typed arrays/geometries/materials/`Object3D`
  scratch instances (`_detailDummy` in `world.js`, `_skyTop`/`_skyHorizon`/`_skyMix` in `vfx.js`)
  — no `new THREE.Vector3()`/`new THREE.Color()`/`new THREE.Object3D()` allocations inside any
  per-frame update loop.
- Particle/decal counts are all capped and pooled: 260 stars, 3 aurora ribbons (34 segments
  each), 26 speed streaks, 40 embedded detail rocks (single `InstancedMesh`, one `setMatrixAt`
  loop, one `needsUpdate` flag per frame), 22 board-trail quads, 46 carve-track quads. None of
  these pools grow — they round-robin overwrite the oldest/expired slot.
- The sky dome and aurora ribbon *color* attributes are only recomputed on `biome:change` (rare),
  never per-frame; only their *position*/opacity animate every frame, and only for the 3 aurora
  ribbons (cheap: ~35 vertices × 2 each).
- Glow sprites are only attached to naturally rate-limited spawns (shards/pads/ice-spires already
  throttled by existing spawn timers in `core.js`), so sprite count stays low and bounded by the
  existing on-screen entity cap (obstacles/shards/pads are removed once they scroll past
  `z > 16`, taking their glow children with them via `scene.remove`).

## What works
- All 7 `js/*.js` files pass `node --check --experimental-default-type=module`.
- `index.html`, `css/style.css`, and all `js/*.js` files (including the new `vfx.js`) serve `200`
  from a static file server — see `VERIFICATION.md` for the verbatim tail.
- Existing gameplay systems (tricks, shards, biomes, expedition ranks, touch controls, collision,
  scoring, combo/flow, localStorage persistence) were not touched at the logic level — only
  additive visual code was inserted around them.
- Coordination is exclusively through `window.Game.*` getters/optional-chained calls and
  `window.GameEvents.on('biome:change', ...)` — `js/vfx.js` never imports another `js/*.js` file.

## Known issues / things to watch
- This was verified via static syntax checking, static HTTP-200 checks, and manual code review
  (traced every data flow — camera parenting, scroll conventions, event payloads — against the
  existing modules) — not an automated in-browser render/gameplay test, since no browser
  automation tool was available in this environment. A quick manual smoke test in an actual
  browser (open `index.html` via a local server, play a run through all three biomes, trigger a
  trick, a shard pickup, a pad launch, and a wipeout, and confirm the vignette/FOV/streaks scale
  with speed and the aurora ribbons fade in/out cleanly on the biome-1 transition) is recommended
  before shipping, same caveat the original refactor handoff noted.
- **Bug found and fixed during self-review**: the shake-polish helper originally read
  `window.Game.state.shake` unconditionally every frame. `core.js` only decays `st.shake` while
  `state === PLAYING`; after a wipeout it freezes at `1.05` until the next `startGame()` reset.
  Since `vfx.update(dt)` is intentionally hooked *before* `core.js`'s `PLAYING`-only early return
  (so the vignette/FOV/stars keep animating on the menu and game-over screens), the shake polish
  would otherwise have jittered the intentionally-frozen death-screen camera forever. Fixed by
  gating `applyShakePolish` on `state.state === state.STATE.PLAYING`. No other issues found.
- The camera is now added to the scene graph (`scene.add(camera)`, guarded to only run once) so
  that `camera.add(streaks)` actually renders — `WebGLRenderer.render(scene, camera)` only
  traverses objects reachable from `scene`, and the camera wasn't previously part of that graph.
  This is a standard, safe three.js pattern and doesn't change the camera's world transform (it
  had no other parent), but it's worth knowing about if a future workstream also wants to parent
  objects to the camera.
- Ice-spire glow sprites are colored at spawn time using the biome active at that moment; if the
  biome changes mid-flight for a spire (spires live roughly 5-7s on screen), its glow color
  doesn't retroactively update. Purely cosmetic and rare (biome transitions are infrequent
  relative to spire lifetime); not worth the added complexity of per-instance biome tracking.
- Carve-track/board-trail quads are simple flat additive/alpha-blended planes reusing shared
  geometries — visually a stylized "groove" rather than a physically-accurate ski track, which
  matches the game's flat-shaded low-poly aesthetic.

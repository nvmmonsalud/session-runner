# BUILD LOG — WS-0 Foundation Refactor

## 1. Read the source of truth
Read `/Users/nvmmonsalud/session-runner/index.html` in full (172 lines) — a single-file Three.js
game: inline `<style>` block, HUD/overlay markup, and one `<script type="module">` containing
scene/camera setup, biome data, terrain, rider rig, obstacles/shards/pads/decor, particles, audio,
input, scoring/combo/trick logic, and the render loop.

## 2. Designed the module boundary and cross-module contract
Decided the hard part up front: renderer/scene/camera and all mutable run state (`dist`, `score`,
`speed`, `player`, `airborne`, timers, etc.) must be created once and be readable by every module
on every frame, but `core.js` has to load *last* (after world/rider/audio/ui/story "register
themselves"). Resolved this by:
- Making `window.GameEvents` and `window.Game = {}` a tiny inline classic `<script>` in
  `index.html`, guaranteed to run before any deferred `type="module"` script.
- Having `world.js` / `rider.js` only *register functions* on `window.Game.world` /
  `window.Game.rider` at module-load time (no Three.js scene access needed yet).
- Having `core.js` create `renderer`/`scene`/`camera`, build `window.Game.state` (the single
  shared mutable state object), and only then call `window.Game.world.init(scene)` and
  `window.Game.rider.init(scene)` to actually construct the Three.js objects. This preserves
  execution order identical to the original (lights → sun → mountains → terrain → rider → biome
  color state) without requiring world.js/rider.js to import core.js.
- Any module that needs "live" values the game loop mutates every frame (e.g. `dist` for
  `groundH`, `player.x` for rider positioning) reads them directly off `window.Game.state` at
  call time rather than caching a stale copy.

## 3. Extracted css/style.css
Moved the inline `<style>` block (lines 9-34 of the original) verbatim into `css/style.css`. No
selector, value, or media-query changes.

## 4. Extracted js/audio.js
Moved `initAudio`, `blip`, `crash` verbatim (same oscillator/gain/buffer math), exposed as
`window.Game.audio`. No THREE dependency needed here, so no `three` import was added (keeps the
module lean and avoids an unnecessary resolution).

## 5. Extracted js/story.js
Pulled the narrative strings out: the intro eyebrow/title/sub/cta copy, the `roman()` numeral
helper, the zone label/announce string builders, the meta/best/stats string builder, and the
wipeout/expedition-up title+sub+cta builder. Kept it "thin" per the brief — pure string builders,
no DOM access, no THREE.

## 6. Extracted js/ui.js
Centralized every `document.querySelector` HUD ref and all the plain DOM writes: score, best,
combo (+ show/hide), speedbar, zone, meta/best/stats, trick text (+ show/hide), the announce
banner (with its own internal timer, decremented via `ui.update(dt)` called every frame from
core), and overlay show/hide/text-set. No THREE dependency.

## 7. Extracted js/world.js
Moved: `BIOMES` array, `groundH`/`updateTerrain`, terrain plane + material, rock/ice-spire/tree
factories, `spawnObstacle`/`spawnDecor`/`spawnShard`/`spawnPad`, `emitSpray`, snow + spray particle
buffers and their per-frame update functions, mountains, sun mesh, hemisphere/key/fill lights, and
`applyBiome`. `applyBiome` calls into `window.Game.ui.setZone`, `window.Game.ui.announce`,
`window.Game.story.zoneLabel/zoneAnnounce`, and `window.Game.audio.blip` — all safe because by the
time `applyBiome` is ever *invoked* (from `core.js`, after every module has finished loading),
those modules are fully registered. `groundH` reads `window.Game.state.dist` live instead of
closing over a local variable, since `dist` now lives in core's shared state object.

One behavior-preservation detail worth flagging: `spawnObstacle` originally read the closure
variable `score` directly for its "safe drop-in" zone; it now takes `score` as a parameter, passed
in by `core.js` from `window.Game.state.score`. Purely an internal calling-convention change — the
computed value and behavior are identical.

## 8. Extracted js/rider.js
Moved the entire rig construction (board, legs, boots, torso, backpack, head/helmet/visor, arms,
scarf, all materials/geometries) into `init(scene)`. Moved `startJump`, `landTrick`, `trickLabel`
verbatim, plus the per-frame rider animation block (position/rotation/lean, board/torso/head/arm/
scarf sway, airborne spin integration, landing detection, continuous carve spray) into `update(dt)`,
now reading `window.Game.state` and calling `window.Game.world.groundH`/`emitSpray`,
`window.Game.ui.setTrick`/`hideTrick`/`setCombo`/`announce`, and `window.Game.audio.blip`. Emits
`jump:start` and `trick:landed` at the exact points the original triggered a jump / a successful
trick.

## 9. Wrote js/core.js last
Rebuilt the state machine, renderer/scene/camera bootstrap, input handlers (keyboard/touch/mouse),
`startGame`/`wipeout`, and the master `update(dt)` loop exactly matching the original control flow
and order of operations: frame counter → snow/spray update → announce timer → early-return if not
PLAYING → safeTimer → dist/score → biome check → speed → terrain → input → player physics →
rider.update → combo timer → spawn timers → obstacle/shard/pad/decor movement+collision →
camera follow/shake → HUD score/speedbar. Emits `game:start`, `game:over`, `shard:collected`,
`pad:hit` at the same points the original logic reached those branches. Exposes
`window.Game.core = { STATE, LANE, startGame, wipeout, updateMeta, getScene, getCamera,
getRenderer }` for future workstreams that need read access to the render pipeline.

## 10. Rewrote index.html as a thin shell
Kept the HUD markup, overlay container divs (now empty — populated by `story.js`/`ui.js` at load,
matching the "story.js owns intro copy" requirement), hint text, import map (`three@0.160.0`
pinned), added `<link rel="stylesheet" href="css/style.css">`, added the tiny inline
`window.GameEvents` + `window.Game = {}` bootstrap script, then six `type="module"` script tags in
the required dependency order: world → rider → audio → ui → story → core.

## 11. Verification
- `node --check --experimental-default-type=module` passed for all 6 `js/*.js` files on the first
  run — no syntax fixes needed.
- Started `python3 -m http.server 8341`, curled `index.html`, `css/style.css`, and all six
  `js/*.js` files — all returned `200` on the first run.
- Manually re-read every generated file end-to-end against the original line-by-line to confirm no
  tuning value, color, string, or control-flow ordering was altered.

No failures were hit during this workstream — the design pass up front (deciding the
`window.Game.state` / `window.GameEvents` contract before writing any module) avoided the load-order
pitfall (world/rider needing `scene` before `core.js`, which creates it, has loaded) that would
otherwise have required a rewrite.

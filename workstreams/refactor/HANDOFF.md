# HANDOFF — WS-0 Foundation Refactor

## What was built
A behavior-preserving split of the single-file `index.html` game into a shell + CSS + six ES
modules. No feature, tuning value, color, text, or control-flow change. Same controls, same
scoring formula, same biome thresholds, same trick scoring, same audio, same HUD, same
`localStorage` keys (`sessionRunner3dHi`, `sessionRunner3dRuns`).

## Full file tree touched
```
/Users/nvmmonsalud/session-runner/index.html      (rewritten — shell only)
/Users/nvmmonsalud/session-runner/css/style.css    (new — verbatim CSS)
/Users/nvmmonsalud/session-runner/js/core.js       (new)
/Users/nvmmonsalud/session-runner/js/world.js      (new)
/Users/nvmmonsalud/session-runner/js/rider.js      (new)
/Users/nvmmonsalud/session-runner/js/audio.js      (new)
/Users/nvmmonsalud/session-runner/js/ui.js         (new)
/Users/nvmmonsalud/session-runner/js/story.js      (new)
/Users/nvmmonsalud/session-runner/workstreams/refactor/HANDOFF.md      (new)
/Users/nvmmonsalud/session-runner/workstreams/refactor/BUILD-LOG.md    (new)
/Users/nvmmonsalud/session-runner/workstreams/refactor/VERIFICATION.md (new)
```
Nothing outside these paths was touched. `README.md`, `docs/`, `.env.local`, `.vercel/`, `.git/`
untouched. No `ORCHESTRATION-LOG.md` existed at the start of this workstream, so nothing was
deleted there.

## Module responsibilities

- **`index.html`** — markup only: HUD divs (`#score #best #combo #trick #zone #meta #speedwrap
  #speedbar #announce #overlay #hint`), pinned `three@0.160.0` import map,
  `<link rel="stylesheet" href="css/style.css">`, a tiny inline classic `<script>` that defines
  `window.GameEvents` and `window.Game = {}` (guaranteed to run before any module script), then six
  `type="module"` script tags in dependency order: `world.js → rider.js → audio.js → ui.js →
  story.js → core.js`.
- **`css/style.css`** — all CSS moved verbatim, no selector/value changes.
- **`js/world.js`** — `BIOMES` data + `applyBiome`, terrain (`groundH`, `updateTerrain`), rock/ice
  spire/tree factories, `spawnObstacle/spawnDecor/spawnShard/spawnPad`, launch pads, shards, decor,
  mountains, sun, hemi/key/fill lights, snow + spray particle systems (`emitSpray`, `updateSnow`,
  `updateSpray`). Exposes the live `obstacles/decor/shards/pads` arrays directly (same references
  core.js mutates every frame).
- **`js/rider.js`** — rig construction (board, limbs, torso, head, scarf, all materials),
  `startJump`, `landTrick`, `trickLabel`, and `update(dt)` (carve lean, board/limb/scarf sway,
  airborne spin integration + landing detection, continuous carve spray).
- **`js/audio.js`** — `initAudio`, `blip`, `crash`. Unchanged WebAudio math.
- **`js/ui.js`** — all HUD DOM refs and writes: score/best/combo/meta/speedbar/zone/trick/overlay,
  `announce()` (with its own internal timer ticked via `ui.update(dt)`).
- **`js/story.js`** — narrative strings only: intro eyebrow/title/sub/cta, `roman()` numeral
  helper, zone label/announce string builders, meta/stats string builder, wipeout/expedition-up
  title+sub+cta builder. No DOM access.
- **`js/core.js`** — state machine (`MENU/PLAYING/GAME_OVER`), renderer/scene/camera bootstrap,
  keyboard/touch/mouse input, `startGame`/`wipeout`, the master `update(dt)` loop (scoring, combo,
  spawn timers, obstacle/shard/pad/decor movement + collision, camera follow/shake), expedition
  rank math, and the two `localStorage` keys. Loads last, calls `world.init(scene)` /
  `rider.init(scene)` once at startup, then starts `requestAnimationFrame`.

## Shared state contract
`window.Game.state` (created by `core.js`, before `world.init`/`rider.init` run) is the single
mutable state object every module reads/writes at call time — never cached/copied:
`STATE, state, hiScore, completedRuns, expedition, dist, score, styleScore, speed, spawnT, shardT,
padT, shake, frame, combo, comboTimer, airborne, airY, airVy, spin, spinAbs, trickTimer, safeTimer,
player:{x,vx}, keys, touchX`.

`window.Game.world.biomeIndex` / `window.Game.world.activeBiome` are kept in sync (reassigned)
every time `applyBiome` runs, so any module can read the current biome synchronously.

## window.Game API surface
- `window.Game.world` — `{ BIOMES, LANE, biomeIndex, activeBiome, obstacles, decor, shards, pads,
  init(scene), groundH(x,z), updateTerrain(), applyBiome(index, force), spawnObstacle(score),
  spawnDecor(z), spawnShard(), spawnPad(), emitSpray(x,y,z,n,spread,up), updateSnow(dt,isPlaying,
  speed), updateSpray(dt) }`
- `window.Game.rider` — `{ init(scene), startJump(fromPad), landTrick(), trickLabel(turns),
  update(dt), rider (getter), riderRig (getter) }`
- `window.Game.audio` — `{ initAudio(), blip(freq,dur,type,vol), crash() }`
- `window.Game.ui` — `{ setScore, setSpeedbar, setZone, setCombo, hideCombo, setMeta, setTrick,
  hideTrick, showOverlay, hideOverlay, setOverlayText({eyebrow,title,sub,cta}), announce(text),
  update(dt) }`
- `window.Game.story` — `{ roman(n), intro, zoneLabel(biome), zoneAnnounce(biome),
  metaText(hi,exp,runs), wipeoutText({expedition,previousExpedition,score,newBest,hiScore,
  completedRuns}) }`
- `window.Game.core` — `{ STATE, LANE, startGame(), wipeout(), updateMeta(), getScene(),
  getCamera(), getRenderer() }`
- `window.Game.state` — shared mutable state object (see above).

## GameEvents surface
`window.GameEvents = { on(ev, fn), emit(ev, data) }`, defined in the inline bootstrap script
before any module runs. Events emitted, with payloads, and where:
- `game:start` — `{}` — emitted at the end of `core.js`'s `startGame()`.
- `game:over` — `{ score, best, newBest, expedition, expeditionUp, completedRuns }` — emitted at
  the end of `core.js`'s `wipeout()`.
- `biome:change` — `{ index, biome }` — emitted at the end of `world.js`'s `applyBiome()`, on
  every biome transition (including the forced reset at run start).
- `trick:landed` — `{ turns, points }` — emitted from `rider.js`'s `landTrick()`, only when
  `turns > 0` (i.e. a scoring trick, matching the original "STOMPED" branch).
- `shard:collected` — `{ combo }` — emitted from `core.js`'s per-frame shard collision loop.
- `jump:start` — `{ fromPad }` — emitted from `rider.js`'s `startJump()`.
- `pad:hit` — `{}` — emitted from `core.js`'s per-frame pad collision loop, alongside the
  `jump:start` triggered by `rider.startJump(true)`.

Future workstreams should subscribe via `window.GameEvents.on('event:name', handler)` rather than
editing `core.js`/`world.js`/`rider.js` directly — none of these files need to change to add new
listeners.

## What works
- Full game loop verified by static analysis and line-by-line comparison against the original
  172-line `index.html`: menu → drop-in → carve/jump/spin/land → shard collection/flow → biome
  route shifts at score 120/300 → wipeout → expedition-rank-up every 3 completed runs →
  localStorage persistence of `sessionRunner3dHi` / `sessionRunner3dRuns`.
- All six `js/*.js` files pass `node --check --experimental-default-type=module`.
- `index.html`, `css/style.css`, and all six `js/*.js` files serve `200` from a static file server
  (Vercel-compatible: no build step, no backend, single entry point `index.html`).

## Known issues / things to watch
- This was verified via static syntax checking and manual line-by-line behavioral comparison, not
  an automated in-browser test run (no browser automation tool was available in this environment).
  A quick manual smoke test in an actual browser (open `index.html` via a local server, play a run,
  trigger a trick, a shard pickup, a biome shift, and a wipeout, then refresh to confirm
  `BEST`/`RUN` persist) is recommended before shipping.
- `spawnObstacle` changed from reading a closure variable to taking `score` as an explicit
  parameter (called with `window.Game.state.score` from `core.js`). Purely an internal
  calling-convention change; the computed "safe drop-in" behavior is identical.
- The overlay's intro copy (`#eyebrow #title #sub #cta`) is now set via `js/story.js` +
  `js/ui.js` at module load instead of being static HTML. Since `type="module"` scripts are
  deferred and run before the page is interactive, there is no expected visible flash, but this is
  a timing detail worth knowing about if a future workstream adds a loading screen.

## Notes for parallel workstreams (storyline, VFX, audio/juice)
- Do not import each other's `js/*.js` files. Coordinate exclusively through `window.Game.*` and
  `window.GameEvents`.
- To add new visual effects (VFX workstream): listen for `trick:landed`, `shard:collected`,
  `jump:start`, `pad:hit`, `biome:change` and call `window.Game.world.emitSpray(...)` or add your
  own particle systems in a new module loaded after `world.js`. `window.Game.world.groundH(x,z)`
  gives you live terrain height at any point.
- To add new narrative beats (storyline workstream): extend `js/story.js`'s exported string
  builders, or listen for `game:over`/`biome:change` and call `window.Game.ui.announce(text)`.
- To add new stingers/music (audio/juice workstream): `window.Game.audio.blip(freq, dur, type,
  vol)` and `window.Game.audio.crash()` are available, or add a new `js/music.js` module that
  listens to `GameEvents` and manages its own `AudioContext` nodes independently — `initAudio()`
  in `js/audio.js` only lazily creates one shared `AudioContext`, reachable at
  `window.Game.audio` if a new module wants to share it (there's no explicit getter for the raw
  `AudioContext` currently — add one to `js/audio.js`'s exports if a future module needs the raw
  context rather than just `blip`/`crash`).
- `window.Game.state` is the single source of truth for anything per-frame (player position,
  score, combo, airborne status, etc.) — read it, don't cache it across frames.

# BUILD-LOG — WS-3 Audio & Juice

## 1. Recon
Read `index.html`, `js/audio.js`, `js/core.js`, `js/rider.js`, `js/world.js`, `js/ui.js`, and
`workstreams/refactor/HANDOFF.md` to understand the module contract (`window.Game.*` /
`window.GameEvents` only, no cross-module imports), the existing `blip`/`crash` SFX, the
`update(dt)`/`requestAnimationFrame` loop shape in `core.js`, the rider rig group structure in
`rider.js` (confirmed `rider.scale` is never touched by the rig — safe for squash-and-stretch to
own), and the `applyBiome`/biome data shape in `world.js`.

## 2. Design decisions
- **Buses**: added `sfxBus` (gain 1, unchanged perceived SFX level) and `musicBus` (routes the
  music bed, kept quieter — target peak .22 — so "music sits under SFX" per the brief). Both
  created once, lazily, inside the existing `initAudio()` gesture-gated entry point.
- **Music**: chose a persistent-oscillator chord pad (not a scheduled-note sequencer) for the
  chord layer — 4 detuned voices per chord + 1 "special" per-biome color voice, all routed through
  one shared LFO-modulated lowpass filter. This gives continuous, always-playing harmonic
  movement that crossfades smoothly on biome change via `setTargetAtTime` frequency ramps, without
  needing a full step-sequencer for the harmony (much lighter than scheduling chord notes
  individually, and avoids audible retriggering on every chord "beat"). The rhythm layer (kick +
  hat) *does* use a proper lookahead scheduler (`setInterval` @45ms scheduling up to 180ms of
  AudioContext-time-accurate events ahead) since percussive hits need to be re-triggered per
  biome's density profile and to want.
- **Wind**: single looping filtered-noise buffer + gust gain, continuously updated (never
  recreated) every frame while `wind.running`, mirroring how a real ambience bed should behave —
  cheaper than recreating buffer sources per frame.
- **Follower loop**: gave `js/audio.js` its own tiny `requestAnimationFrame` loop (`audioFrame()`)
  reading `window.Game.state` every frame to drive wind/music-intensity/squash-spring. This avoids
  needing any additional per-frame hook in `core.js` beyond the one hit-stop check — the audio
  module can poll state on its own cadence without `core.js` having to call into it.
- **Hit-stop**: implemented as a single boolean-ish timestamp (`window.Game.juice.hitstopUntil`)
  that `core.js`'s loop checks before calling `update(dt)`, keeping `renderer.render()` running
  every frame regardless — a true "freeze frame," not a stutter. Kept this the *only* change to
  `core.js`'s loop, per the "surgical hook only" instruction.
- **Landing squash**: rather than editing `rider.js`'s rig further, drove `rider.scale` (unused by
  `rider.js`) from a small damped-spring simulation integrated every frame in `audio.js`'s own
  follower loop. Needed a trigger event fired on *every* landing (not just scoring tricks, since
  `trick:landed` only fires for `turns > 0`), so added exactly one line to `rider.js`'s
  `landTrick()`: `window.GameEvents.emit('rider:land', { turns });`, placed before the
  turns>0/else branch so it always fires.
- **Stingers / callout voice**: built as short, cheap, one-shot oscillator/filter graphs, entirely
  separate from the persistent music graph, routed to `sfxBus` (so they read as "SFX," matching
  "distinct per moment" clarity rather than blending into the music bed).

## 3. Implementation
Rewrote `js/audio.js` in full (see final file for complete listing): buses, shared noise buffer
helper, the original `blip`/`crash` re-routed through `sfxBus`, new one-shots (`thud`, `uiBlip`,
`stinger`, `calloutVoice`), the wind system, the music system (chord pad + LFO filter + rhythm
scheduler + biome/intensity crossfade), the juice/hit-stop/squash-spring system, the follower rAF
loop, and the `GameEvents` wiring block at the bottom.

Added the single-line `rider:land` emit to `js/rider.js`.

Added the single hit-stop-gated `update(dt)` call to `js/core.js`'s `loop()`.

## 4. Issue found + fixed: stinger firing on every run reset
**Problem**: initial design used a `freshRun` boolean set `true` inside the `game:start` handler
and consumed inside the `biome:change` handler to suppress the stinger on the forced
reset-to-biome-0 call. On tracing the exact call order in `core.js`'s `startGame()`, found that
`world.applyBiome(0, true)` (which emits `biome:change`) is called *before*
`window.GameEvents.emit('game:start', {})` — meaning my `game:start` handler (which would set
`freshRun = true`) runs *after* the `biome:change` event it was supposed to gate, on every restart
after the first run. This would have caused a spurious stinger to fire every time the player
restarted after their run had progressed past biome 0.

**Fix**: dropped the `freshRun` flag entirely. Replaced it with a comparison against the music
system's own tracked biome index: `const isProgression = music.playing && index > music.biomeIndex;`
— a stinger only fires when the music system is already actively running for the current run
*and* the new biome index is strictly greater than the last one the music system applied. Since
`music.playing` is `false` at the moment of the forced reset (the previous run's `game:over`
already called `music.stop()`, and the current run's `music.start()` hasn't run yet at that exact
point in `startGame()`), and since `index === 0` can never be `> music.biomeIndex` (which starts
at 0), this correctly suppresses the reset transition on every run including the very first one,
while still firing correctly for real 0→1 and 1→2 progressions during gameplay. Verified by
tracing the full call sequence by hand (documented in HANDOFF.md's Known Issues).

## 5. Parallel-agent coordination check
Noticed `js/vfx.js` and expanded `js/story.js` appeared under me mid-session (parallel VFX/
storyline agents). Re-read `js/rider.js` and `js/core.js` after my edits to confirm my one-line
hooks in each were still intact and untouched by concurrent edits — both intact. Grepped
`js/vfx.js` for `.scale` / `Game.juice` / `hitstop` references to confirm no conflict with the
landing-squash system (`rider.rig.scale`) or the hit-stop flag — none found; `js/vfx.js` only
scales its own unrelated particle sprite objects.

## 6. Verification
Ran `node --check --experimental-default-type=module` against every `js/*.js` file (all pass,
including the parallel agents' `js/vfx.js` and expanded `js/story.js`). Started a local static
server on port 8341 (confirmed free before binding), curled `index.html`, `css/style.css`, and
every `js/*.js` file — all returned `200`. Killed the server afterward. Full verbatim output
captured in `VERIFICATION.md`.

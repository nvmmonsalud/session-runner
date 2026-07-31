# HANDOFF — WS-3 Audio & Juice

## What was built
A full procedural WebAudio layer on top of the existing behavior-preserving `blip`/`crash` SFX:
an ambient music bed that breathes with biome + speed, a wind whoosh, trick-stomp hit-stop +
thud, landing squash-and-stretch, per-biome zone-transition stingers, crisp UI click blips, and
a synth "callout voice" for big moments (double+ tricks, new best, reaching the storm zone).
Everything is generated at runtime with oscillators/noise buffers/filters — zero audio files,
zero new dependencies. No sound is ever created before the first user gesture (`initAudio()` is
only called from inside a `game:start` handler, mirroring the existing pattern in `core.js`).

## Files touched
- `/Users/nvmmonsalud/session-runner/js/audio.js` — rewritten/expanded (owned file, main work).
- `/Users/nvmmonsalud/session-runner/js/rider.js` — one surgical line added inside `landTrick()`:
  `window.GameEvents.emit('rider:land', { turns });` (fires for *every* landing, clean or
  trick — needed because the existing `trick:landed` event only fires when `turns > 0`, but
  landing squash should play on every landing). No other line touched.
- `/Users/nvmmonsalud/session-runner/js/core.js` — one surgical hook added around the game loop
  to support hit-stop:
  ```js
  const clock = new THREE.Clock();
  const juice = window.Game.juice;
  function loop() {
    const dt = Math.min(clock.getDelta(), .05);
    if (!juice || !juice.hitstopUntil || performance.now() >= juice.hitstopUntil) update(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  ```
  `clock.getDelta()` is still called every frame (so time isn't double-counted after a freeze),
  only the `update(dt)` call is skipped while `window.Game.juice.hitstopUntil` is in the future.
  Rendering always continues, so the freeze reads as a real "impact frame," not a stutter. No FOV
  logic was touched — that remains entirely owned by the VFX workstream.
- `/Users/nvmmonsalud/session-runner/workstreams/audio/HANDOFF.md`, `BUILD-LOG.md`,
  `VERIFICATION.md` (new, this workstream's docs).

Nothing else was touched. `js/story.js`, `js/ui.js`, `js/world.js`, `js/vfx.js`, `index.html`,
`css/style.css`, and other workstreams' directories were not modified (`js/vfx.js` was created by
the parallel VFX agent during this session — confirmed no scale/juice/audio conflicts with it, see
Known issues below).

## Audio architecture (node graph)
```
AudioContext (actx) — created lazily in initAudio(), only from a user-gesture-triggered handler
 ├─ sfxBus (GainNode, gain=1) → destination
 │    ├─ blip() / crash()               (original SFX, unchanged levels)
 │    ├─ thud()                         (trick-stomp impact: pitch-drop sine + lowpassed noise burst)
 │    ├─ uiBlip()                       (two-tone square click, menu start/restart)
 │    ├─ stinger(biomeIndex)            (short melodic 3-note run, per biome)
 │    ├─ calloutVoice(kind)             (bandpass-swept sawtooth "voice" gesture sequence)
 │    └─ wind (bandpass-filtered looping noise + separate gust gain, both → sfxBus)
 └─ musicBus (GainNode, gain=1) → destination
      └─ music.musicGain (fades 0→.22 on start, →0 on stop)
           └─ music.filter (lowpass, LFO-modulated cutoff)
                ├─ 4 chord voices (oscillator + gain each, per-biome waveform/freq/detune)
                └─ 1 "special" voice (per-biome extra color: sub-bass pad for Twilight,
                   shimmer partial for Aurora, driving sawtooth sub for Storm)
      └─ rhythm pulse (kick: pitch-drop sine; hat: highpassed noise burst) scheduled via a
         lookahead scheduler (`setInterval` @45ms, schedules audio-time-accurate events up to
         180ms ahead) — density and bpm scale with biome + current speed intensity
```
`sfxBus` is always gain 1 (unchanged from before); `musicBus`/`music.musicGain` are kept low
(peaks ~.22) so the bed always sits under SFX ("music under SFX").

A shared 1-second white-noise `AudioBuffer` is created once and reused by hats/thud/wind's own
buffer (wind uses its own 2s loop buffer since it needs `loop = true`).

## Feature checklist
1. Ambient music bed (chord pad + LFO-modulated filter + rhythm pulse, biome/speed-scaled,
   starts on `game:start`, fades on `game:over`, resumes on restart) — **done**.
2. Wind whoosh (bandpass noise, speed-scaled gain/cutoff, gust swell while `st.airborne`) —
   **done**.
3. Trick-stomp hit-stop (~80ms freeze via `window.Game.juice.hitstopUntil`, surgical `core.js`
   hook) + weighty thud (low sine + noise burst) on `trick:landed` (turns > 0) — **done**.
4. Landing squash-and-stretch on every landing (0.85/1.1 scale, damped spring back over ~150ms,
   driven from `js/audio.js`'s own rAF loop against `window.Game.rider.rider.scale` — `rider.js`
   never touches `.scale`, so there's no fight) — **done**.
5. Zone-transition stingers, distinct per biome (calm rising triad / shimmering high sparkle /
   tense sawtooth stab), fired on real biome progression only (not on the forced reset-to-0 at
   run start — see Known issues for how this is detected) — **done**.
6. UI click blips (crisp two-tone square click, distinct from gameplay `blip()`), fired on
   `game:start` (covers both "start" and "restart" since both funnel through the same event) —
   **done**.
7. Callout voice: synth pitch-swept formant-ish blip sequence for big moments — double+ trick
   (`turns >= 2`, i.e. "DOUBLE 720"+), new best (`game:over` with `newBest: true`), and reaching
   Act III / Whiteout Storm (`biome:change` to index 2) — **done**. Text/UI display for these
   moments is the storyline agent's responsibility; this workstream only adds sound.
8. All existing SFX (`blip`/`crash`) keep their exact signatures and are still called unmodified
   by `world.js`, `rider.js`, `core.js` — **done** (verified no call sites needed changes; they
   were only re-routed internally through `sfxBus`, which is gain 1 and doesn't change output).

## New `window.Game.audio` / `window.Game.juice` API surface
```js
window.Game.audio = {
  initAudio(),                     // unchanged signature/behavior
  blip(freq, dur, type, vol),      // unchanged
  crash(),                         // unchanged
  thud(),                          // low thud + noise burst, no args
  uiBlip(),                        // crisp two-tone UI click
  stinger(biomeIndex),             // 0/1/2 — short melodic zone-transition run
  calloutVoice(kind),              // kind: 'trick' | 'newbest' | 'act3'
  music: {
    start(),                       // builds nodes, fades music bed in over 1.6s
    stop(),                        // fades out over .35s, tears down nodes after
    setIntensity(speedNorm),       // 0..1, brightens filter cutoff + tempo/density
    setBiome(index)                // crossfades chord set/waveforms/filter Q to biome mood
  },
  wind: {
    start(),                       // builds looping filtered-noise wind bed
    stop()                         // fades out and stops the noise source
  },
  getContext()                     // returns the raw AudioContext (or null pre-gesture)
};

window.Game.juice = {
  hitstopUntil,                    // timestamp (performance.now()); core.js's loop checks this
  hitstop(ms),                     // arms a freeze window of `ms` milliseconds
  squash()                         // triggers the landing squash spring (drives rider.scale)
};
```

## GameEvents consumed
- `game:start` → `initAudio()`, `music.start()`, `wind.start()`, `uiBlip()`.
- `game:over` → `music.stop()`, `wind.stop()`, and `calloutVoice('newbest')` if `newBest`.
- `biome:change` `{ index }` → `music.setBiome(index)` always; `stinger(index)` (+
  `calloutVoice('act3')` if `index === 2`) only when this is a genuine forward progression during
  an active run (see Known issues for the exact detection logic — needed because `world.js` also
  emits this event on the forced reset-to-biome-0 at the start of every run).
- `trick:landed` `{ turns }` → `thud()`, `juice.hitstop(80)`, and `calloutVoice('trick')` if
  `turns >= 2`.
- `rider:land` `{ turns }` (new event, emitted unconditionally from `rider.js`'s `landTrick()`) →
  `juice.squash()`.

## What works
- All six original `js/*.js` modules (plus the new `js/vfx.js` from the parallel VFX workstream)
  pass `node --check --experimental-default-type=module`.
- `index.html`, `css/style.css`, and every `js/*.js` file serve `200` from a static file server.
- `blip()`/`crash()` keep their exact original call signature and perceived output level — every
  existing call site in `world.js`/`rider.js`/`core.js` needed zero changes.
- Music, wind, hit-stop, squash, stingers, UI blips and callout voice are all wired purely through
  `window.GameEvents`/`window.Game.*` — no direct imports of other modules, per the architecture.
- Hit-stop and landing squash are independent systems (squash is driven by `audio.js`'s own rAF
  loop, decoupled from `core.js`'s frozen `update()`), so during a hit-stopped trick landing the
  rider still visibly squashes while the world holds — this was an intentional "juice" pairing.

## Known issues / things to watch
- **Biome-progression detection for stingers**: `world.js`'s `applyBiome(0, true)` (the forced
  reset called at the top of every `startGame()`) runs *before* `game:start` is emitted, and it
  emits its own `biome:change` event with no `force` flag in the payload. To avoid firing a
  zone-transition stinger on every run's reset-to-Twilight-Pines, the `biome:change` handler only
  plays a stinger when `music.playing && index > music.biomeIndex` (i.e. the music system is
  already running for this run AND the biome index is genuinely increasing). This is robust
  across restarts because `music.playing` is `false` at the moment of the forced reset (the
  previous run's `game:over` already stopped it, and the new run's `music.start()` hasn't run
  yet — it's called from the same `game:start` handler, just registered in the same file so order
  doesn't matter across separate listeners on the same event, only relative to `core.js`'s own
  synchronous call order inside `startGame()`). If a future workstream changes the call order in
  `core.js`'s `startGame()` (e.g. emits `game:start` before calling `applyBiome`), this detection
  keeps working either way since it only compares `index` to the last known `music.biomeIndex`,
  never fires for `index === 0`, and `music.playing` naturally gates it.
- The rhythm scheduler uses `setInterval(fn, 45)` with an AudioContext-time-accurate lookahead
  window (standard WebAudio metronome pattern) rather than `setTimeout` chains — this avoids
  drift/jank from `requestAnimationFrame` throttling in background tabs, but note the interval
  keeps running (harmlessly, since `musicScheduleRhythm()` early-returns when `!music.playing`)
  between `music.stop()` being called and its `clearInterval` firing — this is intentional and by
  design, not a bug.
- Two independent `AudioContext`-driven timing systems now exist for feel: `core.js`'s
  `requestAnimationFrame` game loop (gated by hit-stop) and `js/audio.js`'s own
  `requestAnimationFrame` follower loop (never gated, always runs so wind/music/squash stay smooth
  through hit-stops and menu screens). This is intentional — juice/ambience should not freeze when
  gameplay does.
- Not tested in an actual browser audio pipeline in this environment (no browser automation tool
  available) — verified via static syntax checking, manual code review against the existing event
  contracts, and confirming every consumed event/payload shape matches what `core.js`/`rider.js`/
  `world.js` actually emit. A manual smoke test (play a run, land a spin trick, collect shards
  through a biome transition, wipeout, restart) in a real browser is recommended before shipping.
- `js/vfx.js` (added by the parallel VFX workstream during this session) was checked for
  conflicts: it does not touch `window.Game.juice`, does not touch `window.Game.rider.rider.scale`
  (it scales its own particle sprites, an unrelated object), and does not import `js/audio.js`.
  No conflicts found as of this workstream's completion.

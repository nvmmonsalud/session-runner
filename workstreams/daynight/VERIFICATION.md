# WS-DN — VERIFICATION (all commands re-run by the Fable 5 orchestrator, 2026-07-31)

## 1. Logic harness — `node workstreams/daynight/sim.mjs` (verbatim)

```
=== WS-DN day/night logic self-check ===
t=0s  (game:start, biome 0)        time01=0.270 phase=dawn  night=0.263 hemi=0.982 key=0.788 fill=0.437
t=13.4s biome->1 anchor=0.9        time01=0.292 phase=dawn  night=0.004 hemi=1.037 key=0.976 fill=0.351
t=15s                              time01=0.090 phase=night night=1.000 hemi=0.900 key=0.510 fill=0.682
t=29.7s biome->2 anchor=0.74       time01=0.943 phase=night night=1.000 hemi=0.900 key=0.510 fill=0.682
t=30s                              time01=0.913 phase=night night=1.000 hemi=0.900 key=0.510 fill=0.682
t=45s                              time01=0.784 phase=dusk  night=1.000 hemi=0.900 key=0.510 fill=0.682
t=60s (end of simulated run)       time01=0.852 phase=night night=1.000 hemi=0.900 key=0.510 fill=0.682  dist=1444 score=751 biome=2
t=60s (anchors disabled control)   time01=0.598 phase=day   night=0.000 hemi=1.204 key=1.544 fill=0.350  dist=1376
--- anchors + extremes ---
biome 0 anchor (dawn)              time01=0.270 phase=dawn  night=0.263 hemi=0.982 key=0.788 fill=0.437
biome 1 anchor (deep night)        time01=0.900 phase=night night=1.000 hemi=0.900 key=0.510 fill=0.682
biome 2 anchor (burning dusk)      time01=0.740 phase=dusk  night=0.458 hemi=0.950 key=0.681 fill=0.502
deepest night (time01=0)           time01=0.000 phase=night night=1.000 hemi=0.900 key=0.510 fill=0.682
noon (time01=.5)                   time01=0.500 phase=day   night=0.000 hemi=1.250 key=1.700 fill=0.350
--- gates ---
aurora gate (nightFactor>.5) at biome-1 anchor: true  | at noon: false
readability floor over full cycle: hemi>=0.900 (HEMI_MIN=0.8), key>=0.510, fill>=0.350
day baseline for comparison:       hemi=1.250 key=1.700 fill=0.682
star opacity at deepest night: min(.85, 0.720 * 1.180) = 0.850
star opacity at noon:          min(.85, 0.720 * 0.000) = 0.000
clamp sanity: 1
```

Read-out: cycle advances with progression (time01 moves every sample); each biome converges to its anchor (0.270 / 0.900 / 0.740); readability floor holds over the FULL cycle (hemi never below 0.900 ≥ HEMI_MIN 0.8; fill BRIGHTENS at night 0.35→0.68); aurora gate true only in darkness; star opacity clamped at .85 night, 0 at noon.

## 2. Syntax — `node --check --input-type=module < js/*.js` (verbatim; note the `--experimental-default-type=module` flag is broken on this Node v24, stdin form used)

```
js/audio.js: OK
js/core.js: OK
js/daynight.js: OK
js/rider.js: OK
js/story.js: OK
js/ui.js: OK
js/vfx.js: OK
js/world.js: OK
```

## 3. Serve gate — `python3 -m http.server 8343 --bind 127.0.0.1` + curl (verbatim)

```
200 index.html
200 css/style.css
200 js/audio.js
200 js/core.js
200 js/daynight.js
200 js/rider.js
200 js/story.js
200 js/ui.js
200 js/vfx.js
200 js/world.js
```

## 4. Tell grep — `grep -rniE 'TODO|FIXME|XXX|placeholder|STUB_REPLACE_ME' index.html css js | grep -v workstreams`

```
ZERO MATCHES
```

## 5. Headless Chrome boot smoke (orchestrator, SwiftShader WebGL, 8s virtual time)

```
DROP IN
SESSION RUNNER
TWILIGHT PINES
id="dnPhase" style="...color: rgb(255, 199, 154);">◔ DAWN
```

Page boots, menu overlay populated, `#dnPhase` HUD indicator rendered live with dawn label + dawn tint — daynight.js executed to completion at runtime with zero page JS errors (only Chrome-internal process noise in stderr).

## 6. Integration audit (orchestrator greps)

- `index.html:32` — daynight.js script tag, last, after vfx.js ✓
- `js/vfx.js:280` — `window.Game.dayNight?.update(dt)` single hook ✓
- `js/vfx.js:170-175` — aurora gated `biomeIndex === 1 && nightFactor > .5` with smoothstep fade ✓
- `js/vfx.js:292` — star target `min(.85, starGoal * dn.starScale)` ✓
- `js/world.js:360-361` — `get lights()` / `get sunMesh()` ✓
- Biome thresholds `at: 0/120/300` + core.js `score >= 300 ? 2 : score >= 120` intact ✓
- localStorage keys sessionRunner3dHi / sessionRunner3dRuns / sessionRunnerStory intact ✓
- No double sky init: `applyDomeColors()` delegates to `paintSky()`; daynight repaints via the same primitive, throttled ✓

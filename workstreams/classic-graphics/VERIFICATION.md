# WS-CG — VERIFICATION (all commands re-run by the Fable 5 orchestrator, 2026-07-31)

## 1. Syntax — `node --check --input-type=module < js/*.js` (verbatim; `--experimental-default-type=module` broken on this Node v24, stdin form used)

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

## 2. Serve gate — `python3 -m http.server 8343 --bind 127.0.0.1` + curl every asset (verbatim)

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

## 3. Tell grep — `grep -rniE 'TODO|FIXME|XXX|placeholder|STUB_REPLACE_ME' index.html css js | grep -v workstreams`

```
ZERO MATCHES
```

## 4. Gameplay-numbers audit (orchestrator greps, verbatim)

Biome thresholds intact:
```
17:  { name: 'TWILIGHT PINES', icon: '✦', at: 0, ... threshold: 0 },
18:  { name: 'AURORA GLACIER', icon: '✦', at: 120, ... threshold: 120 },
19:  { name: 'WHITEOUT STORM', icon: '⚡', at: 300, ... threshold: 300 }
```
core.js biome gate `st.score >= 300 ? 2 : st.score >= 120 ? 1 : 0` — 1 match, unchanged.

Collision radii intact:
```
106:  return { g, r: s + .35 };   (rock)
117:  return { g, r: .92 };       (ice spire)
```

localStorage keys intact: `sessionRunner3dHi` (core.js:15,112), `sessionRunner3dRuns` (core.js:16,105), `sessionRunnerStory` (story.js:126). core.js/story.js/audio.js carry no WS-CG edits (git diff: untouched).

Particle pool sizes unchanged: SNOW_N 450, SPRAY_N 300, TRAIL_N 22, CARVE_N 46 (only size/opacity/velocity tuning).

## 5. Headless Chrome boot smoke (shared with WS-DN — SwiftShader WebGL)

```
DROP IN
SESSION RUNNER
TWILIGHT PINES
```
Boots clean with both workstreams merged; zero page JS errors.

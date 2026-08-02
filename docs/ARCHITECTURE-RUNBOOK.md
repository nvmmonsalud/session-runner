# Session Runner 3D — Architecture & Operations Runbook

Accurate as of commit `8e58fe0b` (branch `max-sprint-20260801`). Static vanilla ES-module Three.js game; no build step, no backend, one CDN dependency (`three@0.160.0` via import map).

## 1. Module map

Load order matters. `index.html` loads eight `type="module"` scripts **in this exact order** (modules execute in document order):

```
index.html          shell: HUD DOM, overlay DOM, import map (three@0.160.0 on jsdelivr),
                    inline bootstrap of window.GameEvents (pub/sub) + window.Game namespace
css/style.css       all HUD/overlay/storycard/popup/vignette styling
js/world.js   362L  terrain mesh + vertex-color shading, 3 BIOMES + applyBiome(), obstacles
                    (rocks/ice spires w/ inverted-hull outline shells), launch pads, shards,
                    decor trees, mountains, sun disc, snow + spray particle buffers.
                    Exposes lights {hemi,key,fill} + sunMesh getters for daynight.js.
js/rider.js   306L  rider rig build, carve lean, jump/spin/land trick logic (startJump,
                    landTrick), scarf spring, board glow trail + carve-track decal pools.
js/audio.js   520L  100% procedural WebAudio: blip/crash/thud/uiBlip/stinger/calloutVoice,
                    wind loop, music bed (per-biome chords/tempo/density), hit-stop +
                    landing-squash "juice" (window.Game.juice). Runs its OWN rAF loop.
js/ui.js      154L  DOM refs + setters (score/combo/zone/meta/speedbar/trick/overlay/
                    announce/storycard/epilogue), pooled score popups. ui.update(dt)
                    forwards to story.tick(dt).
js/story.js   298L  all narrative copy; 3-act structure mapped 1:1 to biomes; story-card
                    queue; persisted story progress (sessionRunnerStory).
js/core.js    261L  OWNS: renderer/scene/camera, game loop (rAF, delta-capped 0.05s),
                    state machine (MENU=0/PLAYING=1/GAME_OVER=2), input (keyboard/touch/
                    mouse), physics + scoring + Flow combo, spawn timers, collision,
                    expedition ranks, localStorage. Calls world.init / rider.init at load.
js/vfx.js     310L  sky dome (vertex-gradient), star field, sun-glow sprites, aurora
                    ribbons (biome 1 + darkness gated), speed streaks, FOV kick, CSS
                    vignette, shake polish. Grabs scene/camera from window.Game.core —
                    MUST load after core.js. Calls dayNight.update(dt) each frame.
js/daynight.js 378L progression-paired day/night cycle: time01 advances with run distance,
                    eases to per-biome anchors (Pines .27 dawn / Glacier .90 night /
                    Storm .74 dusk); modulates key/hemi/fill lights, sky dome, stars, fog,
                    background, sun arc. HUD #dnPhase chip. MUST load last.
```

No module imports another game module. All coordination is via two globals defined inline in `index.html`:

- `window.GameEvents` — `{ on(ev, fn), emit(ev, data) }`, listeners in registration order, no unsubscribe.
- `window.Game` — namespace: `state`, `core`, `world`, `rider`, `audio`, `ui`, `story`, `vfx`, `dayNight`, `juice`.

## 2. State & event contracts

### Game state (`window.Game.state`, owned by core.js)

- `state`: `STATE.MENU(0) | PLAYING(1) | GAME_OVER(2) | PAUSED(3)`.
- Run values: `dist`, `score`, `styleScore`, `speed`, `combo` (1–5), `comboTimer`, spawn timers (`spawnT/shardT/padT`), `shake`, `frame`.
- Air/trick: `airborne`, `airY`, `airVy`, `spin`, `spinAbs`, `trickTimer`, `safeTimer` (post-landing collision grace).
- Persistent: `hiScore`, `completedRuns`, `expedition = 1 + floor(completedRuns/3)`.
- Input: `keys` map, `touchX`, `player {x, vx}` clamped to `LANE = ±14`.

### Events on `window.GameEvents`

| Event | Emitter | Payload | Consumers |
|---|---|---|---|
| `game:start` | core.startGame | `{}` | audio (music/wind start), story (reset run counters), daynight (reset to dawn anchor) |
| `game:over` | core.wipeout | `{score, best, newBest, expedition, expeditionUp, completedRuns}` | audio (stop music/wind, new-best callout), story (results epilogue) |
| `biome:change` | world.applyBiome | `{index, biome}` | rider (accent colors), vfx (dome/stars/sun-glow), audio (music mood + stinger), story (act card), daynight (anchor pull + palette capture) |
| `shard:collected` | core.update | `{combo}` | ui (popup), story (counters + flavor) |
| `trick:landed` | rider.landTrick | `{turns, points}` | ui (popup), audio (thud + hit-stop 80 ms), story (named trick card) |
| `rider:land` | rider.landTrick | `{turns}` | audio (squash spring) |
| `jump:start` | rider.startJump | `{fromPad}` | (no consumers currently) |
| `pad:hit` | core.update | `{}` | (no consumers currently) |
| `game:pause` / `game:resume` | core.togglePause | `{}` | audio (ctx suspend/resume), ui (pause button show/hide) |

### Frame flow

`core.loop()` (rAF): skip `update(dt)` while `performance.now() < Game.juice.hitstopUntil`, then always `renderer.render`. `core.update(dt)` → world snow/spray (ambient, always runs), `ui.update` (→ `story.tick`, skipped while `PAUSED` so story/announce timers freeze), `vfx.update` (→ `dayNight.update`), then gameplay sim (`dist`/`score`/`speed`/spawn timers/entity movement) only when `PLAYING` — `PAUSED` hits the same early return as `MENU`/`GAME_OVER`, which is what freezes the run. **audio.js additionally runs its own independent rAF loop** (wind gain, music intensity, squash spring) — it reads `Game.state` but never mutates it; it keeps running while paused (harmless, since the AudioContext itself is suspended so nothing audible happens).

### Persistence (localStorage, all wrapped in try/catch)

| Key | Writer | Shape |
|---|---|---|
| `sessionRunner3dHi` | core (on new best at wipeout) | number |
| `sessionRunner3dRuns` | core (every wipeout) | number |
| `sessionRunnerStory` | story (every trick/shard/act change) | `{maxAct 1-3, epilogueSeen, totalTricks, totalShards}` |

## 3. Run locally

```bash
cd <repo-root>
python3 -m http.server 8000   # any static server; ES modules forbid file:// loading
# open http://localhost:8000
```

Requirements: a WebGL-capable browser and network access to `cdn.jsdelivr.net` (three.js is not vendored — offline = blank screen, see audit F1/H1). Audio starts only after first interaction (Space/tap) per browser autoplay policy.

Debug handles in the console:

```js
Game.core.startGame()          // start a run without input
Game.dayNight.setTime(0.9)     // jump the sky to deep night (debug/spot-check)
Game.state                     // live-inspect the whole run state
```

## 4. Verification & smoke-testing

Standard gate (used by every prior phase, re-run by orchestrator from repo root):

```bash
for f in js/*.js; do node --check --input-type=module < "$f" && echo "OK $f"; done
python3 -m http.server 8344 --bind 127.0.0.1 &   # then curl each of the 10 assets → 200
grep -rnE 'TODO|FIXME|XXX|placeholder|STUB_REPLACE_ME' index.html css/ js/ || echo CLEAN
node workstreams/daynight/sim.mjs                 # day/night logic harness (pure Node)
```

Browser smoke (pattern from phase 2): launch Chrome headless with SwiftShader WebGL —

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --enable-unsafe-swiftshader --remote-debugging-port=9333 \
  http://127.0.0.1:8344 &
curl -s http://127.0.0.1:9333/json   # → webSocketDebuggerUrl for CDP driving
```

**Pause feature (implemented):** `node workstreams/pause/smoke.mjs` is the single reproduction/verification entry point — it boots the server + headless Chrome itself and asserts: `startGame()` reaches `PLAYING` with `dist` advancing; `togglePause()` reaches `PAUSED` and `dist` stays frozen across a delay; `Space` while `PAUSED` resumes to `PLAYING` without resetting `dist`; `dist` advances again after resume; the AudioContext is not `running` while paused. Manual reproduction: start a run, press `P` or `Esc` → PAUSED overlay + silence + HUD pause button hides; press `P`/`Esc`/`Space`/tap/click → run continues from the same distance with `safeTimer >= 0.6`; switch tabs mid-run → auto-paused on return via `visibilitychange`.

## 5. Deploy

- **Target:** Vercel, project `session-runner`, live at https://session-runner.vercel.app.
- **Config:** framework preset **Other**, no build command, no output directory transform — the repo root IS the site. Deploy via git push (if repo is connected) or `vercel --prod`.
- **There is no CI.** The verification gate above is the pre-deploy checklist; run it manually before any deploy.
- **Rollback:** Vercel dashboard → previous deployment → Promote; or `git revert` + redeploy. No data-migration surface (all player state is client-side localStorage).

## 6. Known operational boundaries

- **Single CDN dependency, no SRI:** `three@0.160.0` from jsdelivr. CDN outage or tampering directly affects the live game (audit H1).
- **No WebGL → hard crash:** renderer construction in core.js throws; downstream modules (vfx.js reads `Game.core`) TypeError; player sees a blank page (audit F1, observed in phase-1 headless smoke).
- **Pause (this sprint):** `P`/`Esc` toggle, `Space`/tap/click resume from `PAUSED`, auto-pause on tab hide. Closes the pre-sprint gap where tab-switching mid-run left the run/audio live.
- **Hit-stop is wall-clock:** `juice.hitstopUntil` uses `performance.now()`; anything that stalls the tab longer than the 0.05 s delta cap compresses gameplay time, by design.
- **sim.mjs constant drift:** `workstreams/daynight/sim.mjs` copies constants from `js/daynight.js`; tuning changes must update both (recorded in `STATUS.json` known_issues).
- **Sub-agent 600 s ceiling:** background workstream sessions have twice been truncated before writing their own docs; orchestrator reconstructs docs from verified disk state (see `ORCHESTRATION-LOG.md`).
- **No telemetry/analytics/error reporting:** the only observability is manual browser testing.
- **Scope wall (standing):** no npm, no build step, no new CDN deps, no backend, static SPA preserved.

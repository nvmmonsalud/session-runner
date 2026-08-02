# VERIFICATION — WS-PZ (Pause/Resume)

All commands run from repo root, branch `max-sprint-20260801`, after implementation. Output captured verbatim (trimmed of the http.server access-log lines where noted).

## 1. Syntax — every JS module

```
for f in js/*.js; do node --check --input-type=module < "$f" && echo "OK $f" || echo "FAIL $f"; done
```

```
OK js/audio.js
OK js/core.js
OK js/daynight.js
OK js/rider.js
OK js/story.js
OK js/ui.js
OK js/vfx.js
OK js/world.js
```

Result: **8/8 OK.**

## 2. Asset serving — all 200

```
python3 -m http.server 8344 --bind 127.0.0.1 &
SRV=$!
sleep 1
for a in index.html css/style.css js/core.js js/world.js js/rider.js js/vfx.js js/audio.js js/ui.js js/story.js js/daynight.js; do
  echo "$(curl -so /dev/null -w '%{http_code}' http://127.0.0.1:8344/$a) $a"
done
kill $SRV
```

```
200 index.html
200 css/style.css
200 js/core.js
200 js/world.js
200 js/rider.js
200 js/vfx.js
200 js/audio.js
200 js/ui.js
200 js/story.js
200 js/daynight.js
```

Result: **10/10 → 200.**

## 3. Tell-check

```
grep -rnE 'TODO|FIXME|XXX|placeholder|STUB_REPLACE_ME' index.html css/ js/ || echo CLEAN
```

```
CLEAN
```

## 4. Day/night sim harness (regression check — untouched subsystem)

```
node workstreams/daynight/sim.mjs
```

Exit code: `0`. Full output ends with:

```
--- gates ---
aurora gate (nightFactor>.5) at biome-1 anchor: true  | at noon: false
readability floor over full cycle: hemi>=0.900 (HEMI_MIN=0.8), key>=0.510, fill>=0.350
day baseline for comparison:       hemi=1.250 key=1.700 fill=0.350
star opacity at deepest night: min(.85, 0.720 * 1.180) = 0.850
star opacity at noon:          min(.85, 0.720 * 0.000) = 0.000
clamp sanity: 1
```

No regression — `js/daynight.js` was not touched by this workstream, and this harness mirrors its logic in pure Node, so a passing run here confirms the pause change didn't disturb it (nothing in the diff could, since `daynight.js` is untouched, but this was run per the gate contract anyway).

## 5. Pause feature smoke test

```
node workstreams/pause/smoke.mjs
```

```
OK: state is PLAYING after startGame (got 1)
OK: dist advanced after startGame (got 6.5272961074917895)
OK: state is PAUSED after togglePause (got 3)
OK: dist frozen while paused (6.5272961074917895 -> 6.5272961074917895)
OK: Space while PAUSED resumes to PLAYING (got 1)
OK: Space resume did not reset dist (was 6.5272961074917895, now 6.5272961074917895)
OK: dist advances again after resume (6.5272961074917895 -> 14.927083731157635)
OK: re-pause succeeded before audio check (got 3)
OK: AudioContext not running during pause (got suspended)

All pause smoke assertions passed
```

Exit code: `0`. All 9 assertions passed on the first run.

Post-run process check (`ps aux | grep -i "http.server 8391\|remote-debugging-port=9391"`) showed no leftover processes — `killAll()` tore down the asset server, Chrome, and the temp `--user-data-dir` cleanly, including on this successful path (it's wired via `.finally()`, so it also runs on failure/throw).

## 6. Acceptance criteria cross-check (docs/MAX-SPRINT-PLAN.md lines 27–38)

| # | Criterion | Verified by |
|---|---|---|
| 1 | `P`/`Escape` while `PLAYING` → `STATE.PAUSED` (3), overlay shows PAUSED title + resume CTA via existing `ui.setOverlayText`/`showOverlay` | Code review of `core.js` `togglePause()` + `keydown` handler; smoke step 2 confirms the state transition |
| 2 | Frozen simulation while paused (`dist`, `score`, `speed`, timers, entity positions); ambient visuals may continue | Smoke steps 2/3 (`dist` frozen across 500 ms); code review confirms `PAUSED` hits the same `update(dt)` early return as `MENU`/`GAME_OVER` |
| 3 | `P`/`Escape`/`Space`/tap/click while `PAUSED` resumes, `safeTimer >= 0.6` | Smoke step 3 (`Space` resumes); code review of `togglePause()`'s `st.safeTimer = Math.max(st.safeTimer, .6)`; `keydown`/`touchstart`/`mousedown` all guard `PAUSED` → `togglePause()` |
| 4 | `Space`/tap while `PAUSED` must NOT call `startGame()` (both `core.js` call sites guarded) | Code review — both sites now branch on `PAUSED` *before* the `!== PLAYING` → `startGame()` fallback; smoke step 3 confirms `dist` is not reset |
| 5 | `visibilitychange` → `hidden` while `PLAYING` auto-pauses | Code review of the new `document.addEventListener('visibilitychange', ...)` listener (not exercised by the smoke harness — headless Chrome's `document.hidden` semantics for a foreground automated tab are unreliable to assert against; documented as a known limitation below) |
| 6 | AudioContext suspended on pause / resumed on resume, null-guarded, wired via `audio.js` event listeners | Code review of the two new `GameEvents.on('game:pause'/'game:resume', ...)` listeners in `audio.js`; smoke step 5 confirms `actx.state !== 'running'` while paused |
| 7 | `GameEvents` emits `game:pause` and `game:resume` | Code review of `togglePause()`; indirectly confirmed by smoke (audio suspend only happens because the event fired and `audio.js`'s listener ran) |
| 8 | `window.Game.core.togglePause()` exposed | Code review of the `window.Game.core = {...}` export; the entire smoke harness depends on this call succeeding |
| 9 | JS-created HUD pause button, `pointer-events: auto`, visible only while `PLAYING`, doesn't trigger touch-steer | Code review of `js/ui.js` (`#pauseBtn` creation + `game:start`/`game:pause`/`game:resume`/`game:over` visibility wiring) and `css/style.css` (`pointer-events: auto`, `display: none` default); not exercised by the smoke harness, which drives `togglePause()` directly rather than clicking the DOM button — documented as a known limitation below |
| 10 | No changes to gameplay tuning, biome thresholds, Flow ×5, localStorage keys, script order, import map; `daynight.js`/`world.js`/`rider.js`/`story.js`/`vfx.js` untouched | `git diff --stat` (see below) |

```
git diff --stat
 README.md     |  1 +
 css/style.css |  6 ++++++
 js/audio.js   |  8 ++++++++
 js/core.js    | 43 ++++++++++++++++++++++++++++++++++++++-----
 js/ui.js      | 25 +++++++++++++++++++++++++
 5 files changed, 78 insertions(+), 5 deletions(-)
```

Plus new untracked files under `workstreams/pause/` and `docs/`. No other file touched.

## Known limitations of this verification

- The smoke harness exercises the **state machine and audio contract** directly (calling `togglePause()`/dispatching a synthetic `Space` `KeyboardEvent`) rather than clicking the physical `#pauseBtn` DOM element or toggling `document.visibilityState` — CDP's `Page.setWebLifecycleState`/`Emulation` visibility overrides are more involved than the plan's "no npm deps" harness budget justified for a single-feature sprint. Criteria 5 and the button-click path of criterion 9 are verified by code review, not by an automated browser assertion. A follow-up could add `Input.dispatchMouseEvent` clicks on `#pauseBtn`'s bounding box and `Page.setWebLifecycleState({state: 'frozen'})`/hidden-state overrides if stronger automated coverage is wanted later.
- `P`/`Escape` keyboard paths are covered by code review + the same `keydown` code path exercised by the `Space` dispatch in smoke step 3 (all three keys funnel through the same `togglePause()` call), not by a dedicated per-key CDP assertion.

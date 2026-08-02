# MAX SPRINT PLAN — Pause/Resume + Docs + Audit

- **Sprint:** max-sprint-20260801 (branch `max-sprint-20260801`)
- **Base commit:** `8e58fe0b377bba8d379f88aa4c14a9d73d93bf04`
- **Planner/orchestrator:** Claude Fable 5 (writes no game code)
- **Status:** PLANNED — no implementation has begun. See `docs/MAX-SPRINT-STATUS.json`.

## Outcomes authorized

- **A.** Ship one small, self-contained, user-visible feature: **Pause/Resume**.
- **B.** Durable architecture + operating docs: `docs/ARCHITECTURE-RUNBOOK.md`.
- **C.** Health + security audit: `docs/HEALTH-SECURITY-AUDIT.md`.

---

## A. Selected feature: Pause / Resume

### Why this one

The game has **no way to pause**: `js/core.js` has exactly three states (`MENU`, `PLAYING`, `GAME_OVER`) and the only exit from `PLAYING` is `wipeout()`. Switching tabs mid-run leaves the run live (music/wind keep playing via `js/audio.js`'s own rAF loop; on return the delta-capped loop resumes the run into whatever obstacle is at z≈0). Pause is:

- **User-visible and valuable** — standard expectation for a runner; protects long runs (Expedition ranks reward completed runs).
- **Dependency-free** — pure state-machine + DOM + WebAudio `suspend()/resume()`; the pinned `three@0.160.0` import map is untouched.
- **One Sonnet workstream** — touches 4 existing files plus one new test harness file.
- **Headless-verifiable** — `window.Game.core.togglePause()` is drivable over the Chrome DevTools Protocol from plain Node (global `WebSocket` + `fetch`, no npm packages). Node v22.22.3 and Chrome are confirmed present on this machine.

### Acceptance criteria

1. **Enter pause:** pressing `P` or `Escape` while `PLAYING` sets a new state `STATE.PAUSED` (value `3`; existing values 0/1/2 unchanged). The `#overlay` shows a PAUSED title with a resume CTA (reuse `ui.setOverlayText` + `showOverlay` — no new overlay DOM).
2. **Frozen simulation:** while paused, `dist`, `score`, `speed`, spawn timers, combo timer, story survive-timers, and obstacle/shard/pad positions do not advance. Ambient visuals (sky dome drift via `daynight.js`'s non-playing path) may continue — cosmetic only.
3. **Resume:** `P`, `Escape`, `Space`, tap, or click while `PAUSED` returns to `PLAYING` with all state values exactly as left, **except** `safeTimer` is raised to at least `0.6` so resuming isn't an instant unfair collision.
4. **No restart regression:** `Space`/tap while `PAUSED` must **not** call `startGame()`. (Today `core.js:56` and `core.js:61` fire `startGame()` on any non-`PLAYING` state — both call sites must be guarded. This is the highest-risk edge in the change.)
5. **Auto-pause:** `document.visibilitychange` → `hidden` while `PLAYING` triggers pause.
6. **Audio:** on pause the AudioContext is suspended (music, wind, rhythm scheduler silent); on resume it resumes. Implement by listening to new bus events in `js/audio.js`, not by reaching into audio internals from core.
7. **Events:** `GameEvents` emits `game:pause` and `game:resume` (payload `{}` acceptable), consistent with the existing event contract.
8. **API:** `window.Game.core.togglePause()` exposed (used by the headless test and mobile button).
9. **Mobile affordance:** a small pause button (JS-created like `#vfxVignette`/`#scorePopups`, `pointer-events: auto`) visible only during `PLAYING`; tapping it pauses without triggering the canvas touch-steer path.
10. **Preservation wall:** no changes to gameplay tuning numbers, biome thresholds (0/120/300), Flow ×5, trick logic, localStorage keys (`sessionRunner3dHi`, `sessionRunner3dRuns`, `sessionRunnerStory`), script load order, or the import map. `js/daynight.js`, `js/world.js`, `js/rider.js`, `js/story.js`, `js/vfx.js` untouched.

### Exact files likely to change

| File | Change |
|---|---|
| `js/core.js` | `STATE.PAUSED`, `togglePause()`, keydown/touch/mouse guards, pause gate in `update()`, `visibilitychange` listener, export on `window.Game.core` |
| `js/ui.js` | pause button element + show/hide wiring; (overlay text reused as-is) |
| `js/audio.js` | `game:pause`/`game:resume` listeners → `actx.suspend()/resume()` |
| `css/style.css` | `#pauseBtn` styling (+ mobile media query) |
| `workstreams/pause/smoke.mjs` | **new** — headless CDP verification harness (see below) |
| `workstreams/pause/{HANDOFF,BUILD-LOG,VERIFICATION}.md` | **new** — standard workstream docs |
| `README.md` | one controls-table row (`P` / `Esc` — pause) |
| `STATUS.json`, `docs/MAX-SPRINT-STATUS.json` | phase bookkeeping |

`index.html` should not need changes (button is JS-created). If the workstream finds it must touch `index.html`, that is a flag for orchestrator review.

### Tiered workstreams

- **WS-PZ (Sonnet 5, `sonnet5-game-dev`) — substantive:** implement criteria 1–10 in `js/core.js`, `js/ui.js`, `js/audio.js`, `css/style.css`; author `workstreams/pause/smoke.mjs`.
- **WS-PZ-DOCS (Haiku-tier / harness-only):** `workstreams/pause/{HANDOFF,BUILD-LOG,VERIFICATION}.md`, README controls row, STATUS bookkeeping. No game code.
- **Orchestrator (Fable 5):** dispatch, then independently re-run the full verification gate below; never trust sub-agent-reported results (established phase-1/phase-2 pattern in `ORCHESTRATION-LOG.md`).

### Verification gate (exact commands, run from repo root)

```bash
# 1. Syntax — every module (stdin form; --experimental-default-type=module is unreliable here)
for f in js/*.js; do node --check --input-type=module < "$f" && echo "OK $f" || echo "FAIL $f"; done

# 2. Asset serving — all 200
python3 -m http.server 8344 --bind 127.0.0.1 &
SRV=$!
sleep 1
for a in index.html css/style.css js/core.js js/world.js js/rider.js js/vfx.js js/audio.js js/ui.js js/story.js js/daynight.js; do
  echo "$(curl -so /dev/null -w '%{http_code}' http://127.0.0.1:8344/$a) $a"
done
kill $SRV

# 3. Tell-check — zero matches expected
grep -rnE 'TODO|FIXME|XXX|placeholder|STUB_REPLACE_ME' index.html css/ js/ || echo CLEAN

# 4. Feature smoke — headless CDP harness (no npm deps; Node >=22 global WebSocket/fetch)
node workstreams/pause/smoke.mjs
```

`smoke.mjs` contract: spawn `python3 -m http.server` + Chrome (`--headless=new --remote-debugging-port=<port> --enable-unsafe-swiftshader`), connect to `webSocketDebuggerUrl` from `http://127.0.0.1:<port>/json`, then via `Runtime.evaluate`:

1. `window.Game.core.startGame()`; wait ~500 ms; assert `state === PLAYING` and `dist > 0`.
2. `togglePause()`; assert `state === STATE.PAUSED`; record `dist`; wait 500 ms; assert `dist` unchanged.
3. Dispatch a `Space` keydown while paused; assert `dist` NOT reset (no restart) and state is `PLAYING` (resume) — criterion 3+4 together.
4. Wait 500 ms; assert `dist` advanced.
5. While paused (re-pause first), assert `window.Game.audio.getContext()?.state !== 'running'` — tolerate `null`/`suspended` since headless Chrome has no user gesture.
6. Exit non-zero on any failed assertion; always kill both child processes.

### Risks

- **Restart-guard regression (highest):** both `startGame()` call sites treat "not PLAYING" as "menu or dead". Mitigation: explicit `PAUSED` branches + smoke step 3 asserts it.
- **Hit-stop interplay:** `core.js` loop gates `update()` on `window.Game.juice.hitstopUntil` (`performance.now()`-based). Pausing during an 80 ms hit-stop is harmless (hit-stop expires in real time), but resume logic must not depend on it. No change to `juice` needed.
- **Audio context edge:** `actx` may be `null` (audio init failed) — pause listeners must null-guard, matching the file's existing style.
- **Story timers:** `story.tick` is driven from `ui.update` which currently runs every frame regardless of state. The pause gate in `core.update()` must freeze it (criterion 2) without breaking the menu-time story-card queue (which relies on `ui.update` running in MENU state — so gate on `PAUSED` specifically, not "not PLAYING").
- **Touch steer vs button:** pause button needs `pointer-events: auto` inside the `pointer-events: none` HUD and must stop propagation so the global `touchstart` handler doesn't also fire.

### Explicit non-goals

- No redesign, no multiplayer, no payments, no publishing/store work, no new world/storyline content.
- No settings menu, no audio-volume sliders, no rebindable keys (pause keys hardcoded).
- No changes to `js/daynight.js` (Opus-authored, sim-verified) or to gameplay tuning.
- No npm, no build step, no new CDN dependencies, no backend.
- Audit (Outcome C) is report-only: **no fixes applied this sprint** beyond the pause feature itself.

### Rollback

- Nothing is committed yet; base is `8e58fe0b`. Before implementation, snapshot: `git status` must be clean.
- Feature lands as one commit on `max-sprint-20260801`. Rollback = `git revert <feature-sha>` (or `git reset --hard 8e58fe0b` before push).
- The feature is additive: reverting restores exact pre-sprint behavior because criterion 10 forbids touching tuning/persistence. localStorage schema is unchanged, so rollback cannot corrupt player saves.
- Deploy rollback: Vercel — redeploy previous deployment from the dashboard, or `git revert` + push (static site, no migration surface).

---

## B. Architecture/runbook doc

`docs/ARCHITECTURE-RUNBOOK.md` — module map, state/event contracts, run/deploy workflow, pause smoke-test procedure, operational boundaries. Written this sprint (done in planning phase; update after implementation if contracts change).

## C. Audit scope

Covered in `docs/HEALTH-SECURITY-AUDIT.md`:

- **In scope:** all first-party code (`index.html`, `css/style.css`, `js/*.js` — 2,589 lines), persistence (localStorage), supply chain (jsdelivr import map), runtime failure modes (WebGL absence), test coverage gaps. Evidence: direct code read + prior orchestrator verification records (`STATUS.json`, `ORCHESTRATION-LOG.md`).
- **Out of scope:** Vercel platform config, penetration testing of the live deployment, performance profiling on real devices, `workstreams/` doc accuracy re-audit.
- Findings are report-only this sprint (see non-goals).

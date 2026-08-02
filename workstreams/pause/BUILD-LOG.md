# BUILD LOG — WS-PZ (Pause/Resume)

Chronological record of what was done and run, from repo root, on branch `max-sprint-20260801`.

## 1. Read source of truth

Read `docs/MAX-SPRINT-PLAN.md` (acceptance criteria lines 27–38), `docs/MAX-SPRINT-STATUS.json`, `docs/ARCHITECTURE-RUNBOOK.md`, `README.md`, `index.html`, `js/core.js`, `js/ui.js`, `js/audio.js`, `css/style.css`. Confirmed `git status` was clean of substantive files (only planning docs untracked) before touching anything.

## 2. Read the exact risk points called out by the plan

- `core.js:56` (`e.key === ' ' && st.state !== STATE.PLAYING` → `startGame()`) and `core.js:61` (`touchstart` → same pattern) both needed explicit `PAUSED` branches — the plan's "highest risk" item.
- `core.update(dt)` already early-returns on `st.state !== STATE.PLAYING` (pre-existing line, now after two ambient calls) — this meant `PAUSED` gets the *same* freeze as `MENU`/`GAME_OVER` for free: `dist`, `score`, `speed`, spawn timers, combo timer, entity positions. No new gating needed there.
- `ui.update(dt)` (story ticks + announce banner) is called *before* that early return, unconditionally — had to add a `PAUSED`-specific skip so story/announce timers freeze too, without breaking the `MENU`-state story-card queue (which needs `ui.update` running while `MENU`).
- `js/audio.js` already exports `getContext: () => actx` — no new export needed for the smoke harness to read AudioContext state.

## 3. Implemented in `js/core.js`

- Added `STATE.PAUSED = 3` (kept `MENU/PLAYING/GAME_OVER` at 0/1/2).
- Added `togglePause()`: `PLAYING → PAUSED` sets overlay text (via existing `ui.setOverlayText` + `showOverlay`, no new DOM) and emits `game:pause`; `PAUSED → PLAYING` raises `safeTimer` to `Math.max(safeTimer, .6)`, hides the overlay, emits `game:resume`.
- `keydown`: added a `p`/`P`/`Escape` branch that calls `togglePause()` when state is `PLAYING` or `PAUSED`, then returns (so it never falls into the space-bar restart branch). Guarded the existing `' '` branch so it calls `togglePause()` when `PAUSED` instead of falling through to `startGame()`.
- `touchstart`: guarded the same way — `PAUSED` → `togglePause()` + return, before the existing `!== PLAYING` → `startGame()` check.
- `mousedown`: same guard pattern.
- Added a `document.addEventListener('visibilitychange', ...)` listener: `document.hidden && state === PLAYING` → `togglePause()`.
- Gated `window.Game.ui.update(dt)` behind `st.state !== STATE.PAUSED` (previously unconditional) — this is the only change to the shared `update(dt)` freeze behavior; everything after the pre-existing `if (st.state !== STATE.PLAYING) return;` line was already correctly frozen for any non-`PLAYING` state, including the new `PAUSED`.
- Exposed `togglePause` on `window.Game.core`.

No changes to gameplay tuning constants, biome thresholds, Flow multiplier, `startGame()`/`wipeout()` internals, localStorage keys, or script/import order.

## 4. Implemented in `js/audio.js`

Added two `GameEvents` listeners at the end of the file (same style as the existing `game:start`/`game:over`/`biome:change` listeners):

```js
window.GameEvents.on('game:pause', () => { if (actx?.state === 'running') actx.suspend(); });
window.GameEvents.on('game:resume', () => { if (actx?.state === 'suspended') actx.resume(); });
```

Null-safe via optional chaining, matching the file's existing style (`if (!actx) return;` elsewhere). No reach-into-internals from `core.js` — `core.js` only emits events, `audio.js` owns the `AudioContext` calls.

## 5. Implemented in `js/ui.js`

Added a JS-created `#pauseBtn` (same pattern as the existing `#scorePopups` layer: `document.createElement`, appended to `#hud`), with:

- `touchstart`/`mousedown` listeners that call `e.stopPropagation()` only (no `preventDefault()` on touch, so the browser still synthesizes the `click` event for the tap) — this keeps the button tappable on mobile while stopping the event from reaching `core.js`'s global `touchstart`/`mousedown` listeners (which would otherwise also fire `startGame()`/`togglePause()` and double-toggle).
- A `click` listener that stops propagation, prevents default, and calls `window.Game.core.togglePause()`.
- `game:start`/`game:resume` → add `.show` class (visible); `game:pause`/`game:over` → remove `.show` class (hidden). Button is visible only while `PLAYING`, per acceptance criterion 9.

## 6. Implemented in `css/style.css`

Added `#pauseBtn` rules: small circular button, `display: none` by default (shown via `.show`), `pointer-events: auto` (HUD parent is `pointer-events: none`), positioned top-right below the existing `#speedwrap` bar so it doesn't overlap on desktop or the `560px` mobile breakpoint. Ran through the design-hook check afterward — it flagged pre-existing findings elsewhere in the file (overused font at L2, bounce easing in two pre-existing `@keyframes` blocks, a pre-existing `#speedbar` width transition) that predate this change and are out of scope for the pause workstream; left unchanged.

## 7. `README.md`

Added one row to the controls table: `` `P` or `Esc` `` → "Pause / resume".

## 8. `docs/ARCHITECTURE-RUNBOOK.md`

Updated the four "planned"/pre-sprint statements about pause to reflect the implementation: the state enum line, the `game:pause`/`game:resume` event-contract row, the frame-flow paragraph (documents the `ui.update` gate + confirms gameplay-sim freeze reuses the existing `PLAYING` early return), the smoke-test paragraph (was "planned", now describes the actual 5 assertions), and the "known operational boundaries" bullet (was "No pause (pre-sprint)").

## 9. Built `workstreams/pause/smoke.mjs`

Zero-dependency headless CDP harness per the plan's contract:

1. Spawns `python3 -m http.server 8391 --bind 127.0.0.1` from repo root, polls `GET /index.html` until 200.
2. Spawns headless Chrome (`--headless=new --remote-debugging-port=9391 --enable-unsafe-swiftshader --disable-gpu`, fresh disposable `--user-data-dir`), polls `GET /json/version` until ready.
3. Opens a tab directly at the game URL via `PUT /json/new?<url>` (falls back to `GET` for older Chrome), connects to `webSocketDebuggerUrl` with the global `WebSocket`.
4. Drives the page via `Runtime.evaluate` (`returnByValue: true`) — no `Input.dispatchKeyEvent` needed; the `Space` keypress is simulated by injecting `window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))` into the page, which `core.js`'s real `keydown` listener picks up exactly as a physical keypress would.
5. Asserts, in order: `startGame()` → `PLAYING` + `dist > 0`; `togglePause()` → `PAUSED` + `dist` frozen across a 500 ms wait; synthetic `Space` → `PLAYING` + `dist` not reset; another 500 ms wait → `dist` advances again; re-pause → AudioContext `state` is `null` or not `'running'`.
6. `killAll()` (kills both children, closes the WebSocket, removes the temp profile dir) runs in a `.finally()` on `main()`, so it always executes regardless of success/failure/thrown error.
7. `process.exitCode = 1` on any failed assertion or thrown error; `0` otherwise.

## 10. Ran the full verification gate

See `VERIFICATION.md` for exact commands and captured output. All green on the first run — no fix-forward iterations were needed; the syntax and asset-serving results matched expectations immediately, and the smoke harness passed all 9 assertions on its first execution.

## 11. Confirmed the hard wall held

`git diff --stat` shows only `README.md`, `css/style.css`, `js/audio.js`, `js/core.js`, `js/ui.js` modified, plus new files under `workstreams/pause/` and `docs/`. `index.html`, `js/daynight.js`, `js/world.js`, `js/rider.js`, `js/story.js`, `js/vfx.js` are untouched. No gameplay tuning numbers, biome thresholds, Flow multiplier, localStorage keys, script order, or import map were changed.

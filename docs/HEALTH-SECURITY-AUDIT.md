# Health & Security Audit — Session Runner 3D

- **Audited at:** 2026-08-02, commit `8e58fe0b` (branch `max-sprint-20260801`)
- **Auditor:** Claude Fable 5 (planning sprint, Outcome C)
- **Method:** full read of `index.html`, `css/style.css`, all 8 `js/*.js` modules (2,589 lines), `STATUS.json`, `ORCHESTRATION-LOG.md`. **No tests were executed during this audit** beyond environment checks (`node --version` → v22.22.3, Chrome present, Python 3.14.6). Where prior verification runs are cited, they are attributed to the phase-2 orchestrator records in `STATUS.json`/`ORCHESTRATION-LOG.md`, not re-run here.
- **Disposition:** report-only. No fixes are applied in this sprint (see plan non-goals).

## A. Confirmed defects

### F1 — No WebGL failure handling: blank page, cascade TypeError — **Medium**

- **Evidence:** `js/core.js:34` constructs `new THREE.WebGLRenderer(...)` with no try/catch; if context creation throws, core.js halts and `window.Game.core` is never set. `js/vfx.js:11-12` then does `const core = window.Game.core; const scene = core.getScene();` → uncaught TypeError. This exact cascade was observed in the phase-1 headless smoke (attempt 1, `--disable-gpu`) and recorded in `ORCHESTRATION-LOG.md` as a known issue.
- **Failure scenario:** user on a device/browser without WebGL (or with GPU blocklisted) loads the page → solid `#17102e` background, no message, no recovery.
- **Fix:** wrap renderer creation in try/catch; on failure, write a human-readable message into the existing `#overlay` elements and stop; make `vfx.js`/`daynight.js` no-op when `window.Game.core` is absent (both already use optional-call patterns elsewhere, e.g. `window.Game.vfx?.update`).

### F2 — Stuck-key steering when Shift changes key case — **Low**

- **Evidence (code inspection):** `js/core.js:53-59` keys the `st.keys` map on raw `e.key`. Holding `a`, pressing `Shift`, then releasing the letter fires `keyup` with `'A'`, so `keys['A']` clears but `keys['a']` remains `true`. `core.js:144-145` and `rider.js:198` read `keys.a || keys.A` → rider steers/spins left indefinitely until `a` is pressed and released again.
- **Fix:** normalize letters (`e.key.toLowerCase()`) in both handlers, or key the map on `e.code` (`KeyA`/`KeyD`).

### F3 — localStorage write on every shard and every trick — **Low**

- **Evidence:** `js/story.js` `saveStory()` (synchronous `JSON.stringify` + `setItem`) is called inside both the `trick:landed` handler (`story.js:241`) and the `shard:collected` handler (`story.js:258`). At high Flow a player collects shards several times per second; each pickup does a synchronous storage write on the frame path.
- **Impact:** minor main-thread churn on low-end mobile; no correctness bug.
- **Fix:** persist totals on `game:over` + `biome:change` only, plus a `visibilitychange`→`hidden` flush; worst-case loss is the in-progress run's counters.

### F4 — Wipeout screen can be skipped by buffered Space — **Low (design)**

- **Evidence:** `js/core.js:56` starts a game on Space whenever `state !== PLAYING`, with no cooldown after `wipeout()` sets `GAME_OVER`. A player mashing Space at the moment of collision restarts instantly and never sees the run-results/story epilogue that `story.js` just composed.
- **Fix:** ignore start inputs for ~500 ms after entering `GAME_OVER`.
- **Note:** the same call sites are the restart-vs-resume hazard for the planned pause feature (plan criterion 4).

## B. Security assessment

**No confirmed exploitable vulnerability was found.** Attack surface is intrinsically small: no backend, no forms, no cookies, no secrets, no third-party requests except the three.js CDN, and no user-controlled strings rendered anywhere. localStorage reads are defensively coerced (`+value || 0` in `core.js:15-16`; parsed, type-checked and clamped in `story.js:129-136`).

### Hardening recommendations (not confirmed vulnerabilities)

### H1 — Unpinned-integrity CDN script (supply chain) — **Medium priority**

- **Evidence:** `index.html:9` import map loads `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js` with no integrity metadata. A compromised or MITM'd CDN response executes arbitrary JS for every player. Version pinning alone does not protect content.
- **Fix options:** (a) vendor `three.module.js` into the repo (`vendor/three-0.160.0.module.js`) and point the import map at it — keeps the no-build static model and also fixes offline/CDN-outage failure; or (b) add the import-map `"integrity"` section (supported in current Chromium; other engines fall back to no-check, so (a) is stronger).

### H2 — No Content-Security-Policy — **Low**

- **Evidence:** no CSP meta tag in `index.html`; no `vercel.json` headers file exists in the repo.
- **Fix:** add a `vercel.json` with a CSP header roughly `default-src 'self'; script-src 'self' 'sha256-<inline-bootstrap-hash>' cdn.jsdelivr.net; style-src 'self'; img-src 'self' data:; connect-src 'none'` (adjust for the inline `GameEvents` bootstrap script and canvas textures). Low urgency given no injection sources today; cheap defense-in-depth.

### H3 — `innerHTML` sinks in ui.js — **Low**

- **Evidence:** `ui.js:75` (`titleEl.innerHTML`) and `ui.js:105` (`epilogueEl.innerHTML`). Current inputs are exclusively first-party constants from `story.js` (needed for `<br>`), so this is not exploitable now — but it is a standing sink if any future feature interpolates player-influenced data (e.g. a name field).
- **Fix:** document the invariant, or switch to `textContent` + explicit line-break elements.

### H4 — No `webglcontextlost` handling — **Low**

- **Evidence:** no `webglcontextlost`/`webglcontextrestored` listeners anywhere in `js/`. A GPU reset mid-run freezes rendering silently while game logic continues.
- **Fix:** listen on the canvas, pause the game (natural fit once the pause feature exists), and show a message.

## C. Test gaps

1. **No interactive gameplay tests.** Collision, scoring, Flow-combo, trick and expedition-rank logic in `core.js`/`rider.js` have zero automated coverage. Prior phases verified syntax, asset serving, and boot-only headless smoke (per `STATUS.json` `orchestrator_reverified`) — input paths were never exercised automatically; `STATUS.json` `known_issues` says the same.
2. **Day/night sim drift risk.** The only logic harness, `workstreams/daynight/sim.mjs`, mirrors `js/daynight.js` constants by copy; it silently loses validity when tuning changes (recorded in `STATUS.json`).
3. **No in-repo browser harness.** The phase-2 headless-Chrome smoke was ad hoc and is not reproducible from a checked-in script. The planned `workstreams/pause/smoke.mjs` (CDP over Node's global WebSocket, zero deps) establishes the first reusable pattern and directly exercises input/state transitions for the first time.
4. **No CI.** All gates are manual; nothing prevents deploying without running them.

## D. Health summary

| Area | State |
|---|---|
| Syntax/serving/tell-check gates | Green per phase-2 orchestrator record (`STATUS.json`) — not re-run in this audit |
| Runtime boot (headless, SwiftShader) | Green per phase-2 record; WebGL-absent path is F1 |
| Code hygiene | Consistent module pattern, event bus honored, pooled allocations on hot paths, defensive localStorage handling; minor nit: redundant `Math.min(2, …)` in `core.js:138` (Info) |
| Dependencies | 1 (three@0.160.0, CDN, no SRI → H1) |
| Observability | None (no error reporting/analytics) — acceptable for scope; note for ops |

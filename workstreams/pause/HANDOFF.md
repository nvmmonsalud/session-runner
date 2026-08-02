# HANDOFF — WS-PZ (Pause/Resume)

## What changed

| File | Change |
|---|---|
| `js/core.js` | Added `STATE.PAUSED = 3`; added `togglePause()`; guarded the `Space`/`touchstart`/`mousedown` restart branches so they resume (not restart) from `PAUSED`; added `p`/`P`/`Escape` → `togglePause()` on `keydown`; added a `visibilitychange` listener that auto-pauses on tab hide; gated `window.Game.ui.update(dt)` behind `state !== PAUSED` so story/announce timers freeze; exposed `togglePause` on `window.Game.core` |
| `js/ui.js` | Added a JS-created `#pauseBtn` inside `#hud` (same pattern as `#scorePopups`), with propagation-stopping touch/mouse handlers and `GameEvents`-driven show/hide (visible only while `PLAYING`) |
| `js/audio.js` | Added `game:pause`/`game:resume` listeners that null-safely call `actx.suspend()`/`actx.resume()` |
| `css/style.css` | Added `#pauseBtn` styling (circular HUD button, `pointer-events: auto`, mobile breakpoint) |
| `README.md` | Added one controls-table row: `P`/`Esc` → pause/resume |
| `docs/ARCHITECTURE-RUNBOOK.md` | Updated the four pause-related "planned" statements to reflect the shipped implementation |
| `workstreams/pause/smoke.mjs` | **New** — zero-dependency headless CDP verification harness |
| `workstreams/pause/{BUILD-LOG,VERIFICATION}.md` | **New** — this sprint's build/verification record |
| `docs/MAX-SPRINT-STATUS.json` | Updated `phase`/`implementation_started` and the pause feature block from planned to implemented |

## Behavior

- Press `P` or `Escape` while running → `STATE.PAUSED`, overlay shows a PAUSED title + resume CTA (reusing the existing overlay DOM/setters, no new overlay markup), HUD pause button hides, AudioContext suspends (music/wind/rhythm scheduler go silent).
- Press `P`/`Escape`/`Space`, or tap/click anywhere while `PAUSED` → resumes to `PLAYING` at the exact same `dist`/`score`/`speed`/timers, with `safeTimer` raised to at least `0.6` so resuming can't cause an instant unfair collision. AudioContext resumes.
- Switching tabs (or otherwise hiding the document) while `PLAYING` auto-pauses via `visibilitychange`.
- A small circular pause button appears in the HUD (top-right, below the speed bar) only while `PLAYING`; tapping/clicking it pauses without ever reaching the canvas touch-steer or restart listeners (it stops event propagation before those global listeners see the event).
- `window.Game.core.togglePause()` is the single public entry point used by both the HUD button and the smoke harness.

## Verification

Full commands and captured output: `workstreams/pause/VERIFICATION.md`. Summary:

- Syntax check: 8/8 JS modules OK.
- Asset serving: 10/10 → 200.
- Tell-check (`TODO|FIXME|XXX|placeholder|STUB_REPLACE_ME`): CLEAN.
- `node workstreams/daynight/sim.mjs`: exit 0 (regression check on the untouched day/night subsystem).
- `node workstreams/pause/smoke.mjs`: exit 0, all 9 assertions passed (start → PLAYING + dist advancing; pause → PAUSED + dist frozen across 500 ms; synthetic Space → resumes without resetting dist; dist advances again after resume; AudioContext not running while paused).

## Known limitations

- The smoke harness drives `togglePause()` and a synthetic `Space` `KeyboardEvent` directly rather than physically clicking the `#pauseBtn` DOM element or toggling `document.visibilityState` via CDP — the button-click path and the `visibilitychange` auto-pause path are verified by code review, not by an automated browser assertion. See `VERIFICATION.md`'s "Known limitations" section for the follow-up if stronger coverage is wanted.
- Pause keys (`P`/`Escape`) are hardcoded, not rebindable — explicit non-goal per the plan.
- No settings menu, no audio-volume control while paused — explicit non-goal per the plan.

## Rollback

Feature landed as commits on `max-sprint-20260801` on top of base `8e58fe0b377bba8d379f88aa4c14a9d73d93bf04`. To roll back:

```bash
git log --oneline max-sprint-20260801   # find the pause-feature commit SHA
git revert <feature-sha>                # or: git reset --hard 8e58fe0b377bba8d379f88aa4c14a9d73d93bf04 (before any push)
```

The change is additive and touches no persistence schema (`sessionRunner3dHi`, `sessionRunner3dRuns`, `sessionRunnerStory` keys are all untouched), so reverting restores exact pre-sprint behavior with no risk of corrupting player saves. Deploy rollback: Vercel dashboard → redeploy the previous deployment, or `git revert` + push (static site, no migration surface).

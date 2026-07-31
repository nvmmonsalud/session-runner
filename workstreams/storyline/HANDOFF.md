# WS-1 STORYLINE — Handoff

## What was built

Session Runner 3D now has a real narrative spine wrapped around the existing
gameplay loop, entirely additive and non-blocking:

1. **Protagonist established.** "Rin, the last powder runner" is named in the
   main-menu prologue and referenced throughout act cards and flavor lines.
2. **Prologue story card** on the main menu — the existing `#sub` copy on the
   `#overlay` was rewritten into a tight 3-sentence setup: the mountain is
   fading, starlight shards hold its memory, Rin rides to keep the light
   alive.
3. **3-act structure** mapped 1:1 to the three biomes (Twilight Pines →
   Aurora Glacier → Whiteout Storm). On `biome:change` a new non-blocking
   "story card" banner slides in on the left edge of the screen (`#storycard`),
   showing `ACT I · TWILIGHT PINES` + one narrative line, auto-dismissing
   after 4s. It never touches `st.state`, never calls `preventDefault`, and
   sits under `#hud` which is `pointer-events: none`, so it can never block
   input or pause the loop.
4. **In-run flavor lines.** Rin's thoughts / mountain lore fire off four
   trigger types: first trick landed, a shard streak (combo ≥ 3 from shards),
   a high-flow moment (combo hits the 5x cap), and survival-time milestones
   (28s / 62s / 105s into a run). All flavor lines are funneled through a
   shared "pending flavor" queue gated by a 12-second minimum gap (measured
   on a continuous game clock), so bursts of events can never spam the
   banner — at most one flavor line surfaces per ~12s, and only while
   playing.
5. **Named tricks.** `trick:landed` turns are mapped to
   `1 → METHOD 360`, `2 → CORKSCREW 720`, `3+ → GALAXY 1080+`, each paired
   with a short flavor tail (e.g. "the shard-light spins with her."). This is
   shown through the new `#storycard` banner (`NAMED TRICK` eyebrow) and
   never writes into `#trick`, which stays fully owned by `rider.js`/`core.js`.
6. **Finale epilogue + story progress.** Reaching Whiteout Storm (act III)
   for the first time flips a persisted `epilogueSeen` flag. The next
   game-over screen after that (the run in which it flips) shows a special
   "THE WHITEOUT REMEMBERS HER NAME" line instead of the generic act-progress
   line. Beating the player's best score also gets its own epilogue line.
7. **Game-over stats.** A new `#epilogue` element (inside the existing
   `#overlay`, right under `#runStats`) shows two lines built purely from
   locally-counted event data + persisted story state:
   `RUN: SCORE … · BEST … · N TRICKS · N SHARDS` and
   `STORY: ACT II REACHED — ACT III/III unlocks in the whiteout.` (or the
   finale/new-best variants above). Tricks and shards are counted by
   subscribing to `trick:landed` / `shard:collected` and resetting the
   counters on `game:start` — no reliance on internal core.js counters.
8. **New localStorage key** — `sessionRunnerStory` — JSON:
   `{ maxAct, epilogueSeen, totalTricks, totalShards }`. Loaded with a
   try/catch + clamped defaults, saved with try/catch after every mutation.
   The two pre-existing keys (`sessionRunner3dHi`, `sessionRunner3dRuns`)
   are never read or written by this file.
9. All copy lives in `js/story.js` — no external text files, no new CDN
   dependencies.

## Files touched

- `js/story.js` — rewritten/extended. Kept every original export signature
  (`roman`, `intro`, `zoneLabel`, `zoneAnnounce`, `metaText`, `wipeoutText`)
  identical so `world.js` and `core.js` (which I did not touch) keep working
  unmodified. Added: `ACTS`, `trickName`, in-run flavor pools, the
  story-card display queue (`tick`, `enqueue`, `pump`), the flavor
  rate-limiter, persisted `storyData` (+`saveStory`), and `GameEvents`
  listeners for `game:start`, `biome:change`, `trick:landed`,
  `shard:collected`, `game:over`.
- `js/ui.js` — added element refs for the new DOM (`#storycard`,
  `#storycard-eyebrow`, `#storycard-line`, `#epilogue`) and three new tiny
  setter functions: `showStoryCard(eyebrow, line, cls)`, `hideStoryCard()`,
  `setEpilogue(html)`. Also added one line to the existing `update(dt)` so
  it calls `window.Game.story.tick(dt)` every frame (core.js already calls
  `window.Game.ui.update(dt)` unconditionally each frame, in both MENU and
  PLAYING and GAME_OVER states — this is how the story queue/timers tick
  without touching core.js). All previously-exported functions are
  untouched and still exported.
- `css/style.css` — appended a block at the end for `#storycard` (and its
  `.trick` / `.flavor` state classes) and `#epilogue`, plus a mobile media
  query tweak. Nothing existing was edited or removed.
- `index.html` — two new DOM insertions inside `#hud`:
  `<div id="storycard">…</div>` (sibling of `#announce`, before `#overlay`)
  and `<div id="epilogue"></div>` (inside `#overlay`, after `#runStats`).
  No script tags, load order, or existing elements were changed.

## Story structure summary

- **Act I — Twilight Pines**: Rin drops into her father's old lines.
- **Act II — Aurora Glacier**: the mountain "answers back" through the
  shards.
- **Act III — Whiteout Storm**: the summit and the mountain's fading memory
  are at stake.
- Each act's transition card fires on every `biome:change` event (including
  the forced Act I card at the start of every run — intentional, it
  reinforces "Act I" as the run opener each time).
- Story progress (`maxAct`, `epilogueSeen`) is persisted across runs/reloads
  and is independent of the per-run act reached, mirroring how
  `expedition`/`hiScore` already persist.

## New localStorage key schema

```
sessionRunnerStory = {
  maxAct: 1 | 2 | 3,       // highest act ever reached, across all runs
  epilogueSeen: boolean,   // true once maxAct has ever reached 3
  totalTricks: number,     // lifetime named tricks landed
  totalShards: number      // lifetime shards collected
}
```

## Events consumed (read-only, via window.GameEvents.on)

- `game:start` — resets per-run counters/flags, clears the epilogue text.
- `biome:change {index, biome}` — shows the act-transition card, bumps
  `maxAct`/`epilogueSeen` if a new high-water mark is reached.
- `trick:landed {turns, points}` — shows the named-trick card, counts this
  run's tricks, bumps `totalTricks`, may queue "first trick" / "high combo"
  flavor.
- `shard:collected {combo}` — counts this run's shards, bumps
  `totalShards`, may queue "shard streak" / "high combo" flavor.
- `game:over {score, best, newBest, expedition, expeditionUp, completedRuns}`
  — builds and writes the two-line `#epilogue` block.

Also reads `window.Game.state.combo` (read-only) inside the `trick:landed`
handler to check the live combo value at landing time, since that event's
payload doesn't include combo.

## What works

- Prologue reads well on first load, doesn't touch any existing overlay
  logic (`setOverlayText` signature unchanged).
- Act cards fire on every biome change without stalling `update()` or the
  render loop.
- Named-trick banners and flavor lines queue and dismiss cleanly; flavor is
  provably rate-limited (`FLAVOR_MIN_GAP = 12`).
- Game-over screen shows accurate this-run trick/shard counts and a
  progress line that upgrades correctly on first act-III reach and on new
  best.
- Story progress survives page reloads via `sessionRunnerStory`.

## Known issues / follow-ups

- The act-transition card currently re-shows "ACT I" every time a run
  starts (since `world.applyBiome(0, true)` always emits `biome:change`).
  This is treated as intentional (it frames every run as "Act I begins"),
  but if a future pass wants a one-time-only prologue-card-then-silence
  behavior on repeat runs, that would need a small tweak in this file only.
- `#storycard` and `#epilogue` were styled to match the existing HUD
  language (translucent panel, subtle 1px border, no side-tab accent) after
  the design-quality hook flagged an earlier thick colored left-border as an
  AI-tell; text color alone now differentiates act/trick/flavor banners.
- Two pre-existing design-hook findings in `css/style.css`
  (`overused-font` on the `Inter` font-family at line 2, `layout-transition`
  on `#speedbar` at line 13) were left untouched — both predate this
  workstream and belong to HUD chrome outside `js/story.js`'s scope; fixing
  them risks conflicting with the parallel VFX workstream's HUD styling.

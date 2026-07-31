# Session Runner 3D — Powder Expedition 🏂

A full-on single-page **Three.js powder-surf runner** with a storyline, three shifting worlds, trick mechanics, and procedural audio. Built by Hermes Agent orchestrating Claude Code (Fable 5 → Sonnet 5 sub-agents).

**Live:** https://session-runner.vercel.app

## The Story

> *The mountain is going dark. Rin is the last rider left who still knows its lines, and every starlight shard she threads holds a sliver of what the peak used to be. She drops in anyway — carving through changing worlds, chasing whatever light is left to save.*

Play through a 3-act arc mapped to the worlds. Story progress (acts, epilogue, total tricks/shards) persists locally alongside your run stats.

## Play

| Input | Action |
|---|---|
| `←` / `→` or `A` / `D` | Carve on snow; spin while airborne |
| `↑` or `W` | Jump / start a trick |
| `Space` | Start / restart after a wipeout |
| Touch drag | Steer on mobile |

## Systems

- **Storyline:** prologue, 3 acts (Twilight Pines → Aurora Glacier → Whiteout Storm), zone story cards, named tricks, finale epilogue, run-results screen with story progress.
- **Rider:** stylized powder surfer with helmet, glowing goggles, springy scarf physics, board glow trail, carve lean.
- **Shards & Flow:** collect starlight shards for a timed `FLOW ×N` multiplier (up to ×5).
- **Tricks:** jump (`W`/`↑`), spin in air for Method 360 / Corkscrew 720 / Double 720; landing grants style points + Flow + hit-stop.
- **Launch pads:** glowing striped pads throw you higher for longer trick windows; airborne riders clear rocks.
- **Expedition ranks:** completed runs persist; every 3 wipeouts raises baseline speed and route pressure.
- **Graphics/VFX:** gradient sky dome, stars, sun glow, aurora ribbons, speed streaks, FOV kick, vignette, terrain vertex coloring, per-biome snow, carve tracks.
- **Audio & juice:** procedural music bed (intensity scales with speed/biome), wind whoosh, trick thuds, biome stingers, UI blips, synth callouts, landing squash.

## Architecture

Modular vanilla ES modules (no build step):

```
index.html            shell + HUD + overlay + import map (three@0.160.0)
css/style.css         UI styling
js/core.js            state machine, loop, input, physics, scoring, spawns
js/world.js           terrain, biomes, obstacles, launch pads, shards
js/rider.js           rider rig, carve, jump/spin tricks, landing
js/vfx.js             sky dome, aurora, particles, FOV kick, shake
js/audio.js           procedural WebAudio: music, wind, SFX
js/ui.js              HUD, overlays, menus, run stats
js/story.js           narrative: prologue, acts, dialogue, epilogue
```

Modules communicate via `window.GameEvents` (pub/sub) and expose `window.Game`. Zero dependencies beyond the pinned Three.js CDN import map; procedural assets only; static-deployable anywhere.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

Static site. Import the repo into Vercel with framework preset **Other**, no build command, or `vercel --prod`.

---

Orchestration audit trail: `ORCHESTRATION-LOG.md`, `STATUS.json`, and `workstreams/` (HANDOFF/BUILD-LOG/VERIFICATION per workstream).

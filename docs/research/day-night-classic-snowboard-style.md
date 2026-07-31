# Research — Day/Night Cycle + Classic Snowboarding-Game Graphics
Phase 2, Session Runner 3D. Compiled 2026-07-31 by Fable 5 orchestrator. Informs WS-DN (Opus 5) and WS-CG (Sonnet 5).

## A. Day/Night cycle for Three.js / WebGL runners

### Sun position + directional light
- Standard pattern: normalized time-of-day `time01 ∈ [0,1)`; `theta = time01 * 2π`;
  sun arc `x = cos(theta)`, `y = sin(theta)`, scaled to scene radius. Clamp
  `Math.max(0.1, y)` so the disc never dips fully under the horizon while still
  reading as sunset. ([threejsdemos.com day-cycle](https://threejsdemos.com/demos/lighting/day-cycle))
- Light intensity curve from the same demo: `sun.intensity = y > 0 ? 2*y : 0.2`
  (linear with height above horizon, floor of 0.2 as "moonlight"). Ambient:
  `0.1 + 0.4 * max(0, y)` — range 0.1 night → 0.5 noon. We must keep a HIGHER
  floor than that (gameplay readability rule: ambient never below ~55–60% of the
  day value; enforce minimum hemisphere intensity ≈ 0.8 given our base 1.25).
- Color temperature keyframes ([threex.daynight](https://github.com/jeromeetienne/threex.daynight),
  [three.js forum sky system](https://discourse.threejs.org/t/complete-sky-system-for-three-js-skybox-sun-moon-day-night-cycle-clouds-stars-lensflares/88311)):
  dawn/dusk = reddish-orange (~0xff9a5a), midday = near-white warm (~0xffe0a0),
  night = cool blue (~0xaaccff). Lerp `THREE.Color` between keyframes — cosine or
  smoothstep blend between adjacent keyframes avoids visible banding.

### Sky, stars, fog
- Sky: lerp top + horizon colors between per-phase gradient pairs, reusing the
  existing vertex-colored dome (`applyDomeColors`) — recompute vertex colors only
  when the blended pair changes beyond an epsilon, or throttle to every N frames;
  the dome loop is 500–600 verts, cheap, but do NOT allocate new Colors per frame
  (reuse module-level scratch `THREE.Color`s — codebase already does this).
- Stars: drive `starMat.opacity` target from time-of-day (0 by day, up to ~0.85
  deep night) multiplied by the existing per-biome star target so biome character
  survives. Fog: lerp `scene.fog.color` between day/night variants of the biome
  fog color (night ≈ biome fog × 0.45 lerped toward sky top color).
- Performance rules observed across sources: no per-frame allocations, mutate
  existing material/light colors in place with `.lerpColors()` / `.lerp()`;
  no shader rewrites needed — everything above is uniform/material mutation.

### Cycle pacing
- Demo default `timeOfDay += 0.0015` per frame ≈ 11 s full cycle — far too fast
  for gameplay. For a runner, tie `time01` to run progression (distance/score) so
  one long run traverses dawn → day → dusk → night; typical good run here is
  2–4 min, so map full cycle to ≈ score 0→450+ with biome-paired anchor windows.

**Recommendation (adopted):** hybrid progression-paired cycle. Each biome owns an
anchor time-of-day window (Twilight Pines = dawn→morning, Aurora Glacier = night
(aurora needs darkness), Whiteout Storm = burning dusk/storm-light). `time01`
advances continuously with distance inside the run AND eases toward the active
biome's anchor window on `biome:change` — so the sky visibly evolves during play
and each zone keeps a signature look. Aurora ribbons gate on darkness
(night factor > ~0.5) instead of biome index alone.

## B. Classic arcade snowboarding style (SSX Tricky / 1080° / Amped)

### Palette + track readability
- Pre-SSX snowboarding games were "realistic whites and greys"; SSX Tricky's
  break was saturated, high-contrast course theming — "each track a striking
  theme and direction of colour", "bright lighting effects … lots of snow spray"
  ([Nintendo Life SSX Tricky review](https://www.nintendolife.com/reviews/2011/06/ssx_tricky_retro),
  [Wikipedia SSX Tricky](https://en.wikipedia.org/wiki/SSX_Tricky)).
- Translation for us: raise terrain/snow saturation + brightness per biome,
  push accent colors harder (shards/pads/stripes), keep the carve lane visibly
  lighter than the borders so the track reads at speed. Bold silhouettes: darken
  obstacle rims so rocks/spires pop against snow.

### Outline / cel look without postprocessing
- Inverted-hull / backface-scaled shell: render mesh twice, second copy scaled
  up slightly with a flat dark `MeshBasicMaterial` and `side: THREE.BackSide` —
  the visible back faces form the outline ([Observable toon outline example](https://observablehq.com/@vicapow/three-js-example-of-a-toon-material-with-outline/2),
  [Josh Marinacci, Cartoon Outline Effect](https://medium.com/@joshmarinacci/cartoon-outline-effect-6c4e95545537),
  [maya-ndljk toon shader tutorial](https://www.maya-ndljk.com/blog/threejs-basic-toon-shader)).
- Caveat: uniform scaling only outlines correctly on convex shapes — fine here:
  our obstacles are dodecahedron rocks and cone spires/trees (convex primitives).
  Shell scale ~1.04–1.07; share ONE dark outline material across all shells.
  For hard-normal meshes the proper fix is inflating along normals in a shader —
  unnecessary for these primitives.
- Rim/edge glow alternative for emissive props: existing additive glow-sprite
  system (vfx.js `attachGlow`) already fakes rim bloom — extend rather than add
  postprocessing (no EffectComposer, keeps zero-dependency rule).
- Optional cheap cel shading: `MeshToonMaterial` with a 3–4 step `gradientMap`
  (tiny DataTexture, NearestFilter) is core Three.js, no extra deps — allowed
  but secondary to palette + outlines.

### Speed feel + spray
- SSX-era speed feel = big spray bursts on carves/landings, motion streaks,
  camera aggressiveness. We already have FOV kick (61→70), speed streaks, spray
  particles — WS-CG amps counts/sizes/opacity + adds score-popup/banner punch in
  HUD, WITHOUT touching physics numbers.

## Workstream mapping
- WS-DN (Opus 5): §A entirely — sun arc, light/sky/fog/star lerps, phase
  keyframes, progression-paired anchors, aurora darkness gate, readability floor,
  `window.Game.dayNight` API + one-line core hook.
- WS-CG (Sonnet 5): §B entirely — saturated biome palettes, backface-shell
  outlines on rocks/spires/trees, punchier spray/streaks, HUD arcade polish.
  Must consume WS-DN night factor (if present) to keep night readable.

Sources: linked inline above.

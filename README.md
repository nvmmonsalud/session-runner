# Session Runner 3D — Powder Expedition 🏂

A polished single-file **Three.js powder-surf runner**. Ride an endless mountain route, carve around hazards, collect starlight shards to keep your score multiplier alive, and survive worlds that change as your run deepens.

**Live:** https://session-runner.vercel.app

## Play

| Input | Action |
|---|---|
| `←` / `→` or `A` / `D` | Carve left / right |
| `Space` | Start / restart after a wipeout |
| Touch drag | Steer on mobile |

## Expedition systems

- **A real rider:** a stylized back-facing powder surfer with helmet, cyan goggles, puffer jacket, backpack, articulated limbs, animated scarf, boots, and a striped board.
- **Route shifts per run:** cross the score thresholds to ride through **Twilight Pines**, **Aurora Glacier**, then **Whiteout Storm**. Lighting, fog, snow, terrain, trees, sun, hazards, and accent colors shift with each biome.
- **Shard flow:** collect rotating starlight shards to extend a timed `FLOW ×N` multiplier (up to ×5), earn score boosts, particles, and a chime.
- **Persistent expedition ranks:** completed runs are saved locally. Every three wipeouts unlocks the next Expedition rank, increasing the starting speed and obstacle pressure for subsequent runs.
- **Evolving hazards:** rim-lit boulders start the route; advanced biomes introduce ice spires.
- **Responsive ride feel:** terrain-following board, carve lean, camera follow, sway, snow spray, ambient snowfall, procedural audio, and wipeout screen shake.

## Technical notes

- One `index.html`; no build step or framework
- Three.js uses a pinned CDN import map (`three@0.160.0`)
- Local `localStorage` saves personal best and expedition completion count
- Delta-time-capped render loop prevents tab-switch physics jumps

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

It is a static site. Import the repository to Vercel using framework preset **Other** and no build command, or deploy directly with `vercel --prod`.

---

Built with GPT-5.6 Terra via Hermes Agent. 🤙

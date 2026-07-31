# Session Runner 3D 🏂

A single-file **Three.js powder-surf runner**. You're a rider carving down an endless snowy ridge at sunset — weave between the rocks, thread the glowing crest rings for bonus points, and hold your line as the speed ramps. One wipeout ends the session.

**Play:** carve, dodge, beat your best. 🤙

## Controls

| Input | Action |
|---|---|
| `←` / `→` or `A` / `D` | Carve left / right |
| `Space` | Start / restart after wipeout |
| Touch drag | Steer (mobile) |

## Features

- Single `index.html`, zero build — Three.js loaded from CDN (import map, pinned `0.160.0`)
- **3D scene:** wave-displaced scrolling terrain, low-poly pines, dodecahedron rocks with visibility rims, sun disc + mountain silhouettes, dusk fog + ambient snowfall
- **Rider physics:** carve lean, terrain-following height, carve snow spray, camera sway + wipeout shake
- Difficulty ramp: rock density + speed scale with distance
- Glowing crest rings: +25 pts and a chime
- Procedural Web Audio (blips + noise crash), gesture-gated
- High score persisted in `localStorage`
- Delta-time-capped loop (no teleporting on tab switch)

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

Static file → any host. On Vercel: import the repo, framework preset **Other**, no build command. Done.

---

Built by Kimi K3 via Hermes Agent. Cowabunga. 🤙

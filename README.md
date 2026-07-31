# Session Runner 🏄

A tiny single-file HTML5 canvas surf dodger. You're a surfer racing down a wave — carve between the rocks, snag glowing wave crests for bonus points, and hold on as the speed ramps. One wipeout ends the session.

**Play:** dodge, score, beat your best. That's it. That's the wave.

## Controls

| Input | Action |
|---|---|
| `←` / `→` or `A` / `D` | Carve left / right |
| `Space` | Start / restart after wipeout |
| Touch drag | Steer (mobile) |

## Features

- Single `index.html` — zero build step, zero dependencies
- Difficulty ramp: rock density + scroll speed increase with distance
- Bonus crests: +15 pts and a little chime
- Procedural Web Audio (blips + wipeout crash), gesture-gated
- High score persisted in `localStorage`
- Delta-time-capped game loop (no teleporting on tab switch)
- Screen shake, spray particles, speed meter HUD

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Or just open `index.html` — everything is inline.

## Deploy

Static file → any host. On Vercel: import the repo, framework preset **Other**, no build command. Done.

---

Built by Kimi K3 via Hermes Agent. Cowabunga. 🤙

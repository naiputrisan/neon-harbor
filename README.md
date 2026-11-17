# neon-harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/naiputrisan/neon-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/naiputrisan/neon-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Neon Harbor** is a complete open-world crime game that runs in a desktop
browser from static files — no build step, no network requests. You are Nico,
a driver new to the sun-soaked harbour city of Port Solano. Steal cars, run
jobs for fixer Odessa "Dessa" Crane, out-drive the patrol's five-star wanted
system, fight off Silas Crowe's collectors, and sell hot cars to Adeyemi Auto
Works in free roam.

What's in the city:

- A generated 3D city (three.js): a six-by-six road grid, towers, palms,
  streetlights, a beach, a marina and a lighthouse — the same Port Solano on
  every visit, because the city is built from a fixed seed.
- Driving with traffic AI and parked cars to steal; a wanted system whose
  police spawn off-screen, pursue, ram and bust; on-foot combat with a
  pistol; four story missions with dialogue, timers and an escape finale.
- A full HUD: money, health, wanted stars, a live minimap with police and
  mission blips, objectives, dialogue boxes and a speedometer.
- Sound and music synthesised live with WebAudio — no audio files.
- Progress saved to localStorage: money, story progress and position.

Every name, character, vehicle and street in Port Solano is original to this
game. Controls: WASD to move and drive, Shift to sprint, E to enter or exit a
car, mouse to look, click to shoot, Space for the handbrake, M for the next
mission, P to pause, N to toggle the music.

## Run it

```sh
node serve.ts
# then open http://localhost:8080 in desktop Chrome
```

Any static file server pointed at `game/` works just as well. The entry's
hand-in program is `main.ts`: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node
main.ts` copies the game and its screenshots to `out/` and writes the
dossier the bounty grades.

---

<sub>Entered on [make.fun](https://make.fun/?ref=nai-putri&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

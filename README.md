# Nagori

A Japanese-fantasy action RPG and rural life sim: real-time combat, a farm to
keep, and a valley that remembers what was done in it. Original setting,
original characters, original systems.

It is a **fully rendered 3D game** running in the browser on
[Babylon.js](https://www.babylonjs.com/) with TypeScript — WebGPU where the
browser supports it, WebGL2 everywhere else. Nothing about the world is
simulated with DOM elements; HTML is used only for interface chrome.

## Running it

```bash
npm install
npm run dev          # http://localhost:8080
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check, then produce a production bundle in `dist/` |
| `npm run preview` | Serve the production bundle |
| `npm run typecheck` | TypeScript only, no emit |
| `npm test` | Type-check plus the headless design-sandbox suite |
| `npm run test:browser` | Build, then drive the real build in headless Chromium |

### URL switches

| Query | Effect |
| --- | --- |
| `?gfx=webgl` / `?gfx=webgpu` | Force a renderer backend instead of auto-detecting |
| `?quality=low\|medium\|high\|ultra` | Start on a given graphics preset |
| `?adaptive=0` | Pin the resolution (benchmarking, screenshots) |
| `?capture=1` | Keep the drawing buffer between frames, and expose `window.nagori` |
| `?scene=train\|valley\|proving` | Start in a given region instead of the city |

### Controls

Click the canvas to capture the mouse and start the sound.

`WASD` move · `Shift` run · `Alt` walk · `Space` jump · mouse look · wheel
zoom · `E` interact · `V` swap shoulder · `P`/`Esc` pause · `M` mute ·
`` ` `` debug overlay · `F4` cycle graphics preset

## Layout

```
src/core/      engine bootstrap, clock, settings, events, state, post-processing
src/engine/    scene lifecycle, asset loading, boot screen
src/input/     hardware input mapped to game actions
src/player/    character rig, movement, third-person camera
src/world/     terrain, sky, lighting, weather, crowds, traffic, prefabs, materials
src/audio/     Web Audio buses, ambience, footsteps, score
src/ui/        HUD, prompts, captions, pause, debug overlay
src/scenes/    regions — the Tokyo street and the Phase 1 proving ground
tools/         headless browser smoke test
sandbox/       earlier prototype, kept for its systems tests (not built)
docs/          design bible and notes
```

`docs/nagori-design-bible.html` is the design document the build follows.

## Status

Playable from the city to the valley: a wet Tokyo backstreet at night, the
last train south, and the countryside it puts her down in.

- `docs/JOURNEY.md` — the train interlude and Hazama valley.
- `docs/TOKYO-SLICE.md` — the character, the camera, and the street.
- `docs/PHASE-1.md` — the engine foundation underneath it all.

Next: the farm at the end of the track east.

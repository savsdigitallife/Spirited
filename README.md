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

### Controls

`WASD` move · `Shift` sprint · `Alt` walk · mouse drag orbit · wheel zoom ·
`V` swap camera rig · `` ` `` debug overlay · `F4` cycle graphics preset

## Layout

```
src/core/      engine bootstrap, clock, settings, events, post-processing
src/engine/    scene lifecycle, asset loading, boot screen
src/input/     hardware input mapped to game actions
src/world/     terrain, sky, lighting, atmosphere, procedural materials
src/ui/        debug overlay
src/scenes/    regions — currently the Phase 1 proving ground
tools/         headless browser smoke test
sandbox/       earlier prototype, kept for its systems tests (not built)
docs/          design bible and notes
```

`docs/nagori-design-bible.html` is the design document the build follows.

## Status

Phase 1 (engine foundation) is in. See `docs/PHASE-1.md` for what it covers,
what was proven in a browser, and what is deliberately still missing.

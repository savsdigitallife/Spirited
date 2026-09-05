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
| `node tools/shot.mjs <name> [scene] [settle] [script]` | One frame from the running build, for looking at a change |

### On Replit

Import the repository and press **Run**. `.replit` builds the game and serves
it on 8080, which Replit maps to the public URL, and the webview shows it.

Two things are worth knowing:

- **Open it in a new tab** (the arrow at the top of the webview). The game
  asks for the pointer so the mouse can turn the camera, and a browser only
  grants that to an embedded frame carrying `allow="pointer-lock"`, which the
  webview does not. In the frame you can still play — dragging turns the
  camera instead — but in a tab the mouse behaves as it should.
- `npm run dev` in the shell gives the dev server with hot reload instead.
  Run builds first because a built bundle is a handful of files rather than
  the several hundred modules Vite serves unbundled, which over a proxied
  connection is most of a minute of loading.

The game is static files and a GPU in the player's browser — nothing runs on
the server — so a Replit deployment is configured as a static one.

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

Where the browser will not give up the pointer — an embedded frame without
`allow="pointer-lock"`, which is most of them — **drag** to turn the camera
instead. Everything else is the same.

## Layout

```
src/core/      engine bootstrap, clock, settings, events, state, post-processing
src/engine/    scene lifecycle, asset loading, boot screen
src/input/     hardware input mapped to game actions
src/player/    character rig, hair simulation, animation, movement, camera
src/world/     terrain, sky, lighting, weather, facades, interiors, crowds,
               traffic, prefabs, materials
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

- `docs/TOKYO-DISTRICT.md` — the asset pipeline, the crowd, the rooms you
  can walk into, the alley, and rain that lands.
- `docs/TOKYO-REBUILD.md` — Aiko, the third-person presentation, and the
  street rebuilt as a real environment.
- `docs/JOURNEY.md` — the train interlude and Hazama valley.
- `docs/TOKYO-SLICE.md` — the first pass at the character and the street.
- `docs/PHASE-1.md` — the engine foundation underneath it all.

Next: modelled assets to drop in behind the ids that already address them,
the residential street and the park, and rooms behind the frontages that are
still only views.

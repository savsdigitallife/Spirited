# Phase 1 — Engine Foundation

Everything below is in the repository and was verified in a real browser
before this document was written. Nothing here is aspirational.

## What the phase covers

| Requirement | Where it lives | State |
| --- | --- | --- |
| Babylon.js + TypeScript project | `package.json`, `tsconfig.json`, `vite.config.ts` | done |
| WebGPU initialisation with WebGL2 fallback | `src/core/EngineFactory.ts` | done |
| Rendering pipeline (tone mapping, bloom, DoF, AO, AA, grain) | `src/core/RenderPipeline.ts` | done |
| Cameras | `src/scenes/ProvingGround.ts` (orbit rig + free-fly) | done |
| Lighting, sun/moon cycle, cascaded shadows | `src/world/Lighting.ts`, `src/world/Sky.ts` | done |
| Input system (keyboard, mouse, gamepad → actions) | `src/input/InputManager.ts` | done |
| Asset loader (glTF/GLB, containers, progress, cache) | `src/engine/AssetLoader.ts` | done |
| Scene management (regions, async load, swap, dispose) | `src/engine/SceneManager.ts` | done |
| Graphics presets Low / Medium / High / Ultra | `src/core/Settings.ts` | done |
| Adaptive resolution toward a 60 fps target | `src/core/Game.ts` | done |
| Debug overlay (fps, draws, backend, camera, clock) | `src/ui/DebugOverlay.ts` | done |

## Architecture, and why

**Deep imports, one side-effect file.** Babylon is imported through module
paths (`@babylonjs/core/Engines/engine`) rather than the package barrel. The
barrel defeats tree-shaking and pulls in the entire engine. The cost is that
self-registering features vanish, so every side-effect import lives in
`src/core/babylonSideEffects.ts` with a note on what it enables — one place to
look when a feature is mysteriously absent.

**The backend difference stops at `EngineFactory`.** It returns an engine plus
a capability report. WebGPU support is probed through `navigator.gpu` directly
so the WebGPU backend module — about 127 kB of the bundle — is downloaded only
by browsers that will actually use it. The glTF loader is likewise imported on
first model load, not at boot.

**A `Scene` is a streamable region.** `SceneManager` owns creation, the swap
and disposal; the new region is built before the old one is torn down, so a
failed load leaves the player somewhere rather than nowhere. Only one region is
active today, but the interface is already async and progress-reporting so
background pre-loading of a neighbouring region does not change any caller.

**Systems publish, they do not call each other.** `src/core/Events.ts` is a
typed bus. Adding or deleting a system in a later phase does not require
touching the ones already working.

**Simulation time is separate from render time.** `Time` clamps the frame
delta, keeps a fixed-step accumulator for anything that must be deterministic
(physics, crop growth, NPC schedules), and runs the in-world calendar. Building
that in now means no later system has to be retrofitted for frame-rate
independence.

**A preset is data.** `QualitySettings` is a plain record; systems read the
fields they care about and re-apply on `settings/changed`. Presets genuinely
change shadow map size and cascade count, post-processing, resolution scale,
foliage density, texture resolution and draw distance — they are not cosmetic.

## The proving ground

`src/scenes/ProvingGround.ts` is a test region, not a level. It has a
420 m heightfield with a raised rim so the horizon never shows a drop-off,
procedurally generated albedo/normal/roughness PBR surfaces, a farmstead shell,
a fence that follows the ground, tilled beds, and roughly ten thousand instanced
tufts, boulders and trees drawn in four draw calls. Its props are primitives on
purpose: they exercise the same material, shadow, instancing and quality paths
that authored glTF assets will use, so replacing a box with a model is a content
change, not an engine change.

The sphere on the ground is a rig marker, not a character. It exists so input,
the camera and terrain height sampling can be seen working together. Phase 2
replaces it.

## Verification

`npm run test:browser` builds the production bundle and drives it in headless
Chromium (SwiftShader, so the WebGL2 fallback is what gets exercised). It
asserts: the boot overlay clears, a backend is reported, no uncaught errors
occur at boot or during play, draw calls are issued, more than ten thousand
triangles are rendered, frames advance, input changes the frame, presets switch
live, and — the regression guard — every preset still renders a *detailed*
frame after being switched to at runtime.

Screenshots are read back from inside the page at the end of a completed frame
rather than through a compositor screenshot; under a software rasterizer a
screenshot regularly catches a half-drawn buffer.

Frame rate under SwiftShader is 1–4 fps at 1.2 M triangles. That is the software
rasterizer, not the renderer: it is a correctness harness, and no performance
claim is made from it. Performance on real hardware is unmeasured and will be
profiled when there is hardware to profile on.

## Three bugs worth recording

**Shadow filter mode cannot change on a live generator.** Turning
percentage-closer filtering off after materials had compiled with it on left
every lit surface sampling shadows wrongly: the entire frame went flat and
washed out, while frame rate, draw calls, triangle counts, mesh visibility and
material readiness all still reported healthy. Disposing and rebuilding the
generator did not help, and neither did marking every material dirty. PCF is now
on at every preset and only the tap count varies. The smoke test checks frame
contrast, not brightness, because the broken frame was *brighter* than the
correct one.

**Adaptive resolution was resizing the backbuffer every frame.** With a hard
frame budget miss it stepped the scale on every tick, resizing the canvas
continuously and rendering visible garbage. It now adjusts at most every 0.8 s
and only on a sustained miss.

**The sky box was being clipped by the camera's far plane.** A cube's corners
sit √3⁄2 of its side from its centre, so a sky box sized to the draw distance
falls outside it. `Sky.fitScale` derives the largest side that clears the far
plane, and the sky is rescaled whenever the preset changes the draw distance.

## Deliberately not in this phase

No character controller, no animation, no physics or navmesh, no water, no
weather or volumetrics, no audio, no save/load, no streaming of more than one
region, no authored art. Contact-hardening shadows are off until the filter can
be chosen once at region load. These belong to Phases 2–10 and are not stubbed
here.

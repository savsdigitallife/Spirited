# Vertical slice, part one — Tokyo

The first part of the slice the game opens on: a wet Tokyo backstreet a
little before midnight, walked in third person, with the station at the end
of it. Everything below is in the repository and was verified in a browser.

Run it with `npm run dev` and open <http://localhost:8080>.

## What is playable

Click the canvas to capture the mouse. `WASD` walks, `Shift` runs, `Alt`
walks slowly, `Space` jumps, the mouse orbits, the wheel zooms, `V` swaps the
camera's shoulder, `E` interacts, `P`/`Esc` pauses, `M` mutes, `` ` `` opens
the debug overlay and `F4` cycles graphics presets.

You can walk a hundred and fifty metres of street, cross at the crossing,
step up and down kerbs and the station stairs, buy a hot can from a vending
machine, and read the sign at the station mouth. Pedestrians walk their
routes and wait at the kerb when the signal is against them; traffic drives,
closes up on the car ahead, and stops at the line. It rains, and the road
darkens and polishes as it does.

## What was added

### Systems the foundation was missing

| Module | What it does |
| --- | --- |
| `src/core/GameState.ts` | Flags, counters, inventory, chapter, pose and clock — one authority per fact, versioned and migrated on load |
| `src/audio/AudioManager.ts` | Web Audio graph: master bus over music, effects and ambience, a listener that follows the camera, positional emitters, and synthesised city rumble, rain, footsteps and score |
| `src/ui/UI.ts` | Interaction prompt, captions, objective, screen fade and pause panel, all driven by events |
| `src/world/Interaction.ts` | Interaction points: declare a position, a radius and what the key does |
| `src/world/Prefabs.ts` | Prop registry: every prefab declares a glTF path and a primitive stand-in, and prefers the model when it exists |

### The character

`src/player/PlayerCharacter.ts` is a jointed placeholder rig — pelvis, spine,
head, two arms, two legs — animated procedurally from a locomotion state
rather than from a set of angles, so a rigged glTF replaces the mesh without
touching the controller. It has the long hair and the dark green work coat
the design calls for.

`src/player/PlayerController.ts` moves it: camera-relative walk, jog and
sprint with acceleration, a turn rate the body has to obey, gravity, a jump
with coyote time and an input buffer, and a step-up pass that gets her onto
a kerb without a jump. Collision is Babylon's swept ellipsoid — she is a
kinematic body, not a ragdoll, and a physics solver would have been a
dependency and a pile of tuning for behaviour we would then fight.

`src/player/ThirdPersonCamera.ts` is a hand-driven spring arm: shoulder
offset, mouse and stick look, wheel zoom, a lagging pivot, an occlusion probe
that pulls in when something gets between the camera and the character, and a
field of view that opens slightly at speed.

### The street

`src/scenes/TokyoStreet.ts` lays out one block to real dimensions — 3.25 m
lanes, a 160 mm kerb, a 1.83 m vending machine — because primitives read as a
place when the proportions are right and never do when they are wrong. Road,
markings, crossing and kerb ramps, pavements, two rows of buildings with
lit-window facades and ground-floor shopfronts, a convenience store, a
station entrance with a stair going down, street lights, utility poles
carrying a tangle of overhead lines, vending machines, traffic signals,
bins, planters, bicycles and signs.

Supporting it: `CityMaterials` (procedural asphalt, paving, concrete and
tile, plus window grids and abstract neon signage — the signs are strokes,
not writing), `Crowd`, `Traffic`, `Weather` and `LampPool`.

## Decisions worth knowing

**Prefabs, not scene code.** The layout never constructs a vending machine;
it asks the registry for one. Primitive prefabs are spawned as GPU instances
of a hidden template, so sixty street lights cost one draw call. When art
arrives, a prefab gains a `model` line and every scene that places one gets
the model.

**Four lights that move.** A street has twenty lamps; twenty point lights
would multiply through every lit material's shader, and Babylon's default
budget is four. `LampPool` lends four real lights to the nearest lamp
positions and crossfades as the player walks. Every lamp appears lit,
because the ones close enough to matter always are.

**Light sources are unlit.** A neon tube is not shaded by other lights, and
an unlit PBR material compiles to a fraction of the shader — which matters
when a street has forty of them.

**Ambient does the bounce.** A neon street at night is not black. Rather than
lighting that for real, `Lighting.setUrbanGlow` tints the ambient dome cold
from above and sodium-warm from below, and the emissive sign faces carry the
rest.

## Four bugs worth recording

**A scene that never became ready.** The load hung forever at 87%, with no
error anywhere. Cause: `PBRMaterial.clone()` re-creates its textures from
serialisation, and a procedurally drawn `DynamicTexture` has no URL to be
re-created from — so the clone's textures never became ready, and
`scene.isReady()` waited on that one mesh indefinitely. Runtime-generated
materials must be referenced, never cloned. `awaitSceneReady` now bounds the
wait and names whatever is holding it up.

**An optional asset that was not there.** A 404 from `LoadAssetContainerAsync`
leaves an entry in the scene's pending-data set that is never cleared, and
that also blocks readiness. Prefabs now HEAD-check a model before asking the
loader for it.

**Walking through walls at low frame rates.** Babylon's swept ellipsoid stops
being reliable once a step approaches the ellipsoid's radius: the character
starts a step already inside a wall and is pushed out the far side. At 60 fps
a sprint step is 0.12 m and this never bites; the frame clock is allowed to
reach 100 ms, and on a slow machine that is 0.72 m — straight through a
shopfront. Movement is now split into steps smaller than the radius, and the
region declares hard bounds as a backstop.

**Climbing a wall by standing still.** The step-up pass raised the collider,
tried again, and dropped it. Into a corner where the drop was also blocked,
that lifted the character 0.42 m per frame and laddered her up the building.
The detour is now accepted only if it gained ground *and* barely gained
height.

## Verification

`npm run test:browser` builds and drives the real bundle in headless Chromium
under SwiftShader — the WebGL2 fallback path. Nineteen checks: boot, backend,
no uncaught errors at boot or during play, region identity, camera identity,
the character's presence, geometry, pedestrians, traffic, rain, lighting,
frame contrast, that walking moves her, that she stays on the pavement, that
sprinting and jumping keep her in the world, that the mouse orbits the
camera, that she cannot leave the block, and that the Phase 1 proving ground
still loads. All pass.

Frame rate under SwiftShader is a few frames per second at this scene size.
That is the software rasterizer; no performance claim is made from it, and
performance on real hardware is still unmeasured.

## Not in this part

No train, no countryside, no farm, no farming, no supernatural encounter, no
interiors. Contact-hardening shadows and screen-space reflections are still
off. The station stairs go down to a doorway that does not open yet — that is
the next piece.

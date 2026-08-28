# Tokyo, rebuilt — Milestones 1 and 2

The first street was a technical prototype: it proved the renderer worked and
looked like it. This is the rebuild. Milestone 1 is Aiko and how she is
presented; Milestone 2 is the street she is standing in.

## Assessment of what was there

**Placeholder systems, replaced.** The protagonist was a box-and-capsule rig
with no face, no hands and hair painted onto the skull. Buildings were single
extruded boxes with a window texture, one per plot. Storefronts were a flat
glass plane with a coloured panel behind it. There was no interior geometry
anywhere. The camera framed her at a third of the screen height from 4.4 m.

**Placeholder systems, still placeholder.** Pedestrians. They now have
proportions rather than being capsules on legs, but they are still four
instanced primitives with no faces, clothing or behaviour — that is Milestone
3 and it is deliberately untouched here.

**Kept, unchanged.** Everything under the street: the engine and its
WebGPU/WebGL selection, the quality presets, the region and asset
architecture, the prefab registry, the event bus, saved state, the audio
graph, weather, the lamp pool, the interaction registry, the traffic and
signal model, and both other regions. None of it needed replacing; the
problem was never the systems, it was that the content built on them was one
box per building.

**Assets still needed.** Every prefab and every character declares a glTF
path that does not exist yet: buildings, shopfront kits, interior fittings,
street furniture, vehicles, and the characters themselves. The pipeline is
ready for them — see *Asset strategy* below.

## Milestone 1 — Aiko

`src/player/rig/HumanRig.ts` builds a jointed body from a spec. The joint
names and hierarchy are a glTF humanoid skeleton's, so when a rigged model
arrives the builder is swapped and the animation code — which only ever names
joints — keeps working. Limbs are tapered capsules, not cuboids: a box arm
reads as a mannequin at any distance, a tapered capsule reads as an arm from
about three metres, which is where the camera is.

Her design is the one specified: long sleek black hair, blunt bangs, green
eyes, an oversized jacket over a pleated skirt, dark tights, heavy boots, a
bag across the body. The face is eyes, irises, pupils, brows, nose and mouth —
six small meshes that resolve at conversation distance and are switched off
for background characters, where they are geometry that never resolves.

**Hair.** `src/player/HairSim.ts` is a Verlet chain hanging from the nape,
simulated in world space and drawn as a taper of eleven links. World space is
the point: the character's transform is not applied to it, so walking, turning
and stopping put real inertia into her hair without a line of code that knows
what walking is. Three constraint passes — length, stiffness falling off
toward the tips, and collision against her own body and the ground — are each
there to stop one specific failure of a chain this long.

**Animation.** `src/player/AnimationController.ts` is a state machine over
poses: idle, walk, run, sprint, jump, fall, land, interact, open door, pick
up, sit, eat, phone. Locomotion states build their pose from a stride phase,
so walking and running are the same code at different amplitudes; one-shots
blend in over their own attack and release. Every state is
`(phase, weight) → joint angles`, which is exactly what a glTF clip is, so
authored animation replaces the content without changing how anything asks
for it.

**Camera.** 3.5 m through a 47-degree lens instead of 4.4 m through 53, which
puts her at a little over half the frame height rather than a third. Running
eases the camera back and widens the lens slightly. A separate interior
profile exists for rooms where 3.5 m is a wall. Two fixes matter more than the
numbers: the occlusion probe now only tests real occluders — a bollard used to
yank the camera into the back of her head every few steps — and she is hidden
when the camera is forced closer than 1.75 m, which on a street this narrow
happens often.

## Milestone 2 — the street

**Proportions first.** The old street was 12 m of carriageway between 5.5 m
pavements, which is an arterial road, and an arterial road needs a hundred
objects before it looks occupied. This is 6.8 m kerb to kerb with 3 m
pavements over 64 m, which is what these streets are. At that width the
buildings lean over you and a dozen objects fill the frame.

**Buildings are composed, not extruded.** `src/world/Facades.ts` builds a
frontage from bands: a recessed shopfront with piers, a lintel, a stall riser,
mullioned glazing, a door with a frame and a rail, and a threshold step; then
floors of windows with sills and heads, balconies with railings, air
conditioners and laundry poles; then a parapet, coping, water tank,
condensers and an aerial mast; then downpipes, brackets, a meter box and a
cable tray running up the face. Sixteen buildings, each merged per material,
so a frontage of thirty pieces costs three or four draw calls.

**Every trade dresses its own front.** Ramen and izakaya get a split curtain
across the doorway and paper lanterns on a rail. Cafés get an awning. The
convenience store gets a three-band fascia in its own livery. Everything open
gets a projecting blade sign, legible from up the street rather than only
from in front of it. Shuttered units get a corrugated roller shutter, because
a street where every unit is open is not a street.

**You can see inside.** `src/world/ShopInterior.ts` builds a shallow room
behind each shopfront: floor, walls, a lit ceiling, the fittings that trade
uses, and one or two people in it. A ramen shop is a counter with stools
along it, a kitchen strip with pots and an extract hood, menu strips on the
back wall, customers eating and a cook behind the counter. A convenience
store is a wall of cold cabinets, three gondolas of stock, a till by the door
and a cash machine in the corner. The test is that you can tell what the shop
is with the sign covered.

**Street level.** Two lines of clutter: one hard against the shopfronts where
shops put things out — vending machines, condensers, crates, gas bottles,
bins, meter boxes, bicycles, planters, benches — and one at the kerb where the
street's own equipment goes: bollards, guardrails, cones, scooters, bike racks
with bicycles in them, sign posts and drain grates. Plus overhead lines
strung pole to pole and dropped across the street, tactile paving and a
dropped kerb at the crossing, and signals on all four corners.

**Scale.** A hundred and twenty-five towers in three depth bands beyond the
block, exterior only, never approached, with red aircraft beacons on the tall
ones. The street reads as one street in a city rather than a diorama.

## Four bugs worth recording

**Every projecting detail was inside the wall.** Awnings, balconies, blade
signs, lanterns, pipework and window sills were all written with the sign that
recesses instead of the sign that projects. Fixed by stating the convention
once — `toward(d)` is out over the pavement, `into(d)` is back inside — and
using it everywhere.

**The building mass sealed the shopfronts.** A single box from the ground up
put the recessed glazing, the door, the sign and the whole interior inside
solid concrete. The mass is now two parts: the upper storeys get theirs, and
the ground floor only gets it behind wherever the shop's room ends.

**Interiors were built in front of their own glass, and unlit.** The bay was
placed 0.15 m behind the building line — in front of the glazing at 0.55 —
so the room's side walls stood between the window and the fittings. And every
light in the street is outside, so a room behind glass got none of them.
Interior surfaces now carry their own baked emissive term, which is what a
shipped game would do here anyway.

**A hole behind the pavement.** The pavement stopped at the building line and
the shopfronts were recessed behind it, leaving a gap she could sprint into
and fall out of the world through. The pavement now runs past the line, there
is a floor slab under the whole block, and her bounds are the pavement rather
than an arbitrary twenty metres.

## Asset strategy

Nothing here needs rewriting when art arrives.

- **Props** already declare a `model` path in the prefab registry. When the
  file exists it is loaded and instanced in place of the primitive; the scene
  code that places a vending machine never changes.
- **Characters** go through `CharacterSpec` → `buildHuman`. Replacing the
  builder with a glTF load that binds the same joint names leaves the
  controller, the animation states and every scene untouched.
- **Buildings** are composed from kits. A kit becomes a call that instantiates
  a modelled shopfront or floor band instead of assembling boxes; the plot
  table that says what goes where is unaffected.
- **Interiors** are a bay description plus a fitting-out routine, replaceable
  the same way.

## Verification

`npm run test:browser` — thirty-eight checks in headless Chromium on the
WebGL2 fallback, covering the street, the interlude, the valley and the
proving ground. New in this pass: that the street has at least twelve distinct
frontages, that at least eight shops can be seen into, and that the skyline
carries past the block. All pass.

`node tools/shot.mjs <name> <scene> <settle> <script>` is a development tool
added here: it boots the real build, optionally drives it, and pulls one
completed frame out of the canvas. Fast enough to look at a change without
running the whole suite.

## Next

Milestone 3 is the one to do next, and it is the most visible thing still
wrong: the pedestrians. They need the modular treatment the player rig
already has — a small set of shared meshes and materials, instanced, with
variation in build, clothing, hair and accessories, and behaviour that takes
them into and out of the places on this street rather than past them. After
that, Milestones 4 and 5 turn the ramen shop and the convenience store from
rooms you can see into rooms you can enter.

# The district — assets, people, rooms you can walk into

The street was rebuilt as an environment in `TOKYO-REBUILD.md`. This pass
takes ownership of everything that was still being deferred: where the art
comes from, what the pedestrians are, and what happens when you push a door.

## Where the assets come from

The honest answer, arrived at by trying: **they are generated, because
nothing usable can be fetched from here.**

The sandbox reaches `raw.githubusercontent.com` and nothing else that
matters — `kenney.nl`, `polyhaven.com` and the rest resolve to nothing, and
the GitHub API answers 403, so a repository's contents cannot even be
enumerated. What is reachable by raw file path is a handful of CC0
low-poly packs whose art direction (chunky, stylised, fantasy-tinted) would
fight a believable Tokyo backstreet in every frame, and which cannot be
listed without the API to find out what is in them.

So the decision: **every asset in the game is built by code in this
repository**, from original geometry, with real modelling operations rather
than stacked cubes. `src/world/Shapes.ts` is the toolkit that makes that
possible — lathe (`revolve`), extrusion along a path (`extrude`), rounded and
chamfered blocks, tubes, corrugated sheet, railing runs, framed panels. A
lantern, a bowl, a bin, a stool, a pendant shade and a rice pot are all
surfaces of revolution; a roller shutter is an extruded zig-zag. Nothing in
the pipeline changes when a modelled asset does arrive: see below.

Everything is original. No logo, no chain, no character and no building is
copied from anything that exists. The convenience store is an invented
chain with its own three-band livery; the café is an invented house with its
own uniform; the signage is abstract strokes on a dark plate — the shape of
shopfront writing without being writing.

## The asset pipeline

`src/engine/AssetCatalog.ts` addresses assets **by id**, never by path:

```ts
catalog.spawn("vending_machine_01", { position, rotationY });
```

Each definition names an id, a category (`prop`, `vehicle`, `building`,
`character`, `interior`), a builder for the generated version, whether it
collides, whether it casts shadows, and the distance past which it is
culled. The path is derived — `props/vending_machine_01.glb`,
`vehicles/tokyo_car_01.glb` — so dropping a model into `public/models/` is
all it takes to replace the generated one. `prepare()` HEAD-probes each path
first: a model that is there is loaded, a model that is not falls back to the
generated build. A missing file is never an error and never a crash.

It is also never silent. Every id that is running on generated geometry is
logged in one grouped message at load, and published on the event bus as
`assets/report`, which the debug overlay (`` ` ``) shows as
`assets 0/23 on models · 23 generated (Tokyo backstreet)`. Nothing is
substituted for something it is not: the fallback for a vending machine is a
vending machine.

## Citizens

`src/world/Citizens.ts` replaces the four-primitive walkers with a parts bin:
six coat colours × (torso, hem, yoke, arms), three trouser colours, three
skin tones, three hair colours × three cuts, plus bags, shopping, phones and
umbrellas. A person is assembled from instances of those templates, so a
crowd of thirty costs a few dozen draw calls and no unique geometry.

They have activities rather than paths — walking, waiting at the crossing,
checking a phone, talking, going into a shop, being inside it, coming back
out — and the number of them on the street follows the clock: busy in the
morning, quiet mid-afternoon, busy again in the evening, thinning after ten.
Detail is dropped past 26 m and the whole body is culled past 85 m. In the
rain they put umbrellas up.

## Rooms you can walk into

`src/world/Interiors.ts` builds three real rooms, in the street's own scene,
with no load between the pavement and the counter:

- **The ramen shop.** A counter across the room, stools you can sit on, the
  kitchen behind it with pots and steam, a cook, two people eating, noren
  hung inside the door, paper lanterns, menu sheets up the walls and a ticket
  machine by the entrance. Sit down, order, eat.
- **The convenience store.** Cold cabinets stocked bottle by bottle,
  gondolas stocked packet by packet (merged to one draw call each), a till
  with a register, a cash machine, a clerk and a shopper. Take something off
  a shelf; pay for it.
- **The café.** An invented house in the maid-café idiom: round tables you
  can sit at, pendant lamps, a counter with a cake dome, a corner stage,
  bunting, two staff in a uniform that belongs to this shop and nowhere else,
  and one customer already served.

Each room carries its own light and its own emissive floor for the surfaces,
because every street light is outside; each has a dado band and rail, which
is the one horizontal break that stops a bare wall reading as a screen. The
camera swaps to its interior framing when she crosses the threshold, and the
street ambience ducks.

## The alley

`src/world/Alley.ts` is a four-metre gap between two shuttered units:
condensers stacked up both walls, drainpipes, sagging cable runs, a fire
escape, junction boxes and conduit, notices nobody took down, crates, bagged
rubbish, gas bottles, a vent breathing steam, one working lamp, and a small
shrine in the dead end with two cups in front of it. It exists for contrast —
a wide, lit, busy street and somewhere narrow and dark twelve metres off it,
which is most of what makes a block feel like a place.

## Rain that lands

`src/world/WetGround.ts` adds the half of rain that is not falling water: a
dark polished puddle scattered across the carriageway and the pavement, and a
coloured smear on the ground under every light source — the lamps, each
shopfront, the crossing, the alley lamp. Both layers are one merged mesh
each, additive and unlit, so the whole wet street costs two draw calls and no
lights. `Weather` also emits a low burst of spray around the camera, because
rain that stops dead at the ground plane is rain the eye does not believe.

Everything reads the same wetness value: road roughness, citizens' umbrellas,
footstep hardness, and both ground layers.

## What is next

Modelled characters and props to drop in behind the ids that are already
addressing them; the residential street and the small park; and the interiors
of the remaining frontages, which are still views rather than rooms.

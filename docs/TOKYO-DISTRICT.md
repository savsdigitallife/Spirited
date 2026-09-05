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
`vehicles/car_taxi.glb` — so dropping a model into `public/models/` is
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

## Glass

Every pane in the game — shopfront, door, car cabin, carriage window, cake
dome, fridge door, vending-machine face, farmhouse sash — is built by
`src/world/Glass.ts`, so they all behave the same way in the same light.

What makes glass read as glass is that it is smooth: it returns the sky in a
sharp reflection, throws a hard highlight where the sun is, and reflects more
the more edge-on you see it. All three come out of the PBR model once the
material is set up honestly — no metalness, a dielectric's index of
refraction (1.52), roughness near zero, and, crucially, the reflection and
the specular allowed to show *over* the transparency rather than being faded
out with it. A pane at 0.26 alpha without that is 26% of a reflection, which
is no reflection at all.

The reflection itself is the scene's environment cube: a probe refreshed every
few seconds as the sun moves, which now runs on every quality preset — six
128-pixel faces of a sky mesh is cheaper than one light, and it is the
difference between a window and a dark rectangle. On the street the probe
also renders the frontages and the near towers, because the thing a Tokyo
window has to reflect at midnight is forty signs, not an empty sky.

Building windows are not separate panes — there are thousands of them — so
the facade texture carries a metallic-roughness map alongside its albedo and
emissive: rough dielectric across the wall, smooth and part-metal over each
pane. One texture, and every window on every tower catches the sun while the
concrete around it does not.

## The road, and what runs on it

Asphalt is two layers: a macro map at eight metres a tile carrying the grain
of the surface, and a detail map at about a metre carrying the chippings
themselves. Neither works alone — macro is grey mush underfoot, aggregate
moirés into stripes down the street — and Babylon's detail map runs the
second over the first for the cost of one texture.

Both are deliberately featureless, because a tiled map repeats eleven times
down this street: anything memorable in it becomes a stripe running the whole
length. Everything with character is laid once as geometry instead — the
polished wheel tracks, the joint down each gutter, the transverse joints
between the paver's passes, backfilled trench patches, cracks with branches
off them, and the ironwork. All of it shares the road's material and takes
its tone from vertex colour, so a patch is asphalt of a different age rather
than a clean grey rectangle.

Everything on the ground plane now carries world-plane UVs (`planarUv`).
This fixed the corduroy: a box's faces are each mapped 0..1 and the top
face's U runs along its *depth*, so a four-by-ninety-metre pavement slab was
showing its texture smeared ninety metres one way and repeated every fourteen
centimetres the other. With world UVs the grain is continuous across the
road, its patches and the pavement, whatever size each mesh is.

**Wheels.** A tyre and a rim are both surfaces of revolution, which is what
they are in life. The tyre's profile carries the bead, the sidewall bulge,
the shoulders and three circumferential grooves; the rim's carries the barrel
and its lips, with five spokes across the face, a hub cap and a brake disc
behind. Rubber is a dielectric at 0.82 roughness; the rim is a polished metal
at 0.14, so it returns the street the way the glass does. The four wheels
merge to one mesh — they never move relative to each other — and the rim
faces outward on both sides of the car. It is authored at one size and
scaled, so a kei van and a 4x4 roll on the same wheel at the sizes those
vehicles use.

## The signal, and the traffic that obeys it

The lights used to be scenery. Green was hard-lit at strength 4 and the other
two aspects sat at 0.35 forever, while the cars stopped and started on a timer
that had nothing to do with them — so the light said go while the traffic
stood still.

There is now one phase, in `Traffic`, and everything reads it: the cars, the
people waiting to cross, and the three lenses in every head on the street.
They cannot disagree, because the cars stop *because* the light is red rather
than alongside it.

Green for sixteen seconds, amber for three, red for ten. Amber is not
decoration — it is what lets a car already on top of the line go through
instead of standing on the brakes, which is the difference between traffic
and a row of objects being toggled. Red means stop at the line, six and a half
metres back, and a car starts reading the signal twenty-six metres out so it
arrives slowing rather than stopping dead.

Every head shares one material per aspect. That is not a shortcut: an instance
cannot carry its own material, and every signal at one crossing shows the same
thing anyway. The three are deliberately outside the night dimming that the
neon and the window grids go through, because a traffic light is no dimmer at
noon than at midnight.

The smoke suite checks this from outside, the way a player sees it: which lens
is lit, and whether any car crosses the junction while it is the red one. It
finds the junction from the positions of the signal heads rather than from a
number copied out of the scene, and runs the clock at five times speed,
because one cycle is half a minute and this renderer buys few frames.

## Fourteen car bodies

The street used to have one car in it — a box for the body, a box for the
glass — and six copies of it went up and down the road. `src/world/Vehicles.ts`
replaces it with fourteen body styles, because what tells traffic apart at
forty metres is the silhouette, long before the paint does.

A body is a **side profile**, which is how a car is drawn before it is a car.
Two closed outlines in the (along, height) plane — the sheet metal below the
beltline and the glasshouse above it — are extruded across the width and then
sculpted by one pass over the vertices:

- **tumblehome**, drawing the body in between the shoulder and the roof;
- **plan taper**, narrowing the nose and the tail, squared so the sides stay
  straight over the doors;
- a **tuck** under the rocker.

Those three are the difference between a slab and a car body, and they are
free: the mesh is built once and instanced. Everything else is placed against
the sculpted surface using the same function that sculpted it, so a mirror
sits on the flank of a wide car and of a narrow one without either being a
special case.

**Wheel arches are the point.** Without an opening the top half of every tyre
is inside the bodywork and the car reads as a slab with four discs beside it.
Cutting one makes the outline concave — and Babylon caps an extrusion with a
fan from the outline's barycenter, which fills the arch straight back in. So
`Shapes.prism` triangulates its caps by clipping ears instead, and returns
single-sided geometry with correct winding and per-fold smoothing: a rounded
arch and a crisp shoulder line out of one call. Each opening is cut clean
through, so each gets a dark liner behind it; without one you can see daylight
through the car.

Detail earns its place by what it costs. Door shut lines and handles are the
cheapest thing in the model — three dark slivers and a knob — and they are the
difference between a flank and a pressing. Everything on the nose and tail
stands proud of the panel it is on, because a lamp set flush is a lamp inside
the bodywork. Lenses are coloured plastic with a smaller emissive element
behind them, so a tail light is red by day and lit after dark; a lamp that is
only emissive goes black when the sun comes up.

The fourteen: kei one-box van, kei flatbed, kei hatchback, taxi saloon,
compact hatchback, executive saloon, estate, people carrier, sports coupe,
open two-seater, crossover, boxy four-wheel drive, high-roof panel van, and a
seventies coupe on chrome bumpers and round lamps. Proportions are what those
styles have — a kei class car is 3.40 m long and 1.48 m wide because that is
the size the class allows. Each carries its own paint, and `Traffic` deals
bodies from one shuffled bag for the whole street rather than rolling per car,
so no two vehicles on the road are alike.

Nothing here is a copy of a real vehicle. What is borrowed is the vocabulary
of body styles, which has been public property since the coachbuilders.

## What the signs say

Every sign on the street carries real Japanese, set horizontally, centred,
and fitted to the board it is painted on: 「麺屋 かなで」 over the ramen shop,
「ミドリマート」 over the convenience store, 「メイド喫茶 さくら箱」 over the café,
「地下鉄 羽澄町駅」 over the way underground, 「カラオケ」 and 「深夜営業」 on the
banners hung off the frontages, 「本日の おすすめ」 on the boards out on the
pavement. The trade words are the ordinary ones; the shop names, the chain
and the station are inventions of this street's. Nothing is a real business.

`src/world/Signage.ts` draws them into a canvas at load: the board's own
proportions decide the canvas shape, so the lettering is never stretched by
the mesh; the font size is fitted to the longest line; lines are stacked and
centred on both axes. Neon is three passes — a wide bloom, the tube, then a
hot core — because a single flat fill reads as a printed sticker. If a
machine has no Japanese font at all (checked by rendering one kana against a
character no font defines), the street falls back to the abstract strokes it
had before rather than drawing a row of empty boxes.

Sign faces are planes, not box faces. Babylon maps each face of a box 0..1
with its own idea of which way U runs, so the same texture came out a
quarter turn over on one board and reversed on another; a plane turned to
look at the street has one unambiguous face. The artwork is drawn upside
down into the canvas, because a plane's V runs opposite to a canvas's rows —
everything symmetrical had hidden that until a test board with an "A" on it
made it obvious.

## Daylight, moonlight, and the pavement under both

**The light.** The solar model is shared with the countryside, but what a
region does with it is not, so `Lighting` takes a mood and Tokyo sets one:
a soft, faintly orange key by day, a blue moon at night that actually
reaches the pavement, a warm hemispheric fill, and shadows lit to 0.45
rather than the valley's 0.12 — a street between six-storey buildings is in
its own shadow most of the day, and at the countryside's setting it went
black at noon.

The other half of daylight was giving the night back its own lights. Neon,
window grids, sign faces and the street lamps are all scaled by how far the
sun is up: held at full strength through the morning, the street read as a
night scene with a blue sky over it. The building facades were repainted
pale for the same reason — they are tile and painted concrete, and at night
almost none of that is lit anyway.

**The pavement.** A Tokyo footway changes surface at the property line and
at every rebuild, so it is laid as runs rather than as one slab:
interlocking blocks outside most of it, clay pavers where the older
frontages are, plain slabs where the road was widened, and a stretch of
coloured asphalt cycle lane along the kerb on the east side with a white
edge line and a bicycle painted on it. `src/world/Paving.ts` draws each
surface from a recipe in metres — 20 cm blocks, 21 cm pavers, 90 cm slabs —
so the unit size is right whatever texture resolution the preset is running,
and every run carries world-plane UVs so the pattern is continuous across
the joins.

Running the length of both sides, a metre off the building line, is the
yellow tactile guide: raised dots on 30 cm blocks. It is the one thing every
Japanese pavement has, and the single strongest cue that this is Tokyo.

## The frontages

What makes a Japanese commercial street look like one is not the buildings,
which are plain — it is that every square metre of frontage above the shop
is covered in tenant panels, one for each business upstairs, each with its
floor number on it. Every building now carries a column of them flat against
the wall and a second column standing off it at right angles, so the stack
can be read from along the street as well as from in front: 整体 6F,
ネイル 3F, ゲーム 4F, 占い 4F, 雀荘 B1F. Roughly a third are colour-blocked
rather than cream, decided from the business's name so it keeps the same
panel wherever it appears. Every business is invented.

## Concrete

The buildings are concrete, and now look it. `src/world/Concrete.ts` draws
the wall in two layers: the formwork panels, their joints and the tie holes
the shuttering bolts left, with the mottling and streaking of a wall that has
cured and weathered, at three and a half metres a tile; and the aggregate
itself as a detail map at about forty centimetres, which is the stone in the
concrete when you are standing next to it.

Everything using it carries `boxUv`, which projects each vertex along
whichever axis its normal points down — a triplanar map baked once on the
CPU, since none of this geometry moves. That is what makes the panel lines
run continuously along a wall, around its corner and onto the next building,
instead of restarting at every box and coming out a different size on a
nine-metre wall than on a two-metre one.

The facades use the same surface between their windows: the wall is drawn
from the concrete sampler with a pour joint at each floor, vertical joints
between the window columns, and tie holes, and the windows are cut into it as
recessed openings with their own reveals. It stays at 512 pixels a map and
skips the aggregate layer — five texture fetches a pixel across every
building in the frame cost more than grain nobody can see from the pavement.

## The ramen shops

Three of them, and no two alike, because a ramen shop is one owner's premises
rather than a chain unit. `src/world/Ramen.ts` describes a house — its
frontage, its signs, its fit-out, its staff — and both the facade builder and
the interior builder read it.

- **麺屋 かなで** — the quiet one. Timber posts and lattice, one beam, two
  lanterns, no menu outside at all. Inside: a straight counter, eight red
  stools, warm light, a calendar and a radio on a shelf.
- **立喰 みなと** — a standing shop. A lit signboard across the whole
  frontage that you can read from the crossing, a ticket machine at the door
  with its rows of buttons, and a column of photographed dishes beside it.
  Inside: a high counter, no stools whatsoever, a tray return, a clock, and
  people eating standing up in nine minutes.
- **豚骨 いろは** — the loud one. A yellow fascia lit from inside, the counter
  running out through the opening with stools on the pavement, red lanterns.
  Inside: a horseshoe counter with the kitchen in the middle, a second pair
  of hands, a shelf of regulars' bottles and a television nobody watches.

Every house is invented — names, marks, fit-out. What is borrowed is the
grammar: noren, ticket machine, photo menu, counter, pots, steam.

The chef is now actually cooking. `AnimationController` gained two states:
`cook`, which holds a basket down in the water with one hand while the other
stirs and lifts and shakes it off every few seconds, and `eatStanding`, since
a standing shop full of people in a sitting pose was the giveaway that the
state was missing.

## Behind the shops: the lane and the park

The main street only reads as a main street if there is something quieter
immediately behind it. `src/world/Residential.ts` builds that: a lane two
streets back, entered through the alley, which now has a gate rather than a
dead end — `buildAlley` takes a `gate` and puts a pier each side and a head
over it instead of a wall.

The lane is five metres of asphalt with a gutter each side, a strip of
concrete paving against the backs of the shops, and six two-storey houses
along it. Each house is its own dimensions and its own render — cement
plaster, a second plaster, or metal siding — under a pitched roof extruded as
one prism, so it has a ridge, two slopes and real gable ends. Two slabs
tilted towards each other was the first attempt and it read as sheets laid
over the box.

Every house has the same four things outside it, because these houses do: a
door under a canopy, a meter box, a mailbox on a leg, and pot plants on a
low boundary wall. The windows are aluminium sashes — head, sill, two jambs
and a centre mullion, and behind the glass a dark reveal so the pane has
something to sit against and its reflection reads. The wall is a solid box,
so the opening is built in front of its face; set the glass back into the
mass instead and it disappears inside it. Above, a concrete balcony deck
just under the upper sill, a railing, and the pole the washing goes on.
Between the houses, poles carrying more cable than the buildings look worth.

At the end of the lane is the pocket park, the size of a tennis court, which
is what these are: block paving, a low wall round it, a sandpit with a timber
kerb, a swing frame, a slide, a drinking tap on a post, a bench, a bin, three
trees and a board reading 「羽澄第二公園」. Two lamps, on the same `LampSite`
pool as the street.

The backdrop had to be told to keep off it. The skyline fill leaves the main
street's own corridor clear, and now also `LANE_CLEAR` — the rectangle the
lane and park stand on. Without that, a 33-metre tower lands on the park and
the first view down the lane is a wall of curtain glass.

## What is next

Modelled characters and props to drop in behind the ids that are already
addressing them, and the interiors of the remaining frontages, which are
still views rather than rooms.

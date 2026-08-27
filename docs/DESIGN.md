# Design notes

Written for whoever picks this up next — including me in six months.

## The spine

Twelve chapters, strictly linear, defined in `src/data/quests.js`. Each one carries
a `title`, one `objective`, a `where` and a `hint` — the top-right banner and the
journal both read straight from that, so if the next step is unclear in the data it
is unclear in the game.

| # | Chapter | What the player does |
| --- | --- | --- |
| 1 | `packUp` | Find the bag in the flat; Mei asks if she is really doing this. |
| 2 | `farewell` | One last bowl at the ramen counter. Mei gives her radish seed. |
| 3 | `catchTrain` | Buy a ticket, board the last northbound train. |
| 4 | `arrive` | Step down at the halt, follow the lane east to the gate. |
| 5 | `theKeys` | The gate is padlocked; Yuzuki has the lease, in the village. |
| 6 | `clearGround` | Three jobs: brambles, stones, fence. All three, then the beds. |
| 7 | `firstSeeds` | Seed from Kanae on credit, then sow. |
| 8 | `water` | Ask Ren how to clear a channel, then lift the sluice. |
| 9 | `animals` | Tsuda's hens and goat, and a coop to build before dark. |
| 10 | `storm` | Animals in, beds covered, ride it out. |
| 11 | `harvest` | Pick what survived; Kanae values it and settles the seed debt. |
| 12 | `home` | Dinner at the bathhouse. Somebody saved a seat. |

Every gate in that chain is a real one: the front door will not open without the
bag, the station will not let her through until she has said goodbye, the farm gate
needs keys, the beds will not accept seed she does not have, and the sluice will not
lift until Ren has told her to work top-down. `tests/story.test.js` walks the whole
thing and asserts each of those refusals as well as each success.

## Adding content

**A new area**: write a `makeArea` call in `src/world/areas/`, export it from
`src/world/index.js`, and run `npm test`. `validateWorld()` will tell you if an NPC
is inside a wall, a portal lands in rock, a prop is bricked in on all four sides, or
the area cannot be reached.

**A new conversation**: add `SCRIPTS.someId = (state) => graph` in
`src/data/script.js` and point an NPC or prop at it with `script: 'someId'`.

**A new consequence**: add an effect type to `applyEffect` in
`src/systems/state.js`. If it changes the save, handle it there; if it is only
sound and light, return an event and handle it in `Game.handleEvents`.

**Giving an NPC a life**: set `life` on the definition — `idle`, `work`, `wander`,
`patrol`, `commute`, `cat`, `peck` or `graze` — and, for the two route-following
ones, a `route` of tile coordinates. Speeds come from `LIFE_SPEED` in
`src/entities/actors.js`.

## The renderer

Gameplay is 2D and always has been: collision, interaction and portals all work on
the 32-pixel tile grid in `src/world`. The 3D layer reads that grid and nothing
else, which is why the story tests never had to change when it went in.

`render3d/materials3d.js` is the whole translation table — what each tile is made
of, how tall it stands, and what grows on it. `areamesh.js` walks the grid once and
emits: floor quads with corner AO, extruded blocks with their buried faces culled,
sunken water with a bed under it, banks wherever ground meets water, trees, fences,
rail, market awnings, plants, and a cliff (outdoors) or plaster shell (indoors)
around the edge so the horizon is never a hole. One mesh per area, uploaded once and
cached; six areas stay resident.

### Wind

Two extra vertex attributes carry it: `sway` (0 at a plant's root, 1 at its tip)
and `phase` (a per-plant random). `windOffset()` in the shader combines a fast
per-plant wave with a slow gust travelling across the map, so a field ripples
instead of pulsing. The shadow pass includes the same function and the same wind
clock — miss that and the shadows tear away from the plants that cast them. Both
programs also pin their attribute locations (`SLOTS` in `renderer3d.js`), because
a VAO binds by location index, not by name: without it the shadow pass silently
reads whichever attribute the linker happened to put in slot 6.

### Trees

Trunk, a couple of branches, a dark inner canopy so there is nothing to see
through, and ~250 leaf quads scattered over a Fibonacci sphere. Each leaf gets its
own size, its own AO (which is what varies the colour), one of two leaf textures,
and its own wind phase, so a canopy shimmers rather than wobbling as one lump.
Leaves face outward and are single-sided: the far side of the canopy is
backface-culled and nobody misses it.

### Characters

A jointed rig. `bone()` draws a capped cylinder hanging from a joint, swings it,
and returns its far end so the next bone can hang off that — hip to knee to ankle,
shoulder to elbow to wrist. Knees and elbows only ever bend one way. Objects can
take a full euler transform (`trsEuler`), which is what makes the joints possible;
before that everything could only spin about Y.

Both the unit sphere and the unit cylinder are **half a unit across**, so `ball()`
and `drawLimb()` double the radii they are given. The first version of the rig
skipped that and every head came out at half size.

### No edges

The ground does not stop at the last tile. `emitEdge` lays a 90-unit apron of the
area's own ground material in every direction and rings the horizon with hills (or,
for Tokyo, towers), so the world runs out into fog rather than into a cliff edge.
Indoor areas are wrapped in the rest of the building instead — except the south
wall, which the camera always stands behind and which is therefore never built.

### The city

Tokyo runs on the `neon` lighting profile: no real sun, heavy fog, a wet street and
a strong lamp on Aiko. Wetness is one uniform — it darkens albedo, sharpens the
specular lobe, adds a fresnel term tinted with the scene's neon colour, and
perturbs the normal with ripple rings. Puddles come from a cheap two-octave sine
field, so they pool in some places and not others.

Rain is one draw call: a static mesh of 2,000 streak quads living in a 30m cell
that follows the camera, scrolled downward and wrapped in the vertex shader,
slanted by the wind and faded near the lens. The 2D weather layer adds a few
strokes close to the camera for depth.

### Sound

`src/data/music.js` is the score and is pure data plus one pure function:
`planStep(track, step)` returns everything that should sound on a given sixteenth
note. That is what makes the music testable — the tests check pitch ranges, that
swing does not change the length of a bar, and that progressions actually move.
`src/core/audio.js` owns the WebAudio side: a lookahead scheduler, the voices
(pad, bass, pluck, bell, kick, snare, hat, clank), a shared convolution reverb, and
footsteps synthesised per surface from `src/systems/surfaces.js`.

Decisions worth knowing about:

- **Plants are geometry, not billboards.** Alpha-tested crossed quads were tried
  first and looked like charcoal confetti: coarse mip levels average the
  transparent background into the silhouette, and alpha testing turns the result
  into stipple. Small solid boxes cost more triangles and solve all of it.
- **The south wall is never built indoors.** The camera always stands south of
  Aiko, so that wall would only ever be in the way.
- **The cutaway is a cone, not a cylinder** — narrow at the lens, wide at Aiko — so
  the dissolved region stays roughly the same size on screen wherever she stands.
- **Shadow bias is normal-offset**, applied in the vertex shader; front faces are
  culled during the shadow pass. Both are there to kill acne on large flat floors.
- **Everything is one shader.** The world mesh takes its texture layer per vertex;
  boxes and spheres override it with a uniform, or skip texturing and take a flat
  tint. A glow shell is the same shader with emissive above 2, which short-circuits
  lighting and fog entirely.
- **Tiling is broken up in the shader**, not in the textures: a slow sine swell
  across world space plus a second read of the same texture at a much smaller
  scale. Cheaper than more texture memory and it hides the grid better.

### Doorways

Portals no longer cut. `transitionTo` fades the screen down over about a quarter of
a second, swaps the area behind the black, and fades back up; `updatePlay` returns
early while the fade is going out so Aiko does not keep walking into the new room
before you can see it.

### The camera

Two modes, toggled with V. Third person is the default angled follow-cam. First
person puts the eye at head height and yaws smoothly toward whatever direction she
is walking (`turnEye`), hides her body, widens the FOV and turns the wall cutaway
off — with the camera inside the room there is nothing to cut away.

## Things deliberately left simple

- **No combat.** Everything is talk, carry, notice.
- **No fail state.** Nothing in the game can be lost, missed or failed. The storm
  cannot kill the animals; the crop cannot fail. The tension is in the work.
- **Choices are local.** They colour the epilogue and a few scenes; they don't fork
  the story. One ending, differently furnished.

## Known rough edges

- The minimap is a rectangle of dots; it doesn't show doors you haven't found.
- The camera yaw is fixed. Rotating it would mean rotating the input axes with it,
  and the tile grid stops reading clearly the moment it isn't axis-aligned.
- Rooms were laid out for a 30x17-tile top-down view and the 3D camera shows about
  half that, so the larger interiors (the boiler floor, the bathhouse) feel emptier
  than they did. They want more furniture, not a different camera.
- NPC wandering is a random walk inside a radius, so shopkeepers occasionally drift
  behind their own counters.
- The procedural score is a phrase generator, not a composition. It suits the
  bathhouse better than it suits Tokyo.

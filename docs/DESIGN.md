# Design notes

Written for whoever picks this up next — including me in six months.

## The spine

Fourteen chapters, strictly linear, defined in `src/data/quests.js`. The chapter is
a single string on the save (`state.chapter`) and only ever moves forward:
`advanceTo` refuses to go backwards, which is what keeps a re-entered room from
rewinding the plot when an old trigger fires again.

| # | Chapter | Beat |
| --- | --- | --- |
| 1 | `packUp` | The flat is empty. Find the satchel, tell Mom you're ready. |
| 2 | `farewell` | Mei at the crossing shrine. She makes you promise something impossible. |
| 3 | `catchTrain` | Buy your own ticket. Board the northbound local. |
| 4 | `wrongTurn` | Kaminohara. The road stops at a hill with a hole in it. |
| 5 | `throughTunnel` | Dad wants "a look". Five minutes. |
| 6 | `forbiddenFeast` | Stalls with nobody cooking. Two warnings, then clay hogs. |
| 7 | `findWork` | Ren, the bridge, and the only rule that matters: don't be idle. |
| 8 | `loseName` | Yuzuki takes three characters. You are Ko now. |
| 9 | `firstShift` | Coal and three herb tokens for Kamashiro. |
| 10 | `riverGuest` | Draw the herb bath. Pull the bicycle out of the river. |
| 11 | `hollowGuest` | The masked thing is eating the staff. Feed it the bitter cake. |
| 12 | `sixthStation` | Take the stolen seal back down the water rail. |
| 13 | `remember` | Say the river's name out loud. Read your own off the slip. |
| 14 | `homeward` | Four hogs, one guess, and a lie to see through. |

The final test's answer — *none of them* — is planted twice: Granny Yumeno says
"look for what is not there", and the hogs in the pen are not the ones Aiko has been
visiting in the market.

Ren's name is planted in chapter 1. The shoebox in Aiko's room has one pink sandal
in it; the other went into the Sazanami, a river now buried under a road. Examining
it sets `knowsRiver`, which changes the wording of the choice in the grove but not
its availability — a player who skipped the shoebox still gets there, just with the
answer spelled out a little more.

## Adding content

**A new area**: write a `makeArea` call in `src/world/areas/`, export it from
`src/world/index.js`, and run `npm test`. `validateWorld()` will tell you if an NPC
is inside a wall, a portal lands in rock, a prop is bricked in on all four sides, or
the area can't be reached from the flat.

**A new conversation**: add `SCRIPTS.someId = (state) => graph` in
`src/data/script.js` and point an NPC or prop at it with `script: 'someId'`. Use the
`talk()` and `look()` helpers for straight lines; write the graph by hand when you
want choices. Branch on state with the imported predicates (`hasItem`, `flag`,
`isChapter`, `atLeast`), not on globals.

**A new consequence**: add an effect type to `applyEffect` in
`src/systems/state.js`. If it changes the save, handle it there; if it's only sound
and light, return an event and handle it in `Game.handleEvents`.

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

## Things deliberately left simple

- **No combat.** Everything is talk, carry, notice.
- **No fail state.** Running the fade meter down puts Aiko on the boiler floor with
  two hearts and a blanket, not on a game-over screen.
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

# Spirited — The Long Way Home

A cosy open-world game about starting again. **Aiko Nakazato is thirty.** She has
handed in her notice, packed eleven years of Tokyo into four boxes, and taken the
lease on a smallholding in Kaminohara that has stood empty for eleven years and is
mostly bramble.

Clear the ground. Get seed in before the season turns. Find out why the water
channel is dry. Take on six hens and a goat. Hold it all together through a
typhoon, and carry the first basket down to the village market.

Runs in any modern browser. No engine, no build step, no asset files — not one
image, not one sound. The world is real 3D: extruded geometry, a sun that casts
shadows, wind that moves every leaf, rain, textures painted at load time, and a
score composed on the fly, all generated at runtime from code.

## Play it

```bash
npm start            # serves the folder at http://localhost:8080
```

Any static server works (`python3 -m http.server`, `npx http-server`, …). Opening
`index.html` straight off disk will **not** work — browsers block ES modules on
`file://` URLs.

### Controls

| Key | Does |
| --- | --- |
| Arrows / WASD | Walk |
| Space / Enter / E | Talk, read, examine, choose |
| J or Tab | Journal — current chapter, side threads, what happened |
| I | Satchel — inventory; Enter eats what can be eaten |
| V | Switch between third person and first person |
| M | Mute |
| [ and ] | Pull the camera in / push it out |
| Esc | Pause menu (save, load, quit to title) |

The game autosaves to `localStorage` every time you go through a door. On phones and
tablets an on-screen pad appears. It needs **WebGL2** — every browser released
since 2021 has it.

## What's in it

**Twelve chapters, and the journal always tells you exactly what to do next.**
Every chapter states one task and where to do it; press J at any point and it is
written down, with a hint underneath.

**Sixteen areas across three places:**

- **Tokyo** — the emptied flat, a rain-soaked neon crossing with ramen counters and
  a konbini, Kitano station, and the last northbound train.
- **Kaminohara** — the paddy road, Tsuda's farm, the tunnel through the hill, and
  **your own farm**: a walled garden, a woodshed, a water channel, a coop, and a
  farmhouse with a kitchen, a hearth and a wooden bath.
- **The village** — a market street with real stalls, the old bridge and its nine
  lamps, the bathhouse everybody ends up in, the boiler room under it, Yuzuki's
  office, the lake jetty and the weaver's cottage across the water.

**A street full of people with somewhere to be.** NPCs have lives, not loops:
commuters walk routes at pace, shopkeepers work at their stalls, a courier crosses
the whole map and back, a postman does his round, kids patrol, a cat sleeps until
it decides not to, hens peck and the goat grazes. Everyone has their own speed and
their own pauses.

**Five optional threads** — the nine bridge lamps, a barn cat who might stay, a
sixty-year-old hole in the bathhouse ledger, three river stones for Ren, and
cuttings from the weaver across the lake. Each adds a paragraph to the epilogue.

**Rendered in 3D**: the tile grid is extruded into solid geometry — Tokyo towers
fifteen storeys tall, rice standing in flooded paddies, market awnings on posts.
A directional sun casts real shadows through a 2048px shadow map; ambient occlusion
is baked into the mesh; water rolls in two crossing swells. The ground continues
past the last tile to a ridge on the horizon, so there is no edge to fall off.
Anything between the camera and Aiko dissolves through a dither cone.

**Wind moves the world.** Every vertex carries how freely it can move and its own
phase, so a gust travels across a field as a wave. Grass bends from the root, rice
bows, and each of the ~250 leaves on a tree flutters on its own clock. Shadows bend
with it, because the shadow pass runs the same wind.

**Tokyo is a wet neon night** — two thousand rain streaks in a single draw call,
shop signs in magenta, cyan and amber, warm light spilling out of ramen counters,
and a road that goes glossy and throws the colour back at you.

**Sound is synthesised end to end.** Every scene has a composed track — key, chord
progression, bass, and a melody line — played by a sixteenth-note scheduler through
pads, plucks and bells with a long shared reverb. Nothing is faster than 66bpm and
there is no percussion anywhere: the loudest thing in the game is a bell. Footsteps
are synthesised per surface (grass, gravel, wet stone, tatami, wood, water, metal),
alternating feet, detuned each step.

## How it's built

```
index.html            WebGL canvas + HUD canvas + touch controls
server.js             zero-dependency static server
src/
  main.js             entry point, canvas sizing
  game.js             modes, the loop, the glue
  core/               input, frame loop, audio engine, RNG
  render3d/           the renderer: shaders, materials, mesh building, models, rain
  render/             HUD and weather, drawn on the 2D overlay
  entities/actors.js  player and NPC movement, collision
  systems/            state (the whole save), dialogue runner, save slots
  world/              tiles, map builder, and the areas themselves
  data/               items, chapters, the score, and every line of dialogue
tests/                node:test suites, no browser needed
```

Three rules keep the thing testable. **Maps are drawn in code** (a `Draft` grid plus
stamp operations, seeded so a re-entered area looks the way you left it).
**Nothing mutates game state except the reducer in `src/systems/state.js`** —
dialogue and props describe what should happen as plain effect objects,
`{ type: 'give', id: 'foxCoin' }`, which is why a whole playthrough can be run
headlessly. And **the 3D layer is a pure function of the tile grid**: gameplay is
still 2D collision on a 32px grid, and `render3d/areamesh.js` turns that same grid
into vertices without touching WebGL, so the geometry has its own tests too.

## Tests

```bash
npm test
```

Thirty-four tests, no browser required. The four that matter most:

- `tests/world.test.js` validates every map — no NPC standing inside a wall, no
  portal landing in solid rock, no unreachable area, no dialogue script referenced
  by the world that doesn't exist, and every script runs cleanly in every chapter.
- `tests/story.test.js` plays the whole game — flat, ramen counter, ticket machine,
  train, locked gate, lease, brambles, seed, sluice, hens, coop, typhoon, harvest,
  market, dinner — through the real dialogue graphs and the real reducer, asserting
  each chapter, each locked door and each item along the way. If a story beat ever
  becomes unreachable, this goes red.
- `tests/render3d.test.js` builds the geometry for every area and checks it is
  finite, non-empty, correctly indexed, inside the map, and deterministic — the
  things that would otherwise show up as a hole in the world.
- `tests/audio.test.js` checks the score: note names resolve to the right
  pitches, every area asks for a track that exists, every track plays something in
  an audible range, swing does not change the length of a bar, progressions
  actually move, and every tile in the game has a footstep sound.

## On the inspiration

The look and the mood owe a debt to Miyazaki — the bathhouse, the tunnel through the
hill, a valley that runs on its own rules. The story is its own: nobody is spirited
away, and the hardest thing anyone faces is bramble, a dry channel and a typhoon in
the first season. Every character and place here is original.

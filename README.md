# Spirited — The Long Way Home

An open-world adventure game inspired by *Spirited Away*. You play **Aiko**, twelve
years old, being moved out of Tokyo against her will. The game starts in a stripped
flat above the Sakuragaoka crossing, follows her north to a rice valley called
Kaminohara, and — once her father walks into a tunnel he should have left alone —
into somewhere older than maps, where she has to work for her name back.

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
| M | Mute |
| [ and ] | Pull the camera in / push it out |
| Esc | Pause menu (save, load, quit to title) |

The game autosaves to `localStorage` every time you go through a door. On phones and
tablets an on-screen pad appears. It needs **WebGL2** — every browser released
since 2021 has it.

## What's in it

**Fourteen chapters across thirteen hand-built areas**, in three regions:

- **Tokyo** — the emptied flat, the crossing and its shrine, Kitano station, and the
  northbound local.
- **Kaminohara** — the paddy road, Tsuda's farm, the fox shrine, and the tunnel.
- **Beyond** — the hollow market, the Bridge of Nine Lamps, Yuzuki's bathhouse and
  its boiler floor, the high office, the water rail, the marsh house at the sixth
  station, and the grove where taken names are kept.

**About a hundred conversations**, most of which change with the chapter, what Aiko
is carrying, and what she has already worked out. Choices matter in small, local
ways rather than branching the ending: whether you expose a frog who has been
skimming the bath fees, whether you give away the coal you need, whether you pull
the bicycle out of a river spirit alone or call the whole floor to help.

**Five optional threads** you can finish or ignore — the nine lamps, the cinder
mites' wages, the crooked ledger, the cook who never left, and three river stones
for someone who has forgotten what river he is. Each one adds a paragraph to the
epilogue.

**Systems**: a name you can lose and get back, a fade meter that thins you out in the
spirit world if you never eat, a journal, an inventory, weather, procedural
pentatonic music that re-tunes per location, and a soft-fail collapse instead of a
death screen.

**Rendered in 3D**: the tile grid is extruded into solid geometry — buildings six
storeys tall, rice standing in flooded paddies, awnings on posts, a cliff around the
whole valley. A directional sun casts real shadows through a 2048px shadow map;
ambient occlusion is baked into the mesh; water rolls in two crossing swells with
specular and fresnel on top; lanterns carry glow shells and Aiko carries her own
light into dark places. Each area has its own sun angle, sky gradient and fog.
Anything that comes between the camera and Aiko dissolves through a dither cone, so
a wall never hides her.

**Wind moves the world.** Every vertex carries how freely it can move and its own
phase, so a gust travels across a field as a wave rather than shoving everything at
once. Grass bends from the root, rice bows, bushes shiver, branches lean — and each
of the ~250 leaves on a tree flutters on its own clock. Shadows bend with it,
because the shadow pass runs the same wind. Each region has its own weather: a
gusty valley, a storm over the city, a slow strange drift beyond the tunnel.

**Tokyo is a wet neon night.** The move happens under a downpour: two thousand rain
streaks slanting with the wind in a single draw call, shop signs in magenta, cyan
and amber — some of them flickering — and a road that goes glossy and throws their
colour back at you. Puddles pool where the ground dips, ripple rings spread where
the rain lands, and every footstep out there picks up a splash.

**People look like people.** Characters are a jointed rig, not a stack of boxes:
hips and shoulders swing in opposition, knees and elbows bend the way joints
actually bend, the body rises and falls on each step, and idle characters breathe.
Heads, hands and shoulders are spheres; limbs are capped cylinders that hinge at
the joint.

**Sound is synthesised end to end.** Every scene has a composed track — key, chord
progression, bass line, arpeggio, melody and drum pattern — played by a
sixteenth-note scheduler through pads, plucks, bells and a drum kit built from
oscillators and filtered noise, with a shared convolution reverb. The city gets a
dark synth four-on-the-floor; the bathhouse a plucked pentatonic over taiko; the
tunnel a drone and the occasional bell. Footsteps are synthesised per surface —
grass, gravel, wet stone, tatami, wood, water, metal — alternating feet, detuned
each step so a walk never turns into a metronome.

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
- `tests/story.test.js` plays the game from the Tokyo flat to the walk home through
  the real dialogue graphs and the real reducer, asserting each chapter, each locked
  door and each item along the way. If a story beat ever becomes unreachable, this
  goes red.
- `tests/render3d.test.js` builds the geometry for every area and checks it is
  finite, non-empty, correctly indexed, inside the map, and deterministic — the
  things that would otherwise show up as a hole in the world.
- `tests/audio.test.js` checks the score: note names resolve to the right
  pitches, every area asks for a track that exists, every track plays something in
  an audible range, swing does not change the length of a bar, progressions
  actually move, and every tile in the game has a footstep sound.

## On the inspiration

This is an homage, not an adaptation. The shape of the story — a child, a tunnel, a
bathhouse, a bargain over a name — is Miyazaki's. Every character, place and line
here is original: Aiko, Ren, Lady Yuzuki, Granny Yumeno, Kamashiro, Gansuke, the
Hollow One, the Sazanami.

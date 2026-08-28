# Vertical slice, part two — the journey and the valley

The second beat: the last train out of Tokyo, and the valley it puts her
down in. Both are playable now, and the whole run from the city street to the
village is continuous.

Run it with `npm run dev`. Start in Tokyo, walk to the station, press `E`.
Or jump straight in with `?scene=train` or `?scene=valley`.

## The train

`src/scenes/TrainInterlude.ts` is a region, not a cut-away. There is a
carriage — floor, walls, window bays, benches, grab rails, hanging straps,
ceiling fluorescents — and Sae is sitting in it while the country goes past
outside. The camera runs a five-shot list from the far end of the carriage in
toward her and out through the window; the sky turns from midnight to dawn
over the run; five lines of narration land on the way. It takes about fifty
seconds and `E` skips it at any point. It ends by travelling to the valley,
so the transition is a load, not a cut.

The scenery outside is instanced boxes recycled at the end of a hundred and
fifty metre run, reshaped each time they wrap according to how far from the
city the train has got — tall and dense at the start, low and scattered by
the end. An hour of countryside for three draw calls.

## The valley

`src/scenes/HazamaValley.ts` is Tokyo's opposite in every measurable way.
Tokyo is a corridor with no horizon, lit by forty signs, loudest at street
level. The valley is nine hundred metres of view, lit by one low sun, and the
loudest thing in it is a river you cannot see from the road.

The landform is one function — `valleyShape` — which the mesh, the scatter
placement and the character controller all read. It builds a floor, mountain
walls from ridged noise, a river channel with banks thrown up either side,
and then lets levelled ground win over all of it, because people flatten what
they use: the village strip, the shrine's terrace, the track east, and twelve
paddy terraces stepping down toward the river.

In it: a railway with seven hundred metres of sleepers, the halt she stepped
off at, a dirt road, six farmhouses with barns and sheds, utility poles, a
shrine up the slope with a gate, lanterns and a stone stair, cedar forest on
the valley sides, broadleaf along the river, boulders in the channel, rice
in the paddies, and a signpost at the track that says where the farm is.

Water is a PBR sheet with two normal maps scrolling across each other at
different speeds and angles — `src/world/Water.ts`. Babylon's `WaterMaterial`
renders the scene twice more for reflection and refraction, which is a lot to
spend before there is anything worth reflecting.

## Decisions worth knowing

**The valley overrides the graphics preset's draw distance.** Presets are
tuned for a city street where 260 m is further than you can see. Out here the
far wall is four hundred metres off and the whole point of the place is that
you can see it, so the region asks for 900 m and only lets a preset raise it.
Its fog density is its own too.

**The ground is a function, not a mesh, for the player.** Where a region has
a heightfield, the controller reads it directly: exact on any slope, at any
frame rate, impossible to tunnel through, and it costs two noise samples
instead of a swept collision test against a two-hundred-thousand-triangle
landscape every frame. Everything standing *on* the ground — the platform,
the road slabs, the shrine steps — is still ordinary collision. The
heightfield is only the floor beneath all of it.

**Light sources stay unlit, prefabs stay prefabs.** Both carried over from
Tokyo unchanged, which is the point of having built them that way.

## Three bugs worth recording

**Sinking through the road.** Pressing down with gravity's velocity every
frame is the obvious way to keep a character on the floor and it is wrong: at
a 100 ms frame that is a 0.37 m shove into the ground, the collider resolves
most but not all of it, and the millimetres left over accumulate until she is
ankle-deep in the street. Standing now reaches down a fixed 70 mm and, when
that finds floor, discards whatever the collider let slip rather than banking
it. Landing from a jump lifts clear and drops again, because a sweep that
starts outside the geometry resolves exactly and one that starts inside does
not.

**Falling through a valley.** The fixed probe that fixed the sinking broke
the countryside: at a sprint on a slope the ground drops further in one frame
than the probe reaches, so she was declared airborne every frame and
eventually fell through the terrain mesh entirely. That is what the analytic
ground floor is for.

**Roofs that floated over their houses.** The first `hipRoof` was built
outward from the ridge, so the eave line — the one measurement that has to be
right, because it is what rests on the wall head — came out wherever the
arithmetic left it. Rebuilt from the eaves inward.

## Verification

`npm run test:browser` now runs the whole journey in headless Chromium on the
WebGL2 fallback: Tokyo, then the interlude, then skipping it, then the valley
it lands in, then the Phase 1 proving ground. Thirty-five checks, including
that the interlude is its own region with its own camera, that it letterboxes
and narrates, that skipping it arrives in the valley, that the valley has
landscape and water, that it can be walked, and that the ground holds her up.
All pass.

## Not in this part

No farm, no farming, no supernatural encounter, no interiors, no NPCs in the
village. The track east has a signpost and no farm at the end of it yet —
that is the next piece.

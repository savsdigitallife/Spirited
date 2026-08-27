# Sandbox

Not part of the Nagori game build. Nothing here is imported by `/src`.

## `spirited/`

The original dependency-free browser prototype — a hand-rolled WebGL2 renderer,
tile-grid world builder, dialogue graph runner, chapter state machine, NPC
schedules, synthesised audio and a save system, with 34 headless tests.

It is kept for one reason: **it can validate data-driven design cheaply and
without a GPU.** Chapter graphs, dialogue conditions, NPC schedule collisions,
farming calendars, Cadence accrual curves and economy balance are all data, and
data tuned here ports to the Babylon project as JSON.

```bash
cd sandbox/spirited
npm test      # 34 tests, no browser needed
npm start     # http://localhost:8080
```

It is deliberately frozen as a rendering project. Nagori's renderer is Babylon.

// Turns an area's tile grid into a solid world: extruded blocks, sunken water,
// trees, fences, awnings, and a skirt around the edge so you never see out.
//
// Pure geometry — no GL calls — which keeps it unit-testable in node.

import { Geo, FLAG_WATER, FLAG_EMISSIVE, FLAG_SHORT } from './geometry.js';
import { TILE3D, isBlock, blockHeight, groundAt, WATER_BED } from './materials3d.js';
import { MATERIAL } from './textures.js';
import { makeRng } from '../core/rng.js';

const BLOCK_BASE = -0.8;      // blocks start below the water bed, so no gaps
const EDGE_DROP = -6;
const CUTAWAY_MIN = 1.4;      // taller than this can be faded away by the camera

export function buildAreaMesh(area) {
  const solid = new Geo();
  const rng = makeRng(`mesh:${area.id}`);

  const at = (x, z) => (x < 0 || z < 0 || x >= area.w || z >= area.h ? -1 : area.data[z * area.w + x]);
  const height = (x, z) => {
    const id = at(x, z);
    if (id < 0) return 6;                       // outside the map is a wall
    return isBlock(id) ? blockHeight(id) : 0;
  };
  const isSolidCorner = (x, z) => height(x, z) > 0.6;

  // Ambient occlusion for a floor corner: how many of the three tiles that
  // touch it are walls.
  const floorAo = (tx, tz, dx, dz) => {
    const x = tx + dx;
    const z = tz + dz;
    let n = 0;
    if (isSolidCorner(x - 1, z - 1)) n++;
    if (isSolidCorner(x, z - 1)) n++;
    if (isSolidCorner(x - 1, z)) n++;
    if (isSolidCorner(x, z)) n++;
    return 1 - Math.min(3, n) * 0.19;
  };

  for (let tz = 0; tz < area.h; tz++) {
    for (let tx = 0; tx < area.w; tx++) {
      const id = area.data[tz * area.w + tx];
      const def = TILE3D[id];
      if (!def) continue;
      const cx = tx + 0.5;
      const cz = tz + 0.5;
      const tileRng = makeRng(`t:${area.id}:${tx}:${tz}`);

      if (def.block !== undefined) {
        emitBlock(solid, area, tx, tz, def, at, height);
        continue;
      }

      // ---- ground ----
      const y = groundAt(id);
      if (def.water) {
        // Bed, then a surface pane a little below the bank.
        solid.box(cx, WATER_BED - 0.2, cz, 1, 0.2, 1, { top: MATERIAL.mud, side: MATERIAL.mud }, { faces: 0b000001, ao: 0.7 });
        const wl = MATERIAL[def.water];
        solid.quad(
          [[tx, y, tz], [tx, y, tz + 1], [tx + 1, y, tz + 1], [tx + 1, y, tz]],
          [0, 1, 0], [[tx, tz], [tx, tz + 1], [tx + 1, tz + 1], [tx + 1, tz]],
          wl, [1, 1, 1, 1], FLAG_WATER
        );
      } else {
        const layer = MATERIAL[def.floor] ?? MATERIAL.dirt;
        const flags = def.emissive ? FLAG_EMISSIVE : 0;
        solid.quad(
          [[tx, y, tz], [tx, y, tz + 1], [tx + 1, y, tz + 1], [tx + 1, y, tz]],
          [0, 1, 0],
          // World-space UVs so neighbouring tiles line up seamlessly.
          [[tx, tz], [tx, tz + 1], [tx + 1, tz + 1], [tx + 1, tz]],
          layer,
          [floorAo(tx, tz, 0, 0), floorAo(tx, tz, 0, 1), floorAo(tx, tz, 1, 1), floorAo(tx, tz, 1, 0)],
          flags
        );
      }

      // ---- banks: drop a wall wherever ground meets lower ground ----
      emitSkirt(solid, area, tx, tz, y, at, MATERIAL[def.floor] ?? MATERIAL.dirt);

      // ---- what grows here ----
      // Plants are real geometry rather than alpha-cut billboards: they cast
      // proper shadows and never dissolve into stipple at a distance.
      if (def.decor) {
        const n = def.density;
        const whole = Math.floor(n);
        const clumps = whole + (tileRng() < n - whole ? 1 : 0);
        for (let k = 0; k < clumps; k++) {
          emitPlant(solid, def.decor, tx + 0.2 + tileRng() * 0.6, y, tz + 0.2 + tileRng() * 0.6,
            tileRng, floorAo(tx, tz, 0, 0));
        }
      }
      if (def.tree) emitTree(solid, cx, cz, tileRng);
      if (def.bush) {
        solid.sphere(cx, 0.34, cz, 0.42 + tileRng() * 0.1, 0.34, 0.42, MATERIAL.foliage, { ao: 0.85, flags: FLAG_SHORT });
      }
      if (def.rock) {
        solid.sphere(cx, 0.16, cz, 0.42, 0.3 + tileRng() * 0.15, 0.4, MATERIAL.rock, { segments: 6, rings: 4, ao: 0.85, flags: FLAG_SHORT });
      }
      if (def.fence) emitFence(solid, area, tx, tz, at);
      if (def.rails) emitRails(solid, area, tx, tz, at);
      if (def.awning) emitAwning(solid, cx, cz);
    }
  }

  // A cliff around the whole map so the horizon is never a hole.
  emitEdge(solid, area);

  return { solid: solid.finish() };
}

/* ---------------------------------------------------------------- parts -- */

function emitBlock(geo, area, tx, tz, def, at, height) {
  const h = def.block;
  const top = h;
  let faces = 0b000001;                                   // top always
  const dirs = [[0, 1, 0b000100], [0, -1, 0b001000], [1, 0, 0b010000], [-1, 0, 0b100000]];
  for (const [dx, dz, bit] of dirs) {
    if (height(tx + dx, tz + dz) < h - 0.01) faces |= bit;
  }
  const layers = { top: MATERIAL[def.top], side: MATERIAL[def.side] };
  const flags = (def.emissive ? FLAG_EMISSIVE : 0) | (h < CUTAWAY_MIN ? FLAG_SHORT : 0);

  // Corner AO on the top face, from taller neighbours.
  let ao = 1;
  let neighbours = 0;
  for (const [dx, dz] of dirs) if (height(tx + dx, tz + dz) >= h - 0.01) neighbours++;
  ao = 1 - Math.min(2, Math.max(0, neighbours - 2)) * 0.08;

  geo.box(tx + 0.5, BLOCK_BASE, tz + 0.5, 1, top - BLOCK_BASE, 1, layers, { faces, ao, flags });
}

function emitSkirt(geo, area, tx, tz, y, at, layer) {
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  for (const [dx, dz] of dirs) {
    const nid = at(tx + dx, tz + dz);
    const ny = nid < 0 ? EDGE_DROP : groundAt(nid);
    if (ny >= y - 0.01) continue;
    const drop = nid < 0 ? EDGE_DROP : WATER_BED;
    const x0 = tx + (dx === 1 ? 1 : 0);
    const z0 = tz + (dz === 1 ? 1 : 0);
    const x1 = x0 + (dx === 0 ? 1 : 0);
    const z1 = z0 + (dz === 0 ? 1 : 0);
    const n = [dx, 0, dz];
    const h = y - drop;
    // Wind the quad so it faces the neighbour it drops toward.
    const p = dx + dz > 0
      ? [[x0, drop, z0], [x1, drop, z1], [x1, y, z1], [x0, y, z0]]
      : [[x1, drop, z1], [x0, drop, z0], [x0, y, z0], [x1, y, z1]];
    geo.quad(p, n, [[0, h], [1, h], [1, 0], [0, 0]], layer, [0.62, 0.62, 0.92, 0.92], 0);
  }
}

const PLANTS = {
  blade: { blades: 3, h: [0.22, 0.42], w: 0.055, layer: 'foliage', spread: 0.16 },
  rice: { blades: 3, h: [0.42, 0.68], w: 0.06, layer: 'meadow', spread: 0.13 },
  flowerTuft: { blades: 2, h: [0.3, 0.46], w: 0.05, layer: 'foliage', spread: 0.14, flower: true }
};

function emitPlant(geo, kind, x, y, z, rng, ao) {
  const cfg = PLANTS[kind] ?? PLANTS.blade;
  const layer = MATERIAL[cfg.layer];
  const layers = { top: layer, side: layer };
  for (let i = 0; i < cfg.blades; i++) {
    const bx = x + (rng() - 0.5) * cfg.spread * 2;
    const bz = z + (rng() - 0.5) * cfg.spread * 2;
    const h = cfg.h[0] + rng() * (cfg.h[1] - cfg.h[0]);
    geo.box(bx, y - 0.04, bz, cfg.w, h, cfg.w, layers,
      { ao, flags: FLAG_SHORT, rot: rng() * Math.PI, faces: 0b111101 });
    if (cfg.flower) {
      const petal = rng() < 0.5 ? MATERIAL.plaster : MATERIAL.carpet;
      geo.box(bx, y - 0.04 + h, bz, 0.1, 0.09, 0.1, { top: petal, side: petal },
        { ao: 1, flags: FLAG_SHORT, rot: rng() });
    }
  }
}

function emitTree(geo, cx, cz, rng) {
  const lean = (rng() - 0.5) * 0.18;
  const h = 2.2 + rng() * 1.6;
  const r = 0.85 + rng() * 0.45;
  geo.box(cx, 0, cz, 0.26, h, 0.26, { top: MATERIAL.bark, side: MATERIAL.bark }, { ao: 0.8, rot: rng() });
  const canopy = { segments: 7, rings: 5 };
  geo.sphere(cx + lean, h + r * 0.35, cz + lean, r, r * 0.82, r, MATERIAL.foliage, { ...canopy, ao: 1 });
  geo.sphere(cx - lean * 1.6, h + r * 0.1, cz + lean, r * 0.72, r * 0.6, r * 0.72, MATERIAL.foliage, { ...canopy, ao: 0.9 });
  geo.sphere(cx + lean, h + r * 0.95, cz - lean * 1.4, r * 0.6, r * 0.5, r * 0.6, MATERIAL.foliage, { ...canopy, ao: 1 });
}

function emitFence(geo, area, tx, tz, at) {
  const layers = { top: MATERIAL.plank, side: MATERIAL.plank };
  const opts = { ao: 0.9, flags: FLAG_SHORT };
  geo.box(tx + 0.5, 0, tz + 0.5, 0.16, 1.15, 0.16, layers, opts);
  const same = (dx, dz) => TILE3D[at(tx + dx, tz + dz)]?.fence;
  if (same(1, 0)) {
    geo.box(tx + 1, 0.9, tz + 0.5, 1, 0.1, 0.09, layers, opts);
    geo.box(tx + 1, 0.5, tz + 0.5, 1, 0.08, 0.09, layers, opts);
  }
  if (same(0, 1)) {
    geo.box(tx + 0.5, 0.9, tz + 1, 0.09, 0.1, 1, layers, opts);
    geo.box(tx + 0.5, 0.5, tz + 1, 0.09, 0.08, 1, layers, opts);
  }
}

function emitRails(geo, area, tx, tz, at) {
  const layers = { top: MATERIAL.metal, side: MATERIAL.metal };
  const wood = { top: MATERIAL.bark, side: MATERIAL.bark };
  const horizontal = TILE3D[at(tx - 1, tz)]?.rails || TILE3D[at(tx + 1, tz)]?.rails;
  const opts = { ao: 0.9, flags: FLAG_SHORT };
  if (horizontal) {
    geo.box(tx + 0.5, 0.06, tz + 0.5, 1, 0.06, 0.7, wood, opts);
    geo.box(tx + 0.5, 0.12, tz + 0.28, 1, 0.1, 0.08, layers, opts);
    geo.box(tx + 0.5, 0.12, tz + 0.72, 1, 0.1, 0.08, layers, opts);
  } else {
    geo.box(tx + 0.5, 0.06, tz + 0.5, 0.7, 0.06, 1, wood, opts);
    geo.box(tx + 0.28, 0.12, tz + 0.5, 0.08, 0.1, 1, layers, opts);
    geo.box(tx + 0.72, 0.12, tz + 0.5, 0.08, 0.1, 1, layers, opts);
  }
}

function emitAwning(geo, cx, cz) {
  const post = { top: MATERIAL.plank, side: MATERIAL.plank };
  for (const [dx, dz] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
    geo.box(cx + dx, 0, cz + dz, 0.11, 2.3, 0.11, post, { ao: 0.85 });
  }
  geo.box(cx, 2.3, cz, 1.15, 0.16, 1.15, { top: MATERIAL.roofTile, side: MATERIAL.roofTile }, { ao: 1 });
  geo.box(cx, 2.06, cz, 1.02, 0.24, 1.02, { top: MATERIAL.carpet, side: MATERIAL.carpet }, { ao: 0.9 });
}

function emitEdge(geo, area) {
  // Outdoors this is the cliff the valley sits in; indoors it is the rest of
  // the building, so the room is never a raft floating in the sky.
  const inside = area.indoors;
  const mat = inside ? MATERIAL.plaster : MATERIAL.cliff;
  const top = inside ? 5.5 : 0;
  const layers = { top: mat, side: mat };
  const opts = { ao: 0.6, faces: 0b111100 };
  const height = top - EDGE_DROP;
  geo.box(area.w / 2, EDGE_DROP, -0.5, area.w + 2, height, 1, layers, opts);
  geo.box(-0.5, EDGE_DROP, area.h / 2, 1, height, area.h + 2, layers, opts);
  geo.box(area.w + 0.5, EDGE_DROP, area.h / 2, 1, height, area.h + 2, layers, opts);
  // The south wall is the one the camera always sits behind, so indoors it is
  // simply left off — the fourth wall of a stage set.
  geo.box(area.w / 2, EDGE_DROP, area.h + 0.5, area.w + 2, inside ? -EDGE_DROP : height, 1, layers, opts);
}

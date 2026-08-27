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
        solid.sphere(cx, 0.34, cz, 0.42 + tileRng() * 0.1, 0.34, 0.42, MATERIAL.foliage,
          { ao: 0.85, flags: FLAG_SHORT, sway: 0.22, phase: tileRng() * 6.283 });
      }
      if (def.rock) {
        solid.sphere(cx, 0.16, cz, 0.42, 0.3 + tileRng() * 0.15, 0.4, MATERIAL.rock, { segments: 6, rings: 4, ao: 0.85, flags: FLAG_SHORT });
      }
      if (def.fence) emitFence(solid, area, tx, tz, at);
      if (def.rails) emitRails(solid, area, tx, tz, at);
      if (def.awning) emitAwning(solid, cx, cz);
    }
  }

  // The world keeps going past the last tile, so there is no edge to see.
  emitEdge(solid, area, rng);

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
  blade: { blades: 3, h: [0.22, 0.42], w: 0.055, layer: 'foliage', spread: 0.16, sway: 0.5 },
  rice: { blades: 3, h: [0.42, 0.68], w: 0.06, layer: 'meadow', spread: 0.13, sway: 0.8 },
  flowerTuft: { blades: 2, h: [0.3, 0.46], w: 0.05, layer: 'foliage', spread: 0.14, flower: true, sway: 0.6 }
};

function emitPlant(geo, kind, x, y, z, rng, ao) {
  const cfg = PLANTS[kind] ?? PLANTS.blade;
  const layer = MATERIAL[cfg.layer];
  const layers = { top: layer, side: layer };
  for (let i = 0; i < cfg.blades; i++) {
    const bx = x + (rng() - 0.5) * cfg.spread * 2;
    const bz = z + (rng() - 0.5) * cfg.spread * 2;
    const h = cfg.h[0] + rng() * (cfg.h[1] - cfg.h[0]);
    const phase = rng() * 6.283;
    geo.box(bx, y - 0.04, bz, cfg.w, h, cfg.w, layers,
      { ao, flags: FLAG_SHORT, rot: rng() * Math.PI, faces: 0b111101,
        sway: cfg.sway, phase });
    if (cfg.flower) {
      const petal = rng() < 0.5 ? MATERIAL.plaster : MATERIAL.carpet;
      geo.box(bx, y - 0.04 + h, bz, 0.1, 0.09, 0.1, { top: petal, side: petal },
        { ao: 1, flags: FLAG_SHORT, rot: rng(), sway: cfg.sway * 1.1, phase });
    }
  }
}

/**
 * A tree: tapered trunk, a few branches, a dark inner canopy so there are no
 * holes to see through, and a few hundred individual leaves scattered over the
 * shell. Every leaf carries its own wind phase, which is what makes a canopy
 * shimmer instead of wobbling as one lump.
 */
function emitTree(geo, cx, cz, rng) {
  const lean = (rng() - 0.5) * 0.2;
  const h = 2.3 + rng() * 1.7;
  const r = 0.95 + rng() * 0.5;
  const bark = { top: MATERIAL.bark, side: MATERIAL.bark };
  const trunkPhase = rng() * 6.283;

  geo.box(cx, -0.1, cz, 0.34, h * 0.55, 0.34, bark, { ao: 0.75, rot: rng() });
  geo.box(cx + lean * 0.4, h * 0.5, cz + lean * 0.3, 0.24, h * 0.55, 0.24, bark,
    { ao: 0.8, rot: rng(), sway: 0.1, phase: trunkPhase });

  const cy = h + r * 0.3;
  const ccx = cx + lean;
  const ccz = cz + lean;
  for (let b = 0; b < 3; b++) {
    const a = rng() * Math.PI * 2;
    geo.box(ccx + Math.cos(a) * r * 0.35, h * 0.82, ccz + Math.sin(a) * r * 0.35,
      r * 0.75, 0.12, 0.12, bark, { ao: 0.8, rot: a, sway: 0.14, phase: trunkPhase });
  }

  geo.sphere(ccx, cy, ccz, r * 0.74, r * 0.62, r * 0.74, MATERIAL.foliage,
    { segments: 8, rings: 6, ao: 0.7, sway: 0.16, phase: trunkPhase });

  const count = 230 + Math.floor(rng() * 70);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const y = 1 - t * 1.75;                       // fuller on top than underneath
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * golden + rng() * 0.4;
    const dir = [Math.cos(a) * rad, y, Math.sin(a) * rad];
    const spread = 0.82 + rng() * 0.28;
    geo.leaf(
      ccx + dir[0] * r * spread,
      cy + dir[1] * r * 0.82 * spread,
      ccz + dir[2] * r * spread,
      0.095 + rng() * 0.075,
      dir, rng() * Math.PI,
      rng() < 0.68 ? MATERIAL.leafA : MATERIAL.leafB,
      0.62 + rng() * 0.38 + y * 0.06,        // shading varies leaf to leaf
      0.5 + rng() * 0.4,
      rng() * 6.283
    );
  }
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

const APRON = 90;   // how far the ground keeps going past the last tile

/**
 * The world does not stop at the last tile.
 *
 * Outdoors, the ground continues in every direction until the fog takes it,
 * with a low ridge on the horizon for a silhouette — so there is never a
 * visible edge to fall off. Indoors, the map is wrapped in the rest of the
 * building instead.
 */
function emitEdge(geo, area, rng) {
  if (area.indoors) {
    const mat = MATERIAL.plaster;
    const layers = { top: mat, side: mat };
    const opts = { ao: 0.6, faces: 0b111100 };
    const height = 5.5 - EDGE_DROP;
    geo.box(area.w / 2, EDGE_DROP, -0.5, area.w + 2, height, 1, layers, opts);
    geo.box(-0.5, EDGE_DROP, area.h / 2, 1, height, area.h + 2, layers, opts);
    geo.box(area.w + 0.5, EDGE_DROP, area.h / 2, 1, height, area.h + 2, layers, opts);
    // The camera always sits south of Aiko, so that wall is never needed.
    geo.box(area.w / 2, EDGE_DROP, area.h + 0.5, area.w + 2, -EDGE_DROP, 1, layers, opts);
    return;
  }

  const ground = MATERIAL[area.apron ?? 'grass'];
  const layers = { top: ground, side: ground };
  const strip = { ao: 0.9, faces: 0b000001 };     // a floor, nothing else
  // Four aprons around the map, meeting at the corners.
  geo.box(area.w / 2, -0.02, -APRON / 2, area.w + APRON * 2, 0.02, APRON, layers, strip);
  geo.box(area.w / 2, -0.02, area.h + APRON / 2, area.w + APRON * 2, 0.02, APRON, layers, strip);
  geo.box(-APRON / 2, -0.02, area.h / 2, APRON, 0.02, area.h, layers, strip);
  geo.box(area.w + APRON / 2, -0.02, area.h / 2, APRON, 0.02, area.h, layers, strip);

  // A ridge on the horizon, far enough out to read as distance.
  const skyline = area.skyline ?? 'hills';
  const ring = Math.max(area.w, area.h) * 0.5 + 34;
  const cx = area.w / 2;
  const cz = area.h / 2;
  const count = skyline === 'towers' ? 64 : 46;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng() * 0.05;
    const dist = ring + rng() * 22;
    const x = cx + Math.cos(a) * dist;
    const z = cz + Math.sin(a) * dist;
    if (skyline === 'towers') {
      const h = 12 + rng() * 34;
      geo.box(x, -1, z, 6 + rng() * 8, h, 6 + rng() * 8,
        { top: MATERIAL.building, side: MATERIAL.windowGlass }, { ao: 0.85, rot: rng() });
    } else {
      const h = 6 + rng() * 14;
      geo.sphere(x, -h * 0.35, z, 16 + rng() * 16, h, 14 + rng() * 14,
        MATERIAL[skyline === 'forest' ? 'foliage' : 'moss'], { segments: 7, rings: 4, ao: 0.8 });
    }
  }
}

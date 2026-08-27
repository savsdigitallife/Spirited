import { TOKYO_AREAS } from './areas/tokyo.js';
import { COUNTRY_AREAS } from './areas/country.js';
import { FARM_AREAS } from './areas/farm.js';
import { SPIRIT_AREAS } from './areas/spirit.js';
import { tileAt } from './mapbuilder.js';
import { TILE_SIZE, isSolidTile, TILES } from './tiles.js';

export const AREAS = { ...TOKYO_AREAS, ...COUNTRY_AREAS, ...FARM_AREAS, ...SPIRIT_AREAS };

export function getArea(id) {
  const area = AREAS[id];
  if (!area) throw new Error(`unknown area: ${id}`);
  return area;
}

export function areaList() {
  return Object.values(AREAS);
}

/**
 * Static sanity pass over the whole world. Run by the test suite so a
 * mistyped coordinate becomes a failing test instead of a wall Aiko is
 * standing inside of.
 */
export function validateWorld() {
  const problems = [];
  for (const area of areaList()) {
    const at = (px, py) => tileAt(area, Math.floor(px / TILE_SIZE), Math.floor(py / TILE_SIZE));

    for (const portal of area.portals) {
      if (!AREAS[portal.to.area]) {
        problems.push(`${area.id}: portal points at unknown area "${portal.to.area}"`);
        continue;
      }
      const dest = AREAS[portal.to.area];
      const dtile = tileAt(dest, Math.floor(portal.to.x / TILE_SIZE), Math.floor(portal.to.y / TILE_SIZE));
      if (isSolidTile(dtile)) {
        problems.push(`${area.id} -> ${dest.id}: lands inside solid "${TILES[dtile].name}" at ${portal.to.x},${portal.to.y}`);
      }
      // The portal's own footprint has to be reachable.
      let walkable = false;
      for (let y = portal.ty; y < portal.ty + portal.th; y++) {
        for (let x = portal.tx; x < portal.tx + portal.tw; x++) {
          if (!isSolidTile(tileAt(area, x, y))) walkable = true;
        }
      }
      if (!walkable) problems.push(`${area.id}: portal "${portal.label ?? ''}" sits entirely in solid tiles`);
    }

    for (const npc of area.npcs) {
      if (isSolidTile(at(npc.x, npc.y))) {
        problems.push(`${area.id}: npc "${npc.id}" stands in a solid tile`);
      }
    }

    // Interactable props must be reachable from at least one side.
    for (const prop of area.props.filter((p) => p.script)) {
      const tx = Math.floor(prop.x / TILE_SIZE);
      const ty = Math.floor(prop.y / TILE_SIZE);
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .some(([dx, dy]) => !isSolidTile(tileAt(area, tx + dx, ty + dy)));
      if (!open) problems.push(`${area.id}: prop "${prop.id}" is walled in on all four sides`);
    }
  }
  return problems;
}

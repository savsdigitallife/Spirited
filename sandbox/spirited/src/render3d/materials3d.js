// How each 2D tile becomes 3D: what it is made of, how tall it stands, and
// what grows on it. The gameplay grid is unchanged — this is only its body.

import { T } from '../world/tiles.js';

const BY_NAME = {
  grass:      { floor: 'grass',      decor: 'blade', density: 0.5 },
  tallgrass:  { floor: 'meadow',     decor: 'blade', density: 1.4 },
  dirt:       { floor: 'dirt' },
  road:       { floor: 'asphalt' },
  sidewalk:   { floor: 'concrete',   lift: 0.12 },
  crosswalk:  { floor: 'crosswalk' },
  water:      { water: 'water',      depth: 0.34 },
  shallow:    { water: 'water',      depth: 0.14 },
  wood:       { floor: 'plank' },
  tatami:     { floor: 'tatami' },
  carpet:     { floor: 'carpet' },
  wall:       { block: 2.7, side: 'plaster', top: 'plaster' },
  facade:     { block: 6.5, side: 'building', top: 'concrete' },
  window:     { block: 6.5, side: 'windowGlass', top: 'concrete', emissive: 0.5 },
  tree:       { floor: 'grass', tree: true },
  bush:       { floor: 'grass', bush: true },
  rock:       { floor: 'dirt', rock: true },
  paddy:      { water: 'paddyWater', depth: 0.2, decor: 'rice', density: 1 },
  bank:       { floor: 'dirt' },
  stone:      { floor: 'stone' },
  tunnel:     { floor: 'rock' },
  tunnelwall: { block: 3.6, side: 'cliff', top: 'cliff' },
  platform:   { floor: 'concrete', lift: 0.3 },
  rail:       { floor: 'gravel', rails: true },
  bridge:     { floor: 'deck', lift: 0.06 },
  counter:    { block: 1.0, side: 'plank', top: 'plank' },
  stallroof:  { floor: 'stone', awning: true },
  grate:      { floor: 'grate', emissive: 0.9 },
  gravel:     { floor: 'gravel' },
  marsh:      { water: 'marshWater', depth: 0.12, decor: 'blade', density: 1.1 },
  flowers:    { floor: 'grass', decor: 'flowerTuft', density: 1.5 },
  bathtile:   { floor: 'bathTile' },
  bathwater:  { water: 'greenWater', depth: 0.26, steam: true },
  fence:      { floor: 'dirt', fence: true },
  shoji:      { block: 2.7, side: 'shoji', top: 'plank', emissive: 0.22 },
  cliff:      { block: 4.2, side: 'cliff', top: 'cliff' },
  moss:       { floor: 'moss', decor: 'blade', density: 0.35 },
  ash:        { floor: 'ash' },
  railwater:  { water: 'water', depth: 0.18 },
  lacquer:    { floor: 'lacquer' },
  tower:      { block: 15, side: 'building', top: 'concrete' },
  towerlit:   { block: 15, side: 'windowGlass', top: 'concrete', emissive: 0.55 },
  void:       { block: 6.0, side: 'cliff', top: 'cliff' }
};

export const TILE3D = [];
for (const [name, id] of Object.entries(T)) TILE3D[id] = { name, ...BY_NAME[name] };

export function isBlock(id) {
  return TILE3D[id]?.block !== undefined;
}

export function blockHeight(id) {
  return TILE3D[id]?.block ?? 0;
}

/** Ground level of a tile: raised pavements, sunken water. */
export function groundAt(id) {
  const def = TILE3D[id];
  if (!def) return 0;
  if (def.water) return -def.depth;
  return def.lift ?? 0;
}

export const WATER_BED = -0.75;

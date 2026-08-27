// Tile registry. `kind` drives how the renderer decorates a tile; `solid`
// drives collision; `slow` drags Aiko's feet (mud, shallow water, deep snow
// of ash). Ids are assigned by declaration order and referenced by name.

const DEFS = [
  ['void',      { solid: true,  base: '#05060a', kind: 'flat' }],
  ['grass',     { solid: false, base: '#3f6b3a', kind: 'grass', accent: '#4e8144' }],
  ['tallgrass', { solid: false, base: '#37602f', kind: 'tall', accent: '#57904a' }],
  ['dirt',      { solid: false, base: '#7a6244', kind: 'grit', accent: '#8d7351' }],
  ['road',      { solid: false, base: '#2e2f36', kind: 'road', accent: '#43444d' }],
  ['sidewalk',  { solid: false, base: '#83807a', kind: 'panel', accent: '#948f88' }],
  ['crosswalk', { solid: false, base: '#2e2f36', kind: 'stripe', accent: '#d6d2c4' }],
  ['water',     { solid: true,  base: '#22496e', kind: 'water', accent: '#3a6d99' }],
  ['shallow',   { solid: false, base: '#376b8c', kind: 'water', accent: '#5f9bbd', slow: 0.62 }],
  ['wood',      { solid: false, base: '#6b4b31', kind: 'plank', accent: '#7c5a3c' }],
  ['tatami',    { solid: false, base: '#a89a63', kind: 'tatami', accent: '#b9ab73' }],
  ['carpet',    { solid: false, base: '#7a2130', kind: 'panel', accent: '#8d2b3c' }],
  ['wall',      { solid: true,  base: '#4a4038', kind: 'wall', accent: '#5b5044' }],
  ['facade',    { solid: true,  base: '#39404f', kind: 'facade', accent: '#4d5566' }],
  ['window',    { solid: true,  base: '#2b3040', kind: 'window', accent: '#e2c469' }],
  ['tree',      { solid: true,  base: '#2c4a2a', kind: 'tree', accent: '#1f3a20' }],
  ['bush',      { solid: true,  base: '#37602f', kind: 'bush', accent: '#4a7a3c' }],
  ['rock',      { solid: true,  base: '#5c5a56', kind: 'rock', accent: '#726f6a' }],
  ['paddy',     { solid: true,  base: '#4d6b52', kind: 'paddy', accent: '#7fa06a' }],
  ['bank',      { solid: false, base: '#6f6146', kind: 'grit', accent: '#82724f' }],
  ['stone',     { solid: false, base: '#5d5b57', kind: 'panel', accent: '#6c6a65' }],
  ['tunnel',    { solid: false, base: '#2a2620', kind: 'grit', accent: '#332e26' }],
  ['tunnelwall',{ solid: true,  base: '#181510', kind: 'wall', accent: '#221d16' }],
  ['platform',  { solid: false, base: '#8a8681', kind: 'panel', accent: '#9a968f' }],
  ['rail',      { solid: true,  base: '#3a352e', kind: 'rail', accent: '#877f6d' }],
  ['bridge',    { solid: false, base: '#7d4a3a', kind: 'plank', accent: '#8f5744' }],
  ['counter',   { solid: true,  base: '#8a5a34', kind: 'plank', accent: '#a06a3e' }],
  ['stallroof', { solid: true,  base: '#8d2f2c', kind: 'roof', accent: '#a83a35' }],
  ['grate',     { solid: false, base: '#332a22', kind: 'grate', accent: '#c25a24' }],
  ['gravel',    { solid: false, base: '#7f7a6e', kind: 'grit', accent: '#8f8a7c' }],
  ['marsh',     { solid: false, base: '#3f5a52', kind: 'water', accent: '#5d7f70', slow: 0.55 }],
  ['flowers',   { solid: false, base: '#3f6b3a', kind: 'flowers', accent: '#e6d089' }],
  ['bathtile',  { solid: false, base: '#5b6b70', kind: 'panel', accent: '#728388' }],
  ['bathwater', { solid: true,  base: '#2e6b6b', kind: 'water', accent: '#59a0a0' }],
  ['fence',     { solid: true,  base: '#6b5638', kind: 'fence', accent: '#8a7048' }],
  ['shoji',     { solid: true,  base: '#c8bda0', kind: 'shoji', accent: '#8a7c60' }],
  ['cliff',     { solid: true,  base: '#4a443c', kind: 'cliff', accent: '#5d564b' }],
  ['moss',      { solid: false, base: '#37533a', kind: 'grass', accent: '#486b48' }],
  ['ash',       { solid: false, base: '#4a453f', kind: 'grit', accent: '#5b554d', slow: 0.8 }],
  ['railwater', { solid: false, base: '#3b6f86', kind: 'water', accent: '#6fb0c4', slow: 0.9 }],
  ['lacquer',   { solid: false, base: '#43202a', kind: 'panel', accent: '#5a2c38' }],
  ['tower',     { solid: true,  base: '#2f3540', kind: 'facade', accent: '#414a5a' }],
  ['towerlit',  { solid: true,  base: '#2b323c', kind: 'window', accent: '#e8d089' }]
];

export const TILES = DEFS.map(([name, def], id) => ({ id, name, ...def }));
export const T = Object.fromEntries(DEFS.map(([name], id) => [name, id]));

export const TILE_SIZE = 32;

export function tileDef(id) {
  return TILES[id] ?? TILES[0];
}

export function isSolidTile(id) {
  return tileDef(id).solid === true;
}

export function tileSpeed(id) {
  return tileDef(id).slow ?? 1;
}

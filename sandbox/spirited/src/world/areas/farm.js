// The reason she came. A walled garden, a woodshed, a coop, and a house that
// has been empty for eleven years.

import { makeArea, tp } from '../mapbuilder.js';
import { T } from '../tiles.js';

const PAL = {
  ren:    { skin: '#d9ac82', hair: '#2f2620', cloth: '#3f6f74', trim: '#cfe4e6' },
  tsuda:  { skin: '#c99a6e', hair: '#9a9186', cloth: '#5c6b4a', trim: '#b0a68e' },
  yuzuki: { skin: '#efe0cf', hair: '#c9b17a', cloth: '#6a2740', trim: '#d9b45a' },
  cat:    { skin: '#3a332c', hair: '#3a332c', cloth: '#4a4038', trim: '#e6d089' },
  hen:    { skin: '#d8d2c4', hair: '#c25a3a', cloth: '#d8d2c4', trim: '#e0b040' },
  goat:   { skin: '#cfc7b4', hair: '#8a8070', cloth: '#cfc7b4', trim: '#3a332c' }
};

/* ------------------------------------------------------------- the farm -- */

export const farm = makeArea('farm', {
  name: 'Your Farm — Kaminohara',
  region: 'country',
  w: 44, h: 38,
  fill: T.grass,
  music: 'farm',
  tint: 'afternoon',
  weather: 'leaves',
  wind: 'gusty',
  apron: 'meadow',
  skyline: 'hills',
  build(d, rng) {
    // The lane in from the paddy road, along the south edge.
    d.fill(0, 33, 44, 3, T.dirt);
    d.fill(18, 28, 4, 6, T.dirt);          // the drive up to the gate
    d.fill(18, 27, 4, 1, T.gravel);

    // The house: earth walls, wooden floor, a door onto the yard.
    d.fill(13, 8, 15, 11, T.wall);
    d.fill(14, 9, 13, 9, T.wood);
    d.fill(19, 18, 2, 1, T.wood);          // doorway
    d.fill(16, 19, 9, 4, T.gravel);        // the yard in front of it

    // The walled garden: four raised beds and paths between them.
    d.fill(4, 4, 8, 16, T.dirt);
    for (const [bx, by] of [[5, 5], [5, 12], [8, 5], [8, 12]]) {
      d.fill(bx, by, 3, 6, T.bank);
    }
    d.outline(3, 3, 10, 18, T.fence);
    d.set(8, 20, T.dirt);                  // the way in

    // Woodshed and the well.
    d.fill(31, 10, 5, 4, T.wall);
    d.fill(32, 11, 3, 2, T.dirt);
    d.fill(33, 14, 1, 1, T.dirt);

    // Where the coop will go, once she builds it.
    d.fill(30, 20, 7, 6, T.dirt);
    d.outline(29, 19, 9, 8, T.fence);
    d.set(33, 27, T.dirt);

    // The water channel down from the hill, and the sluice.
    for (let y = 0; y < 30; y++) d.set(23 + Math.round(Math.sin(y * 0.4) * 1.4), y, T.shallow);
    d.fill(22, 30, 4, 1, T.stone);

    d.scatter(rng, T.tree, 26, [T.grass]);
    d.scatter(rng, T.tallgrass, 60, [T.grass]);
    d.scatter(rng, T.flowers, 30, [T.grass]);
    d.scatter(rng, T.bush, 14, [T.grass]);
    d.fill(0, 33, 44, 3, T.dirt);
    d.fill(18, 28, 4, 6, T.dirt);
    return d;
  },
  npcs: [
    { id: 'farmren', name: 'Ren', ...tp(24, 30), dir: 'up', palette: PAL.ren, script: 'farmRen',
      showIf: { atLeast: 'water' }, life: 'work' },
    { id: 'farmcat', name: 'A Grey Cat', ...tp(33, 15), dir: 'left', palette: PAL.cat, kind: 'cat',
      script: 'strayCat', life: 'cat' },
    { id: 'hen1', name: 'Hen', ...tp(32, 22), dir: 'down', palette: PAL.hen, kind: 'hen', script: 'hen',
      showIf: { atLeast: 'storm' }, life: 'peck' },
    { id: 'hen2', name: 'Hen', ...tp(34, 23), dir: 'left', palette: PAL.hen, kind: 'hen', script: 'hen',
      showIf: { atLeast: 'storm' }, life: 'peck' },
    { id: 'hen3', name: 'Hen', ...tp(35, 21), dir: 'right', palette: PAL.hen, kind: 'hen', script: 'hen',
      showIf: { atLeast: 'storm' }, life: 'peck' },
    { id: 'goat', name: 'The Goat', ...tp(31, 24), dir: 'down', palette: PAL.goat, kind: 'goat',
      script: 'goat', showIf: { atLeast: 'storm' }, life: 'graze' }
  ],
  props: [
    { id: 'gate', type: 'gate', ...tp(20, 27), solid: true, script: 'farmGate' },
    { id: 'brambles', type: 'brambles', ...tp(6, 8), solid: true, script: 'brambles',
      hideIf: { flag: 'clearedBrambles' } },
    { id: 'stones', type: 'stonepile', ...tp(9, 14), solid: true, script: 'gardenStones',
      hideIf: { flag: 'clearedStones' } },
    { id: 'brokenfence', type: 'brokenfence', ...tp(3, 12), script: 'brokenFence',
      hideIf: { flag: 'mendedFence' } },
    { id: 'bed1', type: 'seedbed', ...tp(6, 7), script: 'seedBed' },
    { id: 'bed2', type: 'seedbed', ...tp(6, 14), script: 'seedBed' },
    { id: 'bed3', type: 'seedbed', ...tp(9, 7), script: 'seedBed' },
    { id: 'bed4', type: 'seedbed', ...tp(9, 14), script: 'seedBed' },
    { id: 'sluice', type: 'sluice', ...tp(24, 30), solid: true, script: 'sluice' },
    { id: 'coop', type: 'coop', ...tp(33, 22), solid: true, script: 'coop',
      showIf: { atLeast: 'storm' } },
    { id: 'coopsite', type: 'timber', ...tp(33, 22), script: 'coopSite',
      showIf: [{ atLeast: 'animals' }, { before: 'storm' }] },
    { id: 'farmwell', type: 'well', ...tp(29, 15), solid: true, script: 'farmWell' },
    { id: 'woodshed', type: 'logpile', ...tp(33, 12), solid: true, script: 'woodshed' },
    { id: 'toolrack', type: 'tools', ...tp(17, 20), solid: true, script: 'toolRack' },
    { id: 'washline', type: 'washline', ...tp(26, 20), script: 'washLine' },
    { id: 'lanternF', type: 'lantern', ...tp(21, 24) },
    { id: 'signF', type: 'sign', ...tp(17, 27), script: 'farmSign' }
  ],
  portals: [
    {
      tx: 0, ty: 33, tw: 1, th: 3,
      to: { area: 'paddyroad', x: tp(47, 27).x, y: tp(47, 27).y, dir: 'left' },
      label: 'The lane back to the paddy road'
    },
    {
      tx: 19, ty: 18, tw: 2, th: 1,
      to: { area: 'farmhouse', x: tp(11, 13).x, y: tp(11, 13).y, dir: 'up' },
      label: 'Into the house',
      cond: { atLeast: 'clearGround' },
      denyText: 'The door is locked, and the key is on Yuzuki\'s ring.'
    }
  ],
  triggers: [
    {
      id: 'stormPassed',
      tx: 16, ty: 19, tw: 9, th: 4,
      once: true,
      cond: [{ chapter: 'storm' }, { flag: 'animalsIn' }],
      fx: [
        { type: 'chapter', id: 'harvest' },
        { type: 'journal', text: 'The storm went through in the night. Everything is still standing.' },
        { type: 'toast', text: 'Morning. The wind has gone. Go and see what survived.' },
        { type: 'sfx', id: 'chapter' }
      ]
    },
    {
      id: 'firstSight',
      tx: 16, ty: 24, tw: 10, th: 4,
      once: true,
      fx: [
        { type: 'journal', text: 'The farm: one house, one shed, a walled garden full of bramble.' },
        { type: 'toast', text: 'Eleven years empty. The photographs did not show the brambles.' }
      ]
    }
  ]
});

/* -------------------------------------------------------- the farmhouse -- */

export const farmhouse = makeArea('farmhouse', {
  name: 'The Farmhouse',
  region: 'country',
  w: 22, h: 15,
  fill: T.wood,
  indoors: true,
  music: 'farm',
  tint: 'lamplight',
  build(d) {
    d.border(T.wall, 1);
    // A tatami room to sleep in, screened off from the rest.
    d.fill(1, 1, 8, 7, T.tatami);
    d.vline(1, 7, 9, T.shoji);
    d.set(9, 6, T.tatami);
    // The kitchen: stone floor along the north-east wall.
    d.fill(13, 1, 8, 5, T.stone);
    d.hline(13, 20, 1, T.counter);
    // The bath, bottom left, tiled.
    d.fill(1, 10, 5, 4, T.bathtile);
    d.hline(1, 5, 9, T.wall);
    d.set(3, 9, T.bathtile);
    // The hearth room, and the step down to the door.
    d.fill(11, 8, 4, 4, T.grate);
    d.fill(10, 13, 4, 1, T.stone);
    d.set(11, 14, T.stone);
    d.set(12, 14, T.stone);
    return d;
  },
  npcs: [],
  props: [
    // Kitchen.
    { id: 'stove', type: 'stove', ...tp(14, 2), solid: true, script: 'stove' },
    { id: 'sink', type: 'sink', ...tp(16, 2), solid: true, script: 'sink' },
    { id: 'fridge', type: 'fridge', ...tp(19, 2), solid: true, script: 'fridge' },
    { id: 'ricepot', type: 'kettle', ...tp(18, 4), solid: true, script: 'ricePot' },
    { id: 'kitchenshelf', type: 'shelf', ...tp(20, 4), solid: true, script: 'kitchenShelf' },
    { id: 'kitchentable', type: 'table', ...tp(16, 5), solid: true, script: 'kitchenTable' },
    // Sleeping room.
    { id: 'futonF', type: 'futon', ...tp(4, 4), script: 'farmFuton' },
    { id: 'chest', type: 'chest', ...tp(2, 1), solid: true, script: 'chest' },
    { id: 'lampF2', type: 'lantern', ...tp(7, 2) },
    // Hearth room.
    { id: 'hearth', type: 'hearth', ...tp(12, 9), solid: true, script: 'hearth' },
    { id: 'lowtable', type: 'table', ...tp(16, 9), solid: true, script: 'lowTable' },
    { id: 'radio', type: 'radio', ...tp(19, 9), solid: true, script: 'radio' },
    // Bath.
    { id: 'tub', type: 'tub', ...tp(3, 12), solid: true, script: 'tub' },
    { id: 'washbasin', type: 'sink', ...tp(5, 11), solid: true, script: 'washbasin' },
    // Odds and ends.
    { id: 'boots', type: 'shoes', ...tp(12, 13), script: 'bootsByDoor' },
    { id: 'calendar', type: 'sign', ...tp(15, 8), script: 'calendar' }
  ],
  portals: [
    {
      tx: 11, ty: 14, tw: 2, th: 1,
      to: { area: 'farm', x: tp(20, 20).x, y: tp(20, 20).y, dir: 'down' },
      label: 'Out to the yard'
    }
  ]
});

export const FARM_AREAS = { farm, farmhouse };

// Act I. Tokyo is small, loud, and about to be left behind.

import { makeArea, tp } from '../mapbuilder.js';
import { T } from '../tiles.js';

const PAL = {
  aiko: { skin: '#e9bd95', hair: '#241c18', cloth: '#c84a5e', trim: '#f2e8d6' },
  mom:  { skin: '#e7bb95', hair: '#3b2a22', cloth: '#6f80a6', trim: '#dcd3c2' },
  dad:  { skin: '#dfb188', hair: '#2b2320', cloth: '#4d5c4e', trim: '#c9c2b0' },
  mei:  { skin: '#e2b28a', hair: '#4b3022', cloth: '#dfae3c', trim: '#4c6b58' },
  suit: { skin: '#dcae86', hair: '#1e1a17', cloth: '#2f3440', trim: '#b9b2a4' },
  gran: { skin: '#d9b294', hair: '#b8b2a6', cloth: '#7a5f6d', trim: '#e2d8c6' },
  kid:  { skin: '#e6bb92', hair: '#2e2620', cloth: '#4f8a7a', trim: '#e8e0cc' }
};

/* ------------------------------------------------------------ the flat -- */

export const flat = makeArea('flat', {
  name: 'Nakazato Flat 4C',
  region: 'tokyo',
  w: 22, h: 15,
  fill: T.wood,
  indoors: true,
  music: 'home',
  tint: 'neonroom',
  build(d) {
    d.border(T.wall, 1);
    // Aiko's room: tatami, walled off by a paper screen with a gap at y=6.
    d.fill(1, 1, 7, 7, T.tatami);
    d.vline(1, 7, 8, T.shoji);
    d.set(8, 6, T.tatami);
    d.set(8, 5, T.tatami);
    // Kitchen counter along the top right.
    d.hline(12, 20, 1, T.counter);
    d.set(12, 2, T.counter);
    // Bathroom, bottom left, tiled.
    d.fill(1, 10, 5, 4, T.bathtile);
    d.hline(1, 5, 9, T.wall);
    d.set(3, 9, T.bathtile);
    // Genkan: the step down to the front door.
    d.fill(9, 12, 4, 2, T.stone);
    d.set(10, 14, T.stone);
    d.set(11, 14, T.stone);
    // Balcony window wall, right edge.
    d.vline(3, 9, 21, T.window);
    return d;
  },
  npcs: [
    { id: 'mom', name: 'Mom', ...tp(15, 4), dir: 'down', palette: PAL.mom, script: 'mom' },
    { id: 'dad', name: 'Dad', ...tp(17, 9), dir: 'left', palette: PAL.dad, script: 'dad' }
  ],
  props: [
    { id: 'boxes1', type: 'boxes', ...tp(13, 7), solid: true, script: 'boxes' },
    { id: 'boxes2', type: 'boxes', ...tp(14, 10), solid: true, script: 'boxes' },
    { id: 'boxes3', type: 'boxes', ...tp(19, 6), solid: true, script: 'boxes' },
    { id: 'satchel', type: 'satchel', ...tp(3, 3), script: 'satchelProp', hideIf: { has: 'satchel' } },
    { id: 'futon', type: 'futon', ...tp(5, 5), script: 'futon' },
    { id: 'shelf', type: 'shelf', ...tp(2, 1), solid: true, script: 'shelf' },
    { id: 'balcony', type: 'plant', ...tp(20, 11), script: 'balcony' },
    { id: 'shoes', type: 'shoes', ...tp(11, 12), script: 'shoes' }
  ],
  portals: [
    {
      tx: 10, ty: 14, tw: 2, th: 1,
      to: { area: 'street', x: tp(11, 16).x, y: tp(11, 16).y, dir: 'down' },
      label: 'Front door',
      cond: { flag: 'readyToGo' },
      denyText: 'Mom, from the kitchen: "Not one step until you\'ve got your bag, {name}."'
    }
  ]
});

/* --------------------------------------------------------- the crossing -- */

export const street = makeArea('street', {
  wind: 'storm',
  name: 'Sakuragaoka Crossing',
  region: 'tokyo',
  w: 56, h: 40,
  fill: T.facade,
  music: 'town',
  tint: 'neon',
  weather: 'rain',
  build(d, rng) {
    // The block is solid to start with; the streets are cut out of it.
    d.fill(0, 15, 56, 2, T.sidewalk);
    d.fill(0, 23, 56, 2, T.sidewalk);
    d.fill(22, 0, 2, 40, T.sidewalk);
    d.fill(30, 0, 2, 40, T.sidewalk);
    d.fill(0, 17, 56, 6, T.road);
    d.fill(24, 0, 6, 40, T.road);

    for (let i = 0; i < 6; i++) {         // crossings at all four approaches
      d.set(24 + i, 16, T.crosswalk);
      d.set(24 + i, 23, T.crosswalk);
      d.set(23, 17 + i, T.crosswalk);
      d.set(30, 17 + i, T.crosswalk);
    }

    // Windows wherever a building faces a street.
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 56; x++) {
        if (d.get(x, y) !== T.facade) continue;
        const facing = [[0, 1], [0, -1], [1, 0], [-1, 0]]
          .some(([dx, dy]) => [T.sidewalk, T.road].includes(d.get(x + dx, y + dy)));
        if (facing && (x + y) % 3 === 0) d.set(x, y, T.window);
      }
    }

    // Her building: an apron and a door onto the north pavement.
    d.fill(9, 13, 4, 2, T.stone);
    d.set(10, 12, T.stone);
    d.set(11, 12, T.stone);

    // The shrine lot, walled off from the offices behind it.
    d.fill(34, 2, 20, 12, T.gravel);
    d.fill(43, 4, 3, 3, T.wood);
    d.outline(33, 1, 22, 14, T.fence);
    d.set(44, 14, T.gravel);
    d.set(45, 14, T.gravel);
    d.scatter(rng, T.tree, 9, [T.gravel]);
    d.scatter(rng, T.bush, 6, [T.gravel]);

    // Shop awnings along the south pavement.
    for (const x of [3, 9, 15]) d.fill(x, 25, 4, 1, T.stallroof);

    // The alley down to the station stairs.
    d.fill(18, 25, 3, 15, T.stone);
    return d;
  },
  npcs: [
    { id: 'mei', name: 'Mei', ...tp(44, 9), dir: 'down', palette: PAL.mei, script: 'mei' },
    { id: 'keeper', name: 'Shrine Keeper', ...tp(41, 5), dir: 'down', palette: PAL.gran, script: 'keeper' },
    { id: 'salaryman', name: 'Man in a Hurry', ...tp(33, 20), dir: 'left', palette: PAL.suit, script: 'salaryman', wander: 3 },
    { id: 'grocer', name: 'Grocer', ...tp(6, 24), dir: 'down', palette: PAL.gran, script: 'grocer' },
    { id: 'boy', name: 'Boy with a Net', ...tp(19, 30), dir: 'right', palette: PAL.kid, script: 'boy', wander: 2 },
    { id: 'cat', name: 'Alley Cat', ...tp(19, 36), dir: 'left', palette: { skin: '#2a2622', hair: '#2a2622', cloth: '#3a352f', trim: '#e6d089' }, kind: 'cat', script: 'cat', wander: 2 }
  ],
  props: [
    { id: 'vending', type: 'vending', ...tp(14, 24), solid: true, script: 'vending' },
    { id: 'torii', type: 'torii', ...tp(44, 12), script: 'torii' },
    { id: 'fox1', type: 'fox', ...tp(42, 8), solid: true, script: 'foxStatue' },
    { id: 'fox2', type: 'fox', ...tp(46, 8), solid: true, script: 'foxStatue' },
    { id: 'sign', type: 'sign', ...tp(32, 24), script: 'streetSign' },
    { id: 'car', type: 'car', ...tp(12, 16), solid: true, script: 'movingVan' },
    { id: 'bench', type: 'bench', ...tp(36, 15), solid: true, script: 'bench' },
    { id: 'lamp1', type: 'streetlamp', ...tp(23, 15), solid: true },
    { id: 'lamp2', type: 'streetlamp', ...tp(31, 25), solid: true },
    { id: 'lamp3', type: 'streetlamp', ...tp(23, 30), solid: true },
    { id: 'neon0', type: 'neon', ...tp(3, 15), color: '#ff2fa0' },
    { id: 'neon1', type: 'neon', ...tp(7, 15), color: '#22e8ff', steady: true },
    { id: 'neon2', type: 'neon', ...tp(11, 15), color: '#ff8a1e', steady: true },
    { id: 'neon3', type: 'neon', ...tp(16, 15), color: '#a24bff' },
    { id: 'neon4', type: 'neon', ...tp(19, 15), color: '#3dff88', steady: true },
    { id: 'neon5', type: 'neon', ...tp(4, 24), color: '#22e8ff', steady: true },
    { id: 'neon6', type: 'neon', ...tp(9, 24), color: '#ff2fa0' },
    { id: 'neon7', type: 'neon', ...tp(14, 24), color: '#ffd21e', steady: true },
    { id: 'neon8', type: 'neon', ...tp(19, 24), color: '#a24bff', steady: true },
    { id: 'neon9', type: 'neon', ...tp(31, 5), color: '#ff2fa0' },
    { id: 'neon10', type: 'neon', ...tp(31, 10), color: '#3dff88', steady: true },
    { id: 'neon11', type: 'neon', ...tp(31, 28), color: '#22e8ff', steady: true },
    { id: 'neon12', type: 'neon', ...tp(31, 33), color: '#ff8a1e' },
    { id: 'neon13', type: 'neon', ...tp(22, 4), color: '#ffd21e', steady: true },
    { id: 'neon14', type: 'neon', ...tp(22, 9), color: '#a24bff', steady: true },
    { id: 'neon15', type: 'neon', ...tp(22, 27), color: '#ff2fa0' },
    { id: 'neon16', type: 'neon', ...tp(22, 33), color: '#22e8ff', steady: true },
    { id: 'bar0', type: 'neonBar', ...tp(36, 24), color: '#ff2fa0', steady: true },
    { id: 'bar1', type: 'neonBar', ...tp(44, 24), color: '#22e8ff', steady: true },
    { id: 'bar2', type: 'neonBar', ...tp(40, 15), color: '#ffd21e', steady: true },
  ],
  portals: [
    {
      tx: 9, ty: 13, tw: 4, th: 2,
      to: { area: 'flat', x: tp(11, 13).x, y: tp(11, 13).y, dir: 'up' },
      label: 'Flat 4C'
    },
    {
      tx: 18, ty: 39, tw: 3, th: 1,
      to: { area: 'station', x: tp(20, 25).x, y: tp(20, 25).y, dir: 'up' },
      label: 'Kitano Station',
      cond: { atLeast: 'catchTrain' },
      denyText: 'Dad, tapping his watch: "Say goodbye to Mei first. She has been at the shrine an hour."'
    }
  ],
  triggers: [
    {
      id: 'firstStreet',
      tx: 24, ty: 17, tw: 6, th: 6,
      once: true,
      fx: [{ type: 'toast', text: 'Sakuragaoka Crossing — you have crossed it ten thousand times.' }]
    }
  ]
});

/* ---------------------------------------------------------- the station -- */

export const station = makeArea('station', {
  wind: 'calm',
  name: 'Kitano Station',
  region: 'tokyo',
  w: 40, h: 28,
  fill: T.platform,
  indoors: true,
  music: 'station',
  tint: 'neonroom',
  build(d) {
    d.border(T.wall, 1);
    // Concourse below, platform above, ticket gates between.
    d.fill(1, 14, 38, 13, T.stone);
    d.hline(1, 38, 13, T.fence);
    for (const gap of [12, 13, 20, 21, 27, 28]) d.set(gap, 13, T.stone);
    // Track along the top with the platform edge marked in gravel.
    d.fill(1, 1, 38, 4, T.rail);
    d.hline(1, 38, 5, T.gravel);
    d.hline(1, 38, 12, T.gravel);
    // Stairwell to the street, bottom left.
    d.fill(19, 25, 3, 2, T.stone);
    return d;
  },
  npcs: [
    { id: 'stationmom', name: 'Mom', ...tp(17, 10), dir: 'right', palette: PAL.mom, script: 'stationMom' },
    { id: 'stationdad', name: 'Dad', ...tp(19, 10), dir: 'left', palette: PAL.dad, script: 'stationDad' },
    { id: 'attendant', name: 'Attendant', ...tp(26, 14), dir: 'down', palette: PAL.suit, script: 'attendant' },
    { id: 'oldwoman', name: 'Woman in Grey', ...tp(31, 9), dir: 'left', palette: PAL.gran, script: 'oldWoman' },
    { id: 'commuter', name: 'Commuter', ...tp(8, 18), dir: 'up', palette: PAL.suit, script: 'commuter', wander: 4 }
  ],
  props: [
    { id: 'ticketmachine', type: 'ticket', ...tp(6, 15), solid: true, script: 'ticketMachine' },
    { id: 'kiosk', type: 'kiosk', ...tp(33, 15), solid: true, script: 'kiosk' },
    { id: 'board', type: 'board', ...tp(20, 14), solid: true, script: 'departureBoard' },
    { id: 'bench1', type: 'bench', ...tp(12, 9), solid: true, script: 'bench' },
    { id: 'bench2', type: 'bench', ...tp(28, 9), solid: true, script: 'bench' },
    { id: 'train', type: 'train', ...tp(20, 3), solid: true }
  ],
  portals: [
    {
      tx: 19, ty: 25, tw: 3, th: 2,
      to: { area: 'street', x: tp(19, 38).x, y: tp(19, 38).y, dir: 'up' },
      label: 'Back to the street',
      cond: { before: 'wrongTurn' }
    },
    {
      tx: 12, ty: 5, tw: 16, th: 2,
      to: { area: 'train', x: tp(6, 6).x, y: tp(6, 6).y, dir: 'right' },
      label: 'Northbound train',
      cond: { has: 'ticket' },
      denyText: 'The doors chime, but you have no ticket. The machine downstairs is waiting.'
    }
  ]
});

/* ------------------------------------------------------------ the train -- */

export const train = makeArea('train', {
  name: 'Northbound Local',
  region: 'tokyo',
  w: 30, h: 11,
  fill: T.wood,
  indoors: true,
  music: 'train',
  tint: 'dusk',
  build(d) {
    d.border(T.wall, 1);
    d.hline(1, 28, 1, T.window);
    d.hline(1, 28, 9, T.window);
    // Bench seats running along both sides.
    d.hline(2, 27, 2, T.lacquer);
    d.hline(2, 27, 8, T.lacquer);
    // Doors at the far ends.
    d.vline(4, 6, 0, T.shoji);
    d.vline(4, 6, 29, T.stone);   // the door that opens at Kaminohara
    return d;
  },
  npcs: [
    { id: 'trainmom', name: 'Mom', ...tp(9, 3), dir: 'down', palette: PAL.mom, script: 'trainMom' },
    { id: 'traindad', name: 'Dad', ...tp(11, 3), dir: 'down', palette: PAL.dad, script: 'trainDad' },
    { id: 'conductor', name: 'Conductor', ...tp(22, 6), dir: 'left', palette: PAL.suit, script: 'conductor', wander: 3 },
    { id: 'sleeper', name: 'Sleeping Passenger', ...tp(17, 7), dir: 'down', palette: PAL.gran, script: 'sleeper' }
  ],
  props: [
    { id: 'strap1', type: 'strap', ...tp(14, 5) },
    { id: 'strap2', type: 'strap', ...tp(18, 5) },
    { id: 'strap3', type: 'strap', ...tp(22, 5) },
    { id: 'window', type: 'trainwindow', ...tp(6, 1), script: 'trainWindow' }
  ],
  portals: [
    {
      tx: 29, ty: 4, tw: 1, th: 3,
      to: { area: 'paddyroad', x: tp(9, 8).x, y: tp(9, 8).y, dir: 'down' },
      label: 'Kaminohara — step down',
      cond: { flag: 'trainStop' },
      denyText: 'The doors are shut and the countryside is still sliding past.'
    }
  ],
  triggers: [
    {
      id: 'boarded',
      tx: 1, ty: 2, tw: 28, th: 7,
      once: true,
      fx: [
        { type: 'chapter', id: 'wrongTurn' },
        { type: 'journal', text: 'The city ran out somewhere past the third tunnel.' },
        { type: 'toast', text: 'Two hours north. The buildings thin out, then stop.' }
      ]
    }
  ]
});

export const TOKYO_AREAS = { flat, street, station, train };

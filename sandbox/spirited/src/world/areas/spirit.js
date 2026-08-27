// The village, through the hill from her farm: a market street, a bridge,
// a bathhouse that everyone ends up in, and the lake beyond.

import { makeArea, tp } from '../mapbuilder.js';
import { T } from '../tiles.js';

const PAL = {
  kanae:  { skin: '#e2b48c', hair: '#3b2a22', cloth: '#7a6a3f', trim: '#e8e0cc' },
  fish:   { skin: '#c99a6e', hair: '#4a3a30', cloth: '#3f5f8a', trim: '#dfe4ea' },
  tofu:   { skin: '#e6c0a0', hair: '#2c2420', cloth: '#c8bda0', trim: '#8a7550' },
  gran2:  { skin: '#d9b294', hair: '#b8b2a6', cloth: '#6a5a72', trim: '#e2d8c6' },
  kid:    { skin: '#e6bb92', hair: '#2e2620', cloth: '#4f8a7a', trim: '#e8e0cc' },
  kid2:   { skin: '#d8ab84', hair: '#3a2a20', cloth: '#c2564a', trim: '#f0e6d2' },
  farmerB:{ skin: '#c99a6e', hair: '#6a5f52', cloth: '#4a5c46', trim: '#b0a68e' },
  postman:{ skin: '#e0b48c', hair: '#241c18', cloth: '#c8452e', trim: '#f0e6d2' },
  teen:   { skin: '#e6bb92', hair: '#1e1a17', cloth: '#5a5a7a', trim: '#e8e0cc' },
  mom:   { skin: '#e7bb95', hair: '#3b2a22', cloth: '#6f80a6', trim: '#dcd3c2' },
  dad:   { skin: '#dfb188', hair: '#2b2320', cloth: '#4d5c4e', trim: '#c9c2b0' },
  ren:   { skin: '#d8e2e6', hair: '#2f4a56', cloth: '#3f6f74', trim: '#cfe4e6' },
  yuzuki:{ skin: '#efe0cf', hair: '#c9b17a', cloth: '#6a2740', trim: '#d9b45a' },
  yumeno:{ skin: '#efe0cf', hair: '#b9b2a6', cloth: '#4a5a6a', trim: '#cbbf9e' },
  frog:  { skin: '#6f9a4a', hair: '#4e7233', cloth: '#3f5f8a', trim: '#d9cf9e' },
  osen:  { skin: '#e6c0a0', hair: '#2c2420', cloth: '#8a4a3a', trim: '#e2d2b4' },
  kama:  { skin: '#8a6a4a', hair: '#3a2f28', cloth: '#4a3a2f', trim: '#c25a24' },
  shade: { skin: '#2a2a38', hair: '#1e1e2a', cloth: '#20202c', trim: '#8f8fb0' },
  hollow:{ skin: '#dcd6c8', hair: '#14141c', cloth: '#16161f', trim: '#9a3a4a' },
  radish:{ skin: '#f0ead8', hair: '#e6e0cc', cloth: '#f4efe0', trim: '#7fa06a' },
  river: { skin: '#5a6b5a', hair: '#3f4f42', cloth: '#4a5f52', trim: '#9ec4a8' }
};

/* ------------------------------------------------------- hollow market -- */

export const market = makeArea('market', {
  apron: 'moss',
  skyline: 'hills',
  wind: 'breeze',
  name: 'Kaminohara Village Market',
  region: 'spirit',
  w: 60, h: 46,
  fill: T.grass,
  music: 'village',
  tint: 'afternoon',
  weather: 'leaves',
  build(d, rng) {
    // The clock house you come out of. Its clock has no hands.
    d.fill(22, 1, 16, 7, T.wall);
    d.fill(29, 1, 3, 8, T.stone);

    d.fill(16, 9, 28, 32, T.stone);       // the street itself
    d.fill(50, 0, 10, 46, T.water);       // the bay that was a valley

    // Stalls down both sides, with gaps to slip between them.
    for (const y0 of [12, 18, 24, 30]) {
      d.fill(16, y0, 6, 1, T.stallroof);
      d.fill(16, y0 + 1, 6, 2, T.counter);
      d.fill(38, y0, 6, 1, T.stallroof);
      d.fill(38, y0 + 1, 6, 2, T.counter);
    }
    // The one stall still steaming, standing across the street.
    d.fill(22, 17, 8, 1, T.stallroof);
    d.fill(22, 18, 8, 1, T.counter);

    d.fill(27, 41, 6, 5, T.stone);        // steps down to the bridge
    d.scatter(rng, T.moss, 80, [T.grass]);
    d.scatter(rng, T.tree, 46, [T.grass]);
    d.scatter(rng, T.flowers, 24, [T.grass]);
    return d;
  },
  npcs: [
    { id: 'kanae', name: 'Kanae', ...tp(26, 20), dir: 'down', palette: PAL.kanae, script: 'kanae', life: 'work' },
    { id: 'fishmonger', name: 'Toku the Fishmonger', ...tp(37, 13), dir: 'down', palette: PAL.fish, script: 'fishmonger', life: 'work' },
    { id: 'tofumaker', name: 'The Tofu Maker', ...tp(22, 29), dir: 'down', palette: PAL.tofu, script: 'tofuMaker', life: 'work' },
    { id: 'granmarket', name: 'Grandmother Shio', ...tp(31, 24), dir: 'left', palette: PAL.gran2, script: 'granShio', life: 'idle' },
    { id: 'kidmarket', name: 'A Boy with a Kite', ...tp(26, 30), dir: 'up', palette: PAL.kid, script: 'kiteBoy', life: 'patrol',
      route: [[26, 30], [34, 34], [24, 36], [22, 27]] },
    { id: 'kidmarket2', name: 'A Girl on a Bicycle', ...tp(33, 16), dir: 'down', palette: PAL.kid2, script: 'bikeGirl', life: 'commute',
      route: [[33, 12], [33, 38], [24, 38], [24, 12]] },
    { id: 'shopper1', name: 'A Neighbour', ...tp(24, 22), dir: 'down', palette: PAL.farmerB, script: 'neighbour', life: 'patrol',
      route: [[24, 14], [36, 22], [30, 34], [22, 24]] },
    { id: 'shopper2', name: 'A Neighbour', ...tp(35, 27), dir: 'left', palette: PAL.osen, script: 'neighbour', life: 'patrol',
      route: [[36, 34], [22, 30], [24, 16], [37, 20]] },
    { id: 'postman', name: 'The Postman', ...tp(29, 12), dir: 'down', palette: PAL.postman, script: 'postman', life: 'commute',
      route: [[29, 10], [29, 40], [17, 34], [29, 12]] },
    { id: 'marketren', name: 'Ren', ...tp(30, 37), dir: 'up', palette: PAL.ren, script: 'marketRen', showIf: [{ chapter: 'theKeys' }], life: 'idle' }
  ],
  props: [
    { id: 'produce', type: 'produce', ...tp(26, 19), solid: true, script: 'produceStall' },
    { id: 'clock', type: 'clock', ...tp(30, 9), script: 'villageClock' },
    { id: 'marketsign', type: 'sign', ...tp(31, 39), script: 'marketSign' },
    { id: 'noticeboard', type: 'board', ...tp(34, 22), solid: true, script: 'noticeBoardVillage' },
    { id: 'stallsign1', type: 'sign', ...tp(22, 13) },
    { id: 'stallsign2', type: 'sign', ...tp(37, 13) },
    { id: 'stallsign3', type: 'sign', ...tp(22, 31) },
    { id: 'stallsign4', type: 'sign', ...tp(37, 31) },
    { id: 'lamp3', type: 'lantern', ...tp(23, 10) },
    { id: 'lamp4', type: 'lantern', ...tp(36, 10) },
    { id: 'lamp5', type: 'lantern', ...tp(23, 35) },
    { id: 'lamp6', type: 'lantern', ...tp(36, 35) },
    { id: 'lamp7', type: 'lantern', ...tp(29, 16) },
    { id: 'lamp8', type: 'lantern', ...tp(29, 33) },
    { id: 'crate1', type: 'crate', ...tp(19, 16), solid: true, script: 'crates' },
    { id: 'crate2', type: 'crate', ...tp(41, 22), solid: true, script: 'crates' },
    { id: 'fishstall', type: 'produce', ...tp(40, 15), solid: true, script: 'fishStall' },
    { id: 'tofustall', type: 'produce', ...tp(19, 29), solid: true, script: 'tofuStall' }
  ],
  portals: [
    {
      tx: 29, ty: 1, tw: 3, th: 1,
      to: { area: 'tunnel', x: tp(45, 6).x, y: tp(45, 6).y, dir: 'left' },
      label: 'Back through the clock house',
      label: 'Back through the tunnel'
    },
    {
      tx: 27, ty: 45, tw: 6, th: 1,
      to: { area: 'bridge', x: tp(20, 2).x, y: tp(20, 2).y, dir: 'down' },
      label: 'Down to the bridge'
    },
  ],
  triggers: [
    {
      id: 'feastScene',
      tx: 22, ty: 20, tw: 8, th: 3,
      once: true,
      cond: { atLeast: 'theKeys' },
      fx: [{ type: 'cutscene', id: 'feastScene' }]
    },
    {
      id: 'duskFalls',
      tx: 16, ty: 36, tw: 28, th: 3,
      once: true,
      fx: [
        { type: 'toast', text: 'Market day runs on into the evening here, apparently every day.' },
        { type: 'sfx', id: 'chime' }
      ]
    }
  ]
});

/* ----------------------------------------------------- bridge of lamps -- */

export const bridge = makeArea('bridge', {
  apron: 'water',
  skyline: 'hills',
  wind: 'breeze',
  name: 'The Old Bridge',
  region: 'spirit',
  w: 40, h: 30,
  fill: T.water,
  music: 'village',
  tint: 'dusk',
  weather: 'leaves',
  build(d) {
    d.fill(14, 0, 12, 4, T.stone);       // market landing
    d.fill(16, 3, 8, 24, T.bridge);      // the span
    d.vline(3, 26, 15, T.fence);
    d.vline(3, 26, 24, T.fence);
    d.fill(12, 26, 16, 4, T.stone);      // bathhouse gate apron
    d.fill(18, 27, 4, 3, T.lacquer);
    return d;
  },
  npcs: [
    { id: 'bridgeren', name: 'Ren', ...tp(20, 10), dir: 'up', palette: PAL.ren, script: 'bridgeRen', life: 'idle' },
    { id: 'lamplighter', name: 'The Lamplighter', ...tp(18, 22), dir: 'right', palette: PAL.gran2, script: 'lamplighter', life: 'work' },
    { id: 'fisher', name: 'A Man Fishing', ...tp(22, 16), dir: 'down', palette: PAL.farmerB, script: 'fisher', life: 'idle' },
    { id: 'dogwalker', name: 'A Woman and a Dog', ...tp(19, 6), dir: 'down', palette: PAL.gran2, script: 'dogWalker', life: 'patrol',
      route: [[19, 4], [21, 24], [19, 6]] },
    { id: 'bridgeteen', name: 'A Bored Teenager', ...tp(23, 20), dir: 'up', palette: PAL.teen, script: 'boredTeen', life: 'idle' }
  ],
  props: [
    { id: 'lampL1', type: 'lamp', ...tp(15, 6), lamp: 1 },
    { id: 'lampR1', type: 'lamp', ...tp(24, 6), lamp: 2 },
    { id: 'lampL2', type: 'lamp', ...tp(15, 11), lamp: 3 },
    { id: 'lampR2', type: 'lamp', ...tp(24, 11), lamp: 4 },
    { id: 'lampL3', type: 'lamp', ...tp(15, 16), lamp: 5, unlit: true, script: 'darkLamp' },
    { id: 'lampR3', type: 'lamp', ...tp(24, 16), lamp: 6, unlit: true, script: 'darkLamp' },
    { id: 'lampL4', type: 'lamp', ...tp(15, 21), lamp: 7, unlit: true, script: 'darkLamp' },
    { id: 'lampR4', type: 'lamp', ...tp(24, 21), lamp: 8 },
    { id: 'lampMid', type: 'lamp', ...tp(20, 26), lamp: 9 },
    { id: 'gatesign', type: 'sign', ...tp(17, 28), script: 'bridgeSign' }
  ],
  portals: [
    {
      tx: 16, ty: 0, tw: 8, th: 1,
      to: { area: 'market', x: tp(30, 43).x, y: tp(30, 43).y, dir: 'up' },
      label: 'Back up the steps'
    },
    {
      tx: 18, ty: 29, tw: 4, th: 1,
      to: { area: 'bathhouse', x: tp(26, 35).x, y: tp(26, 35).y, dir: 'up' },
      label: 'The bathhouse gate',
    }
  ],
  triggers: [
    {
      id: 'holdBreath',
      tx: 16, ty: 4, tw: 8, th: 3,
      once: true,
      cond: { atLeast: 'theKeys' },
      fx: [{ type: 'cutscene', id: 'bridgeMeeting' }]
    }
  ]
});

/* ----------------------------------------------------------- bathhouse -- */

export const bathhouse = makeArea('bathhouse', {
  name: 'The Village Bathhouse',
  region: 'spirit',
  w: 52, h: 38,
  fill: T.wall,
  indoors: true,
  music: 'bathhouse',
  tint: 'lamplight',
  build(d, rng) {
    d.fill(1, 1, 50, 36, T.wood);
    d.fill(14, 3, 24, 18, T.bathtile);
    d.fill(18, 6, 16, 12, T.bathwater);  // the great tub
    d.fill(2, 24, 48, 12, T.lacquer);    // the front floor
    d.fill(20, 30, 12, 2, T.counter);    // the front desk
    d.fill(2, 22, 48, 2, T.carpet);      // the long red runner
    d.fill(3, 32, 3, 3, T.stone);        // stairs down to the boiler
    d.fill(45, 6, 5, 4, T.lacquer);      // the lift
    d.fill(46, 30, 4, 4, T.bathtile);    // the water-rail door
    d.fill(2, 6, 4, 8, T.grate);         // herb chute floor
    d.fill(24, 36, 4, 2, T.stone);       // the gate
    for (const [px, py] of [[8, 27], [42, 27], [8, 10], [42, 10], [16, 33], [34, 33]]) {
      d.fill(px, py, 2, 2, T.wall);      // pillars holding up nine floors
    }
    d.fill(6, 24, 8, 2, T.tatami);       // resting mats along the runner
    d.fill(38, 24, 8, 2, T.tatami);
    d.scatter(rng, T.shoji, 24, [T.wall]);
    return d;
  },
  npcs: [
    { id: 'gansuke', name: 'Gansuke', ...tp(26, 29), dir: 'down', palette: PAL.frog, script: 'gansuke', life: 'work' },
    { id: 'osen', name: 'Osen', ...tp(12, 26), dir: 'right', palette: PAL.osen, script: 'osen', life: 'patrol',
      route: [[12, 26], [20, 33], [36, 27], [14, 24]] },
    { id: 'worker1', name: 'Bath Attendant', ...tp(38, 26), dir: 'left', palette: PAL.frog, script: 'bathHand', life: 'work' },
    { id: 'worker2', name: 'Bath Attendant', ...tp(9, 30), dir: 'up', palette: PAL.tofu, script: 'bathHand', life: 'patrol',
      route: [[9, 30], [9, 24], [18, 24], [10, 32]] },
    { id: 'bathren', name: 'Ren', ...tp(44, 24), dir: 'left', palette: PAL.ren, script: 'bathRen', showIf: { atLeast: 'water' }, life: 'idle' },
    { id: 'bathgran', name: 'Grandmother Shio', ...tp(20, 21), dir: 'down', palette: PAL.gran2, script: 'granShio', showIf: { atLeast: 'home' }, life: 'idle' },
    { id: 'bathyuzuki', name: 'Yuzuki', ...tp(30, 25), dir: 'down', palette: PAL.yuzuki, script: 'dinnerYuzuki', showIf: { atLeast: 'home' }, life: 'idle' },
    { id: 'bathtsuda', name: 'Old Man Tsuda', ...tp(24, 25), dir: 'down', palette: PAL.farmerB, script: 'dinnerTsuda', showIf: { atLeast: 'home' }, life: 'idle' }
  ],
  props: [
    { id: 'chute', type: 'chute', ...tp(4, 5), solid: true, script: 'bathTap' },
    { id: 'lift', type: 'lift', ...tp(47, 5), solid: true, script: 'liftProp' },
    { id: 'tubside', type: 'bucket', ...tp(16, 20), script: 'bucket' },
    { id: 'shrineB', type: 'lantern', ...tp(8, 24) },
    { id: 'shrineC', type: 'lantern', ...tp(44, 24) },
    { id: 'ledger', type: 'ledger', ...tp(30, 30), solid: true, script: 'ledgerProp' },
    { id: 'notice', type: 'sign', ...tp(18, 33), script: 'bathNotice' },
    { id: 'lampF1', type: 'lantern', ...tp(11, 28) },
    { id: 'lampF2', type: 'lantern', ...tp(40, 28) },
    { id: 'lampF3', type: 'lantern', ...tp(20, 22) },
    { id: 'lampF4', type: 'lantern', ...tp(32, 22) },
    { id: 'potF1', type: 'pot', ...tp(7, 21), solid: true },
    { id: 'potF2', type: 'pot', ...tp(44, 21), solid: true },
    { id: 'bucket2', type: 'bucket', ...tp(36, 20) },
    { id: 'bucket3', type: 'bucket', ...tp(14, 34) }
  ],
  portals: [
    {
      tx: 24, ty: 37, tw: 4, th: 1,
      to: { area: 'bridge', x: tp(20, 28).x, y: tp(20, 28).y, dir: 'down' },
      label: 'Out to the bridge'
    },
    {
      tx: 3, ty: 32, tw: 3, th: 3,
      to: { area: 'boiler', x: tp(40, 10).x, y: tp(40, 10).y, dir: 'left' },
      label: 'Down to the boiler',
    },
    {
      tx: 45, ty: 6, tw: 5, th: 4,
      to: { area: 'office', x: tp(13, 15).x, y: tp(13, 15).y, dir: 'up' },
      label: 'The lift, going up'
    },
    {
      tx: 46, ty: 30, tw: 4, th: 4,
      to: { area: 'railstop', x: tp(17, 12).x, y: tp(17, 12).y, dir: 'up' },
      label: 'Out to the lake jetty'
    }
  ],
  triggers: [
    {
      id: 'firstFloor',
      tx: 20, ty: 33, tw: 12, th: 3,
      once: true,
      cond: { atLeast: 'theKeys' },
      fx: [{ type: 'toast', text: 'Every head on the floor turns, says good evening, and goes back to what it was doing.' }]
    },
    {
      id: 'dinner',
      tx: 20, ty: 24, tw: 14, th: 6,
      once: true,
      cond: { chapter: 'home' },
      fx: [
        { type: 'chapter', id: 'done' },
        { type: 'journal', text: 'Dinner at the bathhouse. Somebody had saved you a seat.' },
        { type: 'toast', text: 'They had saved you a seat. Of course they had.' },
        { type: 'sfx', id: 'chapter' }
      ]
    }
  ]
});

/* --------------------------------------------------------- boiler room -- */

export const boiler = makeArea('boiler', {
  name: 'The Bathhouse Boiler Room',
  region: 'spirit',
  w: 44, h: 22,
  fill: T.wall,
  indoors: true,
  music: 'boiler',
  tint: 'ember',
  build(d, rng) {
    d.fill(1, 1, 42, 20, T.ash);
    d.fill(2, 1, 40, 3, T.grate);         // the furnace mouths
    d.fill(2, 18, 40, 2, T.counter);      // the wall of herb drawers
    d.fill(38, 8, 4, 5, T.stone);         // stairs up
    d.fill(2, 6, 5, 5, T.tunnel);         // the coal chute
    d.scatter(rng, T.ash, 40, [T.ash]);
    return d;
  },
  npcs: [
    { id: 'kamashiro', name: 'Kamashiro', ...tp(20, 8), dir: 'up', palette: PAL.kama, script: 'kamashiro', life: 'work' },
    { id: 'apprentice', name: 'The Apprentice', ...tp(14, 13), dir: 'right', palette: PAL.teen, script: 'apprentice', life: 'patrol',
      route: [[14, 13], [6, 12], [24, 16], [16, 14]] }
  ],
  props: [
    { id: 'coalpile', type: 'coal', ...tp(4, 12), script: 'coalPile' },
    { id: 'drawers', type: 'drawers', ...tp(12, 18), solid: true, script: 'herbDrawers' },
    { id: 'drawers2', type: 'drawers', ...tp(24, 18), solid: true, script: 'herbDrawers' },
    { id: 'kettle', type: 'kettle', ...tp(24, 8), solid: true, script: 'kettle' },
    { id: 'nook', type: 'futon', ...tp(35, 16), script: 'boilerNook' }
  ],
  portals: [
    {
      tx: 38, ty: 8, tw: 4, th: 5,
      to: { area: 'bathhouse', x: tp(5, 30).x, y: tp(5, 30).y, dir: 'right' },
      label: 'Up to the floor'
    }
  ]
});

/* ------------------------------------------------------ yuzuki's office -- */

export const office = makeArea('office', {
  name: 'Yuzuki\'s Office',
  region: 'spirit',
  w: 26, h: 18,
  fill: T.wall,
  indoors: true,
  music: 'office',
  tint: 'gold',
  build(d) {
    d.fill(1, 1, 24, 16, T.lacquer);
    d.fill(6, 3, 14, 10, T.carpet);
    d.fill(10, 3, 6, 2, T.counter);      // the desk
    d.vline(1, 9, 21, T.shoji);          // the screen, and what is behind it
    d.fill(12, 16, 2, 1, T.stone);
    return d;
  },
  npcs: [
    { id: 'yuzuki', name: 'Yuzuki', ...tp(13, 2), dir: 'down', palette: PAL.yuzuki, script: 'yuzuki', life: 'work' },
    { id: 'grandson', name: 'Her Grandson', ...tp(23, 5), dir: 'left', palette: PAL.teen, script: 'grandson', life: 'idle' }
  ],
  props: [
    { id: 'contract', type: 'contract', ...tp(16, 4), solid: true, script: 'leasePapers' },
    { id: 'brazier', type: 'brazier', ...tp(8, 4), solid: true, script: 'brazier' },
    { id: 'keybox', type: 'namebox', ...tp(11, 12), solid: true, script: 'keyBox' },
    { id: 'officetable', type: 'table', ...tp(13, 8), solid: true, script: 'officeTable' }
  ],
  portals: [
    {
      tx: 12, ty: 16, tw: 2, th: 2,
      to: { area: 'bathhouse', x: tp(47, 11).x, y: tp(47, 11).y, dir: 'down' },
      label: 'The lift, going down'
    }
  ]
});

/* ----------------------------------------------------------- water rail -- */

export const railstop = makeArea('railstop', {
  apron: 'water',
  skyline: 'hills',
  wind: 'breeze',
  name: 'The Lake Jetty',
  region: 'spirit',
  w: 34, h: 18,
  fill: T.railwater,
  music: 'lake',
  tint: 'lateblue',
  build(d) {
    d.fill(4, 8, 26, 4, T.stone);
    d.fill(14, 4, 6, 4, T.wall);
    d.fill(16, 4, 2, 4, T.stone);
    d.hline(4, 29, 12, T.gravel);
    return d;
  },
  npcs: [
    { id: 'ferryman', name: 'The Ferryman', ...tp(11, 10), dir: 'right', palette: PAL.farmerB, script: 'ferryman', life: 'idle' },
    { id: 'jettyfisher', name: 'A Girl Fishing', ...tp(22, 10), dir: 'down', palette: PAL.kid2, script: 'jettyFisher', life: 'idle' },
    { id: 'jettygran', name: 'A Woman Waiting', ...tp(25, 10), dir: 'down', palette: PAL.gran2, script: 'waitingWoman', life: 'idle' }
  ],
  props: [
    { id: 'railsign', type: 'sign', ...tp(8, 9), script: 'jettySign' },
    { id: 'railcar', type: 'railcar', ...tp(17, 14), solid: true, script: 'ferryBoat' }
  ],
  portals: [
    {
      tx: 16, ty: 4, tw: 2, th: 1,
      to: { area: 'bathhouse', x: tp(47, 31).x, y: tp(47, 31).y, dir: 'left' },
      label: 'Back inside'
    }
  ]
});

/* ---------------------------------------------------------- marsh house -- */

export const marshhouse = makeArea('marshhouse', {
  apron: 'marshWater',
  skyline: 'forest',
  wind: 'breeze',
  name: 'The Weaver\'s Cottage',
  region: 'spirit',
  w: 34, h: 24,
  fill: T.marsh,
  music: 'marsh',
  tint: 'lateblue',
  build(d, rng) {
    d.fill(9, 5, 16, 13, T.wall);
    d.fill(10, 6, 14, 11, T.tatami);
    d.fill(16, 17, 2, 1, T.wood);
    d.fill(15, 18, 4, 5, T.gravel);      // the path from the water
    d.fill(11, 8, 3, 3, T.grate);        // the hearth
    d.scatter(rng, T.tallgrass, 60, [T.marsh]);
    d.scatter(rng, T.flowers, 20, [T.marsh]);
    d.scatter(rng, T.tree, 12, [T.marsh]);
    d.fill(15, 18, 4, 6, T.gravel);
    return d;
  },
  npcs: [
    { id: 'yumeno', name: 'Yumeno', ...tp(17, 10), dir: 'down', palette: PAL.yumeno, script: 'yumeno', life: 'work' }
  ],
  props: [
    { id: 'wheel', type: 'wheel', ...tp(13, 13), solid: true, script: 'spinningWheel' },
    { id: 'teapot', type: 'kettle', ...tp(12, 9), solid: true, script: 'teapot' },
    { id: 'lampM', type: 'lantern', ...tp(22, 8) }
  ],
  portals: []
});

/* ------------------------------------------------- grove of folded names -- */

export const grove = makeArea('grove', {
  apron: 'moss',
  skyline: 'forest',
  wind: 'breeze',
  name: 'The Cedar Grove',
  region: 'spirit',
  w: 40, h: 30,
  fill: T.moss,
  music: 'grove',
  tint: 'dawn',
  weather: 'petals',
  build(d, rng) {
    d.blob(20, 14, 7, T.shallow, rng);
    d.blob(20, 14, 4, T.water, rng);
    d.scatter(rng, T.tree, 90, [T.moss]);
    d.scatter(rng, T.flowers, 40, [T.moss]);
    d.fill(18, 22, 4, 8, T.gravel);
    d.fill(19, 5, 2, 4, T.stone);
    return d;
  },
  npcs: [
    { id: 'groveren', name: 'Ren', ...tp(20, 20), dir: 'up', palette: PAL.ren, script: 'groveRen', life: 'idle' }
  ],
  props: [
    { id: 'slips1', type: 'slips', ...tp(16, 10), script: 'prayerSlips' },
    { id: 'slips2', type: 'slips', ...tp(25, 12), script: 'prayerSlips' },
    { id: 'stoneMarker', type: 'jizo', ...tp(20, 6), solid: true, script: 'groveShrine' }
  ],
  portals: []
});

export const SPIRIT_AREAS = { market, bridge, bathhouse, boiler, office, railstop, marshhouse, grove };

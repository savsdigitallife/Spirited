// Act II. Kaminohara: a valley of rice, one bus a day, and a hill with a
// door in it that nobody local will talk about.

import { makeArea, tp } from '../mapbuilder.js';
import { T } from '../tiles.js';

const PAL = {
  mom:    { skin: '#e7bb95', hair: '#3b2a22', cloth: '#6f80a6', trim: '#dcd3c2' },
  dad:    { skin: '#dfb188', hair: '#2b2320', cloth: '#4d5c4e', trim: '#c9c2b0' },
  farmer: { skin: '#c99a6e', hair: '#9a9186', cloth: '#5c6b4a', trim: '#b0a68e' },
  cyclist:{ skin: '#e3b48d', hair: '#33251d', cloth: '#3f7c86', trim: '#e8e0cc' },
  fox:    { skin: '#c96a2c', hair: '#c96a2c', cloth: '#e08a4a', trim: '#f2e8d6' }
};

/* ---------------------------------------------------------- paddy road -- */

export const paddyroad = makeArea('paddyroad', {
  name: 'Kaminohara — Paddy Road',
  region: 'country',
  w: 64, h: 50,
  fill: T.grass,
  music: 'country',
  tint: 'afternoon',
  weather: 'leaves',
  build(d, rng) {
    // The line the train came in on. It leaves as fast as it arrived.
    d.fill(0, 0, 64, 3, T.rail);
    d.fill(4, 3, 10, 4, T.platform);
    d.hline(4, 13, 7, T.gravel);

    // The road: down from the halt, east along the valley, then south to the hill.
    d.vline(7, 21, 9, T.dirt, 2);
    d.hline(9, 45, 20, T.dirt, 2);
    d.vline(20, 42, 43, T.dirt, 2);

    // Rice paddies, banked in a grid.
    for (let by = 24; by < 45; by += 7) {
      for (let bx = 14; bx < 39; bx += 8) {
        d.fill(bx, by, 7, 6, T.paddy);
        d.outline(bx - 1, by - 1, 9, 8, T.bank);
      }
    }

    // Stream out of the north hills, under the road.
    let sx = 26;
    for (let y = 3; y < 50; y++) {
      sx += Math.round((rng() - 0.5) * 1.6);
      sx = Math.max(22, Math.min(30, sx));
      d.set(sx, y, T.water);
      d.set(sx + 1, y, T.water);
      if (rng() < 0.4) d.set(sx - 1, y, T.shallow);
    }
    d.fill(22, 20, 10, 2, T.bridge);   // the road crosses on planks

    // Tsuda's farmhouse and yard.
    d.fill(48, 5, 11, 8, T.wall);
    d.fill(49, 6, 9, 6, T.tatami);
    d.fill(52, 13, 3, 1, T.wood);
    d.fill(46, 14, 15, 5, T.gravel);
    d.outline(46, 4, 15, 16, T.fence);
    d.fill(52, 19, 3, 1, T.gravel);    // gate in the fence
    d.fill(46, 14, 1, 1, T.gravel);

    // Forest: the valley's edges close in.
    d.fill(0, 26, 12, 24, T.moss);
    d.scatter(rng, T.tree, 130, [T.moss, T.grass]);
    d.scatter(rng, T.bush, 45, [T.grass, T.moss]);
    d.scatter(rng, T.flowers, 60, [T.grass]);
    d.scatter(rng, T.tallgrass, 90, [T.grass]);
    d.scatter(rng, T.rock, 18, [T.grass, T.moss]);

    // The fox shrine on its gravel apron, half-swallowed by moss.
    d.blob(35, 11, 5, T.gravel, rng);
    d.fill(34, 9, 3, 3, T.stone);

    // The hill, and the mouth in it.
    d.fill(38, 43, 26, 7, T.cliff);
    d.fill(43, 43, 2, 7, T.tunnel);
    d.fill(42, 42, 4, 1, T.stone);

    // Keep the road walkable no matter what the scatter did.
    d.vline(7, 21, 9, T.dirt, 2);
    d.hline(9, 45, 20, T.dirt, 2);
    d.vline(20, 42, 43, T.dirt, 2);
    d.fill(22, 20, 10, 2, T.bridge);
    return d;
  },
  npcs: [
    { id: 'roadmom', name: 'Mom', ...tp(43, 26), dir: 'down', palette: PAL.mom, script: 'roadMom', hideIf: { atLeast: 'forbiddenFeast' } },
    { id: 'roaddad', name: 'Dad', ...tp(44, 29), dir: 'down', palette: PAL.dad, script: 'roadDad', hideIf: { atLeast: 'forbiddenFeast' } },
    { id: 'tsuda', name: 'Old Man Tsuda', ...tp(50, 16), dir: 'down', palette: PAL.farmer, script: 'tsuda' },
    { id: 'cyclist', name: 'Girl on a Bicycle', ...tp(20, 22), dir: 'right', palette: PAL.cyclist, script: 'cyclist', wander: 4 },
    { id: 'redfox', name: 'Red Fox', ...tp(33, 14), dir: 'left', palette: PAL.fox, kind: 'cat', script: 'redFox', wander: 3 }
  ],
  props: [
    { id: 'carpark', type: 'car', ...tp(45, 40), solid: true, script: 'parkedCar' },
    { id: 'torii2', type: 'torii', ...tp(35, 14), script: 'countryTorii' },
    { id: 'foxA', type: 'fox', ...tp(33, 10), solid: true, script: 'stoneFox' },
    { id: 'foxB', type: 'fox', ...tp(37, 10), solid: true, script: 'stoneFox' },
    { id: 'jizo', type: 'jizo', ...tp(42, 41), solid: true, script: 'jizo' },
    { id: 'scarecrow', type: 'scarecrow', ...tp(18, 30), solid: true, script: 'scarecrow' },
    { id: 'well', type: 'well', ...tp(47, 16), solid: true, script: 'well' },
    { id: 'busstop', type: 'sign', ...tp(11, 19), script: 'busStop' },
    { id: 'tunnelsign', type: 'sign', ...tp(41, 42), script: 'tunnelSign' },
    { id: 'bicycle', type: 'bicycle', ...tp(46, 18), solid: true, script: 'bicycleProp' }
  ],
  portals: [
    {
      tx: 43, ty: 49, tw: 2, th: 1,
      to: { area: 'tunnel', x: tp(2, 6).x, y: tp(2, 6).y, dir: 'right' },
      label: 'The mouth in the hill'
    }
  ],
  triggers: [
    {
      id: 'arrived',
      tx: 8, ty: 7, tw: 4, th: 3,
      once: true,
      fx: [
        { type: 'toast', text: 'Kaminohara. Population: fewer every year.' },
        { type: 'journal', text: 'The halt has no gate, no staff, and one bench.' }
      ]
    },
    {
      id: 'mouthseen',
      tx: 40, ty: 40, tw: 8, th: 3,
      once: true,
      cond: { before: 'throughTunnel' },
      fx: [
        { type: 'toast', text: 'Cold air comes out of the tunnel. In August.' },
        { type: 'sfx', id: 'wind' }
      ]
    }
  ]
});

/* -------------------------------------------------------------- tunnel -- */

export const tunnel = makeArea('tunnel', {
  name: 'The Old Tunnel',
  region: 'country',
  w: 48, h: 13,
  fill: T.tunnelwall,
  indoors: true,
  music: 'tunnel',
  tint: 'dark',
  build(d, rng) {
    d.fill(1, 5, 46, 3, T.tunnel);
    // A waiting room hollowed into the rock halfway along — benches, dust.
    d.fill(20, 3, 8, 7, T.stone);
    d.fill(21, 4, 6, 1, T.wood);
    d.scatter(rng, T.ash, 30, [T.tunnel]);
    d.fill(1, 5, 2, 3, T.tunnel);
    d.fill(45, 5, 2, 3, T.tunnel);
    return d;
  },
  npcs: [],
  props: [
    { id: 'benchT', type: 'bench', ...tp(23, 4), solid: true, script: 'tunnelBench' },
    { id: 'lanternT', type: 'lantern', ...tp(26, 4), script: 'tunnelLantern' },
    { id: 'dust', type: 'dust', ...tp(33, 6), script: 'tunnelDust' }
  ],
  portals: [
    {
      tx: 1, ty: 5, tw: 1, th: 3,
      to: { area: 'paddyroad', x: tp(43, 47).x, y: tp(43, 47).y, dir: 'up' },
      label: 'Back to the valley',
      cond: { before: 'forbiddenFeast' },
      denyText: 'Where the road was, there is water now — wide, black, and moving. You cannot go back that way.'
    },
    {
      tx: 46, ty: 5, tw: 1, th: 3,
      to: { area: 'market', x: tp(30, 6).x, y: tp(30, 6).y, dir: 'down' },
      label: 'The light at the other end'
    }
  ],
  triggers: [
    {
      id: 'goHome',
      tx: 1, ty: 5, tw: 8, th: 3,
      once: true,
      cond: { chapter: 'done' },
      fx: [{ type: 'cutscene', id: 'walkHome' }]
    },
    {
      id: 'intunnel',
      tx: 3, ty: 5, tw: 4, th: 3,
      once: true,
      fx: [
        { type: 'chapter', id: 'throughTunnel' },
        { type: 'toast', text: 'Dad\'s footsteps echo ahead. Mom laughs at something. You do not.' },
        { type: 'sfx', id: 'wind' }
      ]
    }
  ]
});

export const COUNTRY_AREAS = { paddyroad, tunnel };

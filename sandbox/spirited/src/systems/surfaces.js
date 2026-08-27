// What the ground sounds like underfoot. Keyed by tile name so the mapping
// reads as a list of surfaces rather than a list of numbers.

import { TILES } from '../world/tiles.js';

const BY_NAME = {
  grass: 'grass', tallgrass: 'grass', moss: 'grass', flowers: 'grass',
  dirt: 'dirt', bank: 'dirt', gravel: 'gravel', ash: 'ash',
  road: 'stone', sidewalk: 'stone', crosswalk: 'stone', stone: 'stone',
  platform: 'stone', bathtile: 'tile', tunnel: 'stone', cliff: 'stone',
  wood: 'wood', bridge: 'wood', lacquer: 'wood', counter: 'wood',
  tatami: 'tatami', carpet: 'carpet',
  water: 'splash', shallow: 'splash', marsh: 'splash', paddy: 'splash',
  bathwater: 'splash', railwater: 'splash',
  rail: 'metal', grate: 'metal'
};

const BY_ID = TILES.map((tile) => BY_NAME[tile.name] ?? 'stone');

export function stepSurface(tileId) {
  return BY_ID[tileId] ?? 'stone';
}

export { BY_NAME as SURFACES };

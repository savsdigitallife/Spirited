// Everything Aiko can carry. `key` items cannot be dropped or eaten.

export const ITEMS = {
  satchel:      { name: 'Canvas Satchel',   key: true,  desc: 'Your grandmother stitched the strap twice. It holds more than it looks like it should.' },
  radishSeed:   { name: "Mei's Radish Seed",key: true,  desc: 'A paper packet from the shop on the corner. "Even you cannot kill a radish. — M"' },
  ticket:       { name: 'Northbound Ticket',key: true,  desc: 'Kitano to Kaminohara. One way, seat unreserved, 21:40.' },
  riceBall:     { name: 'Rice Ball',        key: false, desc: 'Salted, wrapped in seaweed. Good for a long walk, or for a cat.', heals: 2 },
  foxCoin:      { name: 'Fox Coin',         key: true,  desc: 'A square-holed coin from the crossing shrine. Warm, always.' },
  lanternStub:  { name: 'Candle Stub',      key: true,  desc: 'From the honesty box in the tunnel shelter. Meant for the bridge lamps.' },
  farmKeys:     { name: 'Farm Keys',        key: true,  desc: 'Three keys on a wire ring: gate, front door, and one nobody can identify.' },
  seedPacket:   { name: "Kanae's Seed",     key: true,  desc: 'Turnip, mustard and winter greens, on credit until you have something to sell.' },
  henCrate:     { name: 'Crate of Hens',    key: true,  desc: 'Six hens and, separately and under protest, one goat.' },
  basket:       { name: 'A Full Basket',    key: true,  desc: 'Radish, turnip and some very battered greens. Your first crop.' },
  cuttings:     { name: "Yumeno's Cuttings",key: true,  desc: 'Tea, rosemary, and one she will not name until it flowers.' },
  bathToken:    { name: 'Bath Token',       key: true,  desc: 'A wooden chit, good for one bath. Gansuke paid for it himself, which cost him something.' },
  coalLump:     { name: 'Lump of Coal',     key: false, desc: 'Heavier than it looks. Kamashiro will take it off you gladly.' },
  riverStone:   { name: 'River Stone',      key: false, desc: 'Smooth and cold, from the stretch Ren\'s grandmother used to fish.' }
};

export function itemName(id) {
  return ITEMS[id]?.name ?? id;
}

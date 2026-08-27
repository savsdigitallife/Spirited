// Every item Aiko can carry. `key` items cannot be dropped or eaten.

export const ITEMS = {
  satchel:      { name: 'Canvas Satchel',      key: true,  icon: 'bag',    desc: 'Grandmother stitched the strap twice. It holds more than it looks like it should.' },
  farewellCard: { name: "Mei's Card",          key: true,  icon: 'card',   desc: 'A goodbye card, folded crooked. "Don\'t you dare forget me. — Mei"' },
  ticket:       { name: 'Northbound Ticket',   key: true,  icon: 'ticket', desc: 'Tokyo to Kaminohara. One way, seat unreserved.' },
  riceBall:     { name: 'Rice Ball',           key: false, icon: 'food',   desc: 'Salted, wrapped in seaweed. Restores heart when eaten.', heals: 2 },
  foxCoin:      { name: 'Fox Coin',            key: true,  icon: 'coin',   desc: 'A square-holed coin from the stone fox shrine. Warm, always.' },
  lanternStub:  { name: 'Lantern Stub',        key: true,  icon: 'lantern',desc: 'A stub of candle that will not blow out, no matter the wind.' },
  coalLump:     { name: 'Lump of Coal',        key: false, icon: 'coal',   desc: 'Heavier than it looks. The cinder mites will riot for this.' },
  herbToken:    { name: 'Herb Token',          key: false, icon: 'token',  desc: 'A wooden chit. Feed it to the herb chute for a scented bath.' },
  bitterCake:   { name: 'Bitter Cake',         key: true,  icon: 'cake',   desc: 'A river spirit\'s parting gift. Bitter enough to make anything let go of you.' },
  goldSeal:     { name: 'Gold Seal',           key: true,  icon: 'seal',   desc: 'Stolen from the marsh house. It hums, and the humming is angry.' },
  riverStone:   { name: 'River Stone',         key: false, icon: 'stone',  desc: 'Smooth and cold. Ren says a river keeps its memories in these.' },
  railToken:    { name: 'Rail Token',          key: true,  icon: 'token',  desc: 'One ride on the water rail. It only ever goes out, never back.' },
  nameSlip:     { name: 'Folded Name',         key: true,  icon: 'slip',   desc: 'Four characters on a scrap of paper, taken from a contract. Do not lose it again.' },
  hogCharm:     { name: 'Clay Hog Charm',      key: true,  icon: 'charm',  desc: 'Two small hogs of red clay. They are warm, and they are breathing.' }
};

export function itemName(id) {
  return ITEMS[id]?.name ?? id;
}

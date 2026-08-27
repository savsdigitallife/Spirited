// The story, one chapter at a time. Each chapter states exactly one thing to
// do and exactly where to do it — the journal and the top-right banner both
// read straight from here, so if it is unclear here it is unclear in game.

export const CHAPTERS = [
  {
    id: 'packUp',
    title: 'Chapter 1 — Last Night in Tokyo',
    objective: 'Find your canvas bag in the flat, then take the lift down to the crossing.',
    where: 'Tokyo — Nakazato Flat 4C',
    hint: 'The bag is in the bedroom, under the window.'
  },
  {
    id: 'farewell',
    title: 'Chapter 2 — One Last Bowl',
    objective: 'Say goodbye to Mei at the ramen counter on the crossing.',
    where: 'Tokyo — Sakuragaoka Crossing',
    hint: 'Follow the neon. The counter is the one with six stools and no name.'
  },
  {
    id: 'catchTrain',
    title: 'Chapter 3 — The Night Train North',
    objective: 'Buy a ticket from the machine, then board the northbound train.',
    where: 'Tokyo — Kitano Station',
    hint: 'The station entrance is down the alley south of the crossing.'
  },
  {
    id: 'arrive',
    title: 'Chapter 4 — Kaminohara',
    objective: 'Step down at the halt and follow the paddy road east to your farm gate.',
    where: 'Kaminohara — Paddy Road',
    hint: 'Talk to the conductor first; he will tell you when to get off.'
  },
  {
    id: 'theKeys',
    title: 'Chapter 5 — The Keys',
    objective: 'The gate is padlocked. Find Yuzuki, who holds the lease, in the village.',
    where: 'Kaminohara — Village',
    hint: 'The village is through the tunnel at the end of the paddy road.'
  },
  {
    id: 'clearGround',
    title: 'Chapter 6 — Clear the Ground',
    objective: 'Three jobs in the garden: pull the brambles, lift the stones, mend the fence.',
    where: 'Your farm',
    hint: 'They are all in the walled garden behind the house.'
  },
  {
    id: 'firstSeeds',
    title: 'Chapter 7 — First Seeds',
    objective: 'Buy seed from Kanae at the village market, then sow the first bed.',
    where: 'Village market, then your farm',
    hint: 'Kanae keeps the stall with the seed drawers, halfway down the market.'
  },
  {
    id: 'water',
    title: 'Chapter 8 — Water',
    objective: 'The channel is dry. Ask Ren at the bridge, then open the sluice at your farm.',
    where: 'The old bridge, then your farm',
    hint: 'Ren is usually leaning on the bridge rail, watching the water.'
  },
  {
    id: 'animals',
    title: 'Chapter 9 — Six Hens and a Goat',
    objective: 'Collect the hens from Old Man Tsuda, then build them a coop at the farm.',
    where: 'Tsuda\'s farmhouse, then your farm',
    hint: 'Tsuda\'s place is the walled yard at the east end of the paddy road.'
  },
  {
    id: 'storm',
    title: 'Chapter 10 — The Storm',
    objective: 'A typhoon is coming. Get the animals in and cover the beds before it lands.',
    where: 'Your farm',
    hint: 'The coop first, then the seed beds. Ren will help if you ask him.'
  },
  {
    id: 'harvest',
    title: 'Chapter 11 — First Harvest',
    objective: 'Pick what survived, then carry a basket down to the village market.',
    where: 'Your farm, then the village market',
    hint: 'The beds are behind the house. Kanae will know what it is worth.'
  },
  {
    id: 'home',
    title: 'Chapter 12 — Home',
    objective: 'Eat with the village at the bathhouse. Somebody has saved you a seat.',
    where: 'The village bathhouse',
    hint: 'Across the bridge, the big wooden building with steam coming off it.'
  },
  {
    id: 'done',
    title: 'Epilogue',
    objective: 'Live here.',
    where: 'Kaminohara',
    hint: ''
  }
];

export const CHAPTER_INDEX = Object.fromEntries(CHAPTERS.map((c, i) => [c.id, i]));

// Optional threads. None of them gate the ending; all of them change it.
export const SIDE_QUESTS = {
  lampLighter: {
    name: 'Nine Lamps',
    hint: 'Three lamps on the old bridge have been dark for years. The lamplighter has given up on them.',
    steps: 3
  },
  strayCat: {
    name: 'The Barn Cat',
    hint: 'Something has been sleeping in your woodshed. Feed it three times and it might stay.',
    steps: 3
  },
  frogLedger: {
    name: 'The Crooked Ledger',
    hint: 'Gansuke has been skimming the bathhouse takings for sixty years. Prove it, or don\'t.',
    steps: 1
  },
  riverStones: {
    name: 'A River\'s Memory',
    hint: 'Ren is looking for three stones from the river his grandmother used to fish.',
    steps: 3
  },
  teaGarden: {
    name: 'Yumeno\'s Cuttings',
    hint: 'The weaver across the lake has cuttings to spare, if somebody would only come and take them.',
    steps: 1
  }
};

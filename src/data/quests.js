// The main story is a straight line of chapters; the world around it is not.
// Each chapter knows where it wants you and what the journal should say.

export const CHAPTERS = [
  {
    id: 'packUp',
    title: 'Chapter 1 — Moving Day',
    objective: 'Find your satchel in the empty flat, then tell Mom you are ready.',
    where: 'Tokyo — Nakazato Flat 4C'
  },
  {
    id: 'farewell',
    title: 'Chapter 2 — Goodbye, Then',
    objective: 'Say goodbye to Mei at the crossing shrine before the family leaves.',
    where: 'Tokyo — Sakuragaoka Crossing'
  },
  {
    id: 'catchTrain',
    title: 'Chapter 3 — Northbound',
    objective: 'Buy a ticket from the machine and board the northbound train.',
    where: 'Tokyo — Kitano Station'
  },
  {
    id: 'wrongTurn',
    title: 'Chapter 4 — The Wrong Turn',
    objective: 'Follow the paddy road toward the new house. Find out where the road stops.',
    where: 'Kaminohara — Paddy Road'
  },
  {
    id: 'throughTunnel',
    title: 'Chapter 5 — The Mouth in the Hill',
    objective: 'Walk the tunnel to the other side. Dad will not be talked out of it.',
    where: 'Kaminohara — Old Tunnel'
  },
  {
    id: 'forbiddenFeast',
    title: 'Chapter 6 — Do Not Eat',
    objective: 'Stop your parents before they finish the food at the empty stalls.',
    where: 'Beyond — Hollow Market'
  },
  {
    id: 'findWork',
    title: 'Chapter 7 — Ask for Work',
    objective: 'Cross the bridge and ask Lady Yuzuki of the bathhouse for a job. Nobody idle is allowed to stay.',
    where: 'Beyond — Bridge of Nine Lamps'
  },
  {
    id: 'loseName',
    title: 'Chapter 8 — Sign Here',
    objective: 'Sign the contract in the high office. Try to remember what you signed away.',
    where: 'Beyond — Yuzuki\'s Office'
  },
  {
    id: 'firstShift',
    title: 'Chapter 9 — The Boiler Floor',
    objective: 'Earn your place: bring Kamashiro coal and three herb tokens.',
    where: 'Beyond — Boiler Room'
  },
  {
    id: 'riverGuest',
    title: 'Chapter 10 — The Stink Guest',
    objective: 'Draw a herb bath and pull the filth out of the guest in the great tub.',
    where: 'Beyond — Great Bath'
  },
  {
    id: 'hollowGuest',
    title: 'Chapter 11 — The Hollow One',
    objective: 'The masked guest is swallowing the staff. Get it out of the bathhouse.',
    where: 'Beyond — Great Bath'
  },
  {
    id: 'sixthStation',
    title: 'Chapter 12 — Sixth Station',
    objective: 'Ride the water rail to the marsh house and give back the gold seal.',
    where: 'Beyond — Water Rail'
  },
  {
    id: 'remember',
    title: 'Chapter 13 — What You Were Called',
    objective: 'Give Ren back his name in the grove, and take back your own.',
    where: 'Beyond — Grove of Folded Names'
  },
  {
    id: 'homeward',
    title: 'Chapter 14 — The Long Way Home',
    objective: 'Pick your parents out of the herd, then walk back through the tunnel without looking behind you.',
    where: 'Beyond — Hollow Market'
  },
  {
    id: 'done',
    title: 'Epilogue',
    objective: 'Go home.',
    where: 'Kaminohara'
  }
];

export const CHAPTER_INDEX = Object.fromEntries(CHAPTERS.map((c, i) => [c.id, i]));

// Optional threads. None of them gate the ending; all of them change it a little.
export const SIDE_QUESTS = {
  lampLighter: {
    name: 'Nine Lamps',
    hint: 'Light every lamp on the bridge. The old lamplighter has given up on three of them.',
    steps: 3
  },
  cinderPay: {
    name: 'Cinder Wages',
    hint: 'The cinder mites work for nothing. Somebody should fix that.',
    steps: 1
  },
  riverMemory: {
    name: 'A River\'s Memory',
    hint: 'Ren cannot remember his river. Find three stones that do.',
    steps: 3
  },
  frogLedger: {
    name: 'The Crooked Ledger',
    hint: 'Frog-clerk Gansuke is skimming the bath fees. Prove it, or don\'t.',
    steps: 1
  },
  stallKeeper: {
    name: 'The Empty Stalls',
    hint: 'Somebody cooked all that food. Find out who, and why they left.',
    steps: 1
  }
};

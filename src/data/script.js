// Every conversation in the game. A script is `(state) => dialogue graph`,
// so a character can answer differently depending on where the story stands.
//
// Nothing here mutates state directly; nodes carry `fx` arrays that the
// dialogue runner hands to the state reducer.

import { hasItem, flag, isChapter, atLeast, itemCount, sideDone } from '../systems/state.js';

/* ----------------------------------------------------------- utilities -- */

function talk(speaker, texts, { fx = [], endFx = [] } = {}) {
  const nodes = {};
  const list = Array.isArray(texts) ? texts : [texts];
  list.forEach((t, i) => {
    nodes[`n${i}`] = { speaker, text: t, next: i === list.length - 1 ? 'end' : `n${i + 1}` };
  });
  if (fx.length) nodes.n0.fx = [...fx];
  if (endFx.length) {
    const last = `n${list.length - 1}`;
    nodes[last].fx = [...(nodes[last].fx ?? []), ...endFx];
  }
  return { start: 'n0', nodes };
}

// Examining scenery: no speaker, just the narrator's eye.
function look(texts, opts) {
  return talk('', texts, opts);
}

function ask(speaker, text, choices) {
  return { start: 'q', nodes: { q: { speaker, text, choices } } };
}

export const SCRIPTS = {};

/* ================================================================ FLAT == */

SCRIPTS.mom = (s) => {
  if (!hasItem(s, 'satchel')) {
    return talk('Mom', [
      'Aiko, the movers took the bed an hour ago. Have you got your bag?',
      'The canvas one. Your grandmother made it. Check your room — under the window, where you left it "on purpose".'
    ]);
  }
  if (flag(s, 'readyToGo')) {
    return talk('Mom', ['Shrine, then station. Don\'t make your father use the watch voice.']);
  }
  return {
    start: 'q',
    nodes: {
      q: {
        speaker: 'Mom',
        text: 'That\'s everything, then. Ready?',
        choices: [
          {
            text: 'Ready.',
            next: 'go',
            fx: [
              { type: 'flag', id: 'readyToGo' },
              { type: 'chapter', id: 'farewell' },
              { type: 'journal', text: 'Mom says the new house has a well. As if that helps.' }
            ]
          },
          { text: 'I am not ready.', next: 'no' }
        ]
      },
      go: {
        speaker: 'Mom',
        text: 'Good girl. Say goodbye to Mei at the shrine — she has been waiting since seven. Then the station.',
        next: 'end'
      },
      no: { speaker: 'Mom', text: 'I know. Neither am I, and I am thirty-eight.', next: 'no2' },
      no2: {
        speaker: 'Mom',
        text: 'Come anyway. We can be unready together on the train.',
        fx: [
          { type: 'flag', id: 'readyToGo' },
          { type: 'chapter', id: 'farewell' }
        ],
        next: 'end'
      }
    }
  };
};

SCRIPTS.dad = (s) => {
  if (!atLeast(s, 'farewell')) {
    return talk('Dad', [
      'Kaminohara! Four hundred people, one shop, and air you can actually breathe.',
      'You\'ll love it by October. Everyone does.',
      '...The map says the house is past a hill. There\'s a tunnel marked. Probably closed.'
    ], { endFx: [{ type: 'journal', text: 'Dad\'s map has a tunnel on it, drawn in a different ink than the roads.' }] });
  }
  return talk('Dad', ['Got everything? Good. Twelve is old enough to carry your own bag and young enough to be excited. Try the second one.']);
};

SCRIPTS.satchelProp = () => look(
  ['Under the window, exactly where she left it "on purpose". The strap is stitched twice.'],
  { endFx: [{ type: 'give', id: 'satchel' }] }
);

SCRIPTS.boxes = () => look([
  'Cardboard, taped, labelled in Mom\'s handwriting: AIKO — BOOKS. AIKO — WINTER. AIKO — MISC.',
  'You are three boxes and a bag.'
]);

SCRIPTS.futon = () => look(['The futon is gone. Just a paler rectangle of tatami where twelve years of sleeping used to be.']);

SCRIPTS.shelf = () => look(['Empty, except for a dust-line and one hair tie. You take the hair tie. It goes in your hair.']);

SCRIPTS.balcony = () => look([
  'The balcony plant. Nobody packed it.',
  'Four floors down, the movers slam a door. Beyond that, the crossing, the shrine, and Mei, waiting.'
]);

SCRIPTS.shoes = () => look([
  'A shoebox with one pink sandal in it. Size 12. You were four.',
  'The other one went into the Sazanami River, the little one they buried under the road behind the school.',
  'You went in after it. Somebody put you back on the bank. Mom still says it was a stranger.'
], { endFx: [{ type: 'journal', text: 'The Sazanami — the river under the road behind the school. You fell in once.' }, { type: 'flag', id: 'knowsRiver' }] });

/* ============================================================== STREET == */

SCRIPTS.mei = (s) => {
  if (atLeast(s, 'catchTrain')) {
    return talk('Mei', ['Go on. If you cry at the gate I will personally never forgive you.']);
  }
  return {
    start: 'a',
    nodes: {
      a: { speaker: 'Mei', text: 'You\'re late. I\'ve been sitting on a fox for forty minutes.', next: 'b' },
      b: { speaker: 'Mei', text: 'Here. Don\'t open it on the train, you\'ll do the face.', next: 'c' },
      c: {
        speaker: 'Mei',
        text: 'Promise me something stupid. Promise you\'ll come back and be exactly the same.',
        choices: [
          { text: 'I promise.', next: 'p1' },
          { text: 'I can\'t promise that.', next: 'p2' }
        ]
      },
      p1: { speaker: 'Mei', text: 'Liar. Good. Go, before your dad does the watch thing.', next: 'z' },
      p2: { speaker: 'Mei', text: '...Yeah. Okay. Then promise you\'ll remember my name when you\'re old and famous.', next: 'z' },
      z: {
        speaker: 'Mei',
        text: 'Bye, Aiko.',
        fx: [
          { type: 'give', id: 'farewellCard' },
          { type: 'chapter', id: 'catchTrain' },
          { type: 'journal', text: 'Mei gave you a card and made you promise something impossible.' }
        ],
        next: 'end'
      }
    }
  };
};

SCRIPTS.keeper = (s) => {
  if (flag(s, 'gotCoin')) {
    return talk('Shrine Keeper', ['Foxes keep what they\'re given. Remember that where you\'re going.']);
  }
  return talk('Shrine Keeper', [
    'Moving, are you? North, by the look of the van.',
    'Then take this. It came out of the offering box in 1961 and it has been warm ever since.',
    'If somewhere asks you your name, girl — give the one your mother uses. Not the short one your friends use. The whole one.'
  ], { endFx: [{ type: 'give', id: 'foxCoin' }, { type: 'flag', id: 'gotCoin' }] });
};

SCRIPTS.salaryman = () => talk('Man in a Hurry', ['Excuse me. Excuse me. I\'m — yes. Sorry. Excuse me.']);

SCRIPTS.grocer = () => talk('Grocer', [
  'Last one, on the house. You\'ve been buying these since you were up to my knee.',
  'Salted, seaweed, no plum. I remember.'
], { endFx: [{ type: 'give', id: 'riceBall', qty: 2 }] });

SCRIPTS.boy = () => talk('Boy with a Net', ['There\'s a beetle in this drain the size of my thumb and NOBODY believes me.']);

SCRIPTS.cat = () => look(['The alley cat considers you, decides you are leaving, and goes back to sleep.', 'Cats always know first.']);

SCRIPTS.vending = () => look(['Hot corn soup, cold barley tea, and one slot that has said SOLD OUT since you were seven.']);

SCRIPTS.torii = () => look(['The gate is small, red, and older than the buildings leaning over it. You duck through it out of habit.']);

SCRIPTS.foxStatue = () => look(['A stone fox with a chipped ear and a coin held in its mouth. Somebody has tied a bib around its neck.']);

SCRIPTS.streetSign = () => look(['SAKURAGAOKA CROSSING. Under it, in marker: MEI + AIKO, and a date from two summers ago.']);

SCRIPTS.movingVan = () => look(['The van is packed to the roof. Your whole room fits in the left half of it.']);

SCRIPTS.bench = () => look(['A bench. Somebody left a folded umbrella under it, hopefully.']);

/* ============================================================= STATION == */

SCRIPTS.stationMom = (s) => hasItem(s, 'ticket')
  ? talk('Mom', ['Platform 1. Two hours. Don\'t lose the ticket, don\'t lose the bag, don\'t lose that face.'])
  : talk('Mom', ['Ticket machine\'s by the wall. You\'re old enough to buy your own. Kaminohara — the button\'s near the bottom.']);

SCRIPTS.stationDad = () => talk('Dad', [
  'Two hours north and then a hire car from the halt.',
  'The road map\'s got a gap in it. Just a hill and a dotted line. We\'ll figure it out.'
]);

SCRIPTS.attendant = () => talk('Attendant', ['Northbound local, platform one. It stops everywhere. That is its whole personality.']);

SCRIPTS.oldWoman = (s) => talk('Woman in Grey', [
  'Kaminohara. I grew up an hour past it.',
  'Don\'t take the hill road at dusk, and if you find a tunnel, don\'t go in hungry.',
  atLeast(s, 'wrongTurn') ? 'I did say.' : 'That\'s all. That\'s the whole warning. People want more but that\'s all there is.'
], { endFx: [{ type: 'journal', text: 'A woman in grey: don\'t go into the tunnel hungry.' }] });

SCRIPTS.commuter = () => talk('Commuter', ['If you stand exactly here the doors open exactly there. Eleven years of practice.']);

SCRIPTS.ticketMachine = (s) => {
  if (hasItem(s, 'ticket')) return look(['The screen offers you a second ticket. One is plenty.']);
  if (!atLeast(s, 'catchTrain')) return look(['The machine hums. You haven\'t said goodbye yet.']);
  return look([
    'You feed in the notes Mom counted into your hand. The machine thinks about it.',
    'KITANO → KAMINOHARA. ONE. NO RESERVED SEAT.'
  ], { endFx: [{ type: 'give', id: 'ticket' }] });
};

SCRIPTS.kiosk = (s) => hasItem(s, 'riceBall')
  ? look(['You already have food. The woman behind the counter nods at your bag approvingly.'])
  : look(['You buy a rice ball for the train.'], { endFx: [{ type: 'give', id: 'riceBall' }] });

SCRIPTS.departureBoard = () => look([
  'NORTHBOUND LOCAL — 09:42 — KAMINOHARA (2h04)',
  'Below it, a service that isn\'t listed anywhere else: 00:00 — SIXTH STATION. No platform given.'
], { endFx: [{ type: 'journal', text: 'A train on the board with no platform: SIXTH STATION, 00:00.' }] });

/* =============================================================== TRAIN == */

SCRIPTS.trainMom = () => talk('Mom', ['Sleep if you can. It\'s all paddies until the hills, and then it\'s all hills.']);

SCRIPTS.trainDad = () => talk('Dad', [
  'Look — there. That\'s the valley. See how the river goes in and doesn\'t come out?',
  'That\'s just the bend. Probably.'
]);

SCRIPTS.conductor = (s) => flag(s, 'trainStop')
  ? talk('Conductor', ['Mind the step. It\'s a long way down and nobody\'s fixed it since the war.'])
  : talk('Conductor', ['Kaminohara! Kaminohara, next stop. Doors on the right.'], {
    endFx: [{ type: 'flag', id: 'trainStop' }, { type: 'toast', text: 'The train slows. Rice, rice, rice, hill.' }]
  });

SCRIPTS.sleeper = () => look(['Asleep, upright, hands folded. Their ticket says a station you have never heard of.']);

SCRIPTS.trainWindow = () => look([
  'The city thins: towers, then blocks, then houses, then roofs with grass on them.',
  'Then a long green valley, and your own face in the glass over the top of it.'
]);

/* =========================================================== KAMINOHARA == */

SCRIPTS.roadMom = () => talk('Mom', ['It\'s beautiful. Say it\'s beautiful, Aiko, your father is fragile.']);

SCRIPTS.roadDad = (s) => atLeast(s, 'throughTunnel')
  ? talk('Dad', ['We\'ll just have a look. Five minutes. Adventure.'])
  : talk('Dad', [
    'Road stops at the hill. That can\'t be right — the house is on the other side.',
    'There\'s a tunnel, though. Look at that stonework. Somebody built that to last.',
    'Five minutes. We\'ll have a look and come straight back.'
  ], { endFx: [{ type: 'journal', text: 'Dad wants to "have a look" at the tunnel.' }] });

SCRIPTS.tsuda = (s) => talk('Old Man Tsuda', [
  'You\'re the family for the Kubo house. Thought you\'d come in October.',
  atLeast(s, 'throughTunnel')
    ? 'You went in there. I can see it on you — you\'ve got the tunnel on your face.'
    : 'If your father asks about the hill road: there isn\'t one. There\'s a hole, and there\'s a road, and they aren\'t the same thing.',
  'My sister went through in \'53. Came out four days later and never ate rice again.'
], { endFx: [{ type: 'journal', text: 'Tsuda\'s sister went into the tunnel in 1953 and came out different.' }] });

SCRIPTS.cyclist = () => talk('Girl on a Bicycle', [
  'You\'re new! Nobody\'s new here.',
  'School\'s a bus and a half away. I\'ll show you the shortcut if you promise not to use the hill one.'
]);

SCRIPTS.redFox = () => look([
  'A real fox, red as rust, sitting in the road like it pays tax on it.',
  'It looks at you, then very deliberately at the hill, then back at you. Then it goes.'
]);

SCRIPTS.parkedCar = (s) => atLeast(s, 'forbiddenFeast')
  ? look(['The hire car sits where Dad left it. Leaves have drifted against the tyres. Not this afternoon\'s leaves.'])
  : look(['The hire car, parked where the road gave up. Dad left the keys in it, because "nobody\'s here".']);

SCRIPTS.countryTorii = () => look(['A gate the colour of dried blood, standing in a field with nothing behind it. It was a shrine once.']);

SCRIPTS.stoneFox = (s) => look([
  'Another stone fox, mossed to the eyes. Same chipped ear as the one at Sakuragaoka.',
  hasItem(s, 'foxCoin') ? 'The coin in your bag goes warm enough to feel through the canvas.' : 'Its mouth is empty. Something is missing from it.'
]);

SCRIPTS.jizo = () => look(['A small stone figure in a red bib, at the exact spot where the road stops pretending.']);

SCRIPTS.scarecrow = () => look(['A scarecrow in a school jacket. The jacket is the same as the one in your box marked WINTER.']);

SCRIPTS.well = () => look(['The well Mom promised. You drop a pebble. You count to four before it lands.']);

SCRIPTS.busStop = () => look(['KAMINOHARA HALT — 1 service daily, 06:40. In winter, "as able".']);

SCRIPTS.tunnelSign = () => look([
  'A wooden sign, silvered with age, nailed over an older sign.',
  'The new one says: PRIVATE. NO ENTRY.',
  'The old one, underneath, in characters you half-know: GUESTS ONLY BEYOND. NAMES AT THE GATE.'
], { endFx: [{ type: 'journal', text: 'The old sign at the tunnel: GUESTS ONLY BEYOND. NAMES AT THE GATE.' }] });

SCRIPTS.bicycleProp = () => look(['A rusted bicycle, half in the ditch. Something about it snags at you, and then doesn\'t.'],
  { endFx: [{ type: 'flag', id: 'sawBicycle' }] });

/* ============================================================== TUNNEL == */

SCRIPTS.tunnelBench = () => look([
  'A waiting room, hollowed into the rock. Benches. A bin. A ticket window with the shutter down.',
  'Waiting for what? The tunnel doesn\'t go anywhere but through.'
]);

SCRIPTS.tunnelLantern = (s) => hasItem(s, 'lanternStub')
  ? look(['The stub in your bag is enough. Leave the rest for whoever comes next.'])
  : look([
    'A candle stub on the sill of the shuttered window, burning in a place with no air moving.',
    'You take it. It does not go out.'
  ], { endFx: [{ type: 'give', id: 'lanternStub' }] });

SCRIPTS.tunnelDust = () => look([
  'The dust on the floor is disturbed in two lines, going out. Nothing comes back in.',
  'Ahead, Dad\'s voice, far too far ahead: "There\'s light! Come on!"'
]);

/* ============================================================== MARKET == */

SCRIPTS.feastScene = () => look([
  'The tunnel lets you out into low gold light and a smell of food so strong it has weight.',
  'Stalls. Dozens of them, all empty, all cooking. Steam going up from pots nobody is watching.',
  'Mom: "Hello? ...There must be somebody. We\'ll pay, obviously."',
  'Dad is already sitting down.'
], {
  endFx: [
    { type: 'chapter', id: 'forbiddenFeast' },
    { type: 'journal', text: 'Empty stalls, hot food, nobody cooking it.' },
    { type: 'sfx', id: 'wind' }
  ]
});

SCRIPTS.feastMom = (s) => {
  const other = flag(s, 'warnedDad');
  return talk('Mom', [
    'Mmh — Aiko, sit down, you have to try this. We\'ll leave money on the counter.',
    'Don\'t make that face. Nobody is coming.'
  ], {
    endFx: other
      ? [{ type: 'flag', id: 'warnedMom' }, { type: 'cutscene', id: 'transformation' }]
      : [{ type: 'flag', id: 'warnedMom' }, { type: 'toast', text: 'She isn\'t listening. Neither is he.' }]
  });
};

SCRIPTS.feastDad = (s) => {
  const other = flag(s, 'warnedMom');
  return talk('Dad', [
    'Credit card. Cash. Whatever they want, we\'ll pay when they turn up.',
    'Twelve years old and worried about a bill. Sit down, Aiko.'
  ], {
    endFx: other
      ? [{ type: 'flag', id: 'warnedDad' }, { type: 'cutscene', id: 'transformation' }]
      : [{ type: 'flag', id: 'warnedDad' }, { type: 'toast', text: 'He waves you off with a skewer.' }]
  });
};

SCRIPTS.transformation = () => look([
  'You back away from the counter, and the light changes — not dims. Changes. Like a page turning.',
  'Lanterns come on down the whole hill at once.',
  'Your mother\'s sleeve is empty. Your father\'s chair is full of something that is not your father.',
  'Two hogs of wet red clay stand where they were sitting, still chewing, and their eyes are the wrong eyes.',
  'Behind you, the way back is dark, and there is water moving in it.'
], {
  endFx: [
    { type: 'flag', id: 'parentsLost' },
    { type: 'journal', text: 'They ate. They are hogs now. The tunnel is under water.' },
    { type: 'shake', power: 8 },
    { type: 'sfx', id: 'dread' },
    { type: 'heart', by: -1 }
  ]
});

SCRIPTS.clayHog = () => look([
  'It is the size of a large dog and the colour of a flowerpot, and when you say "Mom" it stops chewing.',
  'Then it starts again.'
]);

SCRIPTS.marketRen = (s) => {
  if (!flag(s, 'parentsLost')) {
    return talk('Ren', [
      'You shouldn\'t be here. Nobody with a shadow should be here.',
      'Get them away from that counter. Now — before the lamps come on.'
    ]);
  }
  return {
    start: 'a',
    nodes: {
      a: { speaker: 'Ren', text: 'Don\'t scream. If you scream they\'ll hear what you are.', next: 'b' },
      b: { speaker: 'Ren', text: 'Eat this. Food from here, or you\'ll go thin and blow away — you\'re already going see-through at the fingers.', fx: [{ type: 'give', id: 'riceBall', qty: 2 }, { type: 'heart', by: 1 }], next: 'c' },
      c: {
        speaker: 'Ren',
        text: 'Now listen, because I will only get to say it once. Everything here belongs to Lady Yuzuki, and she throws out anything idle. So don\'t be idle.',
        next: 'd'
      },
      d: {
        speaker: 'Ren',
        text: 'Cross the bridge. Go down to the boiler room, find Kamashiro, and ask him for work. Ask, and keep asking. He must give it to you if you ask.',
        choices: [
          { text: 'Who are you?', next: 'who' },
          { text: 'What about my parents?', next: 'parents' },
          { text: 'Why are you helping me?', next: 'why' }
        ]
      },
      who: { speaker: 'Ren', text: 'Ren. That\'s the name I\'m allowed. It isn\'t the one I had.', next: 'end2' },
      parents: { speaker: 'Ren', text: 'They\'re not dead. They\'re inventory. That\'s worse and better at the same time. I\'ll keep them fed.', next: 'end2' },
      why: { speaker: 'Ren', text: '...Because I knew you when you were four. Go. Bridge. Now.', next: 'end2' },
      end2: {
        speaker: 'Ren',
        text: 'Hold your breath crossing the bridge. All the way over. Don\'t let one breath out.',
        fx: [
          { type: 'chapter', id: 'findWork' },
          { type: 'flag', id: 'metRen' },
          { type: 'journal', text: 'Ren: cross the bridge holding your breath. Ask Kamashiro for work.' }
        ],
        next: 'end'
      }
    }
  };
};

SCRIPTS.stallCook = (s) => {
  if (sideDone(s, 'stallKeeper')) {
    return talk('The Cook', ['Cold pots. Quiet street. It\'s the best shift I\'ve had in three hundred years.']);
  }
  if (!flag(s, 'sawFeast')) {
    return talk('The Cook', ['...You wouldn\'t understand yet. Go and look at what\'s on my counter first.']);
  }
  return talk('The Cook', [
    'I cooked all of it. Every night, for guests who stopped coming when the road went in.',
    'So I kept cooking. What else do you do? You keep the pots on and you wait.',
    'And then people like your parents wander in and eat it, and I get the blame for the trap.',
    'Tell you what. Take the pots off for me. I\'ve wanted somebody to say it was allowed.'
  ], {
    endFx: [
      { type: 'side', id: 'stallKeeper' },
      { type: 'journal', text: 'The Cook let the fires go out. The market smells of nothing now.' }
    ]
  });
};

SCRIPTS.shade = () => look(['A shape like a person made of held breath. It bows to you, politely, and keeps walking.']);

SCRIPTS.feastTable = (s) => look([
  'Skewers, dumplings, a fish with its mouth open, all steaming, all untouched by anybody who lives here.',
  atLeast(s, 'forbiddenFeast') ? 'Two plates are scraped clean. You know whose.' : 'Nobody is cooking it and nobody is eating it.'
], { endFx: [{ type: 'flag', id: 'sawFeast' }] });

SCRIPTS.handlessClock = () => look(['A station clock with no hands, and a timetable board underneath: DEPARTURES — SIXTH STATION — ALWAYS.']);

SCRIPTS.marketSign = () => look(['Down the steps: lanterns, a bridge, and a building nine floors high with steam coming off it like a kettle.']);

SCRIPTS.emptyPot = (s) => look([
  'One pot with nothing in it, scrubbed clean and put back upside down.',
  flag(s, 'sawFeast') ? 'Somebody here still tidies up. That means somebody here is still a person.' : 'Odd, among all this food.'
]);

SCRIPTS.penHog = () => look([
  'A hog. Red clay, wet eyes, chewing.',
  'You look for something of your mother in it. You find a hog looking back.'
]);

SCRIPTS.finalTest = (s) => {
  if (isChapter(s, 'done')) {
    return talk('Lady Yuzuki', ['A deal is a deal. I hate it. Go, before I find a clause.']);
  }
  return {
    start: 'a',
    nodes: {
      a: { speaker: 'Lady Yuzuki', text: 'One test, {name}. That was the bargain, and I always keep the bargain — that is what makes me dangerous, not the other thing.', next: 'b' },
      b: { speaker: 'Lady Yuzuki', text: 'Four hogs. Point to your mother and father, and if you are right, all three of you walk up the hill. One guess.', next: 'c' },
      c: {
        speaker: 'Lady Yuzuki',
        text: 'Well? Which of them are yours?',
        choices: [
          { text: 'The two on the left.', next: 'wrong' },
          { text: 'The two on the right.', next: 'wrong' },
          { text: 'The first and the last.', next: 'wrong' },
          { text: 'Neither. None of these are my parents.', next: 'right' }
        ]
      },
      wrong: {
        speaker: 'Lady Yuzuki',
        text: 'Look again, child, and look properly. I said one guess, but I did not say when you had to make it.',
        next: 'c'
      },
      right: {
        speaker: 'Lady Yuzuki',
        text: '...How.',
        next: 'r2'
      },
      r2: {
        speaker: '{name}',
        text: 'Because they aren\'t here. They haven\'t been here since I took the job. You\'ve been holding an empty pen and a straight face.',
        next: 'r3'
      },
      r3: {
        speaker: 'Lady Yuzuki',
        text: 'Aiko. There. Have it back, all four characters, and take your hogs and your dragon and your bitter little cake and GO.',
        fx: [
          { type: 'rename', name: 'Aiko' },
          { type: 'chapter', id: 'done' },
          { type: 'give', id: 'hogCharm' },
          { type: 'journal', text: 'She said your name out loud. It fit.' },
          { type: 'sfx', id: 'chapter' }
        ],
        next: 'r4'
      },
      r4: {
        speaker: 'Lady Yuzuki',
        text: 'Up the steps. Through the clock house. Into the tunnel — and do not look behind you, not once, or the whole thing unwinds.',
        next: 'end'
      }
    }
  };
};

/* ============================================================== BRIDGE == */

SCRIPTS.bridgeMeeting = () => look([
  'The bridge is packed with things that are almost shapes, all going the other way, all sniffing.',
  'Ren, at your shoulder: "Breathe in. Now hold it. All the way across. Every step."',
  'You hold it. Nine lamps go by. Something enormous passes close enough to move your hair.',
  'On the far side you let it out, and a frog in a waistcoat turns around very slowly.'
], { endFx: [{ type: 'sfx', id: 'dread' }, { type: 'journal', text: 'You breathed. Something noticed.' }] });

SCRIPTS.bridgeRen = () => talk('Ren', [
  'Down the stairs at the far end of the floor, all the way to the bottom. The boiler room.',
  'Kamashiro has six arms and no patience. Ask him for work anyway. Ask until he gives it to you.',
  'And whatever they offer you up in the office — do not eat, do not thank them, and do not give more of your name than you have to.'
]);

SCRIPTS.lamplighter = (s) => {
  if (sideDone(s, 'lampLighter')) {
    return talk('The Lamplighter', ['Nine out of nine. First time since the road went in. Here — you\'ve earned a wage.'], {
      endFx: flag(s, 'lampReward') ? [] : [{ type: 'give', id: 'riverStone' }, { type: 'flag', id: 'lampReward' }, { type: 'journal', text: 'The lamplighter paid you in a river stone.' }]
    });
  }
  return talk('The Lamplighter', [
    'Nine lamps on this bridge. Six burn. Three have been dark since before you were an idea.',
    'A stub of candle would do it — the kind that won\'t blow out. There was one in the tunnel, if the tunnel still has it.',
    `Three dark. ${3 - (s.side.lampLighter ?? 0)} to go.`
  ]);
};

SCRIPTS.darkLamp = (s) => {
  if (!hasItem(s, 'lanternStub')) {
    return look(['A dark lamp, wick intact, nothing to light it with.']);
  }
  return look([
    'You touch the stub to the wick. The flame does not so much catch as agree.',
    'Something far below the bridge goes quiet to watch.'
  ], { endFx: [{ type: 'side', id: 'lampLighter' }, { type: 'flag', id: 'litOne' }] });
};

SCRIPTS.radishSpirit = () => talk('Radish Spirit', ['...', 'It steps aside for you. That is, apparently, an enormous courtesy, because everyone stares.']);

SCRIPTS.guestFrog = () => talk('A Guest', ['Two nights, herb bath, and if the water is cold again I shall write to somebody.']);

SCRIPTS.hollowBridge = () => look([
  'A tall figure in a white mask stands at the rail, not crossing, not leaving.',
  'You stand aside to let it pass. It does not pass. It bows.',
  'It is still there when you look back.'
], { endFx: [{ type: 'flag', id: 'noticedHollow' }, { type: 'journal', text: 'Something in a white mask bowed to you on the bridge.' }] });

SCRIPTS.gateSign = () => look(['Carved into the gatepost, worn nearly smooth: NAMES AT THE GATE. GUESTS ONLY BEYOND.']);

/* =========================================================== BATHHOUSE == */

SCRIPTS.gansuke = (s) => {
  if (isChapter(s, 'findWork')) {
    return talk('Gansuke', [
      'A human. On my floor. Smelling like the outside of everything.',
      'Staff entrance, girl. Down the stairs. If Kamashiro won\'t have you, nobody will.'
    ]);
  }
  if (flag(s, 'sawLedger') && !sideDone(s, 'frogLedger')) {
    return {
      start: 'a',
      nodes: {
        a: { speaker: 'Gansuke', text: 'You\'ve been reading my ledger. I can tell. You have a reading face.', next: 'b' },
        b: {
          speaker: 'Gansuke',
          text: 'Column four doesn\'t add. It hasn\'t added for sixty years. What are you going to do about it?',
          choices: [
            { text: 'Tell Lady Yuzuki.', next: 'tell', fx: [{ type: 'side', id: 'frogLedger' }, { type: 'flag', id: 'toldOnGansuke' }] },
            { text: 'Nothing. It\'s your ledger.', next: 'quiet', fx: [{ type: 'side', id: 'frogLedger' }, { type: 'flag', id: 'sparedGansuke' }] }
          ]
        },
        tell: { speaker: 'Gansuke', text: 'Then I am finished, and you are exactly what you smell like. Fine. FINE. At least it\'s over.', next: 'end' },
        quiet: {
          speaker: 'Gansuke',
          text: '...Sixty years, and the first person who catches me is a human child who says nothing.',
          next: 'quiet2'
        },
        quiet2: {
          speaker: 'Gansuke',
          text: 'Take this. Old rail token, no expiry — nothing here expires. You never know.',
          fx: [{ type: 'give', id: 'railToken' }],
          next: 'end'
        }
      }
    };
  }
  return talk('Gansuke', ['Bath fees, bath fees, bath fees. Nobody thanks the frog who counts.']);
};

SCRIPTS.osen = (s) => atLeast(s, 'riverGuest')
  ? talk('Osen', ['You did the stink guest. Nobody does the stink guest. You\'re all right, {name}.'])
  : talk('Osen', [
    'Keep your head down and your hands moving and they forget to hate you by the second week.',
    'And eat. I mean it. I\'ve seen humans go thin in here — you can see the wall through them by the end.'
  ]);

SCRIPTS.bathHand = () => talk('Bath Hand', ['Sixth floor tub, and I am not carrying the buckets, and that is FINAL.']);

SCRIPTS.bathRen = (s) => {
  if (isChapter(s, 'hollowGuest')) {
    return talk('Ren', ['Not now — whatever the masked thing is offering, don\'t take it. It gives you what you want until there\'s no you left.']);
  }
  if (isChapter(s, 'sixthStation') && !hasItem(s, 'goldSeal')) {
    return talk('Ren', ['...Take it. The seal. I stole it from the marsh house and it is eating me from the inside. Take it back to her. Please.'], {
      endFx: [{ type: 'give', id: 'goldSeal' }, { type: 'journal', text: 'Ren is hurt. The gold seal has to go back to the marsh house.' }]
    });
  }
  if (atLeast(s, 'remember')) {
    return talk('Ren', ['I have a river again. It\'s under a road, and it\'s mine.']);
  }
  return talk('Ren', ['Eat with the others. Sleep when they sleep. And come and find me on the balcony when the floor is quiet.']);
};

SCRIPTS.riverGuest = (s) => {
  if (!flag(s, 'drewHerbBath')) {
    return look([
      'The thing in the great tub is the shape of a wave that has given up.',
      'It reeks — rot, oil, standing water. The staff have all found somewhere else to be.',
      'It needs a bath drawn. The herb chute is on the far wall, and the chute wants a token.'
    ]);
  }
  return {
    start: 'a',
    nodes: {
      a: { speaker: '', text: 'The herb water goes in green and comes up brown. The thing in the tub sighs like a door.', next: 'b' },
      b: { speaker: '', text: 'Something under the muck snags your hand. A handlebar. There is a bicycle inside this guest.', next: 'c' },
      c: {
        speaker: '',
        text: 'You get a grip on it and pull.',
        choices: [
          { text: 'Pull with everything you have.', next: 'pull' },
          { text: 'Call the whole floor to help.', next: 'call' }
        ]
      },
      pull: { speaker: '', text: 'It comes: the bicycle, a bucket, forty metres of fencing, and a river\'s worth of black water going out through the doors.', next: 'd' },
      call: { speaker: '', text: 'You shout, and for the first time the whole floor pulls on one rope with a human girl at the front of it.', next: 'd' },
      d: {
        speaker: 'The Guest',
        text: 'Well done. WELL DONE. I had forgotten I was a river at all.',
        next: 'e'
      },
      e: {
        speaker: 'The Guest',
        text: 'Take this cake, girl. It is bitter enough to make anything let go of anything — even a thing that has swallowed something it shouldn\'t. And take a stone of mine.',
        fx: [
          { type: 'give', id: 'bitterCake' },
          { type: 'give', id: 'riverStone' },
          { type: 'side', id: 'riverMemory' },
          { type: 'chapter', id: 'hollowGuest' },
          { type: 'journal', text: 'The stink guest was a river full of rubbish. It left you a bitter cake.' },
          { type: 'sfx', id: 'chime' }
        ],
        next: 'end'
      }
    }
  };
};

SCRIPTS.hollowBath = (s) => {
  if (!hasItem(s, 'bitterCake')) {
    return look(['The masked thing turns towards you and offers a double handful of gold. Behind it, a bath hand is missing.']);
  }
  return {
    start: 'a',
    nodes: {
      a: { speaker: 'The Hollow One', text: 'Gold. All of it. Take it. Take it. Take it and be pleased with me.', next: 'b' },
      b: {
        speaker: '',
        text: 'It has eaten three of the staff and it is still empty. It is the emptiest thing you have ever stood in front of.',
        choices: [
          { text: 'Give it the bitter cake.', next: 'cake' },
          { text: '"I don\'t want your gold. What do you actually want?"', next: 'talk' }
        ]
      },
      talk: { speaker: 'The Hollow One', text: '...I want. I want. I don\'t know the end of that sentence. Nobody ever taught me it.', next: 'b' },
      cake: {
        speaker: '',
        text: 'It takes the cake in both hands, like something being handed a homework assignment, and eats it.',
        fx: [{ type: 'take', id: 'bitterCake', quiet: true }],
        next: 'c'
      },
      c: { speaker: '', text: 'Then it gives back everything. All of it. Staff, gold, floorboards, a lot of noise, and finally its own voice.', next: 'd' },
      d: { speaker: 'The Hollow One', text: 'Lonely. That was the word. Lonely.', next: 'e' },
      e: {
        speaker: '',
        text: 'It follows you at a polite distance for the rest of the night, and does not eat one single thing.',
        fx: [
          { type: 'flag', id: 'hollowFollowed' },
          { type: 'chapter', id: 'sixthStation' },
          { type: 'journal', text: 'The Hollow One is empty and following you, quietly, like a coat.' },
          { type: 'sfx', id: 'chapter' }
        ],
        next: 'end'
      }
    }
  };
};

SCRIPTS.herbChute = (s) => {
  if (flag(s, 'drewHerbBath')) return look(['The chute is spent. The great tub is full and green and steaming.']);
  if (!isChapter(s, 'riverGuest')) return look(['A brass chute in the wall. Feed it a token, get a scented bath. The tokens live in the boiler room.']);
  if (!hasItem(s, 'herbToken')) return look(['The chute wants a herb token. Kamashiro keeps them in the drawers downstairs.']);
  return look([
    'You post the token. Somewhere three floors down, Kamashiro swears and pulls a rope.',
    'Green water thunders into the great tub.'
  ], { endFx: [{ type: 'take', id: 'herbToken', quiet: true }, { type: 'flag', id: 'drewHerbBath' }, { type: 'sfx', id: 'chime' }] });
};

SCRIPTS.liftProp = () => look(['A lift the size of a room, worked by a rope as thick as your leg. It goes up to the office and nowhere else.']);

SCRIPTS.bucket = () => look(['Buckets, brushes, and a mop taller than you. Your hands know what to do with all of it now.']);

SCRIPTS.ledgerProp = () => look([
  'Gansuke\'s ledger, open at the fees column.',
  'Column four is short. Every night, by a little. Sixty years of a little.'
], { endFx: [{ type: 'flag', id: 'sawLedger' }, { type: 'journal', text: 'The bath ledger is short in column four. Every night.' }] });

SCRIPTS.noticeBoard = (s) => look([
  'STAFF NOTICE — Idle hands are thrown out. Idle mouths are eaten.',
  `Under it, the shift list. Your name is on it, in a hand you don't recognise: ${s.calledName}.`
]);

/* ========================================================= BOILER ROOM == */

SCRIPTS.kamashiro = (s) => {
  if (isChapter(s, 'findWork')) {
    return {
      start: 'a',
      nodes: {
        a: { speaker: 'Kamashiro', text: 'No. No openings. Got all the hands I need — count them, six, all mine.', next: 'b' },
        b: {
          speaker: 'Kamashiro',
          text: 'Well? Still here?',
          choices: [
            { text: 'Please give me work.', next: 'again' },
            { text: 'Please give me work.', next: 'again2' },
            { text: 'I\'m not leaving until you do.', next: 'yes' }
          ]
        },
        again: { speaker: 'Kamashiro', text: 'No.', next: 'b' },
        again2: { speaker: 'Kamashiro', text: 'NO. ...Ask me once more.', next: 'b' },
        yes: {
          speaker: 'Kamashiro',
          text: 'Hah! Stubborn. Fine — I\'ll say you\'re my granddaughter, and the old woman upstairs can argue with that.',
          next: 'z'
        },
        z: {
          speaker: 'Kamashiro',
          text: 'Take the lift. Sign her contract. And girl — hold onto your name. She collects them, and people who lose theirs never find the road home.',
          fx: [
            { type: 'chapter', id: 'loseName' },
            { type: 'journal', text: 'Kamashiro will vouch for you. Sign Yuzuki\'s contract — and keep your name.' }
          ],
          next: 'end'
        }
      }
    };
  }
  if (isChapter(s, 'firstShift')) {
    const coal = hasItem(s, 'coalLump');
    const herbs = itemCount(s, 'herbToken') >= 3;
    if (coal && herbs) {
      return talk('Kamashiro', [
        'Coal. Herbs. Both, on the first shift, without whining.',
        'You\'ll do. Get upstairs — there\'s a guest coming in that\'s making the whole river stink, and nobody else will touch it.'
      ], {
        endFx: [
          { type: 'take', id: 'coalLump', quiet: true },
          { type: 'chapter', id: 'riverGuest' },
          { type: 'journal', text: 'Kamashiro says the stink guest is yours. Everyone else has vanished.' }
        ]
      });
    }
    return talk('Kamashiro', [
      `Coal from the chute — ${coal ? 'got it' : 'still nothing'}. Herb tokens, three of them — you have ${itemCount(s, 'herbToken')}.`,
      'The drawers are along the back wall. The coal is where coal is. Move.'
    ]);
  }
  if (isChapter(s, 'sixthStation') && !hasItem(s, 'railToken')) {
    return talk('Kamashiro', [
      'The dragon\'s hurt and the seal\'s cursed, and you\'re going to the marsh house whatever I say.',
      'Take it. Forty years I\'ve kept that token, waiting to be forty years too old to use it.',
      'One ride. The water rail only goes out. Coming back is your own problem, and hers.'
    ], { endFx: [{ type: 'give', id: 'railToken' }, { type: 'journal', text: 'Kamashiro gave you a rail token. The water rail only goes out.' }] });
  }
  return talk('Kamashiro', ['Six arms and not one of them free. Talk while you work or don\'t talk.']);
};

SCRIPTS.cinderMite = (s) => {
  if (sideDone(s, 'cinderPay')) {
    return look(['The mites have a coal each and are being extremely dramatic about it.']);
  }
  if (hasItem(s, 'coalLump') && atLeast(s, 'firstShift')) {
    return {
      start: 'a',
      nodes: {
        a: { speaker: '', text: 'A cinder mite the size of your fist staggers past under a lump of coal twice its size. Then another. Then forty.', next: 'b' },
        b: {
          speaker: '',
          text: 'They work all night and are paid in absolutely nothing.',
          choices: [
            { text: 'Give one of them your coal.', next: 'give', fx: [{ type: 'take', id: 'coalLump', quiet: true }, { type: 'side', id: 'cinderPay' }] },
            { text: 'You need the coal. Keep it.', next: 'keep' }
          ]
        },
        give: {
          speaker: '',
          text: 'The mite takes it, stares at it, and shrieks. Forty mites shriek back. Somebody has been PAID.',
          next: 'give2'
        },
        give2: {
          speaker: 'Kamashiro',
          text: 'Now you\'ve done it. They\'ll expect it. ...Here, take a token for the chute, and get out of my boiler room, you soft-hearted disaster.',
          fx: [{ type: 'give', id: 'herbToken' }, { type: 'journal', text: 'You paid a cinder mite. The others are still shrieking.' }],
          next: 'end'
        },
        keep: { speaker: '', text: 'You keep it. The mite goes past you again with its own load and does not complain, because it cannot.', next: 'end' }
      }
    };
  }
  return look(['Cinder mites: soot, legs, and a work ethic. One of them salutes you with a coal lump.']);
};

SCRIPTS.coalPile = (s) => hasItem(s, 'coalLump')
  ? look(['You already have a lump. Any more and you\'d tip over.'])
  : look(['You wrestle a lump of coal out of the chute. It is heavier than you and it knows it.'],
    { endFx: [{ type: 'give', id: 'coalLump' }] });

SCRIPTS.herbDrawers = (s) => {
  const n = itemCount(s, 'herbToken');
  if (n >= 3 && !atLeast(s, 'riverGuest')) return look(['Three tokens is what he asked for. Any more and he\'ll say something about greed.']);
  if (n >= 5) return look(['The drawer sticks. You have plenty.']);
  return look([
    'A wall of little drawers, each smelling of a different mountain.',
    'You take a wooden token from the chute drawer.'
  ], { endFx: [{ type: 'give', id: 'herbToken' }] });
};

SCRIPTS.kettle = () => look(['A kettle the size of a bath, on a fire the size of a bath. Kamashiro drinks from it directly. Somehow.']);

SCRIPTS.boilerNook = (s) => look([
  'A nook behind the drawers with a folded blanket in it. Somebody has put a cup of water beside it.',
  atLeast(s, 'loseName') ? 'It is where you sleep now.' : 'It is somebody\'s bed.'
]);

/* ============================================================== OFFICE == */

SCRIPTS.yuzuki = (s) => {
  if (isChapter(s, 'loseName')) {
    return {
      start: 'a',
      nodes: {
        a: { speaker: 'Lady Yuzuki', text: 'So. The boiler man\'s "granddaughter". You reek of the outside and you have a shadow like a spilled drink.', next: 'b' },
        b: { speaker: 'Lady Yuzuki', text: 'Say what you came to say, and say it properly.', next: 'c' },
        c: {
          speaker: 'Lady Yuzuki',
          text: 'Well?',
          choices: [
            { text: '"Please give me work."', next: 'd' },
            { text: '"Give me back my parents."', next: 'no' }
          ]
        },
        no: { speaker: 'Lady Yuzuki', text: 'They ate what wasn\'t theirs. That is a contract too, and theirs is worse than the one I\'m offering you. Try again.', next: 'c' },
        d: {
          speaker: 'Lady Yuzuki',
          text: 'I have to. That is the law of this house and I have loathed it for nine hundred years. Sign.',
          next: 'sign'
        },
        sign: {
          speaker: '',
          text: 'You write your name. Four characters. A-i-k-o. She leans over the paper and breathes in.',
          next: 'sign2'
        },
        sign2: {
          speaker: '',
          text: 'Three of the characters lift off the page and go into her hand like startled insects.',
          next: 'sign3'
        },
        sign3: {
          speaker: 'Lady Yuzuki',
          text: 'What a lot of name for a small girl. One is plenty. From now you are Ko. Answer to it.',
          fx: [
            { type: 'rename', name: 'Ko' },
            { type: 'chapter', id: 'firstShift' },
            { type: 'flag', id: 'nameTaken' },
            { type: 'journal', text: 'She took three characters. You are Ko now. Your name was Aiko. Aiko. Aiko.' },
            { type: 'sfx', id: 'dread' }
          ],
          next: 'sign4'
        },
        sign4: {
          speaker: 'Lady Yuzuki',
          text: 'Down to the boiler floor, Ko. Do exactly what Kamashiro tells you and do not be interesting.',
          next: 'end'
        }
      }
    };
  }
  if (isChapter(s, 'sixthStation')) {
    return talk('Lady Yuzuki', ['My sister has the seal, has she? Then you are going to the sixth station, and I am going to pretend I did not hear it.']);
  }
  return talk('Lady Yuzuki', ['Work, {name}. Nobody idle stays in my house.']);
};

SCRIPTS.heir = (s) => atLeast(s, 'sixthStation')
  ? talk('The Heir', ['You went OUTSIDE. Was it big? Was it dirty? Take me next time. TAKE ME NEXT TIME.'])
  : talk('The Heir', [
    'A child the size of a room, in a nest of cushions behind the screen.',
    '"Outside is full of germs and Mother says I would DIE. Play with me or I shall scream and she will come."'
  ]);

SCRIPTS.contractProp = () => look([
  'A contract in nine hundred columns, and a space at the bottom the size of a name.',
  'Everyone who ever signed is on here. Most of the names are one character long.'
]);

SCRIPTS.brazier = () => look(['Gold coals, no smoke. The room is warm the way a mouth is warm.']);

SCRIPTS.nameBox = (s) => {
  if (!flag(s, 'nameTaken')) return look(['A lacquer box on a stand, shut, humming faintly like a wasp in a jar.']);
  if (hasItem(s, 'nameSlip')) return look(['The box is open and empty. She has not noticed yet.']);
  return look([
    'The lacquer box hums. Inside, folded paper slips — hundreds of them, each one somebody\'s name.',
    'One of them is warm. You do not open it. Not here.'
  ], { endFx: [{ type: 'journal', text: 'Yuzuki keeps the taken names in a lacquer box in her office.' }] });
};

/* ========================================================== WATER RAIL == */

SCRIPTS.railman = (s) => hasItem(s, 'railToken')
  ? talk('The Rail Attendant', ['Sixth station. One way. It has always been one way and nobody has ever complained, which tells you something.'])
  : talk('The Rail Attendant', ['No token, no ride. And no, I don\'t take gold. Everyone tries the gold.']);

SCRIPTS.waitingShade = () => look(['A shade waiting on the platform with a paper bag on its knees. It has been waiting a long time and does not mind.']);

SCRIPTS.railSign = () => look(['SIXTH STATION — DEPARTS ALWAYS — RETURNS: (the character here has been scratched out)']);

SCRIPTS.railCar = (s) => {
  if (!hasItem(s, 'railToken')) return look(['The car waits, half-full of shades, doors open. It will not move for you.']);
  return look([
    'You give up the token. The car slides out onto water an inch deep and a world wide.',
    'Sunset for an hour. Then houses standing in the shallows with their lamps on, for nobody.',
    'Then a stop with one bench and a sign: SIXTH STATION.'
  ], {
    endFx: [
      { type: 'take', id: 'railToken', quiet: true },
      { type: 'teleport', to: { area: 'marshhouse', x: 17 * 32 + 16, y: 21 * 32 + 16, dir: 'up' } },
      { type: 'journal', text: 'You rode the water rail out to the sixth station.' }
    ]
  });
};

/* ========================================================= MARSH HOUSE == */

SCRIPTS.yumeno = (s) => {
  if (hasItem(s, 'goldSeal')) {
    return {
      start: 'a',
      nodes: {
        a: { speaker: 'Granny Yumeno', text: 'Well. You are not my sister and you are not a dragon, so you must be the human everyone is shouting about.', next: 'b' },
        b: { speaker: '', text: 'She looks exactly like Lady Yuzuki, in a cardigan, with kind eyes and the same terrible chin.', next: 'c' },
        c: {
          speaker: 'Granny Yumeno',
          text: 'You have my seal. It kills whoever carries it, you know. Why isn\'t it killing you?',
          choices: [
            { text: '"I\'m giving it back."', next: 'd' },
            { text: '"I didn\'t take it. Ren did, for her."', next: 'd' }
          ]
        },
        d: {
          speaker: 'Granny Yumeno',
          text: 'Ah. Then the protection was in the giving-back, and you did that before you sat down. Tea?',
          fx: [{ type: 'take', id: 'goldSeal', quiet: true }, { type: 'flag', id: 'sealReturned' }],
          next: 'e'
        },
        e: { speaker: 'Granny Yumeno', text: 'My sister and I are the same person who chose differently, which is the only real difference there is between anybody.', next: 'f' },
        f: {
          speaker: 'Granny Yumeno',
          text: 'She keeps names in a box. I keep them in a grove, where they can grow back. Here — this fell out of her box. It is yours.',
          fx: [{ type: 'give', id: 'nameSlip' }, { type: 'give', id: 'riverStone' }, { type: 'side', id: 'riverMemory' }],
          next: 'g'
        },
        g: { speaker: 'Granny Yumeno', text: 'And when she sets you her little test — and she will — remember: she cheats. Look for what is not there.', next: 'h' },
        h: {
          speaker: 'Granny Yumeno',
          text: 'Now. Your dragon has come up the marsh looking half-dead and entirely stubborn. Go with him. Give him back what he lost, and he will do the same for you.',
          fx: [
            { type: 'chapter', id: 'remember' },
            { type: 'journal', text: 'Yumeno: she cheats. Look for what is not there.' },
            { type: 'teleport', to: { area: 'grove', x: 20 * 32 + 16, y: 24 * 32 + 16, dir: 'up' } }
          ],
          next: 'end'
        }
      }
    };
  }
  return talk('Granny Yumeno', ['Sit down, drink something, and stop apologising. You have done nothing yet that needs it.']);
};

SCRIPTS.hollowSettled = () => talk('The Hollow One', [
  'I am helping. I can spin. I am good at it and nobody has been eaten in some time.',
  'You may visit. That is — if you would like to. If you would like to.'
]);

SCRIPTS.spinningWheel = () => look(['A spinning wheel, working by itself, making thread out of what looks like pond light.']);

SCRIPTS.teapot = () => look(['Tea, poured before you asked. It tastes like the inside of your grandmother\'s house.'],
  { endFx: [{ type: 'heart', by: 2 }] });

/* =============================================================== GROVE == */

SCRIPTS.groveRen = (s) => {
  if (atLeast(s, 'homeward')) {
    return talk('Ren', ['Go on. Up the steps, through the market, into the tunnel. And Aiko — don\'t look back. Not once.']);
  }
  const stones = itemCount(s, 'riverStone');
  return {
    start: 'a',
    nodes: {
      a: { speaker: 'Ren', text: 'This is where the names go that she takes. They grow back here, slowly, if anybody remembers them out loud.', next: 'b' },
      b: { speaker: 'Ren', text: 'I have been here every night for a hundred years, looking for mine, and I cannot even remember what river I am.', next: stones >= 3 ? 'stones' : 'c' },
      stones: {
        speaker: '',
        text: 'You put three river stones into his hands. Smooth, cold, and full of the same water.',
        fx: [{ type: 'take', id: 'riverStone', qty: 3, quiet: true }, { type: 'flag', id: 'gaveStones' }],
        next: 'c'
      },
      c: {
        speaker: 'Ren',
        text: 'You were four. You went into a river after a pink shoe, and something put you back on the bank.',
        next: 'd'
      },
      d: {
        speaker: 'Ren',
        text: 'What river was it, Aiko? Say it out loud.',
        choices: [
          { text: 'The Kanda.', next: 'wrong' },
          { text: 'The Sazanami.', next: 'right', cond: { flag: 'knowsRiver' } },
          { text: 'The Sazanami — the one under the road behind the school.', next: 'right', cond: { notFlag: 'knowsRiver' } },
          { text: 'The Aragawa.', next: 'wrong' }
        ]
      },
      wrong: { speaker: 'Ren', text: 'No. Say it again. Slower — you know this.', next: 'd' },
      right: {
        speaker: '',
        text: 'The word comes out of you and lands in the pond, and the pond stands up.',
        next: 'r2'
      },
      r2: {
        speaker: 'Ren',
        text: 'The Sazanami. I am the Sazanami. They put a road over me in the year you were born and I forgot my own water.',
        next: 'r3'
      },
      r3: {
        speaker: 'Ren',
        text: 'You fell in. I carried you to the bank. I have been trying to give you back ever since.',
        next: 'r4'
      },
      r4: {
        speaker: '',
        text: 'You take the folded slip out of your bag and open it. Four characters. Your whole name, in your own hand, aged twelve.',
        fx: [{ type: 'flag', id: 'nameRead' }],
        next: 'r5'
      },
      r5: {
        speaker: 'Ren',
        text: 'Now hold onto it, all four, and go and get your parents. She has one test left and she has already lost it.',
        fx: [
          { type: 'chapter', id: 'homeward' },
          { type: 'journal', text: 'Ren is the Sazanami River. You are Aiko. Both of those are true again.' },
          { type: 'sfx', id: 'chapter' },
          { type: 'teleport', to: { area: 'market', x: 26 * 32 + 16, y: 31 * 32 + 16, dir: 'up' } }
        ],
        next: 'end'
      }
    }
  };
};

SCRIPTS.nameSlips = (s) => hasItem(s, 'riverStone', 1) && flag(s, 'grovestone')
  ? look(['Slips of paper on every branch, thousands of them, all somebody.'])
  : look([
    'Slips of paper hang on every branch, each one a name somebody signed away.',
    'At the water\'s edge there is a stone worn smooth by a river that no longer exists. You pocket it.'
  ], { endFx: [{ type: 'give', id: 'riverStone' }, { type: 'side', id: 'riverMemory' }, { type: 'flag', id: 'grovestone' }] });

SCRIPTS.groveStone = () => look(['A mossed marker at the head of the pond. The characters are worn to nothing, which is the whole problem here.']);

/* ============================================================== ENDING == */

SCRIPTS.walkHome = () => look([
  'The tunnel is dry. Your shoes are wet anyway.',
  'Behind you: lamps, steam, a bridge, nine lit lamps, a frog with a ledger, a boy made of river.',
  'You do not look back. You have never done anything harder.',
  'Ahead, Dad\'s voice, ordinary and irritated: "—covered in leaves. Aiko, come and look at the car, it\'s absolutely covered."'
], { endFx: [{ type: 'ending' }] });

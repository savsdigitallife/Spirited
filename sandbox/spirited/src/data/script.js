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

/** Examining scenery: no speaker, just what she notices. */
function look(texts, opts) {
  return talk('', texts, opts);
}

export const SCRIPTS = {};

/* ================================================================ FLAT == */

SCRIPTS.mom = (s) => {
  if (!hasItem(s, 'satchel')) {
    return talk('Mei', [
      'Your bag is still in the bedroom, under the window, exactly where you "left it on purpose".',
      'Thirty years old and you still pack like it is the night before a school trip.'
    ]);
  }
  if (flag(s, 'readyToGo')) {
    return talk('Mei', ['Go on. Lift, street, ramen, train. In that order.']);
  }
  return {
    start: 'q',
    nodes: {
      q: {
        speaker: 'Mei',
        text: 'That is the whole flat in four boxes. Are you actually doing this?',
        choices: [
          {
            text: 'I handed in my notice on Tuesday.',
            next: 'go',
            fx: [
              { type: 'flag', id: 'readyToGo' },
              { type: 'chapter', id: 'farewell' },
              { type: 'journal', text: 'Eleven years at the firm. Four boxes.' }
            ]
          },
          { text: 'Ask me again downstairs.', next: 'no' }
        ]
      },
      go: {
        speaker: 'Mei',
        text: 'Then come down to the crossing and let me buy you one last bowl before the train.',
        next: 'end'
      },
      no: { speaker: 'Mei', text: 'You have been saying that for a month.', next: 'no2' },
      no2: {
        speaker: 'Mei',
        text: 'Fine. Bring the bag and I will ask you at the counter instead. Ramen first.',
        fx: [
          { type: 'flag', id: 'readyToGo' },
          { type: 'chapter', id: 'farewell' }
        ],
        next: 'end'
      }
    }
  };
};

SCRIPTS.dad = () => talk('The Removal Man', [
  'Kaminohara, Kubo house, Thursday. That is a long way to send four boxes.',
  'You are sure about the address? ...People usually say it faster than that.'
]);

SCRIPTS.satchelProp = () => look(
  ['Under the window, exactly where you left it "on purpose". Your grandmother stitched the strap twice.'],
  { endFx: [{ type: 'give', id: 'satchel' }] }
);

SCRIPTS.boxes = () => look([
  'Cardboard, taped, labelled in marker: BOOKS. WINTER. KITCHEN — FRAGILE.',
  'Eleven years in this flat and it all fits on one trolley.'
]);

SCRIPTS.futon = () => look(['The futon is rolled and tied. Just a paler rectangle of tatami where you have been sleeping.']);
SCRIPTS.shelf = () => look(['Empty, except for a dust-line and one hair tie. You take the hair tie and put it in your hair.']);
SCRIPTS.flatChest = () => look(['Bottom drawer: a seed catalogue you ordered in March and told nobody about. It is dog-eared at the brassicas.'],
  { endFx: [{ type: 'journal', text: 'You have been reading seed catalogues since March.' }] });

SCRIPTS.balcony = () => look([
  'The balcony tomato. Half-dead, grown in a bucket, the only thing you have ever kept alive.',
  'You are taking it with you. Obviously you are taking it with you.'
]);

SCRIPTS.shoes = () => look([
  'A shoebox with a pair of boots in it, unworn, bought online at two in the morning in February.',
  'Steel toes. For a farm you had not yet agreed to buy.'
]);

SCRIPTS.flatStove = () => look(['Two rings and a fish grill. You have burnt exactly one thing on it, in 2019, and never lived it down.']);
SCRIPTS.flatSink = () => look(['Scrubbed out, drying rack empty. You cleaned it for a landlord who will not look.']);
SCRIPTS.flatFridge = () => look(['Empty and propped open. On the door, a photo of a farmhouse with a slate roof and a very great deal of bramble.']);
SCRIPTS.flatKettle = () => look(['The kettle stays. It came with the flat and it is somehow older than the building.']);
SCRIPTS.flatTable = () => look(['The little table where you ate standing up for eleven years, because sitting down meant admitting it was dinner.']);
SCRIPTS.flatTub = () => look(['A bath you could never lie down in. The farmhouse has a wooden one. You have seen a photograph.']);
SCRIPTS.flatBasin = () => look(['Your face, at half past nine at night, deciding it is still going through with this.']);
SCRIPTS.flatRadio = () => look(['The radio is playing a weather report for a valley two hundred kilometres north. Rain tomorrow, clearing by afternoon.']);

/* ============================================================== STREET == */

SCRIPTS.mei = (s) => {
  if (atLeast(s, 'catchTrain')) {
    return talk('Mei', ['Go. The 21:40 does not wait, and I am not carrying that tomato to the station for you.']);
  }
  return {
    start: 'a',
    nodes: {
      a: { speaker: 'Mei', text: 'Sit. Two minutes. The last bowl in Tokyo, on me.', next: 'b' },
      b: { speaker: 'Mei', text: 'Eleven years we have eaten at this counter. You never once ordered anything different.', next: 'c' },
      c: {
        speaker: 'Mei',
        text: 'So go on, then. Say the thing out loud so I know you mean it.',
        choices: [
          { text: '"I am going to grow vegetables."', next: 'p1' },
          { text: '"I am going to keep chickens."', next: 'p2' },
          { text: '"I have absolutely no idea what I am doing."', next: 'p3' }
        ]
      },
      p1: { speaker: 'Mei', text: 'You. Vegetables. From a woman who killed a cactus.', next: 'z' },
      p2: { speaker: 'Mei', text: 'Chickens! You will name them, you know. You will name all of them.', next: 'z' },
      p3: { speaker: 'Mei', text: 'Now that I believe. That is the first honest thing you have said since March.', next: 'z' },
      z: {
        speaker: 'Mei',
        text: 'Take these. Seeds from the shop on the corner — radish, because even you cannot kill a radish. Now go and catch your train.',
        fx: [
          { type: 'give', id: 'radishSeed' },
          { type: 'chapter', id: 'catchTrain' },
          { type: 'journal', text: 'Mei gave you radish seed and told you to go.' }
        ],
        next: 'end'
      }
    }
  };
};

SCRIPTS.ramenCook = () => talk('The Ramen Cook', [
  'Six stools, one pot, forty years. No sign outside because the sign fell down in 1988 and nobody missed it.',
  'You are the one moving north. She told me. She tells me everything, that one.'
]);
SCRIPTS.ramenCook2 = () => talk('A Cook in a Cap', ['Extra spring onion? Everyone says no and everyone means yes.']);
SCRIPTS.ramenShop = () => look(['Steam, six stools, a curtain the colour of dried blood. The whole shop is narrower than your kitchen.']);
SCRIPTS.ramenShop2 = () => look(['A counter with room for four, wedged between a stairwell and a laundry. The broth has been going since Tuesday.']);
SCRIPTS.ramenShop3 = () => look(['Handwritten menu, three items, two of them crossed out. Nine o\'clock and there is a queue.']);
SCRIPTS.konbini = () => look(['Fluorescent, spotless, open for ever. You have bought dinner here more nights than you would like counted.']);
SCRIPTS.koban = () => look(['The police box. The officer inside is doing paperwork under a lamp and has been all evening.']);
SCRIPTS.officer = () => talk('The Officer', ['Kaminohara? Up past the tunnel. My aunt is from there. Say hello to the bathhouse for me.']);
SCRIPTS.busker = () => talk('A Busker', ['...', 'Three chords, no case out, playing for the crossing rather than for money.']);
SCRIPTS.salaryman = () => talk('Man in a Hurry', ['Excuse me. Excuse me. Sorry — yes. Excuse me.']);
SCRIPTS.phoneMan = () => talk('Man on the Phone', ['"No, tell them Thursday. Thursday. THURSDAY." He does not see the crossing at all.']);
SCRIPTS.colleagues = () => talk('Two Colleagues', ['"—and then he says it is my fault the server fell over—"', 'They are still talking about it four streets later.']);
SCRIPTS.student = () => talk('A Student', ['Exams in nine days and she is buying a melon soda and standing in the rain. Fair enough.']);
SCRIPTS.student2 = () => talk('A Student', ['"If we go now we can still get the 21:12." They will not get the 21:12.']);
SCRIPTS.grocer = () => talk('Konbini Clerk', [
  'Long trip? Take these. They keep for ever and they are better than the train food.'
], { endFx: [{ type: 'give', id: 'riceBall', qty: 2 }] });
SCRIPTS.shoppingWoman = () => talk('A Woman with Shopping', ['Four bags and an umbrella, and she is still faster than everyone on this crossing.']);
SCRIPTS.courier = () => talk('A Courier', ['Twenty-two more before ten. He says it like a countdown, not a complaint.']);
SCRIPTS.tourist = () => talk('Someone Lost', ['They turn the map, turn it back, and look up at the same neon sign for the third time.']);
SCRIPTS.boy = () => talk('A Kid on a Scooter', ['There is a beetle in this drain the size of my THUMB and nobody believes me.']);
SCRIPTS.cat = () => look(['The alley cat considers you, decides you are leaving, and goes back to sleep. Cats always know first.']);
SCRIPTS.vending = () => look(['Hot corn soup, cold barley tea, and one slot that has said SOLD OUT since you moved in.']);
SCRIPTS.torii = () => look(['The gate is small, red, and older than the towers leaning over it. You duck through out of habit.']);
SCRIPTS.foxStatue = () => look(['A stone fox with a chipped ear and a coin in its mouth. Somebody keeps its bib clean.']);
SCRIPTS.keeper = (s) => flag(s, 'gotCoin')
  ? talk('Shrine Keeper', ['Foxes keep what they are given. Remember that where you are going.'])
  : talk('Shrine Keeper', [
    'Moving north, are you. The whole crossing knows.',
    'Then take this. It came out of the offering box in 1961 and it has been warm ever since.',
    'Put it somewhere in the new house where you will see it every day.'
  ], { endFx: [{ type: 'give', id: 'foxCoin' }, { type: 'flag', id: 'gotCoin' }] });
SCRIPTS.shrineVisitor = () => look(['Two claps, a bow, a long pause. Whatever they are asking for, they are taking their time about it.']);
SCRIPTS.streetSign = () => look(['SAKURAGAOKA CROSSING. Underneath, in marker: MEI + AIKO, and a date from eleven years ago.']);
SCRIPTS.movingVan = () => look(['The van is loaded and the driver is asleep in the cab. Your whole flat fits in the left half of it.']);
SCRIPTS.bench = () => look(['A bench under an awning, out of the rain. Somebody has left a folded umbrella under it, hopefully on purpose.']);
SCRIPTS.alleyCrates = () => look(['Beer crates stacked behind the ramen counter, and a cat-shaped gap between them.']);
SCRIPTS.bikeRack = () => look(['Fourteen bicycles, one of them padlocked to nothing at all.']);

/* ============================================================= STATION == */

SCRIPTS.stationMom = (s) => hasItem(s, 'ticket')
  ? talk('Mei', ['Platform one. Two hours. Text me when you get there or I will assume a bear.'])
  : talk('Mei', ['Machine is by the wall. Kaminohara — it is near the bottom, they never put the small places at the top.']);
SCRIPTS.stationDad = () => talk('Station Guard', ['Northbound local, platform one. It stops everywhere. That is its entire personality.']);
SCRIPTS.attendant = () => talk('Attendant', ['Two hours four minutes. There is a trolley, but I would not.']);
SCRIPTS.oldWoman = (s) => talk('Woman in Grey', [
  'Kaminohara. I grew up an hour past it.',
  'Good soil, bad phone signal, and a bathhouse that knows your business before you do.',
  atLeast(s, 'arrive') ? 'I did say about the bathhouse.' : 'You will be fine. Take a hat.'
], { endFx: [{ type: 'journal', text: 'A woman in grey: good soil, bad signal, and a bathhouse that knows everything.' }] });
SCRIPTS.commuter = () => talk('Commuter', ['If you stand exactly here the doors open exactly there. Eleven years of practice.']);
SCRIPTS.ticketMachine = (s) => {
  if (hasItem(s, 'ticket')) return look(['The screen offers you a second ticket. One is plenty.']);
  if (!atLeast(s, 'catchTrain')) return look(['The machine hums. Mei is still holding a bowl for you at the counter.']);
  return look([
    'You feed in the notes. The machine thinks about it for a long moment.',
    'KITANO → KAMINOHARA. ONE. NO RESERVED SEAT.'
  ], { endFx: [{ type: 'give', id: 'ticket' }] });
};
SCRIPTS.kiosk = (s) => hasItem(s, 'riceBall')
  ? look(['You have food. The woman behind the counter nods approvingly at your bag.'])
  : look(['You buy a rice ball for the train.'], { endFx: [{ type: 'give', id: 'riceBall' }] });
SCRIPTS.departureBoard = () => look([
  'NORTHBOUND LOCAL — 21:40 — KAMINOHARA (2h04)',
  'It is the last one tonight. After that the board goes blank until five.'
]);

/* =============================================================== TRAIN == */

SCRIPTS.trainMom = () => talk('A Woman with a Basket', ['Going up for the weekend? ...Oh. Moving. Well. Good.']);
SCRIPTS.trainDad = () => talk('A Man Reading', ['He turns a page. Outside, the city has already run out.']);
SCRIPTS.conductor = (s) => flag(s, 'trainStop')
  ? talk('Conductor', ['Mind the step down. Nobody has fixed it since the war and nobody is going to.'])
  : talk('Conductor', ['Kaminohara! Kaminohara next. Doors on the right, and mind the step.'], {
    endFx: [{ type: 'flag', id: 'trainStop' }, { type: 'toast', text: 'The train slows. Rice, rice, rice, hill.' }]
  });
SCRIPTS.sleeper = () => look(['Asleep, upright, hands folded around a bag of pears.']);
SCRIPTS.trainWindow = () => look([
  'Towers, then blocks, then houses, then roofs with grass growing on them.',
  'Then a long dark valley, and your own face in the glass over the top of it.'
]);

/* =========================================================== KAMINOHARA == */

SCRIPTS.roadMom = () => talk('A Neighbour', ['You are the one taking the Kubo place! Everyone said nobody would.']);
SCRIPTS.roadDad = () => talk('A Neighbour', ['Mind the lane after rain. It eats hire cars.']);
SCRIPTS.tsuda = (s) => {
  if (isChapter(s, 'animals')) {
    return {
      start: 'a',
      nodes: {
        a: { speaker: 'Old Man Tsuda', text: 'Yuzuki says you are ready for the hens. Yuzuki says a lot of things.', next: 'b' },
        b: { speaker: 'Old Man Tsuda', text: 'Six of them. Bad tempered, good layers. And the goat, because nobody else will have her.', next: 'c' },
        c: {
          speaker: 'Old Man Tsuda',
          text: 'You will need somewhere for them to sleep by tonight. Can you build a coop or not?',
          choices: [
            { text: '"I can learn by tonight."', next: 'yes' },
            { text: '"Absolutely not. Will you show me?"', next: 'yes2' }
          ]
        },
        yes: { speaker: 'Old Man Tsuda', text: 'Hah. That is the correct answer and it is also a lie. Timber is stacked by your shed.', next: 'z' },
        yes2: { speaker: 'Old Man Tsuda', text: 'Good. Asking is cheaper than rebuilding. Timber is stacked by your shed already.', next: 'z' },
        z: {
          speaker: 'Old Man Tsuda',
          text: 'Go on. They will follow the bucket. They always follow the bucket.',
          fx: [
            { type: 'give', id: 'henCrate' },
            { type: 'journal', text: 'Six hens and one goat, in a crate, following a bucket.' },
            { type: 'toast', text: 'Six hens and a goat are now, somehow, your responsibility.' }
          ],
          next: 'end'
        }
      }
    };
  }
  return talk('Old Man Tsuda', [
    'You are the Kubo house. Thought nobody would take it.',
    atLeast(s, 'clearGround')
      ? 'Cleared the garden, did you. That bramble beat two people before you.'
      : 'That garden has been eating itself for eleven years. Start at the wall and work in.',
    'When you want hens, come and see me. Not before. Hens are the reward, not the start.'
  ]);
};
SCRIPTS.cyclist = () => talk('Girl on a Bicycle', ['You are new! Nobody is ever new here. Do you have wifi? Nobody has wifi.']);
SCRIPTS.redFox = () => look(['A real fox, red as rust, sitting in the lane like it pays tax on it. It leaves without hurrying.']);
SCRIPTS.parkedCar = () => look(['The hire car, nose-in to the verge. You have four days to work out how to live without one.']);
SCRIPTS.countryTorii = () => look(['A gate the colour of dried blood standing in a field with nothing behind it. It was a shrine once.']);
SCRIPTS.stoneFox = (s) => look([
  'Another stone fox, mossed to the eyes. The same chipped ear as the one at Sakuragaoka.',
  hasItem(s, 'foxCoin') ? 'The coin in your bag goes warm enough to feel through the canvas.' : 'Its mouth is empty. Something is missing from it.'
]);
SCRIPTS.jizo = () => look(['A small stone figure in a red bib, at the exact spot where the tarmac gives up.']);
SCRIPTS.scarecrow = () => look(['A scarecrow in a school jacket, guarding a field that was harvested a month ago.']);
SCRIPTS.well = () => look(['A well with a lid and a padlock. You drop a pebble through the gap and count to four.']);
SCRIPTS.busStop = () => look(['KAMINOHARA HALT — 1 service daily, 06:40. In winter, "as able".']);
SCRIPTS.tunnelSign = () => look([
  'A wooden sign, silvered with age: TO THE VILLAGE — 400m — MIND YOUR HEAD.',
  'Under it, newer: NO CARS. NO EXCEPTIONS. NOT EVEN YOU, KENJI.'
]);
SCRIPTS.bicycleProp = () => look(['A bicycle in the ditch, rusted through. Somebody has painted a face on the saddle.']);

/* ============================================================== TUNNEL == */

SCRIPTS.tunnelBench = () => look([
  'A shelter hollowed into the rock: two benches, a bin, and a bus timetable from 1994.',
  'People wait out the rain here. There is a stack of paperbacks and an honesty tin.'
]);
SCRIPTS.tunnelLantern = (s) => hasItem(s, 'lanternStub')
  ? look(['You have a stub already. Leave the rest for whoever walks through next.'])
  : look([
    'A box of candle stubs on the sill, and a note: FOR THE BRIDGE LAMPS. TAKE ONE.',
    'You take one.'
  ], { endFx: [{ type: 'give', id: 'lanternStub' }] });
SCRIPTS.tunnelDust = () => look(['Four hundred metres of cold stone, and a light at the far end the size of a coin.']);

/* ================================================================ FARM == */

SCRIPTS.farmSign = () => look(['A board at the gate, hand-painted years ago: KUBO. Somebody has crossed it out and left the space blank.']);

SCRIPTS.farmGate = (s) => {
  if (atLeast(s, 'clearGround')) return look(['Your gate. It sticks, and you have already learned to lift as you push.']);
  if (hasItem(s, 'farmKeys')) {
    return look([
      'The padlock is older than you are. The key turns anyway, with a noise like a cough.',
      'The gate swings in. Eleven years of bramble swing with it.'
    ], {
      endFx: [
        { type: 'take', id: 'farmKeys', quiet: true },
        { type: 'flag', id: 'gateOpen' },
        { type: 'chapter', id: 'clearGround' },
        { type: 'journal', text: 'The gate is open. Now the garden.' },
        { type: 'sfx', id: 'chapter' }
      ]
    });
  }
  return look([
    'A padlocked gate and a garden gone to bramble behind it.',
    'The lease says the keys are with Yuzuki, in the village, through the tunnel.'
  ], { endFx: [{ type: 'chapter', id: 'theKeys' }] });
};

SCRIPTS.brambles = () => look([
  'Bramble, waist high, eleven years deep, with an actual bird nesting in it.',
  'You wait for the bird to leave. Then you take the whole afternoon and you pull it out by the root.'
], {
  endFx: [
    { type: 'flag', id: 'clearedBrambles' },
    { type: 'journal', text: 'Brambles: out. Hands: ruined.' },
    { type: 'toast', text: 'The brambles are out. Your hands are a disgrace.' },
    { type: 'sfx', id: 'chime' }
  ]
});

SCRIPTS.gardenStones = () => look([
  'Somebody once built a path here, and then eleven winters took it apart.',
  'You lift the stones one at a time and stack them along the wall. It takes until the light goes.'
], {
  endFx: [
    { type: 'flag', id: 'clearedStones' },
    { type: 'journal', text: 'Stones: lifted and stacked along the wall.' },
    { type: 'toast', text: 'Stones stacked. Your back has opinions.' },
    { type: 'sfx', id: 'chime' }
  ]
});

SCRIPTS.brokenFence = () => look([
  'Three palings gone and a post rotted to sponge.',
  'There is sound timber in the woodshed. You cut, you dig, you hammer, and it holds.'
], {
  endFx: [
    { type: 'flag', id: 'mendedFence' },
    { type: 'journal', text: 'Fence: mended. Badly, but mended.' },
    { type: 'toast', text: 'The fence holds. You lean on it to check. It holds.' },
    { type: 'sfx', id: 'chime' }
  ]
});

SCRIPTS.seedBed = (s) => {
  if (isChapter(s, 'clearGround')) {
    const done = [flag(s, 'clearedBrambles'), flag(s, 'clearedStones'), flag(s, 'mendedFence')].filter(Boolean).length;
    if (done >= 3) {
      return look(['Four beds, cleared to bare earth for the first time since before you were promoted.'], {
        endFx: [
          { type: 'chapter', id: 'firstSeeds' },
          { type: 'journal', text: 'The ground is clear. Now something has to go in it.' }
        ]
      });
    }
    return look([`Four beds under the bramble. ${3 - done} job${3 - done === 1 ? '' : 's'} left before you can see the soil.`]);
  }
  if (isChapter(s, 'firstSeeds')) {
    if (!hasItem(s, 'seedPacket')) {
      return look(['Bare earth, raked and waiting. You need proper seed — Kanae keeps a stall in the village market.']);
    }
    return look([
      'You draw the drills with the edge of your hand, because you have no dibber and no idea.',
      'Radish from Mei. Turnip, mustard and winter greens from Kanae. In, covered, watered from the butt.',
      'Then you stand and look at four beds of flat brown earth for much longer than is reasonable.'
    ], {
      endFx: [
        { type: 'take', id: 'seedPacket', quiet: true },
        { type: 'flag', id: 'sown' },
        { type: 'chapter', id: 'water' },
        { type: 'journal', text: 'Sown: radish, turnip, mustard, winter greens.' },
        { type: 'sfx', id: 'chapter' }
      ]
    });
  }
  if (isChapter(s, 'harvest')) {
    return look([
      'Battered, muddy, half of it flat — and under the leaves, radishes. Actual radishes.',
      'You pull one, wipe it on your coat, and eat it standing in the mud.'
    ], {
      endFx: [
        { type: 'give', id: 'basket' },
        { type: 'flag', id: 'picked' },
        { type: 'journal', text: 'A basket of radishes, turnips and very bruised greens.' },
        { type: 'sfx', id: 'chime' }
      ]
    });
  }
  if (atLeast(s, 'storm')) return look(['Green rows, leaning east where the wind pushed them, and holding.']);
  if (flag(s, 'sown')) return look(['Flat brown earth with string lines over it. Nothing yet. It has been a day.']);
  return look(['Raised beds, waiting.']);
};

SCRIPTS.sluice = (s) => {
  if (!isChapter(s, 'water')) {
    return look(['A wooden sluice gate in the channel, shut fast and swollen with damp.']);
  }
  if (!flag(s, 'askedRen')) {
    return look([
      'The gate will not lift, and the channel above it is packed solid with eleven years of leaf and silt.',
      'Ren, at the bridge in the village, is the one everybody says to ask about water.'
    ]);
  }
  return look([
    'You clear the channel the way Ren said: from the top down, so what you loosen has somewhere to go.',
    'Then both hands under the gate, and lift.',
    'Water comes along the channel like it has been waiting eleven years for somebody to ask.'
  ], {
    endFx: [
      { type: 'flag', id: 'waterOn' },
      { type: 'chapter', id: 'animals' },
      { type: 'journal', text: 'The channel runs. Tsuda says that means you are ready for hens.' },
      { type: 'sfx', id: 'chapter' }
    ]
  });
};

SCRIPTS.coopSite = (s) => {
  if (!hasItem(s, 'henCrate')) {
    return look(['A stack of timber by the shed, and a flat patch of ground that would take a coop nicely.']);
  }
  return look([
    'You build it out of Tsuda\'s timber and the sound half of the old fence.',
    'It is not square. One door sits proud. It will keep rain off six hens and a goat, which is the entire specification.',
    'The hens go in without being asked. The goat does not, and then does, and then eats the string.'
  ], {
    endFx: [
      { type: 'take', id: 'henCrate', quiet: true },
      { type: 'flag', id: 'coopBuilt' },
      { type: 'chapter', id: 'storm' },
      { type: 'journal', text: 'Coop built. Not square. Standing.' },
      { type: 'toast', text: 'The radio says a typhoon comes ashore tonight.' },
      { type: 'sfx', id: 'chapter' }
    ]
  });
};

SCRIPTS.coop = (s) => {
  if (isChapter(s, 'storm') && !flag(s, 'animalsIn')) {
    return look([
      'The sky has gone the colour of a bruise and the wind has started arriving in shoves.',
      'You get all six hens in, and then the goat, who objects on principle and then settles like she planned it.',
      'You wedge the door with a stone and go back out for the beds.'
    ], {
      endFx: [
        { type: 'flag', id: 'animalsIn' },
        { type: 'journal', text: 'Animals in. Door wedged. Beds still out there.' },
        { type: 'toast', text: 'Animals in. Now the beds, and hurry.' }
      ]
    });
  }
  if (flag(s, 'animalsIn') && isChapter(s, 'storm')) {
    return look(['Six hens and a goat, dry, indignant, and audibly alive over the noise of the wind.']);
  }
  return look(['The coop. Not square. Still standing, which you point out to visitors within about a minute.']);
};

SCRIPTS.hen = () => look(['She looks at you, decides you are not food, and goes back to the business of the ground.']);
SCRIPTS.goat = () => look(['The goat has eaten a length of string, half a seed label, and your expectations.']);

SCRIPTS.strayCat = (s) => {
  const fed = s.side.strayCat ?? 0;
  if (sideDone(s, 'strayCat')) {
    return look(['The grey cat is asleep on the woodpile in the exact spot where the sun lands at four. It lives here now. You both know it.']);
  }
  if (!hasItem(s, 'riceBall')) {
    return look([`A grey cat watches you from the woodshed and does not blink. (Fed ${fed} of 3 times — it will want food.)`]);
  }
  return look([
    'You put a piece down and step back. It waits until you are exactly far enough away, then eats.',
    fed >= 2 ? 'Afterwards it sits down instead of leaving. That is new.' : 'Afterwards it leaves without acknowledging you in any way.'
  ], {
    endFx: [
      { type: 'take', id: 'riceBall', quiet: true },
      { type: 'side', id: 'strayCat' }
    ]
  });
};

SCRIPTS.farmRen = (s) => isChapter(s, 'storm')
  ? talk('Ren', [
    'I saw your light. Two of us will do the beds faster than one.',
    'Cloches over the greens, boards over the radish, and stones on everything. Come on.'
  ], { endFx: [{ type: 'flag', id: 'renHelped' }] })
  : talk('Ren', ['Channel is running well. You did the top first, then. Most people do not.']);

SCRIPTS.farmWell = () => look(['Your own well, with a bucket on a rope. The water is so cold it makes your teeth ache.']);
SCRIPTS.woodshed = () => look(['Split logs stacked to the roof by somebody who knew exactly what they were doing, eleven years ago.']);
SCRIPTS.toolRack = () => look(['A hoe, a mattock, a billhook and a rake, all left hanging. All still good under the rust.']);
SCRIPTS.washLine = () => look(['A line strung between two posts. Three things on it, which is three more than last week.']);

/* --------------------------------------------------------- farmhouse -- */

SCRIPTS.stove = () => look(['A cast-iron range with two rings and a firebox. It takes an hour to get going and holds heat until morning.']);
SCRIPTS.sink = () => look(['A deep stone sink under the window, so you can wash up and watch the garden at the same time. Whoever built this knew.']);
SCRIPTS.fridge = () => look(['A small humming fridge, empty except for eggs you did not buy, left by somebody who did not sign for them.']);
SCRIPTS.ricePot = () => look(['A rice pot with a wooden lid, and a scorch mark on one side from a cook who is not you. Yet.']);
SCRIPTS.kitchenShelf = () => look(['Six bowls, four cups, one enormous chipped dish for something you have not learned to make.']);
SCRIPTS.kitchenTable = () => look(['A table that seats six. You have sat at it once, at one end, eating standing-up food sitting down.']);
SCRIPTS.farmFuton = (s) => atLeast(s, 'home')
  ? look(['Your bed, in your house. It still smells of the cedar chest. You sleep like the dead here.'])
  : look(['A futon aired and laid out. The first night you slept ten hours and woke at four, terrified, and then went back to sleep.']);
SCRIPTS.chest = () => look(['A cedar chest that came with the house. Inside: blankets, and a photograph of a family standing where your beds are now.']);
SCRIPTS.hearth = () => look(['A sunken hearth with a kettle hook over it. You lit it wrong twice and then, on the third night, correctly.']);
SCRIPTS.lowTable = () => look(['A low table by the hearth, worn pale where eleven years of somebody\'s elbows used to go.']);
SCRIPTS.radio = (s) => isChapter(s, 'storm')
  ? look(['"—advising residents in the Kaminohara valley to secure outbuildings and livestock before nightfall—"'])
  : look(['The radio gets one station clearly and three in ghosts. Tonight it is a man discussing pears at length.']);
SCRIPTS.tub = () => look(['A wooden bath, deep enough to sit in with your knees under the water. This alone was worth the move.']);
SCRIPTS.washbasin = () => look(['Cold tap only. You have learned to be quick about it.']);
SCRIPTS.bootsByDoor = () => look(['Your boots by the door, caked to the ankle. The steel toes were, it turns out, a good call.']);
SCRIPTS.calendar = (s) => look([
  'A calendar on a nail, with your own handwriting on it now.',
  atLeast(s, 'harvest') ? 'SOW / WATER / HENS / STORM — and then, on today: MARKET.' : 'The first three squares say SOW, WATER, HENS. You are keeping to it, roughly.'
]);

/* ============================================================= VILLAGE == */

SCRIPTS.marketRen = (s) => talk('Ren', [
  'You want Yuzuki. Everyone wants Yuzuki eventually.',
  'Up the street, into the bathhouse, take the lift. She has the lease and the keys and the opinions.',
  'I am Ren, by the way. I do the water for the whole valley, which mostly means I stand on a bridge and worry.'
], { endFx: [{ type: 'journal', text: 'Ren: Yuzuki is up the lift in the bathhouse. She has the keys.' }] });

SCRIPTS.kanae = (s) => {
  if (isChapter(s, 'firstSeeds') && !hasItem(s, 'seedPacket')) {
    return {
      start: 'a',
      nodes: {
        a: { speaker: 'Kanae', text: 'The Kubo place! I have been waiting all week for you to turn up at this stall.', next: 'b' },
        b: {
          speaker: 'Kanae',
          text: 'Right. It is late in the year, so: what do you actually want out of that garden?',
          choices: [
            { text: '"Something that will definitely grow."', next: 'safe' },
            { text: '"Something worth eating in February."', next: 'winter' },
            { text: '"Honestly? Anything at all."', next: 'safe' }
          ]
        },
        safe: { speaker: 'Kanae', text: 'Turnip and mustard, then. Forgiving, fast, and they do not sulk.', next: 'z' },
        winter: { speaker: 'Kanae', text: 'Winter greens and turnip. Slower, and you will thank me in the cold.', next: 'z' },
        z: {
          speaker: 'Kanae',
          text: 'Take the packet. Pay me at the market when you have something to sell — that is how it works here.',
          fx: [
            { type: 'give', id: 'seedPacket' },
            { type: 'journal', text: 'Seed from Kanae, on credit until you have something to sell.' },
            { type: 'sfx', id: 'pickup' }
          ],
          next: 'end'
        }
      }
    };
  }
  if (isChapter(s, 'harvest') && hasItem(s, 'basket')) {
    return {
      start: 'a',
      nodes: {
        a: { speaker: 'Kanae', text: 'Let me see, then. ...Hm. Hm.', next: 'b' },
        b: { speaker: 'Kanae', text: 'Radish is good. Turnip is small. Greens have been through a typhoon and look it.', next: 'c' },
        c: { speaker: 'Kanae', text: 'It is a first crop off eleven years of bramble, in a storm year. It is honestly better than mine was.', next: 'd' },
        d: {
          speaker: 'Kanae',
          text: 'We are square on the seed, and there is money over. Put a box on my stall on Saturdays and we will call it standing.',
          fx: [
            { type: 'take', id: 'basket', quiet: true },
            { type: 'chapter', id: 'home' },
            { type: 'journal', text: 'Kanae has given you a box on her stall. Saturdays.' },
            { type: 'sfx', id: 'chapter' },
            { type: 'toast', text: 'Everyone is at the bathhouse tonight. Apparently including you.' }
          ],
          next: 'end'
        }
      }
    };
  }
  return talk('Kanae', ['Seed drawers, root to leaf, left to right. Ask me anything, I have nowhere to be.']);
};

SCRIPTS.fishmonger = () => talk('Toku the Fishmonger', ['Lake fish only. If a man offers you sea fish in this valley, ask him some hard questions.']);
SCRIPTS.tofuMaker = () => talk('The Tofu Maker', ['Up at three, done by nine, asleep by eight. Best hours in the valley and nobody believes me.']);
SCRIPTS.granShio = (s) => atLeast(s, 'home')
  ? talk('Grandmother Shio', ['Sit by me. You have earned the warm end of the bath and I have saved it.'])
  : talk('Grandmother Shio', [
    'Kubo place, is it. I picked beans in that garden when I was nine.',
    'It is good ground. It has just been asleep. You have not bought a ruin, you have bought a nap.'
  ]);
SCRIPTS.kiteBoy = () => talk('A Boy with a Kite', ['There is no wind in the street! I keep TELLING them!']);
SCRIPTS.bikeGirl = () => talk('A Girl on a Bicycle', ['Two deliveries and then the lake. Do you want anything? I am going anyway.']);
SCRIPTS.neighbour = () => talk('A Neighbour', ['Morning! ...You are the Kubo place. Ha! Everyone owes everyone money over you, you know.']);
SCRIPTS.postman = () => talk('The Postman', ['Nothing for you yet. Give it a week — the redirect takes a week and then it never stops.']);
SCRIPTS.produceStall = () => look(['Radish, turnip, three kinds of green, and a hand-lettered sign: GROWN 400m THAT WAY.']);
SCRIPTS.fishStall = () => look(['Lake fish on ice, laid out in a row like they are queuing for something.']);
SCRIPTS.tofuStall = () => look(['Tofu in cold water, cut to order with a wire. It costs almost nothing and it is the best thing you will eat all week.']);
SCRIPTS.crates = () => look(['Stacked crates, half of them stamped with the name of a farm that closed before you were born.']);
SCRIPTS.villageClock = () => look(['The village clock, four minutes fast, kept that way deliberately since 1971 for reasons nobody agrees on.']);
SCRIPTS.marketSign = () => look(['MARKET — SATURDAY 6am. Under it, smaller: AND WHENEVER ELSE, REALLY.']);
SCRIPTS.noticeBoardVillage = () => look([
  'A bathhouse rota, a lost cat, a tractor for sale, and a notice about the sluice gates dated four years ago.',
  'At the bottom, freshly pinned: WELCOME TO THE KUBO PLACE. TEA AT SHIO\'S, ANY TIME.'
], { endFx: [{ type: 'journal', text: 'Somebody pinned a welcome note on the village board. For you.' }] });

/* ------------------------------------------------------------- bridge -- */

SCRIPTS.bridgeRen = (s) => {
  if (isChapter(s, 'water')) {
    return {
      start: 'a',
      nodes: {
        a: { speaker: 'Ren', text: 'Your channel. I wondered when you would come and ask.', next: 'b' },
        b: {
          speaker: 'Ren',
          text: 'So: the gate will not lift and the channel is packed. Where do you start?',
          choices: [
            { text: '"At the gate — that is the bit that is stuck."', next: 'wrong' },
            { text: '"At the top, and work down."', next: 'right' },
            { text: '"I genuinely do not know. Tell me."', next: 'right' }
          ]
        },
        wrong: { speaker: 'Ren', text: 'Then everything above it comes down on you at once. Think about where the water has to go.', next: 'b' },
        right: {
          speaker: 'Ren',
          text: 'Top down. Always top down. Clear it in that order and the gate will lift with two hands and no swearing.',
          next: 'z'
        },
        z: {
          speaker: 'Ren',
          text: 'Go on. I will come and look tomorrow, and I will pretend I am passing.',
          fx: [
            { type: 'flag', id: 'askedRen' },
            { type: 'journal', text: 'Ren: clear the channel from the top down, then lift the gate.' },
            { type: 'sfx', id: 'chime' }
          ],
          next: 'end'
        }
      }
    };
  }
  if (sideDone(s, 'riverStones')) {
    return talk('Ren', ['Three stones from my grandmother\'s stretch of river, on my windowsill. Thank you. I mean it more than I am saying it.']);
  }
  return talk('Ren', [
    'I stand here most days. Water tells you what the whole valley is doing, if you let it.',
    itemCount(s, 'riverStone') > 0
      ? `You have found ${itemCount(s, 'riverStone')} of my grandmother's stones. Three and I will stop asking.`
      : 'If you are ever down at the shallows — there are smooth grey stones from the stretch my grandmother fished. I collect them. It is a stupid hobby and I am not stopping.'
  ]);
};

SCRIPTS.lamplighter = (s) => {
  if (sideDone(s, 'lampLighter')) {
    return talk('The Lamplighter', ['Nine out of nine. First time since I took the job. Here — this is for you, and do not argue.'], {
      endFx: flag(s, 'lampReward')
        ? []
        : [{ type: 'give', id: 'riverStone' }, { type: 'side', id: 'riverStones' }, { type: 'flag', id: 'lampReward' }]
    });
  }
  return talk('The Lamplighter', [
    'Nine lamps on this bridge. Six burn. Three have been dark since my knees went.',
    'A candle stub would do it. There is a box of them in the tunnel shelter, if the honesty tin still works.',
    `Three dark. ${3 - (s.side.lampLighter ?? 0)} to go.`
  ]);
};

SCRIPTS.darkLamp = (s) => {
  if (!hasItem(s, 'lanternStub')) return look(['A dark lamp, wick intact, and nothing to light it with.']);
  return look([
    'You touch the stub to the wick. It catches on the second try.',
    'Somebody down the street stops and looks up at it.'
  ], { endFx: [{ type: 'side', id: 'lampLighter' }, { type: 'flag', id: 'litOne' }] });
};

SCRIPTS.fisher = (s) => {
  if (flag(s, 'fisherStone')) {
    return talk('A Man Fishing', [
      'Still nothing biting. Take the stone to Ren before he asks me about it again.'
    ]);
  }
  return talk('A Man Fishing', [
    'Nothing biting. Nothing has been biting since Tuesday and I intend to keep at it.',
    'Here — I dredged this up an hour ago. It is one of Ren\'s, from his grandmother\'s stretch. He pays in tea.'
  ], {
    endFx: [
      { type: 'give', id: 'riverStone' },
      { type: 'side', id: 'riverStones' },
      { type: 'flag', id: 'fisherStone' }
    ]
  });
};
SCRIPTS.dogWalker = () => talk('A Woman and a Dog', ['Four times a day, this bridge. His idea, not mine, and I have stopped arguing.']);
SCRIPTS.boredTeen = () => talk('A Bored Teenager', ['There is nothing to do here.', '...The bus goes at 6:40. I could get it. I never get it.']);
SCRIPTS.bridgeSign = () => look(['Carved into the post, worn nearly smooth: BUILT 1911. MENDED 1948, 1971, 1998.']);
SCRIPTS.bridgeMeeting = () => look([
  'The bridge into the village: nine lamps, six lit, and a smell of woodsmoke and hot water.',
  'Somebody two streets away is beating a futon. A radio is on in a kitchen. Somewhere, a bathhouse is running.',
  'It is the loudest quiet you have ever stood in.'
], { endFx: [{ type: 'journal', text: 'The village: nine lamps on a bridge, and a bathhouse running.' }] });

/* ---------------------------------------------------------- bathhouse -- */

SCRIPTS.gansuke = (s) => {
  if (isChapter(s, 'theKeys')) {
    return talk('Gansuke', [
      'New face. NEW FACE! ...Sorry. We do not get them.',
      'Yuzuki? Up the lift, first floor, mind the third step. She will have heard you arrive already.'
    ]);
  }
  if (flag(s, 'sawLedger') && !sideDone(s, 'frogLedger')) {
    return {
      start: 'a',
      nodes: {
        a: { speaker: 'Gansuke', text: 'You have been reading my ledger. I can tell. You have a reading face.', next: 'b' },
        b: {
          speaker: 'Gansuke',
          text: 'Column four does not add. It has not added for sixty years. What are you going to do about it?',
          choices: [
            { text: 'Tell Yuzuki.', next: 'tell', fx: [{ type: 'side', id: 'frogLedger' }, { type: 'flag', id: 'toldOnGansuke' }] },
            { text: 'Nothing. It is your ledger.', next: 'quiet', fx: [{ type: 'side', id: 'frogLedger' }, { type: 'flag', id: 'sparedGansuke' }] }
          ]
        },
        tell: { speaker: 'Gansuke', text: 'Then I am finished. ...Fine. FINE. Sixty years is long enough to be frightened of a column of numbers.', next: 'end' },
        quiet: { speaker: 'Gansuke', text: '...Sixty years, and the first person to catch me says nothing at all.', next: 'q2' },
        q2: {
          speaker: 'Gansuke',
          text: 'Take a bath token. On the house. On the actual house, I mean — I will pay for it out of my own pocket, which is a first.',
          fx: [{ type: 'give', id: 'bathToken' }],
          next: 'end'
        }
      }
    };
  }
  return talk('Gansuke', ['Towels are extra, the hot end is the far end, and no, I do not know why the clock is fast.']);
};

SCRIPTS.osen = (s) => atLeast(s, 'harvest')
  ? talk('Osen', ['Heard you got a crop off the Kubo place. In a typhoon year. Everyone has heard.'])
  : talk('Osen', [
    'Bathhouse first, unpacking second. That is the correct order and everyone here will tell you the same.',
    'Also: whatever Yuzuki says about the lease, she has already decided in your favour. She just enjoys the paperwork.'
  ]);
SCRIPTS.bathHand = () => talk('Bath Attendant', ['Sixth tub is cold again and I am NOT carrying the buckets, and that is final.']);
SCRIPTS.bathRen = (s) => atLeast(s, 'home')
  ? talk('Ren', ['You made it through a typhoon in your first season. That is the whole initiation, you know. There is not another one.'])
  : talk('Ren', ['Come and eat with everyone when the harvest is in. That is not an invitation, it is a schedule.']);
SCRIPTS.bathTap = () => look(['A brass tap the size of your arm, and a sign: HOT. VERY. WE MEAN IT.']);
SCRIPTS.liftProp = () => look(['A wooden lift worked by a rope as thick as your leg. It goes to Yuzuki\'s office and nowhere else.']);
SCRIPTS.bucket = () => look(['Buckets, brushes, and a mop taller than you. Your hands already know what to do with all of it.']);
SCRIPTS.ledgerProp = () => look([
  'Gansuke\'s ledger, open at the fees column.',
  'Column four is short. Every night, by a little. Sixty years of a little.'
], { endFx: [{ type: 'flag', id: 'sawLedger' }, { type: 'journal', text: 'The bathhouse ledger is short in column four. Every night.' }] });
SCRIPTS.bathNotice = () => look(['A rota with everyone in the valley on it. Halfway down, in fresh ink, somebody has added your name.']);
SCRIPTS.dinnerYuzuki = () => talk('Yuzuki', [
  'Sit down. You are late, the fish is cold, and nobody minds.',
  'One season. Most people who take a ruin are gone by the second month. You cleared it, sowed it, and held it through a typhoon.',
  'The lease is yours for as long as you want it. Do not make me say anything warmer than that in public.'
]);
SCRIPTS.dinnerTsuda = () => talk('Old Man Tsuda', ['The goat has eaten your gate rope, has she? ...She always does that. I should have said.']);

/* -------------------------------------------------------- boiler room -- */

SCRIPTS.kamashiro = (s) => talk('Kamashiro', [
  'Six fires, one man, forty years. The whole village is warm because I am awake.',
  atLeast(s, 'water')
    ? 'You got the Kubo channel running. Good. That water comes past here eventually.'
    : 'You are the new one. Come down when your hands are wrecked and I will show you what to put on them.'
]);
SCRIPTS.apprentice = () => talk('The Apprentice', ['Two years in. He still will not let me touch the third fire. I do not know what the third fire did.']);
SCRIPTS.coalPile = (s) => hasItem(s, 'coalLump')
  ? look(['You already have a lump. Any more and you would tip over.'])
  : look(['You wrestle a lump of coal out of the chute. It is heavier than it looks and it knows it.'],
    { endFx: [{ type: 'give', id: 'coalLump' }] });
SCRIPTS.herbDrawers = () => look(['A wall of little drawers, each smelling of a different mountain. One is labelled FOR HANDS, and Kamashiro taps it as he passes.']);
SCRIPTS.kettle = () => look(['A kettle the size of a bath, on a fire the size of a bath. Kamashiro drinks from it directly. Somehow.']);
SCRIPTS.boilerNook = () => look(['A nook behind the drawers with a folded blanket in it, and a cup of water beside it. Somebody sleeps down here on cold nights.']);

/* ------------------------------------------------------------- office -- */

SCRIPTS.yuzuki = (s) => {
  if (isChapter(s, 'theKeys')) {
    return {
      start: 'a',
      nodes: {
        a: { speaker: 'Yuzuki', text: 'Nakazato. Thirty years old, eleven years at a firm, no farming in the family and no experience whatsoever.', next: 'b' },
        b: { speaker: 'Yuzuki', text: 'I have read your letter four times. I still do not know if you are brave or simply tired.', next: 'c' },
        c: {
          speaker: 'Yuzuki',
          text: 'So tell me plainly, and I will know by your face if it is true. Why that house?',
          choices: [
            { text: '"Because I want to grow something."', next: 'd1' },
            { text: '"Because I could not do another eleven years."', next: 'd2' },
            { text: '"Because the photograph had a well in it."', next: 'd3' }
          ]
        },
        d1: { speaker: 'Yuzuki', text: 'Everyone says that. Most of them mean "I want to have grown something", which is a different verb.', next: 'e' },
        d2: { speaker: 'Yuzuki', text: 'Ah. That one I believe. That one turns up here about twice a year.', next: 'e' },
        d3: { speaker: 'Yuzuki', text: 'It is a very good well. It is honestly the best thing about the property.', next: 'e' },
        e: {
          speaker: 'Yuzuki',
          text: 'Right. Here are the keys, and the lease, and one condition: you clear that garden yourself. Every bramble. I will know if you pay somebody.',
          fx: [
            { type: 'give', id: 'farmKeys' },
            { type: 'flag', id: 'hasLease' },
            { type: 'journal', text: 'Yuzuki gave you the keys. One condition: clear the garden yourself.' },
            { type: 'sfx', id: 'chapter' }
          ],
          next: 'f'
        },
        f: {
          speaker: 'Yuzuki',
          text: 'Go on. The gate is the padlock with the blue paint. Lift as you push — it has always stuck.',
          next: 'end'
        }
      }
    };
  }
  if (isChapter(s, 'animals')) {
    return talk('Yuzuki', ['Water running, ground cleared, seed in. Go and see Tsuda about hens. He is expecting you and pretending he is not.']);
  }
  if (atLeast(s, 'home')) {
    return talk('Yuzuki', ['I will see you at the bathhouse. Do not be early, it makes people nervous.']);
  }
  return talk('Yuzuki', ['I hold nine leases in this valley and yours is the only one I check on. Take that however you like.']);
};

SCRIPTS.grandson = () => talk('Her Grandson', [
  'She makes me do the filing. There are leases in here from before the war.',
  '...You took the Kubo place? People have been betting on that for a month. I had you at four months. Do not tell her.'
]);
SCRIPTS.leasePapers = () => look([
  'A lease in nine hundred columns, and a space at the bottom the size of a name.',
  'Above it, the last tenant\'s signature, dated eleven years ago, and after it in a different pen: LEFT FOR THE CITY.'
]);
SCRIPTS.brazier = () => look(['Charcoal, no smoke. The room is warm the way a held hand is warm.']);
SCRIPTS.keyBox = (s) => look([
  'A lacquer box of keys, every one labelled in the same hand across sixty years.',
  hasItem(s, 'farmKeys') || flag(s, 'gateOpen') ? 'One hook is empty now. Yours.' : 'One is labelled KUBO, and it is the only one with dust on it.'
]);
SCRIPTS.officeTable = () => look(['Tea, poured before you asked, and a plate of something sweet you are clearly expected to take one of.']);

/* -------------------------------------------------------- lake & cottage -- */

SCRIPTS.ferryman = (s) => hasItem(s, 'cuttings')
  ? talk('The Ferryman', ['Back across? Sit in the middle and do not stand up. People always stand up.'])
  : talk('The Ferryman', [
    'Across the lake? Nobody goes across the lake except me and the weaver, and she lives there.',
    'Get in. It is twenty minutes and there is nothing to look at but everything.'
  ]);
SCRIPTS.jettyFisher = () => talk('A Girl Fishing', ['Two hours. One boot. I am not going home yet, it would look like giving up.']);
SCRIPTS.waitingWoman = () => talk('A Woman Waiting', ['The boat comes when it comes. I have brought a book about it.']);
SCRIPTS.jettySign = () => look(['LAKE FERRY — WHEN THE FLAG IS UP. The flag is up.']);
SCRIPTS.ferryBoat = (s) => look([
  'A flat wooden boat with an outboard held on with wire.',
  'Twenty minutes of grey water, and then a jetty, a cottage, and somebody\'s washing on a line.'
], {
  endFx: [
    { type: 'teleport', to: { area: 'marshhouse', x: 17 * 32 + 16, y: 21 * 32 + 16, dir: 'up' } },
    { type: 'journal', text: 'You took the ferry across to the weaver\'s cottage.' }
  ]
});

SCRIPTS.yumeno = (s) => {
  if (sideDone(s, 'teaGarden')) {
    return talk('Yumeno', ['Plant them on the north side where the frost sits. They like a hard start, those.']);
  }
  return {
    start: 'a',
    nodes: {
      a: { speaker: 'Yumeno', text: 'You are the Kubo place. My sister mentioned you. My sister mentions everybody.', next: 'b' },
      b: { speaker: '', text: 'She looks exactly like Yuzuki, in a cardigan, with kinder eyes and the same terrible chin.', next: 'c' },
      c: { speaker: 'Yumeno', text: 'Same face, different choice, forty years ago. She took the village. I took the quiet.', next: 'd' },
      d: {
        speaker: 'Yumeno',
        text: 'You will want cuttings. Everybody who starts a garden wants cuttings and nobody ever asks.',
        fx: [
          { type: 'give', id: 'cuttings' },
          { type: 'side', id: 'teaGarden' },
          { type: 'journal', text: 'Cuttings from Yumeno: tea, rosemary, and something she would not name.' }
        ],
        next: 'e'
      },
      e: { speaker: 'Yumeno', text: 'Tea, rosemary, and one I will not tell you the name of until it flowers. Come back and tell me what it turned out to be.', next: 'end' }
    }
  };
};
SCRIPTS.spinningWheel = () => look(['A loom, mid-cloth, with forty years of pattern in it and no chart anywhere.']);
SCRIPTS.teapot = () => look(['Tea poured before you asked. It tastes like the inside of your grandmother\'s house.'],
  { endFx: [{ type: 'heart', by: 2 }] });

/* -------------------------------------------------------------- grove -- */

SCRIPTS.groveRen = (s) => {
  const stones = itemCount(s, 'riverStone');
  if (stones >= 3 && !flag(s, 'gaveStones')) {
    return talk('Ren', [
      'Three. You actually found three.',
      'That is the whole stretch she used to fish, in your two hands. Thank you.'
    ], {
      endFx: [
        { type: 'take', id: 'riverStone', qty: 3, quiet: true },
        { type: 'flag', id: 'gaveStones' },
        { type: 'journal', text: 'You gave Ren three stones from his grandmother\'s river.' },
        { type: 'sfx', id: 'chime' }
      ]
    });
  }
  return talk('Ren', [
    'Cedar, all the way up the hill, planted in rows by somebody who knew they would never see them tall.',
    'I come up here when the valley gets loud. Which, granted, it never does.'
  ]);
};
SCRIPTS.prayerSlips = (s) => flag(s, 'grovestone')
  ? look(['Paper slips on every branch, thousands of them, all somebody\'s hope for a season.'])
  : look([
    'Paper slips tied to every branch: good harvest, safe birth, come home, come home, come home.',
    'At the water\'s edge there is a smooth grey stone from the old river. You pocket it.'
  ], { endFx: [{ type: 'give', id: 'riverStone' }, { type: 'side', id: 'riverStones' }, { type: 'flag', id: 'grovestone' }] });
SCRIPTS.groveShrine = () => look(['A mossed marker at the head of the pond, worn to nothing. People still leave rice on it.']);

/* ============================================================== ENDING == */

SCRIPTS.feastScene = () => look([
  'Through the tunnel and down: a market street with the shutters up, a bridge, and a bathhouse going full tilt.',
  'Somebody is selling tofu. Somebody is arguing about a tractor. A child goes past on a bicycle with a kite.',
  'You have been here four minutes and three people have said good morning.'
], { endFx: [{ type: 'journal', text: 'Kaminohara village: a market, a bridge, and a bathhouse.' }] });

SCRIPTS.walkHome = () => look([
  'The tunnel is cold and four hundred metres long and you know every step of it now.',
  'Behind you: nine lamps lit, a bathhouse full of people who know your name and your soil pH.',
  'Ahead: a gate that sticks, a coop that is not square, six hens, one goat, and four beds of turned earth.'
], { endFx: [{ type: 'ending' }] });

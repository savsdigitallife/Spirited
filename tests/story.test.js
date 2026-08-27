// A scripted playthrough. This drives the real dialogue graphs and the real
// state reducer, so if a story beat becomes unreachable the test fails.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SCRIPTS } from '../src/data/script.js';
import { Dialogue } from '../src/systems/dialogue.js';
import { createState, applyEffects, test as cond, hasItem, itemCount, sideDone, flag } from '../src/systems/state.js';
import { getArea } from '../src/world/index.js';

/** Run one script to the end, taking `choices` (matched by substring) in order. */
function play(state, scriptId, choices = []) {
  const build = SCRIPTS[scriptId];
  assert.ok(build, `no script called ${scriptId}`);
  const graph = build(state);
  assert.ok(graph, `${scriptId} produced no dialogue`);
  const d = new Dialogue(graph, state, {});
  const events = [];
  const queue = [...choices];
  let guard = 0;

  while (!d.finished) {
    if (++guard > 200) assert.fail(`${scriptId} did not terminate`);
    events.push(...applyEffects(state, d.drain()));
    if (d.finished) break;
    const opts = d.choices();
    if (opts) {
      const want = queue.shift();
      const index = want === undefined ? 0 : opts.findIndex((o) => o.text.includes(want));
      assert.ok(index >= 0, `${scriptId}: no choice matching "${want}" in [${opts.map((o) => o.text)}]`);
      d.choose(index);
    } else {
      d.advance();
    }
  }
  events.push(...applyEffects(state, d.drain()));

  // Cutscenes queued by a conversation play out immediately, as in the game.
  for (const ev of events.filter((e) => e.type === 'cutscene')) {
    events.push(...play(state, ev.id));
  }
  return events;
}

/** Fire an area trigger the way walking into it would. */
function trigger(state, areaId, triggerId) {
  const area = getArea(areaId);
  const trig = area.triggers.find((t) => t.id === triggerId);
  assert.ok(trig, `${areaId} has no trigger ${triggerId}`);
  assert.ok(cond(state, trig.cond), `${areaId}/${triggerId} conditions are not met`);
  const events = applyEffects(state, trig.fx ?? []);
  for (const ev of events.filter((e) => e.type === 'cutscene')) {
    events.push(...play(state, ev.id));
  }
  return events;
}

/** Can Aiko walk through this door right now? */
function portalOpen(state, areaId, label) {
  const portal = getArea(areaId).portals.find((p) => p.label === label);
  assert.ok(portal, `${areaId} has no portal labelled "${label}"`);
  return cond(state, portal.cond);
}

test('the whole story can be played from the Tokyo flat to the tunnel home', () => {
  const s = createState();
  assert.equal(s.chapter, 'packUp');
  assert.equal(s.calledName, 'Aiko');

  /* --- Act I: Tokyo ---------------------------------------------------- */
  play(s, 'shoes');                       // the pink sandal, and the river
  assert.equal(flag(s, 'knowsRiver'), true);
  assert.equal(portalOpen(s, 'flat', 'Front door'), false, 'she cannot leave before she is ready');

  play(s, 'satchelProp');
  assert.ok(hasItem(s, 'satchel'));
  play(s, 'mom', ['Ready.']);
  assert.equal(s.chapter, 'farewell');
  assert.equal(portalOpen(s, 'flat', 'Front door'), true);

  assert.equal(portalOpen(s, 'street', 'Kitano Station'), false, 'goodbye comes first');
  play(s, 'mei', ['I promise.']);
  assert.equal(s.chapter, 'catchTrain');
  assert.ok(hasItem(s, 'farewellCard'));
  assert.equal(portalOpen(s, 'street', 'Kitano Station'), true);

  assert.equal(portalOpen(s, 'station', 'Northbound train'), false, 'no ticket, no train');
  play(s, 'ticketMachine');
  assert.equal(portalOpen(s, 'station', 'Northbound train'), true);

  /* --- Act II: Kaminohara ---------------------------------------------- */
  trigger(s, 'train', 'boarded');
  assert.equal(s.chapter, 'wrongTurn');
  assert.equal(portalOpen(s, 'train', 'Kaminohara — step down'), false);
  play(s, 'conductor');
  assert.equal(portalOpen(s, 'train', 'Kaminohara — step down'), true);

  play(s, 'tunnelLantern');               // the candle that will not blow out
  assert.ok(hasItem(s, 'lanternStub'));
  trigger(s, 'tunnel', 'intunnel');
  assert.equal(s.chapter, 'throughTunnel');
  assert.equal(portalOpen(s, 'tunnel', 'Back to the valley'), true, 'the way back is open until they eat');

  /* --- Act III: beyond -------------------------------------------------- */
  trigger(s, 'market', 'feastScene');
  assert.equal(s.chapter, 'forbiddenFeast');
  assert.equal(portalOpen(s, 'tunnel', 'Back to the valley'), false, 'the tunnel floods behind her');

  play(s, 'feastMom');
  play(s, 'feastDad');                    // the second warning triggers the change
  assert.equal(flag(s, 'parentsLost'), true);

  play(s, 'marketRen', ['Who are you?']);
  assert.equal(s.chapter, 'findWork');
  assert.ok(itemCount(s, 'riceBall') >= 2, 'Ren feeds her so she does not fade');
  assert.equal(portalOpen(s, 'market', 'Down to the bridge'), true);
  assert.equal(portalOpen(s, 'bridge', 'The bathhouse gate'), true);

  play(s, 'kamashiro', ['I\'m not leaving']);
  assert.equal(s.chapter, 'loseName');
  assert.equal(portalOpen(s, 'bathhouse', 'The lift, going up'), true);

  play(s, 'yuzuki', ['Please give me work.']);
  assert.equal(s.chapter, 'firstShift');
  assert.equal(s.calledName, 'Ko', 'she signs away three characters');
  assert.equal(s.trueName, 'Aiko', 'the real name is still in there');

  play(s, 'coalPile');
  play(s, 'herbDrawers');
  play(s, 'herbDrawers');
  play(s, 'herbDrawers');
  assert.equal(itemCount(s, 'herbToken'), 3);
  play(s, 'kamashiro');
  assert.equal(s.chapter, 'riverGuest');

  play(s, 'herbChute');
  assert.equal(flag(s, 'drewHerbBath'), true);
  play(s, 'riverGuest', ['Call the whole floor']);
  assert.equal(s.chapter, 'hollowGuest');
  assert.ok(hasItem(s, 'bitterCake'));

  play(s, 'hollowBath', ['Give it the bitter cake.']);
  assert.equal(s.chapter, 'sixthStation');
  assert.equal(flag(s, 'hollowFollowed'), true);
  assert.equal(hasItem(s, 'bitterCake'), false, 'the cake is spent');

  play(s, 'bathRen');
  assert.ok(hasItem(s, 'goldSeal'));
  assert.equal(portalOpen(s, 'bathhouse', 'The water-rail door'), true);
  play(s, 'kamashiro');
  assert.ok(hasItem(s, 'railToken'));

  const ride = play(s, 'railCar');
  assert.equal(ride.find((e) => e.type === 'teleport').to.area, 'marshhouse');
  assert.equal(hasItem(s, 'railToken'), false, 'the rail only goes out');

  const marsh = play(s, 'yumeno', ['I\'m giving it back.']);
  assert.equal(s.chapter, 'remember');
  assert.ok(hasItem(s, 'nameSlip'));
  assert.equal(hasItem(s, 'goldSeal'), false);
  assert.equal(marsh.find((e) => e.type === 'teleport').to.area, 'grove');

  play(s, 'nameSlips');
  assert.equal(itemCount(s, 'riverStone'), 3, 'three stones for a river with no memory');
  const grove = play(s, 'groveRen', ['Sazanami']);
  assert.equal(s.chapter, 'homeward');
  assert.equal(flag(s, 'gaveStones'), true);
  assert.equal(grove.find((e) => e.type === 'teleport').to.area, 'market');

  /* --- The test, and the walk home ------------------------------------- */
  play(s, 'finalTest', ['The two on the left.', 'Neither.']);
  assert.equal(s.chapter, 'done');
  assert.equal(s.calledName, 'Aiko', 'she gets all four characters back');
  assert.ok(hasItem(s, 'hogCharm'));
  assert.equal(portalOpen(s, 'market', 'Home'), true);

  const home = trigger(s, 'tunnel', 'goHome');
  assert.ok(home.some((e) => e.type === 'ending'), 'walking out of the tunnel ends the game');
});

test('the optional threads can all be completed', () => {
  const s = createState();
  // Fast-forward to the point where the side content is live.
  s.chapter = 'firstShift';
  s.calledName = 'Ko';

  play(s, 'tunnelLantern');
  for (let i = 0; i < 3; i++) play(s, 'darkLamp');
  assert.equal(sideDone(s, 'lampLighter'), true);
  play(s, 'lamplighter');
  assert.ok(hasItem(s, 'riverStone'), 'the lamplighter pays');

  play(s, 'coalPile');
  play(s, 'cinderMite', ['Give one of them your coal.']);
  assert.equal(sideDone(s, 'cinderPay'), true);
  assert.ok(hasItem(s, 'herbToken'), 'Kamashiro grumbles and pays her back');

  play(s, 'ledgerProp');
  play(s, 'gansuke', ['Nothing. It\'s your ledger.']);
  assert.equal(sideDone(s, 'frogLedger'), true);
  assert.ok(hasItem(s, 'railToken'), 'the frog remembers a kindness');

  play(s, 'feastTable');
  play(s, 'stallCook');
  assert.equal(sideDone(s, 'stallKeeper'), true);
});

test('a second playthrough of a finished beat does not rewind the story', () => {
  const s = createState();
  play(s, 'satchelProp');
  play(s, 'mom', ['Ready.']);
  play(s, 'mei', ['I can\'t promise that.']);
  assert.equal(s.chapter, 'catchTrain');
  play(s, 'mei');                          // talking to her again
  play(s, 'mom');
  assert.equal(s.chapter, 'catchTrain');
  assert.equal(itemCount(s, 'farewellCard'), 1, 'she does not hand over a second card');
});

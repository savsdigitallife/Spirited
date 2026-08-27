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

test('the whole story can be played from the Tokyo flat to the first harvest', () => {
  const s = createState();
  assert.equal(s.chapter, 'packUp');

  /* --- Tokyo ------------------------------------------------------------ */
  assert.equal(portalOpen(s, 'flat', 'Front door'), false, 'she does not leave without the bag');
  play(s, 'satchelProp');
  assert.ok(hasItem(s, 'satchel'));
  play(s, 'mom', ['I handed in my notice']);
  assert.equal(s.chapter, 'farewell');
  assert.equal(portalOpen(s, 'flat', 'Front door'), true);

  assert.equal(portalOpen(s, 'street', 'Kitano Station'), false, 'ramen with Mei comes first');
  play(s, 'mei', ['I am going to grow vegetables']);
  assert.equal(s.chapter, 'catchTrain');
  assert.ok(hasItem(s, 'radishSeed'));
  assert.equal(portalOpen(s, 'street', 'Kitano Station'), true);

  assert.equal(portalOpen(s, 'station', 'Northbound train'), false, 'no ticket, no train');
  play(s, 'ticketMachine');
  assert.equal(portalOpen(s, 'station', 'Northbound train'), true);

  /* --- Kaminohara ------------------------------------------------------- */
  assert.equal(portalOpen(s, 'train', 'Kaminohara — step down'), false);
  play(s, 'conductor');
  assert.equal(portalOpen(s, 'train', 'Kaminohara — step down'), true);
  trigger(s, 'paddyroad', 'arrived');
  assert.equal(s.chapter, 'arrive');

  // The gate is locked, which is what sends her to the village.
  play(s, 'farmGate');
  assert.equal(s.chapter, 'theKeys');
  assert.equal(portalOpen(s, 'farm', 'Into the house'), false, 'the house stays shut until the lease is hers');

  play(s, 'marketRen');
  play(s, 'yuzuki', ['Because I could not do another eleven years.']);
  assert.ok(hasItem(s, 'farmKeys'));
  assert.equal(flag(s, 'hasLease'), true);

  play(s, 'farmGate');
  assert.equal(s.chapter, 'clearGround');
  assert.equal(hasItem(s, 'farmKeys'), false, 'the key stays in the gate');
  assert.equal(portalOpen(s, 'farm', 'Into the house'), true);

  /* --- The work --------------------------------------------------------- */
  play(s, 'seedBed');
  assert.equal(s.chapter, 'clearGround', 'the beds are not ready until all three jobs are done');
  play(s, 'brambles');
  play(s, 'gardenStones');
  play(s, 'brokenFence');
  play(s, 'seedBed');
  assert.equal(s.chapter, 'firstSeeds');

  play(s, 'seedBed');
  assert.equal(s.chapter, 'firstSeeds', 'nothing to sow until she has seed');
  play(s, 'kanae', ['Something worth eating in February']);
  assert.ok(hasItem(s, 'seedPacket'));
  play(s, 'seedBed');
  assert.equal(s.chapter, 'water');
  assert.equal(flag(s, 'sown'), true);

  play(s, 'sluice');
  assert.equal(s.chapter, 'water', 'the sluice will not budge before she asks Ren');
  play(s, 'bridgeRen', ['At the top, and work down.']);
  assert.equal(flag(s, 'askedRen'), true);
  play(s, 'sluice');
  assert.equal(s.chapter, 'animals');

  play(s, 'coopSite');
  assert.equal(s.chapter, 'animals', 'no coop without hens to put in it');
  play(s, 'tsuda', ['Will you show me?']);
  assert.ok(hasItem(s, 'henCrate'));
  play(s, 'coopSite');
  assert.equal(s.chapter, 'storm');
  assert.equal(flag(s, 'coopBuilt'), true);

  /* --- The storm, and the market --------------------------------------- */
  play(s, 'coop');
  assert.equal(flag(s, 'animalsIn'), true);
  play(s, 'farmRen');
  assert.equal(flag(s, 'renHelped'), true);
  trigger(s, 'farm', 'stormPassed');
  assert.equal(s.chapter, 'harvest');

  play(s, 'seedBed');
  assert.ok(hasItem(s, 'basket'), 'there is a crop, battered but real');
  play(s, 'kanae');
  assert.equal(s.chapter, 'home');

  play(s, 'dinnerYuzuki');
  trigger(s, 'bathhouse', 'dinner');
  assert.equal(s.chapter, 'done');

  const home = trigger(s, 'tunnel', 'goHome');
  assert.ok(home.some((e) => e.type === 'ending'), 'walking home through the tunnel ends the game');
});

test('the optional threads can all be completed', () => {
  const s = createState();
  s.chapter = 'water';

  play(s, 'tunnelLantern');
  for (let i = 0; i < 3; i++) play(s, 'darkLamp');
  assert.equal(sideDone(s, 'lampLighter'), true);
  play(s, 'lamplighter');
  assert.ok(hasItem(s, 'riverStone'), 'the lamplighter pays in stones');

  play(s, 'prayerSlips');
  play(s, 'fisher');
  assert.equal(itemCount(s, 'riverStone'), 3, 'three stones, from three different people');
  play(s, 'groveRen');
  assert.equal(flag(s, 'gaveStones'), true);
  assert.equal(sideDone(s, 'riverStones'), true);

  play(s, 'ledgerProp');
  play(s, 'gansuke', ['Nothing. It is your ledger.']);
  assert.equal(sideDone(s, 'frogLedger'), true);
  assert.ok(hasItem(s, 'bathToken'), 'the clerk remembers a kindness');

  play(s, 'yumeno', []);
  assert.equal(sideDone(s, 'teaGarden'), true);
  assert.ok(hasItem(s, 'cuttings'));

  for (let i = 0; i < 3; i++) {
    applyEffects(s, [{ type: 'give', id: 'riceBall' }]);
    play(s, 'strayCat');
  }
  assert.equal(sideDone(s, 'strayCat'), true);
});

test('a second playthrough of a finished beat does not rewind the story', () => {
  const s = createState();
  play(s, 'satchelProp');
  play(s, 'mom', ['I handed in my notice']);
  play(s, 'mei', ['I have absolutely no idea what I am doing.']);
  assert.equal(s.chapter, 'catchTrain');
  play(s, 'mei');
  play(s, 'mom');
  assert.equal(s.chapter, 'catchTrain');
  assert.equal(itemCount(s, 'radishSeed'), 1, 'she does not hand over a second packet');
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createState, addItem, removeItem, itemCount, hasItem, inventoryList,
  applyEffect, applyEffects, advanceTo, atLeast, isChapter, test as cond,
  setFlag, bumpSide, sideDone, tickFade, MAX_HEART
} from '../src/systems/state.js';

test('items add, stack and remove', () => {
  const s = createState();
  addItem(s, 'riceBall', 2);
  assert.equal(itemCount(s, 'riceBall'), 2);
  removeItem(s, 'riceBall');
  assert.equal(itemCount(s, 'riceBall'), 1);
  removeItem(s, 'riceBall');
  assert.equal(hasItem(s, 'riceBall'), false);
  assert.equal(s.items.riceBall, undefined, 'empty stacks are dropped, not left at 0');
});

test('unknown items are rejected rather than silently stored', () => {
  const s = createState();
  assert.throws(() => addItem(s, 'lightsaber'));
});

test('inventory lists key items first', () => {
  const s = createState();
  addItem(s, 'riceBall');
  addItem(s, 'satchel');
  assert.equal(inventoryList(s)[0].id, 'satchel');
});

test('chapters only ever move forward', () => {
  const s = createState();
  assert.equal(advanceTo(s, 'findWork'), true);
  assert.equal(advanceTo(s, 'farewell'), false, 're-triggering an old beat must not rewind');
  assert.equal(s.chapter, 'findWork');
  assert.equal(atLeast(s, 'catchTrain'), true);
  assert.equal(atLeast(s, 'loseName'), false);
  assert.throws(() => advanceTo(s, 'nonsense'));
});

test('effects report events for the presentation layer', () => {
  const s = createState();
  const events = applyEffects(s, [
    { type: 'give', id: 'foxCoin' },
    { type: 'chapter', id: 'farewell' },
    { type: 'teleport', to: { area: 'street', x: 1, y: 2, dir: 'down' } }
  ]);
  assert.ok(hasItem(s, 'foxCoin'));
  assert.equal(isChapter(s, 'farewell'), true);
  assert.deepEqual(events.filter((e) => e.type === 'teleport')[0].to.area, 'street');
  assert.throws(() => applyEffect(s, { type: 'implode' }));
});

test('eating restores heart and clears the fade', () => {
  const s = createState();
  s.heart = 1;
  s.fade = 0.8;
  addItem(s, 'riceBall');
  applyEffect(s, { type: 'eat', id: 'riceBall' });
  assert.equal(s.heart, 3);
  assert.equal(s.fade, 0);
  assert.equal(hasItem(s, 'riceBall'), false);
});

test('heart is clamped at both ends', () => {
  const s = createState();
  applyEffect(s, { type: 'heart', by: 99 });
  assert.equal(s.heart, MAX_HEART);
  applyEffect(s, { type: 'heart', by: -99 });
  assert.equal(s.heart, 0);
});

test('side quests cap at their step count', () => {
  const s = createState();
  bumpSide(s, 'lampLighter', 2);
  assert.equal(sideDone(s, 'lampLighter'), false);
  bumpSide(s, 'lampLighter', 5);
  assert.equal(s.side.lampLighter, 3);
  assert.equal(sideDone(s, 'lampLighter'), true);
});

test('conditions cover the shapes the scripts use', () => {
  const s = createState();
  addItem(s, 'ticket');
  setFlag(s, 'metRen');
  advanceTo(s, 'findWork');
  assert.equal(cond(s, { has: 'ticket' }), true);
  assert.equal(cond(s, { lacks: 'ticket' }), false);
  assert.equal(cond(s, { flag: 'metRen' }), true);
  assert.equal(cond(s, { notFlag: 'metRen' }), false);
  assert.equal(cond(s, { chapter: 'findWork' }), true);
  assert.equal(cond(s, { atLeast: 'catchTrain' }), true);
  assert.equal(cond(s, { before: 'loseName' }), true);
  assert.equal(cond(s, [{ has: 'ticket' }, { before: 'loseName' }]), true);
  assert.equal(cond(s, [{ has: 'ticket' }, { before: 'catchTrain' }]), false);
  assert.equal(cond(s, undefined), true, 'no condition means always allowed');
});

test('fading only bites in the spirit world, and never kills', () => {
  const s = createState();
  advanceTo(s, 'forbiddenFeast');
  tickFade(s, 10, false);
  assert.equal(s.fade, 0, 'the ordinary world does not thin you out');

  let outcome = null;
  for (let i = 0; i < 2000 && outcome !== 'collapse'; i++) {
    outcome = tickFade(s, 1, true);
  }
  assert.equal(outcome, 'collapse');
  assert.equal(s.heart, 0);
});

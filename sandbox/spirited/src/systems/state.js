// The whole savable game. Plain data, no DOM, no canvas — every rule about
// what the player has, knows, and has done lives here so it can be tested.

import { ITEMS } from '../data/items.js';
import { CHAPTERS, CHAPTER_INDEX, SIDE_QUESTS } from '../data/quests.js';

export const SAVE_VERSION = 4;
export const MAX_HEART = 5;

export function createState() {
  return {
    version: SAVE_VERSION,
    chapter: 'packUp',
    trueName: 'Aiko',
    calledName: 'Aiko',
    heart: MAX_HEART,
    flags: {},
    side: {},
    items: {},
    journal: [],
    visited: {},
    talked: {},
    player: { area: 'flat', x: 7 * 32 + 16, y: 6 * 32 + 16, dir: 'down' },
    stats: { steps: 0, seconds: 0, spiritsMet: 0, lampsLit: 0 },
    started: false
  };
}

/* ---------------------------------------------------------------- items -- */

export function itemCount(state, id) {
  return state.items[id] ?? 0;
}

export function hasItem(state, id, qty = 1) {
  return itemCount(state, id) >= qty;
}

export function addItem(state, id, qty = 1) {
  if (!ITEMS[id]) throw new Error(`unknown item: ${id}`);
  state.items[id] = itemCount(state, id) + qty;
  return state.items[id];
}

export function removeItem(state, id, qty = 1) {
  const left = itemCount(state, id) - qty;
  if (left > 0) state.items[id] = left;
  else delete state.items[id];
  return Math.max(0, left);
}

export function inventoryList(state) {
  return Object.keys(state.items)
    .filter((id) => ITEMS[id])
    .sort((a, b) => Number(ITEMS[b].key) - Number(ITEMS[a].key) || a.localeCompare(b))
    .map((id) => ({ id, qty: state.items[id], ...ITEMS[id] }));
}

/* ---------------------------------------------------------------- flags -- */

export function flag(state, name) {
  return Boolean(state.flags[name]);
}

export function setFlag(state, name, value = true) {
  if (value) state.flags[name] = true;
  else delete state.flags[name];
}

/* -------------------------------------------------------------- chapter -- */

export function chapterIndex(state) {
  return CHAPTER_INDEX[state.chapter] ?? 0;
}

export function chapter(state) {
  return CHAPTERS[chapterIndex(state)];
}

// Story only ever moves forward. Re-triggering an old beat is a no-op, which
// keeps re-entered rooms from rewinding the plot.
export function atLeast(state, id) {
  return chapterIndex(state) >= (CHAPTER_INDEX[id] ?? 0);
}

export function isChapter(state, id) {
  return state.chapter === id;
}

export function advanceTo(state, id) {
  const next = CHAPTER_INDEX[id];
  if (next === undefined) throw new Error(`unknown chapter: ${id}`);
  if (next <= chapterIndex(state)) return false;
  state.chapter = id;
  pushJournal(state, CHAPTERS[next].title);
  return true;
}

export function pushJournal(state, line) {
  if (state.journal[state.journal.length - 1] === line) return;
  state.journal.push(line);
  if (state.journal.length > 40) state.journal.shift();
}

/* ---------------------------------------------------------- side quests -- */

export function sideProgress(state, id) {
  return state.side[id] ?? 0;
}

export function sideDone(state, id) {
  return sideProgress(state, id) >= (SIDE_QUESTS[id]?.steps ?? 1);
}

export function bumpSide(state, id, by = 1) {
  if (!SIDE_QUESTS[id]) throw new Error(`unknown side quest: ${id}`);
  const cap = SIDE_QUESTS[id].steps;
  state.side[id] = Math.min(cap, sideProgress(state, id) + by);
  return state.side[id];
}

/* -------------------------------------------------------------- effects -- */
// Dialogue and props describe what happens as data. `applyEffect` is the only
// thing that mutates state, and it hands back presentation events (sounds,
// toasts, teleports) for the layer above to act on.

export function applyEffect(state, fx) {
  const out = [];
  switch (fx.type) {
    case 'give': {
      addItem(state, fx.id, fx.qty ?? 1);
      out.push({ type: 'toast', text: `Got ${ITEMS[fx.id].name}${(fx.qty ?? 1) > 1 ? ` ×${fx.qty}` : ''}` });
      out.push({ type: 'sfx', id: 'pickup' });
      break;
    }
    case 'take': {
      removeItem(state, fx.id, fx.qty ?? 1);
      if (!fx.quiet) out.push({ type: 'toast', text: `Gave up ${ITEMS[fx.id].name}` });
      break;
    }
    case 'flag':
      setFlag(state, fx.id, fx.value !== false);
      break;
    case 'chapter':
      if (advanceTo(state, fx.id)) {
        out.push({ type: 'chapter', id: fx.id });
        out.push({ type: 'sfx', id: 'chapter' });
      }
      break;
    case 'side': {
      const before = sideProgress(state, fx.id);
      const after = bumpSide(state, fx.id, fx.by ?? 1);
      if (after !== before) {
        const q = SIDE_QUESTS[fx.id];
        out.push({ type: 'toast', text: sideDone(state, fx.id) ? `${q.name} — complete` : `${q.name} — ${after}/${q.steps}` });
        out.push({ type: 'sfx', id: 'chime' });
      }
      break;
    }
    case 'rename':
      state.calledName = fx.name;
      out.push({ type: 'rename', name: fx.name });
      break;
    case 'heart':
      state.heart = Math.max(0, Math.min(MAX_HEART, state.heart + fx.by));
      if (fx.by > 0) out.push({ type: 'sfx', id: 'chime' });
      break;
    case 'teleport':
      out.push({ type: 'teleport', to: fx.to });
      break;
    case 'journal':
      pushJournal(state, fx.text);
      break;
    case 'toast':
      out.push({ type: 'toast', text: fx.text });
      break;
    case 'sfx':
    case 'music':
    case 'shake':
    case 'cutscene':
    case 'ending':
      out.push({ ...fx });
      break;
    case 'eat': {
      const item = ITEMS[fx.id];
      if (item?.heals && hasItem(state, fx.id)) {
        removeItem(state, fx.id);
        state.heart = Math.min(MAX_HEART, state.heart + item.heals);
        out.push({ type: 'toast', text: `Ate ${item.name}` });
        out.push({ type: 'sfx', id: 'chime' });
      }
      break;
    }
    default:
      throw new Error(`unknown effect: ${fx.type}`);
  }
  return out;
}

export function applyEffects(state, list = []) {
  return list.flatMap((fx) => applyEffect(state, fx));
}

/* ------------------------------------------------------------ condition -- */
// Declarative gates used by dialogue branches, portals and props.

export function test(state, cond) {
  if (!cond) return true;
  if (Array.isArray(cond)) return cond.every((c) => test(state, c));
  if (typeof cond === 'function') return Boolean(cond(state));
  if (cond.has) return hasItem(state, cond.has, cond.qty ?? 1);
  if (cond.lacks) return !hasItem(state, cond.lacks, cond.qty ?? 1);
  if (cond.flag) return flag(state, cond.flag);
  if (cond.notFlag) return !flag(state, cond.notFlag);
  if (cond.chapter) return isChapter(state, cond.chapter);
  if (cond.atLeast) return atLeast(state, cond.atLeast);
  if (cond.before) return !atLeast(state, cond.before);
  if (cond.sideDone) return sideDone(state, cond.sideDone);
  return true;
}

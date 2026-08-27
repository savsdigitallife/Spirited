// Saving is a JSON blob in localStorage. Three slots, plus an autosave that
// the game writes whenever Aiko walks through a door.

import { SAVE_VERSION, createState } from './state.js';

const PREFIX = 'spirited:save:';

function key(slot) {
  return `${PREFIX}${slot}`;
}

export function canStore() {
  try {
    const probe = `${PREFIX}probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function saveGame(state, slot = 'auto') {
  if (!canStore()) return false;
  try {
    const blob = JSON.stringify({ ...state, savedAt: Date.now() });
    localStorage.setItem(key(slot), blob);
    return true;
  } catch {
    return false;
  }
}

export function loadGame(slot = 'auto') {
  if (!canStore()) return null;
  try {
    const raw = localStorage.getItem(key(slot));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== SAVE_VERSION) return null;
    // Merge over a fresh state so new fields added since the save still exist.
    return { ...createState(), ...data };
  } catch {
    return null;
  }
}

export function saveInfo(slot = 'auto') {
  const data = loadGame(slot);
  if (!data) return null;
  return {
    chapter: data.chapter,
    name: data.calledName,
    area: data.player.area,
    savedAt: data.savedAt ?? 0
  };
}

export function clearSave(slot = 'auto') {
  if (!canStore()) return;
  localStorage.removeItem(key(slot));
}

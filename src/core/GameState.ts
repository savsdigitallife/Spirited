/**
 * Game state: the facts the game remembers.
 *
 * One authority per fact. Systems do not each keep their own copy of
 * "has the player boarded the train"; they read it here and react to
 * `state/changed`. That is what makes a save file a snapshot of this object
 * rather than a scavenger hunt through every system.
 *
 * The record is versioned and migrated on load, so an old save from an
 * earlier build opens instead of throwing.
 */

import { events } from "./Events";

export const SAVE_VERSION = 1;
const STORAGE_KEY = "nagori.save.v1";

export interface PlayerPose {
  x: number;
  y: number;
  z: number;
  /** Facing, radians. */
  yaw: number;
}

export interface SaveData {
  version: number;
  /** Where the story is, in broad strokes. */
  chapter: string;
  /** Which region the player was standing in. */
  region: string;
  player: PlayerPose;
  clock: { day: number; timeOfDay: number };
  /** One-shot story facts: "boardedTrain", "metTheThingInTheTrees". */
  flags: Record<string, boolean>;
  /** Things that accumulate: crops harvested, days worked. */
  counters: Record<string, number>;
  /** itemId → quantity. */
  inventory: Record<string, number>;
  savedAt: number;
}

function emptySave(): SaveData {
  return {
    version: SAVE_VERSION,
    chapter: "tokyo",
    region: "tokyoStreet",
    player: { x: 0, y: 0, z: 0, yaw: 0 },
    clock: { day: 1, timeOfDay: 0.86 },
    flags: {},
    counters: {},
    inventory: {},
    savedAt: 0,
  };
}

/** Brings an older record up to the current shape. */
function migrate(raw: Partial<SaveData> & { version?: number }): SaveData {
  const base = emptySave();
  // Version 1 is the first shape there is; later versions add cases here.
  return {
    ...base,
    ...raw,
    version: SAVE_VERSION,
    player: { ...base.player, ...raw.player },
    clock: { ...base.clock, ...raw.clock },
    flags: { ...raw.flags },
    counters: { ...raw.counters },
    inventory: { ...raw.inventory },
  };
}

export class GameState {
  private data: SaveData = emptySave();

  get chapter(): string {
    return this.data.chapter;
  }

  get region(): string {
    return this.data.region;
  }

  get snapshot(): Readonly<SaveData> {
    return this.data;
  }

  setChapter(chapter: string): void {
    if (this.data.chapter === chapter) return;
    this.data.chapter = chapter;
    events.emit("state/changed", { key: "chapter", value: chapter });
  }

  setRegion(region: string): void {
    this.data.region = region;
  }

  setPlayerPose(pose: PlayerPose): void {
    this.data.player = pose;
  }

  setClock(day: number, timeOfDay: number): void {
    this.data.clock = { day, timeOfDay };
  }

  flag(name: string): boolean {
    return this.data.flags[name] === true;
  }

  /** Returns true the first time a flag is raised, false if it already was. */
  raise(name: string): boolean {
    if (this.data.flags[name]) return false;
    this.data.flags[name] = true;
    events.emit("state/changed", { key: `flag:${name}`, value: true });
    return true;
  }

  counter(name: string): number {
    return this.data.counters[name] ?? 0;
  }

  add(name: string, amount = 1): number {
    const next = this.counter(name) + amount;
    this.data.counters[name] = next;
    events.emit("state/changed", { key: `counter:${name}`, value: next });
    return next;
  }

  itemCount(id: string): number {
    return this.data.inventory[id] ?? 0;
  }

  give(id: string, quantity = 1): number {
    const next = Math.max(0, this.itemCount(id) + quantity);
    if (next === 0) delete this.data.inventory[id];
    else this.data.inventory[id] = next;
    events.emit("state/changed", { key: `item:${id}`, value: next });
    return next;
  }

  take(id: string, quantity = 1): boolean {
    if (this.itemCount(id) < quantity) return false;
    this.give(id, -quantity);
    return true;
  }

  save(): boolean {
    try {
      this.data.savedAt = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      events.emit("state/saved", { at: this.data.savedAt });
      return true;
    } catch (err) {
      console.warn("[state] could not save", err);
      return false;
    }
  }

  load(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      this.data = migrate(JSON.parse(raw) as Partial<SaveData>);
      events.emit("state/loaded", { chapter: this.data.chapter });
      return true;
    } catch (err) {
      console.warn("[state] could not load; starting fresh", err);
      this.data = emptySave();
      return false;
    }
  }

  clear(): void {
    this.data = emptySave();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to do; the in-memory reset already happened.
    }
  }
}

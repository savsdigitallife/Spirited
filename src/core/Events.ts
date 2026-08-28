/**
 * Typed event bus.
 *
 * Systems never hold references to each other; they publish and subscribe.
 * That keeps the dependency graph a star rather than a mesh, which is what
 * makes it possible to add (or delete) a system in a later phase without
 * touching the ones already working.
 */

export type Unsubscribe = () => void;

type Handler<T> = (payload: T) => void;

export class EventBus<M extends object> {
  private readonly handlers = new Map<keyof M, Set<Handler<never>>>();

  on<K extends keyof M>(type: K, handler: Handler<M[K]>): Unsubscribe {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(type, handler);
  }

  once<K extends keyof M>(type: K, handler: Handler<M[K]>): Unsubscribe {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof M>(type: K, handler: Handler<M[K]>): void {
    this.handlers.get(type)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof M>(type: K, payload: M[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    // Copy so a handler may unsubscribe (or subscribe) during dispatch.
    for (const handler of [...set]) {
      try {
        (handler as Handler<M[K]>)(payload);
      } catch (err) {
        console.error(`[events] handler for "${String(type)}" threw`, err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

export type BackendKind = "webgpu" | "webgl2" | "webgl1";

/** Every event the game can raise. Adding a phase means adding rows here. */
export interface GameEventMap {
  "engine/ready": { backend: BackendKind; caps: readonly string[] };
  "engine/resize": { width: number; height: number };
  "settings/changed": { preset: string };
  "scene/loadStart": { id: string };
  "scene/loadProgress": { id: string; fraction: number; message: string };
  "scene/ready": { id: string };
  "scene/disposed": { id: string };
  "clock/dayChanged": { day: number };
  "input/action": { action: string; pressed: boolean };
  "debug/toggle": { visible: boolean };
  "state/changed": { key: string; value: unknown };
  "state/saved": { at: number };
  "state/loaded": { chapter: string };
  "ui/prompt": { text: string | null };
  "ui/caption": { text: string; seconds: number };
  "ui/objective": { text: string | null };
  "audio/unlocked": { context: "user-gesture" };
  "assets/report": { region: string; generated: number; total: number };
}

export const events = new EventBus<GameEventMap>();

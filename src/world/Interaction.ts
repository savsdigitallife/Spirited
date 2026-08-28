/**
 * Interaction points.
 *
 * A registry rather than per-object logic: things in the world declare a
 * position, a radius and what pressing the key does, and one update picks
 * the best candidate, shows the prompt and fires the callback. Scenes stay
 * declarative, and the prompt can never disagree with what the key will do.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { UI } from "../ui/UI";
import type { InputManager } from "../input/InputManager";

export interface Interactable {
  id: string;
  position: Vector3;
  /** Metres within which the prompt appears. */
  radius: number;
  /** Shown next to the key cap, e.g. "Enter the station". */
  label: string;
  key?: string;
  /** Returning false leaves the interactable active for another go. */
  activate: () => void | Promise<void>;
  enabled?: boolean;
}

export class InteractionSystem {
  private readonly points = new Map<string, Interactable>();
  private active: Interactable | null = null;
  private busy = false;

  constructor(
    private readonly ui: UI,
    private readonly input: InputManager,
  ) {}

  add(point: Interactable): void {
    this.points.set(point.id, point);
  }

  remove(id: string): void {
    this.points.delete(id);
    if (this.active?.id === id) {
      this.active = null;
      this.ui.hidePrompt();
    }
  }

  setEnabled(id: string, enabled: boolean): void {
    const point = this.points.get(id);
    if (point) point.enabled = enabled;
  }

  /** Call once per frame with the player's position. */
  update(playerPosition: Vector3): void {
    let best: Interactable | null = null;
    let bestDistance = Infinity;
    for (const point of this.points.values()) {
      if (point.enabled === false) continue;
      const distance = Vector3.Distance(playerPosition, point.position);
      if (distance <= point.radius && distance < bestDistance) {
        best = point;
        bestDistance = distance;
      }
    }

    if (best !== this.active) {
      this.active = best;
      if (best) this.ui.showPrompt({ key: best.key ?? "E", label: best.label });
      else this.ui.hidePrompt();
    }

    if (this.active && !this.busy && this.input.justPressed("interact")) {
      const point = this.active;
      const result = point.activate();
      if (result instanceof Promise) {
        this.busy = true;
        void result.finally(() => {
          this.busy = false;
        });
      }
    }
  }

  dispose(): void {
    this.points.clear();
    this.ui.hidePrompt();
  }
}

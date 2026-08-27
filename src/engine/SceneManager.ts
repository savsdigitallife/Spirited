/**
 * Region registry and scene lifecycle.
 *
 * A Babylon `Scene` is treated as one streamable region of the world (the
 * farm, the valley, a shop interior, the city). The manager owns creation,
 * the swap, and disposal; nothing else keeps a reference to a scene that
 * might be unloaded.
 *
 * Only one region is active at a time in Phase 1. The interface is already
 * async and progress-reporting so that background pre-loading of an
 * adjacent region can be added later without changing callers.
 */

import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { QualitySettings } from "../core/Settings";
import type { Settings } from "../core/Settings";
import type { Time } from "../core/Time";
import type { InputManager } from "../input/InputManager";
import type { AssetLoader } from "./AssetLoader";
import { events } from "../core/Events";

export interface SceneContext {
  engine: AbstractEngine;
  settings: Settings;
  assets: AssetLoader;
  input: InputManager;
  time: Time;
  /** True when the backend can render into float/half-float targets. */
  hdr: boolean;
  progress(fraction: number, message: string): void;
  /**
   * Hands a new active camera to the render pipeline. Regions call this
   * when they swap between, say, first and third person, so post-processing
   * follows the camera instead of being rebuilt.
   */
  setActiveCamera(camera: Camera): void;
}

/** What every region must provide back to the game loop. */
export interface GameScene {
  readonly id: string;
  readonly scene: Scene;
  readonly camera: Camera;
  /** Per rendered frame. */
  update(time: Time): void;
  /** Per fixed simulation step. Optional until a region needs one. */
  fixedUpdate?(dt: number): void;
  onSettingsChanged?(quality: Readonly<QualitySettings>): void;
  onResize?(width: number, height: number): void;
  dispose(): void;
}

export type SceneFactory = (context: SceneContext) => Promise<GameScene>;

export class SceneManager {
  private readonly factories = new Map<string, SceneFactory>();
  private current: GameScene | null = null;
  private transition: Promise<GameScene> | null = null;

  constructor(private readonly context: Omit<SceneContext, "progress">) {}

  register(id: string, factory: SceneFactory): void {
    this.factories.set(id, factory);
  }

  get active(): GameScene | null {
    return this.current;
  }

  get isLoading(): boolean {
    return this.transition !== null;
  }

  async goTo(id: string): Promise<GameScene> {
    if (this.transition) await this.transition.catch(() => undefined);

    const factory = this.factories.get(id);
    if (!factory) throw new Error(`[scenes] no region registered as "${id}"`);

    events.emit("scene/loadStart", { id });

    const build = factory({
      ...this.context,
      progress: (fraction, message) =>
        events.emit("scene/loadProgress", { id, fraction, message }),
    });
    this.transition = build;

    let next: GameScene;
    try {
      next = await build;
    } finally {
      this.transition = null;
    }

    // The old region is torn down only once the new one exists, so a
    // failed load leaves the player somewhere rather than nowhere.
    const previous = this.current;
    this.current = next;
    if (previous) {
      previous.dispose();
      this.context.assets.forgetScene(previous.scene);
      previous.scene.dispose();
      events.emit("scene/disposed", { id: previous.id });
    }

    next.onSettingsChanged?.(this.context.settings.value);
    events.emit("scene/ready", { id });
    return next;
  }

  render(time: Time): void {
    const active = this.current;
    if (!active) return;
    active.update(time);
    if (active.fixedUpdate) {
      time.consumeFixedSteps((dt) => active.fixedUpdate?.(dt));
    }
    active.scene.render();
  }

  notifySettings(quality: Readonly<QualitySettings>): void {
    this.current?.onSettingsChanged?.(quality);
  }

  notifyResize(width: number, height: number): void {
    this.current?.onResize?.(width, height);
  }

  dispose(): void {
    const active = this.current;
    this.current = null;
    if (!active) return;
    active.dispose();
    active.scene.dispose();
  }
}

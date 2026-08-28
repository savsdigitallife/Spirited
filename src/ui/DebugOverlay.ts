/**
 * Developer HUD.
 *
 * DOM rather than in-scene: it must stay readable when the render pipeline
 * is the thing under suspicion, and it must cost close to nothing. It reads
 * the engine's own counters, so what it reports is what the renderer did,
 * not what the game meant to do.
 */

import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Scene } from "@babylonjs/core/scene";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import type { Time } from "../core/Time";
import type { QualitySettings } from "../core/Settings";

const STYLE = `
position:fixed;top:10px;left:10px;z-index:6;pointer-events:none;
font:400 11.5px/1.65 ui-monospace,"SF Mono",Menlo,Consolas,monospace;
color:#cfd8d4;background:rgba(8,11,14,.62);backdrop-filter:blur(6px);
border:1px solid rgba(255,255,255,.09);border-radius:6px;padding:9px 12px;
white-space:pre;letter-spacing:.02em;text-shadow:0 1px 2px rgba(0,0,0,.7);
`;

export class DebugOverlay {
  private readonly root: HTMLDivElement;
  private visible = false;
  private accumulator = 0;
  private frames = 0;
  private fps = 0;
  private worst = 0;
  private lastStamp = 0;
  private backend = "";
  private capsLine = "";
  private instrumentation: SceneInstrumentation | null = null;
  private instrumentedScene: Scene | null = null;

  constructor() {
    this.root = document.createElement("div");
    this.root.setAttribute("style", STYLE);
    this.root.hidden = true;
    document.body.appendChild(this.root);
  }

  describeEngine(backend: string, caps: readonly string[]): void {
    this.backend = backend;
    this.capsLine = caps.join("  ·  ");
  }

  toggle(): boolean {
    this.visible = !this.visible;
    this.root.hidden = !this.visible;
    return this.visible;
  }

  update(
    engine: AbstractEngine,
    scene: Scene | null,
    time: Time,
    quality: Readonly<QualitySettings>,
  ): void {
    // Measured off the wall clock, not off Time: the simulation clamps its
    // delta so a stall cannot teleport anything, and a diagnostic that
    // inherited that clamp would quietly report a floor of 10 fps.
    const now = performance.now();
    const frameMs = this.lastStamp === 0 ? 0 : now - this.lastStamp;
    this.lastStamp = now;

    // The frame counter runs even while hidden, so opening the overlay
    // shows a settled number instead of a spike.
    this.frames += 1;
    this.accumulator += frameMs / 1000;
    if (frameMs > this.worst) this.worst = frameMs;
    if (this.accumulator >= 0.5) {
      this.fps = this.frames / this.accumulator;
      this.frames = 0;
      this.accumulator = 0;
      this.worst = frameMs;
    }
    if (!this.visible) return;

    const size = `${engine.getRenderWidth()}×${engine.getRenderHeight()}`;
    const scale = engine.getHardwareScalingLevel().toFixed(2);
    const draws = this.drawCalls(scene);
    const meshes = scene ? scene.getActiveMeshes().length : 0;
    const total = scene ? scene.meshes.length : 0;
    const materials = scene ? scene.materials.length : 0;
    const indices = scene ? scene.getActiveIndices() : 0;

    this.root.textContent = [
      `NAGORI  ·  ${this.backend}  ·  ${quality.preset}`,
      `${this.fps.toFixed(0)} fps   frame ${(1000 / Math.max(1, this.fps)).toFixed(1)} ms   worst ${this.worst.toFixed(1)} ms`,
      `${size} @ scale ${scale}`,
      `draws ${draws}   meshes ${meshes}/${total}   tris ${Math.round(indices / 3).toLocaleString()}   mats ${materials}`,
      `shadows ${quality.shadowsEnabled ? `${quality.shadowMapSize}px × ${quality.shadowCascades} ${quality.shadowFiltering}` : "off"}   ssao ${quality.ssao ? "on" : "off"}   bloom ${quality.bloom ? "on" : "off"}   aa ${quality.antialias}`,
      `cam ${this.describeCamera(scene)}`,
      `day ${time.day}   ${time.formatTimeOfDay()}`,
      this.capsLine,
      `[\`] overlay   [F4] quality   [V] shoulder   [P] pause   [M] mute`,
    ].join("\n");
  }

  private describeCamera(scene: Scene | null): string {
    const camera = scene?.activeCamera;
    if (!camera) return "none";
    const p = camera.globalPosition;
    return `${camera.name}  ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}  fov ${camera.fov.toFixed(2)}  z ${camera.minZ}–${camera.maxZ}`;
  }

  /**
   * Draw calls come from a SceneInstrumentation, attached lazily so a
   * player who never opens the overlay never pays for the counters.
   */
  private drawCalls(scene: Scene | null): number {
    if (!scene) return 0;
    if (this.instrumentedScene !== scene) {
      this.instrumentation?.dispose();
      this.instrumentation = new SceneInstrumentation(scene);
      this.instrumentedScene = scene;
    }
    return this.instrumentation?.drawCallsCounter.current ?? 0;
  }

  dispose(): void {
    this.instrumentation?.dispose();
    this.instrumentation = null;
    this.instrumentedScene = null;
    this.root.remove();
  }
}

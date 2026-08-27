/**
 * The game object: owns the engine, the clock, the input, the regions and
 * the render loop, and nothing else.
 *
 * Systems are constructed here and handed to regions through a context, so
 * a region never reaches upward for a global. That is what will let the
 * same region code run in a test harness later.
 */

import "./babylonSideEffects";

import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Camera } from "@babylonjs/core/Cameras/camera";

import { createEngine } from "./EngineFactory";
import { detectPreset, Settings } from "./Settings";
import { Time } from "./Time";
import { events } from "./Events";
import { RenderPipeline } from "./RenderPipeline";
import { BootScreen } from "../engine/LoadingScreen";
import { AssetLoader } from "../engine/AssetLoader";
import { SceneManager } from "../engine/SceneManager";
import { InputManager } from "../input/InputManager";
import { DebugOverlay } from "../ui/DebugOverlay";
import { createProvingGround, PROVING_GROUND_ID } from "../scenes/ProvingGround";

/** How far adaptive resolution may drop below the preset's own scaling. */
const MAX_ADAPTIVE_SCALE = 1.6;
/**
 * Seconds between resolution adjustments. Each one resizes the backbuffer,
 * which is not free and which makes the canvas visibly flicker if it
 * happens every frame — so the loop is allowed to react only occasionally,
 * and only to a sustained miss rather than to one slow frame.
 */
const ADAPT_INTERVAL = 0.8;

export class Game {
  private engine: AbstractEngine | null = null;
  private settings: Settings | null = null;
  private input: InputManager | null = null;
  private scenes: SceneManager | null = null;
  private pipeline: RenderPipeline | null = null;
  private readonly time = new Time({ secondsPerDay: 16 * 60, startTimeOfDay: 0.34 });
  private readonly boot = new BootScreen();
  private readonly overlay = new DebugOverlay();
  private readonly assets = new AssetLoader();
  private hdr = false;

  private adaptiveScale = 1;
  private fpsAverage = 60;
  private sinceAdapt = 0;
  private disposed = false;
  /** `?adaptive=0` pins the resolution, for benchmarking and screenshots. */
  private readonly adaptiveAllowed =
    new URLSearchParams(location.search).get("adaptive") !== "0";

  constructor(private readonly canvas: HTMLCanvasElement) {}

  async start(): Promise<void> {
    this.boot.displayLoadingUI();
    this.boot.status("Starting renderer…", 0.05);

    const info = await createEngine({
      canvas: this.canvas,
      onStatus: (message) => this.boot.status(message),
    });
    if (this.disposed) {
      info.engine.dispose();
      return;
    }

    const engine = info.engine;
    this.engine = engine;
    this.hdr = info.supportsHdrPipeline;
    engine.loadingScreen = this.boot;
    this.overlay.describeEngine(info.backend, info.caps);
    events.emit("engine/ready", { backend: info.backend, caps: info.caps });
    console.info(`[nagori] renderer: ${info.backend}\n  ${info.caps.join("\n  ")}`);

    const settings = Settings.load(detectPreset(info.backend === "webgpu"));
    this.settings = settings;
    this.adaptiveScale = settings.value.hardwareScaling;
    engine.setHardwareScalingLevel(this.adaptiveScale);

    const input = new InputManager(this.canvas);
    input.attach();
    this.input = input;

    const scenes = new SceneManager({
      engine,
      settings,
      assets: this.assets,
      input,
      time: this.time,
      hdr: this.hdr,
      setActiveCamera: (camera: Camera) => this.pipeline?.setCamera(camera),
    });
    scenes.register(PROVING_GROUND_ID, createProvingGround);
    this.scenes = scenes;

    events.on("scene/loadProgress", ({ fraction, message }) => {
      // The first 10% of the bar belongs to engine start-up.
      this.boot.status(message, 0.1 + fraction * 0.9);
    });
    events.on("settings/changed", () => this.onSettingsChanged());

    this.boot.status("Building the region…", 0.1);
    const region = await scenes.goTo(PROVING_GROUND_ID);
    if (this.disposed) return;

    this.pipeline = new RenderPipeline(region.scene, region.camera, this.hdr);
    this.pipeline.apply(settings.value);
    await region.scene.whenReadyAsync();

    // A handle for the browser console and for the automated smoke test.
    // Off in a normal production load so the game exposes no globals.
    if (import.meta.env.DEV || new URLSearchParams(location.search).has("capture")) {
      (window as unknown as { nagori?: unknown }).nagori = {
        game: this,
        engine,
        settings,
        scenes,
        time: this.time,
        pipeline: () => this.pipeline,
      };
    }

    window.addEventListener("resize", this.onResize);
    engine.runRenderLoop(this.frame);
    this.canvas.focus();
    this.boot.hideLoadingUI();
  }

  private readonly frame = (): void => {
    const engine = this.engine;
    const scenes = this.scenes;
    const input = this.input;
    const settings = this.settings;
    if (!engine || !scenes || !input || !settings) return;

    this.time.advance(engine.getDeltaTime());
    input.poll();

    if (input.justPressed("debug")) {
      events.emit("debug/toggle", { visible: this.overlay.toggle() });
    }
    if (input.justPressed("cycleQuality")) {
      settings.cycle();
    }

    scenes.render(this.time);
    this.adapt(engine, settings);
    this.overlay.update(engine, scenes.active?.scene ?? null, this.time, settings.value);
    input.endFrame();
  };

  /**
   * Adaptive resolution. Rather than dropping features mid-play, the
   * cheapest correction is to render fewer pixels and let the upscale hide
   * it — and it is reversible the moment the frame budget recovers.
   */
  private adapt(engine: AbstractEngine, settings: Settings): void {
    const q = settings.value;
    if (!q.adaptiveQuality || !this.adaptiveAllowed) {
      if (this.adaptiveScale !== q.hardwareScaling) {
        this.adaptiveScale = q.hardwareScaling;
        engine.setHardwareScalingLevel(this.adaptiveScale);
      }
      return;
    }

    const instant = 1 / Math.max(0.001, this.time.rawDeltaSeconds);
    this.fpsAverage += (instant - this.fpsAverage) * 0.05;

    this.sinceAdapt += this.time.rawDeltaSeconds;
    if (this.sinceAdapt < ADAPT_INTERVAL) return;
    this.sinceAdapt = 0;

    const floor = q.hardwareScaling;
    const ceiling = q.hardwareScaling * MAX_ADAPTIVE_SCALE;
    const target = q.targetFps;
    let next = this.adaptiveScale;

    if (this.fpsAverage < target * 0.82 && this.adaptiveScale < ceiling) {
      next = Math.min(ceiling, this.adaptiveScale + 0.1);
    } else if (this.fpsAverage > target * 0.97 && this.adaptiveScale > floor) {
      next = Math.max(floor, this.adaptiveScale - 0.05);
    }

    if (Math.abs(next - this.adaptiveScale) > 0.001) {
      this.adaptiveScale = next;
      engine.setHardwareScalingLevel(next);
    }
  }

  private onSettingsChanged(): void {
    const settings = this.settings;
    const engine = this.engine;
    if (!settings || !engine) return;
    this.adaptiveScale = settings.value.hardwareScaling;
    this.sinceAdapt = -1.5; // Let the new preset settle before judging it.
    this.fpsAverage = settings.value.targetFps;
    engine.setHardwareScalingLevel(this.adaptiveScale);
    this.pipeline?.apply(settings.value);
    this.scenes?.notifySettings(settings.value);
    // The pipeline was rebuilt against whatever size the engine reported
    // mid-change; one more resize makes every render target agree with the
    // backbuffer that actually exists now.
    engine.resize(true);
  }

  private readonly onResize = (): void => {
    const engine = this.engine;
    if (!engine) return;
    engine.resize();
    const width = engine.getRenderWidth();
    const height = engine.getRenderHeight();
    this.scenes?.notifyResize(width, height);
    events.emit("engine/resize", { width, height });
  };

  fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[nagori] fatal", error);
    this.boot.fail(message);
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener("resize", this.onResize);
    this.engine?.stopRenderLoop();
    this.pipeline?.dispose();
    this.scenes?.dispose();
    this.input?.dispose();
    this.overlay.dispose();
    this.engine?.dispose();
    this.engine = null;
  }
}

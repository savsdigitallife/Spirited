/**
 * Post-processing chain.
 *
 * One object owns every screen-space effect, so a quality change is a
 * single `apply()` rather than a hunt through the scene.
 *
 * `apply()` tears the pipeline down and rebuilds it rather than toggling
 * effects on the live one. Toggling is cheaper, and it was what this did
 * first — but stepping from Ultra down to Low left the chain rendering a
 * stale blurred buffer over the whole screen, because MSAA sample count,
 * the depth-of-field chain and SSAO's render targets all have to change
 * together. A preset change is a rare, deliberate act that already
 * reallocates shadow maps; paying one hitch there buys a pipeline whose
 * state cannot drift.
 */

import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { DepthOfFieldEffectBlurLevel } from "@babylonjs/core/PostProcesses/depthOfFieldEffect";
import type { QualitySettings } from "./Settings";

export class RenderPipeline {
  private readonly scene: Scene;
  private camera: Camera;
  private readonly hdr: boolean;

  private main: DefaultRenderingPipeline | null = null;
  private ssao: SSAO2RenderingPipeline | null = null;
  private ssaoRatio = -1;
  private lastQuality: Readonly<QualitySettings> | null = null;

  constructor(scene: Scene, camera: Camera, hdr: boolean) {
    this.scene = scene;
    this.camera = camera;
    this.hdr = hdr;
  }

  apply(q: Readonly<QualitySettings>): void {
    this.lastQuality = q;
    this.disposeSsao();
    this.main?.dispose();
    this.main = new DefaultRenderingPipeline("nagori.post", this.hdr, this.scene, [
      this.camera,
    ]);
    const p = this.main;

    p.bloomEnabled = q.bloom;
    p.bloomThreshold = 0.72;
    p.bloomWeight = 0.28;
    p.bloomKernel = 48;
    p.bloomScale = 0.5;

    p.depthOfFieldEnabled = q.depthOfField;
    p.depthOfFieldBlurLevel = DepthOfFieldEffectBlurLevel.Low;
    p.depthOfField.focalLength = 42;
    p.depthOfField.fStop = 4.4;
    p.depthOfField.focusDistance = 12_000; // millimetres

    p.grainEnabled = q.grain;
    p.grain.intensity = 4.5;
    p.grain.animated = true;

    p.chromaticAberrationEnabled = q.chromaticAberration;
    p.chromaticAberration.aberrationAmount = 6;
    p.chromaticAberration.radialIntensity = 0.7;

    p.sharpenEnabled = q.preset !== "low";
    p.sharpen.edgeAmount = 0.16;
    p.sharpen.colorAmount = 1;

    p.fxaaEnabled = q.antialias === "fxaa";
    p.samples = q.antialias === "msaa4" ? 4 : q.antialias === "msaa2" ? 2 : 1;

    // Filmic response. Without tone mapping a PBR scene lit by a bright sun
    // clips to white the moment anything is in direct light.
    const ip = p.imageProcessing;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.4;
    ip.contrast = 1.06;
    // A vignette is a hint, not a tunnel. Anything heavier reads as the
    // renderer being broken rather than as a lens.
    ip.vignetteEnabled = q.preset !== "low";
    ip.vignetteWeight = 0.6;
    ip.vignetteStretch = 0;
    ip.vignetteCameraFov = 1.2;

    this.applySsao(q);
  }

  private applySsao(q: Readonly<QualitySettings>): void {
    if (!q.ssao) return;
    const ssao = new SSAO2RenderingPipeline(
      "nagori.ssao",
      this.scene,
      { ssaoRatio: q.ssaoRatio, blurRatio: Math.min(1, q.ssaoRatio) },
      [this.camera],
      false,
    );
    ssao.radius = 1.4;
    ssao.totalStrength = 0.95;
    ssao.base = 0.15;
    ssao.samples = q.preset === "ultra" ? 24 : 12;
    ssao.expensiveBlur = q.preset === "ultra";
    ssao.maxZ = Math.min(180, q.drawDistance);
    this.ssao = ssao;
    this.ssaoRatio = q.ssaoRatio;
  }

  /** Re-target both pipelines when the active camera changes (first/third person). */
  setCamera(camera: Camera): void {
    if (this.camera === camera) return;
    const previous = this.camera;
    this.camera = camera;
    if (this.main) {
      this.main.removeCamera(previous);
      this.main.addCamera(camera);
    }
    // SSAO2 binds its cameras at construction, so a camera swap rebuilds
    // it. Camera swaps are rare (a view-mode toggle), a frame hitch there is
    // acceptable, and it keeps the ownership rule simple.
    if (this.ssao && this.lastQuality) {
      const q = this.lastQuality;
      this.disposeSsao();
      this.applySsao(q);
    }
  }

  private disposeSsao(): void {
    if (!this.ssao) return;
    this.ssao.dispose();
    this.ssao = null;
    this.ssaoRatio = -1;
  }

  dispose(): void {
    this.disposeSsao();
    this.main?.dispose();
    this.main = null;
  }
}

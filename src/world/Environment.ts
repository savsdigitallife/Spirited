/**
 * Atmosphere: fog, clear colour, and image-based lighting.
 *
 * The IBL cube is rendered from the sky itself with a reflection probe, so
 * ambient reflections change with the time of day and no pre-baked .env
 * asset has to ship. The probe is refreshed on a slow cadence — the sky
 * moves in minutes, not milliseconds, and a cube render every frame would
 * cost six extra passes for nothing.
 */

import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { ReflectionProbe } from "@babylonjs/core/Probes/reflectionProbe";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { QualitySettings } from "../core/Settings";
import type { Sky } from "./Sky";

/** In-game seconds between IBL refreshes. */
const PROBE_INTERVAL = 4;

export class Environment {
  private probe: ReflectionProbe | null = null;
  private sinceProbe = PROBE_INTERVAL;
  private fogTint = new Color3(0.6, 0.7, 0.8);

  constructor(
    private readonly scene: Scene,
    private readonly sky: Sky,
  ) {
    scene.clearColor = new Color4(0.02, 0.03, 0.045, 1);
    scene.ambientColor = new Color3(0.12, 0.13, 0.15);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.006;
    scene.environmentIntensity = 0.85;
  }

  applySettings(q: Readonly<QualitySettings>): void {
    // Fog is the honest way to hide the draw distance: density is derived
    // from it so a shorter view distance never shows a hard cut-off.
    this.scene.fogDensity = 2.6 / Math.max(60, q.drawDistance);

    const wantProbe = q.preset !== "low";
    if (!wantProbe) {
      this.disposeProbe();
      return;
    }
    const size = q.preset === "ultra" ? 256 : 128;
    if (this.probe && this.probe.cubeTexture.getSize().width === size) return;

    this.disposeProbe();
    const probe = new ReflectionProbe("nagori.ibl", size, this.scene, false);
    probe.position = new Vector3(0, 6, 0);
    // Manual refresh: we decide when the sky has changed enough to matter.
    probe.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    probe.renderList = [this.sky.mesh as Mesh];
    this.scene.environmentTexture = probe.cubeTexture;
    this.probe = probe;
    this.sinceProbe = PROBE_INTERVAL;
  }

  update(deltaSeconds: number): void {
    const solar = this.sky.solar;
    this.fogTint = this.sky.horizonColor();
    this.scene.fogColor = this.fogTint;
    this.scene.clearColor = new Color4(
      this.fogTint.r,
      this.fogTint.g,
      this.fogTint.b,
      1,
    );
    this.scene.environmentIntensity = 0.25 + solar.daylight * 0.85;

    if (!this.probe) return;
    this.sinceProbe += deltaSeconds;
    if (this.sinceProbe >= PROBE_INTERVAL) {
      this.sinceProbe = 0;
      this.probe.cubeTexture.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    }
  }

  private disposeProbe(): void {
    if (!this.probe) return;
    if (this.scene.environmentTexture === this.probe.cubeTexture) {
      this.scene.environmentTexture = null;
    }
    this.probe.dispose();
    this.probe = null;
  }

  dispose(): void {
    this.disposeProbe();
  }
}

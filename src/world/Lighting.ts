/**
 * Sun, moon, ambient and cascaded shadows.
 *
 * There is exactly one shadow-casting directional light. At night it swings
 * to the moon's direction and changes colour rather than a second light
 * being switched in — one CSM allocation, one shadow pass, no popping when
 * the sun sets.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { QualitySettings } from "../core/Settings";
import type { SolarState } from "./Sky";

const SUN_HIGH = new Color3(1, 0.965, 0.905);
const SUN_LOW = new Color3(1, 0.6, 0.34);
const MOON = new Color3(0.52, 0.64, 0.95);

const SKY_DAY = new Color3(0.46, 0.58, 0.74);
const SKY_NIGHT = new Color3(0.06, 0.09, 0.16);
const GROUND_DAY = new Color3(0.24, 0.22, 0.18);
const GROUND_NIGHT = new Color3(0.03, 0.04, 0.05);

export class Lighting {
  readonly key: DirectionalLight;
  readonly ambient: HemisphericLight;
  private shadows: CascadedShadowGenerator | null = null;
  private casters = new Set<AbstractMesh>();
  private mapSize = 0;
  /**
   * Extra ambient a lit environment throws back at night. A field at
   * midnight really is almost black; a neon street is not, and faking that
   * bounce with the ambient term is far cheaper than lighting it for real.
   */
  private urbanGlow: { sky: Color3; ground: Color3; intensity: number } | null = null;

  constructor(private readonly scene: Scene) {
    // Direction is overwritten every frame; the initial value only has to be
    // non-degenerate so Babylon can build the light's matrices.
    this.key = new DirectionalLight("nagori.key", new Vector3(-0.5, -1, -0.3), scene);
    this.key.intensity = 2.6;
    this.key.shadowMinZ = 1;
    this.key.shadowMaxZ = 140;
    this.key.autoUpdateExtends = true;

    this.ambient = new HemisphericLight("nagori.ambient", Vector3.Up(), scene);
    this.ambient.intensity = 0.55;
    this.ambient.diffuse = SKY_DAY;
    this.ambient.groundColor = GROUND_DAY;
    this.ambient.specular = Color3.Black();
  }

  /**
   * Applies a quality preset to the shadows.
   *
   * The generator is created once and then reconfigured in place — its
   * `mapSize` setter recreates only the render target. Disposing the
   * generator and constructing a replacement looks equivalent but is not:
   * every material that had already compiled against the old one keeps
   * sampling a texture that no longer exists, and the whole scene renders
   * as a flat washed-out grey. Marking materials dirty afterwards does not
   * recover it. So: one generator, reconfigured, for the region's life.
   */
  applySettings(q: Readonly<QualitySettings>): void {
    if (!q.shadowsEnabled) {
      this.disposeShadows();
      return;
    }

    let csm = this.shadows;
    if (!csm) {
      csm = new CascadedShadowGenerator(q.shadowMapSize, this.key);
      for (const mesh of this.casters) csm.addShadowCaster(mesh, true);
      this.shadows = csm;
      this.mapSize = q.shadowMapSize;
      this.scene.markAllMaterialsAsDirty(Constants.MATERIAL_LightDirtyFlag);
    } else if (this.mapSize !== q.shadowMapSize) {
      csm.mapSize = q.shadowMapSize;
      this.mapSize = q.shadowMapSize;
    }
    this.configureShadows(csm, q);
  }

  private configureShadows(
    csm: CascadedShadowGenerator,
    q: Readonly<QualitySettings>,
  ): void {
    csm.numCascades = q.shadowCascades;
    // Stabilised cascades trade a little resolution for shadow edges that
    // do not crawl as the camera moves. In a game about walking around a
    // farm, crawling edges are the thing you notice.
    csm.stabilizeCascades = true;
    csm.lambda = 0.82;
    csm.cascadeBlendPercentage = q.preset === "low" ? 0 : 0.08;
    csm.shadowMaxZ = q.shadowMaxDistance;
    csm.depthClamp = true;
    csm.autoCalcDepthBounds = q.preset === "ultra";
    csm.normalBias = 0.02;
    csm.bias = 0.0012;
    csm.darkness = 0.12;
    csm.transparencyShadow = true;

    // PCF stays on at every preset. Turning it off changes the sampler type
    // the lit shaders were compiled against, and flipping that on a live
    // generator renders the whole scene flat and washed out — the tap count
    // is the only part that is safe to vary at runtime.
    csm.useContactHardeningShadow = false;
    csm.usePercentageCloserFiltering = true;
    csm.filteringQuality =
      q.shadowFiltering === "fast"
        ? CascadedShadowGenerator.QUALITY_LOW
        : q.shadowFiltering === "soft"
          ? CascadedShadowGenerator.QUALITY_MEDIUM
          : CascadedShadowGenerator.QUALITY_HIGH;
    this.key.shadowMaxZ = q.shadowMaxDistance;
  }

  /** Colours the ambient term to match a lit environment after dark. */
  setUrbanGlow(sky: Color3, ground: Color3, intensity: number): void {
    this.urbanGlow = { sky, ground, intensity };
  }

  addCaster(mesh: AbstractMesh, includeDescendants = true): void {
    this.casters.add(mesh);
    this.shadows?.addShadowCaster(mesh, includeDescendants);
  }

  removeCaster(mesh: AbstractMesh): void {
    this.casters.delete(mesh);
    this.shadows?.removeShadowCaster(mesh, true);
  }

  /** Follows the solar model; called once per frame. */
  update(solar: SolarState): void {
    const source = solar.isNight ? solar.moonDirection : solar.sunDirection;
    // A light's `direction` points the way photons travel, i.e. away from
    // the body in the sky.
    this.key.direction = source.scale(-1);

    if (solar.isNight) {
      this.key.diffuse = MOON;
      this.key.specular = MOON;
      // Moonlight is faint, and fades out entirely near the horizon so
      // moonrise is not a hard edge.
      this.key.intensity = 0.34 * Math.max(0, Math.min(1, -solar.elevation / 0.25));
    } else {
      const lowness = 1 - Math.min(1, solar.elevation / 0.34);
      this.key.diffuse = Color3.Lerp(SUN_HIGH, SUN_LOW, lowness * lowness);
      this.key.specular = this.key.diffuse;
      this.key.intensity = 0.4 + solar.daylight * 2.9;
    }

    const glow = this.urbanGlow;
    const night = 1 - solar.daylight;
    if (glow) {
      this.ambient.diffuse = Color3.Lerp(
        Color3.Lerp(SKY_NIGHT, glow.sky, night),
        SKY_DAY,
        solar.daylight,
      );
      this.ambient.groundColor = Color3.Lerp(
        Color3.Lerp(GROUND_NIGHT, glow.ground, night),
        GROUND_DAY,
        solar.daylight,
      );
      this.ambient.intensity = 0.22 + solar.daylight * 0.5 + night * glow.intensity;
    } else {
      this.ambient.diffuse = Color3.Lerp(SKY_NIGHT, SKY_DAY, solar.daylight);
      this.ambient.groundColor = Color3.Lerp(GROUND_NIGHT, GROUND_DAY, solar.daylight);
      this.ambient.intensity = 0.22 + solar.daylight * 0.5;
    }
  }

  private disposeShadows(): void {
    if (!this.shadows) return;
    this.shadows.dispose();
    this.shadows = null;
    this.mapSize = 0;
  }

  get shadowGenerator(): CascadedShadowGenerator | null {
    return this.shadows;
  }

  dispose(): void {
    this.disposeShadows();
    this.key.dispose();
    this.ambient.dispose();
  }
}

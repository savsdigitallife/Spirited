/**
 * Rain.
 *
 * One particle system that follows the camera, plus the wetness value the
 * rest of the scene reads to darken and polish its surfaces. Rain that only
 * exists as falling streaks reads as a screen effect; rain that changes what
 * the ground does with light reads as weather.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { Scene } from "@babylonjs/core/scene";

export interface WeatherOptions {
  /** Particles at full downpour. Scaled by the quality preset. */
  maxDrops: number;
  /** Half-width of the box drops fall inside, around the camera. */
  radius: number;
  height: number;
}

function dropTexture(scene: Scene): Texture {
  // A soft vertical streak; stretched billboards do the rest.
  const texture = new DynamicTexture("rain.drop", { width: 8, height: 64 }, scene, false);
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  const gradient = ctx.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.45, "rgba(255,255,255,0.85)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(2, 0, 4, 64);
  texture.update(false);
  texture.hasAlpha = true;
  return texture;
}

export class Weather {
  private readonly rain: ParticleSystem;
  private readonly options: WeatherOptions;
  private intensity = 0;
  private target = 0;

  constructor(scene: Scene, options: Partial<WeatherOptions> = {}) {
    this.options = { maxDrops: 3600, radius: 16, height: 14, ...options };

    const rain = new ParticleSystem("rain", this.options.maxDrops, scene);
    rain.particleTexture = dropTexture(scene);
    rain.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    rain.minEmitBox = new Vector3(-this.options.radius, this.options.height, -this.options.radius);
    rain.maxEmitBox = new Vector3(this.options.radius, this.options.height, this.options.radius);
    rain.emitter = new Vector3(0, 0, 0);
    rain.color1 = new Color4(0.72, 0.78, 0.9, 0.42);
    rain.color2 = new Color4(0.85, 0.9, 1, 0.3);
    rain.colorDead = new Color4(0.7, 0.75, 0.85, 0);
    rain.minSize = 0.035;
    rain.maxSize = 0.06;
    rain.minLifeTime = 0.6;
    rain.maxLifeTime = 1.1;
    rain.emitRate = 0;
    rain.gravity = new Vector3(0, -70, 0);
    rain.direction1 = new Vector3(-1.2, -22, -0.6);
    rain.direction2 = new Vector3(1.2, -26, 0.6);
    rain.minEmitPower = 1;
    rain.maxEmitPower = 1.4;
    // Stretched billboards are what turn a dot into a streak of falling water.
    rain.billboardMode = Constants.PARTICLES_BILLBOARDMODE_STRETCHED;
    rain.isLocal = false;
    rain.preWarmCycles = 60;
    rain.start();
    this.rain = rain;
  }

  /** 0 dry, 1 downpour. Eased so weather turns rather than switches. */
  setTarget(intensity: number): void {
    this.target = Math.max(0, Math.min(1, intensity));
  }

  /** How wet the world currently looks. Surfaces read this. */
  get wetness(): number {
    return this.intensity;
  }

  /** Scales the drop budget with the graphics preset. */
  setBudget(fraction: number): void {
    this.rain.targetStopDuration = 0;
    this.rain.manualEmitCount = -1;
    this.dropBudget = Math.max(0.05, Math.min(1, fraction));
  }

  private dropBudget = 1;

  update(dt: number, cameraPosition: Vector3): void {
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * 0.4);
    (this.rain.emitter as Vector3).copyFrom(cameraPosition);
    this.rain.emitRate = this.intensity * this.options.maxDrops * this.dropBudget * 0.55;
  }

  dispose(): void {
    this.rain.dispose(true);
  }
}

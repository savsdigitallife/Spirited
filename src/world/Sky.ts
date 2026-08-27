/**
 * Physical sky and the solar model that drives every other light.
 *
 * The sun's position is the single source of truth for time of day: the sky
 * shader, the directional light, the fog tint and the ambient term all read
 * it rather than each keeping their own idea of "evening". One authority per
 * fact, so dusk can never disagree with itself.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { SkyMaterial } from "@babylonjs/materials/sky/skyMaterial";

export interface SolarState {
  /** Unit vector from the world origin toward the sun. */
  sunDirection: Vector3;
  /** Unit vector toward the moon (antipodal to the sun). */
  moonDirection: Vector3;
  /** sin(altitude): 1 overhead, 0 at the horizon, negative below it. */
  elevation: number;
  /** 0 at night, 1 in full day, smooth across the horizon crossing. */
  daylight: number;
  /** 1 while the sun is within a few degrees of the horizon. */
  goldenHour: boolean;
  isNight: boolean;
}

/** How far the sun's arc leans off the east-west line. */
const ARC_TILT = 0.38;

export function solarState(timeOfDay: number): SolarState {
  // 0.25 places sunrise at 06:00 and noon at 12:00.
  const theta = (timeOfDay - 0.25) * Math.PI * 2;
  const sun = new Vector3(Math.cos(theta), Math.sin(theta), ARC_TILT).normalize();
  const elevation = sun.y;

  // Smooth over roughly the last 10 degrees so lights cross-fade at dusk
  // instead of snapping.
  const t = Math.max(0, Math.min(1, (elevation + 0.16) / 0.32));
  const daylight = t * t * (3 - 2 * t);

  return {
    sunDirection: sun,
    moonDirection: sun.scale(-1),
    elevation,
    daylight,
    goldenHour: elevation > -0.09 && elevation < 0.18,
    isNight: elevation <= 0,
  };
}

export class Sky {
  readonly mesh: Mesh;
  private readonly material: SkyMaterial;
  private state: SolarState;

  constructor(scene: Scene, farPlane: number) {
    const material = new SkyMaterial("nagori.sky", scene);
    material.backFaceCulling = false;
    material.useSunPosition = true;
    material.dithering = true; // Kills the banding a smooth gradient shows on 8-bit.
    material.luminance = 1;
    material.turbidity = 6;
    material.rayleigh = 2;
    material.mieCoefficient = 0.005;
    material.mieDirectionalG = 0.82;
    this.material = material;

    // `infiniteDistance` re-centres the box on the camera every frame, so
    // the player can never reach the edge of the sky. It is a unit box
    // scaled to fit: the corners of a cube sit sqrt(3)/2 of its side from
    // the centre, so anything larger than this gets clipped by the far
    // plane and the sky disappears behind the clear colour.
    const mesh = CreateBox("nagori.skybox", { size: 1 }, scene);
    mesh.scaling.setAll(Sky.fitScale(farPlane));
    mesh.material = material;
    mesh.infiniteDistance = true;
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    mesh.applyFog = false;
    mesh.renderingGroupId = 0;
    this.mesh = mesh;

    this.state = solarState(0.3);
    this.update(0.3);
  }

  /** Largest cube side that clears a given far plane, with a small margin. */
  static fitScale(farPlane: number): number {
    return (farPlane * 0.92 * 2) / Math.sqrt(3);
  }

  /** Called when the draw distance changes with the quality preset. */
  setFarPlane(farPlane: number): void {
    this.mesh.scaling.setAll(Sky.fitScale(farPlane));
  }

  update(timeOfDay: number): SolarState {
    const state = solarState(timeOfDay);
    this.state = state;
    this.material.sunPosition = state.sunDirection;

    // Thicker air and dimmer sky as the sun drops; a clear, dark night.
    this.material.turbidity = 4 + (1 - state.daylight) * 8;
    this.material.rayleigh = state.isNight ? 0.35 : 0.6 + state.daylight * 1.9;
    this.material.luminance = state.isNight
      ? 1.18
      : 1.12 - state.daylight * 0.15;
    this.material.mieCoefficient = state.goldenHour ? 0.012 : 0.005;
    return state;
  }

  get solar(): SolarState {
    return this.state;
  }

  /**
   * Approximate horizon colour for this moment, used to tint fog so distant
   * geometry dissolves into the sky rather than into a flat grey.
   */
  horizonColor(): Color3 {
    const s = this.state;
    const night = new Color3(0.035, 0.05, 0.086);
    const dusk = new Color3(0.62, 0.34, 0.24);
    const day = new Color3(0.66, 0.75, 0.86);
    if (s.daylight <= 0) return night;
    const warm = Math.max(0, 1 - Math.abs(s.elevation) / 0.28);
    const base = Color3.Lerp(night, day, s.daylight);
    return Color3.Lerp(base, dusk, warm * 0.75);
  }

  dispose(): void {
    this.mesh.dispose();
    this.material.dispose();
  }
}

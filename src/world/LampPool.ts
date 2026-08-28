/**
 * A small pool of real lights, moved to wherever the player is.
 *
 * A street has twenty lamps. Twenty point lights would be twenty shadow-free
 * but shader-multiplying lights on every lit material, and Babylon's default
 * budget is four. Rather than choose between "a dark street" and "a shader
 * that will not compile", the street declares where its lamps *are* and this
 * lends four actual lights to the nearest ones, crossfading as the player
 * walks. From inside the game it looks like every lamp is lit, because the
 * only ones close enough to matter always are.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { Scene } from "@babylonjs/core/scene";

export interface LampSite {
  position: Vector3;
  colour: Color3;
  intensity: number;
  range: number;
}

interface PooledLight {
  light: PointLight;
  site: LampSite | null;
  /** 0..1 crossfade, so a reassignment is never a pop. */
  fade: number;
  fadingOut: boolean;
}

/** Seconds between reassignments. Lamps do not need to be re-chosen at 60 Hz. */
const REASSIGN_INTERVAL = 0.35;
const FADE_RATE = 2.6;

export class LampPool {
  private readonly pool: PooledLight[] = [];
  private sites: LampSite[] = [];
  private sinceReassign = REASSIGN_INTERVAL;
  /** Scales every lamp: 1 after dark, near zero at noon. */
  private dimming = 1;

  constructor(scene: Scene, sites: readonly LampSite[], poolSize = 4) {
    this.sites = [...sites];
    for (let i = 0; i < poolSize; i += 1) {
      const light = new PointLight(`lamp.pool.${i}`, Vector3.Zero(), scene);
      light.intensity = 0;
      light.range = 30;
      light.specular = new Color3(0.4, 0.4, 0.4);
      this.pool.push({ light, site: null, fade: 0, fadingOut: false });
    }
  }

  /** How much of the pool is lit. Street lights go out in daylight. */
  setDimming(value: number): void {
    this.dimming = Math.max(0, Math.min(1, value));
  }

  get lightCount(): number {
    return this.pool.length;
  }

  get siteCount(): number {
    return this.sites.length;
  }

  update(dt: number, focus: Vector3): void {
    this.sinceReassign += dt;
    if (this.sinceReassign >= REASSIGN_INTERVAL) {
      this.sinceReassign = 0;
      this.reassign(focus);
    }

    for (const entry of this.pool) {
      const target = entry.fadingOut || !entry.site ? 0 : 1;
      entry.fade += Math.max(-FADE_RATE * dt, Math.min(FADE_RATE * dt, target - entry.fade));
      if (entry.fadingOut && entry.fade <= 0.001) {
        entry.site = null;
        entry.fadingOut = false;
      }
      if (entry.site) {
        entry.light.intensity = entry.site.intensity * entry.fade * this.dimming;
      } else {
        entry.light.intensity = 0;
      }
    }
  }

  private reassign(focus: Vector3): void {
    const nearest = [...this.sites]
      .sort(
        (a, b) =>
          Vector3.DistanceSquared(a.position, focus) -
          Vector3.DistanceSquared(b.position, focus),
      )
      .slice(0, this.pool.length);

    // Keep whatever is already correct; only the rest gets shuffled.
    const held = new Set<LampSite>();
    for (const entry of this.pool) {
      if (entry.site && nearest.includes(entry.site)) {
        held.add(entry.site);
        entry.fadingOut = false;
      }
    }
    const wanted = nearest.filter((site) => !held.has(site));

    for (const entry of this.pool) {
      if (entry.site && held.has(entry.site)) continue;
      if (entry.fade > 0.02 && entry.site) {
        // Let it dim out first; it takes the next slot when it is dark.
        entry.fadingOut = true;
        continue;
      }
      const site = wanted.shift();
      if (!site) {
        entry.site = null;
        continue;
      }
      entry.site = site;
      entry.fadingOut = false;
      entry.light.position.copyFrom(site.position);
      entry.light.diffuse = site.colour;
      entry.light.specular = site.colour.scale(0.5);
      entry.light.range = site.range;
    }
  }

  dispose(): void {
    for (const entry of this.pool) entry.light.dispose();
    this.pool.length = 0;
    this.sites = [];
  }
}

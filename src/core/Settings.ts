/**
 * Graphics quality presets.
 *
 * A preset is a plain data record, not a set of branches scattered through
 * the renderer. Systems read the fields they care about and re-apply on
 * `settings/changed`, so adding a knob later means adding a field here and
 * one read at the consumer.
 */

import { events } from "./Events";

export type QualityPreset = "low" | "medium" | "high" | "ultra";

export interface QualitySettings {
  preset: QualityPreset;

  /** Backbuffer scale. 1 = native, >1 = render smaller and upscale. */
  hardwareScaling: number;

  // Shadows
  shadowsEnabled: boolean;
  shadowMapSize: number;
  shadowCascades: number;
  /** Distance from the camera CSM still covers, in metres. */
  shadowMaxDistance: number;
  /**
   * Percentage-closer-filter quality. Hardware PCF is always on: the filter
   * mode is baked into every lit material's compiled shader, and toggling it
   * on a live shadow generator leaves the scene sampling shadows wrongly
   * (see Lighting.configureShadows). Only the tap count varies by preset.
   */
  shadowFiltering: "fast" | "soft" | "softest";

  // Post-processing
  bloom: boolean;
  ssao: boolean;
  ssaoRatio: number;
  depthOfField: boolean;
  antialias: "none" | "fxaa" | "msaa2" | "msaa4";
  grain: boolean;
  chromaticAberration: boolean;

  // World
  /** Camera far plane and fog reach, in metres. */
  drawDistance: number;
  /** Multiplier on scattered detail meshes (grass, pebbles, leaves). */
  foliageDensity: number;
  /** Texture resolution for procedurally generated maps. */
  textureSize: number;

  /** Let SceneOptimizer claw back frames if we fall below target. */
  adaptiveQuality: boolean;
  targetFps: number;
}

const PRESETS: Record<QualityPreset, QualitySettings> = {
  low: {
    preset: "low",
    hardwareScaling: 1.5,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    shadowCascades: 2,
    shadowMaxDistance: 60,
    shadowFiltering: "fast",
    bloom: false,
    ssao: false,
    ssaoRatio: 0.5,
    depthOfField: false,
    antialias: "none",
    grain: false,
    chromaticAberration: false,
    drawDistance: 260,
    foliageDensity: 0.35,
    textureSize: 256,
    adaptiveQuality: true,
    targetFps: 60,
  },
  medium: {
    preset: "medium",
    hardwareScaling: 1.15,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    shadowCascades: 3,
    shadowMaxDistance: 90,
    shadowFiltering: "soft",
    bloom: true,
    ssao: false,
    ssaoRatio: 0.5,
    depthOfField: false,
    antialias: "fxaa",
    grain: true,
    chromaticAberration: false,
    drawDistance: 400,
    foliageDensity: 0.6,
    textureSize: 512,
    adaptiveQuality: true,
    targetFps: 60,
  },
  high: {
    preset: "high",
    hardwareScaling: 1,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    shadowCascades: 4,
    shadowMaxDistance: 140,
    shadowFiltering: "soft",
    bloom: true,
    ssao: true,
    ssaoRatio: 0.75,
    depthOfField: true,
    antialias: "fxaa",
    grain: true,
    chromaticAberration: true,
    drawDistance: 600,
    foliageDensity: 1,
    textureSize: 1024,
    adaptiveQuality: true,
    targetFps: 60,
  },
  ultra: {
    preset: "ultra",
    hardwareScaling: 1,
    shadowsEnabled: true,
    shadowMapSize: 4096,
    shadowCascades: 4,
    shadowMaxDistance: 220,
    shadowFiltering: "softest",
    bloom: true,
    ssao: true,
    ssaoRatio: 1,
    depthOfField: true,
    antialias: "msaa4",
    grain: true,
    chromaticAberration: true,
    drawDistance: 900,
    foliageDensity: 1.4,
    textureSize: 2048,
    adaptiveQuality: false,
    targetFps: 60,
  },
};

const STORAGE_KEY = "nagori.graphics.preset";

export function presetNames(): readonly QualityPreset[] {
  return ["low", "medium", "high", "ultra"];
}

function isPreset(value: unknown): value is QualityPreset {
  return typeof value === "string" && value in PRESETS;
}

/**
 * First-run guess. Deliberately conservative: it is better to start at
 * medium and let the player raise it than to open on a slideshow.
 */
export function detectPreset(backendIsWebGpu: boolean): QualityPreset {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4;
  const coarsePointer =
    typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

  if (coarsePointer || cores <= 2 || memory <= 2) return "low";
  if (backendIsWebGpu && cores >= 8 && memory >= 8) return "high";
  if (cores >= 8 && memory >= 8) return "high";
  return "medium";
}

export class Settings {
  private current: QualitySettings;

  constructor(preset: QualityPreset) {
    this.current = { ...PRESETS[preset] };
  }

  static load(fallback: QualityPreset): Settings {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private browsing or blocked storage: defaults are fine.
    }
    const url = new URLSearchParams(location.search).get("quality");
    const chosen = isPreset(url) ? url : isPreset(stored) ? stored : fallback;
    return new Settings(chosen);
  }

  get value(): Readonly<QualitySettings> {
    return this.current;
  }

  apply(preset: QualityPreset): void {
    this.current = { ...PRESETS[preset] };
    try {
      localStorage.setItem(STORAGE_KEY, preset);
    } catch {
      // Ignore: the setting simply will not persist.
    }
    events.emit("settings/changed", { preset });
  }

  /** Cycle presets; wired to a debug key so quality can be compared live. */
  cycle(): QualityPreset {
    const order = presetNames();
    const index = order.indexOf(this.current.preset);
    const next = order[(index + 1) % order.length] ?? "medium";
    this.apply(next);
    return next;
  }
}

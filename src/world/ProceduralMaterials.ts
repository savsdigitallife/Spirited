/**
 * Procedurally generated PBR material set.
 *
 * Phase 1 ships no art, but a foundation tested against flat colours tells
 * you nothing about whether lighting, tone mapping and shadows are right.
 * These maps are written into canvases at load time and handed to real
 * PBR materials, so the proving ground exercises albedo, normal and
 * roughness sampling exactly as authored textures will.
 *
 * Everything here is replaceable: once glTF assets exist, scenes ask the
 * asset loader for a material instead of this module, and nothing else
 * changes.
 */

import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Scene } from "@babylonjs/core/scene";
import { fbm } from "./Noise";

export interface SurfaceRecipe {
  name: string;
  /** Two albedo colours the noise blends between. */
  base: [number, number, number];
  accent: [number, number, number];
  /** Noise frequency in lattice cells across the whole texture. */
  frequency: number;
  octaves: number;
  /** Strength of the derived normal map, in texels. */
  bump: number;
  /** Roughness range mapped from the same noise field. */
  roughness: [number, number];
  seed: number;
  /** How many times the texture repeats over one world unit. */
  tiling: number;
}

export const SURFACES = {
  meadow: {
    name: "meadow",
    base: [0.20, 0.29, 0.13],
    accent: [0.37, 0.42, 0.19],
    frequency: 10,
    octaves: 5,
    bump: 2.2,
    roughness: [0.82, 0.98],
    seed: 11,
    tiling: 0.09,
  },
  soil: {
    name: "soil",
    base: [0.16, 0.115, 0.082],
    accent: [0.29, 0.21, 0.145],
    frequency: 12,
    octaves: 5,
    bump: 2.8,
    roughness: [0.85, 1],
    seed: 23,
    tiling: 0.16,
  },
  stone: {
    name: "stone",
    base: [0.30, 0.31, 0.30],
    accent: [0.49, 0.49, 0.47],
    frequency: 8,
    octaves: 5,
    bump: 3.4,
    roughness: [0.55, 0.9],
    seed: 41,
    tiling: 0.5,
  },
  timber: {
    name: "timber",
    base: [0.20, 0.135, 0.082],
    accent: [0.35, 0.245, 0.15],
    frequency: 26,
    octaves: 3,
    bump: 1.6,
    roughness: [0.62, 0.85],
    seed: 59,
    tiling: 0.8,
  },
  plaster: {
    name: "plaster",
    base: [0.74, 0.72, 0.67],
    accent: [0.85, 0.84, 0.80],
    frequency: 14,
    octaves: 4,
    bump: 1.1,
    roughness: [0.7, 0.92],
    seed: 71,
    tiling: 0.35,
  },
  tile: {
    name: "tile",
    base: [0.10, 0.115, 0.135],
    accent: [0.19, 0.21, 0.235],
    frequency: 9,
    octaves: 4,
    bump: 2,
    roughness: [0.3, 0.6],
    seed: 83,
    tiling: 0.6,
  },
} as const satisfies Record<string, SurfaceRecipe>;

export type SurfaceName = keyof typeof SURFACES;

function field(recipe: SurfaceRecipe, size: number): Float32Array {
  const data = new Float32Array(size * size);
  const step = recipe.frequency / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let n = fbm(x * step, y * step, {
        octaves: recipe.octaves,
        period: recipe.frequency,
        seed: recipe.seed,
      });
      if (recipe.name === "timber") {
        // Stretch the field along one axis and band it: grain, not blobs.
        const grain = fbm(x * step * 0.12, y * step * 2.4, {
          octaves: 2,
          period: Math.max(1, Math.round(recipe.frequency * 2.4)),
          seed: recipe.seed + 7,
        });
        n = (n * 0.35 + ((grain * 9) % 1) * 0.65);
      }
      data[y * size + x] = n;
    }
  }
  return data;
}

function writeCanvas(
  scene: Scene,
  name: string,
  size: number,
  paint: (image: ImageData) => void,
): DynamicTexture {
  const texture = new DynamicTexture(
    name,
    { width: size, height: size },
    scene,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
    undefined,
    false,
  );
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  const image = ctx.createImageData(size, size);
  paint(image);
  ctx.putImageData(image, 0, 0);
  texture.update(false);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

function at(data: Float32Array, size: number, x: number, y: number): number {
  const xi = ((x % size) + size) % size;
  const yi = ((y % size) + size) % size;
  return data[yi * size + xi] ?? 0;
}

/**
 * Builds albedo, normal and metallic-roughness maps for one surface and
 * returns a PBR material using all three.
 */
export function makeSurface(
  scene: Scene,
  recipe: SurfaceRecipe,
  size: number,
): PBRMaterial {
  const data = field(recipe, size);

  const albedo = writeCanvas(scene, `${recipe.name}.albedo`, size, (image) => {
    const px = image.data;
    for (let i = 0; i < size * size; i += 1) {
      const n = data[i] ?? 0;
      // Slight contrast curve so the blend is not uniformly muddy.
      const t = Math.min(1, Math.max(0, (n - 0.25) / 0.5));
      const o = i * 4;
      px[o] = Math.round(
        255 * (recipe.base[0] + (recipe.accent[0] - recipe.base[0]) * t),
      );
      px[o + 1] = Math.round(
        255 * (recipe.base[1] + (recipe.accent[1] - recipe.base[1]) * t),
      );
      px[o + 2] = Math.round(
        255 * (recipe.base[2] + (recipe.accent[2] - recipe.base[2]) * t),
      );
      px[o + 3] = 255;
    }
  });

  const normal = writeCanvas(scene, `${recipe.name}.normal`, size, (image) => {
    const px = image.data;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        // Central differences on the height field give the surface slope.
        const dx = (at(data, size, x + 1, y) - at(data, size, x - 1, y)) * recipe.bump;
        const dy = (at(data, size, x, y + 1) - at(data, size, x, y - 1)) * recipe.bump;
        const len = Math.hypot(-dx, -dy, 1);
        const o = (y * size + x) * 4;
        px[o] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
        px[o + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
        px[o + 2] = Math.round((1 / len) * 0.5 * 255 + 127);
        px[o + 3] = 255;
      }
    }
  });

  // glTF convention: roughness in G, metallic in B. Keeping to it now means
  // authored PBR assets drop in beside these without special-casing.
  const orm = writeCanvas(scene, `${recipe.name}.orm`, size, (image) => {
    const px = image.data;
    const [lo, hi] = recipe.roughness;
    for (let i = 0; i < size * size; i += 1) {
      const n = data[i] ?? 0;
      const o = i * 4;
      px[o] = 255; // ambient occlusion channel, unused for now
      px[o + 1] = Math.round(255 * (lo + (hi - lo) * n));
      px[o + 2] = 0; // fully dielectric
      px[o + 3] = 255;
    }
  });

  const material = new PBRMaterial(`${recipe.name}.mat`, scene);
  material.albedoTexture = albedo;
  material.bumpTexture = normal;
  material.metallicTexture = orm;
  material.useRoughnessFromMetallicTextureAlpha = false;
  material.useRoughnessFromMetallicTextureGreen = true;
  material.useMetallnessFromMetallicTextureBlue = true;
  material.metallic = 1;
  material.roughness = 1;
  material.albedoColor = Color3.White();
  // Normal maps generated this way are OpenGL-convention (+Y up).
  material.invertNormalMapY = false;
  material.specularIntensity = 0.5;
  material.enableSpecularAntiAliasing = true;

  for (const texture of [albedo, normal, orm]) {
    texture.uScale = 1;
    texture.vScale = 1;
  }
  return material;
}

export interface SurfaceLibraryOptions {
  size: number;
  anisotropy: number;
}

/** Lazily builds and caches one material per surface recipe. */
export class SurfaceLibrary {
  private readonly cache = new Map<string, PBRMaterial>();

  constructor(
    private readonly scene: Scene,
    private readonly options: SurfaceLibraryOptions,
  ) {}

  /** `worldScale` is the size in metres the texture should span. */
  get(name: SurfaceName, worldScale = 1): PBRMaterial {
    return this.getScaled(name, worldScale, worldScale);
  }

  /**
   * Tiling for a surface whose two axes are nothing like the same length.
   *
   * A box face is mapped 0..1 whatever its shape, so a 4 m by 700 m railway
   * embankment textured with one scale smears its ballast into stripes.
   * Giving U and V the surface's real extent keeps the grain square.
   */
  getScaled(name: SurfaceName, uMetres: number, vMetres: number): PBRMaterial {
    const recipe = SURFACES[name];
    const key = `${name}@${uMetres}x${vMetres}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const material = makeSurface(this.scene, recipe, this.options.size);
    for (const texture of [
      material.albedoTexture,
      material.bumpTexture,
      material.metallicTexture,
    ]) {
      if (!(texture instanceof Texture)) continue;
      texture.uScale = uMetres * recipe.tiling;
      texture.vScale = vMetres * recipe.tiling;
      texture.anisotropicFilteringLevel = this.options.anisotropy;
    }
    this.cache.set(key, material);
    return material;
  }

  dispose(): void {
    for (const material of this.cache.values()) material.dispose(true, true);
    this.cache.clear();
  }
}

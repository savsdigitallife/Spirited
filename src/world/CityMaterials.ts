/**
 * Material set for the Tokyo district.
 *
 * Reuses the procedural surface generator from `ProceduralMaterials` for the
 * noisy surfaces (asphalt, paving, concrete) and adds what a city needs and a
 * field does not: window grids that light up after dark, wet road, glass, and
 * emissive signage.
 *
 * Nothing here draws lettering. The signs are abstract strokes and bars —
 * the district's language, colour and light, invented rather than copied.
 */

import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Scene } from "@babylonjs/core/scene";
import { makeSurface, type SurfaceRecipe } from "./ProceduralMaterials";
import { makeRandom } from "./Noise";

const RECIPES = {
  asphalt: {
    name: "asphalt",
    base: [0.052, 0.055, 0.061],
    accent: [0.115, 0.12, 0.13],
    frequency: 16,
    octaves: 5,
    bump: 2.4,
    roughness: [0.5, 0.82],
    seed: 101,
    tiling: 0.11,
  },
  paving: {
    name: "paving",
    base: [0.3, 0.3, 0.29],
    accent: [0.43, 0.43, 0.41],
    frequency: 10,
    octaves: 4,
    bump: 1.4,
    roughness: [0.62, 0.85],
    seed: 113,
    tiling: 0.3,
  },
  concrete: {
    name: "concrete",
    base: [0.26, 0.26, 0.26],
    accent: [0.38, 0.375, 0.36],
    frequency: 9,
    octaves: 4,
    bump: 1.2,
    roughness: [0.68, 0.9],
    seed: 127,
    tiling: 0.16,
  },
  tileWall: {
    name: "tileWall",
    base: [0.2, 0.21, 0.22],
    accent: [0.33, 0.34, 0.35],
    frequency: 20,
    octaves: 3,
    bump: 1.8,
    roughness: [0.35, 0.6],
    seed: 131,
    tiling: 0.5,
  },
} as const satisfies Record<string, SurfaceRecipe>;

export type CitySurface = keyof typeof RECIPES;

/** Sign colours. Chosen to read against a blue-black night, not copied. */
export const NEON = {
  peach: new Color3(1, 0.42, 0.35),
  ice: new Color3(0.4, 0.85, 1),
  lime: new Color3(0.55, 1, 0.45),
  gold: new Color3(1, 0.78, 0.3),
  violet: new Color3(0.72, 0.42, 1),
  rose: new Color3(1, 0.35, 0.62),
} as const;

export type NeonColour = keyof typeof NEON;

interface WindowGridOptions {
  columns: number;
  rows: number;
  /** Fraction of panes with a light on. */
  litFraction: number;
  seed: number;
}

export class CityMaterials {
  private readonly cache = new Map<string, PBRMaterial>();

  constructor(
    private readonly scene: Scene,
    private readonly textureSize: number,
    private readonly anisotropy: number,
  ) {}

  /** `worldScale` is how many metres the texture should span. */
  surface(name: CitySurface, worldScale = 1): PBRMaterial {
    return this.surfaceScaled(name, worldScale, worldScale);
  }

  /**
   * Texturing for a surface whose two axes are nothing like the same length.
   *
   * A box's faces are each mapped 0..1, so a 5 m by 150 m pavement slab
   * textured with one scale smears the paving into streaks along the street.
   * Giving U and V the real extent of the surface in metres keeps the grain
   * square wherever it lands.
   */
  surfaceScaled(name: CitySurface, uMetres: number, vMetres: number): PBRMaterial {
    const key = `surface:${name}:${uMetres}x${vMetres}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const recipe = RECIPES[name];
    const material = makeSurface(this.scene, recipe, this.textureSize);
    for (const texture of [
      material.albedoTexture,
      material.bumpTexture,
      material.metallicTexture,
    ]) {
      if (!(texture instanceof Texture)) continue;
      texture.uScale = uMetres * recipe.tiling;
      texture.vScale = vMetres * recipe.tiling;
      texture.anisotropicFilteringLevel = this.anisotropy;
    }
    this.cache.set(key, material);
    return material;
  }

  /**
   * Asphalt whose roughness the weather drives.
   *
   * Built here rather than cloned from `surface()`, because cloning a
   * Babylon material re-creates its textures from serialisation — and a
   * procedurally drawn DynamicTexture has no URL to be re-created from, so
   * the clone's textures never become ready and the mesh silently never
   * renders. Anything generated at runtime must be referenced, never cloned.
   */
  road(uMetres: number, vMetres: number): PBRMaterial {
    const key = `road:${uMetres}x${vMetres}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const material = makeSurface(this.scene, RECIPES.asphalt, this.textureSize);
    material.name = "city.road";
    // Roughness comes from code, not from the packed texture, so rain can
    // polish the surface every frame with a single uniform change.
    material.metallicTexture?.dispose();
    material.metallicTexture = null;
    material.useRoughnessFromMetallicTextureGreen = false;
    material.useMetallnessFromMetallicTextureBlue = false;
    material.metallic = 0;
    material.roughness = 0.78;

    for (const texture of [material.albedoTexture, material.bumpTexture]) {
      if (!(texture instanceof Texture)) continue;
      texture.uScale = uMetres * RECIPES.asphalt.tiling;
      texture.vScale = vMetres * RECIPES.asphalt.tiling;
      texture.anisotropicFilteringLevel = this.anisotropy;
    }
    this.cache.set(key, material);
    return material;
  }

  /** Flat colour, for painted metal, plastic, road markings. */
  painted(name: string, colour: Color3, roughness = 0.55, metallic = 0): PBRMaterial {
    const key = `painted:${name}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const material = new PBRMaterial(`city.${name}`, this.scene);
    material.albedoColor = colour;
    material.roughness = roughness;
    material.metallic = metallic;
    material.specularIntensity = 0.4;
    this.cache.set(key, material);
    return material;
  }

  /**
   * A light source's visible surface — a neon tube, a lamp lens, the glow
   * behind a shop window. The illumination that reaches the street comes
   * from real lights; this is the shape the bloom pass turns into a glow.
   *
   * Unlit on purpose. A light source is not shaded by other lights, and an
   * unlit PBR material compiles to a fraction of the shader, which matters
   * when a street has forty of them.
   */
  emissive(name: string, colour: Color3, strength = 3.2): PBRMaterial {
    const key = `emissive:${name}:${strength}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const material = new PBRMaterial(`neon.${name}`, this.scene);
    material.unlit = true;
    material.albedoColor = colour.scale(strength);
    material.emissiveColor = colour;
    material.emissiveIntensity = strength;
    this.cache.set(key, material);
    return material;
  }

  glass(): PBRMaterial {
    const key = "glass";
    const cached = this.cache.get(key);
    if (cached) return cached;
    const material = new PBRMaterial("city.glass", this.scene);
    material.albedoColor = new Color3(0.05, 0.07, 0.09);
    material.metallic = 0.15;
    material.roughness = 0.08;
    material.alpha = 0.55;
    material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    material.backFaceCulling = false;
    this.cache.set(key, material);
    return material;
  }

  /**
   * A building face: dark panelling with a grid of windows, most of them
   * lit. The emissive map is what makes the skyline read at night, and it
   * costs one texture rather than one light per window.
   */
  facade(name: string, options: WindowGridOptions): PBRMaterial {
    const key = `facade:${name}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const size = Math.min(1024, Math.max(256, this.textureSize));
    const random = makeRandom(options.seed);

    const draw = (emissive: boolean): DynamicTexture => {
      const texture = new DynamicTexture(
        `facade.${name}.${emissive ? "emissive" : "albedo"}`,
        { width: size, height: size },
        this.scene,
        true,
        Texture.TRILINEAR_SAMPLINGMODE,
      );
      const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
      ctx.fillStyle = emissive ? "#000000" : "#20242a";
      ctx.fillRect(0, 0, size, size);

      const cellW = size / options.columns;
      const cellH = size / options.rows;
      const inset = Math.max(1, Math.min(cellW, cellH) * 0.17);
      // Warm interiors, a few cold fluorescents; both fade with depth.
      const warm = ["#ffd8a0", "#ffc27a", "#ffe4bd"];
      const cold = ["#cfe6ff", "#e6f2ff"];

      for (let row = 0; row < options.rows; row += 1) {
        for (let col = 0; col < options.columns; col += 1) {
          const x = col * cellW + inset;
          const y = row * cellH + inset;
          const w = cellW - inset * 2;
          const h = cellH - inset * 2;
          const lit = random() < options.litFraction;
          if (emissive) {
            if (!lit) continue;
            const palette = random() < 0.78 ? warm : cold;
            ctx.fillStyle = palette[Math.floor(random() * palette.length)] ?? "#ffd8a0";
            ctx.globalAlpha = 0.5 + random() * 0.5;
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = 1;
          } else {
            ctx.fillStyle = lit ? "#2c3038" : "#14171b";
            ctx.fillRect(x, y, w, h);
          }
        }
      }
      texture.update(false);
      texture.wrapU = Texture.WRAP_ADDRESSMODE;
      texture.wrapV = Texture.WRAP_ADDRESSMODE;
      texture.anisotropicFilteringLevel = this.anisotropy;
      return texture;
    };

    const material = new PBRMaterial(`city.facade.${name}`, this.scene);
    material.albedoTexture = draw(false);
    material.emissiveTexture = draw(true);
    material.emissiveColor = new Color3(1, 1, 1);
    material.emissiveIntensity = 1.1;
    material.metallic = 0.1;
    material.roughness = 0.7;
    this.cache.set(key, material);
    return material;
  }

  /**
   * A hanging sign. Abstract strokes on a dark plate — the shapes suggest a
   * shopfront's writing without being writing.
   */
  signboard(name: string, colour: Color3, seed: number): PBRMaterial {
    const key = `sign:${name}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const size = 256;
    const random = makeRandom(seed);
    const texture = new DynamicTexture(
      `sign.${name}`,
      { width: size, height: size / 4 },
      this.scene,
      true,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    const h = size / 4;
    ctx.fillStyle = "#07090c";
    ctx.fillRect(0, 0, size, h);

    const hex = colour.toHexString();
    ctx.strokeStyle = hex;
    ctx.fillStyle = hex;
    ctx.lineCap = "round";
    let x = 14;
    while (x < size - 20) {
      const glyphW = 12 + random() * 14;
      const strokes = 2 + Math.floor(random() * 3);
      ctx.lineWidth = 3 + random() * 2;
      for (let s = 0; s < strokes; s += 1) {
        const y0 = h * (0.24 + random() * 0.16);
        const y1 = h * (0.62 + random() * 0.18);
        ctx.beginPath();
        if (random() < 0.45) {
          ctx.moveTo(x + random() * glyphW, y0);
          ctx.lineTo(x + random() * glyphW, y1);
        } else {
          const y = y0 + (y1 - y0) * random();
          ctx.moveTo(x, y);
          ctx.lineTo(x + glyphW, y);
        }
        ctx.stroke();
      }
      x += glyphW + 10 + random() * 8;
    }
    texture.update(false);

    const material = new PBRMaterial(`city.sign.${name}`, this.scene);
    material.unlit = true;
    material.albedoTexture = texture;
    material.albedoColor = new Color3(3.4, 3.4, 3.4);
    this.cache.set(key, material);
    return material;
  }

  dispose(): void {
    for (const material of this.cache.values()) material.dispose(true, true);
    this.cache.clear();
  }
}

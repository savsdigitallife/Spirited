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
import { fbm, makeRandom } from "./Noise";
import { makeGlass, type GlassKind } from "./Glass";
import { japaneseAvailable, signTexture, type SignStyle } from "./Signage";
import { makeCycleMark, makePaving, type PavingKind } from "./Paving";
import { concreteShade, makeConcrete } from "./Concrete";

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

/** Metres one tile of the road's macro maps covers. */
export const ROAD_TILE = 8;
/** Metres one tile of its aggregate detail map covers. */
export const ROAD_DETAIL_TILE = 1.1;

export interface RoadOptions {
  /**
   * How much smoother than the surrounding road this surface is, 0 to 1.
   * The wheel tracks down each lane are polished by the traffic that made
   * them, which is most of what you see reflected in a wet street.
   */
  polish?: number;
}

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
   * Poured concrete: formwork panels, their joints and tie holes, staining,
   * and aggregate up close. Paired with `boxUv` at `CONCRETE_TILE`.
   */
  concrete(): PBRMaterial {
    const cached = this.cache.get("concrete");
    if (cached) return cached;
    const material = makeConcrete(
      this.scene,
      Math.min(1024, Math.max(256, this.textureSize)),
      this.anisotropy,
    );
    this.cache.set("concrete", material);
    return material;
  }

  /**
   * One of the footway surfaces. Paired with `planarUv` at `PAVING_TILE`.
   */
  paving(kind: PavingKind): PBRMaterial {
    const key = `paving:${kind}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const material = makePaving(this.scene, kind, Math.min(1024, Math.max(256, this.textureSize)), this.anisotropy);
    this.cache.set(key, material);
    return material;
  }

  /**
   * How much of the night's own light is showing, 0 by day and 1 after
   * dark. Called once a frame by the region that owns these materials.
   */
  setNightFactor(value: number): void {
    const factor = Math.max(0, Math.min(1, value));
    for (const entry of this.lit) {
      if (entry.albedo) entry.material.albedoColor = entry.albedo.scale(factor);
      entry.material.emissiveIntensity = entry.emissive * factor;
    }
  }

  /** The bicycle and chevron painted along a cycle lane. */
  cycleMark(): PBRMaterial {
    const cached = this.cache.get("cycleMark");
    if (cached) return cached;
    const material = makeCycleMark(this.scene, this.anisotropy);
    this.cache.set("cycleMark", material);
    return material;
  }

  /**
   * A ground surface for meshes that carry world-plane UVs.
   *
   * Box faces map 0..1 each, and Babylon's top face runs its U along the
   * depth — so a 4 m by 90 m pavement slab textured the ordinary way shows
   * the map smeared ninety metres one way and repeated every fourteen
   * centimetres the other, which is where the corduroy on the pavements came
   * from. Paired with `planarUv`, this maps one tile per `metres` on the
   * ground plane and every slab on it agrees.
   */
  planarSurface(name: CitySurface, metres: number): PBRMaterial {
    const key = `planar:${name}:${metres}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const material = makeSurface(this.scene, RECIPES[name], this.textureSize);
    material.name = `city.planar.${name}`;
    for (const texture of [
      material.albedoTexture,
      material.bumpTexture,
      material.metallicTexture,
    ]) {
      if (!(texture instanceof Texture)) continue;
      texture.uScale = 1;
      texture.vScale = 1;
      texture.anisotropicFilteringLevel = this.anisotropy;
    }
    this.cache.set(key, material);
    return material;
  }

  /**
   * Asphalt: chippings in a binder, laid in patches, cracked between them,
   * and polished where the wheels run.
   *
   * Two layers. The macro map carries what a road has done to it over years
   * — resurfacing, trench patches, cracks — at eight metres a tile; the
   * detail map carries the chippings themselves at about a metre. Either
   * alone fails: macro on its own is grey mush underfoot, aggregate on its
   * own moirés into a pattern down the street.
   *
   * Built here rather than cloned from `surface()`, because cloning a
   * Babylon material re-creates its textures from serialisation — and a
   * procedurally drawn DynamicTexture has no URL to be re-created from, so
   * the clone's textures never become ready and the mesh silently never
   * renders. Anything generated at runtime must be referenced, never cloned.
   */
  road(options: RoadOptions = {}): PBRMaterial {
    const polish = options.polish ?? 0;
    const key = `road:${polish}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    // Every surface on the carriageway carries world-plane UVs (see
    // `planarUv`), so the maps are laid at a fixed metres-per-tile here and
    // nothing has to know how big the mesh it lands on is.
    const size = Math.min(512, Math.max(256, this.textureSize));
    const material = new PBRMaterial(polish > 0 ? "city.road.polished" : "city.road", this.scene);
    const macro = this.asphaltMacro(size, polish);
    material.albedoTexture = macro.albedo;
    material.bumpTexture = macro.normal;
    material.metallicTexture = macro.orm;
    material.useRoughnessFromMetallicTextureAlpha = false;
    material.useRoughnessFromMetallicTextureGreen = true;
    material.useMetallnessFromMetallicTextureBlue = true;
    material.metallic = 1;
    // Roughness is a multiplier over the map: the variation stays, and rain
    // can still polish the whole surface with one uniform change.
    material.roughness = 1;
    material.invertNormalMapY = false;
    material.specularIntensity = 0.5;
    material.enableSpecularAntiAliasing = true;

    // The chippings, at the scale you actually see them from.
    //
    // Macro alone is grey mush underfoot; aggregate alone tiles so tightly
    // it moirés down the street. The detail map runs the second layer at its
    // own scale over the first, which is the difference between grey and
    // asphalt.
    const aggregate = this.asphaltAggregate(size);
    material.detailMap.texture = aggregate;
    material.detailMap.isEnabled = true;
    material.detailMap.diffuseBlendLevel = 0.55;
    // Kept modest: a strong normal at this tiling aliases into moiré bands
    // the moment the camera looks down the street rather than at it.
    material.detailMap.bumpLevel = 0.55;
    material.detailMap.roughnessBlendLevel = 0.35;

    for (const texture of [macro.albedo, macro.normal, macro.orm]) {
      texture.uScale = 1;
      texture.vScale = 1;
      texture.anisotropicFilteringLevel = this.anisotropy;
    }
    // The detail layer runs at ROAD_TILE / DETAIL_TILE times the macro one.
    aggregate.uScale = ROAD_TILE / ROAD_DETAIL_TILE;
    aggregate.vScale = ROAD_TILE / ROAD_DETAIL_TILE;
    aggregate.anisotropicFilteringLevel = this.anisotropy;

    this.cache.set(key, material);
    return material;
  }

  /**
   * The road at arm's length: mottling from successive resurfacings, tar
   * patches over old trenches, and the cracks that run between them.
   */
  private asphaltMacro(
    size: number,
    polish: number,
  ): { albedo: DynamicTexture; normal: DynamicTexture; orm: DynamicTexture } {
    // Deliberately low-contrast and featureless.
    //
    // A tiled texture repeats eleven times down this street, so anything
    // memorable in it — a crack, a patch, a pale blotch — becomes a stripe
    // running the length of the road. The character of the surface belongs
    // on meshes laid once (see the trench patches, seams and ironwork in the
    // street itself); what belongs here is the grain between them.
    const height = new Float32Array(size * size);
    const tone = new Float32Array(size * size);
    const gloss = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const u = x / size;
        const v = y / size;
        const broad =
          fbm(u * 7, v * 7, { octaves: 4, period: 7, seed: 401 }) * 0.55 +
          fbm(u * 2.6, v * 2.6, { octaves: 2, period: 3, seed: 55 }) * 0.45;
        const i = y * size + x;
        tone[i] = broad;
        height[i] = broad;
        // Worn smooth where the binder has gone, rougher where it has not.
        gloss[i] = Math.max(0, Math.min(1, 0.74 + broad * 0.22 - polish));
      }
    }

    const albedo = this.paint(`road.albedo.${polish}`, size, (px) => {
      for (let i = 0; i < size * size; i += 1) {
        const t = Math.min(1, Math.max(0, ((tone[i] ?? 0) - 0.3) / 0.4));
        const o = i * 4;
        // Asphalt is a warm dark grey — about a tenth of the light back —
        // that goes paler as the binder wears off the top of the chippings.
        px[o] = Math.round(255 * (0.085 + 0.075 * t));
        px[o + 1] = Math.round(255 * (0.083 + 0.072 * t));
        px[o + 2] = Math.round(255 * (0.079 + 0.068 * t));
        px[o + 3] = 255;
      }
    });

    const normal = this.paint(`road.normal.${polish}`, size, (px) => {
      const at = (x: number, y: number): number =>
        height[(((y % size) + size) % size) * size + (((x % size) + size) % size)] ?? 0;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const dx = (at(x + 1, y) - at(x - 1, y)) * 1.4;
          const dy = (at(x, y + 1) - at(x, y - 1)) * 1.4;
          const length = Math.hypot(-dx, -dy, 1);
          const o = (y * size + x) * 4;
          px[o] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
          px[o + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
          px[o + 2] = Math.round((1 / length) * 0.5 * 255 + 127);
          px[o + 3] = 255;
        }
      }
    });

    const orm = this.paint(`road.orm.${polish}`, size, (px) => {
      for (let i = 0; i < size * size; i += 1) {
        const o = i * 4;
        px[o] = 255;
        px[o + 1] = Math.round(255 * (gloss[i] ?? 0.8));
        px[o + 2] = 0;
        px[o + 3] = 255;
      }
    });

    return { albedo, normal, orm };
  }

  /**
   * The chippings themselves, as a detail map.
   *
   * Babylon reads this one texture as four separate things: red is an albedo
   * multiplier around 0.5, blue is a roughness offset around 0.5, and alpha
   * with green carry the normal's X and Y. One texture, three channels of
   * grit.
   */
  private asphaltAggregate(size: number): DynamicTexture {
    const shared = this.aggregate;
    if (shared) return shared;
    const stones = new Float32Array(size * size);
    const random = makeRandom(5501);
    for (let i = 0; i < size * size; i += 1) stones[i] = random();
    // Two blur passes turn per-texel static into chippings with a size. One
    // pass gives millimetre grit that has averaged itself away by the time
    // you are standing up; five millimetres is what you actually see.
    const blurred = new Float32Array(size * size);
    const at = (data: Float32Array, x: number, y: number): number =>
      data[(((y % size) + size) % size) * size + (((x % size) + size) % size)] ?? 0;
    const radius = Math.max(1, Math.round(size / 320));
    const span = (radius * 2 + 1) * (radius * 2 + 1);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let sum = 0;
        for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) sum += at(stones, x + dx, y + dy);
        }
        // Pushed away from the mean so the chippings keep their edges.
        const mean = sum / span;
        blurred[y * size + x] = Math.min(1, Math.max(0, (mean - 0.5) * 2.2 + 0.5));
      }
    }

    const texture = this.paint("road.aggregate", size, (px) => {
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const n = at(blurred, x, y);
          const dx = (at(blurred, x + 1, y) - at(blurred, x - 1, y)) * 3.2;
          const dy = (at(blurred, x, y + 1) - at(blurred, x, y - 1)) * 3.2;
          const length = Math.hypot(-dx, -dy, 1);
          const o = (y * size + x) * 4;
          // Red: albedo grain. Blue: roughness grain, brighter in the pits
          // where the binder still sits. Alpha and green: the normal.
          px[o] = Math.round(255 * (0.24 + n * 0.56));
          px[o + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
          px[o + 2] = Math.round(255 * (0.38 + (1 - n) * 0.3));
          px[o + 3] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
        }
      }
    });
    this.aggregate = texture;
    return texture;
  }

  private aggregate: DynamicTexture | null = null;
  /**
   * Everything that is lit from within: neon, signage, the window grids.
   *
   * A sign is only bright relative to what is around it. Left at full
   * strength through the morning the whole street reads as a night scene
   * with a blue sky over it, so the region scales these back as the sun
   * comes up (see `setNightFactor`).
   */
  private readonly lit: {
    material: PBRMaterial;
    albedo: Color3 | null;
    emissive: number;
  }[] = [];

  /** A canvas-backed texture written a pixel at a time. */
  private paint(name: string, size: number, write: (px: Uint8ClampedArray) => void): DynamicTexture {
    const texture = new DynamicTexture(
      `city.${name}`,
      { width: size, height: size },
      this.scene,
      true,
      Texture.TRILINEAR_SAMPLINGMODE,
      undefined,
      false,
    );
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    const image = ctx.createImageData(size, size);
    write(image.data);
    ctx.putImageData(image, 0, 0);
    texture.update(false);
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    return texture;
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
    this.lit.push({ material, albedo: material.albedoColor.clone(), emissive: strength });
    this.cache.set(key, material);
    return material;
  }

  /**
   * Glazing. Clear enough to see a room through, smooth enough to hold the
   * sky: at 0.55 alpha over a dark albedo every shopfront was a black
   * mirror, which defeats the point of building interiors behind them, and
   * the reflection now sits over the transparency rather than replacing it.
   */
  glass(kind: GlassKind = "shopfront"): PBRMaterial {
    const key = `glass:${kind}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const material = makeGlass(this.scene, `city.glass.${kind}`, kind);
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

    // Capped at 512: a facade texture covers one three-metre floor band, and
    // five variants of four 1024-pixel maps cost more frame than they are
    // worth on a wall nobody stands closer than five metres to.
    const size = Math.min(512, Math.max(256, this.textureSize));
    const random = makeRandom(options.seed);

    // The grid is decided once and then drawn several times. Rolling it
    // inside each pass would give the albedo, the emissive, the gloss and
    // the relief four different sets of lit windows.
    const cells: { lit: boolean; brightness: number; cold: boolean; shade: number }[] = [];
    for (let i = 0; i < options.rows * options.columns; i += 1) {
      cells.push({
        lit: random() < options.litFraction,
        brightness: 0.5 + random() * 0.5,
        cold: random() >= 0.78,
        shade: random(),
      });
    }

    const cellW = size / options.columns;
    const cellH = size / options.rows;
    const inset = Math.max(1, Math.min(cellW, cellH) * 0.17);
    /** Is this texel inside a window opening, and how far into it? */
    const opening = (x: number, y: number): { cell: number; inside: boolean; reveal: number } => {
      const col = Math.min(options.columns - 1, Math.floor(x / cellW));
      const row = Math.min(options.rows - 1, Math.floor(y / cellH));
      const left = col * cellW + inset;
      const topEdge = row * cellH + inset;
      const right = (col + 1) * cellW - inset;
      const bottom = (row + 1) * cellH - inset;
      const inside = x >= left && x < right && y >= topEdge && y < bottom;
      const edge = Math.min(x - left, right - x, y - topEdge, bottom - y);
      return { cell: row * options.columns + col, inside, reveal: inside ? Math.min(1, edge / inset) : 0 };
    };

    // The wall itself is concrete, so it is drawn as concrete: the panel
    // joints of the pour, the tie holes the formwork left, and the mottling
    // and streaking that stop it reading as grey card. A floor band is
    // about three metres tall, which is what sets the scale here.
    const metresAcross = options.columns * 2.1;
    const metresUp = 3;
    const wall = new Float32Array(size * size);
    const relief = new Float32Array(size * size);
    const wallGloss = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) {
      const wy = (1 - y / size) * metresUp;
      for (let x = 0; x < size; x += 1) {
        const wx = (x / size) * metresAcross;
        const { tone, gloss } = concreteShade(wx, wy);
        // One pour joint per floor at top and bottom, and a vertical joint
        // between each pair of window columns.
        const columnJoint = Math.abs(((x / cellW) % 1) - 0) < 0.012 ? 1 : 0;
        const floorJoint = y < size * 0.012 || y > size * 0.988 ? 1 : 0;
        const joint = Math.max(columnJoint, floorJoint);
        // Tie holes: two a panel, clear of the openings.
        const tieX = Math.abs(((x / cellW) % 1) - 0.5) < 0.02;
        const tieY = Math.abs(((y / cellH) % 1) - 0.08) < 0.014 || Math.abs(((y / cellH) % 1) - 0.94) < 0.014;
        const tie = tieX && tieY ? 1 : 0;
        const i = y * size + x;
        wall[i] = Math.max(0, tone - joint * 0.28 - tie * 0.45);
        relief[i] = -joint * 0.5 - tie * 0.4 + (tone - 0.5) * 0.12;
        wallGloss[i] = gloss;
      }
    }

    const write = (
      pass: "albedo" | "emissive" | "gloss" | "normal",
    ): DynamicTexture => {
      const texture = new DynamicTexture(
        `facade.${name}.${pass}`,
        { width: size, height: size },
        this.scene,
        true,
        Texture.TRILINEAR_SAMPLINGMODE,
        undefined,
        false,
      );
      const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
      const image = ctx.createImageData(size, size);
      const px = image.data;
      const height = new Float32Array(pass === "normal" ? size * size : 0);
      const warm: [number, number, number][] = [
        [1, 0.85, 0.63],
        [1, 0.76, 0.48],
        [1, 0.89, 0.74],
      ];
      const cold: [number, number, number][] = [
        [0.81, 0.9, 1],
        [0.9, 0.95, 1],
      ];

      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const i = y * size + x;
          const o = i * 4;
          const { cell, inside, reveal } = opening(x, y);
          const state = cells[cell] ?? { lit: false, brightness: 0.6, cold: false, shade: 0.5 };
          if (pass === "emissive") {
            if (inside && state.lit) {
              const palette = state.cold ? cold : warm;
              const rgb = palette[Math.floor(state.shade * palette.length)] ?? warm[0]!;
              const level = state.brightness * (0.55 + reveal * 0.45);
              px[o] = Math.round(255 * (rgb[0] ?? 1) * level);
              px[o + 1] = Math.round(255 * (rgb[1] ?? 1) * level);
              px[o + 2] = Math.round(255 * (rgb[2] ?? 1) * level);
            } else {
              px[o] = 0;
              px[o + 1] = 0;
              px[o + 2] = 0;
            }
            px[o + 3] = 255;
            continue;
          }
          if (pass === "gloss") {
            // Rough dielectric across the concrete, smooth and part-metal
            // over each pane, so a window catches the sun and the wall does
            // not.
            const rough = inside ? 0.07 + state.shade * 0.06 : 0.72 + (wallGloss[i] ?? 0.8) * 0.2;
            px[o] = 0;
            px[o + 1] = Math.round(255 * Math.min(1, rough));
            px[o + 2] = inside ? 140 : 12;
            px[o + 3] = 255;
            continue;
          }
          if (pass === "normal") {
            // Windows sit back in their reveals; joints and tie holes are
            // shallow. Built as a height field and differentiated below.
            height[i] = inside ? -1.1 - reveal * 0.2 : (relief[i] ?? 0);
            continue;
          }
          // Albedo.
          if (inside) {
            const glass = state.lit ? 0.2 + state.shade * 0.06 : 0.13 + state.shade * 0.05;
            px[o] = Math.round(255 * glass * 0.95);
            px[o + 1] = Math.round(255 * glass);
            px[o + 2] = Math.round(255 * glass * 1.12);
          } else {
            const tone = wall[i] ?? 0.5;
            px[o] = Math.round(255 * (0.58 + 0.2 * tone));
            px[o + 1] = Math.round(255 * (0.585 + 0.2 * tone));
            px[o + 2] = Math.round(255 * (0.58 + 0.195 * tone));
          }
          px[o + 3] = 255;
        }
      }

      if (pass === "normal") {
        const at = (x: number, y: number): number =>
          height[(((y % size) + size) % size) * size + (((x % size) + size) % size)] ?? 0;
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            const dx = (at(x + 1, y) - at(x - 1, y)) * 0.9;
            const dy = (at(x, y + 1) - at(x, y - 1)) * 0.9;
            const length = Math.hypot(-dx, -dy, 1);
            const o = (y * size + x) * 4;
            px[o] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
            px[o + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
            px[o + 2] = Math.round((1 / length) * 0.5 * 255 + 127);
            px[o + 3] = 255;
          }
        }
      }

      ctx.putImageData(image, 0, 0);
      texture.update(false);
      texture.wrapU = Texture.WRAP_ADDRESSMODE;
      texture.wrapV = Texture.WRAP_ADDRESSMODE;
      texture.anisotropicFilteringLevel = this.anisotropy;
      return texture;
    };

    const material = new PBRMaterial(`city.facade.${name}`, this.scene);
    material.albedoTexture = write("albedo");
    material.emissiveTexture = write("emissive");
    material.emissiveColor = new Color3(1, 1, 1);
    material.emissiveIntensity = 1.1;
    this.lit.push({ material, albedo: null, emissive: 1.1 });
    material.bumpTexture = write("normal");
    material.invertNormalMapY = false;
    // Metalness and roughness come per-pixel from the gloss map; the factors
    // above it stay at 1 so the map is what decides.
    material.metallicTexture = write("gloss");
    material.useRoughnessFromMetallicTextureAlpha = false;
    material.useRoughnessFromMetallicTextureGreen = true;
    material.useMetallnessFromMetallicTextureBlue = true;
    material.metallic = 1;
    material.roughness = 1;
    material.enableSpecularAntiAliasing = true;
    // Windows are the only part of a facade that should out-reflect the
    // street, and the map has already limited that to the panes.
    material.environmentIntensity = 1.5;
    this.cache.set(key, material);
    return material;
  }

  /**
   * A sign with words on it.
   *
   * `aspect` is the width over the height of the face the material lands on,
   * so the letters are shaped by the board rather than stretched by it. If
   * the machine has no Japanese font, this falls back to `signboard`'s
   * strokes rather than drawing a row of empty boxes.
   */
  sign(
    name: string,
    lines: readonly string[],
    colour: Color3,
    aspect: number,
    style: SignStyle = "neon",
    invert = false,
  ): PBRMaterial {
    const key = `words:${name}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    if (!japaneseAvailable()) return this.signboard(name, colour, name.length * 31 + 7);

    const material = new PBRMaterial(`city.sign.${name}`, this.scene);
    const texture = signTexture(this.scene, name, { lines, colour, aspect, style, invert });
    material.albedoTexture = texture;
    if (style === "tenant") {
      // A light box: lit by the street by day and from inside after dark,
      // so it is a shaded material with an emissive pass over it rather
      // than an unlit one.
      material.roughness = 0.62;
      material.metallic = 0;
      material.emissiveTexture = texture;
      material.emissiveColor = new Color3(1, 1, 1);
      material.emissiveIntensity = 0.75;
      this.lit.push({ material, albedo: null, emissive: 0.75 });
      this.cache.set(key, material);
      return material;
    }
    material.unlit = true;
    // Over-bright so the tube blows into the bloom pass the way neon does;
    // ink on a board is lit by the street instead.
    material.albedoColor = style === "neon" ? new Color3(3, 3, 3) : new Color3(1.1, 1.1, 1.1);
    // Sign faces are unlit, so their brightness lives in the albedo; the
    // plate ones stay legible by day rather than fading out entirely.
    if (style === "neon") {
      this.lit.push({ material, albedo: material.albedoColor.clone(), emissive: 1 });
    }
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
    this.lit.push({ material, albedo: material.albedoColor.clone(), emissive: 1 });
    this.cache.set(key, material);
    return material;
  }

  dispose(): void {
    for (const material of this.cache.values()) material.dispose(true, true);
    this.cache.clear();
  }
}

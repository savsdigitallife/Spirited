/**
 * What the pavement is made of.
 *
 * A Tokyo footway is not one surface. It changes at the property line and
 * at every reconstruction: interlocking concrete blocks outside one shop,
 * clay pavers outside the next, plain slabs where the road was widened, a
 * smooth strip of coloured asphalt where a cycle lane has been marked out,
 * and a line of yellow tactile blocks running the length of all of it.
 *
 * Each surface is drawn once into a canvas as albedo, normal and
 * metallic-roughness, and every mesh that uses one carries world-plane UVs
 * (see `planarUv`), so the pattern runs continuously from one slab into the
 * next instead of restarting at every join.
 */

import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import { makeRandom } from "./Noise";

export type PavingKind =
  /** Interlocking concrete blocks, the default Japanese footway. */
  | "block"
  /** Clay pavers, warmer and smaller, laid outside the older frontages. */
  | "brick"
  /** Plain in-situ slabs with saw-cut joints. */
  | "concrete"
  /** Coloured asphalt: the cycle lane along the kerb. */
  | "cycleway"
  /** Yellow tactile blocks: the guide line the whole street is built round. */
  | "tactile";

/** Metres one tile of a paving texture covers. Shared by every kind. */
export const PAVING_TILE = 2;

interface Recipe {
  /** Unit size in metres, along and across. */
  unit: [number, number];
  /** Joint width in metres. */
  joint: number;
  /** Half the units offset by half a length, as a running bond does. */
  bond: boolean;
  base: [number, number, number];
  /** How far each unit's tone strays from the base. */
  variation: number;
  jointColour: [number, number, number];
  roughness: [number, number];
  /** Depth of the joint in the normal map. */
  relief: number;
}

const RECIPES: Record<PavingKind, Recipe> = {
  block: {
    unit: [0.2, 0.1],
    joint: 0.008,
    bond: true,
    base: [0.46, 0.45, 0.43],
    variation: 0.05,
    jointColour: [0.3, 0.29, 0.28],
    roughness: [0.72, 0.9],
    relief: 1.6,
  },
  brick: {
    unit: [0.21, 0.1],
    joint: 0.01,
    bond: true,
    base: [0.42, 0.24, 0.18],
    variation: 0.07,
    jointColour: [0.24, 0.2, 0.18],
    roughness: [0.66, 0.88],
    relief: 1.8,
  },
  concrete: {
    unit: [0.9, 0.9],
    joint: 0.012,
    bond: false,
    base: [0.53, 0.52, 0.5],
    variation: 0.025,
    jointColour: [0.36, 0.35, 0.34],
    roughness: [0.78, 0.94],
    relief: 1.2,
  },
  cycleway: {
    // No units: a continuous surface. The unit is set large so the joint
    // pattern falls outside the tile and only the grain remains.
    unit: [8, 8],
    joint: 0.004,
    bond: false,
    base: [0.11, 0.17, 0.2],
    variation: 0.012,
    jointColour: [0.1, 0.15, 0.18],
    roughness: [0.6, 0.78],
    relief: 0.5,
  },
  tactile: {
    unit: [0.3, 0.3],
    joint: 0.008,
    bond: false,
    base: [0.72, 0.6, 0.16],
    variation: 0.02,
    jointColour: [0.45, 0.37, 0.12],
    roughness: [0.6, 0.8],
    relief: 2.4,
  },
};

function texture(
  scene: Scene,
  name: string,
  size: number,
  write: (px: Uint8ClampedArray) => void,
): DynamicTexture {
  const map = new DynamicTexture(
    `paving.${name}`,
    { width: size, height: size },
    scene,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
    undefined,
    false,
  );
  const ctx = map.getContext() as unknown as CanvasRenderingContext2D;
  const image = ctx.createImageData(size, size);
  write(image.data);
  ctx.putImageData(image, 0, 0);
  map.update(false);
  map.wrapU = Texture.WRAP_ADDRESSMODE;
  map.wrapV = Texture.WRAP_ADDRESSMODE;
  return map;
}

/**
 * Builds one paving material.
 *
 * The pattern is worked out per texel in metres rather than in pixels, so a
 * block is 20 cm on the ground whatever resolution the preset is running.
 */
export function makePaving(
  scene: Scene,
  kind: PavingKind,
  size: number,
  anisotropy: number,
): PBRMaterial {
  const recipe = RECIPES[kind];
  const metresPerTexel = PAVING_TILE / size;
  const random = makeRandom(kind.length * 977 + 13);

  // Tone per unit, so neighbouring blocks differ the way laid blocks do.
  const acrossUnits = Math.max(1, Math.round(PAVING_TILE / recipe.unit[1]));
  const alongUnits = Math.max(1, Math.round(PAVING_TILE / recipe.unit[0]));
  const tones = new Float32Array((acrossUnits + 2) * (alongUnits + 2));
  for (let i = 0; i < tones.length; i += 1) tones[i] = (random() - 0.5) * 2;

  const unitAlong = PAVING_TILE / alongUnits;
  const unitAcross = PAVING_TILE / acrossUnits;

  // For each texel: which unit it belongs to, and how close it is to a joint.
  const shade = new Float32Array(size * size);
  const seam = new Float32Array(size * size);
  const dot = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const v = y * metresPerTexel;
    let row = Math.floor(v / unitAcross);
    // Running bond: every other course starts half a unit along.
    const shift = recipe.bond && row % 2 === 1 ? unitAlong / 2 : 0;
    for (let x = 0; x < size; x += 1) {
      const u = x * metresPerTexel + shift;
      const column = Math.floor(u / unitAlong);
      const inAlong = u - column * unitAlong;
      const inAcross = v - row * unitAcross;
      const edge = Math.min(
        inAlong,
        unitAlong - inAlong,
        inAcross,
        unitAcross - inAcross,
      );
      const i = y * size + x;
      seam[i] = edge < recipe.joint ? 1 - edge / recipe.joint : 0;
      const key = ((row + 1) * (alongUnits + 2) + ((column % (alongUnits + 2)) + alongUnits + 2)) %
        tones.length;
      shade[i] = tones[key] ?? 0;
      if (kind === "tactile") {
        // Raised dots, five across a block: the warning surface, which is
        // what the yellow line down a Japanese pavement actually is.
        const cell = 0.06;
        const dx = ((inAlong % cell) - cell / 2) / (cell * 0.34);
        const dy = ((inAcross % cell) - cell / 2) / (cell * 0.34);
        const d = Math.hypot(dx, dy);
        dot[i] = d < 1 ? Math.sqrt(1 - d * d) : 0;
      }
    }
    row += 0;
  }

  const albedo = texture(scene, `${kind}.albedo`, size, (px) => {
    for (let i = 0; i < size * size; i += 1) {
      const tone = 1 + (shade[i] ?? 0) * recipe.variation;
      const joint = seam[i] ?? 0;
      const lift = 1 + (dot[i] ?? 0) * 0.12;
      const o = i * 4;
      for (let c = 0; c < 3; c += 1) {
        const unit = (recipe.base[c] ?? 0) * tone * lift;
        const colour = unit + ((recipe.jointColour[c] ?? 0) - unit) * joint;
        px[o + c] = Math.round(255 * Math.max(0, Math.min(1, colour)));
      }
      px[o + 3] = 255;
    }
  });

  const height = new Float32Array(size * size);
  for (let i = 0; i < size * size; i += 1) {
    height[i] = -(seam[i] ?? 0) * recipe.relief + (dot[i] ?? 0) * recipe.relief * 0.8;
  }
  const normal = texture(scene, `${kind}.normal`, size, (px) => {
    const at = (x: number, y: number): number =>
      height[(((y % size) + size) % size) * size + (((x % size) + size) % size)] ?? 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = at(x + 1, y) - at(x - 1, y);
        const dy = at(x, y + 1) - at(x, y - 1);
        const length = Math.hypot(-dx, -dy, 1);
        const o = (y * size + x) * 4;
        px[o] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
        px[o + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
        px[o + 2] = Math.round((1 / length) * 0.5 * 255 + 127);
        px[o + 3] = 255;
      }
    }
  });

  const orm = texture(scene, `${kind}.orm`, size, (px) => {
    const [lo, hi] = recipe.roughness;
    for (let i = 0; i < size * size; i += 1) {
      const wear = ((shade[i] ?? 0) + 1) / 2;
      const joint = seam[i] ?? 0;
      const o = i * 4;
      px[o] = 255;
      px[o + 1] = Math.round(255 * Math.min(1, lo + (hi - lo) * wear + joint * 0.08));
      px[o + 2] = 0;
      px[o + 3] = 255;
    }
  });

  const material = new PBRMaterial(`city.paving.${kind}`, scene);
  material.albedoTexture = albedo;
  material.bumpTexture = normal;
  material.metallicTexture = orm;
  material.useRoughnessFromMetallicTextureAlpha = false;
  material.useRoughnessFromMetallicTextureGreen = true;
  material.useMetallnessFromMetallicTextureBlue = true;
  material.metallic = 1;
  material.roughness = 1;
  material.albedoColor = Color3.White();
  material.invertNormalMapY = false;
  material.specularIntensity = 0.45;
  material.enableSpecularAntiAliasing = true;
  for (const map of [albedo, normal, orm]) {
    map.uScale = 1;
    map.vScale = 1;
    map.anisotropicFilteringLevel = anisotropy;
  }
  return material;
}

/**
 * The bicycle painted on a cycle lane.
 *
 * Drawn as strokes on a transparent ground so it sits on whatever surface it
 * is laid over, the way road paint does. Two wheels, a frame, a saddle and
 * bars, with a chevron above pointing the way the lane runs.
 */
export function makeCycleMark(scene: Scene, anisotropy: number): PBRMaterial {
  const size = 256;
  const map = new DynamicTexture(
    "paving.cycleMark",
    { width: size, height: Math.round(size * 1.9) },
    scene,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
    undefined,
    false,
  );
  const height = Math.round(size * 1.9);
  const ctx = map.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, height);
  ctx.strokeStyle = "#e8e8e2";
  ctx.fillStyle = "#e8e8e2";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const wheel = size * 0.23;
  const axleY = height * 0.68;
  ctx.lineWidth = size * 0.052;
  for (const cx of [size * 0.27, size * 0.73]) {
    ctx.beginPath();
    ctx.arc(cx, axleY, wheel, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Frame: down tube, seat tube, top tube, chain stay.
  ctx.lineWidth = size * 0.045;
  ctx.beginPath();
  ctx.moveTo(size * 0.27, axleY);
  ctx.lineTo(size * 0.47, axleY - wheel * 0.95);
  ctx.lineTo(size * 0.6, axleY);
  ctx.lineTo(size * 0.73, axleY);
  ctx.moveTo(size * 0.47, axleY - wheel * 0.95);
  ctx.lineTo(size * 0.62, axleY - wheel * 1.05);
  ctx.lineTo(size * 0.73, axleY);
  ctx.stroke();
  // Saddle and bars.
  ctx.lineWidth = size * 0.05;
  ctx.beginPath();
  ctx.moveTo(size * 0.4, axleY - wheel * 1.12);
  ctx.lineTo(size * 0.54, axleY - wheel * 1.12);
  ctx.moveTo(size * 0.58, axleY - wheel * 1.2);
  ctx.lineTo(size * 0.72, axleY - wheel * 1.2);
  ctx.stroke();

  // The chevron above it.
  ctx.lineWidth = size * 0.07;
  ctx.beginPath();
  ctx.moveTo(size * 0.24, height * 0.26);
  ctx.lineTo(size * 0.5, height * 0.1);
  ctx.lineTo(size * 0.76, height * 0.26);
  ctx.stroke();

  map.update(false);
  map.hasAlpha = true;
  map.wrapU = Texture.CLAMP_ADDRESSMODE;
  map.wrapV = Texture.CLAMP_ADDRESSMODE;
  map.anisotropicFilteringLevel = anisotropy;

  const material = new PBRMaterial("city.cycleMark", scene);
  material.albedoTexture = map;
  material.useAlphaFromAlbedoTexture = true;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
  material.alphaCutOff = 0.35;
  material.roughness = 0.72;
  material.metallic = 0;
  material.backFaceCulling = false;
  return material;
}

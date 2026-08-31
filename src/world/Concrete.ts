/**
 * Poured concrete, the way it is actually finished in Tokyo.
 *
 * The reference is a plain in-situ wall: large panels the size of the
 * formwork, hairline joints where one pour met the next, the tie holes left
 * by the bolts that held the shuttering together, and a surface that is not
 * flat grey but faintly blotched — cement that cured a little differently
 * here and there, water that has run down it, dust that has settled on it.
 *
 * Two layers, as with the asphalt: the panel grid and its staining at three
 * and a half metres a tile, and the aggregate itself as a detail map at
 * about forty centimetres, which is what gives it the stone in the concrete
 * when you stand next to it.
 *
 * Everything using this carries `boxUv`, so the panel lines run continuously
 * from one wall onto the next instead of restarting at every mesh.
 */

import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Scene } from "@babylonjs/core/scene";
import { fbm, makeRandom } from "./Noise";

/** Metres one tile of the panel grid covers. Two panels across, three down. */
export const CONCRETE_TILE = 3.6;
/** Metres one tile of the aggregate detail map covers. */
export const CONCRETE_DETAIL_TILE = 0.45;

/** Panels are wider than they are tall, as formwork sheets are. */
const PANEL_ACROSS = 2;
const PANEL_DOWN = 3;
/** Joint width, in metres. */
const JOINT = 0.006;

function paint(
  scene: Scene,
  name: string,
  size: number,
  write: (px: Uint8ClampedArray) => void,
): DynamicTexture {
  const texture = new DynamicTexture(
    `concrete.${name}`,
    { width: size, height: size },
    scene,
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

/**
 * The surface of a concrete wall at a point, in metres.
 *
 * Broad mottling from the cure, finer blotching from dust and rain, and the
 * faint vertical streaking water leaves. Shared with the facade textures so
 * a building's wall panels and its plain concrete are the same material.
 */
export function concreteShade(x: number, y: number): { tone: number; gloss: number } {
  const cure = fbm(x * 0.55, y * 0.55, { octaves: 4, period: 3, seed: 313 });
  const blotch = fbm(x * 1.7, y * 1.7, { octaves: 3, period: 6, seed: 577 });
  const runs = fbm(x * 5.5, y * 0.5, { octaves: 2, period: 8, seed: 811 });
  const streak = Math.max(0, runs - 0.55) * 0.9;
  return {
    tone: Math.max(0, Math.min(1, 0.5 + (cure - 0.5) * 0.55 + (blotch - 0.5) * 0.32 - streak * 0.5)),
    gloss: Math.max(0, Math.min(1, 0.86 - streak * 0.35 + (blotch - 0.5) * 0.1)),
  };
}

/**
 * The aggregate: sand and stone in the mix, plus the pinholes the air leaves
 * against the shuttering.
 *
 * Read as a detail map, so red is an albedo multiplier around 0.5, blue a
 * roughness offset, and alpha with green the normal's X and Y. Shared
 * between plain concrete and the building facades, because it is the same
 * material in both.
 */
export function concreteAggregate(scene: Scene, size: number, anisotropy: number): DynamicTexture {
  const grains = new Float32Array(size * size);
  const grainRandom = makeRandom(1187);
  for (let i = 0; i < size * size; i += 1) grains[i] = grainRandom();
  const smooth = new Float32Array(size * size);
  const sample = (data: Float32Array, x: number, y: number): number =>
    data[(((y % size) + size) % size) * size + (((x % size) + size) % size)] ?? 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) sum += sample(grains, x + dx, y + dy);
      }
      const mean = sum / 9;
      // Pushed away from the middle: grains with edges, not grey soup.
      smooth[y * size + x] = Math.min(1, Math.max(0, (mean - 0.5) * 1.9 + 0.5));
    }
  }
  const texture = paint(scene, "aggregate", size, (px) => {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = sample(smooth, x, y);
        const dx = (sample(smooth, x + 1, y) - sample(smooth, x - 1, y)) * 2.4;
        const dy = (sample(smooth, x, y + 1) - sample(smooth, x, y - 1)) * 2.4;
        const length = Math.hypot(-dx, -dy, 1);
        const o = (y * size + x) * 4;
        px[o] = Math.round(255 * (0.42 + n * 0.17));
        px[o + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
        px[o + 2] = Math.round(255 * (0.44 + (1 - n) * 0.16));
        px[o + 3] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
      }
    }
  });
  texture.anisotropicFilteringLevel = anisotropy;
  return texture;
}

export function makeConcrete(scene: Scene, size: number, anisotropy: number): PBRMaterial {
  const metres = CONCRETE_TILE / size;
  const panelW = CONCRETE_TILE / PANEL_ACROSS;
  const panelH = CONCRETE_TILE / PANEL_DOWN;
  const random = makeRandom(6421);
  // A tone per panel: each pour cures its own shade.
  const panelTone: number[] = [];
  for (let i = 0; i < PANEL_ACROSS * PANEL_DOWN; i += 1) panelTone.push((random() - 0.5) * 2);

  const tone = new Float32Array(size * size);
  const height = new Float32Array(size * size);
  const gloss = new Float32Array(size * size);

  for (let y = 0; y < size; y += 1) {
    // V runs up the wall, so a texel's height above the tile's base is
    // (1 - v): stains run downwards from the joint above them.
    const wy = y * metres;
    for (let x = 0; x < size; x += 1) {
      const wx = x * metres;
      const column = Math.floor(wx / panelW);
      const row = Math.floor(wy / panelH);
      const inX = wx - column * panelW;
      const inY = wy - row * panelH;

      // The joint between pours: a hairline, slightly recessed and darker.
      const edge = Math.min(inX, panelW - inX, inY, panelH - inY);
      const joint = edge < JOINT ? 1 - edge / JOINT : 0;

      // Tie holes, in the grid the formwork bolts were set out on: two
      // across and two up each panel, a little under 3 cm across.
      let tie = 0;
      for (const [tx, ty] of [
        [panelW * 0.25, panelH * 0.3],
        [panelW * 0.75, panelH * 0.3],
        [panelW * 0.25, panelH * 0.78],
        [panelW * 0.75, panelH * 0.78],
      ] as const) {
        const d = Math.hypot(inX - tx, inY - ty) / 0.016;
        if (d < 1.6) tie = Math.max(tie, Math.min(1, 1.6 - d));
      }

      // What makes it read as concrete rather than as card: broad mottling
      // from the cure, finer blotching from dust and rain, and faint
      // vertical streaking under the joints where water has run.
      const cure = fbm(wx * 0.55, wy * 0.55, { octaves: 4, period: 3, seed: 313 });
      const blotch = fbm(wx * 1.7, wy * 1.7, { octaves: 3, period: 6, seed: 577 });
      const runs = fbm(wx * 5.5, wy * 0.5, { octaves: 2, period: 8, seed: 811 });
      const streak = Math.max(0, runs - 0.55) * (inY / panelH) * 0.9;

      const i = y * size + x;
      const shade =
        0.5 +
        (cure - 0.5) * 0.55 +
        (blotch - 0.5) * 0.32 +
        (panelTone[row * PANEL_ACROSS + column] ?? 0) * 0.06 -
        streak * 0.5;
      tone[i] = Math.max(0, Math.min(1, shade));
      height[i] = -joint * 1.6 - tie * 1.2 + (cure - 0.5) * 0.25;
      // Damp streaks and the joints hold a little more sheen than the face.
      gloss[i] = Math.max(0, Math.min(1, 0.86 - streak * 0.35 + (blotch - 0.5) * 0.1 - joint * 0.1));
    }
  }

  const albedo = paint(scene, "albedo", size, (px) => {
    for (let i = 0; i < size * size; i += 1) {
      const t = tone[i] ?? 0.5;
      const o = i * 4;
      // A pale, slightly cool grey: 0.60 to 0.78 across the wall, which is
      // where in-situ concrete actually sits.
      px[o] = Math.round(255 * (0.6 + 0.18 * t));
      px[o + 1] = Math.round(255 * (0.605 + 0.18 * t));
      px[o + 2] = Math.round(255 * (0.6 + 0.175 * t));
      px[o + 3] = 255;
    }
  });

  const normal = paint(scene, "normal", size, (px) => {
    const at = (x: number, y: number): number =>
      height[(((y % size) + size) % size) * size + (((x % size) + size) % size)] ?? 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * 1.5;
        const dy = (at(x, y + 1) - at(x, y - 1)) * 1.5;
        const length = Math.hypot(-dx, -dy, 1);
        const o = (y * size + x) * 4;
        px[o] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
        px[o + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
        px[o + 2] = Math.round((1 / length) * 0.5 * 255 + 127);
        px[o + 3] = 255;
      }
    }
  });

  const orm = paint(scene, "orm", size, (px) => {
    for (let i = 0; i < size * size; i += 1) {
      const o = i * 4;
      px[o] = 255;
      px[o + 1] = Math.round(255 * (gloss[i] ?? 0.86));
      px[o + 2] = 0;
      px[o + 3] = 255;
    }
  });

  const detail = concreteAggregate(scene, size, anisotropy);

  const material = new PBRMaterial("city.concrete", scene);
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
  material.specularIntensity = 0.4;
  material.enableSpecularAntiAliasing = true;

  material.detailMap.texture = detail;
  material.detailMap.isEnabled = true;
  material.detailMap.diffuseBlendLevel = 0.34;
  material.detailMap.bumpLevel = 0.4;
  material.detailMap.roughnessBlendLevel = 0.3;

  for (const map of [albedo, normal, orm]) {
    map.uScale = 1;
    map.vScale = 1;
    map.anisotropicFilteringLevel = anisotropy;
  }
  detail.uScale = CONCRETE_TILE / CONCRETE_DETAIL_TILE;
  detail.vScale = CONCRETE_TILE / CONCRETE_DETAIL_TILE;
  detail.anisotropicFilteringLevel = anisotropy;
  return material;
}

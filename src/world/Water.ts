/**
 * Water surfaces: the river, and the flooded paddies.
 *
 * A PBR sheet with two normal maps scrolling across each other at different
 * speeds and angles, rather than Babylon's `WaterMaterial`. The library
 * material renders the scene twice more for reflection and refraction, which
 * is a lot to spend before there is anything worth reflecting; two scrolling
 * normals plus the environment cube give moving, believable water for one
 * draw call. When the valley is worth reflecting properly, this is where
 * that swap happens.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { fbm } from "./Noise";

export interface WaterLook {
  /** Colour of the water itself, before what it reflects. */
  tint: Color3;
  /** 0 glassy, 1 choppy. Scales both the ripple strength and its speed. */
  agitation: number;
  /** How see-through it is. Paddies are shallow, the river is not. */
  alpha: number;
}

const RIVER: WaterLook = {
  tint: new Color3(0.055, 0.09, 0.1),
  agitation: 1,
  alpha: 0.86,
};

const PADDY: WaterLook = {
  tint: new Color3(0.1, 0.115, 0.09),
  agitation: 0.22,
  alpha: 0.7,
};

export const WATER_LOOKS = { river: RIVER, paddy: PADDY } as const;
export type WaterKind = keyof typeof WATER_LOOKS;

/** A tileable normal map from the same value noise the ground uses. */
function rippleNormal(scene: Scene, size: number, seed: number, strength: number): Texture {
  const texture = new DynamicTexture(
    `water.normal.${seed}`,
    { width: size, height: size },
    scene,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  const image = ctx.createImageData(size, size);
  const px = image.data;

  const period = 8;
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      height[y * size + x] = fbm((x / size) * period, (y / size) * period, {
        octaves: 4,
        period,
        seed,
      });
    }
  }
  const at = (x: number, y: number) =>
    height[(((y % size) + size) % size) * size + (((x % size) + size) % size)] ?? 0;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(-dx, -dy, 1);
      const o = (y * size + x) * 4;
      px[o] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      px[o + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      px[o + 2] = Math.round((1 / len) * 0.5 * 255 + 127);
      px[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  texture.update(false);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

interface Sheet {
  mesh: Mesh;
  look: WaterLook;
  /** Metres of surface one texture repeat covers. */
  scale: number;
}

export class Water {
  private readonly sheets: Sheet[] = [];
  private readonly materials = new Map<WaterKind, PBRMaterial>();
  private readonly coarse: Texture;
  private readonly fine: Texture;
  private elapsed = 0;

  constructor(
    private readonly scene: Scene,
    textureSize = 256,
  ) {
    // Babylon clears the depth buffer between rendering groups by default,
    // which would let water draw over the bank it is sitting in. Group 1 is
    // the transparent pass here, so it must keep the depth the opaque pass
    // wrote.
    scene.setRenderingAutoClearDepthStencil(1, false, false, false);
    this.coarse = rippleNormal(scene, textureSize, 3, 2.6);
    this.fine = rippleNormal(scene, Math.max(128, textureSize / 2), 17, 1.7);
  }

  private material(kind: WaterKind): PBRMaterial {
    const cached = this.materials.get(kind);
    if (cached) return cached;
    const look = WATER_LOOKS[kind];

    const material = new PBRMaterial(`water.${kind}`, this.scene);
    material.albedoColor = look.tint;
    material.metallic = 0.02;
    material.roughness = 0.06 + look.agitation * 0.07;
    material.bumpTexture = this.coarse;
    material.bumpTexture.level = 0.35 + look.agitation * 0.55;
    material.alpha = look.alpha;
    material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    material.backFaceCulling = false;
    // Water is the one surface where a specular highlight has to survive
    // being small and bright, so it keeps its own antialiasing.
    material.enableSpecularAntiAliasing = true;
    material.environmentIntensity = 1.25;
    this.materials.set(kind, material);
    return material;
  }

  /**
   * Adds a flat sheet of water. `subdivisions` only matters if something
   * later wants to displace the surface; the ripple is in the normal map.
   */
  addSheet(
    name: string,
    kind: WaterKind,
    options: { width: number; depth: number; at: Vector3; rotationY?: number },
  ): Mesh {
    const mesh = CreateGround(
      `water.${name}`,
      { width: options.width, height: options.depth, subdivisions: 1 },
      this.scene,
    );
    mesh.position.copyFrom(options.at);
    mesh.rotation.y = options.rotationY ?? 0;
    mesh.material = this.material(kind);
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    // Water is drawn after the opaque world so it blends against a finished
    // frame rather than against whatever happened to be drawn first.
    mesh.renderingGroupId = 1;
    mesh.alphaIndex = 10;
    mesh.freezeWorldMatrix();

    this.sheets.push({
      mesh,
      look: WATER_LOOKS[kind],
      scale: Math.max(options.width, options.depth) / 6,
    });
    return mesh;
  }

  /** Scrolls the ripples. Called once a frame. */
  update(dt: number): void {
    this.elapsed += dt;
    for (const kind of this.materials.keys()) {
      const material = this.materials.get(kind);
      const look = WATER_LOOKS[kind];
      if (!(material?.bumpTexture instanceof Texture)) continue;
      const speed = 0.012 + look.agitation * 0.05;
      material.bumpTexture.uOffset = this.elapsed * speed;
      material.bumpTexture.vOffset = this.elapsed * speed * 0.62;
    }
    // The second layer drifts the other way, which is what stops the surface
    // reading as one sliding texture.
    this.fine.uOffset = -this.elapsed * 0.031;
    this.fine.vOffset = this.elapsed * 0.019;
  }

  /** Tiles each sheet's normal map to its own size, after all are added. */
  finalise(): void {
    for (const sheet of this.sheets) {
      const material = sheet.mesh.material;
      if (!(material instanceof PBRMaterial)) continue;
      if (material.bumpTexture instanceof Texture) {
        material.bumpTexture.uScale = Math.max(1, sheet.scale);
        material.bumpTexture.vScale = Math.max(1, sheet.scale);
      }
    }
  }

  get surfaceCount(): number {
    return this.sheets.length;
  }

  dispose(): void {
    for (const sheet of this.sheets) sheet.mesh.dispose();
    this.sheets.length = 0;
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.coarse.dispose();
    this.fine.dispose();
  }
}

/**
 * What the rain leaves on the ground.
 *
 * Two layers, both flat, both cheap. Puddles are dark polished patches that
 * break up the road; the sheen is the coloured smear each light source lays
 * down the wet surface under it. The sheen is what actually sells rain at
 * night — a street with neon overhead and nothing underneath reads as dry
 * however many drops are falling through the frame.
 *
 * Every quad in each layer is merged into one mesh, so the whole wet street
 * costs two draw calls and no lights.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Constants } from "@babylonjs/core/Engines/constants";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { makeRandom } from "./Noise";

/** A light that the ground under it should be showing. */
export interface SheenSource {
  /** The light itself. Its height decides how far the smear runs. */
  at: Vector3;
  colour: Color3;
  /** Roughly the light's intensity ÷ 30, clamped by the builder. */
  strength: number;
}

export interface WetGroundOptions {
  /** Ground level the layers sit just above. */
  y: number;
  /** Half-width of the carriageway, for puddle scatter. */
  roadHalf: number;
  /** Outer edge of the pavement. */
  paveOuter: number;
  from: number;
  to: number;
  /** Kept clear: nobody puts a puddle in the middle of a crossing. */
  clearAround?: { z: number; half: number };
  seed?: number;
  puddles?: number;
}

/** The smear texture: bright under the source, fading out along and across. */
function sheenTexture(scene: Scene): Texture {
  const texture = new DynamicTexture("wet.sheen", { width: 64, height: 256 }, scene, false);
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 1) {
    // Along the smear: strongest near the source, trailing away.
    const t = y / 255;
    // Fade in over the first few centimetres as well as out along the run,
    // so the near edge is not a straight bright line across the ground.
    const head = Math.min(1, t / 0.09);
    const along = head * Math.pow(1 - t, 1.6) * (0.35 + 0.65 * Math.abs(Math.sin(t * 9.4)));
    for (let x = 0; x < 64; x += 1) {
      // Across it: a soft-edged band, narrower the further it runs.
      const u = (x / 63) * 2 - 1;
      const across = Math.max(0, 1 - Math.pow(Math.abs(u) / (0.35 + 0.65 * (1 - t)), 2.2));
      const v = Math.round(Math.max(0, Math.min(1, along * across)) * 255);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  texture.update(false);
  texture.hasAlpha = false;
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  return texture;
}

export class WetGround {
  private readonly sheenMaterial: PBRMaterial;
  private readonly puddleMaterial: PBRMaterial;
  private readonly sheen: Mesh | null;
  private readonly puddles: Mesh | null;
  private wetness = 1;

  constructor(scene: Scene, sources: SheenSource[], options: WetGroundOptions) {
    const random = makeRandom(options.seed ?? 7717);
    const clear = options.clearAround;

    this.sheenMaterial = new PBRMaterial("wet.sheen", scene);
    this.sheenMaterial.unlit = true;
    this.sheenMaterial.albedoTexture = sheenTexture(scene);
    this.sheenMaterial.alphaMode = Constants.ALPHA_ADD;
    this.sheenMaterial.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
    this.sheenMaterial.backFaceCulling = false;
    this.sheenMaterial.disableDepthWrite = true;

    const quads: Mesh[] = [];
    for (const [index, source] of sources.entries()) {
      const height = Math.max(1.6, source.at.y);
      const length = Math.min(11, height * 1.5);
      const width = Math.min(3.4, 0.9 + height * 0.22);
      const quad = CreateGround(`wet.sheen${index}`, { width, height: length, subdivisions: 1 }, scene);
      quad.position.set(source.at.x, options.y, source.at.z - length * 0.5 + 0.4);
      const strength = Math.max(0.1, Math.min(1, source.strength));
      const tint = new Color4(
        source.colour.r * strength,
        source.colour.g * strength,
        source.colour.b * strength,
        1,
      );
      const count = quad.getTotalVertices();
      const colours: number[] = [];
      for (let i = 0; i < count; i += 1) colours.push(tint.r, tint.g, tint.b, tint.a);
      quad.setVerticesData(VertexBuffer.ColorKind, colours);
      quads.push(quad);
    }
    this.sheen = quads.length > 0 ? Mesh.MergeMeshes(quads, true, true) : null;
    if (this.sheen) {
      this.sheen.name = "wet.sheen";
      this.sheen.material = this.sheenMaterial;
      this.sheen.isPickable = false;
      this.sheen.checkCollisions = false;
      this.sheen.receiveShadows = false;
      this.sheen.renderingGroupId = 1;
      this.sheen.freezeWorldMatrix();
    }

    // Standing water. Dark and smooth: at night a puddle is mostly a hole in
    // the road that the sheen and the sky are reflected in.
    this.puddleMaterial = new PBRMaterial("wet.puddle", scene);
    this.puddleMaterial.albedoColor = new Color3(0.03, 0.034, 0.04);
    this.puddleMaterial.metallic = 0.9;
    this.puddleMaterial.roughness = 0.03;
    this.puddleMaterial.alpha = 0.55;

    const discs: Mesh[] = [];
    const wanted = options.puddles ?? 26;
    for (let i = 0; i < wanted; i += 1) {
      const z = options.from + random() * (options.to - options.from);
      if (clear && Math.abs(z - clear.z) < clear.half) continue;
      const onRoad = random() < 0.6;
      const x = onRoad
        ? (random() * 2 - 1) * (options.roadHalf - 0.5)
        : (random() < 0.5 ? -1 : 1) * (options.roadHalf + 0.6 + random() * (options.paveOuter - options.roadHalf - 1.2));
      const radius = 0.5 + random() * 1.5;
      const disc = CreateDisc(`wet.puddle${i}`, { radius, tessellation: 12 }, scene);
      disc.rotation.x = Math.PI / 2;
      disc.position.set(x, options.y - 0.004, z);
      disc.scaling.y = 0.55 + random() * 0.8;
      disc.bakeCurrentTransformIntoVertices();
      discs.push(disc);
    }
    this.puddles = discs.length > 0 ? Mesh.MergeMeshes(discs, true, true) : null;
    if (this.puddles) {
      this.puddles.name = "wet.puddles";
      this.puddles.material = this.puddleMaterial;
      this.puddles.isPickable = false;
      this.puddles.checkCollisions = false;
      this.puddles.receiveShadows = false;
      this.puddles.freezeWorldMatrix();
    }
  }

  /** 0 dry, 1 soaked. Both layers fade out with the rain. */
  setWetness(value: number): void {
    this.wetness = Math.max(0, Math.min(1, value));
    // Never all the way off: the ground under a sign stays a little lit even
    // between showers, and a layer that pops in reads worse than one that
    // simply brightens.
    if (this.sheen) this.sheen.visibility = 0.3 + this.wetness * 0.7;
    this.sheenMaterial.alpha = 0.45 + this.wetness * 0.55;
    if (this.puddles) this.puddles.setEnabled(this.wetness > 0.12);
    this.puddleMaterial.alpha = 0.2 + this.wetness * 0.45;
  }

  dispose(): void {
    this.sheen?.dispose();
    this.puddles?.dispose();
    this.sheenMaterial.dispose(false, true);
    this.puddleMaterial.dispose();
  }
}

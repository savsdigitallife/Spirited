/**
 * Glass.
 *
 * Every pane in the game comes from here, so a shopfront, a car's cabin, a
 * carriage window and a cake dome all behave the same way in the same light.
 *
 * What makes glass read as glass is not its colour — it is that it is
 * smooth. A smooth surface returns the sky in a sharp reflection, throws a
 * hard highlight where the sun is, and reflects more the more edge-on you
 * see it. All three come free from the PBR model once the material is set
 * up honestly: no metalness, a dielectric's index of refraction, roughness
 * near zero, and the reflection and specular allowed to show through the
 * transparency instead of being faded out with it.
 *
 * That last part is the one that is easy to get wrong. A pane at alpha 0.26
 * with `useRadianceOverAlpha` off is 26% of a reflection, which is no
 * reflection at all; with it on, the glass stays as clear as it was and the
 * sky sits on top of it, which is what a window actually looks like.
 *
 * The reflection itself is the scene's environment cube — a probe of the sky
 * refreshed as the sun moves (see `Environment`) — so the glint tracks the
 * time of day without a single line of code that knows where the sun is.
 */

import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Scene } from "@babylonjs/core/scene";

export type GlassKind =
  /** Shopfront and door glazing: clear, so the room behind it reads. */
  | "shopfront"
  /** Vehicle glazing: dark, tinted, strongly reflective. */
  | "vehicle"
  /** Carriage and interior partitions. */
  | "carriage"
  /** A display case or cabinet: near-colourless and very smooth. */
  | "cabinet";

interface GlassRecipe {
  tint: Color3;
  alpha: number;
  roughness: number;
  /**
   * How hard the sky is thrown back. Above 1 because the scene's environment
   * intensity is tuned for matte surfaces, and glass is the one thing on the
   * street that should out-reflect its own surroundings.
   */
  environment: number;
}

const RECIPES: Record<GlassKind, GlassRecipe> = {
  // Architectural glass is not optically flat — it sags in the frame, and a
  // little roughness is what turns the sun from a mathematical point that
  // lands on nothing into a glare you actually catch as you walk past.
  shopfront: { tint: new Color3(0.09, 0.11, 0.13), alpha: 0.26, roughness: 0.08, environment: 1.9 },
  vehicle: { tint: new Color3(0.03, 0.035, 0.045), alpha: 0.62, roughness: 0.045, environment: 2.2 },
  carriage: { tint: new Color3(0.02, 0.025, 0.03), alpha: 0.28, roughness: 0.07, environment: 1.7 },
  cabinet: { tint: new Color3(0.82, 0.86, 0.9), alpha: 0.22, roughness: 0.02, environment: 1.6 },
};

export function makeGlass(scene: Scene, name: string, kind: GlassKind = "shopfront"): PBRMaterial {
  const recipe = RECIPES[kind];
  const material = new PBRMaterial(name, scene);
  material.albedoColor = recipe.tint;
  // A dielectric, not a metal: metalness on glass kills the transmission and
  // turns every window into a mirror of a black room.
  material.metallic = 0;
  material.roughness = recipe.roughness;
  material.indexOfRefraction = 1.52;
  material.alpha = recipe.alpha;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.backFaceCulling = false;
  // The two that make a transparent surface still look like a surface.
  material.useRadianceOverAlpha = true;
  material.useSpecularOverAlpha = true;
  material.environmentIntensity = recipe.environment;
  // The sun's own highlight, as distinct from its reflection in the sky cube.
  material.directIntensity = 1.5;
  material.specularIntensity = 1.6;
  return material;
}

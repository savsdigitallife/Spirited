/**
 * What a person is made of.
 *
 * The rig builder takes one of these and returns a jointed body. Keeping the
 * description as data rather than as code is what makes a crowd possible
 * from one builder, and it is also the shape a glTF character will be
 * addressed by later: a spec will name a model and a set of swappable
 * garment meshes instead of colours and proportions, and nothing that reads
 * a rig will notice the difference.
 */

import { Color3 } from "@babylonjs/core/Maths/math.color";

export type HairStyle = "long" | "bob" | "short" | "tied" | "cap";
export type OutfitStyle = "street" | "office" | "casual" | "work" | "school";

export interface OutfitSpec {
  style: OutfitStyle;
  /** Jacket, coat or shirt. */
  top: Color3;
  /** Trousers or skirt. */
  bottom: Color3;
  /** Legs below the hem: tights, socks, bare. */
  hose: Color3;
  shoes: Color3;
  /** Scarf, bag, trim — the one colour that is allowed to be loud. */
  accent: Color3;
  /** True for a skirt, false for trousers. */
  skirt: boolean;
  /** A bag slung across the body. */
  bag: boolean;
}

export interface CharacterSpec {
  name: string;
  /** Metres, floor to crown. */
  height: number;
  /** 0 slight, 1 broad. Scales shoulder width and limb thickness. */
  build: number;
  skin: Color3;
  hairColour: Color3;
  eyeColour: Color3;
  hairStyle: HairStyle;
  outfit: OutfitSpec;
  /**
   * Build eyes, brows and a mouth.
   *
   * Off for background crowds: at the distance a pedestrian is seen from,
   * facial geometry is six meshes that never resolve, and turning it off
   * halves a body's mesh count.
   */
  face: boolean;
  /**
   * Simulate hair as a chain rather than pinning it to the head. Expensive
   * enough that only the player and speaking characters get it.
   */
  simulatedHair: boolean;
}

/**
 * Aiko.
 *
 * Long sleek black hair almost to the floor, blunt bangs, green eyes,
 * present-day Tokyo street clothes: an oversized jacket over a short pleated
 * skirt, dark tights, heavy boots, a bag across the body.
 */
export function aikoSpec(): CharacterSpec {
  return {
    name: "aiko",
    height: 1.63,
    build: 0.32,
    skin: new Color3(0.82, 0.66, 0.56),
    hairColour: new Color3(0.045, 0.04, 0.05),
    eyeColour: new Color3(0.22, 0.62, 0.36),
    hairStyle: "long",
    face: true,
    simulatedHair: true,
    outfit: {
      style: "street",
      top: new Color3(0.16, 0.19, 0.22),
      bottom: new Color3(0.1, 0.11, 0.14),
      hose: new Color3(0.07, 0.07, 0.09),
      shoes: new Color3(0.09, 0.085, 0.09),
      accent: new Color3(0.78, 0.35, 0.28),
      skirt: true,
      bag: true,
    },
  };
}

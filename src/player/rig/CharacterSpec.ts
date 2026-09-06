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
  /**
   * Which piece of character art this person is, if any.
   *
   * Deliberately not the same field as `name`: `name` identifies an
   * individual — `cook.ramen_iroha`, `citizen7` — while this identifies a
   * model file, `characters/<model>.glb`, that any number of people may be
   * built from. Absent means "generated body", which is the normal case
   * until commissioned art exists.
   */
  model?: string;
  /** Metres, floor to crown. */
  height: number;
  /** 0 slight, 1 broad. Scales shoulder width and limb thickness. */
  build: number;
  skin: Color3;
  hairColour: Color3;
  eyeColour: Color3;
  /** Optional: the mouth. Defaults to a neutral lip. */
  lipColour?: Color3;
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
    model: "aiko",
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


/* ------------------------------------------------------------- the crowd */

/**
 * Skin, hair and eyes as ramps rather than as three buckets.
 *
 * The old crowd drew from three skin tones, three hair colours and six
 * coats, which at twenty-four people meant everybody had a twin. These are
 * bases that get jittered per person, so two people can be near each other
 * on the ramp and still not be the same.
 */
const SKIN: readonly [number, number, number][] = [
  [0.95, 0.82, 0.72], [0.90, 0.75, 0.64], [0.84, 0.68, 0.56],
  [0.76, 0.59, 0.47], [0.66, 0.49, 0.38], [0.55, 0.39, 0.29],
  [0.44, 0.30, 0.22], [0.33, 0.22, 0.16],
];
const HAIR: readonly [number, number, number][] = [
  [0.04, 0.035, 0.04], [0.07, 0.055, 0.05], [0.13, 0.09, 0.06],
  [0.20, 0.13, 0.08], [0.30, 0.17, 0.09], [0.44, 0.31, 0.15],
  [0.62, 0.50, 0.28], [0.50, 0.49, 0.48], [0.72, 0.71, 0.69],
  [0.28, 0.10, 0.10], [0.16, 0.13, 0.22],
];
const EYES: readonly [number, number, number][] = [
  [0.15, 0.09, 0.05], [0.25, 0.15, 0.07], [0.36, 0.26, 0.12],
  [0.45, 0.38, 0.16], [0.24, 0.44, 0.26], [0.30, 0.52, 0.34],
  [0.24, 0.42, 0.58], [0.38, 0.55, 0.66], [0.45, 0.48, 0.50],
];
const TOPS: readonly [number, number, number][] = [
  [0.10, 0.11, 0.13], [0.08, 0.11, 0.19], [0.34, 0.25, 0.17],
  [0.16, 0.19, 0.12], [0.62, 0.60, 0.55], [0.26, 0.10, 0.13],
  [0.78, 0.78, 0.79], [0.20, 0.34, 0.36], [0.55, 0.24, 0.16],
  [0.36, 0.20, 0.34], [0.13, 0.28, 0.20], [0.70, 0.56, 0.28],
  [0.86, 0.84, 0.78], [0.18, 0.20, 0.30],
];
const BOTTOMS: readonly [number, number, number][] = [
  [0.09, 0.09, 0.11], [0.15, 0.19, 0.26], [0.26, 0.26, 0.27],
  [0.20, 0.18, 0.15], [0.35, 0.31, 0.25], [0.11, 0.14, 0.18],
  [0.44, 0.42, 0.40], [0.24, 0.14, 0.13],
];
const SHOES: readonly [number, number, number][] = [
  [0.06, 0.06, 0.07], [0.82, 0.81, 0.78], [0.24, 0.15, 0.10],
  [0.13, 0.16, 0.24], [0.50, 0.48, 0.45], [0.42, 0.16, 0.14],
];
const ACCENTS: readonly [number, number, number][] = [
  [0.78, 0.35, 0.28], [0.85, 0.68, 0.22], [0.25, 0.45, 0.72],
  [0.30, 0.55, 0.35], [0.70, 0.70, 0.72], [0.62, 0.28, 0.48],
  [0.20, 0.20, 0.22], [0.88, 0.52, 0.20],
];
// Weighted by repetition rather than by a table: "cap" means no hair at all,
// and one bald head in five is a street of monks.
const HAIR_STYLES: readonly HairStyle[] = [
  "long", "long", "bob", "bob", "short", "short", "short", "tied", "tied", "cap",
];
const OUTFITS: readonly OutfitStyle[] = ["street", "office", "casual", "work", "school"];

/**
 * One person, unlike everybody else on the street.
 *
 * Every colour is jittered off its base, so the palette gives the range and
 * the jitter makes each person's exactly theirs — two people in navy coats
 * are wearing two different navies, which is what a street looks like.
 */
export function crowdSpec(random: () => number, index: number): CharacterSpec {
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)] ?? list[0]!;
  const shade = (base: readonly [number, number, number], spread: number): Color3 => {
    const j = () => 1 + (random() - 0.5) * spread;
    return new Color3(
      Math.min(1, Math.max(0.01, base[0] * j())),
      Math.min(1, Math.max(0.01, base[1] * j())),
      Math.min(1, Math.max(0.01, base[2] * j())),
    );
  };
  const style = pick(OUTFITS);
  // Adults, across the range people actually come in.
  const height = 1.52 + random() * 0.36;
  return {
    name: `citizen${index}`,
    height,
    build: random(),
    skin: shade(pick(SKIN), 0.1),
    hairColour: shade(pick(HAIR), 0.22),
    eyeColour: shade(pick(EYES), 0.24),
    lipColour: shade([0.55, 0.32, 0.31], 0.3),
    hairStyle: pick(HAIR_STYLES),
    face: true,
    simulatedHair: false,
    outfit: {
      style,
      top: shade(pick(TOPS), 0.16),
      bottom: shade(pick(BOTTOMS), 0.16),
      hose: shade(pick(BOTTOMS), 0.2),
      shoes: shade(pick(SHOES), 0.14),
      accent: shade(pick(ACCENTS), 0.18),
      skirt: random() < 0.34,
      bag: random() < 0.45,
    },
  };
}

/**
 * The body every crowd template is cut from.
 *
 * One metre tall so a person's height is a scale on the root, and every
 * optional garment switched on so the template set contains every part
 * anybody might need. Nobody is ever built from this spec directly.
 */
export function crowdReferenceSpec(hairStyle: HairStyle): CharacterSpec {
  return {
    name: `crowd.${hairStyle}`,
    height: 1,
    build: 0.5,
    skin: new Color3(1, 1, 1),
    hairColour: new Color3(1, 1, 1),
    eyeColour: new Color3(1, 1, 1),
    hairStyle,
    face: true,
    simulatedHair: false,
    outfit: {
      style: "street",
      top: new Color3(1, 1, 1),
      bottom: new Color3(1, 1, 1),
      hose: new Color3(1, 1, 1),
      shoes: new Color3(1, 1, 1),
      accent: new Color3(1, 1, 1),
      skirt: true,
      bag: true,
    },
  };
}

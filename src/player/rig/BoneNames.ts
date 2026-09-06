/**
 * Matching an arbitrary skeleton's bone names onto the joints this game drives.
 *
 * Everything that animates a character — the controller, the states, the
 * crowd — names joints: `thighL`, `elbowR`, `head`. A rigged model arrives
 * naming them something else, and which something else depends on who rigged
 * it. UniRig alone emits three conventions: Mixamo (`mixamorig:LeftArm`),
 * VRoid/VRM (`J_Bip_L_UpperArm`), and `bone_7` for anything it could not
 * identify.
 *
 * So this is the adapter, and it is deliberately free of Babylon: it takes
 * names and returns names, which is what makes it testable without a GPU, a
 * model, or a browser. `BoneBinding` does the part that needs a scene.
 *
 * ## The trap
 *
 * In both Mixamo and VRM, `Shoulder` is the **clavicle** and `UpperArm`/`Arm`
 * is the joint the upper arm actually rotates about. Our `shoulderL` is the
 * latter. Binding the name rather than the joint puts every arm animation on
 * the collarbone, and the arms barely move.
 */

import type { JointName } from "./HumanRig";

/** Which side of the body a bone is on. 0 for the ones down the middle. */
export type Side = -1 | 0 | 1;

export interface ParsedBone {
  /** The name as the model gave it. */
  name: string;
  side: Side;
  /** Lowercased, with the side markers and every separator taken out. */
  role: string;
}

/** Prefixes that say which rig exported this, and carry no anatomy. */
const RIG_PREFIXES = ["mixamorig:", "mixamorig", "j_bip_", "j_sec_", "j_adj_", "def-", "org-", "mch-"];

/**
 * Splits a bone name into a side and a role.
 *
 * Side markers are looked for as whole tokens — `_l_`, `.L`, `left`, a
 * trailing `L` — because a substring search finds the "l" in "clavicle" and
 * the "r" in "arm", and then every bone is on both sides at once.
 */
export function parseBone(name: string): ParsedBone {
  let text = name.toLowerCase();
  for (const prefix of RIG_PREFIXES) {
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length);
      break;
    }
  }
  const camelTail = /[a-z](L|R)$/.test(name);
  let side: Side = 0;
  if (/(^|[^a-z])left([^a-z]|$)/.test(text) || /^left/.test(text)) side = -1;
  else if (/(^|[^a-z])right([^a-z]|$)/.test(text) || /^right/.test(text)) side = 1;
  // A lone l or r, but only where separators make it a token of its own:
  // `J_Bip_L_Hand`, `upper_arm.L`. Without that guard the "l" in "leg" and
  // the "l" in "lowerarm" both read as a side, and the role loses its first
  // letter — which is exactly the bug this comment exists to prevent.
  else if (/(^|[_.\-: ])l([_.\-: ]|$)/.test(text)) side = -1;
  else if (/(^|[_.\-: ])r([_.\-: ]|$)/.test(text)) side = 1;
  else if (camelTail) side = name.endsWith("L") ? -1 : 1;

  let role = text
    .replace(/(^|[^a-z])(left|right)([^a-z]|$)/g, "$1$3")
    .replace(/^(left|right)/, "")
    .replace(/(^|[_.\-: ])[lr]([_.\-: ]|$)/g, "$1$2")
    .replace(/[_.\-: ]/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (camelTail) role = role.replace(/[lr]$/, "");
  return { name, side, role };
}

/**
 * What each joint is called elsewhere, best name first.
 *
 * An exact match on any pattern beats a partial match on a better one, which
 * is what separates Mixamo's `LeftLeg` (the shin) from its `LeftUpLeg` (the
 * thigh) without either needing to know about the other.
 */
const PATTERNS: Record<JointName, { want: readonly string[]; never?: readonly string[] }> = {
  hips: { want: ["hips", "hip", "pelvis"] },
  spine: { want: ["spine", "spine1", "spine01"], never: ["upper"] },
  chest: { want: ["upperchest", "chest", "spine2", "spine02", "spine3", "spine03"] },
  neck: { want: ["neck"] },
  head: { want: ["head"], never: ["top", "end"] },
  // Upper arm, not clavicle. See the note at the top of the file.
  shoulderL: { want: ["upperarm", "arm", "shoulder", "clavicle"], never: ["fore", "lower", "hand", "finger"] },
  shoulderR: { want: ["upperarm", "arm", "shoulder", "clavicle"], never: ["fore", "lower", "hand", "finger"] },
  elbowL: { want: ["lowerarm", "forearm", "elbow"], never: ["hand", "finger"] },
  elbowR: { want: ["lowerarm", "forearm", "elbow"], never: ["hand", "finger"] },
  wristL: { want: ["hand", "wrist"], never: ["finger", "thumb", "index", "middle", "ring", "little", "pinky"] },
  wristR: { want: ["hand", "wrist"], never: ["finger", "thumb", "index", "middle", "ring", "little", "pinky"] },
  thighL: { want: ["upperleg", "upleg", "thigh"] },
  thighR: { want: ["upperleg", "upleg", "thigh"] },
  kneeL: { want: ["lowerleg", "leg", "shin", "calf", "knee"], never: ["up", "toe"] },
  kneeR: { want: ["lowerleg", "leg", "shin", "calf", "knee"], never: ["up", "toe"] },
  ankleL: { want: ["foot", "ankle"], never: ["toe"] },
  ankleR: { want: ["foot", "ankle"], never: ["toe"] },
};

/** Which side each joint wants. */
function wantedSide(joint: JointName): Side {
  if (joint.endsWith("L")) return -1;
  if (joint.endsWith("R")) return 1;
  return 0;
}

export const JOINT_ORDER: readonly JointName[] = Object.keys(PATTERNS) as JointName[];

/**
 * Binds every joint it can to a bone, and says plainly which it could not.
 *
 * A bone is never used for two joints: the strongest match takes it, which
 * stops `chest` and `spine` both landing on the only spine bone a simple rig
 * has.
 */
export function matchJoints(names: readonly string[]): {
  joints: Record<JointName, string | null>;
  missing: JointName[];
} {
  const bones = names.map(parseBone);
  const taken = new Set<string>();
  const joints = {} as Record<JointName, string | null>;
  const missing: JointName[] = [];

  // Score everything first, then hand out bones best match first, so a strong
  // match later in the list is not beaten to its bone by a weak one earlier.
  const scored: { joint: JointName; bone: string; rank: number }[] = [];
  for (const joint of JOINT_ORDER) {
    const rule = PATTERNS[joint];
    const side = wantedSide(joint);
    for (const bone of bones) {
      if (bone.side !== side) continue;
      if (rule.never?.some((bad) => bone.role.includes(bad))) continue;
      const exact = rule.want.indexOf(bone.role);
      if (exact >= 0) {
        scored.push({ joint, bone: bone.name, rank: exact });
        continue;
      }
      const partial = rule.want.findIndex((want) => bone.role.includes(want));
      // Every partial match ranks below every exact one.
      if (partial >= 0) scored.push({ joint, bone: bone.name, rank: 100 + partial });
    }
  }
  scored.sort((a, b) => a.rank - b.rank);
  for (const entry of scored) {
    if (joints[entry.joint] || taken.has(entry.bone)) continue;
    joints[entry.joint] = entry.bone;
    taken.add(entry.bone);
  }
  for (const joint of JOINT_ORDER) {
    if (!joints[joint]) {
      joints[joint] = null;
      missing.push(joint);
    }
  }
  return { joints, missing };
}

/**
 * The adapter between a rigged model's bone names and the joints this game
 * drives, checked against the naming conventions UniRig actually emits.
 *
 * Pure name matching, so it runs in a second with no GPU, no model and no
 * browser — which is the whole reason it was written as name-to-name.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { matchJoints, parseBone } from "../src/player/rig/BoneNames.ts";

/** Mixamo, as UniRig writes it in configs/skeleton/mixamo.yaml. */
const MIXAMO = [
  "mixamorig:Hips", "mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2",
  "mixamorig:Neck", "mixamorig:Head",
  "mixamorig:LeftShoulder", "mixamorig:LeftArm", "mixamorig:LeftForeArm", "mixamorig:LeftHand",
  "mixamorig:RightShoulder", "mixamorig:RightArm", "mixamorig:RightForeArm", "mixamorig:RightHand",
  "mixamorig:LeftUpLeg", "mixamorig:LeftLeg", "mixamorig:LeftFoot", "mixamorig:LeftToeBase",
  "mixamorig:RightUpLeg", "mixamorig:RightLeg", "mixamorig:RightFoot", "mixamorig:RightToeBase",
];

/** VRoid / VRM, as UniRig writes it in configs/skeleton/vroid.yaml. */
const VROID = [
  "J_Bip_C_Hips", "J_Bip_C_Spine", "J_Bip_C_Chest", "J_Bip_C_UpperChest",
  "J_Bip_C_Neck", "J_Bip_C_Head",
  "J_Bip_L_Shoulder", "J_Bip_L_UpperArm", "J_Bip_L_LowerArm", "J_Bip_L_Hand",
  "J_Bip_R_Shoulder", "J_Bip_R_UpperArm", "J_Bip_R_LowerArm", "J_Bip_R_Hand",
  "J_Bip_L_UpperLeg", "J_Bip_L_LowerLeg", "J_Bip_L_Foot", "J_Bip_L_ToeBase",
  "J_Bip_R_UpperLeg", "J_Bip_R_LowerLeg", "J_Bip_R_Foot", "J_Bip_R_ToeBase",
];

/** Blender / Rigify style, which is what a hand-rigged model tends to use. */
const BLENDER = [
  "pelvis", "spine", "chest", "neck", "head",
  "upper_arm.L", "forearm.L", "hand.L",
  "upper_arm.R", "forearm.R", "hand.R",
  "thigh.L", "shin.L", "foot.L", "toe.L",
  "thigh.R", "shin.R", "foot.R", "toe.R",
];

const EVERY_JOINT = [
  "hips", "spine", "chest", "neck", "head",
  "shoulderL", "elbowL", "wristL", "shoulderR", "elbowR", "wristR",
  "thighL", "kneeL", "ankleL", "thighR", "kneeR", "ankleR",
];

test("a bone's side is read from whole tokens, not stray letters", () => {
  assert.equal(parseBone("mixamorig:LeftArm").side, -1);
  assert.equal(parseBone("mixamorig:RightArm").side, 1);
  assert.equal(parseBone("J_Bip_L_UpperArm").side, -1);
  assert.equal(parseBone("upper_arm.R").side, 1);
  assert.equal(parseBone("mixamorig:Hips").side, 0);
  // "clavicle" ends in an e but contains an l; "spine" contains no side.
  assert.equal(parseBone("spine").side, 0);
});

for (const [label, names] of [["mixamo", MIXAMO], ["vroid", VROID], ["blender", BLENDER]]) {
  test(`every joint binds against ${label}`, () => {
    const { joints, missing } = matchJoints(names);
    assert.deepEqual(missing, [], `unbound: ${missing.join(", ")}`);
    for (const joint of EVERY_JOINT) {
      assert.ok(joints[joint], `${joint} did not bind`);
    }
  });

  test(`no bone is bound to two joints against ${label}`, () => {
    const { joints } = matchJoints(names);
    const used = Object.values(joints).filter(Boolean);
    assert.equal(new Set(used).size, used.length, "a bone was bound twice");
  });
}

test("the arm binds to the upper arm, never to the clavicle", () => {
  // The trap: in both conventions "Shoulder" is the collarbone. Binding it
  // would put every arm animation on a joint that barely moves.
  assert.equal(matchJoints(MIXAMO).joints.shoulderL, "mixamorig:LeftArm");
  assert.equal(matchJoints(VROID).joints.shoulderL, "J_Bip_L_UpperArm");
  assert.equal(matchJoints(VROID).joints.shoulderR, "J_Bip_R_UpperArm");
});

test("the shin binds to the shin and the thigh to the thigh", () => {
  // Mixamo names them LeftUpLeg and LeftLeg: one is a prefix of the other.
  const { joints } = matchJoints(MIXAMO);
  assert.equal(joints.thighL, "mixamorig:LeftUpLeg");
  assert.equal(joints.kneeL, "mixamorig:LeftLeg");
});

test("the foot binds to the foot and not to the toe", () => {
  assert.equal(matchJoints(MIXAMO).joints.ankleL, "mixamorig:LeftFoot");
  assert.equal(matchJoints(VROID).joints.ankleR, "J_Bip_R_Foot");
});

test("the hand binds to the wrist and not to a finger", () => {
  const withFingers = [...VROID, "J_Bip_L_Index1", "J_Bip_L_Thumb1"];
  assert.equal(matchJoints(withFingers).joints.wristL, "J_Bip_L_Hand");
});

test("bones it cannot name are reported rather than guessed at", () => {
  // UniRig falls back to bone_N for anything it could not identify.
  const { joints, missing } = matchJoints(["bone_0", "bone_1", "bone_2"]);
  assert.equal(missing.length, 17, "every joint should be reported unbound");
  assert.equal(joints.hips, null);
});

test("a partial rig binds what it has and reports the rest", () => {
  const { joints, missing } = matchJoints(["Hips", "Spine", "Neck", "Head"]);
  assert.equal(joints.hips, "Hips");
  assert.equal(joints.head, "Head");
  assert.ok(missing.includes("thighL"), "a missing leg should be reported");
  assert.ok(!missing.includes("hips"));
});

/**
 * The contract between the rigging pipeline and the game.
 *
 * `rig-character.sh` produces a .glb; the game loads it and expects to find
 * bones it can name. Neither half can be exercised here — the pipeline needs
 * a GPU and the game needs a browser — but the thing that actually joins them
 * can be: a real glTF container, parsed the way the checker parses it, with
 * its joints matched the way the game matches them.
 *
 * So this builds a minimal rigged .glb in memory and runs the whole contract
 * over it. If a model ever fails to animate, this is where the fault will
 * either be caught or shown not to be.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readGltf, skeletonNames, report } from "../tools/check-rig.mjs";

const MIXAMO_BODY = [
  "mixamorig:Hips", "mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2",
  "mixamorig:Neck", "mixamorig:Head",
  "mixamorig:LeftShoulder", "mixamorig:LeftArm", "mixamorig:LeftForeArm", "mixamorig:LeftHand",
  "mixamorig:RightShoulder", "mixamorig:RightArm", "mixamorig:RightForeArm", "mixamorig:RightHand",
  "mixamorig:LeftUpLeg", "mixamorig:LeftLeg", "mixamorig:LeftFoot", "mixamorig:LeftToeBase",
  "mixamorig:RightUpLeg", "mixamorig:RightLeg", "mixamorig:RightFoot", "mixamorig:RightToeBase",
];

/** A glTF document with one skin over the given joint names. */
function gltfWithJoints(names) {
  return {
    asset: { version: "2.0", generator: "nagori test fixture" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: names.map((name, i) => ({ name, children: i + 1 < names.length ? [i + 1] : undefined })),
    skins: [{ joints: names.map((_, i) => i) }],
    meshes: [],
  };
}

/** Wraps a glTF document in a real .glb container, header, chunks and all. */
function packGlb(gltf) {
  const json = Buffer.from(JSON.stringify(gltf), "utf8");
  const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  // Derived from the string, not copied from the parser: a fixture that
  // repeats the implementation's constant cannot catch the implementation
  // getting it wrong, which is exactly what happened the first time.
  header.writeUInt32LE(Buffer.from("glTF", "ascii").readUInt32LE(0), 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + padded.length, 8);
  const chunk = Buffer.alloc(8);
  chunk.writeUInt32LE(padded.length, 0);
  chunk.writeUInt32LE(0x4e4f534a, 4);
  return Buffer.concat([header, chunk, padded]);
}

test("the container's magic is the real one, not a copy of the parser's", () => {
  // Guards the bug this file did not catch first time round.
  const glb = packGlb(gltfWithJoints(MIXAMO_BODY));
  assert.equal(glb.subarray(0, 4).toString("ascii"), "glTF");
});

test("a .glb container round-trips through the checker's parser", () => {
  const gltf = readGltf(packGlb(gltfWithJoints(MIXAMO_BODY)));
  assert.equal(gltf.asset.version, "2.0");
  assert.equal(gltf.nodes.length, MIXAMO_BODY.length);
});

test("a plain .gltf is read as readily as a .glb", () => {
  const source = gltfWithJoints(MIXAMO_BODY);
  const gltf = readGltf(Buffer.from(JSON.stringify(source), "utf8"));
  assert.equal(gltf.skins.length, 1);
});

test("joint names are read off the skin, not guessed from the node list", () => {
  const { names, skins } = skeletonNames(readGltf(packGlb(gltfWithJoints(MIXAMO_BODY))));
  assert.equal(skins, 1);
  assert.deepEqual(names, MIXAMO_BODY);
});

test("a rigged model built to the pipeline's output binds every joint", () => {
  const { missing, joints } = report(readGltf(packGlb(gltfWithJoints(MIXAMO_BODY))));
  assert.deepEqual(missing, [], `unbound: ${missing.join(", ")}`);
  assert.equal(joints.shoulderL, "mixamorig:LeftArm");
  assert.equal(joints.ankleR, "mixamorig:RightFoot");
});

test("a model with no skin is reported as carrying no skinning", () => {
  // The commonest way a model turns out not to be rigged: stage 1's skeleton
  // was merged instead of stage 2's skinning, so it has bones and no weights.
  const bare = gltfWithJoints(MIXAMO_BODY);
  delete bare.skins;
  const { skins, names } = skeletonNames(readGltf(packGlb(bare)));
  assert.equal(skins, 0);
  assert.deepEqual(names, []);
});

test("a model UniRig could not name is reported, not silently accepted", () => {
  const anonymous = ["bone_0", "bone_1", "bone_2", "bone_3"];
  const { missing } = report(readGltf(packGlb(gltfWithJoints(anonymous))));
  assert.equal(missing.length, 17);
});

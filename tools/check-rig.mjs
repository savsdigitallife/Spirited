/**
 * Does this rigged model carry the joints the game drives?
 *
 * Run at the end of `rig-character.sh`, and useful on its own for any model
 * somebody hands you:
 *
 *   node --experimental-strip-types tools/check-rig.mjs path/to/model.glb
 *
 * It reads the glTF's own skin definition rather than loading the file in a
 * browser, so it is fast, has no dependencies, and tells you the one thing
 * that decides whether a model will animate: whether every joint the
 * controller moves can be matched to a bone. `src/player/rig/BoneNames.ts`
 * is the matcher the game itself uses, so this cannot disagree with it.
 */

import { readFile } from "node:fs/promises";
import { matchJoints } from "../src/player/rig/BoneNames.ts";

const GLB_MAGIC = 0x46546c47;
const CHUNK_JSON = 0x4e4f534a;

/** Pulls the glTF JSON out of a .glb container, or parses a .gltf directly. */
export function readGltf(buffer) {
  if (buffer.length >= 12 && buffer.readUInt32LE(0) === GLB_MAGIC) {
    let offset = 12;
    while (offset + 8 <= buffer.length) {
      const length = buffer.readUInt32LE(offset);
      const type = buffer.readUInt32LE(offset + 4);
      const start = offset + 8;
      if (type === CHUNK_JSON) return JSON.parse(buffer.subarray(start, start + length).toString("utf8"));
      offset = start + length;
    }
    throw new Error("no JSON chunk in this .glb");
  }
  return JSON.parse(buffer.toString("utf8"));
}

/**
 * Every joint name in the file, in skin order.
 *
 * A glTF skin lists its joints as node indices; the names live on the nodes.
 * A file with no skin has no skinning, which is the commonest way a "rigged"
 * model turns out not to be one.
 */
export function skeletonNames(gltf) {
  const nodes = gltf.nodes ?? [];
  const skins = gltf.skins ?? [];
  const names = [];
  for (const skin of skins) {
    for (const index of skin.joints ?? []) {
      const name = nodes[index]?.name;
      if (name) names.push(name);
    }
  }
  return { names, skins: skins.length, nodes: nodes.length };
}

export function report(gltf) {
  const { names, skins } = skeletonNames(gltf);
  const { joints, missing } = matchJoints(names);
  return { names, skins, joints, missing };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: node --experimental-strip-types tools/check-rig.mjs <model.glb>");
    process.exit(2);
  }
  const gltf = readGltf(await readFile(path));
  const { names, skins, joints, missing } = report(gltf);

  if (skins === 0) {
    console.error(`FAIL  ${path} has no skin: it carries no skinning weights, so it will not deform.`);
    console.error("      Merge the skinning result, not the bare skeleton (stage 2 output, not stage 1).");
    process.exit(1);
  }
  console.log(`${names.length} bones across ${skins} skin(s).`);
  for (const [joint, bone] of Object.entries(joints)) {
    console.log(`  ${bone ? "ok  " : "MISS"}  ${joint.padEnd(10)} ${bone ?? "—"}`);
  }
  if (missing.length > 0) {
    console.error(`\nFAIL  ${missing.length} joint(s) unbound: ${missing.join(", ")}`);
    console.error("      The game falls back to the generated body when the essential ones are missing.");
    console.error("      Rename the bones, or add the convention to src/player/rig/BoneNames.ts.");
    process.exit(1);
  }
  console.log("\nOK    every joint the animation drives is bound.");
}

/**
 * What survives the FBX → glTF conversion.
 *
 * `fbx-to-glb.py` is the front door for character art, and two things it
 * carries are easy to lose and easy not to notice losing: the **skinning**,
 * without which a model loads and then stands there; and the **textures**,
 * without which it is flat colour — which looks exactly like art that never
 * had a skin in the first place, and is the reason this exists.
 *
 * Blender is a 300 MB optional dependency, so these skip where it is absent
 * rather than failing. Where it is present, the conversion is run end to end
 * on a character built from nothing (`fixtures/textured-character.py`) and
 * the output is read the way the game reads it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Is Blender-as-a-module installed? */
function hasBlender() {
  try {
    execFileSync("python3", ["-c", "import bpy"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** The JSON chunk of a .glb, which is where everything below is asserted. */
function glbJson(path) {
  const buf = readFileSync(path);
  assert.equal(buf.readUInt32LE(0), Buffer.from("glTF", "ascii").readUInt32LE(0), "not a glb");
  let offset = 12;
  while (offset < buf.length) {
    const length = buf.readUInt32LE(offset);
    if (buf.subarray(offset + 4, offset + 8).toString("ascii") === "JSON") {
      return JSON.parse(buf.subarray(offset + 8, offset + 8 + length).toString("utf8"));
    }
    offset += 8 + length;
  }
  throw new Error("no JSON chunk");
}

const skip = hasBlender() ? false : "Blender (bpy) is not installed";
let converted = null;

/** Converts the fixture once, and hands the same result to every test. */
function convert() {
  if (converted) return converted;
  const dir = mkdtempSync(join(tmpdir(), "nagori-fbx-"));
  const fbx = join(dir, "character.fbx");
  const glb = join(dir, "character.glb");
  execFileSync("python3", ["tests/fixtures/textured-character.py", "--", fbx], { stdio: "ignore" });
  const log = execFileSync("python3", ["tools/fbx-to-glb.py", fbx, glb, "--height", "1.7"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  converted = { doc: glbJson(glb), log, dir };
  return converted;
}

test("a converted model keeps its skinning", { skip }, () => {
  const { doc } = convert();
  assert.equal(doc.skins?.length, 1, "no skin: the model would load and never deform");
  const attributes = doc.meshes[0].primitives[0].attributes;
  assert.ok("JOINTS_0" in attributes, "no joint indices");
  assert.ok("WEIGHTS_0" in attributes, "no vertex weights");
});

test("a converted model keeps its textures", { skip }, () => {
  const { doc } = convert();
  assert.ok((doc.images?.length ?? 0) >= 1, "the texture was dropped in conversion");
  assert.ok((doc.textures?.length ?? 0) >= 1, "no texture references the image");
  // Embedded in the binary chunk, not left as a path beside the file: the
  // game loads one .glb over HTTP and nothing else.
  assert.ok(doc.images[0].bufferView !== undefined, "the image is a path, not embedded");
  assert.ok(
    doc.materials.some((m) => m.pbrMetallicRoughness?.baseColorTexture),
    "no material uses the texture, so the skin would never be seen",
  );
  assert.ok("TEXCOORD_0" in doc.meshes[0].primitives[0].attributes, "no UVs to map it with");
});

test("the conversion reports what it carried", { skip }, () => {
  const { log } = convert();
  assert.match(log, /1 texture image\(s\)/, "the count of textures is not reported");
  assert.match(log, /1 skin\(s\)/, "the count of skins is not reported");
});

test("--height is a measurement, not a guess", { skip }, () => {
  const { log } = convert();
  assert.match(log, /1\.700 m tall/, "the model was not scaled to the height asked for");
  assert.match(log, /feet are on y = 0/, "the model was not dropped to the floor");
});

test("everything is cleaned up", { skip }, () => {
  if (converted) rmSync(converted.dir, { recursive: true, force: true });
});

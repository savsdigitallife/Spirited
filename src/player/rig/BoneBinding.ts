/**
 * Driving a rigged model's skeleton with the joints this game already animates.
 *
 * `Character` promised this seam from the beginning: when a rigged glTF
 * exists, load it instead of building a body out of primitives, bind the same
 * joint names, and nothing else changes — not the controller, not the
 * animation states, not the scenes that place characters. This is that bind.
 *
 * ## Rotations compose onto the rest pose, they do not replace it
 *
 * The controller writes absolute angles: `thighL.rotation.x = 0.4` means "the
 * thigh is swung forward 0.4 radians", measured from standing. A bone in a
 * loaded model already has a rest rotation — the pose it was skinned in —
 * and writing 0.4 straight onto it throws that away, which collapses the
 * model into whatever attitude the raw numbers describe. So each joint gets a
 * plain node the controller writes to, and every frame the bone is set to its
 * own rest rotation *times* what the controller asked for.
 *
 * That is the whole of retargeting at this level, and it is why the proxy
 * nodes exist rather than the controller writing to bones directly.
 */

import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Space } from "@babylonjs/core/Maths/math.axis";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Bone } from "@babylonjs/core/Bones/bone";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import type { Scene } from "@babylonjs/core/scene";
import type { HumanRig, JointName } from "./HumanRig";
import { JOINT_ORDER, matchJoints } from "./BoneNames";

/** The joints without which an animation would not read as a walk. */
const ESSENTIAL: readonly JointName[] = [
  "hips", "head", "shoulderL", "shoulderR", "thighL", "thighR", "kneeL", "kneeR",
];

export interface BoundRig extends HumanRig {
  /** Pushes this frame's joint angles onto the model's bones. */
  sync(): void;
  /** Which joints found no bone. Empty when the model is fully bound. */
  readonly unbound: readonly JointName[];
}

/**
 * Binds a loaded skeleton to the joint names the game drives.
 *
 * Returns null when the model is missing joints an animation needs, so the
 * caller can fall back to the generated body rather than showing a character
 * that cannot walk. Nothing here guesses: a bone is bound because its name
 * says what it is (see `BoneNames`), or it is reported unbound.
 */
export function bindLoadedRig(
  scene: Scene,
  root: TransformNode,
  meshes: readonly AbstractMesh[],
  skeleton: Skeleton,
  name: string,
  height: number,
): BoundRig | null {
  const { joints: byName, missing } = matchJoints(skeleton.bones.map((bone) => bone.name));
  const short = ESSENTIAL.filter((joint) => missing.includes(joint));
  if (short.length > 0) {
    console.warn(
      `[rig] "${name}" is missing ${short.join(", ")}; falling back to the generated body. ` +
        `Bones offered: ${skeleton.bones.map((b) => b.name).join(", ")}`,
    );
    return null;
  }

  interface Bound {
    bone: Bone;
    proxy: TransformNode;
    rest: Quaternion;
  }
  const bound: Bound[] = [];
  const joints = {} as Record<JointName, TransformNode>;

  for (const joint of JOINT_ORDER) {
    const boneName = byName[joint];
    const proxy = new TransformNode(`${name}.${joint}`, scene);
    joints[joint] = proxy;
    if (!boneName) continue;
    const bone = skeleton.bones.find((b) => b.name === boneName);
    if (!bone) continue;
    // The rest rotation, taken off the bind pose rather than off the bone's
    // current transform, which may already have been posed by an animation
    // that shipped inside the file.
    const rest = new Quaternion();
    bone.getRestMatrix().decompose(undefined, rest, undefined);
    bound.push({ bone, proxy, rest });
  }

  const scratch = new Quaternion();
  const asked = new Quaternion();
  const rig: BoundRig = {
    root,
    joints,
    meshes,
    // Where hair hangs from. Without a named bone for it, the head will do.
    napeAnchor: joints.head,
    height,
    hipHeight: height * 0.53,
    unbound: missing,
    sync(): void {
      for (const entry of bound) {
        Quaternion.RotationYawPitchRollToRef(
          entry.proxy.rotation.y,
          entry.proxy.rotation.x,
          entry.proxy.rotation.z,
          asked,
        );
        entry.rest.multiplyToRef(asked, scratch);
        entry.bone.setRotationQuaternion(scratch, Space.LOCAL);
      }
    },
    setVisible(visible: boolean): void {
      for (const mesh of meshes) mesh.isVisible = visible;
    },
    dispose(): void {
      root.dispose(false, true);
    },
  };
  return rig;
}

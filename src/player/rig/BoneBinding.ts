/**
 * Driving a rigged model's skeleton with the joints this game already animates.
 *
 * `Character` promised this seam from the beginning: when a rigged glTF
 * exists, load it instead of building a body out of primitives, bind the same
 * joint names, and nothing else changes — not the controller, not the
 * animation states, not the scenes that place characters. This is that bind.
 *
 * ## Drive the nodes, not the bones
 *
 * A glTF's skin arrives as a hierarchy of transform nodes with a `Bone`
 * linked to each, and Babylon derives every bone's matrix *from its node*
 * once that link exists. Setting a rotation on the bone is therefore
 * discarded on the next frame, silently: the skeleton is correct, the mesh is
 * skinned to it, and nothing moves. So the nodes are what get written.
 *
 * ## The angles mean nothing without a pose to measure them from
 *
 * The controller writes absolute angles: `thighL.rotation.x = 0.4` means "the
 * thigh is swung forward 0.4 radians" — measured from *our* rest, in which
 * every limb hangs straight down. A model does not share that rest. Mixamo
 * ships characters in a T-pose, so composing our angles onto the bind pose
 * leaves the arms out sideways and the walk happening off to the side of the
 * body. So each bone is first turned to point the way our rig rests it, and
 * that straightened pose — the *correction* — is what the angles compose onto.
 *
 * ## A loaded model lives in a mirror, and its axes are its own
 *
 * glTF is right-handed and Babylon is left-handed, so Babylon's loader wraps
 * every model in a `__root__` node scaled `(1, 1, -1)`. That one reflection
 * runs through the entire skeleton, and it makes `Matrix.decompose` useless
 * here: a mirrored matrix is not a rotation and a scale, so the rotation it
 * returns is not the joint's orientation. Nothing below decomposes anything —
 * directions are pushed through matrices with `TransformNormal`, which is
 * exact whatever the determinant.
 *
 * That is only half of it. Even straightened, a joint's own axes are not the
 * character's: the reflection is in them, and so is whatever roll the rigger
 * left the bone with. So each joint's frame is *measured* once — the
 * character-space directions its local x, y and z actually point — and the
 * controller's angle `A` is conjugated through it:
 *
 *     local = frame × A × frame⁻¹ × correction
 *
 * which is that joint's own way of saying "turn by `A` in the character's
 * axes". Measuring the frame instead of reasoning about it is the whole
 * trick: it costs three `TransformNormal`s at bind time and removes every
 * handedness and roll convention from the problem at once.
 *
 * One convention still has to be right, and it is not the obvious one:
 * `Matrix.multiply` composes left to right, and `Quaternion.multiply`
 * composes the other way round. Everything here that composes rotations is
 * matrices, for that reason.
 */

import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import type { Scene } from "@babylonjs/core/scene";
import type { HumanRig, JointName } from "./HumanRig";
import { JOINT_ORDER, matchJoints } from "./BoneNames";

/** The joints without which an animation would not read as a walk. */
const ESSENTIAL: readonly JointName[] = [
  "hips", "head", "shoulderL", "shoulderR", "thighL", "thighR", "kneeL", "kneeR",
];

export interface BoundRig extends HumanRig {
  /** Pushes this frame's joint angles onto the model's skeleton. */
  sync(): void;
  /** Which joints found no bone. Empty when the model is fully bound. */
  readonly unbound: readonly JointName[];
  /** The model's own head bone, for anything that has to sit on the skull. */
  readonly skull: TransformNode | null;
}

/** Where our rig rests each bone pointing. */
const DOWN = new Vector3(0, -1, 0);
const UP = new Vector3(0, 1, 0);

/**
 * Each joint, the joint below it, and the way our rig rests the bone between
 * them. Parents come before children: straightening a shoulder carries the
 * elbow with it, so the elbow is measured after its shoulder is dealt with.
 *
 * `hips` is absent deliberately — it is the root, turning it turns the whole
 * body, and there is no one bone below it to straighten against.
 *
 * `head` has no bound joint below it, so its own first bone is used: Mixamo
 * calls that `HeadTop_End`, and whatever a rig calls it, it points the way
 * the skull does.
 */
const CHAIN: readonly (readonly [JointName, JointName | null, Vector3])[] = [
  ["spine", "chest", UP], ["chest", "neck", UP], ["neck", "head", UP], ["head", null, UP],
  ["shoulderL", "elbowL", DOWN], ["elbowL", "wristL", DOWN],
  ["shoulderR", "elbowR", DOWN], ["elbowR", "wristR", DOWN],
  ["thighL", "kneeL", DOWN], ["kneeL", "ankleL", DOWN],
  ["thighR", "kneeR", DOWN], ["kneeR", "ankleR", DOWN],
];

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
    node: TransformNode;
    proxy: TransformNode;
    /** This joint's local axes, as directions in the character's own space. */
    frame: Matrix;
    /** `frame⁻¹ × correction`, the fixed tail of every frame's composition. */
    tail: Matrix;
  }
  const joints = {} as Record<JointName, TransformNode>;
  const nodes = new Map<JointName, TransformNode>();

  for (const joint of JOINT_ORDER) {
    joints[joint] = new TransformNode(`${name}.${joint}`, scene);
    const boneName = byName[joint];
    const bone = boneName ? skeleton.bones.find((b) => b.name === boneName) : undefined;
    if (!bone) continue;
    const node = bone.getTransformNode();
    if (!node) continue;
    node.rotationQuaternion ??= Quaternion.FromEulerVector(node.rotation);
    nodes.set(joint, node);
  }

  // ------------------------------------------------------- straightening up
  const parentInv = new Matrix();
  const dir = new Vector3();
  const goal = new Vector3();
  const extra = new Quaternion();
  /** How far each bone ended up from where it was asked to point. */
  const residual: string[] = [];

  /**
   * Turns a joint until a direction of its own points where it should.
   *
   * Both vectors arrive in world terms and are pushed into the parent's space
   * through the same matrix, so the reflection in that matrix cancels: the
   * turn taking one onto the other there is a true rotation, and it lives in
   * the space the joint's own rotation lives in, which is what makes it
   * composable without decomposing anything.
   */
  const align = (node: TransformNode, worldDir: Vector3, worldTarget: Vector3): void => {
    const parent = node.parent as TransformNode | null;
    if (parent) {
      parent.computeWorldMatrix(true);
      parent.getWorldMatrix().invertToRef(parentInv);
    } else {
      Matrix.IdentityToRef(parentInv);
    }
    Vector3.TransformNormalToRef(worldDir, parentInv, dir);
    Vector3.TransformNormalToRef(worldTarget, parentInv, goal);
    if (dir.lengthSquared() < 1e-12 || goal.lengthSquared() < 1e-12) return;
    Quaternion.FromUnitVectorsToRef(dir.normalize(), goal.normalize(), extra);
    // The turn happens after the joint's own rotation, and
    // `Quaternion.multiply` applies its argument first.
    node.rotationQuaternion = extra.multiply(node.rotationQuaternion!);
    node.computeWorldMatrix(true);
  };

  /** The bone below a joint, as a direction in world space. */
  const boneBelow = (node: TransformNode, below: TransformNode): Vector3 => {
    node.computeWorldMatrix(true);
    below.computeWorldMatrix(true);
    return below.getAbsolutePosition().subtract(node.getAbsolutePosition());
  };

  for (const [joint, childJoint, axis] of CHAIN) {
    const node = nodes.get(joint);
    if (!node) continue;
    const below = childJoint ? nodes.get(childJoint) : node.getChildTransformNodes(true)[0];
    if (!below) continue;

    const bone = boneBelow(node, below);
    if (bone.lengthSquared() < 1e-8) continue;
    align(node, bone.normalize(), axis);

    // Check it landed. Silence here is the only evidence the straightening
    // worked on this file; a mangled model says nothing on its own.
    const landed = boneBelow(node, below);
    if (landed.lengthSquared() < 1e-8) continue;
    const off =
      Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(landed.normalize(), axis)))) * (180 / Math.PI);
    if (off > 5) residual.push(`${joint} ${off.toFixed(0)}°`);
  }
  if (residual.length > 0) {
    console.warn(
      `[rig] "${name}" did not straighten: ${residual.join(", ")} from where our rig rests them. ` +
        `Its limbs will not swing the way the animation means them to.`,
    );
  }

  // --------------------------------------------------- measuring the frames
  //
  // Now that every bone points our way, each joint's axes are read off in the
  // character's own space. `root` is what the game yaws when she turns, so a
  // frame measured against it stays true whichever way she faces.
  root.computeWorldMatrix(true);
  const rootInv = new Matrix();
  root.getWorldMatrix().invertToRef(rootInv);

  const axis = new Vector3();
  const frameOf = (node: TransformNode): Matrix => {
    node.computeWorldMatrix(true);
    const toRoot = node.getWorldMatrix().multiply(rootInv);
    const frame = Matrix.Identity();
    for (let row = 0; row < 3; row++) {
      axis.copyFromFloats(row === 0 ? 1 : 0, row === 1 ? 1 : 0, row === 2 ? 1 : 0);
      Vector3.TransformNormalToRef(axis, toRoot, dir);
      dir.normalize();
      frame.setRowFromFloats(row, dir.x, dir.y, dir.z, 0);
    }
    return frame;
  };

  const bound: Bound[] = [];
  const rotation = new Matrix();
  for (const [joint, node] of nodes) {
    const frame = frameOf(node);
    node.rotationQuaternion!.toRotationMatrix(rotation);
    // A frame is orthogonal — with a reflection in it, but orthogonal — so
    // its inverse is its transpose, and no `invert` is needed or wanted.
    bound.push({
      node,
      proxy: joints[joint],
      frame,
      tail: Matrix.Transpose(frame).multiply(rotation.clone()),
    });
  }

  // ------------------------------------------------------- where hair hangs
  //
  // Her hair is simulated rather than modelled, so it needs a point on the
  // skull to hang from. A generated body has one; a model has only bones, so
  // it is placed above and behind the head joint — which on every rig this
  // matcher knows sits at the base of the skull rather than in the middle of
  // it. Without this the anchor is a node at the origin and her hair streams
  // across the map from the middle of the road.
  //
  // `setParent` rather than assigning `parent`: the skeleton carries whatever
  // unit the exporter used and the loader's reflection on top of it, and
  // `setParent` works a world placement back through both instead of asking
  // this code to know either.
  const nape = new TransformNode(`${name}.nape`, scene);
  const skull = nodes.get("head");
  if (skull) {
    skull.computeWorldMatrix(true);
    // Behind her, in world terms. A character faces +z in her root's space —
    // the convention `Character.back` is written in — and the root is what
    // the game turns, so this stays true whichever way she is facing.
    const behind = new Vector3();
    Vector3.TransformNormalToRef(new Vector3(0, 0, -1), root.getWorldMatrix(), behind);
    nape.position
      .copyFrom(skull.getAbsolutePosition())
      .addInPlace(behind.normalize().scale(height * 0.045));
    nape.position.y += height * 0.06;
    nape.setParent(skull);
  }

  const asked = new Quaternion();
  const turn = new Matrix();
  const composed = new Matrix();
  const local = new Matrix();
  const rig: BoundRig = {
    root,
    joints,
    meshes,
    // Where hair hangs from. Without a head bone there is nowhere to put it,
    // and the proxy at least moves with the animation.
    napeAnchor: skull ? nape : joints.head,
    height,
    hipHeight: height * 0.53,
    unbound: missing,
    skull: skull ?? null,
    sync(): void {
      for (const entry of bound) {
        Quaternion.RotationYawPitchRollToRef(
          entry.proxy.rotation.y,
          entry.proxy.rotation.x,
          entry.proxy.rotation.z,
          asked,
        );
        asked.toRotationMatrix(turn);
        entry.frame.multiplyToRef(turn, composed);
        composed.multiplyToRef(entry.tail, local);
        Quaternion.FromRotationMatrixToRef(local, entry.node.rotationQuaternion!);
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

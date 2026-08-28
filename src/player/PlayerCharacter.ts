/**
 * The player's body: a placeholder rig built from primitives, animated
 * procedurally.
 *
 * It is jointed the way a skinned character is — pelvis, spine, head, two
 * arms, two legs — and driven through one `pose()` call that takes a
 * locomotion state rather than a set of angles. When a rigged glTF replaces
 * this, the mesh and the joint rotations change; the interface the
 * controller talks to does not.
 *
 * The design follows the bible: Sae is thirty, dressed for outdoor work in a
 * long dark-green coat over an ochre scarf, with her hair tied back.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

export interface LocomotionState {
  /** Metres per second along the ground. */
  speed: number;
  /** Speed at which the run cycle is fully in. */
  runSpeed: number;
  grounded: boolean;
  /** Positive while rising, negative while falling. */
  verticalSpeed: number;
  /** Radians per second the body is turning; drives the lean. */
  turnRate: number;
}

/** Metres travelled per full two-step cycle, used to time the stride. */
const STRIDE = 1.55;

function material(
  scene: Scene,
  name: string,
  colour: [number, number, number],
  roughness: number,
  metallic = 0,
): PBRMaterial {
  const m = new PBRMaterial(`sae.${name}`, scene);
  m.albedoColor = new Color3(...colour);
  m.roughness = roughness;
  m.metallic = metallic;
  m.specularIntensity = 0.35;
  return m;
}

export class PlayerCharacter {
  /** Move and rotate this; everything else hangs off it. */
  readonly root: TransformNode;
  readonly height = 1.66;

  private readonly parts: Mesh[] = [];
  private readonly hips: TransformNode;
  private readonly spine: TransformNode;
  private readonly head: TransformNode;
  private readonly armL: TransformNode;
  private readonly armR: TransformNode;
  private readonly forearmL: TransformNode;
  private readonly forearmR: TransformNode;
  private readonly legL: TransformNode;
  private readonly legR: TransformNode;
  private readonly shinL: TransformNode;
  private readonly shinR: TransformNode;

  /** Cycle position in radians; the controller reads it to time footsteps. */
  private phase = 0;
  private lean = 0;
  private bob = 0;

  constructor(scene: Scene, name = "sae") {
    const coat = material(scene, "coat", [0.13, 0.2, 0.16], 0.85);
    const scarf = material(scene, "scarf", [0.72, 0.44, 0.16], 0.9);
    const trousers = material(scene, "trousers", [0.16, 0.16, 0.19], 0.9);
    const boots = material(scene, "boots", [0.09, 0.08, 0.08], 0.6);
    const skin = material(scene, "skin", [0.79, 0.63, 0.53], 0.65);
    const hair = material(scene, "hair", [0.08, 0.07, 0.08], 0.45);

    this.root = new TransformNode(name, scene);

    const joint = (id: string, parent: TransformNode, at: Vector3): TransformNode => {
      const node = new TransformNode(`${name}.${id}`, scene);
      node.parent = parent;
      node.position = at;
      return node;
    };
    const attach = (
      id: string,
      parent: TransformNode,
      mesh: Mesh,
      at: Vector3,
      mat: PBRMaterial,
    ): Mesh => {
      mesh.name = `${name}.${id}`;
      mesh.parent = parent;
      mesh.position = at;
      mesh.material = mat;
      mesh.receiveShadows = true;
      mesh.isPickable = false;
      this.parts.push(mesh);
      return mesh;
    };

    // Hips sit at the pelvis, not the floor, so leg rotation pivots correctly.
    this.hips = joint("hips", this.root, new Vector3(0, 0.9, 0));
    this.spine = joint("spine", this.hips, new Vector3(0, 0.06, 0));

    attach(
      "pelvis",
      this.hips,
      CreateBox("", { width: 0.3, height: 0.2, depth: 0.2 }, scene),
      new Vector3(0, -0.02, 0),
      trousers,
    );
    attach(
      "torso",
      this.spine,
      CreateCapsule("", { radius: 0.16, height: 0.62, tessellation: 12 }, scene),
      new Vector3(0, 0.24, 0),
      coat,
    );
    // The coat skirt: a slight cone so it reads as fabric, not a barrel.
    attach(
      "coatSkirt",
      this.spine,
      CreateCylinder(
        "",
        { diameterTop: 0.36, diameterBottom: 0.46, height: 0.42, tessellation: 14 },
        scene,
      ),
      new Vector3(0, -0.14, 0),
      coat,
    );
    attach(
      "scarf",
      this.spine,
      CreateCylinder("", { diameter: 0.2, height: 0.1, tessellation: 12 }, scene),
      new Vector3(0, 0.52, 0),
      scarf,
    );
    attach(
      "scarfTail",
      this.spine,
      CreateBox("", { width: 0.1, height: 0.3, depth: 0.04 }, scene),
      new Vector3(0.06, 0.36, -0.14),
      scarf,
    );

    this.head = joint("head", this.spine, new Vector3(0, 0.62, 0));
    attach(
      "neck",
      this.spine,
      CreateCylinder("", { diameter: 0.09, height: 0.08, tessellation: 10 }, scene),
      new Vector3(0, 0.57, 0),
      skin,
    );
    const skull = attach(
      "skull",
      this.head,
      CreateSphere("", { diameter: 0.21, segments: 12 }, scene),
      new Vector3(0, 0.1, 0),
      skin,
    );
    skull.scaling = new Vector3(0.92, 1.1, 1);
    const crown = attach(
      "hair",
      this.head,
      CreateSphere("", { diameter: 0.225, segments: 12 }, scene),
      new Vector3(0, 0.115, -0.008),
      hair,
    );
    crown.scaling = new Vector3(0.96, 1.06, 1.02);
    // A long tail down the back — long hair was a specific ask, and it also
    // gives the silhouette something to read against the neon.
    attach(
      "ponytail",
      this.head,
      CreateCapsule("", { radius: 0.045, height: 0.44, tessellation: 8 }, scene),
      new Vector3(0, -0.09, -0.115),
      hair,
    );

    const arm = (side: 1 | -1, id: string) => {
      const shoulder = joint(`${id}Shoulder`, this.spine, new Vector3(side * 0.19, 0.46, 0));
      attach(
        `${id}Upper`,
        shoulder,
        CreateCapsule("", { radius: 0.058, height: 0.3, tessellation: 8 }, scene),
        new Vector3(0, -0.15, 0),
        coat,
      );
      const elbow = joint(`${id}Elbow`, shoulder, new Vector3(0, -0.3, 0));
      attach(
        `${id}Fore`,
        elbow,
        CreateCapsule("", { radius: 0.05, height: 0.28, tessellation: 8 }, scene),
        new Vector3(0, -0.14, 0),
        coat,
      );
      attach(
        `${id}Hand`,
        elbow,
        CreateSphere("", { diameter: 0.085, segments: 8 }, scene),
        new Vector3(0, -0.3, 0),
        skin,
      );
      return { shoulder, elbow };
    };
    const left = arm(-1, "armL");
    const right = arm(1, "armR");
    this.armL = left.shoulder;
    this.forearmL = left.elbow;
    this.armR = right.shoulder;
    this.forearmR = right.elbow;

    const leg = (side: 1 | -1, id: string) => {
      const hip = joint(`${id}Hip`, this.hips, new Vector3(side * 0.1, -0.06, 0));
      attach(
        `${id}Thigh`,
        hip,
        CreateCapsule("", { radius: 0.075, height: 0.4, tessellation: 8 }, scene),
        new Vector3(0, -0.2, 0),
        trousers,
      );
      const knee = joint(`${id}Knee`, hip, new Vector3(0, -0.4, 0));
      attach(
        `${id}Shin`,
        knee,
        CreateCapsule("", { radius: 0.062, height: 0.38, tessellation: 8 }, scene),
        new Vector3(0, -0.19, 0),
        trousers,
      );
      attach(
        `${id}Boot`,
        knee,
        CreateBox("", { width: 0.11, height: 0.1, depth: 0.24 }, scene),
        new Vector3(0, -0.38, 0.04),
        boots,
      );
      return { hip, knee };
    };
    const legLeft = leg(-1, "legL");
    const legRight = leg(1, "legR");
    this.legL = legLeft.hip;
    this.shinL = legLeft.knee;
    this.legR = legRight.hip;
    this.shinR = legRight.knee;
  }

  /** Every mesh in the rig, for registering shadow casters. */
  get meshes(): readonly Mesh[] {
    return this.parts;
  }

  /** 0..2π. Crosses π and 2π on footfalls. */
  get cyclePhase(): number {
    return this.phase;
  }

  setVisible(visible: boolean): void {
    for (const part of this.parts) part.isVisible = visible;
  }

  /**
   * Advances the animation. Returns true on the frames where a foot lands,
   * so the caller can play a step without duplicating the timing.
   */
  pose(state: LocomotionState, dt: number): boolean {
    const speed = state.speed;
    const moving = speed > 0.05;
    const runBlend = Math.min(1, speed / Math.max(0.001, state.runSpeed));

    const before = this.phase;
    if (moving && state.grounded) {
      this.phase = (this.phase + (speed / STRIDE) * Math.PI * 2 * dt) % (Math.PI * 2);
    } else if (!moving) {
      // Ease back to a neutral stance rather than freezing mid-stride.
      this.phase += (0 - Math.sin(this.phase)) * Math.min(1, dt * 6) * 0.4;
    }
    // A footfall is when the cycle passes 0 or π.
    const footfall =
      moving &&
      state.grounded &&
      (Math.floor(before / Math.PI) !== Math.floor(this.phase / Math.PI) ||
        this.phase < before);

    const swing = Math.sin(this.phase);
    const counter = Math.sin(this.phase + Math.PI);
    const amplitude = moving ? 0.34 + runBlend * 0.42 : 0;
    const idle = Math.sin(performance.now() / 900) * 0.012;

    if (state.grounded) {
      this.legL.rotation.x = swing * amplitude;
      this.legR.rotation.x = counter * amplitude;
      // Knees only bend backwards, and only on the trailing half of the step.
      this.shinL.rotation.x = Math.max(0, -swing) * amplitude * 1.5;
      this.shinR.rotation.x = Math.max(0, -counter) * amplitude * 1.5;
      this.armL.rotation.x = counter * amplitude * 0.75;
      this.armR.rotation.x = swing * amplitude * 0.75;
    } else {
      // Airborne: tuck, then reach for the ground as the fall develops.
      const rising = Math.max(0, Math.min(1, state.verticalSpeed / 4));
      const falling = Math.max(0, Math.min(1, -state.verticalSpeed / 6));
      this.legL.rotation.x = -0.9 * rising + 0.25 * falling;
      this.legR.rotation.x = -0.5 * rising + 0.4 * falling;
      this.shinL.rotation.x = 1.3 * rising + 0.2 * falling;
      this.shinR.rotation.x = 0.9 * rising + 0.1 * falling;
      this.armL.rotation.x = -0.7 - falling * 0.5;
      this.armR.rotation.x = -0.7 - falling * 0.5;
    }
    this.forearmL.rotation.x = -0.25 - Math.max(0, this.armL.rotation.x) * 0.6;
    this.forearmR.rotation.x = -0.25 - Math.max(0, this.armR.rotation.x) * 0.6;

    // Lean into turns and into acceleration; both settle back when still.
    const targetLean = Math.max(-0.3, Math.min(0.3, -state.turnRate * 0.12));
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 6);
    this.spine.rotation.z = this.lean;
    this.spine.rotation.x = runBlend * 0.16;

    // A two-per-step vertical bob is what sells weight.
    const targetBob = moving && state.grounded ? Math.abs(Math.cos(this.phase)) * 0.035 * runBlend : 0;
    this.bob += (targetBob - this.bob) * Math.min(1, dt * 12);
    this.hips.position.y = 0.9 + this.bob + idle;
    this.head.rotation.x = -runBlend * 0.1;

    return footfall;
  }

  dispose(): void {
    this.root.dispose(false, true);
  }
}

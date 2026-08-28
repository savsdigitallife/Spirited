/**
 * A character: a rig, its hair, and the animation driving both.
 *
 * This is the seam the final art will arrive at. Today `buildHuman` makes the
 * body out of primitives; when a rigged glTF exists, the constructor loads it
 * instead, binds the same joint names, and nothing else in the game changes —
 * not the controller, not the animation states, not the scenes that place
 * characters.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { buildHuman, type HumanRig } from "./rig/HumanRig";
import type { CharacterSpec } from "./rig/CharacterSpec";
import { AnimationController, type AnimationState, type LocomotionInput } from "./AnimationController";
import { HairSim } from "./HairSim";

export class Character {
  readonly rig: HumanRig;
  readonly animation: AnimationController;
  readonly spec: CharacterSpec;
  private readonly hair: HairSim | null = null;
  private readonly back = new Vector3(0, 0, -1);
  private readonly bodyAt = new Vector3();

  constructor(scene: Scene, spec: CharacterSpec) {
    this.spec = spec;
    this.rig = buildHuman(scene, spec);
    this.animation = new AnimationController(this.rig);

    if (spec.simulatedHair && spec.hairStyle === "long") {
      const hairMaterial = this.rig.meshes.find((m) => m.name.endsWith("hairCap"))?.material;
      if (hairMaterial) {
        this.hair = new HairSim(scene, {
          // Nearly floor length: her one unmistakable silhouette.
          segments: 11,
          length: spec.height * 0.9,
          width: spec.height * 0.135,
          material: hairMaterial,
          stiffness: 0.5,
          damping: 0.88,
        });
        this.hair.reset(this.napeWorld(), this.back);
      }
    }
  }

  get root(): TransformNode {
    return this.rig.root;
  }

  /** Everything that should cast a shadow. */
  get meshes(): readonly Mesh[] {
    return this.hair ? [...this.rig.meshes, ...this.hair.meshes] : this.rig.meshes;
  }

  private napeWorld(): Vector3 {
    return this.rig.napeAnchor.getAbsolutePosition();
  }

  play(state: AnimationState): void {
    this.animation.play(state);
  }

  release(): void {
    this.animation.release();
  }

  get isBusy(): boolean {
    return this.animation.isBusy;
  }

  /** Call after a teleport so the hair does not stream across the map. */
  settle(): void {
    this.rig.root.computeWorldMatrix(true);
    this.hair?.reset(this.napeWorld(), this.back);
  }

  /**
   * @param floorY ground height under her, so the hair can rest on it
   * @returns true on frames where a foot lands
   */
  update(dt: number, input: LocomotionInput, floorY: number): boolean {
    const footfall = this.animation.update(dt, input);

    if (this.hair) {
      // The world matrices have to be current before the nape can be read,
      // and the animation has only just moved them.
      this.rig.root.computeWorldMatrix(true);
      const yaw = this.rig.root.rotation.y;
      this.back.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      const position = this.rig.root.position;
      this.bodyAt.set(position.x, position.y + this.rig.hipHeight * 0.9, position.z);
      this.hair.update(dt, this.napeWorld(), this.back, this.bodyAt, floorY);
    }
    return footfall;
  }

  setVisible(visible: boolean): void {
    this.rig.setVisible(visible);
    this.hair?.setVisible(visible);
  }

  dispose(): void {
    this.hair?.dispose();
    this.rig.dispose();
  }
}

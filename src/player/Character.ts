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
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { Material } from "@babylonjs/core/Materials/material";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { buildHuman, hairMaterial, type HumanRig } from "./rig/HumanRig";
import { bindLoadedRig, type BoundRig } from "./rig/BoneBinding";
import type { CharacterSpec } from "./rig/CharacterSpec";
import { AnimationController, type AnimationState, type LocomotionInput } from "./AnimationController";
import { HairSim } from "./HairSim";
import type { AssetLoader } from "../engine/AssetLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";

export class Character {
  /**
   * Rigged models, loaded once per region rather than per character.
   *
   * Every caller builds a character synchronously in the middle of laying out
   * a room, so the model cannot be fetched there. `preload` is the async half,
   * called at region load exactly as the asset catalog's `prepare` is, and the
   * constructor then finds what it needs already in hand.
   */
  private static models = new Map<string, AssetContainer>();

  /**
   * Fetches whatever character art exists, and says nothing if there is none.
   *
   * A missing model is the normal case, not an error: the generated body is
   * the shipping geometry until commissioned art replaces it. Names map to
   * `characters/<name>.glb` under the asset root.
   */
  static async preload(scene: Scene, assets: AssetLoader, names: readonly string[]): Promise<void> {
    for (const name of names) {
      const path = `characters/${name}.glb`;
      const key = `${scene.uid}::${name}`;
      if (Character.models.has(key)) continue;
      if (!(await assets.exists(path))) continue;
      try {
        Character.models.set(key, await assets.container(scene, path));
      } catch (error) {
        console.warn(`[rig] "${name}" failed to load from ${path}; using the generated body`, error);
      }
    }
  }

  /** Drops cached models for a scene that is going away. */
  static forget(scene: Scene): void {
    for (const key of [...Character.models.keys()]) {
      if (key.startsWith(`${scene.uid}::`)) Character.models.delete(key);
    }
  }

  readonly rig: HumanRig;
  /** Set only when this character is a loaded model. */
  private readonly bound: BoundRig | null;
  readonly animation: AnimationController;
  readonly spec: CharacterSpec;
  private readonly hair: HairSim | null = null;
  /** A loaded model's hair shell. The generated body builds its own. */
  private readonly scalp: Mesh | null = null;
  private readonly back = new Vector3(0, 0, -1);
  private readonly bodyAt = new Vector3();

  constructor(scene: Scene, spec: CharacterSpec) {
    this.spec = spec;
    const model = Character.fromModel(scene, spec);
    this.bound = model;
    this.rig = model ?? buildHuman(scene, spec);
    this.animation = new AnimationController(this.rig);

    if (spec.simulatedHair && spec.hairStyle === "long") {
      // A generated body has a cap to take the hair's colour from. A loaded
      // model has no hair at all, so the spec's own material is built for it
      // — otherwise she loses the floor-length silhouette that is the whole
      // point of her, and stands there bald.
      const material =
        this.rig.meshes.find((m) => m.name.endsWith("hairCap"))?.material ??
        (model ? hairMaterial(scene, spec) : null);
      if (material) {
        if (model?.skull) this.scalp = Character.capSkull(spec, model, material);
        this.hair = new HairSim(scene, {
          // Nearly floor length: her one unmistakable silhouette.
          segments: 11,
          length: spec.height * 0.9,
          width: spec.height * 0.135,
          material,
          stiffness: 0.5,
          damping: 0.88,
        });
        this.hair.reset(this.napeWorld(), this.back);
      }
    }
  }

  /**
   * Instantiates the loaded model for this spec, if one was preloaded and its
   * skeleton carries the joints an animation needs. Null means "use the
   * generated body", which is not a failure.
   */
  private static fromModel(scene: Scene, spec: CharacterSpec): BoundRig | null {
    if (!spec.model) return null;
    const container = Character.models.get(`${scene.uid}::${spec.model}`);
    if (!container) return null;
    const copy = container.instantiateModelsToScene((source) => `${spec.name}.${source}`, false, {
      doNotInstantiate: true,
    });
    const skeleton = copy.skeletons[0];
    const root = copy.rootNodes[0];
    if (!skeleton || !root) {
      console.warn(`[rig] "${spec.name}" has no skeleton; using the generated body`);
      copy.dispose();
      return null;
    }
    // Everything that places a character moves `character.root`, and the
    // smoke test looks for `<name>.root` by name. A glTF's own root is called
    // whatever the exporter felt like — "Armature", here — so it is parented
    // under a node of ours rather than being used directly. That also gives
    // somewhere to put the model's own scale without touching its skeleton.
    const holder = new TransformNode(`${spec.name}.root`, scene);
    (root as TransformNode).parent = holder;
    const meshes = holder.getChildMeshes();
    const bound = Character.bind(scene, holder, meshes, skeleton, spec);
    if (!bound) {
      // Just the holder: the model underneath it is the container copy's to
      // dispose, and disposing it twice is how a scene ends up with dangling
      // materials.
      holder.dispose(true);
      copy.dispose();
    }
    return bound;
  }

  private static bind(
    scene: Scene,
    root: TransformNode,
    meshes: readonly AbstractMesh[],
    skeleton: Parameters<typeof bindLoadedRig>[3],
    spec: CharacterSpec,
  ): BoundRig | null {
    return bindLoadedRig(scene, root, meshes, skeleton, spec.name, spec.height);
  }

  get root(): TransformNode {
    return this.rig.root;
  }

  /** Everything that should cast a shadow. */
  get meshes(): readonly AbstractMesh[] {
    const own = this.scalp ? [...this.rig.meshes, this.scalp] : [...this.rig.meshes];
    return this.hair ? [...own, ...this.hair.meshes] : own;
  }

  /**
   * A shell of hair over a loaded model's skull.
   *
   * The sim hangs from the nape, so without this she is bald from the front
   * with a fall of hair behind her. It is sized and placed like the generated
   * body's own cap — the same skull, at the same fraction of her height — and
   * kept off the eyes, a cap that reaches them being a motorcycle helmet.
   *
   * `setParent` rather than assigning `parent`: the skeleton carries the
   * exporter's unit and the glTF loader's reflection, and `setParent` works a
   * world placement back through both. Which is also why the scaling is
   * multiplied into what that leaves rather than assigned over it.
   */
  private static capSkull(spec: CharacterSpec, model: BoundRig, material: Material): Mesh {
    const skull = model.skull!;
    const headH = spec.height * 0.132;
    const cap = CreateSphere(
      `${spec.name}.hairCap`,
      { diameter: headH * 0.88, segments: 16 },
      skull.getScene(),
    );
    cap.material = material;
    skull.computeWorldMatrix(true);
    // Behind her, in world terms. A character faces +z in her root's space —
    // the convention `back` above is written in — and the root is what the
    // game turns, so this holds whichever way she is facing.
    const behind = Vector3.TransformNormal(
      new Vector3(0, 0, -1),
      model.root.getWorldMatrix(),
    ).normalize();
    cap.position.copyFrom(skull.getAbsolutePosition()).addInPlace(behind.scale(headH * 0.09));
    cap.position.y += headH * 0.44;
    cap.setParent(skull);
    return cap;
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
  /** True when this character is a loaded model rather than generated geometry. */
  get isModel(): boolean {
    return this.bound !== null;
  }

  update(dt: number, input: LocomotionInput, floorY: number): boolean {
    const footfall = this.animation.update(dt, input);
    // A generated body *is* the joints the controller just moved. A loaded
    // model is a skeleton that has to be told about them, on top of its own
    // rest pose — see `BoneBinding`.
    this.bound?.sync();

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
